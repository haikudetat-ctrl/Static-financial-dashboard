import { createClient } from "@/lib/supabase/server";

export type ImportRegistration = {
  fileHash: string;
  fileName: string;
  filePath: string;
  sourceType: string;
  organizationId: string;
  locationId: string;
  parserVersion: string;
};

export type ImportResult = {
  importId: string;
  duplicate: boolean;
  existingImportId?: string;
};

export async function registerImport(
  registration: ImportRegistration,
): Promise<ImportResult> {
  const supabase = await createClient();

  // Check for duplicate by file hash
  const { data: existing } = await supabase
    .from("source_imports")
    .select("id, status")
    .eq("file_hash", registration.fileHash)
    .eq("organization_id", registration.organizationId)
    .maybeSingle();

  if (existing) {
    return {
      importId: existing.id,
      duplicate: true,
      existingImportId: existing.id,
    };
  }

  const { data: created, error } = await supabase
    .from("source_imports")
    .insert({
      organization_id: registration.organizationId,
      location_id: registration.locationId,
      source_type: registration.sourceType,
      file_hash: registration.fileHash,
      file_name: registration.fileName,
      file_path: registration.filePath,
      parser_version: registration.parserVersion,
      status: "received",
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(
      `Failed to register import: ${error?.message ?? "unknown"}`,
    );
  }

  return { importId: created.id, duplicate: false };
}

export async function updateImportStatus(
  importId: string,
  status: string,
  errorMessage?: string,
): Promise<void> {
  const supabase = await createClient();

  const update: Record<string, unknown> = { status };

  if (errorMessage) {
    update.error_message = errorMessage;
  }

  const { error } = await supabase
    .from("source_imports")
    .update(update)
    .eq("id", importId);

  if (error) {
    throw new Error(`Failed to update import status: ${error.message}`);
  }
}

export async function stageImportRows(
  importId: string,
  rows: Array<{
    rowIndex: number;
    rawData: Record<string, unknown>;
    normalizedData: Record<string, unknown>;
  }>,
): Promise<void> {
  const supabase = await createClient();

  const insertRows = rows.map((row) => ({
    source_import_id: importId,
    row_index: row.rowIndex,
    raw_data: row.rawData,
    normalized_data: row.normalizedData,
    status: "staged",
  }));

  const { error } = await supabase
    .from("source_import_rows")
    .insert(insertRows);

  if (error) {
    throw new Error(`Failed to stage import rows: ${error.message}`);
  }

  // Update import row count and status
  await supabase
    .from("source_imports")
    .update({
      row_count: rows.length,
      status: "staged",
    })
    .eq("id", importId);
}

export async function getImports(
  organizationId: string,
  options?: {
    sourceType?: string;
    status?: string;
    limit?: number;
  },
): Promise<
  Array<{
    id: string;
    source_type: string;
    file_name: string;
    status: string;
    row_count: number;
    created_at: string;
    approved_at: string | null;
  }>
> {
  const supabase = await createClient();

  let query = supabase
    .from("source_imports")
    .select(
      "id, source_type, file_name, status, row_count, created_at, approved_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (options?.sourceType) {
    query = query.eq("source_type", options.sourceType);
  }

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data } = await query;

  return (data ?? []) as Array<{
    id: string;
    source_type: string;
    file_name: string;
    status: string;
    row_count: number;
    created_at: string;
    approved_at: string | null;
  }>;
}

export const IMPORT_SOURCE_TYPES = {
  PLCB: "plcb_invoice",
  TOAST_PMIX: "toast_pmix",
  TOAST_SALES: "toast_sales_summary",
  TOAST_LABOR: "toast_labor",
  ORDER_GUIDE: "order_guide",
  RECIPE: "recipe",
} as const;

export const IMPORT_STATUS_LABELS: Record<string, string> = {
  received: "Received",
  extracting: "Extracting",
  extracted: "Extracted",
  staging: "Staging rows",
  staged: "Staged",
  mapping: "Needs mapping",
  ready: "Ready",
  posted: "Posted",
  failed: "Failed",
  duplicate: "Duplicate",
  cancelled: "Cancelled",
};
