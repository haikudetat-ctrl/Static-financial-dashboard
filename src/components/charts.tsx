import type { ClassCost } from "@/lib/reporting/pnl";

import { formatMoney } from "./ui";

/* Small, dependency-free charts drawn with CSS. Every value is also printed,
   so the charts never carry information on their own. */

export function DailySalesBars({
  days,
}: {
  days: Array<{ date: string; sales: number }>;
}) {
  const max = Math.max(...days.map((day) => day.sales), 1);
  const average =
    days.reduce((total, day) => total + day.sales, 0) / days.length;
  const latest = days.at(-1)?.date;
  return (
    <figure className="px-4 pt-4 pb-3">
      <div className="relative flex h-36 items-end gap-2 border-b border-[var(--line-strong)]">
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-[var(--accent-line)]"
          style={{ bottom: `${(average / max) * 100 * 0.82}%` }}
          aria-hidden="true"
        />
        {days.map((day) => (
          <div
            key={day.date}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <span
              className={`text-[11px] font-medium tabular-nums ${
                day.date === latest
                  ? "text-[var(--accent-strong)]"
                  : "text-[var(--muted)]"
              }`}
            >
              {formatMoney(day.sales, { compact: true, cents: false })}
            </span>
            <span
              className={`w-full max-w-9 rounded-t ${
                day.date === latest
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--foreground)] opacity-80"
              }`}
              style={{ height: `${(day.sales / max) * 82}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {days.map((day) => (
          <span
            key={day.date}
            className="flex-1 text-center text-[11px] font-medium text-[var(--muted)]"
          >
            {new Date(`${day.date}T12:00:00`).toLocaleDateString("en-US", {
              weekday: "short",
            })}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-[var(--muted)]">
        Dashed line: {formatMoney(average, { cents: false })} daily average
      </figcaption>
    </figure>
  );
}

const gapTone = (gap: number) =>
  gap > 0.02
    ? { text: "text-[var(--danger)]", fill: "bg-[var(--danger)]" }
    : gap > 0.005
      ? { text: "text-[var(--warning)]", fill: "bg-[var(--warning)]" }
      : { text: "text-[var(--success)]", fill: "bg-[var(--success)]" };

/** Actual against theoretical cost % per class, as a dot-and-ring row. */
export function ClassCostGap({ classes }: { classes: ClassCost[] }) {
  const rows = classes.filter(
    (row): row is ClassCost & { costPct: number; theoreticalPct: number } =>
      row.costPct !== null && row.theoreticalPct !== null && row.sales > 0,
  );
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-[var(--muted)]">
        Needs sales mapped to recipes and a cost of goods to compare.
      </p>
    );
  }
  const values = rows.flatMap((row) => [row.costPct, row.theoreticalPct]);
  const lo = Math.max(0, Math.min(...values) - 0.03);
  const hi = Math.max(...values) + 0.03;
  const at = (value: number) => `${((value - lo) / (hi - lo)) * 100}%`;
  return (
    <ul className="grid gap-3.5 px-4 py-4">
      {rows.map((row) => {
        const gap = row.costPct - row.theoreticalPct;
        const tone = gapTone(gap);
        const left = Math.min(row.costPct, row.theoreticalPct);
        return (
          <li
            key={row.cogsClass}
            className="grid grid-cols-[88px_minmax(0,1fr)_72px] items-center gap-3 text-xs"
          >
            <span className="truncate font-medium">{row.label}</span>
            <span
              className="relative h-3"
              role="img"
              aria-label={`${row.label}: actual ${(row.costPct * 100).toFixed(1)}%, theoretical ${(row.theoreticalPct * 100).toFixed(1)}%`}
            >
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-[var(--line)]" />
              <span
                className={`absolute top-1/2 h-1 -translate-y-1/2 opacity-50 ${tone.fill}`}
                style={{
                  left: at(left),
                  width: `${(Math.abs(gap) / (hi - lo)) * 100}%`,
                }}
              />
              <span
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-[var(--foreground)] bg-[var(--surface-strong)]"
                style={{ left: at(row.theoreticalPct) }}
              />
              <span
                className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${tone.fill}`}
                style={{ left: at(row.costPct) }}
              />
            </span>
            <span
              className={`text-right font-medium tabular-nums ${tone.text}`}
            >
              {gap > 0 ? "+" : gap < 0 ? "−" : ""}
              {Math.abs(gap * 100).toFixed(1)} pts
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** One stacked bar: where each dollar of sales went. */
export function SalesDollarBar({
  parts,
}: {
  parts: Array<{ label: string; value: number; className: string }>;
}) {
  const shown = parts.filter((part) => part.value > 0);
  return (
    <div className="px-4 py-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--line)]">
        {shown.map((part) => (
          <span
            key={part.label}
            className={part.className}
            style={{ width: `${Math.min(part.value, 1) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-2">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-sm ${part.className}`}
            />
            <span className="flex-1">{part.label}</span>
            <span className="font-medium tabular-nums">
              {(part.value * 100).toFixed(1)}¢
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
