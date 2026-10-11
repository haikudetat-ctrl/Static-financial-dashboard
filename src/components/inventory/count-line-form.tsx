"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { saveCountLineAction } from "@/app/(staff)/count/actions";
import { ExpectedQuantityReveal } from "@/components/inventory/expected-quantity-reveal";

type Line = {
  id: string;
  name: string;
  unit: string;
  allowsTenths: boolean;
  countedQuantity: number | null;
  countedTenths: number;
  isOpenContainer: boolean;
  notes: string;
  status: string;
  expectedQuantity: string;
};

const TENTHS = Array.from({ length: 10 }, (_, index) => index / 10);

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="mt-4 min-h-12 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

/**
 * One item on a count sheet. Counted items fold to a single row so the next
 * item to count is always the first open card.
 */
export function CountLineForm({
  line,
  next = false,
}: {
  line: Line;
  /** The first item still to count in walk order. */
  next?: boolean;
}) {
  const counted = line.status === "counted";
  const [editing, setEditing] = useState(!counted);
  const [quantity, setQuantity] = useState(
    line.countedQuantity === null ? "" : String(line.countedQuantity),
  );
  const [tenths, setTenths] = useState(
    line.isOpenContainer ? line.countedTenths : 0,
  );
  const [showNote, setShowNote] = useState(Boolean(line.notes));
  const action = saveCountLineAction.bind(null, line.id);

  const whole = Number(quantity) || 0;
  const total = `${Number((whole + tenths).toFixed(1))} ${line.unit}`;
  const step = (by: number) =>
    setQuantity(String(Math.max(0, Math.floor(whole) + by)));

  if (!editing) {
    return (
      <div className="flex items-center gap-3 border-t bg-[var(--surface-strong)] px-4 py-3">
        <Check
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0 text-[var(--success)]"
        />
        <p className="min-w-0 flex-1 truncate text-sm text-[var(--muted)]">
          {line.name}
        </p>
        <p className="text-sm font-medium text-[var(--success)] tabular-nums">
          {total}
        </p>
        <span className="sr-only">counted</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-semibold text-[var(--accent-strong)] underline underline-offset-4"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className={`border-t bg-[var(--surface-strong)] p-4 ${
        next ? "shadow-[inset_3px_0_0_var(--accent)]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {next && (
            <p className="font-mono text-[10px] tracking-[0.12em] text-[var(--accent-strong)] uppercase">
              Next up
            </p>
          )}
          <h3 className="text-lg font-semibold tracking-[-0.01em]">
            {line.name}
          </h3>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-strong)]">
          {line.status === "recount_requested" ? "Recount" : `In ${line.unit}`}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={whole <= 0}
          aria-label="One less"
          className="grid size-16 place-items-center rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] transition active:scale-95 disabled:opacity-40"
        >
          <Minus size={26} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <label className="grid justify-items-center gap-1 text-xs font-medium text-[var(--muted)]">
          <span className="sr-only">Quantity</span>
          <input
            name="counted_quantity"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
            placeholder="0"
            aria-label="Quantity"
            className="w-full min-w-0 bg-transparent text-center text-5xl font-semibold tracking-[-0.03em] text-[var(--foreground)] tabular-nums outline-none"
          />
          <span aria-hidden="true">
            {line.allowsTenths && tenths > 0
              ? `${total} with the open bottle`
              : `full ${line.unit}`}
          </span>
        </label>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="One more"
          className="grid size-16 place-items-center rounded-2xl bg-[var(--foreground)] text-white transition active:scale-95"
        >
          <Plus size={26} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>

      {line.allowsTenths && (
        <fieldset className="mt-4">
          <legend className="text-xs font-medium">
            Open bottle — tap the fill level
          </legend>
          <div className="mt-2 grid grid-cols-10 gap-1">
            {TENTHS.map((value) => (
              <label key={value} className="relative">
                <input
                  type="radio"
                  name="counted_tenths"
                  value={value}
                  checked={tenths === value}
                  onChange={() => setTenths(value)}
                  className="peer sr-only"
                />
                <span className="grid h-11 place-items-center rounded-lg border bg-[var(--surface)] text-xs font-medium tabular-nums transition peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent)] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--accent)]">
                  {value === 0 ? "0" : `.${Math.round(value * 10)}`}
                </span>
              </label>
            ))}
          </div>
          {tenths > 0 && (
            <input type="hidden" name="is_open_container" value="on" />
          )}
        </fieldset>
      )}

      <ExpectedQuantityReveal value={line.expectedQuantity} />

      {showNote ? (
        <label className="mt-3 grid gap-1.5 text-xs font-medium">
          Note
          <input
            name="notes"
            defaultValue={line.notes}
            className="h-10 rounded-md border bg-white px-3 text-sm font-normal"
            placeholder="Condition or location"
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          className="mt-3 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]"
        >
          Add note
        </button>
      )}

      <SaveButton label={quantity === "" ? "Save item" : `Save ${total}`} />
    </form>
  );
}
