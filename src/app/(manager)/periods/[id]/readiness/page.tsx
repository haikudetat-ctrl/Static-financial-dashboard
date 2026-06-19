import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { checkCloseReadiness } from "@/lib/reporting/readiness";
import { getCogsForPeriod, getVarianceByItem } from "@/lib/reporting/queries";
import { createClient } from "@/lib/supabase/server";
import { closePeriodAction } from "./actions";

export const metadata: Metadata = { title: "Period readiness" };

const severityColor: Record<string, string> = {
  blocking: "bg-[#a63f2f]",
  incomplete: "bg-[#b77a22]",
  estimated: "bg-[#3f6d55]",
  info: "bg-[var(--muted)]",
};

export default async function PeriodReadinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getUserContext();
  if (!context?.organizationId) notFound();
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) notFound();

  const supabase = await createClient();
  const { data: period } = await supabase
    .from("inventory_periods")
    .select("id, period_start, period_end, status, closed_at")
    .eq("id", id)
    .single();
  if (!period) notFound();

  const checks = await checkCloseReadiness(
    context.organizationId,
    locationId,
    id,
  );
  const blocking = checks.filter(
    (c) => c.severity === "blocking" && !c.pass,
  ).length;
  const cogs = period.status === "closed" ? await getCogsForPeriod(id) : null;
  const variances =
    period.status === "closed" ? await getVarianceByItem(id, 20) : [];

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Period · {period.period_start} – {period.period_end}
        </p>
        <div className="mt-2 flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em]">
              {period.status === "closed"
                ? "Period is closed."
                : period.status === "reopened"
                  ? "Period was reopened."
                  : "Ready to close?"}
            </h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Status: {period.status.replace(/_/g, " ")}
              {period.closed_at &&
                ` · closed ${new Date(period.closed_at).toLocaleDateString()}`}
            </p>
          </div>
          {period.status === "reopened" && context.role === "manager" && (
            <form action={closePeriodAction.bind(null, id)}>
              <button className="min-h-12 bg-[var(--foreground)] px-6 text-sm font-semibold text-white">
                Re-close period
              </button>
            </form>
          )}
          {context.role === "manager" &&
            blocking === 0 &&
            !["closed", "close_in_progress", "reopened"].includes(
              period.status,
            ) && (
              <form action={closePeriodAction.bind(null, id)}>
                <button className="min-h-12 bg-[var(--foreground)] px-6 text-sm font-semibold text-white">
                  Execute close
                </button>
              </form>
            )}
        </div>

        {!["closed", "reopened"].includes(period.status) && (
          <>
            <div className="mt-7 grid gap-3">
              <h2 className="text-lg font-semibold">Readiness checklist</h2>
              {checks.map((check) => (
                <div
                  key={check.label}
                  className="flex items-start gap-4 border bg-white p-4"
                >
                  <span
                    className={`mt-0.5 min-h-5 min-w-5 rounded-full ${
                      check.pass
                        ? "bg-[#3f6d55]"
                        : (severityColor[check.severity] ?? "bg-[var(--muted)]")
                    } flex items-center justify-center text-[10px] text-white`}
                  >
                    {check.pass ? "\u2713" : "!"}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold">{check.label}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {check.detail}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] tracking-[0.1em] uppercase">
                    {check.severity}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {cogs && (
          <div className="mt-7">
            <h2 className="text-lg font-semibold">COGS result</h2>
            <div className="mt-3 grid border-x sm:grid-cols-4">
              <div className="border-b bg-[var(--surface)] p-4 sm:border-r">
                <p className="font-mono text-[10px] tracking-[0.13em] text-[var(--muted)] uppercase">
                  Actual COGS
                </p>
                <p className="mt-2 text-xl font-semibold">
                  ${cogs.actualCogs.toFixed(2)}
                </p>
              </div>
              <div className="border-b bg-[var(--surface)] p-4 sm:border-r">
                <p className="font-mono text-[10px] tracking-[0.13em] text-[var(--muted)] uppercase">
                  Theoretical COGS
                </p>
                <p className="mt-2 text-xl font-semibold">
                  ${cogs.theoreticalCogs.toFixed(2)}
                </p>
              </div>
              <div className="border-b bg-[var(--surface)] p-4 sm:border-r">
                <p className="font-mono text-[10px] tracking-[0.13em] text-[var(--muted)] uppercase">
                  Variance
                </p>
                <p className="mt-2 text-xl font-semibold">
                  ${cogs.varianceValue.toFixed(2)} (
                  {cogs.variancePct?.toFixed(1)}%)
                </p>
              </div>
              <div className="border-b bg-[var(--surface)] p-4">
                <p className="font-mono text-[10px] tracking-[0.13em] text-[var(--muted)] uppercase">
                  Known loss
                </p>
                <p className="mt-2 text-xl font-semibold">
                  ${cogs.knownLoss.toFixed(2)}
                </p>
              </div>
            </div>

            {variances.length > 0 && (
              <>
                <h2 className="mt-8 text-lg font-semibold">Variance by item</h2>
                <div className="mt-3 overflow-x-auto border">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
                      <tr>
                        <th className="p-3">Item</th>
                        <th className="p-3 text-right">Actual usage</th>
                        <th className="p-3 text-right">Actual cost</th>
                        <th className="p-3 text-right">Theoretical usage</th>
                        <th className="p-3 text-right">Theoretical cost</th>
                        <th className="p-3 text-right">Variance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variances.map((v) => (
                        <tr
                          key={v.inventory_item_id}
                          className="border-b bg-white"
                        >
                          <td className="p-3 font-semibold">
                            {v.inventory_item_id}
                          </td>
                          <td className="p-3 text-right">
                            {Number(v.actual_usage).toFixed(3)}
                          </td>
                          <td className="p-3 text-right">
                            ${Number(v.actual_cost).toFixed(2)}
                          </td>
                          <td className="p-3 text-right">
                            {Number(v.theoretical_usage).toFixed(3)}
                          </td>
                          <td className="p-3 text-right">
                            ${Number(v.theoretical_cost).toFixed(2)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {v.variance_pct !== null
                              ? `${Number(v.variance_pct).toFixed(1)}%`
                              : "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
