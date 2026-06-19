"use server";

import { revalidatePath } from "next/cache";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";

export async function postProductionBatchAction(
  recipeId: string,
  recipeVersionId: string,
  outputUnitId: string,
  formData: FormData,
) {
  const context = await getUserContext();
  if (!context?.organizationId || !context.role) {
    throw new Error("Organization access required.");
  }
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) throw new Error("No location is configured.");
  const actualOutput = Number(formData.get("actual_output_quantity") ?? 0);
  const plannedOutput =
    Number(formData.get("planned_output_quantity") ?? 0) || null;
  if (actualOutput <= 0) throw new Error("Actual output must be positive.");

  const supabase = await createClient();
  const { data: batch, error: batchError } = await supabase
    .from("production_batches")
    .insert({
      organization_id: context.organizationId,
      location_id: locationId,
      recipe_id: recipeId,
      recipe_version_id: recipeVersionId,
      planned_output_quantity: plannedOutput,
      actual_output_quantity: actualOutput,
      output_unit_id: outputUnitId,
      created_by: context.user.id,
      notes: String(formData.get("notes") ?? ""),
    })
    .select("id")
    .single();
  if (batchError) throw new Error(batchError.message);

  const { error } = await supabase.rpc("post_production_batch", {
    target_batch_id: batch.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/production");
  revalidatePath("/recipes");
  revalidatePath("/inventory/on-hand");
}
