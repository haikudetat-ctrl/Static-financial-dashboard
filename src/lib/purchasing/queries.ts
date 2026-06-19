import { calculateSuggestedOrder } from "@/lib/purchasing/calculations";
import { createClient } from "@/lib/supabase/server";

export type SuggestedOrderRow = {
  orderGuideItemId: string;
  vendorId: string;
  vendorName: string;
  vendorItemId: string;
  inventoryItemId: string;
  itemName: string;
  productCode: string;
  packSize: string;
  purchaseUnit: string;
  targetPar: number;
  onHand: number;
  openPoQuantity: number;
  packQuantity: number;
  unitPrice: number;
  suggestedQuantity: number;
  explanation: string;
};

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function getPurchasingSummary(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const [{ data: orders }, { count: reviewCount }, { count: invoiceCount }] =
    await Promise.all([
      supabase
        .from("purchase_orders")
        .select("status, purchase_order_lines(quantity_ordered, unit_price)")
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
        .in("status", ["approved", "sent", "partially_received"]),
      supabase
        .from("receipts")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
        .eq("status", "review_required"),
      supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("location_id", locationId)
        .in("status", ["uploaded", "extracted", "reviewed"]),
    ]);

  const openCommitment = (orders ?? []).reduce((orderTotal, order) => {
    const lines = (order.purchase_order_lines ?? []) as Array<{
      quantity_ordered: number | string;
      unit_price: number | string;
    }>;
    return (
      orderTotal +
      lines.reduce(
        (lineTotal, line) =>
          lineTotal + Number(line.quantity_ordered) * Number(line.unit_price),
        0,
      )
    );
  }, 0);

  return {
    openPoCount: orders?.length ?? 0,
    openCommitment,
    receiptReviewCount: reviewCount ?? 0,
    invoiceReviewCount: invoiceCount ?? 0,
  };
}

