import type { Metadata } from "next";

import { resolveAndPostReceiptAction } from "@/app/(staff)/receive/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getReceiptReviewQueue, relatedName } from "@/lib/purchasing/queries";

export const metadata: Metadata = { title: "Receiving review" };

export default async function ReceivingReviewPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const receipts = await getReceiptReviewQueue(
    context.organizationId,
    locationId,
  );

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Purchasing · receiving review
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Resolve before stock moves.
        </h1>
        <div className="mt-7 grid gap-5">
          {receipts.map((receipt) => (
            <section key={receipt.id} className="border bg-white p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row">
                <div>
                  <h2 className="text-xl font-semibold">
                    {relatedName(receipt.vendors)}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {new Date(receipt.received_at).toLocaleString()}
                  </p>
                </div>
                <form
                  action={resolveAndPostReceiptAction.bind(null, receipt.id)}
                >
                  <button className="min-h-11 bg-[var(--foreground)] px-5 text-sm font-semibold text-white">
                    Resolve and post
                  </button>
                </form>
              </div>
              <div className="mt-4 grid gap-2">
                {receipt.receipt_exceptions.map((exception) => (
                  <div key={exception.id} className="border-l-2 p-3">
                    <p className="font-mono text-[10px] tracking-[0.12em] text-[var(--accent)] uppercase">
                      {exception.exception_type.replace("_", " ")}
                    </p>
                    <p className="mt-1 text-sm">{exception.description}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {receipts.length === 0 && (
            <div className="border bg-white p-7 text-sm text-[var(--muted)]">
              No receiving exceptions require review.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
