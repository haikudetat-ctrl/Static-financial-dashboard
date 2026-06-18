# Cocktail Bar COGS Platform — Product and System Design

**Date:** June 18, 2026

**Status:** Approved design; pending written-spec review

**Initial client:** Static!, Philadelphia

**Product direction:** Multi-tenant-ready restaurant COGS operating system, initially optimized for one beverage-led cocktail bar and one location

## 1. Executive Summary

The first release will be an auditable inventory-ledger system that connects purchasing, receiving, invoices, inventory, prep production, sales usage, physical counts, labor, and financial reporting.

Its primary outcomes are:

1. Produce trustworthy monthly actual-versus-theoretical COGS.
2. Reduce the manager's ordering and inventory decision burden.
3. Show sales, labor, COGS, and prime cost in one operational financial dashboard.
4. Establish a durable data foundation that can later ingest Toast data through APIs without replacing the manual workflows.

The MVP will not attempt to recreate Restaurant365's entire accounting and operations suite. It will build the operational spine required for reliable COGS and ordering:

`Purchase Order → Receipt → Invoice → Inventory Ledger → Production → Sales Usage → Count → Variance → Close`

Financial trustworthiness takes priority over closing speed. The system must make incomplete or uncertain data visible rather than presenting estimates as confirmed results.

## 2. Evidence From the Supplied Operating Data

The design is grounded in the files currently available in the workspace.

### Toast sales and PMIX

- 92 daily PMIX packages cover March 1 through May 31, 2026.
- These contain 21,621 item sales, approximately $303,830 in net item sales, 232 distinct Toast item GUIDs, and 237 item names.
- Toast's exported COGS columns are unpopulated across the supplied PMIX data.
- More than half of the sold item rows lack a sales category, although menu-group structure remains useful.
- The supplied PMIX exports contain no modifier rows. Recipe usage therefore cannot depend on modifier reporting being complete.
- 61 daily sales-summary packages cover March 1 through April 30, 2026, with approximately $188,781 in net sales.
- Weekend average net sales are materially higher than weekday sales, supporting future day-of-week demand logic but not requiring forecasting in the MVP.

### PLCB purchasing

- 107 PLCB PDF files represent 88 distinct orders dated January 6 through June 12, 2026.
- The 88 distinct order IDs contain 2,608 bottles and $58,513 in displayed order totals. Two orders are canceled and one is still processing, so posted purchasing will be lower.
- The documents consistently expose order ID, date, type, status, item code, product, bottle size, ordered/shipped quantity, unit price, discounts, tax, freight, and total.
- Both special-order and pickup workflows exist.
- PLCB item codes provide a strong external identifier for product matching.
- Ordered and shipped quantities can differ, so inventory must post from receiving rather than from the PO alone.

### Order guide

- The workbook separates SLO, listed PLCB products, beer, produce/NA, and dry goods/food.
- It contains vendor contacts, product names, sizes, pars, needs, prices, order cutoffs, minimums, and ordering methods such as email, portal, phone, and text.
- The current workbook mixes vendor metadata and products in a presentation-oriented layout rather than a normalized item catalog.
- Pack conventions vary among eaches, cases, bottles, bags, pounds, gallons, and other units.

### Recipes

- Recipe documents include syrups, oleos, tinctures, infusions, sodas, cocktail batches, and finished cocktails.
- Nineteen visual cocktail recipe cards identify sellable menu recipes.
- Recipes are nested: finished cocktails consume batches, which consume prep recipes, which consume purchased ingredients.
- Recipe units include ounces, milliliters, liters, quarts, pints, pounds, grams, dashes, drops, containers, eaches, and ratios.
- Some recipe yields are explicit; others are approximate or omitted.
- Recipe versions differ between documents, reinforcing the need for effective-dated versions rather than one mutable recipe.

### Manager workflow and desired outcome

The manager described the desired result as a "functional infrastructure where we can appropriately assess the health of this business." Current pain is concentrated in:

- No dependable beverage or food cost visibility.
- Vague expense coding outside the manager's control.
- Ordering decisions, deadlines, and pars living largely in the manager's head.
- Month-end inventory without an established counting system.
- Prep lists manually assembled from observation.
- A single manager carrying administrative work while needing to remain on the floor.

The manager is willing to count inventory and review exceptions, but the system must avoid adding routine line-by-line data entry.

## 3. Goals and Success Criteria

### MVP goals

