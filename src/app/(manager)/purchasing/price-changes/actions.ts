"use server";

import { revalidatePath } from "next/cache";

import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Marks price changes as reviewed (one id, or every open one). */
export async function reviewPriceChangesAction(formData: FormData) {
  const context = await getUserContext();
  if (!context?.organizationId || context.role !== "manager") {
    throw new Error("Manager access required.");
  }
  const ids = formData.getAll("id").map(String).filter(Boolean);
  const supabase = await createClient();
  let query = supabase
    .from("price_alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("organization_id", context.organizationId)
    .eq("status", "open");
  if (ids.length) query = query.in("id", ids);
  const { error } = await query;
  if (error) throw new Error(error.message);
  revalidatePath("/purchasing/price-changes");
  revalidatePath("/today");
}
