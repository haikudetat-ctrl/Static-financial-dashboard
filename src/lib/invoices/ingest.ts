import crypto from "node:crypto";

import { registerImport } from "@/lib/imports";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type IngestResult = {
  invoiceId: string;
  jobId: string | null;
  sourceImportId?: string;
  duplicate: boolean;
};

/**
 * Stores an invoice document, opens an invoice for it and queues text
 * extraction. Shared by the upload screen and the Drive inbox, so both
 * land in the same review queue. A document seen before returns its
 * existing invoice.
 */
export async function ingestInvoiceDocument({
  supabase,
  organizationId,
  locationId,
  buffer,
  fileName,
  contentType,
  vendorId,
  invoiceNumber = "",
  parserVersion = "invoice-v1",
}: {
  supabase: Supabase;
  organizationId: string;
  locationId: string;
  buffer: Buffer;
  fileName: string;
  contentType: string;
  vendorId: string;
  invoiceNumber?: string;
  parserVersion?: string;
}): Promise<IngestResult> {
  const documentHash = crypto.createHash("sha256").update(buffer).digest("hex");

  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id, processing_job_id")
    .eq("organization_id", organizationId)
    .eq("document_hash", documentHash)
    .maybeSingle();
  if (existingInvoice) {
    return {
      invoiceId: existingInvoice.id,
      jobId: existingInvoice.processing_job_id,
      duplicate: true,
    };
  }

  const safeName = fileName.replace(/[^\w.\- ]+/g, "_");
  const filePath = `${organizationId}/${locationId}/vendor_invoice/${Date.now()}_${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("source-documents")
    .upload(filePath, buffer, {
      contentType: contentType || "application/pdf",
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  const importResult = await registerImport({
    fileHash: documentHash,
    fileName,
    filePath,
    sourceType: "vendor_invoice",
    organizationId,
    locationId,
    parserVersion,
  });

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      vendor_id: vendorId,
      invoice_number:
        invoiceNumber.trim() || `pending-${documentHash.slice(0, 12)}`,
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
    throw new Error(invoiceError?.message ?? "Failed to create invoice.");
  }

  const { data: job, error: jobError } = await supabase
    .from("invoice_processing_jobs")
    .insert({
      organization_id: organizationId,
      location_id: locationId,
      source_import_id: importResult.importId,
      invoice_id: invoice.id,
      idempotency_key: `invoice-upload:${organizationId}:${documentHash}`,
      source_channel: "upload",
      status: "queued",
      parser_version: parserVersion,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    throw new Error(jobError?.message ?? "Failed to create processing job.");
  }

  await supabase
    .from("invoices")
    .update({ processing_job_id: job.id })
    .eq("id", invoice.id);

  createAdminClient()
    .functions.invoke("extract-invoice", {
      body: {
        importId: importResult.importId,
        filePath,
        organizationId,
        locationId,
        jobId: job.id,
      },
    })
    .catch(() => {
      // Extraction updates the durable job record; ingest stays non-blocking.
    });

  return {
    invoiceId: invoice.id,
    jobId: job.id,
    sourceImportId: importResult.importId,
    duplicate: importResult.duplicate,
  };
}
