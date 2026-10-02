import { cache } from "react";

import {
  createCostBook,
  type CostBookComponent,
  type CostBookRecipe,
} from "@/lib/recipes/costing";
import { createClient } from "@/lib/supabase/server";

/** PostgREST returns at most 1,000 rows per request. */
const PAGE = 1000;

async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await query(from, from + PAGE - 1);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export type CatalogUnit = {
  id: string;
  name: string;
  abbreviation: string;
  unitType: string;
  factor: number;
};

export type CatalogItem = {
  id: string;
  name: string;
  itemCode: string | null;
  unitType: string;
  baseUnitId: string;
  isProduced: boolean;
  active: boolean;
  category: string;
  cogsClass: string | null;
  countUnitId: string | null;
  purchaseUnitId: string | null;
  outputRecipeId: string | null;
  standardCostSource: string | null;
  standardCostUpdatedAt: string | null;
  /** Last price paid, as invoiced. */
  lastPurchase: { vendor: string; casePrice: number; pack: string } | null;
};

export type CatalogRecipe = {
  id: string;
  name: string;
  recipeType: string;
  description: string;
  active: boolean;
  menuPrice: number | null;
  outputItemId: string | null;
  version: {
    id: string;
    versionNumber: number;
    effectiveFrom: string;
    outputQuantity: number;
    outputUnitId: string;
    yieldIsApproximate: boolean;
    notes: string;
    components: Array<{
      id: string;
      kind: "inventory" | "recipe";
      refId: string;
      quantity: number;
      unitId: string;
      notes: string;
    }>;
  } | null;
};

function localToday() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

/**
 * Everything needed to cost recipes for one location: items, units, active
 * recipe versions and every cost source.
 */
