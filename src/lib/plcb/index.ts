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

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index].trim();
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

      continue;
    }

    const portalHeaderMatch = row.match(
      /^(\d+)\s+Ordered:\s*(\d+)\s+\$?([\d,]+\.\d{2})(?:\s+each)?(?:\s+Licensee(?:\s+Discount)?)?\s+\$?([\d,]+\.\d{2})$/i,
    );

    if (portalHeaderMatch) {
      const productRow = rows[index + 1]?.trim() ?? "";
      const sizeRow = rows[index + 2]?.trim() ?? "";
      const productMatch = productRow.match(/^(.+?)\s+Shipped:\s*(\d+)\b/i);
      const sizeMatch = sizeRow.match(/^([0-9.]+\s*(?:ML|L|oz|gal|qt|pt|cl))/i);

      if (!productMatch || !sizeMatch) continue;

      lines.push({
        order_id: orderId,
        date,
        type: orderType,
        status: orderStatus,
        item_code: portalHeaderMatch[1].trim(),
        product: productMatch[1].trim(),
        bottle_size: sizeMatch[1].replace(/\s+/g, ""),
        ordered_quantity: parseInt(portalHeaderMatch[2], 10),
        shipped_quantity: parseInt(productMatch[2], 10),
        unit_price: parseFloat(portalHeaderMatch[3].replace(",", "")),
        discount: 0,
        tax: 0,
        freight: 0,
        total: parseFloat(portalHeaderMatch[4].replace(",", "")),
      });

      index += 2;
      continue;
    }

    const codeOnlyMatch = row.match(/^(\d{3,})$/);

    if (codeOnlyMatch) {
      const productRow = rows[index + 1]?.trim() ?? "";
      const sizeRow = rows[index + 2]?.trim() ?? "";
      const orderedRow = rows[index + 3]?.trim() ?? "";
      const shippedRow = rows[index + 4]?.trim() ?? "";
      const sizeMatch = sizeRow.match(/^([0-9.]+\s*(?:ML|L|oz|gal|qt|pt|cl))/i);
      const orderedMatch = orderedRow.match(/^Ordered:\s*(\d+)$/i);
      const shippedMatch = shippedRow.match(/^Shipped:\s*(\d+)$/i);

      if (!productRow || !sizeMatch || !orderedMatch || !shippedMatch) {
        continue;
      }

      const moneyValues: number[] = [];
      let endIndex = index + 5;

      for (; endIndex < rows.length; endIndex++) {
        const candidate = rows[endIndex].trim();
        if (candidate.match(/^(\d{3,})$/) && moneyValues.length > 0) break;

        for (const amount of candidate.matchAll(/\$([\d,]+\.\d{2})/g)) {
          moneyValues.push(parseFloat(amount[1].replace(",", "")));
        }
      }

      if (moneyValues.length < 2) continue;

      lines.push({
        order_id: orderId,
        date,
        type: orderType,
        status: orderStatus,
        item_code: codeOnlyMatch[1].trim(),
        product: productRow,
        bottle_size: sizeMatch[1].replace(/\s+/g, ""),
        ordered_quantity: parseInt(orderedMatch[1], 10),
        shipped_quantity: parseInt(shippedMatch[1], 10),
        unit_price: moneyValues[0],
        discount: 0,
        tax: 0,
        freight: 0,
        total: moneyValues[moneyValues.length - 1],
      });

      index = endIndex - 1;
    }
  }

  return lines;
}

export function extractOrderMetadata(text: string): Partial<PlcbInvoice> {
  const orderIdMatch = text.match(
    /(?:Order\s+Details:|Order|ORD|Order\s+#?)\s*[#]?\s*(\d{6,})/i,
  );
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const monthDateMatch = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s+(\d{4})/i,
  );
  const typeMatch = text.match(/(Pickup|Special\s*Order)/i);
  const statusMatch = text.match(
    /(Picked\s+Up|Shipped|Posted|Processing|Cancelled)/i,
  );
  const totalMatch = text.match(
    /(?:Order\s+Total|Total)\s+\$?([\d,]+\.\d{2})/i,
  );
  const bottleCountMatch =
    text.match(/Total\s+Bottles\s+(\d+)/i) ??
    text.match(/(\d+)\s*(?:Bottles|Items|bottles|items)/i);
  const dateParts = dateMatch
    ? {
        year: dateMatch[3],
        month: dateMatch[1],
        day: dateMatch[2],
      }
    : monthDateMatch
      ? {
          year: monthDateMatch[3],
          month: String(getMonthNumber(monthDateMatch[1])),
          day: monthDateMatch[2],
        }
      : null;

  return {
    orderId: orderIdMatch?.[1] ?? "unknown",
    date: dateParts
      ? `${dateParts.year}-${dateParts.month.padStart(2, "0")}-${dateParts.day.padStart(2, "0")}`
      : "",
    type: typeMatch?.[1] ?? "Pickup",
    status: statusMatch?.[1] ?? "Posted",
    totalAmount: totalMatch ? parseFloat(totalMatch[1].replace(",", "")) : 0,
    totalBottles: bottleCountMatch ? parseInt(bottleCountMatch[1], 10) : 0,
  };
}

function getMonthNumber(monthName: string) {
  return (
    [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monthName.slice(0, 3).toLowerCase()) + 1
  );
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
