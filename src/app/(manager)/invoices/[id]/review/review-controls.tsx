"use client";

import { Plus, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { Badge, buttonClass, inputClass, labelClass } from "@/components/ui";
import type { UnitOption } from "@/lib/invoices/new-item";

import {
  addItemFromInvoiceLineAction,
  matchInvoiceLineAction,
  postInvoiceAction,
} from "../../actions";

const SOURCE_LABEL: Record<string, string> = {
  code: "Vendor code",
  name: "Vendor name",
  alias: "Known alias",
  manual: "Matched by hand",
};

type Item = { id: string; name: string; code: string | null };

export type Suggestion = {
  itemId: string;
  name: string;
  code: string | null;
  score: number;
  reason: string;
};

export type NewItemContext = {
  description: string;
  packSize: string | null;
  invoiceUnit: string | null;
  defaults: {
    name: string;
    cogsClass: string;
    pack: { countUnitId: string; quantity: number } | null;
  };
  options: {
    categories: { id: string; name: string }[];
    units: UnitOption[];
    cogsClasses: { value: string; label: string }[];
  };
};

export function LineMatch({
  invoiceId,
  lineId,
  current,
  source,
  items,
  editable,
  suggestions = [],
  newItem = null,
}: {
  invoiceId: string;
  lineId: string;
  current: { id: string; name: string } | null;
  source: string | null;
  items: Item[];
  editable: boolean;
  suggestions?: Suggestion[];
  newItem?: NewItemContext | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const listId = useId();

  const suggested = useMemo(
    () =>
      suggestions
        .map((suggestion) => ({
          suggestion,
          item: items.find((item) => item.id === suggestion.itemId) ?? {
            id: suggestion.itemId,
            name: suggestion.name,
            code: suggestion.code,
          },
        }))
        .filter(({ item }) => item.id !== current?.id),
    [suggestions, items, current],
  );

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const suggestedIds = new Set(suggested.map(({ item }) => item.id));
    if (!term) {
      return items.filter((item) => !suggestedIds.has(item.id)).slice(0, 30);
    }
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(term) || (item.code ?? "") === term,
      )
      .slice(0, 30);
  }, [items, query, suggested]);

  const showSuggested = !query.trim() && suggested.length > 0;
  const top = suggested[0];

  function choose(item: Item) {
    setOpen(false);
    setQuery("");
    setError("");
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

  function startCreate(name?: string) {
    setOpen(false);
    setQuery("");
    setError("");
    setCreating(name?.trim() || newItem?.defaults.name || "");
  }

  const dialog =
    creating !== null && newItem ? (
      <NewItemDialog
        invoiceId={invoiceId}
        lineId={lineId}
        context={newItem}
        initialName={creating}
        onClose={() => setCreating(null)}
      />
    ) : null;

  if (!open) {
    return (
      <div className="grid gap-1.5">
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
              {pending ? "Saving…" : current ? "Change" : "Search items"}
            </button>
          )}
          {editable && !current && newItem && (
            <button
              type="button"
              onClick={() => startCreate()}
              disabled={pending}
              className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
            >
              New item
            </button>
          )}
        </div>
        {editable && !current && top && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <Sparkles
              aria-hidden="true"
              className="size-3.5 text-[var(--accent-strong)]"
            />
            <span className="text-[var(--muted)]">Suggested</span>
            <span className="font-medium text-[var(--foreground)]">
              {top.item.name}
            </span>
            <button
              type="button"
              onClick={() => choose(top.item)}
              disabled={pending}
              className={buttonClass("secondary", "sm")}
              aria-label={`Use ${top.item.name}`}
            >
              Use
            </button>
            <span className="basis-full pl-5 text-[var(--muted)]">
              {top.suggestion.reason}
            </span>
          </div>
        )}
        {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
        {dialog}
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
          const first = showSuggested ? suggested[0]?.item : matches[0];
          if (event.key === "Enter" && first) {
            event.preventDefault();
            choose(first);
          } else if (event.key === "Escape") setOpen(false);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search items"
        className={`${inputClass} h-8 pl-8`}
      />
      <ul
        id={listId}
        role="listbox"
        className="absolute z-20 mt-1 max-h-72 w-full min-w-72 overflow-y-auto rounded-md border bg-[var(--surface-strong)] py-1 shadow-lg"
      >
        {showSuggested && (
          <>
            <li
              role="presentation"
              className="px-3 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase"
            >
              Suggested
            </li>
            {suggested.map(({ item, suggestion }) => (
              <li
                key={`suggested-${item.id}`}
                role="option"
                aria-selected={false}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(item);
                }}
                className="cursor-pointer px-3 py-1.5 text-sm hover:bg-[var(--surface)]"
              >
                <span className="font-medium">{item.name}</span>
                {item.code && (
                  <span className="ml-2 font-mono text-xs text-[var(--muted)]">
                    #{item.code}
                  </span>
                )}
                <span className="block text-xs text-[var(--muted)]">
                  {suggestion.reason}
                </span>
              </li>
            ))}
            <li
              role="presentation"
              className="mt-1 border-t px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase"
            >
              All items
            </li>
          </>
        )}
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
        {newItem && (
          <li
            role="option"
            aria-selected={false}
            onMouseDown={(event) => {
              event.preventDefault();
              startCreate(query);
            }}
            className="mt-1 flex cursor-pointer items-center gap-1.5 border-t px-3 pt-2 pb-1.5 text-sm font-medium text-[var(--accent-strong)] hover:bg-[var(--surface)]"
          >
            <Plus aria-hidden="true" className="size-4" />
            {query.trim() ? `New item “${query.trim()}”` : "New item"}
          </li>
        )}
      </ul>
    </div>
  );
}

