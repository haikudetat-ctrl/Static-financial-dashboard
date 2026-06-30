import { describe, expect, it } from "vitest";

import {
  applyInvoiceJobTransition,
  createInvoiceJobFailurePatch,
  nextInvoiceJobAttempt,
} from "@/lib/invoices/jobs";

describe("invoice processing jobs", () => {
  it("advances through the supported processing states", () => {
    expect(applyInvoiceJobTransition("queued", "start_extracting")).toBe(
      "extracting",
    );
    expect(applyInvoiceJobTransition("extracting", "start_validating")).toBe(
      "validating",
    );
    expect(applyInvoiceJobTransition("validating", "start_matching")).toBe(
      "matching",
    );
    expect(applyInvoiceJobTransition("matching", "require_review")).toBe(
      "needs_review",
    );
  });

  it("does not allow a posted job to return to processing", () => {
    expect(() =>
      applyInvoiceJobTransition("posted", "start_extracting"),
    ).toThrow("Cannot transition invoice job from posted to extracting.");
  });

  it("increments retry attempts and preserves idempotency metadata", () => {
    expect(nextInvoiceJobAttempt({ attemptCount: 2, maxAttempts: 3 })).toEqual({
      attemptCount: 3,
      shouldRetry: true,
    });
  });

  it("marks retry as unavailable at the max attempt", () => {
    expect(nextInvoiceJobAttempt({ attemptCount: 3, maxAttempts: 3 })).toEqual({
      attemptCount: 3,
      shouldRetry: false,
    });
  });

  it("classifies worker failures into a durable update patch", () => {
    expect(
      createInvoiceJobFailurePatch({
        message: "LLM provider returned invalid JSON",
        attemptCount: 2,
        maxAttempts: 3,
      }),
    ).toEqual({
      status: "queued",
      attempt_count: 3,
      error_code: "schema_validation",
      error_message: "LLM provider returned invalid JSON",
    });
  });
});
