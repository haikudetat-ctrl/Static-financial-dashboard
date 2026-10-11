import {
  ButtonLink,
  EmptyState,
  PageBody,
  Panel,
  StatGrid,
  StatTile,
  TableScroll,
  formatMoney,
  formatPercent,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { BUSINESS_DAY_CUTOFF_HOURS } from "@/lib/inventory/count-period";
import { amountDelta } from "@/lib/reporting/compare";
import {
  byHour,
  byWeekday,
  driverTotals,
  typicalWeek,
  type DriverRow,
  type LaborDay,
} from "@/lib/reporting/sales-drivers";

const whole = (value: number) => Math.round(value).toLocaleString("en-US");

export function SalesDriversView({
  rows,
  labor,
  priorRows,
  priorName,
}: {
  rows: DriverRow[];
  labor: LaborDay[];
  priorRows: DriverRow[];
  priorName: string;
}) {
  const totals = driverTotals(rows, labor);
  if (totals.days === 0) {
    return (
      <PageBody>
        <Panel>
          <EmptyState
            title="No Toast check detail for this range"
            detail="Sales drivers come from the checks saved with each Toast pull. Pull the range on Imports to fill it in."
            action={
              <ButtonLink href="/imports" size="sm">
                Go to Imports
              </ButtonLink>
            }
          />
        </Panel>
      </PageBody>
    );
  }
  const prior = driverTotals(priorRows);
  const weekdays = byWeekday(rows, labor);
  const week = typicalWeek(weekdays);
  const hours = byHour(rows, totals.days, BUSINESS_DAY_CUTOFF_HOURS);
  const peak = Math.max(...hours.map((hour) => hour.avgSales), 1);
  const busiest = Math.max(...weekdays.map((day) => day.avgSales), 1);
  const perDay = (value: number, days: number) => (days ? value / days : 0);

  return (
    <PageBody>
      <StatGrid>
        <StatTile
          label="Covers per day"
          value={whole(perDay(totals.guests, totals.days))}
          delta={amountDelta(
            perDay(totals.guests, totals.days),
            perDay(prior.guests, prior.days),
            { against: priorName },
          )}
          detail={`${whole(totals.guests)} guests over ${totals.days} days · ${totals.guestsPerCheck?.toFixed(1) ?? "—"} per check`}
        />
        <StatTile
          label="Spend per guest"
          value={formatMoney(totals.perGuest)}
          delta={
            totals.perGuest !== null && prior.perGuest !== null
              ? amountDelta(totals.perGuest, prior.perGuest, {
                  against: priorName,
                })
              : undefined
          }
          detail={`Average check ${formatMoney(totals.avgCheck)}`}
        />
        <StatTile
          label="Sales per labor hour"
          value={
            totals.salesPerLaborHour === null
              ? "—"
              : formatMoney(totals.salesPerLaborHour, { cents: false })
          }
          detail={
            totals.laborHours
              ? `${whole(totals.laborHours)} clocked hours · hourly wages ${formatPercent(totals.laborPct)} of sales`
              : "Pull labor from Toast on Imports to measure"
          }
        />
        <StatTile
          label="Discounts"
          value={formatPercent(totals.discountRate)}
          detail={`${formatMoney(totals.discounts, { cents: false })} off · ${totals.voided} voided ${totals.voided === 1 ? "check" : "checks"}`}
        />
      </StatGrid>

      <Panel
        title="Typical week"
        description={`Budget sales as covers × spend per guest for each weekday. A typical week here brings in ${formatMoney(week.sales, { cents: false })} from ${whole(week.guests)} covers${week.complete ? "" : " — some weekdays have no data yet"}.`}
        flush
      >
        <TableScroll>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Weekday</th>
                <th className={thNumClass}>Days</th>
                <th className={thNumClass}>Covers</th>
                <th className={thNumClass}>Spend / guest</th>
                <th className={thNumClass}>Sales</th>
                <th className={`${thClass} hidden w-40 md:table-cell`}>
                  <span className="sr-only">Sales bar</span>
                </th>
                <th className={thNumClass}>Avg check</th>
                <th className={thNumClass}>Hourly labor</th>
                <th className={thNumClass}>Sales / labor hr</th>
              </tr>
            </thead>
            <tbody>
              {weekdays.map((day) => (
                <tr
                  key={day.weekday}
                  className={day.days ? "" : "text-[var(--muted)]"}
                >
                  <td className={tdClass}>{day.weekday}</td>
                  <td className={tdNumClass}>{day.days}</td>
                  <td className={tdNumClass}>
                    {day.days ? whole(day.avgGuests) : "—"}
                  </td>
                  <td className={tdNumClass}>{formatMoney(day.perGuest)}</td>
                  <td className={`${tdNumClass} font-medium`}>
                    {day.days
                      ? formatMoney(day.avgSales, { cents: false })
                      : "—"}
                  </td>
                  <td
                    className={`${tdClass} hidden align-middle md:table-cell`}
                  >
                    <span className="block h-1.5 rounded-full bg-[var(--line)]">
                      <span
                        className="block h-full rounded-full bg-[var(--foreground)] opacity-70"
                        style={{ width: `${(day.avgSales / busiest) * 100}%` }}
                      />
                    </span>
                  </td>
                  <td className={tdNumClass}>{formatMoney(day.avgCheck)}</td>
                  <td className={tdNumClass}>{formatPercent(day.laborPct)}</td>
                  <td className={tdNumClass}>
                    {day.salesPerLaborHour === null
                      ? "—"
                      : formatMoney(day.salesPerLaborHour, { cents: false })}
                  </td>
                </tr>
              ))}
              <tr className="bg-[var(--accent-soft)] font-semibold">
                <td className={tdClass}>Typical week</td>
                <td className={tdNumClass}>{totals.days}</td>
                <td className={tdNumClass}>{whole(week.guests)}</td>
                <td className={tdNumClass}>
                  {formatMoney(week.guests ? week.sales / week.guests : null)}
                </td>
                <td className={tdNumClass}>
                  {formatMoney(week.sales, { cents: false })}
                </td>
                <td className={`${tdClass} hidden md:table-cell`} />
                <td className={tdNumClass}>{formatMoney(totals.avgCheck)}</td>
                <td className={tdNumClass}>{formatPercent(totals.laborPct)}</td>
                <td className={tdNumClass}>
                  {totals.salesPerLaborHour === null
                    ? "—"
                    : formatMoney(totals.salesPerLaborHour, { cents: false })}
                </td>
              </tr>
            </tbody>
          </table>
        </TableScroll>
        <p className="border-t px-4 py-2.5 text-xs text-[var(--muted)]">
          Hourly labor is clocked hours × wage from Toast, before salaries,
          payroll taxes and benefits. Covers and spend come from Toast checks,
          so totals can differ slightly from posted sales.
        </p>
      </Panel>

      <Panel
        title="When sales happen"
        description="Average sales per day by the hour a check opened — where staffing should follow."
        flush
      >
        <ul className="grid gap-1.5 px-4 py-4">
          {hours.map((hour) => (
            <li
              key={hour.hour}
              className="grid grid-cols-[56px_minmax(0,1fr)_88px_48px] items-center gap-3 text-xs"
            >
              <span className="font-medium tabular-nums">{hour.label}</span>
              <span className="block h-3 rounded-sm bg-[var(--line)]">
                <span
                  className={`block h-full rounded-sm ${
                    hour.avgSales === peak
                      ? "bg-[var(--accent)]"
                      : "bg-[var(--foreground)] opacity-75"
                  }`}
                  style={{ width: `${(hour.avgSales / peak) * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums">
                {formatMoney(hour.avgSales, { cents: false })}
              </span>
              <span className="text-right text-[var(--muted)] tabular-nums">
                {formatPercent(hour.share, 0)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </PageBody>
  );
}
