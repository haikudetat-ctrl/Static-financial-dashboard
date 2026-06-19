import {
  calculateRecipeCost,
  expandRecipeComponents,
} from "@/lib/recipes/calculations";
import type { RecipeDefinition } from "@/lib/recipes/types";
import { createClient } from "@/lib/supabase/server";

export function relatedName(
  value: { name: string } | { name: string }[] | null | undefined,
) {
  return (Array.isArray(value) ? value[0] : value)?.name ?? "";
}

export async function getRecipeWorkspace(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const [
    { data: recipes },
    { data: mappings },
    { data: imports },
    { data: variances },
  ] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, name, recipe_type, active, recipe_versions(id, status, effective_from, effective_to, output_quantity, output_unit_id)",
      )
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("recipe_menu_item_mappings")
      .select("external_item_guid")
      .eq("organization_id", organizationId)
      .eq("source_system", "toast")
      .eq("active", true),
    supabase
      .from("source_imports")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .eq("source_type", "toast_pmix")
      .in("status", ["staged", "mapping"]),
    supabase
      .from("production_yield_variances")
      .select(
        "variance_quantity_base, variance_value, production_batches!inner(organization_id, location_id)",
      )
      .eq("production_batches.organization_id", organizationId)
      .eq("production_batches.location_id", locationId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const importIds = (imports ?? []).map((row) => row.id);
  const { data: rows } = importIds.length
    ? await supabase
        .from("source_import_rows")
        .select("normalized_data")
        .in("source_import_id", importIds)
    : { data: [] };
  const mappedGuids = new Set(
    (mappings ?? []).map((mapping) => mapping.external_item_guid),
  );
  const unmappedGuids = new Set(
    (rows ?? [])
      .map((row) => String(row.normalized_data.item_guid ?? ""))
      .filter((guid) => guid && !mappedGuids.has(guid)),
  );

  return {
    recipes: recipes ?? [],
    activeRecipeCount: (recipes ?? []).filter((recipe) => recipe.active).length,
    missingMappingCount: unmappedGuids.size,
    recentYieldVariance: (variances ?? []).reduce(
      (sum, row) => sum + Math.abs(Number(row.variance_quantity_base)),
      0,
    ),
  };
}

export async function getRecipeSetup(organizationId: string) {
  const supabase = await createClient();
  const [{ data: items }, { data: units }, { data: recipes }] =
    await Promise.all([
      supabase
        .from("inventory_items")
        .select("id, name, base_unit_id, is_produced")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("units")
        .select("id, name, abbreviation, conversion_factor_to_base")
        .eq("organization_id", organizationId)
        .order("name"),
      supabase
        .from("recipes")
        .select("id, name, recipe_type")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
    ]);
  return { items: items ?? [], units: units ?? [], recipes: recipes ?? [] };
}

export async function getRecipeDetail(
  organizationId: string,
  recipeId: string,
) {
  const supabase = await createClient();
  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      "id, name, description, recipe_type, output_inventory_item_id, active, inventory_items(name)",
    )
    .eq("organization_id", organizationId)
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe) return null;

  const { data: versions } = await supabase
    .from("recipe_versions")
    .select(
      "id, version_number, effective_from, effective_to, output_quantity, output_unit_id, yield_is_approximate, status, notes, activated_at",
    )
    .eq("recipe_id", recipeId)
    .order("version_number", { ascending: false });
  const versionIds = (versions ?? []).map((version) => version.id);
  const [{ data: components }, { data: mappings }] = await Promise.all([
    versionIds.length
      ? supabase
          .from("recipe_version_components")
          .select(
            "id, recipe_version_id, component_inventory_item_id, component_recipe_id, quantity, unit_id, line_order, notes, inventory_items(name), recipes(name), units(name, abbreviation, conversion_factor_to_base)",
          )
          .in("recipe_version_id", versionIds)
          .order("line_order")
      : Promise.resolve({ data: [] }),
    supabase
      .from("recipe_menu_item_mappings")
      .select(
        "id, external_item_guid, external_item_name, source_system, active",
      )
      .eq("organization_id", organizationId)
      .eq("recipe_id", recipeId)
      .order("created_at"),
  ]);

  return {
    recipe,
    versions: versions ?? [],
    components: components ?? [],
    mappings: mappings ?? [],
  };
}

