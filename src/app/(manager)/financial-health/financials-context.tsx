import { Badge, PageHeader, SectionTabs } from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import {
  formatPeriodLabel,
  rangeQuery,
  resolveReportRange,
  selectablePeriods,
  type ReportRange,
} from "@/lib/reporting/period-range";
import type { PeriodSummary } from "@/lib/reporting/types";
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
  // The picker offers periods that have started plus the next one, and
  // always the period being viewed.
  const pickable = selectablePeriods(periods, today);
  const viewing = periods.find((period) => period.id === range.periodId);
  if (viewing && !pickable.includes(viewing)) pickable.unshift(viewing);
  return { context, locationId, periods: pickable, range };
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
  periods: PeriodSummary[];
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
                label: formatPeriodLabel(period),
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
