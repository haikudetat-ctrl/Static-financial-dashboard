import { describe, expect, it } from "vitest";

import {
  detectKind,
  kindForFile,
  parseCsv,
  parseTemplate,
  toDate,
  toNumber,
  type BatchSheet,
  type CountSheet,
  type CreditNote,
  type DrinkSpec,
  type WasteLog,
} from "@/lib/drive/templates";

// Laid out like the Drive templates' CSV export (values as displayed).
const COUNT = `STATIC – COUNT SHEET · STAIRCASE METRO RACK,,,,,,,
Count date:,2026-10-18,Counted by:,Jared,Count type:,Spot,,
"Top shelf to bottom, left to right.",,,,,,,
Save as YYYY-MM-DD_Staircase_Opening-count,,,,,,,
Progress: 3 of 5 items counted,,,,,,,
#,Item #,Product,Count unit,Full,Tenths,Total,Notes
TOP SHELF — BITTERS,,,,,,,
1,377,Angostura Bitters,16 oz bottle,2,0.3,2.3,
2,378,Peychaud's Bitters,10 oz bottle,0,,0,
3,379,Regan's Orange Bitters,10 oz bottle,,,,
,,,,,,,
SECOND SHELF — HOUSE BLENDS (750 ml),,,,,,,
4,151,NOK Vodka,750 ml,,0.5,0.5,leaking cap
5,152,NOK Gin,750 ml,,,,
,,,,,,,
NOT LISTED (write in),,,,,,,
,,Mystery Amaro,750 ml,1,,1,
`;

const WASTE = `STATIC – WASTE & SPILL LOG,,,,,,,
Week of (date):,2026-10-12,Area:,Back Bar,,,,
Log anything poured out.,,,,,,,
Reasons: Broken · Spill,,,,,,,
Units: oz · ml,,,,,,,
,,,,,,,
Date,Time,Product (as on the label),Amount,Unit,Reason,Initials,Notes
EXAMPLE 2026-10-12,22:40,Grey Goose,1.5,oz,Remake (wrong drink),JR,Guest wanted Tito's
2026-10-13,9:15 PM,Tito's,1,bottle,Broken,JR,dropped
,,Jameson,2,oz,Spill,AB,
2026-10-14,,Lime Juice,,qt,Expired/spoiled,,
,,,,,,,
`;

const BATCH = `STATIC – BATCH & PREP SHEET,,,,
One sheet per batch made.,,,,
,,,,
Batch / prep name:,Simple Syrup,Item #:,2001,
Date made:,2026-10-15,Made by:,Jared,
Total yield:,2.5,Unit:,gal,"(e.g. 2.5 gal, 3 qt)"
Containers filled:,10,Container type:,8 oz bottle,(1 gal jug)
Stored in:,Walk-in,,,(Walk-in…)
,,,,
Ingredient (as on the label),Amount,Unit,Product # (if known),Notes
EXAMPLE Organic Cane Sugar,1000,g,1046,
EXAMPLE Water,1000,ml,,filtered
Organic Cane Sugar,"4,000",g,1046,
Water,4,L,,filtered
,,,,
Units: oz · ml · L,,,,
Leftover / old batch added in? (amount):,,Tasted & approved by:,,
,,,,
HOUSE-MADE LIST (use these names),,,,
Item #,Name,Stored as,,
2001,Simple Syrup,8 oz bottle,,
`;

const CREDIT = `STATIC – SHORT-SHIP / RETURN NOTE,,,,,,
Use when a delivery is short.,,,,,,
,,,,,,
Vendor:,Baldor,,,,,
Original invoice #:,00123,,,,,
Delivery date:,10/14/2026,,,,,
Driver / rep name:,Sam,,,,,
Reported to vendor? (how / when):,Email 10/14,,,,,
,,,,Total credit expected:,$72.50,
Product (as on the invoice),Qty invoiced,Qty received,Unit,Reason,Credit expected ($),Notes
EXAMPLE Limes 150ct,2,1,case,Short-shipped,$48.00,Driver said back-ordered
Limes 150ct,2,1,case,Short-shipped,$48.00,
Mint,3,2,bunch,Damaged/broken,$24.50,wilted
,,,,,,
Reasons: Short-shipped · Damaged/broken,,,,,,
Logged by:,Jared,Date:,2026-10-14,Credit received? (date / memo #):,,
`;

const SPEC = `STATIC – DRINK SPEC CARD,,,
One card per new or changed drink.,,,
,,,
Drink name (as on the menu):,Autumn Spritz,,
Toast button name (exact):,Autumn Spritz,,
New drink or change?,New,(New / Change / Removing from menu),
Starts on (date):,2026-10-20,,
Menu price ($):,$14.00,,
Glass:,Wine,,
Ice:,Cubed,,
Garnish:,Orange wheel,,
Method:,Built,(Shaken / Stirred / Built / Batched / Draft),
,,,
Ingredient (as on the label or batch name),Amount,Unit,Notes
EXAMPLE Bluecoat,1.5,oz,
Aperol,1.5,oz,
Prosecco,3,oz,top
Soda,,,
,,,
Units: oz · ml · dash,,,
Spec written by:,Jared,Date:,2026-10-15
`;

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("value helpers", () => {
  it("reads money and dates as Sheets displays them", () => {
    expect(toNumber("$1,234.50")).toBe(1234.5);
    expect(toNumber("")).toBeNull();
    expect(toDate("10/14/2026")).toBe("2026-10-14");
    expect(toDate("2026-02-30")).toBeNull();
  });
});

