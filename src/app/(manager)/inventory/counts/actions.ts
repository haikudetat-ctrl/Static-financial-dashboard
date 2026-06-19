"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { filterCountItems } from "@/lib/inventory/counts";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";

function monthBounds(date = new Date()) {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  );
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    today: date.toISOString().slice(0, 10),
  };
}

async function requireManager() {
  const context = await getUserContext();
  if (!context || context.role !== "manager" || !context.organizationId) {
    throw new Error("Manager access required.");
  }
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) throw new Error("No location is configured.");
  return { context, locationId };
}

export async function createInventoryCountAction(formData: FormData) {
  const { context, locationId } = await requireManager();
  const supabase = await createClient();
  const countType = formData.get("count_type") === "spot" ? "spot" : "full";
  const storageLocationIds = formData
    .getAll("storage_location_id")
    .map(String)
    .filter(Boolean);
  const categoryIds = formData
    .getAll("category_id")
    .map(String)
    .filter(Boolean);
  const inventoryItemIds = formData
    .getAll("inventory_item_id")
    .map(String)
    .filter(Boolean);

  if (storageLocationIds.length === 0) {
    throw new Error("Select at least one storage zone.");
  }

  const { start, end, today } = monthBounds();
  let { data: period } = await supabase
    .from("inventory_periods")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("location_id", locationId)
    .lte("period_start", today)
    .gte("period_end", today)
    .limit(1)
    .maybeSingle();

  if (!period) {
    const result = await supabase
      .from("inventory_periods")
      .insert({
        organization_id: context.organizationId,
        location_id: locationId,
        period_start: start,
        period_end: end,
        status: "count_in_progress",
        opened_by: context.user.id,
      })
      .select("id")
      .single();
    if (result.error) throw new Error(result.error.message);
    period = result.data;
  }

  const requestedAssignee = String(formData.get("assigned_profile_id") ?? "");
  let assignedProfileId = requestedAssignee;

  if (!assignedProfileId) {
    const { data: membership } = await supabase
      .from("location_memberships")
      .select("organization_memberships(profile_id), roles(slug)")
      .eq("location_id", locationId)
      .limit(1)
      .maybeSingle();
    const related = membership?.organization_memberships as
      | { profile_id: string }
      | { profile_id: string }[]
      | null
      | undefined;
    assignedProfileId = Array.isArray(related)
      ? (related[0]?.profile_id ?? "")
      : (related?.profile_id ?? "");
  }

  if (!assignedProfileId)
    throw new Error("Assign the count to a staff member.");

  const { data: locationItems, error: itemsError } = await supabase
    .from("storage_location_items")
    .select(
      "storage_location_id, inventory_item_id, inventory_items(category_id, count_unit_id, base_unit_id)",
    )
    .in("storage_location_id", storageLocationIds);

  if (itemsError) throw new Error(itemsError.message);

  const selectedLocationItems = filterCountItems(
    (locationItems ?? []).map((row) => {
      const related = row.inventory_items as
        | {
            category_id: string | null;
            count_unit_id: string | null;
            base_unit_id: string;
          }
        | {
            category_id: string | null;
            count_unit_id: string | null;
            base_unit_id: string;
          }[]
        | null;
      const item = Array.isArray(related) ? related[0] : related;
      return {
        ...row,
        id: row.inventory_item_id,
        categoryId: item?.category_id ?? null,
        storageLocationId: row.storage_location_id,
      };
    }),
    {
      storageLocationIds,
      categoryIds: countType === "spot" ? categoryIds : [],
      inventoryItemIds: countType === "spot" ? inventoryItemIds : [],
    },
  );

  if (selectedLocationItems.length === 0) {
    throw new Error("The selected spot-count filters contain no items.");
  }

  const { data: count, error: countError } = await supabase
    .from("inventory_counts")
    .insert({
      organization_id: context.organizationId,
      location_id: locationId,
      inventory_period_id: period.id,
      count_type: countType,
      status: "in_progress",
      assigned_to: assignedProfileId,
    })
    .select("id")
    .single();

  if (countError) throw new Error(countError.message);

  const countUnitIds = selectedLocationItems
    .map((row) => {
      const related = row.inventory_items as
        | {
            category_id: string | null;
            count_unit_id: string | null;
            base_unit_id: string;
          }
        | {
            category_id: string | null;
            count_unit_id: string | null;
            base_unit_id: string;
          }[]
        | null;
      const item = Array.isArray(related) ? related[0] : related;
      return item?.count_unit_id ?? item?.base_unit_id ?? null;
    })
    .filter((id): id is string => Boolean(id));
  const [{ data: onHand }, { data: countUnits }] = await Promise.all([
    supabase
      .from("inventory_on_hand")
      .select("inventory_item_id, storage_location_id, quantity")
      .eq("organization_id", context.organizationId)
      .eq("location_id", locationId),
    countUnitIds.length
      ? supabase
          .from("units")
          .select("id, conversion_factor_to_base")
          .in("id", countUnitIds)
      : Promise.resolve({ data: [] }),
  ]);

  for (const storageLocationId of storageLocationIds) {
    const selectedRows = selectedLocationItems.filter(
      (row) => row.storage_location_id === storageLocationId,
    );
    if (selectedRows.length === 0) continue;

    const { data: assignment, error: assignmentError } = await supabase
      .from("inventory_count_assignments")
      .insert({
        inventory_count_id: count.id,
        storage_location_id: storageLocationId,
        assigned_profile_id: assignedProfileId,
        status: "pending",
      })
      .select("id")
      .single();

    if (assignmentError) throw new Error(assignmentError.message);

    const rows = selectedRows.map((row) => {
      const related = row.inventory_items as
        | {
            category_id: string | null;
            count_unit_id: string | null;
            base_unit_id: string;
          }
        | {
            category_id: string | null;
            count_unit_id: string | null;
            base_unit_id: string;
          }[]
        | null;
      const item = Array.isArray(related) ? related[0] : related;
      const countUnitId = item?.count_unit_id ?? item?.base_unit_id;
      const factor = Number(
        countUnits?.find((unit) => unit.id === countUnitId)
          ?.conversion_factor_to_base ?? 1,
      );
      const expectedBaseQuantity = Number(
        (onHand ?? []).find(
          (onHandRow) =>
            onHandRow.inventory_item_id === row.inventory_item_id &&
            onHandRow.storage_location_id === storageLocationId,
        )?.quantity ?? 0,
      );

      return {
        inventory_count_assignment_id: assignment.id,
        inventory_item_id: row.inventory_item_id,
        storage_location_id: storageLocationId,
        expected_quantity: expectedBaseQuantity / factor,
        status: "pending",
      };
    });

    if (rows.length > 0) {
      const { error } = await supabase
        .from("inventory_count_lines")
        .insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  await supabase
    .from("inventory_periods")
    .update({ status: "count_in_progress" })
    .eq("id", period.id);

  revalidatePath("/inventory");
  redirect(`/inventory/counts/${count.id}/review`);
}

export async function requestRecountAction(countLineId: string) {
  await requireManager();
  const supabase = await createClient();
  const { data: line } = await supabase
    .from("inventory_count_lines")
    .select("inventory_count_assignment_id")
    .eq("id", countLineId)
    .single();
  if (!line) throw new Error("Count line not found.");

  const { data: assignment } = await supabase
    .from("inventory_count_assignments")
    .select("inventory_count_id")
    .eq("id", line.inventory_count_assignment_id)
    .single();
  if (!assignment) throw new Error("Count assignment not found.");

  await supabase
    .from("inventory_count_lines")
    .update({ status: "recount_requested" })
    .eq("id", countLineId);
  await supabase
    .from("inventory_count_assignments")
    .update({ status: "in_progress" })
    .eq("id", line.inventory_count_assignment_id);
  await supabase
    .from("inventory_counts")
    .update({ status: "in_progress" })
    .eq("id", assignment.inventory_count_id);

  revalidatePath(`/inventory/counts/${assignment.inventory_count_id}/review`);
}

export async function approveInventoryCountAction(countId: string) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_inventory_count", {
    target_count_id: countId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/inventory");
  revalidatePath("/inventory/on-hand");
  revalidatePath("/exceptions/negative-inventory");
  redirect("/inventory/on-hand");
}

export async function approveInventoryCountLineAction(
  countId: string,
  countLineId: string,
) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_inventory_count_line", {
    target_line_id: countLineId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/inventory/counts/${countId}/review`);
}
