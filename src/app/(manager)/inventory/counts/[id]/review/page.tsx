import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  approveInventoryCountLineAction,
  approveInventoryCountAction,
  requestRecountAction,
} from "@/app/(manager)/inventory/counts/actions";
import {
  calculateVariance,
  countedTotal,
  formatInventoryQuantity,
  isMaterialVariance,
} from "@/lib/inventory/counts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Count review" };

export default async function CountReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: count } = await supabase
    .from("inventory_counts")
    .select(
      "id, inventory_period_id, count_type, status, created_at, approved_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!count) notFound();

  const { data: assignments } = await supabase
    .from("inventory_count_assignments")
    .select("id, storage_location_id, status")
    .eq("inventory_count_id", id);
  const assignmentIds = (assignments ?? []).map((assignment) => assignment.id);
  const { data: lines } = assignmentIds.length
    ? await supabase
        .from("inventory_count_lines")
        .select(
          "id, inventory_count_assignment_id, inventory_item_id, storage_location_id, counted_quantity, counted_tenths, is_open_container, expected_quantity, notes, status, approved_by, approved_at",
        )
        .in("inventory_count_assignment_id", assignmentIds)
    : { data: [] };
  const itemIds = (lines ?? []).map((line) => line.inventory_item_id);
  const storageIds = (assignments ?? []).map(
    (assignment) => assignment.storage_location_id,
  );
  const [{ data: items }, { data: locations }] = await Promise.all([
    itemIds.length
      ? supabase
          .from("inventory_items")
          .select("id, name, count_unit_id, base_unit_id")
          .in("id", itemIds)
      : Promise.resolve({ data: [] }),
    storageIds.length
      ? supabase
          .from("storage_locations")
          .select("id, name, walk_order")
          .in("id", storageIds)
      : Promise.resolve({ data: [] }),
  ]);
  const unitIds = (items ?? [])
    .flatMap((item) => [item.count_unit_id, item.base_unit_id])
    .filter((unitId): unitId is string => Boolean(unitId));
  const [{ data: units }, { data: costSnapshots }] = await Promise.all([
    unitIds.length
      ? supabase
          .from("units")
          .select("id, abbreviation, conversion_factor_to_base")
          .in("id", unitIds)
      : Promise.resolve({ data: [] }),
    itemIds.length
      ? supabase
          .from("inventory_item_cost_snapshots")
          .select("inventory_item_id, weighted_average_cost, effective_at")
          .eq("inventory_period_id", count.inventory_period_id)
          .in("inventory_item_id", itemIds)
          .order("effective_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const approveAction = approveInventoryCountAction.bind(null, id);

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-5 border-b pb-6 lg:flex-row lg:items-end">
          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
              {count.count_type} count · {count.status.replace("_", " ")}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
              Review the physical truth.
            </h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Expected quantities are visible here only. Material variance is
              highlighted at ±1 unit or ±$10.
            </p>
          </div>
          {count.status === "counted" && (
            <form action={approveAction}>
              <button className="min-h-12 bg-[var(--foreground)] px-6 text-sm font-semibold text-white">
                Approve and post
              </button>
            </form>
          )}
        </div>

        <div className="mt-7 grid gap-6">
          {[...(assignments ?? [])]
            .sort((left, right) => {
              const leftOrder =
                locations?.find(
                  (location) => location.id === left.storage_location_id,
                )?.walk_order ?? 0;
              const rightOrder =
                locations?.find(
                  (location) => location.id === right.storage_location_id,
                )?.walk_order ?? 0;
              return leftOrder - rightOrder;
            })
            .map((assignment) => {
              const location = locations?.find(
                (candidate) => candidate.id === assignment.storage_location_id,
              );
              return (
                <section key={assignment.id} className="border">
                  <header className="flex items-center justify-between bg-[var(--surface)] p-4">
                    <h2 className="text-lg font-semibold">
                      {location?.name ?? "Storage zone"}
                    </h2>
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase">
                      {assignment.status}
                    </span>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-sm">
                      <thead>
                        <tr className="border-y bg-white text-left font-mono text-[10px] tracking-[0.1em] text-[var(--muted)] uppercase">
                          <th className="p-3">Item</th>
                          <th className="p-3 text-right">Expected</th>
                          <th className="p-3 text-right">Counted</th>
                          <th className="p-3 text-right">Qty variance</th>
                          <th className="p-3 text-right">WAC</th>
                          <th className="p-3 text-right">$ variance</th>
                          <th className="p-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(lines ?? [])
                          .filter(
                            (line) =>
                              line.inventory_count_assignment_id ===
                              assignment.id,
                          )
                          .map((line) => {
                            const item = items?.find(
                              (candidate) =>
                                candidate.id === line.inventory_item_id,
                            );
                            const counted =
                              line.counted_quantity === null
                                ? 0
                                : countedTotal({
                                    countedQuantity: Number(
                                      line.counted_quantity,
                                    ),
                                    countedTenths: Number(line.counted_tenths),
                                    isOpenContainer: line.is_open_container,
                                  });
                            const countUnit = units?.find(
                              (unit) => unit.id === item?.count_unit_id,
                            );
                            const unitCost = Number(
                              costSnapshots?.find(
                                (snapshot) =>
                                  snapshot.inventory_item_id ===
                                  line.inventory_item_id,
                              )?.weighted_average_cost ?? 0,
                            );
                            const variance = calculateVariance({
                              expectedQuantity: Number(line.expected_quantity),
                              countedQuantity: counted,
                              unitCost,
                              conversionFactorToBase: Number(
                                countUnit?.conversion_factor_to_base ?? 1,
                              ),
                            });
                            const material = isMaterialVariance(variance, {
                              quantity: 1,
                              value: 10,
                            });
                            const recountAction = requestRecountAction.bind(
                              null,
                              line.id,
                            );
                            const approveLineAction =
                              approveInventoryCountLineAction.bind(
                                null,
                                count.id,
                                line.id,
                              );

                            return (
                              <tr
                                key={line.id}
                                className={`border-b ${material ? "bg-[#fff4eb]" : "bg-white"}`}
                              >
                                <td className="p-3 font-semibold">
                                  {item?.name ?? "Inventory item"}
                                </td>
                                <td className="p-3 text-right tabular-nums">
                                  {formatInventoryQuantity(
                                    Number(line.expected_quantity),
                                  )}
                                </td>
                                <td className="p-3 text-right tabular-nums">
                                  {formatInventoryQuantity(counted)}
                                </td>
                                <td className="p-3 text-right tabular-nums">
                                  {formatInventoryQuantity(
                                    variance.quantityVariance,
                                  )}
                                </td>
                                <td className="p-3 text-right tabular-nums">
                                  {unitCost.toLocaleString("en-US", {
                                    style: "currency",
                                    currency: "USD",
                                  })}
                                  <span className="block text-[10px] text-[var(--muted)]">
                                    per base unit
                                  </span>
                                </td>
                                <td className="p-3 text-right tabular-nums">
                                  {variance.valueVariance.toLocaleString(
                                    "en-US",
                                    {
                                      style: "currency",
                                      currency: "USD",
                                    },
                                  )}
                                </td>
                                <td className="p-3">
                                  <div className="flex gap-2">
                                    {line.approved_at ? (
                                      <span className="bg-[#e8f0eb] px-3 py-2 text-xs font-semibold text-[var(--success)]">
                                        Approved
                                      </span>
                                    ) : (
                                      <form action={approveLineAction}>
                                        <button className="border px-3 py-2 text-xs font-semibold">
                                          Approve line
                                        </button>
                                      </form>
                                    )}
                                    <form action={recountAction}>
                                      <button className="border px-3 py-2 text-xs font-semibold">
                                        Request recount
                                      </button>
                                    </form>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
        </div>
      </div>
    </div>
  );
}
