import type { Metadata } from "next";
import Link from "next/link";

import { registerInvoiceAction } from "@/app/(manager)/invoices/actions";
import { UploadForm } from "@/components/imports/upload-form";
import { getUserContext } from "@/lib/auth/session";
import { IMPORT_SOURCE_TYPES } from "@/lib/imports";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getInvoices, relatedName } from "@/lib/purchasing/queries";
import { createClient } from "@/lib/supabase/server";

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
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Purchasing · invoices
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Review the bill before cost moves.
        </h1>
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
                className="border bg-white px-3 py-3 text-sm"
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
                className="border bg-white px-3 py-3 text-sm"
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
                  className="border px-3 py-3 text-sm"
                  placeholder="Invoice number"
                />
                <input
                  name="invoice_date"
                  required
                  type="date"
                  className="border px-3 py-3 text-sm"
                />
              </div>
              <input
                name="order_id"
                className="border px-3 py-3 text-sm"
                placeholder="Vendor order / PO reference"
              />
              <input
                name="document_file_path"
                className="border px-3 py-3 text-sm"
                placeholder="Document path or upload reference"
              />
              <select
                name="inventory_item_id"
                required
                className="border bg-white px-3 py-3 text-sm"
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
                className="border bg-white px-3 py-3 text-sm"
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
                className="border px-3 py-3 text-sm"
                placeholder="Vendor product code"
              />
              <input
                name="product_description"
                required
                className="border px-3 py-3 text-sm"
                placeholder="Product description"
              />
              <input
                name="pack_size"
                className="border px-3 py-3 text-sm"
                placeholder="Pack size"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  name="quantity"
                  required
                  type="number"
                  min="0.001"
                  step="0.001"
                  className="border px-3 py-3 text-sm"
                  placeholder="Qty"
                />
                <input
                  name="unit_price"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className="border px-3 py-3 text-sm"
                  placeholder="Unit price"
                />
                <input
                  name="line_total"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className="border px-3 py-3 text-sm"
                  placeholder="Line total"
                />
              </div>
              <input
                name="total_amount"
                required
                type="number"
                min="0"
                step="0.01"
                className="border px-3 py-3 text-sm"
                placeholder="Invoice total"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="discount_amount"
                  type="number"
                  step="0.01"
                  className="border px-3 py-3 text-sm"
                  placeholder="Discount"
                />
                <input
                  name="tax_amount"
                  type="number"
                  step="0.01"
                  className="border px-3 py-3 text-sm"
                  placeholder="Tax"
                />
                <input
                  name="freight_amount"
                  type="number"
                  step="0.01"
                  className="border px-3 py-3 text-sm"
                  placeholder="Freight"
                />
                <input
                  name="deposit_amount"
                  type="number"
                  step="0.01"
                  className="border px-3 py-3 text-sm"
                  placeholder="Deposit"
                />
                <input
                  name="credits_amount"
                  type="number"
                  step="0.01"
                  className="border px-3 py-3 text-sm"
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
            <div className="mt-3 overflow-x-auto border">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
                  <tr>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Invoice</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b bg-white">
                      <td className="p-3">{relatedName(invoice.vendors)}</td>
                      <td className="p-3 font-semibold">
                        <Link
                          href={`/invoices/${invoice.id}/review`}
                          className="underline underline-offset-4"
                        >
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="p-3">{invoice.invoice_date}</td>
                      <td className="p-3 capitalize">{invoice.status}</td>
                      <td className="p-3 text-right">
                        ${Number(invoice.total_amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
