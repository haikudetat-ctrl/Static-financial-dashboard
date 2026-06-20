# Recipe Extraction and Review Pipeline — Product and System Design

**Date:** June 20, 2026

**Status:** Approved design; pending written-spec review

**Product:** Static OS

## 1. Executive Summary

Static OS will ingest recipes from the supplied Word documents and photographed recipe cards through a review-first pipeline. Extraction output will never write directly to the canonical recipe tables.

Each extraction run will create two linked intermediate artifacts from the same structured result:

1. A structured payload stored in Supabase staging tables.
2. An immutable Markdown snapshot stored with a content hash.

The Markdown provides a readable, auditable representation of what the extractor understood. The application provides the controlled editing, mapping, validation, and approval experience. Corrections create staged revisions and new Markdown snapshots rather than modifying prior artifacts.

Only a manager-approved candidate may create or update canonical recipes, recipe versions, components, and inventory-item mappings. Approval is blocked until every ingredient, unit, quantity, recipe yield, and duplicate conflict is resolved.

## 2. Existing Project Context

The current project already contains the foundation required by this feature:

- Private source-document storage and file-hash deduplication.
- `source_imports` and `source_import_rows` for import staging.
- A generic imports page and mapping queue.
- Canonical `recipes`, `recipe_versions`, and `recipe_version_components` tables.
- Effective-dated recipe versions with draft, active, and retired states.
- Activation validation for missing components, overlapping effective dates, and recipe dependency cycles.
- Inventory items, aliases, units, and conversions.
- Tenant-scoped Row Level Security.

The supplied recipe sources include:

- `Static Recipes.docx`
- `Static Menu 2.0 Recipes.docx`
- Nineteen JPEG recipe cards

The Word documents contain prep recipes, syrups, infusions, batches, and methods in paragraph form. The cards contain finished cocktail recipes with quantities, units, glassware, garnish, ice, and instructions. Recipes can occur in more than one source with changed quantities or methods, so matching sources should become proposed versions of one canonical recipe rather than separate recipes.

## 3. Goals

- Convert recipe sources into readable Markdown for inspection and later ingestion.
- Preserve the original source, extraction result, revisions, and approval history.
- Present likely duplicate recipes as proposed versions of one recipe.
- Suggest existing inventory items and nested recipes for each ingredient.
- Allow a reviewer to create a new inventory item when no valid match exists.
- Prevent partial or ambiguous recipes from entering the canonical recipe model.
- Keep extraction approval separate from operational recipe activation.
- Make extraction deterministic, retryable, and idempotent.

## 4. Non-Goals

The first release will not:

- Automatically approve high-confidence recipes or ingredients.
- Treat Markdown as the canonical operational database.
- Activate a recipe merely because its extraction was approved.
- Infer missing quantities or yields without reviewer confirmation.
- Delete prior extraction artifacts when a source is reprocessed.
- Build a general-purpose document management system.
- Use sales behavior to choose between competing recipe versions.
- Resolve recipe-card images into polished visual recipe cards.

## 5. Chosen Approach

### Dual artifact, single extraction

The extraction service produces one normalized structured result. Static OS persists that result and renders Markdown from it using a deterministic renderer.

This avoids two undesirable alternatives:

- **Markdown-driven ingestion:** parsing a source into Markdown and then reparsing the Markdown can introduce drift and lose typed fields.
- **Structured-only staging:** storing only JSON is reliable but does not provide a convenient human-auditable artifact.

The structured payload and Markdown snapshot will share:

- Extraction-run identifier
- Schema version
- Renderer version
- Source-document identifier
- Source hash
- Structured-payload hash
- Markdown hash

Markdown is an immutable audit artifact. The structured staged revision is the editable working representation. Saving a correction creates a new revision and a new Markdown snapshot.

## 6. End-to-End Data Flow

```text
Source upload
  → source registration and hashing
  → format-specific text/layout extraction
  → recipe boundary detection
  → structured candidate extraction
  → deterministic Markdown rendering
  → duplicate and version grouping
  → ingredient and unit suggestions
  → manager review and corrections
  → blocking validation
  → atomic approval
  → canonical draft recipe version
  → separate operational activation
```

### Source registration

The existing upload flow stores each source in the private `source-documents` bucket and registers its SHA-256 hash in `source_imports`. Re-uploading an identical file links to the existing source import unless the reviewer explicitly starts a new extraction run with a newer parser.

### Format extraction

- DOCX sources use paragraph order, headings, runs, and source positions from OOXML.
- JPEG recipe cards use image-aware extraction and retain the source image as the review reference.
- The format extractor emits ordered source blocks without deciding canonical ingredient identities.

