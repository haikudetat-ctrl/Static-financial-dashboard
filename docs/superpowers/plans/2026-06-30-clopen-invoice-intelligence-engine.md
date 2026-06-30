# Clopen Invoice Intelligence Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Invoice Intelligence Engine in staged, independently testable slices, starting with durable invoice processing state, extraction staging, review cards, and price intelligence tables.

**Architecture:** Extend the existing Static OS purchasing/invoice schema with additive tables and columns so current invoice posting keeps working. Supabase Postgres remains the system of record, with RLS and pgTAP tests first; later stages add worker orchestration, domain matching services, APIs, and UI.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL 17, pgTAP, Vitest, Supabase Storage, Supabase Edge Functions, future Trigger.dev worker integration.

---

### Task 1: Invoice Intelligence Data Foundation

**Files:**

- Create: `supabase/migrations/20260630120000_invoice_intelligence_foundation.sql`
- Create: `supabase/tests/database/invoice_intelligence_foundation.test.sql`

- [ ] **Step 1: Write pgTAP tests for schema shape**

Create `supabase/tests/database/invoice_intelligence_foundation.test.sql` with tests that assert:

- `invoice_processing_jobs`, `invoice_extraction_runs`, `invoice_line_candidates`, `invoice_line_match_suggestions`, `review_queue`, `review_actions`, `item_cost_history`, and `price_alerts` exist.
- Required enums exist with the expected values.
- RLS is enabled on all new tables.
- Every foreign-key column on the new tables has an index.
- Existing `invoices`, `invoice_lines`, `vendors`, `vendor_items`, and `inventory_item_aliases` have the new intelligence columns.

- [ ] **Step 2: Run database test to verify RED**

Run: `npx supabase test db supabase/tests/database/invoice_intelligence_foundation.test.sql`

Expected: FAIL because the new tables, enums, and columns do not exist yet.

- [ ] **Step 3: Add additive migration**

Create `supabase/migrations/20260630120000_invoice_intelligence_foundation.sql` that:

- Adds invoice source/idempotency/validation columns.
- Adds line candidate/match/review/price-history tables.
- Adds indexes for every FK and common status filter.
- Enables RLS and grants authenticated access.
- Adds member read and manager write policies matching existing invoice tables.

- [ ] **Step 4: Run database test to verify GREEN**

Run: `npx supabase test db supabase/tests/database/invoice_intelligence_foundation.test.sql`

Expected: PASS.

- [ ] **Step 5: Run existing database invoice tests**

Run: `npx supabase test db supabase/tests/database/purchasing_receiving.test.sql`

Expected: PASS, proving current invoice approval behavior was not broken.

- [ ] **Step 6: Commit Stage 1**

Run:

```bash
git add supabase/migrations/20260630120000_invoice_intelligence_foundation.sql supabase/tests/database/invoice_intelligence_foundation.test.sql docs/superpowers/plans/2026-06-30-clopen-invoice-intelligence-engine.md
git commit -m "feat: add invoice intelligence data foundation"
```

### Task 2: Worker and Matching Domain Services

**Files:**

- Create: `src/lib/invoices/intelligence-types.ts`
- Create: `src/lib/invoices/matching.ts`
- Create: `src/lib/invoices/validation.ts`
- Create: `src/lib/invoices/price-intelligence.ts`
- Create: `tests/unit/invoices/matching.test.ts`
- Create: `tests/unit/invoices/validation.test.ts`
- Create: `tests/unit/invoices/price-intelligence.test.ts`

- [ ] **Step 1: Write failing Vitest tests for validation and matching**

Tests cover total reconciliation, duplicate candidate detection, confidence band classification, vendor-code matches, alias matches, fuzzy-name scoring, and semantic-only auto-post blocking.

- [ ] **Step 2: Implement pure TypeScript helpers**

Implement deterministic helpers without provider calls: normalization, score classification, reason-code generation, price-alert thresholding, and line-total validation.

- [ ] **Step 3: Verify unit tests**

Run: `npm test -- tests/unit/invoices`

Expected: PASS.

- [ ] **Step 4: Commit Stage 2**

