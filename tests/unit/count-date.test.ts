import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  businessToday,
  isValidCountDate,
  shiftDate,
} from "@/lib/inventory/count-period";

describe("businessToday", () => {
  it("keeps the hours after midnight on the previous business day", () => {
    // 1:30 AM Monday Oct 19 in New York is still Sunday's business day.
    expect(businessToday(new Date("2026-10-19T05:30:00Z"))).toBe("2026-10-18");
    // 4:30 AM is the new day.
    expect(businessToday(new Date("2026-10-19T08:30:00Z"))).toBe("2026-10-19");
  });
});

describe("isValidCountDate", () => {
  const today = "2026-10-18";

  it("accepts today and the last week", () => {
    expect(isValidCountDate(today, today)).toBe(true);
    expect(isValidCountDate(shiftDate(today, -7), today)).toBe(true);
  });

  it("refuses the future, old dates and junk", () => {
    expect(isValidCountDate(shiftDate(today, 1), today)).toBe(false);
    expect(isValidCountDate(shiftDate(today, -8), today)).toBe(false);
    expect(isValidCountDate("Oct 18", today)).toBe(false);
  });
});
