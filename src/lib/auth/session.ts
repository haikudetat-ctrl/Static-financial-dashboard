import type { AppRole } from "@/lib/auth/route-access";
import { createClient } from "@/lib/supabase/server";

type MembershipRow = {
  organization_id: string;
  roles: { slug: AppRole } | { slug: AppRole }[] | null;
  organizations:
    | { name: string; id: string }
    | { name: string; id: string }[]
    | null;
  location_memberships?: Array<{ location_id: string }>;
};

function firstRelated<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

export async function getUserContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("organization_memberships")
    .select(
      "organization_id, roles(slug), organizations(id, name), location_memberships(location_id)",
    )
    .eq("profile_id", user.id)
    .limit(1)
    .maybeSingle();

  const membership = data as MembershipRow | null;
  const role = firstRelated(membership?.roles ?? null)?.slug ?? null;
  const orgData = firstRelated(membership?.organizations ?? null);
  const organizationName = orgData?.name ?? null;
  const organizationId = orgData?.id ?? null;
  const locationMemberships = membership?.location_memberships ?? [];
  const locationId =
    locationMemberships.length > 0 ? locationMemberships[0].location_id : null;

  return {
    user,
    role,
    organization: organizationName,
    organizationId,
    locationId,
  };
}
