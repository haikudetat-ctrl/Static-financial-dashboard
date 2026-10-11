import { countOpenPriceChanges } from "@/lib/purchasing/price-changes";
import { createClient } from "@/lib/supabase/server";

const OPEN_IMPORT_STATUSES = [
  "received",
  "extracting",
  "extracted",
  "staging",
  "staged",
  "mapping",
  "ready",
  "failed",
];

export type AttentionQueue = {
  key:
    | "invoices"
    | "priceChanges"
    | "imports"
    | "counts"
    | "unmappedLines"
    | "catalog";
  count: number;
  /** Dollars the queue holds back from the P&L, when that can be measured. */
  amount: number | null;
};

const sumOf = (rows: Array<Record<string, unknown>> | null, field: string) =>
  (rows ?? []).reduce((total, row) => total + Number(row[field] ?? 0), 0);

/**
 * Open work that keeps the P&L from being accurate. Feeds the Today action
 * queue and the counts beside each section in the navigation.
 */
export async function getAttentionQueues(
  organizationId: string,
  locationId: string,
): Promise<AttentionQueue[]> {
  const supabase = await createClient();
  const count = (query: PromiseLike<{ count: number | null }>) =>
    Promise.resolve(query).then((result) => result.count ?? 0);

  const [invoices, priceChanges, imports, counts, unmappedLines, catalog] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("total_amount", { count: "exact" })
        .eq("location_id", locationId)
        .in("status", ["uploaded", "extracted", "reviewed"]),
      countOpenPriceChanges(organizationId, locationId),
      count(
        supabase
          .from("source_imports")
          .select("id", { count: "exact", head: true })
          .eq("location_id", locationId)
          .in("status", OPEN_IMPORT_STATUSES),
      ),
      count(
        supabase
          .from("inventory_counts")
          .select("id", { count: "exact", head: true })
          .eq("location_id", locationId)
          .in("status", ["draft", "in_progress", "counted"]),
      ),
      // The amount sums the first page of rows; the count is exact.
      supabase
        .from("invoice_lines")
        .select("line_total", { count: "exact" })
        .eq("organization_id", organizationId)
        .is("inventory_item_id", null),
      count(
        supabase
          .from("catalog_review_items")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("status", "open"),
      ),
    ]);

  return [
    {
      key: "invoices",
      count: invoices.count ?? 0,
      amount: sumOf(invoices.data, "total_amount"),
    },
    { key: "priceChanges", count: priceChanges, amount: null },
    { key: "imports", count: imports, amount: null },
    { key: "counts", count: counts, amount: null },
    {
      key: "unmappedLines",
      count: unmappedLines.count ?? 0,
      amount: sumOf(unmappedLines.data, "line_total"),
    },
    { key: "catalog", count: catalog, amount: null },
  ];
}

/** Open-item counts keyed by manager navigation href. */
export function navigationCounts(queues: AttentionQueue[]) {
  const of = (key: AttentionQueue["key"]) =>
    queues.find((queue) => queue.key === key)?.count ?? 0;
  return {
    "/inventory": of("counts"),
    "/purchasing": of("priceChanges"),
    "/invoices/upload": of("invoices"),
    "/imports": of("imports"),
    "/exceptions": of("unmappedLines") + of("catalog"),
  } as Record<string, number>;
}
