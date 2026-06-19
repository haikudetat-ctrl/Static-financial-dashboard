import type { Metadata } from "next";

import { UploadForm } from "@/components/imports/upload-form";
import { ImportTable } from "@/components/imports/import-table";
import { getUserContext } from "@/lib/auth/session";
import { getImports, IMPORT_SOURCE_TYPES } from "@/lib/imports";

export const metadata: Metadata = { title: "Imports" };

export default async function ImportsPage() {
  const context = await getUserContext();

  const imports = context?.organizationId
    ? await getImports(context.organizationId, { limit: 50 })
    : [];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <header className="border-b pb-8">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Source imports
        </p>
        <div className="mt-3 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
          <h1 className="max-w-3xl text-4xl leading-[0.98] font-semibold tracking-[-0.055em] sm:text-5xl">
            Every document belongs somewhere.
          </h1>
          <p className="max-w-xl text-sm leading-6 text-[var(--muted)] xl:justify-self-end">
            Upload PLCB invoices, Toast reports, order guides, or recipe files.
            The system extracts, stages, and queues them for mapping.
          </p>
        </div>
      </header>

      <section className="mt-8 grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em]">
            Import history
          </h2>
          <div className="mt-4">
            <ImportTable imports={imports} />
          </div>
        </div>

        <aside className="border bg-[var(--surface)] p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Upload source file</h2>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Files are hashed to prevent duplicate imports.
          </p>

          <div className="mt-6 grid gap-6">
            <div className="border-b pb-6">
              <p className="mb-1 text-sm font-semibold">PLCB invoice</p>
              <p className="mb-3 text-xs text-[var(--muted)]">
                PDF invoice from the Pennsylvania Liquor Control Board.
              </p>
              <UploadForm
                sourceType={IMPORT_SOURCE_TYPES.PLCB}
                label="PLCB invoice"
                accept=".pdf"
              />
            </div>

            <div className="border-b pb-6">
              <p className="mb-1 text-sm font-semibold">Toast PMIX</p>
              <p className="mb-3 text-xs text-[var(--muted)]">
                CSV or ZIP with item-mix sales data.
              </p>
              <UploadForm
                sourceType={IMPORT_SOURCE_TYPES.TOAST_PMIX}
                label="Toast PMIX"
                accept=".csv,.zip"
              />
            </div>

            <div className="border-b pb-6">
              <p className="mb-1 text-sm font-semibold">Toast Sales Summary</p>
              <p className="mb-3 text-xs text-[var(--muted)]">
                ZIP package with daily sales summaries.
              </p>
              <UploadForm
                sourceType={IMPORT_SOURCE_TYPES.TOAST_SALES}
                label="Toast Sales"
                accept=".zip"
              />
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold">Order Guide</p>
              <p className="mb-3 text-xs text-[var(--muted)]">
                Excel workbook with vendors, items, and pars.
              </p>
              <UploadForm
                sourceType={IMPORT_SOURCE_TYPES.ORDER_GUIDE}
                label="Order Guide"
                accept=".xlsx,.csv"
              />
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
