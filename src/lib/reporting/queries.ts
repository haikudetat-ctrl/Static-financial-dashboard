import { createClient } from "@/lib/supabase/server";
import type { CogsSummary, PeriodSummary } from "@/lib/reporting/types";

export async function getPeriods(
  organizationId: string,
  locationId: string,
): Promise<PeriodSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_periods")
    .select("id, period_start, period_end, status")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .order("period_start", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
  }));
}

export async function getCogsForPeriod(
  periodId: string,
): Promise<CogsSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("period_cogs_results")
    .select(
      "actual_cogs, opening_value, purchases_value, closing_value, known_loss_value, theoretical_cogs, variance_value, variance_pct",
    )
    .eq("inventory_period_id", periodId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    actualCogs: Number(data.actual_cogs),
    openingValue: Number(data.opening_value),
    purchasesValue: Number(data.purchases_value),
    closingValue: Number(data.closing_value),
    knownLoss: Number(data.known_loss_value),
    theoreticalCogs: Number(data.theoretical_cogs),
    varianceValue: Number(data.variance_value),
    variancePct: data.variance_pct === null ? null : Number(data.variance_pct),
  };
}

export async function getVarianceByItem(periodId: string, limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("period_variance_results")
    .select(
      "inventory_item_id, actual_usage, actual_cost, theoretical_usage, theoretical_cost, quantity_variance, cost_variance, variance_pct",
    )
    .eq("inventory_period_id", periodId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getSalesSummary(
  organizationId: string,
  locationId: string,
  startDate: string,
  endDate: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_business_days")
    .select("business_date, net_sales")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .gte("business_date", startDate)
    .lte("business_date", endDate)
    .order("business_date");
  return data ?? [];
}

export async function getMenuProfitability(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const { data: sales } = await supabase
    .from("sales_items")
    .select("toast_item_guid, item_name, quantity_sold, net_sales")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId);
  const { data: mappings } = await supabase
    .from("recipe_menu_item_mappings")
    .select("external_item_guid, recipe_id, recipes(name)")
    .eq("organization_id", organizationId)
    .eq("active", true);
  const totalQtySold = (sales ?? []).reduce(
    (sum, s) => sum + Number(s.quantity_sold),
    0,
  );
  return { sales: sales ?? [], mappings: mappings ?? [], totalQtySold };
}

export async function getPurchasingSpend(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const { data: spendByVendor } = await supabase
    .from("inventory_transactions")
    .select(
      "inventory_transaction_lines!inner(inventory_item_id, quantity, unit_cost)",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .eq("transaction_type", "receipt");
  const { data: openPOs } = await supabase
    .from("purchase_orders")
    .select(
      "id, vendor_id, status, order_date, expected_delivery_date, vendors(name)",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .not("status", "in", '("cancelled","received")')
    .order("order_date", { ascending: false });
  return { spendByVendor: spendByVendor ?? [], openPOs: openPOs ?? [] };
}
