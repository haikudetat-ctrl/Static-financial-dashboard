"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { detectInvoiceAnomalies } from "@/lib/purchasing/calculations";
import { createClient } from "@/lib/supabase/server";

async function requireManager() {
  const context = await getUserContext();
  if (!context || context.role !== "manager" || !context.organizationId) {
    throw new Error("Manager access required.");
  }
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) throw new Error("No location is configured.");
  return { context, locationId };
}

export async function registerInvoiceAction(formData: FormData) {
  const { context, locationId } = await requireManager();
  const supabase = await createClient();
  const vendorId = String(formData.get("vendor_id") ?? "");
  const invoiceNumber = String(formData.get("invoice_number") ?? "").trim();
  const productCode = String(formData.get("vendor_product_code") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const unitPrice = Number(formData.get("unit_price") ?? 0);
  const lineTotal = Number(formData.get("line_total") ?? 0);
  const totalAmount = Number(formData.get("total_amount") ?? lineTotal);
  const packSize = String(formData.get("pack_size") ?? "");
  const inventoryItemId =
    String(formData.get("inventory_item_id") ?? "") || null;
  const receiptLineId = String(formData.get("receipt_line_id") ?? "") || null;
  const sourceImportId = String(formData.get("source_import_id") ?? "") || null;
  const discountAmount = Number(formData.get("discount_amount") ?? 0);
  const taxAmount = Number(formData.get("tax_amount") ?? 0);
  const freightAmount = Number(formData.get("freight_amount") ?? 0);
  const depositAmount = Number(formData.get("deposit_amount") ?? 0);
  const creditsAmount = Number(formData.get("credits_amount") ?? 0);

  if (!vendorId || !invoiceNumber || quantity <= 0 || lineTotal < 0) {
    throw new Error("Invoice header and line details are required.");
  }

  const [{ count: duplicateCount }, { data: history }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("vendor_id", vendorId)
      .eq("invoice_number", invoiceNumber),
    supabase
      .from("invoice_lines")
      .select("unit_price, pack_size")
      .eq("vendor_product_code", productCode)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const anomalies = detectInvoiceAnomalies({
    invoiceNumberExists: (duplicateCount ?? 0) > 0,
    currentUnitPrice: unitPrice,
    previousUnitPrices: (history ?? []).map((row) => Number(row.unit_price)),
    priceChangeThreshold: 0.15,
    currentPackSize: packSize,
    previousPackSize: history?.[0]?.pack_size ?? null,
    quantity,
    lineTotal,
    invoiceTotal: totalAmount,
    discountAmount,
    taxAmount,
    freightAmount,
    depositAmount,
    creditsAmount,
  });
  if (anomalies.includes("duplicate_invoice")) {
    throw new Error("This vendor invoice number already exists.");
  }
  const { data: sourceImport } = sourceImportId
    ? await supabase
        .from("source_imports")
        .select("id, file_path")
        .eq("id", sourceImportId)
        .eq("organization_id", context.organizationId)
        .single()
    : { data: null };
  const { data: receiptMatch } = receiptLineId
    ? await supabase
        .from("receipt_lines")
        .select("receipt_id")
        .eq("id", receiptLineId)
        .single()
    : { data: null };

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      organization_id: context.organizationId,
      location_id: locationId,
      vendor_id: vendorId,
      invoice_number: invoiceNumber,
      order_id: String(formData.get("order_id") ?? ""),
      invoice_date: String(formData.get("invoice_date") ?? ""),
      status: "reviewed",
      total_amount: totalAmount,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      freight_amount: freightAmount,
      deposit_amount: depositAmount,
      credits_amount: creditsAmount,
      source_import_id: sourceImport?.id ?? null,
      document_file_path:
        sourceImport?.file_path ??
        String(formData.get("document_file_path") ?? ""),
      extractor_version: "manual-v1",
      reviewed_by: context.user.id,
    })
    .select("id")
    .single();
  if (invoiceError) throw new Error(invoiceError.message);

  const { error: lineError } = await supabase.from("invoice_lines").insert({
    invoice_id: invoice.id,
    line_index: 0,
    vendor_product_code: productCode,
    product_description: String(formData.get("product_description") ?? ""),
    pack_size: packSize,
    quantity_invoiced: quantity,
    unit_price: unitPrice,
    line_total: lineTotal,
    inventory_item_id: inventoryItemId,
    receipt_line_id: receiptLineId,
    anomaly_codes: anomalies,
  });
  if (lineError) throw new Error(lineError.message);

  const adjustmentRows = [
    { adjustment_type: "discount", amount: discountAmount },
    { adjustment_type: "tax", amount: taxAmount },
    { adjustment_type: "freight", amount: freightAmount },
    { adjustment_type: "deposit", amount: depositAmount },
    { adjustment_type: "credit", amount: creditsAmount },
  ]
    .filter((row) => row.amount !== 0)
    .map((row) => ({ ...row, invoice_id: invoice.id }));
  if (adjustmentRows.length > 0) {
    const { error } = await supabase
      .from("invoice_adjustments")
      .insert(adjustmentRows);
    if (error) throw new Error(error.message);
  }

  const { error: matchError } = await supabase
    .from("invoice_match_results")
    .insert({
      invoice_id: invoice.id,
      receipt_id: receiptMatch?.receipt_id ?? null,
      match_type: receiptLineId ? "exact" : "unmatched",
      confidence: receiptLineId ? 1 : 0,
      reviewed_by: context.user.id,
      approved_at: receiptLineId ? new Date().toISOString() : null,
    });
  if (matchError) throw new Error(matchError.message);

  revalidatePath("/invoices/upload");
  redirect(`/invoices/${invoice.id}/review`);
}

export async function approveInvoiceAction(invoiceId: string) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_invoice", {
    target_invoice_id: invoiceId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/invoices/upload");
  revalidatePath(`/invoices/${invoiceId}/review`);
  revalidatePath("/inventory/on-hand");
}
