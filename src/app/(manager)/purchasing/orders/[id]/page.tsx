import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  approvePurchaseOrderAction,
  cancelPurchaseOrderAction,
} from "@/app/(manager)/purchasing/actions";
import { getPurchaseOrderDetail, relatedName } from "@/lib/purchasing/queries";
import { Badge, PageBody, PageHeader, buttonClass } from "@/components/ui";

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
    <>
      <PageHeader
        breadcrumbs={[{ label: "Purchasing", href: "/purchasing" }]}
        title={relatedName(order.vendors)}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Ordered {order.order_date} · delivery{" "}
            {order.expected_delivery_date ?? "not scheduled"}
            <Badge>{order.status.replace("_", " ")}</Badge>
          </span>
        }
        actions={
          <>
            {order.status === "draft" && (
              <form action={approvePurchaseOrderAction.bind(null, order.id)}>
                <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 text-sm font-medium text-white transition hover:bg-[#343a32] disabled:cursor-not-allowed disabled:opacity-50">
                  Approve PO
                </button>
              </form>
            )}
            {order.status === "approved" && (
              <Link
                href={`/purchasing/orders/${order.id}/send`}
                className={buttonClass()}
              >
                Vendor output
              </Link>
            )}
          </>
        }
      />
      <PageBody>
        <div className="mt-5 overflow-x-auto rounded-lg border bg-[var(--surface-strong)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-[var(--surface)] text-left text-xs font-medium text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5">Pack</th>
                <th className="px-4 py-2.5 text-right">Ordered</th>
                <th className="px-4 py-2.5 text-right">Received</th>
                <th className="px-4 py-2.5 text-right">Unit price</th>
                <th className="px-4 py-2.5 text-right">Extended</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2.5 font-medium">
                    {relatedName(line.inventory_items)}
                  </td>
                  <td className="px-4 py-2.5">{line.pack_size}</td>
                  <td className="px-4 py-2.5 text-right">
                    {Number(line.quantity_ordered)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {Number(line.quantity_received)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    ${Number(line.unit_price).toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
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
                <td colSpan={5} className="px-4 py-2.5 text-right">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right">${total.toFixed(2)}</td>
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
      </PageBody>
    </>
  );
}
