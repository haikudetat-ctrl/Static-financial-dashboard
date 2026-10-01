import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getPurchasingSpend } from "@/lib/reporting/queries";
import { createClient } from "@/lib/supabase/server";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";

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
    <>
      <PageHeader title="Purchasing reports" />
      <SectionNav section="purchasing" active="/purchasing/reports" />
      <PageBody>
        <div className="mt-8 grid border-x sm:grid-cols-4">
          <div className="border-b bg-[var(--surface)] p-5 sm:border-r">
            <p className="text-xs font-medium text-[var(--muted)]">
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
            <p className="text-xs font-medium text-[var(--muted)]">Open POs</p>
            <p className="mt-3 text-2xl font-semibold">{openPOs.length}</p>
          </div>
          <div className="border-b bg-[var(--surface)] p-5 sm:border-r">
            <p className="text-xs font-medium text-[var(--muted)]">
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
            <p className="text-xs font-medium text-[var(--muted)]">
              Open commitment
            </p>
            <p className="mt-3 text-2xl font-semibold">{openCommitment}</p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">Recent invoices</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border bg-[var(--surface-strong)]">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b bg-[var(--surface)] text-left text-xs font-medium text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2.5">Vendor</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Freight</th>
                  <th className="px-4 py-2.5 text-right">Discount</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {(invoices ?? []).map((inv) => (
                  <tr key={inv.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">
                      {(inv.vendors as { name: string }[] | null)?.[0]?.name ??
                        "Vendor"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      ${Number(inv.total_amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      ${Number(inv.freight_amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      ${Number(inv.discount_amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 capitalize">{inv.status}</td>
                  </tr>
                ))}
                {(!invoices || invoices.length === 0) && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                    >
                      No invoices yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </PageBody>
    </>
  );
}
