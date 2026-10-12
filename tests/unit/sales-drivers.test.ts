import { describe, expect, it } from "vitest";

import {
  byHour,
  byWeekday,
  driverTotals,
  hourLabel,
  typicalWeek,
  type DriverRow,
} from "@/lib/reporting/sales-drivers";

const day = (
  date: string,
  checks: number,
  guests: number,
  sales: number,
  discounts = 0,
  voided = 0,
): DriverRow => ({
  grain: "day",
  bucket: date,
  checks,
  guests,
  net_sales: String(sales),
  discounts: String(discounts),
  voided,
});
const hour = (h: number, sales: number, guests = 10): DriverRow => ({
  grain: "hour",
  bucket: String(h),
  checks: 5,
  guests,
  net_sales: sales,
  discounts: 0,
  voided: 0,
});

// Fri Oct 9 and Sat Oct 10 2026, and the next Friday.
const rows = [
  day("2026-10-09", 100, 250, 6000, 40, 1),
  day("2026-10-10", 120, 300, 7200, 60),
  day("2026-10-16", 110, 270, 6600),
  hour(17, 4000),
  hour(0, 1000),
  hour(20, 8000),
  hour(23, 6800),
];
const labor = [
  {
    business_date: "2026-10-09",
    wage_cost: "900",
    regular_hours: "60",
    overtime_hours: "0",
  },
];

describe("driverTotals", () => {
  it("derives check average, spend per guest and labor productivity", () => {
    const totals = driverTotals(rows, labor);
    expect(totals).toMatchObject({
      days: 3,
      checks: 330,
      guests: 820,
      netSales: 19_800,
      voided: 1,
      laborHours: 60,
      laborCost: 900,
    });
    expect(totals.avgCheck).toBeCloseTo(60);
    expect(totals.perGuest).toBeCloseTo(19_800 / 820);
    expect(totals.discountRate).toBeCloseTo(100 / 19_900);
    // Labor measures only against the days it was pulled for.
    expect(totals.salesPerLaborHour).toBe(100);
    expect(totals.laborPct).toBe(0.15);
  });
});

describe("byWeekday", () => {
  it("averages each weekday across the days it occurred, Monday first", () => {
    const weekdays = byWeekday(rows, labor);
    expect(weekdays[0].weekday).toBe("Monday");
    const friday = weekdays[4];
    expect(friday).toMatchObject({
      weekday: "Friday",
      days: 2,
      avgSales: 6300,
    });
    expect(friday.avgGuests).toBe(260);
    expect(friday.salesPerLaborHour).toBe(100);
    expect(weekdays[5]).toMatchObject({ weekday: "Saturday", days: 1 });
    expect(weekdays[0]).toMatchObject({ days: 0, avgSales: 0 });

    const week = typicalWeek(weekdays);
    expect(week.sales).toBe(6300 + 7200);
    expect(week.complete).toBe(false);
  });
});

describe("byHour", () => {
  it("orders hours by the business day, so after-midnight follows the evening", () => {
    const hours = byHour(rows, 2, 4);
    expect(hours.map((h) => h.label)).toEqual([
      "5 PM",
      "8 PM",
      "11 PM",
      "12 AM",
    ]);
    expect(hours[1].avgSales).toBe(4000);
    expect(hours[1].share).toBeCloseTo(8000 / 19_800);
    expect(hourLabel(12)).toBe("12 PM");
  });
});
