"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  Badge,
  buttonClass,
  formatMoney,
  inputClass,
  tableClass,
  tdClass,
  thClass,
  type Tone,
} from "@/components/ui";
import { COST_SOURCE_LABEL, type CostSource } from "@/lib/recipes/costing";

import { setIngredientCostAction } from "../actions";

type Unit = { id: string; abbreviation: string; factor: number };

export type IngredientRow = {
  id: string;
  name: string;
  code: string | null;
  category: string;
  cogsClass: string | null;
  isProduced: boolean;
  /** Cost per base unit. */
  unitCost: number | null;
  source: CostSource;
  display: { abbreviation: string; factor: number } | null;
  /** The bottle, can or pack the item is counted in, when that differs. */
  pack: { abbreviation: string; factor: number } | null;
  priceUnits: Unit[];
  usedIn: string[];
  outputRecipeId: string | null;
  hasManualCost: boolean;
  lastPurchase: { vendor: string; casePrice: number; pack: string } | null;
};

type View = "missing" | "used" | "house" | "all";
type SortKey = "name" | "category" | "cost" | "pack" | "source" | "used";

const SOURCE_TONE: Record<CostSource, Tone> = {
  on_hand: "good",
  recipe: "accent",
  manual: "neutral",
  snapshot: "neutral",
  vendor: "neutral",
  missing: "warning",
};

const SOURCE_ORDER: CostSource[] = [
  "missing",
  "manual",
  "recipe",
  "vendor",
  "snapshot",
  "on_hand",
];

/** Ingredients whose cost can be typed in (others come from stock or a recipe). */
const editable = (row: IngredientRow) =>
  row.source !== "on_hand" && row.source !== "recipe";

const compactInput = inputClass.replace("h-9 w-full ", "");