### Recipe candidate extraction

The recipe parser divides source blocks into recipe candidates and proposes:

- Name
- Recipe type: `menu_item`, `prep`, or `batch`
- Description
- Yield quantity and unit
- Whether the yield is approximate
- Ingredient lines
- Method
- Service metadata when present, such as glassware, ice, and garnish
- Extraction issues and confidence

### Duplicate and version grouping

Candidates are grouped using normalized names, aliases, recipe type, source context, and ingredient similarity. A grouping suggestion never merges records automatically.

The reviewer may:

- Confirm that candidates are versions of the same recipe.
- Move a candidate into a different recipe group.
- Declare a candidate to be a new recipe.

Each confirmed source remains a distinct proposed version with its own provenance.

### Review and approval

The manager reviews each proposed version, resolves every blocking issue, and approves it. Approval writes to canonical tables in one database transaction. The resulting recipe version remains `draft`.

Activation is a separate explicit action that supplies an effective date and uses the existing recipe activation rules.

## 7. Staging Data Model

The existing `source_imports` and `source_import_rows` remain the general source-ingestion registry. Recipe-specific staging tables add typed workflow state without overloading generic JSON rows.

### `recipe_extraction_runs`

One record per parser execution:

- `id`
- `organization_id`
- `location_id`
- `source_import_id`
- `status`: `queued`, `extracting`, `extracted`, `needs_review`, `approved`, `failed`, `superseded`
- `source_format`: `docx`, `jpeg`
- `parser_version`
- `schema_version`
- `renderer_version`
- `structured_payload`
- `structured_payload_hash`
- `started_at`
- `completed_at`
- `error_code`
- `error_message`
- `created_by`
- `created_at`

An extraction run is immutable after completion except for workflow status. A retry creates a new run.

### `recipe_candidates`

One detected recipe in an extraction run:

- `id`
- `organization_id`
- `extraction_run_id`
- `candidate_index`
- `proposed_name`
- `normalized_name`
- `proposed_recipe_type`
- `proposed_recipe_group_id`
- `confidence`
- `status`: `unreviewed`, `in_review`, `blocked`, `ready`, `approved`, `rejected`, `superseded`
- `source_locator`
- `original_text`
- `created_at`

`source_locator` is JSON containing the available page, image, paragraph, block, table-cell, or bounding-box references.

### `recipe_candidate_revisions`

Each saved edit creates a complete immutable candidate revision:

- `id`
- `recipe_candidate_id`
- `revision_number`
- `name`
- `recipe_type`
- `description`
- `yield_quantity`
- `yield_unit_id`
- `yield_unit_text`
- `yield_is_approximate`
- `method`
- `service_metadata`
- `revision_payload`
- `validation_status`
- `created_by`
- `created_at`

The candidate points to its current revision. Earlier revisions remain readable.

### `recipe_candidate_ingredients`

Ingredient lines belong to a candidate revision:

- `id`
- `candidate_revision_id`
- `line_order`
- `original_text`
- `quantity`
- `quantity_text`
- `unit_id`
- `unit_text`
- `ingredient_text`
- `preparation_note`
- `component_kind`: `inventory_item` or `recipe`
- `component_inventory_item_id`
- `component_recipe_id`
- `match_confidence`
- `resolution_status`: `unresolved`, `suggested`, `confirmed`, `create_item`, `blocked`
- `source_locator`
- `created_at`

Exactly one canonical component reference is required before approval.

### `recipe_candidate_match_suggestions`

Suggestions remain separate from confirmed mappings:

- `id`
- `candidate_ingredient_id`
- `suggested_match_type`
- `suggested_match_id`
- `score`
- `reason_codes`
- `rank`
- `created_at`

Reason codes may include normalized-name match, inventory alias match, prior reviewer decision, unit compatibility, or nested-recipe name match.

### `recipe_candidate_groups`

Represents the proposed canonical identity shared by source versions:

- `id`
- `organization_id`
- `normalized_name`
- `canonical_recipe_id`
- `status`: `suggested`, `confirmed`, `split`, `approved`
- `created_by`
- `created_at`

If `canonical_recipe_id` is null at approval, Static OS creates the recipe. Otherwise, approval creates a new version of the existing recipe.

### `recipe_markdown_snapshots`

One immutable Markdown artifact per candidate revision:

- `id`
- `organization_id`
- `recipe_candidate_id`
- `candidate_revision_id`
- `extraction_run_id`
- `storage_path`
- `content_hash`
- `renderer_version`
- `created_at`

