import { NextResponse, type NextRequest } from "next/server";

import { getUserContext } from "@/lib/auth/session";
import { basisCsv } from "@/lib/reporting/budget-basis";
import { loadBudgetBasis } from "@/lib/reporting/budget-basis-data";

/** The budget basis as a CSV, for building the budget in a spreadsheet. */
export async function GET(request: NextRequest) {
  const context = await getUserContext();
  if (!context?.organizationId || context.role !== "manager") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const basis = await loadBudgetBasis(
    context.organizationId,
    context.locationId,
    request.nextUrl.searchParams.get("periods") ?? undefined,
  );
  if (!basis || basis.periods.length === 0) {
    return NextResponse.json(
      { error: "No periods to export" },
      { status: 404 },
    );
  }
  const name = `budget-basis-${basis.periods.map((period) => period.name.replace(/\s+/g, "")).join("-")}.csv`;
  return new NextResponse(
    basisCsv(basis.periods, basis.rows, basis.annualDays),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    },
  );
}
