"use client";

import { useRef, useState, useCallback } from "react";
import { readUploadResponse } from "@/components/imports/upload-response";
import { buttonClass, inputClass, labelClass } from "@/components/ui";

/** Yesterday in the bar's timezone: the usual day a nightly export covers. */
function yesterday() {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

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
  askBusinessDate = false,
}: {
  sourceType: string;
  label: string;
  accept: string;
  /** Show a business-date field (nightly POS exports). */
  askBusinessDate?: boolean;
  onComplete?: (result: UploadResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("");
  const [importId, setImportId] = useState<string | null>(null);
  const [businessDate, setBusinessDate] = useState(yesterday);

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
        if (askBusinessDate) formData.append("businessDate", businessDate);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const result = await readUploadResponse(response);

        if (!response.ok) {
          setState("error");
          setMessage(result.error ?? "Upload failed");
          return;
        }

        setImportId(result.importId ?? null);

        if (result.duplicate) {
          setState("duplicate");
          setMessage(`${file.name} was already imported.`);
        } else {
          setState("done");
          setMessage(`${file.name} uploaded and staged.`);
        }

        if (result.importId && typeof result.duplicate === "boolean") {
          onComplete?.({
            importId: result.importId,
            duplicate: result.duplicate,
            fileName: result.fileName ?? file.name,
          });
        }
      } catch (error) {
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Upload failed. Check your connection.",
        );
      }
    },
    [sourceType, onComplete, askBusinessDate, businessDate],
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
        <div className="flex flex-wrap items-end gap-2">
          {askBusinessDate && (
            <label className={labelClass}>
              Business day
              <input
                type="date"
                value={businessDate}
                onChange={(event) => setBusinessDate(event.target.value)}
                className={`${inputClass} w-40`}
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={buttonClass("primary")}
          >
            Upload {label}
          </button>
        </div>
      )}

      {state === "uploading" && (
        <p className="text-sm text-[var(--muted)]">{message}</p>
      )}

      {(state === "done" || state === "duplicate") && importId && (
        <div className="grid justify-items-start gap-2">
          <p
            className={`text-sm ${
              state === "duplicate" ? "text-[#a68b2f]" : "text-[var(--success)]"
            }`}
          >
            {message}
          </p>
          <a
            href={`/imports/${importId}`}
            className={buttonClass("secondary", "sm")}
          >
            Review import
          </a>
        </div>
      )}

      {state === "error" && (
        <div className="grid justify-items-start gap-2">
          <p className="text-sm text-[#a63f2f]">{message}</p>
          <button
            type="button"
            onClick={() => {
              setState("idle");
              setMessage("");
            }}
            className={buttonClass("secondary", "sm")}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
