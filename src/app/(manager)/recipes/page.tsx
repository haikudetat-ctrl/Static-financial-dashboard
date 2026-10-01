import type { Metadata } from "next";
import Link from "next/link";

import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import {
  getRecipeCurrentCost,
  getRecipeWorkspace,
} from "@/lib/recipes/queries";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Recipes" };

export default async function RecipesPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const workspace = await getRecipeWorkspace(
    context.organizationId,
    locationId,
  );
  const costs = await Promise.all(
    workspace.recipes.map(async (recipe) => ({
      id: recipe.id,
      ...(await getRecipeCurrentCost(
        context.organizationId!,
        locationId,
        recipe.id,
      )),
    })),
  );
  const costed = costs.filter((row) => row.cost > 0);
  const averageCost =
    costed.length > 0
      ? costed.reduce((sum, row) => sum + row.cost, 0) / costed.length
      : 0;

  return (
    <>
      <PageHeader
        title="Recipes"
        description="Costed recipes and prep, with version history"
        actions={
          <>
            <Link
              href="/recipes/new"
              className="inline-flex min-h-12 items-center justify-center bg-[var(--foreground)] px-6 text-sm font-semibold text-white"
            >
              Create recipe
            </Link>
          </>
        }
      />
      <SectionNav section="recipes" active="/recipes" />
      <PageBody>
        <div className="grid border-x sm:grid-cols-3">
          <Metric
            label="Active recipes"
            value={String(workspace.activeRecipeCount)}
          />
          <Metric
            label="Missing mappings"
            value={String(workspace.missingMappingCount)}
          />
          <Metric
            label="Average current cost"
            value={averageCost.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          />
        </div>

        <div className="mt-8 grid gap-px border bg-[var(--line)] sm:grid-cols-3">
          <WorkspaceLink
            href="/recipes/mappings"
            title="Toast mappings"
            detail="Connect durable Toast menu GUIDs to active recipes."
          />
          <WorkspaceLink
            href="/recipes/sales"
            title="Sales posting"
            detail="Post mapped PMIX business days without changing physical stock."
          />
          <WorkspaceLink
            href="/recipes/theoretical-usage"
            title="Theoretical usage"
            detail="Trace sold menu items through nested recipes to purchased items."
          />
        </div>

        <section className="mt-9">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-[-0.025em]">
              Recipe library
            </h2>
            <p className="font-mono text-xs text-[var(--muted)]">
              Yield variance: {workspace.recentYieldVariance.toFixed(1)} base
              units
            </p>
          </div>
          <div className="mt-4 overflow-x-auto border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-[var(--surface)] text-left text-xs font-medium text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2.5">Recipe</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Active version</th>
                  <th className="px-4 py-2.5 text-right">Current cost</th>
                </tr>
              </thead>
              <tbody>
                {workspace.recipes.map((recipe) => {
                  const versions = recipe.recipe_versions as Array<{
                    id: string;
                    status: string;
                    effective_from: string;
                  }>;
                  const activeVersion = versions.find(
                    (version) => version.status === "active",
                  );
                  return (
                    <tr key={recipe.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">
                        <Link
                          href={`/recipes/${recipe.id}`}
                          className="underline decoration-[var(--line)] underline-offset-4"
                        >
                          {recipe.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 capitalize">
                        {recipe.recipe_type.replace("_", " ")}
                      </td>
                      <td className="px-4 py-2.5">
                        {activeVersion?.effective_from ?? "Draft only"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {(
                          costs.find((row) => row.id === recipe.id)?.cost ?? 0
                        ).toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </PageBody>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b bg-[var(--surface)] p-5 sm:border-r sm:last:border-r-0">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{value}</p>
    </div>
  );
}

function WorkspaceLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link href={href} className="bg-white p-5 hover:bg-[#f8f1ea]">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</p>
    </Link>
  );
}