export async function getSuggestedOrder(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const { data: guideItems } = await supabase
    .from("order_guide_items")
    .select(
      "id, vendor_item_id, inventory_item_id, default_par, preferred_pack, order_guides!inner(location_id, vendor_id)",
    )
    .eq("organization_id", organizationId)
    .eq("order_guides.location_id", locationId)
    .order("created_at");

  if (!guideItems?.length) return [];

  const vendorItemIds = guideItems.map((row) => row.vendor_item_id);
  const inventoryItemIds = guideItems
    .map((row) => row.inventory_item_id)
    .filter((id): id is string => Boolean(id));

  const [
    { data: vendorItems },
    { data: items },
    { data: prices },
    { data: packs },
    { data: onHand },
    { data: openOrders },
  ] = await Promise.all([
    supabase
      .from("vendor_items")
      .select(
        "id, vendor_id, inventory_item_id, vendor_product_code, vendor_product_name, pack_size, purchase_unit_id",
      )
      .in("id", vendorItemIds),
    supabase
      .from("inventory_items")
      .select("id, name, base_unit_id")
      .in("id", inventoryItemIds),
    supabase
      .from("vendor_item_prices")
      .select("vendor_item_id, unit_price, effective_date")
      .in("vendor_item_id", vendorItemIds)
      .order("effective_date", { ascending: false }),
    supabase
      .from("pack_definitions")
      .select("vendor_item_id, quantity_per_pack")
      .in("vendor_item_id", vendorItemIds),
    supabase
      .from("inventory_on_hand")
      .select("inventory_item_id, quantity")
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .in("inventory_item_id", inventoryItemIds),
    supabase
      .from("purchase_orders")
      .select(
        "id, status, purchase_order_lines(vendor_item_id, quantity_ordered, quantity_received)",
      )
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .in("status", ["approved", "sent", "partially_received"]),
  ]);

  const vendorIds = [
    ...new Set((vendorItems ?? []).map((row) => row.vendor_id)),
  ];
  const unitIds = [
    ...new Set(
      (vendorItems ?? [])
        .map((row) => row.purchase_unit_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [{ data: vendors }, { data: units }] = await Promise.all([
    vendorIds.length
      ? supabase.from("vendors").select("id, name").in("id", vendorIds)
      : Promise.resolve({ data: [] }),
    unitIds.length
      ? supabase
          .from("units")
          .select("id, abbreviation, conversion_factor_to_base")
          .in("id", unitIds)
      : Promise.resolve({ data: [] }),
  ]);

  return guideItems.flatMap((guideItem): SuggestedOrderRow[] => {
    const vendorItem = vendorItems?.find(
      (row) => row.id === guideItem.vendor_item_id,
    );
    const inventoryItem = items?.find(
      (row) => row.id === guideItem.inventory_item_id,
    );
    if (!vendorItem || !inventoryItem) return [];

    const vendor = vendors?.find((row) => row.id === vendorItem.vendor_id);
    const purchaseUnit = units?.find(
      (row) => row.id === vendorItem.purchase_unit_id,
    );
    const conversionFactor = Number(
      purchaseUnit?.conversion_factor_to_base ?? 1,
    );
    const baseOnHand = (onHand ?? [])
      .filter((row) => row.inventory_item_id === inventoryItem.id)
      .reduce((sum, row) => sum + Number(row.quantity), 0);
    const openPoQuantity = (openOrders ?? []).reduce((sum, order) => {
      const lines = (order.purchase_order_lines ?? []) as Array<{
        vendor_item_id: string;
        quantity_ordered: number | string;
        quantity_received: number | string;
      }>;
      return (
        sum +
        lines
          .filter((line) => line.vendor_item_id === vendorItem.id)
          .reduce(
            (lineSum, line) =>
              lineSum +
              Number(line.quantity_ordered) -
              Number(line.quantity_received),
            0,
          )
      );
    }, 0);
    const targetPar = Number(guideItem.default_par ?? 0);
    const packQuantity = Number(
      packs?.find((row) => row.vendor_item_id === vendorItem.id)
        ?.quantity_per_pack ?? 1,
    );
    const result = calculateSuggestedOrder({
      targetPar,
      onHand: baseOnHand / conversionFactor,
      openPoQuantity,
      packQuantity,
    });
    const price = prices?.find((row) => row.vendor_item_id === vendorItem.id);

    return [
      {
        orderGuideItemId: guideItem.id,
        vendorId: vendorItem.vendor_id,
        vendorName: vendor?.name ?? "Vendor",
        vendorItemId: vendorItem.id,
        inventoryItemId: inventoryItem.id,
        itemName: inventoryItem.name,
        productCode: vendorItem.vendor_product_code,
        packSize: vendorItem.pack_size,
        purchaseUnit: purchaseUnit?.abbreviation ?? "unit",
        targetPar,
        onHand: baseOnHand / conversionFactor,
        openPoQuantity,
        packQuantity,
        unitPrice: Number(price?.unit_price ?? 0),
        suggestedQuantity: result.suggestedQuantity,
        explanation: result.explanation,
      },
    ];
  });
}

export async function getPurchaseOrders(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select(
      "id, vendor_id, status, order_date, expected_delivery_date, manager_notes, vendors(name), purchase_order_lines(id, quantity_ordered, quantity_received, unit_price)",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getVendorOrderRules(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendor_order_rules")
    .select(
      "vendor_id, cutoff_day, cutoff_time, lead_time_days, minimum_order_amount, default_ordering_method, notes",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId);
  return data ?? [];
}

export async function getPurchaseOrderDetail(orderId: string) {
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("purchase_orders")
    .select(
      "id, organization_id, location_id, vendor_id, status, order_date, expected_delivery_date, manager_notes, vendors(name)",
    )
    .eq("id", orderId)
    .single();
  if (!order) return null;

  const { data: lines } = await supabase
    .from("purchase_order_lines")
    .select(
      "id, vendor_item_id, inventory_item_id, quantity_ordered, quantity_received, unit_price, pack_size, vendor_items(vendor_product_code, vendor_product_name), inventory_items(name)",
    )
    .eq("purchase_order_id", orderId)
    .order("created_at");

  return { ...order, lines: lines ?? [] };
}

export async function getOpenPurchaseOrders(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select(
      "id, vendor_id, status, order_date, expected_delivery_date, vendors(name), purchase_order_lines(id, vendor_item_id, inventory_item_id, quantity_ordered, quantity_received, unit_price, pack_size, vendor_items(vendor_product_name, purchase_unit_id), inventory_items(name, default_storage_location_id))",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .in("status", ["approved", "sent", "partially_received"])
    .order("expected_delivery_date");
  return data ?? [];
}

export async function getReceiptReviewQueue(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("receipts")
    .select(
      "id, vendor_id, purchase_order_id, status, received_at, notes, vendors(name), receipt_exceptions(id, exception_type, description, resolved_at)",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .eq("status", "review_required")
    .order("received_at");
  return data ?? [];
}

export async function getInvoices(organizationId: string, locationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select(
      "id, vendor_id, invoice_number, invoice_date, status, total_amount, vendors(name)",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .order("invoice_date", { ascending: false });
  return data ?? [];
}

export async function getInvoiceDetail(invoiceId: string) {
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, organization_id, location_id, vendor_id, invoice_number, order_id, invoice_date, status, total_amount, discount_amount, tax_amount, freight_amount, deposit_amount, credits_amount, document_file_path, vendors(name)",
    )
    .eq("id", invoiceId)
    .single();
  if (!invoice) return null;

  const { data: lines } = await supabase
    .from("invoice_lines")
    .select(
      "id, line_index, vendor_product_code, product_description, pack_size, quantity_invoiced, unit_price, line_total, inventory_item_id, receipt_line_id, anomaly_codes, inventory_items(name)",
    )
    .eq("invoice_id", invoiceId)
    .order("line_index");

  return { ...invoice, lines: lines ?? [] };
}

export function relatedName(
  value: { name: string } | { name: string }[] | null | undefined,
) {
  return firstRelated(value)?.name ?? "";
}
