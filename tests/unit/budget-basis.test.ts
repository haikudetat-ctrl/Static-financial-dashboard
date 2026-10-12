import { describe, expect, it } from "vitest";

import {
  basisCsv,
  buildBasisRows,
  combineClassCosts,
  defaultBasisPeriods,
  nextFiscalYearDays,
  periodCompleteness,
  type BasisPeriod,
} from "@/lib/reporting/budget-basis";
import { buildPnlStatement, type PnlAccountRow } from "@/lib/reporting/pnl";
import type { PeriodSummary } from "@/lib/reporting/types";

const calendar = (year: number, first: string, count = 12): PeriodSummary[] => {
  const periods: PeriodSummary[] = [];
  let start = new Date(`${first}T00:00:00Z`);
  for (let number = 1; number <= count; number++) {
    // 4-4-5 weeks: every third period runs five weeks.
    const days = number % 3 === 0 ? 35 : 28;
    const end = new Date(start.getTime() + (days - 1) * 86_400_000);
    periods.push({
      id: `fy${year}p${number}`,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      status: "draft",
      fiscalYear: year,
      periodNumber: number,
    });
    start = new Date(end.getTime() + 86_400_000);
  }
  return periods;
};

const row = (
  id: string,
  type: PnlAccountRow["account_type"],
  amount: number,
  theoretical: number | null = null,
): PnlAccountRow => ({
  account_id: id,
  account_code: id,
  account_name: `Account ${id}`,
  account_type: type,
  cogs_class: type === "revenue" || type === "cogs" ? "liquor" : null,
  sort_order: 0,
  amount,
  opening_value: null,
  purchases_value: null,
  closing_value: null,
  theoretical_amount: theoretical,
});

const basisPeriod = (
  name: string,
  days: number,
  rows: PnlAccountRow[],
  overrides: Partial<BasisPeriod> = {},
): BasisPeriod => ({
  id: name,
  name,
  start: "2026-10-05",
  through: "2026-11-01",
  days,
  length: 28,
  status: "draft",
  pnl: buildPnlStatement(rows),
  salesDaysPosted: days,
  readiness: [],
  ...overrides,
});

describe("defaultBasisPeriods", () => {
  const fy26 = calendar(2026, "2025-12-29");

  it("picks the fiscal Q4 periods that have started", () => {
    expect(
      defaultBasisPeriods(fy26, "2026-11-10").map((p) => p.periodNumber),
    ).toEqual([10, 11]);
  });

  it("falls back to the two latest periods before Q4 starts", () => {
    expect(
      defaultBasisPeriods(fy26, "2026-08-01").map((p) => p.periodNumber),
    ).toEqual([7, 8]);
  });
});

describe("nextFiscalYearDays", () => {
  it("uses the next year's calendar, else this year's, else 364", () => {
    const fy26 = calendar(2026, "2025-12-29");
    const fy27 = calendar(2027, "2026-12-28");
    expect(nextFiscalYearDays([...fy26, ...fy27], 2026)).toEqual({
      days: 364,
      fromCalendar: true,
    });
    expect(nextFiscalYearDays(fy26.slice(0, 6), 2026)).toEqual({
      days: 364,
      fromCalendar: false,
    });
  });
});

describe("buildBasisRows", () => {
  const p10 = basisPeriod("P10", 28, [
    row("4000", "revenue", 28_000),
    row("5000", "cogs", 5_600, 5_000),
    row("6000", "labor", 9_800),
  ]);
  const p11 = basisPeriod("P11", 14, [
    row("4000", "revenue", 16_800),
    row("5000", "cogs", 3_000, 2_800),
    row("6000", "labor", 4_900),
    row("7000", "operating_expense", 2_100),
  ]);

  it("turns each account into per-period amounts, a daily rate and a run rate", () => {
    const rows = buildBasisRows([p10, p11], 364);
    const sales = rows.find((r) => r.key === "sales")!;
    expect(sales.amounts).toEqual([28_000, 16_800]);
    expect(sales.perDay).toBeCloseTo(44_800 / 42);
    expect(sales.annual).toBeCloseTo((44_800 / 42) * 364);
    expect(sales.pctOfSales).toBe(1);

    // An account used in only one period still shows, with zero elsewhere.
    const rent = rows.find((r) => r.key === "7000")!;
    expect(rent.amounts).toEqual([0, 2_100]);
    expect(rows.find((r) => r.key === "primeCost")!.amounts).toEqual([
      15_400, 7_900,
    ]);
  });

  it("exports the same rows as CSV with section headings", () => {
    const csv = basisCsv([p10, p11], buildBasisRows([p10, p11], 364), 364);
    const [header, firstSection, firstLine] = csv.split("\n");
    expect(header).toBe(
      "Account,P10 (28 days),P11 (14 days),Per day,Run rate (364 days),% of sales",
    );
    expect(firstSection).toBe("Sales");
    expect(firstLine).toBe(
      "4000 Account 4000,28000.00,16800.00,1066.67,388266.67,100.0",
    );
  });

  it("combines class costs across periods", () => {
    const [liquor] = combineClassCosts([p10, p11]);
    expect(liquor.sales).toBe(44_800);
    expect(liquor.costPct).toBeCloseTo(8_600 / 44_800);
    expect(liquor.theoreticalPct).toBeCloseTo(7_800 / 44_800);
  });
});

describe("periodCompleteness", () => {
  it("flags missing sales days, labor, expenses and an unapproved closing count", () => {
    const period = basisPeriod("P10", 20, [row("4000", "revenue", 1_000)], {
      salesDaysPosted: 18,
      readiness: [
        {
          label: "Closing inventory count approved",
          pass: false,
          severity: "blocking",
          detail: "No closing count yet",
        },
        {
          label: "All invoices approved",
          pass: true,
          severity: "blocking",
          detail: "All approved",
        },
      ],
    });
    const open = periodCompleteness(period)
      .filter((check) => !check.ok)
      .map((check) => `${check.label}: ${check.detail}`);
    expect(open).toEqual([
      "Sales posted every day: 18 of 20 days posted",
      "Closing count approved: No closing count yet",
      "Labor entered: No labor recorded for this period",
      "Operating expenses entered: No operating expenses recorded",
      "Sold items mapped to recipes: Theoretical cost is incomplete",
    ]);
  });
});

describe("buildBasisRows sections", () => {
  it("skips a section heading when the section has no lines", () => {
    const period = basisPeriod("P10", 28, [row("4000", "revenue", 1_000)]);
    const sections = buildBasisRows([period], 364)
      .filter((r) => r.kind === "section")
      .map((r) => r.label);
    expect(sections).toEqual(["Sales"]);
  });
});
