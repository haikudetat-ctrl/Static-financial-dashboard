import type { Metadata } from "next";

import { postProductionBatchAction } from "@/app/(staff)/production/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getActiveProductionRecipes, relatedName } from "@/lib/recipes/queries";

export const metadata: Metadata = { title: "Production" };

export default async function ProductionPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const workspace = await getActiveProductionRecipes(
    context.organizationId,
    locationId,
  );

  return (
    <div className="px-4 py-6">
      <div className="mx-auto max-w-xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Prep production
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
          Record what the batch actually yielded.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Posting consumes the active recipe components and creates the produced
          item at equal total value.
        </p>
        <div className="mt-7 grid gap-5">
          {workspace.recipes.map((recipe) => {
            const versions = recipe.recipe_versions as Array<{
              id: string;
              output_quantity: number | string;
              output_unit_id: string;
              units:
                | { name: string; abbreviation: string }
                | { name: string; abbreviation: string }[]
                | null;
              recipe_version_components: Array<{
                id: string;
                quantity: number | string;
                inventory_items: { name: string } | { name: string }[] | null;
                recipes: { name: string } | { name: string }[] | null;
                units:
                  | { name: string; abbreviation: string }
                  | { name: string; abbreviation: string }[]
                  | null;
              }>;
            }>;
            const version = versions[0];
            if (!version) return null;
            const action = postProductionBatchAction.bind(
              null,
              recipe.id,
              version.id,
              version.output_unit_id,
            );
            const outputUnit = Array.isArray(version.units)
              ? version.units[0]
              : version.units;
            return (
              <form key={recipe.id} action={action} className="border bg-white">
                <header className="bg-[var(--foreground)] p-4 text-white">
                  <p className="font-mono text-[10px] tracking-[0.13em] text-[#bdc2bb] uppercase">
                    {recipe.recipe_type}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{recipe.name}</h2>
                </header>
                <div className="p-4">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[var(--muted)] uppercase">
                    Expected components
                  </p>
                  <div className="mt-2 divide-y">
                    {version.recipe_version_components.map((component) => {
                      const unit = Array.isArray(component.units)
                        ? component.units[0]
                        : component.units;
                      return (
                        <div
                          key={component.id}
                          className="flex items-center justify-between py-2 text-sm"
                        >
                          <span>
                            {relatedName(component.inventory_items) ||
                              relatedName(component.recipes)}
                          </span>
                          <span className="font-mono text-xs">
                            {Number(component.quantity)} {unit?.abbreviation}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <input
                      name="planned_output_quantity"
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      defaultValue={Number(version.output_quantity)}
                      className="border px-3 py-3 text-sm"
                      aria-label={`${recipe.name} planned output`}
                    />
                    <input
                      name="actual_output_quantity"
                      required
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      defaultValue={Number(version.output_quantity)}
                      className="border px-3 py-3 text-sm"
                      aria-label={`${recipe.name} actual output`}
                    />
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Output unit: {outputUnit?.name ?? "configured unit"}
                  </p>
                  <input
                    name="notes"
                    className="mt-3 w-full border px-3 py-3 text-sm"
                    placeholder="Batch notes"
                  />
                  <button className="mt-3 min-h-12 w-full border-2 border-[var(--foreground)] px-4 text-sm font-semibold">
                    Confirm and post batch
                  </button>
                </div>
              </form>
            );
          })}
          {workspace.recipes.length === 0 && (
            <div className="border bg-white p-6 text-sm text-[var(--muted)]">
              No active prep or batch recipe is available.
            </div>
          )}
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Recent batches</h2>
          <div className="mt-3 grid gap-2">
            {workspace.recentBatches.map((batch) => {
              const variance = batch.production_yield_variances
                ? Array.isArray(batch.production_yield_variances)
                  ? batch.production_yield_variances[0]
                  : batch.production_yield_variances
                : null;
              const variancePct = variance
                ? (
                    (Number(variance.variance_quantity_base) /
                      Number(variance.expected_output_base)) *
                    100
                  ).toFixed(1)
                : null;
              return (
                <div
                  key={batch.id}
                  className="flex items-center justify-between border bg-white p-3 text-sm"
                >
                  <div>
                    <p className="font-semibold">
                      {relatedName(batch.recipes)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {new Date(batch.produced_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs">
                      {Number(batch.actual_output_quantity)} · {batch.status}
                    </span>
                    {variancePct && (
                      <p
                        className={`mt-1 font-mono text-[10px] ${
                          Math.abs(Number(variancePct)) > 10
                            ? "text-[var(--accent-strong)]"
                            : "text-[var(--muted)]"
                        }`}
                      >
                        yield variance: {variancePct}%
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
