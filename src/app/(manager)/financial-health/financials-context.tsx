import { Badge, PageHeader, SectionTabs } from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import {
  formatRangeLabel,
  rangeQuery,
  resolveReportRange,
  type ReportRange,
} from "@/lib/reporting/period-range";
import { getPeriods } from "@/lib/reporting/queries";

import { PeriodPicker } from "./period-picker";

export type FinancialsSearchParams = Promise<{
  period?: string;
  start?: string;
  end?: string;
}>;

/** Resolves the org, location and reporting range every Financials tab needs. */
export async function loadFinancialsContext(
  searchParams: FinancialsSearchParams,
) {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const periods = await getPeriods(context.organizationId, locationId);
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const range = resolveReportRange(await searchParams, periods, today);
  return { context, locationId, periods, range };
}

const TABS = [
  { label: "Profit & loss", path: "/financial-health" },
  { label: "Expenses", path: "/financial-health/expenses" },
  { label: "Sales categories", path: "/financial-health/sales-categories" },
  { label: "Menu profitability", path: "/financial-health/menu-profitability" },
];

export function FinancialsHeader({
  title,
  active,
  range,
  periods,
  actions,
}: {
  title: string;
  active: string;
  range: ReportRange;
  periods: Array<{ id: string; periodStart: string; periodEnd: string }>;
  actions?: React.ReactNode;
}) {
  const query = rangeQuery(range);
  const closed = range.status === "closed";
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Financials", href: "/financial-health" }]}
        title={title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {range.label}
            {range.periodId &&
              (closed ? (
                <Badge tone="good">Closed</Badge>
              ) : (
                <Badge tone="warning">Open — cost of goods is estimated</Badge>
              ))}
          </span>
        }
        actions={
          <>
            <PeriodPicker
              value={range.periodId}
              periods={periods.map((period) => ({
                id: period.id,
                label: formatRangeLabel(period.periodStart, period.periodEnd),
              }))}
            />
            {actions}
          </>
        }
      />
      <SectionTabs
        items={TABS.map((tab) => ({
          label: tab.label,
          href: `${tab.path}?${query}`,
          active: tab.path === active,
        }))}
      />
    </>
  );
}