const UNIT_GROUP_LABEL: Record<string, string> = {
  each: "Count",
  volume: "Volume",
  weight: "Weight",
};

function NewItemDialog({
  invoiceId,
  lineId,
  context,
  initialName,
  onClose,
}: {
  invoiceId: string;
  lineId: string;
  context: NewItemContext;
  initialName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState(initialName);
  const [cogsClass, setCogsClass] = useState(context.defaults.cogsClass);
  const [categoryId, setCategoryId] = useState("");
  const [countUnitId, setCountUnitId] = useState(
    context.defaults.pack?.countUnitId ?? "",
  );
  const [quantity, setQuantity] = useState(
    context.defaults.pack ? String(context.defaults.pack.quantity) : "",
  );
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }, []);

  const groups = useMemo(() => {
    const byType = new Map<string, UnitOption[]>();
    for (const unit of context.options.units) {
      const list = byType.get(unit.unitType) ?? [];
      list.push(unit);
      byType.set(unit.unitType, list);
    }
    return [...byType.entries()];
  }, [context.options.units]);

  const unit = context.options.units.find(
    (option) => option.id === countUnitId,
  );
  const invoiceUnit = context.invoiceUnit?.trim() || "invoice unit";

  function close() {
    ref.current?.close?.();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    start(async () => {
      const result = await addItemFromInvoiceLineAction(invoiceId, lineId, {
        name,
        categoryId: categoryId || null,
        cogsClass,
        countUnitId,
        countUnitsPerInvoiceUnit: Number(quantity),
      }).catch(() => ({
        ok: false as const,
        error: "Couldn't create the item.",
      }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border bg-[var(--surface-strong)] p-0 text-[var(--foreground)] shadow-xl backdrop:bg-black/30"
    >
      <form onSubmit={submit} className="grid gap-4 p-5">
        <div>
          <h2 id={titleId} className="text-base font-semibold">
            New item
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            From “{context.description}”
            {context.packSize ? ` · ${context.packSize}` : ""}. The vendor’s
            code is saved with it, so the next invoice matches on its own.
          </p>
        </div>

        <label className={labelClass}>
          Name
          <input
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Cost class
            <select
              value={cogsClass}
              onChange={(event) => setCogsClass(event.target.value)}
              className={inputClass}
            >
              {context.options.cogsClasses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Category
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {context.options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={labelClass}>
          Count it in
          <select
            required
            value={countUnitId}
            onChange={(event) => setCountUnitId(event.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Pick a unit
            </option>
            {groups.map(([type, units]) => (
              <optgroup key={type} label={UNIT_GROUP_LABEL[type] ?? type}>
                {units.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          One {invoiceUnit} holds
          <span className="flex items-center gap-2">
            <input
              required
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={`${inputClass} w-28`}
              aria-label={`How many count units one ${invoiceUnit} holds`}
            />
            <span className="text-sm text-[var(--foreground)]">
              {unit?.name ?? "count units"}
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className={buttonClass("ghost")}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className={buttonClass("primary")}
          >
            {pending ? "Creating…" : "Create and match"}
          </button>
        </div>
      </form>
    </dialog>
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
