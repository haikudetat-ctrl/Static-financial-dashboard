import { describe, expect, it } from "vitest";

import { createCostBook, type CostBookInputs } from "@/lib/recipes/costing";

function inputs(overrides: Partial<CostBookInputs> = {}): CostBookInputs {
  return {
    items: [
      { id: "gin", name: "Gin", outputRecipeId: null, manualUnitCost: null },
      {
        id: "sugar",
        name: "Sugar",
        outputRecipeId: null,
        manualUnitCost: null,
      },
      {
        id: "syrup",
        name: "Simple Syrup",
        outputRecipeId: "syrup-recipe",
        manualUnitCost: null,
      },
      {
        id: "egg",
        name: "Egg White",
        outputRecipeId: null,
        manualUnitCost: null,
      },
    ],
    recipes: [
      {
        id: "syrup-recipe",
        name: "Simple Syrup",
        outputQuantity: 1000,
        outputFactor: 1,
        components: [
          { kind: "inventory", itemId: "sugar", quantity: 500, factor: 1 },
        ],
      },
      {
        id: "martini",
        name: "Martini",
        outputQuantity: 1,
        outputFactor: 1,
        components: [
          { kind: "inventory", itemId: "gin", quantity: 2, factor: 29.5735 },
          {
            kind: "inventory",
            itemId: "syrup",
            quantity: 0.25,
            factor: 29.5735,
          },
        ],
      },
    ],
    onHandUnitCost: new Map(),
    snapshotUnitCost: new Map([["gin", 0.04]]),
    vendorUnitCost: new Map([["sugar", 0.002]]),
    ...overrides,
  };
}

describe("cost book", () => {
  it("costs from period snapshots and vendor prices before any count", () => {
    const book = createCostBook(inputs());
    expect(book.itemCost("gin")).toEqual({
      unitCost: 0.04,
      source: "snapshot",
    });
    expect(book.itemCost("sugar")).toEqual({
      unitCost: 0.002,
      source: "vendor",
    });
  });

  it("costs house-made items from their own recipe", () => {
    const book = createCostBook(inputs());
    // 500 g sugar × $0.002 / 1000 ml of syrup
    expect(book.itemCost("syrup")).toEqual({
      unitCost: 0.001,
      source: "recipe",
    });
  });

  it("rolls ingredient costs up into the recipe", () => {
    const martini = createCostBook(inputs()).recipeCost("martini");
    const expected = 2 * 29.5735 * 0.04 + 0.25 * 29.5735 * 0.001;
    expect(martini.totalCost).toBeCloseTo(expected, 6);
    expect(martini.missingCount).toBe(0);
  });

  it("prefers posted on-hand value over every other source", () => {
    const book = createCostBook(
      inputs({ onHandUnitCost: new Map([["gin", 0.05]]) }),
    );
    expect(book.itemCost("gin").source).toBe("on_hand");
  });

  it("uses a manual cost when nothing else exists and flags missing costs", () => {
    const book = createCostBook(
      inputs({
        items: [
          ...inputs().items.filter((item) => item.id !== "egg"),
          {
            id: "egg",
            name: "Egg White",
            outputRecipeId: null,
            manualUnitCost: 0.02,
          },
        ],
      }),
    );
    expect(book.itemCost("egg")).toEqual({ unitCost: 0.02, source: "manual" });
    const uncosted = createCostBook(inputs()).costComponents(
      [{ kind: "inventory", itemId: "egg", quantity: 1, factor: 1 }],
      { outputQuantity: 1, outputFactor: 1 },
    );
    expect(uncosted.missingCount).toBe(1);
  });

  it("survives a recipe that contains itself", () => {
    const book = createCostBook(
      inputs({
        recipes: [
          {
            id: "loop",
            name: "Loop",
            outputQuantity: 1,
            outputFactor: 1,
            components: [
              { kind: "recipe", recipeId: "loop", quantity: 1, factor: 1 },
            ],
          },
        ],
      }),
    );
    expect(book.recipeCost("loop").missingCount).toBeGreaterThan(0);
  });
});
