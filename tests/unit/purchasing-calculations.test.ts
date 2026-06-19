import { describe, expect, it } from "vitest";

import {
  calculateMovingWac,
  calculateSuggestedOrder,
  detectInvoiceAnomalies,
  evaluateVendorOrderConstraints,
  formatVendorOrder,
} from "@/lib/purchasing/calculations";

describe("purchasing calculations", () => {
  it("subtracts on-hand and open PO quantity, then rounds to a valid pack", () => {
    expect(
      calculateSuggestedOrder({
        targetPar: 12,
        onHand: 3,
        openPoQuantity: 2,
        packQuantity: 6,
      }),
    ).toEqual({
      rawNeed: 7,
      suggestedQuantity: 12,
      explanation:
        "Par 12, on-hand 3, open PO 2 → need 7 → pack of 6 → order 12",
    });
  });

  it("never suggests a negative order", () => {
    expect(
      calculateSuggestedOrder({
        targetPar: 6,
        onHand: 8,
        openPoQuantity: 2,
        packQuantity: 1,
      }).suggestedQuantity,
    ).toBe(0);
  });

  it("formats a vendor-ready order", () => {
    expect(
      formatVendorOrder({
        vendorName: "PLCB",
        orderDate: "2026-06-19",
        lines: [
          { productName: "Bourbon 750 ml", quantity: 2, unit: "case" },
          { productName: "Gin 750 ml", quantity: 1, unit: "case" },
        ],
      }),
    ).toContain("2 case — Bourbon 750 ml");
  });

  it("explains minimum-order and cutoff conflicts", () => {
    expect(
      evaluateVendorOrderConstraints({
        subtotal: 72,
        minimumOrderAmount: 100,
        currentWeekday: 1,
        currentTime: "14:30",
        cutoffWeekday: 1,
        cutoffTime: "14:00",
        leadTimeDays: 2,
      }),
    ).toEqual({
      minimumMet: false,
      cutoffOpen: false,
      messages: [
        "$28.00 below the $100.00 vendor minimum.",
        "The Monday 14:00 cutoff has passed.",
        "Normal lead time is 2 days.",
      ],
    });
  });

  it("calculates moving weighted-average cost", () => {
    expect(
      calculateMovingWac({
        priorQuantity: 10,
        priorValue: 100,
        receiptQuantity: 5,
        receiptValue: 75,
        allocatedLandedCost: 5,
      }),
    ).toBe(12);
  });

  it("rejects WAC calculation with negative prior on-hand", () => {
    expect(() =>
      calculateMovingWac({
        priorQuantity: -1,
        priorValue: -10,
        receiptQuantity: 5,
        receiptValue: 75,
        allocatedLandedCost: 0,
      }),
    ).toThrow("negative");
  });

  it("flags duplicate, price, pack, and extended-total anomalies", () => {
    expect(
      detectInvoiceAnomalies({
        invoiceNumberExists: true,
        currentUnitPrice: 15,
        previousUnitPrices: [10, 10, 10],
        priceChangeThreshold: 0.15,
        currentPackSize: "12 x 750 ml",
        previousPackSize: "6 x 750 ml",
        quantity: 2,
        lineTotal: 20,
      }),
    ).toEqual([
      "duplicate_invoice",
      "price_change",
      "pack_size_change",
      "extended_total_mismatch",
    ]);
  });

  it("flags an invoice header that does not reconcile to lines and charges", () => {
    expect(
      detectInvoiceAnomalies({
        invoiceNumberExists: false,
        currentUnitPrice: 10,
        previousUnitPrices: [],
        priceChangeThreshold: 0.15,
        currentPackSize: "1 x 750 ml",
        previousPackSize: null,
        quantity: 2,
        lineTotal: 20,
        taxAmount: 2,
        invoiceTotal: 25,
      }),
    ).toContain("invoice_total_mismatch");
  });
});
