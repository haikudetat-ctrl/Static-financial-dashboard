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
  TableScroll,
  Tabs,
  formatMoney,
  formatPercent,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { loadRecipeCatalog } from "@/lib/recipes/cost-book";
import { getRecipeWorkspace } from "@/lib/recipes/queries";

import { RecipeSearch } from "./recipe-search";

export const metadata: Metadata = { title: "Recipes" };

const FILTERS = [
  { key: "menu_item", label: "Cocktails" },
  { key: "batch", label: "Batches" },
  { key: "prep", label: "Preps" },
  { key: "all", label: "All" },
  { key: "archived", label: "Archived" },
];

const TYPE_LABEL: Record<string, string> = {
  menu_item: "Cocktail",
  batch: "Batch",
  prep: "Prep",
};

/** Above this pour cost a cocktail is flagged. */
const TARGET_COST = 0.22;

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const { type = "menu_item", q = "" } = await searchParams;
  const [catalog, workspace] = await Promise.all([
    loadRecipeCatalog(context.organizationId, locationId),
    getRecipeWorkspace(context.organizationId, locationId),
  ]);

  const rows = catalog.recipes.map((recipe) => {
    const cost = catalog.book.recipeCost(recipe.id);
    const outputUnit = recipe.version
      ? catalog.unitById.get(recipe.version.outputUnitId)
      : undefined;
    const display =
      outputUnit &&
      catalog.units.find(
        (unit) =>
          unit.abbreviation ===
          (
            { volume: "fl oz", weight: "oz", each: "ea" } as Record<
              string,
              string
            >
          )[outputUnit.unitType],
      );
    return {
      recipe,
      cost,
      costPct:
        recipe.menuPrice && recipe.menuPrice > 0
          ? cost.totalCost / recipe.menuPrice
          : null,
      perUnit:
        cost.costPerOutputBase !== null && display
          ? {
              value: cost.costPerOutputBase * display.factor,
              unit: display.abbreviation,
            }
          : null,
    };
  });

  const term = q.trim().toLowerCase();
  const visible = rows
    .filter(({ recipe }) =>
      type === "archived"
        ? !recipe.active
        : recipe.active && (type === "all" || recipe.recipeType === type),
    )
    .filter(({ recipe }) => !term || recipe.name.toLowerCase().includes(term));

  const cocktails = rows.filter(
    ({ recipe }) => recipe.active && recipe.recipeType === "menu_item",
  );
  const priced = cocktails.filter((row) => row.costPct !== null);
  const avgCostPct = priced.length
    ? priced.reduce((sum, row) => sum + (row.costPct ?? 0), 0) / priced.length
    : null;
  const withMissing = rows.filter(
    ({ recipe, cost }) => recipe.active && cost.missingCount > 0,
  ).length;

  return (
    <>
      <PageHeader
        title="Recipes"
        description="Specs and batches, costed from current ingredient prices"
        actions={
          <>
            <ButtonLink href="/recipes/new?type=batch">New batch</ButtonLink>
            <ButtonLink href="/recipes/new" variant="primary">
              New cocktail
            </ButtonLink>
          </>
        }
      />
      <SectionNav section="recipes" active="/recipes" />
      <PageBody>
        <StatGrid>
          <StatTile
            label="Cocktails"
            value={cocktails.length}
            detail={`${rows.filter(({ recipe }) => recipe.active && recipe.recipeType !== "menu_item").length} batches and preps`}
          />
          <StatTile
            label="Average pour cost"
            value={formatPercent(avgCostPct)}
            detail={
              priced.length
                ? `Across ${priced.length} cocktails with a menu price`
                : "Add menu prices to see pour cost"
            }
          />
          <StatTile
            label="Missing ingredient costs"
            value={withMissing}
            tone={withMissing > 0 ? "warning" : "good"}
            detail="Recipes with an uncosted ingredient"
          />
          <StatTile
            label="Unmapped Toast items"
            value={workspace.missingMappingCount}
            tone={workspace.missingMappingCount > 0 ? "warning" : "neutral"}
            href="/recipes/mappings"
          />
        </StatGrid>

        <Panel flush>
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-2">
            <Tabs
              items={FILTERS.map((filter) => ({
                label: filter.label,
                href: `/recipes?type=${filter.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
                active: type === filter.key,
              }))}
            />
            <div className="pb-2">
              <RecipeSearch initial={q} />
            </div>
          </div>
          {visible.length === 0 ? (
            <EmptyState
              title={term ? `No recipes match “${q}”` : "No recipes here yet"}
              action={
                <ButtonLink href="/recipes/new" variant="primary">
                  New cocktail
                </ButtonLink>
              }
            />
          ) : (
            <TableScroll>
              <table className={`${tableClass} min-w-[640px]`}>
                <thead>
                  <tr>
                    <th className={thClass}>Recipe</th>
                    <th className={thClass}>Type</th>
                    <th className={thNumClass}>Cost</th>
                    <th className={thNumClass}>Price</th>
                    <th className={thNumClass}>Pour cost</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ recipe, cost, costPct, perUnit }) => (
                    <tr key={recipe.id} className="hover:bg-[var(--surface)]">
                      <td className={tdClass}>
                        <Link
                          href={`/recipes/${recipe.id}`}
                          className="font-medium hover:underline"
                        >
                          {recipe.name}
                        </Link>
                        {cost.missingCount > 0 && (
                          <span className="ml-2">
                            <Badge tone="warning">
                              {cost.missingCount} uncosted
                            </Badge>
                          </span>
                        )}
                      </td>
                      <td className={`${tdClass} text-[var(--muted)]`}>
                        {TYPE_LABEL[recipe.recipeType] ?? recipe.recipeType}
                      </td>
                      <td className={tdNumClass}>
                        {recipe.recipeType === "menu_item" || !perUnit
                          ? formatMoney(cost.totalCost)
                          : `${formatMoney(perUnit.value)} / ${perUnit.unit}`}
                      </td>
                      <td className={tdNumClass}>
                        {recipe.menuPrice === null
                          ? "—"
                          : formatMoney(recipe.menuPrice)}
                      </td>
                      <td
                        className={`${tdNumClass} ${
                          costPct !== null && costPct > TARGET_COST
                            ? "font-semibold text-[var(--danger)]"
                            : ""
                        }`}
                      >
                        {formatPercent(costPct)}
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
