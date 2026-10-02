import type { Metadata } from "next";
import Link from "next/link";

import { UploadForm } from "@/components/imports/upload-form";
import {
  Badge,
  EmptyState,
  PageBody,
  PageHeader,
  Panel,
  StatGrid,
  StatTile,
  TableScroll,
  Tabs,
  formatMoney,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { IMPORT_SOURCE_TYPES } from "@/lib/imports";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getInvoices, relatedName } from "@/lib/purchasing/queries";
import { getPeriods } from "@/lib/reporting/queries";
import { createClient } from "@/lib/supabase/server";

import { ApproveReadyButton, InvoiceDateInput } from "./invoice-controls";
import { ManualInvoiceForm } from "./manual-invoice-form";

export const metadata: Metadata = { title: "Invoices" };

const UNDATED = "2000-01-01";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const { show } = await searchParams;
  const supabase = await createClient();
  const [
    invoices,
    periods,
    { data: vendors },
    { data: items },
    { data: receiptLines },
    { data: sourceImports },
  ] = await Promise.all([
    getInvoices(context.organizationId, locationId),
    getPeriods(context.organizationId, locationId),
    supabase
      .from("vendors")
      .select("id, name")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("inventory_items")
      .select("id, name")
      .eq("organization_id", context.organizationId)
      .order("name"),
    supabase
      .from("receipt_lines")
      .select(
        "id, inventory_item_id, quantity_received, unit_price, receipts!inner(location_id, status)",
      )
      .eq("receipts.location_id", locationId)
      .eq("receipts.status", "posted")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("source_imports")
      .select("id, file_name, status")
      .eq("organization_id", context.organizationId)
      .eq("location_id", locationId)
      .eq("source_type", IMPORT_SOURCE_TYPES.PLCB)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const openPeriods = periods.filter((period) => period.status !== "closed");
  const rows = invoices.map((invoice) => {
    const lines = (invoice.invoice_lines ?? []) as Array<{
      inventory_item_id: string | null;
    }>;
    const matched = lines.filter((line) => line.inventory_item_id).length;
    const undated = invoice.invoice_date < UNDATED;
    const inPeriod = openPeriods.some(
      (period) =>
        period.periodStart <= invoice.invoice_date &&
        invoice.invoice_date <= period.periodEnd,
    );
    const open = !["posted", "rejected"].includes(invoice.status);
    return {
      invoice,
      lines: lines.length,
      matched,
      undated,
      inPeriod,
      open,
      ready: open && !undated && lines.length > 0 && matched === lines.length,
    };
  });
  const toReview = rows.filter((row) => row.open);
  const ready = toReview.filter((row) => row.ready);
  const needsDate = toReview.filter((row) => row.undated);
  const needsMatch = toReview.filter((row) => row.matched < row.lines);
  const visible =
    show === "posted" ? rows.filter((row) => !row.open) : toReview;

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Lines match your items by vendor code automatically. Approve to record prices, and receive into stock when the invoice falls in an open period."
        actions={<ApproveReadyButton count={ready.length} />}
      />
      <PageBody>
        <StatGrid>
          <StatTile
            label="To review"
            value={toReview.length}
            detail={`${formatMoney(
              toReview.reduce(
                (sum, row) => sum + Number(row.invoice.total_amount),
                0,
              ),
              { cents: false },
            )} total`}
          />
          <StatTile
            label="Ready to approve"
            value={ready.length}
            detail="Dated, every line matched"
            tone={ready.length ? "good" : "neutral"}
          />
          <StatTile
            label="Need a date"
            value={needsDate.length}
            detail="Set it in the list below"
            tone={needsDate.length ? "warning" : "neutral"}
          />
          <StatTile
            label="Need matching"
            value={needsMatch.length}
            detail="Lines not tied to an item"
            tone={needsMatch.length ? "warning" : "neutral"}
          />
        </StatGrid>

        <Panel flush>
          <div className="px-4 pt-2">
            <Tabs
              items={[
                {
                  label: `To review (${toReview.length})`,
                  href: "/invoices/upload",
                  active: show !== "posted",
                },
                {
                  label: "Posted",
                  href: "/invoices/upload?show=posted",
                  active: show === "posted",
                },
              ]}
            />
          </div>
          {visible.length === 0 ? (
            <EmptyState
              title={
                show === "posted"
                  ? "No posted invoices yet"
                  : "Nothing to review"
              }
              detail="Upload a PLCB PDF below, or forward vendor invoices once email import is set up."
            />
          ) : (
            <TableScroll>
              <table className={`${tableClass} min-w-[760px]`}>
                <thead>
                  <tr>
                    <th className={thClass}>Vendor</th>
                    <th className={thClass}>Invoice</th>
                    <th className={thClass}>Date</th>
                    <th className={thClass}>Lines</th>
                    <th className={thClass}>On approval</th>
                    <th className={thNumClass}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.invoice.id}
                      className="hover:bg-[var(--surface)]"
                    >
                      <td className={tdClass}>
                        {relatedName(row.invoice.vendors)}
                      </td>
                      <td className={tdClass}>
                        <Link
                          href={`/invoices/${row.invoice.id}/review`}
                          className="font-medium hover:underline"
                        >
                          #{row.invoice.invoice_number}
                        </Link>
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {row.undated && row.open ? (
                          <InvoiceDateInput invoiceId={row.invoice.id} />
                        ) : row.undated ? (
                          "—"
                        ) : (
                          new Date(
                            `${row.invoice.invoice_date}T12:00:00`,
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        )}
                      </td>
                      <td className={tdClass}>
                        {row.matched === row.lines ? (
                          <span className="text-[var(--muted)]">
                            {row.lines} matched
                          </span>
                        ) : (
                          <Badge tone="warning">
                            {row.lines - row.matched} of {row.lines} unmatched
                          </Badge>
                        )}
                      </td>
                      <td className={tdClass}>
                        {!row.open ? (
                          <Badge tone="good">Posted</Badge>
                        ) : row.undated ? (
                          <span className="text-xs text-[var(--muted)]">
                            Needs a date
                          </span>
                        ) : row.inPeriod ? (
                          <Badge tone="accent">Receive into stock</Badge>
                        ) : (
                          <Badge>Prices only</Badge>
                        )}
                      </td>
                      <td className={tdNumClass}>
                        {formatMoney(Number(row.invoice.total_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
          <p className="border-t px-4 py-2.5 text-xs text-[var(--muted)]">
            “Prices only” invoices are dated before your current period: they
            update price history and alerts but don&apos;t add stock, since your
            opening count already covers them.
          </p>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
            title="Upload a PLCB invoice"
            description="PDF from the Licensee Online Order Portal."
          >
            <UploadForm
              sourceType={IMPORT_SOURCE_TYPES.PLCB}
              label="PLCB invoice"
              accept=".pdf"
            />
          </Panel>
          <Panel title="Enter an invoice by hand" flush>
            <details>
              <summary className="cursor-pointer px-4 py-3 text-sm text-[var(--muted)]">
                Show form
              </summary>
              <ManualInvoiceForm
                vendors={vendors ?? []}
                items={items ?? []}
                receiptLines={receiptLines ?? []}
                sourceImports={sourceImports ?? []}
              />
            </details>
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
