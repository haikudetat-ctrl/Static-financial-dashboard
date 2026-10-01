import type { Metadata } from "next";
import Link from "next/link";

import { registerInvoiceAction } from "@/app/(manager)/invoices/actions";
import { UploadForm } from "@/components/imports/upload-form";
import { getUserContext } from "@/lib/auth/session";
import { IMPORT_SOURCE_TYPES } from "@/lib/imports";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getInvoices, relatedName } from "@/lib/purchasing/queries";
import { createClient } from "@/lib/supabase/server";
import { PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Invoice review" };

export default async function InvoiceUploadPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const supabase = await createClient();
  const [
    invoices,
    { data: vendors },
    { data: items },
    { data: receiptLines },
    { data: sourceImports },
  ] = await Promise.all([
    getInvoices(context.organizationId, locationId),
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
      .select("id, file_name, file_path, status, created_at")
      .eq("organization_id", context.organizationId)
      .eq("location_id", locationId)
      .eq("source_type", IMPORT_SOURCE_TYPES.PLCB)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Upload vendor invoices and review them before cost posts"
      />
      <PageBody>
        <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_1.2fr]">
          <div className="grid content-start gap-5">
            <section className="border bg-[var(--surface)] p-5">
              <h2 className="text-lg font-semibold">Upload source document</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                PDF files are hashed, stored privately, and registered before
                extracted values are confirmed below.
              </p>
              <div className="mt-4">
                <UploadForm
                  sourceType={IMPORT_SOURCE_TYPES.PLCB}
                  label="PLCB invoice"
                  accept=".pdf"
                />
              </div>
            </section>
            <form
              action={registerInvoiceAction}
              className="grid gap-3 border bg-white p-5"
            >
              <h2 className="text-lg font-semibold">
                Register extracted invoice
              </h2>
              <select
                name="source_import_id"
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Choose uploaded source document</option>
                {(sourceImports ?? []).map((sourceImport) => (
                  <option key={sourceImport.id} value={sourceImport.id}>
                    {sourceImport.file_name} · {sourceImport.status}
                  </option>
                ))}
              </select>
              <select
                name="vendor_id"
                required
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Choose vendor</option>
                {(vendors ?? []).map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="invoice_number"
                  required
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Invoice number"
                />
                <input
                  name="invoice_date"
                  required
                  type="date"
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <input
                name="order_id"
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Vendor order / PO reference"
              />
              <input
                name="document_file_path"
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Document path or upload reference"
              />
              <select
                name="inventory_item_id"
                required
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Map inventory item</option>
                {(items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                name="receipt_line_id"
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">No receipt match</option>
                {(receiptLines ?? []).map((line) => (
                  <option key={line.id} value={line.id}>
                    {items?.find((item) => item.id === line.inventory_item_id)
                      ?.name ?? "Receipt line"}{" "}
                    · {Number(line.quantity_received)} @ $
                    {Number(line.unit_price).toFixed(2)}
                  </option>
                ))}
              </select>
              <input
                name="vendor_product_code"
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Vendor product code"
              />
              <input
                name="product_description"
                required
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Product description"
              />
              <input
                name="pack_size"
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Pack size"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  name="quantity"
                  required
                  type="number"
                  min="0.001"
                  step="0.001"
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Qty"
                />
                <input
                  name="unit_price"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Unit price"
                />
                <input
                  name="line_total"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Line total"
                />
              </div>
              <input
                name="total_amount"
                required
                type="number"
                min="0"
                step="0.01"
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Invoice total"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="discount_amount"
                  type="number"
                  step="0.01"
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Discount"
                />
                <input
                  name="tax_amount"
                  type="number"
                  step="0.01"
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Tax"
                />
                <input
                  name="freight_amount"
                  type="number"
                  step="0.01"
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Freight"
                />
                <input
                  name="deposit_amount"
                  type="number"
                  step="0.01"
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Deposit"
                />
                <input
                  name="credits_amount"
                  type="number"
                  step="0.01"
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  placeholder="Credits"
                />
              </div>
              <button className="min-h-12 bg-[var(--foreground)] px-5 text-sm font-semibold text-white">
                Stage for review
              </button>
            </form>
          </div>

          <section>
            <h2 className="text-lg font-semibold">Invoice register</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border bg-[var(--surface-strong)]">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="border-b bg-[var(--surface)] text-left text-xs font-medium text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-2.5">Vendor</th>
                    <th className="px-4 py-2.5">Invoice</th>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2.5">
                        {relatedName(invoice.vendors)}
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        <Link
                          href={`/invoices/${invoice.id}/review`}
                          className="underline underline-offset-4"
                        >
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">{invoice.invoice_date}</td>
                      <td className="px-4 py-2.5 capitalize">
                        {invoice.status}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        ${Number(invoice.total_amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </PageBody>
    </>
  );
}
