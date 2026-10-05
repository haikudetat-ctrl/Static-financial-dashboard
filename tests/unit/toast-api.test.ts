import { describe, expect, it } from "vitest";

import {
  buildMenuIndex,
  describeToastError,
  summarizeOrders,
  toToastDate,
  type ToastOrder,
} from "@/lib/toast/api";
import { datesToSync } from "@/lib/toast/sync";

const martini = { guid: "item-martini" };
const fries = { guid: "item-fries" };

const orders: ToastOrder[] = [
  {
    guid: "o1",
    checks: [
      {
        selections: [
          { item: martini, displayName: "Martini", quantity: 2, price: 28 },
          {
            item: fries,
            displayName: "Fries",
            quantity: 1,
            price: 8,
            refundDetails: { refundAmount: 3 },
          },
          {
            displayName: "Gift Card",
            selectionType: "TOAST_CARD_SELL",
            quantity: 1,
            price: 50,
          },
        ],
      },
    ],
  },
  {
    guid: "o2",
    checks: [
      {
        selections: [
          {
            item: martini,
            displayName: "Martini",
            quantity: 1,
            price: 14,
            voided: true,
          },
          {
            item: martini,
            displayName: "Martini",
            quantity: 1,
            price: 0,
            preDiscountPrice: 14,
          },
          { displayName: "Open Food", quantity: 1, price: 5 },
        ],
      },
      { deleted: true, selections: [{ item: fries, quantity: 9, price: 72 }] },
    ],
  },
  {
    guid: "o3",
    voided: true,
    checks: [
      {
        selections: [
          { item: fries, displayName: "Fries", quantity: 1, price: 8 },
        ],
      },
    ],
  },
  {
    guid: "o4",
    deleted: true,
    checks: [{ selections: [{ item: fries, quantity: 4, price: 32 }] }],
  },
];

describe("summarizeOrders", () => {
  const menu = buildMenuIndex([
    {
      menuGroups: [
        {
          guid: "group-cocktails",
          name: "Cocktails",
          menuItems: [{ guid: "item-martini", name: "Dry Martini" }],
          menuGroups: [
            {
              name: "Snacks",
              menuItems: [{ guid: "item-fries", name: "Fries" }],
            },
          ],
        },
      ],
    },
  ]);
  const summary = summarizeOrders(orders, "2026-10-03", { menu });
  const row = (key: string) => summary.rows.find((r) => r.item_guid === key)!;

  it("counts sold, voided and comped quantities per item", () => {
    expect(row("item-martini")).toMatchObject({
      item_name: "Dry Martini",
      menu_group: "Cocktails",
      quantity_sold: 4,
      void_quantity: 1,
      comp_quantity: 1,
      net_sales: 28,
      business_date: "2026-10-03",
      type: "",
    });
  });

  it("nets refunds and treats voided orders as voids", () => {
    expect(row("item-fries")).toMatchObject({
      menu_group: "Snacks",
      quantity_sold: 2,
      void_quantity: 1,
      net_sales: 5,
    });
  });

  it("keys open items by name and skips gift cards and deleted checks", () => {
    expect(row("name:open food").net_sales).toBe(5);
    expect(summary.rows.some((r) => r.item_name === "Gift Card")).toBe(false);
    expect(summary.netSales).toBe(38);
    expect(summary.orderCount).toBe(3);
    expect(summary.itemNames.get("item-martini")).toBe("Dry Martini");
  });
});

describe("toast dates", () => {
  it("formats business dates for the API", () => {
    expect(toToastDate("2026-10-03")).toBe("20261003");
  });

  it("pulls yesterday on the first run", () => {
    expect(datesToSync(null, "2026-10-04")).toEqual(["2026-10-03"]);
  });

  it("catches up missed days, at most a week back", () => {
    expect(datesToSync("2026-10-01", "2026-10-04")).toEqual([
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(datesToSync("2026-09-01", "2026-10-04")).toHaveLength(7);
    expect(datesToSync("2026-10-03", "2026-10-04")).toEqual([]);
  });
});

describe("describeToastError", () => {
  it("keeps Toast's message and request ID", () => {
    expect(
      describeToastError(
        '{"error":"access_denied","error_description":"Unauthorized","status":401,"requestId":"abc-123"}',
      ),
    ).toBe("Unauthorized (request abc-123)");
  });
});
