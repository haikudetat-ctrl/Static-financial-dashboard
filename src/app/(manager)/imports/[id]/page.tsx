import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getUserContext } from "@/lib/auth/session";
import { IMPORT_STATUS_LABELS } from "@/lib/imports";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <Link
        href="/imports"
        className="mb-6 inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ChevronLeft size={14} strokeWidth={1.7} />
        All imports
      </Link>

      <header className="border-b pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
              {importRecord.source_type}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              {importRecord.file_name}
            </h1>
          </div>
          <span
            className={`shrink-0 rounded px-2.5 py-1 font-mono text-[10px] uppercase ${
              importRecord.status === "posted"
                ? "bg-[#edf4ee] text-[#3f6d55]"
                : importRecord.status === "failed"
                  ? "bg-[#f8e9e6] text-[#7e3025]"
                  : "bg-[#eef0ec] text-[#62685f]"
            }`}
          >
            {IMPORT_STATUS_LABELS[importRecord.status] ?? importRecord.status}
          </span>
        </div>
      </header>

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
          <div key={stat.label} className="border px-4 py-3">
            <p className="font-mono text-[9px] tracking-[0.13em] text-[var(--muted)] uppercase">
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
                  <th className="pr-4 pb-3 font-normal">#</th>
                  <th className="pr-4 pb-3 font-normal">Status</th>
                  <th className="pr-4 pb-3 font-normal">Raw data</th>
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
                    <td className="max-w-md truncate py-2 pr-4 font-mono text-xs text-[var(--muted)]">
                      {JSON.stringify(row.normalized_data).slice(0, 120)}
                      {JSON.stringify(row.normalized_data).length > 120
                        ? "…"
                        : ""}
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
    </div>
  );
}
