import { describe, expect, it } from "vitest";

import {
  buildInvoiceReviewPayload,
  buildInvoiceStatusSummary,
  parseReviewApprovalInput,
} from "@/lib/invoices/queries";

describe("invoice intelligence query contracts", () => {
  it("summarizes invoice status with blocking review counts", () => {
    expect(
      buildInvoiceStatusSummary({
        invoice: {
          id: "invoice-1",
          status: "extracted",
          validation_status: "warnings",
        },
        job: {
          id: "job-1",
          status: "needs_review",
          error_code: "",
          error_message: "",
        },
        reviewCards: [
          { status: "open", blocking_reasons: ["missing inventory item"] },
          { status: "resolved", blocking_reasons: ["pack changed"] },
          { status: "open", blocking_reasons: [] },
        ],
      }),
    ).toEqual({
      invoiceId: "invoice-1",
      invoiceStatus: "extracted",
      jobId: "job-1",
      jobStatus: "needs_review",
      validationStatus: "warnings",
      openReviewCount: 2,
      blockingReviewCount: 1,
      failed: false,
      errorCode: "",
      errorMessage: "",
    });
  });

  it("marks failed jobs in status summaries", () => {
    expect(
      buildInvoiceStatusSummary({
        invoice: null,
        job: {
          id: "job-2",
          status: "failed",
          error_code: "schema_validation",
          error_message: "Invalid JSON",
        },
        reviewCards: [],
      }),
    ).toMatchObject({
      invoiceId: null,
      failed: true,
      errorCode: "schema_validation",
      errorMessage: "Invalid JSON",
    });
  });

  it("groups review payload cards and line candidates for the UI", () => {
    expect(
      buildInvoiceReviewPayload({
        invoice: { id: "invoice-1", invoice_number: "INV-1" },
        lineCandidates: [
          { id: "line-1", line_index: 0, description: "Tomatoes" },
          { id: "line-2", line_index: 1, description: "Limes" },
        ],
        matchSuggestions: [
          { id: "suggestion-2", line_candidate_id: "line-2", rank: 1 },
          { id: "suggestion-1", line_candidate_id: "line-1", rank: 1 },
        ],
        reviewCards: [
          {
            id: "review-1",
            entity_type: "invoice_line_candidate",
            entity_id: "line-1",
            status: "open",
          },
        ],
      }),
    ).toEqual({
      invoice: { id: "invoice-1", invoice_number: "INV-1" },
      lines: [
        {
          id: "line-1",
          line_index: 0,
          description: "Tomatoes",
          suggestions: [
            { id: "suggestion-1", line_candidate_id: "line-1", rank: 1 },
          ],
          reviewCards: [
            {
              id: "review-1",
              entity_type: "invoice_line_candidate",
              entity_id: "line-1",
              status: "open",
            },
          ],
        },
        {
          id: "line-2",
          line_index: 1,
          description: "Limes",
          suggestions: [
            { id: "suggestion-2", line_candidate_id: "line-2", rank: 1 },
          ],
          reviewCards: [],
        },
      ],
    });
  });

  it("validates review approval input", () => {
    expect(
      parseReviewApprovalInput({
        selectedMatchId: "match-1",
        idempotencyKey: "review-approval-1",
        notes: "Looks right",
      }),
    ).toEqual({
      selectedMatchId: "match-1",
      idempotencyKey: "review-approval-1",
      notes: "Looks right",
    });
  });

  it("rejects review approval input without an idempotency key", () => {
    expect(() =>
      parseReviewApprovalInput({ selectedMatchId: "match-1" }),
    ).toThrow("idempotencyKey is required");
  });
});
