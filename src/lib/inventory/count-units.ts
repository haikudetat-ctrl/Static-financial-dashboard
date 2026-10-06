import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Count units: what a counter counts an item in (a 750 ml bottle, a 1 gal
 * jug, a quart deli). Any unit that measures the same thing as the item's
 * base unit and converts can be used; the count converts to the base unit
 * when it posts.
 */

export type UnitType = "volume" | "weight" | "each";

export type CountUnitOption = {
  id: string;
  label: string;
  factor: number;
  type: UnitType;
};

export async function loadCountUnits(
  supabase: Supabase,
  organizationId: string,
): Promise<CountUnitOption[]> {
  const { data } = await supabase
    .from("units")
    .select("id, abbreviation, name, unit_type, conversion_factor_to_base")
    .eq("organization_id", organizationId);
  return (data ?? [])
    .filter((unit) => Number(unit.conversion_factor_to_base) > 0)
    .map((unit) => ({
      id: unit.id as string,
      label: (unit.abbreviation || unit.name) as string,
      factor: Number(unit.conversion_factor_to_base),
      type: (["volume", "weight"].includes(unit.unit_type)
        ? unit.unit_type
        : "each") as UnitType,
    }));
}

/** Units an item can be counted in, smallest first, for a picker. */
export function unitOptionsFor(units: CountUnitOption[], type: UnitType) {
  return units
    .filter((unit) => unit.type === type)
    .sort((a, b) => a.factor - b.factor || a.label.localeCompare(b.label));
}

/**
 * The expected count re-expressed in a new unit: 2 bottles of 750 ml are
 * 0.396 gal jugs.
 */
export function convertCount(
  quantity: number,
  fromFactor: number,
  toFactor: number,
) {
  if (!(fromFactor > 0) || !(toFactor > 0)) return quantity;
  return (quantity * fromFactor) / toFactor;
}

export type SetUnitResult =
  | { ok: true; unit: string }
  | { ok: false; error: string };

/**
 * Switches a count line to another unit. The expected quantity is
 * converted; anything already entered is kept as entered, since the
 * counter changes the unit to match what they counted. With
 * rememberForArea, the unit also becomes the default for this item in this
 * storage area on future counts (managers only).
 */
export async function setCountLineUnit(
  supabase: Supabase,
  {
    lineId,
    unitId,
    rememberForArea,
  }: { lineId: string; unitId: string; rememberForArea: boolean },
): Promise<SetUnitResult> {
  const { data: line } = await supabase
    .from("inventory_count_lines")
    .select(
      "id, inventory_item_id, storage_location_id, expected_quantity, count_unit_id, inventory_count_assignments!inner(inventory_counts!inner(status)), inventory_items(count_unit_id, base_unit_id)",
    )
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { ok: false, error: "Line not found." };

  const assignment = Array.isArray(line.inventory_count_assignments)
    ? line.inventory_count_assignments[0]
    : line.inventory_count_assignments;
  const countRow = assignment?.inventory_counts as
    | { status: string }
    | Array<{ status: string }>
    | undefined;
  const status = Array.isArray(countRow)
    ? countRow[0]?.status
    : countRow?.status;
  if (!["draft", "in_progress", "counted"].includes(status ?? "")) {
    return { ok: false, error: `This count is ${status ?? "closed"}.` };
  }

  const item = (
    Array.isArray(line.inventory_items)
      ? line.inventory_items[0]
      : line.inventory_items
  ) as { count_unit_id: string | null; base_unit_id: string } | null;
  const currentUnitId =
    line.count_unit_id ?? item?.count_unit_id ?? item?.base_unit_id;
  const { data: units } = await supabase
    .from("units")
    .select("id, abbreviation, name, conversion_factor_to_base")
    .in("id", [currentUnitId, unitId].filter(Boolean) as string[]);
  const from = units?.find((unit) => unit.id === currentUnitId);
  const to = units?.find((unit) => unit.id === unitId);
  if (!to) return { ok: false, error: "Unit not found." };

  const { error } = await supabase
    .from("inventory_count_lines")
    .update({
      count_unit_id: unitId,
      expected_quantity: convertCount(
        Number(line.expected_quantity),
        Number(from?.conversion_factor_to_base ?? 1),
        Number(to.conversion_factor_to_base),
      ),
    })
    .eq("id", lineId);
  if (error) {
    return {
      ok: false,
      error: /doesn't fit/.test(error.message)
        ? "That unit doesn't fit this item."
        : error.message,
    };
  }

  if (rememberForArea) {
    // Back to the item's own unit clears the area's override.
    await supabase
      .from("storage_location_items")
      .update({
        count_unit_id: unitId === item?.count_unit_id ? null : unitId,
      })
      .eq("storage_location_id", line.storage_location_id)
      .eq("inventory_item_id", line.inventory_item_id);
  }
  return { ok: true, unit: (to.abbreviation || to.name) as string };
}
