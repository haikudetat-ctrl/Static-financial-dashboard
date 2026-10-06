import { getCountSheet } from "@/lib/inventory/count-sheet";
import {
  bestZoneForSection,
  matchItemByName,
  toBaseQuantity,
  zonesForArea,
  type UnitType,
} from "@/lib/drive/matching";
import type {
  BatchSheet,
  CountSheet,
  CreditNote,
  WasteLog,
} from "@/lib/drive/templates";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Related<T> = T | T[] | null | undefined;
const one = <T>(value: Related<T>) =>
  (Array.isArray(value) ? value[0] : value) ?? null;

/* ---------------------------------------------------------------- catalog */

export type CatalogItem = {
  id: string;
  name: string;
  itemCode: string | null;
  unitType: UnitType;
  countUnitFactor: number | null;
  defaultZoneId: string | null;
  zoneIds: string[];
};

export type Catalog = {
  items: CatalogItem[];
  zones: Array<{ id: string; name: string; area: string }>;
};

const PAGE = 1000;

export async function loadCatalog(
  supabase: Supabase,
  organizationId: string,
  locationId: string,
): Promise<Catalog> {
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select(
        "id, name, item_code, default_storage_location_id, base_unit:units!inventory_items_base_unit_id_fkey(unit_type), count_unit:units!inventory_items_count_unit_id_fkey(conversion_factor_to_base)",
      )
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const { data: zones } = await supabase
    .from("storage_locations")
    .select("id, name, area")
    .eq("location_id", locationId)
    .eq("active", true)
    .order("walk_order");
  const zoneIds = new Set((zones ?? []).map((zone) => zone.id));
  const mapped = new Map<string, string[]>();
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("storage_location_items")
      .select("storage_location_id, inventory_item_id")
      .in("storage_location_id", [...zoneIds])
      .range(from, from + PAGE - 1);
    for (const row of data ?? []) {
      const list = mapped.get(row.inventory_item_id) ?? [];
      list.push(row.storage_location_id);
      mapped.set(row.inventory_item_id, list);
    }
    if (!data || data.length < PAGE) break;
  }
  return {
    zones: (zones ?? []).map((zone) => ({
      id: zone.id,
      name: zone.name,
      area: zone.area ?? "",
    })),
    items: rows.map((row) => {
      const base = one(row.base_unit as Related<{ unit_type: string }>);
      const count = one(
        row.count_unit as Related<{
          conversion_factor_to_base: number | string | null;
        }>,
      );
      const factor = Number(count?.conversion_factor_to_base ?? 0);
      return {
        id: row.id as string,
        name: row.name as string,
        itemCode: (row.item_code as string | null) ?? null,
        unitType: (["volume", "weight"].includes(base?.unit_type ?? "")
          ? base!.unit_type
          : "each") as UnitType,
        countUnitFactor: factor > 0 ? factor : null,
        defaultZoneId:
          (row.default_storage_location_id as string | null) ?? null,
        zoneIds: mapped.get(row.id as string) ?? [],
      };
    }),
  };
}

/* ----------------------------------------------------------------- counts */

export type CountPreview = {
  count: {
    id: string;
    countDate: string;
    countType: string;
    status: string;
  } | null;
  matched: Array<{
    lineId: string;
    zone: string;
    itemCode: string;
    name: string;
    quantity: number;
    tenths: number;
    previous: number | null;
  }>;
  /** On the sheet but not on the app's count. */
  unplaced: Array<{ itemCode: string; product: string; reason: string }>;
  problem: string | null;
};

