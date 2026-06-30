import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { getUserContext } from "@/lib/auth/session";
import { registerImport } from "@/lib/imports";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createAdminClient } from "@/lib/supabase/admin";
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
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const documentHash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");
    const supabase = await createClient();

    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id, processing_job_id")
      .eq("organization_id", context.organizationId)
      .eq("document_hash", documentHash)
      .maybeSingle();
    if (existingInvoice) {
      return NextResponse.json({
        invoiceId: existingInvoice.id,
        jobId: existingInvoice.processing_job_id,
        duplicate: true,
      });
    }

    const filePath = `${context.organizationId}/${locationId}/vendor_invoice/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("source-documents")
      .upload(filePath, buffer, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const importResult = await registerImport({
      fileHash: documentHash,
      fileName: file.name,
      filePath,
      sourceType: "vendor_invoice",
      organizationId: context.organizationId,
      locationId,
      parserVersion,
    });

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        organization_id: context.organizationId,
        location_id: locationId,
        vendor_id: vendorId,
        invoice_number: invoiceNumber || `pending-${documentHash.slice(0, 12)}`,
        invoice_date: new Date().toISOString().slice(0, 10),
        status: "uploaded",
        total_amount: 0,
        source_import_id: importResult.importId,
        document_file_path: filePath,
        extractor_version: parserVersion,
        source_channel: "upload",
        document_hash: documentHash,
        validation_status: "unvalidated",
      })
      .select("id")
      .single();
    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: invoiceError?.message ?? "Failed to create invoice." },
        { status: 500 },
      );
    }

    const idempotencyKey = `invoice-upload:${context.organizationId}:${documentHash}`;
    const { data: job, error: jobError } = await supabase
      .from("invoice_processing_jobs")
      .insert({
        organization_id: context.organizationId,
        location_id: locationId,
        source_import_id: importResult.importId,
        invoice_id: invoice.id,
        idempotency_key: idempotencyKey,
        source_channel: "upload",
        status: "queued",
        parser_version: parserVersion,
      })
      .select("id")
      .single();
    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message ?? "Failed to create processing job." },
        { status: 500 },
      );
    }

    await supabase
      .from("invoices")
      .update({ processing_job_id: job.id })
      .eq("id", invoice.id);

    const admin = createAdminClient();
    admin.functions
      .invoke("extract-invoice", {
        body: {
          importId: importResult.importId,
          filePath,
          organizationId: context.organizationId,
          locationId,
          jobId: job.id,
        },
      })
      .catch(() => {
        // Extraction updates the durable job record; upload stays non-blocking.
      });

    return NextResponse.json({
      invoiceId: invoice.id,
      sourceImportId: importResult.importId,
      jobId: job.id,
      status: "queued",
      duplicate: importResult.duplicate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
