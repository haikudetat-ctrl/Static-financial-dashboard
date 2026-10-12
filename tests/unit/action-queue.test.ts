import { describe, expect, it } from "vitest";

import { buildActions } from "@/app/(manager)/today/action-queue";
import { buildPnlStatement, type PnlAccountRow } from "@/lib/reporting/pnl";

const row = (
  code: string,
  type: PnlAccountRow["account_type"],
  amount: number,
  theoretical: number | null = null,
): PnlAccountRow => ({
  account_id: code,
  account_code: code,
  account_name: code,
  account_type: type,
  cogs_class: "liquor",
  sort_order: 0,
  amount,
  opening_value: null,
  purchases_value: null,
  closing_value: null,
  theoretical_amount: theoretical,
});

const queues = (counts: Partial<Record<string, [number, number | null]>>) =>
  (
    [
      "invoices",
      "priceChanges",
      "imports",
      "counts",
      "unmappedLines",
      "catalog",
    ] as const
  ).map((key) => ({
    key,
    count: counts[key]?.[0] ?? 0,
    amount: counts[key]?.[1] ?? null,
  }));

describe("buildActions", () => {
  it("lists only open queues, biggest dollars first, and names the clear ones", () => {
    const pnl = buildPnlStatement([
      row("sales", "revenue", 10_000),
      row("cost", "cogs", 2_500, 2_000),
    ]);
    const { actions, cleared } = buildActions(
      queues({
        invoices: [2, 400],
        unmappedLines: [3, 900],
        counts: [1, null],
      }),
      pnl,
    );

    expect(actions.map((action) => action.key)).toEqual([
      "unmappedLines",
      "variance",
      "invoices",
      "counts",
    ]);
    expect(actions[1].title).toBe("Cost of goods ran 5.0 pts over recipes");
    expect(cleared).toEqual([
      "no price changes",
      "Toast imports posted",
      "catalog questions resolved",
    ]);
  });

  it("leaves variance out when cost is at or under recipes", () => {
    const pnl = buildPnlStatement([
      row("sales", "revenue", 10_000),
      row("cost", "cogs", 2_000, 2_000),
    ]);
    expect(buildActions(queues({}), pnl).actions).toEqual([]);
  });
});
