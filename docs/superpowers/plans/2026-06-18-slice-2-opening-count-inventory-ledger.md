# Slice 2 Opening Count and Inventory Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an end-to-end full/spot inventory count workflow that posts an approved first count as an opening balance, projects on-hand inventory from an immutable ledger, and exposes negative physical inventory as a blocking exception.

**Architecture:** A new Supabase migration owns fixed-precision count and ledger persistence, RLS, indexed access paths, a security-invoker on-hand view, and one atomic count-approval function. Pure TypeScript helpers prepare count sheets and calculate count/variance values. Next.js Server Actions authenticate and authorize every mutation, while manager and staff Server Components query through the user-scoped Supabase client.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions, TypeScript, Supabase/PostgreSQL 17, pgTAP, Vitest, Playwright, Tailwind CSS 4

**Completion status (June 19, 2026):** Implemented. The required local gate is formatting, TypeScript, ESLint, Vitest, pgTAP, Supabase schema lint, and production build. The full manager → staff → approval Playwright workflow passed once; the user subsequently made Playwright optional for routine verification.

---

## File Structure

- Create `supabase/migrations/20260618123000_003_inventory_counts_ledger.sql`: Slice 2 schema, indexes, RLS, views, and atomic approval function.
- Create `supabase/tests/database/inventory_ledger.test.sql`: schema, tenant isolation, idempotent opening-balance posting, adjustment posting, and negative-on-hand tests.
- Modify `supabase/seed.sql`: deterministic storage zones and inventory items needed for local count workflows.
- Create `src/lib/inventory/counts.ts`: pure count-sheet, decimal, and variance helpers.
- Create `src/lib/inventory/queries.ts`: typed read queries for periods, counts, assignments, review, and on-hand projection.
- Create `src/lib/inventory/types.ts`: Slice 2 application types.
- Create `tests/unit/inventory-counts.test.ts`: pure helper coverage.
- Create `src/app/(manager)/inventory/counts/actions.ts`: authenticated manager count creation, recount, and approval actions.
- Create `src/app/(staff)/count/actions.ts`: authenticated staff line-save and assignment-submit actions.
- Create `src/app/(manager)/inventory/counts/new/page.tsx`: full count generator.
- Create `src/app/(manager)/inventory/counts/spot/page.tsx`: filtered spot count generator.
- Create `src/app/(manager)/inventory/counts/[id]/review/page.tsx`: review, variance, recount, and approval UI.
- Modify `src/app/(staff)/count/page.tsx`: mobile assigned-count entry.
- Modify `src/app/(manager)/inventory/page.tsx`: real inventory summary and workflow links.
- Create `src/app/(manager)/inventory/on-hand/page.tsx`: current on-hand and valuation projection.
- Create `src/app/(manager)/exceptions/negative-inventory/page.tsx`: negative physical inventory exception list.
- Modify `src/app/(manager)/exceptions/page.tsx`: link and live negative-item count.
- Create `tests/e2e/inventory-count.spec.ts`: manager-create → staff-count → manager-approve path.

### Task 1: Inventory schema, RLS, and atomic posting

**Files:**

- Create: `supabase/tests/database/inventory_ledger.test.sql`
- Create: `supabase/migrations/20260618123000_003_inventory_counts_ledger.sql`
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Write the failing pgTAP test**

Cover these exact behaviors:

```sql
select has_table('public', 'inventory_periods');
select has_table('public', 'inventory_counts');
select has_table('public', 'inventory_transactions');
select has_view('public', 'inventory_on_hand');
select results_eq(
  $$ select transaction_type::text from public.approve_inventory_count('<full-count-id>') $$,
  array['opening_balance'],
  'first approved full count posts an opening balance'
);
select is(
  (select count(*)::integer from public.inventory_transactions where idempotency_key = 'count:<full-count-id>:approval'),
  1,
  'approval posting is idempotent'
);
select results_eq(
  $$ select quantity from public.inventory_on_hand where inventory_item_id = '<item-id>' $$,
  array[1.5::numeric],
  'on hand is the sum of posted transaction lines'
);
```

The fixture must also prove that another organization cannot read counts or ledger rows and that an adjustment producing negative on-hand appears in `negative_inventory`.

- [ ] **Step 2: Run the database test to verify RED**

Run:

```bash
npx supabase test db supabase/tests/database/inventory_ledger.test.sql
```