export async function getRecipeCurrentCost(
  organizationId: string,
  locationId: string,
  recipeId: string,
) {
  const supabase = await createClient();
  const { data: recipes } = await supabase
    .from("recipes")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("active", true);
  const recipeIds = (recipes ?? []).map((recipe) => recipe.id);
  if (!recipeIds.length) return { cost: 0, expanded: [] };

  const { data: versions } = await supabase
    .from("recipe_versions")
    .select(
      "id, recipe_id, output_quantity, output_unit_id, units(conversion_factor_to_base)",
    )
    .in("recipe_id", recipeIds)
    .eq("status", "active")
    .lte("effective_from", new Date().toISOString().slice(0, 10))
    .or(
      `effective_to.is.null,effective_to.gte.${new Date().toISOString().slice(0, 10)}`,
    );
  const versionIds = (versions ?? []).map((version) => version.id);
  const { data: components } = versionIds.length
    ? await supabase
        .from("recipe_version_components")
        .select(
          "recipe_version_id, component_inventory_item_id, component_recipe_id, quantity, units(conversion_factor_to_base)",
        )
        .in("recipe_version_id", versionIds)
    : { data: [] };

  const definitions: Record<string, RecipeDefinition> = {};
  for (const version of versions ?? []) {
    definitions[version.recipe_id] = {
      id: version.recipe_id,
      outputQuantity: Number(version.output_quantity),
      components: (components ?? [])
        .filter((component) => component.recipe_version_id === version.id)
        .map((component) => {
          const unit = Array.isArray(component.units)
            ? component.units[0]
            : component.units;
          return component.component_inventory_item_id
            ? {
                kind: "inventory" as const,
                inventoryItemId: component.component_inventory_item_id,
                quantity: Number(component.quantity),
                conversionFactorToBase: Number(
                  unit?.conversion_factor_to_base ?? 1,
                ),
              }
            : {
                kind: "recipe" as const,
                recipeId: component.component_recipe_id!,
                quantity: Number(component.quantity),
                conversionFactorToBase: Number(
                  unit?.conversion_factor_to_base ?? 1,
                ),
                nestedOutputConversionFactorToBase: Number(
                  (() => {
                    const nestedVersion = (versions ?? []).find(
                      (candidate) =>
                        candidate.recipe_id === component.component_recipe_id,
                    );
                    const nestedUnit = Array.isArray(nestedVersion?.units)
                      ? nestedVersion.units[0]
                      : nestedVersion?.units;
                    return nestedUnit?.conversion_factor_to_base ?? 1;
                  })(),
                ),
              };
        }),
    };
  }
  if (!definitions[recipeId]) return { cost: 0, expanded: [] };

  const expanded = expandRecipeComponents(recipeId, definitions);
  const itemIds = expanded.map((row) => row.inventoryItemId);
  const { data: onHand } = itemIds.length
    ? await supabase
        .from("inventory_on_hand")
        .select("inventory_item_id, quantity, extended_value")
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
        .in("inventory_item_id", itemIds)
    : { data: [] };
  const costByItem = Object.fromEntries(
    itemIds.map((itemId) => {
      const rows = (onHand ?? []).filter(
        (row) => row.inventory_item_id === itemId,
      );
      const quantity = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
      const value = rows.reduce(
        (sum, row) => sum + Number(row.extended_value),
        0,
      );
      return [itemId, quantity === 0 ? 0 : value / quantity];
    }),
  );
  return { cost: calculateRecipeCost(expanded, costByItem), expanded };
}

