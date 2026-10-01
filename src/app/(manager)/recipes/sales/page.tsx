import type { Metadata } from "next";

import { postSalesImportAction } from "@/app/(manager)/recipes/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getSalesWorkspace } from "@/lib/recipes/queries";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Sales posting" };

export default async function RecipeSalesPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const workspace = await getSalesWorkspace(context.organizationId, locationId);

  return (
    <>
      <PageHeader
        title="Sales posting"
        description="Post Toast sales days to revenue and theoretical usage"
      />
      <SectionNav section="recipes" active="/recipes/sales" />
      <PageBody>
        <section className="mt-7">
          <h2 className="text-lg font-semibold">Toast PMIX imports</h2>
          <div className="mt-3 grid gap-3">
            {workspace.imports.map((sourceImport) => (
              <div
                key={sourceImport.id}
                className="flex flex-col justify-between gap-4 border bg-white p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-semibold">{sourceImport.file_name}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {sourceImport.row_count} rows · {sourceImport.status} ·{" "}
                    {sourceImport.unmappedCount} unmapped GUIDs
                  </p>
                </div>
                {["staged", "mapping"].includes(sourceImport.status) && (
                  <form
                    action={postSalesImportAction.bind(null, sourceImport.id)}
                  >
                    <button
                      disabled={sourceImport.unmappedCount > 0}
                      className="min-h-11 bg-[var(--foreground)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Post sales
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Posted business days</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border bg-[var(--surface-strong)]">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b bg-[var(--surface)] text-left text-xs font-medium text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2.5">Business date</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Net sales</th>
                  <th className="px-4 py-2.5">Posted</th>
                </tr>
              </thead>
              <tbody>
                {workspace.days.map((day) => (
                  <tr key={day.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">
                      {day.business_date}
                    </td>
                    <td className="px-4 py-2.5 capitalize">{day.status}</td>
                    <td className="px-4 py-2.5 text-right">
                      {Number(day.net_sales).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </td>
                    <td className="p-3 text-xs text-[var(--muted)]">
                      {new Date(day.posted_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </PageBody>
    </>
  );
}
