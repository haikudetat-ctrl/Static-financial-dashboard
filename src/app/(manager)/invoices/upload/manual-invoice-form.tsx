import { registerInvoiceAction } from "@/app/(manager)/invoices/actions";

type Option = { id: string; name: string };

/** Enter a single-line invoice by hand (rarely needed). */
export function ManualInvoiceForm({
  vendors,
  items,
  receiptLines,
  sourceImports,
}: {
  vendors: Option[];
  items: Option[];
  receiptLines: Array<{
    id: string;
    inventory_item_id: string | null;
    quantity_received: number | string;
    unit_price: number | string;
  }>;
  sourceImports: Array<{ id: string; file_name: string; status: string }>;
}) {
  return (
    <form action={registerInvoiceAction} className="grid gap-3 p-4">
      <select
        name="source_import_id"
        className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
      >
        <option value="">Choose uploaded source document</option>
        {sourceImports.map((sourceImport) => (
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
        {vendors.map((vendor) => (
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
        {items.map((item) => (
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
        {receiptLines.map((line) => (
          <option key={line.id} value={line.id}>
            {items.find((item) => item.id === line.inventory_item_id)?.name ??
              "Receipt line"}{" "}
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
  );
}
