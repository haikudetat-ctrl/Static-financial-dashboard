import { createClient } from "@/lib/supabase/server";
import {
  buildPnlStatement,
  type PnlAccountRow,
  type PnlStatement,
} from "@/lib/reporting/pnl";
import type { CogsSummary, PeriodSummary } from "@/lib/reporting/types";

export async function getPeriods(
  organizationId: string,
  locationId: string,
): Promise<PeriodSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_periods")
    .select("id, period_start, period_end, status, fiscal_year, period_number")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .order("period_start", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    fiscalYear: row.fiscal_year,
    periodNumber: row.period_number,
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
  startDate: string,
  endDate: string,
) {
  const supabase = await createClient();
  const [{ data: sales }, { data: mappings }] = await Promise.all([
    supabase
      .from("sales_items")
      .select(
        "item_guid, item_name, quantity_sold, net_sales, sales_business_days!inner(location_id, business_date, status)",
      )
      .eq("sales_business_days.location_id", locationId)
      .eq("sales_business_days.status", "posted")
      .gte("sales_business_days.business_date", startDate)
      .lte("sales_business_days.business_date", endDate),
    supabase
      .from("recipe_menu_item_mappings")
      .select("external_item_guid, recipe_id, recipes(name)")
      .eq("organization_id", organizationId)
      .eq("active", true),
  ]);

  // One row per menu item across the range, not one per business day.
  const items = new Map<
    string,
    { itemGuid: string; name: string; quantity: number; netSales: number }
  >();
  for (const sale of sales ?? []) {
    const existing = items.get(sale.item_guid) ?? {
      itemGuid: sale.item_guid,
      name: sale.item_name,
      quantity: 0,
      netSales: 0,
    };
    existing.quantity += Number(sale.quantity_sold);
    existing.netSales += Number(sale.net_sales);
    items.set(sale.item_guid, existing);
  }
  return { items: [...items.values()], mappings: mappings ?? [] };
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

export async function getProfitAndLoss(
  locationId: string,
  startDate: string,
  endDate: string,
): Promise<PnlStatement> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profit_and_loss", {
    target_location_id: locationId,
    range_start: startDate,
    range_end: endDate,
  });
  if (error) throw new Error(error.message);
  return buildPnlStatement((data ?? []) as PnlAccountRow[]);
}

export async function getGlAccounts(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gl_accounts")
    .select("id, code, name, account_type, cogs_class, system_key")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("sort_order");
  return data ?? [];
}

export async function getPlEntries(
  locationId: string,
  startDate: string,
  endDate: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pl_entries")
    .select(
      "id, entry_date, amount, memo, source_type, gl_accounts(code, name)",
    )
    .eq("location_id", locationId)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate)
    .order("entry_date", { ascending: false });
  return (data ?? []).map((entry) => {
    const account = Array.isArray(entry.gl_accounts)
      ? entry.gl_accounts[0]
      : entry.gl_accounts;
    return {
      id: entry.id,
      entryDate: entry.entry_date,
      amount: Number(entry.amount),
      memo: entry.memo,
      sourceType: entry.source_type,
      accountLabel: account ? `${account.code} ${account.name}` : "Account",
    };
  });
}

/**
 * Toast sales groupings seen in posted sales and the account each one maps
 * to, so a manager can classify anything landing in unclassified sales.
 */
export async function getSalesClassification(
  organizationId: string,
  locationId: string,
  startDate: string,
  endDate: string,
) {
  const supabase = await createClient();
  const [{ data: items }, { data: mappings }] = await Promise.all([
    supabase
      .from("sales_items")
      .select(
        "net_sales, sales_business_days!inner(location_id, business_date), source_import_rows(normalized_data)",
      )
      .eq("sales_business_days.location_id", locationId)
      .gte("sales_business_days.business_date", startDate)
      .lte("sales_business_days.business_date", endDate),
    supabase
      .from("sales_category_mappings")
      .select("id, match_field, match_value, gl_account_id")
      .eq("organization_id", organizationId),
  ]);

  const groups = new Map<
    string,
    { field: string; value: string; sales: number; accountId: string | null }
  >();
  const fields = ["subgroup", "category", "menu_group"] as const;
  for (const item of items ?? []) {
    const row = Array.isArray(item.source_import_rows)
      ? item.source_import_rows[0]
      : item.source_import_rows;
    const data = (row?.normalized_data ?? {}) as Record<string, unknown>;
    for (const field of fields) {
      const value = String(data[field] ?? "").trim();
      if (!value) continue;
      const key = `${field}:${value.toLowerCase()}`;
      const mapping = (mappings ?? []).find(
        (m) =>
          m.match_field === field &&
          m.match_value.toLowerCase() === value.toLowerCase(),
      );
      const existing = groups.get(key) ?? {
        field,
        value,
        sales: 0,
        accountId: mapping?.gl_account_id ?? null,
      };
      existing.sales += Number(item.net_sales);
      groups.set(key, existing);
    }
  }
  return {
    groups: [...groups.values()].sort((a, b) => b.sales - a.sales),
    mappings: mappings ?? [],
  };
}