Expected: FAIL because Slice 2 tables and functions do not exist.

- [ ] **Step 3: Create the migration through the Supabase CLI**

Run:

```bash
npx supabase migration new inventory_counts_ledger
```

Rename only if the generated timestamp differs from `20260618123000`; preserve the CLI-generated migration history convention.

- [ ] **Step 4: Implement the schema**

Create fixed-precision enums/tables from the approved Slice 2 plan:

```sql
create type public.inventory_period_status as enum (
  'draft', 'count_in_progress', 'count_complete', 'closed', 'reopened'
);
create type public.inventory_count_type as enum ('full', 'spot');
create type public.inventory_count_status as enum (
  'draft', 'in_progress', 'counted', 'approved', 'cancelled'
);
create type public.inventory_count_line_status as enum (
  'pending', 'counted', 'recount_requested'
);
create type public.inventory_transaction_type as enum (
  'opening_balance', 'receipt', 'receipt_reversal', 'transfer_out',
  'transfer_in', 'production_consumption', 'production_output', 'waste',
  'spill', 'breakage', 'comp_sample', 'count_adjustment',
  'manual_adjustment', 'closing_correction'
);
```

Use `numeric(20, 6)` for quantities and `numeric(20, 4)` for costs. Add checks for non-negative count quantities, tenths between `0.0` and `0.9`, non-zero transaction lines, and `extended_value = quantity * unit_cost`. Index every foreign key and the common filters `(organization_id, location_id, status)`, assignment assignee/status, transaction item/location, and transaction effective time.

- [ ] **Step 5: Implement RLS and projections**

Enable RLS on every new table. Managers can create/review/approve counts for their organization; assigned staff can read/update only their own assignments and lines. Ledger tables are readable by organization members and writable through manager-authorized posting paths.

Create:

```sql
create view public.inventory_on_hand
with (security_invoker = true)
as
select
  transaction.organization_id,
  transaction.location_id,
  line.inventory_item_id,
  line.storage_location_id,
  sum(line.quantity)::numeric(20, 6) as quantity,
  case
    when sum(line.quantity) = 0 then 0
    else (sum(line.extended_value) / sum(line.quantity))::numeric(20, 4)
  end as weighted_average_cost,
  sum(line.extended_value)::numeric(20, 4) as extended_value,
  max(transaction.effective_at) as last_movement_at
from public.inventory_transaction_lines line
join public.inventory_transactions transaction
  on transaction.id = line.inventory_transaction_id
group by
  transaction.organization_id,
  transaction.location_id,
  line.inventory_item_id,
  line.storage_location_id;
```

Create `public.negative_inventory` as a security-invoker filtered projection of `inventory_on_hand where quantity < 0`.

- [ ] **Step 6: Implement atomic approval**

Create `public.approve_inventory_count(target_count_id uuid)` as a security-invoker PL/pgSQL function. It must:

1. Lock the count row.
2. Verify `public.is_organization_manager(count.organization_id)`.
3. Reject incomplete/recount-requested lines.
4. Return the existing transaction when `idempotency_key = 'count:' || target_count_id || ':approval'`.
5. Use `opening_balance` only for the first approved full count with no prior ledger rows at the location; otherwise use `count_adjustment`.
6. Insert one transaction header and one line per count line.
7. Post `counted_quantity + counted_tenths` for opening balances; post `counted total - current on-hand` for adjustments.
8. Value lines at the latest item cost snapshot, defaulting to zero until purchasing establishes cost.
9. Mark the count approved and its period count-complete.

- [ ] **Step 7: Seed local count fixtures**

Add deterministic rows for:

- Storage zones `Back Bar` and `Liquor Room` with walk orders 10 and 20.
- Inventory items `Bourbon 750 ml`, `Gin 750 ml`, `Lime Juice`, and `Cocktail Napkins`.
- Storage-location item ordering.
- A draft baseline inventory period.

- [ ] **Step 8: Verify GREEN**

Run:

```bash
npm run supabase:reset
npx supabase test db
npx supabase db lint --local --fail-on warning
```

Expected: migrations and seed apply; all pgTAP files pass; no schema warnings.

### Task 2: Pure count and variance domain helpers

**Files:**

- Create: `tests/unit/inventory-counts.test.ts`
- Create: `src/lib/inventory/counts.ts`
- Create: `src/lib/inventory/types.ts`

