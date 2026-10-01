import type { Metadata } from "next";

import { createPurchaseOrderAction } from "@/app/(manager)/purchasing/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { evaluateVendorOrderConstraints } from "@/lib/purchasing/calculations";
import {
  getSuggestedOrder,
  getVendorOrderRules,
} from "@/lib/purchasing/queries";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";

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
    <>
      <PageHeader
        title="Suggested order"
        description={
          <>
            Each suggestion subtracts posted on-hand and open purchase orders
            from par, then rounds to a valid pack.
          </>
        }
      />
      <SectionNav section="purchasing" active="/purchasing/suggested-order" />
      <PageBody>
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
                className="rounded-lg border bg-[var(--surface-strong)]"
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
                        <th className="px-4 py-2.5">Item</th>
                        <th className="px-4 py-2.5 text-right">Par</th>
                        <th className="px-4 py-2.5 text-right">On hand</th>
                        <th className="px-4 py-2.5 text-right">Open PO</th>
                        <th className="px-4 py-2.5 text-right">Price</th>
                        <th className="px-4 py-2.5">Order quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorRows.map((row) => (
                        <tr key={row.vendorItemId} className="border-b">
                          <td className="px-4 py-2.5">
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
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row.targetPar}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row.onHand.toFixed(1)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row.openPoQuantity}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            ${row.unitPrice.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5">
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
                    className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    placeholder="Manager notes"
                  />
                  <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 text-sm font-medium text-white transition hover:bg-[#343a32] disabled:cursor-not-allowed disabled:opacity-50">
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
      </PageBody>
    </>
  );
}
