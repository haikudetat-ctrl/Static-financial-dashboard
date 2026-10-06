import { describe, expect, it } from "vitest";

import type { ToastOrder } from "@/lib/toast/api";
import { extractOrderDetail, flattenModifiers } from "@/lib/toast/detail";

const menu = new Map([
  ["item-marg", { name: "Margarita", group: "Cocktails" }],
  ["mod-mezcal", { name: "Sub Mezcal", group: "Spirit swaps" }],
]);

const orders: ToastOrder[] = [
  {
    guid: "order-1",
    openedDate: "2026-10-18T23:02:00.000+0000",
    server: { guid: "emp-1" },
    diningOption: { guid: "dine-in" },
    numberOfGuests: 2,
    checks: [
      {
        guid: "check-1",
        displayNumber: "41",
        openedDate: "2026-10-18T23:02:00.000+0000",
        closedDate: "2026-10-19T01:15:00.000+0000",
        amount: 26,
        taxAmount: 2.08,
        totalAmount: 33.08,
        appliedDiscounts: [
          {
            guid: "d1",
            name: "Industry",
            discountAmount: 2,
            discount: { guid: "disc-ind" },
          },
        ],
        payments: [
          {
            guid: "p1",
            type: "CREDIT",
            cardType: "VISA",
            amount: 28.08,
            tipAmount: 5,
          },
        ],
        selections: [
          {
            guid: "sel-1",
            item: { guid: "item-marg" },
            displayName: "Marg",
            quantity: 2,
            price: 28,
            preDiscountPrice: 28,
            createdDate: "2026-10-18T23:05:00.000+0000",
            modifiers: [
              {
                guid: "m1",
                item: { guid: "mod-mezcal" },
                displayName: "Mezcal",
                quantity: 1,
                price: 2,
                optionGroup: { guid: "grp-spirit" },
                modifiers: [
                  { guid: "m2", displayName: "Double", quantity: 1, price: 6 },
                ],
              },
            ],
          },
          {
            guid: "sel-2",
            displayName: "Shot of Jameson",
            quantity: 1,
            price: 0,
            preDiscountPrice: 8,
            appliedDiscounts: [
              {
                guid: "d2",
                name: "Comp",
                discountAmount: 8,
                approver: { guid: "mgr-1" },
              },
            ],
          },
          {
            guid: "sel-3",
            displayName: "Coors Light",
            quantity: 1,
            price: 0,
            voided: true,
            voidReason: { guid: "void-wrong" },
          },
        ],
      },
      { guid: "check-deleted", deleted: true, amount: 99, selections: [] },
    ],
  },
  {
    guid: "order-voided",
    voided: true,
    checks: [
      {
        guid: "check-2",
        amount: 12,
        selections: [
          { guid: "sel-4", displayName: "IPA", quantity: 1, price: 12 },
        ],
      },
    ],
  },
  {
    guid: "order-deleted",
    deleted: true,
    checks: [{ guid: "check-3", amount: 50 }],
  },
];

describe("extractOrderDetail", () => {
  const detail = extractOrderDetail(orders, "2026-10-18", menu);

  it("keeps live and voided checks, drops deleted ones", () => {
    expect(detail.checks.map((c) => [c.check_guid, c.voided])).toEqual([
      ["check-1", false],
      ["check-2", true],
    ]);
    expect(detail.netSales).toBe(26);
  });

  it("records the check's money, server and timing", () => {
    expect(detail.checks[0]).toMatchObject({
      order_guid: "order-1",
      display_number: "41",
      server_guid: "emp-1",
      dining_option_guid: "dine-in",
      guest_count: 2,
      net_amount: 26,
      tip_amount: 5,
      discount_amount: 10,
      closed_at: "2026-10-19T01:15:00.000+0000",
    });
    expect(detail.checks[0].payments).toEqual([
      {
        guid: "p1",
        type: "CREDIT",
        card_type: "VISA",
        amount: 28.08,
        tip: 5,
        status: null,
      },
    ]);
  });

  it("names items from the menu and keeps modifiers, comps and voids", () => {
    const [marg, comp, voided] = detail.items;
    expect(marg).toMatchObject({
      item_name: "Margarita",
      quantity: 2,
      ordered_at: "2026-10-18T23:05:00.000+0000",
    });
    expect(marg.modifiers.map((m) => [m.name, m.depth])).toEqual([
      ["Sub Mezcal", 0],
      ["Double", 1],
    ]);
    expect(comp.discounts).toEqual([
      {
        guid: "d2",
        discount_guid: null,
        name: "Comp",
        amount: 8,
        approver_guid: "mgr-1",
      },
    ]);
    expect(comp.pre_discount_price).toBe(8);
    expect(voided).toMatchObject({
      voided: true,
      void_reason_guid: "void-wrong",
    });
    // Items on a voided order are voided too.
    expect(detail.items.find((i) => i.selection_guid === "sel-4")?.voided).toBe(
      true,
    );
  });
});

describe("flattenModifiers", () => {
  it("stops at a sane depth", () => {
    type Mod = { guid: string; modifiers?: Mod[] };
    let deep: Mod = { guid: "m9" };
    for (let i = 8; i >= 0; i--) deep = { guid: `m${i}`, modifiers: [deep] };
    expect(flattenModifiers([deep]).length).toBe(5);
  });
});
