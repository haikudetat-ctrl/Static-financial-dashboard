import type { Delta } from "@/components/ui";

/**
 * Benchmarks the P&L is held to. Prime cost (cost of goods + labor) at or
 * under 60% of sales is the common bar-and-restaurant rule of thumb; cost of
 * goods is held to its theoretical cost from recipes instead of a fixed %.
 */
export const PRIME_COST_TARGET = 0.6;

const trendOf = (change: number) =>
  Math.abs(change) < 1e-9 ? "flat" : change > 0 ? "up" : "down";

/** Percent change in an amount, e.g. "4.1% vs P9 FY26". */
export function amountDelta(
  current: number,
  prior: number,
  {
    against,
    higherIsBetter = true,
  }: { against?: string; higherIsBetter?: boolean } = {},
): Delta | undefined {
  if (!prior) return undefined;
  const change = (current - prior) / Math.abs(prior);
  const trend = trendOf(change);
  return {
    label: `${Math.abs(change * 100).toFixed(1)}%${against ? ` vs ${against}` : ""}`,
    trend,
    good: trend === "flat" ? undefined : change > 0 === higherIsBetter,
  };
}

/** Change between two ratios in percentage points, e.g. "1.2 pts". */
export function pointsDelta(
  current: number | null,
  prior: number | null,
  {
    lowerIsBetter = false,
    suffix = "",
  }: { lowerIsBetter?: boolean; suffix?: string } = {},
): Delta | undefined {
  if (current === null || prior === null) return undefined;
  const change = (current - prior) * 100;
  const trend = trendOf(Math.round(change * 10) / 10);
  return {
    label: `${Math.abs(change).toFixed(1)} pts${suffix}`,
    trend,
    good: trend === "flat" ? undefined : change < 0 === lowerIsBetter,
  };
}
