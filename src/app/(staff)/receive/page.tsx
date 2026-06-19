import type { Metadata } from "next";

import {
  createNoPoReceiptAction,
  receivePurchaseOrderAction,
} from "@/app/(staff)/receive/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getOpenPurchaseOrders, relatedName } from "@/lib/purchasing/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Receive" };

export default async function ReceivePage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const supabase = await createClient();
  const [orders, { data: vendors }, { data: items }] = await Promise.all([
    getOpenPurchaseOrders(context.organizationId, locationId),
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
      .eq("is_purchased", true)
      .order("name"),
  ]);

  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Receiving
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
          Receive what arrived.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Clean deliveries post immediately. Any exception pauses the receipt
          for manager review.
        </p>

        <div className="mt-7 grid gap-5">
          {orders.map((order) => {
            const action = receivePurchaseOrderAction.bind(null, order.id);
            const lines = order.purchase_order_lines as Array<{
              id: string;
              quantity_ordered: number | string;
              quantity_received: number | string;
              inventory_items: { name: string } | { name: string }[] | null;
            }>;
            return (
              <form key={order.id} action={action} className="border bg-white">
                <header className="bg-[var(--foreground)] p-4 text-white">
                  <p className="font-mono text-[10px] tracking-[0.13em] text-[#bdc2bb] uppercase">
                    {order.status.replace("_", " ")} · {order.order_date}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {relatedName(order.vendors)}
                  </h2>
                </header>
                <div className="grid gap-2 p-4">
                  {lines.map((line) => (
                    <div
                      key={line.id}
                      className="grid grid-cols-[1fr_7rem] items-center gap-3 border-b py-2 text-sm"
                    >
                      <span>{relatedName(line.inventory_items)}</span>
                      <input
                        type="hidden"
                        name="purchase_order_line_id"
                        value={line.id}
                      />
                      <input
                        name="received_quantity"
                        type="number"
                        min="0"
                        max={
                          Number(line.quantity_ordered) -
                          Number(line.quantity_received)
                        }
                        step="0.001"
                        defaultValue={
                          Number(line.quantity_ordered) -
                          Number(line.quantity_received)
                        }
                        className="border px-2 py-2 text-right tabular-nums"
                        aria-label={`${relatedName(line.inventory_items)} received quantity`}
                      />
                    </div>
                  ))}
                  <input
                    name="document_file_path"
                    className="mt-3 border px-3 py-3 text-sm"
                    placeholder="Packing slip path or reference"
                  />
                  <input
                    name="notes"
                    className="border px-3 py-3 text-sm"
                    placeholder="Receiving notes"
                  />
                  <select
                    name="exception_type"
                    className="border bg-white px-3 py-3 text-sm"
                    defaultValue=""
                  >
                    <option value="">No exception — receive all</option>
                    <option value="shortage">Shortage</option>
                    <option value="substitution">Substitution</option>
                    <option value="damage">Damage</option>
                    <option value="price_mismatch">Price mismatch</option>
                    <option value="unknown_item">Unknown item</option>
                  </select>
                  <input
                    name="exception_description"
                    className="border px-3 py-3 text-sm"
                    placeholder="Describe the exception, if any"
                  />
                  <button className="mt-2 min-h-12 border-2 border-[var(--foreground)] px-4 text-sm font-semibold">
                    Submit receipt
                  </button>
                </div>
              </form>
            );
          })}
          {orders.length === 0 && (
            <div className="border bg-[var(--surface-strong)] p-6">
              <p className="font-semibold">No delivery is waiting.</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Approved and sent purchase orders appear here.
              </p>
            </div>
          )}
          <details className="border bg-white">
            <summary className="cursor-pointer p-4 text-sm font-semibold">
              Receive a delivery without a PO
            </summary>
            <form
              action={createNoPoReceiptAction}
              className="grid gap-3 border-t p-4"
            >
              <p className="text-xs leading-5 text-[var(--muted)]">
                No-PO deliveries pause for manager review before inventory
                posts.
              </p>
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
              <select
                name="inventory_item_id"
                required
                className="border bg-white px-3 py-3 text-sm"
              >
                <option value="">Choose mapped item</option>
                {(items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="quantity"
                  required
                  type="number"
                  min="0.001"
                  step="0.001"
                  className="border px-3 py-3 text-sm"
                  placeholder="Quantity"
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
              </div>
              <input
                name="document_file_path"
                className="border px-3 py-3 text-sm"
                placeholder="Document path or reference"
              />
              <input
                name="exception_description"
                className="border px-3 py-3 text-sm"
                placeholder="Why was there no PO?"
              />
              <button className="min-h-12 border-2 border-[var(--foreground)] px-4 text-sm font-semibold">
                Send for manager review
              </button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
