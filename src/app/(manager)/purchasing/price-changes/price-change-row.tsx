import { TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";

import {
  Badge,
  buttonClass,
  formatMoney,
  formatPercent,
} from "@/components/ui";
import type { PriceChange } from "@/lib/purchasing/price-changes";

import { reviewPriceChangesAction } from "./actions";

export const signedMoney = (value: number, cents = true) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value), { cents })}`;

export function PriceChangeRow({ change }: { change: PriceChange }) {
  const up = change.direction === "up";
  const Icon = up ? TrendingUp : TrendingDown;
  const main = change.pack ?? change.display;
  return (
    <li className="grid gap-3 border-b px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Icon
            aria-hidden="true"
            className={`size-4 ${up ? "text-[var(--danger)]" : "text-[var(--success)]"}`}
          />
          <span className="font-medium">{change.itemName}</span>
          <Badge
            tone={
              change.severity === "critical"
                ? "danger"
                : up
                  ? "warning"
                  : "good"
            }
          >
            {up ? "+" : ""}
            {formatPercent(change.changePct)}
          </Badge>
          {change.status !== "open" && <Badge>Reviewed</Badge>}
        </p>
        <p className="mt-1 text-sm tabular-nums">
          {formatMoney(main.previous)} →{" "}
          <strong>{formatMoney(main.current)}</strong>
          <span className="text-[var(--muted)]"> / {main.unit}</span>
          {change.pack && (
            <span className="text-xs text-[var(--muted)]">
              {" "}
              · {formatMoney(change.display.current)} / {change.display.unit}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {change.vendorName}
          {change.invoice && (
            <>
              {" · "}
              <Link
                href={`/invoices/${change.invoice.id}/review`}
                className="hover:underline"
              >
                invoice #{change.invoice.number}
              </Link>{" "}
              on {change.invoice.date}
            </>
          )}
        </p>
      </div>

      <div className="min-w-0 text-sm">
        {change.drinks.length === 0 ? (
          <p className="text-[var(--muted)]">Not used in any active drink.</p>
        ) : (
          <>
            <p className="text-xs font-medium text-[var(--muted)]">
              {change.drinks.length} drink
              {change.drinks.length === 1 ? "" : "s"}
              {change.monthlyImpact !== 0 &&
                ` · ${signedMoney(change.monthlyImpact, false)} a month at recent sales`}
            </p>
            <ul className="mt-1 grid gap-0.5">
              {change.drinks.slice(0, 4).map((drink) => (
                <li key={drink.recipeId} className="flex items-baseline gap-2">
                  <Link
                    href={`/recipes/${drink.recipeId}`}
                    className="min-w-0 truncate hover:underline"
                  >
                    {drink.name}
                  </Link>
                  <span className="ml-auto shrink-0 text-xs text-[var(--muted)] tabular-nums">
                    {signedMoney(drink.delta)} / drink
                    {drink.pourCostAfter !== null && (
                      <>
                        {" · "}
                        {formatPercent(drink.pourCostBefore)} →{" "}
                        <span
                          className={
                            up && (drink.pourCostAfter ?? 0) > 0.22
                              ? "font-semibold text-[var(--danger)]"
                              : ""
                          }
                        >
                          {formatPercent(drink.pourCostAfter)}
                        </span>
                      </>
                    )}
                  </span>
                </li>
              ))}
              {change.drinks.length > 4 && (
                <li className="text-xs text-[var(--muted)]">
                  and {change.drinks.length - 4} more
                </li>
              )}
            </ul>
          </>
        )}
      </div>

      {change.status === "open" && (
        <form action={reviewPriceChangesAction} className="self-start">
          <input type="hidden" name="id" value={change.id} />
          <button type="submit" className={buttonClass("ghost", "sm")}>
            Mark reviewed
          </button>
        </form>
      )}
    </li>
  );
}
