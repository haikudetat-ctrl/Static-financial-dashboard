import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  ButtonLink,
  PageBody,
  PageHeader,
  Panel,
  StatGrid,
  StatTile,
  formatMoney,
} from "@/components/ui";

import { SectionNav } from "@/components/layout/section-nav";
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

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`${summary.activeCountCount} active count${summary.activeCountCount === 1 ? "" : "s"}`}
        actions={
          <>
            <ButtonLink href="/inventory/on-hand">On hand</ButtonLink>
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
            label="Negative items"
            value={summary.negativeCount}
            tone={summary.negativeCount > 0 ? "danger" : "neutral"}
            href="/exceptions/negative-inventory"
          />
          <StatTile
            label="Active counts"
            value={summary.activeCountCount}
            tone={summary.activeCountCount > 0 ? "accent" : "neutral"}
          />
        </StatGrid>
        <Panel title="Counting" flush>
          <ul>
            {[
              {
                href: "/inventory/counts/new",
                label: "Full count",
                detail: "Every item, assigned in shelf walk order.",
              },
              {
                href: "/inventory/counts/spot",
                label: "Spot count",
                detail: "Verify a few storage areas between full counts.",
              },
              {
                href: "/inventory/on-hand",
                label: "On hand",
                detail: "Posted quantity, value, and last movement per item.",
              },
            ].map((action) => (
              <li key={action.href} className="border-b last:border-b-0">
                <Link
                  href={action.href}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {action.detail}
                    </p>
                  </div>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 text-[var(--muted)]"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </PageBody>
    </>
  );
}