- [ ] **Step 1: Write failing unit tests**

Test this public API:

```ts
buildCountAssignments(storageLocations, selectedStorageLocationIds);
countedTotal({ countedQuantity: 2, countedTenths: 0.4, isOpenContainer: true });
countedTotal({
  countedQuantity: 2,
  countedTenths: 0.4,
  isOpenContainer: false,
});
calculateVariance({ expectedQuantity: 5, countedQuantity: 3.5, unitCost: 12 });
isMaterialVariance(
  { quantityVariance: 1.5, valueVariance: 18 },
  { quantity: 1, value: 10 },
);
```

Expected results:

- Assignments and lines preserve storage-location walk order.
- Open-container total is `2.4`; closed total is `2`.
- Quantity variance is `1.5` (`expected - counted`) and value variance is `18`.
- Threshold comparison is inclusive.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
npm test -- tests/unit/inventory-counts.test.ts
```

Expected: FAIL because the inventory helper module does not exist.

- [ ] **Step 3: Implement minimal helpers**

Use decimal-safe string normalization at database boundaries and simple finite-number validation in the UI helpers. Export:

```ts
export function buildCountAssignments(...)
export function countedTotal(...)
export function calculateVariance(...)
export function isMaterialVariance(...)
export function formatInventoryQuantity(...)
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- tests/unit/inventory-counts.test.ts
npm test
```

Expected: focused and full Vitest suites pass.

### Task 3: Count query layer and authenticated mutations

**Files:**

- Create: `src/lib/inventory/queries.ts`
- Create: `src/app/(manager)/inventory/counts/actions.ts`
- Create: `src/app/(staff)/count/actions.ts`
- Modify: `tests/unit/route-access.test.ts`
- Modify: `src/lib/auth/route-access.ts`

- [ ] **Step 1: Add failing route/access tests**

Assert manager routes include `/inventory/counts/new`, `/inventory/counts/spot`, `/inventory/counts/:id/review`, `/inventory/on-hand`, and `/exceptions/negative-inventory`, while staff remains limited to `/count`.

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- tests/unit/route-access.test.ts
```

- [ ] **Step 3: Implement the query layer**

Export typed reads:

```ts
getCountSetup(organizationId, locationId);
getManagerCount(countId);
getStaffAssignments(profileId);
getInventorySummary(organizationId, locationId);
getOnHand(organizationId, locationId);
getNegativeInventory(organizationId, locationId);
```

Every query must include explicit organization/location filters even though RLS is enabled.

- [ ] **Step 4: Implement manager actions**

Each action begins with `getUserContext()` and rejects non-managers. Implement:

```ts
createInventoryCountAction(formData);
requestRecountAction(countLineId, formData);
approveInventoryCountAction(countId);
```

Count creation inserts the count, one assignment per selected zone, and ordered lines from `storage_location_items`. Use `revalidatePath` and call `redirect` outside `try/catch`.

- [ ] **Step 5: Implement staff actions**

Each action verifies that the current profile owns the assignment:

```ts
saveCountLineAction(countLineId, formData);
submitCountAssignmentAction(assignmentId);
```

