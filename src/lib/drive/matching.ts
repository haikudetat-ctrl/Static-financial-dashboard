/**
 * Pure matching rules for applying Drive sheets: which storage zones a
 * count sheet covers, which count line an item lands on, which inventory
 * item a hand-written product name means, and how a hand-written unit
 * converts to an item's base unit.
 */

export type UnitType = "volume" | "weight" | "each";

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/* ------------------------------------------------------------------ zones */

export type Zone = { id: string; name: string; area: string };

/**
 * Zones a count sheet covers, from the area in its title:
 * "BACK BAR" → Back Bar …, "FRIDGES" → the fridges, "WALK-IN" → Walk-in …
 */
export function zonesForArea(zones: Zone[], area: string) {
  const target = norm(area);
  if (!target) return zones;
  if (/fridge|refrigerator/.test(target)) {
    return zones.filter((zone) => /fridge|refrigerator/i.test(zone.name));
  }
  const words = target.split(" ");
  const lead = words[0] === "back" ? words.slice(0, 2).join(" ") : words[0];
  return zones.filter(
    (zone) =>
      norm(zone.name).startsWith(lead) || norm(zone.area).startsWith(lead),
  );
}

/** The zone whose name shares the most words with a sheet's shelf heading. */
export function bestZoneForSection<T extends Zone>(
  zones: T[],
  section: string,
) {
  const words = new Set(
    norm(section)
      .split(" ")
      .filter((w) => w.length > 2),
  );
  let best = zones[0];
  let bestScore = -1;
  for (const zone of zones) {
    const score = norm(zone.name)
      .split(" ")
      .filter((word) => words.has(word)).length;
    if (score > bestScore) {
      best = zone;
      bestScore = score;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ items */

export type ItemRef = { id: string; name: string; itemCode: string | null };

/**
 * An inventory item for a hand-written product name: exact name, then the
 * only item whose name contains it (or is contained in it). Null when
 * nothing or more than one item fits.
 */
export function matchItemByName<T extends ItemRef>(items: T[], name: string) {
  const target = norm(name);
  if (!target) return null;
  const exact = items.filter((item) => norm(item.name) === target);
  if (exact.length === 1) return exact[0];
  const code = items.filter(
    (item) => item.itemCode && item.itemCode === name.trim(),
  );
  if (code.length === 1) return code[0];
  const partial = items.filter((item) => {
    const candidate = norm(item.name);
    return candidate.includes(target) || target.includes(candidate);
  });
  return partial.length === 1 ? partial[0] : null;
}

/* ------------------------------------------------------------------ units */

/** Base units: volume in ml, weight in oz, each in each. */
const FACTORS: Record<UnitType, Record<string, number>> = {
  volume: {
    ml: 1,
    milliliter: 1,
    cl: 10,
    l: 1000,
    liter: 1000,
    litre: 1000,
    oz: 29.5735,
    "fl oz": 29.5735,
    floz: 29.5735,
    ounce: 29.5735,
    qt: 946.3529,
    quart: 946.3529,
    pt: 473.1765,
    pint: 473.1765,
    gal: 3785.4118,
    gallon: 3785.4118,
    dash: 0.9,
    barspoon: 5,
    tsp: 4.9289,
    tbsp: 14.7868,
  },
  weight: {
    oz: 1,
    ounce: 1,
    lb: 16,
    lbs: 16,
    pound: 16,
    g: 0.035274,
    gram: 0.035274,
    kg: 35.274,
  },
  each: { each: 1, ea: 1, ct: 1, count: 1, dz: 12, dozen: 12 },
};

/** Units that mean "one of the item's own containers". */
const CONTAINERS = new Set([
  "bottle",
  "bottles",
  "btl",
  "can",
  "cans",
  "keg",
  "jug",
  "container",
  "each",
  "ea",
]);

/**
 * Converts a hand-written amount to the item's base unit. A container word
 * ("bottle", "can") means the item's count unit, e.g. a 750 ml bottle.
 * Returns null when the unit doesn't fit the item (grams of vodka).
 */
export function toBaseQuantity(
  amount: number,
  unit: string,
  item: { unitType: UnitType; countUnitFactor: number | null },
): number | null {
  const u = norm(unit).replace(/s$/, "");
  if (CONTAINERS.has(u) || CONTAINERS.has(`${u}s`)) {
    if (item.unitType === "each") return amount;
    return item.countUnitFactor ? amount * item.countUnitFactor : null;
  }
  const factor =
    FACTORS[item.unitType][u] ?? FACTORS[item.unitType][norm(unit)];
  return factor === undefined ? null : amount * factor;
}
