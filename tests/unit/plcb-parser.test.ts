import { describe, expect, it } from "vitest";
import {
  normalizePlcbItemCode,
  getPlcbItemSizeMl,
  extractOrderMetadata,
  parsePlcbLineItems,
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

    it("extracts portal metadata from pdf-parse text", () => {
      const text = `
        Order Details: 188183476
        Order Date
        Jun 24, 2026
        Order Type
        Special Order
        Status
        Shipped
        Total Bottles \t36
        Gross Price \t$609.84
        Tax \t$52.79
        Freight* \t$107.00
        Order Total \t$819.63
      `;

      expect(extractOrderMetadata(text)).toEqual(
        expect.objectContaining({
          orderId: "188183476",
          date: "2026-06-24",
          type: "Special Order",
          status: "Shipped",
          totalAmount: 819.63,
          totalBottles: 36,
        }),
      );
    });
  });

  describe("parsePlcbLineItems", () => {
    it("parses licensee portal pickup rows split across multiple lines", () => {
      const text = `
        Item Qty (Bottles) Unit Price Item Total
        7303 Ordered: 3 $26.99 Licensee $80.97
        Jameson Irish Whiskey Shipped: 3 Discount
        750ML (1 bottle) | $1.18 per ounce $29.99
        $32.99 each
        2153 Ordered: 3 $23.39 Licensee $70.17
        Tito's Handmade Vodka Shipped: 3 Discount
        1L (1 bottle) | $0.77 per ounce $25.99
        $27.99 each
      `;

      expect(
        parsePlcbLineItems(
          text,
          "188074780",
          "2026-06-12",
          "Pickup",
          "Picked Up",
        ),
      ).toEqual([
        {
          order_id: "188074780",
          date: "2026-06-12",
          type: "Pickup",
          status: "Picked Up",
          item_code: "7303",
          product: "Jameson Irish Whiskey",
          bottle_size: "750ML",
          ordered_quantity: 3,
          shipped_quantity: 3,
          unit_price: 26.99,
          discount: 0,
          tax: 0,
          freight: 0,
          total: 80.97,
        },
        {
          order_id: "188074780",
          date: "2026-06-12",
          type: "Pickup",
          status: "Picked Up",
          item_code: "2153",
          product: "Tito's Handmade Vodka",
          bottle_size: "1L",
          ordered_quantity: 3,
          shipped_quantity: 3,
          unit_price: 23.39,
          discount: 0,
          tax: 0,
          freight: 0,
          total: 70.17,
        },
      ]);
    });

    it("parses special order portal rows where unit price says each", () => {
      const text = `
        Item Qty (Bottles) Unit Price Item Total
        649584 Ordered: 2 $30.49 each $60.98
        Giffard Liqueur Banane du Bresil Shipped: 2
        750ML (1 bottle) | $1.20 per ounce
        566525 Ordered: 12 $12.59 each $151.08
        Don Q Gold Rum Puerto Rico 80 Proof Shipped: 12
        1L (1 bottle) | $0.37 per ounce
      `;

      const rows = parsePlcbLineItems(
        text,
        "188183476",
        "2026-06-24",
        "Special Order",
        "Shipped from CAPITAL WINE & SPIRITS",
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        item_code: "649584",
        product: "Giffard Liqueur Banane du Bresil",
        bottle_size: "750ML",
        ordered_quantity: 2,
        shipped_quantity: 2,
        unit_price: 30.49,
        total: 60.98,
      });
      expect(rows[1]).toMatchObject({
        item_code: "566525",
        product: "Don Q Gold Rum Puerto Rico 80 Proof",
        bottle_size: "1L",
        ordered_quantity: 12,
        shipped_quantity: 12,
        unit_price: 12.59,
        total: 151.08,
      });
    });

    it("parses the text order returned by pdf-parse for portal PDFs", () => {
      const text = `
        7303
        Jameson Irish Whiskey
        750ML (1 bottle) | $1.18 per ounce
        Ordered: 3
        Shipped: 3
        $26.99 Licensee
        Discount
        $29.99
        $32.99 each
        $80.97
        7081
        Salignac Cognac VS
        750ML (1 bottle) | $0.87 per ounce
        Ordered: 1
        Shipped: 0
        $21.99 each \t$19.79
      `;

      const rows = parsePlcbLineItems(
        text,
        "188074780",
        "2026-06-12",
        "Pickup",
        "Picked Up",
      );

      expect(rows).toEqual([
        expect.objectContaining({
          item_code: "7303",
          product: "Jameson Irish Whiskey",
          bottle_size: "750ML",
          ordered_quantity: 3,
          shipped_quantity: 3,
          unit_price: 26.99,
          total: 80.97,
        }),
        expect.objectContaining({
          item_code: "7081",
          product: "Salignac Cognac VS",
          bottle_size: "750ML",
          ordered_quantity: 1,
          shipped_quantity: 0,
          unit_price: 21.99,
          total: 19.79,
        }),
      ]);
    });
  });
});
