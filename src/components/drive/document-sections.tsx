import type { ReactNode } from "react";

import { ApplyForm } from "@/app/(manager)/imports/drive/drive-forms";
import {
  ButtonLink,
  Callout,
  Panel,
  StatGrid,
  StatTile,
  TableScroll,
  inputClass,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import {
  previewWasteLog,
  type Catalog,
  type CountPreview,
} from "@/lib/drive/apply";
import type { DriveDocumentRow } from "@/lib/drive/queries";
import type { CountSheet, WasteLog } from "@/lib/drive/templates";

export const day = (date: string | null) =>
  date
    ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "—";

export const qty = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function CountDetail({
  doc,
  sheet,
  preview,
  blocked,
  label,
}: {
  doc: DriveDocumentRow;
  sheet: CountSheet;
  preview: CountPreview;
  blocked: boolean;
  label: string;
}) {
  const changed = preview.matched.filter(
    (row) =>
      row.previous !== null &&
      Math.abs(row.previous - row.quantity - row.tenths) > 1e-9,
  ).length;
  return (
    <>
      <StatGrid>
        <StatTile
          label="Shelf as of"
          value={day(sheet.countDate)}
          detail={sheet.countedBy ? `Counted by ${sheet.countedBy}` : undefined}
        />
        <StatTile
          label="Will enter"
          value={preview.matched.length}
          detail={
            changed
              ? `${changed} replace${changed === 1 ? "s" : ""} a different number`
              : "Lines on the app's count"
          }
          tone="accent"
        />
        <StatTile
          label="Not on the count"
          value={preview.unplaced.length + sheet.writeIns.length}
          detail="Add by hand on the count sheet"
          tone={
            preview.unplaced.length + sheet.writeIns.length ? "warning" : "good"
          }
        />
        <StatTile
          label="Left blank"
          value={sheet.blanks.length}
          detail="Stay uncounted"
          tone={sheet.blanks.length ? "warning" : "good"}
        />
      </StatGrid>
      {preview.problem && (
        <Callout
          tone="warning"
          title={preview.problem}
          action={
            <ButtonLink href="/inventory/counts" size="sm">
              Go to counts
            </ButtonLink>
          }
        />
      )}
      <Panel
        flush
        title={
          preview.count
            ? `${preview.count.countType === "full" ? "Full" : "Spot"} count · ${day(preview.count.countDate)} close`
            : "Counts"
        }
        actions={
          preview.count ? (
            <ButtonLink
              href={`/inventory/counts/${preview.count.id}`}
              size="sm"
            >
              Open count
            </ButtonLink>
          ) : null
        }
      >
        {preview.matched.length > 0 && (
          <TableScroll>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Item</th>
                  <th className={thClass}>Zone</th>
                  <th className={thNumClass}>Sheet</th>
                  <th className={thNumClass}>In the app now</th>
                </tr>
              </thead>
              <tbody>
                {preview.matched.map((row) => {
                  const total = row.quantity + row.tenths;
                  const differs =
                    row.previous !== null &&
                    Math.abs(row.previous - total) > 1e-9;
                  return (
                    <tr key={row.lineId}>
                      <td className={tdClass}>
                        <span className="mr-2 text-xs text-[var(--muted)] tabular-nums">
                          {row.itemCode}
                        </span>
                        {row.name}
                      </td>
                      <td className={`${tdClass} text-[var(--muted)]`}>
                        {row.zone}
                      </td>
                      <td className={`${tdNumClass} font-medium`}>
                        {qty(total)}
                      </td>
                      <td
                        className={`${tdNumClass} ${differs ? "text-[var(--warning)]" : "text-[var(--muted)]"}`}
                      >
                        {row.previous === null ? "—" : qty(row.previous)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
        <div className="p-4">
          <ApplyForm
            documentId={doc.id}
            label={label}
            disabled={blocked || Boolean(preview.problem)}
            hint="Fills these lines on the count. You still review and approve the count as usual."
          >
            {(preview.unplaced.length > 0 || sheet.writeIns.length > 0) && (
              <div className="grid gap-1 text-sm">
                <p className="font-medium">Not on the app&apos;s count</p>
                <ul className="text-[var(--muted)]">
                  {preview.unplaced.map((row) => (
                    <li key={`${row.itemCode}${row.product}`}>
                      #{row.itemCode} {row.product}
                    </li>
                  ))}
                  {sheet.writeIns.map((row) => (
                    <li key={row.product}>
                      {row.product} — {qty(row.full + row.tenths)} (written in)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </ApplyForm>
        </div>
      </Panel>
    </>
  );
}

export function WasteDetail({
  doc,
  log,
  catalog,
  blocked,
  label,
}: {
  doc: DriveDocumentRow;
  log: WasteLog;
  catalog: Catalog;
  blocked: boolean;
  label: string;
}) {
  const rows = previewWasteLog(catalog, log);
  const unmatched = rows.filter((row) => !row.itemId).length;
  const otherProblems = rows.filter((row) => row.itemId && row.problem).length;
  return (
    <Panel flush title={`Waste · ${log.area || "all areas"}`}>
      <div className="p-4">
        <ApplyForm
          documentId={doc.id}
          label={label}
          disabled={blocked || otherProblems > 0}
          hint={
            unmatched
              ? `Pick the item for ${unmatched} row${unmatched === 1 ? "" : "s"} in the table above.`
              : otherProblems
                ? "Fix the flagged rows in the sheet, then sync."
                : "Takes each entry off the shelf on the day it happened."
          }
        >
          <TableScroll>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Written as</th>
                  <th className={thClass}>Item</th>
                  <th className={thNumClass}>Amount</th>
                  <th className={thClass}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.index}>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {day(row.date)}
                    </td>
                    <td className={tdClass}>{row.product || "—"}</td>
                    <td className={tdClass}>
                      {row.itemId ? (
                        <span>
                          {row.itemName}
                          {row.problem && (
                            <span className="block text-xs text-[var(--danger)]">
                              {row.problem}
                            </span>
                          )}
                        </span>
                      ) : (
                        <select
                          name={`item_${row.index}`}
                          required
                          defaultValue=""
                          className={`${inputClass} min-w-48`}
                        >
                          <option value="" disabled>
                            Pick the item
                          </option>
                          {catalog.items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                              {item.itemCode ? ` (#${item.itemCode})` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className={tdNumClass}>
                      {qty(row.amount)} {row.unit}
                    </td>
                    <td className={tdClass}>{row.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </ApplyForm>
      </div>
    </Panel>
  );
}

export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt className="text-xs text-[var(--muted)]">{term}</dt>
          <dd className="mt-0.5 font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SimpleTable({
  head,
  rows,
  numeric = [],
}: {
  head: string[];
  rows: ReactNode[][];
  numeric?: number[];
}) {
  return (
    <TableScroll>
      <table className={`${tableClass} rounded-md border`}>
        <thead>
          <tr>
            {head.map((label, index) => (
              <th
                key={label}
                className={numeric.includes(index) ? thNumClass : thClass}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((value, index) => (
                <td
                  key={index}
                  className={numeric.includes(index) ? tdNumClass : tdClass}
                >
                  {value || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