Run:

```bash
git add src/lib/invoices tests/unit/invoices
git commit -m "feat: add invoice intelligence domain services"
```

### Task 3: Processing Job Orchestration

**Files:**

- Modify: `supabase/functions/extract-invoice/index.ts`
- Create: `supabase/functions/process-invoice/index.ts`
- Create: `src/lib/invoices/jobs.ts`
- Create: `tests/unit/invoices/jobs.test.ts`

- [ ] **Step 1: Write failing tests for job state transitions**

Tests cover queued, extracting, validating, matching, needs_review, failed, and idempotent replay transitions.

- [ ] **Step 2: Implement job helpers and worker entrypoint**

Implement database-backed job status helpers and refactor the current regex-only Edge Function into a short orchestration path that records extraction attempts and structured failures.

- [ ] **Step 3: Verify**

Run: `npm test -- tests/unit/invoices/jobs.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit Stage 3**

Run:

```bash
git add supabase/functions src/lib/invoices/jobs.ts tests/unit/invoices/jobs.test.ts
git commit -m "feat: add invoice processing job orchestration"
```

### Task 4: Invoice APIs and Server Actions

**Files:**

- Modify: `src/app/(manager)/invoices/actions.ts`
- Create: `src/app/api/invoices/upload/route.ts`
- Create: `src/app/api/invoices/[invoiceId]/status/route.ts`
- Create: `src/app/api/invoices/[invoiceId]/review/route.ts`
- Create: `src/lib/invoices/queries.ts`
- Create: `tests/unit/invoices/queries.test.ts`

- [ ] **Step 1: Read relevant Next.js 16 App Router route-handler docs**

Read `node_modules/next/dist/docs/01-app` route-handler/server-action docs before editing App Router APIs.

- [ ] **Step 2: Write failing tests for query/action contracts**

Tests cover status summaries, review payload shape, review approval validation, and manager-only mutation checks.

- [ ] **Step 3: Implement routes/actions**

Register uploads, return job status, load review payloads, approve/reject review actions, and create inventory items from review prefills.

- [ ] **Step 4: Verify**

Run: `npm test -- tests/unit/invoices/queries.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit Stage 4**

Run:

```bash
git add src/app/api/invoices "src/app/(manager)/invoices/actions.ts" src/lib/invoices/queries.ts tests/unit/invoices/queries.test.ts
git commit -m "feat: add invoice intelligence APIs"
```

### Task 5: Manager Review UI

**Files:**

- Create: `src/app/(manager)/invoices/page.tsx`
- Create: `src/app/(manager)/invoices/[invoiceId]/page.tsx`
- Create: `src/app/(manager)/invoices/review/page.tsx`
- Create: `src/app/(manager)/price-alerts/page.tsx`
- Create: `src/components/invoices/invoice-inbox.tsx`
- Create: `src/components/invoices/invoice-review-card.tsx`
- Create: `src/components/invoices/new-item-wizard.tsx`
- Create: `tests/unit/invoices/invoice-review-card.test.tsx`

- [ ] **Step 1: Write failing component tests**

Tests cover suggested-match approve, new-item wizard prefill display, price-alert labeling, and exception grouping.

- [ ] **Step 2: Implement UI components and pages**

Build dense operational screens that minimize clicks and follow existing manager layout conventions.

- [ ] **Step 3: Verify component tests and lint**

Run: `npm test -- tests/unit/invoices/invoice-review-card.test.tsx && npm run lint`

Expected: PASS.

- [ ] **Step 4: Commit Stage 5**

Run:

```bash
git add src/app/(manager)/invoices src/app/(manager)/price-alerts src/components/invoices tests/unit/invoices/invoice-review-card.test.tsx
git commit -m "feat: add invoice intelligence review UI"
```

### Task 6: Full Verification and Hardening

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Document workflows**

Document upload, processing, review, approval, and price-alert flows in `README.md`.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npx supabase test db
npx supabase db lint --local --fail-on warning
npm run build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Commit verification docs**

Run:

```bash
git add README.md
git commit -m "docs: document invoice intelligence workflow"
```
