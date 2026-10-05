import { createClient } from "@/lib/supabase/server";

/** Days a period can be ahead of today and still take its opening count. */
export const OPENING_COUNT_LEAD_DAYS = 7;

/** Today's date at the bar (counts follow the business calendar). */
export function localToday() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

/** Hours after midnight that still belong to the previous business day. */
export const BUSINESS_DAY_CUTOFF_HOURS = 4;

/**
 * The business date at the bar: a count finished at 1 AM after Sunday's
 * close is Sunday's count. Matches locations.business_day_cutoff.
 */
export function businessToday(now = new Date()) {
  return new Date(
    now.getTime() - BUSINESS_DAY_CUTOFF_HOURS * 60 * 60 * 1000,
  ).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** How far back a count can be dated (a late-entered paper count). */
export const COUNT_DATE_MAX_AGE_DAYS = 7;

/** A count date must be a real day within the last week, not the future. */
export function isValidCountDate(date: string, today = businessToday()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) return false;
  return date <= today && date >= shiftDate(today, -COUNT_DATE_MAX_AGE_DAYS);
}

export type CountPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  fiscal_year: number | null;
  period_number: number | null;
};

/**
 * The period a new count belongs to: the open period covering today, or
 * the next one when it starts within a week (its opening count is usually
 * taken the night before it starts).
 */
export async function findCountPeriod(
  organizationId: string,
  locationId: string,
  today = localToday(),
): Promise<CountPeriod | null> {
  const supabase = await createClient();
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + OPENING_COUNT_LEAD_DAYS);
  const { data: candidates } = await supabase
    .from("inventory_periods")
    .select("id, period_start, period_end, status, fiscal_year, period_number")
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .neq("status", "closed")
    .gte("period_end", today)
    .lte("period_start", horizon.toISOString().slice(0, 10))
    .order("period_start");
  return (
    (candidates ?? []).find(
      (candidate) =>
        candidate.period_start <= today && today <= candidate.period_end,
    ) ??
    (candidates ?? [])[0] ??
    null
  );
}
