import type { RecipeCatalog } from "@/lib/recipes/cost-book";

import type {
  EditorIngredient,
  EditorRecipe,
  EditorUnit,
} from "./recipe-editor";

/** Ingredient list, units and output items for the recipe editor. */
export function buildEditorData(catalog: RecipeCatalog, recipe: EditorRecipe) {
  const ownOutput = recipe.outputItemId;
  const usedRecipes = new Set(
    recipe.lines
      .filter((line) => line.kind === "recipe")
      .map((line) => line.refId),
  );

  const items: EditorIngredient[] = catalog.items
    .filter((item) => item.id !== ownOutput)
    .map((item) => {
      const cost = catalog.book.itemCost(item.id);
      return {
        kind: "inventory" as const,
        id: item.id,
        name: item.name,
        code: item.itemCode,
        unitType: item.unitType,
        unitCost: cost.unitCost,
        source: cost.source,
      };
    });

  // Recipes appear as their own ingredient only when they don't already
  // fill an inventory item (which is listed above and costed by its recipe).
  const recipes: EditorIngredient[] = catalog.recipes
    .filter(
      (candidate) =>
        candidate.id !== recipe.id &&
        candidate.version &&
        candidate.recipeType !== "menu_item" &&
        (!candidate.outputItemId || usedRecipes.has(candidate.id)),
    )
    .concat(
      catalog.recipes.filter(
        (candidate) =>
          usedRecipes.has(candidate.id) &&
          (candidate.recipeType === "menu_item" || !candidate.version),
      ),
    )
    .map((candidate) => {
      const cost = catalog.book.recipeCost(candidate.id);
      const outputUnit = candidate.version
        ? catalog.unitById.get(candidate.version.outputUnitId)
        : undefined;
      return {
        kind: "recipe" as const,
        id: candidate.id,
        name: candidate.name,
        code: null,
        unitType: outputUnit?.unitType ?? "volume",
        unitCost: cost.costPerOutputBase,
        source: cost.costPerOutputBase === null ? "missing" : "recipe",
      };
    });

  const units: EditorUnit[] = catalog.units.map((unit) => ({
    id: unit.id,
    abbreviation: unit.abbreviation,
    unitType: unit.unitType,
    factor: unit.factor,
  }));

  const outputItems = catalog.items
    .filter(
      (item) =>
        item.isProduced &&
        (!item.outputRecipeId || item.outputRecipeId === recipe.id),
    )
    .map((item) => ({ id: item.id, name: item.name, unitType: item.unitType }));

  return {
    ingredients: [...items, ...recipes].filter(
      (ingredient, index, list) =>
        list.findIndex(
          (other) =>
            other.kind === ingredient.kind && other.id === ingredient.id,
        ) === index,
    ),
    units,
    outputItems,
  };
}

/** Editor state for an existing recipe in the catalog. */
export function editorRecipeFrom(
  catalog: RecipeCatalog,
  recipeId: string,
): EditorRecipe | null {
  const recipe = catalog.recipeById.get(recipeId);
  if (!recipe) return null;
  const version = recipe.version;
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    recipeType: recipe.recipeType as EditorRecipe["recipeType"],
    menuPrice: recipe.menuPrice,
    outputQuantity: version?.outputQuantity ?? 1,
    outputUnitId: version?.outputUnitId ?? "",
    outputItemId: recipe.outputItemId,
    yieldIsApproximate: version?.yieldIsApproximate ?? false,
    notes: version?.notes ?? "",
    versionNumber: version?.versionNumber ?? null,
    versionEffectiveFrom: version?.effectiveFrom ?? null,
    lines: (version?.components ?? []).map((component) => ({
      kind: component.kind,
      refId: component.refId,
      quantity: component.quantity,
      unitId: component.unitId,
      notes: component.notes,
    })),
  };
}
