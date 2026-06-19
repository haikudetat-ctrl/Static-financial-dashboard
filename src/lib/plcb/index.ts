import type { PlcbOrderRow } from "@/lib/types";

export type PlcbInvoice = {
  orderId: string;
  date: string;
  type: string;
  status: string;
  lines: PlcbOrderRow[];
  totalAmount: number;
  totalBottles: number;
};

export function parsePlcbLineItems(
  text: string,
  orderId: string,
  date: string,
  orderType: string,
  orderStatus: string,
): PlcbOrderRow[] {
  const lines: PlcbOrderRow[] = [];
  const rows = text.split("\n").filter((l) => l.trim());

  for (const row of rows) {
    const lineItemRegex =
      /^(\S+(?:\s+\S+)?)\s+(.+?)\s+(\d+\s*(?:ml|L|oz|gal|qt|pt|cl)?)\s+(\d+)\s+(\d+)\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/i;

    const match = row.match(lineItemRegex);

    if (match) {
      const itemCode = match[1].trim();
      const product = match[2].trim();
      const bottleSize = match[3].trim();
      const orderedQty = parseInt(match[4], 10);
      const shippedQty = parseInt(match[5], 10);
      const unitPrice = parseFloat(match[6].replace(",", ""));
      const lineTotal = parseFloat(match[7].replace(",", ""));

      lines.push({
        order_id: orderId,
        date,
        type: orderType,
        status: orderStatus,
        item_code: itemCode,
        product,
        bottle_size: bottleSize,
        ordered_quantity: orderedQty,
        shipped_quantity: shippedQty,
        unit_price: unitPrice,
        discount: 0,
        tax: 0,
        freight: 0,
        total: lineTotal,
      });
    }
  }

  return lines;
}

export function extractOrderMetadata(text: string): Partial<PlcbInvoice> {
  const orderIdMatch = text.match(
    /(?:Order|ORD|Order\s+#?)\s*[#]?\s*(\d{6,})/i,
  );
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const typeMatch = text.match(/(Pickup|Special\s*Order)/i);
  const statusMatch = text.match(/(Posted|Processing|Cancelled)/i);
  const totalMatch = text.match(/Total\s+\$?([\d,]+\.\d{2})/i);
  const bottleCountMatch = text.match(
    /(\d+)\s*(?:Bottles|Items|bottles|items)/i,
  );

  return {
    orderId: orderIdMatch?.[1] ?? "unknown",
    date: dateMatch
      ? `${dateMatch[3]}-${dateMatch[1].padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`
      : "",
    type: typeMatch?.[1] ?? "Pickup",
    status: statusMatch?.[1] ?? "Posted",
    totalAmount: totalMatch ? parseFloat(totalMatch[1].replace(",", "")) : 0,
    totalBottles: bottleCountMatch ? parseInt(bottleCountMatch[1], 10) : 0,
  };
}

export function normalizePlcbItemCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function getPlcbItemSizeMl(size: string): number {
  const cleaned = size.trim().toLowerCase();

  const mlMatch = cleaned.match(/^(\d+)\s*ml$/);
  if (mlMatch) return parseInt(mlMatch[1], 10);

  const lMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*l$/);
  if (lMatch) return parseFloat(lMatch[1]) * 1000;

  if (cleaned.includes("750")) return 750;
  if (cleaned.includes("1000") || cleaned.includes("1l")) return 1000;
  if (cleaned.includes("375")) return 375;
  if (cleaned.includes("200")) return 200;
  if (cleaned.includes("50")) return 50;

  return 0;
}
