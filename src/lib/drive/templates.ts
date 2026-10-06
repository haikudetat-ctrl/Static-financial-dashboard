/**
 * Readers for the Drive templates (count sheets, waste log, batch sheet,
 * short-ship note, drink spec). Each takes the sheet as CSV rows and
 * returns plain data plus the problems a manager should see before
 * applying it. Nothing here touches the database.
 */

export type DocumentKind =
  | "count_sheet"
  | "waste_log"
  | "batch_sheet"
  | "credit_note"
  | "drink_spec"
  | "invoice_file"
  | "other";

export type Issue = { level: "error" | "warning"; message: string };

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((cells) => cells.map((cell) => cell.trim()));
}

const cell = (rows: string[][], r: number, c: number) => rows[r]?.[c] ?? "";
const norm = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();

/** "$1,234.50", "1.5", "" → number | null */
export function toNumber(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

/** "2026-10-18", "10/18/2026", "10/18/26" → "2026-10-18" | null */
export function toDate(value: string): string | null {
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(year, +m[1], +m[2]);
  }
  return null;
}

function iso(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** The value in the cell right after a "Label:" cell, anywhere on the sheet. */
function field(rows: string[][], label: string) {
  const target = norm(label);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (norm(rows[r][c]) === target) return cell(rows, r, c + 1);
    }
  }
  return "";
}

function findRow(rows: string[][], predicate: (row: string[]) => boolean) {
  return rows.findIndex(predicate);
}

/** Column index by header text, e.g. "Full" or "Item #". */
function columns(header: string[], names: Record<string, string>) {
  const found: Record<string, number> = {};
  for (const [key, name] of Object.entries(names)) {
    found[key] = header.findIndex((h) => norm(h).startsWith(norm(name)));
  }
  return found;
}

const isExample = (row: string[]) => /^example\b/i.test(row[0] ?? "");
const stripExample = (value: string) => value.replace(/^example\s+/i, "");
const blank = (row: string[]) => row.every((value) => !value);

export function detectKind(rows: string[][]): DocumentKind | null {
  const title = norm(cell(rows, 0, 0));
  if (title.includes("count sheet")) return "count_sheet";
  if (title.includes("waste")) return "waste_log";
  if (title.includes("batch") && title.includes("prep")) return "batch_sheet";
  if (title.includes("short ship") || title.includes("return note")) {
    return "credit_note";
  }
  if (title.includes("drink spec")) return "drink_spec";
  return null;
}

/* ---------------------------------------------------------------- counts */

export type CountSheetLine = {
  itemCode: string;
  product: string;
  section: string;
  full: number;
  tenths: number;
  notes: string;
};

export type CountSheet = {
  kind: "count_sheet";
  /** Text after the "·" in the title, e.g. "WALK-IN". */
  area: string;
  countDate: string | null;
  countedBy: string;
  countType: string;
  lines: CountSheetLine[];
  /** Items listed but left blank. */
  blanks: Array<{ itemCode: string; product: string; section: string }>;
  writeIns: Array<{
    product: string;
    full: number;
    tenths: number;
    notes: string;
  }>;
  issues: Issue[];
};

