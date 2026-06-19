import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { getCountSetup, getPrimaryLocation } from "@/lib/inventory/queries";
import { createInventoryCountAction } from "../actions";

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
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          {countType === "full" ? "Full inventory" : "Spot count"}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          {description}
        </p>

        <form
          action={createInventoryCountAction}
          className="mt-8 border bg-[var(--surface-strong)] p-5 sm:p-7"
        >
          <input type="hidden" name="count_type" value={countType} />
          <label className="grid gap-2 text-sm font-semibold">
            Assign to
            <select
              name="assigned_profile_id"
              required
              className="h-12 border bg-white px-3 text-base font-normal"
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
      </div>
    </div>
  );
}
