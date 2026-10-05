import { shiftDate } from "@/lib/inventory/count-period";
import { createClient } from "@/lib/supabase/server";
import type { ReadinessCheck } from "@/lib/reporting/types";

export async function checkCloseReadiness(
  organizationId: string,
  locationId: string,
  periodId: string,
): Promise<ReadinessCheck[]> {
  const supabase = await createClient();

  const { data: period } = await supabase
    .from("inventory_periods")
    .select("period_start, period_end")
    .eq("id", periodId)
    .single();

  if (!period) return [];

  const checks: ReadinessCheck[] = [];

  // 1–2. Opening and closing full counts, found by the business date they
  // record (the opening is usually the previous period's closing count).
  const { data: fullCounts } = await supabase
    .from("inventory_counts")
    .select("count_date")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .eq("count_type", "full")
    .eq("status", "approved")
    .gte("count_date", shiftDate(period.period_start, -7))
    .lte("count_date", shiftDate(period.period_end, 7));
  const dates = (fullCounts ?? []).map((count) => count.count_date as string);
  const openingDate = dates
    .filter((date) => date <= shiftDate(period.period_start, 2))
    .sort()
    .at(-1);
  const closingDate = dates
    .filter(
      (date) =>
        date >= shiftDate(period.period_end, -2) &&
        (!openingDate || date > openingDate),
    )
    .sort()
    .at(-1);
  const checkpoints = dates.filter(
    (date) =>
      (!openingDate || date > openingDate) &&
      date < shiftDate(period.period_end, -2),
  ).length;
  const dayLabel = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  checks.push({
    label: "Opening inventory count approved",
    pass: Boolean(openingDate),
    severity: "blocking",
    detail: openingDate
      ? `Full count of the ${dayLabel(openingDate)} close.`
      : "No approved full count on or just before the period's first day.",
  });

  checks.push({
    label: "Closing inventory count approved",
    pass: Boolean(closingDate),
    severity: "blocking",
    detail: closingDate
      ? `Full count of the ${dayLabel(closingDate)} close${
          checkpoints
            ? `, with ${checkpoints} mid-period checkpoint${checkpoints === 1 ? "" : "s"}`
            : ""
        }.`
      : checkpoints
        ? `${checkpoints} mid-period checkpoint${checkpoints === 1 ? "" : "s"} approved; the closing count is still due.`
        : "No approved full count at the end of the period.",
  });

  // 3. No unapproved invoices in period
  const { count: unapprovedInvoices } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .not("status", "in", '("posted","rejected")')
    .gte("invoice_date", period.period_start)
    .lte("invoice_date", period.period_end);

  checks.push({
    label: "All invoices approved",
    pass: (unapprovedInvoices ?? 0) === 0,
    severity: "blocking",
    detail:
      (unapprovedInvoices ?? 0) === 0
        ? "No unapproved invoices."
        : `${unapprovedInvoices} invoice(s) still need approval.`,
  });

  // 4. Every sold item has active recipe mapping. Unmapped items post with
  // no recipe, so they count toward sales but carry no theoretical cost.
  const { data: unmappedSales } = await supabase
    .from("sales_items")
    .select("item_guid, sales_business_days!inner(location_id, business_date)")
    .is("recipe_id", null)
    .eq("sales_business_days.location_id", locationId)
    .gte("sales_business_days.business_date", period.period_start)
    .lte("sales_business_days.business_date", period.period_end);
  const unmappedItems = [
    ...new Set((unmappedSales ?? []).map((item) => item.item_guid)),
  ];

  checks.push({
    label: "All sold items mapped to recipes",
    pass: !unmappedItems || unmappedItems.length === 0,
    severity: "incomplete",
    detail:
      unmappedItems && unmappedItems.length > 0
        ? `${unmappedItems.length} sold item(s) have no recipe mapping.`
        : "All sold items are mapped.",
  });

  // 5. Every invoice line mapped to inventory item
  const { count: unmappedLines } = await supabase
    .from("invoice_lines")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("inventory_item_id", null);

  checks.push({
    label: "All invoice lines mapped to inventory items",
    pass: (unmappedLines ?? 0) === 0,
    severity: "incomplete",
    detail:
      (unmappedLines ?? 0) === 0
        ? "No unmapped invoice lines."
        : `${unmappedLines} invoice line(s) are unmapped.`,
  });

  // 6. No negative physical inventory
  const { count: negativeItems } = await supabase
    .from("inventory_on_hand")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .lt("quantity", 0);

  checks.push({
    label: "No negative physical inventory",
    pass: (negativeItems ?? 0) === 0,
    severity: "blocking",
    detail:
      (negativeItems ?? 0) === 0
        ? "No negative inventory."
        : `${negativeItems} item(s) have negative physical inventory.`,
  });

  // 7. No duplicate source documents pending review
  const { data: duplicates } = await supabase
    .from("source_imports")
    .select("file_hash, count")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .in("status", ["staged", "extracting", "mapping"])
    .limit(1);

  checks.push({
    label: "No duplicate source documents pending",
    pass: !duplicates || duplicates.length === 0,
    severity: "estimated",
    detail:
      duplicates && duplicates.length > 0
        ? `${duplicates.length} duplicate document(s) pending review.`
        : "No duplicates detected.",
  });

  return checks;
}
