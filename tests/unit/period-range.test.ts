import { describe, expect, it } from "vitest";

import { resolveReportRange } from "@/lib/reporting/period-range";

const periods = [
  {
    id: "p11",
    periodStart: "2026-11-02",
    periodEnd: "2026-11-29",
    status: "draft",
  },
  {
    id: "p10",
    periodStart: "2026-10-05",
    periodEnd: "2026-11-01",
    status: "draft",
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
});
