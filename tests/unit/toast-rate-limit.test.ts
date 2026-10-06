import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { describeToastError, retryDelayMs, toastLogin } from "@/lib/toast/api";
import { openToastSession } from "@/lib/toast/sync";

const credentials = {
  apiHost: "https://toast.test",
  clientId: "c",
  clientSecret: "s",
  restaurantGuid: "r",
};

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(body), { status, headers });
const rateLimited = (retryAfter?: string) =>
  new Response("<html><body>429 Too Many Requests</body></html>", {
    status: 429,
    headers: retryAfter ? { "retry-after": retryAfter } : {},
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("rate limits", () => {
  it("waits as long as Toast asks, else backs off, within limits", () => {
    expect(retryDelayMs("2", 0)).toBe(2000);
    expect(retryDelayMs(null, 0)).toBe(1000);
    expect(retryDelayMs(null, 2)).toBe(4000);
    expect(retryDelayMs("120", 0)).toBe(10000);
  });

  it("drops HTML error pages from messages", () => {
    expect(describeToastError("<html><body>429</body></html>")).toBe("");
    expect(describeToastError('{"message":"Bad","requestId":"x1"}')).toBe(
      "Bad (request x1)",
    );
  });

  it("retries a rate-limited login, then succeeds", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(rateLimited("1"))
      .mockResolvedValueOnce(
        json({ token: { accessToken: "tok", expiresIn: 86400 } }),
      );
    const pending = toastLogin(credentials);
    await vi.advanceTimersByTimeAsync(1000);
    const login = await pending;
    expect(login.token).toBe("tok");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after three retries with a plain message", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      rateLimited("1"),
    );
    const pending = toastLogin(credentials).catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = (await pending) as Error;
    expect(error.message).toBe(
      "Toast is rate-limiting requests (429). Wait a minute and pull again.",
    );
  });
});

/** Admin client stand-in holding one cache row. */
function cacheAdmin(row: Record<string, unknown> | null) {
  const upserts: unknown[] = [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: row, error: null }),
    upsert: async (payload: unknown) => (
      upserts.push(payload),
      { error: null }
    ),
  };
  return { admin: { from: () => builder } as never, upserts };
}

describe("openToastSession cache", () => {
  const now = Date.UTC(2026, 9, 6, 12);
  const connection = { ...credentials, connectionId: "conn" };

  it("reuses a stored token and menu without calling Toast", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const { admin, upserts } = cacheAdmin({
      access_token: "cached",
      token_expires_at: new Date(now + 6 * 3600_000).toISOString(),
      menu: [["i1", { name: "Spritz", group: "Cocktails" }]],
      categories: [["c1", "Liquor"]],
      menu_fetched_at: new Date(now - 3600_000).toISOString(),
    });
    const session = await openToastSession(connection, { admin, now });
    expect(fetch).not.toHaveBeenCalled();
    expect(session.cached).toBe(true);
    expect(session.menu.get("i1")?.name).toBe("Spritz");
    expect(session.categories.get("c1")).toBe("Liquor");
    expect(upserts).toHaveLength(0);
  });

  it("signs in again near expiry and stores the new token", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) =>
        String(url).includes("/authentication/")
          ? json({ token: { accessToken: "new", expiresIn: 86400 } })
          : json(String(url).includes("menus") ? { menus: [] } : []),
      );
    const { admin, upserts } = cacheAdmin({
      access_token: "old",
      token_expires_at: new Date(now + 60_000).toISOString(),
      menu: [],
      categories: [],
      menu_fetched_at: new Date(now - 7 * 3600_000).toISOString(),
    });
    const session = await openToastSession(connection, { admin, now });
    expect(session.cached).toBe(false);
    expect(
      fetch.mock.calls.filter(([url]) =>
        String(url).includes("/authentication/"),
      ),
    ).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      connection_id: "conn",
      access_token: "new",
    });
    expect(upserts[0]).toHaveProperty("menu_fetched_at");
  });

  it("ignores the cache for new credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("/authentication/")
        ? json({ token: { accessToken: "fresh", expiresIn: 86400 } })
        : json(String(url).includes("menus") ? { menus: [] } : []),
    );
    const { admin, upserts } = cacheAdmin({
      access_token: "old",
      token_expires_at: new Date(now + 9e6).toISOString(),
    });
    const session = await openToastSession(connection, {
      admin,
      now,
      fresh: true,
    });
    expect(session.cached).toBe(false);
    expect(upserts[0]).toMatchObject({ access_token: "fresh" });
  });
});
