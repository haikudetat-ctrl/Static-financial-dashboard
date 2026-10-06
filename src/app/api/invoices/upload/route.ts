import { NextResponse } from "next/server";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { ingestInvoiceDocument } from "@/lib/invoices/ingest";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const context = await getUserContext();
  if (!context?.organizationId || context.role !== "manager") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const vendorId = String(formData.get("vendorId") ?? "");
  const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
  const parserVersion = String(formData.get("parserVersion") ?? "invoice-v1");

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!vendorId) {
    return NextResponse.json(
      { error: "vendorId is required until vendor detection is enabled." },
      { status: 400 },
    );
  }

  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) {
    return NextResponse.json(
      { error: "No location is configured." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const result = await ingestInvoiceDocument({
      supabase,
      organizationId: context.organizationId,
      locationId,
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      contentType: file.type,
      vendorId,
      invoiceNumber,
      parserVersion,
    });
    return NextResponse.json(
      result.duplicate && !result.sourceImportId
        ? { invoiceId: result.invoiceId, jobId: result.jobId, duplicate: true }
        : { ...result, status: "queued" },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
