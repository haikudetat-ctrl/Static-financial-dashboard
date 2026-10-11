"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { managerNavigation, sectionNavigation } from "@/lib/navigation";

type Destination = { label: string; section: string; href: string };

const sectionLabel: Record<keyof typeof sectionNavigation, string> = {
  financials: "Financials",
  purchasing: "Purchasing",
  recipes: "Recipes",
  inventory: "Inventory",
  imports: "Imports",
  exceptions: "Exceptions",
};

const destinations: Destination[] = [
  ...managerNavigation.map((item) => ({
    label: item.label,
    section: item.description,
    href: item.href,
  })),
  ...Object.entries(sectionNavigation).flatMap(([key, items]) =>
    items
      .filter(
        (item) => !managerNavigation.some((nav) => nav.href === item.href),
      )
      .map((item) => ({
        label: item.label,
        section: sectionLabel[key as keyof typeof sectionNavigation],
        href: item.href,
      })),
  ),
  {
    label: "Start a count",
    section: "Inventory",
    href: "/inventory/counts/new",
  },
  { label: "New recipe", section: "Recipes", href: "/recipes/new" },
];

/** Jump to any screen by name. Opens with ⌘K / Ctrl+K. */
export function CommandMenu({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return destinations.filter((item) => {
      const text = `${item.label} ${item.section}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [query]);

  useEffect(() => {
    if (compact) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compact]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };
  const go = (item: Destination | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex size-9 items-center justify-center rounded-md border bg-[var(--surface-strong)]"
          aria-label="Search"
        >
          <Search size={17} strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-full items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-2.5 text-left text-xs text-[var(--muted)] transition hover:border-[var(--foreground)]"
        >
          <Search size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="flex-1">Search or jump to…</span>
          <kbd className="rounded border border-[var(--line-strong)] px-1 font-sans text-[10px]">
            ⌘K
          </kbd>
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-50 grid items-start justify-items-center bg-black/30 px-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Jump to"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-[var(--surface-strong)] shadow-2xl">
            <div className="flex items-center gap-2 border-b px-3">
              <Search
                size={16}
                strokeWidth={1.8}
                aria-hidden="true"
                className="text-[var(--muted)]"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") close();
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActive((i) => Math.min(i + 1, results.length - 1));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  }
                  if (event.key === "Enter") go(results[active]);
                }}
                placeholder="Jump to a screen…"
                aria-label="Jump to a screen"
                className="h-12 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none"
              />
            </div>
            <ul className="max-h-80 overflow-y-auto py-1" role="listbox">
              {results.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                  Nothing matches “{query}”.
                </li>
              )}
              {results.map((item, index) => (
                <li
                  key={item.href}
                  role="option"
                  aria-selected={index === active}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                      index === active ? "bg-[var(--surface)]" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {item.section}
                      </span>
                    </span>
                    {index === active && (
                      <CornerDownLeft
                        size={14}
                        aria-hidden="true"
                        className="text-[var(--muted)]"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
