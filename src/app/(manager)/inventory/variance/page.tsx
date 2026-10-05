import type { Metadata } from "next";

import { SectionNav } from "@/components/layout/section-nav";
import {
  ButtonLink,
  Callout,
  PageBody,
  PageHeader,
  Panel,
  StatGrid,
  StatTile,
  formatMoney,
  formatPercent,
} from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { localToday } from "@/lib/inventory/count-period";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import {
  countWindows,
  getItemVariance,
  getPostedCounts,
  pickPeriodCounts,
  salesWindow,
  type PostedCount,
} from "@/lib/inventory/variance";
import {
  formatPeriodLabel,
  formatRangeLabel,
  resolveReportRange,
  selectablePeriods,
} from "@/lib/reporting/period-range";
import { getPeriods } from "@/lib/reporting/queries";

import { PeriodPicker } from "../../financial-health/period-picker";
import { VarianceTable } from "./variance-table";

export const metadata: Metadata = { title: "Variance" };

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

export default async function VariancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const params = await searchParams;
  const today = localToday();
  const [periods, counts] = await Promise.all([
    getPeriods(context.organizationId, locationId),
    getPostedCounts(context.organizationId, locationId),
  ]);
  const range = resolveReportRange({ period: params.period }, periods, today);
  const period = periods.find((candidate) => candidate.id === range.periodId);

  // Counts: chosen explicitly, else the period's opening and closing count
  // (or its latest mid-period checkpoint while the period is running).
  const byId = new Map(counts.map((count) => [count.id, count]));
  const picked = period
    ? pickPeriodCounts(counts, period)
    : { opening: null, closing: null, checkpoints: [] };
  const latest = picked.closing ?? picked.checkpoints.at(-1) ?? null;
  const opening: PostedCount | null =
    (params.from && byId.get(params.from)) || picked.opening;
  const closing: PostedCount | null =
    (params.to && byId.get(params.to)) || latest;
  const ready = Boolean(
    opening && closing && closing.postedAt > opening.postedAt,
  );
  const windows = countWindows(picked);
  const partial = !params.to && !picked.closing && Boolean(latest);

  // Sales from the day after the opening count through the closing count.
  const sales =
    ready && opening && closing
      ? salesWindow(opening, closing)
      : { start: range.start, end: range.end };
  const salesStart = sales.start;
  const salesEnd = sales.end;

  const rows =
    ready && opening && closing
      ? await getItemVariance({
          organizationId: context.organizationId,
          locationId,
          opening,
          closing,
          salesStart,
          salesEnd,
        })
      : [];
  const countedRows = rows.filter((row) => row.counted);
  const totals = countedRows.reduce(
    (sum, row) => ({
      actual: sum.actual + row.actualValue,
      theoretical: sum.theoretical + row.theoreticalValue,
      variance: sum.variance + row.varianceValue,
    }),
    { actual: 0, theoretical: 0, variance: 0 },
  );
  const short = countedRows.filter((row) => row.varianceValue > 1).length;
  const uncosted = countedRows.filter((row) => row.unitCost === null).length;

  const countOption = (count: PostedCount) =>
    `${count.countType === "full" ? "Full" : "Spot"} count · ${dateLabel(count.countDate)}`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Inventory", href: "/inventory" }]}
        title="Variance"
        description="What you used, by count, against what you sold, by recipe"
        actions={
          <PeriodPicker
            value={range.periodId}
            periods={selectablePeriods(periods, today).map((candidate) => ({
              id: candidate.id,
              label: formatPeriodLabel(candidate),
            }))}
          />
        }
      />
      <SectionNav section="inventory" active="/inventory/variance" />
      <PageBody>
        {!ready ? (
          <Panel>
            <div className="grid gap-4 p-2">
              <div>
                <p className="text-sm font-semibold">
                  Variance needs two approved full counts
                </p>
                <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
                  The opening count sets what was on the shelf; the closing
                  count shows what&apos;s left. Usage in between, plus invoices
                  received, is compared with what Toast sales say you poured.
                </p>
              </div>
              <ul className="grid gap-2 text-sm">
                <li>
                  {opening ? "✓" : "○"} Opening count
                  <span className="ml-2 text-[var(--muted)]">
                    {opening
                      ? countOption(opening)
                      : `Not yet — take a full count before ${range.name ?? "the period"} starts`}
                  </span>
                </li>
                <li>
                  {closing ? "✓" : "○"} Closing count
                  <span className="ml-2 text-[var(--muted)]">
                    {closing
                      ? countOption(closing)
                      : `Not yet — take a full count at the end of ${range.name ?? "the period"}`}
                  </span>
                </li>
              </ul>
              <div>
                <ButtonLink href="/inventory/counts" variant="primary">
                  Go to counts
                </ButtonLink>
              </div>
            </div>
          </Panel>
        ) : (
          <>
            {windows.length > 1 || partial ? (
              <nav
                aria-label="Count windows"
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                {[
                  {
                    from: picked.opening!,
                    to: latest!,
                    label: picked.closing ? "Whole period" : "Period so far",
                  },
                  ...windows.map((window) => ({
                    ...window,
                    label: `${dateLabel(window.from.countDate)} → ${dateLabel(window.to.countDate)}`,
                  })),
                ].map((window) => {
                  const active =
                    opening!.id === window.from.id &&
                    closing!.id === window.to.id;
                  const query = new URLSearchParams({
                    ...(range.periodId ? { period: range.periodId } : {}),
                    from: window.from.id,
                    to: window.to.id,
                  });
                  return (
                    <a
                      key={`${window.from.id}:${window.to.id}`}
                      href={`/inventory/variance?${query}`}
                      aria-current={active ? "page" : undefined}
                      className={`rounded-full border px-3 py-1 ${
                        active
                          ? "border-[var(--accent)] bg-[#fdf5ee] font-medium"
                          : "hover:bg-[var(--surface)]"
                      }`}
                    >
                      {window.label}
                    </a>
                  );
                })}
              </nav>
            ) : null}
            <p className="text-sm text-[var(--muted)]">
              Shelf {dateLabel(opening!.countDate)} close →{" "}
              {dateLabel(closing!.countDate)} close · sales{" "}
              {formatRangeLabel(salesStart, salesEnd)}
              {partial ? " · closing count not taken yet" : ""}
            </p>
            {uncosted > 0 && (
              <Callout
                tone="warning"
                title={`${uncosted} item${uncosted === 1 ? " has" : "s have"} no cost`}
                action={
                  <ButtonLink href="/recipes/ingredients" size="sm">
                    Fill in costs
                  </ButtonLink>
                }
              >
                Their quantities show, but they add nothing to the dollar
                totals.
              </Callout>
            )}
            <StatGrid>
              <StatTile
                label="Actual usage"
                value={formatMoney(totals.actual, { cents: false })}
                detail="Opening + received − closing"
              />
              <StatTile
                label="Theoretical usage"
                value={formatMoney(totals.theoretical, { cents: false })}
                detail="From Toast sales and recipes"
              />
              <StatTile
                label="Variance"
                value={`${totals.variance > 0 ? "+" : ""}${formatMoney(totals.variance, { cents: false })}`}
                detail={`${formatPercent(totals.theoretical ? totals.variance / totals.theoretical : null)} over theoretical`}
                tone={totals.variance > 0 ? "danger" : "good"}
              />
              <StatTile
                label="Items short"
                value={short}
                detail="Used $1+ more than sales explain"
                tone={short > 0 ? "warning" : "good"}
              />
            </StatGrid>
            <VarianceTable rows={rows} />
          </>
        )}

        {counts.length > 1 && (
          <details className="rounded-lg border bg-[var(--surface-strong)] px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Compare two other counts
            </summary>
            <form className="mt-3 flex flex-wrap items-end gap-3">
              {range.periodId && (
                <input type="hidden" name="period" value={range.periodId} />
              )}
              {(
                [
                  ["from", "From", opening?.id],
                  ["to", "To", closing?.id],
                ] as const
              ).map(([name, label, value]) => (
                <label
                  key={name}
                  className="grid gap-1 text-xs font-medium text-[var(--muted)]"
                >
                  {label}
                  <select
                    name={name}
                    defaultValue={value ?? ""}
                    className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 text-sm text-[var(--foreground)]"
                  >
                    {counts.map((count) => (
                      <option key={count.id} value={count.id}>
                        {countOption(count)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                type="submit"
                className="h-9 rounded-md border border-[var(--line-strong)] px-3 text-sm font-medium"
              >
                Compare
              </button>
            </form>
          </details>
        )}
      </PageBody>
    </>
  );
}
