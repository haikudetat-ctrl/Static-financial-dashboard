"use client";

import { useRef, useState, useCallback } from "react";

type UploadState = "idle" | "uploading" | "done" | "duplicate" | "error";

type UploadResult = {
  importId: string;
  duplicate: boolean;
  fileName: string;
};

export function UploadForm({
  sourceType,
  label,
  accept,
  onComplete,
}: {
  sourceType: string;
  label: string;
  accept: string;
  onComplete?: (result: UploadResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("");
  const [importId, setImportId] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setState("uploading");
      setMessage(`Uploading ${file.name}…`);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sourceType", sourceType);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          setState("error");
          setMessage(result.error ?? "Upload failed");
          return;
        }

        setImportId(result.importId);

        if (result.duplicate) {
          setState("duplicate");
          setMessage(`${file.name} was already imported.`);
        } else {
          setState("done");
          setMessage(`${file.name} uploaded and staged.`);
        }

        onComplete?.(result);
      } catch {
        setState("error");
        setMessage("Upload failed. Check your connection.");
      }
    },
    [sourceType, onComplete],
  );

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleUpload}
        className="hidden"
        aria-label={`Upload ${label}`}
      />

      {state === "idle" && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 bg-[var(--foreground)] px-4 text-sm font-semibold text-white hover:bg-[#343a32] active:translate-y-px"
        >
          Upload {label}
        </button>
      )}

      {state === "uploading" && (
        <p className="text-sm text-[var(--muted)]">{message}</p>
      )}

      {(state === "done" || state === "duplicate") && importId && (
        <div className="grid gap-2">
          <p
            className={`text-sm ${
              state === "duplicate" ? "text-[#a68b2f]" : "text-[var(--success)]"
            }`}
          >
            {message}
          </p>
          <a
            href={`/imports/${importId}`}
            className="inline-flex min-h-9 items-center gap-1 border px-3 text-xs font-semibold hover:bg-[var(--surface)]"
          >
            Review import
          </a>
        </div>
      )}

      {state === "error" && (
        <div className="grid gap-2">
          <p className="text-sm text-[#a63f2f]">{message}</p>
          <button
            type="button"
            onClick={() => {
              setState("idle");
              setMessage("");
            }}
            className="inline-flex min-h-9 items-center gap-1 border px-3 text-xs font-semibold"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
