"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SetupState = {
  message?: string;
  errors?: Record<string, string>;
};

export async function setupOrganizationAction(
  _previousState: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { message: "You must be signed in." };

  const name = String(formData.get("organization_name") ?? "").trim();
  const locationName = String(formData.get("location_name") ?? "").trim();

  if (!name)
    return { errors: { organization_name: "Organization name is required." } };
  if (!locationName)
    return { errors: { location_name: "Location name is required." } };

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);

  const locationSlug = locationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);

  const admin = createAdminClient();

  const { data: existingOrgs } = await admin
    .from("organizations")
    .select("id")
    .limit(1);

  if (existingOrgs && existingOrgs.length > 0) {
    return {
      message: "An organization already exists. Ask a manager to add you.",
    };
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name, slug })
    .select("id")
    .single();

  if (orgError) return { message: orgError.message };
  if (!org) return { message: "Failed to create organization." };

  const { data: location, error: locError } = await admin
    .from("locations")
    .insert({
      organization_id: org.id,
      name: locationName,
      slug: locationSlug,
    })
    .select("id")
    .single();

  if (locError) return { message: locError.message };

  const { data: managerRole } = await admin
    .from("roles")
    .select("id")
    .eq("slug", "manager")
    .single();

  if (!managerRole) return { message: "Manager role not found." };

  const { data: membership, error: memError } = await admin
    .from("organization_memberships")
    .insert({
      organization_id: org.id,
      profile_id: user.id,
      role_id: managerRole.id,
    })
    .select("id")
    .single();

  if (memError) return { message: memError.message };

  const { error: locMemError } = await admin
    .from("location_memberships")
    .insert({
      location_id: location.id,
      organization_membership_id: membership.id,
      role_id: managerRole.id,
    });

  if (locMemError) return { message: locMemError.message };

  revalidatePath("/", "layout");
  redirect("/today");
}
