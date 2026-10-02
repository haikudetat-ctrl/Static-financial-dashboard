import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  Badge,
  Callout,
  PageBody,
  PageHeader,
  Panel,
  TableScroll,
  formatMoney,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { getInvoiceDetail, relatedName } from "@/lib/purchasing/queries";
import { getPeriods } from "@/lib/reporting/queries";
import { formatPeriodLabel } from "@/lib/reporting/period-range";
import { createClient } from "@/lib/supabase/server";
import { getSignedDocumentUrl } from "@/lib/supabase/storage";

import { InvoiceDateInput } from "../../upload/invoice-controls";
import { ApproveInvoiceButton, LineMatch } from "./review-controls";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoiceReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getUserContext();
  if (!context?.organizationId) notFound();
  const invoice = await getInvoiceDetail(id);
  if (!invoice) notFound();
  const supabase = await createClient();
  const [signedUrl, periods, { data: items }] = await Promise.all([
    invoice.document_file_path &&
    !invoice.document_file_path.startsWith("/mnt/")
      ? getSignedDocumentUrl(invoice.document_file_path)
      : Promise.resolve(null),
    getPeriods(context.organizationId, invoice.location_id),
    supabase
      .from("inventory_items")
      .select("id, name, item_code")
      .eq("organization_id", context.organizationId)
      .eq("active", true)
      .order("name")
      .limit(2000),
  ]);

  const posted = invoice.status === "posted";
  const editable = !posted && invoice.status !== "rejected";
  const undated = invoice.invoice_date < "2000-01-01";
  const unmatched = invoice.lines.filter(
    (line) => !line.inventory_item_id,
  ).length;
  const period = periods.find(
    (candidate) =>
      candidate.status !== "closed" &&
      candidate.periodStart <= invoice.invoice_date &&
      invoice.invoice_date <= candidate.periodEnd,
  );
  const linesTotal = invoice.lines.reduce(
    (sum, line) => sum + Number(line.line_total),
    0,
  );
  const itemOptions = (items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    code: item.item_code,
  }));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Invoices", href: "/invoices/upload" }]}
        title={`${relatedName(invoice.vendors)} #${invoice.invoice_number}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {undated ? (
              editable ? (
                <>
                  Date: <InvoiceDateInput invoiceId={invoice.id} />
                </>
              ) : (
                "No date"
              )
            ) : (
              new Date(`${invoice.invoice_date}T12:00:00`).toLocaleDateString(
                "en-US",
                { month: "long", day: "numeric", year: "numeric" },
              )
            )}
            {posted ? (
              <Badge tone="good">Posted</Badge>
            ) : (
              <Badge tone="warning">{invoice.status}</Badge>
            )}
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                Open document
              </a>
            )}
          </span>
        }
        actions={
          editable && (
            <ApproveInvoiceButton
              invoiceId={invoice.id}
              disabled={undated || unmatched > 0}
              label={period ? "Approve and receive" : "Approve prices"}
            />
          )
        }
      />
      <PageBody>
        {editable && (undated || unmatched > 0) ? (
          <Callout
            tone="warning"
            title={
              undated
                ? "Set the invoice date to approve"
                : `${unmatched} line${unmatched === 1 ? "" : "s"} still need an item`
            }
          >
            {undated
              ? "This vendor's file had no date. It decides whether the delivery counts toward a period."
              : "Match each line once; the vendor's code is remembered for future invoices."}
          </Callout>
        ) : editable ? (
          <Callout
            tone="neutral"
            title={
              period
                ? `Approving receives these items into stock for ${formatPeriodLabel(period)}`
                : "Approving records prices only"
            }
          >
            {period
              ? "Quantities are added to on-hand and prices update recipe costs and price alerts."
              : "This invoice is dated before your current period, so it updates price history without adding stock."}
          </Callout>
        ) : null}

        <div
          className={`grid gap-5 ${signedUrl ? "xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : ""}`}
        >
          <Panel flush>
            <TableScroll>
              <table className={`${tableClass} min-w-[720px]`}>
                <thead>
                  <tr>
                    <th className={thClass}>Invoice line</th>
                    <th className={thClass}>Inventory item</th>
                    <th className={thNumClass}>Qty</th>
                    <th className={thNumClass}>Unit price</th>
                    <th className={thNumClass}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => {
                    const item = Array.isArray(line.inventory_items)
                      ? line.inventory_items[0]
                      : line.inventory_items;
                    return (
                      <tr
                        key={line.id}
                        className={
                          line.inventory_item_id ? undefined : "bg-[#fdf8ee]"
                        }
                      >
                        <td className={tdClass}>
                          <span className="font-medium">
                            {line.product_description}
                          </span>
                          <span className="block text-xs text-[var(--muted)]">
                            {line.vendor_product_code && (
                              <span className="font-mono">
                                {line.vendor_product_code}
                              </span>
                            )}
                            {line.pack_size && ` · ${line.pack_size}`}
                          </span>
                        </td>
                        <td className={tdClass}>
                          <LineMatch
                            invoiceId={invoice.id}
                            lineId={line.id}
                            current={
                              line.inventory_item_id && item
                                ? {
                                    id: line.inventory_item_id,
                                    name: item.name,
                                  }
                                : null
                            }
                            source={line.match_source}
                            items={itemOptions}
                            editable={editable}
                          />
                        </td>
                        <td className={tdNumClass}>
                          {Number(line.quantity_invoiced)}
                        </td>
                        <td className={tdNumClass}>
                          {formatMoney(Number(line.unit_price))}
                        </td>
                        <td className={tdNumClass}>
                          {formatMoney(Number(line.line_total))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
            <div className="flex justify-end gap-6 border-t px-4 py-3 text-sm tabular-nums">
              <span className="text-[var(--muted)]">
                Lines {formatMoney(linesTotal)}
              </span>
              <span className="font-semibold">
                Invoice total {formatMoney(Number(invoice.total_amount))}
              </span>
            </div>
          </Panel>
          {signedUrl && (
            <Panel title="Source document" flush>
              <iframe
                src={signedUrl}
                className="h-[640px] w-full rounded-b-lg"
                title="Invoice source document"
              />
            </Panel>
          )}
        </div>
      </PageBody>
    </>
  );
}
