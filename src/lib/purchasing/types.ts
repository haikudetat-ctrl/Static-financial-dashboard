export type PurchaseOrderStatus =
  | "draft"
  | "approved"
  | "sent"
  | "partially_received"
  | "received"
  | "cancelled";

export type ReceiptStatus =
  | "draft"
  | "review_required"
  | "posted"
  | "cancelled";

export type InvoiceStatus =
  | "uploaded"
  | "extracted"
  | "reviewed"
  | "approved"
  | "rejected"
  | "posted";

export type InvoiceAnomaly =
  | "duplicate_invoice"
  | "price_change"
  | "pack_size_change"
  | "extended_total_mismatch"
  | "invoice_total_mismatch";
