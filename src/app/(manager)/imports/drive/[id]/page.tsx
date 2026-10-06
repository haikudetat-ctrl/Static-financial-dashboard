import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Badge,
  ButtonLink,
  Callout,
  PageBody,
  PageHeader,
  Panel,
  StatGrid,
  StatTile,
  buttonClass,
  formatMoney,
  inputClass,
  labelClass,
} from "@/components/ui";
import {
  CountDetail,
  Facts,
  SimpleTable,
  WasteDetail,
  day,
  qty,
} from "@/components/drive/document-sections";
import { getUserContext } from "@/lib/auth/session";
import {
  findCreditInvoice,
  loadCatalog,
  previewBatchSheet,
  previewCountSheet,
  vendorFromPath,
} from "@/lib/drive/apply";
import {
  KIND_LABEL,
  isOpen,
  modifiedLabel,
  prettyName,
  shortFolder,
  statusOf,
} from "@/lib/drive/present";
import { getDriveDocument, type DriveDocumentRow } from "@/lib/drive/queries";
import type {
  BatchSheet,
  CountSheet,
  CreditNote,
  DrinkSpec,
  WasteLog,
} from "@/lib/drive/templates";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";

import { setDriveDocumentStatusAction } from "../actions";
import { ApplyForm } from "../drive-forms";

export const metadata: Metadata = { title: "Drive document" };

export default async function DriveDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  const doc = await getDriveDocument(id);
  if (!doc || doc.locationId !== locationId) notFound();

  const status = statusOf(doc);
  const open = isOpen(doc);
  const errors = doc.issues.filter((issue) => issue.level === "error");
  const warnings = doc.issues.filter((issue) => issue.level === "warning");

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Imports", href: "/imports" },
          { label: "Drive inbox", href: "/imports/drive" },
        ]}
        title={prettyName(doc.name)}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {KIND_LABEL[doc.kind].one} · {shortFolder(doc.folderPath)} · edited{" "}
            {modifiedLabel(doc.modifiedTime)}
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
        }
        actions={
          <>
            {doc.webViewLink && (
              <a
                href={doc.webViewLink}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("secondary")}
              >
                Open in Drive
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            )}
            <form
              action={setDriveDocumentStatusAction.bind(
                null,
                id,
                open ? "ignored" : "ready",
              )}
            >
              <button type="submit" className={buttonClass("ghost")}>
                {open ? "Ignore" : "Reopen"}
              </button>
            </form>
          </>
        }
      />
      <PageBody narrow>
        {doc.status === "applied" && (
          <Callout
            tone={doc.changedSinceApplied ? "warning" : "good"}
            title={
              doc.changedSinceApplied
                ? "Edited in Drive after it was applied"
                : doc.appliedSummary || "Done"
            }
          >
            {doc.changedSinceApplied
              ? "Check what changed. Applying again only adds what's new; counts are overwritten with the sheet's values."
              : doc.appliedAt
                ? `Applied ${modifiedLabel(doc.appliedAt)}.`
                : null}
          </Callout>
        )}
        {doc.status === "error" && (
          <Callout tone="danger" title="Couldn't read this file">
            {doc.errorMessage}
          </Callout>
        )}
        {errors.length > 0 && (
          <Callout tone="danger" title="Fix these in the sheet, then sync">
            <ul className="mt-1 list-disc pl-4">
              {errors.map((issue) => (
                <li key={issue.message}>{issue.message}</li>
              ))}
            </ul>
          </Callout>
        )}
        {warnings.length > 0 && (
          <Callout tone="warning" title="Worth a look">
            <ul className="mt-1 list-disc pl-4">
              {warnings.map((issue) => (
                <li key={issue.message}>{issue.message}</li>
              ))}
            </ul>
          </Callout>
        )}
        {doc.status !== "ignored" && (
          <Detail
            doc={doc}
            organizationId={context.organizationId}
            locationId={locationId!}
            blocked={errors.length > 0 || doc.status === "error"}
            reapply={!open}
          />
        )}
      </PageBody>
    </>
  );
}

