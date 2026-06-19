"use client";

import { useCallback, useState } from "react";
import { Check, SkipForward } from "lucide-react";
import type { MappingQueueItem } from "@/lib/types";

const QUEUE_TYPE_LABELS: Record<string, string> = {
  toast_item_to_recipe: "Toast Item → Recipe",
  toast_item_to_inventory: "Toast Item → Inventory Item",
  vendor_item_to_inventory: "Vendor Item → Inventory Item",
  unknown_unit_to_unit: "Unknown Unit → Unit",
};

export function MappingQueueView({
  items,
  onConfirm,
  onSkip,
}: {
  items: MappingQueueItem[];
  onConfirm: (id: string, matchId: string, matchType: string) => Promise<void>;
  onSkip: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<Set<string>>(new Set());

  const handleConfirm = useCallback(
    async (item: MappingQueueItem) => {
      setPending((prev) => new Set(prev).add(item.id));
      try {
        await onConfirm(
          item.id,
          item.suggested_match_id ?? item.id,
          item.queue_type.includes("recipe") ? "recipe" : "inventory_item",
        );
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [onConfirm],
  );

  const handleSkip = useCallback(
    async (item: MappingQueueItem) => {
      setPending((prev) => new Set(prev).add(item.id));
      try {
        await onSkip(item.id);
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [onSkip],
  );

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        No items in the mapping queue.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const isBusy = pending.has(item.id);

        return (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 border px-4 py-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] tracking-[0.1em] text-[var(--muted)] uppercase">
                {QUEUE_TYPE_LABELS[item.queue_type] ?? item.queue_type}
              </p>
              <p className="mt-1 truncate font-medium">{item.source_value}</p>
              {item.suggested_match_label && (
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Suggested: {item.suggested_match_label}
                  {item.suggested_confidence !== null && (
                    <span className="ml-2 font-mono text-[10px]">
                      ({Math.round(item.suggested_confidence * 100)}% match)
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="flex shrink-0 gap-2">
              {item.suggested_match_label && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleConfirm(item)}
                  className="inline-flex min-h-9 items-center gap-1 bg-[var(--success)] px-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Check size={14} strokeWidth={1.7} />
                  Accept
                </button>
              )}
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleSkip(item)}
                className="inline-flex min-h-9 items-center gap-1 border px-3 text-xs font-semibold disabled:opacity-50"
              >
                <SkipForward size={14} strokeWidth={1.7} />
                Skip
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
