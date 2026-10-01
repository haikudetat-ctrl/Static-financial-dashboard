import { createClient } from "@/lib/supabase/server";
import { loadRecipeCatalog } from "@/lib/recipes/cost-book";
import { DISPLAY_UNIT } from "@/lib/recipes/units";

export type PostedCount = {
  id: string;
  countType: "full" | "spot";
  /** Local date the count was started. */
  countDate: string;
  /** When the count posted to the ledger. */
  postedAt: string;
};

export type VarianceRow = {
  itemId: string;
  name: string;
  code: string | null;
  category: string;
  /** Quantities are shown in this unit (bottle, can, fl oz…). */
  unit: string;
  unitFactor: number;
  openingQty: number;
  purchasedQty: number;
  closingQty: number;
  actualQty: number;
  theoreticalQty: number;
  varianceQty: number;
  unitCost: number | null;
  actualValue: number;
  theoreticalValue: number;
  varianceValue: number;
  /** Variance as a share of theoretical usage. */
  variancePct: number | null;
  counted: boolean;
};

function localDate(timestamp: string) {
  return new Date(timestamp).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Approved full and spot counts that posted to the ledger, newest first. */
export async function getPostedCounts(
  organizationId: string,
  locationId: string,
): Promise<PostedCount[]> {
  const supabase = await createClient();
  const { data: counts } = await supabase
    .from("inventory_counts")
    .select("id, count_type, created_at")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(100);
  const ids = (counts ?? []).map((count) => count.id);
  if (ids.length === 0) return [];
  const { data: postings } = await supabase
    .from("inventory_transactions")
    .select("source_id, effective_at")
    .eq("location_id", locationId)
    .eq("source_type", "inventory_count")
    .in("source_id", ids);
  const postedAt = new Map(
    (postings ?? []).map((posting) => [
      posting.source_id,
      posting.effective_at,
    ]),
  );
  return (counts ?? [])
    .filter((count) => postedAt.has(count.id))
    .map((count) => ({
      id: count.id,
      countType: count.count_type,
      countDate: localDate(count.created_at),
      postedAt: postedAt.get(count.id)!,
    }));
}

/**
 * The opening and closing counts for a period: the last full count taken
 * up to two days into the period, and the last full count after that up
 * to a week past the period's end.
 */
export function pickPeriodCounts(
  counts: PostedCount[],
  period: { periodStart: string; periodEnd: string },
) {
  const full = counts
    .filter((count) => count.countType === "full")
    .sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  const opening = [...full]
    .reverse()
    .find((count) => count.countDate <= addDays(period.periodStart, 2));
  const closing = opening
    ? [...full]
        .reverse()
        .find(
          (count) =>
            count.postedAt > opening.postedAt &&
            count.countDate <= addDays(period.periodEnd, 7),
        )
    : undefined;
  return { opening: opening ?? null, closing: closing ?? null };
}

export async function getItemVariance({
  organizationId,
  locationId,
  opening,
  closing,
  salesStart,
  salesEnd,
}: {
  organizationId: string;
  locationId: string;
  opening: PostedCount;
  closing: PostedCount;
  salesStart: string;
  salesEnd: string;
}): Promise<VarianceRow[]> {
  const supabase = await createClient();
  const [{ data, error }, catalog, { data: countedLines }] = await Promise.all([
    supabase.rpc("item_usage_variance", {
      target_location_id: locationId,
      from_at: opening.postedAt,
      to_at: closing.postedAt,
      sales_start: salesStart,
      sales_end: salesEnd,
    }),
    loadRecipeCatalog(organizationId, locationId),
    supabase
      .from("inventory_count_lines")
      .select(
        "inventory_item_id, inventory_count_assignments!inner(inventory_count_id)",
      )
      .eq("inventory_count_assignments.inventory_count_id", closing.id)
      .limit(5000),
  ]);
  if (error) throw new Error(error.message);
  const counted = new Set(
    (countedLines ?? []).map((line) => line.inventory_item_id),
  );

  return (data ?? [])
    .map(
      (row: {
        inventory_item_id: string;
        opening_quantity: number | string;
        purchased_quantity: number | string;
        closing_quantity: number | string;
        actual_quantity: number | string;
        theoretical_quantity: number | string;
      }) => {
        const item = catalog.itemById.get(row.inventory_item_id);
        const countUnit = item?.countUnitId
          ? catalog.unitById.get(item.countUnitId)
          : undefined;
        const display =
          countUnit && countUnit.factor !== 1
            ? countUnit
            : catalog.units.find(
                (unit) =>
                  unit.abbreviation === DISPLAY_UNIT[item?.unitType ?? "each"],
              );
        const factor = display?.factor ?? 1;
        const cost = catalog.book.itemCost(row.inventory_item_id).unitCost;
        const actual = Number(row.actual_quantity);
        const theoretical = Number(row.theoretical_quantity);
        const variance = actual - theoretical;
        return {
          itemId: row.inventory_item_id,
          name: item?.name ?? "Inventory item",
          code: item?.itemCode ?? null,
          category: item?.category ?? "",
          unit: display?.abbreviation ?? "unit",
          unitFactor: factor,
          openingQty: Number(row.opening_quantity) / factor,
          purchasedQty: Number(row.purchased_quantity) / factor,
          closingQty: Number(row.closing_quantity) / factor,
          actualQty: actual / factor,
          theoreticalQty: theoretical / factor,
          varianceQty: variance / factor,
          unitCost: cost,
          actualValue: actual * (cost ?? 0),
          theoreticalValue: theoretical * (cost ?? 0),
          varianceValue: variance * (cost ?? 0),
          variancePct: theoretical > 0 ? variance / theoretical : null,
          counted: counted.has(row.inventory_item_id),
        };
      },
    )
    .filter(
      (row: VarianceRow) =>
        Math.abs(row.actualQty) > 1e-9 || Math.abs(row.theoreticalQty) > 1e-9,
    );
}
