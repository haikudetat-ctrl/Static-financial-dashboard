export type InvoiceMatchStrategy =
  | "vendor_item_code"
  | "previous_invoice_match"
  | "inventory_alias"
  | "exact_name"
  | "fuzzy_similarity"
  | "semantic_match"
  | "reviewer_history";

export type MatchConfidenceBand = "auto_match" | "suggested_match" | "new_item";

export type InvoiceValidationStatus = "valid" | "warnings" | "blocking";

export type InvoiceValidationIssue =
  | "invoice_total_mismatch"
  | "invoice_subtotal_mismatch";

export type DuplicateInvoiceReason = "document_hash" | "vendor_invoice_number";

export type PriceAlertType =
  | "cost_increase"
  | "pack_size_changed"
  | "vendor_changed"
  | "unit_conversion_changed"
  | "duplicate_inventory_suspected";

export type PriceAlertSeverity = "info" | "warning" | "critical";
