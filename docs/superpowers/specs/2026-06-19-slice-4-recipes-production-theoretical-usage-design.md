# Slice 4 Recipes, Production, and Theoretical Usage Design

## Scope

Slice 4 delivers the approved vertical from recipe definition through
theoretical ingredient usage:

1. Managers create versioned recipes with purchased-item or nested-recipe
   components.
2. Active versions are effective-dated and reject missing yields, invalid
   units, and dependency cycles.
3. Toast menu item GUIDs map to recipes.
4. Staff record prep batches from active prep recipes.
5. Approved production consumes components and creates produced inventory at
   equal total value, with explicit yield variance retained.
6. Staged Toast PMIX rows post into immutable sales business days and sales
   items.
7. Theoretical usage expands the recipe version effective on each sale date
   into purchased inventory items without changing physical on-hand.

Waste entry and period close remain in later slices. Production may record
yield variance, but it does not create a separate waste event in this slice.

## Architecture

PostgreSQL owns immutable operational state, authorization, recipe activation,
production posting, sales posting, and idempotency. Server Actions provide
manager and staff mutation boundaries. Pure TypeScript helpers handle graph
validation, effective-version selection, nested expansion, recipe cost, and
theoretical usage so those rules are deterministic and unit-tested.

Physical inventory and theoretical usage remain deliberately separate:

- `post_production_batch` writes production-consumption and production-output
  inventory transactions.
- `post_sales_import` writes sales facts only.
- theoretical calculation writes `daily_theoretical_usage`; it never writes
  inventory transactions.

## Data Model

### Recipes

- `recipes`: organization-scoped recipe identity, recipe type (`menu_item`,
  `prep`, or `batch`), output inventory item for produced recipes, and active
  status.
- `recipe_versions`: version number, effective dates, output quantity/unit,
  approximate-yield flag, draft/active/retired status, and activation audit.
- `recipe_version_components`: ordered component lines referencing exactly one
  inventory item or nested recipe, with quantity and unit.
- `recipe_menu_item_mappings`: durable Toast `item_guid` to recipe mapping with
  source name and activation history.

Only one active recipe version may cover a business date. Components are
converted to their referenced base/output units before expansion. A recursive
dependency check rejects direct and indirect cycles before activation.

### Production

- `production_batches`: recipe/version, location, planned and actual output,
  status, staff actor, timestamps, and notes.
- `production_batch_components`: immutable component quantities and costs used
  for the posting.
- `production_yield_variances`: expected versus actual yield and explicit loss
  value.

Posting uses the latest physical on-hand cost snapshot for purchased
components. Nested produced components use their current on-hand valuation.
The output unit cost is total consumed value divided by actual output in base
units. A batch cannot post if a required component is unmapped, has no valid
conversion, or has insufficient physical on-hand.

### Sales and Theoretical Usage

- `sales_business_days`: one posted record per organization/location/business
  date and source import.
- `sales_items`: durable Toast GUID, source name, sold/void/comp quantities,
  net sales, and mapping state.
- `calculation_runs`: versioned theoretical calculation metadata and status.
- `calculation_run_inputs`: source sales day and recipe version inputs.
- `daily_theoretical_usage`: purchased inventory item quantity, cost, source
  menu item, recipe/version, and calculation run.

Sales quantity used for theoretical consumption is
`max(0, quantity_sold - void_quantity)`. Comp quantity remains consumed because
the product was made even when revenue was waived.

## Authorization and Security

- Organization members may read recipes, production, sales, and theoretical
  usage for their organization.
- Managers create recipes, activate versions, manage Toast mappings, and post
  sales imports.
- Assigned location staff create and submit production batches.
- Production posting accepts the batch creator or an organization manager.
- Every public table has RLS and explicit authenticated grants.
- Database functions use a fixed empty `search_path`, fully qualified
  relations, explicit execute grants, and organization/location checks.
- Query paths include organization and location filters in addition to RLS.

The project predates Supabase's April 28, 2026 opt-in change that can hide new
public tables from the Data API, so migrations continue to include explicit
grants and do not rely on automatic exposure.

## User Experience

### Manager recipes

`/recipes` becomes the recipe workspace with active recipe count, mapping
exceptions, average current recipe cost, and recipe/version history.

`/recipes/new` creates a recipe and first draft version. The form supports
purchased inventory components and nested recipes.

`/recipes/[id]` shows version dates, yield, nested components, current expanded
cost, activation blockers, and Toast mappings. Managers can activate a valid
draft and add a new version without rewriting history.

`/recipes/mappings` resolves staged Toast menu item GUIDs to recipes.

### Staff production

`/production` lists active prep and batch recipes. Staff enter planned and
actual output, confirm the batch, and see expected component quantities.
Successful posting records the batch and returns the workflow to the active
recipe list. Yield variance remains visible to managers.

### Sales and theoretical usage

`/recipes/sales` lists staged Toast PMIX imports and posted business days.
Managers post a staged import only when every sold GUID is mapped.

`/recipes/theoretical-usage` shows business-date usage by purchased inventory
item with quantity, weighted-average cost, theoretical cost, source menu item,
and calculation run.

## Error Handling

Blocking errors are explicit and leave draft state unchanged:

- recipe dependency cycle;
- missing or nonpositive yield;
- overlapping active effective dates;
- missing component unit conversion;
- missing produced output item;
- missing Toast recipe mapping;
- duplicate source import/business day posting;
- insufficient physical component on-hand;
- nonpositive actual production output.

Posting functions are idempotent. Replaying a production batch or sales import
returns the original result instead of duplicating ledger or sales rows.

## Testing and Gates

Unit tests cover effective-version selection, graph cycle detection, nested
expansion, recipe cost, production value conservation, and theoretical
consumption rules.

pgTAP covers schema, RLS, activation, cycle rejection, production ledger
posting, value conservation, idempotency, sales import posting, mapping
blocking, and theoretical usage persistence.

The slice uses the established non-Playwright gates:

- formatting;
- TypeScript;
- ESLint;
- Vitest;
- full pgTAP suite;
- Supabase schema lint;
- production build;
- authenticated RLS smoke queries;
- `git diff --check`.
