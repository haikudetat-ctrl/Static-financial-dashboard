import type { Metadata } from "next";

import { PageBody, PageHeader } from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { localToday } from "@/lib/inventory/count-period";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { loadRecipeCatalog } from "@/lib/recipes/cost-book";

import { buildEditorData } from "../editor-data";
import { RecipeEditor, type EditorRecipe } from "../recipe-editor";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const { type } = await searchParams;
  const catalog = await loadRecipeCatalog(context.organizationId, locationId);
  const recipeType =
    type === "batch" || type === "prep" ? type : ("menu_item" as const);
  const ml = catalog.units.find((unit) => unit.abbreviation === "ml");

  const recipe: EditorRecipe = {
    id: null,
    name: "",
    description: "",
    recipeType,
    menuPrice: null,
    outputQuantity: recipeType === "menu_item" ? 1 : 1000,
    outputUnitId: recipeType === "menu_item" ? "" : (ml?.id ?? ""),
    outputItemId: null,
    yieldIsApproximate: false,
    notes: "",
    versionNumber: null,
    versionEffectiveFrom: null,
    lines: [],
  };
  const data = buildEditorData(catalog, recipe);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Recipes", href: "/recipes" }]}
        title="New recipe"
        description="Costs update as you build the spec."
      />
      <PageBody>
        <RecipeEditor recipe={recipe} today={localToday()} {...data} />
      </PageBody>
    </>
  );
}
