"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonClass, inputClass } from "@/components/ui";

import { approveReadyInvoicesAction, setInvoiceDateAction } from "../actions";

const compactInput = inputClass.replace("h-9 w-full ", "");

/** Inline date field for invoices that arrived without one. */
export function InvoiceDateInput({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="date"
        value={value}
        aria-label="Invoice date"
        onChange={(event) => {
          const date = event.target.value;
          setValue(date);
          if (!date) return;
          setError("");
          start(async () => {
            const result = await setInvoiceDateAction(invoiceId, date).catch(
              () => ({ ok: false as const, error: "Couldn't save." }),
            );
            if (!result.ok) setError(result.error);
            else router.refresh();
          });
        }}
        className={`${compactInput} h-8 w-36 border-[var(--warning)] px-2`}
      />
      {pending && <span className="text-xs text-[var(--muted)]">Saving…</span>}
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </span>
  );
}

export function ApproveReadyButton({ count }: { count: number }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {message && (
        <span role="status" className="text-xs text-[var(--muted)]">
          {message}
        </span>
      )}
      <button
        type="button"
        disabled={pending || count === 0}
        onClick={() =>
          start(async () => {
            const result = await approveReadyInvoicesAction().catch(() => null);
            if (!result) {
              setMessage("Couldn't approve. Try again.");
              return;
            }
            const parts = [];
            if (result.received)
              parts.push(`${result.received} received into stock`);
            if (result.prices)
              parts.push(`${result.prices} recorded for prices`);
            if (result.failed.length)
              parts.push(`${result.failed.length} need attention`);
            setMessage(parts.join(" · ") || "Nothing to approve.");
            router.refresh();
          })
        }
        className={buttonClass("primary")}
      >
        {pending ? "Approving…" : `Approve ${count} ready`}
      </button>
    </span>
  );
}
