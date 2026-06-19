# Slice 4 Recipes, Production, and Theoretical Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver versioned nested recipes, Toast menu mappings, prep production ledger posting, sales posting, and traceable theoretical ingredient usage.

**Architecture:** PostgreSQL owns recipe/production/sales state, authorization, and atomic idempotent posting. Pure TypeScript services validate recipe graphs, select effective versions, expand nested components, and calculate cost/usage. Next.js Server Actions and server-rendered manager/staff pages expose the vertical through existing tenant-scoped Supabase clients.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions, TypeScript, Supabase/PostgreSQL 17, pgTAP, Vitest, Tailwind CSS 4

---

### Task 1: Recipe and theoretical calculation services

**Files:**

- Create: `src/lib/recipes/types.ts`
- Create: `src/lib/recipes/calculations.ts`
- Test: `tests/unit/recipe-calculations.test.ts`

- [ ] Write failing tests for effective-date version selection.
- [ ] Run `npm test -- tests/unit/recipe-calculations.test.ts` and confirm the missing helper failure.
- [ ] Implement `selectEffectiveRecipeVersion`.
- [ ] Write and verify failing tests for direct and indirect dependency cycles.
- [ ] Implement `detectRecipeCycle` using a visited path rather than global mutable state.
- [ ] Write and verify failing tests for nested component expansion into purchased inventory items.
- [ ] Implement `expandRecipeComponents` with explicit conversion factors.
- [ ] Write and verify failing tests for recipe cost and sold quantity treatment.
- [ ] Implement `calculateRecipeCost` and `calculateTheoreticalSaleQuantity`.
- [ ] Run the focused tests and the existing full unit suite.

### Task 2: Recipes, production, sales, and usage schema

**Files:**

- Create: `supabase/tests/database/recipes_production_usage.test.sql`
- Create via CLI: `supabase/migrations/*_recipes_production_usage.sql`
- Modify: `supabase/seed.sql`

- [ ] Write pgTAP failures for all Slice 4 tables, posting functions, RLS, recipe activation, cycle rejection, production value conservation, sales idempotency, and theoretical usage.
- [ ] Run the focused pgTAP file and confirm missing relation/function failures.
- [ ] Run `npx supabase migration new recipes_production_usage`.
- [ ] Add recipe, recipe version/component, Toast mapping, production, sales, calculation-run, and daily theoretical usage tables.
- [ ] Index every foreign key and organization/location/date/status query path.
- [ ] Enable RLS and add explicit authenticated grants and role policies.
- [ ] Implement `activate_recipe_version(uuid)`, `post_production_batch(uuid)`, and `post_sales_import(uuid)` with fixed search paths and idempotency.
- [ ] Add cycle and active-date overlap checks to recipe activation.
- [ ] Seed a produced Old Fashioned Batch item, an Old Fashioned menu recipe, a prep recipe/version, components, and a Toast GUID mapping.
- [ ] Reset the local database, run the focused pgTAP file, then run the complete database suite and schema lint.

### Task 3: Recipe query and mutation layer

**Files:**

- Create: `src/lib/recipes/queries.ts`
- Create: `src/app/(manager)/recipes/actions.ts`
- Create: `src/app/(staff)/production/actions.ts`

- [ ] Implement organization-filtered recipe summaries and detail queries.
- [ ] Implement active recipe, version, component, mapping, staged PMIX, production history, and theoretical usage reads.
- [ ] Implement manager actions to create recipes/versions, add components, activate versions, and map Toast GUIDs.
- [ ] Implement staff production batch creation and atomic posting.
- [ ] Implement manager sales-import posting and theoretical calculation persistence.
- [ ] Run TypeScript and lint; resolve relation-shape types without weakening strict mode.

### Task 4: Manager recipe and mapping workflows

**Files:**

- Modify: `src/app/(manager)/recipes/page.tsx`
- Create: `src/app/(manager)/recipes/new/page.tsx`
- Create: `src/app/(manager)/recipes/[id]/page.tsx`
- Create: `src/app/(manager)/recipes/mappings/page.tsx`

- [ ] Replace the placeholder with active recipe, missing mapping, current cost, and yield-variance metrics.
- [ ] Add the create-recipe/first-version form with output and effective-date fields.
- [ ] Add recipe detail with nested components, version history, activation blockers, current cost, and Toast mappings.
- [ ] Add mapping workflow for staged PMIX GUIDs.
- [ ] Add manager routes to route-access tests and verify staff denial.

### Task 5: Staff production workflow

**Files:**

- Modify: `src/app/(staff)/production/page.tsx`

- [ ] Show active prep/batch recipes and expected component quantities.
- [ ] Add planned output, actual output, notes, and one prominent submit action.
- [ ] Display recent posted batches and yield variance.
- [ ] Verify production actions create equal-value consumption/output ledger entries and update on-hand.

### Task 6: Sales posting and theoretical usage UI

**Files:**

- Create: `src/app/(manager)/recipes/sales/page.tsx`
- Create: `src/app/(manager)/recipes/theoretical-usage/page.tsx`
- Modify: `src/lib/toast/index.ts`
- Modify: `tests/unit/toast-parser.test.ts`

- [ ] Add a failing Toast normalization test for net theoretical quantity with voids and comps.
- [ ] Implement the minimal normalization helper.
- [ ] Show staged PMIX imports, unmapped GUID blockers, and posted business days.
- [ ] Post valid mapped sales imports idempotently.
- [ ] Calculate and display nested daily theoretical usage without inventory ledger writes.
- [ ] Show calculation run, recipe version, source menu item, quantity, unit cost, and theoretical cost.

### Task 7: Documentation and complete non-browser gates

**Files:**

- Modify: `README.md`

- [ ] Document recipe creation/activation, Toast mapping, production, sales posting, and theoretical usage.
- [ ] Run `npm run format:check`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run supabase:reset`.
- [ ] Run `npx supabase test db`.
- [ ] Run `npx supabase db lint --local --fail-on warning`.
- [ ] Run authenticated manager/staff RLS smoke queries.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
