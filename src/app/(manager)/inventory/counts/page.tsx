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
  TableScroll,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { getCountList } from "@/lib/inventory/count-sheet";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { formatRangeLabel } from "@/lib/reporting/period-range";

import { COUNT_STATUS_LABEL, COUNT_STATUS_TONE } from "./status";

export const metadata: Metadata = { title: "Counts" };

export default async function CountsPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const counts = await getCountList(context.organizationId, locationId);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Inventory", href: "/inventory" }]}
        title="Counts"
        description="Enter counts by storage area, then review variances and approve to post."
        actions={
          <>
            <ButtonLink href="/inventory/counts/spot">Spot count</ButtonLink>
            <ButtonLink href="/inventory/counts/new" variant="primary">
              Start full count
            </ButtonLink>
          </>
        }
      />
      <SectionNav section="inventory" active="/inventory/counts" />
      <PageBody>
        <Panel flush>
          {counts.length === 0 ? (
            <EmptyState
              title="No counts yet"
              detail="Start a full count to set opening inventory for the period."
              action={
                <ButtonLink href="/inventory/counts/new" variant="primary">
                  Start full count
                </ButtonLink>
              }
            />
          ) : (
            <TableScroll>
              <table className={`${tableClass} min-w-[720px]`}>
                <thead>
                  <tr>
                    <th className={thClass}>Count</th>
                    <th className={thClass}>Period</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Progress</th>
                    <th className={thNumClass}>Areas</th>
                    <th className={thClass}>Assigned to</th>
                    <th className={thClass}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map((count) => {
                    const pct = count.totalLines
                      ? count.countedLines / count.totalLines
                      : 0;
                    const open = ["draft", "in_progress"].includes(
                      count.status,
                    );
                    return (
                      <tr key={count.id} className="hover:bg-[var(--surface)]">
                        <td className={tdClass}>
                          <Link
                            href={`/inventory/counts/${count.id}`}
                            className="font-medium hover:underline"
                          >
                            {count.countType === "full" ? "Full" : "Spot"} count
                          </Link>
                          <span className="block text-xs text-[var(--muted)]">
                            Started{" "}
                            {new Date(count.createdAt).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" },
                            )}
                          </span>
                        </td>
                        <td className={`${tdClass} whitespace-nowrap`}>
                          {count.periodStart
                            ? formatRangeLabel(
                                count.periodStart,
                                count.periodEnd,
                              )
                            : "—"}
                        </td>
                        <td className={tdClass}>
                          <Badge
                            tone={COUNT_STATUS_TONE[count.status] ?? "neutral"}
                          >
                            {COUNT_STATUS_LABEL[count.status] ?? count.status}
                          </Badge>
                        </td>
                        <td className={tdClass}>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--line)]">
                              <div
                                className="h-full rounded-full bg-[var(--success)]"
                                style={{ width: `${pct * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-[var(--muted)] tabular-nums">
                              {count.countedLines}/{count.totalLines}
                            </span>
                          </div>
                        </td>
                        <td className={tdNumClass}>{count.areas}</td>
                        <td className={`${tdClass} text-[var(--muted)]`}>
                          {count.assigneeName}
                        </td>
                        <td
                          className={`${tdClass} text-right whitespace-nowrap`}
                        >
                          {count.status === "counted" ? (
                            <ButtonLink
                              href={`/inventory/counts/${count.id}/review`}
                              size="sm"
                              variant="primary"
                            >
                              Review
                            </ButtonLink>
                          ) : (
                            <ButtonLink
                              href={`/inventory/counts/${count.id}`}
                              size="sm"
                              variant={open ? "primary" : "secondary"}
                            >
                              {open ? "Enter counts" : "View"}
                            </ButtonLink>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
