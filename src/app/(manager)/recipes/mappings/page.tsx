import type { Metadata } from "next";

import { mapToastItemAction } from "@/app/(manager)/recipes/actions";
import { getUserContext } from "@/lib/auth/session";
import { getToastMappingQueue } from "@/lib/recipes/queries";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Toast recipe mappings" };

export default async function RecipeMappingsPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const workspace = await getToastMappingQueue(context.organizationId);

  return (
    <>
      <PageHeader
        title="Menu mappings"
        description="Toast menu items mapped to recipes by GUID"
      />
      <SectionNav section="recipes" active="/recipes/mappings" />
      <PageBody narrow>
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
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Choose menu recipe</option>
                {workspace.recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </select>
              <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 text-sm font-medium text-white transition hover:bg-[#343a32] disabled:cursor-not-allowed disabled:opacity-50">
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
      </PageBody>
    </>
  );
}
