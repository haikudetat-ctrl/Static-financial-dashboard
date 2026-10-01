import type { Metadata } from "next";

import {
  Badge,
  ButtonLink,
  Callout,
  EmptyState,
  PageBody,
  Panel,
  StatGrid,
  StatTile,
  TableScroll,
  formatMoney,
  formatPercent,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { getRecipeCurrentCost } from "@/lib/recipes/queries";
import { getMenuProfitability } from "@/lib/reporting/queries";

import {
  FinancialsHeader,
  loadFinancialsContext,
  type FinancialsSearchParams,
} from "../financials-context";

export const metadata: Metadata = { title: "Menu profitability" };

export default async function MenuProfitabilityPage({
  searchParams,
}: {
  searchParams: FinancialsSearchParams;
}) {
  const loaded = await loadFinancialsContext(searchParams);
  if (!loaded) return null;
  const { context, locationId, periods, range } = loaded;
  const organizationId = context.organizationId!;
  const { items, mappings } = await getMenuProfitability(
    organizationId,
    locationId,
    range.start,
    range.end,
  );

  const recipeByGuid = new Map(
    mappings.map((mapping) => [mapping.external_item_guid, mapping.recipe_id]),
  );
  const soldRecipeIds = [
    ...new Set(
      items
        .map((item) => recipeByGuid.get(item.itemGuid))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const costs = new Map(
    await Promise.all(
      soldRecipeIds.map(
        async (recipeId) =>
          [
            recipeId,
            (await getRecipeCurrentCost(organizationId, locationId, recipeId))
              .cost,
          ] as const,
      ),
    ),
  );

  const rows = items
    .map((item) => {
      const recipeId = recipeByGuid.get(item.itemGuid);
      const unitCost = recipeId ? (costs.get(recipeId) ?? null) : null;
      const recipeCost = unitCost !== null ? unitCost * item.quantity : null;
      return {
        ...item,
        recipeCost,
        costPct:
          recipeCost !== null && item.netSales > 0
            ? recipeCost / item.netSales
            : null,
        contribution: recipeCost !== null ? item.netSales - recipeCost : null,
      };
    })
    .sort((a, b) => b.netSales - a.netSales);

  const mapped = rows.filter((row) => row.recipeCost !== null);
  const mappedSales = mapped.reduce((sum, row) => sum + row.netSales, 0);
  const mappedCost = mapped.reduce(
    (sum, row) => sum + (row.recipeCost ?? 0),
    0,
  );
  const totalSales = rows.reduce((sum, row) => sum + row.netSales, 0);
  const unmapped = rows.length - mapped.length;

  return (
    <>
      <FinancialsHeader
        title="Menu profitability"
        active="/financial-health/menu-profitability"
        range={range}
        periods={periods}
      />
      <PageBody>
        {unmapped > 0 && (
          <Callout
            tone="warning"
            title={`${unmapped} menu item${unmapped === 1 ? "" : "s"} have no recipe`}
            action={
              <ButtonLink href="/mapping" size="sm">
                Map menu items
              </ButtonLink>
            }
          >
            Their sales count toward revenue, but they carry no theoretical
            cost.
          </Callout>
        )}
        <StatGrid>
          <StatTile label="Net sales" value={formatMoney(totalSales)} />
          <StatTile
            label="Recipe coverage"
            value={formatPercent(
              totalSales ? mappedSales / totalSales : null,
              0,
            )}
            detail={`${mapped.length} of ${rows.length} items mapped`}
          />
          <StatTile
            label="Theoretical cost"
            value={formatPercent(mappedSales ? mappedCost / mappedSales : null)}
            detail="Of sales on mapped items"
          />
          <StatTile
            label="Contribution"
            value={formatMoney(mappedSales - mappedCost)}
            detail="Mapped items, after recipe cost"
          />
        </StatGrid>
        <Panel
          title="Menu items"
          description="Recipe cost uses current ingredient costs."
          flush
        >
          {rows.length === 0 ? (
            <EmptyState
              title="No sales posted in this range"
              detail="Post a Toast export from Imports to see item profitability."
            />
          ) : (
            <TableScroll>
              <table className={`${tableClass} min-w-[760px]`}>
                <thead>
                  <tr>
                    <th className={thClass}>Menu item</th>
                    <th className={thNumClass}>Sold</th>
                    <th className={thNumClass}>Net sales</th>
                    <th className={thNumClass}>Recipe cost</th>
                    <th className={thNumClass}>Cost %</th>
                    <th className={thNumClass}>Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.itemGuid}>
                      <td className={tdClass}>
                        <span className="font-medium">{row.name}</span>
                        {row.recipeCost === null && (
                          <span className="ml-2">
                            <Badge tone="warning">No recipe</Badge>
                          </span>
                        )}
                      </td>
                      <td className={tdNumClass}>{row.quantity}</td>
                      <td className={tdNumClass}>
                        {formatMoney(row.netSales)}
                      </td>
                      <td className={tdNumClass}>
                        {formatMoney(row.recipeCost)}
                      </td>
                      <td className={tdNumClass}>
                        {formatPercent(row.costPct)}
                      </td>
                      <td className={tdNumClass}>
                        {formatMoney(row.contribution)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
