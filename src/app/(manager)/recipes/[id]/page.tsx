import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  activateRecipeVersionAction,
  addRecipeComponentAction,
  createRecipeVersionAction,
} from "@/app/(manager)/recipes/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import {
  getRecipeCurrentCost,
  getRecipeDetail,
  getRecipeSetup,
  relatedName,
} from "@/lib/recipes/queries";

export const metadata: Metadata = { title: "Recipe detail" };

function relatedUnit(
  value:
    | { name: string; abbreviation: string }
    | { name: string; abbreviation: string }[]
    | null,
) {
  return (Array.isArray(value) ? value[0] : value)?.abbreviation ?? "";
}

export default async function RecipeDetailPage({
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
  const [detail, setup, currentCost] = await Promise.all([
    getRecipeDetail(context.organizationId, id),
    getRecipeSetup(context.organizationId),
    getRecipeCurrentCost(context.organizationId, locationId, id),
  ]);
  if (!detail) notFound();
  const draftVersion = detail.versions.find(
    (version) => version.status === "draft",
  );

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Recipe · {detail.recipe.recipe_type.replace("_", " ")}
        </p>
        <div className="mt-2 flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em]">
              {detail.recipe.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
              {detail.recipe.description || "No recipe description."}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">
              {currentCost.cost.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </p>
            <Link
              href={`/recipes/${id}/cost`}
              className="mt-1 block text-xs text-[var(--muted)] underline underline-offset-4"
            >
              Cost breakdown
            </Link>
          </div>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section className="grid gap-5">
            {detail.versions.map((version) => {
              const unit = setup.units.find(
                (candidate) => candidate.id === version.output_unit_id,
              );
              const components = detail.components.filter(
                (component) => component.recipe_version_id === version.id,
              );
              return (
                <article key={version.id} className="border bg-white">
                  <header className="flex items-center justify-between border-b p-4">
                    <div>
                      <h2 className="font-semibold">
                        Version {version.version_number}
                      </h2>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {version.effective_from} →{" "}
                        {version.effective_to ?? "open"} ·{" "}
                        {Number(version.output_quantity)} {unit?.abbreviation}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase">
                      {version.status}
                    </span>
                  </header>
                  <div className="divide-y">
                    {components.map((component) => (
                      <div
                        key={component.id}
                        className="flex items-center justify-between gap-4 p-4 text-sm"
                      >
                        <span>
                          {relatedName(component.inventory_items) ||
                            relatedName(component.recipes)}
                        </span>
                        <span className="font-mono text-xs">
                          {Number(component.quantity)}{" "}
                          {relatedUnit(component.units)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {version.status === "draft" && (
                    <form
                      action={activateRecipeVersionAction.bind(
                        null,
                        id,
                        version.id,
                      )}
                      className="border-t p-4"
                    >
                      <button className="min-h-11 bg-[var(--foreground)] px-5 text-sm font-semibold text-white">
                        Activate version
                      </button>
                    </form>
                  )}
                </article>
              );
            })}
          </section>

          <aside className="grid content-start gap-6">
            {draftVersion && (
              <form
                action={addRecipeComponentAction.bind(
                  null,
                  id,
                  draftVersion.id,
                )}
                className="grid gap-3 border bg-white p-5"
              >
                <h2 className="font-semibold">
                  Add to draft version {draftVersion.version_number}
                </h2>
                <select
                  name="component_type"
                  className="border bg-white px-3 py-3 text-sm"
                  defaultValue="inventory"
                >
                  <option value="inventory">Inventory item</option>
                  <option value="recipe">Nested recipe</option>
                </select>
                <select
                  name="component_id"
                  required
                  className="border bg-white px-3 py-3 text-sm"
                >
                  <option value="">Choose component</option>
                  <optgroup label="Inventory">
                    {setup.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Recipes">
                    {setup.recipes
                      .filter((recipe) => recipe.id !== id)
                      .map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>
                          {recipe.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
                <input
                  name="component_quantity"
                  required
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  className="border px-3 py-3 text-sm"
                  placeholder="Quantity"
                />
                <select
                  name="component_unit_id"
                  required
                  className="border bg-white px-3 py-3 text-sm"
                >
                  <option value="">Unit</option>
                  {setup.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
                <button className="min-h-11 border-2 border-[var(--foreground)] px-4 text-sm font-semibold">
                  Add component
                </button>
              </form>
            )}

            <form
              action={createRecipeVersionAction.bind(null, id)}
              className="grid gap-3 border bg-[var(--surface)] p-5"
            >
              <h2 className="font-semibold">Start a new version</h2>
              <input
                name="effective_from"
                required
                type="date"
                className="border bg-white px-3 py-3 text-sm"
              />
              <input
                name="output_quantity"
                required
                type="number"
                min="0.000001"
                step="0.000001"
                className="border bg-white px-3 py-3 text-sm"
                placeholder="Output quantity"
              />
              <select
                name="output_unit_id"
                required
                className="border bg-white px-3 py-3 text-sm"
              >
                <option value="">Output unit</option>
                {setup.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <button className="min-h-11 border px-4 text-sm font-semibold">
                Create draft version
              </button>
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}
