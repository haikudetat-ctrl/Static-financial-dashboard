import type { Metadata } from "next";

import { submitCountAssignmentAction } from "@/app/(staff)/count/actions";
import { CountLineForm } from "@/components/inventory/count-line-form";
import { getUserContext } from "@/lib/auth/session";
import { formatInventoryQuantity } from "@/lib/inventory/counts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Count" };

export default async function CountPage() {
  const context = await getUserContext();
  if (!context) return null;
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("inventory_count_assignments")
    .select("id, status, storage_location_id, inventory_count_id")
    .eq("assigned_profile_id", context.user.id)
    .in("status", ["pending", "in_progress"])
    .order("created_at");

  const assignmentIds = (assignments ?? []).map((assignment) => assignment.id);
  const storageIds = (assignments ?? []).map(
    (assignment) => assignment.storage_location_id,
  );
  const [{ data: locations }, { data: lines }] = await Promise.all([
    storageIds.length
      ? supabase
          .from("storage_locations")
          .select("id, name, walk_order")
          .in("id", storageIds)
      : Promise.resolve({ data: [] }),
    assignmentIds.length
      ? supabase
          .from("inventory_count_lines")
          .select(
            "id, inventory_count_assignment_id, inventory_item_id, counted_quantity, counted_tenths, is_open_container, expected_quantity, notes, status",
          )
          .in("inventory_count_assignment_id", assignmentIds)
          .order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const itemIds = (lines ?? []).map((line) => line.inventory_item_id);
  const { data: items } = itemIds.length
    ? await supabase
        .from("inventory_items")
        .select("id, name, allows_tenths_counting, count_unit_id")
        .in("id", itemIds)
    : { data: [] };
  const unitIds = (items ?? [])
    .map((item) => item.count_unit_id)
    .filter((id): id is string => Boolean(id));
  const { data: units } = unitIds.length
    ? await supabase.from("units").select("id, abbreviation").in("id", unitIds)
    : { data: [] };

  const orderedAssignments = [...(assignments ?? [])].sort((left, right) => {
    const leftOrder =
      locations?.find((location) => location.id === left.storage_location_id)
        ?.walk_order ?? 0;
    const rightOrder =
      locations?.find((location) => location.id === right.storage_location_id)
        ?.walk_order ?? 0;
    return leftOrder - rightOrder;
  });

  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Assigned count
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
          Count what is here.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Work top to bottom. Expected quantities stay hidden until manager
          review.
        </p>

        {orderedAssignments.length === 0 ? (
          <div className="mt-8 border bg-[var(--surface-strong)] p-6">
            <p className="font-semibold">No count is assigned right now.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              New full and spot counts will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="mt-7 grid gap-6">
            {orderedAssignments.map((assignment) => {
              const location = locations?.find(
                (candidate) => candidate.id === assignment.storage_location_id,
              );
              const assignmentLines = (lines ?? []).filter(
                (line) => line.inventory_count_assignment_id === assignment.id,
              );
              const submitAction = submitCountAssignmentAction.bind(
                null,
                assignment.id,
              );

              return (
                <section key={assignment.id} className="border">
                  <header className="bg-[var(--foreground)] p-4 text-white">
                    <p className="font-mono text-[10px] tracking-[0.13em] text-[#bdc2bb] uppercase">
                      Walk order {location?.walk_order ?? "—"}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">
                      {location?.name ?? "Storage zone"}
                    </h2>
                  </header>
                  {assignmentLines.map((line) => {
                    const item = items?.find(
                      (candidate) => candidate.id === line.inventory_item_id,
                    );
                    const unit = units?.find(
                      (candidate) => candidate.id === item?.count_unit_id,
                    );
                    return (
                      <CountLineForm
                        key={line.id}
                        line={{
                          id: line.id,
                          name: item?.name ?? "Inventory item",
                          unit: unit?.abbreviation ?? "units",
                          allowsTenths: item?.allows_tenths_counting ?? false,
                          countedQuantity:
                            line.counted_quantity === null
                              ? null
                              : Number(line.counted_quantity),
                          countedTenths: Number(line.counted_tenths),
                          isOpenContainer: line.is_open_container,
                          notes: line.notes,
                          status: line.status,
                          expectedQuantity: `${formatInventoryQuantity(
                            Number(line.expected_quantity),
                          )} ${unit?.abbreviation ?? "units"}`,
                        }}
                      />
                    );
                  })}
                  <form action={submitAction} className="border-t p-4">
                    <button className="min-h-12 w-full border-2 border-[var(--foreground)] px-4 text-sm font-semibold">
                      Submit {location?.name ?? "assignment"}
                    </button>
                  </form>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
