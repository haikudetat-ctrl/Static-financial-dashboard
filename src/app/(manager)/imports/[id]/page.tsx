import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { IMPORT_STATUS_LABELS } from "@/lib/imports";
import { createClient } from "@/lib/supabase/server";
import { Badge, PageBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Import detail" };

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getUserContext();

  if (!context?.organizationId) {
    return notFound();
  }

  const supabase = await createClient();

  const { data: importRecord } = await supabase
    .from("source_imports")
    .select("*")
    .eq("id", id)
    .eq("organization_id", context.organizationId)
    .single();

  if (!importRecord) {
    return notFound();
  }

  const { data: rows } = await supabase
    .from("source_import_rows")
    .select("*")
    .eq("source_import_id", id)
    .order("row_index", { ascending: true })
    .limit(100);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Imports", href: "/imports" }]}
        title={importRecord.file_name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {importRecord.source_type}
            <Badge
              tone={
                importRecord.status === "posted"
                  ? "good"
                  : importRecord.status === "failed"
                    ? "danger"
                    : "neutral"
              }
            >
              {IMPORT_STATUS_LABELS[importRecord.status] ?? importRecord.status}
            </Badge>
          </span>
        }
      />
      <PageBody>
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: "Rows", value: String(importRecord.row_count) },
            {
              label: "Parser version",
              value: importRecord.parser_version || "—",
            },
            {
              label: "Uploaded",
              value: new Date(importRecord.created_at).toLocaleDateString(),
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border bg-[var(--surface-strong)] px-4 py-3"
            >
              <p className="text-xs font-medium text-[var(--muted)]">
                {stat.label}
              </p>
              <p className="mt-1 text-lg font-semibold">{stat.value}</p>
            </div>
          ))}
        </section>

        {/* Staged rows preview */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">
            Staged rows {rows ? `(${rows.length})` : ""}
          </h2>

          {!rows || rows.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              No rows staged yet. Extraction may still be in progress.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left font-mono text-[9px] tracking-[0.13em] text-[var(--muted)] uppercase">
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Raw data</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="py-2 pr-4 font-mono text-xs text-[var(--muted)]">
                        {row.row_index + 1}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="text-xs text-[var(--muted)]">
                          {row.status}
                        </span>
                      </td>
                      <td className="max-w-lg truncate py-2 pr-4 font-mono text-xs text-[var(--muted)]">
                        {(() => {
                          const normalized = row.normalized_data ?? {};
                          const hasData = Object.values(normalized).some(
                            (v) => v !== "" && v !== 0 && v !== false,
                          );
                          const obj = hasData
                            ? normalized
                            : (row.raw_data ?? {});
                          const json = JSON.stringify(obj);
                          return json.length > 250
                            ? json.slice(0, 250) + "…"
                            : json;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && (
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Showing 50 of {rows.length} rows.
                </p>
              )}
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}
