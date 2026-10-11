import { daysBetween, periodName } from "@/lib/reporting/period-range";
import type { ClassCost, PnlLine, PnlStatement } from "@/lib/reporting/pnl";
import type { PeriodSummary, ReadinessCheck } from "@/lib/reporting/types";

/*
 * There is no budget yet. The fiscal fourth quarter (P10–P12) is the first
 * stretch of clean, fully-counted actuals, so its periods are the basis for
 * next year's budget: every account per period, as a daily rate, and as a
 * naive run rate across a fiscal year (before any seasonality is applied).
 */

export const BASIS_FIRST_PERIOD = 10;

/** Days in a fiscal year when the calendar does not say (13 × 28 or 12 × 4-4-5 weeks). */
export const DEFAULT_FISCAL_YEAR_DAYS = 364;

export type BasisPeriod = {
  id: string;
  name: string;
  start: string;
  /** Last day included: the period end, or yesterday while it is in progress. */
  through: string;
  /** Days covered so far, and the period's full length. */
  days: number;
  length: number;
  status: string;
  pnl: PnlStatement;
  salesDaysPosted: number;
  readiness: ReadinessCheck[];
};

export type Completeness = { label: string; ok: boolean; detail: string };

export type BasisRow = {
  key: string;
  label: string;
  kind: "section" | "line" | "total" | "strong";
  /** One amount per basis period, in the same order. */
  amounts: number[];
  perDay: number;
  annual: number;
  pctOfSales: number | null;
};