describe("detectKind", () => {
  it("knows each template by its title", () => {
    expect(detectKind(parseCsv(COUNT))).toBe("count_sheet");
    expect(detectKind(parseCsv(WASTE))).toBe("waste_log");
    expect(detectKind(parseCsv(BATCH))).toBe("batch_sheet");
    expect(detectKind(parseCsv(CREDIT))).toBe("credit_note");
    expect(detectKind(parseCsv(SPEC))).toBe("drink_spec");
    expect(detectKind([["Some other sheet"]])).toBeNull();
  });

  it("treats PDFs and photos in an invoices folder as invoices", () => {
    expect(kindForFile("application/pdf", "P10 / 01 Invoices / Baldor")).toBe(
      "invoice_file",
    );
    expect(kindForFile("image/jpeg", "P10 / 08 Bills & Expenses")).toBe(
      "other",
    );
  });
});

describe("count sheet", () => {
  const sheet = parseTemplate(parseCsv(COUNT)) as CountSheet;

  it("reads the header fields", () => {
    expect(sheet.area).toBe("STAIRCASE METRO RACK");
    expect(sheet.countDate).toBe("2026-10-18");
    expect(sheet.countType).toBe("Spot");
  });

  it("keeps entered lines with their shelf, including zeros", () => {
    expect(sheet.lines).toEqual([
      expect.objectContaining({
        itemCode: "377",
        full: 2,
        tenths: 0.3,
        section: "TOP SHELF — BITTERS",
      }),
      expect.objectContaining({ itemCode: "378", full: 0, tenths: 0 }),
      expect.objectContaining({
        itemCode: "151",
        full: 0,
        tenths: 0.5,
        notes: "leaking cap",
      }),
    ]);
  });

  it("lists blanks and write-ins", () => {
    expect(sheet.blanks.map((b) => b.itemCode)).toEqual(["379", "152"]);
    expect(sheet.writeIns).toEqual([
      { product: "Mystery Amaro", full: 1, tenths: 0, notes: "" },
    ]);
    expect(sheet.issues.every((issue) => issue.level === "warning")).toBe(true);
  });

  it("flags a bad tenths value and a missing date", () => {
    const bad = parseTemplate(
      parseCsv(COUNT.replace("2026-10-18", "").replace(",2,0.3,", ",2,3,")),
    ) as CountSheet;
    expect(bad.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Count date is blank.",
        "Angostura Bitters: tenths must be 0 to 0.9 (got 3).",
      ]),
    );
  });
});

describe("waste log", () => {
  const log = parseTemplate(parseCsv(WASTE)) as WasteLog;

  it("skips the example row and maps reasons to the ledger", () => {
    expect(log.entries.map((e) => [e.product, e.ledgerReason])).toEqual([
      ["Tito's", "breakage"],
      ["Jameson", "spill"],
      ["Lime Juice", "waste"],
    ]);
  });

  it("falls back to the week date and flags missing amounts", () => {
    expect(log.entries[1].date).toBe("2026-10-12");
    expect(log.issues).toEqual([
      { level: "error", message: "Row 11 (Lime Juice): no amount." },
    ]);
  });
});

describe("batch sheet", () => {
  const batch = parseTemplate(parseCsv(BATCH)) as BatchSheet;

  it("reads the batch and its ingredients, not the examples or the list", () => {
    expect(batch).toMatchObject({
      batchName: "Simple Syrup",
      itemCode: "2001",
      dateMade: "2026-10-15",
      yieldAmount: 2.5,
      yieldUnit: "gal",
      storedIn: "Walk-in",
    });
    expect(batch.ingredients).toEqual([
      {
        name: "Organic Cane Sugar",
        amount: 4000,
        unit: "g",
        itemCode: "1046",
        notes: "",
      },
      { name: "Water", amount: 4, unit: "L", itemCode: "", notes: "filtered" },
    ]);
    expect(batch.issues).toEqual([]);
  });
});

describe("credit note", () => {
  const note = parseTemplate(parseCsv(CREDIT)) as CreditNote;

  it("adds up the credit and keeps the invoice number as text", () => {
    expect(note.vendor).toBe("Baldor");
    expect(note.invoiceNumber).toBe("00123");
    expect(note.deliveryDate).toBe("2026-10-14");
    expect(note.lines).toHaveLength(2);
    expect(note.totalCredit).toBe(72.5);
    expect(note.loggedBy).toBe("Jared");
  });
});

describe("drink spec", () => {
  const spec = parseTemplate(parseCsv(SPEC)) as DrinkSpec;

  it("reads the card and warns about an ingredient with no amount", () => {
    expect(spec).toMatchObject({
      drinkName: "Autumn Spritz",
      change: "New",
      startsOn: "2026-10-20",
      price: 14,
      method: "Built",
    });
    expect(spec.ingredients.map((i) => i.name)).toEqual([
      "Aperol",
      "Prosecco",
      "Soda",
    ]);
    expect(spec.issues).toEqual([
      { level: "warning", message: "Soda: amount or unit is missing." },
    ]);
  });
});