export async function previewCountSheet(
  supabase: Supabase,
  locationId: string,
  sheet: CountSheet,
): Promise<CountPreview> {
  const empty = { matched: [], unplaced: [] };
  if (!sheet.countDate) {
    return { count: null, ...empty, problem: "The sheet has no count date." };
  }
  const { data: counts } = await supabase
    .from("inventory_counts")
    .select("id, count_type, count_date, status")
    .eq("location_id", locationId)
    .eq("count_date", sheet.countDate)
    .in("status", ["draft", "in_progress", "counted"])
    .order("count_type");
  const target = (counts ?? [])[0];
  if (!target) {
    return {
      count: null,
      ...empty,
      problem: `There's no open count dated ${sheet.countDate}. Start that count in the app, then apply this sheet.`,
    };
  }
  const countSheet = await getCountSheet(target.id);
  const lines = (countSheet?.areas ?? []).flatMap((area) =>
    area.lines.map((line) => ({
      ...line,
      zoneId: area.storageLocationId,
      zone: area.name,
      zoneArea: area.area,
    })),
  );
  const areaZoneIds = new Set(
    zonesForArea(
      (countSheet?.areas ?? []).map((area) => ({
        id: area.storageLocationId,
        name: area.name,
        area: area.area,
      })),
      sheet.area,
    ).map((zone) => zone.id),
  );

  const byLine = new Map<string, CountPreview["matched"][number]>();
  const unplaced: CountPreview["unplaced"] = [];
  for (const row of sheet.lines) {
    const candidates = lines.filter((line) => line.itemCode === row.itemCode);
    const inArea = candidates.filter((line) => areaZoneIds.has(line.zoneId));
    const pool = inArea.length ? inArea : candidates;
    if (!pool.length) {
      unplaced.push({
        itemCode: row.itemCode,
        product: row.product,
        reason: "Not on this count",
      });
      continue;
    }
    const zone = bestZoneForSection(
      pool.map((line) => ({
        id: line.id,
        name: line.zone,
        area: line.zoneArea,
      })),
      row.section,
    );
    const line = pool.find((candidate) => candidate.id === zone.id)!;
    const existing = byLine.get(line.id);
    if (existing) {
      // Listed twice on the sheet (two shelves of one zone): add them up.
      existing.quantity += existing.tenths + row.full + row.tenths;
      existing.tenths = 0;
      continue;
    }
    byLine.set(line.id, {
      lineId: line.id,
      zone: line.zone,
      itemCode: row.itemCode,
      name: line.name,
      quantity: row.full,
      tenths: row.tenths,
      previous:
        line.countedQuantity === null
          ? null
          : line.countedQuantity + (line.countedTenths ?? 0),
    });
  }
  return {
    count: {
      id: target.id,
      countDate: target.count_date,
      countType: target.count_type,
      status: target.status,
    },
    matched: [...byLine.values()],
    unplaced,
    problem: byLine.size
      ? null
      : "None of the sheet's items are on that count.",
  };
}

export async function applyCountSheet(
  supabase: Supabase,
  preview: CountPreview,
) {
  if (!preview.count || preview.problem) {
    throw new Error(preview.problem ?? "Nothing to apply.");
  }
  for (const row of preview.matched) {
    const tenths = Math.round(row.tenths * 10) / 10;
    const { error } = await supabase
      .from("inventory_count_lines")
      .update({
        counted_quantity: row.quantity,
        counted_tenths: tenths,
        is_open_container: tenths > 0,
        status: "counted",
      })
      .eq("id", row.lineId);
    if (error) throw new Error(error.message);
  }

  // Areas whose every line is now counted are finished; the count is
  // ready for review when all its areas are.
  const { data: assignments } = await supabase
    .from("inventory_count_assignments")
    .select("id, status, inventory_count_lines(status)")
    .eq("inventory_count_id", preview.count.id);
  for (const assignment of assignments ?? []) {
    const statuses = (
      assignment.inventory_count_lines as Array<{ status: string }>
    ).map((line) => line.status);
    const next = statuses.every((status) => status === "counted")
      ? "counted"
      : statuses.some((status) => status === "counted")
        ? "in_progress"
        : assignment.status;
    if (next !== assignment.status) {
      await supabase
        .from("inventory_count_assignments")
        .update({ status: next })
        .eq("id", assignment.id);
    }
  }
  const allCounted = (assignments ?? []).every((assignment) =>
    (assignment.inventory_count_lines as Array<{ status: string }>).every(
      (line) => line.status === "counted",
    ),
  );
  await supabase
    .from("inventory_counts")
    .update({ status: allCounted ? "counted" : "in_progress" })
    .eq("id", preview.count.id)
    .in("status", ["draft", "in_progress"]);
  return `${preview.matched.length} line${preview.matched.length === 1 ? "" : "s"} entered on the ${preview.count.countDate} count`;
}

/* ------------------------------------------------------------------ waste */