- Create one traceable source of truth for inventory quantities and valuation.
- Calculate actual, theoretical, and variance COGS by period.
- Support a verified monthly full count and targeted category/location spot counts.
- Suggest vendor order quantities using operational rules rather than demand forecasting.
- Make receiving a low-friction, exception-driven phone workflow.
- Cost nested recipes using current moving weighted-average ingredient costs.
- Record prep production as inventory conversion.
- Import Toast PMIX, sales, and labor files manually.
- Preserve a canonical ingestion contract so Toast API ingestion can replace file uploads later.
- Give managers a dense desktop view while keeping staff phone tasks narrow and fast.

### Successful first close

The first monthly close is successful when:

- Opening and closing inventory are verified physical counts.
- Approved purchases reconcile to source invoices and receipts.
- Sales reconcile to the uploaded Toast reports.
- Every sold menu item has an active recipe or direct-item mapping.
- Every in-period invoice line maps to an inventory item and valid units.
- Actual and theoretical COGS calculations are reproducible and traceable.
- Unexplained variance is visible by item and category.
- Any unresolved data limitations are disclosed in the close rather than estimated silently.

No time-based close target is a launch requirement. Accuracy and auditability take precedence.

## 4. Product Boundary

### Included in the MVP

- Organization and location foundation
- Manager and staff roles
- Ingredient and inventory-item master
- Vendor and vendor-item catalog
- Packaging, unit, and conversion master
- Storage locations and count sheets
- Vendor rules, cutoffs, minimums, lead times, and ordering methods
- Order guides and initial pars
- Suggested purchase orders
- PO-first purchasing with direct-receipt exceptions
- Mobile, exception-driven receiving
- PDF/photo invoice upload
- Automated extraction with human review
- Receipt/invoice/PO matching
- Moving weighted-average costing
- Immutable inventory ledger
- Monthly full inventory counts
- Category/location spot counts
- Visual-tenths counting for open liquor bottles
- Waste, spills, comps, breakage, samples, transfers, and adjustments
- Nested recipe and batch costing
- Effective-dated recipe versions
- Prep production and yield capture
- Daily Toast PMIX and sales imports
- Toast labor/payroll CSV imports
- Actual versus theoretical COGS
- Sales, labor, COGS, gross-margin, and prime-cost reporting
- Price-change and purchasing analysis
- Vendor-ready order email text and printable orders
- Approval queues, exception queues, and audit history
- Historical backfill from the supplied files

### Explicitly deferred

- General ledger
- Full restaurant accounting
- Accounts-payable payment processing
- Bank and credit-card reconciliation
- QuickBooks posting or journal-entry synchronization
- Automated vendor order transmission
- Demand forecasting based on weather, events, or predictive models
- Prep labor timing, station task management, or employee performance analysis
- Daily full physical inventory
- Weight-based bottle counting
- Lot-level FIFO valuation
- Formal expiry/lot traceability
- Full multi-location operational workflows
- Toast write access
- Toast API ingestion, though the architecture must support it
- Reservation, guest-profile, and CRM features
- Scheduling and payroll administration

## 5. Product Principles

### The ledger is the system of record

Every quantity or value change posts an inventory transaction. Current on-hand and valuation are projections of posted transactions, not independently editable values.

### Corrections do not erase history

Posted transactions are corrected through reversals and replacement transactions. Draft records can be edited before approval.

### Work is exception-driven

Routine activity should require minimal interaction. Detailed review is reserved for mismatches, unknown items, unusual prices, and missing data.

### Source documents remain attached

Every imported report, invoice, receipt, and count has an immutable source-file reference, parser version, normalized output, and approval history.

### Confidence is explicit

Outputs are labeled as confirmed, estimated, incomplete, or blocked. A missing mapping cannot silently become a zero-cost ingredient.

### Manual and API ingestion share one contract

CSV uploads, PDF extraction, and future Toast API events produce the same canonical records and use the same validation/posting services.

## 6. System Architecture

### Application stack

- **Frontend and server application:** Next.js App Router, TypeScript, deployed on Vercel
- **Database:** Supabase PostgreSQL
- **Authentication:** Supabase Auth
- **File storage:** private Supabase Storage buckets
- **Authorization:** PostgreSQL Row Level Security on all tenant-scoped data and storage paths
- **Scheduled processing:** Supabase Cron for recurring reconciliation and housekeeping
- **Background work:** Supabase Queues consumed by Supabase Edge Functions for extraction, import, and recalculation
- **Document parsing:** asynchronous provider-neutral extraction service behind an internal interface

