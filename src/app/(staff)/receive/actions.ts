"use server";

import { revalidatePath } from "next/cache";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";

async function requireLocationMember() {
  const context = await getUserContext();
  if (!context?.organizationId || !context.role) {
    throw new Error("Organization access required.");
  }
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) throw new Error("No location is configured.");
  return { context, locationId };
}

export async function receivePurchaseOrderAction(
  orderId: string,
  formData: FormData,
) {
  const { context, locationId } = await requireLocationMember();
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("purchase_orders")
    .select("id, vendor_id, organization_id, location_id, status")
    .eq("id", orderId)
    .single();
  if (!order || order.location_id !== locationId) {
    throw new Error("Purchase order is not available at this location.");
  }

  const { data: orderLines } = await supabase
    .from("purchase_order_lines")
    .select(
      "id, vendor_item_id, inventory_item_id, quantity_ordered, quantity_received, unit_price",
    )
    .eq("purchase_order_id", orderId);
  const remainingLines = (orderLines ?? []).filter(
    (line) =>
      Number(line.quantity_ordered) - Number(line.quantity_received) > 0,
  );
  if (remainingLines.length === 0) throw new Error("Order is fully received.");
  const submittedLineIds = formData
    .getAll("purchase_order_line_id")
    .map(String);
  const submittedQuantities = formData.getAll("received_quantity").map(Number);

  const vendorItemIds = remainingLines.map((line) => line.vendor_item_id);
  const inventoryItemIds = remainingLines.map((line) => line.inventory_item_id);
  const [{ data: vendorItems }, { data: items }] = await Promise.all([
    supabase
      .from("vendor_items")
      .select("id, purchase_unit_id")
      .in("id", vendorItemIds),
    supabase
      .from("inventory_items")
      .select("id, default_storage_location_id")
      .in("id", inventoryItemIds),
  ]);
  const unitIds = (vendorItems ?? [])
    .map((item) => item.purchase_unit_id)
    .filter((id): id is string => Boolean(id));
  const { data: units } = unitIds.length
    ? await supabase
        .from("units")
        .select("id, conversion_factor_to_base")
        .in("id", unitIds)
    : { data: [] };

  const exceptionType = String(formData.get("exception_type") ?? "");
  const exceptionDescription = String(
    formData.get("exception_description") ?? "",
  );
  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .insert({
      organization_id: context.organizationId,
      location_id: locationId,
      purchase_order_id: orderId,
      vendor_id: order.vendor_id,
      received_by: context.user.id,
      document_file_path: String(formData.get("document_file_path") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      status: exceptionType ? "review_required" : "draft",
    })
    .select("id")
    .single();
  if (receiptError) throw new Error(receiptError.message);

  const receiptLines = remainingLines
    .map((line) => {
      const vendorItem = vendorItems?.find(
        (item) => item.id === line.vendor_item_id,
      );
      const unit = units?.find(
        (candidate) => candidate.id === vendorItem?.purchase_unit_id,
      );
      const submittedIndex = submittedLineIds.indexOf(line.id);
      const remaining =
        Number(line.quantity_ordered) - Number(line.quantity_received);
      const requestedQuantity =
        submittedIndex >= 0 ? submittedQuantities[submittedIndex] : remaining;
      const quantity = Math.min(
        remaining,
        Math.max(0, Number(requestedQuantity ?? remaining)),
      );
      return {
        receipt_id: receipt.id,
        purchase_order_line_id: line.id,
        vendor_item_id: line.vendor_item_id,
        inventory_item_id: line.inventory_item_id,
        storage_location_id: items?.find(
          (item) => item.id === line.inventory_item_id,
        )?.default_storage_location_id,
        quantity_received: quantity,
        quantity_received_base:
          quantity * Number(unit?.conversion_factor_to_base ?? 1),
        unit_price: Number(line.unit_price),
      };
    })
    .filter((line) => line.quantity_received > 0);
  if (receiptLines.length === 0) {
    throw new Error("Enter at least one received quantity.");
  }
  const { error: lineError } = await supabase
    .from("receipt_lines")
    .insert(receiptLines);
  if (lineError) throw new Error(lineError.message);

  if (exceptionType) {
    const { error } = await supabase.from("receipt_exceptions").insert({
      receipt_id: receipt.id,
      exception_type: exceptionType,
      description: exceptionDescription || "Delivery requires manager review.",
    });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.rpc("post_receipt", {
      target_receipt_id: receipt.id,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/receive");
  revalidatePath("/purchasing");
  revalidatePath("/inventory/on-hand");
  revalidatePath("/receiving/review");
}

export async function createNoPoReceiptAction(formData: FormData) {
  const { context, locationId } = await requireLocationMember();
  const supabase = await createClient();
  const vendorId = String(formData.get("vendor_id") ?? "");
  const inventoryItemId = String(formData.get("inventory_item_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const unitPrice = Number(formData.get("unit_price") ?? 0);
  if (!vendorId || !inventoryItemId || quantity <= 0 || unitPrice < 0) {
    throw new Error("Vendor, item, quantity, and unit price are required.");
  }

  const { data: item } = await supabase
    .from("inventory_items")
    .select("purchase_unit_id, default_storage_location_id")
    .eq("id", inventoryItemId)
    .single();
  if (!item?.default_storage_location_id) {
    throw new Error("The inventory item needs a default storage location.");
  }
  const { data: unit } = item.purchase_unit_id
    ? await supabase
        .from("units")
        .select("conversion_factor_to_base")
        .eq("id", item.purchase_unit_id)
        .single()
    : { data: null };

  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .insert({
      organization_id: context.organizationId,
      location_id: locationId,
      vendor_id: vendorId,
      status: "review_required",
      received_by: context.user.id,
      document_file_path: String(formData.get("document_file_path") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    })
    .select("id")
    .single();
  if (receiptError) throw new Error(receiptError.message);

  const { error: lineError } = await supabase.from("receipt_lines").insert({
    receipt_id: receipt.id,
    inventory_item_id: inventoryItemId,
    storage_location_id: item.default_storage_location_id,
    quantity_received: quantity,
    quantity_received_base:
      quantity * Number(unit?.conversion_factor_to_base ?? 1),
    unit_price: unitPrice,
    notes: "No-PO receiving line",
  });
  if (lineError) throw new Error(lineError.message);

  const { error: exceptionError } = await supabase
    .from("receipt_exceptions")
    .insert({
      receipt_id: receipt.id,
      exception_type: "unknown_item",
      description:
        String(formData.get("exception_description") ?? "") ||
        "No-PO delivery requires manager review.",
    });
  if (exceptionError) throw new Error(exceptionError.message);

  revalidatePath("/receive");
  revalidatePath("/receiving/review");
}

export async function resolveAndPostReceiptAction(receiptId: string) {
  const { context } = await requireLocationMember();
  if (context.role !== "manager") throw new Error("Manager access required.");
  const supabase = await createClient();
  const { error: exceptionError } = await supabase
    .from("receipt_exceptions")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: context.user.id,
    })
    .eq("receipt_id", receiptId)
    .is("resolved_at", null);
  if (exceptionError) throw new Error(exceptionError.message);

  const { error } = await supabase.rpc("post_receipt", {
    target_receipt_id: receiptId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/receiving/review");
  revalidatePath("/purchasing");
  revalidatePath("/inventory/on-hand");
}