export type WastePreviewRow = {
  index: number;
  product: string;
  date: string | null;
  amount: number | null;
  unit: string;
  reason: string;
  ledgerReason: string;
  itemId: string | null;
  itemName: string | null;
  zoneId: string | null;
  quantityBase: number | null;
  problem: string | null;
};

function zoneFor(item: CatalogItem, catalog: Catalog, area: string) {
  const inArea = new Set(zonesForArea(catalog.zones, area).map((z) => z.id));
  return (
    item.zoneIds.find((id) => area && inArea.has(id)) ??
    item.defaultZoneId ??
    item.zoneIds[0] ??
    null
  );
}

export function previewWasteLog(
  catalog: Catalog,
  log: WasteLog,
  overrides: Record<number, string> = {},
): WastePreviewRow[] {
  return log.entries.map((entry, index) => {
    const item =
      (overrides[index] &&
        catalog.items.find((candidate) => candidate.id === overrides[index])) ||
      matchItemByName(catalog.items, entry.product);
    const quantityBase =
      item && entry.amount !== null && entry.amount > 0
        ? toBaseQuantity(entry.amount, entry.unit, item)
        : null;
    const zoneId = item ? zoneFor(item, catalog, log.area) : null;
    const problem = !item
      ? "Pick the item"
      : !entry.date
        ? "No date"
        : entry.amount === null || entry.amount <= 0
          ? "No amount"
          : quantityBase === null
            ? `"${entry.unit || "blank"}" doesn't fit ${item.name}`
            : !zoneId
              ? `${item.name} has no storage area`
              : null;
    return {
      index,
      product: entry.product,
      date: entry.date,
      amount: entry.amount,
      unit: entry.unit,
      reason: entry.reason,
      ledgerReason: entry.ledgerReason,
      itemId: item?.id ?? null,
      itemName: item?.name ?? null,
      zoneId,
      quantityBase,
      problem,
    };
  });
}

export async function applyWasteLog(
  supabase: Supabase,
  locationId: string,
  sourceKey: string,
  rows: WastePreviewRow[],
) {
  const blocked = rows.filter((row) => row.problem);
  if (blocked.length) {
    throw new Error(
      `${blocked.length} row${blocked.length === 1 ? " needs" : "s need"} fixing first.`,
    );
  }
  const { data, error } = await supabase.rpc("post_waste_entries", {
    target_location_id: locationId,
    source_key: sourceKey,
    entries: rows.map((row) => ({
      inventory_item_id: row.itemId,
      storage_location_id: row.zoneId,
      quantity_base: row.quantityBase,
      reason: row.ledgerReason,
      business_date: row.date,
      note: `${row.reason}${row.product ? ` · ${row.product}` : ""}`,
    })),
  });
  if (error) throw new Error(error.message);
  const posted = Number(data ?? 0);
  return `${posted} waste entr${posted === 1 ? "y" : "ies"} posted`;
}

/* ---------------------------------------------------------------- batches */

export type BatchPreview = {
  itemName: string | null;
  recipeId: string | null;
  recipeName: string | null;
  versionId: string | null;
  outputUnitId: string | null;
  outputUnit: string | null;
  actualOutput: number | null;
  expectedOutput: number | null;
  producedAt: string | null;
  problem: string | null;
};

