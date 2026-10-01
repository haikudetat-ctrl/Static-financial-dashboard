import { localToday } from "@/lib/inventory/count-period";
import { loadRecipeCatalog } from "@/lib/recipes/cost-book";
import { DISPLAY_UNIT } from "@/lib/recipes/units";
import { createClient } from "@/lib/supabase/server";

type Related<T> = T | T[] | null | undefined;
const one = <T>(value: Related<T>) =>
  (Array.isArray(value) ? value[0] : value) ?? null;

export type DrinkImpact = {
  recipeId: string;
  name: string;
  /** Change in cost per drink. */
  delta: number;
  cost: number;
  menuPrice: number | null;
  /** Pour cost before and after the price change. */
  pourCostBefore: number | null;
  pourCostAfter: number | null;
  soldLast28: number;
};

export type PriceChange = {
  id: string;
  status: "open" | "resolved" | "dismissed";
  direction: "up" | "down";
  severity: "info" | "warning" | "critical";
  createdAt: string;
  itemId: string | null;
  itemName: string;
  vendorName: string;
  invoice: { id: string; number: string; date: string } | null;
  changePct: number;
  previousUnitCost: number;
  currentUnitCost: number;
  /** Prices per display unit (fl oz…) and per pack (750 ml bottle…). */
  display: { unit: string; previous: number; current: number };
  pack: { unit: string; previous: number; current: number } | null;
  drinks: DrinkImpact[];
  /** Estimated change in cost over 28 days at recent sales volume. */
  monthlyImpact: number;
};

export async function getPriceChanges(
  organizationId: string,
  locationId: string,
  { includeClosed = false }: { includeClosed?: boolean } = {},
): Promise<PriceChange[]> {
  const supabase = await createClient();
  let query = supabase
    .from("price_alerts")
    .select(
      "id, status, alert_type, severity, created_at, inventory_item_id, previous_value, current_value, change_pct, inventory_items(name), vendors(name), invoice_lines(invoices(id, invoice_number, invoice_date))",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .in("alert_type", ["cost_increase", "cost_decrease"])
    .order("created_at", { ascending: false })
    .limit(200);
  query = includeClosed
    ? query.neq("status", "dismissed")
    : query.eq("status", "open");
  const { data: alerts } = await query;
  if (!alerts?.length) return [];

  const since = new Date(`${localToday()}T12:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 28);
  const [catalog, { data: sold }] = await Promise.all([
    loadRecipeCatalog(organizationId, locationId),
    supabase
      .from("sales_items")
      .select(
        "recipe_id, theoretical_sale_quantity, sales_business_days!inner(location_id, business_date, status)",
      )
      .eq("sales_business_days.location_id", locationId)
      .eq("sales_business_days.status", "posted")
      .gte(
        "sales_business_days.business_date",
        since.toISOString().slice(0, 10),
      )
      .not("recipe_id", "is", null)
      .limit(20000),
  ]);
  const soldByRecipe = new Map<string, number>();
  for (const row of sold ?? []) {
    soldByRecipe.set(
      row.recipe_id!,
      (soldByRecipe.get(row.recipe_id!) ?? 0) +
        Number(row.theoretical_sale_quantity),
    );
  }

  const menuItems = catalog.recipes.filter(
    (recipe) =>
      recipe.active && recipe.version && recipe.recipeType === "menu_item",
  );
  const usageByRecipe = new Map(
    menuItems.map((recipe) => [recipe.id, catalog.book.itemUsage(recipe.id)]),
  );

  return alerts.map((alert) => {
    const itemId = alert.inventory_item_id;
    const item = itemId ? catalog.itemById.get(itemId) : undefined;
    const previous = Number(alert.previous_value);
    const current = Number(alert.current_value);
    const displayUnit = catalog.units.find(
      (unit) => unit.abbreviation === DISPLAY_UNIT[item?.unitType ?? "each"],
    );
    const countUnit = item?.countUnitId
      ? catalog.unitById.get(item.countUnitId)
      : undefined;
    const displayFactor = displayUnit?.factor ?? 1;

    const drinks: DrinkImpact[] = itemId
      ? menuItems
          .map((recipe) => {
            const used = usageByRecipe.get(recipe.id)?.get(itemId) ?? 0;
            if (used <= 0) return null;
            const delta = used * (current - previous);
            const cost = catalog.book.recipeCost(recipe.id).totalCost;
            const price = recipe.menuPrice;
            return {
              recipeId: recipe.id,
              name: recipe.name,
              delta,
              cost,
              menuPrice: price,
              pourCostBefore: price ? (cost - delta) / price : null,
              pourCostAfter: price ? cost / price : null,
              soldLast28: soldByRecipe.get(recipe.id) ?? 0,
            };
          })
          .filter((drink): drink is DrinkImpact => drink !== null)
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      : [];

    const invoice = one(
      one(
        alert.invoice_lines as Related<{
          invoices: Related<{
            id: string;
            invoice_number: string;
            invoice_date: string;
          }>;
        }>,
      )?.invoices,
    );

    return {
      id: alert.id,
      status: alert.status,
      direction: alert.alert_type === "cost_decrease" ? "down" : "up",
      severity: alert.severity,
      createdAt: alert.created_at,
      itemId,
      itemName:
        one(alert.inventory_items as Related<{ name: string }>)?.name ?? "Item",
      vendorName:
        one(alert.vendors as Related<{ name: string }>)?.name ?? "Vendor",
      invoice: invoice
        ? {
            id: invoice.id,
            number: invoice.invoice_number,
            date: invoice.invoice_date,
          }
        : null,
      changePct: Number(alert.change_pct),
      previousUnitCost: previous,
      currentUnitCost: current,
      display: {
        unit: displayUnit?.abbreviation ?? "unit",
        previous: previous * displayFactor,
        current: current * displayFactor,
      },
      pack:
        countUnit &&
        countUnit.factor !== displayFactor &&
        countUnit.factor !== 1
          ? {
              unit: countUnit.abbreviation,
              previous: previous * countUnit.factor,
              current: current * countUnit.factor,
            }
          : null,
      drinks,
      monthlyImpact: drinks.reduce(
        (sum, drink) => sum + drink.delta * drink.soldLast28,
        0,
      ),
    };
  });
}

export async function countOpenPriceChanges(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("price_alerts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .eq("status", "open")
    .in("alert_type", ["cost_increase", "cost_decrease"]);
  return count ?? 0;
}
