"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Badge,
  formatMoney,
  formatPercent,
  inputClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/ui";
import type { VarianceRow } from "@/lib/inventory/variance";

type SortKey =
  | "name"
  | "actualQty"
  | "theoreticalQty"
  | "varianceQty"
  | "varianceValue"
  | "variancePct";

const qty = (value: number) =>
  Math.abs(value) < 0.05 ? "0" : value.toFixed(1);

export function VarianceTable({ rows }: { rows: VarianceRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "varianceValue",
    dir: -1,
  });
  const [query, setQuery] = useState("");
  const [onlyShort, setOnlyShort] = useState(false);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows
      .filter((row) => !term || row.name.toLowerCase().includes(term))
      .filter((row) => !onlyShort || (row.counted && row.varianceValue > 1))
      .sort((a, b) => {
        // Items missing from the closing count always sit at the bottom.
        if (a.counted !== b.counted) return a.counted ? -1 : 1;
        const left = sort.key === "name" ? a.name.toLowerCase() : a[sort.key];
        const right = sort.key === "name" ? b.name.toLowerCase() : b[sort.key];
        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        return left < right ? -sort.dir : left > right ? sort.dir : 0;
      });
  }, [rows, query, onlyShort, sort]);

  const header = (key: SortKey, label: string, numeric = true) => (
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
        onClick={() =>
          setSort((current) =>
            current.key === key
              ? { key, dir: current.dir === 1 ? -1 : 1 }
              : { key, dir: key === "name" ? 1 : -1 },
          )
        }
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyShort}
            onChange={(event) => setOnlyShort(event.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Only items short
        </label>
        <div className="relative ml-auto w-56">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items"
            aria-label="Search items"
            className={`${inputClass} pl-8`}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className={`${tableClass} min-w-[820px]`}>
          <thead>
            <tr>
              {header("name", "Item", false)}
              <th className={`${thClass} text-right`}>Opening</th>
              <th className={`${thClass} text-right`}>Received</th>
              <th className={`${thClass} text-right`}>Closing</th>
              {header("actualQty", "Used")}
              {header("theoreticalQty", "Sold")}
              {header("varianceQty", "Variance")}
              {header("varianceValue", "Variance $")}
              {header("variancePct", "%")}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const short = row.counted && row.varianceValue > 1;
              return (
                <tr
                  key={row.itemId}
                  className={
                    row.counted
                      ? "hover:bg-[var(--surface)]"
                      : "text-[var(--muted)]"
                  }
                >
                  <td className={tdClass}>
                    <span className="font-medium">{row.name}</span>
                    <span className="block text-xs text-[var(--muted)]">
                      {row.unit}
                      {row.category && ` · ${row.category}`}
                    </span>
                    {!row.counted && (
                      <span className="mt-1 inline-block">
                        <Badge>Not in closing count</Badge>
                      </span>
                    )}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {qty(row.openingQty)}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {qty(row.purchasedQty)}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {qty(row.closingQty)}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {qty(row.actualQty)}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {qty(row.theoreticalQty)}
                  </td>
                  <td
                    className={`${tdClass} text-right tabular-nums ${short ? "font-semibold text-[var(--danger)]" : ""}`}
                  >
                    {row.varianceQty > 0.05 ? "+" : ""}
                    {qty(row.varianceQty)}
                  </td>
                  <td
                    className={`${tdClass} text-right tabular-nums ${short ? "font-semibold text-[var(--danger)]" : ""}`}
                  >
                    {row.unitCost === null
                      ? "—"
                      : `${row.varianceValue > 0.005 ? "+" : ""}${formatMoney(row.varianceValue)}`}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {formatPercent(row.variancePct, 0)}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                >
                  {onlyShort ? "Nothing is short. Nice." : "No items match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-2.5 text-xs text-[var(--muted)]">
        Used = opening + received − closing. Sold = Toast sales through recipes.
        Positive variance means more left the shelf than sales explain
        (over-pours, comps, spills, theft or a recipe that&apos;s off). Batches
        count as their own item; making a batch is a move, not usage.
      </p>
    </section>
  );
}
