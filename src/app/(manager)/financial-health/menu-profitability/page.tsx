import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getMenuProfitability, getPeriods } from "@/lib/reporting/queries";
import { getRecipeCurrentCost } from "@/lib/recipes/queries";

export const metadata: Metadata = { title: "Menu profitability" };

export default async function MenuProfitabilityPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const periods = await getPeriods(context.organizationId, locationId);
  const latest = periods[0];
  if (!latest) {
    return (
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
            Menu profitability
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
            Create an inventory period first.
          </h1>
        </div>
      </div>
    );
  }

  const { sales, mappings } = await getMenuProfitability(
    context.organizationId,
    locationId,
  );

  const mappedCosts = new Map<string, { name: string; cost: number }>();
  for (const mapping of mappings ?? []) {
    const currentCost = await getRecipeCurrentCost(
      context.organizationId,
      locationId,
      mapping.recipe_id,
    );
    mappedCosts.set(mapping.external_item_guid, {
      name:
        (Array.isArray(mapping.recipes) ? mapping.recipes[0] : mapping.recipes)
          ?.name ?? "Recipe",
      cost: currentCost.cost,
    });
  }

  const profitable = sales
    .map((sale) => {
      const mapping = mappings?.find(
        (m) => m.external_item_guid === sale.toast_item_guid,
      );
      const cost = mapping
        ? (mappedCosts.get(sale.toast_item_guid)?.cost ?? 0)
        : null;
      const netSales = Number(sale.net_sales);
      const qty = Number(sale.quantity_sold);
      const recipeCost = cost !== null ? cost * qty : null;
      const costPct =
        recipeCost !== null && netSales > 0
          ? (recipeCost / netSales) * 100
          : null;
      const contribution = recipeCost !== null ? netSales - recipeCost : null;
      return {
        name: sale.item_name,
        qty,
        netSales,
        recipeCost,
        costPct,
        contribution,
        mapped: cost !== null,
      };
    })
    .sort((a, b) => b.netSales - a.netSales);

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Menu profitability · {latest.periodStart}–{latest.periodEnd}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Trace every dollar through the recipe.
        </h1>
        <div className="mt-7 overflow-x-auto border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
              <tr>
                <th className="p-3">Menu item</th>
                <th className="p-3 text-right">Sold</th>
                <th className="p-3 text-right">Net sales</th>
                <th className="p-3 text-right">Recipe cost</th>
                <th className="p-3 text-right">Cost %</th>
                <th className="p-3 text-right">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {profitable.map((row) => (
                <tr
                  key={row.name}
                  className={`border-b bg-white ${
                    !row.mapped ? "bg-[#fff4eb]" : ""
                  }`}
                >
                  <td className="p-3 font-semibold">
                    {row.name}
                    {!row.mapped && (
                      <span className="ml-2 font-mono text-[10px] text-[var(--accent-strong)]">
                        Unmapped
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums">{row.qty}</td>
                  <td className="p-3 text-right tabular-nums">
                    ${row.netSales.toFixed(2)}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {row.recipeCost !== null
                      ? `$${row.recipeCost.toFixed(2)}`
                      : "\u2014"}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {row.costPct !== null
                      ? `${row.costPct.toFixed(1)}%`
                      : "\u2014"}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {row.contribution !== null
                      ? `$${row.contribution.toFixed(2)}`
                      : "\u2014"}
                  </td>
                </tr>
              ))}
              {profitable.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-[var(--muted)]"
                  >
                    No sales data for the current period.
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
