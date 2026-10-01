import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { approveInvoiceAction } from "@/app/(manager)/invoices/actions";
import { getInvoiceDetail, relatedName } from "@/lib/purchasing/queries";
import { getSignedDocumentUrl } from "@/lib/supabase/storage";
import { PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Invoice detail" };

export default async function InvoiceReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await getInvoiceDetail(id);
  if (!invoice) notFound();
  const signedUrl = invoice.document_file_path
    ? await getSignedDocumentUrl(invoice.document_file_path)
    : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Invoices", href: "/invoices/upload" }]}
        title={`${relatedName(invoice.vendors)} · ${invoice.invoice_number}`}
        description={
          <>
            {invoice.invoice_date}
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                className="ml-3 underline underline-offset-4"
              >
                Open document
              </a>
            )}
          </>
        }
        actions={
          <>
            {invoice.status === "reviewed" && (
              <form action={approveInvoiceAction.bind(null, invoice.id)}>
                <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 text-sm font-medium text-white transition hover:bg-[#343a32] disabled:cursor-not-allowed disabled:opacity-50">
                  Approve and post cost
                </button>
              </form>
            )}
          </>
        }
      />
      <PageBody>
        <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_1.2fr]">
          {signedUrl && (
            <div className="order-2 min-h-[600px] border bg-white lg:order-1">
              <div className="bg-[var(--foreground)] px-4 py-3">
                <p className="font-mono text-[10px] tracking-[0.13em] text-[#bdc2bb] uppercase">
                  Source document
                </p>
              </div>
              <iframe
                src={signedUrl}
                className="h-[600px] w-full"
                title="Invoice source document"
              />
            </div>
          )}

          <div
            className={`overflow-x-auto border ${signedUrl ? "order-1 lg:order-2" : ""}`}
          >
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b bg-[var(--surface)] text-left text-xs font-medium text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Mapped item</th>
                  <th className="px-4 py-2.5">Pack</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  <th className="px-4 py-2.5 text-right">Unit price</th>
                  <th className="px-4 py-2.5 text-right">Line total</th>
                  <th className="px-4 py-2.5">Anomalies</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">
                        {line.product_description}
                      </p>
                      <p className="font-mono text-xs text-[var(--muted)]">
                        {line.vendor_product_code}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      {relatedName(line.inventory_items) || "Unmapped"}
                    </td>
                    <td className="px-4 py-2.5">
                      {line.pack_size || "\u2014"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {Number(line.quantity_invoiced)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      ${Number(line.unit_price).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      ${Number(line.line_total).toFixed(2)}
                    </td>
                    <td className="p-3 text-xs text-[var(--accent-strong)]">
                      {line.anomaly_codes.length
                        ? line.anomaly_codes.join(", ").replaceAll("_", " ")
                        : "None"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t p-4 text-right text-lg font-semibold">
              Invoice total: ${Number(invoice.total_amount).toFixed(2)}
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}
