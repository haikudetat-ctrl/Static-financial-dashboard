import { describe, expect, it } from "vitest";

import {
  calculateRecipeCost,
  calculateProductionComponentScale,
  calculateTheoreticalSaleQuantity,
  detectRecipeCycle,
  expandRecipeComponents,
  selectEffectiveRecipeVersion,
} from "@/lib/recipes/calculations";
import type { RecipeDefinition } from "@/lib/recipes/types";

describe("recipe calculations", () => {
  it("selects the active recipe version covering the business date", () => {
    expect(
      selectEffectiveRecipeVersion(
        [
          {
            id: "v1",
            status: "active",
            effectiveFrom: "2026-01-01",
            effectiveTo: "2026-06-14",
          },
          {
            id: "v2",
            status: "active",
            effectiveFrom: "2026-06-15",
            effectiveTo: null,
          },
        ],
        "2026-06-19",
      )?.id,
    ).toBe("v2");
  });

  it("ignores draft versions even when their dates cover the sale", () => {
    expect(
      selectEffectiveRecipeVersion(
        [
          {
            id: "draft",
            status: "draft",
            effectiveFrom: "2026-01-01",
            effectiveTo: null,
          },
        ],
        "2026-06-19",
      ),
    ).toBeNull();
  });

  it("detects direct and indirect recipe cycles", () => {
    expect(detectRecipeCycle({ a: ["a"] })).toEqual(["a", "a"]);
    expect(
      detectRecipeCycle({
        oldFashioned: ["syrup"],
        syrup: ["demerara"],
        demerara: ["oldFashioned"],
      }),
    ).toEqual(["oldFashioned", "syrup", "demerara", "oldFashioned"]);
  });

  it("returns null for an acyclic recipe graph", () => {
    expect(
      detectRecipeCycle({
        oldFashioned: ["syrup"],
        syrup: [],
      }),
    ).toBeNull();
  });

  it("expands nested recipe output into purchased base inventory", () => {
    const recipes: Record<string, RecipeDefinition> = {
      oldFashioned: {
        id: "oldFashioned",
        outputQuantity: 1,
        components: [
          {
            kind: "inventory",
            inventoryItemId: "bourbon",
            quantity: 2,
            conversionFactorToBase: 29.5735,
          },
          {
            kind: "recipe",
            recipeId: "syrup",
            quantity: 0.25,
            conversionFactorToBase: 1,
            nestedOutputConversionFactorToBase: 1,
          },
        ],
      },
      syrup: {
        id: "syrup",
        outputQuantity: 10,
        components: [
          {
            kind: "inventory",
            inventoryItemId: "sugar",
            quantity: 500,
            conversionFactorToBase: 1,
          },
          {
            kind: "inventory",
            inventoryItemId: "water",
            quantity: 500,
            conversionFactorToBase: 1,
          },
        ],
      },
    };

    expect(expandRecipeComponents("oldFashioned", recipes)).toEqual([
      { inventoryItemId: "bourbon", quantityBase: 59.147 },
      { inventoryItemId: "sugar", quantityBase: 12.5 },
      { inventoryItemId: "water", quantityBase: 12.5 },
    ]);
  });

  it("converts nested component and output units before scaling", () => {
    const recipes: Record<string, RecipeDefinition> = {
      menu: {
        id: "menu",
        outputQuantity: 1,
        components: [
          {
            kind: "recipe",
            recipeId: "batch",
            quantity: 1,
            conversionFactorToBase: 1000,
            nestedOutputConversionFactorToBase: 1,
          },
        ],
      },
      batch: {
        id: "batch",
        outputQuantity: 1000,
        components: [
          {
            kind: "inventory",
            inventoryItemId: "sugar",
            quantity: 500,
            conversionFactorToBase: 1,
          },
        ],
      },
    };

    expect(expandRecipeComponents("menu", recipes)).toEqual([
      { inventoryItemId: "sugar", quantityBase: 500 },
    ]);
  });

  it("combines repeated purchased items and calculates current recipe cost", () => {
    const expanded = [
      { inventoryItemId: "bourbon", quantityBase: 50 },
      { inventoryItemId: "bourbon", quantityBase: 9.147 },
      { inventoryItemId: "sugar", quantityBase: 12.5 },
    ];

    expect(
      calculateRecipeCost(expanded, {
        bourbon: 0.04,
        sugar: 0.003,
      }),
    ).toBeCloseTo(2.40338);
  });

  it("consumes sold and comped items while excluding voids", () => {
    expect(
      calculateTheoreticalSaleQuantity({
        quantitySold: 12,
        voidQuantity: 2,
        compQuantity: 3,
      }),
    ).toBe(10);
  });

  it("never returns negative theoretical sale quantity", () => {
    expect(
      calculateTheoreticalSaleQuantity({
        quantitySold: 1,
        voidQuantity: 3,
        compQuantity: 0,
      }),
    ).toBe(0);
  });

  it("uses planned output to preserve ingredient consumption when yield is low", () => {
    expect(
      calculateProductionComponentScale({
        plannedOutputQuantity: 100,
        actualOutputQuantity: 80,
        recipeOutputQuantity: 100,
      }),
    ).toBe(1);
  });

  it("falls back to actual output when no production plan was entered", () => {
    expect(
      calculateProductionComponentScale({
        plannedOutputQuantity: null,
        actualOutputQuantity: 50,
        recipeOutputQuantity: 100,
      }),
    ).toBe(0.5);
  });
});
