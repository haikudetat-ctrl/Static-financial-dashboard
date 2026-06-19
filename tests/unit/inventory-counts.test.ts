import { describe, expect, it } from "vitest";

import {
  buildCountAssignments,
  calculateVariance,
  countedTotal,
  filterCountItems,
  formatInventoryQuantity,
  isMaterialVariance,
} from "@/lib/inventory/counts";

describe("inventory count helpers", () => {
  it("builds selected assignments and lines in walk order", () => {
    const assignments = buildCountAssignments(
      [
        {
          id: "room",
          name: "Liquor Room",
          walkOrder: 20,
          items: [
            { id: "gin", name: "Gin", walkOrder: 2 },
            { id: "bourbon", name: "Bourbon", walkOrder: 1 },
          ],
        },
        {
          id: "bar",
          name: "Back Bar",
          walkOrder: 10,
          items: [{ id: "lime", name: "Lime Juice", walkOrder: 1 }],
        },
      ],
      ["room", "bar"],
    );

    expect(
      assignments.map((assignment) => assignment.storageLocationId),
    ).toEqual(["bar", "room"]);
    expect(assignments[1].items.map((item) => item.id)).toEqual([
      "bourbon",
      "gin",
    ]);
  });

  it("adds bottle tenths only for open containers", () => {
    expect(
      countedTotal({
        countedQuantity: 2,
        countedTenths: 0.4,
        isOpenContainer: true,
      }),
    ).toBe(2.4);
    expect(
      countedTotal({
        countedQuantity: 2,
        countedTenths: 0.4,
        isOpenContainer: false,
      }),
    ).toBe(2);
  });

  it("calculates expected-minus-counted quantity and dollar variance", () => {
    expect(
      calculateVariance({
        expectedQuantity: 5,
        countedQuantity: 3.5,
        unitCost: 12,
        conversionFactorToBase: 750,
      }),
    ).toEqual({
      quantityVariance: 1.5,
      valueVariance: 13_500,
    });
  });

  it("treats threshold boundaries as material", () => {
    expect(
      isMaterialVariance(
        { quantityVariance: 1, valueVariance: 10 },
        { quantity: 1, value: 10 },
      ),
    ).toBe(true);
  });

  it("formats fixed precision without trailing zeros", () => {
    expect(formatInventoryQuantity(1125)).toBe("1,125");
    expect(formatInventoryQuantity(2.4)).toBe("2.4");
  });

  it("filters spot-count items by category or explicit item selection", () => {
    const items = [
      { id: "bourbon", categoryId: "spirits", storageLocationId: "bar" },
      { id: "gin", categoryId: "spirits", storageLocationId: "room" },
      { id: "lime", categoryId: "mixers", storageLocationId: "room" },
    ];

    expect(
      filterCountItems(items, {
        storageLocationIds: ["room"],
        categoryIds: ["spirits"],
        inventoryItemIds: [],
      }).map((item) => item.id),
    ).toEqual(["gin"]);

    expect(
      filterCountItems(items, {
        storageLocationIds: ["bar", "room"],
        categoryIds: [],
        inventoryItemIds: ["lime"],
      }).map((item) => item.id),
    ).toEqual(["lime"]);
  });
});
