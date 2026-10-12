import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { loadBudgetBasis } from "@/lib/reporting/budget-basis-data";

import { BudgetBasisView } from "./budget-basis-view";

export const metadata: Metadata = { title: "Budget basis" };

export default async function BudgetBasisPage({
  searchParams,
}: {
  searchParams: Promise<{ periods?: string }>;
}) {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const { periods } = await searchParams;
  const basis = await loadBudgetBasis(
    context.organizationId,
    context.locationId,
    periods,
  );
  if (!basis) return null;
  return <BudgetBasisView basis={basis} />;
}
