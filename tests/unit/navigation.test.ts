import { describe, expect, it } from "vitest";

import { managerNavigation, staffNavigation } from "@/lib/navigation";

describe("application navigation", () => {
  it("groups manager workspaces as overview, operations, then data", () => {
    expect(
      managerNavigation.map((item) => `${item.group}:${item.label}`),
    ).toEqual([
      "Overview:Today",
      "Overview:Financials",
      "Operations:Inventory",
      "Operations:Purchasing",
      "Operations:Invoices",
      "Operations:Recipes",
      "Data:Imports",
      "Data:Mapping",
      "Data:Exceptions",
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
