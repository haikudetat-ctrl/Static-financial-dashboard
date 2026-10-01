import type { Metadata } from "next";

import {
  ButtonLink,
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
} from "@/components/ui";
import { rangeQuery } from "@/lib/reporting/period-range";
import type { PnlLine, PnlStatement } from "@/lib/reporting/pnl";
import { getProfitAndLoss } from "@/lib/reporting/queries";

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
  const { locationId, periods, range } = loaded;
  const pnl = await getProfitAndLoss(locationId, range.start, range.end);
  const query = rangeQuery(range);
  const { totals, pct } = pnl;
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
                {range.status === "closed" ? "View close" : "Close period"}
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
          <StatTile label="Net sales" value={formatMoney(totals.sales)} />
          <StatTile
            label="Cost of goods"
            value={formatMoney(totals.cogs)}
            detail={`${formatPercent(pct.cogs)} of sales · theoretical ${formatMoney(totals.theoreticalCogs)}`}
          />
          <StatTile
            label="Prime cost"
            value={formatPercent(pct.primeCost)}
            detail={`${formatMoney(totals.primeCost)} cost of goods + labor`}
          />
          <StatTile
            label="Net income"
            value={formatMoney(totals.netIncome)}
            detail={`${formatPercent(pct.netIncome)} of sales`}
            tone={totals.netIncome < 0 ? "danger" : "neutral"}
          />
        </StatGrid>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Panel title="Statement" flush>
            <Statement pnl={pnl} />
          </Panel>
          <div className="grid content-start gap-5">
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

function Statement({ pnl }: { pnl: PnlStatement }) {
  const { totals, pct } = pnl;
  return (
    <TableScroll>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Account</th>
            <th className={thNumClass}>Amount</th>
            <th className={thNumClass}>% of sales</th>
          </tr>
        </thead>
        <tbody>
          <Section title="Sales" lines={pnl.revenue} />
          <Total label="Net sales" amount={totals.sales} pct={1} />
          <Section title="Cost of goods sold" lines={pnl.cogs} />
          <Total
            label="Total cost of goods"
            amount={totals.cogs}
            pct={pct.cogs}
          />
          <Total
            label="Gross profit"
            amount={totals.grossProfit}
            pct={pct.grossMargin}
            strong
          />
          <Section title="Labor" lines={pnl.labor} />
          <Total label="Total labor" amount={totals.labor} pct={pct.labor} />
          <Total
            label="Prime cost"
            amount={totals.primeCost}
            pct={pct.primeCost}
            muted
          />
          <Section title="Operating expenses" lines={pnl.operatingExpenses} />
          <Total
            label="Operating income"
            amount={totals.operatingIncome}
            pct={pct.operatingIncome}
            strong
          />
          <Section
            title="Other income and expense"
            lines={[...pnl.otherIncome, ...pnl.otherExpense]}
          />
          <Total
            label="Net income"
            amount={totals.netIncome}
            pct={pct.netIncome}
            strong
          />
        </tbody>
      </table>
    </TableScroll>
  );
}

function Section({ title, lines }: { title: string; lines: PnlLine[] }) {
  return (
    <>
      <tr>
        <td
          colSpan={3}
          className="border-b bg-[var(--surface)] px-4 pt-3 pb-1.5 text-xs font-semibold text-[var(--muted)]"
        >
          {title}
        </td>
      </tr>
      {lines.map((line) => (
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
        </tr>
      ))}
    </>
  );
}

function Total({
  label,
  amount,
  pct,
  strong,
  muted,
}: {
  label: string;
  amount: number;
  pct: number | null;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <tr
      className={
        strong
          ? "bg-[var(--surface)] font-semibold"
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
    </tr>
  );
}
