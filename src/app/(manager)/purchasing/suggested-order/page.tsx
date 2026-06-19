import type { Metadata } from "next";

import { createPurchaseOrderAction } from "@/app/(manager)/purchasing/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { evaluateVendorOrderConstraints } from "@/lib/purchasing/calculations";
import {
  getSuggestedOrder,
  getVendorOrderRules,
} from "@/lib/purchasing/queries";

export const metadata: Metadata = { title: "Suggested order" };

export default async function SuggestedOrderPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const [rows, rules] = await Promise.all([
    getSuggestedOrder(context.organizationId, locationId),
    getVendorOrderRules(context.organizationId, locationId),
  ]);
  const vendorIds = [...new Set(rows.map((row) => row.vendorId))];
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Purchasing · suggested order
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Buy the gap, rounded to reality.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Each suggestion subtracts posted on-hand and open purchase orders from
          par, then rounds to a valid pack.
        </p>

        <div className="mt-7 grid gap-7">
          {vendorIds.map((vendorId) => {
            const vendorRows = rows.filter((row) => row.vendorId === vendorId);
            const rule = rules.find(
              (candidate) => candidate.vendor_id === vendorId,
            );
            const constraints = evaluateVendorOrderConstraints({
              subtotal: vendorRows.reduce(
                (sum, row) =>
                  sum + row.suggestedQuantity * Number(row.unitPrice),
                0,
              ),
              minimumOrderAmount:
                rule?.minimum_order_amount === null ||
                rule?.minimum_order_amount === undefined
                  ? null
                  : Number(rule.minimum_order_amount),
              currentWeekday: now.getDay(),
              currentTime,
              cutoffWeekday: rule?.cutoff_day ?? null,
              cutoffTime: rule?.cutoff_time?.slice(0, 5) ?? null,
              leadTimeDays: rule?.lead_time_days ?? 0,
            });
            return (
              <form
                key={vendorId}
                action={createPurchaseOrderAction}
                className="border bg-white"
              >
                <input type="hidden" name="vendor_id" value={vendorId} />
                <header className="flex flex-col justify-between gap-3 border-b p-5 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {vendorRows[0]?.vendorName}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Manager quantities remain editable before draft creation.
                    </p>
                  </div>
                  <input
                    type="date"
                    name="expected_delivery_date"
                    className="border px-3 py-2 text-sm"
                    aria-label="Expected delivery date"
                  />
                </header>
                <div
                  className={`border-b px-5 py-3 text-xs ${
                    constraints.minimumMet && constraints.cutoffOpen
                      ? "bg-[#edf4ee] text-[var(--success)]"
                      : "bg-[#fff4eb] text-[var(--accent-strong)]"
                  }`}
                >
                  {constraints.messages.join(" ")}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="text-left font-mono text-[10px] tracking-[0.1em] text-[var(--muted)] uppercase">
                      <tr className="border-b">
                        <th className="p-3">Item</th>
                        <th className="p-3 text-right">Par</th>
                        <th className="p-3 text-right">On hand</th>
                        <th className="p-3 text-right">Open PO</th>
                        <th className="p-3 text-right">Price</th>
                        <th className="p-3">Order quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorRows.map((row) => (
                        <tr key={row.vendorItemId} className="border-b">
                          <td className="p-3">
                            <p className="font-semibold">{row.itemName}</p>
                            <p className="mt-1 max-w-md text-xs text-[var(--muted)]">
                              {row.explanation}
                            </p>
                            <input
                              type="hidden"
                              name="vendor_item_id"
                              value={row.vendorItemId}
                            />
                            <input
                              type="hidden"
                              name="inventory_item_id"
                              value={row.inventoryItemId}
                            />
                            <input
                              type="hidden"
                              name="unit_price"
                              value={row.unitPrice}
                            />
                            <input
                              type="hidden"
                              name="pack_size"
                              value={row.packSize}
                            />
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {row.targetPar}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {row.onHand.toFixed(1)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {row.openPoQuantity}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            ${row.unitPrice.toFixed(2)}
                          </td>
                          <td className="p-3">
                            <input
                              className="w-28 border px-3 py-2 tabular-nums"
                              type="number"
                              min="0"
                              step={row.packQuantity}
                              name="quantity"
                              defaultValue={row.suggestedQuantity}
                              aria-label={`${row.itemName} order quantity`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto]">
                  <input
                    name="manager_notes"
                    className="border px-3 py-3 text-sm"
                    placeholder="Manager notes"
                  />
                  <button className="min-h-12 bg-[var(--foreground)] px-6 text-sm font-semibold text-white">
                    Create draft PO
                  </button>
                </div>
              </form>
            );
          })}
          {rows.length === 0 && (
            <div className="border bg-white p-7 text-sm text-[var(--muted)]">
              Add active order-guide items before generating suggestions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
