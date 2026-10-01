import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { getMappingQueue } from "@/lib/imports/mapping";
import { MappingClient } from "./mapping-client";
import { PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Mapping" };

export default async function MappingPage() {
  const context = await getUserContext();

  const items = context?.organizationId
    ? await getMappingQueue(context.organizationId, {
        status: "pending,suggested",
        limit: 100,
      })
    : [];

  const pendingCount = (items as Array<Record<string, string>>).filter(
    (i) => i.status === "pending",
  ).length;
  const suggestedCount = (items as Array<Record<string, string>>).filter(
    (i) => i.status === "suggested",
  ).length;

  return (
    <>
      <PageHeader
        title="Mapping"
        description="Connect Toast items, vendor codes and units to inventory before they post"
      />
      <PageBody>
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-[var(--surface-strong)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--muted)]">Pending</p>
            <p className="mt-1 text-lg font-semibold">{pendingCount}</p>
          </div>
          <div className="rounded-lg border bg-[var(--surface-strong)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--muted)]">Suggested</p>
            <p className="mt-1 text-lg font-semibold">{suggestedCount}</p>
          </div>
          <div className="rounded-lg border bg-[var(--surface-strong)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--muted)]">
              Total in queue
            </p>
            <p className="mt-1 text-lg font-semibold">{items.length}</p>
          </div>
        </section>

        <section className="mt-8">
          <MappingClient initialItems={items} />
        </section>
      </PageBody>
    </>
  );
}
