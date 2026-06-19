import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  approvePurchaseOrderAction,
  cancelPurchaseOrderAction,
} from "@/app/(manager)/purchasing/actions";
import { getPurchaseOrderDetail, relatedName } from "@/lib/purchasing/queries";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getPurchaseOrderDetail(id);
  if (!order) notFound();
  const total = order.lines.reduce(
    (sum, line) =>
      sum + Number(line.quantity_ordered) * Number(line.unit_price),
    0,
  );

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Purchase order · {order.status.replace("_", " ")}
        </p>
        <div className="mt-2 flex flex-col justify-between gap-5 border-b pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em]">
              {relatedName(order.vendors)}
            </h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Ordered {order.order_date} · delivery{" "}
              {order.expected_delivery_date ?? "not scheduled"}
            </p>
          </div>
          <div className="flex gap-2">
            {order.status === "draft" && (
              <form action={approvePurchaseOrderAction.bind(null, order.id)}>
                <button className="min-h-11 bg-[var(--foreground)] px-5 text-sm font-semibold text-white">
                  Approve PO
                </button>
              </form>
            )}
            {order.status === "approved" && (
              <Link
                href={`/purchasing/orders/${order.id}/send`}
                className="inline-flex min-h-11 items-center border px-5 text-sm font-semibold"
              >
                Vendor output
              </Link>
            )}
          </div>
        </div>
        <div className="mt-7 overflow-x-auto border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
              <tr>
                <th className="p-3">Item</th>
                <th className="p-3">Pack</th>
                <th className="p-3 text-right">Ordered</th>
                <th className="p-3 text-right">Received</th>
                <th className="p-3 text-right">Unit price</th>
                <th className="p-3 text-right">Extended</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id} className="border-b bg-white">
                  <td className="p-3 font-semibold">
                    {relatedName(line.inventory_items)}
                  </td>
                  <td className="p-3">{line.pack_size}</td>
                  <td className="p-3 text-right">
                    {Number(line.quantity_ordered)}
                  </td>
                  <td className="p-3 text-right">
                    {Number(line.quantity_received)}
                  </td>
                  <td className="p-3 text-right">
                    ${Number(line.unit_price).toFixed(2)}
                  </td>
                  <td className="p-3 text-right">
                    $
                    {(
                      Number(line.quantity_ordered) * Number(line.unit_price)
                    ).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--surface)] font-semibold">
                <td colSpan={5} className="p-3 text-right">
                  Total
                </td>
                <td className="p-3 text-right">${total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {order.manager_notes && (
          <p className="mt-5 border-l-2 border-[var(--accent)] pl-4 text-sm">
            {order.manager_notes}
          </p>
        )}
        {["draft", "approved"].includes(order.status) && (
          <form
            action={cancelPurchaseOrderAction.bind(null, order.id)}
            className="mt-8"
          >
            <button className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4">
              Cancel purchase order
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
