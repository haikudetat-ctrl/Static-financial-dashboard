"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
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

export async function updateOrderGuideParAction(formData: FormData) {
  await requireManager();
  const supabase = await createClient();
  const orderGuideItemId = String(formData.get("order_guide_item_id") ?? "");
  const defaultPar = Number(formData.get("default_par") ?? 0);
  if (!orderGuideItemId || defaultPar < 0) throw new Error("Invalid par.");

  const { error } = await supabase
    .from("order_guide_items")
    .update({ default_par: defaultPar })
    .eq("id", orderGuideItemId);
  if (error) throw new Error(error.message);
  revalidatePath("/purchasing/order-guide");
  revalidatePath("/purchasing/suggested-order");
}

export async function createPurchaseOrderAction(formData: FormData) {
  const { context, locationId } = await requireManager();
  const supabase = await createClient();
  const vendorId = String(formData.get("vendor_id") ?? "");
  const vendorItemIds = formData.getAll("vendor_item_id").map(String);
  const inventoryItemIds = formData.getAll("inventory_item_id").map(String);
  const unitPrices = formData.getAll("unit_price").map(Number);
  const packSizes = formData.getAll("pack_size").map(String);
  const quantities = formData.getAll("quantity").map(Number);

  const lines = vendorItemIds.flatMap((vendorItemId, index) => {
    const quantity = quantities[index] ?? 0;
    const inventoryItemId = inventoryItemIds[index];
    if (!inventoryItemId || quantity <= 0) return [];
    return [
      {
        vendor_item_id: vendorItemId,
        inventory_item_id: inventoryItemId,
        quantity_ordered: quantity,
        unit_price: unitPrices[index] ?? 0,
        pack_size: packSizes[index] ?? "",
      },
    ];
  });

  if (!vendorId || lines.length === 0) {
    throw new Error("Choose at least one item with a positive quantity.");
  }

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .insert({
      organization_id: context.organizationId,
      location_id: locationId,
      vendor_id: vendorId,
      expected_delivery_date:
        String(formData.get("expected_delivery_date") ?? "") || null,
      manager_notes: String(formData.get("manager_notes") ?? ""),
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (orderError) throw new Error(orderError.message);

  const { error: lineError } = await supabase
    .from("purchase_order_lines")
    .insert(
      lines.map((line) => ({
        ...line,
        purchase_order_id: order.id,
      })),
    );
  if (lineError) throw new Error(lineError.message);

  revalidatePath("/purchasing");
  redirect(`/purchasing/orders/${order.id}`);
}

export async function approvePurchaseOrderAction(orderId: string) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_purchase_order", {
    target_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/purchasing");
  revalidatePath(`/purchasing/orders/${orderId}`);
}

export async function markPurchaseOrderSentAction(orderId: string) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "sent" })
    .eq("id", orderId)
    .eq("status", "approved");
  if (error) throw new Error(error.message);
  revalidatePath("/purchasing");
  revalidatePath(`/purchasing/orders/${orderId}`);
  revalidatePath(`/purchasing/orders/${orderId}/send`);
}

export async function cancelPurchaseOrderAction(orderId: string) {
  await requireManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .in("status", ["draft", "approved"]);
  if (error) throw new Error(error.message);
  revalidatePath("/purchasing");
  redirect("/purchasing");
}
