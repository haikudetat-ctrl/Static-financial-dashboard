/** Units a bartender would actually write in a spec. */
export const SPEC_UNITS = new Set([
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

/** The unit a cost per base unit is shown in, by kind of unit. */
export const DISPLAY_UNIT: Record<string, string> = {
  volume: "fl oz",
  weight: "oz",
  each: "ea",
};
