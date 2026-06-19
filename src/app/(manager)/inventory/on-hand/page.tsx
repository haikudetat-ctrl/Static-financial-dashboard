import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { getOnHand, getPrimaryLocation } from "@/lib/inventory/queries";
import { formatInventoryQuantity } from "@/lib/inventory/counts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "On hand" };

export default async function OnHandPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const rows = await getOnHand(context.organizationId, locationId);
  const supabase = await createClient();
  const itemIds = rows.map((row) => row.inventory_item_id);
  const storageIds = rows.map((row) => row.storage_location_id);
  const [{ data: items }, { data: locations }, { data: verified }] =
    await Promise.all([
      itemIds.length
        ? supabase
            .from("inventory_items")
            .select("id, name, base_unit_id")
            .in("id", itemIds)
        : Promise.resolve({ data: [] }),
      storageIds.length
        ? supabase
            .from("storage_locations")
            .select("id, name")
            .in("id", storageIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("inventory_counts")
        .select("approved_at")
        .eq("organization_id", context.organizationId)
        .eq("location_id", locationId)
        .eq("status", "approved")
        .order("approved_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  const unitIds = (items ?? [])
    .map((item) => item.base_unit_id)
    .filter(Boolean);
  const { data: units } = unitIds.length
    ? await supabase.from("units").select("id, abbreviation").in("id", unitIds)
    : { data: [] };

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Inventory projection
        </p>
        <div className="mt-2 flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em]">
              On hand, from posted movements.
            </h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Last verified:{" "}
              {verified?.approved_at
                ? new Date(verified.approved_at).toLocaleString()
                : "No approved count"}
            </p>
          </div>
          <p className="font-mono text-xs text-[var(--muted)]">
            {rows.length} item-location rows
          </p>
        </div>

        <div className="mt-7 overflow-x-auto border">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-[var(--foreground)] text-left font-mono text-[10px] tracking-[0.1em] text-white uppercase">
              <tr>
                <th className="p-3">Item</th>
                <th className="p-3">Storage</th>
                <th className="p-3 text-right">Quantity</th>
                <th className="p-3 text-right">Unit cost</th>
                <th className="p-3 text-right">Value</th>
                <th className="p-3">Last movement</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const item = items?.find(
                  (candidate) => candidate.id === row.inventory_item_id,
                );
                const location = locations?.find(
                  (candidate) => candidate.id === row.storage_location_id,
                );
                const unit = units?.find(
                  (candidate) => candidate.id === item?.base_unit_id,
                );
                return (
                  <tr
                    key={`${row.inventory_item_id}:${row.storage_location_id}`}
                    className="border-b bg-white"
                  >
                    <td className="p-3 font-semibold">
                      {item?.name ?? "Inventory item"}
                    </td>
                    <td className="p-3">{location?.name ?? "Storage"}</td>
                    <td className="p-3 text-right tabular-nums">
                      {formatInventoryQuantity(Number(row.quantity))}{" "}
                      {unit?.abbreviation}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(row.weighted_average_cost).toLocaleString(
                        "en-US",
                        { style: "currency", currency: "USD" },
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(row.extended_value).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </td>
                    <td className="p-3 text-xs text-[var(--muted)]">
                      {new Date(row.last_movement_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-[var(--muted)]"
                  >
                    Approve the first full count to establish opening inventory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
