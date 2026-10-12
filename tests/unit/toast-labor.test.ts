import { describe, expect, it } from "vitest";

import {
  OVERTIME_MULTIPLIER,
  laborEntryRef,
  summarizeTimeEntries,
} from "@/lib/toast/labor";

const jobs = new Map([
  ["job-bar", "Bartender"],
  ["job-back", "Barback"],
]);

describe("summarizeTimeEntries", () => {
  it("costs regular hours at the wage and overtime at time and a half", () => {
    const summary = summarizeTimeEntries(
      [
        {
          guid: "t1",
          employeeReference: { guid: "e1" },
          jobReference: { guid: "job-bar" },
          inDate: "2026-10-10T21:00:00.000+0000",
          outDate: "2026-10-11T05:30:00.000+0000",
          regularHours: 8,
          overtimeHours: 0.5,
          hourlyWage: 10,
          declaredCashTips: 120,
          nonCashTips: 310.456,
        },
        {
          guid: "t2",
          jobReference: { guid: "job-back" },
          regularHours: 6,
          overtimeHours: 0,
          hourlyWage: 16.5,
        },
      ],
      jobs,
    );

    expect(OVERTIME_MULTIPLIER).toBe(1.5);
    expect(summary.rows.map((row) => [row.job_title, row.wage_cost])).toEqual([
      ["Bartender", 87.5],
      ["Barback", 99],
    ]);
    expect(summary.regularHours).toBe(14);
    expect(summary.overtimeHours).toBe(0.5);
    expect(summary.wageCost).toBe(186.5);
    // Tips are kept for reference but are not a cost to the bar.
    expect(summary.rows[0].non_cash_tips).toBe(310.46);
  });

  it("drops deleted shifts and counts salaried (no wage) hours at no cost", () => {
    const summary = summarizeTimeEntries(
      [
        { guid: "gone", regularHours: 5, hourlyWage: 20, deleted: true },
        { guid: "gm", jobReference: { guid: "job-gm" }, regularHours: 9 },
      ],
      jobs,
    );
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({
      job_title: "",
      hourly_wage: null,
      wage_cost: 0,
    });
    expect(summary.wageCost).toBe(0);
    expect(summary.regularHours).toBe(9);
  });

  it("keys each day's P&L entry so a re-pull replaces it", () => {
    expect(laborEntryRef("2026-10-10")).toBe("toast-labor:2026-10-10");
  });
});
