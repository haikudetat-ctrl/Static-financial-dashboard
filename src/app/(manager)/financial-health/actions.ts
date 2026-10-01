"use server";

import { revalidatePath } from "next/cache";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";

export type ExpenseFormState = { error?: string; ok?: number };

const MATCH_FIELDS = ["item_name", "subgroup", "category", "menu_group"];
const ENTRY_TYPES = [
  "labor",
  "operating_expense",
  "other_income",
  "other_expense",
];

async function requireManager() {
  const context = await getUserContext();
  if (!context || context.role !== "manager" || !context.organizationId) {
    throw new Error("Manager access required.");
  }
  return { context, organizationId: context.organizationId };
}

export async function createExpenseAction(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const { context, organizationId } = await requireManager();
  const accountId = String(formData.get("gl_account_id") ?? "");
  const entryDate = String(formData.get("entry_date") ?? "");
  const amount = Number(
    String(formData.get("amount") ?? "").replace(/[$,]/g, ""),
  );
  const memo = String(formData.get("memo") ?? "").trim();

  if (!accountId) return { error: "Choose an account." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return { error: "Enter a date." };
  if (!Number.isFinite(amount) || amount === 0) {
    return { error: "Enter an amount other than zero." };
  }

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("gl_accounts")
    .select("id, account_type")
    .eq("id", accountId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!account || !ENTRY_TYPES.includes(account.account_type)) {
    return {
      error:
        "Expenses can only be entered against labor, operating, or other accounts.",
    };
  }

  const locationId = await getPrimaryLocation(
    organizationId,
    context.locationId,
  );
  if (!locationId) return { error: "No location found." };

  const { error } = await supabase.from("pl_entries").insert({
    organization_id: organizationId,
    location_id: locationId,
    gl_account_id: accountId,
    entry_date: entryDate,
    amount: Math.round(amount * 100) / 100,
    memo,
    source_type: "manual",
    created_by: context.user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/financial-health", "layout");
  return { ok: Date.now() };
}

export async function deleteExpenseAction(formData: FormData) {
  const { organizationId } = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Entry is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("pl_entries")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("source_type", "manual");
  if (error) throw new Error(error.message);
  revalidatePath("/financial-health", "layout");
}

/** Points one Toast grouping (e.g. menu group "Cocktails") at a sales account. */
export async function setSalesMappingAction(formData: FormData) {
  const { organizationId } = await requireManager();
  const field = String(formData.get("match_field") ?? "");
  const value = String(formData.get("match_value") ?? "").trim();
  const accountId = String(formData.get("gl_account_id") ?? "");
  if (!MATCH_FIELDS.includes(field) || !value) {
    throw new Error("A Toast grouping is required.");
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("sales_category_mappings")
    .select("id, match_value")
    .eq("organization_id", organizationId)
    .eq("source_system", "toast")
    .eq("match_field", field)
    .ilike(
      "match_value",
      value.replace(/[\\%_]/g, (c) => `\\${c}`),
    );
  const match = (existing ?? []).find(
    (row) => row.match_value.toLowerCase() === value.toLowerCase(),
  );

  if (!accountId) {
    if (match) {
      const { error } = await supabase
        .from("sales_category_mappings")
        .delete()
        .eq("id", match.id);
      if (error) throw new Error(error.message);
    }
  } else {
    const { data: account } = await supabase
      .from("gl_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("organization_id", organizationId)
      .eq("account_type", "revenue")
      .maybeSingle();
    if (!account) throw new Error("Choose a sales account.");

    const { error } = match
      ? await supabase
          .from("sales_category_mappings")
          .update({ gl_account_id: accountId })
          .eq("id", match.id)
      : await supabase.from("sales_category_mappings").insert({
          organization_id: organizationId,
          source_system: "toast",
          match_field: field,
          match_value: value,
          gl_account_id: accountId,
        });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/financial-health", "layout");
}
