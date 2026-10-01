import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { getCountSetup, getPrimaryLocation } from "@/lib/inventory/queries";
import { createInventoryCountAction } from "../actions";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New full count" };

export default async function NewInventoryCountPage() {
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
    .filter(Boolean);

  return (
    <CountSetupPage
      title="Build the opening count."
      description="All selected zones become staff assignments in storage walk order. Expected quantities stay hidden until manager review."
      countType="full"
      storageLocations={setup.storageLocations}
      staff={
        staff as Array<{
          profile_id: string;
          profiles:
            | { name: string; email: string }
            | { name: string; email: string }[];
        }>
      }
    />
  );
}

export function CountSetupPage({
  title,
  description,
  countType,
  storageLocations,
  staff,
}: {
  title: string;
  description: string;
  countType: "full" | "spot";
  storageLocations: Array<{
    id: string;
    name: string;
    walk_order: number;
    area: string;
  }>;
  staff: Array<{
    profile_id: string;
    profiles:
      | { name: string; email: string }
      | { name: string; email: string }[];
  }>;
}) {
  return (
    <>
      <PageHeader title={title} description={<>{description}</>} />
      <SectionNav section="inventory" active="/inventory/counts/new" />
      <PageBody narrow>
        <form
          action={createInventoryCountAction}
          className="mt-8 border bg-[var(--surface-strong)] p-5 sm:p-7"
        >
          <input type="hidden" name="count_type" value={countType} />
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

          <fieldset className="mt-7">
            <legend className="text-sm font-semibold">Storage zones</legend>
            <div className="mt-3 divide-y border">
              {storageLocations.map((location) => (
                <label
                  key={location.id}
                  className="flex min-h-16 items-center gap-4 bg-[var(--surface)] px-4"
                >
                  <input
                    type="checkbox"
                    name="storage_location_id"
                    value={location.id}
                    defaultChecked={countType === "full"}
                    className="size-5 accent-[var(--accent)]"
                  />
                  <span className="flex-1">
                    <span className="block font-semibold">{location.name}</span>
                    <span className="text-xs text-[var(--muted)]">
                      Walk order {location.walk_order}
                      {location.area ? ` · ${location.area}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button className="mt-7 min-h-12 w-full bg-[var(--foreground)] px-5 text-sm font-semibold text-white">
            Generate assignments
          </button>
        </form>
      </PageBody>
    </>
  );
}