### Tenant model

Every business record is scoped to:

- `organization_id`
- `location_id` where operationally applicable

The first deployment has one organization and one location, but isolation is enforced from the first migration. Staff permissions are location-scoped. Cross-location reporting and transfers are deferred.

### Bounded modules

1. **Identity and tenancy**
2. **Master data**
3. **Purchasing**
4. **Receiving and invoices**
5. **Inventory ledger and counting**
6. **Recipes and production**
7. **Sales and labor ingestion**
8. **Costing and period close**
9. **Reporting**
10. **Exceptions and audit**

Each module exposes explicit services and canonical events rather than modifying another module's state directly.

## 7. Core Domain Model

### Identity and tenancy

- `organizations`
- `locations`
- `profiles`
- `organization_memberships`
- `location_memberships`
- `roles`

Initial roles:

- **Manager:** configure, map, approve, close, reopen, and report
- **Staff:** receive, count, record production, and record waste for assigned locations

Owner/accounting read-only access is a later role addition.

### Units and items

- `units`
- `unit_conversions`
- `inventory_categories`
- `inventory_items`
- `inventory_item_aliases`
- `pack_definitions`
- `storage_locations`
- `storage_location_items`

Each inventory item defines:

- Base inventory unit
- Count unit
- Purchase units and packs
- Category
- Whether it is purchased, produced, or both
- Default storage locations
- Whether open-container tenths counting is allowed
- Active/inactive state

Unit conversion must support:

- Exact conversions such as liters to milliliters
- Pack conversions such as case to bottles
- Item-specific conversions such as one dash or one container
- Yield-bearing transformations through recipes rather than arbitrary unit conversion

### Vendors and purchasing

- `vendors`
- `vendor_contacts`
- `vendor_order_rules`
- `vendor_items`
- `vendor_item_prices`
- `order_guides`
- `order_guide_items`
- `purchase_orders`
- `purchase_order_lines`
- `purchase_order_approvals`

Vendor items retain external identifiers such as PLCB item codes.

### Receiving and invoices

- `receipts`
- `receipt_lines`
- `receipt_exceptions`
- `invoices`
- `invoice_lines`
- `invoice_adjustments`
- `invoice_match_results`
- `uploaded_documents`
- `document_extractions`
- `document_extraction_lines`

PO, receipt, and invoice remain distinct documents. Their quantities and prices may differ.

### Inventory

- `inventory_transactions`
- `inventory_transaction_lines`
- `inventory_item_cost_snapshots`
- `inventory_counts`
- `inventory_count_assignments`
- `inventory_count_lines`
- `inventory_count_recounts`
- `inventory_adjustment_reasons`
- `waste_events`
- `transfers`
- `inventory_periods`

The inventory transaction header records:

- Transaction type
- Effective date/time
- Posting date/time
- Source document and source line
- Approval
- Reversal relationship
- Actor
- Idempotency key

Lines record:

- Item
- Storage location
- Quantity in base units
- Unit cost
- Extended value
- Reason

### Recipes and production

- `recipes`
- `recipe_versions`
- `recipe_version_components`
- `recipe_menu_item_mappings`
- `production_batches`
- `production_batch_components`
- `production_yield_variances`

Recipes can produce:

- A directly sellable menu item
- A prep item used by another recipe
- A batch consumed by multiple sellable items

Recipe components can reference purchased inventory items or produced recipe outputs. Cycles are prohibited.

### Sales and labor

- `source_imports`
- `source_import_files`
- `source_import_rows`
- `sales_business_days`
- `sales_items`
- `sales_discounts`
- `sales_voids`
- `sales_open_items`
- `labor_business_days`
- `external_item_mappings`

Toast's `itemGuid` is the durable menu-item identifier. Item names are descriptive and may change.

### Reporting and exceptions

- `calculation_runs`
- `calculation_run_inputs`
- `daily_theoretical_usage`
- `period_cogs_results`
- `period_variance_results`
- `exceptions`
- `audit_events`

Financial views are rebuilt from posted source data and retain the calculation run used to produce each result.

## 8. Inventory Ledger Rules

### Transaction types

- Opening balance
- Receipt
- Receipt reversal
- Transfer out
- Transfer in
- Production consumption
- Production output
- Waste
- Spill
- Breakage
- Comp/sample
- Count adjustment
- Manual adjustment
- Closing/reopening correction

