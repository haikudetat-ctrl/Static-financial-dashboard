import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatVendorOrder } from "@/lib/purchasing/calculations";
import { getPurchaseOrderDetail, relatedName } from "@/lib/purchasing/queries";
import { OrderClientActions } from "@/components/purchasing/order-client-actions";

export const metadata: Metadata = { title: "Vendor order output" };

function vendorProductName(
  value:
    | { vendor_product_name: string }
    | { vendor_product_name: string }[]
    | null,
) {
  return (Array.isArray(value) ? value[0] : value)?.vendor_product_name ?? "";
}

export default async function SendPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getPurchaseOrderDetail(id);
  if (!order) notFound();
  const vendorName = relatedName(order.vendors);
  const output = formatVendorOrder({
    vendorName,
    orderDate: order.order_date,
    lines: order.lines.map((line) => ({
      productName:
        vendorProductName(line.vendor_items) ||
        relatedName(line.inventory_items),
      quantity: Number(line.quantity_ordered),
      unit: line.pack_size || "unit",
    })),
  });

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Vendor-ready output
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Send {vendorName} a clean order.
        </h1>
        <OrderClientActions
          output={output}
          orderId={order.id}
          status={order.status}
        />
        <pre className="mt-7 overflow-x-auto border bg-white p-6 font-mono text-sm leading-7 whitespace-pre-wrap">
          {output}
        </pre>
      </div>
    </div>
  );
}
