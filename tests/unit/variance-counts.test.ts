import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/recipes/cost-book", () => ({ loadRecipeCatalog: vi.fn() }));

import {
  countWindows,
  pickPeriodCounts,
  salesWindow,
  type PostedCount,
} from "@/lib/inventory/variance";

const count = (
  id: string,
  countDate: string,
  countType: "full" | "spot" = "full",
): PostedCount => ({
  id,
  countType,
  countDate,
  // Counts post at the end of their business day.
  postedAt: `${countDate}T23:59:59Z`,
});

const p10 = { periodStart: "2026-10-05", periodEnd: "2026-11-01" };

describe("pickPeriodCounts", () => {
  it("uses the count taken just before the period as the opening", () => {
    const result = pickPeriodCounts(
      [count("open", "2026-10-04"), count("close", "2026-11-01")],
      p10,
    );
    expect(result.opening?.id).toBe("open");
    expect(result.closing?.id).toBe("close");
  });

  it("has no closing count while the period is still running", () => {
    const result = pickPeriodCounts([count("open", "2026-10-04")], p10);
    expect(result.opening?.id).toBe("open");
    expect(result.closing).toBeNull();
  });

  it("ignores spot counts and counts from later periods", () => {
    const result = pickPeriodCounts(
      [
        count("open", "2026-10-04"),
        count("spot", "2026-10-20", "spot"),
        count("close", "2026-11-02"),
        count("p11", "2026-11-29"),
      ],
      p10,
    );
    expect(result.closing?.id).toBe("close");
  });
});

describe("mid-period checkpoints", () => {
  const counts = [
    count("open", "2026-10-04"),
    count("mid", "2026-10-18"),
    count("close", "2026-11-01"),
  ];

  it("keeps a mid-period count as a checkpoint, not the closing count", () => {
    const result = pickPeriodCounts(counts, p10);
    expect(result.opening?.id).toBe("open");
    expect(result.closing?.id).toBe("close");
    expect(result.checkpoints.map((c) => c.id)).toEqual(["mid"]);
  });

  it("has a checkpoint but no closing while the period runs", () => {
    const result = pickPeriodCounts(counts.slice(0, 2), p10);
    expect(result.closing).toBeNull();
    expect(result.checkpoints.map((c) => c.id)).toEqual(["mid"]);
  });

  it("splits the period into count-to-count windows", () => {
    const windows = countWindows(pickPeriodCounts(counts, p10));
    expect(windows.map((w) => `${w.from.id}→${w.to.id}`)).toEqual([
      "open→mid",
      "mid→close",
    ]);
  });

  it("windows run to the latest checkpoint before the close", () => {
    const windows = countWindows(pickPeriodCounts(counts.slice(0, 2), p10));
    expect(windows.map((w) => `${w.from.id}→${w.to.id}`)).toEqual(["open→mid"]);
  });
});

describe("salesWindow", () => {
  it("starts the day after the opening count and ends on the closing day", () => {
    expect(
      salesWindow(count("a", "2026-10-04"), count("b", "2026-10-18")),
    ).toEqual({ start: "2026-10-05", end: "2026-10-18" });
    expect(
      salesWindow(count("b", "2026-10-18"), count("c", "2026-11-01")),
    ).toEqual({ start: "2026-10-19", end: "2026-11-01" });
  });
});
