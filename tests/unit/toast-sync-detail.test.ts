import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { ToastApiError, type ToastOrder } from "@/lib/toast/api";
import { syncToastDay, type ToastSession } from "@/lib/toast/sync";

type Call = {
  table: string;
  op: string;
  payload?: unknown;
  filters: unknown[];
};

/** A tiny stand-in for the Supabase client that records writes. */
function fakeAdmin(rows: Record<string, unknown>) {
  const calls: Call[] = [];
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const builder = {
      select: () => builder,
      eq: (...args: unknown[]) => (call.filters.push(args), builder),
      neq: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => ({
        data: rows[`${table}:single`] ?? null,
        error: null,
      }),
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      delete: () => ((call.op = "delete"), calls.push(call), builder),
      insert: (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        calls.push(call);
        return Object.assign(Promise.resolve({ error: null }), builder);
      },
      upsert: async (payload: unknown) => {
        calls.push({ ...call, op: "upsert", payload });
        return { error: null };
      },
      update: (payload: unknown) => {
        calls.push({ ...call, op: "update", payload });
        return builder;
      },
      then: (resolve: (value: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    };
    return builder;
  };
  return { admin: { from, rpc } as never, calls, rpc };
}

const connection = {
  connectionId: "conn",
  organizationId: "org",
  locationId: "loc",
  restaurantGuid: "r",
  apiHost: "h",
  clientId: "c",
  clientSecret: "s",
  autoPost: true,
  actingProfileId: "me",
};

const orders: ToastOrder[] = [
  {
    guid: "o1",
    checks: [
      {
        guid: "c1",
        amount: 14,
        selections: [
          {
            guid: "s1",
            item: { guid: "i1" },
            displayName: "Spritz",
            quantity: 1,
            price: 14,
          },
        ],
      },
    ],
  },
];

const session = (list = orders): ToastSession => ({
  client: { ordersForDate: vi.fn(async () => list) } as never,
  menu: new Map(),
  categories: new Map(),
});

describe("syncToastDay order detail", () => {
  it("backfills detail for a posted day without posting sales again", async () => {
    const { admin, calls, rpc } = fakeAdmin({
      sales_business_days: { id: "day", source_import_id: "imp" },
    });
    const result = await syncToastDay(connection, "2026-10-04", {
      trigger: "manual",
      admin,
      session: session(),
    });
    expect(result.status).toBe("skipped");
    expect(result.message).toBe("Sales already posted; 1 checks saved.");
    expect(rpc).not.toHaveBeenCalled();
    const writes = calls.map((c) => `${c.op}:${c.table}`);
    expect(writes).toEqual(
      expect.arrayContaining([
        "delete:toast_check_items",
        "delete:toast_checks",
        "insert:toast_checks",
        "insert:toast_check_items",
        "upsert:toast_detail_days",
      ]),
    );
    expect(writes).not.toContain("insert:source_imports");
    const day = calls.find((c) => c.table === "toast_detail_days")?.payload;
    expect(day).toMatchObject({
      business_date: "2026-10-04",
      check_count: 1,
      item_count: 1,
      net_sales: 14,
    });
  });

  it("skips without calling Toast when sales and detail are both saved", async () => {
    const { admin } = fakeAdmin({
      sales_business_days: { id: "day", source_import_id: "imp" },
      toast_detail_days: { business_date: "2026-10-04" },
    });
    const s = session();
    const result = await syncToastDay(connection, "2026-10-04", {
      trigger: "schedule",
      admin,
      session: s,
    });
    expect(result.status).toBe("skipped");
    expect(s.client.ordersForDate).not.toHaveBeenCalled();
  });

  it("saves detail and posts sales for a new day", async () => {
    const { admin, calls, rpc } = fakeAdmin({
      "source_imports:single": { id: "imp-new" },
    });
    const result = await syncToastDay(connection, "2026-10-05", {
      trigger: "schedule",
      admin,
      session: session(),
    });
    expect(result.status).toBe("posted");
    expect(result.message).toMatch(/1 checks saved/);
    expect(rpc).toHaveBeenCalledWith("post_sales_import_as", expect.anything());
    expect(
      calls.some((c) => c.table === "toast_check_items" && c.op === "insert"),
    ).toBe(true);
  });
});

describe("a stored token Toast rejects", () => {
  it("signs in again once and carries on", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (url) =>
          new Response(
            JSON.stringify(
              String(url).includes("/authentication/")
                ? { token: { accessToken: "fresh", expiresIn: 86400 } }
                : String(url).includes("menus")
                  ? { menus: [] }
                  : [],
            ),
          ),
      );
    const { admin, calls } = fakeAdmin({});
    const stale: ToastSession = {
      client: {
        ordersForDate: vi.fn(async () => {
          throw new ToastApiError("expired", 401);
        }),
      } as never,
      menu: new Map(),
      categories: new Map(),
      cached: true,
    };
    const result = await syncToastDay(connection, "2026-10-05", {
      trigger: "manual",
      admin,
      session: stale,
    });
    expect(result.status).toBe("empty");
    expect(
      fetch.mock.calls.filter(([url]) =>
        String(url).includes("/authentication/"),
      ),
    ).toHaveLength(1);
    expect(
      calls.some((c) => c.table === "toast_session_cache" && c.op === "upsert"),
    ).toBe(true);
    fetch.mockRestore();
  });
});