Validate finite non-negative quantities and tenths `0.0–0.9`. Submitting an assignment requires all non-skipped lines to be counted and marks the parent count `counted` when every assignment is complete.

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npm test -- tests/unit/route-access.test.ts
```

### Task 4: Manager count creation and spot-count pages

**Files:**

- Create: `src/app/(manager)/inventory/counts/new/page.tsx`
- Create: `src/app/(manager)/inventory/counts/spot/page.tsx`
- Modify: `src/app/(manager)/inventory/page.tsx`

- [ ] **Step 1: Add an E2E test that fails on the placeholder inventory page**

The manager test must assert:

```ts
await page.goto("/inventory");
await expect(
  page.getByRole("link", { name: "Start full count" }),
).toBeVisible();
await expect(
  page.getByRole("link", { name: "Start spot count" }),
).toBeVisible();
await expect(page.getByRole("link", { name: "View on hand" })).toBeVisible();
```

- [ ] **Step 2: Run RED**

Run:

```bash
npx playwright test tests/e2e/inventory-count.spec.ts --project=desktop-chromium --grep 'inventory workspace'
```

- [ ] **Step 3: Build the manager inventory workspace**

Replace placeholder signals with live count, valuation, last-verified, and negative-item values. Provide the three workflow links above.

- [ ] **Step 4: Build full and spot generators**

Full count defaults all active zones selected. Spot count allows filtering by zone and selected items. Both use accessible checkboxes, preserve walk-order labels, explain that expected quantities remain hidden from staff, and submit through `createInventoryCountAction`.

- [ ] **Step 5: Verify**

Run focused E2E, typecheck, and lint.

### Task 5: Mobile staff counting

**Files:**

- Modify: `src/app/(staff)/count/page.tsx`
- Create: `src/components/inventory/count-line-form.tsx`

- [ ] **Step 1: Add a failing E2E assertion**

After manager count creation, sign in as staff and assert the page shows:

- Assigned storage-zone cards in walk order.
- Item name and count unit.
- Numeric quantity input.
- Tenths input only for items with `allows_tenths_counting`.
- Submit-assignment action.
- No expected quantity text before manager review.

- [ ] **Step 2: Run RED**

Run the staff segment of `tests/e2e/inventory-count.spec.ts`.

- [ ] **Step 3: Implement the staff count page**

Render pending and recount-requested assignments from `getStaffAssignments`. Use mobile-first controls with `inputMode="decimal"`, explicit labels, a visible `0–9 tenths` control for bottle items, notes, save state, and assignment submission.

- [ ] **Step 4: Verify GREEN**

Run focused E2E, typecheck, and unit tests.

### Task 6: Manager review, recount, and approval

**Files:**

- Create: `src/app/(manager)/inventory/counts/[id]/review/page.tsx`
- Create: `src/components/inventory/count-review-table.tsx`

- [ ] **Step 1: Add failing E2E review assertions**

The manager review must show expected, counted, quantity variance, dollar variance, material highlighting, recount controls, and approve action.

- [ ] **Step 2: Run RED**

Run the review segment of `tests/e2e/inventory-count.spec.ts`.

- [ ] **Step 3: Implement review UI**

Use `params: Promise<{ id: string }>` per Next.js 16. Show full/spot status, assignment progress, and a table with variance. Recount changes only the selected line to `recount_requested` and the assignment/count back to in-progress. Approval calls the atomic database function and redirects to `/inventory/on-hand`.

- [ ] **Step 4: Verify GREEN**

Run focused E2E, `npm run typecheck`, and `npm test`.

### Task 7: On-hand projection and negative exception

**Files:**

- Create: `src/app/(manager)/inventory/on-hand/page.tsx`
- Create: `src/app/(manager)/exceptions/negative-inventory/page.tsx`
- Modify: `src/app/(manager)/exceptions/page.tsx`

- [ ] **Step 1: Add failing E2E assertions**

After approval:

```ts
await expect(page).toHaveURL(/\/inventory\/on-hand$/);
await expect(page.getByText("Last verified")).toBeVisible();
await expect(page.getByText("Bourbon 750 ml")).toBeVisible();
```

The exceptions hub must link to negative inventory and show its current count.

- [ ] **Step 2: Run RED**

Run the projection segment of `tests/e2e/inventory-count.spec.ts`.

- [ ] **Step 3: Implement projection pages**

On-hand groups by item and storage zone, shows quantity, weighted-average cost, extended value, last movement, and last verified count. Negative inventory explains that physical negatives block period close and lists item, zone, quantity, and likely investigation paths.

- [ ] **Step 4: Verify GREEN**

Run focused E2E, typecheck, lint, unit tests, and database tests.

### Task 8: Full verification and documentation

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Document Slice 2 routes and workflow**

Add local verification and the manager/staff opening-count workflow.

- [ ] **Step 2: Run the complete verification gate**

Run:

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npx supabase test db
npx supabase db lint --local --fail-on warning
npm run test:e2e
npm run build
```

Expected: all commands exit 0. If the full E2E suite encounters the known host-level database timeout, rerun failed tests individually and report both the environmental failure and isolated passing evidence without masking it.

- [ ] **Step 3: Review the diff against Slice 2 deliverables**

Confirm:

- Staff can perform and submit full/spot counts with tenths.
- Manager can review, request recounts, and approve counts.
- Approved counts post idempotently to the inventory ledger.
- On-hand projection reflects posted transactions.
- Negative inventory appears as a blocking exception.
