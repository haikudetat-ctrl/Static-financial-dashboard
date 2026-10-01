import type { Metadata } from "next";
import Link from "next/link";

import { SectionNav } from "@/components/layout/section-nav";
import {
  ButtonLink,
  PageBody,
  PageHeader,
  Panel,
  StatGrid,
  StatTile,
  formatMoney,
} from "@/components/ui";
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
    <>
      <PageHeader
        title="Purchasing"
        description="Orders, receiving and vendor costs"
        actions={
          <ButtonLink href="/purchasing/suggested-order" variant="primary">
            Build suggested order
          </ButtonLink>
        }
      />
      <SectionNav section="purchasing" active="/purchasing" />
      <PageBody>
        <StatGrid>
          <StatTile label="Open orders" value={summary.openPoCount} />
          <StatTile
            label="Open commitment"
            value={formatMoney(summary.openCommitment, { cents: false })}
          />
          <StatTile
            label="Receipts to review"
            value={summary.receiptReviewCount}
            tone={summary.receiptReviewCount > 0 ? "warning" : "neutral"}
            href="/receiving/review"
          />
          <StatTile
            label="Invoices to review"
            value={summary.invoiceReviewCount}
            tone={summary.invoiceReviewCount > 0 ? "warning" : "neutral"}
            href="/invoices/upload"
          />
        </StatGrid>

        <Panel title="Purchase orders" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b bg-[var(--surface)] text-left text-xs font-medium text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2.5">Vendor</th>
                  <th className="px-4 py-2.5">Order date</th>
                  <th className="px-4 py-2.5">Delivery</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
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
                    <tr key={order.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">
                        <Link
                          href={`/purchasing/orders/${order.id}`}
                          className="underline decoration-[var(--line)] underline-offset-4"
                        >
                          {relatedName(order.vendors)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">{order.order_date}</td>
                      <td className="px-4 py-2.5">
                        {order.expected_delivery_date ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 capitalize">
                        {order.status.replace("_", " ")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
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
                      className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                    >
                      No purchase orders yet. Start with the suggested order.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
