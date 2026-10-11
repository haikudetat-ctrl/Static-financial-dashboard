import Link from "next/link";

import { Badge, PageHeader, SectionTabs } from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { localToday } from "@/lib/inventory/count-period";
import { sectionNavigation } from "@/lib/navigation";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import {
  formatPeriodLabel,
  periodName,
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

const TABS = sectionNavigation.financials;

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
            <PeriodSwitcher active={active} range={range} periods={periods} />
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
          href: `${tab.href}?${query}`,
          active: tab.href === active,
        }))}
      />
    </>
  );
}

/** One-click switch between the latest periods; the picker covers the rest. */
function PeriodSwitcher({
  active,
  range,
  periods,
}: {
  active: string;
  range: ReportRange;
  periods: PeriodSummary[];
}) {
  const today = localToday();
  const recent = periods
    .filter((period) => period.periodStart <= today)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
    .slice(0, 3)
    .reverse();
  if (recent.length < 2) return null;
  return (
    <nav
      aria-label="Recent periods"
      className="flex rounded-lg bg-[var(--sidebar)] p-[3px]"
    >
      {recent.map((period) => {
        const current = period.id === range.periodId;
        return (
          <Link
            key={period.id}
            href={`${active}?period=${period.id}`}
            aria-current={current ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition ${
              current
                ? "bg-[var(--surface-strong)] font-medium shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {periodName(period) ?? formatPeriodLabel(period)}
            {period.status !== "closed" &&
              period.periodEnd >= today &&
              " · open"}
          </Link>
        );
      })}
    </nav>
  );
}
