import type { Metadata } from "next";

import { SectionNav } from "@/components/layout/section-nav";
import {
  EmptyState,
  PageBody,
  PageHeader,
  Panel,
  StatGrid,
  StatTile,
  Tabs,
  buttonClass,
} from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getPriceChanges } from "@/lib/purchasing/price-changes";

import { reviewPriceChangesAction } from "./actions";
import { PriceChangeRow, signedMoney } from "./price-change-row";

export const metadata: Metadata = { title: "Price changes" };

export default async function PriceChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const { show } = await searchParams;
  const showAll = show === "all";
  const changes = await getPriceChanges(context.organizationId, locationId, {
    includeClosed: showAll,
  });
  const open = changes.filter((change) => change.status === "open");
  const increases = open.filter((change) => change.direction === "up");
  const drinksHit = new Set(
    increases.flatMap((change) => change.drinks.map((drink) => drink.recipeId)),
  );
  const monthly = open.reduce((sum, change) => sum + change.monthlyImpact, 0);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Purchasing", href: "/purchasing" }]}
        title="Price changes"
        description="Invoice prices that moved 5% or more since the last purchase"
        actions={
          open.length > 0 && (
            <form action={reviewPriceChangesAction}>
              <button type="submit" className={buttonClass("secondary")}>
                Mark all reviewed
              </button>
            </form>
          )
        }
      />
      <SectionNav section="purchasing" active="/purchasing/price-changes" />
      <PageBody>
        <StatGrid>
          <StatTile
            label="To review"
            value={open.length}
            tone={open.length > 0 ? "warning" : "good"}
          />
          <StatTile
            label="Price increases"
            value={increases.length}
            detail={`${open.length - increases.length} decreases`}
            tone={increases.length > 0 ? "danger" : "neutral"}
          />
          <StatTile
            label="Drinks affected"
            value={drinksHit.size}
            detail="By the increases above"
          />
          <StatTile
            label="Monthly cost impact"
            value={signedMoney(monthly, false)}
            detail="At the last 28 days of sales"
            tone={monthly > 0 ? "danger" : "neutral"}
          />
        </StatGrid>

        <Panel flush>
          <div className="px-4 pt-2">
            <Tabs
              items={[
                {
                  label: "To review",
                  href: "/purchasing/price-changes",
                  active: !showAll,
                },
                {
                  label: "History",
                  href: "/purchasing/price-changes?show=all",
                  active: showAll,
                },
              ]}
            />
          </div>
          {changes.length === 0 ? (
            <EmptyState
              title={showAll ? "No price changes yet" : "Nothing to review"}
              detail="When a posted invoice prices an item 5% or more above or below its last purchase, it shows up here with the drinks it affects."
            />
          ) : (
            <ul>
              {changes.map((change) => (
                <PriceChangeRow key={change.id} change={change} />
              ))}
            </ul>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
