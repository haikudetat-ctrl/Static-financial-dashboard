import type { Metadata } from "next";

import { createInventoryPeriodAction } from "./actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getPeriods } from "@/lib/reporting/queries";
import { PageBody, PageHeader } from "@/components/ui";

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
    <>
      <PageHeader
        breadcrumbs={[{ label: "Inventory", href: "/inventory" }]}
        title="New period"
        description={
          <>
            Each period must start the day after the prior one ends. A closing
            count is required before close.
          </>
        }
      />
      <PageBody narrow>
        <form
          action={createInventoryPeriodAction}
          className="mt-8 grid gap-5 border bg-[var(--surface-strong)] p-5 sm:p-7"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium">
              Period start
              <input
                name="period_start"
                type="date"
                required
                defaultValue={suggestedStart}
                className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 text-sm font-normal text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Period end
              <input
                name="period_end"
                type="date"
                required
                className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 text-sm font-normal text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
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
      </PageBody>
    </>
  );
}