Theoretical sales consumption is stored in `daily_theoretical_usage`, not in the physical inventory ledger. It never changes physical on-hand. Physical on-hand is driven by approved receipts, transfers, production, known-loss events, opening balances, and count adjustments.

### Posting behavior

- Draft operational documents do not affect inventory or cost.
- A staff-submitted receipt against an approved PO posts quantity immediately unless the staff member records an exception that requires manager review.
- A no-PO receipt does not post inventory until a manager approves its normalized lines.
- Approved invoice costs update weighted-average valuation and associate landed invoice value with the receipt.
- If the invoice arrives after the receipt, inventory quantity can post at a provisional cost and be revalued when the invoice is approved.
- Production consumes ingredients and creates the produced item at equal total value.
- Counts create adjustments only after approval.
- Closing a period freezes source transactions by effective date.
- Count adjustments use the item's weighted-average cost at the count's effective time.
- Quantity values use fixed-precision decimals, never binary floating-point arithmetic.

### Negative inventory

Negative theoretical inventory is allowed as an exception signal. Any negative physical ledger inventory blocks period close until its source timing, missing receipt, production, or count issue is resolved.

## 9. Financial Logic

### Actual COGS

For one location in a closed period:

`Actual COGS = Opening Inventory + Inventory-Valued Approved Purchases + Net Transfers In - Closing Inventory - Net Transfers Out`

Transfers cancel in consolidated organization reporting and remain visible only for location-level reconciliation.

Waste and other explicit consumption categories are reported as components of actual usage. Their accounting presentation can later be mapped to the general ledger, but they must not disappear inside unexplained variance.

### Theoretical COGS

For each sold menu item:

1. Select the menu item's effective recipe version for the sale business date.
2. Expand nested recipe components to purchased/base inventory items.
3. Convert component quantities to base units.
4. Multiply by sold quantity, accounting for void/comp rules.
5. Value usage at the applicable weighted-average cost convention for the calculation period.

Theoretical usage and theoretical cost are retained separately.

### Variance

Variance is available as:

- Quantity variance
- Cost variance
- Total dollar variance
- Percentage of theoretical usage
- Percentage of sales

It can be analyzed by:

- Inventory item
- Inventory category
- Recipe
- Menu item
- Storage location where attribution is possible
- Period

### Moving weighted-average cost

For an approved receipt:

`New Average Cost = (Prior On-Hand Value + Receipt Value + Allocated Landed Cost) / (Prior On-Hand Quantity + Receipt Quantity)`

MVP treatment:

- Product discounts reduce item cost where attributable.
- Invoice-level discounts remain separate unless manually allocated.
- Tax, freight, deposits, and credits remain visible invoice components.
- Freight is not automatically allocated into inventory cost in the initial release.
- The dashboard reports product cost and unallocated purchasing charges separately.
- If prior on-hand is zero, the approved receipt unit cost becomes the new average cost.
- A receipt cannot calculate a new weighted average while prior physical on-hand is negative; that item enters a blocking exception until the negative balance is corrected.

Automated landed-cost allocation is a later enhancement because allocation policy materially affects valuation.

### Recipe costing

- Recipe cost uses active component costs.
- Historical theoretical usage uses the recipe version effective on the sale date.
- Historical cost reporting identifies the calculation cost convention and calculation run.
- Missing yields or units block activation of a costed recipe.
- Approximate yields are allowed only when explicitly marked and displayed as estimated.

### Period close

A period cannot close while any in-period blocking exception exists:

- Missing opening or closing count
- Unapproved invoice
- Unmapped sold item
- Unmapped invoice item
- Missing unit conversion
- Duplicate source document under review
- Count not approved
- Negative physical inventory
- Sales or purchase reconciliation failure

Closed periods are locked. Corrections require manager-controlled reopening or a current-period reversing entry, depending on whether the original period's financials must be restated.

## 10. Operational Workflows

### Suggested ordering

The recommendation engine uses:

- Latest theoretical on-hand
- Latest verified count
- Open approved POs
- Expected receipts
- Item par
- Vendor pack size
- Vendor order minimum
- Vendor lead time
- Vendor cutoff weekday/time
- Manager override
- Optional safety stock

Initial rule:

`Suggested Need = max(0, Target Par - Theoretical On-Hand - Open PO Quantity)`

The system rounds to a valid purchase pack and flags minimum-order or cutoff conflicts. It explains each suggestion.

Demand forecasting, weather, events, budget optimization, and dynamic pars are deferred.