Snapshot files use tenant-scoped private storage paths. They cannot be overwritten.

### `recipe_candidate_issues`

Typed validation and extraction issues:

- `id`
- `recipe_candidate_id`
- `candidate_revision_id`
- `candidate_ingredient_id`
- `issue_code`
- `severity`: `warning` or `blocking`
- `message`
- `source_locator`
- `status`: `open`, `resolved`, `accepted`
- `resolved_by`
- `resolved_at`
- `resolution_note`
- `created_at`

Blocking issues cannot be accepted without correcting the underlying data. Warnings may be acknowledged with a note.

### `recipe_source_links`

Links an approved canonical version back to its evidence:

- `id`
- `organization_id`
- `recipe_id`
- `recipe_version_id`
- `recipe_candidate_id`
- `candidate_revision_id`
- `source_import_id`
- `extraction_run_id`
- `markdown_snapshot_id`
- `approved_by`
- `approved_at`

## 8. Structured Extraction Contract

The extraction contract is versioned. A simplified candidate payload is:

```json
{
  "schema_version": "1.0",
  "source": {
    "source_import_id": "uuid",
    "file_name": "Static Recipes.docx",
    "source_hash": "sha256",
    "locator": {
      "paragraph_start": 3,
      "paragraph_end": 12
    }
  },
  "candidate": {
    "name": "Pineapple Shrub",
    "recipe_type": "prep",
    "yield": {
      "quantity": 4,
      "unit_text": "Q",
      "approximate": true
    },
    "ingredients": [
      {
        "line_order": 1,
        "original_text": "Skins and Core of 1 pineapple",
        "quantity": 1,
        "quantity_text": "1",
        "unit_text": "each",
        "ingredient_text": "pineapple",
        "preparation_note": "skins and core",
        "source_locator": {
          "paragraph": 4
        }
      }
    ],
    "method": "In a stock pot...",
    "service_metadata": {},
    "issues": []
  }
}
```

The contract preserves both parsed fields and original text. Normalization must never discard the source wording needed to audit or correct an extraction.

## 9. Markdown Contract

Markdown snapshots are generated from candidate revisions, not separately interpreted from source files.

```md
---
recipe_candidate_id: 00000000-0000-0000-0000-000000000000
candidate_revision: 1
source_file: Static Recipes.docx
source_hash: sha256
extraction_run_id: 00000000-0000-0000-0000-000000000000
schema_version: "1.0"
parser_version: "recipe-docx-1.0.0"
renderer_version: "recipe-md-1.0.0"
proposed_recipe: Pineapple Shrub
proposed_type: prep
yield_quantity: 4
yield_unit: quart
yield_approximate: true
---

# Pineapple Shrub

## Yield

Approximately 4 qt

## Ingredients

- 1 each pineapple — skins and core
- 4 qt water
- 2 qt cane sugar
- 20 g coriander

## Method

In a stock pot, add pineapple skins/core and water...

## Source

- File: `Static Recipes.docx`
- Paragraphs: 3–12

## Extraction Issues

- Blocking: “white vin” requires confirmation as white vinegar or white wine.
```

### Markdown guarantees

- Stable field and section ordering.
- UTF-8 encoding and normalized line endings.
- Deterministic rendering for the same structured revision and renderer version.
- No overwriting or mutation of an existing snapshot.
- A SHA-256 content hash stored beside the snapshot.
- Direct linkage to source, run, candidate, and revision records.

## 10. Ingredient and Unit Resolution

### Suggestion order

For each extracted ingredient, Static OS suggests:

1. Exact inventory-item name or alias matches.
2. Exact nested-recipe name matches.
3. Prior confirmed mappings for the same normalized source phrase.
4. Fuzzy matches with compatible unit dimensions.
5. Creation of a new inventory item.

Suggestions are ranked but never automatically confirmed.

### Existing inventory item

The reviewer selects an existing item and confirms the component unit. If the selected unit has no valid conversion to the inventory item's base unit, the candidate remains blocked.

### Nested recipe

The reviewer may identify the ingredient as an existing prep or batch recipe. The selected unit must be compatible with the nested recipe's output unit. Existing activation logic remains responsible for detecting recipe dependency cycles.

### New inventory item

The review screen supports creating an inventory item without leaving the candidate. The reviewer must provide:

- Canonical name
- Category
- Base unit
- Count unit when different
- Purchased/produced flags
- Optional aliases based on source wording

The new item is created through a controlled manager action and immediately becomes available to the candidate. The action is audited separately from recipe approval.

