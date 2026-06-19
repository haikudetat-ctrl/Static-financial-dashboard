"use server";

import { revalidatePath } from "next/cache";

import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function parseNonNegative(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return parsed;
}

async function requireStaff() {
  const context = await getUserContext();
  if (!context || !context.role) throw new Error("Sign in required.");
  return context;
}

export async function saveCountLineAction(
  countLineId: string,
  formData: FormData,
) {
  const context = await requireStaff();
  const quantity = parseNonNegative(
    formData.get("counted_quantity"),
    "Quantity",
  );
  const tenths = parseNonNegative(formData.get("counted_tenths"), "Tenths");
  if (tenths > 0.9) throw new Error("Tenths must be between 0 and 0.9.");

  const supabase = await createClient();
  const { data: line } = await supabase
    .from("inventory_count_lines")
    .select("inventory_count_assignment_id, status")
    .eq("id", countLineId)
    .single();
  if (!line) throw new Error("Count line not found.");

  const { data: assignment } = await supabase
    .from("inventory_count_assignments")
    .select("assigned_profile_id")
    .eq("id", line.inventory_count_assignment_id)
    .single();
  if (assignment?.assigned_profile_id !== context.user.id) {
    throw new Error("This line is not assigned to you.");
  }

  if (line.status === "recount_requested") {
    const { error: recountError } = await supabase
      .from("inventory_count_recounts")
      .insert({
        count_line_id: countLineId,
        profile_id: context.user.id,
        counted_quantity: quantity,
        counted_tenths: tenths,
        reason: String(formData.get("notes") ?? "Submitted recount"),
      });
    if (recountError) throw new Error(recountError.message);
  }

  const { error } = await supabase
    .from("inventory_count_lines")
    .update({
      counted_quantity: quantity,
      counted_tenths: tenths,
      is_open_container: formData.get("is_open_container") === "on",
      notes: String(formData.get("notes") ?? ""),
      status: "counted",
    })
    .eq("id", countLineId);
  if (error) throw new Error(error.message);

  await supabase
    .from("inventory_count_assignments")
    .update({ status: "in_progress" })
    .eq("id", line.inventory_count_assignment_id);
  revalidatePath("/count");
}

export async function submitCountAssignmentAction(assignmentId: string) {
  const context = await requireStaff();
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("inventory_count_assignments")
    .select("assigned_profile_id, inventory_count_id")
    .eq("id", assignmentId)
    .single();
  if (assignment?.assigned_profile_id !== context.user.id) {
    throw new Error("This assignment is not assigned to you.");
  }

  const { count: remaining } = await supabase
    .from("inventory_count_lines")
    .select("*", { count: "exact", head: true })
    .eq("inventory_count_assignment_id", assignmentId)
    .neq("status", "counted");
  if ((remaining ?? 0) > 0)
    throw new Error("Count every item before submitting.");

  await supabase
    .from("inventory_count_assignments")
    .update({ status: "counted" })
    .eq("id", assignmentId);

  const { count: incompleteAssignments } = await supabase
    .from("inventory_count_assignments")
    .select("*", { count: "exact", head: true })
    .eq("inventory_count_id", assignment.inventory_count_id)
    .neq("status", "counted");

  if ((incompleteAssignments ?? 0) === 0) {
    await supabase
      .from("inventory_counts")
      .update({ status: "counted" })
      .eq("id", assignment.inventory_count_id);
  }

  revalidatePath("/count");
}
