import type { Metadata } from "next";

import { updateOrderGuideParAction } from "@/app/(manager)/purchasing/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getSuggestedOrder } from "@/lib/purchasing/queries";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";

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
    <>
      <PageHeader
        title="Order guide"
        description={
          <>
            Pars are expressed in the vendor purchase unit. Posted inventory is
            converted before suggestions are calculated.
          </>
        }
      />
      <SectionNav section="purchasing" active="/purchasing/order-guide" />
      <PageBody>
        <div className="mt-5 overflow-x-auto rounded-lg border bg-[var(--surface-strong)]">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-[var(--surface)] text-left text-xs font-medium text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2.5">Vendor item</th>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Pack</th>
                <th className="px-4 py-2.5 text-right">Latest price</th>
                <th className="px-4 py-2.5">Target par</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.orderGuideItemId}
                  className="border-b last:border-b-0"
                >
                  <td className="px-4 py-2.5">
                    <p className="font-semibold">{row.itemName}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {row.vendorName}
                    </p>
                  </td>
                  <td className="p-3 font-mono text-xs">{row.productCode}</td>
                  <td className="px-4 py-2.5">{row.packSize}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.unitPrice.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
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
      </PageBody>
    </>
  );
}
