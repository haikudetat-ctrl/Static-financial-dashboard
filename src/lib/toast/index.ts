import type { ToastPmixRow } from "@/lib/types";
import { calculateTheoreticalSaleQuantity } from "@/lib/recipes/calculations";

export type PmixPackage = {
  businessDate: string;
  rows: ToastPmixRow[];
  sourceFile: string;
  totalNetSales: number;
  totalItems: number;
};

export type SalesSummaryPackage = {
  businessDate: string;
  files: Array<{ name: string; rows: Record<string, unknown>[] }>;
  sourceFile: string;
  totalNetSales: number;
};

export function parsePmixCsvRow(
  headers: string[],
  values: string[],
): ToastPmixRow | null {
  const get = (key: string): string => {
    const idx = headers.findIndex(
      (h) => h.trim().toLowerCase() === key.toLowerCase(),
    );
    return idx >= 0 ? (values[idx] ?? "").trim() : "";
  };

  const itemGuid =
    get("ItemGuid") || get("Item GUID") || get("guid") || get("id");
  const itemName =
    get("ItemName") || get("Item Name") || get("name") || get("product");
  const businessDate =
    get("BusinessDate") || get("Business Date") || get("Date") || get("date");
  const qtySold = parseFloat(
    get("Quantity") || get("Qty") || get("quantity_sold") || "0",
  );
  const netSales = parseFloat(
    get("NetSales") || get("Net Sales") || get("Amount") || get("total") || "0",
  );
  const voidQty = parseFloat(
    get("VoidQuantity") || get("Void Qty") || get("voids") || "0",
  );
  const compQty = parseFloat(
    get("CompQuantity") || get("Comp Qty") || get("comps") || "0",
  );
  const category =
    get("Category") ||
    get("SalesCategory") ||
    get("Sales Category") ||
    get("menu_group");
  const menuGroup =
    get("MenuGroup") ||
    get("Menu Group") ||
    get("group") ||
    get("section") ||
    category;

  if (!itemGuid || !businessDate) return null;

  return {
    item_guid: itemGuid,
    item_name: itemName || "Unknown Item",
    business_date: businessDate,
    quantity_sold: isNaN(qtySold) ? 0 : qtySold,
    net_sales: isNaN(netSales) ? 0 : netSales,
    void_quantity: isNaN(voidQty) ? 0 : voidQty,
    comp_quantity: isNaN(compQty) ? 0 : compQty,
    category: category || "Uncategorized",
    menu_group: menuGroup || category || "Uncategorized",
  };
}

export function extractBusinessDateFromZip(zipName: string): string | null {
  // Pattern: PMIX_2026-03-05.zip or SalesSummary_2026-03-05_2026-03-05.zip
  const match = zipName.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function getDistinctItemGuids(
  rows: ToastPmixRow[],
): Array<{ guid: string; name: string }> {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!seen.has(row.item_guid)) {
      seen.set(row.item_guid, row.item_name);
    }
  }
  return Array.from(seen.entries()).map(([guid, name]) => ({ guid, name }));
}

export function validatePmixTotals(
  rows: ToastPmixRow[],
  expectedNetSales: number,
): { match: boolean; actualTotal: number; difference: number } {
  const actualTotal = rows.reduce((sum, r) => sum + r.net_sales, 0);
  const diff = Math.abs(actualTotal - expectedNetSales);

  return {
    match: diff < 0.01,
    actualTotal,
    difference: diff,
  };
}

export function getPmixTheoreticalQuantity(row: ToastPmixRow) {
  return calculateTheoreticalSaleQuantity({
    quantitySold: row.quantity_sold,
    voidQuantity: row.void_quantity,
    compQuantity: row.comp_quantity,
  });
}
