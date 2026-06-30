# Recipe Extraction and Review Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a review-first recipe ingestion pipeline that converts DOCX and recipe-card sources into immutable Markdown snapshots and Supabase staging records, then atomically creates canonical draft recipe versions only after manager validation.

**Architecture:** Extend the existing generic source-import registry with recipe-specific staging, revisions, ingredient resolutions, issues, grouping, snapshots, and provenance. Keep parsing and deterministic Markdown rendering in focused TypeScript modules, use server actions for review mutations, and use one PostgreSQL RPC for validated atomic approval. DOCX extraction is deterministic; image sources enter the same staging contract through a provider boundary and remain blocked for manual correction when no OCR provider is configured.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Supabase PostgreSQL/Auth/Storage/RLS, Vitest, pgTAP, Deno Edge Functions, `fflate`, `fast-xml-parser`

---

## File Map

### Database

- Create `supabase/migrations/20260620120000_recipe_extraction_review.sql`: staging enums/tables, indexes, RLS, immutable guards, validation view/function, and atomic approval RPC.
- Create `supabase/tests/database/recipe_extraction_review.test.sql`: schema, RLS, immutability, validation, approval, rollback, and idempotency coverage.

### Extraction and rendering

- Create `src/lib/recipe-imports/types.ts`: versioned extraction and review contracts.
- Create `src/lib/recipe-imports/normalize.ts`: normalized names, units, quantities, and suggestion helpers.
- Create `src/lib/recipe-imports/docx.ts`: DOCX source-block and recipe-candidate extraction.
- Create `src/lib/recipe-imports/image.ts`: image-extraction provider interface and blocked manual fallback.
- Create `src/lib/recipe-imports/markdown.ts`: deterministic Markdown renderer.
- Create `src/lib/recipe-imports/validation.ts`: pure blocking/warning validation.
- Create `src/lib/recipe-imports/repository.ts`: Supabase persistence and query functions.
- Create `src/lib/recipe-imports/storage.ts`: immutable Markdown snapshot upload and hash verification.
- Create `tests/unit/recipe-imports/*.test.ts`: parser, renderer, normalization, grouping, and validation tests.
- Create `tests/fixtures/recipes/*.json`: compact source-block fixtures derived from supplied recipes without committing source documents.

### Extraction entry point

- Create `src/app/api/recipe-imports/[id]/extract/route.ts`: authenticated extraction orchestration.
- Modify `src/app/api/upload/route.ts`: route recipe uploads to the recipe extraction endpoint instead of invoice extraction.
- Modify `src/lib/imports/index.ts`: add separate recipe DOCX and recipe-card source types/status labels.
- Modify `src/components/imports/upload-form.tsx`: redirect recipe uploads to the recipe review queue.

### Review and approval

- Create `src/app/(manager)/recipe-imports/page.tsx`: extraction queue.
- Create `src/app/(manager)/recipe-imports/[candidateId]/page.tsx`: source-and-form review screen.
- Create `src/app/(manager)/recipe-imports/actions.ts`: revision, grouping, item creation, resolution, rejection, and approval actions.
- Create `src/components/recipe-imports/review-form.tsx`: editable candidate form.
- Create `src/components/recipe-imports/ingredient-row.tsx`: ingredient resolution controls.
- Create `src/components/recipe-imports/source-panel.tsx`: source text/image and provenance.
- Create `src/components/recipe-imports/version-comparison.tsx`: semantic candidate comparison.
- Create `src/components/recipe-imports/issue-list.tsx`: blocking/warning issue display.
- Modify `src/lib/navigation.ts`: add Recipe Imports navigation.
- Modify `src/lib/auth/route-access.ts`: manager-protect recipe import routes.

## Task 1: Add Recipe Extraction Staging Schema

**Files:**

- Create: `supabase/migrations/20260620120000_recipe_extraction_review.sql`
- Test: `supabase/tests/database/recipe_extraction_review.test.sql`

- [ ] **Step 1: Create a failing pgTAP schema test**

Add tests for the required tables and approval function:

