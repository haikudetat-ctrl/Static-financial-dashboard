import { createClient } from "@/lib/supabase/server";

export class ConversionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ConversionError";
  }
}

type UnitLookup = {
  id: string;
  base_unit_id: string | null;
  conversion_factor_to_base: number | null;
};

export async function convert(
  value: number,
  fromUnitId: string,
  toUnitId: string,
  organizationId: string,
  itemId?: string,
): Promise<number> {
  if (fromUnitId === toUnitId) return value;

  const supabase = await createClient();

  // 1. Check for direct conversion
  const { data: direct } = await supabase
    .from("unit_conversions")
    .select("conversion_factor")
    .eq("organization_id", organizationId)
    .eq("from_unit_id", fromUnitId)
    .eq("to_unit_id", toUnitId)
    .maybeSingle();

  if (direct) {
    return value * Number(direct.conversion_factor);
  }

  // 2. Check for item-specific conversion
  if (itemId) {
    const { data: itemSpecific } = await supabase
      .from("unit_conversions")
      .select("conversion_factor")
      .eq("organization_id", organizationId)
      .eq("from_unit_id", fromUnitId)
      .eq("to_unit_id", toUnitId)
      .eq("item_specific", true)
      .eq("inventory_item_id", itemId)
      .maybeSingle();

    if (itemSpecific) {
      return value * Number(itemSpecific.conversion_factor);
    }
  }

  // 3. Try through base unit: fromUnit -> fromBase -> toBase -> toUnit
  const [fromUnit, toUnit] = await Promise.all([
    getUnitWithBase(supabase, fromUnitId),
    getUnitWithBase(supabase, toUnitId),
  ]);

  if (!fromUnit || !toUnit) {
    throw new ConversionError("One or both units not found", "UNIT_NOT_FOUND");
  }

  if (fromUnit.base_unit_id && toUnit.base_unit_id) {
    // Both go through a base unit
    if (fromUnit.base_unit_id === toUnit.base_unit_id) {
      // Same base: convert via base
      const toBase = value * Number(fromUnit.conversion_factor_to_base);
      return toBase / Number(toUnit.conversion_factor_to_base);
    }

    // Different bases or third path: check reverse conversion
    const { data: reverse } = await supabase
      .from("unit_conversions")
      .select("conversion_factor")
      .eq("organization_id", organizationId)
      .eq("from_unit_id", toUnitId)
      .eq("to_unit_id", fromUnitId)
      .maybeSingle();

    if (reverse) {
      return value / Number(reverse.conversion_factor);
    }
  }

  // 4. Try through base unit path (A -> base -> B)
  if (fromUnit.base_unit_id === toUnit.id) {
    return value * Number(fromUnit.conversion_factor_to_base);
  }

  if (toUnit.base_unit_id === fromUnit.id) {
    return value / Number(toUnit.conversion_factor_to_base);
  }

  throw new ConversionError(
    `No conversion path from unit ${fromUnitId} to ${toUnitId}`,
    "NO_CONVERSION_PATH",
  );
}

async function getUnitWithBase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
): Promise<UnitLookup | null> {
  const { data } = await supabase
    .from("units")
    .select("id, base_unit_id, conversion_factor_to_base")
    .eq("id", unitId)
    .maybeSingle();

  return data;
}

export function roundToPack(
  quantity: number,
  packSize: number,
  minimum: number = 0,
): number {
  const rounded = Math.ceil(quantity / packSize) * packSize;
  return Math.max(rounded, minimum);
}

export function formatQuantity(value: number, decimals: number = 3): string {
  return Number(value.toFixed(decimals)).toString();
}
