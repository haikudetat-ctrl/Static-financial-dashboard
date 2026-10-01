import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

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
  thClass,
  thNumClass,
  type Tone,
} from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatRangeLabel } from "@/lib/reporting/period-range";
import { getProfitAndLoss } from "@/lib/reporting/queries";

import { loadFinancialsContext } from "../financial-health/financials-context";

export const metadata: Metadata = { title: "Today" };

const OPEN_IMPORT_STATUSES = [
  "received",
  "extracting",
  "extracted",
  "staging",
  "staged",
  "mapping",
  "ready",
  "failed",
];

export default async function TodayPage() {
  const loaded = await loadFinancialsContext(Promise.resolve({}));
  if (!loaded) return null;
  const { context, locationId, range } = loaded;
  const organizationId = context.organizationId!;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  // Period to date; a period that hasn't started yet shows its first day.
  const toDate =
    range.end < today ? range.end : today < range.start ? range.start : today;

  const supabase = await createClient();
  const count = (query: PromiseLike<{ count: number | null }>) =>
    Promise.resolve(query).then((result) => result.count ?? 0);

  const [
    pnl,
    salesDays,
    invoicesToReview,
    openImports,
    countsInProgress,
    catalogReview,
    unmappedLines,
    recentInvoices,
  ] = await Promise.all([
    getProfitAndLoss(locationId, range.start, toDate),
    supabase
      .from("sales_business_days")
      .select("business_date, net_sales")
      .eq("location_id", locationId)
      .eq("status", "posted")
      .order("business_date", { ascending: false })
      .limit(7)
      .then((result) => result.data ?? []),
    count(
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("location_id", locationId)
        .in("status", ["uploaded", "extracted", "reviewed"]),
    ),
    count(
      supabase
        .from("source_imports")
        .select("id", { count: "exact", head: true })
        .eq("location_id", locationId)
        .in("status", OPEN_IMPORT_STATUSES),
    ),
    count(
      supabase
        .from("inventory_counts")
        .select("id", { count: "exact", head: true })
        .eq("location_id", locationId)
        .in("status", ["draft", "in_progress", "counted"]),
    ),
    count(
      supabase
        .from("catalog_review_items")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "open"),
    ),
    count(
      supabase
        .from("invoice_lines")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("inventory_item_id", null),
    ),
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, invoice_date, status, total_amount, vendors(name)",
      )
      .eq("location_id", locationId)
      .order("created_at", { ascending: false })
      .limit(6)
      .then((result) => result.data ?? []),
  ]);

  const queues: Array<{
    label: string;
    detail: string;
    count: number;
    href: string;
    tone: Tone;
  }> = [
    {
      label: "Invoices to review",
      detail: "Check extracted lines and approve to post costs",
      count: invoicesToReview,
      href: "/invoices/upload",
      tone: "warning",
    },
    {
      label: "Imports not posted",
      detail: "Toast exports waiting to post to sales",
      count: openImports,
      href: "/imports",
      tone: "warning",
    },
    {
      label: "Counts open",
      detail: "Counts started but not yet approved",
      count: countsInProgress,
      href: "/inventory",
      tone: "accent",
    },
    {
      label: "Invoice lines without an item",
      detail: "Lines that can't cost inventory until mapped",
      count: unmappedLines,
      href: "/exceptions",
      tone: "warning",
    },
    {
      label: "Catalog questions",
      detail: "Items from the workbook import that need a decision",
      count: catalogReview,
      href: "/exceptions/catalog-review",
      tone: "neutral",
    },
  ];
  const openQueues = queues.filter((queue) => queue.count > 0);
  const lastDay = salesDays[0];
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <PageHeader
        title="Today"
        description={dateLabel}
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
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {today < range.start
              ? `${range.name ?? "Next period"} starts ${new Date(
                  `${range.start}T12:00:00`,
                ).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}`
              : `${range.name ?? "Period"} to date`}
            <span className="ml-2 font-normal text-[var(--muted)]">
              {today < range.start
                ? range.label
                : formatRangeLabel(range.start, toDate)}
            </span>
          </h2>
          <Link
            href="/financial-health"
            className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
          >
            Full P&amp;L
          </Link>
        </div>
        <StatGrid>
          <StatTile
            label="Net sales"
            value={formatMoney(pnl.totals.sales, { cents: false })}
            href="/financial-health"
          />
          <StatTile
            label="Cost of goods"
            value={formatPercent(pnl.pct.cogs)}
            detail={`${formatMoney(pnl.totals.cogs, { cents: false })} · estimated until close`}
            href="/financial-health"
          />
          <StatTile
            label="Prime cost"
            value={formatPercent(pnl.pct.primeCost)}
            detail="Cost of goods + labor"
            href="/financial-health"
          />
          <StatTile
            label="Last sales day"
            value={
              lastDay
                ? formatMoney(Number(lastDay.net_sales), { cents: false })
                : "—"
            }
            detail={
              lastDay
                ? new Date(
                    `${lastDay.business_date}T12:00:00`,
                  ).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "No Toast sales posted yet"
            }
            href="/imports"
          />
        </StatGrid>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel
            title="Needs attention"
            actions={
              openQueues.length > 0 ? (
                <Badge tone="warning">{openQueues.length} open</Badge>
              ) : (
                <Badge tone="good">All clear</Badge>
              )
            }
            flush
          >
            <ul>
              {queues.map((queue) => (
                <li key={queue.label} className="border-b last:border-b-0">
                  <Link
                    href={queue.href}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium ${queue.count ? "" : "text-[var(--muted)]"}`}
                      >
                        {queue.label}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {queue.detail}
                      </p>
                    </div>
                    {queue.count > 0 ? (
                      <Badge tone={queue.tone}>{queue.count}</Badge>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">None</span>
                    )}
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 text-[var(--muted)]"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid gap-5">
            <Panel title="Recent sales days" flush>
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
                <TableScroll>
                  <table className={tableClass}>
                    <thead>
                      <tr>
                        <th className={thClass}>Business day</th>
                        <th className={thNumClass}>Net sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesDays.map((day) => (
                        <tr key={day.business_date}>
                          <td className={tdClass}>
                            {new Date(
                              `${day.business_date}T12:00:00`,
                            ).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                          <td className={tdNumClass}>
                            {formatMoney(Number(day.net_sales))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              )}
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
