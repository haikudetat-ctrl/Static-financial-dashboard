"use client";

import { markPurchaseOrderSentAction } from "@/app/(manager)/purchasing/actions";

export function OrderClientActions({
  output,
  orderId,
  status,
}: {
  output: string;
  orderId: string;
  status: string;
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <button
        onClick={() => navigator.clipboard.writeText(output)}
        className="min-h-12 border px-5 text-sm font-semibold"
      >
        Copy to clipboard
      </button>
      <button
        onClick={() => window.print()}
        className="min-h-12 border px-5 text-sm font-semibold"
      >
        Print / PDF
      </button>
      {status === "approved" && (
        <form action={markPurchaseOrderSentAction.bind(null, orderId)}>
          <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 text-sm font-medium text-white transition hover:bg-[#343a32] disabled:cursor-not-allowed disabled:opacity-50">
            Mark as sent
          </button>
        </form>
      )}
    </div>
  );
}
