import { redirect } from "next/navigation";

/** Costing now lives on the recipe editor. */
export default async function RecipeCostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/recipes/${id}`);
}