### Unknown units

Unknown source units such as `Ct`, `Q`, `container`, or free-form ratios remain visible as source text. The reviewer may:

- Map the term to an existing unit.
- Add an organization-specific alias for an existing unit.
- Create a valid organization unit and conversion.
- Correct a parsing error.

Approval remains blocked until the line has a recognized unit and a valid conversion path.

## 11. Duplicate Recipes and Proposed Versions

Sources with the same recipe identity become separate proposed versions in one candidate group.

The review interface compares versions across:

- Yield
- Ingredient additions and removals
- Quantity or unit changes
- Method changes
- Recipe type
- Service metadata

The reviewer confirms the grouping before approval. Static OS does not silently decide which version is current.

If a group maps to an existing canonical recipe, each approved candidate creates the next available version number. If several candidates are approved together, their version ordering and proposed effective dates must be explicit.

## 12. Review Experience

The manager review screen uses a source-and-form layout.

### Source panel

- Original recipe-card image for JPEG sources.
- Extracted source text with paragraph or block references for DOCX sources.
- Source filename, hash, parser version, and extraction timestamp.
- Navigation to other proposed versions in the same group.

### Editable candidate panel

- Recipe name
- Recipe type
- Description
- Yield quantity, unit, and approximate flag
- Ingredient rows
- Method
- Glassware, ice, garnish, and other service metadata
- Effective date proposed for later activation

Each ingredient row shows:

- Original source text
- Parsed quantity and unit
- Parsed ingredient name and preparation note
- Ranked existing-item and nested-recipe suggestions
- Create-inventory-item action
- Confidence and issue indicators

### Version comparison

When duplicate candidates are grouped, the reviewer can compare sources side by side. Differences are semantic field differences, not merely a text diff.

### Workflow actions

- Save revision
- Reject candidate
- Re-run extraction with a newer parser
- Move or split candidate group
- Mark candidate ready
- Approve candidate
- Open resulting canonical draft version

## 13. Validation and Approval Boundary

### Blocking validation

Approval is blocked unless:

- The recipe name is present.
- The recipe type is valid.
- Yield quantity is positive.
- Yield unit is recognized.
- Every ingredient quantity is positive.
- Every ingredient unit is recognized.
- Every ingredient unit has a valid conversion path.
- Every ingredient maps to exactly one inventory item or nested recipe.
- Every `create_item` resolution has completed successfully.
- No ingredient or yield ambiguity remains open.
- The duplicate/version grouping is confirmed.
- The candidate has not already been approved.
- The source and Markdown snapshot hashes still match their stored artifacts.

Existing canonical activation constraints are not weakened. In particular, produced recipes still require an output inventory item, and activation still rejects recipe cycles and invalid effective-date overlaps.

### Atomic approval transaction

Approval performs the following in one database transaction:

1. Lock the candidate and current revision.
2. Re-run all approval validation.
3. Confirm the revision has not changed since the reviewer loaded it.
4. Create the canonical recipe if the group is new.
5. Create the produced output inventory item if required and explicitly approved.
6. Allocate the next recipe version number.
7. Create a canonical `recipe_versions` row with `draft` status.
8. Create ordered `recipe_version_components`.
9. Create source-provenance links.
10. Mark the candidate approved and record the approver.

Any failure rolls back the entire approval. Retrying with the same candidate and revision is idempotent and returns the existing approved recipe version.

### Activation boundary

Extraction approval means, “This is an accurate structured representation of the source.”

Activation means, “This recipe version should be used operationally beginning on this effective date.”

These remain separate manager actions.

## 14. Failure Handling

### Unsupported or corrupt source

The extraction run is marked `failed` with a stable error code. The source remains stored, and the reviewer can retry with another parser version.

### Partial extraction

Successfully detected candidates remain available. Incomplete candidates carry blocking issues and cannot be approved.

### OCR uncertainty

Low-confidence text is highlighted beside the original image. Confidence affects review priority but never approval behavior.

### Parser retry

A retry creates a new extraction run and new candidates. Earlier runs and Markdown snapshots remain immutable. The reviewer can mark the older run superseded after comparing results.

### Concurrent edits

Candidate revisions use optimistic concurrency. Saving or approving a stale revision fails with a clear request to reload the newer revision.

### Approval failure

Database errors, missing conversion paths, uniqueness conflicts, or dependency-cycle errors leave the candidate staged. No partial canonical recipe data remains.

## 15. Security and Auditability

