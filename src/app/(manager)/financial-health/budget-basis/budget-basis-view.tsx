import Link from "next/link";
import { AlertTriangle, Check, Download } from "lucide-react";

import { ClassCostGap } from "@/components/charts";
import {
  Badge,
  Callout,
  EmptyState,
  PageBody,
  PageHeader,
  Panel,
  SectionTabs,
  TableScroll,
  buttonClass,
  formatMoney,
  formatPercent,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { sectionNavigation } from "@/lib/navigation";
import {
  basisPeriodName,
  combineClassCosts,
  periodCompleteness,
  type BasisRow,
} from "@/lib/reporting/budget-basis";
import type { loadBudgetBasis } from "@/lib/reporting/budget-basis-data";
import { formatRangeLabel } from "@/lib/reporting/period-range";

export const ACTIVE = "/financial-health/budget-basis";

export type Basis = NonNullable<Awaited<ReturnType<typeof loadBudgetBasis>>>;

export function BudgetBasisView({ basis }: { basis: Basis }) {
  const { periods, rows, annualDays, budgetYear } = basis;
  const selectedIds = periods.map((period) => period.id);
  const toggleHref = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((selected) => selected !== id)
      : [...selectedIds, id];
    return `${ACTIVE}?periods=${next.join(",")}`;
  };
  const query = selectedIds.length ? `?periods=${selectedIds.join(",")}` : "";
  const completeness = periods.map((period) => ({
    period,
    checks: periodCompleteness(period),
  }));
  const gaps = completeness.reduce(
    (total, item) => total + item.checks.filter((check) => !check.ok).length,
    0,
  );
  const yearLabel = budgetYear ? `FY${budgetYear}` : "next year’s";

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Financials", href: "/financial-health" }]}
        title={`${yearLabel} budget basis`}
        description="Fiscal Q4 actuals as the starting point for next year’s budget — every account per period, as a daily rate, and run over a full year."
        actions={
          periods.length > 0 && (
            <a
              href={`${ACTIVE}/export${query}`}
              className={buttonClass("secondary")}
              download
            >
              <Download size={15} strokeWidth={1.8} aria-hidden="true" />
              Download CSV
            </a>
          )
        }
      />
      <SectionTabs
        items={sectionNavigation.financials.map((tab) => ({
          ...tab,
          active: tab.href === ACTIVE,
        }))}
      />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--muted)]">
            Periods in the basis
          </span>
          {basis.selectable.map((period) => {
            const on = selectedIds.includes(period.id);
            const last = on && selectedIds.length === 1;
            const chip = `rounded-full border px-3 py-1 text-xs font-medium transition ${
              on
                ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                : "border-[var(--line-strong)] bg-[var(--surface-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`;
            return last ? (
              <span key={period.id} className={chip}>
                {basisPeriodName(period)}
              </span>
            ) : (
              <Link
                key={period.id}
                href={toggleHref(period.id)}
                aria-pressed={on}
                className={chip}
              >
                {basisPeriodName(period)}
              </Link>
            );
          })}
        </div>

        {periods.length === 0 ? (
          <Panel>
            <EmptyState
              title="No completed days to build from yet"
              detail="The basis fills in from the first full day of fiscal Q4 (P10)."
            />
          </Panel>
        ) : (
          <>
            {gaps > 0 ? (
              <Callout
                tone="warning"
                title={`${gaps} ${gaps === 1 ? "gap" : "gaps"} to close before these numbers can carry a budget`}
              >
                Anything estimated or missing below flows straight into the run
                rate. Close each gap, or note it as an assumption in the budget.
              </Callout>
            ) : (
              <Callout tone="good" title="Every period is complete">
                Sales, counts, invoices, labor and expenses are all in — these
                actuals are solid enough to budget from.
              </Callout>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {completeness.map(({ period, checks }) => {
                const open = checks.filter((check) => !check.ok).length;
                return (
                  <section
                    key={period.id}
                    className="rounded-lg border bg-[var(--surface-strong)]"
                  >
                    <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
                      <div>
                        <h2 className="text-sm font-semibold">{period.name}</h2>
                        <p className="text-xs text-[var(--muted)]">
                          {formatRangeLabel(period.start, period.through)} ·{" "}
                          {period.days < period.length
                            ? `${period.days} of ${period.length} days so far`
                            : `${period.length} days`}
                        </p>
                      </div>
                      {period.status === "closed" ? (
                        <Badge tone="good">Closed</Badge>
                      ) : open === 0 ? (
                        <Badge tone="good">Complete</Badge>
                      ) : (
                        <Badge tone="warning">
                          {open} {open === 1 ? "gap" : "gaps"}
                        </Badge>
                      )}
                    </header>
                    <ul className="grid gap-2 px-4 py-3">
                      {checks.map((check) => (
                        <li key={check.label} className="flex gap-2 text-xs">
                          {check.ok ? (
                            <Check
                              size={14}
                              aria-hidden="true"
                              className="mt-px shrink-0 text-[var(--success)]"
                            />
                          ) : (
                            <AlertTriangle
                              size={14}
                              aria-hidden="true"
                              className="mt-px shrink-0 text-[var(--warning)]"
                            />
                          )}
                          <span>
                            <span className="font-medium">{check.label}</span>
                            <span className="sr-only">
                              {check.ok ? " — done" : " — open"}
                            </span>
                            <span className="block text-[var(--muted)]">
                              {check.detail}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {period.status !== "closed" && (
                      <Link
                        href={`/periods/${period.id}/readiness`}
                        className="block border-t px-4 py-2 text-xs font-medium text-[var(--accent-strong)] hover:underline"
                      >
                        Open close checklist
                      </Link>
                    )}
                  </section>
                );
              })}
            </div>

            <Panel
              title="Statement basis"
              description={`Run rate = per-day rate × ${annualDays} days${basis.annualDaysFromCalendar ? " in the fiscal calendar" : " (a 52-week year)"}. It assumes Q4 repeats all year — adjust for seasonality in the budget.`}
              flush
            >
              <BasisTable periods={periods} rows={rows} />
            </Panel>

            <Panel
              title="Cost of goods by class"
              description="Across the basis periods · ● actual   ○ recipes. The gap is the shrinkage to budget for, or to fix first."
              flush
            >
              <ClassCostGap classes={combineClassCosts(periods)} />
            </Panel>
          </>
        )}
      </PageBody>
    </>
  );
}

function BasisTable({
  periods,
  rows,
}: {
  periods: Array<{ id: string; name: string; days: number; length: number }>;
  rows: BasisRow[];
}) {
  return (
    <TableScroll>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Account</th>
            {periods.map((period) => (
              <th key={period.id} className={thNumClass}>
                {period.name}
                <span className="block font-normal">
                  {period.days < period.length
                    ? `${period.days} of ${period.length} days`
                    : `${period.days} days`}
                </span>
              </th>
            ))}
            <th className={thNumClass}>Per day</th>
            <th className={thNumClass}>Run rate</th>
            <th className={thNumClass}>% of sales</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.kind === "section" ? (
              <tr key={row.key}>
                <td
                  colSpan={periods.length + 4}
                  className="border-b bg-[var(--surface)] px-4 pt-3 pb-1.5 text-xs font-semibold text-[var(--muted)]"
                >
                  {row.label}
                </td>
              </tr>
            ) : (
              <tr
                key={row.key}
                className={
                  row.kind === "strong"
                    ? "bg-[var(--accent-soft)] font-semibold"
                    : row.kind === "total"
                      ? "font-medium"
                      : ""
                }
              >
                <td
                  className={row.kind === "line" ? `${tdClass} pl-6` : tdClass}
                >
                  {row.label}
                </td>
                {row.amounts.map((amount, index) => (
                  <td key={periods[index].id} className={tdNumClass}>
                    {formatMoney(amount, { cents: false })}
                  </td>
                ))}
                <td className={tdNumClass}>
                  {formatMoney(row.perDay, { cents: false })}
                </td>
                <td className={`${tdNumClass} font-semibold`}>
                  {formatMoney(row.annual, { cents: false })}
                </td>
                <td className={tdNumClass}>{formatPercent(row.pctOfSales)}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </TableScroll>
  );
}
