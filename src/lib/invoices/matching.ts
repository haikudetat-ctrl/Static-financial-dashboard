import type {
  InvoiceMatchStrategy,
  MatchConfidenceBand,
} from "@/lib/invoices/intelligence-types";

export function normalizeInvoiceText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyMatchConfidence(score: number): MatchConfidenceBand {
  if (score >= 0.95) return "auto_match";
  if (score >= 0.75) return "suggested_match";
  return "new_item";
}

export function canAutoPostSuggestion({
  score,
  strategy,
  unitCompatible,
  priceCompatible,
}: {
  score: number;
  strategy: InvoiceMatchStrategy;
  unitCompatible: boolean;
  priceCompatible: boolean;
}) {
  return (
    classifyMatchConfidence(score) === "auto_match" &&
    strategy !== "semantic_match" &&
    unitCompatible &&
    priceCompatible
  );
}

export function buildMatchReasonCodes({
  sameVendorCode,
  aliasFromReview,
  unitCompatible,
  priceChangePct,
  semanticOnly,
}: {
  sameVendorCode: boolean;
  aliasFromReview: boolean;
  unitCompatible: boolean;
  priceChangePct: number | null;
  semanticOnly: boolean;
}) {
  const reasons: string[] = [];

  if (sameVendorCode) reasons.push("same_vendor_code");
  if (aliasFromReview) reasons.push("alias_from_review");
  if (!unitCompatible) reasons.push("unit_mismatch");
  if (priceChangePct !== null && Math.abs(priceChangePct) >= 0.15) {
    reasons.push("price_change_over_15_pct");
  }
  if (semanticOnly) reasons.push("semantic_only");

  return reasons;
}
