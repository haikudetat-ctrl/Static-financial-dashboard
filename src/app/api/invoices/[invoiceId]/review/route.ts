import { NextResponse } from "next/server";

import { getUserContext } from "@/lib/auth/session";
import { getInvoiceReviewPayload } from "@/lib/invoices/queries";

export async function GET(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const userContext = await getUserContext();
  if (!userContext?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;

  try {
    const review = await getInvoiceReviewPayload({
      organizationId: userContext.organizationId,
      invoiceId,
    });

    return NextResponse.json({ review });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load review.";
    const status = message === "Invoice not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
