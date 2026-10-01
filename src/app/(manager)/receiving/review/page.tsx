import type { Metadata } from "next";

import { resolveAndPostReceiptAction } from "@/app/(staff)/receive/actions";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { getReceiptReviewQueue, relatedName } from "@/lib/purchasing/queries";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";

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
    <>
      <PageHeader
        title="Receiving review"
        description="Shortages, substitutions, damage and unknown items to resolve before stock moves"
      />
      <SectionNav section="purchasing" active="/receiving/review" />
      <PageBody narrow>
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
                  <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 text-sm font-medium text-white transition hover:bg-[#343a32] disabled:cursor-not-allowed disabled:opacity-50">
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
      </PageBody>
    </>
  );
}
