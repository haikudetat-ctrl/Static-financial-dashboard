import type {
  DuplicateInvoiceReason,
  InvoiceValidationIssue,
  InvoiceValidationStatus,
} from "@/lib/invoices/intelligence-types";

export function validateInvoiceTotals({
  lineTotal,
  subtotalAmount,
  discountAmount,
  taxAmount,
  freightAmount,
  depositAmount,
  creditsAmount,
  totalAmount,
}: {
  lineTotal: number;
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  freightAmount: number;
  depositAmount: number;
  creditsAmount: number;
  totalAmount: number;
}): {
  status: InvoiceValidationStatus;
  difference: number;
  issues: InvoiceValidationIssue[];
} {
  const issues: InvoiceValidationIssue[] = [];
  const subtotalDifference = roundCurrency(lineTotal - subtotalAmount);
  const expectedTotal = roundCurrency(
    subtotalAmount -
      discountAmount +
      taxAmount +
      freightAmount +
      depositAmount -
      creditsAmount,
  );
  const difference = roundCurrency(expectedTotal - totalAmount);

  if (Math.abs(subtotalDifference) >= 0.01) {
    issues.push("invoice_subtotal_mismatch");
  }
  if (Math.abs(difference) >= 0.01) {
    issues.push("invoice_total_mismatch");
  }

  return {
    status: issues.length === 0 ? "valid" : "blocking",
    difference,
    issues,
  };
}

export function findDuplicateInvoiceCandidate({
  documentHash,
  vendorId,
  invoiceNumber,
  existingInvoices,
}: {
  documentHash: string;
  vendorId: string;
  invoiceNumber: string;
  existingInvoices: Array<{
    id: string;
    documentHash: string | null;
    vendorId: string;
    invoiceNumber: string;
  }>;
}): { duplicateInvoiceId: string; reason: DuplicateInvoiceReason } | null {
  const hashMatch = existingInvoices.find(
    (invoice) =>
      invoice.documentHash !== null && invoice.documentHash === documentHash,
  );
  if (hashMatch) {
    return {
      duplicateInvoiceId: hashMatch.id,
      reason: "document_hash",
    };
  }

  const invoiceNumberMatch = existingInvoices.find(
    (invoice) =>
      invoice.vendorId === vendorId && invoice.invoiceNumber === invoiceNumber,
  );
  if (invoiceNumberMatch) {
    return {
      duplicateInvoiceId: invoiceNumberMatch.id,
      reason: "vendor_invoice_number",
    };
  }

  return null;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