### Purchase orders

- Staff or manager creates a draft from suggested quantities or the order guide.
- Manager adjusts and approves.
- The app produces vendor-ready email text, portal copy, or a printable order.
- Sending remains a human action.
- Direct purchase/receipt without a PO is allowed with a reason and manager approval.

### Low-friction receiving

The normal phone workflow is:

1. Open the expected PO.
2. Tap **Receive all**.
3. Photograph or attach the delivery document.
4. Edit only shortages, substitutions, damage, or obvious price issues.
5. Submit.

The app automatically records user, time, location, and document.

For a no-PO delivery:

1. Select or detect vendor.
2. Photograph the document.
3. Tap **Received**.
4. The detailed lines enter the manager review queue.

Staff do not re-enter every line. Detailed extraction, product mapping, and reconciliation happen asynchronously.

### Invoice extraction and review

Extraction proposes:

- Vendor
- Invoice/order number
- Invoice date
- Order type and status
- Product code
- Product description
- Package and size
- Ordered, shipped, and invoiced quantities
- Unit price
- Item total
- Discounts
- Tax
- Freight
- Credits/deposits
- Invoice total

The review interface:

- Shows document and extracted lines together.
- Reuses confirmed vendor-item mappings.
- Suggests likely matches with confidence.
- Requires human confirmation for unknown or low-confidence matches.
- Highlights PO/receipt/invoice discrepancies.
- Prevents duplicate posting.
- Posts only after manager approval.

### Monthly full inventory

- A manager creates a count from the location's storage-location templates.
- Count assignments can be given to staff.
- Count sheets follow physical walk order, not alphabetical order.
- Sealed containers use units.
- Open liquor bottles use tenths from 0.0 to 0.9.
- Produced batches use their configured count units.
- Counters do not see expected quantities by default.
- Material variances trigger recount requests.
- Approval posts count adjustments and establishes closing inventory.

### Spot counts

Spot counts can target:

- An inventory category
- One or more storage locations
- High-value products
- Items with negative theoretical stock
- Items with unusual variance
- Items needed before a vendor cutoff

Spot counts improve operational ordering but do not replace the verified full month-end count.

### Prep production

1. Staff selects an active prep recipe.
2. Enters planned or actual output quantity.
3. Confirms the batch.
4. The system consumes components and creates produced inventory.
5. Staff can record yield variance, spill, or discard.

The initial workflow does not time employees or assign prep tasks.

### Waste and non-sale usage

Staff can record:

- Spill
- Breakage
- Prep waste
- Spoilage
- Comp
- Sample/tasting
- Staff consumption
- Other approved reason

Fast-entry presets should allow a common item and amount to be logged in a few taps. Managers can correct submitted events.

### Sales and labor imports

- Users drag in Toast ZIP or CSV packages.
- The importer detects report type and business date.
- It validates schema and source totals.
- It hashes files and rejects duplicate imports.
- Rows stage before posting.
- Unknown menu items enter a mapping queue.
- Valid mapped rows can post independently of unrelated invalid rows.
- Labor files populate daily labor cost and hours for prime-cost reporting.

### Business dates and time

- The initial location uses the `America/New_York` time zone.
- Operational and sales reporting uses a configurable restaurant business-day cutoff rather than the UTC calendar date.
- The initial cutoff is 4:00 a.m. local time so service after midnight remains on the prior business date.
- Source-reported Toast business dates take precedence when supplied.
- Vendor cutoffs and scheduled reminders are stored with the vendor's local weekday/time rules and evaluated in the location time zone.

## 11. User Experience

### Manager desktop navigation

#### Today

- Imports waiting for review
- Invoices waiting for approval
- Direct receipts waiting for approval
- Vendor cutoffs and draft orders
- Count tasks
- Material exceptions

#### Financial health

- Net sales
- Beverage sales
- Food sales
- Actual COGS
- Theoretical COGS
- COGS variance
- Gross margin
- Labor dollars and percentage
- Prime cost dollars and percentage
- Inventory value
- Confirmed/incomplete status

#### Purchasing

- Suggested orders
- Open POs
- Upcoming cutoffs
- Purchases by vendor/category
- Price changes
- Freight and unallocated charges
- Fill-rate and shortage history

#### Inventory

- On-hand projection
- Last verified count
- Count progress
- Variance
- Negative inventory
- Waste and breakage
- High-value and slow-moving products

#### Recipes

