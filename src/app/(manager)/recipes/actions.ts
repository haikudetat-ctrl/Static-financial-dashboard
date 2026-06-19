"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
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
  return { context, locationId };
}

function componentPayload(formData: FormData) {
  const componentType =
    formData.get("component_type") === "recipe" ? "recipe" : "inventory";
  const componentId = String(formData.get("component_id") ?? "");
  const quantity = Number(formData.get("component_quantity") ?? 0);
  const unitId = String(formData.get("component_unit_id") ?? "");
  if (!componentId || quantity <= 0 || !unitId) {
    throw new Error("A component, positive quantity, and unit are required.");
  }
  return {
    component_inventory_item_id:
      componentType === "inventory" ? componentId : null,
    component_recipe_id: componentType === "recipe" ? componentId : null,
    quantity,
    unit_id: unitId,
  };
}

export async function createRecipeAction(formData: FormData) {
  const { context } = await requireManager();
  const supabase = await createClient();
  const recipeType = String(formData.get("recipe_type") ?? "menu_item");
  const outputInventoryItemId =
    String(formData.get("output_inventory_item_id") ?? "") || null;
  if (!["menu_item", "prep", "batch"].includes(recipeType)) {
    throw new Error("Invalid recipe type.");
  }
  if (recipeType !== "menu_item" && !outputInventoryItemId) {
    throw new Error("Produced recipes require an output inventory item.");
  }

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .insert({
      organization_id: context.organizationId,
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? ""),
      recipe_type: recipeType,
      output_inventory_item_id: outputInventoryItemId,
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (recipeError) throw new Error(recipeError.message);

  const { data: version, error: versionError } = await supabase
    .from("recipe_versions")
    .insert({
      recipe_id: recipe.id,
      version_number: 1,
      effective_from: String(formData.get("effective_from") ?? ""),
      output_quantity: Number(formData.get("output_quantity") ?? 0),
      output_unit_id: String(formData.get("output_unit_id") ?? ""),
      yield_is_approximate: formData.get("yield_is_approximate") === "on",
      notes: String(formData.get("version_notes") ?? ""),
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (versionError) throw new Error(versionError.message);

  const { error: componentError } = await supabase
    .from("recipe_version_components")
    .insert({
      recipe_version_id: version.id,
      ...componentPayload(formData),
      line_order: 1,
    });
  if (componentError) throw new Error(componentError.message);

  revalidatePath("/recipes");
  redirect(`/recipes/${recipe.id}`);
}

export async function createRecipeVersionAction(
  recipeId: string,
  formData: FormData,
) {
  const { context } = await requireManager();
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("recipe_versions")
    .select("version_number")
    .eq("recipe_id", recipeId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("recipe_versions").insert({
    recipe_id: recipeId,
    version_number: Number(latest?.version_number ?? 0) + 1,
    effective_from: String(formData.get("effective_from") ?? ""),
    output_quantity: Number(formData.get("output_quantity") ?? 0),
    output_unit_id: String(formData.get("output_unit_id") ?? ""),
    yield_is_approximate: formData.get("yield_is_approximate") === "on",
    notes: String(formData.get("notes") ?? ""),
    created_by: context.user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/recipes/${recipeId}`);
}

export async function addRecipeComponentAction(
  recipeId: string,
  versionId: string,
  formData: FormData,
) {
  await requireManager();
  const supabase = await createClient();
  const { count } = await supabase
    .from("recipe_version_components")
    .select("*", { count: "exact", head: true })
    .eq("recipe_version_id", versionId);
  const { error } = await supabase.from("recipe_version_components").insert({
    recipe_version_id: versionId,
    ...componentPayload(formData),
    line_order: (count ?? 0) + 1,
    notes: String(formData.get("notes") ?? ""),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/recipes/${recipeId}`);
}

export async function activateRecipeVersionAction(
  recipeId: string,
  versionId: string,
) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_recipe_version", {
    target_version_id: versionId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/production");
}

export async function mapToastItemAction(formData: FormData) {
  const { context } = await requireManager();
  const supabase = await createClient();
  const guid = String(formData.get("external_item_guid") ?? "");
  const name = String(formData.get("external_item_name") ?? "");
  const recipeId = String(formData.get("recipe_id") ?? "");
  if (!guid || !recipeId)
    throw new Error("Toast item and recipe are required.");

  const { error } = await supabase.from("recipe_menu_item_mappings").upsert(
    {
      organization_id: context.organizationId,
      recipe_id: recipeId,
      source_system: "toast",
      external_item_guid: guid,
      external_item_name: name,
      active: true,
      created_by: context.user.id,
    },
    { onConflict: "organization_id,source_system,external_item_guid" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/recipes");
  revalidatePath("/recipes/mappings");
  revalidatePath("/recipes/sales");
}

export async function postSalesImportAction(importId: string) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_sales_import", {
    target_import_id: importId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/recipes");
  revalidatePath("/recipes/sales");
  revalidatePath("/recipes/theoretical-usage");
}
