import { describe, expect, it } from "vitest";

import { amountDelta, pointsDelta } from "@/lib/reporting/compare";
import {
  comparisonRange,
  daysBetween,
  rangeProgress,
} from "@/lib/reporting/period-range";

const periods = [
  {
    id: "p10",
    periodStart: "2026-10-05",
    periodEnd: "2026-11-01",
    status: "draft",
    fiscalYear: 2026,
    periodNumber: 10,
  },
  {
    id: "p9",
    periodStart: "2026-09-07",
    periodEnd: "2026-10-04",
    status: "closed",
    fiscalYear: 2026,
    periodNumber: 9,
  },
];

describe("comparisonRange", () => {
  it("compares a whole period with the period before it", () => {
    expect(
      comparisonRange({ start: "2026-10-05", end: "2026-11-01" }, periods),
    ).toEqual({ start: "2026-09-07", end: "2026-10-04", name: "P9 FY26" });
  });

  it("compares period to date with the same days of the prior period", () => {
    expect(
      comparisonRange(
        { start: "2026-10-05", end: "2026-11-01" },
        periods,
        "2026-10-11",
      ),
    ).toEqual({ start: "2026-09-07", end: "2026-09-13", name: "P9 FY26" });
  });

  it("falls back to the same number of days just before a custom range", () => {
    expect(
      comparisonRange({ start: "2026-09-01", end: "2026-09-10" }, periods),
    ).toEqual({ start: "2026-08-22", end: "2026-08-31", name: "prior days" });
  });
});

describe("rangeProgress", () => {
  it("counts days inclusively and clamps to the range", () => {
    expect(daysBetween("2026-10-05", "2026-11-01")).toBe(28);
    const range = { start: "2026-10-05", end: "2026-11-01" };
    expect(rangeProgress(range, "2026-10-22")).toEqual({
      day: 18,
      length: 28,
      daysLeft: 10,
    });
    expect(rangeProgress(range, "2026-12-01").day).toBe(28);
  });
});

describe("deltas", () => {
  it("labels an amount change and judges it by direction", () => {
    expect(amountDelta(104.1, 100, { against: "P9 FY26" })).toEqual({
      label: "4.1% vs P9 FY26",
      trend: "up",
      good: true,
    });
    expect(amountDelta(90, 100, { higherIsBetter: false })).toEqual({
      label: "10.0%",
      trend: "down",
      good: true,
    });
    expect(amountDelta(50, 0)).toBeUndefined();
  });

  it("labels a ratio change in points", () => {
    expect(pointsDelta(0.224, 0.212, { lowerIsBetter: true })).toEqual({
      label: "1.2 pts",
      trend: "up",
      good: false,
    });
    expect(pointsDelta(0.2, 0.2)).toMatchObject({ trend: "flat" });
    expect(pointsDelta(null, 0.2)).toBeUndefined();
  });
});