export function parseCountSheet(rows: string[][]): CountSheet {
  const issues: Issue[] = [];
  const title = cell(rows, 0, 0);
  const area = (title.split("·")[1] ?? "").trim();
  const rawDate = field(rows, "Count date:");
  const countDate = toDate(rawDate);
  if (!countDate) {
    issues.push({
      level: "error",
      message: rawDate
        ? `Count date "${rawDate}" isn't a date.`
        : "Count date is blank.",
    });
  }
  const headerIndex = findRow(
    rows,
    (row) => row[0] === "#" && norm(row[1] ?? "").startsWith("item"),
  );
  const lines: CountSheetLine[] = [];
  const blanks: CountSheet["blanks"] = [];
  const writeIns: CountSheet["writeIns"] = [];
  if (headerIndex < 0) {
    issues.push({ level: "error", message: "Couldn't find the item table." });
  } else {
    const col = columns(rows[headerIndex], {
      code: "Item #",
      product: "Product",
      full: "Full",
      tenths: "Tenths",
      notes: "Notes",
    });
    let section = "";
    for (const row of rows.slice(headerIndex + 1)) {
      if (blank(row)) continue;
      const code = row[col.code] ?? "";
      const product = row[col.product] ?? "";
      const full = toNumber(row[col.full] ?? "");
      const tenths = toNumber(row[col.tenths] ?? "");
      const notes = col.notes >= 0 ? (row[col.notes] ?? "") : "";
      if (!code && !product && row[0] && toNumber(row[0]) === null) {
        section = row[0];
        continue;
      }
      if (tenths !== null && (tenths < 0 || tenths > 0.9)) {
        issues.push({
          level: "error",
          message: `${product || code}: tenths must be 0 to 0.9 (got ${tenths}).`,
        });
        continue;
      }
      if (full !== null && full < 0) {
        issues.push({
          level: "error",
          message: `${product || code}: full can't be negative.`,
        });
        continue;
      }
      const entered = full !== null || tenths !== null;
      if (!code) {
        if (product && entered) {
          writeIns.push({
            product,
            full: full ?? 0,
            tenths: tenths ?? 0,
            notes,
          });
        }
        continue;
      }
      if (!entered) {
        blanks.push({ itemCode: code, product, section });
        continue;
      }
      lines.push({
        itemCode: code,
        product,
        section,
        full: full ?? 0,
        tenths: tenths ?? 0,
        notes,
      });
    }
  }
  if (headerIndex >= 0 && lines.length === 0) {
    issues.push({ level: "error", message: "No counts are filled in yet." });
  }
  if (blanks.length && lines.length) {
    issues.push({
      level: "warning",
      message: `${blanks.length} item${blanks.length === 1 ? " is" : "s are"} left blank. They stay uncounted; write 0 if none are on the shelf.`,
    });
  }
  if (writeIns.length) {
    issues.push({
      level: "warning",
      message: `${writeIns.length} write-in item${writeIns.length === 1 ? "" : "s"} need adding to the count by hand.`,
    });
  }
  return {
    kind: "count_sheet",
    area,
    countDate,
    countedBy: field(rows, "Counted by:"),
    countType: field(rows, "Count type:"),
    lines,
    blanks,
    writeIns,
    issues,
  };
}

/* ----------------------------------------------------------------- waste */

export const WASTE_REASONS: Record<
  string,
  "waste" | "spill" | "breakage" | "comp_sample"
> = {
  broken: "breakage",
  spill: "spill",
  "remake wrong drink": "waste",
  "comp staff": "comp_sample",
  "expired spoiled": "waste",
  "over pour": "waste",
  "other explain": "waste",
};

export type WasteEntry = {
  row: number;
  date: string | null;
  time: string;
  product: string;
  amount: number | null;
  unit: string;
  reason: string;
  ledgerReason: "waste" | "spill" | "breakage" | "comp_sample";
  initials: string;
  notes: string;
};

export type WasteLog = {
  kind: "waste_log";
  weekOf: string | null;
  area: string;
  entries: WasteEntry[];
  issues: Issue[];
};

export function parseWasteLog(rows: string[][]): WasteLog {
  const issues: Issue[] = [];
  const weekOf = toDate(field(rows, "Week of (date):"));
  const headerIndex = findRow(rows, (row) => norm(row[0] ?? "") === "date");
  const entries: WasteEntry[] = [];
  if (headerIndex < 0) {
    issues.push({ level: "error", message: "Couldn't find the log table." });
  } else {
    const col = columns(rows[headerIndex], {
      date: "Date",
      time: "Time",
      product: "Product",
      amount: "Amount",
      unit: "Unit",
      reason: "Reason",
      initials: "Initials",
      notes: "Notes",
    });
    rows.slice(headerIndex + 1).forEach((row, offset) => {
      if (blank(row) || isExample(row)) return;
      const product = row[col.product] ?? "";
      const amount = toNumber(row[col.amount] ?? "");
      if (!product && amount === null) return;
      const rowNumber = headerIndex + offset + 2;
      const date = toDate(row[col.date] ?? "") ?? weekOf;
      const reason = row[col.reason] ?? "";
      const entry: WasteEntry = {
        row: rowNumber,
        date,
        time: row[col.time] ?? "",
        product,
        amount,
        unit: row[col.unit] ?? "",
        reason,
        ledgerReason: WASTE_REASONS[norm(reason)] ?? "waste",
        initials: row[col.initials] ?? "",
        notes: row[col.notes] ?? "",
      };
      const problems = [
        !product && "no product",
        (amount === null || amount <= 0) && "no amount",
        !entry.unit && "no unit",
        !date && "no date",
      ].filter(Boolean);
      if (problems.length) {
        issues.push({
          level: "error",
          message: `Row ${rowNumber}${product ? ` (${product})` : ""}: ${problems.join(", ")}.`,
        });
      }
      entries.push(entry);
    });
  }
  if (headerIndex >= 0 && entries.length === 0) {
    issues.push({ level: "error", message: "The log has no entries yet." });
  }
  return {
    kind: "waste_log",
    weekOf,
    area: field(rows, "Area:"),
    entries,
    issues,
  };
}

