import { describe, expect, it } from "vitest";
import { roundToPack, formatQuantity } from "@/lib/conversions";

describe("unit conversion utilities", () => {
  describe("roundToPack", () => {
    it("rounds up to nearest pack size", () => {
      expect(roundToPack(5, 6)).toBe(6);
      expect(roundToPack(6, 6)).toBe(6);
      expect(roundToPack(7, 6)).toBe(12);
      expect(roundToPack(0, 6)).toBe(0);
    });

    it("respects minimum order quantity", () => {
      expect(roundToPack(1, 6, 12)).toBe(12);
      expect(roundToPack(5, 6, 6)).toBe(6);
      expect(roundToPack(0, 6, 6)).toBe(6);
    });

    it("handles fractional quantities", () => {
      expect(roundToPack(2.5, 6)).toBe(6);
      expect(roundToPack(6.1, 6)).toBe(12);
    });
  });

  describe("formatQuantity", () => {
    it("formats to specified decimal places", () => {
      expect(formatQuantity(5.1234, 2)).toBe("5.12");
      expect(formatQuantity(5.1234, 3)).toBe("5.123");
      expect(formatQuantity(5.1234, 0)).toBe("5");
    });

    it("removes trailing zeros when not needed", () => {
      expect(formatQuantity(5.0, 3)).toBe("5");
    });
  });
});
