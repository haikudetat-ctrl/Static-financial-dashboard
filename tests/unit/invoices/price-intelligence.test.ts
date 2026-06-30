import { describe, expect, it } from "vitest";

import {
  calculateCostChangePct,
  createPriceAlertCandidate,
} from "@/lib/invoices/price-intelligence";

describe("invoice price intelligence", () => {
  it("calculates cost change percentages from the previous cost", () => {
    expect(
      calculateCostChangePct({ previousCost: 10, currentCost: 11.5 }),
    ).toBe(0.15);
  });

  it("does not divide by zero when there is no previous cost", () => {
    expect(calculateCostChangePct({ previousCost: 0, currentCost: 11.5 })).toBe(
      null,
    );
  });

  it("creates a critical cost-increase alert when change is above threshold", () => {
    expect(
      createPriceAlertCandidate({
        previousCost: 10,
        currentCost: 12,
        threshold: 0.15,
        previousPackSize: "6 x 750 ml",
        currentPackSize: "6 x 750 ml",
      }),
    ).toEqual({
      alertType: "cost_increase",
      severity: "critical",
      changePct: 0.2,
      previousValue: 10,
      currentValue: 12,
    });
  });

  it("creates a pack-size alert before cost alerts because unit economics may have changed", () => {
    expect(
      createPriceAlertCandidate({
        previousCost: 10,
        currentCost: 12,
        threshold: 0.15,
        previousPackSize: "6 x 750 ml",
        currentPackSize: "12 x 750 ml",
      }),
    ).toMatchObject({
      alertType: "pack_size_changed",
      severity: "warning",
      previousValue: 10,
      currentValue: 12,
    });
  });
});
