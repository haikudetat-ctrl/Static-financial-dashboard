import type { Metadata } from "next";
import Link from "next/link";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import {
  getPurchaseOrders,
  getPurchasingSummary,
  relatedName,
} from "@/lib/purchasing/queries";

export const metadata: Metadata = { title: "Purchasing" };

export default async function PurchasingPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const [summary, orders] = await Promise.all([
    getPurchasingSummary(context.organizationId, locationId),
    getPurchaseOrders(context.organizationId, locationId),
  ]);

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Purchasing
        </p>
        <div className="mt-2 flex flex-col justify-between gap-5 border-b pb-7 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Order with the whole picture.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Pars, posted on-hand, open commitments, receipts, and invoice
              costs now meet in one traceable workflow.
            </p>
          </div>
          <Link
            href="/purchasing/suggested-order"
            className="inline-flex min-h-12 items-center justify-center bg-[var(--foreground)] px-6 text-sm font-semibold text-white"
          >
            Build suggested order
          </Link>
        </div>

        <div className="grid border-x sm:grid-cols-4">
          <Metric label="Open POs" value={String(summary.openPoCount)} />
          <Metric
            label="Open commitment"
            value={summary.openCommitment.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          />
          <Metric
            label="Receipt reviews"
            value={String(summary.receiptReviewCount)}
          />
          <Metric
            label="Invoice reviews"
            value={String(summary.invoiceReviewCount)}
          />
        </div>

        <div className="mt-8 grid gap-px border bg-[var(--line)] sm:grid-cols-4">
          <WorkspaceLink
            href="/purchasing/order-guide"
            title="Order guide"
            detail="Maintain vendor items, pars, packs, and latest cost."
          />
          <WorkspaceLink
            href="/receiving/review"
            title="Receiving review"
            detail="Resolve shortages, substitutions, damage, and unknown items."
          />
          <WorkspaceLink
            href="/invoices/upload"
            title="Invoice review"
            detail="Stage vendor invoices, inspect anomalies, and post cost."
          />
          <WorkspaceLink
            href="/purchasing/reports"
            title="Reports"
            detail="Spend by vendor, open POs, freight charges, and trend."
          />
        </div>

        <section className="mt-9">
          <h2 className="text-xl font-semibold tracking-[-0.025em]">
            Purchase orders
          </h2>
          <div className="mt-4 overflow-x-auto border">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
                <tr>
                  <th className="p-3">Vendor</th>
                  <th className="p-3">Order date</th>
                  <th className="p-3">Delivery</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const lines = order.purchase_order_lines as Array<{
                    quantity_ordered: number | string;
                    unit_price: number | string;
                  }>;
                  const total = lines.reduce(
                    (sum, line) =>
                      sum +
                      Number(line.quantity_ordered) * Number(line.unit_price),
                    0,
                  );
                  return (
                    <tr key={order.id} className="border-b bg-white">
                      <td className="p-3 font-semibold">
                        <Link
                          href={`/purchasing/orders/${order.id}`}
                          className="underline decoration-[var(--line)] underline-offset-4"
                        >
                          {relatedName(order.vendors)}
                        </Link>
                      </td>
                      <td className="p-3">{order.order_date}</td>
                      <td className="p-3">
                        {order.expected_delivery_date ?? "—"}
                      </td>
                      <td className="p-3 capitalize">
                        {order.status.replace("_", " ")}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {total.toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                        })}
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 text-center text-[var(--muted)]"
                    >
                      No purchase orders yet. Start with the suggested order.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b bg-[var(--surface)] p-5 sm:border-r sm:last:border-r-0">
      <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--muted)] uppercase">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{value}</p>
    </div>
  );
}

function WorkspaceLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link href={href} className="bg-white p-5 hover:bg-[#f8f1ea]">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</p>
    </Link>
  );
}
