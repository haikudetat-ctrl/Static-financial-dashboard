import type { Metadata } from "next";

import { SalesDollarBar } from "@/components/charts";
import {
  ButtonLink,
  DeltaText,
  Callout,
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
  type Delta,
} from "@/components/ui";
import { amountDelta, pointsDelta } from "@/lib/reporting/compare";
import { localToday } from "@/lib/inventory/count-period";
import {
  comparisonRange,
  formatRangeLabel,
  periodToDate,
  rangeQuery,
} from "@/lib/reporting/period-range";
import { checkCloseReadiness } from "@/lib/reporting/readiness";
import type { PnlLine, PnlStatement } from "@/lib/reporting/pnl";
import {
  getLastPostedSalesDay,
  getProfitAndLoss,
} from "@/lib/reporting/queries";

import {
  FinancialsHeader,
  loadFinancialsContext,
  type FinancialsSearchParams,
} from "./financials-context";

export const metadata: Metadata = { title: "Profit & loss" };

export default async function ProfitAndLossPage({
  searchParams,
}: {
  searchParams: FinancialsSearchParams;
}) {
  const loaded = await loadFinancialsContext(searchParams);
  if (!loaded) return null;
  const { context, locationId, periods, range } = loaded;
  // An open period reads to date (through the last complete day) and is
  // compared with the same number of days at the start of the prior period.
  const toDate = periodToDate(
    range,
    localToday(),
    await getLastPostedSalesDay(locationId),
  );
  const through = toDate.through ?? range.start;
  const prior = comparisonRange(range, periods, through);
  const priorLabel = toDate.inProgress ? `${prior.name} same days` : prior.name;
  const comparedWith = toDate.inProgress
    ? `${range.name ?? "Range"} to date (${formatRangeLabel(range.start, through)}) compared with the same days of ${prior.name} (${formatRangeLabel(prior.start, prior.end)})`
    : `Compared with ${prior.name} (${formatRangeLabel(prior.start, prior.end)})`;
  const [pnl, priorPnl, readiness] = await Promise.all([
    getProfitAndLoss(locationId, range.start, through),
    getProfitAndLoss(locationId, prior.start, prior.end),
    range.periodId && range.status !== "closed"
      ? checkCloseReadiness(context.organizationId!, locationId, range.periodId)
      : Promise.resolve(null),
  ]);
  const query = rangeQuery(range);
  const { totals, pct } = pnl;
  const theoreticalPct = totals.sales
    ? totals.theoreticalCogs / totals.sales
    : null;
  const hasSales = totals.sales !== 0;
  const hasInventory = pnl.classCosts.some(
    (c) => c.opening || c.purchases || c.closing,
  );

  return (
    <>
      <FinancialsHeader
        title="Profit & loss"
        active="/financial-health"
        range={range}
        periods={periods}
        actions={
          <>
            <ButtonLink href={`/financial-health/expenses?${query}`}>
              Add expense
            </ButtonLink>
            {range.periodId && (
              <ButtonLink
                href={`/periods/${range.periodId}/readiness`}
                variant="primary"
              >
                {range.status === "closed"
                  ? "View close"
                  : readiness
                    ? `Close period · ${readiness.filter((check) => check.pass).length}/${readiness.length}`
                    : "Close period"}
              </ButtonLink>
            )}
          </>
        }
      />
      <PageBody>
        {!hasSales && (
          <Callout
            tone="neutral"
            title="No sales posted for this range yet"
            action={
              <ButtonLink href="/imports" size="sm">
                Upload Toast sales
              </ButtonLink>
            }
          >
            Upload each night&apos;s Toast export and post it to fill in
            revenue.
          </Callout>
        )}
        {pnl.unclassifiedSales > 0 && (
          <Callout
            tone="warning"
            title={`${formatMoney(pnl.unclassifiedSales)} of sales is unclassified`}
            action={
              <ButtonLink
                href={`/financial-health/sales-categories?${query}`}
                size="sm"
              >
                Classify sales
              </ButtonLink>
            }
          >
            Assign the Toast categories to an account so cost percentages by
            class are accurate.
          </Callout>
        )}
        {!hasInventory && (
          <Callout tone="neutral" title="No inventory movements in this range">
            Cost of goods fills in once the opening count posts and invoices are
            received.
          </Callout>
        )}

        <StatGrid>
          <StatTile
            label="Net sales"
            value={formatMoney(totals.sales)}
            delta={amountDelta(totals.sales, priorPnl.totals.sales, {
              against: priorLabel,
            })}
          />
          <StatTile
            label="Cost of goods"
            value={formatPercent(pct.cogs)}
            tone={
              pct.cogs === null || !theoreticalPct
                ? "neutral"
                : pct.cogs - theoreticalPct > 0.005
                  ? "warning"
                  : "good"
            }
            delta={pointsDelta(pct.cogs, priorPnl.pct.cogs, {
              lowerIsBetter: true,
            })}
            meter={
              pct.cogs !== null
                ? { value: pct.cogs, marker: theoreticalPct, max: 0.4 }
                : undefined
            }
            detail={`${formatMoney(totals.cogs)} · recipes say ${formatPercent(theoreticalPct)}`}
          />
          <StatTile
            label="Prime cost"
            value={formatPercent(pct.primeCost)}
            delta={pointsDelta(pct.primeCost, priorPnl.pct.primeCost, {
              lowerIsBetter: true,
            })}
            detail={`${formatMoney(totals.primeCost)} · labor ${formatPercent(pct.labor)}`}
          />
          <StatTile
            label="Net income"
            value={formatMoney(totals.netIncome)}
            delta={amountDelta(totals.netIncome, priorPnl.totals.netIncome, {
              against: priorLabel,
            })}
            detail={`${formatPercent(pct.netIncome)} of sales`}
            tone={totals.netIncome < 0 ? "danger" : "neutral"}
          />
        </StatGrid>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Panel title="Statement" description={comparedWith} flush>
            <Statement pnl={pnl} prior={priorPnl} priorName={prior.name} />
          </Panel>
          <div className="grid content-start gap-5">
            {hasSales && (
              <Panel
                title="Where each sales dollar went"
                description="Cents per $1 of net sales"
                flush
              >
                <SalesDollarBar
                  parts={[
                    {
                      label: "Cost of goods",
                      value: pct.cogs ?? 0,
                      className: "bg-[var(--warning)]",
                    },
                    {
                      label: "Labor",
                      value: pct.labor ?? 0,
                      className: "bg-[var(--foreground)]",
                    },
                    {
                      label: "Operating expenses",
                      value: totals.operatingExpenses / totals.sales,
                      className: "bg-[var(--line-strong)]",
                    },
                    {
                      label: "Other, net",
                      value: -totals.otherNet / totals.sales,
                      className: "bg-[var(--muted)]",
                    },
                    {
                      label: "Net income",
                      value: pct.netIncome ?? 0,
                      className: "bg-[var(--success)]",
                    },
                  ]}
                />
              </Panel>
            )}
            <Panel
              title="Cost of goods by class"
              description="Actual cost from inventory against theoretical cost from recipes."
              flush
            >
              <TableScroll>
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Class</th>
                      <th className={thNumClass}>Sales</th>
                      <th className={thNumClass}>Actual</th>
                      <th className={thNumClass}>Theoretical</th>
                      <th className={thNumClass}>Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnl.classCosts.map((c) => {
                      const gap =
                        c.costPct !== null && c.theoreticalPct !== null
                          ? c.costPct - c.theoreticalPct
                          : null;
                      return (
                        <tr key={c.cogsClass}>
                          <td className={tdClass}>{c.label}</td>
                          <td className={tdNumClass}>
                            {formatMoney(c.sales, { cents: false })}
                          </td>
                          <td className={tdNumClass}>
                            {formatPercent(c.costPct)}
                          </td>
                          <td className={tdNumClass}>
                            {formatPercent(c.theoreticalPct)}
                          </td>
                          <td
                            className={`${tdNumClass} ${
                              gap !== null && gap > 0.02
                                ? "font-semibold text-[var(--danger)]"
                                : ""
                            }`}
                          >
                            {gap === null
                              ? "—"
                              : `${gap > 0 ? "+" : ""}${(gap * 100).toFixed(1)} pts`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </Panel>
            <Panel
              title="Inventory bridge"
              description="Opening + purchases − closing = cost of goods."
              flush
            >
              <TableScroll>
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Class</th>
                      <th className={thNumClass}>Opening</th>
                      <th className={thNumClass}>Purchases</th>
                      <th className={thNumClass}>Closing</th>
                      <th className={thNumClass}>COGS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnl.classCosts.map((c) => (
                      <tr key={c.cogsClass}>
                        <td className={tdClass}>{c.label}</td>
                        <td className={tdNumClass}>
                          {formatMoney(c.opening, { cents: false })}
                        </td>
                        <td className={tdNumClass}>
                          {formatMoney(c.purchases, { cents: false })}
                        </td>
                        <td className={tdNumClass}>
                          {formatMoney(c.closing, { cents: false })}
                        </td>
                        <td className={`${tdNumClass} font-medium`}>
                          {formatMoney(c.cost, { cents: false })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  );
}

type Compare = {
  /** Prior amounts by account. */
  amounts: Map<string, number>;
};

const thBarClass = `${thClass} hidden w-28 lg:table-cell`;
const tdBarClass = `${tdClass} hidden w-28 align-middle lg:table-cell`;

/** Share-of-sales bar so outliers stand out without reading every number. */
function PctBar({ pct, strong }: { pct: number | null; strong?: boolean }) {
  if (pct === null || pct <= 0) return null;
  return (
    <span className="block h-1.5 rounded-full bg-[var(--line)]">
      <span
        className={`block h-full rounded-full ${strong ? "bg-[var(--accent)]" : "bg-[var(--foreground)] opacity-70"}`}
        style={{ width: `${Math.min(pct, 1) * 100}%` }}
      />
    </span>
  );
}

/** Revenue and income rising is good; every cost rising is not. */
const higherIsBetter = (line: PnlLine) =>
  line.type === "revenue" || line.type === "other_income";

function Statement({
  pnl,
  prior,
  priorName,
}: {
  pnl: PnlStatement;
  prior: PnlStatement;
  priorName: string;
}) {
  const { totals, pct } = pnl;
  const compare: Compare = {
    amounts: new Map(
      [
        ...prior.revenue,
        ...prior.cogs,
        ...prior.labor,
        ...prior.operatingExpenses,
        ...prior.otherIncome,
        ...prior.otherExpense,
      ].map((line) => [line.accountId, line.amount]),
    ),
  };
  return (
    <TableScroll>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Account</th>
            <th className={thNumClass}>Amount</th>
            <th className={thNumClass}>% of sales</th>
            <th className={thNumClass}>vs {priorName}</th>
            <th className={thBarClass}>
              <span className="sr-only">Share of sales</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <Section title="Sales" lines={pnl.revenue} compare={compare} />
          <Total
            label="Net sales"
            amount={totals.sales}
            pct={1}
            delta={amountDelta(totals.sales, prior.totals.sales)}
          />
          <Section
            title="Cost of goods sold"
            lines={pnl.cogs}
            compare={compare}
          />
          <Total
            label="Total cost of goods"
            amount={totals.cogs}
            pct={pct.cogs}
            delta={pointsDelta(pct.cogs, prior.pct.cogs, {
              lowerIsBetter: true,
            })}
          />
          <Total
            label="Gross profit"
            amount={totals.grossProfit}
            pct={pct.grossMargin}
            delta={pointsDelta(pct.grossMargin, prior.pct.grossMargin)}
            strong
          />
          <Section title="Labor" lines={pnl.labor} compare={compare} />
          <Total
            label="Total labor"
            amount={totals.labor}
            pct={pct.labor}
            delta={pointsDelta(pct.labor, prior.pct.labor, {
              lowerIsBetter: true,
            })}
          />
          <Total
            label="Prime cost"
            amount={totals.primeCost}
            pct={pct.primeCost}
            delta={pointsDelta(pct.primeCost, prior.pct.primeCost, {
              lowerIsBetter: true,
            })}
            muted
          />
          <Section
            title="Operating expenses"
            lines={pnl.operatingExpenses}
            compare={compare}
          />
          <Total
            label="Operating income"
            amount={totals.operatingIncome}
            pct={pct.operatingIncome}
            delta={pointsDelta(pct.operatingIncome, prior.pct.operatingIncome)}
            strong
          />
          <Section
            title="Other income and expense"
            lines={[...pnl.otherIncome, ...pnl.otherExpense]}
            compare={compare}
          />
          <Total
            label="Net income"
            amount={totals.netIncome}
            pct={pct.netIncome}
            delta={pointsDelta(pct.netIncome, prior.pct.netIncome)}
            strong
          />
        </tbody>
      </table>
    </TableScroll>
  );
}

function Section({
  title,
  lines,
  compare,
}: {
  title: string;
  lines: PnlLine[];
  compare: Compare;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={5}
          className="border-b bg-[var(--surface)] px-4 pt-3 pb-1.5 text-xs font-semibold text-[var(--muted)]"
        >
          {title}
        </td>
      </tr>
      {lines.map((line) => {
        const delta = amountDelta(
          line.amount,
          compare.amounts.get(line.accountId) ?? 0,
          { higherIsBetter: higherIsBetter(line) },
        );
        return (
          <tr
            key={line.accountId}
            className={line.amount === 0 ? "text-[var(--muted)]" : ""}
          >
            <td className={`${tdClass} pl-6`}>
              <span className="mr-2 font-mono text-xs text-[var(--muted)]">
                {line.code}
              </span>
              {line.name}
            </td>
            <td className={tdNumClass}>{formatMoney(line.amount)}</td>
            <td className={tdNumClass}>
              {line.amount === 0 ? "" : formatPercent(line.pctOfSales)}
            </td>
            <td className={tdNumClass}>
              {delta && line.amount !== 0 && <DeltaText delta={delta} />}
            </td>
            <td className={tdBarClass}>
              <PctBar pct={line.pctOfSales} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

function Total({
  label,
  amount,
  pct,
  delta,
  strong,
  muted,
}: {
  label: string;
  amount: number;
  pct: number | null;
  delta?: Delta;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <tr
      className={
        strong
          ? "bg-[var(--accent-soft)] font-semibold"
          : muted
            ? "text-[var(--muted)] italic"
            : "font-medium"
      }
    >
      <td className={tdClass}>{label}</td>
      <td
        className={`${tdNumClass} ${amount < 0 && strong ? "text-[var(--danger)]" : ""}`}
      >
        {formatMoney(amount)}
      </td>
      <td className={tdNumClass}>{formatPercent(pct)}</td>
      <td className={tdNumClass}>{delta && <DeltaText delta={delta} />}</td>
      <td className={tdBarClass}>
        <PctBar pct={pct} strong={strong} />
      </td>
    </tr>
  );
}
