"use client";

import { RefreshCw } from "lucide-react";
import { type ReactNode, useActionState } from "react";

import { buttonClass, inputClass, labelClass } from "@/components/ui";

import {
  applyDriveDocumentAction,
  saveDriveFolderAction,
  syncDriveAction,
  type DriveFormState,
} from "./actions";

function Message({ state }: { state: DriveFormState }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      className={`text-sm ${state.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
    >
      {state.message}
    </p>
  );
}

export function SyncButton() {
  const [state, action, pending] = useActionState<DriveFormState>(
    syncDriveAction,
    {},
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      {state.message && (
        <span
          role="status"
          className={`max-w-xs text-xs ${state.ok ? "text-[var(--muted)]" : "text-[var(--danger)]"}`}
        >
          {state.message}
        </span>
      )}
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary")}
      >
        <RefreshCw
          aria-hidden="true"
          className={`size-4 ${pending ? "animate-spin" : ""}`}
        />
        {pending ? "Syncing…" : "Sync now"}
      </button>
    </form>
  );
}

export function ConnectFolderForm({
  defaultFolder = "",
  serviceAccount,
}: {
  defaultFolder?: string;
  serviceAccount: string;
}) {
  const [state, action, pending] = useActionState<DriveFormState, FormData>(
    saveDriveFolderAction,
    {},
  );
  return (
    <form action={action} className="grid gap-3">
      <ol className="grid gap-2 text-sm text-[var(--muted)]">
        <li>
          <span className="font-medium text-[var(--foreground)]">1.</span> In
          Drive, open the team&apos;s documents folder and click{" "}
          <span className="font-medium">Share</span>.
        </li>
        <li>
          <span className="font-medium text-[var(--foreground)]">2.</span> Add{" "}
          <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-xs text-[var(--foreground)] select-all">
            {serviceAccount}
          </code>{" "}
          as a <span className="font-medium">Viewer</span>.
        </li>
        <li>
          <span className="font-medium text-[var(--foreground)]">3.</span> Paste
          the folder&apos;s link here. Every subfolder is included, so share the
          top folder once and new periods show up on their own.
        </li>
      </ol>
      <label className={labelClass}>
        Folder link
        <input
          name="folder"
          required
          defaultValue={defaultFolder}
          placeholder="https://drive.google.com/drive/folders/…"
          className={inputClass}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("primary")}
        >
          {pending ? "Connecting…" : "Connect and sync"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

/** Wraps a document's apply controls; extra fields go in children. */
export function ApplyForm({
  documentId,
  label,
  disabled = false,
  hint,
  children,
}: {
  documentId: string;
  label: string;
  disabled?: boolean;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState<DriveFormState, FormData>(
    applyDriveDocumentAction.bind(null, documentId),
    {},
  );
  return (
    <form action={action} className="grid gap-4">
      {children}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <button
          type="submit"
          disabled={disabled || pending}
          className={buttonClass("primary")}
        >
          {pending ? "Working…" : label}
        </button>
        {hint && !state.message && (
          <span className="text-xs text-[var(--muted)]">{hint}</span>
        )}
        <Message state={state} />
      </div>
    </form>
  );
}
