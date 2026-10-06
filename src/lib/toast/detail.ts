import type {
  ToastAppliedDiscount,
  ToastMenuIndex,
  ToastModifier,
  ToastOrder,
} from "@/lib/toast/api";

/**
 * Turns a day's Toast orders into check and item rows for storage. Deleted
 * orders and checks are left out; voided ones are kept and marked, so the
 * comp and void audit can see them. Gift-card and house-account lines are
 * kept too (with their selection type), since they explain payments.
 */

export type CheckRow = {
  business_date: string;
  order_guid: string;
  check_guid: string;
  display_number: string;
  opened_at: string | null;
  closed_at: string | null;
  paid_at: string | null;
  server_guid: string | null;
  dining_option_guid: string | null;
  revenue_center_guid: string | null;
  guest_count: number | null;
  voided: boolean;
  net_amount: number;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  discount_amount: number;
  discounts: DiscountRow[];
  payments: PaymentRow[];
};

export type ModifierRow = {
  guid: string | null;
  item_guid: string | null;
  name: string;
  quantity: number;
  price: number;
  group_guid: string | null;
  depth: number;
};

export type DiscountRow = {
  guid: string | null;
  discount_guid: string | null;
  name: string;
  amount: number;
  approver_guid: string | null;
};

export type PaymentRow = {
  guid: string | null;
  type: string;
  card_type: string | null;
  amount: number;
  tip: number;
  status: string | null;
};

export type ItemRow = {
  business_date: string;
  check_guid: string;
  selection_guid: string;
  item_guid: string | null;
  item_name: string;
  item_group_guid: string | null;
  sales_category_guid: string | null;
  selection_type: string | null;
  quantity: number;
  price: number;
  pre_discount_price: number;
  refund_amount: number;
  voided: boolean;
  void_reason_guid: string | null;
  ordered_at: string | null;
  discounts: DiscountRow[];
  modifiers: ModifierRow[];
};

export type OrderDetail = {
  checks: CheckRow[];
  items: ItemRow[];
  netSales: number;
};

const money = (value: number | null | undefined) =>
  Math.round(Number(value ?? 0) * 100) / 100;

const guid = (ref: { guid?: string | null } | null | undefined) =>
  ref?.guid ?? null;

function discounts(list: ToastAppliedDiscount[] | null | undefined) {
  return (list ?? []).map(
    (discount): DiscountRow => ({
      guid: discount.guid ?? null,
      discount_guid: guid(discount.discount),
      name: discount.name ?? "",
      amount: money(discount.discountAmount),
      approver_guid: guid(discount.approver),
    }),
  );
}

/** Nested modifiers flattened, depth first, with their nesting level. */
export function flattenModifiers(
  modifiers: ToastModifier[] | null | undefined,
  menu: ToastMenuIndex = new Map(),
  depth = 0,
): ModifierRow[] {
  return (modifiers ?? []).flatMap((modifier) => {
    const itemGuid = guid(modifier.item);
    return [
      {
        guid: modifier.guid ?? null,
        item_guid: itemGuid,
        name:
          (itemGuid && menu.get(itemGuid)?.name) ||
          modifier.displayName?.trim() ||
          "",
        quantity: Number(modifier.quantity ?? 1),
        price: money(modifier.price),
        group_guid: guid(modifier.optionGroup),
        depth,
      },
      ...(depth < 4
        ? flattenModifiers(modifier.modifiers, menu, depth + 1)
        : []),
    ];
  });
}

export function extractOrderDetail(
  orders: ToastOrder[],
  businessDate: string,
  menu: ToastMenuIndex = new Map(),
): OrderDetail {
  const checks: CheckRow[] = [];
  const items: ItemRow[] = [];
  let netSales = 0;

  for (const order of orders) {
    if (order.deleted || !order.guid) continue;
    for (const check of order.checks ?? []) {
      if (check.deleted || !check.guid) continue;
      const voided = Boolean(order.voided || check.voided);
      const checkDiscounts = discounts(check.appliedDiscounts);
      const payments = (check.payments ?? []).map(
        (payment): PaymentRow => ({
          guid: payment.guid ?? null,
          type: payment.type ?? "OTHER",
          card_type: payment.cardType ?? null,
          amount: money(payment.amount),
          tip: money(payment.tipAmount),
          status: payment.paymentStatus ?? payment.refundStatus ?? null,
        }),
      );

      let itemDiscounts = 0;
      for (const selection of check.selections ?? []) {
        if (!selection.guid) continue;
        const itemGuid = guid(selection.item);
        const selectionDiscounts = discounts(selection.appliedDiscounts);
        itemDiscounts += selectionDiscounts.reduce(
          (sum, d) => sum + d.amount,
          0,
        );
        items.push({
          business_date: businessDate,
          check_guid: check.guid,
          selection_guid: selection.guid,
          item_guid: itemGuid,
          item_name:
            (itemGuid && menu.get(itemGuid)?.name) ||
            selection.displayName?.trim() ||
            "",
          item_group_guid: guid(selection.itemGroup),
          sales_category_guid: guid(selection.salesCategory),
          selection_type: selection.selectionType ?? null,
          quantity: Number(selection.quantity ?? 1),
          price: money(selection.price),
          pre_discount_price: money(selection.preDiscountPrice),
          refund_amount: money(selection.refundDetails?.refundAmount),
          voided: voided || Boolean(selection.voided),
          void_reason_guid: guid(selection.voidReason),
          ordered_at: selection.createdDate ?? null,
          discounts: selectionDiscounts,
          modifiers: flattenModifiers(selection.modifiers, menu),
        });
      }

      const net = money(check.amount);
      if (!voided) netSales += net;
      checks.push({
        business_date: businessDate,
        order_guid: order.guid,
        check_guid: check.guid,
        display_number: check.displayNumber ?? "",
        opened_at: check.openedDate ?? order.openedDate ?? null,
        closed_at: check.closedDate ?? order.closedDate ?? null,
        paid_at: check.paidDate ?? order.paidDate ?? null,
        server_guid: guid(order.server),
        dining_option_guid: guid(order.diningOption),
        revenue_center_guid: guid(order.revenueCenter),
        guest_count: order.numberOfGuests ?? null,
        voided,
        net_amount: net,
        tax_amount: money(check.taxAmount),
        tip_amount: money(payments.reduce((sum, p) => sum + p.tip, 0)),
        total_amount: money(check.totalAmount),
        discount_amount: money(
          checkDiscounts.reduce((sum, d) => sum + d.amount, 0) + itemDiscounts,
        ),
        discounts: checkDiscounts,
        payments,
      });
    }
  }
  return { checks, items, netSales: money(netSales) };
}
