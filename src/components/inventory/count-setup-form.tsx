"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { createInventoryCountAction } from "@/app/(manager)/inventory/counts/actions";
import { Callout, buttonClass, inputClass, labelClass } from "@/components/ui";

type Area = {
  id: string;
  name: string;
  area: string;
  walkOrder: number;
  itemCount: number;
};
type Item = {
  id: string;
  name: string;
  storageLocationId: string;
  categoryId: string | null;
};

export function CountSetupForm({
  countType,
  periodLabel,
  staff,
  currentUserId,
  countDates,
  areas,
  categories = [],
  items = [],
}: {
  countType: "full" | "spot";
  periodLabel: string | null;
  staff: Array<{ id: string; name: string }>;
  currentUserId: string;
  /** Business dates: tonight's close, or last night's for a morning count. */
  countDates: { today: string; yesterday: string };
  areas: Area[];
  categories?: Array<{ id: string; name: string }>;
  items?: Item[];
}) {
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(
    () => new Set(countType === "full" ? areas.map((area) => area.id) : []),
  );
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedItems, setSelectedItems] = useState<Set<string>>(
    () => new Set(),
  );
  const [itemQuery, setItemQuery] = useState("");

  const toggle = (
    set: Set<string>,
    setter: (next: Set<string>) => void,
    id: string,
  ) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  // A picked item brings its storage area along with it.
  const areaIds = useMemo(() => {
    const ids = new Set(selectedAreas);
    for (const key of selectedItems) ids.add(key.split(":")[0]);
    return ids;
  }, [selectedAreas, selectedItems]);
  const itemIds = [
    ...new Set([...selectedItems].map((key) => key.split(":")[1])),
  ];

  const estimate = useMemo(() => {
    const narrowed = selectedCategories.size > 0 || selectedItems.size > 0;
    if (!narrowed) {
      return areas
        .filter((area) => areaIds.has(area.id))
        .reduce((sum, area) => sum + area.itemCount, 0);
    }
    return items.filter(
      (item) =>
        areaIds.has(item.storageLocationId) &&
        (selectedItems.has(`${item.storageLocationId}:${item.id}`) ||
          (item.categoryId !== null &&
            selectedCategories.has(item.categoryId))),
    ).length;
  }, [areas, items, areaIds, selectedCategories, selectedItems]);

  const matchingItems = useMemo(() => {
    const term = itemQuery.trim().toLowerCase();
    if (!term) return [];
    return items
      .filter((item) => item.name.toLowerCase().includes(term))
      .slice(0, 30);
  }, [items, itemQuery]);

  const areaName = (id: string) =>
    areas.find((area) => area.id === id)?.name ?? "";

  return (
    <form action={createInventoryCountAction} className="grid gap-5">
      <input type="hidden" name="count_type" value={countType} />
      {[...areaIds].map((id) => (
        <input key={id} type="hidden" name="storage_location_id" value={id} />
      ))}
      {[...selectedCategories].map((id) => (
        <input key={id} type="hidden" name="category_id" value={id} />
      ))}
      {itemIds.map((id) => (
        <input key={id} type="hidden" name="inventory_item_id" value={id} />
      ))}

      {periodLabel ? (
        <Callout tone="neutral" title={`Counts toward ${periodLabel}`} />
      ) : (
        <Callout
          tone="warning"
          title="No open period covers today"
          action={
            <a href="/periods" className={buttonClass("secondary", "sm")}>
              Create period
            </a>
          }
        >
          A count needs a period to post into.
        </Callout>
      )}

      <section className="rounded-lg border bg-[var(--surface-strong)]">
        <div className="grid gap-4 border-b p-4 sm:grid-cols-2">
          <label className={labelClass}>
            Counted by
            <select
              name="assigned_profile_id"
              defaultValue={currentUserId}
              className={inputClass}
            >
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.id === currentUserId ? " (you)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            When
            <select
              name="count_date"
              defaultValue={countDates.today}
              className={inputClass}
            >
              <option value={countDates.today}>
                Tonight after close · {dayLabel(countDates.today)}
              </option>
              <option value={countDates.yesterday}>
                This morning before open · counts as{" "}
                {dayLabel(countDates.yesterday)} close
              </option>
            </select>
          </label>
          <p className="text-xs leading-5 text-[var(--muted)] sm:col-span-2">
            A count is a snapshot of the shelf at the end of a business day.
            Sales after it, and deliveries dated after it, land in the next
            window. Managers can enter any count from the count sheet; staff see
            counts assigned to them on their phone.
          </p>
        </div>

        <fieldset className="p-4">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-sm font-semibold">Storage areas</legend>
            <div className="flex gap-1">
              <button
                type="button"
                className={buttonClass("ghost", "sm")}
                onClick={() =>
                  setSelectedAreas(new Set(areas.map((area) => area.id)))
                }
              >
                All
              </button>
              <button
                type="button"
                className={buttonClass("ghost", "sm")}
                onClick={() => setSelectedAreas(new Set())}
              >
                None
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {areas.map((area) => (
              <label
                key={area.id}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition ${
                  selectedAreas.has(area.id)
                    ? "border-[var(--accent)] bg-[#fdf5ee]"
                    : "hover:bg-[var(--surface)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedAreas.has(area.id)}
                  onChange={() =>
                    toggle(selectedAreas, setSelectedAreas, area.id)
                  }
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {area.name}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {area.area ? `${area.area} · ` : ""}
                    {area.itemCount} items
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {countType === "spot" && (
          <div className="grid gap-4 border-t p-4">
            <div>
              <p className="text-sm font-semibold">Narrow it down (optional)</p>
              <p className="text-xs text-[var(--muted)]">
                Count only these categories or items. Picking an item adds its
                storage area automatically.
              </p>
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((category) => {
                  const on = selectedCategories.has(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        toggle(
                          selectedCategories,
                          setSelectedCategories,
                          category.id,
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        on
                          ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                          : "border-[var(--line-strong)] hover:bg-[var(--surface)]"
                      }`}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div>
              <input
                type="search"
                value={itemQuery}
                onChange={(event) => setItemQuery(event.target.value)}
                placeholder="Add a specific item…"
                aria-label="Search items to add"
                className={inputClass}
              />
              {matchingItems.length > 0 && (
                <ul className="mt-1 max-h-60 overflow-y-auto rounded-md border">
                  {matchingItems.map((item) => {
                    const key = `${item.storageLocationId}:${item.id}`;
                    return (
                      <li key={key} className="border-b last:border-b-0">
                        <button
                          type="button"
                          onClick={() => {
                            toggle(selectedItems, setSelectedItems, key);
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
                        >
                          <span>
                            {item.name}
                            <span className="ml-2 text-xs text-[var(--muted)]">
                              {areaName(item.storageLocationId)}
                            </span>
                          </span>
                          <span className="text-xs font-medium text-[var(--accent-strong)]">
                            {selectedItems.has(key) ? "Remove" : "Add"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selectedItems.size > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...selectedItems].map((key) => {
                    const [locationId, itemId] = key.split(":");
                    const item = items.find(
                      (candidate) =>
                        candidate.id === itemId &&
                        candidate.storageLocationId === locationId,
                    );
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          toggle(selectedItems, setSelectedItems, key)
                        }
                        className="rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1 text-xs"
                        aria-label={`Remove ${item?.name}`}
                      >
                        {item?.name} ×
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-[var(--surface)] px-4 py-3">
          <p className="text-sm text-[var(--muted)] tabular-nums">
            {areaIds.size} area{areaIds.size === 1 ? "" : "s"} · about{" "}
            {estimate} item{estimate === 1 ? "" : "s"}
          </p>
          <SubmitButton disabled={!periodLabel || areaIds.size === 0} />
        </div>
      </section>
    </form>
  );
}

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={buttonClass("primary")}
    >
      {pending ? "Creating…" : "Create count sheet"}
    </button>
  );
}
