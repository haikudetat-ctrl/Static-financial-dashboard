/**
 * Starting values for an inventory item created from an invoice line.
 * Vendors write descriptions for their catalog, not for a count sheet, so
 * these strip the packaging noise and guess the pack. The manager confirms
 * every value before anything is saved.
 */

const NOISE = new Set([
  "usa",
  "ita",
  "tha",
  "mex",
  "fra",
  "lcl",
  "fz",
  "org",
  "cs",
  "ctn",
  "case",
  "each",
  "ea",
  "bu",
  "ca",
  "flat",
  "can",
  "cans",
  "pack",
  "pk",
  "ct",
  "gal",
  "qt",
  "lb",
  "lbs",
  "oz",
  "gr",
  "kg",
  "ml",
  "l",
]);

function titleCase(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * "berries, raspberries cs/flat" -> "Raspberries";
 * "HONEY CLOVER 5 LB USA" -> "Honey Clover".
 */
export function suggestItemName(description: string): string {
  const text = description.replace(/\*+/g, " ").trim();
  // Produce vendors lead with a category: "citrus, orange cs" names an orange.
  const [head, ...rest] = text.split(",");
  const subject =
    rest.length && head.trim().split(/\s+/).length === 1
      ? rest.join(",")
      : text;
  const words = subject
    .split(/[\s/]+/)
    .filter((word) => !/\d/.test(word))
    .map((word) => word.replace(/[^a-z'&]/gi, ""))
    .filter((word) => word.length > 1)
    .filter((word) => !NOISE.has(word.toLowerCase()));
  return words.slice(0, 4).map(titleCase).join(" ");
}

export type UnitOption = {
  id: string;
  name: string;
  unitType: string;
  factor: number;
};

export type PackGuess = { countUnitId: string; quantity: number } | null;

const MEASURE_UNITS: Record<string, string[]> = {
  LB: ["Pound", "lb [16 oz]"],
  OZ: ["Ounce (weight)"],
  KG: ["1 kg pack [35.274 oz]"],
  GAL: ["Gallon", "gal [3785.41 ml]"],
  QT: ["Quart", "qt [946.353 ml]"],
  L: ["Liter"],
  ML: ["Milliliter"],
};

function findUnit(units: UnitOption[], names: string[]) {
  for (const name of names) {
    const unit = units.find(
      (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
    );
    if (unit) return unit;
  }
  return undefined;
}

/**
 * Reads a pack like "24X150 ML" (24 each), "600X18 GR" (600 each) or
 * "5 LB" (5 lb) into a count unit and how many of it one invoice unit holds.
 * Returns null when the pack doesn't say, so the manager fills it in.
 */
export function guessPack(
  packSize: string | null | undefined,
  units: UnitOption[],
): PackGuess {
  const pack = (packSize ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!pack) return null;

  const multi = pack.match(/^(\d+(?:\.\d+)?)\s*X\s*\d/);
  if (multi) {
    const each = findUnit(units, ["Each", "each [1 ea]"]);
    return each ? { countUnitId: each.id, quantity: Number(multi[1]) } : null;
  }

  const single = pack.match(/^(\d+(?:\.\d+)?)\s*(LB|OZ|KG|GAL|QT|ML|L)\b/);
  if (single) {
    const unit = findUnit(units, MEASURE_UNITS[single[2]] ?? []);
    return unit ? { countUnitId: unit.id, quantity: Number(single[1]) } : null;
  }

  // Produce invoices sell by the unit itself: "gal", "half gallon", "ea".
  const bare = BARE_PACKS[pack];
  if (bare) {
    const unit = findUnit(units, bare);
    return unit ? { countUnitId: unit.id, quantity: 1 } : null;
  }
  return null;
}

const BARE_PACKS: Record<string, string[]> = {
  GAL: ["Gallon", "gal [3785.41 ml]"],
  GALLON: ["Gallon", "gal [3785.41 ml]"],
  "HALF GALLON": ["Half gallon", "1/2 gal [1892.71 ml]"],
  "1/2 GAL": ["Half gallon", "1/2 gal [1892.71 ml]"],
  "1/2 GALLON": ["Half gallon", "1/2 gal [1892.71 ml]"],
  QT: ["Quart", "qt [946.353 ml]"],
  QUART: ["Quart", "qt [946.353 ml]"],
  LB: ["Pound", "lb [16 oz]"],
  EA: ["Each", "each [1 ea]"],
  EACH: ["Each", "each [1 ea]"],
};
