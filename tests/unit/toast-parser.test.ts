import { describe, expect, it } from "vitest";
import {
  parsePmixCsvRow,
  getDistinctItemGuids,
  validatePmixTotals,
  extractBusinessDateFromZip,
  getPmixTheoreticalQuantity,
} from "@/lib/toast";
import type { ToastPmixRow } from "@/lib/types";

describe("Toast parser", () => {
  describe("parsePmixCsvRow", () => {
    it("parses a standard PMIX CSV row", () => {
      const headers = [
        "ItemGuid",
        "ItemName",
        "BusinessDate",
        "Quantity",
        "NetSales",
        "Category",
      ];
      const values = [
        "abc-123",
        "Old Fashioned",
        "2026-03-05",
        "5",
        "75.00",
        "Cocktails",
      ];

      const result = parsePmixCsvRow(headers, values);

      expect(result).not.toBeNull();
      expect(result!.item_guid).toBe("abc-123");
      expect(result!.item_name).toBe("Old Fashioned");
      expect(result!.business_date).toBe("2026-03-05");
      expect(result!.quantity_sold).toBe(5);
      expect(result!.net_sales).toBe(75);
      expect(result!.category).toBe("Cocktails");
      expect(result!.void_quantity).toBe(0);
      expect(result!.comp_quantity).toBe(0);
    });

    it("handles alternate column names", () => {
      const headers = ["guid", "name", "date", "qty", "total"];
      const values = ["def-456", "Martini", "2026-03-06", "3", "45.00"];

      const result = parsePmixCsvRow(headers, values);

      expect(result).not.toBeNull();
      expect(result!.item_guid).toBe("def-456");
      expect(result!.item_name).toBe("Martini");
      expect(result!.quantity_sold).toBe(3);
    });

    it("returns null for rows missing required fields", () => {
      const result = parsePmixCsvRow(["name"], ["test"]);
      expect(result).toBeNull();
    });

    it("handles void and comp quantities", () => {
      const headers = [
        "ItemGuid",
        "ItemName",
        "BusinessDate",
        "Quantity",
        "VoidQuantity",
        "CompQuantity",
      ];
      const values = ["abc-123", "Beer", "2026-03-05", "10", "1", "2"];

      const result = parsePmixCsvRow(headers, values);

      expect(result!.quantity_sold).toBe(10);
      expect(result!.void_quantity).toBe(1);
      expect(result!.comp_quantity).toBe(2);
    });

    it("defaults numeric fields to 0 when missing", () => {
      const headers = ["ItemGuid", "ItemName", "BusinessDate"];
      const values = ["abc-123", "Wine", "2026-03-05"];

      const result = parsePmixCsvRow(headers, values);

      expect(result!.quantity_sold).toBe(0);
      expect(result!.net_sales).toBe(0);
    });
  });

  describe("getDistinctItemGuids", () => {
    it("returns unique GUIDs with their names", () => {
      const rows: ToastPmixRow[] = [
        {
          item_guid: "a",
          item_name: "Item A",
          business_date: "2026-03-05",
          quantity_sold: 1,
          net_sales: 10,
          void_quantity: 0,
          comp_quantity: 0,
          category: "Cat",
          menu_group: "Cat",
        },
        {
          item_guid: "b",
          item_name: "Item B",
          business_date: "2026-03-05",
          quantity_sold: 2,
          net_sales: 20,
          void_quantity: 0,
          comp_quantity: 0,
          category: "Cat",
          menu_group: "Cat",
        },
        {
          item_guid: "a",
          item_name: "Item A",
          business_date: "2026-03-06",
          quantity_sold: 3,
          net_sales: 30,
          void_quantity: 0,
          comp_quantity: 0,
          category: "Cat",
          menu_group: "Cat",
        },
      ];

      const distinct = getDistinctItemGuids(rows);

      expect(distinct).toHaveLength(2);
      expect(distinct.find((d) => d.guid === "a")?.name).toBe("Item A");
      expect(distinct.find((d) => d.guid === "b")?.name).toBe("Item B");
    });
  });

  describe("validatePmixTotals", () => {
    it("reports match when totals align", () => {
      const rows: ToastPmixRow[] = [
        {
          item_guid: "a",
          item_name: "A",
          business_date: "",
          quantity_sold: 1,
          net_sales: 100,
          void_quantity: 0,
          comp_quantity: 0,
          category: "",
          menu_group: "",
        },
        {
          item_guid: "b",
          item_name: "B",
          business_date: "",
          quantity_sold: 1,
          net_sales: 50,
          void_quantity: 0,
          comp_quantity: 0,
          category: "",
          menu_group: "",
        },
      ];

      const result = validatePmixTotals(rows, 150);
      expect(result.match).toBe(true);
    });

    it("reports mismatch when totals differ", () => {
      const rows: ToastPmixRow[] = [
        {
          item_guid: "a",
          item_name: "A",
          business_date: "",
          quantity_sold: 1,
          net_sales: 100,
          void_quantity: 0,
          comp_quantity: 0,
          category: "",
          menu_group: "",
        },
      ];

      const result = validatePmixTotals(rows, 200);
      expect(result.match).toBe(false);
      expect(result.difference).toBeCloseTo(100);
    });
  });

  describe("getPmixTheoreticalQuantity", () => {
    it("includes comps and excludes voided items from ingredient usage", () => {
      expect(
        getPmixTheoreticalQuantity({
          item_guid: "old-fashioned",
          item_name: "Old Fashioned",
          business_date: "2026-06-19",
          quantity_sold: 12,
          void_quantity: 2,
          comp_quantity: 3,
          net_sales: 108,
          category: "Cocktails",
          menu_group: "Classics",
        }),
      ).toBe(10);
    });
  });

  describe("extractBusinessDateFromZip", () => {
    it("extracts date from PMIX zip name", () => {
      expect(extractBusinessDateFromZip("PMIX_2026-03-05.zip")).toBe(
        "2026-03-05",
      );
    });

    it("extracts date from sales summary zip", () => {
      expect(
        extractBusinessDateFromZip("SalesSummary_2026-03-05_2026-03-05.zip"),
      ).toBe("2026-03-05");
    });

    it("returns null for names without dates", () => {
      expect(extractBusinessDateFromZip("random.zip")).toBeNull();
    });
  });
});
