export type AccountType =
  | "revenue"
  | "cogs"
  | "labor"
  | "operating_expense"
  | "other_income"
  | "other_expense";

export type CogsClass =
  | "liquor"
  | "wine"
  | "beer"
  | "na_bev"
  | "bar_consumables"
  | "food";

/** One row of public.profit_and_loss(). */
export type PnlAccountRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  cogs_class: CogsClass | null;
  sort_order: number;
  amount: number | string;
  opening_value: number | string | null;
  purchases_value: number | string | null;
  closing_value: number | string | null;
  theoretical_amount: number | string | null;
};

export type PnlLine = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  cogsClass: CogsClass | null;
  amount: number;
  /** Share of total net sales. */
  pctOfSales: number | null;
};

export type ClassCost = {
  cogsClass: CogsClass;
  label: string;
  sales: number;
  cost: number;
  theoreticalCost: number | null;
  costPct: number | null;
  theoreticalPct: number | null;
  opening: number;
  purchases: number;
  closing: number;
};

export type PnlStatement = {
  revenue: PnlLine[];
  cogs: PnlLine[];
  labor: PnlLine[];
  operatingExpenses: PnlLine[];
  otherIncome: PnlLine[];
  otherExpense: PnlLine[];
  totals: {
    sales: number;
    cogs: number;
    theoreticalCogs: number;
    grossProfit: number;
    labor: number;
    primeCost: number;
    operatingExpenses: number;
    operatingIncome: number;
    otherNet: number;
    netIncome: number;
  };
  pct: {
    cogs: number | null;
    grossMargin: number | null;
    labor: number | null;
    primeCost: number | null;
    operatingIncome: number | null;
    netIncome: number | null;
  };
  classCosts: ClassCost[];
  unclassifiedSales: number;
  unclassifiedCogs: number;
};

export const COGS_CLASS_LABELS: Record<CogsClass, string> = {
  liquor: "Liquor",
  wine: "Wine",
  beer: "Beer",
  na_bev: "Non-alcoholic",
  bar_consumables: "Bar consumables",
  food: "Food",
};

const toNumber = (value: number | string | null | undefined) =>
  value === null || value === undefined ? 0 : Number(value);

const ratio = (part: number, whole: number) => (whole ? part / whole : null);

const sum = (lines: PnlLine[]) =>
  lines.reduce((total, line) => total + line.amount, 0);

/**
 * Turns per-account rows into a statement with subtotals.
 *
 * Bar consumables (juice, syrups, garnish) have no sales of their own; their
 * cost % is measured against all beverage sales.
 */
export function buildPnlStatement(rows: PnlAccountRow[]): PnlStatement {
  const lines: PnlLine[] = rows.map((row) => ({
    accountId: row.account_id,
    code: row.account_code,
    name: row.account_name,
    type: row.account_type,
    cogsClass: row.cogs_class,
    amount: toNumber(row.amount),
    pctOfSales: null,
  }));

  const byType = (type: AccountType) =>
    lines.filter((line) => line.type === type);
  const revenue = byType("revenue");
  const sales = sum(revenue);
  for (const line of lines) line.pctOfSales = ratio(line.amount, sales);

  const cogs = byType("cogs");
  const labor = byType("labor");
  const operatingExpenses = byType("operating_expense");
  const otherIncome = byType("other_income");
  const otherExpense = byType("other_expense");

  const totalCogs = sum(cogs);
  const totalLabor = sum(labor);
  const totalOpex = sum(operatingExpenses);
  const grossProfit = sales - totalCogs;
  const operatingIncome = grossProfit - totalLabor - totalOpex;
  const otherNet = sum(otherIncome) - sum(otherExpense);
  const netIncome = operatingIncome + otherNet;

  const salesByClass = new Map<CogsClass, number>();
  for (const line of revenue) {
    if (line.cogsClass) salesByClass.set(line.cogsClass, line.amount);
  }
  const beverageSales =
    (salesByClass.get("liquor") ?? 0) +
    (salesByClass.get("wine") ?? 0) +
    (salesByClass.get("beer") ?? 0) +
    (salesByClass.get("na_bev") ?? 0);

  const classCosts: ClassCost[] = rows
    .filter((row) => row.account_type === "cogs" && row.cogs_class)
    .map((row) => {
      const cogsClass = row.cogs_class as CogsClass;
      const classSales =
        cogsClass === "bar_consumables"
          ? beverageSales
          : (salesByClass.get(cogsClass) ?? 0);
      const cost = toNumber(row.amount);
      const theoretical =
        row.theoretical_amount === null
          ? null
          : toNumber(row.theoretical_amount);
      return {
        cogsClass,
        label: COGS_CLASS_LABELS[cogsClass],
        sales: classSales,
        cost,
        theoreticalCost: theoretical,
        costPct: ratio(cost, classSales),
        theoreticalPct:
          theoretical === null ? null : ratio(theoretical, classSales),
        opening: toNumber(row.opening_value),
        purchases: toNumber(row.purchases_value),
        closing: toNumber(row.closing_value),
      };
    });

  const theoreticalCogs = rows.reduce(
    (total, row) => total + toNumber(row.theoretical_amount),
    0,
  );

  return {
    revenue,
    cogs,
    labor,
    operatingExpenses,
    otherIncome,
    otherExpense,
    totals: {
      sales,
      cogs: totalCogs,
      theoreticalCogs,
      grossProfit,
      labor: totalLabor,
      primeCost: totalCogs + totalLabor,
      operatingExpenses: totalOpex,
      operatingIncome,
      otherNet,
      netIncome,
    },
    pct: {
      cogs: ratio(totalCogs, sales),
      grossMargin: ratio(grossProfit, sales),
      labor: ratio(totalLabor, sales),
      primeCost: ratio(totalCogs + totalLabor, sales),
      operatingIncome: ratio(operatingIncome, sales),
      netIncome: ratio(netIncome, sales),
    },
    classCosts,
    unclassifiedSales: sum(revenue.filter((line) => !line.cogsClass)),
    unclassifiedCogs: sum(cogs.filter((line) => !line.cogsClass)),
  };
}
