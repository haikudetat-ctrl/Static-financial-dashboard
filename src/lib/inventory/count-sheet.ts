import { createClient } from "@/lib/supabase/server";

type Related<T> = T | T[] | null | undefined;
const one = <T>(value: Related<T>) =>
  (Array.isArray(value) ? value[0] : value) ?? null;

/** PostgREST caps responses at 1,000 rows; full counts can exceed that. */
const PAGE = 1000;

export type CountListRow = {
  id: string;
  countType: "full" | "spot";
  status: string;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
  assigneeName: string;
  totalLines: number;
  countedLines: number;
  areas: number;
};

export async function getCountList(
  organizationId: string,
  locationId: string,
  { includeClosed = true }: { includeClosed?: boolean } = {},
): Promise<CountListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("inventory_counts")
    .select(
      "id, count_type, status, created_at, inventory_periods(period_start, period_end), profiles!inventory_counts_assigned_to_fkey(name, email), inventory_count_assignments(id)",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!includeClosed) {
    query = query.in("status", ["draft", "in_progress", "counted"]);
  }
  const { data: counts } = await query;

  return Promise.all(
    (counts ?? []).map(async (count) => {
      const assignmentIds = (count.inventory_count_assignments ?? []).map(
        (assignment: { id: string }) => assignment.id,
      );
      const lineCount = (status?: string) => {
        let q = supabase
          .from("inventory_count_lines")
          .select("id", { count: "exact", head: true })
          .in("inventory_count_assignment_id", assignmentIds);
        if (status) q = q.eq("status", status);
        return q.then((result) => result.count ?? 0);
      };
      const [totalLines, countedLines] = assignmentIds.length
        ? await Promise.all([lineCount(), lineCount("counted")])
        : [0, 0];
      const period = one(
        count.inventory_periods as Related<{
          period_start: string;
          period_end: string;
        }>,
      );
      const profile = one(
        count.profiles as Related<{ name: string; email: string }>,
      );
      return {
        id: count.id,
        countType: count.count_type,
        status: count.status,
        createdAt: count.created_at,
        periodStart: period?.period_start ?? "",
        periodEnd: period?.period_end ?? "",
        assigneeName: profile?.name || profile?.email || "Unassigned",
        totalLines,
        countedLines,
        areas: assignmentIds.length,
      };
    }),
  );
}

export type CountSheetLine = {
  id: string;
  itemId: string;
  itemCode: string | null;
  name: string;
  category: string;
  unit: string;
  allowsTenths: boolean;
  sortOrder: number;
  countedQuantity: number | null;
  countedTenths: number;
  status: string;
};

export type CountSheetArea = {
  assignmentId: string;
  storageLocationId: string;
  name: string;
  area: string;
  walkOrder: number;
  status: string;
  lines: CountSheetLine[];
};