```sql
begin;
select plan(12);

select has_table('public', 'recipe_extraction_runs');
select has_table('public', 'recipe_candidate_groups');
select has_table('public', 'recipe_candidates');
select has_table('public', 'recipe_candidate_revisions');
select has_table('public', 'recipe_candidate_ingredients');
select has_table('public', 'recipe_candidate_match_suggestions');
select has_table('public', 'recipe_candidate_issues');
select has_table('public', 'recipe_markdown_snapshots');
select has_table('public', 'recipe_source_links');
select has_function('public', 'approve_recipe_candidate', array['uuid', 'uuid']);
select has_function('public', 'validate_recipe_candidate', array['uuid']);
select col_is_unique('public', 'recipe_candidate_revisions', array['recipe_candidate_id', 'revision_number']);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the database test and verify it fails**

Run:

```bash
npx supabase test db supabase/tests/database/recipe_extraction_review.test.sql
```

Expected: failures reporting missing recipe extraction tables and functions.

- [ ] **Step 3: Create the staging migration**

Create enums for extraction status, candidate status, resolution status, issue severity/status, and group status. Add the tables from the design with:

```sql
create table public.recipe_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  extraction_run_id uuid not null references public.recipe_extraction_runs(id) on delete cascade,
  candidate_index integer not null check (candidate_index >= 0),
  proposed_name text not null,
  normalized_name text not null,
  proposed_recipe_type public.recipe_type not null,
  proposed_recipe_group_id uuid references public.recipe_candidate_groups(id),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  status public.recipe_candidate_status not null default 'unreviewed',
  source_locator jsonb not null default '{}'::jsonb,
  original_text text not null default '',
  current_revision_id uuid,
  approved_recipe_version_id uuid references public.recipe_versions(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (extraction_run_id, candidate_index)
);
```

Add a deferred foreign key from `current_revision_id` after creating revisions. Add unique indexes for revision numbers, ingredient line order, snapshot revision, and source-link candidate revision.

- [ ] **Step 4: Add RLS and manager policies**

Use existing membership helpers and direct organization scoping:

```sql
alter table public.recipe_candidates enable row level security;

create policy "managers read recipe candidates"
on public.recipe_candidates for select to authenticated
using (
  public.is_organization_member(organization_id)
  and public.is_organization_manager(organization_id)
);
```

Apply equivalent policies to every recipe staging/provenance table. Extraction service writes must occur through the server service role; authenticated clients receive no direct insert/delete policy for immutable artifacts.

Add explicit grants in the same migration because new Supabase projects no longer necessarily expose new public tables automatically:

```sql
grant select on table
  public.recipe_extraction_runs,
  public.recipe_candidate_groups,
  public.recipe_candidates,
  public.recipe_candidate_revisions,
  public.recipe_candidate_ingredients,
  public.recipe_candidate_match_suggestions,
  public.recipe_candidate_issues,
  public.recipe_markdown_snapshots,
  public.recipe_source_links
to authenticated;

grant select, insert, update, delete on table
  public.recipe_extraction_runs,
  public.recipe_candidate_groups,
  public.recipe_candidates,
  public.recipe_candidate_revisions,
  public.recipe_candidate_ingredients,
  public.recipe_candidate_match_suggestions,
  public.recipe_candidate_issues,
  public.recipe_markdown_snapshots,
  public.recipe_source_links
to service_role;

revoke all on table
  public.recipe_extraction_runs,
  public.recipe_candidate_groups,
  public.recipe_candidates,
  public.recipe_candidate_revisions,
  public.recipe_candidate_ingredients,
  public.recipe_candidate_match_suggestions,
  public.recipe_candidate_issues,
  public.recipe_markdown_snapshots,
  public.recipe_source_links
from anon;
```

Grant authenticated mutation access only through the named review and approval functions.

- [ ] **Step 5: Add immutable artifact guards**

Create a trigger that rejects updates/deletes to completed extraction payloads, candidate revisions, ingredient rows belonging to historical revisions, and Markdown snapshots:

```sql
create or replace function public.reject_immutable_recipe_artifact_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Recipe extraction artifacts are immutable';
end;
$$;
```

Allow only extraction-run workflow status fields to change through a dedicated function.

- [ ] **Step 6: Re-run schema tests**

Run:

```bash
npx supabase db reset
npx supabase test db supabase/tests/database/recipe_extraction_review.test.sql
```

Expected: all 12 initial tests pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations supabase/tests/database/recipe_extraction_review.test.sql
git commit -m "feat: add recipe extraction staging schema"
```