/* ---------------------------------------------------------------- batches */

export type Ingredient = {
  name: string;
  amount: number | null;
  unit: string;
  itemCode: string;
  notes: string;
};

export type BatchSheet = {
  kind: "batch_sheet";
  batchName: string;
  itemCode: string;
  dateMade: string | null;
  madeBy: string;
  yieldAmount: number | null;
  yieldUnit: string;
  containers: string;
  containerType: string;
  storedIn: string;
  ingredients: Ingredient[];
  issues: Issue[];
};

function ingredientRows(
  rows: string[][],
  headerStart: string,
  stopAt: string,
  names: Record<string, string>,
): Ingredient[] {
  const headerIndex = findRow(rows, (row) =>
    norm(row[0] ?? "").startsWith(norm(headerStart)),
  );
  if (headerIndex < 0) return [];
  const col = columns(rows[headerIndex], names);
  const result: Ingredient[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (norm(row[0] ?? "").startsWith(norm(stopAt))) break;
    if (blank(row) || isExample(row) || !row[0]) continue;
    result.push({
      name: row[0],
      amount: toNumber(row[col.amount] ?? ""),
      unit: row[col.unit] ?? "",
      itemCode: col.itemCode >= 0 ? (row[col.itemCode] ?? "") : "",
      notes: col.notes >= 0 ? (row[col.notes] ?? "") : "",
    });
  }
  return result;
}

export function parseBatchSheet(rows: string[][]): BatchSheet {
  const issues: Issue[] = [];
  const batchName = field(rows, "Batch / prep name:");
  const dateMade = toDate(field(rows, "Date made:"));
  const yieldAmount = toNumber(field(rows, "Total yield:"));
  const yieldUnit = field(rows, "Unit:");
  if (!batchName)
    issues.push({ level: "error", message: "Batch name is blank." });
  if (!dateMade)
    issues.push({
      level: "error",
      message: "Date made is blank or not a date.",
    });
  if (yieldAmount === null || yieldAmount <= 0) {
    issues.push({ level: "error", message: "Total yield is blank." });
  }
  if (!yieldUnit)
    issues.push({ level: "error", message: "Yield unit is blank." });
  return {
    kind: "batch_sheet",
    batchName,
    itemCode: field(rows, "Item #:"),
    dateMade,
    madeBy: field(rows, "Made by:"),
    yieldAmount,
    yieldUnit,
    containers: field(rows, "Containers filled:"),
    containerType: field(rows, "Container type:"),
    storedIn: field(rows, "Stored in:"),
    ingredients: ingredientRows(
      rows,
      "Ingredient (as on the label)",
      "Units:",
      {
        amount: "Amount",
        unit: "Unit",
        itemCode: "Product #",
        notes: "Notes",
      },
    ),
    issues,
  };
}

/* ---------------------------------------------------------------- credits */

export type CreditLine = {
  product: string;
  invoiced: number | null;
  received: number | null;
  unit: string;
  reason: string;
  credit: number | null;
  notes: string;
};

export type CreditNote = {
  kind: "credit_note";
  vendor: string;
  invoiceNumber: string;
  deliveryDate: string | null;
  driver: string;
  reported: string;
  loggedBy: string;
  creditReceived: string;
  lines: CreditLine[];
  totalCredit: number;
  issues: Issue[];
};

