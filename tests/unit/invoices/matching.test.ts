import { describe, expect, it } from "vitest";

import {
  buildMatchReasonCodes,
  canAutoPostSuggestion,
  classifyMatchConfidence,
  normalizeInvoiceText,
} from "@/lib/invoices/matching";

describe("invoice intelligence matching", () => {
  it("normalizes vendor descriptions for deterministic comparison", () => {
    expect(normalizeInvoiceText("  La Colombe 12 x 1L - COLD BREW!!! ")).toBe(
      "la colombe 12 x 1l cold brew",
    );
  });

  it("classifies match confidence into auto, suggested, and new-item bands", () => {
    expect(classifyMatchConfidence(0.95)).toBe("auto_match");
    expect(classifyMatchConfidence(0.75)).toBe("suggested_match");
    expect(classifyMatchConfidence(0.749)).toBe("new_item");
  });

  it("blocks semantic-only suggestions from auto-posting", () => {
    expect(
      canAutoPostSuggestion({
        score: 0.98,
        strategy: "semantic_match",
        unitCompatible: true,
        priceCompatible: true,
      }),
    ).toBe(false);
  });

  it("allows deterministic high-confidence matches to auto-post when units and price are compatible", () => {
    expect(
      canAutoPostSuggestion({
        score: 0.98,
        strategy: "vendor_item_code",
        unitCompatible: true,
        priceCompatible: true,
      }),
    ).toBe(true);
  });

  it("builds explainable reason codes for review cards", () => {
    expect(
      buildMatchReasonCodes({
        sameVendorCode: true,
        aliasFromReview: true,
        unitCompatible: false,
        priceChangePct: 0.18,
        semanticOnly: false,
      }),
    ).toEqual([
      "same_vendor_code",
      "alias_from_review",
      "unit_mismatch",
      "price_change_over_15_pct",
    ]);
  });
});