- All staging tables include `organization_id` directly or derive it through an enforced parent relation.
- RLS applies to every staging and provenance table.
- Only managers may correct, group, create inventory items from, approve, reject, or supersede candidates.
- Staff do not receive access to unapproved recipe extraction data.
- Source documents and Markdown snapshots remain in private storage.
- Storage paths begin with organization and location identifiers.
- Service-role credentials are limited to server-side extraction and transaction orchestration.
- Every review action records actor, timestamp, candidate revision, and before/after structured values.
- Canonical source links survive recipe retirement and extraction-run supersession.

## 16. Component Boundaries

### Source adapters

Read one source format and emit ordered source blocks. They do not map inventory items or write canonical recipes.

### Recipe extractor

Converts source blocks into the versioned structured extraction contract.

### Markdown renderer

Deterministically renders a candidate revision to Markdown and computes its hash.

### Candidate repository

Creates extraction runs, candidates, immutable revisions, ingredients, snapshots, and issues.

### Match suggestion service

Ranks existing inventory-item and nested-recipe candidates. It never confirms a mapping.

### Validation service

Returns typed warning and blocking issues for a candidate revision.

### Approval service

Owns the single transaction that moves a validated staged revision into canonical recipe tables.

### Review UI

Displays source evidence, edits staged revisions, resolves matches, compares versions, and invokes validation and approval.

## 17. Testing Strategy

### Extraction fixtures

- DOCX with multiple sections and recipes.
- DOCX with omitted yield.
- DOCX with ratio-based ingredients.
- Recipe card with clean text.
- Recipe card with ambiguous OCR.
- Duplicate recipe names across source types.

### Unit tests

- Recipe boundary detection.
- Quantity and unit parsing.
- Preparation-note preservation.
- Recipe-type classification.
- Duplicate-group suggestions.
- Ingredient suggestion ranking.
- Deterministic Markdown rendering.
- Structured and Markdown hash generation.
- Typed validation issue generation.

### Database tests

- RLS isolation between organizations.
- Immutable extraction runs, revisions, and snapshots.
- Unique candidate revision numbers.
- Blocking validation enforcement.
- Atomic approval and rollback.
- Approval idempotency.
- Canonical version-number allocation under concurrency.
- Provenance-link creation.
- Rejection of unresolved units and components.

### Integration tests

- Upload DOCX → extract candidates → review → approve → canonical draft version.
- Upload JPEG → inspect source alongside fields → correct OCR → approve.
- Map ingredient to existing inventory item.
- Create inventory item during review and use it.
- Map ingredient to nested recipe.
- Group two sources as versions of one recipe.
- Retry extraction without deleting prior artifacts.
- Detect a stale revision during approval.

### User-interface tests

- Blocking issues are visible and actionable.
- Approval control remains disabled while blocking issues exist.
- Source evidence remains visible while editing.
- Version comparison accurately identifies field-level changes.
- Successful approval links to the created draft recipe version.

## 18. Initial Rollout

The first implementation should process a small representative set before running all recipe sources:

1. One straightforward prep recipe from DOCX.
2. One ratio-based syrup with an omitted fixed yield.
3. One photographed cocktail card.
4. One recipe appearing in both Word documents.
5. One recipe containing a nested prep ingredient.

After validation, run both Word documents and the nineteen recipe cards through the same pipeline. Historical extraction runs remain available if parser behavior changes during rollout.

## 19. Success Criteria

The feature is successful when:

- Every supplied recipe source is registered and has an immutable source hash.
- Every detected recipe has structured staging data and a matching Markdown snapshot.
- Duplicate recipes are presented as proposed versions of one recipe.
- Original ingredient wording remains visible after normalization.
- Reviewers can select suggested items or create new inventory items.
- No unresolved ingredient, unit, quantity, yield, or duplicate issue can pass approval.
- Approval creates complete canonical draft recipe versions atomically.
- Every approved recipe version can be traced back to its source, extraction run, revision, and Markdown snapshot.
- Reprocessing a source never destroys prior evidence or duplicates an already-approved version.

## 20. Implementation Sequence

1. Add recipe extraction staging, revision, snapshot, issue, grouping, and provenance tables with RLS.
2. Define the structured extraction schema and deterministic Markdown renderer.
3. Implement the DOCX source adapter and parser.
4. Implement the recipe-card image adapter and parser.
5. Implement duplicate grouping and ingredient suggestion services.
6. Build the source-and-form review interface.
7. Add inline inventory-item creation and unit resolution.
8. Implement blocking validation and atomic approval.
9. Add version comparison, retry, supersession, and audit views.
10. Run the representative rollout set, then process all supplied recipe sources.