export async function getCountSheet(countId: string) {
  const supabase = await createClient();
  const { data: count } = await supabase
    .from("inventory_counts")
    .select(
      "id, organization_id, count_type, status, created_at, inventory_periods(id, period_start, period_end), profiles!inventory_counts_assigned_to_fkey(name, email)",
    )
    .eq("id", countId)
    .maybeSingle();
  if (!count) return null;

  const { data: assignments } = await supabase
    .from("inventory_count_assignments")
    .select(
      "id, status, storage_location_id, storage_locations(name, area, walk_order)",
    )
    .eq("inventory_count_id", countId);
  const assignmentIds = (assignments ?? []).map((assignment) => assignment.id);

  type LineRow = {
    id: string;
    inventory_count_assignment_id: string;
    inventory_item_id: string;
    storage_location_id: string;
    counted_quantity: number | string | null;
    counted_tenths: number | string;
    status: string;
    inventory_items: Related<{
      name: string;
      item_code: string | null;
      allows_tenths_counting: boolean;
      count_unit: Related<{ abbreviation: string; name: string }>;
      base_unit: Related<{ abbreviation: string; name: string }>;
      inventory_categories: Related<{ name: string }>;
    }>;
  };
  const lines: LineRow[] = [];
  for (let from = 0; assignmentIds.length; from += PAGE) {
    const { data, error } = await supabase
      .from("inventory_count_lines")
      .select(
        "id, inventory_count_assignment_id, inventory_item_id, storage_location_id, counted_quantity, counted_tenths, status, inventory_items(name, item_code, allows_tenths_counting, count_unit:units!inventory_items_count_unit_id_fkey(abbreviation, name), base_unit:units!inventory_items_base_unit_id_fkey(abbreviation, name), inventory_categories(name))",
      )
      .in("inventory_count_assignment_id", assignmentIds)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    lines.push(...((data ?? []) as LineRow[]));
    if (!data || data.length < PAGE) break;
  }

  // Shelf order inside each storage area, from the storage map.
  const storageIds = (assignments ?? []).map((a) => a.storage_location_id);
  const sortOrder = new Map<string, number>();
  for (let from = 0; storageIds.length; from += PAGE) {
    const { data } = await supabase
      .from("storage_location_items")
      .select("storage_location_id, inventory_item_id, sort_order")
      .in("storage_location_id", storageIds)
      .range(from, from + PAGE - 1);
    for (const row of data ?? []) {
      sortOrder.set(
        `${row.storage_location_id}:${row.inventory_item_id}`,
        row.sort_order ?? 0,
      );
    }
    if (!data || data.length < PAGE) break;
  }

  const areas: CountSheetArea[] = (assignments ?? [])
    .map((assignment) => {
      const location = one(
        assignment.storage_locations as Related<{
          name: string;
          area: string;
          walk_order: number;
        }>,
      );
      return {
        assignmentId: assignment.id,
        storageLocationId: assignment.storage_location_id,
        name: location?.name ?? "Storage area",
        area: location?.area ?? "",
        walkOrder: location?.walk_order ?? 0,
        status: assignment.status,
        lines: lines
          .filter(
            (line) => line.inventory_count_assignment_id === assignment.id,
          )
          .map((line) => {
            const item = one(line.inventory_items);
            const unit = one(item?.count_unit) ?? one(item?.base_unit);
            return {
              id: line.id,
              itemId: line.inventory_item_id,
              itemCode: item?.item_code ?? null,
              name: item?.name ?? "Inventory item",
              category: one(item?.inventory_categories)?.name ?? "",
              unit: unit?.abbreviation || unit?.name || "unit",
              allowsTenths: item?.allows_tenths_counting ?? false,
              sortOrder:
                sortOrder.get(
                  `${line.storage_location_id}:${line.inventory_item_id}`,
                ) ?? 0,
              countedQuantity:
                line.counted_quantity === null
                  ? null
                  : Number(line.counted_quantity),
              countedTenths: Number(line.counted_tenths),
              status: line.status,
            };
          })
          .sort(
            (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
          ),
      };
    })
    .sort((a, b) => a.walkOrder - b.walkOrder);

  const period = one(
    count.inventory_periods as Related<{
      id: string;
      period_start: string;
      period_end: string;
    }>,
  );
  const profile = one(
    count.profiles as Related<{ name: string; email: string }>,
  );
  return {
    id: count.id,
    organizationId: count.organization_id,
    countType: count.count_type as "full" | "spot",
    status: count.status as string,
    createdAt: count.created_at as string,
    period,
    assigneeName: profile?.name || profile?.email || "Unassigned",
    areas,
  };
}

export type CountReviewLine = {
  lineId: string;
  expectedQuantity: number;
  countedTotal: number | null;
  conversionFactor: number;
  unitCost: number;
  approved: boolean;
  notes: string;
};

/**
 * Expected quantities and costs for manager review. Kept apart from the
 * count sheet so expected on-hand never reaches the counting screen.
 */
export async function getCountReview(countId: string, periodId: string | null) {
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("inventory_count_assignments")
    .select("id")
    .eq("inventory_count_id", countId);
  const assignmentIds = (assignments ?? []).map((assignment) => assignment.id);

  type Row = {
    id: string;
    inventory_item_id: string;
    expected_quantity: number | string;
    counted_quantity: number | string | null;
    counted_tenths: number | string;
    is_open_container: boolean;
    approved_at: string | null;
    notes: string;
    inventory_items: Related<{
      count_unit: Related<{ conversion_factor_to_base: number | string }>;
      base_unit: Related<{ conversion_factor_to_base: number | string }>;
    }>;
  };
  const rows: Row[] = [];
  for (let from = 0; assignmentIds.length; from += PAGE) {
    const { data, error } = await supabase
      .from("inventory_count_lines")
      .select(
        "id, inventory_item_id, expected_quantity, counted_quantity, counted_tenths, is_open_container, approved_at, notes, inventory_items(count_unit:units!inventory_items_count_unit_id_fkey(conversion_factor_to_base), base_unit:units!inventory_items_base_unit_id_fkey(conversion_factor_to_base))",
      )
      .in("inventory_count_assignment_id", assignmentIds)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }

  // Latest weighted-average cost per item for the count's period.
  const costs = new Map<string, number>();
  for (let from = 0; periodId; from += PAGE) {
    const { data } = await supabase
      .from("inventory_item_cost_snapshots")
      .select("inventory_item_id, weighted_average_cost, effective_at")
      .eq("inventory_period_id", periodId)
      .order("effective_at", { ascending: false })
      .range(from, from + PAGE - 1);
    for (const snapshot of data ?? []) {
      if (!costs.has(snapshot.inventory_item_id)) {
        costs.set(
          snapshot.inventory_item_id,
          Number(snapshot.weighted_average_cost),
        );
      }
    }
    if (!data || data.length < PAGE) break;
  }

  return new Map<string, CountReviewLine>(
    rows.map((row) => {
      const item = one(row.inventory_items);
      const unit = one(item?.count_unit) ?? one(item?.base_unit);
      return [
        row.id,
        {
          lineId: row.id,
          expectedQuantity: Number(row.expected_quantity),
          countedTotal:
            row.counted_quantity === null
              ? null
              : Number(row.counted_quantity) +
                (row.is_open_container ? Number(row.counted_tenths) : 0),
          conversionFactor: Number(unit?.conversion_factor_to_base ?? 1),
          unitCost: costs.get(row.inventory_item_id) ?? 0,
          approved: Boolean(row.approved_at),
          notes: row.notes ?? "",
        },
      ];
    }),
  );
}
