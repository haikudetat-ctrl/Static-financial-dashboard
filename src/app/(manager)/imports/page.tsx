import type { Metadata } from "next";

import { ImportTable } from "@/components/imports/import-table";
import { SectionNav } from "@/components/layout/section-nav";
import { UploadForm } from "@/components/imports/upload-form";
import { PageBody, PageHeader, Panel } from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import { getImports, IMPORT_SOURCE_TYPES } from "@/lib/imports";
import { getPrimaryLocation } from "@/lib/inventory/queries";

import { ToastPanel } from "./toast-panel";

export const metadata: Metadata = { title: "Imports" };

const SOURCES = [
  {
    sourceType: IMPORT_SOURCE_TYPES.TOAST_PMIX,
    title: "Toast product mix",
    detail: "Nightly item-mix export (CSV or ZIP).",
    label: "product mix",
    accept: ".csv,.zip",
    askBusinessDate: true,
  },
  {
    sourceType: IMPORT_SOURCE_TYPES.TOAST_SALES,
    title: "Toast sales summary",
    detail: "ZIP package with daily sales summaries.",
    label: "sales summary",
    accept: ".zip",
    askBusinessDate: true,
  },
  {
    sourceType: IMPORT_SOURCE_TYPES.PLCB,
    title: "PLCB invoice",
    detail: "PDF from the Licensee Online Order Portal.",
    label: "PLCB invoice",
    accept: ".pdf",
    askBusinessDate: false,
  },
  {
    sourceType: IMPORT_SOURCE_TYPES.ORDER_GUIDE,
    title: "Order guide",
    detail: "Workbook with vendors, items, and pars.",
    label: "order guide",
    accept: ".xlsx,.csv",
    askBusinessDate: false,
  },
];

export default async function ImportsPage() {
  const context = await getUserContext();

  const imports = context?.organizationId
    ? await getImports(context.organizationId, { limit: 50 })
    : [];
  const locationId = context?.organizationId
    ? await getPrimaryLocation(context.organizationId, context.locationId)
    : null;

  return (
    <>
      <PageHeader
        title="Imports"
        description="Toast exports, PLCB invoices and order guides. Duplicate files are detected automatically."
      />
      <SectionNav section="imports" active="/imports" />
      <PageBody>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="Import history" flush>
            <ImportTable imports={imports} />
          </Panel>
          <div className="grid gap-5">
            {locationId && <ToastPanel locationId={locationId} />}
            <Panel title="Upload" flush>
              <ul>
                {SOURCES.map((source) => (
                  <li
                    key={source.sourceType}
                    className="grid gap-2 border-b px-4 py-4 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{source.title}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {source.detail}
                      </p>
                    </div>
                    <UploadForm
                      sourceType={source.sourceType}
                      label={source.label}
                      accept={source.accept}
                      askBusinessDate={source.askBusinessDate}
                    />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </PageBody>
    </>
  );
}