/** Which periods to start from: fiscal Q4 of the latest year under way. */
export function defaultBasisPeriods(periods: PeriodSummary[], today: string) {
  const started = periods.filter((period) => period.periodStart < today);
  const latestYear = Math.max(
    ...started.map((period) => period.fiscalYear ?? 0),
  );
  const fourthQuarter = started.filter(
    (period) =>
      period.fiscalYear === latestYear &&
      (period.periodNumber ?? 0) >= BASIS_FIRST_PERIOD,
  );
  const chosen =
    fourthQuarter.length > 0
      ? fourthQuarter
      : [...started]
          .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
          .slice(0, 2);
  return chosen.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

/** Days in the fiscal year after `fiscalYear`, from the calendar when it exists. */
export function nextFiscalYearDays(
  periods: PeriodSummary[],
  fiscalYear: number | null | undefined,
) {
  const lengthOf = (year: number) =>
    periods
      .filter((period) => period.fiscalYear === year)
      .reduce(
        (total, period) =>
          total + daysBetween(period.periodStart, period.periodEnd),
        0,
      );
  if (!fiscalYear)
    return { days: DEFAULT_FISCAL_YEAR_DAYS, fromCalendar: false };
  const next = lengthOf(fiscalYear + 1);
  if (next >= 350) return { days: next, fromCalendar: true };
  const current = lengthOf(fiscalYear);
  if (current >= 350) return { days: current, fromCalendar: true };
  return { days: DEFAULT_FISCAL_YEAR_DAYS, fromCalendar: false };
}

export function basisPeriodName(period: PeriodSummary) {
  return periodName(period) ?? period.periodStart;
}

const check = (period: BasisPeriod, label: string) =>
  period.readiness.find((item) => item.label === label);

/** Whether a period's numbers are complete enough to budget from. */
export function periodCompleteness(period: BasisPeriod): Completeness[] {
  const closed = period.status === "closed";
  const closing = check(period, "Closing inventory count approved");
  const invoices = check(period, "All invoices approved");
  const recipes = check(period, "All sold items mapped to recipes");
  const fromCheck = (item: ReadinessCheck | undefined, fallback: string) => ({
    ok: closed || (item?.pass ?? false),
    detail: closed ? "Period closed" : (item?.detail ?? fallback),
  });
  return [
    {
      label: "Sales posted every day",
      ok: period.days > 0 && period.salesDaysPosted >= period.days,
      detail: `${period.salesDaysPosted} of ${period.days} days posted`,
    },
    {
      label: "Closing count approved",
      ...fromCheck(closing, "Cost of goods is estimated until it posts"),
    },
    {
      label: "Invoices approved",
      ...fromCheck(invoices, "Purchases may be understated"),
    },
    {
      label: "Labor entered",
      ok: period.pnl.totals.labor > 0,
      detail:
        period.pnl.totals.labor > 0
          ? "Labor is on the P&L"
          : "No labor recorded for this period",
    },
    {
      label: "Operating expenses entered",
      ok: period.pnl.totals.operatingExpenses > 0,
      detail:
        period.pnl.totals.operatingExpenses > 0
          ? "Expenses are on the P&L"
          : "No operating expenses recorded",
    },
    {
      label: "Sold items mapped to recipes",
      ...fromCheck(recipes, "Theoretical cost is incomplete"),
    },
  ];
}

/** Statement rows with an amount per period, a daily rate and a run rate. */
export function buildBasisRows(
  periods: BasisPeriod[],
  annualDays: number,
): BasisRow[] {
  const totalDays = periods.reduce((total, period) => total + period.days, 0);
  const totalSales = periods.reduce(
    (total, period) => total + period.pnl.totals.sales,
    0,
  );
  const rows: BasisRow[] = [];
  const push = (
    key: string,
    label: string,
    kind: BasisRow["kind"],
    amounts: number[],
  ) => {
    const sum = amounts.reduce((total, amount) => total + amount, 0);
    const perDay = totalDays ? sum / totalDays : 0;
    rows.push({
      key,
      label,
      kind,
      amounts,
      perDay,
      annual: perDay * annualDays,
      pctOfSales: totalSales ? sum / totalSales : null,
    });
  };
  const section = (title: string, pick: (pnl: PnlStatement) => PnlLine[]) => {
    const heading = rows.length;
    // Accounts in first-seen order, so a line used in only one period shows.
    const accounts = new Map<string, string>();
    for (const period of periods) {
      for (const line of pick(period.pnl)) {
        if (!accounts.has(line.accountId)) {
          accounts.set(line.accountId, `${line.code} ${line.name}`);
        }
      }
    }
    for (const [accountId, label] of accounts) {
      const amounts = periods.map(
        (period) =>
          pick(period.pnl).find((line) => line.accountId === accountId)
            ?.amount ?? 0,
      );
      if (amounts.some((amount) => amount !== 0)) {
        push(accountId, label, "line", amounts);
      }
    }
    // Headings only for sections with something under them.
    if (rows.length > heading) {
      rows.splice(heading, 0, {
        key: `section:${title}`,
        label: title,
        kind: "section",
        amounts: [],
        perDay: 0,
        annual: 0,
        pctOfSales: null,
      });
    }
  };
  const total = (
    key: keyof PnlStatement["totals"],
    label: string,
    kind: BasisRow["kind"] = "total",
  ) =>
    push(
      key,
      label,
      kind,
      periods.map((period) => period.pnl.totals[key]),
    );

  section("Sales", (pnl) => pnl.revenue);
  total("sales", "Net sales");
  section("Cost of goods sold", (pnl) => pnl.cogs);
  total("cogs", "Total cost of goods");
  total("grossProfit", "Gross profit", "strong");
  section("Labor", (pnl) => pnl.labor);
  total("labor", "Total labor");
  total("primeCost", "Prime cost");
  section("Operating expenses", (pnl) => pnl.operatingExpenses);
  total("operatingExpenses", "Total operating expenses");
  total("operatingIncome", "Operating income", "strong");
  section("Other income and expense", (pnl) => [
    ...pnl.otherIncome,
    ...pnl.otherExpense,
  ]);
  total("netIncome", "Net income", "strong");
  return rows;
}

const csvCell = (value: string | number) => {
  const text = typeof value === "number" ? value.toFixed(2) : value;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The basis as a spreadsheet: one column per period, then the rates. */
export function basisCsv(
  periods: BasisPeriod[],
  rows: BasisRow[],
  annualDays: number,
) {
  const header = [
    "Account",
    ...periods.map((period) => `${period.name} (${period.days} days)`),
    "Per day",
    `Run rate (${annualDays} days)`,
    "% of sales",
  ];
  const lines = rows.map((row) =>
    row.kind === "section"
      ? [row.label]
      : [
          row.label,
          ...row.amounts,
          row.perDay,
          row.annual,
          row.pctOfSales === null ? "" : (row.pctOfSales * 100).toFixed(1),
        ],
  );
  return [header, ...lines]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
}

/** Class costs summed across the basis periods, with percentages redone. */
export function combineClassCosts(periods: BasisPeriod[]): ClassCost[] {
  const byClass = new Map<string, ClassCost>();
  for (const period of periods) {
    for (const row of period.pnl.classCosts) {
      const seen = byClass.get(row.cogsClass);
      if (!seen) {
        byClass.set(row.cogsClass, { ...row });
        continue;
      }
      seen.sales += row.sales;
      seen.cost += row.cost;
      seen.theoreticalCost =
        seen.theoreticalCost === null && row.theoreticalCost === null
          ? null
          : (seen.theoreticalCost ?? 0) + (row.theoreticalCost ?? 0);
      seen.opening += row.opening;
      seen.purchases += row.purchases;
      seen.closing += row.closing;
    }
  }
  return [...byClass.values()].map((row) => ({
    ...row,
    costPct: row.sales ? row.cost / row.sales : null,
    theoreticalPct:
      row.sales && row.theoreticalCost !== null
        ? row.theoreticalCost / row.sales
        : null,
  }));
}
