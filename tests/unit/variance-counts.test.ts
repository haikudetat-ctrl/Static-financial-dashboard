import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/recipes/cost-book", () => ({ loadRecipeCatalog: vi.fn() }));

import { pickPeriodCounts, type PostedCount } from "@/lib/inventory/variance";

const count = (
  id: string,
  countDate: string,
  countType: "full" | "spot" = "full",
): PostedCount => ({
  id,
  countType,
  countDate,
  postedAt: `${countDate}T12:00:00Z`,
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
