"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import {
  businessToday,
  findCountPeriod,
  isValidCountDate,
} from "@/lib/inventory/count-period";
import { filterCountItems } from "@/lib/inventory/counts";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";

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
  return { context, organizationId: context.organizationId, locationId };
}

export async function createInventoryCountAction(formData: FormData) {
  const { context, organizationId, locationId } = await requireManager();
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

  const countDate = String(formData.get("count_date") || businessToday());
  if (!isValidCountDate(countDate)) {
    throw new Error("Pick a count date from the last week.");
  }

  const period = await findCountPeriod(organizationId, locationId, countDate);
  if (!period) {
    throw new Error(
      "No open period covers the count date. Create the period before starting a count.",
    );
  }

  const requestedAssignee = String(formData.get("assigned_profile_id") ?? "");
  let assignedProfileId = requestedAssignee;

  if (!assignedProfileId) assignedProfileId = context.user.id;

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
      count_date: countDate,
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

  if (period.status === "draft" || period.status === "reopened") {
    await supabase
      .from("inventory_periods")
      .update({ status: "count_in_progress" })
      .eq("id", period.id);
  }

  revalidatePath("/inventory");
  redirect(`/inventory/counts/${count.id}`);
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
  revalidatePath(`/inventory/counts/${assignment.inventory_count_id}`);
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
  revalidatePath("/inventory/variance");
  revalidatePath("/exceptions/negative-inventory");
  redirect("/inventory/on-hand");
}

/**
 * Moves a count to another business date before it's approved, e.g. a
 * morning count that should stand for the previous night's close.
 */
export async function setCountDateAction(countId: string, formData: FormData) {
  const { organizationId, locationId } = await requireManager();
  const countDate = String(formData.get("count_date") ?? "");
  if (!isValidCountDate(countDate)) {
    throw new Error("Pick a count date from the last week.");
  }
  const period = await findCountPeriod(organizationId, locationId, countDate);
  if (!period) throw new Error("No open period covers that date.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_counts")
    .update({ count_date: countDate, inventory_period_id: period.id })
    .eq("id", countId)
    .neq("status", "approved");
  if (error) throw new Error(error.message);
  revalidatePath(`/inventory/counts/${countId}/review`);
  revalidatePath(`/inventory/counts/${countId}`);
  revalidatePath("/inventory/counts");
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

export type SaveLineResult = { ok: true } | { ok: false; error: string };

/**
 * Saves one line from the count sheet. A blank quantity clears the line
 * back to pending. Editing a finished area reopens it.
 */
export async function saveCountEntryAction(
  countId: string,
  lineId: string,
  quantity: number | null,
  tenths: number,
): Promise<SaveLineResult> {
  const { context } = await requireManager();
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
    return { ok: false, error: "Quantity must be zero or more." };
  }
  const safeTenths = Math.round(Number(tenths) * 10) / 10;
  if (!(safeTenths >= 0 && safeTenths <= 0.9)) {
    return { ok: false, error: "Partial bottle must be 0 to 0.9." };
  }

  const supabase = await createClient();
  const { data: line } = await supabase
    .from("inventory_count_lines")
    .select(
      "id, status, inventory_count_assignment_id, inventory_count_assignments!inner(inventory_count_id, status)",
    )
    .eq("id", lineId)
    .eq("inventory_count_assignments.inventory_count_id", countId)
    .maybeSingle();
  if (!line) return { ok: false, error: "Line not found on this count." };

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("status")
    .eq("id", countId)
    .single();
  if (!count || !["draft", "in_progress", "counted"].includes(count.status)) {
    return { ok: false, error: `This count is ${count?.status ?? "closed"}.` };
  }

  if (quantity !== null && line.status === "recount_requested") {
    await supabase.from("inventory_count_recounts").insert({
      count_line_id: lineId,
      profile_id: context.user.id,
      counted_quantity: quantity,
      counted_tenths: safeTenths,
      reason: "Recount entered on count sheet",
    });
  }

  const { error } = await supabase
    .from("inventory_count_lines")
    .update(
      quantity === null
        ? {
            counted_quantity: null,
            counted_tenths: 0,
            is_open_container: false,
            status: "pending",
          }
        : {
            counted_quantity: quantity,
            counted_tenths: safeTenths,
            is_open_container: safeTenths > 0,
            status: "counted",
          },
    )
    .eq("id", lineId);
  if (error) return { ok: false, error: error.message };

  const assignment = Array.isArray(line.inventory_count_assignments)
    ? line.inventory_count_assignments[0]
    : line.inventory_count_assignments;
  if (assignment?.status !== "in_progress") {
    await supabase
      .from("inventory_count_assignments")
      .update({ status: "in_progress" })
      .eq("id", line.inventory_count_assignment_id);
  }
  if (count.status !== "in_progress") {
    await supabase
      .from("inventory_counts")
      .update({ status: "in_progress" })
      .eq("id", countId);
  }
  return { ok: true };
}

/**
 * Marks a storage area counted. With fillBlanks, items left blank are
 * recorded as zero on hand (the usual convention for a full count).
 */
export async function finishCountAreaAction(
  countId: string,
  assignmentId: string,
  fillBlanks: boolean,
): Promise<
  { ok: true; countComplete: boolean } | { ok: false; error: string }
> {
  await requireManager();
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("inventory_count_assignments")
    .select("id")
    .eq("id", assignmentId)
    .eq("inventory_count_id", countId)
    .maybeSingle();
  if (!assignment) return { ok: false, error: "Area not found on this count." };

  if (fillBlanks) {
    const { error } = await supabase
      .from("inventory_count_lines")
      .update({
        counted_quantity: 0,
        counted_tenths: 0,
        is_open_container: false,
        status: "counted",
      })
      .eq("inventory_count_assignment_id", assignmentId)
      .neq("status", "counted");
    if (error) return { ok: false, error: error.message };
  }

  const { count: remaining } = await supabase
    .from("inventory_count_lines")
    .select("id", { count: "exact", head: true })
    .eq("inventory_count_assignment_id", assignmentId)
    .neq("status", "counted");
  if ((remaining ?? 0) > 0) {
    return { ok: false, error: `${remaining} item(s) still need a count.` };
  }

  await supabase
    .from("inventory_count_assignments")
    .update({ status: "counted" })
    .eq("id", assignmentId);

  const { count: openAreas } = await supabase
    .from("inventory_count_assignments")
    .select("id", { count: "exact", head: true })
    .eq("inventory_count_id", countId)
    .neq("status", "counted");
  const countComplete = (openAreas ?? 0) === 0;
  if (countComplete) {
    await supabase
      .from("inventory_counts")
      .update({ status: "counted" })
      .eq("id", countId);
  }
  revalidatePath("/inventory");
  revalidatePath("/inventory/counts");
  return { ok: true, countComplete };
}

/** Cancels a count that has not been approved. Nothing posts to inventory. */
export async function cancelCountAction(countId: string) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_counts")
    .update({ status: "cancelled" })
    .eq("id", countId)
    .in("status", ["draft", "in_progress", "counted"]);
  if (error) throw new Error(error.message);
  revalidatePath("/inventory");
  revalidatePath("/inventory/counts");
  redirect("/inventory/counts");
}
