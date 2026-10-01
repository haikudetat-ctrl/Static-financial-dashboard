import type { PeriodSummary } from "@/lib/reporting/types";

export type ReportRange = {
  start: string;
  end: string;
  periodId: string | null;
  status: string | null;
  label: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function formatRangeLabel(start: string, end: string) {
  const fmt = (value: string, withYear: boolean) =>
    new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });
  return `${fmt(start, false)} – ${fmt(end, true)}`;
}

/**
 * Picks the reporting range from ?period=, ?start=&end=, or else the period
 * containing today (falling back to the most recent period, then the month).
 */
export function resolveReportRange(
  params: { period?: string; start?: string; end?: string },
  periods: PeriodSummary[],
  today: string,
): ReportRange {
  const fromPeriod = (period: PeriodSummary): ReportRange => ({
    start: period.periodStart,
    end: period.periodEnd,
    periodId: period.id,
    status: period.status,
    label: formatRangeLabel(period.periodStart, period.periodEnd),
  });

  if (params.period) {
    const chosen = periods.find((period) => period.id === params.period);
    if (chosen) return fromPeriod(chosen);
  }
  if (
    params.start &&
    params.end &&
    DATE.test(params.start) &&
    DATE.test(params.end) &&
    params.start <= params.end
  ) {
    return {
      start: params.start,
      end: params.end,
      periodId: null,
      status: null,
      label: formatRangeLabel(params.start, params.end),
    };
  }
  const current =
    periods.find(
      (period) => period.periodStart <= today && today <= period.periodEnd,
    ) ?? periods[0];
  if (current) return fromPeriod(current);

  const monthStart = `${today.slice(0, 8)}01`;
  return {
    start: monthStart,
    end: today,
    periodId: null,
    status: null,
    label: formatRangeLabel(monthStart, today),
  };
}

export function rangeQuery(range: ReportRange) {
  return range.periodId
    ? `period=${range.periodId}`
    : `start=${range.start}&end=${range.end}`;
}
