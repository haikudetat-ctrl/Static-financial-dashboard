"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";

import { Badge, buttonClass, inputClass } from "@/components/ui";

import { matchInvoiceLineAction, postInvoiceAction } from "../../actions";

const SOURCE_LABEL: Record<string, string> = {
  code: "Vendor code",
  name: "Vendor name",
  alias: "Known alias",
  manual: "Matched by hand",
};

type Item = { id: string; name: string; code: string | null };

export function LineMatch({
  invoiceId,
  lineId,
  current,
  source,
  items,
  editable,
}: {
  invoiceId: string;
  lineId: string;
  current: { id: string; name: string } | null;
  source: string | null;
  items: Item[];
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const listId = useId();

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items.slice(0, 30);
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(term) || (item.code ?? "") === term,
      )
      .slice(0, 30);
  }, [items, query]);

  function choose(item: Item) {
    setOpen(false);
    setQuery("");
    start(async () => {
      const result = await matchInvoiceLineAction(
        invoiceId,
        lineId,
        item.id,
      ).catch(() => ({ ok: false as const, error: "Couldn't save." }));
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {current ? (
          <span className="font-medium">{current.name}</span>
        ) : (
          <Badge tone="warning">Not matched</Badge>
        )}
        {current && source && (
          <span className="text-xs text-[var(--muted)]">
            {SOURCE_LABEL[source] ?? source}
          </span>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={pending}
            className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
          >
            {pending ? "Saving…" : current ? "Change" : "Match item"}
          </button>
        )}
        {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
      </div>
    );
  }

  return (
    <div className="relative max-w-xs">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--muted)]"
      />
      <input
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-label="Find the inventory item"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && matches[0]) {
            event.preventDefault();
            choose(matches[0]);
          } else if (event.key === "Escape") setOpen(false);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search items"
        className={`${inputClass} h-8 pl-8`}
      />
      <ul
        id={listId}
        role="listbox"
        className="absolute z-20 mt-1 max-h-64 w-full min-w-64 overflow-y-auto rounded-md border bg-[var(--surface-strong)] py-1 shadow-lg"
      >
        {matches.map((item) => (
          <li
            key={item.id}
            role="option"
            aria-selected={false}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(item);
            }}
            className="cursor-pointer px-3 py-1.5 text-sm hover:bg-[var(--surface)]"
          >
            {item.name}
            {item.code && (
              <span className="ml-2 font-mono text-xs text-[var(--muted)]">
                #{item.code}
              </span>
            )}
          </li>
        ))}
        {matches.length === 0 && (
          <li className="px-3 py-2 text-sm text-[var(--muted)]">
            No items match.
          </li>
        )}
      </ul>
    </div>
  );
}

export function ApproveInvoiceButton({
  invoiceId,
  label,
  disabled,
}: {
  invoiceId: string;
  label: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {message && (
        <span role="status" className="text-xs text-[var(--danger)]">
          {message}
        </span>
      )}
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const result = await postInvoiceAction(invoiceId).catch(() => ({
              ok: false as const,
              error: "Couldn't approve. Try again.",
            }));
            if (!result.ok) setMessage(result.error);
            else router.refresh();
          })
        }
        className={buttonClass("primary")}
      >
        {pending ? "Approving…" : label}
      </button>
    </span>
  );
}
