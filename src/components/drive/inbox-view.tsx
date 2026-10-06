import {
  ChefHat,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileQuestion,
  FileText,
  Martini,
  ReceiptText,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { SectionNav } from "@/components/layout/section-nav";
import {
  Badge,
  Callout,
  EmptyState,
  PageBody,
  PageHeader,
  Panel,
  StatGrid,
  StatTile,
  Tabs,
} from "@/components/ui";
import {
  KIND_LABEL,
  KIND_ORDER,
  describeDocument,
  isOpen,
  modifiedLabel,
  prettyName,
  shortFolder,
  statusOf,
} from "@/lib/drive/present";
import type { DriveDocumentRow, getDriveInbox } from "@/lib/drive/queries";
import type { DocumentKind } from "@/lib/drive/templates";

import {
  ConnectFolderForm,
  SyncButton,
} from "@/app/(manager)/imports/drive/drive-forms";

const KIND_ICON: Record<DocumentKind, LucideIcon> = {
  count_sheet: ClipboardList,
  waste_log: Trash2,
  batch_sheet: ChefHat,
  invoice_file: FileText,
  credit_note: ReceiptText,
  drink_spec: Martini,
  other: FileQuestion,
};

export type InboxView = "todo" | "done" | "all";

/** The Drive inbox screen, given its data. */
export function DriveInboxView({
  source,
  documents,
  view,
  serviceAccount,
}: {
  source: Awaited<ReturnType<typeof getDriveInbox>>["source"];
  documents: DriveDocumentRow[];
  view: InboxView;
  serviceAccount: string | null;
}) {
  const open = documents.filter(isOpen);
  const ready = open.filter(
    (doc) => doc.status === "ready" || doc.status === "new",
  ).length;
  const attention = open.filter(
    (doc) =>
      doc.status === "needs_review" ||
      doc.status === "error" ||
      doc.changedSinceApplied,
  ).length;
  const done = documents.filter((doc) => !isOpen(doc));
  const visible = view === "todo" ? open : view === "done" ? done : documents;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Imports", href: "/imports" }]}
        title="Drive inbox"
        description={
          source
            ? `Files from "${source.rootFolderName || "the shared folder"}" · ${
                source.lastSyncedAt
                  ? `synced ${modifiedLabel(source.lastSyncedAt)}`
                  : "not synced yet"
              }`
            : "Counts, waste logs, batch sheets and invoices the team files in Google Drive"
        }
        actions={
          source && serviceAccount ? (
            <>
              <a
                href={`https://drive.google.com/drive/folders/${source.rootFolderId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Open folder
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
              <SyncButton />
            </>
          ) : null
        }
      />
      <SectionNav section="imports" active="/imports/drive" />
      <PageBody>
        {!serviceAccount ? (
          <SetupPanel />
        ) : !source ? (
          <Panel
            title="Connect the shared folder"
            description="The app reads the folder; it never changes or deletes anything in Drive."
          >
            <div className="max-w-2xl">
              <ConnectFolderForm serviceAccount={serviceAccount} />
            </div>
          </Panel>
        ) : (
          <>
            {source.lastError && (
              <Callout tone="danger" title="The last sync failed">
                {source.lastError}
              </Callout>
            )}
            <StatGrid>
              <StatTile
                label="Ready to apply"
                value={ready}
                detail="Read cleanly and waiting on you"
                tone={ready ? "accent" : "neutral"}
                href="/imports/drive"
              />
              <StatTile
                label="Needs a look"
                value={attention}
                detail="Missing info, or edited after applying"
                tone={attention ? "warning" : "good"}
                href="/imports/drive"
              />
              <StatTile
                label="Done"
                value={done.length}
                detail="Applied or set aside"
                href="/imports/drive?show=done"
              />
              <StatTile
                label="In the folder"
                value={documents.length}
                detail="Templates and the Start Here doc are skipped"
                href="/imports/drive?show=all"
              />
            </StatGrid>

            <Tabs
              items={[
                {
                  label: `To do (${open.length})`,
                  href: "/imports/drive",
                  active: view === "todo",
                },
                {
                  label: `Done (${done.length})`,
                  href: "/imports/drive?show=done",
                  active: view === "done",
                },
                {
                  label: "Everything",
                  href: "/imports/drive?show=all",
                  active: view === "all",
                },
              ]}
            />

            {visible.length === 0 ? (
              <Panel>
                <EmptyState
                  title={view === "todo" ? "Inbox zero" : "Nothing here yet"}
                  detail={
                    view === "todo"
                      ? "Everything filed in Drive has been applied. New files show up after the nightly sync, or press Sync now."
                      : "Files appear here after they're synced from Drive."
                  }
                />
              </Panel>
            ) : (
              <div className="grid gap-5">
                {KIND_ORDER.map((kind) => {
                  const group = visible.filter((doc) => doc.kind === kind);
                  if (!group.length) return null;
                  return (
                    <DocumentGroup key={kind} kind={kind} documents={group} />
                  );
                })}
              </div>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

function DocumentGroup({
  kind,
  documents,
}: {
  kind: DocumentKind;
  documents: DriveDocumentRow[];
}) {
  const Icon = KIND_ICON[kind];
  return (
    <Panel
      flush
      title={
        <span className="inline-flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4 text-[var(--muted)]" />
          {KIND_LABEL[kind].many}
          <span className="font-normal text-[var(--muted)]">
            {documents.length}
          </span>
        </span>
      }
    >
      <ul className="divide-y">
        {documents.map((doc) => {
          const status = statusOf(doc);
          return (
            <li key={doc.id}>
              <Link
                href={`/imports/drive/${doc.id}`}
                className="group flex items-center gap-4 px-4 py-3 transition hover:bg-[var(--surface)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={doc.name}>
                    {prettyName(doc.name)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                    {doc.status === "applied" && doc.appliedSummary
                      ? doc.appliedSummary
                      : describeDocument(doc)}
                  </p>
                </div>
                <div className="hidden shrink-0 text-right text-xs text-[var(--muted)] md:block">
                  <p>{shortFolder(doc.folderPath)}</p>
                  <p className="mt-0.5">{modifiedLabel(doc.modifiedTime)}</p>
                </div>
                <Badge tone={status.tone}>{status.label}</Badge>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function SetupPanel() {
  return (
    <Panel
      title="Connect Google Drive"
      description="One-time setup, about ten minutes, by whoever manages the Google account."
    >
      <ol className="grid max-w-3xl gap-4 text-sm">
        {[
          [
            "Create a service account",
            "In Google Cloud Console, pick or create a project, enable the Google Drive API, then go to IAM & Admin → Service accounts → Create. No roles are needed.",
          ],
          [
            "Download its key",
            "Open the service account → Keys → Add key → JSON. A .json file downloads.",
          ],
          [
            "Add it to Vercel",
            "In the Vercel project → Settings → Environment Variables, add GOOGLE_SERVICE_ACCOUNT_JSON (Production) and paste the whole file. Mark it Sensitive, then redeploy.",
          ],
          [
            "Come back here",
            "This page then shows the account's email to share the Drive folder with.",
          ],
        ].map(([title, detail], index) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border bg-[var(--surface)] text-xs font-semibold">
              {index + 1}
            </span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="mt-0.5 text-[var(--muted)]">{detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
