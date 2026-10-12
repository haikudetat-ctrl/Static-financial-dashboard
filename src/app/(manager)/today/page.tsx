import type { Metadata } from "next";
import Link from "next/link";

import { ClassCostGap, DailySalesBars } from "@/components/charts";
import {
  Badge,
  ButtonLink,
  EmptyState,
  PageBody,
  PageHeader,
  Panel,
  StatGrid,
  StatTile,
  TableScroll,
  formatMoney,
  formatPercent,
  tableClass,
  tdClass,
  tdNumClass,
  type Tone,
} from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getAttentionQueues } from "@/lib/reporting/attention";
import { amountDelta, pointsDelta } from "@/lib/reporting/compare";
import {
  comparisonRange,
  formatRangeLabel,
} from "@/lib/reporting/period-range";
import { getProfitAndLoss } from "@/lib/reporting/queries";

import { loadFinancialsContext } from "../financial-health/financials-context";
import { ActionQueue, buildActions, plural } from "./action-queue";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const loaded = await loadFinancialsContext(Promise.resolve({}));
  if (!loaded) return null;
  const { context, locationId, periods, range } = loaded;
  const organizationId = context.organizationId!;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  // Period to date; a period that hasn't started yet shows its first day.
  const toDate =
    range.end < today ? range.end : today < range.start ? range.start : today;
  const prior = comparisonRange(range, periods, toDate);

  const supabase = await createClient();
  const [pnl, priorPnl, salesDays, queues, recentInvoices] = await Promise.all([
    getProfitAndLoss(locationId, range.start, toDate),
    getProfitAndLoss(locationId, prior.start, prior.end),
    supabase
      .from("sales_business_days")
      .select("business_date, net_sales")
      .eq("location_id", locationId)
      .eq("status", "posted")
      .order("business_date", { ascending: false })
      .limit(7)
      .then((result) => result.data ?? []),
    getAttentionQueues(organizationId, locationId),
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, invoice_date, status, total_amount, vendors(name)",
      )
      .eq("location_id", locationId)
      .order("created_at", { ascending: false })
      .limit(5)
      .then((result) => result.data ?? []),
  ]);

  const { actions, cleared } = buildActions(queues, pnl);
  const { totals, pct } = pnl;
  const theoreticalPct = totals.sales
    ? totals.theoreticalCogs / totals.sales
    : null;
  const gap =
    pct.cogs !== null && theoreticalPct !== null && totals.theoreticalCogs
      ? pct.cogs - theoreticalPct
      : null;
  const gapTone: Tone =
    gap === null
      ? "neutral"
      : gap > 0.02
        ? "danger"
        : gap > 0.005
          ? "warning"
          : "good";
  const lastDay = salesDays[0];
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const started = today >= range.start;

  return (
    <>
      <PageHeader
        eyebrow={dateLabel}
        title={
          actions.length === 0
            ? "All clear — nothing needs you"
            : `${plural(actions.length, "thing needs", "things need")} you`
        }
        description={
          started
            ? `${range.name ?? "Period"} to date · ${formatRangeLabel(range.start, toDate)} · compared with the same days of ${prior.name}`
            : `${range.name ?? "Next period"} starts ${formatRangeLabel(range.start, range.end)}`
        }
        actions={
          <>
            <ButtonLink href="/imports">Upload sales</ButtonLink>
            <ButtonLink href="/invoices/upload">Upload invoice</ButtonLink>
            <ButtonLink href="/inventory/counts/new" variant="primary">
              Start count
            </ButtonLink>
          </>
        }
      />
      <PageBody>
        <StatGrid>
          <StatTile
            label="Net sales"
            value={formatMoney(totals.sales, { cents: false })}
            delta={amountDelta(totals.sales, priorPnl.totals.sales, {
              against: prior.name,
            })}
            detail={
              lastDay
                ? `Last day ${formatMoney(Number(lastDay.net_sales), { cents: false })} · ${new Date(
                    `${lastDay.business_date}T12:00:00`,
                  ).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}`
                : "No Toast sales posted yet"
            }
            href="/financial-health"
          />
          <StatTile
            label="Cost of goods"
            value={formatPercent(pct.cogs)}
            tone={gap === null ? "neutral" : gap > 0.005 ? "warning" : "good"}
            delta={pointsDelta(pct.cogs, priorPnl.pct.cogs, {
              lowerIsBetter: true,
            })}
            meter={
              pct.cogs !== null
                ? { value: pct.cogs, marker: theoreticalPct, max: 0.4 }
                : undefined
            }
            detail={`Recipes say ${formatPercent(theoreticalPct)} · estimated until close`}
            href="/financial-health"
          />
          <StatTile
            label="Prime cost"
            value={formatPercent(pct.primeCost)}
            delta={pointsDelta(pct.primeCost, priorPnl.pct.primeCost, {
              lowerIsBetter: true,
            })}
            detail={`Cost of goods ${formatPercent(pct.cogs)} + labor ${formatPercent(pct.labor)}`}
            href="/financial-health"
          />
          <StatTile
            label="Actual vs recipes"
            value={
              gap === null
                ? "—"
                : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${Math.abs(gap * 100).toFixed(1)} pts`
            }
            tone={gapTone}
            detail={
              gap === null
                ? "Map Toast items to recipes to measure"
                : `${formatMoney(Math.abs(totals.cogs - totals.theoreticalCogs), { cents: false })} ${gap > 0 ? "over" : "under"} recipe cost`
            }
            href="/inventory/variance"
          />
        </StatGrid>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <ActionQueue actions={actions} cleared={cleared} />

          <div className="grid gap-5">
            <Panel
              title="Net sales · last 7 days"
              actions={
                <Link
                  href="/financial-health"
                  className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
                >
                  Full P&amp;L
                </Link>
              }
              flush
            >
              {salesDays.length === 0 ? (
                <EmptyState
                  title="No sales posted yet"
                  detail="Upload last night's Toast product mix export to start."
                  action={
                    <ButtonLink href="/imports" size="sm">
                      Upload sales
                    </ButtonLink>
                  }
                />
              ) : (
                <DailySalesBars
                  days={[...salesDays].reverse().map((day) => ({
                    date: day.business_date,
                    sales: Number(day.net_sales),
                  }))}
                />
              )}
            </Panel>
            <Panel
              title="Cost of goods by class"
              description="● actual   ○ recipes — the gap is what to chase"
              flush
            >
              <ClassCostGap classes={pnl.classCosts} />
            </Panel>
            <Panel
              title="Recent invoices"
              actions={
                <Link
                  href="/invoices/upload"
                  className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
                >
                  All invoices
                </Link>
              }
              flush
            >
              {recentInvoices.length === 0 ? (
                <EmptyState title="No invoices yet" />
              ) : (
                <TableScroll>
                  <table className={tableClass}>
                    <tbody>
                      {recentInvoices.map((invoice) => {
                        const vendor = Array.isArray(invoice.vendors)
                          ? invoice.vendors[0]
                          : invoice.vendors;
                        return (
                          <tr key={invoice.id}>
                            <td className={tdClass}>
                              <Link
                                href={`/invoices/${invoice.id}/review`}
                                className="font-medium hover:underline"
                              >
                                {vendor?.name ?? "Vendor"}
                              </Link>
                              <p className="text-xs text-[var(--muted)]">
                                #{invoice.invoice_number} ·{" "}
                                {invoice.invoice_date}
                              </p>
                            </td>
                            <td className={`${tdClass} text-right`}>
                              <Badge
                                tone={
                                  invoice.status === "posted"
                                    ? "good"
                                    : invoice.status === "rejected"
                                      ? "danger"
                                      : "warning"
                                }
                              >
                                {invoice.status}
                              </Badge>
                            </td>
                            <td className={tdNumClass}>
                              {formatMoney(Number(invoice.total_amount))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              )}
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  );
}
