import type { Metadata } from "next";

import { SectionNav } from "@/components/layout/section-nav";
import {
  ButtonLink,
  PageBody,
  PageHeader,
  StatGrid,
  StatTile,
} from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { loadRecipeCatalog } from "@/lib/recipes/cost-book";
import { DISPLAY_UNIT, SPEC_UNITS } from "@/lib/recipes/units";

import { IngredientTable, type IngredientRow } from "./ingredient-table";

export const metadata: Metadata = { title: "Ingredients" };

export default async function IngredientsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const { view } = await searchParams;
  const catalog = await loadRecipeCatalog(context.organizationId, locationId);

  // Which active recipes use each item directly.
  const usedBy = new Map<string, string[]>();
  for (const recipe of catalog.recipes) {
    if (!recipe.active || !recipe.version) continue;
    for (const component of recipe.version.components) {
      if (component.kind !== "inventory") continue;
      const list = usedBy.get(component.refId) ?? [];
      if (!list.includes(recipe.name)) list.push(recipe.name);
      usedBy.set(component.refId, list);
    }
  }

  const unitFor = (unitType: string) =>
    catalog.units.find((unit) => unit.abbreviation === DISPLAY_UNIT[unitType]);

  const rows: IngredientRow[] = catalog.items
    .filter((item) => item.active || usedBy.has(item.id))
    .map((item) => {
      const cost = catalog.book.itemCost(item.id);
      const display = unitFor(item.unitType);
      const countUnit = item.countUnitId
        ? catalog.unitById.get(item.countUnitId)
        : undefined;
      const packUnit =
        countUnit &&
        countUnit.factor !== 1 &&
        countUnit.factor !== display?.factor
          ? countUnit
          : undefined;
      // Units offered when typing a price: spec units plus the item's own
      // count and purchase units ("750 ml bottle", "case").
      const priceUnits = catalog.units
        .filter(
          (unit) =>
            unit.unitType === item.unitType &&
            (SPEC_UNITS.has(unit.abbreviation.toLowerCase()) ||
              unit.id === item.countUnitId ||
              unit.id === item.purchaseUnitId),
        )
        .sort((a, b) =>
          a.id === item.countUnitId ? -1 : b.id === item.countUnitId ? 1 : 0,
        )
        .map((unit) => ({
          id: unit.id,
          abbreviation: unit.abbreviation,
          factor: unit.factor,
        }));
      const recipes = usedBy.get(item.id) ?? [];
      return {
        id: item.id,
        name: item.name,
        code: item.itemCode,
        category: item.category,
        cogsClass: item.cogsClass,
        isProduced: item.isProduced,
        unitCost: cost.unitCost,
        source: cost.source,
        display: display
          ? { abbreviation: display.abbreviation, factor: display.factor }
          : null,
        pack: packUnit
          ? { abbreviation: packUnit.abbreviation, factor: packUnit.factor }
          : null,
        priceUnits,
        usedIn: recipes,
        outputRecipeId: item.outputRecipeId,
        hasManualCost: item.standardCostSource === "manual",
        lastPurchase: item.lastPurchase,
      };
    });

  const missing = rows.filter((row) => row.unitCost === null);
  const missingUsed = missing.filter((row) => row.usedIn.length > 0);
  const manual = rows.filter((row) => row.source === "manual");

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Recipes", href: "/recipes" }]}
        title="Ingredients"
        description="Every inventory item with its current cost and where that cost comes from"
        actions={
          <ButtonLink href="/recipes/new?type=prep">New prep recipe</ButtonLink>
        }
      />
      <SectionNav section="recipes" active="/recipes/ingredients" />
      <PageBody>
        <StatGrid>
          <StatTile label="Ingredients" value={rows.length} />
          <StatTile
            label="Costed"
            value={rows.length - missing.length}
            detail={`${Math.round(((rows.length - missing.length) / Math.max(rows.length, 1)) * 100)}% of items`}
            tone="good"
          />
          <StatTile
            label="Need a cost"
            value={missing.length}
            detail={`${missingUsed.length} used in recipes`}
            tone={missingUsed.length > 0 ? "warning" : "neutral"}
          />
          <StatTile
            label="Set by hand"
            value={manual.length}
            detail="Override period and invoice costs"
          />
        </StatGrid>
        <IngredientTable
          rows={rows}
          initialView={
            view === "all" || view === "used" || view === "house"
              ? view
              : missing.length > 0
                ? "missing"
                : "used"
          }
        />
      </PageBody>
    </>
  );
}
