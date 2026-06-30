import { NextResponse } from "next/server";

import { getUserContext } from "@/lib/auth/session";
import { getInvoiceStatusSummary } from "@/lib/invoices/queries";

export async function GET(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const userContext = await getUserContext();
  if (!userContext?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const status = await getInvoiceStatusSummary({
    organizationId: userContext.organizationId,
    invoiceId,
  });

  return NextResponse.json({ status });
}
