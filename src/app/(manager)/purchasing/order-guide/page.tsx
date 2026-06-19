import type { Metadata } from "next";

import { updateOrderGuideParAction } from "@/app/(manager)/purchasing/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getSuggestedOrder } from "@/lib/purchasing/queries";

export const metadata: Metadata = { title: "Order guide" };

export default async function OrderGuidePage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const rows = await getSuggestedOrder(context.organizationId, locationId);

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Purchasing · order guide
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Keep the buying rules explicit.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Pars are expressed in the vendor purchase unit. Posted inventory is
          converted before suggestions are calculated.
        </p>
        <div className="mt-7 overflow-x-auto border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
              <tr>
                <th className="p-3">Vendor item</th>
                <th className="p-3">Code</th>
                <th className="p-3">Pack</th>
                <th className="p-3 text-right">Latest price</th>
                <th className="p-3">Target par</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.orderGuideItemId} className="border-b bg-white">
                  <td className="p-3">
                    <p className="font-semibold">{row.itemName}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {row.vendorName}
                    </p>
                  </td>
                  <td className="p-3 font-mono text-xs">{row.productCode}</td>
                  <td className="p-3">{row.packSize}</td>
                  <td className="p-3 text-right tabular-nums">
                    {row.unitPrice.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </td>
                  <td className="p-3">
                    <form
                      action={updateOrderGuideParAction}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="hidden"
                        name="order_guide_item_id"
                        value={row.orderGuideItemId}
                      />
                      <input
                        className="w-24 border bg-[var(--surface)] px-3 py-2 tabular-nums"
                        type="number"
                        min="0"
                        step="0.1"
                        name="default_par"
                        defaultValue={row.targetPar}
                        aria-label={`${row.itemName} target par`}
                      />
                      <button className="min-h-10 border px-3 text-xs font-semibold">
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
