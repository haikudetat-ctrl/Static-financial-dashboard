/**
 * Recipe costing that works before the inventory ledger has any value.
 *
 * Each ingredient's cost per base unit (ml, oz, each) comes from the first
 * source that has one:
 *   1. on hand    – weighted-average value of posted stock
 *   2. recipe     – the item's own recipe (house syrups, infusions, batches)
 *   3. manual     – a cost a manager typed in
 *   4. snapshot   – the period's opening cost (e.g. from the workbook import)
 *   5. vendor     – the last price paid, per base unit
 */

export type CostSource =
  | "on_hand"
  | "recipe"
  | "manual"
  | "snapshot"
  | "vendor"
  | "missing";

export const COST_SOURCE_LABEL: Record<CostSource, string> = {
  on_hand: "On hand",
  recipe: "Recipe",
  manual: "Set by hand",
  snapshot: "Period cost",
  vendor: "Last invoice",
  missing: "No cost",
};

export type CostBookItem = {
  id: string;
  name: string;
  /** Recipe that produces this item, if any. */
  outputRecipeId: string | null;
  manualUnitCost: number | null;
};

export type CostBookComponent =
  | {
      kind: "inventory";
      itemId: string;
      quantity: number;
      /** Component unit → item base unit. */
      factor: number;
    }
  | {
      kind: "recipe";
      recipeId: string;
      quantity: number;
      /** Component unit → nested recipe output base unit. */
      factor: number;
    };

export type CostBookRecipe = {
  id: string;
  name: string;
  outputQuantity: number;
  /** Output unit → base unit. */
  outputFactor: number;
  components: CostBookComponent[];
};

export type CostBookInputs = {
  items: CostBookItem[];
  recipes: CostBookRecipe[];
  onHandUnitCost: Map<string, number>;
  snapshotUnitCost: Map<string, number>;
  vendorUnitCost: Map<string, number>;
};

export type ItemCost = { unitCost: number | null; source: CostSource };

export type RecipeCostLine = {
  kind: "inventory" | "recipe";
  refId: string;
  name: string;
  quantityBase: number;
  unitCost: number | null;
  extendedCost: number;
  source: CostSource;
};

export type RecipeCost = {
  totalCost: number;
  /** Cost per base unit of the recipe's output (per ml, per each…). */
  costPerOutputBase: number | null;
  lines: RecipeCostLine[];
  /** Lines (direct or nested) with no cost at all. */
  missingCount: number;
};

export function createCostBook(inputs: CostBookInputs) {
  const items = new Map(inputs.items.map((item) => [item.id, item]));
  const recipes = new Map(inputs.recipes.map((recipe) => [recipe.id, recipe]));
  const itemMemo = new Map<string, ItemCost>();
  const recipeMemo = new Map<string, RecipeCost>();
  const inProgress = new Set<string>();

  function itemCost(itemId: string): ItemCost {
    const cached = itemMemo.get(itemId);
    if (cached) return cached;
    const item = items.get(itemId);
    let result: ItemCost = { unitCost: null, source: "missing" };

    const onHand = inputs.onHandUnitCost.get(itemId);
    if (onHand && onHand > 0) {
      result = { unitCost: onHand, source: "on_hand" };
    } else {
      const fromRecipe =
        item?.outputRecipeId && recipes.has(item.outputRecipeId)
          ? recipeCost(item.outputRecipeId)
          : null;
      const manual = item?.manualUnitCost;
      const snapshot = inputs.snapshotUnitCost.get(itemId);
      const vendor = inputs.vendorUnitCost.get(itemId);
      if (
        fromRecipe?.costPerOutputBase &&
        fromRecipe.costPerOutputBase > 0 &&
        fromRecipe.missingCount === 0
      ) {
        result = { unitCost: fromRecipe.costPerOutputBase, source: "recipe" };
      } else if (manual !== null && manual !== undefined && manual > 0) {
        result = { unitCost: manual, source: "manual" };
      } else if (snapshot && snapshot > 0) {
        result = { unitCost: snapshot, source: "snapshot" };
      } else if (vendor && vendor > 0) {
        result = { unitCost: vendor, source: "vendor" };
      } else if (fromRecipe?.costPerOutputBase) {
        // A partly costed recipe still beats nothing.
        result = { unitCost: fromRecipe.costPerOutputBase, source: "recipe" };
      }
    }
    itemMemo.set(itemId, result);
    return result;
  }

  function recipeCost(recipeId: string): RecipeCost {
    const cached = recipeMemo.get(recipeId);
    if (cached) return cached;
    const recipe = recipes.get(recipeId);
    if (!recipe || inProgress.has(recipeId)) {
      return {
        totalCost: 0,
        costPerOutputBase: null,
        lines: [],
        missingCount: 1,
      };
    }
    inProgress.add(recipeId);
    const result = costComponents(recipe.components, {
      outputQuantity: recipe.outputQuantity,
      outputFactor: recipe.outputFactor,
    });
    inProgress.delete(recipeId);
    recipeMemo.set(recipeId, result);
    return result;
  }

  /** Costs a list of components, e.g. a recipe being edited. */
  function costComponents(
    components: CostBookComponent[],
    output: { outputQuantity: number; outputFactor: number },
  ): RecipeCost {
    let missingCount = 0;
    const lines: RecipeCostLine[] = components.map((component) => {
      const quantityBase = component.quantity * component.factor;
      if (component.kind === "inventory") {
        const cost = itemCost(component.itemId);
        if (cost.unitCost === null) missingCount += 1;
        return {
          kind: "inventory",
          refId: component.itemId,
          name: items.get(component.itemId)?.name ?? "Inventory item",
          quantityBase,
          unitCost: cost.unitCost,
          extendedCost: quantityBase * (cost.unitCost ?? 0),
          source: cost.source,
        };
      }
      const nested = recipeCost(component.recipeId);
      missingCount += nested.missingCount;
      return {
        kind: "recipe",
        refId: component.recipeId,
        name: recipes.get(component.recipeId)?.name ?? "Recipe",
        quantityBase,
        unitCost: nested.costPerOutputBase,
        extendedCost: quantityBase * (nested.costPerOutputBase ?? 0),
        source: nested.costPerOutputBase === null ? "missing" : "recipe",
      };
    });
    const totalCost = lines.reduce((sum, line) => sum + line.extendedCost, 0);
    const outputBase = output.outputQuantity * output.outputFactor;
    return {
      totalCost,
      costPerOutputBase: outputBase > 0 ? totalCost / outputBase : null,
      lines,
      missingCount,
    };
  }

  return { itemCost, recipeCost, costComponents };
}

export type CostBook = ReturnType<typeof createCostBook>;
