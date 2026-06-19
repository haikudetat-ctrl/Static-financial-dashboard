import { describe, expect, it } from "vitest";
import {
  normalizePlcbItemCode,
  getPlcbItemSizeMl,
  extractOrderMetadata,
} from "@/lib/plcb";

describe("PLCB parser", () => {
  describe("normalizePlcbItemCode", () => {
    it("strips whitespace and uppercases", () => {
      expect(normalizePlcbItemCode(" abc-123 ")).toBe("ABC-123");
    });

    it("collapses internal spaces", () => {
      expect(normalizePlcbItemCode("AB 123")).toBe("AB123");
    });
  });

  describe("getPlcbItemSizeMl", () => {
    it("parses explicit ml sizes", () => {
      expect(getPlcbItemSizeMl("750 ml")).toBe(750);
      expect(getPlcbItemSizeMl("375 ml")).toBe(375);
    });

    it("parses liter sizes", () => {
      expect(getPlcbItemSizeMl("1 L")).toBe(1000);
      expect(getPlcbItemSizeMl("1.75 L")).toBe(1750);
    });

    it("handles common bottle sizes by keyword", () => {
      expect(getPlcbItemSizeMl("750")).toBe(750);
      expect(getPlcbItemSizeMl("1L")).toBe(1000);
    });

    it("returns 0 for unknown sizes", () => {
      expect(getPlcbItemSizeMl("unknown")).toBe(0);
    });
  });

  describe("extractOrderMetadata", () => {
    it("extracts order id, date, type, and status from text", () => {
      const text = `
        Order #123456
        Date: 3/15/2026
        Pickup
        Posted
        Total $1,234.56
        12 Bottles
      `;

      const metadata = extractOrderMetadata(text);

      expect(metadata.orderId).toBe("123456");
      expect(metadata.date).toBe("2026-03-15");
      expect(metadata.type).toBe("Pickup");
      expect(metadata.status).toBe("Posted");
      expect(metadata.totalAmount).toBe(1234.56);
      expect(metadata.totalBottles).toBe(12);
    });

    it("returns defaults when no metadata found", () => {
      const metadata = extractOrderMetadata("garbage text");

      expect(metadata.orderId).toBe("unknown");
      expect(metadata.totalAmount).toBe(0);
      expect(metadata.totalBottles).toBe(0);
    });
  });
});
