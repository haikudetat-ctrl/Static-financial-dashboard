import { describe, expect, it } from "vitest";

import { managerNavigation, staffNavigation } from "@/lib/navigation";

describe("application navigation", () => {
  it("exposes every manager workspace from the approved design", () => {
    expect(managerNavigation.map((item) => item.label)).toEqual([
      "Today",
      "Imports",
      "Mapping",
      "Financial health",
      "Purchasing",
      "Inventory",
      "Recipes",
      "Exceptions",
    ]);
  });

  it("keeps staff navigation focused on four mobile tasks", () => {
    expect(staffNavigation.map((item) => item.label)).toEqual([
      "Receive",
      "Count",
      "Production",
      "Waste",
    ]);
  });
});
