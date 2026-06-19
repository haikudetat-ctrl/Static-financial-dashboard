import type { Metadata } from "next";

import { createInventoryPeriodAction } from "./actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getPeriods } from "@/lib/reporting/queries";

export const metadata: Metadata = { title: "New inventory period" };

export default async function NewPeriodPage() {
  const context = await getUserContext();
  if (!context?.organizationId || context.role !== "manager") {
    return <div className="p-8 text-sm">Manager access required.</div>;
  }
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const periods = await getPeriods(context.organizationId, locationId);
  const latestEnd = periods[0]?.periodEnd;
  const suggestedStart = latestEnd
    ? new Date(new Date(latestEnd).getTime() + 86400000)
        .toISOString()
        .slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Inventory periods
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Create a new period.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Each period must start the day after the prior one ends. A closing
          count is required before close.
        </p>
        <form
          action={createInventoryPeriodAction}
          className="mt-8 grid gap-5 border bg-[var(--surface-strong)] p-5 sm:p-7"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Period start
              <input
                name="period_start"
                type="date"
                required
                defaultValue={suggestedStart}
                className="h-12 border bg-white px-3 text-base font-normal"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Period end
              <input
                name="period_end"
                type="date"
                required
                className="h-12 border bg-white px-3 text-base font-normal"
              />
            </label>
          </div>
          <button className="min-h-12 bg-[var(--foreground)] px-5 text-sm font-semibold text-white">
            Create period
          </button>
        </form>

        {periods.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Existing periods</h2>
            <div className="mt-3 grid gap-2">
              {periods.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between border bg-white p-4 text-sm"
                >
                  <span>
                    {p.periodStart}–{p.periodEnd}
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.12em] uppercase">
                    {p.status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