## Task 2: Define Extraction Contracts and Deterministic Markdown

**Files:**

- Create: `src/lib/recipe-imports/types.ts`
- Create: `src/lib/recipe-imports/markdown.ts`
- Create: `tests/unit/recipe-imports/markdown.test.ts`

- [ ] **Step 1: Write the failing renderer tests**

Test stable section order, normalized line endings, source provenance, and byte-identical output:

```ts
import { describe, expect, it } from "vitest";
import { renderRecipeMarkdown } from "@/lib/recipe-imports/markdown";
import type { RecipeCandidateRevision } from "@/lib/recipe-imports/types";

const candidate: RecipeCandidateRevision = {
  schemaVersion: "1.0",
  candidateId: "candidate-1",
  revisionNumber: 1,
  source: {
    importId: "import-1",
    fileName: "Static Recipes.docx",
    sourceHash: "abc123",
    locator: { paragraphStart: 3, paragraphEnd: 12 },
  },
  recipe: {
    name: "Pineapple Shrub",
    type: "prep",
    description: "",
    yield: { quantity: 4, unitText: "qt", approximate: true },
    ingredients: [
      {
        lineOrder: 1,
        originalText: "4 qts water",
        quantity: 4,
        quantityText: "4",
        unitText: "qt",
        ingredientText: "water",
        preparationNote: "",
        sourceLocator: { paragraph: 5 },
      },
    ],
    method: "Bring to a boil.",
    serviceMetadata: {},
  },
  issues: [],
};

describe("renderRecipeMarkdown", () => {
  it("renders deterministic auditable markdown", () => {
    const first = renderRecipeMarkdown(candidate, {
      extractionRunId: "run-1",
      parserVersion: "recipe-docx-1.0.0",
      rendererVersion: "recipe-md-1.0.0",
    });
    expect(first).toContain("recipe_candidate_id: candidate-1");
    expect(first).toContain("# Pineapple Shrub");
    expect(first).toContain("- 4 qt water");
    expect(
      renderRecipeMarkdown(candidate, {
        extractionRunId: "run-1",
        parserVersion: "recipe-docx-1.0.0",
        rendererVersion: "recipe-md-1.0.0",
      }),
    ).toBe(first);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- tests/unit/recipe-imports/markdown.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Define the versioned contracts**

Export explicit types for:

```ts
export type RecipeSourceLocator = {
  paragraph?: number;
  paragraphStart?: number;
  paragraphEnd?: number;
  imageIndex?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

export type ExtractedIngredient = {
  lineOrder: number;
  originalText: string;
  quantity: number | null;
  quantityText: string;
  unitText: string;
  ingredientText: string;
  preparationNote: string;
  sourceLocator: RecipeSourceLocator;
};

export type RecipeCandidateRevision = {
  schemaVersion: "1.0";
  candidateId: string;
  revisionNumber: number;
  source: {
    importId: string;
    fileName: string;
    sourceHash: string;
    locator: RecipeSourceLocator;
  };
  recipe: {
    name: string;
    type: "menu_item" | "prep" | "batch";
    description: string;
    yield: { quantity: number | null; unitText: string; approximate: boolean };
    ingredients: ExtractedIngredient[];
    method: string;
    serviceMetadata: Record<string, string>;
  };
  issues: Array<{
    code: string;
    severity: "warning" | "blocking";
    message: string;
    ingredientLineOrder?: number;
  }>;
};
```

- [ ] **Step 4: Implement deterministic Markdown rendering**

Escape YAML scalar values, sort service-metadata keys, preserve ingredient order, and always end with one newline:

```ts
export function renderRecipeMarkdown(
  revision: RecipeCandidateRevision,
  versions: RenderVersions,
): string {
  const lines = [
    "---",
    `recipe_candidate_id: ${yaml(revision.candidateId)}`,
    `candidate_revision: ${revision.revisionNumber}`,
    `source_file: ${yaml(revision.source.fileName)}`,
    `source_hash: ${yaml(revision.source.sourceHash)}`,
    `extraction_run_id: ${yaml(versions.extractionRunId)}`,
    `schema_version: ${yaml(revision.schemaVersion)}`,
    `parser_version: ${yaml(versions.parserVersion)}`,
    `renderer_version: ${yaml(versions.rendererVersion)}`,
    `proposed_recipe: ${yaml(revision.recipe.name)}`,
    `proposed_type: ${revision.recipe.type}`,
    "---",
    "",
    `# ${revision.recipe.name}`,
    "",
    "## Yield",
    "",
    formatYield(revision.recipe.yield),
    "",
    "## Ingredients",
    "",
    ...revision.recipe.ingredients.map(formatIngredient),
    "",
    "## Method",
    "",
    revision.recipe.method || "_Not extracted._",
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/unit/recipe-imports/markdown.test.ts
npm run typecheck
```

Expected: renderer tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/recipe-imports tests/unit/recipe-imports
git commit -m "feat: define recipe extraction contract"
```

## Task 3: Build DOCX Recipe Extraction

**Files:**

- Modify: `package.json`
- Create: `src/lib/recipe-imports/normalize.ts`
- Create: `src/lib/recipe-imports/docx.ts`
- Create: `tests/unit/recipe-imports/docx.test.ts`
- Create: `tests/fixtures/recipes/static-recipes-blocks.json`

- [ ] **Step 1: Add parser dependencies**

Run:

```bash
npm install fflate fast-xml-parser
```

Expected: dependencies added to `package.json` and lockfile.

- [ ] **Step 2: Write failing extraction tests**

Cover section headings, recipe boundaries, explicit/approximate yield, ingredients, and method:

```ts
it("extracts Pineapple Shrub as a prep candidate", () => {
  const candidates = extractRecipeCandidates(fixtureBlocks);
  expect(candidates[0]).toMatchObject({
    recipe: {
      name: "Pineapple Shrub",
      type: "prep",
      yield: { quantity: 4, unitText: "qt", approximate: true },
    },
  });
  expect(candidates[0].recipe.ingredients[0]).toMatchObject({
    quantity: 1,
    ingredientText: "pineapple",
    preparationNote: "skins and core",
  });
});
```

Add a second test proving a missing fixed yield creates `MISSING_YIELD` as a blocking issue rather than inventing a number.

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npm test -- tests/unit/recipe-imports/docx.test.ts
```

Expected: missing extractor modules.

- [ ] **Step 4: Implement DOCX source-block extraction**

Use `fflate.unzipSync` to read `word/document.xml`, `fast-xml-parser` with ordered-node preservation, and emit:

```ts
export type SourceBlock = {
  index: number;
  text: string;
  style: string | null;
};

export function extractDocxBlocks(bytes: Uint8Array): SourceBlock[];
```

Preserve paragraph order and join split Word runs without losing punctuation.

- [ ] **Step 5: Implement recipe boundary and ingredient parsing**

Use deterministic rules:

- Known section headings set context.
- A short line ending in `:` or a title-like paragraph followed by ingredient-shaped lines starts a recipe.
- Ingredient parsing accepts decimals, fractions, mixed quantities, ratios, `zest of N`, and `skins/core of N`.
- The first prose paragraph after ingredients starts the method.
- Section context maps cocktails to `menu_item`, syrups/infusions to `prep`, and explicit batch sections to `batch`.

Export:

```ts
export function extractRecipeCandidates(
  blocks: SourceBlock[],
  source: ExtractionSource,
): RecipeCandidateRevision[];
```

- [ ] **Step 6: Run parser tests**

Run:

```bash
npm test -- tests/unit/recipe-imports/docx.test.ts
npm run typecheck
```

Expected: tests pass without inferred yields.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/recipe-imports tests
git commit -m "feat: extract recipe candidates from docx"
```

## Task 4: Add Image Adapter and Pure Validation

**Files:**

- Create: `src/lib/recipe-imports/image.ts`
- Create: `src/lib/recipe-imports/validation.ts`
- Create: `tests/unit/recipe-imports/image.test.ts`
- Create: `tests/unit/recipe-imports/validation.test.ts`

- [ ] **Step 1: Write failing image fallback and validation tests**

```ts
it("creates a blocked manual-review candidate without an OCR provider", async () => {
  const result = await extractImageRecipe({
    bytes: new Uint8Array([1, 2, 3]),
    fileName: "Static Recipe Cards.1.jpeg",
    importId: "import-1",
    sourceHash: "hash",
  });
  expect(result.issues).toContainEqual(
    expect.objectContaining({
      code: "IMAGE_TRANSCRIPTION_REQUIRED",
      severity: "blocking",
    }),
  );
});

it("blocks unresolved ingredient and yield fields", () => {
  const issues = validateCandidateRevision(
    unresolvedCandidate,
    resolutionContext,
  );
  expect(issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining([
      "MISSING_YIELD",
      "UNKNOWN_UNIT",
      "UNRESOLVED_COMPONENT",
    ]),
  );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/unit/recipe-imports/image.test.ts tests/unit/recipe-imports/validation.test.ts
```

Expected: missing modules.

- [ ] **Step 3: Implement provider boundary**

```ts
export interface RecipeImageExtractionProvider {
  extract(input: ImageExtractionInput): Promise<RecipeCandidateRevision>;
}

export async function extractImageRecipe(
  input: ImageExtractionInput,
  provider?: RecipeImageExtractionProvider,
): Promise<RecipeCandidateRevision> {
  if (provider) return provider.extract(input);
  return createManualImageCandidate(input);
}
```

The fallback must create a menu-item candidate named from the source file, attach image provenance, and add blocking issues for transcription, yield, and ingredient resolution. This keeps JPEG sources reviewable without silently claiming OCR accuracy.

- [ ] **Step 4: Implement pure validation**

Return typed issues for invalid name/type, non-positive or missing yield, unknown yield unit, empty ingredients, non-positive ingredient quantity, unknown ingredient unit, missing conversion, unresolved component, unconfirmed duplicate group, and stale snapshot hash.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/unit/recipe-imports
npm run typecheck
```

Expected: all recipe-import unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/recipe-imports tests/unit/recipe-imports
git commit -m "feat: validate staged recipe candidates"
```

## Task 5: Persist Runs, Revisions, Issues, and Markdown Snapshots

**Files:**

- Create: `src/lib/recipe-imports/storage.ts`
- Create: `src/lib/recipe-imports/repository.ts`
- Create: `tests/unit/recipe-imports/repository.test.ts`

- [ ] **Step 1: Write failing repository orchestration tests**

Mock Supabase at the boundary and verify:

1. One run creates candidates and revision 1.
2. Ingredients retain original text and source locator.
3. Markdown is rendered from the saved revision.
4. Snapshot storage uses a non-overwriting versioned path.
5. A second extraction run does not overwrite the first.

Expected snapshot path:

```ts
`${organizationId}/${locationId}/recipe-markdown/${candidateId}/revision-${revisionNumber}-${hash}.md`;
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/unit/recipe-imports/repository.test.ts
```

Expected: missing repository.

- [ ] **Step 3: Implement hashing and immutable storage**

```ts
export async function sha256Hex(content: Uint8Array | string): Promise<string>;

export async function storeMarkdownSnapshot(input: {
  organizationId: string;
  locationId: string;
  candidateId: string;
  revisionNumber: number;
  markdown: string;
}): Promise<{ path: string; hash: string }>;
```

Upload with `upsert: false`; treat an existing identical path/hash as an idempotent success only after downloading and verifying the content hash.

- [ ] **Step 4: Implement extraction persistence**

Use the admin client in server-only code to:

- Create the run.
- Create suggested candidate groups by normalized name and type.
- Insert candidates.
- Insert immutable revision 1 and ingredient rows.
- Insert issues.
- Render and store Markdown.
- Insert snapshot row.
- Set each candidate's `current_revision_id`.
- Mark the run `needs_review`.

- [ ] **Step 5: Implement ranked match suggestions**

Query active inventory items, aliases, and recipes in the organization. Rank exact normalized aliases first, then exact recipe names, then token similarity constrained by compatible unit type. Persist suggestions without setting confirmed component IDs.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- tests/unit/recipe-imports/repository.test.ts
npm run typecheck
```

Expected: persistence orchestration tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/recipe-imports tests/unit/recipe-imports
git commit -m "feat: persist recipe extraction artifacts"
```

## Task 6: Wire Recipe Uploads to Extraction

**Files:**

- Create: `src/app/api/recipe-imports/[id]/extract/route.ts`
- Modify: `src/app/api/upload/route.ts`
- Modify: `src/lib/imports/index.ts`
- Modify: `src/components/imports/upload-form.tsx`
- Create: `tests/unit/recipe-imports/extract-route.test.ts`

- [ ] **Step 1: Write failing route tests**

Test manager authorization, DOCX extraction, JPEG fallback, unsupported MIME rejection, and retry creating a new run:

```ts
it("extracts a registered DOCX import", async () => {
  const response = await POST(makeRequest("import-1"));
  expect(response.status).toBe(202);
  await expect(response.json()).resolves.toMatchObject({
    status: "needs_review",
    candidateCount: expect.any(Number),
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/unit/recipe-imports/extract-route.test.ts
```

Expected: route missing.

- [ ] **Step 3: Split recipe source types**

Add:

```ts
RECIPE_DOCX: "recipe_docx",
RECIPE_CARD: "recipe_card",
```

Keep the legacy `recipe` label readable for previously registered imports, but route new uploads through the explicit types.

- [ ] **Step 4: Implement extraction route**

The route must:

- Require manager context.
- Load the tenant-scoped source import.
- Download the private source file.
- Verify its SHA-256 hash against `source_imports.file_hash`.
- Dispatch to DOCX or image extraction.
- Persist artifacts and return candidate IDs.
- Mark failures with stable error code/message.

- [ ] **Step 5: Modify upload routing**

In `src/app/api/upload/route.ts`, replace the recipe fallback to `extract-invoice` with a call to the new extraction route/orchestrator. Preserve existing PLCB, Toast, and invoice behavior exactly.

- [ ] **Step 6: Redirect completed recipe uploads**

Extend `UploadForm` with optional `reviewHref` generation so recipe uploads link to `/recipe-imports?sourceImport=<id>`, while other imports still link to `/imports/<id>`.

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- tests/unit/recipe-imports/extract-route.test.ts
npm run typecheck
```

Expected: route tests and typecheck pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/api src/lib/imports src/components/imports tests/unit/recipe-imports
git commit -m "feat: route recipe uploads to extraction"
```

## Task 7: Build Review Queue and Source-and-Form UI

**Files:**

- Create: `src/app/(manager)/recipe-imports/page.tsx`
- Create: `src/app/(manager)/recipe-imports/[candidateId]/page.tsx`
- Create: `src/components/recipe-imports/source-panel.tsx`
- Create: `src/components/recipe-imports/review-form.tsx`
- Create: `src/components/recipe-imports/ingredient-row.tsx`
- Create: `src/components/recipe-imports/issue-list.tsx`
- Create: `src/components/recipe-imports/version-comparison.tsx`
- Modify: `src/lib/navigation.ts`
- Modify: `src/lib/auth/route-access.ts`
- Create: `tests/unit/recipe-imports/review-form.test.tsx`

- [ ] **Step 1: Write failing component tests**

Test source evidence, issue visibility, suggested matches, create-item option, and disabled approval:

```tsx
render(<ReviewForm candidate={blockedCandidate} setup={setup} />);
expect(screen.getByText("4 qts water")).toBeVisible();
expect(screen.getByText("Unknown unit")).toBeVisible();
expect(screen.getByRole("button", { name: "Approve recipe" })).toBeDisabled();
expect(
  screen.getByRole("option", { name: /Create new inventory item/i }),
).toBeInTheDocument();
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/unit/recipe-imports/review-form.test.tsx
```

Expected: components missing.

- [ ] **Step 3: Build manager queue**

Show candidate name, source, type, group/version count, blocking issue count, confidence, and status. Filters: needs review, blocked, ready, approved, rejected.

- [ ] **Step 4: Build source panel**

For DOCX, display preserved original candidate text and paragraph range. For JPEG, render a signed private-storage URL with source hash and extraction metadata.

- [ ] **Step 5: Build editable review form**

Use one form for recipe identity/yield/method and repeatable ingredient rows. Each ingredient row includes original text, parsed fields, suggestion selector, nested recipe selector, and create-item disclosure fields.

- [ ] **Step 6: Build semantic version comparison**

Compare candidates within a confirmed/suggested group by yield, ingredient identity, quantity/unit, method, and service metadata. Mark additions, removals, and changes without deciding which version is current.

- [ ] **Step 7: Add navigation and route protection**

Add a manager link labeled `Recipe Imports` and include `/recipe-imports` in manager route prefixes.

- [ ] **Step 8: Run tests**

Run:

```bash
npm test -- tests/unit/recipe-imports/review-form.test.tsx
npm run typecheck
npm run lint
```

Expected: component tests, typecheck, and lint pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/'(manager)'/recipe-imports src/components/recipe-imports src/lib/navigation.ts src/lib/auth/route-access.ts tests
git commit -m "feat: add recipe extraction review UI"
```

## Task 8: Save Immutable Revisions and Resolve Ingredients

**Files:**

- Create: `src/app/(manager)/recipe-imports/actions.ts`
- Modify: `src/lib/recipe-imports/repository.ts`
- Modify: `src/components/recipe-imports/review-form.tsx`
- Create: `tests/unit/recipe-imports/actions.test.ts`

- [ ] **Step 1: Write failing action tests**

Cover optimistic concurrency, new immutable revision creation, Markdown snapshot creation, existing-item confirmation, nested-recipe confirmation, and inline new inventory item creation.

```ts
await expect(
  saveCandidateRevisionAction({
    candidateId: "candidate-1",
    expectedRevision: 1,
    recipe: editedRecipe,
  }),
).resolves.toMatchObject({ revisionNumber: 2 });
```

Add a stale-revision test expecting `"Candidate changed; reload before saving."`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/unit/recipe-imports/actions.test.ts
```

Expected: actions missing.

- [ ] **Step 3: Implement revision save**

The action must:

- Require manager context.
- Compare `expectedRevision` to current revision.
- Validate typed input.
- Insert a complete new revision and ingredient set.
- Recompute suggestions/issues.
- Render and store a new Markdown snapshot.
- Advance `current_revision_id`.
- Revalidate queue and detail paths.

- [ ] **Step 4: Implement inline inventory item creation**

Require name, category, base unit, count unit, and purchased/produced flags. Insert an alias using the extracted ingredient phrase when requested, then resolve the ingredient in the new candidate revision.

- [ ] **Step 5: Implement grouping actions**

Add confirm group, move candidate, split candidate to new group, reject, and supersede actions. Every action records actor and timestamp; no action deletes artifacts.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- tests/unit/recipe-imports/actions.test.ts
npm run typecheck
```

Expected: actions pass and stale writes are rejected.

- [ ] **Step 7: Commit**

```bash
git add src/app/'(manager)'/recipe-imports src/lib/recipe-imports src/components/recipe-imports tests
git commit -m "feat: save reviewed recipe revisions"
```

## Task 9: Add Blocking Validation and Atomic Approval RPC

**Files:**

- Modify: `supabase/migrations/20260620120000_recipe_extraction_review.sql`
- Modify: `supabase/tests/database/recipe_extraction_review.test.sql`
- Modify: `src/app/(manager)/recipe-imports/actions.ts`
- Modify: `src/components/recipe-imports/review-form.tsx`

- [ ] **Step 1: Add failing database validation tests**

Insert fixtures for:

- Missing yield
- Unknown unit
- Unresolved component
- Unconfirmed group
- Valid new recipe
- Valid version of existing recipe

Assert:

```sql
select throws_ok(
  $$ select public.approve_recipe_candidate(
    'candidate-with-unresolved-component',
    'revision-id'
  ) $$,
  'P0001',
  'Recipe candidate has blocking issues',
  'approval rejects unresolved components'
);
```

- [ ] **Step 2: Add failing idempotency and rollback tests**

Call approval twice and assert one canonical version. Create an invalid component conflict and assert no recipe/version/source-link rows remain after failure.

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npx supabase test db supabase/tests/database/recipe_extraction_review.test.sql
```

Expected: approval functions missing or incomplete.

- [ ] **Step 4: Implement `validate_recipe_candidate`**

Return rows shaped as:

```sql
returns table (
  issue_code text,
  severity public.recipe_issue_severity,
  message text,
  ingredient_id uuid
)
```

Validate current revision, positive quantities, recognized units, conversion compatibility, exactly one component target, confirmed group, current Markdown snapshot, and stored hash metadata.

- [ ] **Step 5: Implement `approve_recipe_candidate`**

Create `private.approve_recipe_candidate_internal` as `security definer` with `set search_path = ''`, following Supabase's private-schema recommendation for privileged helpers. Create `public.approve_recipe_candidate` as a `security invoker` SQL wrapper that performs the manager check and calls the private function. Grant `usage` on schema `private` and execute only on the named internal function to `authenticated`; revoke all other private-schema privileges. Lock candidate/group rows, revalidate, create or reuse the canonical recipe, allocate the version number under lock, insert all components/source links, and mark the candidate approved.

Return:

```sql
returns table (recipe_id uuid, recipe_version_id uuid, already_approved boolean)
```

- [ ] **Step 6: Wire the approval action**

Call the RPC with candidate ID and current revision ID. On success, revalidate recipe/import paths and redirect to `/recipes/<recipe-id>`.

- [ ] **Step 7: Run database and unit tests**

Run:

```bash
npx supabase db reset
npx supabase test db supabase/tests/database/recipe_extraction_review.test.sql
npm test -- tests/unit/recipe-imports
```

Expected: approval, rollback, idempotency, and unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add supabase src/app/'(manager)'/recipe-imports src/components/recipe-imports
git commit -m "feat: approve staged recipes atomically"
```

## Task 10: Verify the Full Workflow With Supplied Sources

**Files:**

- Create: `scripts/recipe-import-smoke.mjs`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-20-recipe-extraction-review-pipeline.md`

- [ ] **Step 1: Create a local smoke script**

The script accepts source paths without committing source files:

```bash
node scripts/recipe-import-smoke.mjs \
  "../../Static Recipes.docx" \
  "../../Static Menu 2.0 Recipes.docx" \
  "../../Static Recipe Cards/Static Recipe Cards.1.jpeg"
```

It must print candidate count, blocking issue count, duplicate-group suggestions, Markdown hash, and artifact path for each source.

- [ ] **Step 2: Run the representative extraction set**

Expected checks:

- Pineapple Shrub is extracted with approximate 4-quart yield.
- A ratio-only syrup is blocked for missing fixed yield.
- The JPEG creates a reviewable blocked candidate when no image provider is configured.
- Banana Oleo or Cardamom Syrup candidates from both Word documents are grouped as proposed versions.
- A nested prep phrase is suggested as a recipe only when a matching canonical prep recipe exists.

- [ ] **Step 3: Run complete verification**

Run:

```bash
npm run format
npm run typecheck
npm run lint
npm test
npm run build
npx supabase db lint --local --fail-on warning
npx supabase test db
```

Expected: all commands pass.

- [ ] **Step 4: Run Supabase advisors**

Use the connected Supabase project when available:

```text
Security advisor: no new exposed-table/RLS/function warnings.
Performance advisor: no missing indexes on recipe extraction foreign keys or queue filters.
```

If only local Supabase is available, document that hosted advisors remain an environment verification step.

- [ ] **Step 5: Update README**

Document:

- Uploading recipe DOCX and JPEG sources.
- Reviewing candidates and source evidence.
- Resolving ingredients or creating inventory items.
- Why approval and activation are separate.
- Running the local smoke script.

- [ ] **Step 6: Commit**

```bash
git add scripts/recipe-import-smoke.mjs README.md docs/superpowers/plans/2026-06-20-recipe-extraction-review-pipeline.md
git commit -m "docs: verify recipe extraction workflow"
```

## Final Acceptance Checklist

- [ ] Source files remain private and hash-verified.
- [ ] DOCX extraction emits structured candidates without inventing missing data.
- [ ] JPEG sources enter the same review workflow and remain blocked without transcription.
- [ ] Every candidate revision has one immutable Markdown snapshot.
- [ ] Duplicate sources are suggested as recipe versions, never silently merged.
- [ ] Existing inventory items and nested recipes are suggested but not auto-confirmed.
- [ ] Managers can create inventory items during review.
- [ ] Approval remains disabled while any blocking issue exists.
- [ ] Database approval revalidates independently of the UI.
- [ ] Approval creates one canonical draft version and complete provenance atomically.
- [ ] Activation remains a separate existing workflow.
- [ ] RLS and storage paths preserve organization isolation.
- [ ] Retrying extraction preserves earlier runs and snapshots.
- [ ] Unit, database, lint, typecheck, build, and smoke verification pass.
