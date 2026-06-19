"use client";

import { useCallback } from "react";
import { MappingQueueView } from "@/components/imports/mapping-queue-view";
import type { MappingQueueItem } from "@/lib/types";

export function MappingClient({ initialItems }: { initialItems: unknown[] }) {
  const handleConfirm = useCallback(
    async (id: string, matchId: string, matchType: string) => {
      const response = await fetch("/api/mappings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          queueItemId: id,
          confirmedMatchId: matchId,
          confirmedMatchType: matchType,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to confirm mapping");
      }
    },
    [],
  );

  const handleSkip = useCallback(async (id: string) => {
    const response = await fetch("/api/mappings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "skip",
        queueItemId: id,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to skip mapping");
    }
  }, []);

  const items = initialItems as MappingQueueItem[];

  const unresolved = items.filter(
    (item) => item.status === "pending" || item.status === "suggested",
  );

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-[-0.02em]">
        Unresolved items ({unresolved.length})
      </h2>
      <div className="mt-4">
        <MappingQueueView
          items={unresolved}
          onConfirm={handleConfirm}
          onSkip={handleSkip}
        />
      </div>

      {items.length > unresolved.length && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--muted)]">
            Resolved items ({items.length - unresolved.length})
          </summary>
          <div className="mt-3 opacity-60">
            <MappingQueueView
              items={items.filter(
                (item) =>
                  item.status === "confirmed" || item.status === "skipped",
              )}
              onConfirm={handleConfirm}
              onSkip={handleSkip}
            />
          </div>
        </details>
      )}
    </div>
  );
}