export async function getActiveProductionRecipes(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: recipes }, { data: recentBatches }] = await Promise.all([
    supabase
      .from("recipes")
      .select(
        "id, name, recipe_type, output_inventory_item_id, recipe_versions!inner(id, output_quantity, output_unit_id, effective_from, effective_to, status, units(name, abbreviation), recipe_version_components(id, component_inventory_item_id, component_recipe_id, quantity, unit_id, inventory_items(name), recipes(name), units(name, abbreviation)))",
      )
      .eq("organization_id", organizationId)
      .in("recipe_type", ["prep", "batch"])
      .eq("active", true)
      .eq("recipe_versions.status", "active")
      .lte("recipe_versions.effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`, {
        referencedTable: "recipe_versions",
      })
      .order("name"),
    supabase
      .from("production_batches")
      .select(
        "id, recipe_id, actual_output_quantity, status, produced_at, recipes(name), production_yield_variances(expected_output_base, actual_output_base, variance_quantity_base)",
      )
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .order("produced_at", { ascending: false })
      .limit(10),
  ]);
  return { recipes: recipes ?? [], recentBatches: recentBatches ?? [] };
}

export async function getSalesWorkspace(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const [{ data: imports }, { data: days }, { data: mappings }] =
    await Promise.all([
      supabase
        .from("source_imports")
        .select("id, file_name, status, row_count, created_at")
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
        .eq("source_type", "toast_pmix")
        .order("created_at", { ascending: false }),
      supabase
        .from("sales_business_days")
        .select(
          "id, source_import_id, business_date, status, net_sales, posted_at",
        )
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
        .order("business_date", { ascending: false }),
      supabase
        .from("recipe_menu_item_mappings")
        .select("external_item_guid")
        .eq("organization_id", organizationId)
        .eq("source_system", "toast")
        .eq("active", true),
    ]);
  const importIds = (imports ?? [])
    .filter((row) => ["staged", "mapping"].includes(row.status))
    .map((row) => row.id);
  const { data: rows } = importIds.length
    ? await supabase
        .from("source_import_rows")
        .select("source_import_id, normalized_data")
        .in("source_import_id", importIds)
    : { data: [] };
  const mapped = new Set(
    (mappings ?? []).map((mapping) => mapping.external_item_guid),
  );

  return {
    imports: (imports ?? []).map((sourceImport) => ({
      ...sourceImport,
      unmappedCount: new Set(
        (rows ?? [])
          .filter((row) => row.source_import_id === sourceImport.id)
          .map((row) => String(row.normalized_data.item_guid ?? ""))
          .filter((guid) => guid && !mapped.has(guid)),
      ).size,
    })),
    days: days ?? [],
  };
}

export async function getToastMappingQueue(organizationId: string) {
  const supabase = await createClient();
  const [{ data: imports }, { data: mappings }, { data: recipes }] =
    await Promise.all([
      supabase
        .from("source_imports")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("source_type", "toast_pmix")
        .in("status", ["staged", "mapping"]),
      supabase
        .from("recipe_menu_item_mappings")
        .select("external_item_guid")
        .eq("organization_id", organizationId)
        .eq("source_system", "toast"),
      supabase
        .from("recipes")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("recipe_type", "menu_item")
        .eq("active", true)
        .order("name"),
    ]);
  const importIds = (imports ?? []).map((row) => row.id);
  const { data: rows } = importIds.length
    ? await supabase
        .from("source_import_rows")
        .select("normalized_data")
        .in("source_import_id", importIds)
    : { data: [] };
  const mapped = new Set(
    (mappings ?? []).map((mapping) => mapping.external_item_guid),
  );
  const queue = new Map<string, string>();
  for (const row of rows ?? []) {
    const guid = String(row.normalized_data.item_guid ?? "");
    if (guid && !mapped.has(guid)) {
      queue.set(
        guid,
        String(row.normalized_data.item_name ?? "Unknown Toast item"),
      );
    }
  }
  return {
    queue: [...queue.entries()].map(([guid, name]) => ({ guid, name })),
    recipes: recipes ?? [],
  };
}

export async function getTheoreticalUsage(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_theoretical_usage")
    .select(
      "id, business_date, quantity_base, unit_cost, theoretical_cost, calculation_run_id, inventory_items(name, base_unit_id), recipes(name), sales_items(item_name), calculation_runs(calculation_version, status)",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .order("business_date", { ascending: false });
  return data ?? [];
}