export function IngredientTable({
  rows: initialRows,
  initialView,
}: {
  rows: IngredientRow[];
  initialView: View;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>(() =>
    initialView === "missing"
      ? { key: "used", dir: -1 }
      : { key: "name", dir: 1 },
  );
  const [editing, setEditing] = useState<string | null>(null);
  // Rows missing a cost when the page loaded stay in that view after they
  // are filled in, so the list doesn't jump while working through it.
  const [initiallyMissing] = useState(
    () =>
      new Set(
        initialRows.filter((row) => row.unitCost === null).map((row) => row.id),
      ),
  );

  const categories = useMemo(
    () => [...new Set(rows.map((row) => row.category).filter(Boolean))].sort(),
    [rows],
  );

  const inView = (row: IngredientRow, which: View) =>
    which === "missing"
      ? initiallyMissing.has(row.id)
      : which === "used"
        ? row.usedIn.length > 0
        : which === "house"
          ? row.isProduced
          : true;

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const perDisplay = (row: IngredientRow) =>
      row.unitCost === null ? null : row.unitCost * (row.display?.factor ?? 1);
    const perPack = (row: IngredientRow) =>
      row.unitCost === null || !row.pack
        ? null
        : row.unitCost * row.pack.factor;
    const value = (row: IngredientRow): string | number | null => {
      switch (sort.key) {
        case "name":
          return row.name.toLowerCase();
        case "category":
          return row.category.toLowerCase() || null;
        case "cost":
          return perDisplay(row);
        case "pack":
          return perPack(row);
        case "source":
          return SOURCE_ORDER.indexOf(row.source);
        case "used":
          return row.usedIn.length;
      }
    };
    return rows
      .filter((row) => inView(row, view))
      .filter((row) => !category || row.category === category)
      .filter(
        (row) =>
          !term ||
          row.name.toLowerCase().includes(term) ||
          (row.code ?? "").toLowerCase() === term,
      )
      .sort((a, b) => {
        const left = value(a);
        const right = value(b);
        // Blanks always sort last, whichever way the column is sorted.
        if (left === null && right === null)
          return a.name.localeCompare(b.name);
        if (left === null) return 1;
        if (right === null) return -1;
        if (left < right) return -sort.dir;
        if (left > right) return sort.dir;
        return a.name.localeCompare(b.name);
      });
    // inView reads initiallyMissing, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, view, query, category, sort]);

  const counts: Record<View, number> = {
    missing: rows.filter((row) => inView(row, "missing")).length,
    used: rows.filter((row) => inView(row, "used")).length,
    house: rows.filter((row) => inView(row, "house")).length,
    all: rows.length,
  };

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 1 ? -1 : 1 }
        : {
            key,
            dir: key === "used" || key === "cost" || key === "pack" ? -1 : 1,
          },
    );
  }

  function saved(rowId: string, unitCost: number | null) {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              unitCost,
              source: unitCost === null ? "missing" : "manual",
              hasManualCost: unitCost !== null,
            }
          : row,
      ),
    );
    // Move straight on to the next ingredient that still needs a cost.
    const index = visible.findIndex((row) => row.id === rowId);
    const next = visible
      .slice(index + 1)
      .find((row) => row.unitCost === null && editable(row));
    setEditing(view === "missing" && next ? next.id : null);
    if (unitCost === null) router.refresh();
  }

  const header = (key: SortKey, label: string, numeric = false) => (
    <th
      className={`${thClass} ${numeric ? "text-right" : ""}`}
      aria-sort={
        sort.key === key
          ? sort.dir === 1
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-1 hover:text-[var(--foreground)] ${
          sort.key === key ? "text-[var(--foreground)]" : ""
        }`}
      >
        {label}
        {sort.key === key &&
          (sort.dir === 1 ? (
            <ArrowUp className="size-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3" aria-hidden="true" />
          ))}
      </button>
    </th>
  );

  return (
    <section className="rounded-lg border bg-[var(--surface-strong)]">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div
          role="tablist"
          aria-label="Ingredient view"
          className="flex flex-wrap gap-1.5"
        >
          {(
            [
              ["missing", "Needs a cost"],
              ["used", "Used in recipes"],
              ["house", "House-made"],
              ["all", "All"],
            ] as Array<[View, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => {
                setView(key);
                setEditing(null);
                if (key === "missing") setSort({ key: "used", dir: -1 });
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                view === key
                  ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                  : "border-[var(--line-strong)] hover:bg-[var(--surface)]"
              }`}
            >
              {label}
              <span className="ml-1.5 tabular-nums opacity-70">
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Category"
            className={`${compactInput} h-9 w-44`}
          >
            <option value="">All categories</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <div className="relative w-56">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or code"
              aria-label="Search ingredients"
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={`${tableClass} min-w-[860px]`}>
          <thead>
            <tr>
              {header("name", "Ingredient")}
              {header("category", "Category")}
              {header("cost", "Cost", true)}
              {header("pack", "Per bottle / pack", true)}
              {header("source", "Source")}
              {header("used", "Used in", true)}
              <th className={thClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <IngredientRowView
                key={row.id}
                row={row}
                editing={editing === row.id}
                onEdit={() => setEditing(row.id)}
                onCancel={() => setEditing(null)}
                onSaved={(unitCost) => saved(row.id, unitCost)}
              />
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                >
                  {view === "missing" && !query && !category
                    ? "Every ingredient has a cost."
                    : "No ingredients match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IngredientRowView({
  row,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  row: IngredientRow;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (unitCost: number | null) => void;
}) {
  const perDisplay =
    row.unitCost === null ? null : row.unitCost * (row.display?.factor ?? 1);
  const perPack =
    row.unitCost === null || !row.pack ? null : row.unitCost * row.pack.factor;
  const purchase = row.lastPurchase
    ? `Last invoice: ${row.lastPurchase.vendor}, ${formatMoney(row.lastPurchase.casePrice)}${row.lastPurchase.pack ? ` for ${row.lastPurchase.pack}` : ""}`
    : undefined;

  return (
    <>
      <tr
        className={
          editing ? "bg-[var(--surface)]" : "hover:bg-[var(--surface)]"
        }
      >
        <td className={tdClass}>
          <span className="font-medium">{row.name}</span>
          {row.code && (
            <span className="ml-2 font-mono text-xs text-[var(--muted)]">
              #{row.code}
            </span>
          )}
        </td>
        <td className={`${tdClass} text-[var(--muted)]`}>
          {row.category || "—"}
        </td>
        <td className={`${tdClass} text-right whitespace-nowrap tabular-nums`}>
          {perDisplay === null ? (
            <span className="text-[var(--muted)]">—</span>
          ) : (
            <>
              {formatMoney(perDisplay)}
              <span className="text-xs text-[var(--muted)]">
                {" "}
                / {row.display?.abbreviation ?? "unit"}
              </span>
            </>
          )}
        </td>
        <td className={`${tdClass} text-right whitespace-nowrap tabular-nums`}>
          {perPack === null ? (
            <span className="text-[var(--muted)]">—</span>
          ) : (
            <>
              {formatMoney(perPack)}
              <span className="text-xs text-[var(--muted)]">
                {" "}
                / {row.pack?.abbreviation}
              </span>
            </>
          )}
        </td>
        <td className={tdClass} title={purchase}>
          <Badge tone={SOURCE_TONE[row.source]}>
            {COST_SOURCE_LABEL[row.source]}
          </Badge>
        </td>
        <td
          className={`${tdClass} text-right tabular-nums`}
          title={row.usedIn.length ? row.usedIn.join(", ") : undefined}
        >
          {row.usedIn.length || <span className="text-[var(--muted)]">—</span>}
        </td>
        <td className={`${tdClass} text-right whitespace-nowrap`}>
          {row.source === "recipe" && row.outputRecipeId ? (
            <Link
              href={`/recipes/${row.outputRecipeId}`}
              className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
            >
              Open recipe
            </Link>
          ) : row.source === "on_hand" ? (
            <span className="text-xs text-[var(--muted)]">From stock</span>
          ) : editing ? null : (
            <span className="inline-flex items-center gap-3">
              {row.isProduced &&
                !row.outputRecipeId &&
                row.unitCost === null && (
                  <Link
                    href={`/recipes/new?type=prep&output=${row.id}`}
                    className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
                  >
                    Write recipe
                  </Link>
                )}
              <button
                type="button"
                onClick={onEdit}
                className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
              >
                {row.unitCost === null ? "Set cost" : "Change"}
              </button>
            </span>
          )}
        </td>
      </tr>
      {editing && editable(row) && (
        <tr className="bg-[var(--surface)]">
          <td colSpan={7} className="border-b px-4 pb-3">
            <CostForm row={row} onCancel={onCancel} onSaved={onSaved} />
          </td>
        </tr>
      )}
    </>
  );
}

function CostForm({
  row,
  onCancel,
  onSaved,
}: {
  row: IngredientRow;
  onCancel: () => void;
  onSaved: (unitCost: number | null) => void;
}) {
  const [amount, setAmount] = useState("");
  const [unitId, setUnitId] = useState(row.priceUnits[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function submit(value: number | null) {
    const unit = row.priceUnits.find((candidate) => candidate.id === unitId);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError("Enter a price of zero or more.");
      return;
    }
    start(async () => {
      const result = await setIngredientCostAction(row.id, value, unitId).catch(
        () => ({ ok: false as const, error: "Couldn't save. Try again." }),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(value === null || !unit ? null : value / unit.factor);
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (amount.trim() === "") return;
        submit(Number(amount.replace(/[$,]/g, "")));
      }}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <span className="text-[var(--muted)]">{row.name} costs</span>
      <span>$</span>
      <input
        autoFocus
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="0.00"
        aria-label={`Price of ${row.name}`}
        className={`${compactInput} h-8 w-24 text-right tabular-nums`}
      />
      <span className="text-[var(--muted)]">per</span>
      <select
        value={unitId}
        onChange={(event) => setUnitId(event.target.value)}
        aria-label="Per unit"
        className={`${compactInput} h-8 w-40`}
      >
        {row.priceUnits.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.abbreviation}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary", "sm")}
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {row.hasManualCost && (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(null)}
          className={buttonClass("ghost", "sm")}
        >
          Clear my cost
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        className={buttonClass("ghost", "sm")}
      >
        Cancel
      </button>
      {row.lastPurchase && (
        <span className="text-xs text-[var(--muted)]">
          Last invoice: {row.lastPurchase.vendor},{" "}
          {formatMoney(row.lastPurchase.casePrice)}
          {row.lastPurchase.pack && ` for ${row.lastPurchase.pack}`}
        </span>
      )}
      {error && (
        <span role="alert" className="text-[var(--danger)]">
          {error}
        </span>
      )}
    </form>
  );
}
