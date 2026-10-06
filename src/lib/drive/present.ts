import type { Tone } from "@/components/ui";
import type { DriveDocumentRow } from "@/lib/drive/queries";
import type {
  BatchSheet,
  CountSheet,
  CreditNote,
  DocumentKind,
  DrinkSpec,
  WasteLog,
} from "@/lib/drive/templates";

/** Inbox groups, in the order a close works through them. */
export const KIND_ORDER: DocumentKind[] = [
  "count_sheet",
  "waste_log",
  "batch_sheet",
  "invoice_file",
  "credit_note",
  "drink_spec",
  "other",
];

export const KIND_LABEL: Record<
  DocumentKind,
  { one: string; many: string; action: string }
> = {
  count_sheet: {
    one: "Count sheet",
    many: "Count sheets",
    action: "Enter counts",
  },
  waste_log: { one: "Waste log", many: "Waste logs", action: "Post waste" },
  batch_sheet: {
    one: "Batch sheet",
    many: "Batches & preps",
    action: "Post batch",
  },
  invoice_file: { one: "Invoice", many: "Invoices", action: "Send to review" },
  credit_note: {
    one: "Credit note",
    many: "Credits & returns",
    action: "Log credit",
  },
  drink_spec: { one: "Drink spec", many: "Drink specs", action: "Mark done" },
  other: { one: "Other file", many: "Other files", action: "Mark filed" },
};

export function statusOf(doc: DriveDocumentRow): { label: string; tone: Tone } {
  if (doc.changedSinceApplied)
    return { label: "Changed since applied", tone: "warning" };
  switch (doc.status) {
    case "applied":
      return { label: "Done", tone: "good" };
    case "ignored":
      return { label: "Ignored", tone: "neutral" };
    case "needs_review":
      return { label: "Needs a look", tone: "warning" };
    case "error":
      return { label: "Couldn't read", tone: "danger" };
    default:
      return { label: "Ready", tone: "accent" };
  }
}

/** Still waiting on someone: not applied or ignored, or edited since. */
export function isOpen(doc: DriveDocumentRow) {
  return (
    doc.changedSinceApplied || !["applied", "ignored"].includes(doc.status)
  );
}

const day = (date: string | null | undefined) =>
  date
    ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

const money = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** One line on what's in the file, for the inbox row. */
export function describeDocument(doc: DriveDocumentRow): string {
  if (doc.status === "error") return doc.errorMessage;
  const parsed = doc.parsed;
  switch (doc.kind) {
    case "count_sheet": {
      const sheet = parsed as unknown as CountSheet;
      return [
        sheet.area && sheet.area.charAt(0) + sheet.area.slice(1).toLowerCase(),
        day(sheet.countDate) && `${day(sheet.countDate)} close`,
        `${sheet.lines.length} counted`,
        sheet.blanks.length ? `${sheet.blanks.length} blank` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "waste_log": {
      const log = parsed as unknown as WasteLog;
      return [
        `${log.entries.length} entr${log.entries.length === 1 ? "y" : "ies"}`,
        log.area,
        day(log.weekOf) && `week of ${day(log.weekOf)}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "batch_sheet": {
      const batch = parsed as unknown as BatchSheet;
      return [
        batch.batchName,
        batch.yieldAmount !== null && `${batch.yieldAmount} ${batch.yieldUnit}`,
        day(batch.dateMade),
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "credit_note": {
      const note = parsed as unknown as CreditNote;
      return [
        note.vendor,
        note.invoiceNumber && `#${note.invoiceNumber}`,
        money(note.totalCredit),
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "drink_spec": {
      const spec = parsed as unknown as DrinkSpec;
      return [
        spec.drinkName,
        spec.change,
        spec.price !== null && money(spec.price),
        day(spec.startsOn) && `from ${day(spec.startsOn)}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "invoice_file":
      return doc.mimeType === "application/pdf"
        ? "PDF invoice"
        : doc.mimeType.startsWith("image/")
          ? "Photo of an invoice"
          : "Invoice file";
    default:
      return doc.folderPath.split(" / ").at(-1) ?? "";
  }
}

/** The folder a file sits in, e.g. "Spot Counts" or "Baldor". */
export const shortFolder = (path: string) =>
  (path.split(" / ").at(-1) ?? "").replace(/^\d{2}\s+/, "") || "Top folder";

/**
 * A file name written to the naming rule, made readable:
 * "2026-10-18_Jared_Back-bar_Spot-count" → "2026-10-18 · Jared · Back bar · Spot count".
 */
export function prettyName(name: string) {
  const extension = name.match(/\.(pdf|jpe?g|png|heic|xlsx?|csv)$/i)?.[0] ?? "";
  const stem = extension ? name.slice(0, -extension.length) : name;
  if (!stem.includes("_")) return name;
  return stem
    .split("_")
    .filter(Boolean)
    .map((part) =>
      /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : part.replace(/-/g, " "),
    )
    .join(" · ");
}

export const modifiedLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
