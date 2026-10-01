import { createClient } from "@/lib/supabase/server";

/** Days a period can be ahead of today and still take its opening count. */
export const OPENING_COUNT_LEAD_DAYS = 7;

/** Today's date at the bar (counts follow the business calendar). */
export function localToday() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export type CountPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
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
    .select("id, period_start, period_end, status")
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
