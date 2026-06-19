import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  ScanSearch,
  Warehouse,
} from "lucide-react";

import { getUserContext } from "@/lib/auth/session";
import {
  getInventorySummary,
  getPrimaryLocation,
} from "@/lib/inventory/queries";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const context = await getUserContext();
  const locationId =
    context?.organizationId &&
    (await getPrimaryLocation(context.organizationId, context.locationId));
  const summary =
    context?.organizationId && locationId
      ? await getInventorySummary(context.organizationId, locationId)
      : {
          inventoryValue: 0,
          negativeCount: 0,
          lastVerifiedAt: null,
          activeCountCount: 0,
        };

  const actions = [
    {
      href: "/inventory/counts/new",
      label: "Start full count",
      detail: "Build assignments in storage walk order.",
      icon: ClipboardCheck,
    },
    {
      href: "/inventory/counts/spot",
      label: "Start spot count",
      detail: "Verify a focused set of storage zones.",
      icon: ScanSearch,
    },
    {
      href: "/inventory/on-hand",
      label: "View on hand",
      detail: "See posted quantity, value, and last movement.",
      icon: Warehouse,
    },
  ];

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Inventory
        </p>
        <div className="mt-3 flex flex-col justify-between gap-5 border-b pb-7 lg:flex-row lg:items-end">
          <div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Physical stock, without the fog.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Counts establish verified truth. Posted movements carry the
              projection forward without rewriting history.
            </p>
          </div>
          <div className="font-mono text-xs text-[var(--muted)]">
            {summary.activeCountCount} active count
            {summary.activeCountCount === 1 ? "" : "s"}
          </div>
        </div>

        <div className="grid border-x sm:grid-cols-3">
          <Metric
            label="Inventory value"
            value={summary.inventoryValue.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          />
          <Metric
            label="Last verified"
            value={
              summary.lastVerifiedAt
                ? new Date(summary.lastVerifiedAt).toLocaleDateString()
                : "Never"
            }
          />
          <Metric
            label="Negative items"
            value={String(summary.negativeCount)}
          />
        </div>

        <div className="mt-8 grid gap-px border bg-[var(--line)] sm:grid-cols-3">
          {actions.map(({ href, label, detail, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group bg-[var(--surface-strong)] p-6 transition hover:bg-[#f8f1ea]"
            >
              <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
              <h2 className="mt-8 text-xl font-semibold tracking-[-0.025em]">
                {label}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {detail}
              </p>
              <ArrowRight
                className="mt-7 transition group-hover:translate-x-1"
                size={18}
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b bg-[var(--surface)] p-5 sm:border-r sm:last:border-r-0">
      <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--muted)] uppercase">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{value}</p>
    </div>
  );
}
