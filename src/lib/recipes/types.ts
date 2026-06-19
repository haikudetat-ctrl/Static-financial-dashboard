export type RecipeVersionWindow = {
  id: string;
  status: "draft" | "active" | "retired";
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type InventoryRecipeComponent = {
  kind: "inventory";
  inventoryItemId: string;
  quantity: number;
  conversionFactorToBase: number;
};

export type NestedRecipeComponent = {
  kind: "recipe";
  recipeId: string;
  quantity: number;
  conversionFactorToBase: number;
  nestedOutputConversionFactorToBase: number;
};

export type RecipeDefinition = {
  id: string;
  outputQuantity: number;
  components: Array<InventoryRecipeComponent | NestedRecipeComponent>;
};

export type ExpandedRecipeComponent = {
  inventoryItemId: string;
  quantityBase: number;
};
