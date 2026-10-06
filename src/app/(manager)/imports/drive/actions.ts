"use server";

import { revalidatePath } from "next/cache";

import { getUserContext } from "@/lib/auth/session";
import {
  applyBatchSheet,
  applyCountSheet,
  applyWasteLog,
  loadCatalog,
  previewBatchSheet,
  previewCountSheet,
  previewWasteLog,
} from "@/lib/drive/apply";
import { getDriveDocument } from "@/lib/drive/queries";
import { loadDriveSource, openDrive, syncDriveSource } from "@/lib/drive/sync";
import type { BatchSheet, CountSheet, WasteLog } from "@/lib/drive/templates";
import { parseFolderId } from "@/lib/google/drive";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { ingestInvoiceDocument } from "@/lib/invoices/ingest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DriveFormState = { ok?: boolean; message?: string };

async function requireManager() {
  const context = await getUserContext();
  if (!context || context.role !== "manager" || !context.organizationId) {
    throw new Error("Manager access required.");
  }
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) throw new Error("No location is configured.");
  return { context, organizationId: context.organizationId, locationId };
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

function refresh(id?: string) {
  revalidatePath("/imports/drive");
  if (id) revalidatePath(`/imports/drive/${id}`);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function syncMessage(summary: Awaited<ReturnType<typeof syncDriveSource>>) {
  const changes = summary.added + summary.updated;
  return changes
    ? `Synced: ${plural(summary.added, "new file")}, ${plural(summary.updated, "updated file")}${summary.failed ? `, ${summary.failed} couldn't be read` : ""}.`
    : `Up to date. ${plural(summary.scanned, "file")} in the folder.`;
}

export async function saveDriveFolderAction(
  _state: DriveFormState,
  formData: FormData,
): Promise<DriveFormState> {
  try {
    const { context, organizationId, locationId } = await requireManager();
    const folderId = parseFolderId(String(formData.get("folder") ?? ""));
    if (!folderId) {
      return { ok: false, message: "Paste the Drive folder's link." };
    }
    const drive = await openDrive();
    const folder = await drive.getFile(folderId);
    const admin = createAdminClient();
    const { error } = await admin.from("drive_sources").upsert(
      {
        organization_id: organizationId,
        location_id: locationId,
        root_folder_id: folderId,
        root_folder_name: folder.name,
        active: true,
        last_error: "",
        created_by: context.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "location_id" },
    );
    if (error) throw new Error(error.message);
    const source = await loadDriveSource(locationId, admin);
    const summary = await syncDriveSource(source!, { admin, drive });
    refresh();
    return {
      ok: true,
      message: `Connected to "${folder.name}". ${syncMessage(summary)}`,
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function syncDriveAction(): Promise<DriveFormState> {
  try {
    const { locationId } = await requireManager();
    const source = await loadDriveSource(locationId);
    if (!source) return { ok: false, message: "Connect a Drive folder first." };
    const summary = await syncDriveSource(source);
    refresh();
    return { ok: true, message: syncMessage(summary) };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

async function markDocument(
  id: string,
  userId: string,
  modifiedTime: string,
  values: {
    status: "applied" | "ignored" | "ready" | "needs_review";
    summary?: string;
    targetId?: string | null;
  },
) {
  const reopened =
    values.status === "ready" || values.status === "needs_review";
  const admin = createAdminClient();
  const { error } = await admin
    .from("drive_documents")
    .update({
      status: values.status,
      applied_at: reopened ? null : new Date().toISOString(),
      applied_by: reopened ? null : userId,
      applied_modified_time: reopened ? null : modifiedTime,
      applied_summary: values.summary ?? "",
      applied_target_id: values.targetId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Midday of a business date in New York, as an ISO timestamp. */
const middayOf = (date: string) =>
  new Date(`${date}T12:00:00-05:00`).toISOString();

export async function applyDriveDocumentAction(
  id: string,
  _state: DriveFormState,
  formData: FormData,
): Promise<DriveFormState> {
  try {
    const { context, organizationId, locationId } = await requireManager();
    const doc = await getDriveDocument(id);
    if (!doc || doc.locationId !== locationId) {
      return { ok: false, message: "Document not found." };
    }
    const supabase = await createClient();
    let summary = "";
    let targetId: string | null = null;

    switch (doc.kind) {
      case "count_sheet": {
        const preview = await previewCountSheet(
          supabase,
          locationId,
          doc.parsed as unknown as CountSheet,
        );
        summary = await applyCountSheet(supabase, preview);
        targetId = preview.count?.id ?? null;
        break;
      }
      case "waste_log": {
        const catalog = await loadCatalog(supabase, organizationId, locationId);
        const overrides: Record<number, string> = {};
        for (const [key, value] of formData.entries()) {
          const match = key.match(/^item_(\d+)$/);
          if (match && value) overrides[Number(match[1])] = String(value);
        }
        const rows = previewWasteLog(
          catalog,
          doc.parsed as unknown as WasteLog,
          overrides,
        );
        summary = await applyWasteLog(
          supabase,
          locationId,
          doc.driveFileId,
          rows,
        );
        break;
      }
      case "batch_sheet": {
        const batch = doc.parsed as unknown as BatchSheet;
        const catalog = await loadCatalog(supabase, organizationId, locationId);
        const preview = await previewBatchSheet(supabase, catalog, batch);
        const result = await applyBatchSheet(
          supabase,
          {
            organizationId,
            locationId,
            userId: context.user.id,
            producedAt: middayOf(
              batch.dateMade ?? new Date().toISOString().slice(0, 10),
            ),
          },
          preview,
          [
            batch.madeBy && `Made by ${batch.madeBy}`,
            batch.containers && `${batch.containers} × ${batch.containerType}`,
            `From Drive: ${doc.name}`,
          ]
            .filter(Boolean)
            .join(" · "),
        );
        summary = result.summary;
        targetId = result.batchId;
        break;
      }
      case "invoice_file": {
        const vendorId = String(formData.get("vendor_id") ?? "");
        if (!vendorId) return { ok: false, message: "Pick the vendor." };
        const drive = await openDrive();
        const result = await ingestInvoiceDocument({
          supabase,
          organizationId,
          locationId,
          buffer: await drive.download(doc.driveFileId),
          fileName: doc.name,
          contentType: doc.mimeType,
          vendorId,
          invoiceNumber: String(formData.get("invoice_number") ?? ""),
        });
        summary = result.duplicate
          ? "Already in invoices"
          : "Sent to invoice review";
        targetId = result.invoiceId;
        break;
      }
      default: {
        summary = String(formData.get("note") ?? "").trim() || "Marked done";
      }
    }

    await markDocument(id, context.user.id, doc.modifiedTime, {
      status: "applied",
      summary,
      targetId,
    });
    refresh(id);
    revalidatePath("/inventory/counts");
    revalidatePath("/inventory/on-hand");
    return { ok: true, message: summary };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function setDriveDocumentStatusAction(
  id: string,
  status: "ignored" | "ready",
) {
  const { context, locationId } = await requireManager();
  const doc = await getDriveDocument(id);
  if (!doc || doc.locationId !== locationId)
    throw new Error("Document not found.");
  const hasErrors = doc.issues.some((issue) => issue.level === "error");
  await markDocument(id, context.user.id, doc.modifiedTime, {
    status: status === "ready" && hasErrors ? "needs_review" : status,
    summary: status === "ignored" ? "Ignored" : "",
  });
  refresh(id);
}