- Recipe cost
- Menu price
- Cost percentage
- Contribution margin
- Nested components
- Missing mappings/yields
- Version history

#### Exceptions

- Unmapped Toast items
- Unknown vendor items
- Missing conversions
- Receipt/invoice discrepancies
- Duplicate documents
- Price anomalies
- Negative inventory
- Incomplete counts
- Unexplained variance

### Staff phone tasks

- Receive delivery
- Perform assigned count
- Record prep batch
- Record waste/breakage

Each task has one prominent action and progressive disclosure. Staff are not exposed to accounting configuration or full manager dashboards.

### Traceability

Every dashboard number links to:

1. Calculation definition
2. Contributing transactions
3. Source documents/imports
4. Approvals and overrides

## 12. Data Ingestion and Historical Migration

### Canonical ingestion stages

1. File or API event received
2. Source identified
3. File hashed
4. Raw source retained
5. Parser version recorded
6. Rows normalized into staging
7. Structural validation
8. Source-total reconciliation
9. Entity mapping
10. Human review where required
11. Idempotent posting
12. Calculation/reconciliation queued

### Initial backfill

#### Sales

- Import all supplied March–May PMIX packages.
- Import March–April sales-summary packages for reconciliation.
- Preserve all source ZIPs and component reports.
- Build the Toast menu-item registry from item GUIDs.
- Map the highest-value and highest-volume sellable items first.
- May PMIX can reconcile to its own report totals, but May remains marked incomplete for full sales-summary reconciliation until corresponding summary files are supplied.

#### Purchases

- Import all supplied January–June PLCB PDFs.
- Deduplicate by order ID and file hash.
- Retain canceled and processing orders as source history but do not post them as received inventory.
- Build PLCB vendor-item mappings and price history from product codes.

#### Order guide

- Normalize workbook rows into vendors, contacts, products, pack sizes, pars, cutoffs, minimums, and ordering methods.
- Preserve the original workbook as a source artifact.
- Require review of ambiguous rows and missing sizes.

#### Recipes

- Convert recipe documents and cards into draft versioned recipes.
- Match sellable cocktail names to Toast item GUIDs.
- Map nested prep products.
- Require human review of yields, ratios, "dash/drop/container" units, and conflicting versions before activation.

#### Opening inventory

Historical purchases create price and vendor history, not a trustworthy historical quantity roll-forward.

The first verified full physical count is the authoritative opening inventory balance. Actual COGS begins from that baseline. Earlier months may be shown as sales and purchasing history but must not be presented as verified actual COGS.

#### Labor

No historical labor export is present in the supplied workspace. The labor importer is part of the MVP, but historical prime-cost reporting begins only when Toast labor/payroll files are supplied.

### Toast API migration path

The long-term preferred ingestion path is read-only Toast access:

- Menus API to maintain menu items and identifiers
- Orders API or order webhooks for detailed sales activity
- Menu webhook plus metadata polling for menu freshness
- Periodic bulk reconciliation to recover missed events
- Analytics API where plan/access permits and it materially simplifies labor or report ingestion

The supplied PMIX `itemGuid` values align with Toast's durable menu identifiers. Standard API access is read-only and requires eligible Toast Restaurant Management Suite access. CSV upload remains supported after API activation as a fallback and reconciliation tool.

Toast's stock API represents menu-item availability, not ingredient-level restaurant inventory, and is not the system of record for this platform's COGS inventory.

## 13. Background Processing

Queue-backed jobs include:

- Document extraction
- Import parsing
- Entity-match suggestions
- Posting validation
- Weighted-average recalculation
- Recipe expansion
- Theoretical usage calculation
- Period variance calculation
- Dashboard aggregate refresh
- Duplicate detection
- Source reconciliation

Job requirements:

- Idempotent
- Retryable
- Observable
- Safe to replay
- Scoped to organization/location
- Linked to source and parser/calculation version

Scheduled jobs include:

- Nightly import reconciliation
- Stale draft/exception reminders
- Vendor cutoff reminders
- Daily calculation refresh
- Period-close readiness checks
- Storage and job-health checks

## 14. Permissions and Security

- RLS is enabled on every exposed tenant-scoped table.
- Authorization derives from server-controlled membership and role records, never user-editable profile metadata.
- Invoice, receipt, count, and import files live in private storage buckets.
- Storage paths include organization and location scope.
- Staff can access only assigned location tasks and required item data.
- Managers can approve and report only within their organization.
- Service credentials are server-only.
- Every approval, override, mapping, close, reopen, reversal, and role change creates an audit event.
- Source documents may contain financial and contact data; signed URLs are short-lived.
- Data export and retention requirements are defined before onboarding additional clients.

