# Slice 3 Purchasing, Receiving, and Invoice Posting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver suggested purchasing, purchase-order approval/output, staff receiving, invoice review, weighted-average costing, and discrepancy detection as one traceable vertical workflow.

**Architecture:** PostgreSQL owns purchase/receipt/invoice state, immutable posting, duplicate controls, and moving-WAC calculations through short atomic functions. Pure TypeScript services calculate suggested order quantities, vendor-ready text, matching, and anomaly flags. Next.js Server Actions enforce manager/staff authorization for mutations, while manager and staff pages use the tenant-scoped Supabase client.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions, TypeScript, Supabase/PostgreSQL 17, pgTAP, Vitest, Tailwind CSS 4

---

### Task 1: Purchasing, receiving, and invoice schema

**Files:**

- Create `supabase/migrations/*_purchasing_receiving_invoices.sql`
- Create `supabase/tests/database/purchasing_receiving.test.sql`
- Modify `supabase/seed.sql`

- [ ] Write pgTAP failures for PO, receipt, invoice, RLS, duplicate invoice, receipt posting, and WAC behavior.
- [ ] Create enums and tables for purchase orders/lines/approvals, receipts/lines/exceptions, invoices/lines/adjustments/matches.
- [ ] Index every foreign key and common organization/location/status/vendor filter.
- [ ] Add RLS: organization members read; managers approve purchasing/invoices; assigned location staff receive.
- [ ] Create atomic functions `approve_purchase_order`, `post_receipt`, and `approve_invoice`.
- [ ] Seed a PLCB vendor, vendor items/prices, an order guide, and pars for the Slice 2 inventory items.
- [ ] Reset, run pgTAP, and run Supabase schema lint.

### Task 2: Suggested-order and anomaly domain services

**Files:**

- Create `src/lib/purchasing/calculations.ts`
- Create `src/lib/purchasing/types.ts`
- Create `tests/unit/purchasing-calculations.test.ts`

- [ ] Test `max(0, par - onHand - openPO)` and valid-pack rounding.
- [ ] Test vendor minimum/cutoff explanations.
- [ ] Test vendor-ready text output.
- [ ] Test price-change, pack-change, duplicate, and extended-total anomalies.
- [ ] Implement the minimal pure helpers and run the full unit suite.

### Task 3: Query layer and authenticated actions

**Files:**

- Create `src/lib/purchasing/queries.ts`
- Create `src/app/(manager)/purchasing/actions.ts`
- Create `src/app/(staff)/receive/actions.ts`
- Create `src/app/(manager)/invoices/actions.ts`

- [ ] Implement filtered reads for order guide, suggested need, POs, receipts, invoices, and review detail.
- [ ] Implement draft PO creation, line overrides, approval, and cancellation.
- [ ] Implement receive-all, line exception, no-PO receipt, and submission actions.
- [ ] Implement invoice upload registration, extracted-line review, mapping, and approval actions.
- [ ] Verify typecheck, lint, and database tests.

### Task 4: Purchasing manager UI

**Files:**

- Modify `src/app/(manager)/purchasing/page.tsx`
- Create `src/app/(manager)/purchasing/order-guide/page.tsx`
- Create `src/app/(manager)/purchasing/suggested-order/page.tsx`
- Create `src/app/(manager)/purchasing/orders/[id]/page.tsx`
- Create `src/app/(manager)/purchasing/orders/[id]/send/page.tsx`

- [ ] Show pars, on-hand, open PO quantity, last cost, suggestion, and explanation.
- [ ] Create/approve POs with manager overrides.
- [ ] Render copyable vendor text and printable order content.
- [ ] Verify with component/unit tests where behavior is interactive.

### Task 5: Staff receiving and manager exception review

**Files:**

- Modify `src/app/(staff)/receive/page.tsx`
- Create `src/app/(manager)/receiving/review/page.tsx`

- [ ] Show open POs and a receive-all happy path.
- [ ] Support shortage, substitution, damage, unknown-item, document path, and notes.
- [ ] Support no-PO receipt creation that remains manager-review-required.
- [ ] Post clean receipts to the inventory ledger and retain exceptions without posting.

### Task 6: Invoice review and weighted-average cost

**Files:**

- Create `src/app/(manager)/invoices/upload/page.tsx`
- Create `src/app/(manager)/invoices/[id]/review/page.tsx`
- Extend `src/lib/plcb/index.ts`

- [ ] Register uploaded documents and staged extracted lines.
- [ ] Review mappings, totals, receipt match, and anomaly flags.
- [ ] Approve mapped invoices, update WAC snapshots, and revalue receipt quantity when needed.
- [ ] Reject negative prior on-hand WAC calculations as blocking errors.

### Task 7: Full non-Playwright verification

**Files:**

- Modify `README.md`

- [ ] Document purchasing, receiving, and invoice workflows.
- [ ] Run `npm run format:check`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npx supabase test db`.
- [ ] Run `npx supabase db lint --local --fail-on warning`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
