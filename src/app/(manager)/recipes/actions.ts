"use server";

import { revalidatePath } from "next/cache";

import { getUserContext } from "@/lib/auth/session";
import { localToday } from "@/lib/inventory/count-period";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { buildRecipeCatalog, loadRecipeCatalog } from "@/lib/recipes/cost-book";
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

export type RecipeInput = {
  id: string | null;
  name: string;
  description: string;
  recipeType: "menu_item" | "batch" | "prep";
  menuPrice: number | null;
  outputQuantity: number;
  outputUnitId: string;
  /** Existing inventory item a batch or prep fills; null creates one. */
  outputItemId: string | null;
  yieldIsApproximate: boolean;
  notes: string;
  lines: Array<{
    kind: "inventory" | "recipe";
    refId: string;
    quantity: number;
    unitId: string;
    notes: string;
  }>;
};

export type SaveRecipeResult =
  | { ok: true; id: string; versionNumber: number }
  | { ok: false; error: string };

/**
 * Creates or updates a recipe. Edits made on the day a version took effect
 * update that version; later edits start a new version effective today, so
 * sales already posted keep the recipe they were costed with.
 */
export async function saveRecipeAction(
  input: RecipeInput,
): Promise<SaveRecipeResult> {
  const { context, organizationId, locationId } = await requireManager();
  const supabase = await createClient();
  const catalog = await loadRecipeCatalog(organizationId, locationId);
  const today = localToday();

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the recipe a name." };
  if (!["menu_item", "batch", "prep"].includes(input.recipeType)) {
    return { ok: false, error: "Choose a recipe type." };
  }
  const lines = input.lines.filter((line) => line.refId);
  if (lines.length === 0) {
    return { ok: false, error: "Add at least one ingredient." };
  }
  for (const line of lines) {
    const unit = catalog.unitById.get(line.unitId);
    const label =
      line.kind === "inventory"
        ? catalog.itemById.get(line.refId)?.name
        : catalog.recipeById.get(line.refId)?.name;
    if (!label) return { ok: false, error: "An ingredient no longer exists." };
    if (!(line.quantity > 0)) {
      return { ok: false, error: `Enter an amount for ${label}.` };
    }
    if (!unit) return { ok: false, error: `Choose a unit for ${label}.` };
    const expectedType =
      line.kind === "inventory"
        ? catalog.itemById.get(line.refId)?.unitType
        : catalog.unitById.get(
            catalog.recipeById.get(line.refId)?.version?.outputUnitId ?? "",
          )?.unitType;
    if (expectedType && unit.unitType !== expectedType) {
      return {
        ok: false,
        error: `${label} is measured by ${expectedType}; ${unit.abbreviation} won't convert.`,
      };
    }
    if (line.kind === "recipe" && line.refId === input.id) {
      return { ok: false, error: "A recipe can't contain itself." };
    }
  }

  const each = catalog.units.find(
    (unit) =>
      unit.unitType === "each" &&
      unit.factor === 1 &&
      /^ea/i.test(unit.abbreviation),
  );
  const isMenuItem = input.recipeType === "menu_item";
  const outputUnitId = isMenuItem ? each?.id : input.outputUnitId;
  const outputQuantity = isMenuItem ? 1 : input.outputQuantity;
  const outputUnit = outputUnitId ? catalog.unitById.get(outputUnitId) : null;
  if (!outputUnit) return { ok: false, error: "Choose the yield unit." };
  if (!(outputQuantity > 0)) {
    return { ok: false, error: "Enter how much the recipe makes." };
  }

  // Batches and preps fill an inventory item so they can be counted and
  // used in other recipes. Create one if none was picked.
  let outputItemId = isMenuItem ? null : input.outputItemId;
  if (!isMenuItem && !outputItemId) {
    const baseUnit = catalog.units.find(
      (unit) => unit.unitType === outputUnit.unitType && unit.factor === 1,
    );
    if (!baseUnit) return { ok: false, error: "No base unit for the yield." };
    const { data: created, error } = await supabase
      .from("inventory_items")
      .insert({
        organization_id: organizationId,
        name,
        base_unit_id: baseUnit.id,
        count_unit_id: baseUnit.id,
        is_purchased: false,
        is_produced: true,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    outputItemId = created.id;
  }

  const recipeFields = {
    name,
    description: input.description.trim(),
    recipe_type: input.recipeType,
    menu_price: isMenuItem ? input.menuPrice : null,
    output_inventory_item_id: outputItemId,
    active: true,
  };

  let recipeId = input.id;
  if (recipeId) {
    const { error } = await supabase
      .from("recipes")
      .update(recipeFields)
      .eq("id", recipeId)
      .eq("organization_id", organizationId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: created, error } = await supabase
      .from("recipes")
      .insert({
        ...recipeFields,
        organization_id: organizationId,
        created_by: context.user.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    recipeId = created.id;
  }

  const versionFields = {
    output_quantity: outputQuantity,
    output_unit_id: outputUnit.id,
    yield_is_approximate: input.yieldIsApproximate,
    notes: input.notes.trim(),
  };
  const componentRows = (versionId: string) =>
    lines.map((line, index) => ({
      recipe_version_id: versionId,
      component_inventory_item_id:
        line.kind === "inventory" ? line.refId : null,
      component_recipe_id: line.kind === "recipe" ? line.refId : null,
      quantity: line.quantity,
      unit_id: line.unitId,
      line_order: index + 1,
      notes: line.notes.trim(),
    }));

  const { data: versions } = await supabase
    .from("recipe_versions")
    .select("id, version_number, status, effective_from")
    .eq("recipe_id", recipeId)
    .order("version_number", { ascending: false });
  const latest = versions?.[0];
  const editable = (versions ?? []).find(
    (version) =>
      version.effective_from === today &&
      (version.status === "active" || version.status === "draft"),
  );

  let versionNumber: number;
  if (editable) {
    // Same-day edit: rewrite this version in place.
    const { error } = await supabase
      .from("recipe_versions")
      .update(versionFields)
      .eq("id", editable.id);
    if (error) return { ok: false, error: error.message };
    const { error: deleteError } = await supabase
      .from("recipe_version_components")
      .delete()
      .eq("recipe_version_id", editable.id);
    if (deleteError) return { ok: false, error: deleteError.message };
    const { error: insertError } = await supabase
      .from("recipe_version_components")
      .insert(componentRows(editable.id));
    if (insertError) return { ok: false, error: insertError.message };
    if (editable.status === "draft") {
      const { error: activateError } = await supabase.rpc(
        "activate_recipe_version",
        { target_version_id: editable.id },
      );
      if (activateError) return { ok: false, error: activateError.message };
    }
    versionNumber = editable.version_number;
  } else {
    versionNumber = Number(latest?.version_number ?? 0) + 1;
    const { data: version, error } = await supabase
      .from("recipe_versions")
      .insert({
        ...versionFields,
        recipe_id: recipeId,
        version_number: versionNumber,
        effective_from: today,
        created_by: context.user.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    const { error: insertError } = await supabase
      .from("recipe_version_components")
      .insert(componentRows(version.id));
    if (insertError) return { ok: false, error: insertError.message };
    const { error: activateError } = await supabase.rpc(
      "activate_recipe_version",
      { target_version_id: version.id },
    );
    if (activateError) return { ok: false, error: activateError.message };
  }

  await syncRecipeStandardCosts(organizationId, locationId);
  revalidatePath("/recipes", "layout");
  revalidatePath("/financial-health", "layout");
  return { ok: true, id: recipeId!, versionNumber };
}

/**
 * Writes each batch or prep's cost per base unit onto the item it fills,
 * so database costing (theoretical usage) sees house-made items too.
 * Manually set costs are left alone.
 */
async function syncRecipeStandardCosts(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  // Built fresh: the request cache still holds the pre-save catalog.
  const catalog = await buildRecipeCatalog(organizationId, locationId);
  const updates = catalog.recipes
    .filter((recipe) => recipe.active && recipe.outputItemId && recipe.version)
    .map((recipe) => ({
      itemId: recipe.outputItemId!,
      cost: catalog.book.recipeCost(recipe.id).costPerOutputBase,
      source: catalog.itemById.get(recipe.outputItemId!)?.standardCostSource,
    }))
    .filter((update) => update.cost !== null && update.source !== "manual");
  await Promise.all(
    updates.map((update) =>
      supabase
        .from("inventory_items")
        .update({
          standard_unit_cost: update.cost,
          standard_cost_source: "recipe",
          standard_cost_updated_at: new Date().toISOString(),
        })
        .eq("id", update.itemId)
        .eq("organization_id", organizationId),
    ),
  );
}

/**
 * Sets an ingredient's cost by hand, e.g. "$12 per 750 ml". Stored per
 * base unit. A blank amount clears it.
 */
export async function setIngredientCostAction(
  itemId: string,
  amount: number | null,
  unitId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organizationId, locationId } = await requireManager();
  const catalog = await loadRecipeCatalog(organizationId, locationId);
  const item = catalog.itemById.get(itemId);
  const unit = catalog.unitById.get(unitId);
  if (!item) return { ok: false, error: "Item not found." };
  if (amount !== null && (!unit || unit.unitType !== item.unitType)) {
    return { ok: false, error: "Pick a unit that matches the item." };
  }
  if (amount !== null && !(amount >= 0)) {
    return { ok: false, error: "Enter a cost of zero or more." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_items")
    .update(
      amount === null
        ? {
            standard_unit_cost: null,
            standard_cost_source: null,
            standard_cost_updated_at: new Date().toISOString(),
          }
        : {
            standard_unit_cost: amount / unit!.factor,
            standard_cost_source: "manual",
            standard_cost_updated_at: new Date().toISOString(),
          },
    )
    .eq("id", itemId)
    .eq("organization_id", organizationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/recipes", "layout");
  return { ok: true };
}

/** Hides a recipe from the library. Posted sales keep their history. */
export async function setRecipeActiveAction(recipeId: string, active: boolean) {
  const { organizationId } = await requireManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("recipes")
    .update({ active })
    .eq("id", recipeId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  revalidatePath("/recipes", "layout");
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
