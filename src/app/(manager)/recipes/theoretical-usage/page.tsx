import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getTheoreticalUsage, relatedName } from "@/lib/recipes/queries";

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
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Recipes · theoretical usage
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Sales explain ingredient demand, not physical stock.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          These rows expand the recipe version effective on the business date.
          They never create inventory ledger movements.
        </p>
        <div className="mt-7 overflow-x-auto border">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Menu item</th>
                <th className="p-3">Recipe</th>
                <th className="p-3">Inventory item</th>
                <th className="p-3 text-right">Quantity</th>
                <th className="p-3 text-right">Unit cost</th>
                <th className="p-3 text-right">Theoretical cost</th>
                <th className="p-3">Run</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const run = Array.isArray(row.calculation_runs)
                  ? row.calculation_runs[0]
                  : row.calculation_runs;
                return (
                  <tr key={row.id} className="border-b bg-white">
                    <td className="p-3">{row.business_date}</td>
                    <td className="p-3">{relatedItemName(row.sales_items)}</td>
                    <td className="p-3">{relatedName(row.recipes)}</td>
                    <td className="p-3 font-semibold">
                      {relatedName(row.inventory_items)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(row.quantity_base).toFixed(3)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      ${Number(row.unit_cost).toFixed(4)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
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
                    className="p-8 text-center text-[var(--muted)]"
                  >
                    Post a mapped Toast PMIX import to calculate usage.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
