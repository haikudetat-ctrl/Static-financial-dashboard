import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { approveInvoiceAction } from "@/app/(manager)/invoices/actions";
import { getInvoiceDetail, relatedName } from "@/lib/purchasing/queries";
import { getSignedDocumentUrl } from "@/lib/supabase/storage";

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
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Invoice · {invoice.status}
        </p>
        <div className="mt-2 flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em]">
              {relatedName(invoice.vendors)} · {invoice.invoice_number}
            </h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
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
            </p>
          </div>
          {invoice.status === "reviewed" && (
            <form action={approveInvoiceAction.bind(null, invoice.id)}>
              <button className="min-h-12 bg-[var(--foreground)] px-6 text-sm font-semibold text-white">
                Approve and post cost
              </button>
            </form>
          )}
        </div>

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
              <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Mapped item</th>
                  <th className="p-3">Pack</th>
                  <th className="p-3 text-right">Qty</th>
                  <th className="p-3 text-right">Unit price</th>
                  <th className="p-3 text-right">Line total</th>
                  <th className="p-3">Anomalies</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-b bg-white">
                    <td className="p-3">
                      <p className="font-semibold">
                        {line.product_description}
                      </p>
                      <p className="font-mono text-xs text-[var(--muted)]">
                        {line.vendor_product_code}
                      </p>
                    </td>
                    <td className="p-3">
                      {relatedName(line.inventory_items) || "Unmapped"}
                    </td>
                    <td className="p-3">{line.pack_size || "\u2014"}</td>
                    <td className="p-3 text-right">
                      {Number(line.quantity_invoiced)}
                    </td>
                    <td className="p-3 text-right">
                      ${Number(line.unit_price).toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
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
      </div>
    </div>
  );
}
