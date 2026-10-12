import type { Metadata } from "next";

import { localToday, shiftDate } from "@/lib/inventory/count-period";
import { comparisonRange } from "@/lib/reporting/period-range";
import { getLaborDays, getSalesDrivers } from "@/lib/reporting/queries";

import {
  FinancialsHeader,
  loadFinancialsContext,
  type FinancialsSearchParams,
} from "../financials-context";
import { SalesDriversView } from "./sales-drivers-view";

export const metadata: Metadata = { title: "Sales drivers" };

export default async function SalesDriversPage({
  searchParams,
}: {
  searchParams: FinancialsSearchParams;
}) {
  const loaded = await loadFinancialsContext(searchParams);
  if (!loaded) return null;
  const { locationId, periods, range } = loaded;
  // Today isn't over; measure through yesterday.
  const yesterday = shiftDate(localToday(), -1);
  const through = range.end < yesterday ? range.end : yesterday;
  const started = through >= range.start;
  const prior = comparisonRange(
    range,
    periods,
    started ? through : range.start,
  );
  const [rows, labor, priorRows] = started
    ? await Promise.all([
        getSalesDrivers(locationId, range.start, through),
        getLaborDays(locationId, range.start, through),
        getSalesDrivers(locationId, prior.start, prior.end),
      ])
    : [[], [], []];

  return (
    <>
      <FinancialsHeader
        title="Sales drivers"
        active="/financial-health/sales-drivers"
        range={range}
        periods={periods}
      />
      <SalesDriversView
        rows={rows}
        labor={labor}
        priorRows={priorRows}
        priorName={prior.name}
      />
    </>
  );
}
