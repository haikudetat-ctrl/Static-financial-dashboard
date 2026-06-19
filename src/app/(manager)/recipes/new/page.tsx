import type { Metadata } from "next";

import { createRecipeAction } from "@/app/(manager)/recipes/actions";
import { getUserContext } from "@/lib/auth/session";
import { getRecipeSetup } from "@/lib/recipes/queries";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewRecipePage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const setup = await getRecipeSetup(context.organizationId);

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Recipes · new
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Start with one honest version.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Create the recipe, its output yield, and the first component. Add
          remaining components before activation.
        </p>
        <form
          action={createRecipeAction}
          className="mt-7 grid gap-4 border bg-white p-6"
        >
          <input
            name="name"
            required
            className="border px-3 py-3 text-sm"
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
              className="border bg-white px-3 py-3 text-sm"
              defaultValue="menu_item"
            >
              <option value="menu_item">Menu item</option>
              <option value="prep">Prep</option>
              <option value="batch">Batch</option>
            </select>
            <select
              name="output_inventory_item_id"
              className="border bg-white px-3 py-3 text-sm"
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
              className="border px-3 py-3 text-sm"
            />
            <input
              name="output_quantity"
              required
              type="number"
              min="0.000001"
              step="0.000001"
              className="border px-3 py-3 text-sm"
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
                className="border bg-white px-3 py-3 text-sm"
                defaultValue="inventory"
              >
                <option value="inventory">Purchased/produced item</option>
                <option value="recipe">Nested recipe</option>
              </select>
              <select
                name="component_id"
                required
                className="border bg-white px-3 py-3 text-sm"
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
                className="border px-3 py-3 text-sm"
                placeholder="Component quantity"
              />
              <select
                name="component_unit_id"
                required
                className="border bg-white px-3 py-3 text-sm"
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
          <button className="min-h-12 bg-[var(--foreground)] px-6 text-sm font-semibold text-white">
            Create draft recipe
          </button>
        </form>
      </div>
    </div>
  );
}
