"use server";

import { revalidatePath } from "next/cache";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";

/** Creates the 12 periods of a fiscal year from the organization's pattern. */
export async function addFiscalYearAction(formData: FormData) {
  const context = await getUserContext();
  if (!context?.organizationId || context.role !== "manager") {
    throw new Error("Manager access required.");
  }
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) throw new Error("No location configured.");
  const year = Number(formData.get("fiscal_year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new Error("Choose a fiscal year.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("ensure_fiscal_periods", {
    target_location_id: locationId,
    target_year: year,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/periods");
  revalidatePath("/financial-health", "layout");
}
