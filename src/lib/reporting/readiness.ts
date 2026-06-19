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

  // 1. Opening count exists and approved
  const { count: openingFullCounts } = await supabase
    .from("inventory_counts")
    .select("*", { count: "exact", head: true })
    .eq("inventory_period_id", periodId)
    .eq("count_type", "full")
    .eq("status", "approved");

  checks.push({
    label: "Opening inventory count approved",
    pass: (openingFullCounts ?? 0) > 0,
    severity: "blocking",
    detail:
      (openingFullCounts ?? 0) > 0
        ? `${openingFullCounts} full count(s) approved.`
        : "No full count has been approved for this period.",
  });

  // 2. Closing count exists and approved
  const { count: closingCounts } = await supabase
    .from("inventory_counts")
    .select("*", { count: "exact", head: true })
    .eq("inventory_period_id", periodId)
    .eq("status", "approved");

  checks.push({
    label: "Closing inventory count approved",
    pass: (closingCounts ?? 0) > 0,
    severity: "blocking",
    detail:
      (closingCounts ?? 0) > 0
        ? `${closingCounts} count(s) approved.`
        : "No count has been approved for this period.",
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

  // 4. Every sold item has active recipe mapping
  const { data: unmappedItems } = await supabase
    .from("sales_items")
    .select("toast_item_guid")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .not(
      "toast_item_guid",
      "in",
      (
        await supabase
          .from("recipe_menu_item_mappings")
          .select("external_item_guid")
          .eq("organization_id", organizationId)
          .eq("active", true)
      ).data?.map((m) => m.external_item_guid) ?? [""],
    )
    .limit(1);

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
