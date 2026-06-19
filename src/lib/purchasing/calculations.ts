import type { InvoiceAnomaly } from "@/lib/purchasing/types";

export function calculateSuggestedOrder({
  targetPar,
  onHand,
  openPoQuantity,
  packQuantity,
}: {
  targetPar: number;
  onHand: number;
  openPoQuantity: number;
  packQuantity: number;
}) {
  const rawNeed = Math.max(0, targetPar - onHand - openPoQuantity);
  const safePackQuantity = packQuantity > 0 ? packQuantity : 1;
  const suggestedQuantity =
    rawNeed === 0
      ? 0
      : Math.ceil(rawNeed / safePackQuantity) * safePackQuantity;

  return {
    rawNeed,
    suggestedQuantity,
    explanation: `Par ${targetPar}, on-hand ${onHand}, open PO ${openPoQuantity} → need ${rawNeed} → pack of ${safePackQuantity} → order ${suggestedQuantity}`,
  };
}

export function formatVendorOrder({
  vendorName,
  orderDate,
  lines,
}: {
  vendorName: string;
  orderDate: string;
  lines: Array<{ productName: string; quantity: number; unit: string }>;
}) {
  return [
    `${vendorName} order — ${orderDate}`,
    "",
    ...lines.map(
      (line) => `${line.quantity} ${line.unit} — ${line.productName}`,
    ),
  ].join("\n");
}

export function evaluateVendorOrderConstraints({
  subtotal,
  minimumOrderAmount,
  currentWeekday,
  currentTime,
  cutoffWeekday,
  cutoffTime,
  leadTimeDays,
}: {
  subtotal: number;
  minimumOrderAmount: number | null;
  currentWeekday: number;
  currentTime: string;
  cutoffWeekday: number | null;
  cutoffTime: string | null;
  leadTimeDays: number;
}) {
  const minimumMet =
    minimumOrderAmount === null || subtotal >= minimumOrderAmount;
  const cutoffOpen =
    cutoffWeekday === null ||
    cutoffTime === null ||
    currentWeekday < cutoffWeekday ||
    (currentWeekday === cutoffWeekday && currentTime <= cutoffTime);
  const weekday =
    cutoffWeekday === null
      ? ""
      : [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ][cutoffWeekday];
  const messages: string[] = [];

  if (!minimumMet && minimumOrderAmount !== null) {
    messages.push(
      `${(minimumOrderAmount - subtotal).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })} below the ${minimumOrderAmount.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })} vendor minimum.`,
    );
  }
  if (!cutoffOpen && cutoffTime) {
    messages.push(`The ${weekday} ${cutoffTime} cutoff has passed.`);
  }
  messages.push(
    `Normal lead time is ${leadTimeDays} day${leadTimeDays === 1 ? "" : "s"}.`,
  );

  return { minimumMet, cutoffOpen, messages };
}

export function calculateMovingWac({
  priorQuantity,
  priorValue,
  receiptQuantity,
  receiptValue,
  allocatedLandedCost,
}: {
  priorQuantity: number;
  priorValue: number;
  receiptQuantity: number;
  receiptValue: number;
  allocatedLandedCost: number;
}) {
  if (priorQuantity < 0) {
    throw new Error("Cannot calculate WAC with negative prior on-hand.");
  }
  const resultingQuantity = priorQuantity + receiptQuantity;
  if (resultingQuantity <= 0) {
    throw new Error("Resulting quantity must be positive.");
  }
  return (priorValue + receiptValue + allocatedLandedCost) / resultingQuantity;
}

export function detectInvoiceAnomalies({
  invoiceNumberExists,
  currentUnitPrice,
  previousUnitPrices,
  priceChangeThreshold,
  currentPackSize,
  previousPackSize,
  quantity,
  lineTotal,
  invoiceTotal,
  discountAmount = 0,
  taxAmount = 0,
  freightAmount = 0,
  depositAmount = 0,
  creditsAmount = 0,
}: {
  invoiceNumberExists: boolean;
  currentUnitPrice: number;
  previousUnitPrices: number[];
  priceChangeThreshold: number;
  currentPackSize: string;
  previousPackSize: string | null;
  quantity: number;
  lineTotal: number;
  invoiceTotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  freightAmount?: number;
  depositAmount?: number;
  creditsAmount?: number;
}): InvoiceAnomaly[] {
  const anomalies: InvoiceAnomaly[] = [];
  if (invoiceNumberExists) anomalies.push("duplicate_invoice");

  const previousAverage =
    previousUnitPrices.length > 0
      ? previousUnitPrices.reduce((sum, value) => sum + value, 0) /
        previousUnitPrices.length
      : null;
  if (
    previousAverage !== null &&
    previousAverage > 0 &&
    Math.abs(currentUnitPrice - previousAverage) / previousAverage >
      priceChangeThreshold
  ) {
    anomalies.push("price_change");
  }

  if (previousPackSize && currentPackSize !== previousPackSize) {
    anomalies.push("pack_size_change");
  }
  if (Math.abs(quantity * currentUnitPrice - lineTotal) >= 0.01) {
    anomalies.push("extended_total_mismatch");
  }
  if (
    invoiceTotal !== undefined &&
    Math.abs(
      lineTotal -
        discountAmount +
        taxAmount +
        freightAmount +
        depositAmount -
        creditsAmount -
        invoiceTotal,
    ) >= 0.01
  ) {
    anomalies.push("invoice_total_mismatch");
  }
  return anomalies;
}