export function parseCreditNote(rows: string[][]): CreditNote {
  const issues: Issue[] = [];
  const headerIndex = findRow(rows, (row) =>
    norm(row[0] ?? "").startsWith("product as on the invoice"),
  );
  const lines: CreditLine[] = [];
  if (headerIndex >= 0) {
    const col = columns(rows[headerIndex], {
      invoiced: "Qty invoiced",
      received: "Qty received",
      unit: "Unit",
      reason: "Reason",
      credit: "Credit expected",
      notes: "Notes",
    });
    for (const row of rows.slice(headerIndex + 1)) {
      if (norm(row[0] ?? "").startsWith("reasons")) break;
      if (blank(row) || isExample(row) || !row[0]) continue;
      lines.push({
        product: row[0],
        invoiced: toNumber(row[col.invoiced] ?? ""),
        received: toNumber(row[col.received] ?? ""),
        unit: row[col.unit] ?? "",
        reason: row[col.reason] ?? "",
        credit: toNumber(row[col.credit] ?? ""),
        notes: row[col.notes] ?? "",
      });
    }
  }
  const vendor = field(rows, "Vendor:");
  const invoiceNumber = field(rows, "Original invoice #:");
  if (!vendor) issues.push({ level: "error", message: "Vendor is blank." });
  if (!invoiceNumber) {
    issues.push({ level: "warning", message: "Original invoice # is blank." });
  }
  if (!lines.length) {
    issues.push({ level: "error", message: "No products are listed." });
  }
  return {
    kind: "credit_note",
    vendor,
    invoiceNumber,
    deliveryDate: toDate(field(rows, "Delivery date:")),
    driver: field(rows, "Driver / rep name:"),
    reported: field(rows, "Reported to vendor? (how / when):"),
    loggedBy: field(rows, "Logged by:"),
    creditReceived: field(rows, "Credit received? (date / memo #):"),
    lines,
    totalCredit:
      Math.round(
        lines.reduce((sum, line) => sum + (line.credit ?? 0), 0) * 100,
      ) / 100,
    issues,
  };
}

/* ------------------------------------------------------------ drink specs */

export type DrinkSpec = {
  kind: "drink_spec";
  drinkName: string;
  toastName: string;
  change: string;
  startsOn: string | null;
  price: number | null;
  glass: string;
  ice: string;
  garnish: string;
  method: string;
  writtenBy: string;
  ingredients: Ingredient[];
  issues: Issue[];
};

export function parseDrinkSpec(rows: string[][]): DrinkSpec {
  const issues: Issue[] = [];
  const drinkName = field(rows, "Drink name (as on the menu):");
  const ingredients = ingredientRows(
    rows,
    "Ingredient (as on the label or batch name)",
    "Units:",
    { amount: "Amount", unit: "Unit", itemCode: "Product #", notes: "Notes" },
  ).map((ingredient) => ({
    ...ingredient,
    name: stripExample(ingredient.name),
  }));
  if (!drinkName)
    issues.push({ level: "error", message: "Drink name is blank." });
  if (!ingredients.length) {
    issues.push({ level: "error", message: "No ingredients are listed." });
  }
  for (const ingredient of ingredients) {
    if (ingredient.amount === null || !ingredient.unit) {
      issues.push({
        level: "warning",
        message: `${ingredient.name}: amount or unit is missing.`,
      });
    }
  }
  return {
    kind: "drink_spec",
    drinkName,
    toastName: field(rows, "Toast button name (exact):"),
    change: field(rows, "New drink or change?"),
    startsOn: toDate(field(rows, "Starts on (date):")),
    price: toNumber(field(rows, "Menu price ($):")),
    glass: field(rows, "Glass:"),
    ice: field(rows, "Ice:"),
    garnish: field(rows, "Garnish:"),
    method: field(rows, "Method:"),
    writtenBy: field(rows, "Spec written by:"),
    ingredients,
    issues,
  };
}

export type ParsedTemplate =
  | CountSheet
  | WasteLog
  | BatchSheet
  | CreditNote
  | DrinkSpec;

export function parseTemplate(rows: string[][]): ParsedTemplate | null {
  switch (detectKind(rows)) {
    case "count_sheet":
      return parseCountSheet(rows);
    case "waste_log":
      return parseWasteLog(rows);
    case "batch_sheet":
      return parseBatchSheet(rows);
    case "credit_note":
      return parseCreditNote(rows);
    case "drink_spec":
      return parseDrinkSpec(rows);
    default:
      return null;
  }
}

/** Kind for a file that isn't one of our sheets, from where it was filed. */
export function kindForFile(mimeType: string, path: string): DocumentKind {
  const isDocument =
    mimeType === "application/pdf" || mimeType.startsWith("image/");
  if (isDocument && /invoices/i.test(path)) return "invoice_file";
  return "other";
}
