import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getRecipeCurrentCost, getRecipeDetail } from "@/lib/recipes/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recipe cost" };

export default async function RecipeCostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getUserContext();
  if (!context?.organizationId) notFound();
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) notFound();
  const [detail, currentCost] = await Promise.all([
    getRecipeDetail(context.organizationId, id),
    getRecipeCurrentCost(context.organizationId, locationId, id),
  ]);
  if (!detail) notFound();
  const { cost, expanded } = currentCost;

  const supabase = await createClient();
  const itemIds = expanded.map((row) => row.inventoryItemId);
  let items: Array<{ id: string; name: string; base_unit_id: string | null }> =
    [];
  let onHand: Array<{
    inventory_item_id: string;
    quantity: number;
    extended_value: number;
  }> = [];
  if (itemIds.length) {
    const [itemsRes, onHandRes] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("id, name, base_unit_id")
        .in("id", itemIds),
      supabase
        .from("inventory_on_hand")
        .select("inventory_item_id, quantity, extended_value")
        .eq("organization_id", context.organizationId)
        .eq("location_id", locationId)
        .in("inventory_item_id", itemIds),
    ]);
    items = itemsRes.data ?? [];
    onHand = onHandRes.data ?? [];
  }
  const unitIds = items.map((item) => item.base_unit_id).filter(Boolean);
  let units: Array<{ id: string; abbreviation: string }> = [];
  if (unitIds.length) {
    const unitRes = await supabase
      .from("units")
      .select("id, abbreviation")
      .in("id", unitIds);
    units = unitRes.data ?? [];
  }

  const costed = expanded
    .map((row) => {
      const item = items.find((i) => i.id === row.inventoryItemId);
      const itemOnHand = onHand.filter(
        (oh) => oh.inventory_item_id === row.inventoryItemId,
      );
      const totalQty = itemOnHand.reduce((s, oh) => s + Number(oh.quantity), 0);
      const totalVal = itemOnHand.reduce(
        (s, oh) => s + Number(oh.extended_value),
        0,
      );
      const unitCost = totalQty === 0 ? 0 : totalVal / totalQty;
      const unit = units.find((u) => u.id === item?.base_unit_id);
      return {
        name: item?.name ?? "Inventory item",
        unit: unit?.abbreviation ?? "base",
        quantityBase: row.quantityBase,
        unitCost,
        lineCost: row.quantityBase * unitCost,
        pct: 0,
      };
    })
    .map((row) => ({
      ...row,
      pct: cost > 0 ? (row.lineCost / cost) * 100 : 0,
    }))
    .sort((a, b) => b.lineCost - a.lineCost);

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Recipe cost · {detail.recipe.name}
        </p>
        <div className="mt-2 flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em]">
              Cost breakdown
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
              Expanded to purchased ingredients at current WAC. Nested prep
              recipes are flattened into base components.
            </p>
          </div>
          <Link
            href={`/recipes/${id}`}
            className="text-sm underline underline-offset-4"
          >
            Back to recipe
          </Link>
        </div>

        <div className="mt-7 border bg-white p-6">
          <div className="flex items-end justify-between">
            <p className="font-mono text-[10px] tracking-[0.13em] text-[var(--muted)] uppercase">
              Total cost per unit
            </p>
            <p className="text-3xl font-semibold tracking-[-0.04em]">
              {cost.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
              <tr>
                <th className="p-3">Ingredient</th>
                <th className="p-3 text-right">Quantity (base)</th>
                <th className="p-3 text-right">Unit cost</th>
                <th className="p-3 text-right">Line cost</th>
                <th className="p-3 text-right">% of total</th>
              </tr>
            </thead>
            <tbody>
              {costed.map((row) => (
                <tr key={row.name} className="border-b bg-white">
                  <td className="p-3 font-semibold">{row.name}</td>
                  <td className="p-3 text-right tabular-nums">
                    {row.quantityBase.toFixed(4)} {row.unit}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {row.unitCost.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {row.lineCost.toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {row.pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
              {costed.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center text-[var(--muted)]"
                  >
                    No active recipe version has costable components.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {costed.length > 0 && (
          <div className="mt-5">
            <p className="font-mono text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
              Cost distribution
            </p>
            <div className="mt-2 flex h-6 overflow-hidden border">
              {costed
                .filter((row) => row.pct > 0)
                .map((row) => (
                  <div
                    key={row.name}
                    style={{ width: `${row.pct}%` }}
                    className="flex items-center justify-center bg-[var(--accent)] text-[9px] text-white"
                    title={`${row.name}: ${row.pct.toFixed(1)}%`}
                  >
                    {row.pct > 8 ? row.name.substring(0, 6) : null}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
