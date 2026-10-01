import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  Badge,
  PageBody,
  PageHeader,
  Panel,
  TableScroll,
  buttonClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { localToday } from "@/lib/inventory/count-period";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { loadRecipeCatalog } from "@/lib/recipes/cost-book";
import { getRecipeDetail } from "@/lib/recipes/queries";

import { setRecipeActiveAction } from "../actions";
import { buildEditorData, editorRecipeFrom } from "../editor-data";
import { RecipeEditor } from "../recipe-editor";

export const metadata: Metadata = { title: "Recipe" };

const TYPE_LABEL: Record<string, string> = {
  menu_item: "Cocktail / menu item",
  batch: "Batch",
  prep: "Prep",
};

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getUserContext();
  if (!context?.organizationId) notFound();
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) notFound();
  const [catalog, detail] = await Promise.all([
    loadRecipeCatalog(context.organizationId, locationId),
    getRecipeDetail(context.organizationId, id),
  ]);
  const recipe = editorRecipeFrom(catalog, id);
  if (!recipe || !detail) notFound();
  const data = buildEditorData(catalog, recipe);
  const active = detail.recipe.active;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Recipes", href: "/recipes" }]}
        title={recipe.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {TYPE_LABEL[recipe.recipeType]}
            {recipe.versionNumber && ` · version ${recipe.versionNumber}`}
            {!active && <Badge>Archived</Badge>}
          </span>
        }
        actions={
          <form action={setRecipeActiveAction.bind(null, id, !active)}>
            <button type="submit" className={buttonClass("ghost")}>
              {active ? "Archive" : "Restore"}
            </button>
          </form>
        }
      />
      <PageBody>
        <RecipeEditor recipe={recipe} today={localToday()} {...data} />

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
            title="Toast menu items"
            description="Sales of these items use this recipe."
            flush
          >
            {detail.mappings.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--muted)]">
                Not mapped to a Toast item yet. Map it under Recipes → Menu
                mappings.
              </p>
            ) : (
              <ul>
                {detail.mappings.map((mapping) => (
                  <li
                    key={mapping.id}
                    className="flex items-center justify-between border-b px-4 py-2.5 text-sm last:border-b-0"
                  >
                    {mapping.external_item_name || mapping.external_item_guid}
                    {!mapping.active && <Badge>Inactive</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Version history" flush>
            <TableScroll>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Version</th>
                    <th className={thClass}>In effect</th>
                    <th className={thClass}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.versions.map((version) => (
                    <tr key={version.id}>
                      <td className={tdClass}>v{version.version_number}</td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {version.effective_from}
                        {" – "}
                        {version.effective_to ?? "now"}
                      </td>
                      <td className={tdClass}>
                        <Badge
                          tone={
                            version.status === "active" ? "good" : "neutral"
                          }
                        >
                          {version.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
