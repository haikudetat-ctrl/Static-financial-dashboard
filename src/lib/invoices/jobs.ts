import type { InvoiceProcessingJobStatus } from "@/lib/invoices/intelligence-types";

type InvoiceJobEvent =
  | "start_extracting"
  | "start_validating"
  | "start_matching"
  | "require_review"
  | "auto_approve"
  | "approve"
  | "post"
  | "fail"
  | "cancel"
  | "supersede";

const transitionTargets: Record<InvoiceJobEvent, InvoiceProcessingJobStatus> = {
  start_extracting: "extracting",
  start_validating: "validating",
  start_matching: "matching",
  require_review: "needs_review",
  auto_approve: "auto_approved",
  approve: "approved",
  post: "posted",
  fail: "failed",
  cancel: "cancelled",
  supersede: "superseded",
};

const allowedTransitions: Record<
  InvoiceProcessingJobStatus,
  InvoiceJobEvent[]
> = {
  queued: ["start_extracting", "fail", "cancel", "supersede"],
  extracting: ["start_validating", "fail", "cancel", "supersede"],
  validating: ["start_matching", "fail", "cancel", "supersede"],
  matching: ["require_review", "auto_approve", "fail", "cancel", "supersede"],
  needs_review: ["approve", "fail", "cancel", "supersede"],
  auto_approved: ["post", "fail", "cancel", "supersede"],
  approved: ["post", "fail", "cancel", "supersede"],
  posted: [],
  failed: ["start_extracting", "cancel", "supersede"],
  cancelled: [],
  superseded: [],
};

export function applyInvoiceJobTransition(
  currentStatus: InvoiceProcessingJobStatus,
  event: InvoiceJobEvent,
): InvoiceProcessingJobStatus {
  const nextStatus = transitionTargets[event];
  if (!allowedTransitions[currentStatus].includes(event)) {
    throw new Error(
      `Cannot transition invoice job from ${currentStatus} to ${nextStatus}.`,
    );
  }
  return nextStatus;
}

export function nextInvoiceJobAttempt({
  attemptCount,
  maxAttempts,
}: {
  attemptCount: number;
  maxAttempts: number;
}) {
  const nextAttemptCount = Math.min(attemptCount + 1, maxAttempts);

  return {
    attemptCount: nextAttemptCount,
    shouldRetry: nextAttemptCount <= maxAttempts && attemptCount < maxAttempts,
  };
}

export function createInvoiceJobFailurePatch({
  message,
  attemptCount,
  maxAttempts,
}: {
  message: string;
  attemptCount: number;
  maxAttempts: number;
}) {
  const nextAttempt = nextInvoiceJobAttempt({ attemptCount, maxAttempts });

  return {
    status: nextAttempt.shouldRetry ? "queued" : "failed",
    attempt_count: nextAttempt.attemptCount,
    error_code: classifyInvoiceJobError(message),
    error_message: message,
  };
}

function classifyInvoiceJobError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("json") ||
    normalizedMessage.includes("schema")
  ) {
    return "schema_validation";
  }
  if (
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("provider")
  ) {
    return "transient_provider";
  }
  if (
    normalizedMessage.includes("download") ||
    normalizedMessage.includes("storage")
  ) {
    return "storage";
  }
  if (normalizedMessage.includes("auth")) {
    return "auth";
  }

  return "unknown";
}
