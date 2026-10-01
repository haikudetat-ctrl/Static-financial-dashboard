import { describe, expect, it } from "vitest";

import {
  formatPeriodLabel,
  resolveReportRange,
  selectablePeriods,
} from "@/lib/reporting/period-range";

const periods = [
  {
    id: "p11",
    periodStart: "2026-11-02",
    periodEnd: "2026-11-29",
    status: "draft",
    fiscalYear: 2026,
    periodNumber: 11,
  },
  {
    id: "p10",
    periodStart: "2026-10-05",
    periodEnd: "2026-11-01",
    status: "draft",
    fiscalYear: 2026,
    periodNumber: 10,
  },
];

describe("resolveReportRange", () => {
  it("defaults to the period containing today", () => {
    expect(resolveReportRange({}, periods, "2026-10-20").periodId).toBe("p10");
  });

  it("honours an explicit period", () => {
    expect(
      resolveReportRange({ period: "p11" }, periods, "2026-10-20").start,
    ).toBe("2026-11-02");
  });

  it("accepts a custom date range and rejects a reversed one", () => {
    const custom = resolveReportRange(
      { start: "2026-10-01", end: "2026-10-31" },
      periods,
      "2026-10-20",
    );
    expect(custom).toMatchObject({ periodId: null, start: "2026-10-01" });
    expect(
      resolveReportRange(
        { start: "2026-10-31", end: "2026-10-01" },
        periods,
        "2026-10-20",
      ).periodId,
    ).toBe("p10");
  });

  it("falls back to month to date with no periods", () => {
    expect(resolveReportRange({}, [], "2026-09-30")).toMatchObject({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });

  it("opens on the next period before the first one starts", () => {
    expect(resolveReportRange({}, periods, "2026-10-01").periodId).toBe("p10");
  });

  it("opens on the latest started period, not a future one", () => {
    expect(resolveReportRange({}, periods, "2026-12-15").periodId).toBe("p11");
  });

  it("names fiscal periods", () => {
    expect(formatPeriodLabel(periods[1])).toBe(
      "P10 FY26 · Oct 5 – Nov 1, 2026",
    );
  });

  it("offers started periods plus the next one", () => {
    expect(
      selectablePeriods(periods, "2026-10-01").map((period) => period.id),
    ).toEqual(["p10"]);
    expect(
      selectablePeriods(periods, "2026-10-20").map((period) => period.id),
    ).toEqual(["p11", "p10"]);
  });
});
