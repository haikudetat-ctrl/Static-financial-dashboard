import { describe, expect, it } from "vitest";

import { buildPnlStatement, type PnlAccountRow } from "@/lib/reporting/pnl";

function row(
  code: string,
  type: PnlAccountRow["account_type"],
  amount: number,
  extra: Partial<PnlAccountRow> = {},
): PnlAccountRow {
  return {
    account_id: code,
    account_code: code,
    account_name: code,
    account_type: type,
    cogs_class: null,
    sort_order: Number(code),
    amount,
    opening_value: null,
    purchases_value: null,
    closing_value: null,
    theoretical_amount: null,
    ...extra,
  };
}

describe("buildPnlStatement", () => {
  const statement = buildPnlStatement([
    row("4100", "revenue", 800, { cogs_class: "liquor" }),
    row("4300", "revenue", 100, { cogs_class: "beer" }),
    row("4500", "revenue", 100, { cogs_class: "food" }),
    row("4900", "revenue", 0),
    row("5100", "cogs", 160, {
      cogs_class: "liquor",
      opening_value: 500,
      purchases_value: 200,
      closing_value: 540,
      theoretical_amount: 140,
    }),
    row("5300", "cogs", 25, { cogs_class: "beer" }),
    row("5500", "cogs", 30, { cogs_class: "food" }),
    row("5600", "cogs", 18, { cogs_class: "bar_consumables" }),
    row("6100", "labor", 250),
    row("7100", "operating_expense", 200),
    row("8100", "other_income", 10),
    row("8200", "other_expense", 5),
  ]);

  it("subtotals sales, cost of goods, and prime cost", () => {
    expect(statement.totals.sales).toBe(1000);
    expect(statement.totals.cogs).toBe(233);
    expect(statement.totals.grossProfit).toBe(767);
    expect(statement.totals.primeCost).toBe(483);
    expect(statement.pct.primeCost).toBeCloseTo(0.483);
  });

  it("carries operating and net income through other income and expense", () => {
    expect(statement.totals.operatingIncome).toBe(317);
    expect(statement.totals.netIncome).toBe(322);
  });

  it("measures each class against its own sales", () => {
    const liquor = statement.classCosts.find((c) => c.cogsClass === "liquor");
    expect(liquor?.costPct).toBeCloseTo(0.2);
    expect(liquor?.theoreticalPct).toBeCloseTo(0.175);
    expect(liquor?.opening).toBe(500);
  });

  it("measures bar consumables against all beverage sales", () => {
    const consumables = statement.classCosts.find(
      (c) => c.cogsClass === "bar_consumables",
    );
    expect(consumables?.sales).toBe(900);
    expect(consumables?.costPct).toBeCloseTo(0.02);
  });

  it("returns no percentages when there are no sales", () => {
    const empty = buildPnlStatement([row("6100", "labor", 50)]);
    expect(empty.pct.labor).toBeNull();
    expect(empty.totals.netIncome).toBe(-50);
  });
});
