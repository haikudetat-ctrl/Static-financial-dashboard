import type {
  PriceAlertSeverity,
  PriceAlertType,
} from "@/lib/invoices/intelligence-types";

export function calculateCostChangePct({
  previousCost,
  currentCost,
}: {
  previousCost: number;
  currentCost: number;
}) {
  if (previousCost <= 0) return null;
  return roundRatio((currentCost - previousCost) / previousCost);
}

export function createPriceAlertCandidate({
  previousCost,
  currentCost,
  threshold,
  previousPackSize,
  currentPackSize,
}: {
  previousCost: number;
  currentCost: number;
  threshold: number;
  previousPackSize: string | null;
  currentPackSize: string;
}): {
  alertType: PriceAlertType;
  severity: PriceAlertSeverity;
  changePct: number | null;
  previousValue: number;
  currentValue: number;
} | null {
  const changePct = calculateCostChangePct({ previousCost, currentCost });

  if (previousPackSize !== null && previousPackSize !== currentPackSize) {
    return {
      alertType: "pack_size_changed",
      severity: "warning",
      changePct,
      previousValue: previousCost,
      currentValue: currentCost,
    };
  }

  if (changePct !== null && Math.abs(changePct) >= threshold) {
    return {
      alertType: "cost_increase",
      severity: changePct > 0 ? "critical" : "warning",
      changePct,
      previousValue: previousCost,
      currentValue: currentCost,
    };
  }

  return null;
}

function roundRatio(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
