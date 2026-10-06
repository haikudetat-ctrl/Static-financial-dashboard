import type { DocumentKind, Issue } from "@/lib/drive/templates";
import { createClient } from "@/lib/supabase/server";

export type DriveDocumentRow = {
  id: string;
  driveFileId: string;
  name: string;
  mimeType: string;
  folderPath: string;
  webViewLink: string;
  modifiedTime: string;
  kind: DocumentKind;
  status: "new" | "ready" | "needs_review" | "applied" | "ignored" | "error";
  parsed: Record<string, unknown> | null;
  issues: Issue[];
  errorMessage: string;
  appliedAt: string | null;
  appliedModifiedTime: string | null;
  appliedTargetId: string | null;
  appliedSummary: string;
  /** Edited in Drive after it was applied. */
  changedSinceApplied: boolean;
};

const COLUMNS =
  "id, drive_file_id, name, mime_type, folder_path, web_view_link, modified_time, kind, status, parsed, issues, error_message, applied_at, applied_modified_time, applied_target_id, applied_summary";

type Row = {
  id: string;
  drive_file_id: string;
  name: string;
  mime_type: string;
  folder_path: string;
  web_view_link: string;
  modified_time: string;
  kind: DocumentKind;
  status: DriveDocumentRow["status"];
  parsed: Record<string, unknown> | null;
  issues: Issue[] | null;
  error_message: string;
  applied_at: string | null;
  applied_modified_time: string | null;
  applied_target_id: string | null;
  applied_summary: string;
};

function toDocument(row: Row): DriveDocumentRow {
  return {
    id: row.id,
    driveFileId: row.drive_file_id,
    name: row.name,
    mimeType: row.mime_type,
    folderPath: row.folder_path,
    webViewLink: row.web_view_link,
    modifiedTime: row.modified_time,
    kind: row.kind,
    status: row.status,
    parsed: row.parsed,
    issues: row.issues ?? [],
    errorMessage: row.error_message,
    appliedAt: row.applied_at,
    appliedModifiedTime: row.applied_modified_time,
    appliedTargetId: row.applied_target_id,
    appliedSummary: row.applied_summary,
    changedSinceApplied: Boolean(
      row.status === "applied" &&
      row.applied_modified_time &&
      new Date(row.modified_time) > new Date(row.applied_modified_time),
    ),
  };
}

export async function getDriveInbox(locationId: string) {
  const supabase = await createClient();
  const [{ data: source }, { data: documents }] = await Promise.all([
    supabase
      .from("drive_sources")
      .select(
        "root_folder_id, root_folder_name, last_synced_at, last_error, active",
      )
      .eq("location_id", locationId)
      .maybeSingle(),
    supabase
      .from("drive_documents")
      .select(COLUMNS)
      .eq("location_id", locationId)
      .order("modified_time", { ascending: false })
      .limit(500),
  ]);
  return {
    source: source
      ? {
          rootFolderId: source.root_folder_id as string,
          rootFolderName: source.root_folder_name as string,
          lastSyncedAt: source.last_synced_at as string | null,
          lastError: source.last_error as string,
          active: source.active as boolean,
        }
      : null,
    documents: ((documents ?? []) as Row[]).map(toDocument),
  };
}

export async function getDriveDocument(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("drive_documents")
    .select(`${COLUMNS}, location_id, organization_id`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    ...toDocument(data as Row),
    locationId: data.location_id as string,
    organizationId: data.organization_id as string,
  };
}
