import type { Metadata } from "next";
import Link from "next/link";

import { SectionNav } from "@/components/layout/section-nav";
import {
  Badge,
  ButtonLink,
  EmptyState,
  PageBody,
  PageHeader,
  Panel,
  StatGrid,
  StatTile,
  formatMoney,
} from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { getCountList } from "@/lib/inventory/count-sheet";
import {
  getInventorySummary,
  getPrimaryLocation,
} from "@/lib/inventory/queries";

import { COUNT_STATUS_LABEL, COUNT_STATUS_TONE } from "./counts/status";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const [summary, openCounts] = await Promise.all([
    getInventorySummary(context.organizationId, locationId),
    getCountList(context.organizationId, locationId, { includeClosed: false }),
  ]);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="On-hand value, counts in progress and stock exceptions"
        actions={
          <>
            <ButtonLink href="/inventory/counts/spot">Spot count</ButtonLink>
            <ButtonLink href="/inventory/counts/new" variant="primary">
              Start full count
            </ButtonLink>
          </>
        }
      />
      <SectionNav section="inventory" active="/inventory" />
      <PageBody>
        <StatGrid>
          <StatTile
            label="Inventory value"
            value={formatMoney(summary.inventoryValue, { cents: false })}
            detail="Posted on hand at current cost"
            href="/inventory/on-hand"
          />
          <StatTile
            label="Last verified"
            value={
              summary.lastVerifiedAt
                ? new Date(summary.lastVerifiedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "Never"
            }
            detail="Most recent approved count"
          />
          <StatTile
            label="Counts in progress"
            value={openCounts.length}
            tone={openCounts.length > 0 ? "accent" : "neutral"}
            href="/inventory/counts"
          />
          <StatTile
            label="Negative items"
            value={summary.negativeCount}
            tone={summary.negativeCount > 0 ? "danger" : "neutral"}
            href="/exceptions/negative-inventory"
          />
        </StatGrid>

        <Panel
          title="Counts in progress"
          actions={
            <Link
              href="/inventory/counts"
              className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
            >
              All counts
            </Link>
          }
          flush
        >
          {openCounts.length === 0 ? (
            <EmptyState
              title="No count in progress"
              detail="Start a full count for the period's opening or closing inventory, or a spot count to check a few areas."
              action={
                <ButtonLink href="/inventory/counts/new" variant="primary">
                  Start full count
                </ButtonLink>
              }
            />
          ) : (
            <ul>
              {openCounts.map((count) => {
                const pct = count.totalLines
                  ? count.countedLines / count.totalLines
                  : 0;
                const href =
                  count.status === "counted"
                    ? `/inventory/counts/${count.id}/review`
                    : `/inventory/counts/${count.id}`;
                return (
                  <li
                    key={count.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {count.countType === "full" ? "Full" : "Spot"} count
                        <span className="ml-2 font-normal text-[var(--muted)]">
                          {count.periodLabel}
                        </span>
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--line)]">
                          <div
                            className="h-full rounded-full bg-[var(--success)]"
                            style={{ width: `${pct * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-[var(--muted)] tabular-nums">
                          {count.countedLines} of {count.totalLines} items ·{" "}
                          {count.areas} areas
                        </span>
                      </div>
                    </div>
                    <Badge tone={COUNT_STATUS_TONE[count.status] ?? "neutral"}>
                      {COUNT_STATUS_LABEL[count.status] ?? count.status}
                    </Badge>
                    <ButtonLink href={href} size="sm" variant="primary">
                      {count.status === "counted"
                        ? "Review"
                        : count.countedLines > 0
                          ? "Continue"
                          : "Enter counts"}
                    </ButtonLink>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
