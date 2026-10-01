"use client";

import { Check, CircleAlert, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import {
  Badge,
  ButtonLink,
  Callout,
  buttonClass,
  inputClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/ui";
import type { CountSheetArea } from "@/lib/inventory/count-sheet";

import { finishCountAreaAction, saveCountEntryAction } from "../actions";

type SaveState = "idle" | "saving" | "saved" | "error";
type Entry = {
  quantity: string;
  tenths: number;
  status: string;
  save: SaveState;
  /** Edited since the last save. */
  dirty: boolean;
  error?: string;
};

const TENTHS = Array.from({ length: 10 }, (_, index) => index / 10);

function initialEntries(areas: CountSheetArea[]) {
  const entries: Record<string, Entry> = {};
  for (const area of areas) {
    for (const line of area.lines) {
      entries[line.id] = {
        quantity:
          line.countedQuantity === null ? "" : String(line.countedQuantity),
        tenths: line.countedTenths,
        status: line.status,
        save: "idle",
        dirty: false,
      };
    }
  }
  return entries;
}

export function CountSheet({
  countId,
  areas,
  editable,
}: {
  countId: string;
  areas: CountSheetArea[];
  editable: boolean;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(() => initialEntries(areas));
  const [areaStatus, setAreaStatus] = useState<Record<string, string>>(() =>
    Object.fromEntries(areas.map((area) => [area.assignmentId, area.status])),
  );
  const [activeId, setActiveId] = useState(
    () =>
      areas.find((area) => area.status !== "counted")?.assignmentId ??
      areas[0]?.assignmentId,
  );
  const [query, setQuery] = useState("");
  const [finishing, startFinish] = useTransition();
  const [finishError, setFinishError] = useState("");
  const [complete, setComplete] = useState(
    areas.length > 0 && areas.every((area) => area.status === "counted"),
  );
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const active = areas.find((area) => area.assignmentId === activeId);
  const progress = (area: CountSheetArea) =>
    area.lines.filter((line) => entries[line.id]?.status === "counted").length;
  const totalLines = areas.reduce((sum, area) => sum + area.lines.length, 0);
  const totalCounted = areas.reduce((sum, area) => sum + progress(area), 0);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return (active?.lines ?? []).map((line) => ({ line, area: active! }));
    }
    return areas.flatMap((area) =>
      area.lines
        .filter(
          (line) =>
            line.name.toLowerCase().includes(term) ||
            (line.itemCode ?? "").toLowerCase().includes(term),
        )
        .map((line) => ({ line, area })),
    );
  }, [query, active, areas]);

  function update(lineId: string, patch: Partial<Entry>) {
    setEntries((current) => ({
      ...current,
      [lineId]: { ...current[lineId], ...patch },
    }));
  }

  async function save(
    lineId: string,
    assignmentId: string,
    next: { quantity: string; tenths: number },
  ) {
    const trimmed = next.quantity.trim();
    const quantity = trimmed === "" ? null : Number(trimmed);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
      update(lineId, { save: "error", error: "Enter a number", dirty: true });
      return;
    }
    update(lineId, { save: "saving", error: undefined, dirty: false });
    const result = await saveCountEntryAction(
      countId,
      lineId,
      quantity,
      quantity === null ? 0 : next.tenths,
    );
    if (result.ok) {
      update(lineId, {
        save: "saved",
        status: quantity === null ? "pending" : "counted",
        tenths: quantity === null ? 0 : next.tenths,
      });
      if (areaStatus[assignmentId] === "counted") {
        setAreaStatus((current) => ({
          ...current,
          [assignmentId]: "in_progress",
        }));
        setComplete(false);
      }
    } else {
      update(lineId, { save: "error", error: result.error, dirty: true });
    }
  }

  function focusNext(lineId: string) {
    const index = visible.findIndex(({ line }) => line.id === lineId);
    const next = visible[index + 1];
    if (next) {
      const input = inputs.current.get(next.line.id);
      input?.focus();
      input?.select();
    }
  }

  function finishArea() {
    if (!active) return;
    const blanks = active.lines.filter(
      (line) => entries[line.id]?.status !== "counted",
    ).length;
    if (
      blanks > 0 &&
      !window.confirm(
        `${blanks} item${blanks === 1 ? " is" : "s are"} blank in ${active.name}. Count ${blanks === 1 ? "it" : "them"} as zero on hand?`,
      )
    ) {
      return;
    }
    setFinishError("");
    startFinish(async () => {
      const result = await finishCountAreaAction(
        countId,
        active.assignmentId,
        blanks > 0,
      );
      if (!result.ok) {
        setFinishError(result.error);
        return;
      }
      setEntries((current) => {
        const nextEntries = { ...current };
        for (const line of active.lines) {
          if (nextEntries[line.id].status !== "counted") {
            nextEntries[line.id] = {
              ...nextEntries[line.id],
              quantity: "0",
              tenths: 0,
              status: "counted",
            };
          }
        }
        return nextEntries;
      });
      setAreaStatus((current) => ({
        ...current,
        [active.assignmentId]: "counted",
      }));
      if (result.countComplete) {
        setComplete(true);
        router.refresh();
      } else {
        const nextArea = areas.find(
          (area) =>
            area.assignmentId !== active.assignmentId &&
            areaStatus[area.assignmentId] !== "counted",
        );
        if (nextArea) setActiveId(nextArea.assignmentId);
      }
    });
  }

  const activeCounted = active ? progress(active) : 0;

  return (
    <div className="grid gap-5">
      {complete && (
        <Callout
          tone="good"
          title="Every area is counted"
          action={
            <ButtonLink
              href={`/inventory/counts/${countId}/review`}
              variant="primary"
              size="sm"
            >
              Review and approve
            </ButtonLink>
          }
        >
          Check variances against expected on-hand, then approve to post the
          count to inventory.
        </Callout>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav
          aria-label="Storage areas"
          className="hidden rounded-lg border bg-[var(--surface-strong)] lg:block"
        >
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Storage areas</p>
            <p className="mt-0.5 text-xs text-[var(--muted)] tabular-nums">
              {totalCounted} of {totalLines} items counted
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
              <div
                className="h-full rounded-full bg-[var(--success)]"
                style={{
                  width: `${totalLines ? (totalCounted / totalLines) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <ul className="max-h-[70vh] overflow-y-auto py-1">
            {areas.map((area) => {
              const done = areaStatus[area.assignmentId] === "counted";
              const counted = progress(area);
              const isActive = area.assignmentId === activeId && !query;
              return (
                <li key={area.assignmentId}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(area.assignmentId);
                      setQuery("");
                    }}
                    aria-current={isActive ? "true" : undefined}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition ${
                      isActive
                        ? "bg-[var(--surface)] font-semibold"
                        : "hover:bg-[var(--surface)]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid size-4 shrink-0 place-items-center rounded-full border ${
                        done
                          ? "border-[var(--success)] bg-[var(--success)] text-white"
                          : counted > 0
                            ? "border-[var(--accent)]"
                            : "border-[var(--line-strong)]"
                      }`}
                    >
                      {done && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{area.name}</span>
                    <span className="text-xs font-normal text-[var(--muted)] tabular-nums">
                      {counted}/{area.lines.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="min-w-0 rounded-lg border bg-[var(--surface-strong)]">
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="area-select">
                Storage area
              </label>
              <select
                id="area-select"
                value={activeId}
                onChange={(event) => {
                  setActiveId(event.target.value);
                  setQuery("");
                }}
                className={`${inputClass} mb-2 lg:hidden`}
              >
                {areas.map((area) => (
                  <option key={area.assignmentId} value={area.assignmentId}>
                    {area.name} ({progress(area)}/{area.lines.length})
                  </option>
                ))}
              </select>
              <h2 className="text-sm font-semibold">
                {query ? "Search results" : (active?.name ?? "No areas")}
              </h2>
              {!query && active && (
                <p className="text-xs text-[var(--muted)] tabular-nums">
                  {activeCounted} of {active.lines.length} counted
                  {areaStatus[active.assignmentId] === "counted" &&
                    " · finished"}
                </p>
              )}
            </div>
            <div className="relative w-full sm:w-56">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--muted)]"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find an item"
                aria-label="Find an item in this count"
                className={`${inputClass} pl-8`}
              />
            </div>
            {editable && !query && active && (
              <button
                type="button"
                onClick={finishArea}
                disabled={finishing}
                className={buttonClass(
                  activeCounted === active.lines.length
                    ? "primary"
                    : "secondary",
                )}
              >
                {finishing ? "Finishing…" : "Finish area"}
              </button>
            )}
          </div>
          {finishError && (
            <p
              role="alert"
              className="border-b px-4 py-2 text-sm text-[var(--danger)]"
            >
              {finishError}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={`${thClass} hidden w-20 sm:table-cell`}>
                    Code
                  </th>
                  <th className={thClass}>Item</th>
                  <th className={`${thClass} hidden md:table-cell`}>
                    Count unit
                  </th>
                  <th className={`${thClass} w-28 text-right`}>Full</th>
                  <th className={`${thClass} w-24 text-right`}>Partial</th>
                  <th className={`${thClass} w-8`}>
                    <span className="sr-only">Saved</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ line, area }) => {
                  const entry = entries[line.id];
                  return (
                    <tr
                      key={line.id}
                      className={
                        entry.status === "recount_requested"
                          ? "bg-[#fdf8ee]"
                          : undefined
                      }
                    >
                      <td
                        className={`${tdClass} hidden font-mono text-xs text-[var(--muted)] sm:table-cell`}
                      >
                        {line.itemCode ?? ""}
                      </td>
                      <td className={tdClass}>
                        <span className="font-medium">{line.name}</span>
                        <span className="block text-xs text-[var(--muted)]">
                          {query ? area.name : line.category}
                          <span className="md:hidden"> · {line.unit}</span>
                        </span>
                        {entry.status === "recount_requested" && (
                          <span className="mt-1 inline-block">
                            <Badge tone="warning">Recount requested</Badge>
                          </span>
                        )}
                      </td>
                      <td
                        className={`${tdClass} hidden text-[var(--muted)] md:table-cell`}
                      >
                        {line.unit}
                      </td>
                      <td className={`${tdClass} py-1.5 text-right`}>
                        <input
                          ref={(element) => {
                            if (element) inputs.current.set(line.id, element);
                            else inputs.current.delete(line.id);
                          }}
                          type="text"
                          inputMode="decimal"
                          disabled={!editable}
                          value={entry.quantity}
                          aria-label={`Full ${line.unit} of ${line.name}`}
                          onChange={(event) =>
                            update(line.id, {
                              quantity: event.target.value,
                              save: "idle",
                              dirty: true,
                            })
                          }
                          onFocus={(event) => event.target.select()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              focusNext(line.id);
                            }
                          }}
                          onBlur={() => {
                            if (!entry.dirty) return;
                            void save(line.id, area.assignmentId, {
                              quantity: entry.quantity,
                              tenths: entry.tenths,
                            });
                          }}
                          className={`${inputClass} w-24 text-right tabular-nums ${
                            entry.save === "error"
                              ? "border-[var(--danger)]"
                              : ""
                          }`}
                        />
                      </td>
                      <td className={`${tdClass} py-1.5 text-right`}>
                        {line.allowsTenths ? (
                          <select
                            disabled={!editable}
                            value={entry.tenths}
                            aria-label={`Partial ${line.unit} of ${line.name}`}
                            onChange={(event) => {
                              const tenths = Number(event.target.value);
                              const quantity =
                                entry.quantity.trim() === ""
                                  ? "0"
                                  : entry.quantity;
                              update(line.id, { tenths, quantity });
                              void save(line.id, area.assignmentId, {
                                quantity,
                                tenths,
                              });
                            }}
                            className={`${inputClass} w-20 text-right tabular-nums`}
                          >
                            {TENTHS.map((value) => (
                              <option key={value} value={value}>
                                {value === 0 ? "—" : value.toFixed(1)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className={`${tdClass} px-2`}>
                        {entry.save === "saving" ? (
                          <Loader2
                            aria-label="Saving"
                            className="size-4 animate-spin text-[var(--muted)]"
                          />
                        ) : entry.save === "error" ? (
                          <CircleAlert
                            aria-label={entry.error ?? "Not saved"}
                            className="size-4 text-[var(--danger)]"
                          >
                            <title>{entry.error ?? "Not saved"}</title>
                          </CircleAlert>
                        ) : entry.status === "counted" ? (
                          <Check
                            aria-label="Counted"
                            className="size-4 text-[var(--success)]"
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                    >
                      {query
                        ? `No items match “${query}”.`
                        : "This area has no items."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
