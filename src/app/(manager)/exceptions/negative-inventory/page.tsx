import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import {
  getNegativeInventory,
  getPrimaryLocation,
} from "@/lib/inventory/queries";
import { formatInventoryQuantity } from "@/lib/inventory/counts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Negative inventory" };

export default async function NegativeInventoryPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const rows = await getNegativeInventory(context.organizationId, locationId);
  const supabase = await createClient();
  const [{ data: items }, { data: locations }] = await Promise.all([
    rows.length
      ? supabase
          .from("inventory_items")
          .select("id, name")
          .in(
            "id",
            rows.map((row) => row.inventory_item_id),
          )
      : Promise.resolve({ data: [] }),
    rows.length
      ? supabase
          .from("storage_locations")
          .select("id, name")
          .in(
            "id",
            rows.map((row) => row.storage_location_id),
          )
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[#a63f2f] uppercase">
          Blocking exception
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Negative physical inventory.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          A physical negative blocks period close. Investigate missing receipts,
          transaction timing, production errors, or a count posted to the wrong
          zone.
        </p>
        <div className="mt-7 grid gap-3">
          {rows.map((row) => (
            <article
              key={`${row.inventory_item_id}:${row.storage_location_id}`}
              className="flex flex-col justify-between gap-3 border-l-4 border-l-[#a63f2f] bg-white p-5 sm:flex-row sm:items-center"
            >
              <div>
                <h2 className="font-semibold">
                  {items?.find((item) => item.id === row.inventory_item_id)
                    ?.name ?? "Inventory item"}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {locations?.find(
                    (location) => location.id === row.storage_location_id,
                  )?.name ?? "Storage zone"}
                </p>
              </div>
              <p className="text-2xl font-semibold text-[#a63f2f] tabular-nums">
                {formatInventoryQuantity(Number(row.quantity))}
              </p>
            </article>
          ))}
          {rows.length === 0 && (
            <div className="border bg-[var(--surface-strong)] p-6">
              <p className="font-semibold">No negative physical inventory.</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                The ledger currently has no item-location rows below zero.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
