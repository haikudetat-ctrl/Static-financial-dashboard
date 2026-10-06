import { toastItemKey } from "@/lib/toast";

/**
 * Read-only client for the Toast REST API (Standard API access). Only the
 * endpoints the nightly sales sync needs: orders, menus and sales
 * categories.
 */

export const TOAST_HOSTS = {
  production: "https://ws-api.toasttab.com",
  sandbox: "https://ws-sandbox-api.eng.toasttab.com",
} as const;

export type ToastCredentials = {
  apiHost: string;
  clientId: string;
  clientSecret: string;
  restaurantGuid: string;
};

type Reference = { guid?: string | null } | null | undefined;

export type ToastAppliedDiscount = {
  guid?: string;
  name?: string | null;
  discountAmount?: number | null;
  discount?: Reference;
  approver?: Reference;
};

export type ToastModifier = {
  guid?: string;
  displayName?: string | null;
  item?: Reference;
  optionGroup?: Reference;
  quantity?: number | null;
  price?: number | null;
  modifiers?: ToastModifier[] | null;
};

export type ToastSelection = {
  guid?: string;
  displayName?: string | null;
  item?: Reference;
  itemGroup?: Reference;
  salesCategory?: Reference;
  selectionType?: string | null;
  quantity?: number | null;
  price?: number | null;
  preDiscountPrice?: number | null;
  voided?: boolean | null;
  voidReason?: Reference;
  deferred?: boolean | null;
  createdDate?: string | null;
  refundDetails?: { refundAmount?: number | null } | null;
  appliedDiscounts?: ToastAppliedDiscount[] | null;
  modifiers?: ToastModifier[] | null;
};

export type ToastPayment = {
  guid?: string;
  type?: string | null;
  cardType?: string | null;
  amount?: number | null;
  tipAmount?: number | null;
  refundStatus?: string | null;
  paymentStatus?: string | null;
};

export type ToastCheck = {
  guid?: string;
  displayNumber?: string | null;
  openedDate?: string | null;
  closedDate?: string | null;
  paidDate?: string | null;
  voided?: boolean | null;
  deleted?: boolean | null;
  amount?: number | null;
  taxAmount?: number | null;
  totalAmount?: number | null;
  appliedDiscounts?: ToastAppliedDiscount[] | null;
  payments?: ToastPayment[] | null;
  selections?: ToastSelection[] | null;
};

export type ToastOrder = {
  guid?: string;
  businessDate?: number | null;
  openedDate?: string | null;
  closedDate?: string | null;
  paidDate?: string | null;
  voided?: boolean | null;
  deleted?: boolean | null;
  server?: Reference;
  diningOption?: Reference;
  revenueCenter?: Reference;
  numberOfGuests?: number | null;
  checks?: ToastCheck[] | null;
};

export type ToastMenuIndex = Map<string, { name: string; group: string }>;

export type PmixApiRow = {
  item_guid: string;
  item_name: string;
  business_date: string;
  quantity_sold: number;
  net_sales: number;
  void_quantity: number;
  comp_quantity: number;
  category: string;
  menu_group: string;
  type: string;
};

export type OrdersSummary = {
  rows: PmixApiRow[];
  orderCount: number;
  netSales: number;
  /** Toast item GUID → item name, for upgrading name-keyed mappings. */
  itemNames: Map<string, string>;
};

/** Gift cards and house-account payments are not product sales. */
const NON_SALE_SELECTIONS = new Set([
  "TOAST_CARD_SELL",
  "TOAST_CARD_RELOAD",
  "HOUSE_ACCOUNT_PAY_BALANCE",
]);

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Toast business dates are yyyymmdd. */
export function toToastDate(date: string) {
  return date.replaceAll("-", "");
}

export class ToastApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Pulls Toast's own message and request ID out of an error body. */
export function describeToastError(body: string) {
  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      error_description?: string;
      requestId?: string;
    };
    const message = parsed.error_description ?? parsed.message ?? "";
    return [message, parsed.requestId ? `(request ${parsed.requestId})` : ""]
      .filter(Boolean)
      .join(" ");
  } catch {
    return body.slice(0, 200).trim();
  }
}

