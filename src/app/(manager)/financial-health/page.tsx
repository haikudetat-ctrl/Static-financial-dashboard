import type { Metadata } from "next";
import Link from "next/link";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getCogsForPeriod, getPeriods } from "@/lib/reporting/queries";

export const metadata: Metadata = { title: "Financial health" };

function fmt(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function FinancialHealthPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const periods = await getPeriods(context.organizationId, locationId);
  const latestClosed = periods.find((p) => p.status === "closed");
  const latestPeriod = periods[0];
  const cogs = latestClosed ? await getCogsForPeriod(latestClosed.id) : null;
  const period = latestClosed ?? latestPeriod;

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Financial health
        </p>
        <div className="mt-2 flex flex-col justify-between gap-5 border-b pb-7 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Every number should explain itself.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Actual and theoretical COGS, margin, labor, and prime cost,
              traceable to the records that produced them.
            </p>
          </div>
          {period && (
            <Link
              href={`/periods/${period.id}/readiness`}
              className="text-sm underline underline-offset-4"
            >
              {period.status === "closed" ? "View close" : "Close readiness"} ·
              {period.periodStart}–{period.periodEnd}
            </Link>
          )}
        </div>

        {!cogs ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <Signal
              label="Net sales"
              value={"\u2014"}
              detail="Awaiting sales imports."
              color="var(--muted)"
            />
            <Signal
              label="Actual COGS"
              value={"\u2014"}
              detail="Close a period to see actual COGS."
              color="var(--muted)"
            />
            <Signal
              label="Prime cost"
              value={"\u2014"}
              detail="Awaiting sales and labor."
              color="var(--muted)"
            />
          </div>
        ) : (
          <>
            <div className="mt-8 grid border-x sm:grid-cols-4">
              <Metric label="Net sales" value={"\u2014"} />
              <Metric label="Actual COGS" value={fmt(cogs.actualCogs)} />
              <Metric
                label="Theoretical COGS"
                value={fmt(cogs.theoreticalCogs)}
              />
              <Metric
                label="COGS variance"
                value={`${fmt(Math.abs(cogs.varianceValue))} (${(cogs.variancePct ?? 0).toFixed(1)}%)`}
                accent={
                  cogs.variancePct !== null && Math.abs(cogs.variancePct) > 5
                }
              />
            </div>
            <div className="grid border-x sm:grid-cols-4">
              <Metric label="Gross margin" value={"\u2014"} />
              <Metric
                label="Opening inventory"
                value={fmt(cogs.openingValue)}
              />
              <Metric label="Purchases" value={fmt(cogs.purchasesValue)} />
              <Metric
                label="Closing inventory"
                value={fmt(cogs.closingValue)}
              />
            </div>
            <div className="mt-8 grid gap-px border bg-[var(--line)] sm:grid-cols-2">
              <WorkspaceLink
                href="/financial-health/menu-profitability"
                title="Menu profitability"
                detail="Per-item sales, cost, and contribution margin."
              />
              <WorkspaceLink
                href="/periods/new"
                title="New inventory period"
                detail="Create a period for the next close cycle."
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`border-b bg-[var(--surface)] p-5 sm:border-r sm:last:border-r-0 ${
        accent ? "bg-[#fff4eb]" : ""
      }`}
    >
      <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--muted)] uppercase">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{value}</p>
    </div>
  );
}

function Signal({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="border bg-[var(--surface-strong)] p-6">
      <p
        className="font-mono text-[9px] tracking-[0.13em] uppercase"
        style={{ color }}
      >
        {label}
      </p>
      <p className="mt-5 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function WorkspaceLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link href={href} className="bg-white p-5 hover:bg-[#f8f1ea]">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</p>
    </Link>
  );
}
