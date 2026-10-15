import { describe, expect, it } from "vitest";

import {
  guessPack,
  suggestItemName,
  type UnitOption,
} from "@/lib/invoices/new-item";

const units: UnitOption[] = [
  { id: "each", name: "Each", unitType: "each", factor: 1 },
  { id: "lb", name: "Pound", unitType: "weight", factor: 16 },
  { id: "oz", name: "Ounce (weight)", unitType: "weight", factor: 1 },
  { id: "qt", name: "Quart", unitType: "volume", factor: 946.3529 },
  { id: "gal", name: "Gallon", unitType: "volume", factor: 3785.4118 },
  { id: "halfgal", name: "Half gallon", unitType: "volume", factor: 1892.7059 },
];

describe("suggestItemName", () => {
  it("drops the produce category and pack words", () => {
    expect(suggestItemName("berries, raspberries cs/flat")).toBe("Raspberries");
    expect(suggestItemName("citrus, orange cs 72-88ct")).toBe("Orange");
    expect(suggestItemName("red beet, ca ****SMALL****")).toBe(
      "Red Beet Small",
    );
  });

  it("drops sizes and origin from catalog descriptions", () => {
    expect(suggestItemName("HONEY CLOVER 5 LB USA")).toBe("Honey Clover");
    expect(suggestItemName("PEARS ASIAN 14-16 CT USA")).toBe("Pears Asian");
  });
});

describe("guessPack", () => {
  it("reads a multipack as that many each", () => {
    expect(guessPack("600X18 GR", units)).toEqual({
      countUnitId: "each",
      quantity: 600,
    });
    expect(guessPack("24X150 ML", units)).toEqual({
      countUnitId: "each",
      quantity: 24,
    });
  });

  it("reads a single measure in that unit", () => {
    expect(guessPack("5 LB", units)).toEqual({
      countUnitId: "lb",
      quantity: 5,
    });
    expect(guessPack("1 QT", units)).toEqual({
      countUnitId: "qt",
      quantity: 1,
    });
    expect(guessPack("8 OZ", units)).toEqual({
      countUnitId: "oz",
      quantity: 8,
    });
  });

  it("reads produce packs sold by the unit itself", () => {
    expect(guessPack("gal", units)).toEqual({
      countUnitId: "gal",
      quantity: 1,
    });
    expect(guessPack("half gallon", units)).toEqual({
      countUnitId: "halfgal",
      quantity: 1,
    });
  });

  it("leaves cases and counts for the manager", () => {
    expect(guessPack("cs", units)).toBeNull();
    expect(guessPack("14-16 CT", units)).toBeNull();
    expect(guessPack("", units)).toBeNull();
    expect(guessPack(null, units)).toBeNull();
  });
});
