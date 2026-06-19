import type { Metadata } from "next";

import { postSalesImportAction } from "@/app/(manager)/recipes/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getSalesWorkspace } from "@/lib/recipes/queries";

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
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Recipes · sales posting
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Post sales only when every item can expand.
        </h1>
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
          <div className="mt-3 overflow-x-auto border">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
                <tr>
                  <th className="p-3">Business date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Net sales</th>
                  <th className="p-3">Posted</th>
                </tr>
              </thead>
              <tbody>
                {workspace.days.map((day) => (
                  <tr key={day.id} className="border-b bg-white">
                    <td className="p-3 font-semibold">{day.business_date}</td>
                    <td className="p-3 capitalize">{day.status}</td>
                    <td className="p-3 text-right">
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
      </div>
    </div>
  );
}