async function toastFetch<T>(
  url: string,
  init: RequestInit,
  step: "login" | "data",
): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) {
    const detail = describeToastError(await response.text().catch(() => ""));
    const hint =
      step === "login"
        ? response.status === 401 || response.status === 403
          ? "Toast login failed: the client ID and secret weren't accepted. Re-enter the secret, and tick Sandbox if it's a sandbox credential."
          : `Toast login failed (${response.status}).`
        : response.status === 401 || response.status === 403
          ? "Logged in, but Toast refused this restaurant. Check the restaurant GUID is one of the credential's locations and that it can read orders."
          : `Toast returned ${response.status}.`;
    throw new ToastApiError(
      detail ? `${hint} ${detail}` : hint,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export async function toastLogin(credentials: ToastCredentials) {
  const result = await toastFetch<{
    token?: { accessToken?: string };
  }>(
    `${credentials.apiHost}/authentication/v1/authentication/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        userAccessType: "TOAST_MACHINE_CLIENT",
      }),
    },
    "login",
  );
  const token = result.token?.accessToken;
  if (!token) throw new ToastApiError("Toast login returned no token.", 500);
  return token;
}

export function createToastClient(
  credentials: ToastCredentials,
  token: string,
) {
  const get = <T>(path: string) =>
    toastFetch<T>(
      `${credentials.apiHost}${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Toast-Restaurant-External-ID": credentials.restaurantGuid,
        },
      },
      "data",
    );

  return {
    /** Every order for a business date (yyyy-mm-dd). */
    async ordersForDate(date: string, { pageSize = 100, maxPages = 100 } = {}) {
      const orders: ToastOrder[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const batch = await get<ToastOrder[]>(
          `/orders/v2/ordersBulk?businessDate=${toToastDate(date)}&pageSize=${pageSize}&page=${page}`,
        );
        orders.push(...batch);
        if (batch.length < pageSize) return orders;
      }
      throw new ToastApiError(
        `More than ${pageSize * maxPages} orders on ${date}.`,
        500,
      );
    },

    async menuIndex(): Promise<ToastMenuIndex> {
      const result = await get<{ menus?: ToastMenu[] }>("/menus/v2/menus");
      return buildMenuIndex(result.menus ?? []);
    },

    async salesCategories(): Promise<Map<string, string>> {
      const result = await get<Array<{ guid: string; name: string }>>(
        "/config/v2/salesCategories",
      );
      return new Map(result.map((category) => [category.guid, category.name]));
    },
  };
}

type ToastMenuGroup = {
  guid?: string;
  name?: string;
  menuItems?: Array<{ guid?: string; name?: string }>;
  menuGroups?: ToastMenuGroup[];
};
type ToastMenu = { name?: string; menuGroups?: ToastMenuGroup[] };

/** Item and group GUIDs → names, walking nested menu groups. */
export function buildMenuIndex(menus: ToastMenu[]): ToastMenuIndex {
  const index: ToastMenuIndex = new Map();
  const walk = (group: ToastMenuGroup) => {
    const groupName = group.name ?? "";
    if (group.guid && !index.has(group.guid)) {
      index.set(group.guid, { name: groupName, group: groupName });
    }
    for (const item of group.menuItems ?? []) {
      if (item.guid && !index.has(item.guid)) {
        index.set(item.guid, { name: item.name ?? "", group: groupName });
      }
    }
    for (const child of group.menuGroups ?? []) walk(child);
  };
  for (const menu of menus)
    for (const group of menu.menuGroups ?? []) walk(group);
  return index;
}

/**
 * Rolls a day's orders up into product-mix rows shaped like the PMIX
 * export, so they post through the same sales pipeline.
 *
 * - Deleted orders and checks are ignored.
 * - Voided orders, checks and selections count as voids (sold and voided),
 *   so theoretical usage excludes them.
 * - Comps are fully discounted selections.
 * - Net sales are the post-discount price, less refunds.
 */
export function summarizeOrders(
  orders: ToastOrder[],
  businessDate: string,
  {
    menu = new Map(),
    categories = new Map(),
  }: { menu?: ToastMenuIndex; categories?: Map<string, string> } = {},
): OrdersSummary {
  const rows = new Map<string, PmixApiRow>();
  const itemNames = new Map<string, string>();
  let orderCount = 0;
  let netSales = 0;

  for (const order of orders) {
    if (order.deleted) continue;
    let counted = false;
    for (const check of order.checks ?? []) {
      if (check.deleted) continue;
      for (const selection of check.selections ?? []) {
        if (NON_SALE_SELECTIONS.has(selection.selectionType ?? "")) continue;
        const itemGuid = selection.item?.guid ?? "";
        const menuItem = itemGuid ? menu.get(itemGuid) : undefined;
        const name =
          menuItem?.name || selection.displayName?.trim() || "Unknown item";
        const key = toastItemKey(itemGuid, name);
        if (!key) continue;
        if (itemGuid) itemNames.set(itemGuid, name);

        const quantity = Number(selection.quantity ?? 1);
        const voided = Boolean(
          order.voided || check.voided || selection.voided,
        );
        const price = Number(selection.price ?? 0);
        const refund = Number(selection.refundDetails?.refundAmount ?? 0);
        const net = voided ? 0 : price - refund;
        const comped =
          !voided && price === 0 && Number(selection.preDiscountPrice ?? 0) > 0;

        let row = rows.get(key);
        if (!row) {
          const groupGuid = selection.itemGroup?.guid ?? "";
          row = {
            item_guid: key,
            item_name: name,
            business_date: businessDate,
            quantity_sold: 0,
            net_sales: 0,
            void_quantity: 0,
            comp_quantity: 0,
            category:
              categories.get(selection.salesCategory?.guid ?? "") ??
              "Uncategorized",
            menu_group:
              menuItem?.group ||
              (groupGuid ? menu.get(groupGuid)?.group : undefined) ||
              "",
            type: "",
          };
          rows.set(key, row);
        }
        row.quantity_sold += quantity;
        row.net_sales += net;
        if (voided) row.void_quantity += quantity;
        if (comped) row.comp_quantity += quantity;
        netSales += net;
        counted = true;
      }
    }
    if (counted) orderCount++;
  }

  return {
    rows: [...rows.values()]
      .map((row) => ({ ...row, net_sales: round2(row.net_sales) }))
      .sort((a, b) => a.item_name.localeCompare(b.item_name)),
    orderCount,
    netSales: round2(netSales),
    itemNames,
  };
}