export async function previewBatchSheet(
  supabase: Supabase,
  catalog: Catalog,
  batch: BatchSheet,
): Promise<BatchPreview> {
  const empty: BatchPreview = {
    itemName: null,
    recipeId: null,
    recipeName: null,
    versionId: null,
    outputUnitId: null,
    outputUnit: null,
    actualOutput: null,
    expectedOutput: null,
    producedAt: null,
    problem: null,
  };
  const item =
    (batch.itemCode &&
      catalog.items.find(
        (candidate) => candidate.itemCode === batch.itemCode,
      )) ||
    matchItemByName(catalog.items, batch.batchName);
  if (!item) {
    return {
      ...empty,
      problem: `No house-made item matches "${batch.batchName}".`,
    };
  }
  const { data: recipes } = await supabase
    .from("recipes")
    .select(
      "id, name, recipe_versions(id, status, output_quantity, output_unit_id, units:output_unit_id(abbreviation, conversion_factor_to_base))",
    )
    .eq("output_inventory_item_id", item.id);
  const recipe = (recipes ?? [])[0];
  const version = (
    recipe?.recipe_versions as
      | Array<{
          id: string;
          status: string;
          output_quantity: number | string;
          output_unit_id: string;
          units: Related<{
            abbreviation: string;
            conversion_factor_to_base: number | string | null;
          }>;
        }>
      | undefined
  )?.find((candidate) => candidate.status === "active");
  if (!recipe || !version) {
    return {
      ...empty,
      itemName: item.name,
      problem: `${item.name} has no active batch recipe yet.`,
    };
  }
  const unit = one(version.units);
  const unitFactor = Number(unit?.conversion_factor_to_base ?? 0);
  const yieldBase =
    batch.yieldAmount !== null
      ? toBaseQuantity(batch.yieldAmount, batch.yieldUnit, item)
      : null;
  const missingZone = !item.defaultZoneId;
  const result = {
    ...empty,
    itemName: item.name,
    recipeId: recipe.id,
    recipeName: recipe.name,
    versionId: version.id,
    outputUnitId: version.output_unit_id,
    outputUnit: unit?.abbreviation ?? null,
    expectedOutput: Number(version.output_quantity),
    actualOutput:
      yieldBase !== null && unitFactor > 0 ? yieldBase / unitFactor : null,
    producedAt: batch.dateMade,
  };
  return {
    ...result,
    problem: !batch.dateMade
      ? "Date made is blank."
      : result.actualOutput === null
        ? `Can't read the yield "${batch.yieldAmount ?? ""} ${batch.yieldUnit}".`
        : missingZone
          ? `${item.name} has no default storage area to put the batch in.`
          : null,
  };
}

export async function applyBatchSheet(
  supabase: Supabase,
  {
    organizationId,
    locationId,
    userId,
    producedAt,
  }: {
    organizationId: string;
    locationId: string;
    userId: string;
    /** When the batch was made, as an ISO timestamp. */
    producedAt: string;
  },
  preview: BatchPreview,
  notes: string,
) {
  if (preview.problem || !preview.recipeId || !preview.versionId) {
    throw new Error(preview.problem ?? "Nothing to apply.");
  }
  const { data: batch, error } = await supabase
    .from("production_batches")
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      recipe_id: preview.recipeId,
      recipe_version_id: preview.versionId,
      actual_output_quantity: preview.actualOutput,
      output_unit_id: preview.outputUnitId,
      created_by: userId,
      produced_at: producedAt,
      notes,
    })
    .select("id")
    .single();
  if (error || !batch)
    throw new Error(error?.message ?? "Couldn't save the batch.");
  const { error: postError } = await supabase.rpc("post_production_batch", {
    target_batch_id: batch.id,
  });
  if (postError) {
    throw new Error(
      /insufficient/i.test(postError.message)
        ? "The ingredients aren't on hand in the app yet (usually until the count is approved). The batch is saved as a draft; post it from Production once they are."
        : postError.message,
    );
  }
  return {
    batchId: batch.id,
    summary: `${preview.actualOutput?.toFixed(0)} ${preview.outputUnit} of ${preview.itemName} posted`,
  };
}

/* ---------------------------------------------------------------- credits */

export async function findCreditInvoice(
  supabase: Supabase,
  organizationId: string,
  note: CreditNote,
) {
  if (!note.invoiceNumber) return null;
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, total_amount, vendors(name)")
    .eq("organization_id", organizationId)
    .ilike("invoice_number", note.invoiceNumber.replace(/^0+/, "%"))
    .limit(5);
  const vendor = note.vendor.toLowerCase();
  return (
    (data ?? []).find((invoice) =>
      (one(invoice.vendors as Related<{ name: string }>)?.name ?? "")
        .toLowerCase()
        .includes(vendor),
    ) ??
    (data ?? [])[0] ??
    null
  );
}

/* --------------------------------------------------------------- invoices */

/** Vendor for an invoice file, from the folder it was filed in. */
export function vendorFromPath<T extends { id: string; name: string }>(
  vendors: T[],
  path: string,
) {
  const folders = path
    .split("/")
    .map((part) => part.trim().toLowerCase())
    .reverse();
  for (const folder of folders) {
    const match = vendors.find((vendor) => {
      const name = vendor.name.toLowerCase();
      return (
        folder === name || folder.startsWith(name) || name.startsWith(folder)
      );
    });
    if (match) return match;
  }
  return null;
}
