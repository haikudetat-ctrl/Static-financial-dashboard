import { describe, expect, it } from "vitest";

import {
  bestZoneForSection,
  matchItemByName,
  toBaseQuantity,
  zonesForArea,
} from "@/lib/drive/matching";

const zones = [
  { id: "bl", name: "Back Bar Left — Top Shelf", area: "Bar" },
  { id: "bm", name: "Back Bar Middle — Bottom Shelf", area: "Bar" },
  { id: "sf", name: "Service Fridge", area: "Bar" },
  { id: "p2", name: "Point 2 Refrigerator — Beer", area: "Bar" },
  { id: "st", name: "Staircase — Metro Rack", area: "Staircase" },
  { id: "wr", name: "Walk-in — Right Metro", area: "Walk-in" },
  { id: "wl", name: "Walk-in — Left Metro", area: "Walk-in" },
  { id: "of", name: "Office — Front Metro", area: "Office" },
];

describe("zonesForArea", () => {
  it("maps each count sheet's title to its zones", () => {
    const ids = (area: string) => zonesForArea(zones, area).map((z) => z.id);
    expect(ids("BACK BAR")).toEqual(["bl", "bm"]);
    expect(ids("FRIDGES")).toEqual(["sf", "p2"]);
    expect(ids("STAIRCASE METRO RACK")).toEqual(["st"]);
    expect(ids("WALK-IN")).toEqual(["wr", "wl"]);
    expect(ids("OFFICE")).toEqual(["of"]);
  });
});

describe("bestZoneForSection", () => {
  it("picks the shelf named in the section heading", () => {
    const walkIn = zonesForArea(zones, "WALK-IN");
    expect(bestZoneForSection(walkIn, "LEFT METRO").id).toBe("wl");
    expect(
      bestZoneForSection(walkIn, "RIGHT METRO — SYRUPS & JUICE (second shelf)")
        .id,
    ).toBe("wr");
  });
});

describe("matchItemByName", () => {
  const items = [
    { id: "1", name: "Tito's", itemCode: "88" },
    { id: "2", name: "Jameson", itemCode: "336" },
    { id: "3", name: "Jameson Black Barrel", itemCode: "337" },
    { id: "4", name: "Lime Juice (house)", itemCode: "2030" },
  ];

  it("prefers an exact name, ignoring case and punctuation", () => {
    expect(matchItemByName(items, "titos")?.id).toBe("1");
    expect(matchItemByName(items, "JAMESON")?.id).toBe("2");
  });

  it("accepts a unique partial match or an item number", () => {
    expect(matchItemByName(items, "lime juice")?.id).toBe("4");
    expect(matchItemByName(items, "336")?.id).toBe("2");
  });

  it("refuses ambiguous or unknown names", () => {
    expect(matchItemByName(items, "Black")?.id).toBe("3");
    // "Jameson B" fits both Jamesons.
    expect(matchItemByName(items, "Jameson B")).toBeNull();
    expect(matchItemByName(items, "Gin")).toBeNull();
  });
});

describe("toBaseQuantity", () => {
  const vodka = { unitType: "volume" as const, countUnitFactor: 750 };
  const sugar = { unitType: "weight" as const, countUnitFactor: null };

  it("reads oz as fluid ounces for liquids and as weight for solids", () => {
    expect(toBaseQuantity(2, "oz", vodka)).toBeCloseTo(59.147);
    expect(toBaseQuantity(2, "oz", sugar)).toBe(2);
  });

  it("treats a bottle as the item's own container", () => {
    expect(toBaseQuantity(1, "bottle", vodka)).toBe(750);
    expect(toBaseQuantity(2, "Bottles", vodka)).toBe(1500);
  });

  it("converts common bar units", () => {
    expect(toBaseQuantity(1, "qt", vodka)).toBeCloseTo(946.35);
    expect(toBaseQuantity(1000, "g", sugar)).toBeCloseTo(35.274);
    expect(toBaseQuantity(2.5, "gal", vodka)).toBeCloseTo(9463.53);
  });

  it("refuses units that don't fit the item", () => {
    expect(toBaseQuantity(5, "g", vodka)).toBeNull();
    expect(toBaseQuantity(1, "case", vodka)).toBeNull();
  });
});
