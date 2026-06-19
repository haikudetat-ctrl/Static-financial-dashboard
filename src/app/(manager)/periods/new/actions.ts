"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";

export async function createInventoryPeriodAction(formData: FormData) {
  const context = await getUserContext();
  if (!context?.organizationId || context.role !== "manager") {
    throw new Error("Manager access required.");
  }
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) throw new Error("No location configured.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_periods")
    .insert({
      organization_id: context.organizationId,
      location_id: locationId,
      period_start: String(formData.get("period_start") ?? ""),
      period_end: String(formData.get("period_end") ?? ""),
      opened_by: context.user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/periods/new");
  revalidatePath("/financial-health");
  redirect(`/periods/${data.id}/readiness`);
}
