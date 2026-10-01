import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getTheoreticalUsage, relatedName } from "@/lib/recipes/queries";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Theoretical usage" };

function relatedItemName(
  value: { item_name: string } | { item_name: string }[] | null,
) {
  return (Array.isArray(value) ? value[0] : value)?.item_name ?? "";
}

export default async function TheoreticalUsagePage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const rows = await getTheoreticalUsage(context.organizationId, locationId);

  return (
    <>
      <PageHeader
        title="Theoretical usage"
        description={
          <>
            These rows expand the recipe version effective on the business date.
            They never create inventory ledger movements.
          </>
        }
      />
      <SectionNav section="recipes" active="/recipes/theoretical-usage" />
      <PageBody>
        <div className="mt-5 overflow-x-auto rounded-lg border bg-[var(--surface-strong)]">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b bg-[var(--surface)] text-left text-xs font-medium text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Menu item</th>
                <th className="px-4 py-2.5">Recipe</th>
                <th className="px-4 py-2.5">Inventory item</th>
                <th className="px-4 py-2.5 text-right">Quantity</th>
                <th className="px-4 py-2.5 text-right">Unit cost</th>
                <th className="px-4 py-2.5 text-right">Theoretical cost</th>
                <th className="px-4 py-2.5">Run</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const run = Array.isArray(row.calculation_runs)
                  ? row.calculation_runs[0]
                  : row.calculation_runs;
                return (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5">{row.business_date}</td>
                    <td className="px-4 py-2.5">
                      {relatedItemName(row.sales_items)}
                    </td>
                    <td className="px-4 py-2.5">{relatedName(row.recipes)}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {relatedName(row.inventory_items)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {Number(row.quantity_base).toFixed(3)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      ${Number(row.unit_cost).toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      ${Number(row.theoretical_cost).toFixed(2)}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {run?.calculation_version ?? "—"} · {run?.status ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                  >
                    Post a mapped Toast PMIX import to calculate usage.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}
