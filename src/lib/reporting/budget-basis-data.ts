import { localToday, shiftDate } from "@/lib/inventory/count-period";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";
import {
  basisPeriodName,
  buildBasisRows,
  defaultBasisPeriods,
  nextFiscalYearDays,
  type BasisPeriod,
} from "@/lib/reporting/budget-basis";
import { daysBetween } from "@/lib/reporting/period-range";
import { getPeriods, getProfitAndLoss } from "@/lib/reporting/queries";
import { checkCloseReadiness } from "@/lib/reporting/readiness";
import type { PeriodSummary } from "@/lib/reporting/types";

/**
 * Loads the budget basis for the chosen periods (comma-separated ids), or
 * fiscal Q4 of the latest year under way when none are chosen.
 */
export async function loadBudgetBasis(
  organizationId: string,
  preferredLocationId: string | null,
  chosenIds: string | undefined,
) {
  const locationId = await getPrimaryLocation(
    organizationId,
    preferredLocationId,
  );
  if (!locationId) return null;
  const today = localToday();
  const yesterday = shiftDate(today, -1);
  const periods = await getPeriods(organizationId, locationId);
  const started = periods
    .filter((period) => period.periodStart <= yesterday)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  const ids = new Set((chosenIds ?? "").split(",").filter(Boolean));
  const chosen = ids.size
    ? started.filter((period) => ids.has(period.id))
    : defaultBasisPeriods(periods, today);

  const supabase = await createClient();
  const basis: BasisPeriod[] = await Promise.all(
    chosen.map(async (period: PeriodSummary) => {
      const through =
        period.periodEnd < yesterday ? period.periodEnd : yesterday;
      const [pnl, salesDaysPosted, readiness] = await Promise.all([
        getProfitAndLoss(locationId, period.periodStart, through),
        supabase
          .from("sales_business_days")
          .select("id", { count: "exact", head: true })
          .eq("location_id", locationId)
          .eq("status", "posted")
          .gte("business_date", period.periodStart)
          .lte("business_date", through)
          .then((result) => result.count ?? 0),
        checkCloseReadiness(organizationId, locationId, period.id),
      ]);
      return {
        id: period.id,
        name: basisPeriodName(period),
        start: period.periodStart,
        through,
        days: daysBetween(period.periodStart, through),
        length: daysBetween(period.periodStart, period.periodEnd),
        status: period.status,
        pnl,
        salesDaysPosted,
        readiness,
      };
    }),
  );

  const year = chosen.at(-1)?.fiscalYear ?? null;
  const fiscalYear = nextFiscalYearDays(periods, year);
  return {
    periods: basis,
    // Periods offered as toggles: everything started in the basis year.
    selectable: started.filter((period) => !year || period.fiscalYear === year),
    budgetYear: year ? year + 1 : null,
    annualDays: fiscalYear.days,
    annualDaysFromCalendar: fiscalYear.fromCalendar,
    rows: buildBasisRows(basis, fiscalYear.days),
  };
}
