import type { Metadata } from "next";

import { createInventoryCountAction } from "@/app/(manager)/inventory/counts/actions";
import { getUserContext } from "@/lib/auth/session";
import { getCountSetup, getPrimaryLocation } from "@/lib/inventory/queries";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New spot count" };

export default async function SpotCountPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const setup = await getCountSetup(context.organizationId, locationId);
  const staff = setup.staffMemberships
    .map((membership) => {
      const related = membership.organization_memberships as
        | {
            profile_id: string;
            profiles:
              | { name: string; email: string }
              | { name: string; email: string }[];
          }
        | {
            profile_id: string;
            profiles:
              | { name: string; email: string }
              | { name: string; email: string }[];
          }[]
        | null;
      return Array.isArray(related) ? related[0] : related;
    })
    .filter(Boolean) as Array<{
    profile_id: string;
    profiles:
      | { name: string; email: string }
      | { name: string; email: string }[];
  }>;
  const items = setup.storageItems.map((row) => {
    const related = row.inventory_items as
      | { name: string; category_id: string | null }
      | { name: string; category_id: string | null }[]
      | null;
    const item = Array.isArray(related) ? related[0] : related;
    return {
      id: row.inventory_item_id,
      name: item?.name ?? "Inventory item",
      categoryId: item?.category_id ?? null,
      storageLocationId: row.storage_location_id,
    };
  });

  return (
    <>
      <PageHeader
        title="Spot count"
        description={
          <>
            Select zones, then optionally narrow by category or individual item.
            With no item filter, every item in the selected zones is counted.
          </>
        }
      />
      <SectionNav section="inventory" active="/inventory/counts/spot" />
      <PageBody narrow>
        <form
          action={createInventoryCountAction}
          className="mt-8 grid gap-7 border bg-[var(--surface-strong)] p-5 sm:p-7"
        >
          <input type="hidden" name="count_type" value="spot" />
          <label className="grid gap-1 text-xs font-medium">
            Assign to
            <select
              name="assigned_profile_id"
              required
              className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 text-sm font-normal text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            >
              {staff.map((member) => {
                const profile = Array.isArray(member.profiles)
                  ? member.profiles[0]
                  : member.profiles;
                return (
                  <option key={member.profile_id} value={member.profile_id}>
                    {profile?.name || profile?.email || "Staff member"}
                  </option>
                );
              })}
            </select>
          </label>

          <FilterGroup legend="Storage zones">
            {setup.storageLocations.map((location) => (
              <CheckboxRow
                key={location.id}
                name="storage_location_id"
                value={location.id}
                label={location.name}
                detail={`Walk order ${location.walk_order}`}
              />
            ))}
          </FilterGroup>

          <FilterGroup legend="Categories (optional)">
            {setup.categories.map((category) => (
              <CheckboxRow
                key={category.id}
                name="category_id"
                value={category.id}
                label={category.name}
              />
            ))}
          </FilterGroup>

          <FilterGroup legend="Specific items (optional)">
            {items.map((item) => {
              const location = setup.storageLocations.find(
                (candidate) => candidate.id === item.storageLocationId,
              );
              const category = setup.categories.find(
                (candidate) => candidate.id === item.categoryId,
              );
              return (
                <CheckboxRow
                  key={`${item.storageLocationId}:${item.id}`}
                  name="inventory_item_id"
                  value={item.id}
                  label={item.name}
                  detail={[location?.name, category?.name]
                    .filter(Boolean)
                    .join(" · ")}
                />
              );
            })}
          </FilterGroup>

          <button className="min-h-12 bg-[var(--foreground)] px-5 text-sm font-semibold text-white">
            Generate spot count
          </button>
        </form>
      </PageBody>
    </>
  );
}

function FilterGroup({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="mt-3 grid divide-y border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {children}
      </div>
    </fieldset>
  );
}

function CheckboxRow({
  name,
  value,
  label,
  detail,
}: {
  name: string;
  value: string;
  label: string;
  detail?: string;
}) {
  return (
    <label className="flex min-h-16 items-center gap-3 bg-[var(--surface)] px-4">
      <input
        type="checkbox"
        name={name}
        value={value}
        className="size-5 accent-[var(--accent)]"
      />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {detail && (
          <span className="block text-xs text-[var(--muted)]">{detail}</span>
        )}
      </span>
    </label>
  );
}
