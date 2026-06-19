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
          <button className="min-h-12 bg-[var(--foreground)] px-6 text-sm font-semibold text-white">
            Mark as sent
          </button>
        </form>
      )}
    </div>
  );
}