## 15. Controls and Exception Handling

### Duplicate prevention

- Source file hash
- Toast source/business date/report type
- Vendor and invoice/order number
- Vendor/date/total similarity warning
- External order ID
- Idempotency keys on posting

### Price anomaly detection

Invoice review flags:

- New product
- Pack-size change
- Price change above configurable percentage
- Extended total mismatch
- Freight or discount anomaly
- Duplicate or unexpected line

Warnings do not automatically block posting unless they cause a reconciliation failure.

### Mapping controls

- Vendor-item mappings are separate from inventory items.
- Toast item mappings are separate from recipes.
- Suggested mappings include confidence and evidence.
- Confirmed mappings are versioned and auditable.
- Item merge and alias operations do not erase source identifiers.

### Data quality status

Financial outputs show:

- **Confirmed:** all required inputs posted and reconciled
- **Estimated:** explicit approximate yield/cost convention used
- **Incomplete:** optional supporting inputs missing
- **Blocked:** required inputs or reconciliation missing

## 16. Reporting

### Monthly COGS close

- Opening inventory
- Purchases
- Closing inventory
- Actual COGS
- Theoretical COGS
- Dollar and percentage variance
- Waste and known loss
- Unexplained variance
- Inventory value by category
- Purchase charges excluded from product cost
- Close status and exceptions

### Prime cost

- Net sales
- COGS
- Labor cost
- Prime cost
- COGS percentage
- Labor percentage
- Prime-cost percentage
- Comparison to prior period

### Menu profitability

- Menu item
- Quantity sold
- Net sales
- Recipe cost
- Theoretical COGS
- Cost percentage
- Contribution margin
- Recipe mapping status

### Purchasing

- Spend by vendor/category
- Average order value
- Price movement
- Fill rate
- Ordered versus received
- Invoice versus receipt discrepancies
- Freight and other charges
- Open commitments

### Operational exceptions

- Negative stock
- Missed cutoff risk
- Below-par items
- Unmapped high-value items
- High variance
- Missing counts
- Unapproved documents

## 17. Testing and Verification

### Unit tests

- Standard and item-specific unit conversion
- Pack conversion
- Moving weighted-average cost
- Late-invoice revaluation
- Receipt reversal
- Nested recipe expansion
- Recipe version selection by business date
- Production value conservation
- Count adjustment
- Actual COGS
- Theoretical COGS
- Variance
- PO suggestion rounding and open-PO deduction
- Period locking

### Fixture tests

- Supplied Toast PMIX ZIPs
- Supplied Toast sales-summary ZIPs
- Pickup PLCB invoice
- Special-order PLCB invoice
- Discounted PLCB invoice
- Multi-page PLCB invoice
- Duplicate PLCB files sharing an order ID
- Existing recipe documents and cards
- Existing order-guide structures

### Reconciliation tests

- Imported sales totals equal source totals.
- Invoice lines plus discounts, tax, freight, and other charges equal invoice total.
- Receipt quantities equal posted quantity transactions.
- Production input value equals output value plus explicit loss.
- Opening plus movements equals pre-count projected on-hand.
- Approved count adjustment brings projected on-hand to counted on-hand.
- Actual COGS ties to inventory roll-forward.

### Permission tests

- Cross-organization reads and writes fail.
- Staff cannot approve or close.
- Staff see only assigned locations.
- Private source documents require authorized signed access.
- Service-only operations are inaccessible to browser clients.

### Browser tests

- Receive-all happy path
- Receiving discrepancy
- No-PO receipt
- Assigned bottle count with tenths
- Recount
- Prep batch
- Waste entry
- Invoice review
- Import mapping
- Period close and reopen

### Launch verification

The first production close runs in parallel with a manually reviewed calculation. Differences are investigated to source transactions. The platform is not declared financially trustworthy until the reconciliation is accepted by the manager.

## 18. Implementation Slices

This design should be implemented as sequential vertical slices rather than by building all database tables before usable workflows.

### Slice 1: Master data and historical source staging

- Tenancy/auth foundation
- Units, items, vendors, storage locations
- Source storage and import registry
- Historical PLCB, Toast, recipe, and order-guide staging
- Mapping queues

### Slice 2: Opening count and inventory ledger

