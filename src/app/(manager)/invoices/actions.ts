"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { parseReviewApprovalInput } from "@/lib/invoices/queries";
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

export async function approveInvoiceReviewAction(
  reviewId: string,
  input: unknown,
) {
  const { context, locationId } = await requireManager();
  const parsedInput = parseReviewApprovalInput(input);
  const supabase = await createClient();

  const { data: reviewCard, error: reviewError } = await supabase
    .from("review_queue")
    .select("id, entity_type, entity_id, prefill_payload")
    .eq("id", reviewId)
    .eq("organization_id", context.organizationId)
    .single();
  if (reviewError || !reviewCard) {
    throw new Error(reviewError?.message ?? "Review card not found.");
  }

  if (
    reviewCard.entity_type === "invoice_line_candidate" &&
    parsedInput.selectedMatchId
  ) {
    const { error: candidateError } = await supabase
      .from("invoice_line_candidates")
      .update({
        current_best_match_id: parsedInput.selectedMatchId,
        validation_status: "valid",
      })
      .eq("id", reviewCard.entity_id)
      .eq("organization_id", context.organizationId);
    if (candidateError) throw new Error(candidateError.message);
  }

  const { error: actionError } = await supabase.from("review_actions").insert({
    organization_id: context.organizationId,
    location_id: locationId,
    review_queue_id: reviewId,
    actor_type: "human",
    actor_id: context.user.id,
    action: "approved",
    before_payload: reviewCard.prefill_payload ?? {},
    after_payload: {
      selected_match_id: parsedInput.selectedMatchId ?? null,
      idempotency_key: parsedInput.idempotencyKey,
      notes: parsedInput.notes,
    },
    notes: parsedInput.notes,
  });
  if (actionError) throw new Error(actionError.message);

  const { error: updateError } = await supabase
    .from("review_queue")
    .update({
      status: "resolved",
      resolved_by: context.user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .eq("organization_id", context.organizationId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/invoices/review");
}

export async function rejectInvoiceReviewAction(
  reviewId: string,
  reason: string,
) {
  const { context, locationId } = await requireManager();
  const supabase = await createClient();

  const { data: reviewCard, error: reviewError } = await supabase
    .from("review_queue")
    .select("id, prefill_payload")
    .eq("id", reviewId)
    .eq("organization_id", context.organizationId)
    .single();
  if (reviewError || !reviewCard) {
    throw new Error(reviewError?.message ?? "Review card not found.");
  }

  const { error: actionError } = await supabase.from("review_actions").insert({
    organization_id: context.organizationId,
    location_id: locationId,
    review_queue_id: reviewId,
    actor_type: "human",
    actor_id: context.user.id,
    action: "rejected",
    before_payload: reviewCard.prefill_payload ?? {},
    after_payload: { reason },
    notes: reason,
  });
  if (actionError) throw new Error(actionError.message);

  const { error: updateError } = await supabase
    .from("review_queue")
    .update({
      status: "rejected",
      resolved_by: context.user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .eq("organization_id", context.organizationId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/invoices/review");
}

export async function createInventoryItemFromInvoiceLineAction(
  reviewId: string,
  formData: FormData,
) {
  const { context, locationId } = await requireManager();
  const supabase = await createClient();
  const itemName = String(formData.get("item_name") ?? "").trim();
  const baseUnitId = String(formData.get("base_unit_id") ?? "");
  const vendorId = String(formData.get("vendor_id") ?? "");
  const vendorProductName = String(
    formData.get("vendor_product_name") ?? itemName,
  ).trim();

  if (!itemName || !baseUnitId || !vendorId || !vendorProductName) {
    throw new Error("Item name, base unit, vendor, and product name required.");
  }

  const { data: item, error: itemError } = await supabase
    .from("inventory_items")
    .insert({
      organization_id: context.organizationId,
      name: itemName,
      description: String(formData.get("description") ?? ""),
      category_id: String(formData.get("category_id") ?? "") || null,
      base_unit_id: baseUnitId,
      purchase_unit_id: String(formData.get("purchase_unit_id") ?? "") || null,
      count_unit_id: String(formData.get("count_unit_id") ?? "") || null,
      is_purchased: true,
    })
    .select("id")
    .single();
  if (itemError || !item) {
    throw new Error(itemError?.message ?? "Failed to create inventory item.");
  }

  const { data: vendorItem, error: vendorItemError } = await supabase
    .from("vendor_items")
    .insert({
      organization_id: context.organizationId,
      vendor_id: vendorId,
      inventory_item_id: item.id,
      vendor_product_code: String(formData.get("vendor_product_code") ?? ""),
      vendor_product_name: vendorProductName,
      pack_size: String(formData.get("pack_size") ?? ""),
      purchase_unit_id: String(formData.get("purchase_unit_id") ?? "") || null,
      normalized_description: vendorProductName.toLowerCase(),
      case_quantity: Number(formData.get("case_quantity") ?? 0) || null,
      base_quantity_per_purchase_unit:
        Number(formData.get("base_quantity_per_purchase_unit") ?? 0) || null,
    })
    .select("id")
    .single();
  if (vendorItemError || !vendorItem) {
    throw new Error(
      vendorItemError?.message ?? "Failed to create vendor item.",
    );
  }

  const { data: action, error: actionError } = await supabase
    .from("review_actions")
    .insert({
      organization_id: context.organizationId,
      location_id: locationId,
      review_queue_id: reviewId,
      actor_type: "human",
      actor_id: context.user.id,
      action: "created_inventory_item",
      after_payload: {
        inventory_item_id: item.id,
        vendor_item_id: vendorItem.id,
      },
    })
    .select("id")
    .single();
  if (actionError || !action) {
    throw new Error(actionError?.message ?? "Failed to record review action.");
  }

  await supabase.from("inventory_item_aliases").insert({
    organization_id: context.organizationId,
    inventory_item_id: item.id,
    vendor_id: vendorId,
    alias: vendorProductName,
    normalized_alias: vendorProductName.toLowerCase(),
    source: "invoice_review",
    confidence: 1,
    created_from_review_action_id: action.id,
  });

  const { error: updateError } = await supabase
    .from("review_queue")
    .update({
      status: "resolved",
      resolved_by: context.user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .eq("organization_id", context.organizationId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/invoices/review");
}
