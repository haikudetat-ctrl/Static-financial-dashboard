import { describe, expect, it } from "vitest";

import { convertCount, unitOptionsFor } from "@/lib/inventory/count-units";

const units = [
  { id: "gal", label: "1 gal jug", factor: 3785.4118, type: "volume" as const },
  { id: "750", label: "750 ml bottle", factor: 750, type: "volume" as const },
  {
    id: "qt",
    label: "quart container",
    factor: 946.353,
    type: "volume" as const,
  },
  { id: "lb", label: "lb", factor: 16, type: "weight" as const },
  { id: "ea", label: "ea", factor: 1, type: "each" as const },
];

describe("unitOptionsFor", () => {
  it("offers only units that measure the same thing, smallest first", () => {
    expect(unitOptionsFor(units, "volume").map((u) => u.id)).toEqual([
      "750",
      "qt",
      "gal",
    ]);
    expect(unitOptionsFor(units, "weight").map((u) => u.id)).toEqual(["lb"]);
  });
});

describe("convertCount", () => {
  it("re-expresses a quantity in another container", () => {
    // 2 bottles of 750 ml in gallon jugs.
    expect(convertCount(2, 750, 3785.4118)).toBeCloseTo(0.3963, 4);
    // 1.5 jugs in bottles.
    expect(convertCount(1.5, 3785.4118, 750)).toBeCloseTo(7.571, 3);
  });

  it("leaves the number alone when a factor is missing", () => {
    expect(convertCount(3, 0, 750)).toBe(3);
  });
});
