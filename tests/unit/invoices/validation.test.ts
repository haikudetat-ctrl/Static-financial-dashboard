import { describe, expect, it } from "vitest";

import {
  findDuplicateInvoiceCandidate,
  validateInvoiceTotals,
} from "@/lib/invoices/validation";

describe("invoice intelligence validation", () => {
  it("accepts invoice totals that reconcile within one cent", () => {
    expect(
      validateInvoiceTotals({
        lineTotal: 100,
        subtotalAmount: 100,
        discountAmount: 5,
        taxAmount: 8,
        freightAmount: 3,
        depositAmount: 0,
        creditsAmount: 0,
        totalAmount: 106,
      }),
    ).toEqual({
      status: "valid",
      difference: 0,
      issues: [],
    });
  });

  it("returns a blocking issue when invoice totals do not reconcile", () => {
    expect(
      validateInvoiceTotals({
        lineTotal: 100,
        subtotalAmount: 100,
        discountAmount: 0,
        taxAmount: 0,
        freightAmount: 0,
        depositAmount: 0,
        creditsAmount: 0,
        totalAmount: 111,
      }),
    ).toEqual({
      status: "blocking",
      difference: -11,
      issues: ["invoice_total_mismatch"],
    });
  });

  it("detects duplicate candidates by document hash before invoice number", () => {
    expect(
      findDuplicateInvoiceCandidate({
        documentHash: "hash-a",
        vendorId: "vendor-a",
        invoiceNumber: "INV-2",
        existingInvoices: [
          {
            id: "invoice-number-match",
            documentHash: "hash-b",
            vendorId: "vendor-a",
            invoiceNumber: "INV-2",
          },
          {
            id: "document-hash-match",
            documentHash: "hash-a",
            vendorId: "vendor-b",
            invoiceNumber: "INV-9",
          },
        ],
      }),
    ).toEqual({
      duplicateInvoiceId: "document-hash-match",
      reason: "document_hash",
    });
  });
});
