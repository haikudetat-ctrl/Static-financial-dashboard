"use server";

import { revalidatePath } from "next/cache";

import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function closeCatalogReviewItemAction(formData: FormData) {
  const context = await getUserContext();
  if (!context || context.role !== "manager" || !context.organizationId) {
    throw new Error("Manager access required.");
  }
  const id = String(formData.get("id") ?? "");
  const status =
    formData.get("status") === "dismissed" ? "dismissed" : "resolved";
  const note = String(formData.get("resolution_note") ?? "").trim();
  if (!id) throw new Error("Review item is required.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("catalog_review_items")
    .update({
      status,
      resolution_note: note,
      resolved_by: context.user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", context.organizationId)
    .eq("status", "open");
  if (error) throw new Error(error.message);

  revalidatePath("/exceptions/catalog-review");
  revalidatePath("/exceptions");
}