async function Detail({
  doc,
  organizationId,
  locationId,
  blocked,
  reapply,
}: {
  doc: DriveDocumentRow;
  organizationId: string;
  locationId: string;
  blocked: boolean;
  reapply: boolean;
}) {
  const supabase = await createClient();
  const again = (label: string) => (reapply ? `${label} again` : label);

  switch (doc.kind) {
    case "count_sheet":
      return (
        <CountDetail
          doc={doc}
          sheet={doc.parsed as unknown as CountSheet}
          preview={await previewCountSheet(
            supabase,
            locationId,
            doc.parsed as unknown as CountSheet,
          )}
          blocked={blocked}
          label={again("Enter counts")}
        />
      );
    case "waste_log": {
      const catalog = await loadCatalog(supabase, organizationId, locationId);
      return (
        <WasteDetail
          doc={doc}
          log={doc.parsed as unknown as WasteLog}
          catalog={catalog}
          blocked={blocked}
          label={again("Post waste")}
        />
      );
    }
    case "batch_sheet": {
      const batch = doc.parsed as unknown as BatchSheet;
      const catalog = await loadCatalog(supabase, organizationId, locationId);
      const preview = await previewBatchSheet(supabase, catalog, batch);
      return (
        <Panel title="Batch">
          <ApplyForm
            documentId={doc.id}
            label={again("Post batch")}
            disabled={blocked || Boolean(preview.problem)}
            hint={
              preview.problem ??
              "Uses the recipe to take the ingredients off the shelf and adds the batch to on-hand."
            }
          >
            <Facts
              items={[
                ["Batch", preview.itemName ?? batch.batchName],
                ["Recipe", preview.recipeName ?? "—"],
                [
                  "Made",
                  `${day(batch.dateMade)}${batch.madeBy ? ` by ${batch.madeBy}` : ""}`,
                ],
                [
                  "Yield",
                  `${qty(batch.yieldAmount)} ${batch.yieldUnit}${
                    preview.actualOutput !== null
                      ? ` · ${qty(preview.actualOutput)} ${preview.outputUnit} (recipe makes ${qty(preview.expectedOutput)})`
                      : ""
                  }`,
                ],
                [
                  "Containers",
                  [batch.containers, batch.containerType]
                    .filter(Boolean)
                    .join(" × ") || "—",
                ],
                ["Stored in", batch.storedIn || "—"],
              ]}
            />
            {batch.ingredients.length > 0 && (
              <SimpleTable
                head={["Ingredient", "Amount", "Unit", "Notes"]}
                numeric={[1]}
                rows={batch.ingredients.map((i) => [
                  i.name,
                  qty(i.amount),
                  i.unit,
                  i.notes,
                ])}
              />
            )}
          </ApplyForm>
        </Panel>
      );
    }
    case "invoice_file": {
      const { data: vendors } = await supabase
        .from("vendors")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name");
      const guess = vendorFromPath(vendors ?? [], doc.folderPath);
      return (
        <Panel title="Invoice">
          <ApplyForm
            documentId={doc.id}
            label={again("Send to invoice review")}
            hint="The file is read like an upload and lands in the invoice review queue."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Vendor
                <select
                  name="vendor_id"
                  required
                  defaultValue={guess?.id ?? ""}
                  className={inputClass}
                >
                  <option value="" disabled>
                    Pick the vendor
                  </option>
                  {(vendors ?? []).map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Invoice # (optional)
                <input name="invoice_number" className={inputClass} />
              </label>
            </div>
            {doc.appliedTargetId && (
              <Link
                href={`/invoices/${doc.appliedTargetId}/review`}
                className="text-sm underline"
              >
                Open the invoice
              </Link>
            )}
          </ApplyForm>
        </Panel>
      );
    }
    case "credit_note": {
      const note = doc.parsed as unknown as CreditNote;
      const invoice = await findCreditInvoice(supabase, organizationId, note);
      return (
        <Panel title="Credit">
          <ApplyForm
            documentId={doc.id}
            label={again("Mark credit logged")}
            hint="Tracks the claim here. Record the credit on the vendor's invoice when the memo arrives."
          >
            <StatGrid>
              <StatTile label="Vendor" value={note.vendor || "—"} />
              <StatTile
                label="Credit expected"
                value={formatMoney(note.totalCredit)}
                tone="accent"
              />
              <StatTile
                label="Original invoice"
                value={note.invoiceNumber ? `#${note.invoiceNumber}` : "—"}
                detail={
                  invoice
                    ? "Found in the app"
                    : note.invoiceNumber
                      ? "Not entered yet"
                      : undefined
                }
                href={invoice ? `/invoices/${invoice.id}/review` : undefined}
              />
              <StatTile
                label="Delivered"
                value={day(note.deliveryDate)}
                detail={note.driver || undefined}
              />
            </StatGrid>
            <SimpleTable
              head={[
                "Product",
                "Invoiced",
                "Received",
                "Unit",
                "Reason",
                "Credit",
              ]}
              numeric={[1, 2, 5]}
              rows={note.lines.map((line) => [
                line.product,
                qty(line.invoiced),
                qty(line.received),
                line.unit,
                line.reason,
                line.credit === null ? "—" : formatMoney(line.credit),
              ])}
            />
            <label className={labelClass}>
              Note (memo #, who you spoke to)
              <input
                name="note"
                defaultValue={
                  note.creditReceived
                    ? `Credit received: ${note.creditReceived}`
                    : ""
                }
                className={inputClass}
              />
            </label>
          </ApplyForm>
        </Panel>
      );
    }
    case "drink_spec": {
      const spec = doc.parsed as unknown as DrinkSpec;
      return (
        <Panel
          title={spec.drinkName || "Drink spec"}
          actions={
            <ButtonLink href="/recipes/new" size="sm">
              Build the recipe
            </ButtonLink>
          }
        >
          <ApplyForm
            documentId={doc.id}
            label={again("Mark done")}
            hint="Build or update the recipe and its Toast mapping, then mark this done."
          >
            <Facts
              items={[
                ["Change", spec.change || "—"],
                ["Toast button", spec.toastName || "—"],
                ["Starts", day(spec.startsOn)],
                ["Price", spec.price === null ? "—" : formatMoney(spec.price)],
                [
                  "Glass · ice",
                  [spec.glass, spec.ice].filter(Boolean).join(" · ") || "—",
                ],
                [
                  "Method · garnish",
                  [spec.method, spec.garnish].filter(Boolean).join(" · ") ||
                    "—",
                ],
              ]}
            />
            <SimpleTable
              head={["Ingredient", "Amount", "Unit", "Notes"]}
              numeric={[1]}
              rows={spec.ingredients.map((i) => [
                i.name,
                qty(i.amount),
                i.unit,
                i.notes,
              ])}
            />
            <input
              type="hidden"
              name="note"
              value={`Spec: ${spec.drinkName}`}
            />
          </ApplyForm>
        </Panel>
      );
    }
    default:
      return (
        <Panel title="Other file">
          <ApplyForm
            documentId={doc.id}
            label={again("Mark filed")}
            hint="Nothing for the app to read. Mark it filed once you've dealt with it."
          >
            <label className={labelClass}>
              Note
              <input
                name="note"
                className={inputClass}
                placeholder="e.g. entered in payroll"
              />
            </label>
          </ApplyForm>
        </Panel>
      );
  }
}
