import { createClient } from "@/lib/supabase/server";

export async function getPrimaryLocation(
  organizationId: string,
  preferredLocationId?: string | null,
) {
  if (preferredLocationId) return preferredLocationId;

  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

export async function getCountSetup(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const [
    { data: storageLocations },
    { data: staffMemberships },
    { data: categories },
    { data: storageItems },
  ] = await Promise.all([
    supabase
      .from("storage_locations")
      .select("id, name, walk_order, area")
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .eq("active", true)
      .order("walk_order"),
    supabase
      .from("location_memberships")
      .select(
        "organization_memberships(profile_id, profiles(name, email)), roles(slug)",
      )
      .eq("location_id", locationId),
    supabase
      .from("inventory_categories")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("storage_location_items")
      .select(
        "storage_location_id, inventory_item_id, inventory_items(name, category_id)",
      )
      .eq("organization_id", organizationId),
  ]);

  return {
    storageLocations: storageLocations ?? [],
    staffMemberships: staffMemberships ?? [],
    categories: categories ?? [],
    storageItems: storageItems ?? [],
  };
}

export async function getInventorySummary(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const [
    { data: onHand },
    { count: negativeCount },
    { data: approvedCount },
    { count: activeCountCount },
  ] = await Promise.all([
    supabase
      .from("inventory_on_hand")
      .select("extended_value")
      .eq("organization_id", organizationId)
      .eq("location_id", locationId),
    supabase
      .from("negative_inventory")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("location_id", locationId),
    supabase
      .from("inventory_counts")
      .select("approved_at")
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("inventory_counts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("location_id", locationId)
      .in("status", ["draft", "in_progress", "counted"]),
  ]);

  return {
    inventoryValue: (onHand ?? []).reduce(
      (sum, row) => sum + Number(row.extended_value ?? 0),
      0,
    ),
    negativeCount: negativeCount ?? 0,
    lastVerifiedAt: approvedCount?.approved_at ?? null,
    activeCountCount: activeCountCount ?? 0,
  };
}

export async function getOnHand(organizationId: string, locationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_on_hand")
    .select(
      "inventory_item_id, storage_location_id, quantity, weighted_average_cost, extended_value, last_movement_at",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .order("inventory_item_id");

  return data ?? [];
}

export async function getNegativeInventory(
  organizationId: string,
  locationId: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("negative_inventory")
    .select(
      "inventory_item_id, storage_location_id, quantity, weighted_average_cost, extended_value, last_movement_at",
    )
    .eq("organization_id", organizationId)
    .eq("location_id", locationId)
    .order("quantity");

  return data ?? [];
}
