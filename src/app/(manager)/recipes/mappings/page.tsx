import type { Metadata } from "next";

import { mapToastItemAction } from "@/app/(manager)/recipes/actions";
import { getUserContext } from "@/lib/auth/session";
import { getToastMappingQueue } from "@/lib/recipes/queries";

export const metadata: Metadata = { title: "Toast recipe mappings" };

export default async function RecipeMappingsPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const workspace = await getToastMappingQueue(context.organizationId);

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Recipes · Toast mappings
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Map the durable GUID, not the display name.
        </h1>
        <div className="mt-7 grid gap-4">
          {workspace.queue.map((item) => (
            <form
              key={item.guid}
              action={mapToastItemAction}
              className="grid gap-3 border bg-white p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            >
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                  {item.guid}
                </p>
                <input
                  type="hidden"
                  name="external_item_guid"
                  value={item.guid}
                />
                <input
                  type="hidden"
                  name="external_item_name"
                  value={item.name}
                />
              </div>
              <select
                name="recipe_id"
                required
                className="border bg-white px-3 py-3 text-sm"
              >
                <option value="">Choose menu recipe</option>
                {workspace.recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </select>
              <button className="min-h-11 bg-[var(--foreground)] px-5 text-sm font-semibold text-white">
                Map
              </button>
            </form>
          ))}
          {workspace.queue.length === 0 && (
            <div className="border bg-white p-7 text-sm text-[var(--muted)]">
              No staged Toast items require recipe mapping.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
