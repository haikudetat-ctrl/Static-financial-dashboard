"use client";

import { Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";

import {
  Badge,
  buttonClass,
  formatMoney,
  formatPercent,
  inputClass,
  labelClass,
} from "@/components/ui";
import { COST_SOURCE_LABEL, type CostSource } from "@/lib/recipes/costing";

import {
  saveRecipeAction,
  setIngredientCostAction,
  type RecipeInput,
} from "./actions";

export type EditorUnit = {
  id: string;
  abbreviation: string;
  unitType: string;
  factor: number;
};

export type EditorIngredient = {
  kind: "inventory" | "recipe";
  id: string;
  name: string;
  code: string | null;
  unitType: string;
  /** Cost per base unit. */
  unitCost: number | null;
  source: CostSource;
};

export type EditorRecipe = {
  id: string | null;
  name: string;
  description: string;
  recipeType: "menu_item" | "batch" | "prep";
  menuPrice: number | null;
  outputQuantity: number;
  outputUnitId: string;
  outputItemId: string | null;
  yieldIsApproximate: boolean;
  notes: string;
  versionNumber: number | null;
  versionEffectiveFrom: string | null;
  lines: Array<{
    kind: "inventory" | "recipe";
    refId: string;
    quantity: number;
    unitId: string;
    notes: string;
  }>;
};

type Line = {
  key: string;
  kind: "inventory" | "recipe";
  refId: string;
  quantity: string;
  unitId: string;
  notes: string;
};

const TYPES = [
  { value: "menu_item", label: "Cocktail / menu item" },
  { value: "batch", label: "Batch" },
  { value: "prep", label: "Prep" },
] as const;

/** The shared input style without its full width, for inline fields. */
const compactInput = inputClass.replace("h-9 w-full ", "");

/** Units a bartender would actually write in a spec. */
const SPEC_UNITS = new Set([
  "ml",
  "fl oz",
  "l",
  "qt",
  "gal",
  "oz",
  "lb",
  "g",
  "kg",
  "ea",
]);

/** How a cost per base unit is shown for each kind of unit. */
const DISPLAY_UNIT: Record<string, string> = {
  volume: "fl oz",
  weight: "oz",
  each: "ea",
};

export function RecipeEditor({
  recipe,
  ingredients: initialIngredients,
  units,
  outputItems,
  today,
}: {
  recipe: EditorRecipe;
  ingredients: EditorIngredient[];
  units: EditorUnit[];
  outputItems: Array<{ id: string; name: string; unitType: string }>;
  today: string;
}) {
  const router = useRouter();
  // Server and client must agree on the first keys (they end up in ids),
  // so only lines added in the browser draw from this counter.
  const keyCounter = useRef(recipe.lines.length || 1);
  const nextKey = () => `line-${keyCounter.current++}`;
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [name, setName] = useState(recipe.name);
  const [description, setDescription] = useState(recipe.description);
  const [recipeType, setRecipeType] = useState(recipe.recipeType);
  const [menuPrice, setMenuPrice] = useState(
    recipe.menuPrice === null ? "" : String(recipe.menuPrice),
  );
  const [outputQuantity, setOutputQuantity] = useState(
    String(recipe.outputQuantity || ""),
  );
  const [outputUnitId, setOutputUnitId] = useState(recipe.outputUnitId);
  const [outputItemId, setOutputItemId] = useState(recipe.outputItemId ?? "");
  const [yieldIsApproximate, setYieldIsApproximate] = useState(
    recipe.yieldIsApproximate,
  );
  const [notes, setNotes] = useState(recipe.notes);
  const [lines, setLines] = useState<Line[]>(() =>
    recipe.lines.length
      ? recipe.lines.map((line, index) => ({
          key: `line-${index}`,
          kind: line.kind,
          refId: line.refId,
          quantity: String(line.quantity),
          unitId: line.unitId,
          notes: line.notes,
        }))
      : [
          {
            key: "line-0",
            kind: "inventory",
            refId: "",
            quantity: "",
            unitId: "",
            notes: "",
          },
        ],
  );
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(
    recipe.lines.length ? null : (lines[0]?.key ?? null),
  );

  const unitById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units],
  );
  const ingredientKey = (kind: string, id: string) => `${kind}:${id}`;
  const ingredientMap = useMemo(
    () =>
      new Map(
        ingredients.map((ingredient) => [
          ingredientKey(ingredient.kind, ingredient.id),
          ingredient,
        ]),
      ),
    [ingredients],
  );
  const displayUnit = (unitType: string) =>
    units.find((unit) => unit.abbreviation === DISPLAY_UNIT[unitType]);
  const unitsFor = (unitType: string, current?: string) =>
    units.filter(
      (unit) =>
        unit.unitType === unitType &&
        (SPEC_UNITS.has(unit.abbreviation.toLowerCase()) ||
          unit.id === current),
    );

  const costed = lines.map((line) => {
    const ingredient = ingredientMap.get(ingredientKey(line.kind, line.refId));
    const unit = unitById.get(line.unitId);
    const quantity = Number(line.quantity);
    const extended =
      ingredient && unit && quantity > 0 && ingredient.unitCost !== null
        ? quantity * unit.factor * ingredient.unitCost
        : null;
    return { line, ingredient, unit, extended };
  });
  const total = costed.reduce((sum, row) => sum + (row.extended ?? 0), 0);
  const missing = costed.filter(
    (row) => row.ingredient && row.ingredient.unitCost === null,
  );
  const isMenuItem = recipeType === "menu_item";
  const price = Number(menuPrice);
  const outputUnit = unitById.get(outputUnitId);
  const yieldBase = Number(outputQuantity) * (outputUnit?.factor ?? 0);
  const perBase = yieldBase > 0 ? total / yieldBase : null;
  const yieldDisplay = outputUnit
    ? displayUnit(outputUnit.unitType)
    : undefined;

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
    setSaved("");
  }

  function addLine() {
    const key = nextKey();
    setLines((current) => [
      ...current,
      {
        key,
        kind: "inventory",
        refId: "",
        quantity: "",
        unitId: "",
        notes: "",
      },
    ]);
    setFocusKey(key);
  }

  function pick(key: string, ingredient: EditorIngredient) {
    const current = lines.find((line) => line.key === key);
    const currentUnit = current ? unitById.get(current.unitId) : undefined;
    const unitId =
      currentUnit && currentUnit.unitType === ingredient.unitType
        ? currentUnit.id
        : (displayUnit(ingredient.unitType)?.id ??
          unitsFor(ingredient.unitType)[0]?.id ??
          "");
    updateLine(key, { kind: ingredient.kind, refId: ingredient.id, unitId });
  }

  function save() {
    setError("");
    const input: RecipeInput = {
      id: recipe.id,
      name,
      description,
      recipeType,
      menuPrice: menuPrice.trim() === "" ? null : Number(menuPrice),
      outputQuantity: Number(outputQuantity),
      outputUnitId,
      outputItemId: outputItemId || null,
      yieldIsApproximate,
      notes,
      lines: lines
        .filter((line) => line.refId)
        .map((line) => ({
          kind: line.kind,
          refId: line.refId,
          quantity: Number(line.quantity),
          unitId: line.unitId,
          notes: line.notes,
        })),
    };
    startSaving(async () => {
      const result = await saveRecipeAction(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(`Saved · version ${result.versionNumber}`);
      if (!recipe.id) router.push(`/recipes/${result.id}`);
      else router.refresh();
    });
  }

  const sameDayVersion = recipe.versionEffectiveFrom === today;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-5">
        <section className="rounded-lg border bg-[var(--surface-strong)] p-4">
          <div className="grid gap-4">
            <label className={labelClass}>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Gin Martini"
                className={`${inputClass} h-10 text-base font-medium`}
                autoFocus={!recipe.id}
              />
            </label>
            <div
              role="radiogroup"
              aria-label="Recipe type"
              className="flex flex-wrap gap-1.5"
            >
              {TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  role="radio"
                  aria-checked={recipeType === type.value}
                  onClick={() => setRecipeType(type.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    recipeType === type.value
                      ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                      : "border-[var(--line-strong)] hover:bg-[var(--surface)]"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
            {isMenuItem ? (
              <label className={`${labelClass} max-w-40`}>
                Menu price
                <input
                  inputMode="decimal"
                  value={menuPrice}
                  onChange={(event) => setMenuPrice(event.target.value)}
                  placeholder="0.00"
                  className={`${inputClass} text-right tabular-nums`}
                />
              </label>
            ) : (
              <div className="grid gap-3 sm:grid-cols-[120px_120px_minmax(0,1fr)]">
                <label className={labelClass}>
                  Makes
                  <input
                    inputMode="decimal"
                    value={outputQuantity}
                    onChange={(event) => setOutputQuantity(event.target.value)}
                    className={`${inputClass} text-right tabular-nums`}
                  />
                </label>
                <label className={labelClass}>
                  Unit
                  <select
                    value={outputUnitId}
                    onChange={(event) => setOutputUnitId(event.target.value)}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Unit
                    </option>
                    {units
                      .filter(
                        (unit) =>
                          SPEC_UNITS.has(unit.abbreviation.toLowerCase()) ||
                          unit.id === outputUnitId,
                      )
                      .map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.abbreviation}
                        </option>
                      ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Fills inventory item
                  <select
                    value={outputItemId}
                    onChange={(event) => setOutputItemId(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">New item named “{name || "…"}”</option>
                    {outputItems
                      .filter(
                        (item) =>
                          !outputUnit || item.unitType === outputUnit.unitType,
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--muted)] sm:col-span-3">
                  <input
                    type="checkbox"
                    checked={yieldIsApproximate}
                    onChange={(event) =>
                      setYieldIsApproximate(event.target.checked)
                    }
                    className="size-4 accent-[var(--accent)]"
                  />
                  Yield is approximate
                </label>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-[var(--surface-strong)]">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Ingredients</h2>
            <span className="text-xs text-[var(--muted)]">
              Enter after an amount adds the next line
            </span>
          </div>
          <ul>
            {costed.map(({ line, ingredient, unit, extended }) => (
              <li
                key={line.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 border-b px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_88px_96px_88px_32px] sm:items-center"
              >
                <div className="min-w-0">
                  <IngredientPicker
                    value={ingredient ?? null}
                    ingredients={ingredients}
                    autoFocus={focusKey === line.key}
                    onPick={(picked) => {
                      pick(line.key, picked);
                      setFocusKey(null);
                      requestAnimationFrame(() =>
                        document.getElementById(`qty-${line.key}`)?.focus(),
                      );
                    }}
                    formatCost={(item) => {
                      if (item.unitCost === null) return "No cost";
                      const display = displayUnit(item.unitType);
                      return display
                        ? `${formatMoney(item.unitCost * display.factor)} / ${display.abbreviation}`
                        : `${formatMoney(item.unitCost, { cents: true })} / unit`;
                    }}
                  />
                  {ingredient && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                      <Badge
                        tone={
                          ingredient.source === "missing"
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {COST_SOURCE_LABEL[ingredient.source]}
                      </Badge>
                      {ingredient.unitCost !== null &&
                        displayUnit(ingredient.unitType) &&
                        `${formatMoney(
                          ingredient.unitCost *
                            displayUnit(ingredient.unitType)!.factor,
                        )} / ${displayUnit(ingredient.unitType)!.abbreviation}`}
                      {ingredient.kind === "inventory" && (
                        <SetCost
                          ingredient={ingredient}
                          units={unitsFor(ingredient.unitType)}
                          onSaved={(unitCost) =>
                            setIngredients((current) =>
                              current.map((candidate) =>
                                candidate.kind === "inventory" &&
                                candidate.id === ingredient.id
                                  ? {
                                      ...candidate,
                                      unitCost,
                                      source:
                                        unitCost === null
                                          ? "missing"
                                          : "manual",
                                    }
                                  : candidate,
                              ),
                            )
                          }
                        />
                      )}
                    </p>
                  )}
                </div>
                <div className="col-span-2 flex items-center gap-2 sm:contents">
                  <input
                    id={`qty-${line.key}`}
                    inputMode="decimal"
                    value={line.quantity}
                    placeholder="Amount"
                    aria-label="Amount"
                    onChange={(event) =>
                      updateLine(line.key, { quantity: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addLine();
                      }
                    }}
                    className={`${compactInput} h-9 w-24 text-right tabular-nums sm:w-full`}
                  />
                  <select
                    value={line.unitId}
                    aria-label="Unit"
                    disabled={!ingredient}
                    onChange={(event) =>
                      updateLine(line.key, { unitId: event.target.value })
                    }
                    className={`${compactInput} h-9 w-28 sm:w-full`}
                  >
                    <option value="" disabled>
                      Unit
                    </option>
                    {ingredient &&
                      unitsFor(ingredient.unitType, line.unitId).map(
                        (option) => (
                          <option key={option.id} value={option.id}>
                            {option.abbreviation}
                          </option>
                        ),
                      )}
                  </select>
                  <span
                    className={`ml-auto text-right text-sm tabular-nums sm:ml-0 ${
                      extended === null ? "text-[var(--muted)]" : ""
                    }`}
                  >
                    {extended === null
                      ? ingredient && unit && ingredient.unitCost === null
                        ? "—"
                        : ""
                      : formatMoney(extended)}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove ingredient"
                    onClick={() =>
                      setLines((current) =>
                        current.length > 1
                          ? current.filter((item) => item.key !== line.key)
                          : [
                              {
                                ...current[0],
                                refId: "",
                                quantity: "",
                                unitId: "",
                              },
                            ],
                      )
                    }
                    className="grid size-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={addLine}
              className={buttonClass("ghost", "sm")}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add ingredient
            </button>
          </div>
        </section>

        <section className="rounded-lg border bg-[var(--surface-strong)] p-4">
          <label className={labelClass}>
            Method and notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Shake, double strain, coupe, lemon twist…"
              className={`${inputClass} h-auto py-2`}
            />
          </label>
          <label className={`${labelClass} mt-3`}>
            Description
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={inputClass}
            />
          </label>
        </section>
      </div>

      <aside className="grid gap-4 rounded-lg border bg-[var(--surface-strong)] p-4 lg:sticky lg:top-4">
        <div>
          <p className="text-xs font-medium text-[var(--muted)]">
            {isMenuItem ? "Cost per drink" : "Batch cost"}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">
            {formatMoney(total)}
          </p>
          {isMenuItem && price > 0 && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              <span
                className={
                  total / price > 0.25
                    ? "font-semibold text-[var(--danger)]"
                    : ""
                }
              >
                {formatPercent(total / price)} cost
              </span>{" "}
              · {formatMoney(price - total)} margin
            </p>
          )}
          {!isMenuItem && perBase !== null && yieldDisplay && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {formatMoney(perBase * yieldDisplay.factor)} per{" "}
              {yieldDisplay.abbreviation}
            </p>
          )}
        </div>
        {missing.length > 0 && (
          <p className="rounded-md border border-[#ead6b2] bg-[#fdf8ee] px-3 py-2 text-xs text-[var(--warning)]">
            {missing.length} ingredient
            {missing.length === 1 ? " has" : "s have"} no cost yet. Use “Set
            cost” on the line, or it counts as $0.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={buttonClass("primary")}
        >
          {saving ? "Saving…" : recipe.id ? "Save changes" : "Create recipe"}
        </button>
        {saved && (
          <p role="status" className="text-xs text-[var(--success)]">
            {saved}
          </p>
        )}
        {recipe.id && (
          <p className="text-xs leading-5 text-[var(--muted)]">
            {sameDayVersion
              ? `Updates version ${recipe.versionNumber}, which started today.`
              : `Saving starts version ${(recipe.versionNumber ?? 0) + 1} today. Sales already posted keep version ${recipe.versionNumber ?? 1}.`}
          </p>
        )}
      </aside>
    </div>
  );
}

function IngredientPicker({
  value,
  ingredients,
  autoFocus,
  onPick,
  formatCost,
}: {
  value: EditorIngredient | null;
  ingredients: EditorIngredient[];
  autoFocus: boolean;
  onPick: (ingredient: EditorIngredient) => void;
  formatCost: (ingredient: EditorIngredient) => string;
}) {
  const [open, setOpen] = useState(autoFocus);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term
      ? ingredients.filter(
          (ingredient) =>
            ingredient.name.toLowerCase().includes(term) ||
            (ingredient.code ?? "").toLowerCase() === term,
        )
      : ingredients;
    return [...list]
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(term) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 40);
  }, [ingredients, query]);

  function choose(ingredient: EditorIngredient) {
    onPick(ingredient);
    setOpen(false);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={`flex h-9 w-full items-center gap-2 rounded-md border border-transparent px-2 text-left text-sm hover:border-[var(--line-strong)] ${
          value ? "font-medium" : "text-[var(--muted)]"
        }`}
      >
        {value ? (
          <>
            <span className="truncate">{value.name}</span>
            {value.kind === "recipe" && <Badge>Recipe</Badge>}
          </>
        ) : (
          <>
            <Search className="size-4" aria-hidden="true" />
            Choose an ingredient
          </>
        )}
      </button>
    );
  }

  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--muted)]"
      />
      <input
        ref={inputRef}
        autoFocus
        value={query}
        role="combobox"
        aria-controls={listId}
        aria-expanded="true"
        aria-label="Search ingredients"
        placeholder="Search spirits, syrups, preps…"
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (matches[highlight]) choose(matches[highlight]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`${inputClass} pl-8`}
      />
      <ul
        id={listId}
        role="listbox"
        className="absolute z-20 mt-1 max-h-72 w-full min-w-72 overflow-y-auto rounded-md border bg-[var(--surface-strong)] py-1 shadow-lg"
      >
        {matches.map((ingredient, index) => (
          <li
            key={`${ingredient.kind}:${ingredient.id}`}
            role="option"
            aria-selected={index === highlight}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(ingredient);
            }}
            onMouseEnter={() => setHighlight(index)}
            className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm ${
              index === highlight ? "bg-[var(--surface)]" : ""
            }`}
          >
            <span className="min-w-0 truncate">
              {ingredient.name}
              {ingredient.kind === "recipe" && (
                <span className="ml-1.5 text-xs text-[var(--muted)]">
                  recipe
                </span>
              )}
            </span>
            <span
              className={`shrink-0 text-xs tabular-nums ${
                ingredient.unitCost === null
                  ? "text-[var(--warning)]"
                  : "text-[var(--muted)]"
              }`}
            >
              {formatCost(ingredient)}
            </span>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="px-3 py-2 text-sm text-[var(--muted)]">
            Nothing matches “{query}”.
          </li>
        )}
      </ul>
    </div>
  );
}

function SetCost({
  ingredient,
  units,
  onSaved,
}: {
  ingredient: EditorIngredient;
  units: EditorUnit[];
  onSaved: (unitCost: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-medium text-[var(--accent-strong)] hover:underline"
      >
        {ingredient.unitCost === null ? "Set cost" : "Change cost"}
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      $
      <input
        autoFocus
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="0.00"
        aria-label={`Cost of ${ingredient.name}`}
        className={`${compactInput} h-7 w-20 px-2 text-right`}
      />
      per
      <select
        value={unitId}
        onChange={(event) => setUnitId(event.target.value)}
        aria-label="Per unit"
        className={`${compactInput} h-7 w-20 px-2`}
      >
        {units.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.abbreviation}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const value = amount.trim() === "" ? null : Number(amount);
          const unit = units.find((candidate) => candidate.id === unitId);
          start(async () => {
            const result = await setIngredientCostAction(
              ingredient.id,
              value,
              unitId,
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            onSaved(value === null || !unit ? null : value / unit.factor);
            setOpen(false);
          });
        }}
        className={buttonClass("secondary", "sm")}
      >
        {pending ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[var(--muted)] hover:underline"
      >
        Cancel
      </button>
      {error && <span className="text-[var(--danger)]">{error}</span>}
    </span>
  );
}
