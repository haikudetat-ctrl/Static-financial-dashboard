import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getPurchasingSpend } from "@/lib/reporting/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Purchasing reports" };

export default async function PurchasingReportsPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const { openPOs } = await getPurchasingSpend(
    context.organizationId,
    locationId,
  );
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, vendor_id, total_amount, discount_amount, freight_amount, tax_amount, status, vendors(name)",
    )
    .eq("organization_id", context.organizationId)
    .eq("location_id", locationId)
    .order("created_at", { ascending: false })
    .limit(50);
  const openCommitment = (openPOs ?? []).reduce((sum) => sum + 0, 0);
  const totalInvoiceAmount = (invoices ?? []).reduce(
    (sum, inv) => sum + Number(inv.total_amount),
    0,
  );
  const totalFreight = (invoices ?? []).reduce(
    (sum, inv) => sum + Number(inv.freight_amount),
    0,
  );

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Purchasing reports
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Know where the money went.
        </h1>

        <div className="mt-8 grid border-x sm:grid-cols-4">
          <div className="border-b bg-[var(--surface)] p-5 sm:border-r">
            <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--muted)] uppercase">
              Total invoiced
            </p>
            <p className="mt-3 text-2xl font-semibold">
              $
              {totalInvoiceAmount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="border-b bg-[var(--surface)] p-5 sm:border-r">
            <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--muted)] uppercase">
              Open POs
            </p>
            <p className="mt-3 text-2xl font-semibold">{openPOs.length}</p>
          </div>
          <div className="border-b bg-[var(--surface)] p-5 sm:border-r">
            <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--muted)] uppercase">
              Freight charges
            </p>
            <p className="mt-3 text-2xl font-semibold">
              $
              {totalFreight.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="border-b bg-[var(--surface)] p-5">
            <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--muted)] uppercase">
              Open commitment
            </p>
            <p className="mt-3 text-2xl font-semibold">{openCommitment}</p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">Recent invoices</h2>
          <div className="mt-3 overflow-x-auto border">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
                <tr>
                  <th className="p-3">Vendor</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Freight</th>
                  <th className="p-3 text-right">Discount</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {(invoices ?? []).map((inv) => (
                  <tr key={inv.id} className="border-b bg-white">
                    <td className="p-3 font-semibold">
                      {(inv.vendors as { name: string }[] | null)?.[0]?.name ??
                        "Vendor"}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      ${Number(inv.total_amount).toFixed(2)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      ${Number(inv.freight_amount).toFixed(2)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      ${Number(inv.discount_amount).toFixed(2)}
                    </td>
                    <td className="p-3 capitalize">{inv.status}</td>
                  </tr>
                ))}
                {(!invoices || invoices.length === 0) && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 text-center text-[var(--muted)]"
                    >
                      No invoices yet.
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
