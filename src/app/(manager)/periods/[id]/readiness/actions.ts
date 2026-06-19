"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function closePeriodAction(periodId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_period", {
    target_period_id: periodId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/periods/${periodId}/readiness`);
  revalidatePath("/financial-health");
}

export async function reopenPeriodAction(periodId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_period", {
    target_period_id: periodId,
    reason: "Manager reopened for correction",
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/periods/${periodId}/readiness`);
  revalidatePath("/financial-health");
}
