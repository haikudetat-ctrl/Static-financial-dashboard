import { createAdminClient } from "@/lib/supabase/admin";
import {
  SHEET_MIME,
  createDriveClient,
  getAccessToken,
  readServiceAccount,
  type DriveClient,
  type DriveFile,
} from "@/lib/google/drive";
import {
  kindForFile,
  parseCsv,
  parseTemplate,
  type DocumentKind,
  type Issue,
} from "@/lib/drive/templates";

type Admin = ReturnType<typeof createAdminClient>;

export const DRIVE_PARSER_VERSION = "drive-templates-1";

export type DriveSource = {
  id: string;
  organizationId: string;
  locationId: string;
  rootFolderId: string;
  rootFolderName: string;
  lastSyncedAt: string | null;
  lastError: string;
};

export type SyncSummary = {
  scanned: number;
  added: number;
  updated: number;
  failed: number;
};

/** Files the team keeps for reference, not for the app. */
export function isSkipped(file: Pick<DriveFile, "name" | "mimeType">) {
  return (
    /^template\b/i.test(file.name.trim()) ||
    /^00 start here/i.test(file.name.trim()) ||
    file.mimeType === "application/vnd.google-apps.shortcut"
  );
}

export async function openDrive() {
  const account = readServiceAccount();
  if (!account) {
    throw new Error(
      "Google Drive isn't connected yet: GOOGLE_SERVICE_ACCOUNT_JSON is not set.",
    );
  }
  return createDriveClient(await getAccessToken(account));
}

export async function loadDriveSource(
  locationId: string,
  admin: Admin = createAdminClient(),
): Promise<DriveSource | null> {
  const { data } = await admin
    .from("drive_sources")
    .select(
      "id, organization_id, location_id, root_folder_id, root_folder_name, last_synced_at, last_error",
    )
    .eq("location_id", locationId)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    organizationId: data.organization_id,
    locationId: data.location_id,
    rootFolderId: data.root_folder_id,
    rootFolderName: data.root_folder_name,
    lastSyncedAt: data.last_synced_at,
    lastError: data.last_error,
  };
}

/** Reads one file into its kind, parsed data and issues. */
export async function readDocument(
  drive: DriveClient,
  file: DriveFile,
): Promise<{ kind: DocumentKind; parsed: unknown; issues: Issue[] }> {
  if (file.mimeType !== SHEET_MIME) {
    return {
      kind: kindForFile(file.mimeType, file.path),
      parsed: null,
      issues: [],
    };
  }
  const parsed = parseTemplate(parseCsv(await drive.exportCsv(file.id)));
  if (!parsed) {
    return {
      kind: "other",
      parsed: null,
      issues: [
        {
          level: "warning",
          message:
            "This sheet isn't one of the templates, so there's nothing to apply.",
        },
      ],
    };
  }
  const { issues, ...data } = parsed;
  return { kind: parsed.kind, parsed: data, issues };
}

/**
 * Brings the inbox up to date with the Drive folder. New and edited files
 * are read again; applied files keep their status but show that they
 * changed since.
 */
export async function syncDriveSource(
  source: DriveSource,
  {
    admin = createAdminClient(),
    drive,
  }: { admin?: Admin; drive?: DriveClient } = {},
): Promise<SyncSummary> {
  const summary: SyncSummary = { scanned: 0, added: 0, updated: 0, failed: 0 };
  try {
    const client = drive ?? (await openDrive());
    const root = await client.getFile(source.rootFolderId);
    const files = (await client.listTree(source.rootFolderId)).filter(
      (file) => !isSkipped(file),
    );
    summary.scanned = files.length;

    const { data: existing } = await admin
      .from("drive_documents")
      .select("drive_file_id, modified_time, status")
      .eq("location_id", source.locationId);
    const known = new Map(
      (existing ?? []).map((doc) => [doc.drive_file_id, doc]),
    );

    for (const file of files) {
      const previous = known.get(file.id);
      const unchanged =
        previous &&
        new Date(previous.modified_time).getTime() ===
          new Date(file.modifiedTime).getTime() &&
        previous.status !== "error";
      if (unchanged) continue;

      const base = {
        organization_id: source.organizationId,
        location_id: source.locationId,
        drive_file_id: file.id,
        name: file.name,
        mime_type: file.mimeType,
        folder_path: file.path,
        web_view_link: file.webViewLink ?? "",
        modified_time: file.modifiedTime,
        updated_at: new Date().toISOString(),
      };
      let row: Record<string, unknown>;
      try {
        const read = await readDocument(client, file);
        const hasErrors = read.issues.some((issue) => issue.level === "error");
        row = {
          ...base,
          kind: read.kind,
          parsed: read.parsed,
          issues: read.issues,
          error_message: "",
          ...(previous?.status === "applied" || previous?.status === "ignored"
            ? {}
            : { status: hasErrors ? "needs_review" : "ready" }),
        };
      } catch (error) {
        summary.failed++;
        row = {
          ...base,
          kind: "other",
          status: "error",
          error_message:
            error instanceof Error ? error.message : "Couldn't read the file.",
        };
      }
      const { error } = await admin
        .from("drive_documents")
        .upsert(row, { onConflict: "location_id,drive_file_id" });
      if (error) throw new Error(error.message);
      if (previous) summary.updated++;
      else summary.added++;
    }

    await admin
      .from("drive_sources")
      .update({
        root_folder_name: root.name,
        last_synced_at: new Date().toISOString(),
        last_error: "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    await admin
      .from("drive_sources")
      .update({ last_error: message.slice(0, 1000) })
      .eq("id", source.id);
    throw new Error(message);
  }
}