- Mobile count
- Bottle tenths
- Count review/recount
- Opening-balance posting
- On-hand and valuation projection

### Slice 3: Purchasing, receiving, and invoice posting

- Order guide
- Suggested POs
- Receive-all workflow
- Invoice extraction/review
- Weighted-average cost

### Slice 4: Recipes, production, and theoretical usage

- Nested recipe versions
- Menu-item mappings
- Prep production
- Sales posting
- Theoretical usage

### Slice 5: Close and financial dashboard

- Actual COGS
- Variance
- Labor/prime cost
- Period controls
- Traceable dashboards

### Slice 6: Toast API ingestion

- Credentials and secure secret handling
- Menu synchronization
- Orders webhook/bulk reconciliation
- Labor or analytics ingestion where available
- CSV fallback comparison

## 19. Risks and Mitigations

### Master-data cleanup is larger than it appears

The source files use inconsistent names, sizes, categories, and units. The system must prioritize assisted mapping and bulk review. Attempting perfect automation would create false confidence.

### Recipes are not fully cost-ready

Missing yields, approximate outputs, ratios, and informal units must be reviewed before recipe activation. Draft recipes may be imported automatically; trusted recipes cannot.

### Historical actual COGS cannot be reconstructed reliably

Purchases and sales exist, but verified opening/closing counts do not. Historical reporting must distinguish purchase history and theoretical usage from verified actual COGS.

### Receiving can fail through workflow burden

The receive-all default, document capture, and asynchronous manager review are mandatory. A line-by-line receiving form would undermine adoption.

### Invoice extraction can appear more accurate than it is

Extraction must preserve confidence, totals reconciliation, and human approval. It cannot post autonomously.

### Unrecorded non-sale usage distorts variance

Fast waste/spill/sample logging and clear reason codes reduce unexplained variance. The system should report known and unknown loss separately.

### Menu changes break historical calculations

Toast item GUIDs and effective-dated recipe mappings protect history. Item names are not keys.

### Vendor charges complicate valuation

Freight and invoice-level charges remain explicit until a landed-cost policy is chosen. The dashboard cannot bury these charges or allocate them arbitrarily.

### One manager is a key-person dependency

Staff workflows should distribute counting, receiving, production, and waste capture without exposing financial controls. Approval queues keep accountability with the manager.

### Connectivity and device realities

Phone workflows must tolerate interrupted connections through safe drafts, clear submission state, and idempotent retries. Full offline synchronization is not an MVP commitment.

## 20. Decisions Recorded

- Build an inventory-ledger vertical slice.
- Deliver both financial COGS reporting and operational ordering/counting.
- Use monthly full counts plus targeted spot counts.
- Prefer POs but allow approved direct receipts.
- Manager and staff roles in the MVP.
- Report sales, labor, COGS, and prime cost; defer full P&L.
- Suggest orders from pars, theoretical stock, lead times, vendor constraints, and open POs.
- Extract invoices automatically but require human review.
- Make receiving phone-first and exception-driven.
- Count open bottles in visual tenths.
- Build a multi-tenant foundation optimized initially for one location.
- Use moving weighted-average cost.
- Import Toast labor CSV now and use Toast APIs long-term.
- Track prep production as inventory conversion.
- Backfill all available history, with the first verified count as the inventory baseline.
- Prioritize trustworthy COGS over closing speed.

## 21. Acceptance Criteria for the MVP

The MVP is complete when a manager can:

1. Configure items, vendors, packs, units, locations, pars, and vendor rules.
2. Import the supplied historical sources without duplicate posting.
3. Perform and approve a full mobile inventory count with open bottles in tenths.
4. Generate a suggested PO, approve it, and produce vendor-ready order text.
5. Receive the PO through the receive-all workflow and record only exceptions.
6. Upload an invoice, review extracted lines, resolve mappings, and post it.
7. See inventory quantity and weighted-average cost update traceably.
8. Activate nested recipes and map them to Toast item GUIDs.
9. Record a prep batch that consumes ingredients and creates produced inventory.
10. Import daily PMIX and calculate theoretical ingredient usage.
11. Import labor totals and calculate labor and prime cost.
12. Close a month using opening count, purchases, sales, and closing count.
13. View actual COGS, theoretical COGS, known loss, unexplained variance, labor, prime cost, and inventory value.
14. Drill every dashboard result to transactions, approvals, and source files.
15. See incomplete or blocked calculations clearly identified.