export async function buildRecipeCatalog(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const today = localToday();

  const [
    units,
    items,
    recipes,
    versions,
    onHand,
    snapshots,
    vendorItems,
    invoicePrices,
  ] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("units")
        .select("id, name, abbreviation, unit_type, conversion_factor_to_base")
        .eq("organization_id", organizationId)
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("inventory_items")
        .select(
          "id, name, item_code, base_unit_id, count_unit_id, purchase_unit_id, is_produced, active, cogs_class, standard_unit_cost, standard_cost_source, standard_cost_updated_at, inventory_categories(name)",
        )
        .eq("organization_id", organizationId)
        .order("name")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("recipes")
        .select(
          "id, name, description, recipe_type, active, menu_price, output_inventory_item_id",
        )
        .eq("organization_id", organizationId)
        .order("name")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("recipe_versions")
        .select(
          "id, recipe_id, version_number, effective_from, effective_to, output_quantity, output_unit_id, yield_is_approximate, notes, recipes!inner(organization_id), recipe_version_components(id, component_inventory_item_id, component_recipe_id, quantity, unit_id, line_order, notes)",
        )
        .eq("recipes.organization_id", organizationId)
        .eq("status", "active")
        .lte("effective_from", today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("inventory_on_hand")
        .select("inventory_item_id, quantity, extended_value")
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("inventory_item_cost_snapshots")
        .select(
          "inventory_item_id, weighted_average_cost, effective_at, inventory_items!inner(organization_id)",
        )
        .eq("inventory_items.organization_id", organizationId)
        .order("effective_at", { ascending: false })
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("vendor_items")
        .select(
          "inventory_item_id, last_case_price, base_quantity_per_purchase_unit, is_preferred, created_at, pack_size, vendors(name)",
        )
        .eq("organization_id", organizationId)
        .not("inventory_item_id", "is", null)
        .not("last_case_price", "is", null)
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("item_cost_history")
        .select(
          "inventory_item_id, base_unit_cost, effective_date, cost_source",
        )
        .eq("organization_id", organizationId)
        .not("cost_source", "in", "(workbook,recipe_rollup,manual)")
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  const unitById = new Map<string, CatalogUnit>(
    units.map((unit) => [
      unit.id,
      {
        id: unit.id,
        name: unit.name,
        abbreviation: unit.abbreviation,
        unitType: unit.unit_type,
        factor: Number(unit.conversion_factor_to_base),
      },
    ]),
  );
  const factor = (unitId: string | null | undefined) =>
    (unitId && unitById.get(unitId)?.factor) || 1;

  // Latest active version per recipe (effective today).
  const versionByRecipe = new Map<string, (typeof versions)[number]>();
  for (const version of versions) {
    const current = versionByRecipe.get(version.recipe_id);
    if (!current || version.effective_from > current.effective_from) {
      versionByRecipe.set(version.recipe_id, version);
    }
  }

  const outputRecipeByItem = new Map<string, string>();
  for (const recipe of recipes) {
    if (
      recipe.output_inventory_item_id &&
      recipe.active &&
      versionByRecipe.has(recipe.id)
    ) {
      outputRecipeByItem.set(recipe.output_inventory_item_id, recipe.id);
    }
  }

  const onHandTotals = new Map<string, { quantity: number; value: number }>();
  for (const row of onHand) {
    const total = onHandTotals.get(row.inventory_item_id) ?? {
      quantity: 0,
      value: 0,
    };
    total.quantity += Number(row.quantity);
    total.value += Number(row.extended_value);
    onHandTotals.set(row.inventory_item_id, total);
  }
  const onHandUnitCost = new Map<string, number>();
  for (const [itemId, total] of onHandTotals) {
    if (total.quantity > 0)
      onHandUnitCost.set(itemId, total.value / total.quantity);
  }

  const snapshotUnitCost = new Map<string, number>();
  const snapshotDate = new Map<string, string>();
  for (const snapshot of snapshots) {
    if (!snapshotUnitCost.has(snapshot.inventory_item_id)) {
      snapshotUnitCost.set(
        snapshot.inventory_item_id,
        Number(snapshot.weighted_average_cost),
      );
      snapshotDate.set(
        snapshot.inventory_item_id,
        String(snapshot.effective_at).slice(0, 10),
      );
    }
  }

  const vendorUnitCost = new Map<string, number>();
  const lastPurchase = new Map<
    string,
    { vendor: string; casePrice: number; pack: string }
  >();
  const vendorRank = new Map<string, string>();
  for (const vendorItem of vendorItems) {
    const perBase = Number(vendorItem.base_quantity_per_purchase_unit);
    if (!vendorItem.inventory_item_id || !(perBase > 0)) continue;
    const rank = `${vendorItem.is_preferred ? 1 : 0}:${vendorItem.created_at}`;
    const current = vendorRank.get(vendorItem.inventory_item_id);
    if (current && current > rank) continue;
    vendorRank.set(vendorItem.inventory_item_id, rank);
    vendorUnitCost.set(
      vendorItem.inventory_item_id,
      Number(vendorItem.last_case_price) / perBase,
    );
    const vendor = Array.isArray(vendorItem.vendors)
      ? vendorItem.vendors[0]
      : vendorItem.vendors;
    lastPurchase.set(vendorItem.inventory_item_id, {
      vendor: (vendor as { name?: string } | null)?.name ?? "Vendor",
      casePrice: Number(vendorItem.last_case_price),
      pack: vendorItem.pack_size ?? "",
    });
  }

  // The latest invoice price on record beats the vendor item's stored
  // price, and carries a date so it can outrank an older period cost.
  const vendorDate = new Map<string, string>();
  for (const price of invoicePrices) {
    if (vendorDate.has(price.inventory_item_id)) continue;
    if (!(Number(price.base_unit_cost) > 0)) continue;
    vendorDate.set(price.inventory_item_id, price.effective_date);
    vendorUnitCost.set(price.inventory_item_id, Number(price.base_unit_cost));
  }

  const catalogItems: CatalogItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    itemCode: item.item_code,
    unitType: unitById.get(item.base_unit_id)?.unitType ?? "each",
    baseUnitId: item.base_unit_id,
    isProduced: item.is_produced,
    active: item.active,
    category:
      (Array.isArray(item.inventory_categories)
        ? item.inventory_categories[0]
        : (item.inventory_categories as { name?: string } | null)
      )?.name ?? "",
    cogsClass: item.cogs_class,
    countUnitId: item.count_unit_id,
    purchaseUnitId: item.purchase_unit_id,
    outputRecipeId: outputRecipeByItem.get(item.id) ?? null,
    standardCostSource: item.standard_cost_source,
    standardCostUpdatedAt: item.standard_cost_updated_at,
    lastPurchase: lastPurchase.get(item.id) ?? null,
  }));

  const catalogRecipes: CatalogRecipe[] = recipes.map((recipe) => {
    const version = versionByRecipe.get(recipe.id);
    return {
      id: recipe.id,
      name: recipe.name,
      recipeType: recipe.recipe_type,
      description: recipe.description ?? "",
      active: recipe.active,
      menuPrice: recipe.menu_price === null ? null : Number(recipe.menu_price),
      outputItemId: recipe.output_inventory_item_id,
      version: version
        ? {
            id: version.id,
            versionNumber: version.version_number,
            effectiveFrom: version.effective_from,
            outputQuantity: Number(version.output_quantity),
            outputUnitId: version.output_unit_id,
            yieldIsApproximate: version.yield_is_approximate,
            notes: version.notes ?? "",
            components: [...(version.recipe_version_components ?? [])]
              .sort((a, b) => a.line_order - b.line_order)
              .map((component) => ({
                id: component.id,
                kind: component.component_recipe_id
                  ? ("recipe" as const)
                  : ("inventory" as const),
                refId: (component.component_recipe_id ??
                  component.component_inventory_item_id)!,
                quantity: Number(component.quantity),
                unitId: component.unit_id,
                notes: component.notes ?? "",
              })),
          }
        : null,
    };
  });

  const costRecipes: CostBookRecipe[] = catalogRecipes
    .filter((recipe) => recipe.version)
    .map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      outputQuantity: recipe.version!.outputQuantity,
      outputFactor: factor(recipe.version!.outputUnitId),
      components: recipe.version!.components.map(
        (component): CostBookComponent =>
          component.kind === "inventory"
            ? {
                kind: "inventory",
                itemId: component.refId,
                quantity: component.quantity,
                factor: factor(component.unitId),
              }
            : {
                kind: "recipe",
                recipeId: component.refId,
                quantity: component.quantity,
                factor: factor(component.unitId),
              },
      ),
    }));

  const book = createCostBook({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      outputRecipeId: outputRecipeByItem.get(item.id) ?? null,
      manualUnitCost:
        item.standard_cost_source === "manual" &&
        item.standard_unit_cost !== null
          ? Number(item.standard_unit_cost)
          : null,
    })),
    recipes: costRecipes,
    onHandUnitCost,
    snapshotUnitCost,
    vendorUnitCost,
    snapshotDate,
    vendorDate,
  });

  return {
    book,
    units: [...unitById.values()],
    unitById,
    items: catalogItems,
    itemById: new Map(catalogItems.map((item) => [item.id, item])),
    recipes: catalogRecipes,
    recipeById: new Map(catalogRecipes.map((recipe) => [recipe.id, recipe])),
  };
}

/** The recipe catalog, built once per request. */
export const loadRecipeCatalog = cache(buildRecipeCatalog);

export type RecipeCatalog = Awaited<ReturnType<typeof buildRecipeCatalog>>;
