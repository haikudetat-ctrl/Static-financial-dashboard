import type { Metadata } from "next";

import {
  Badge,
  ButtonLink,
  EmptyState,
  PageBody,
  PageHeader,
  Panel,
  TableScroll,
  buttonClass,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
  type Tone,
} from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { localToday } from "@/lib/inventory/count-period";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { formatRangeLabel, periodName } from "@/lib/reporting/period-range";
import { getPeriods } from "@/lib/reporting/queries";
import { createClient } from "@/lib/supabase/server";

import { addFiscalYearAction } from "./actions";

export const metadata: Metadata = { title: "Fiscal calendar" };

const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Not started", tone: "neutral" },
  count_in_progress: { label: "Counting", tone: "accent" },
  count_complete: { label: "Counted", tone: "warning" },
  closed: { label: "Closed", tone: "good" },
  reopened: { label: "Reopened", tone: "warning" },
};

export default async function FiscalCalendarPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const supabase = await createClient();
  const [periods, { data: calendar }] = await Promise.all([
    getPeriods(context.organizationId, locationId),
    supabase
      .from("fiscal_calendars")
      .select("pattern")
      .eq("organization_id", context.organizationId)
      .maybeSingle(),
  ]);
  const today = localToday();
  const isManager = context.role === "manager";

  const years = [
    ...new Set(
      periods
        .map((period) => period.fiscalYear)
        .filter((year): year is number => Boolean(year)),
    ),
  ].sort((a, b) => b - a);
  const nextYear = years.length ? years[0] + 1 : Number(today.slice(0, 4));
  const unscheduled = periods.filter((period) => !period.fiscalYear);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Financials", href: "/financial-health" }]}
        title="Fiscal calendar"
        description={`12 periods a year · ${calendar?.pattern ?? "4-4-5"} weeks per quarter · each year starts the first Monday of January`}
        actions={
          isManager && (
            <form action={addFiscalYearAction}>
              <input type="hidden" name="fiscal_year" value={nextYear} />
              <button type="submit" className={buttonClass("primary")}>
                Add FY{String(nextYear).slice(-2)}
              </button>
            </form>
          )
        }
      />
      <PageBody narrow>
        {years.length === 0 && unscheduled.length === 0 && (
          <Panel>
            <EmptyState
              title="No periods yet"
              detail="Add the current fiscal year to start counting and reporting."
            />
          </Panel>
        )}
        {years.map((year) => {
          const yearPeriods = periods
            .filter((period) => period.fiscalYear === year)
            .sort((a, b) => (a.periodNumber ?? 0) - (b.periodNumber ?? 0));
          return (
            <Panel
              key={year}
              title={`FY${year}`}
              description={formatRangeLabel(
                yearPeriods[0].periodStart,
                yearPeriods[yearPeriods.length - 1].periodEnd,
              )}
              flush
            >
              <TableScroll>
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Period</th>
                      <th className={thClass}>Dates</th>
                      <th className={thNumClass}>Weeks</th>
                      <th className={thClass}>Status</th>
                      <th className={thClass}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearPeriods.map((period) => {
                      const current =
                        period.periodStart <= today &&
                        today <= period.periodEnd;
                      const started = period.periodStart <= today;
                      const days =
                        (Date.parse(`${period.periodEnd}T12:00:00Z`) -
                          Date.parse(`${period.periodStart}T12:00:00Z`)) /
                          86400000 +
                        1;
                      const status = STATUS[period.status] ?? {
                        label: period.status,
                        tone: "neutral" as Tone,
                      };
                      return (
                        <tr
                          key={period.id}
                          className={current ? "bg-[#fdf5ee]" : undefined}
                        >
                          <td className={`${tdClass} font-medium`}>
                            P{period.periodNumber}
                            {current && (
                              <span className="ml-2">
                                <Badge tone="accent">Current</Badge>
                              </span>
                            )}
                          </td>
                          <td className={`${tdClass} whitespace-nowrap`}>
                            {formatRangeLabel(
                              period.periodStart,
                              period.periodEnd,
                            )}
                          </td>
                          <td className={tdNumClass}>{days / 7}</td>
                          <td className={tdClass}>
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </td>
                          <td className={`${tdClass} text-right`}>
                            {started && (
                              <ButtonLink
                                href={`/periods/${period.id}/readiness`}
                                size="sm"
                                variant="ghost"
                              >
                                {period.status === "closed" ? "View" : "Close"}
                              </ButtonLink>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </Panel>
          );
        })}
        {unscheduled.length > 0 && (
          <Panel
            title="Outside the fiscal calendar"
            description="Older periods whose dates don't match a fiscal period."
            flush
          >
            <ul>
              {unscheduled.map((period) => (
                <li
                  key={period.id}
                  className="flex items-center justify-between border-b px-4 py-2.5 text-sm last:border-b-0"
                >
                  {periodName(period) ??
                    formatRangeLabel(period.periodStart, period.periodEnd)}
                  <Badge>{STATUS[period.status]?.label ?? period.status}</Badge>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </PageBody>
    </>
  );
}
