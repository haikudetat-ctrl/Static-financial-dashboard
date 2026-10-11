/*
 * What sales are made of, from saved Toast checks: covers × spend per guest,
 * by weekday and by hour. Budgeting sales as "typical covers per weekday ×
 * spend per guest" holds up better than a flat run rate, and the same
 * weekday view shows where labor is heavy for the sales it supports.
 */

/** One row of public.sales_drivers(). */
export type DriverRow = {
  grain: "day" | "hour";
  bucket: string;
  checks: number | string;
  guests: number | string;
  net_sales: number | string;
  discounts: number | string;
  voided: number | string;
};

/** Hourly labor for a business day, from toast_labor_days. */
export type LaborDay = {
  business_date: string;
  wage_cost: number | string;
  regular_hours: number | string;
  overtime_hours: number | string;
};

const n = (value: number | string | null | undefined) => Number(value ?? 0);
const ratio = (part: number, whole: number) => (whole ? part / whole : null);

export type DriverTotals = {
  days: number;
  checks: number;
  guests: number;
  netSales: number;
  discounts: number;
  voided: number;
  avgCheck: number | null;
  perGuest: number | null;
  guestsPerCheck: number | null;
  /** Discounts as a share of sales before discounts. */
  discountRate: number | null;
  laborCost: number;
  laborHours: number;
  salesPerLaborHour: number | null;
  /** Hourly wages as a share of sales, on days labor was pulled. */
  laborPct: number | null;
};

export function driverTotals(
  rows: DriverRow[],
  labor: LaborDay[] = [],
): DriverTotals {
  const days = rows.filter((row) => row.grain === "day");
  const sum = (pick: (row: DriverRow) => number) =>
    days.reduce((total, row) => total + pick(row), 0);
  const checks = sum((row) => n(row.checks));
  const guests = sum((row) => n(row.guests));
  const netSales = sum((row) => n(row.net_sales));
  const discounts = sum((row) => n(row.discounts));
  const laborDates = new Set(labor.map((day) => day.business_date));
  const salesOnLaborDays = days
    .filter((row) => laborDates.has(row.bucket))
    .reduce((total, row) => total + n(row.net_sales), 0);
  const laborCost = labor.reduce((total, day) => total + n(day.wage_cost), 0);
  const laborHours = labor.reduce(
    (total, day) => total + n(day.regular_hours) + n(day.overtime_hours),
    0,
  );
  return {
    days: days.length,
    checks,
    guests,
    netSales,
    discounts,
    voided: sum((row) => n(row.voided)),
    avgCheck: ratio(netSales, checks),
    perGuest: ratio(netSales, guests),
    guestsPerCheck: ratio(guests, checks),
    discountRate: ratio(discounts, netSales + discounts),
    laborCost,
    laborHours,
    salesPerLaborHour: ratio(salesOnLaborDays, laborHours),
    laborPct: ratio(laborCost, salesOnLaborDays),
  };
}

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const weekdayOf = (date: string) =>
  (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0

export type WeekdayDriver = {
  weekday: (typeof WEEKDAYS)[number];
  days: number;
  avgSales: number;
  avgGuests: number;
  avgCheck: number | null;
  perGuest: number | null;
  laborPct: number | null;
  salesPerLaborHour: number | null;
};

/** Average day for each weekday, Monday first. */
export function byWeekday(
  rows: DriverRow[],
  labor: LaborDay[] = [],
): WeekdayDriver[] {
  const laborByDate = new Map(labor.map((day) => [day.business_date, day]));
  return WEEKDAYS.map((weekday, index) => {
    const days = rows.filter(
      (row) => row.grain === "day" && weekdayOf(row.bucket) === index,
    );
    const totals = driverTotals(
      days,
      days.flatMap((row) => laborByDate.get(row.bucket) ?? []),
    );
    return {
      weekday,
      days: days.length,
      avgSales: days.length ? totals.netSales / days.length : 0,
      avgGuests: days.length ? totals.guests / days.length : 0,
      avgCheck: totals.avgCheck,
      perGuest: totals.perGuest,
      laborPct: totals.laborPct,
      salesPerLaborHour: totals.salesPerLaborHour,
    };
  });
}

/** Sum of each weekday's average day: what a typical week brings in. */
export function typicalWeek(weekdays: WeekdayDriver[]) {
  const seen = weekdays.filter((day) => day.days > 0);
  return {
    sales: seen.reduce((total, day) => total + day.avgSales, 0),
    guests: seen.reduce((total, day) => total + day.avgGuests, 0),
    /** Weekdays with no data yet leave the week short. */
    complete: seen.length === 7,
  };
}

export type HourDriver = {
  hour: number;
  label: string;
  avgSales: number;
  avgGuests: number;
  share: number;
};

export const hourLabel = (hour: number) =>
  `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;

/**
 * Average sales per business day for each hour a check opened, in business
 * day order (from the cutoff, so 1 AM follows 11 PM). Hours with nothing
 * open are left out.
 */
export function byHour(
  rows: DriverRow[],
  days: number,
  cutoffHour = 4,
): HourDriver[] {
  const hours = rows.filter((row) => row.grain === "hour");
  const total = hours.reduce((sum, row) => sum + n(row.net_sales), 0);
  return hours
    .map((row) => {
      const hour = Number(row.bucket);
      return {
        hour,
        label: hourLabel(hour),
        avgSales: days ? n(row.net_sales) / days : 0,
        avgGuests: days ? n(row.guests) / days : 0,
        share: total ? n(row.net_sales) / total : 0,
      };
    })
    .sort(
      (a, b) =>
        ((a.hour - cutoffHour + 24) % 24) - ((b.hour - cutoffHour + 24) % 24),
    );
}
