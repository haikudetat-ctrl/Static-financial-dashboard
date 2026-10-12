import { Check } from "lucide-react";

import { Badge, ButtonLink, Panel, formatMoney } from "@/components/ui";
import type { AttentionQueue } from "@/lib/reporting/attention";
import type { PnlStatement } from "@/lib/reporting/pnl";

export type Action = {
  key: string;
  title: string;
  detail: string;
  /** Dollars at stake, used to sort the queue. */
  amount: number | null;
  amountLabel: string;
  href: string;
  cta: string;
  priority: "high" | "medium" | "low";
};

const priorityBar: Record<Action["priority"], string> = {
  high: "bg-[var(--danger)]",
  medium: "bg-[var(--warning)]",
  low: "bg-[var(--line-strong)]",
};

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** Turns open queues into actions, biggest money first. */
export function buildActions(queues: AttentionQueue[], pnl: PnlStatement) {
  const of = (key: AttentionQueue["key"]) =>
    queues.find((queue) => queue.key === key) ?? { count: 0, amount: null };
  const actions: Action[] = [];
  const cleared: string[] = [];

  const overRecipe = pnl.totals.cogs - pnl.totals.theoreticalCogs;
  const gap =
    pnl.totals.sales && pnl.totals.theoreticalCogs
      ? overRecipe / pnl.totals.sales
      : null;
  if (gap !== null && gap > 0.005) {
    const worst = [...pnl.classCosts]
      .filter((row) => row.theoreticalCost !== null)
      .sort(
        (a, b) =>
          b.cost -
          (b.theoreticalCost ?? 0) -
          (a.cost - (a.theoreticalCost ?? 0)),
      )[0];
    actions.push({
      key: "variance",
      title: `Cost of goods ran ${(gap * 100).toFixed(1)} pts over recipes`,
      detail: worst
        ? `${worst.label} accounts for the largest share of the gap`
        : "Actual usage is above what recipes say was poured",
      amount: overRecipe,
      amountLabel: "over recipe cost",
      href: "/inventory/variance",
      cta: "Investigate",
      priority: gap > 0.02 ? "high" : "medium",
    });
  }

  const add = (
    key: AttentionQueue["key"],
    clearLabel: string,
    build: (count: number, amount: number | null) => Omit<Action, "key">,
  ) => {
    const queue = of(key);
    if (queue.count > 0)
      actions.push({ key, ...build(queue.count, queue.amount) });
    else cleared.push(clearLabel);
  };

  add("invoices", "invoices reviewed", (count, amount) => ({
    title: `${plural(count, "invoice", "invoices")} waiting for review`,
    detail: "Costs don’t post to inventory until the lines are approved",
    amount,
    amountLabel: "unposted cost",
    href: "/invoices/upload",
    cta: "Review",
    priority: "high",
  }));
  add("unmappedLines", "invoice lines mapped", (count, amount) => ({
    title: `${plural(count, "invoice line", "invoice lines")} without an item`,
    detail: "They can’t cost inventory until each is matched to an item",
    amount,
    amountLabel: "unmapped",
    href: "/exceptions",
    cta: "Map lines",
    priority: "medium",
  }));
  add("priceChanges", "no price changes", (count) => ({
    title: `${plural(count, "price change", "price changes")} of 5% or more`,
    detail: "Check the invoice and update menu prices where pour cost moved",
    amount: null,
    amountLabel: "see drink impact",
    href: "/purchasing/price-changes",
    cta: "Review",
    priority: "medium",
  }));
  add("imports", "Toast imports posted", (count) => ({
    title: `${plural(count, "import", "imports")} not posted to sales`,
    detail: "Sales and theoretical usage stay incomplete until they post",
    amount: null,
    amountLabel: "sales missing",
    href: "/imports",
    cta: "Post",
    priority: "medium",
  }));
  add("counts", "counts approved", (count) => ({
    title: `${plural(count, "count", "counts")} open`,
    detail: "Started but not yet approved and posted to on-hand",
    amount: null,
    amountLabel: "",
    href: "/inventory/counts",
    cta: "Open",
    priority: "low",
  }));
  add("catalog", "catalog questions resolved", (count) => ({
    title: `${plural(count, "catalog question", "catalog questions")}`,
    detail: "Items from the workbook import that need a decision",
    amount: null,
    amountLabel: "",
    href: "/exceptions/catalog-review",
    cta: "Decide",
    priority: "low",
  }));

  const rank = { high: 0, medium: 1, low: 2 };
  actions.sort(
    (a, b) =>
      (b.amount ?? 0) - (a.amount ?? 0) || rank[a.priority] - rank[b.priority],
  );
  return { actions, cleared };
}

export function ActionQueue({
  actions,
  cleared,
}: {
  actions: Action[];
  cleared: string[];
}) {
  return (
    <Panel
      title="Action queue"
      description="Everything keeping the P&L from being accurate, biggest money first"
      actions={
        actions.length > 0 ? (
          <Badge tone="warning">{actions.length} open</Badge>
        ) : (
          <Badge tone="good">All clear</Badge>
        )
      }
      flush
    >
      <ul>
        {actions.map((action) => (
          <li key={action.key} className="border-b">
            <div className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className={`h-9 w-[3px] shrink-0 rounded-full ${priorityBar[action.priority]}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{action.title}</p>
                <p className="text-xs text-[var(--muted)]">{action.detail}</p>
              </div>
              {(action.amount || action.amountLabel) && (
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-sm font-semibold tabular-nums">
                    {action.amount
                      ? formatMoney(action.amount, { cents: false })
                      : "—"}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {action.amountLabel}
                  </p>
                </div>
              )}
              <ButtonLink href={action.href} size="sm">
                {action.cta}
              </ButtonLink>
            </div>
          </li>
        ))}
      </ul>
      {cleared.length > 0 && (
        <p className="flex items-start gap-2 bg-[var(--surface)] px-4 py-3 text-xs text-[var(--muted)]">
          <Check
            size={14}
            aria-hidden="true"
            className="mt-px shrink-0 text-[var(--success)]"
          />
          <span>All clear: {cleared.join(" · ")}</span>
        </p>
      )}
    </Panel>
  );
}
