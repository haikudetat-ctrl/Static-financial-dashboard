import { COGS_CLASS_LABELS, type CogsClass } from "@/lib/reporting/pnl";
import { createClient } from "@/lib/supabase/server";

import type { UnitOption } from "./new-item";

export type LineSuggestion = {
  itemId: string;
  name: string;
  code: string | null;
  score: number;
  reason: string;
};

export type MatchingOptions = {
  /** Up to three ranked items per unmatched line, keyed by line id. */
  suggestions: Record<string, LineSuggestion[]>;
  categories: { id: string; name: string }[];
  units: UnitOption[];
  cogsClasses: { value: CogsClass; label: string }[];
  /** The cost class this vendor usually supplies, to start a new item with. */
  defaultCogsClass: CogsClass;
};

/**
 * Everything the review screen needs to resolve unmatched lines: ranked
 * suggestions from suggest_invoice_line_items(), and the lists the
 * new-item form picks from.
 */
export async function getMatchingOptions(
  invoiceId: string,
  vendorId: string,
  organizationId: string,
): Promise<MatchingOptions> {
  const supabase = await createClient();
  const [suggestionRows, categoryRows, unitRows, vendorItemRows] =
    await Promise.all([
      supabase.rpc("suggest_invoice_line_items", {
        target_invoice_id: invoiceId,
      }),
      supabase
        .from("inventory_categories")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("units")
        .select("id, name, unit_type, conversion_factor_to_base")
        .eq("organization_id", organizationId)
        .gt("conversion_factor_to_base", 0)
        .order("unit_type")
        .order("conversion_factor_to_base"),
      supabase
        .from("vendor_items")
        .select("inventory_items(cogs_class)")
        .eq("vendor_id", vendorId)
        .not("inventory_item_id", "is", null),
    ]);

  const suggestions: Record<string, LineSuggestion[]> = {};
  for (const row of (suggestionRows.data ?? []) as Array<{
    invoice_line_id: string;
    inventory_item_id: string;
    item_name: string;
    item_code: string | null;
    score: number | string;
    reason: string;
  }>) {
    (suggestions[row.invoice_line_id] ??= []).push({
      itemId: row.inventory_item_id,
      name: row.item_name,
      code: row.item_code,
      score: Number(row.score),
      reason: row.reason,
    });
  }

  const classCounts = new Map<CogsClass, number>();
  for (const row of (vendorItemRows.data ?? []) as Array<{
    inventory_items:
      | { cogs_class: CogsClass | null }
      | { cogs_class: CogsClass | null }[]
      | null;
  }>) {
    const item = Array.isArray(row.inventory_items)
      ? row.inventory_items[0]
      : row.inventory_items;
    if (item?.cogs_class) {
      classCounts.set(
        item.cogs_class,
        (classCounts.get(item.cogs_class) ?? 0) + 1,
      );
    }
  }
  const defaultCogsClass =
    [...classCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "bar_consumables";

  return {
    suggestions,
    categories: categoryRows.data ?? [],
    units: (unitRows.data ?? []).map((unit) => ({
      id: unit.id,
      name: unit.name,
      unitType: unit.unit_type,
      factor: Number(unit.conversion_factor_to_base),
    })),
    cogsClasses: (Object.keys(COGS_CLASS_LABELS) as CogsClass[]).map(
      (value) => ({ value, label: COGS_CLASS_LABELS[value] }),
    ),
    defaultCogsClass,
  };
}
