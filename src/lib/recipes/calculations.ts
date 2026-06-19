import type {
  ExpandedRecipeComponent,
  RecipeDefinition,
  RecipeVersionWindow,
} from "@/lib/recipes/types";

export function selectEffectiveRecipeVersion(
  versions: RecipeVersionWindow[],
  businessDate: string,
) {
  return (
    [...versions]
      .filter(
        (version) =>
          version.status === "active" &&
          version.effectiveFrom <= businessDate &&
          (!version.effectiveTo || version.effectiveTo >= businessDate),
      )
      .sort((left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom),
      )[0] ?? null
  );
}

export function detectRecipeCycle(
  graph: Record<string, string[]>,
): string[] | null {
  function visit(node: string, path: string[]): string[] | null {
    const cycleStart = path.indexOf(node);
    if (cycleStart >= 0) return [...path.slice(cycleStart), node];

    for (const child of graph[node] ?? []) {
      const cycle = visit(child, [...path, node]);
      if (cycle) return cycle;
    }
    return null;
  }

  for (const node of Object.keys(graph)) {
    const cycle = visit(node, []);
    if (cycle) return cycle;
  }
  return null;
}

export function expandRecipeComponents(
  recipeId: string,
  recipes: Record<string, RecipeDefinition>,
): ExpandedRecipeComponent[] {
  const totals = new Map<string, number>();

  function expand(currentRecipeId: string, multiplier: number) {
    const recipe = recipes[currentRecipeId];
    if (!recipe || recipe.outputQuantity <= 0) {
      throw new Error(`Recipe ${currentRecipeId} has no valid output yield.`);
    }

    for (const component of recipe.components) {
      if (component.kind === "inventory") {
        const quantityBase =
          component.quantity * component.conversionFactorToBase * multiplier;
        totals.set(
          component.inventoryItemId,
          (totals.get(component.inventoryItemId) ?? 0) + quantityBase,
        );
      } else {
        const nestedRecipe = recipes[component.recipeId];
        if (!nestedRecipe || nestedRecipe.outputQuantity <= 0) {
          throw new Error(
            `Nested recipe ${component.recipeId} has no valid output yield.`,
          );
        }
        expand(
          component.recipeId,
          multiplier *
            ((component.quantity * component.conversionFactorToBase) /
              (nestedRecipe.outputQuantity *
                component.nestedOutputConversionFactorToBase)),
        );
      }
    }
  }

  expand(recipeId, 1);
  return [...totals.entries()].map(([inventoryItemId, quantityBase]) => ({
    inventoryItemId,
    quantityBase,
  }));
}

export function calculateRecipeCost(
  components: ExpandedRecipeComponent[],
  costByInventoryItem: Record<string, number>,
) {
  return components.reduce(
    (total, component) =>
      total +
      component.quantityBase *
        (costByInventoryItem[component.inventoryItemId] ?? 0),
    0,
  );
}

export function calculateTheoreticalSaleQuantity({
  quantitySold,
  voidQuantity,
}: {
  quantitySold: number;
  voidQuantity: number;
  compQuantity: number;
}) {
  return Math.max(0, quantitySold - voidQuantity);
}

export function calculateProductionComponentScale({
  plannedOutputQuantity,
  actualOutputQuantity,
  recipeOutputQuantity,
}: {
  plannedOutputQuantity: number | null;
  actualOutputQuantity: number;
  recipeOutputQuantity: number;
}) {
  if (recipeOutputQuantity <= 0) {
    throw new Error("Recipe output quantity must be positive.");
  }
  return (plannedOutputQuantity ?? actualOutputQuantity) / recipeOutputQuantity;
}
