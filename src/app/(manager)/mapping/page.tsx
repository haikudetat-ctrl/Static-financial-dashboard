import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { getMappingQueue } from "@/lib/imports/mapping";
import { MappingClient } from "./mapping-client";

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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <header className="border-b pb-8">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Mapping queue
        </p>
        <div className="mt-3 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
          <h1 className="max-w-3xl text-4xl leading-[0.98] font-semibold tracking-[-0.055em] sm:text-5xl">
            Connect source items to inventory.
          </h1>
          <p className="max-w-xl text-sm leading-6 text-[var(--muted)] xl:justify-self-end">
            Toast menu items, vendor codes, and unknown units need to be mapped
            to your inventory before they can post.
          </p>
        </div>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="border px-4 py-3">
          <p className="font-mono text-[9px] tracking-[0.13em] text-[var(--muted)] uppercase">
            Pending
          </p>
          <p className="mt-1 text-lg font-semibold">{pendingCount}</p>
        </div>
        <div className="border px-4 py-3">
          <p className="font-mono text-[9px] tracking-[0.13em] text-[var(--muted)] uppercase">
            Suggested
          </p>
          <p className="mt-1 text-lg font-semibold">{suggestedCount}</p>
        </div>
        <div className="border px-4 py-3">
          <p className="font-mono text-[9px] tracking-[0.13em] text-[var(--muted)] uppercase">
            Total in queue
          </p>
          <p className="mt-1 text-lg font-semibold">{items.length}</p>
        </div>
      </section>

      <section className="mt-8">
        <MappingClient initialItems={items} />
      </section>
    </div>
  );
}
