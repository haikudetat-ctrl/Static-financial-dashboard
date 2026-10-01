import type { PeriodSummary } from "@/lib/reporting/types";

export type ReportRange = {
  start: string;
  end: string;
  periodId: string | null;
  status: string | null;
  /** "P10 FY26" when the range is a fiscal period. */
  name: string | null;
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

/** "P10 FY26", or null for a period that is not on the fiscal calendar. */
export function periodName(period: {
  fiscalYear?: number | null;
  periodNumber?: number | null;
}) {
  if (!period.fiscalYear || !period.periodNumber) return null;
  return `P${period.periodNumber} FY${String(period.fiscalYear).slice(-2)}`;
}

/** "P10 FY26 · Oct 5 – Nov 1, 2026", falling back to the dates alone. */
export function formatPeriodLabel(period: {
  periodStart: string;
  periodEnd: string;
  fiscalYear?: number | null;
  periodNumber?: number | null;
}) {
  const range = formatRangeLabel(period.periodStart, period.periodEnd);
  const name = periodName(period);
  return name ? `${name} · ${range}` : range;
}

/**
 * The period a screen should open on: the one containing today, else the
 * most recent one that has started, else the next one to start.
 */
export function currentPeriod<
  T extends { periodStart: string; periodEnd: string },
>(periods: T[], today: string): T | undefined {
  const containing = periods.find(
    (period) => period.periodStart <= today && today <= period.periodEnd,
  );
  if (containing) return containing;
  const started = periods
    .filter((period) => period.periodStart <= today)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0];
  if (started) return started;
  return [...periods].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart),
  )[0];
}

/**
 * Periods worth offering in a picker: everything that has started plus the
 * next one, newest first. Future fiscal years stay out of the list.
 */
export function selectablePeriods<
  T extends { periodStart: string; periodEnd: string },
>(periods: T[], today: string): T[] {
  const upcoming = periods
    .filter((period) => period.periodStart > today)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))[0];
  return periods
    .filter((period) => period.periodStart <= today || period === upcoming)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
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
    name: periodName(period),
    label: formatPeriodLabel(period),
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
      name: null,
      label: formatRangeLabel(params.start, params.end),
    };
  }
  const current = currentPeriod(periods, today);
  if (current) return fromPeriod(current);

  const monthStart = `${today.slice(0, 8)}01`;
  return {
    start: monthStart,
    end: today,
    periodId: null,
    status: null,
    name: null,
    label: formatRangeLabel(monthStart, today),
  };
}

export function rangeQuery(range: ReportRange) {
  return range.periodId
    ? `period=${range.periodId}`
    : `start=${range.start}&end=${range.end}`;
}
