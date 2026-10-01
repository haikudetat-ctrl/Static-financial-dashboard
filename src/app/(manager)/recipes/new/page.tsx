import type { Metadata } from "next";

import { createRecipeAction } from "@/app/(manager)/recipes/actions";
import { getUserContext } from "@/lib/auth/session";
import { getRecipeSetup } from "@/lib/recipes/queries";
import { PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipePage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const setup = await getRecipeSetup(context.organizationId);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Recipes", href: "/recipes" }]}
        title="New recipe"
        description={
          <>
            Create the recipe, its output yield, and the first component. Add
            remaining components before activation.
          </>
        }
      />
      <PageBody narrow>
        <form
          action={createRecipeAction}
          className="mt-7 grid gap-4 border bg-white p-6"
        >
          <input
            name="name"
            required
            className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            placeholder="Recipe name"
          />
          <textarea
            name="description"
            className="min-h-24 border px-3 py-3 text-sm"
            placeholder="Description"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <select
              name="recipe_type"
              className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              defaultValue="menu_item"
            >
              <option value="menu_item">Menu item</option>
              <option value="prep">Prep</option>
              <option value="batch">Batch</option>
            </select>
            <select
              name="output_inventory_item_id"
              className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">No produced output item</option>
              {setup.items
                .filter((item) => item.is_produced)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <input
              name="effective_from"
              required
              type="date"
              className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
            <input
              name="output_quantity"
              required
              type="number"
              min="0.000001"
              step="0.000001"
              className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              placeholder="Output quantity"
            />
            <select
              name="output_unit_id"
              required
              className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Output unit</option>
              {setup.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="yield_is_approximate" />
            Mark output yield as estimated
          </label>
          <div className="border-t pt-4">
            <p className="text-sm font-semibold">First component</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select
                name="component_type"
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                defaultValue="inventory"
              >
                <option value="inventory">Purchased/produced item</option>
                <option value="recipe">Nested recipe</option>
              </select>
              <select
                name="component_id"
                required
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Choose item or recipe</option>
                <optgroup label="Inventory items">
                  {setup.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Recipes">
                  {setup.recipes.map((recipe) => (
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
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                placeholder="Component quantity"
              />
              <select
                name="component_unit_id"
                required
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Component unit</option>
                {setup.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 text-sm font-medium text-white transition hover:bg-[#343a32] disabled:cursor-not-allowed disabled:opacity-50">
            Create draft recipe
          </button>
        </form>
      </PageBody>
    </>
  );
}
