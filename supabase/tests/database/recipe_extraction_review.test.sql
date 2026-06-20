begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

select has_table(
  'public',
  'recipe_extraction_runs',
  'recipe extraction runs table exists'
);
select has_table(
  'public',
  'recipe_candidate_groups',
  'recipe candidate groups table exists'
);
select has_table(
  'public',
  'recipe_candidates',
  'recipe candidates table exists'
);
select has_table(
  'public',
  'recipe_candidate_revisions',
  'recipe candidate revisions table exists'
);
select has_table(
  'public',
  'recipe_candidate_ingredients',
  'recipe candidate ingredients table exists'
);
select has_table(
  'public',
  'recipe_candidate_match_suggestions',
  'recipe candidate match suggestions table exists'
);
select has_table(
  'public',
  'recipe_candidate_issues',
  'recipe candidate issues table exists'
);
select has_table(
  'public',
  'recipe_markdown_snapshots',
  'recipe markdown snapshots table exists'
);
select has_table(
  'public',
  'recipe_source_links',
  'recipe source links table exists'
);
select has_function(
  'public',
  'validate_recipe_candidate',
  array['uuid'],
  'recipe candidate validation function exists'
);
select has_function(
  'public',
  'approve_recipe_candidate',
  array['uuid', 'uuid'],
  'recipe candidate approval function exists'
);
select col_is_unique(
  'public',
  'recipe_candidate_revisions',
  array['recipe_candidate_id', 'revision_number'],
  'candidate revision numbers are unique per candidate'
);

select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'recipe_extraction_runs',
        'recipe_candidate_groups',
        'recipe_candidates',
        'recipe_candidate_revisions',
        'recipe_candidate_ingredients',
        'recipe_candidate_match_suggestions',
        'recipe_candidate_issues',
        'recipe_markdown_snapshots',
        'recipe_source_links'
      )
      and relation.relrowsecurity
  ),
  9,
  'RLS is enabled on every recipe extraction table'
);

select ok(
  (
    select constraint_definition.condeferrable
      and constraint_definition.condeferred
    from pg_constraint constraint_definition
    where constraint_definition.conrelid = 'public.recipe_candidates'::regclass
      and constraint_definition.conname =
        'recipe_candidates_current_revision_id_fkey'
  ),
  'current revision foreign key is initially deferred'
);

select is(
  (
    select count(*)::integer
    from pg_constraint constraint_definition
    join pg_class relation
      on relation.oid = constraint_definition.conrelid
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    cross join lateral unnest(constraint_definition.conkey) as key_column(attnum)
    where constraint_definition.contype = 'f'
      and namespace.nspname = 'public'
      and relation.relname in (
        'recipe_extraction_runs',
        'recipe_candidate_groups',
        'recipe_candidates',
        'recipe_candidate_revisions',
        'recipe_candidate_ingredients',
        'recipe_candidate_match_suggestions',
        'recipe_candidate_issues',
        'recipe_markdown_snapshots',
        'recipe_source_links'
      )
      and not exists (
        select 1
        from pg_index index_definition
        where index_definition.indrelid = constraint_definition.conrelid
          and key_column.attnum = any(index_definition.indkey)
      )
  ),
  0,
  'every recipe extraction foreign key column is indexed'
);

select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.recipe_extraction_status'::regtype
  ),
  'queued,extracting,extracted,needs_review,approved,failed,superseded',
  'recipe extraction statuses are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.recipe_candidate_group_status'::regtype
  ),
  'suggested,confirmed,split,approved',
  'recipe candidate group statuses are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.recipe_candidate_status'::regtype
  ),
  'unreviewed,in_review,blocked,ready,approved,rejected,superseded',
  'recipe candidate statuses are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid =
      'public.recipe_ingredient_resolution_status'::regtype
  ),
  'unresolved,suggested,confirmed,create_item,blocked',
  'recipe ingredient resolution statuses are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.recipe_issue_severity'::regtype
  ),
  'warning,blocking',
  'recipe issue severities are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.recipe_issue_status'::regtype
  ),
  'open,resolved,accepted',
  'recipe issue statuses are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.recipe_source_format'::regtype
  ),
  'docx,jpeg',
  'recipe source formats are defined'
);

insert into auth.users (id, email)
values (
  '00000000-0000-0000-0000-000000000901',
  'recipe-review-other-manager@example.com'
);

insert into public.organizations (id, name, slug)
values (
  '90000000-0000-0000-0000-000000000001',
  'Recipe Review Other Organization',
  'recipe-review-other-organization'
);

insert into public.locations (id, organization_id, name, slug)
values (
  '90000000-0000-0000-0000-000000000011',
  '90000000-0000-0000-0000-000000000001',
  'Recipe Review Other Location',
  'recipe-review-other-location'
);

insert into public.organization_memberships (
  organization_id,
  profile_id,
  role_id
)
select
  '90000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000901',
  role.id
from public.roles role
where role.slug = 'manager';

insert into public.source_imports (
  id,
  organization_id,
  location_id,
  source_type,
  file_hash,
  file_path,
  file_name
)
values
  (
    '80000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    'recipe_docx',
    'recipe-review-own-source',
    'recipe-review/own.docx',
    'own.docx'
  ),
  (
    '90000000-0000-0000-0000-000000000101',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000011',
    'recipe_docx',
    'recipe-review-other-source',
    'recipe-review/other.docx',
    'other.docx'
  );

insert into public.recipe_extraction_runs (
  id,
  organization_id,
  location_id,
  source_import_id,
  status,
  source_format,
  parser_version,
  schema_version,
  renderer_version,
  structured_payload,
  structured_payload_hash,
  started_at,
  completed_at,
  created_by
)
values
  (
    '80000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    '80000000-0000-0000-0000-000000000001',
    'extracted',
    'docx',
    'parser-v1',
    'schema-v1',
    'renderer-v1',
    '{"candidate_count":1}',
    'own-payload-hash',
    now(),
    now(),
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '90000000-0000-0000-0000-000000000111',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000011',
    '90000000-0000-0000-0000-000000000101',
    'extracted',
    'docx',
    'parser-v1',
    'schema-v1',
    'renderer-v1',
    '{"candidate_count":1}',
    'other-payload-hash',
    now(),
    now(),
    '00000000-0000-0000-0000-000000000901'
  );

insert into public.recipe_candidate_groups (
  id,
  organization_id,
  normalized_name,
  status,
  created_by
)
values (
  '80000000-0000-0000-0000-000000000021',
  '10000000-0000-0000-0000-000000000001',
  'review candidate',
  'suggested',
  '00000000-0000-0000-0000-000000000001'
);

insert into public.recipe_candidates (
  id,
  organization_id,
  extraction_run_id,
  candidate_index,
  proposed_name,
  normalized_name,
  proposed_recipe_type,
  proposed_recipe_group_id,
  confidence,
  status,
  source_locator,
  original_text
)
values
  (
    '80000000-0000-0000-0000-000000000031',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000011',
    0,
    'Review Candidate',
    'review candidate',
    'menu_item',
    '80000000-0000-0000-0000-000000000021',
    0.9,
    'unreviewed',
    '{"paragraph":1}',
    'Review Candidate source text'
  ),
  (
    '90000000-0000-0000-0000-000000000131',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000111',
    0,
    'Other Candidate',
    'other candidate',
    'menu_item',
    null,
    0.8,
    'unreviewed',
    '{"paragraph":1}',
    'Other Candidate source text'
  );

insert into public.recipe_candidate_revisions (
  id,
  recipe_candidate_id,
  revision_number,
  name,
  recipe_type,
  description,
  yield_quantity,
  yield_unit_text,
  method,
  service_metadata,
  revision_payload,
  validation_status,
  created_by
)
values (
  '80000000-0000-0000-0000-000000000041',
  '80000000-0000-0000-0000-000000000031',
  1,
  'Review Candidate',
  'menu_item',
  'Candidate revision',
  1,
  'each',
  'Build and serve.',
  '{}',
  '{"revision":1}',
  'pending',
  '00000000-0000-0000-0000-000000000001'
);

update public.recipe_candidates
set current_revision_id = '80000000-0000-0000-0000-000000000041'
where id = '80000000-0000-0000-0000-000000000031';

insert into public.recipe_candidate_ingredients (
  id,
  candidate_revision_id,
  line_order,
  original_text,
  quantity,
  quantity_text,
  unit_text,
  ingredient_text,
  resolution_status,
  source_locator
)
values (
  '80000000-0000-0000-0000-000000000051',
  '80000000-0000-0000-0000-000000000041',
  1,
  '2 oz bourbon',
  2,
  '2',
  'oz',
  'bourbon',
  'unresolved',
  '{"paragraph":2}'
);

insert into public.recipe_candidate_match_suggestions (
  id,
  candidate_ingredient_id,
  suggested_match_type,
  suggested_match_id,
  score,
  reason_codes,
  rank
)
values (
  '80000000-0000-0000-0000-000000000061',
  '80000000-0000-0000-0000-000000000051',
  'inventory_item',
  '10000000-0000-0000-0000-000000000201',
  0.75,
  '["normalized_name"]',
  1
);

insert into public.recipe_candidate_issues (
  id,
  recipe_candidate_id,
  candidate_revision_id,
  candidate_ingredient_id,
  issue_code,
  severity,
  message,
  status
)
values (
  '80000000-0000-0000-0000-000000000071',
  '80000000-0000-0000-0000-000000000031',
  '80000000-0000-0000-0000-000000000041',
  '80000000-0000-0000-0000-000000000051',
  'UNRESOLVED_INGREDIENT',
  'blocking',
  'Ingredient requires resolution.',
  'open'
);

insert into public.recipe_markdown_snapshots (
  id,
  organization_id,
  recipe_candidate_id,
  candidate_revision_id,
  extraction_run_id,
  storage_path,
  content_hash,
  renderer_version
)
values (
  '80000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000031',
  '80000000-0000-0000-0000-000000000041',
  '80000000-0000-0000-0000-000000000011',
  'recipe-review/80000000-0000-0000-0000-000000000041.md',
  'markdown-content-hash',
  'renderer-v1'
);

select is(
  (
    select count(*)::integer
    from public.validate_recipe_candidate(
      '80000000-0000-0000-0000-000000000031'
    )
  ),
  0,
  'placeholder validation returns a typed empty issue set'
);

select throws_ok(
  $$
    select *
    from public.approve_recipe_candidate(
      '80000000-0000-0000-0000-000000000031',
      '80000000-0000-0000-0000-000000000041'
    )
  $$,
  'P0001',
  'Recipe candidate approval is not implemented',
  'placeholder approval raises the expected error'
);

select lives_ok(
  $$
    update public.recipe_extraction_runs
    set status = 'needs_review'
    where id = '80000000-0000-0000-0000-000000000011'
  $$,
  'completed extraction workflow status can be updated'
);
select lives_ok(
  $$
    update public.recipe_candidate_groups
    set status = 'confirmed'
    where id = '80000000-0000-0000-0000-000000000021'
  $$,
  'candidate group workflow status can be updated'
);
select lives_ok(
  $$
    update public.recipe_candidates
    set status = 'in_review'
    where id = '80000000-0000-0000-0000-000000000031'
  $$,
  'candidate workflow status can be updated'
);
select lives_ok(
  $$
    update public.recipe_candidate_issues
    set
      status = 'accepted',
      resolved_by = '00000000-0000-0000-0000-000000000001',
      resolved_at = now(),
      resolution_note = 'Accepted during review.'
    where id = '80000000-0000-0000-0000-000000000071'
  $$,
  'candidate issue workflow fields can be updated'
);

select throws_ok(
  $$
    update public.recipe_extraction_runs
    set structured_payload = '{"candidate_count":2}'
    where id = '80000000-0000-0000-0000-000000000011'
  $$,
  'P0001',
  'Completed recipe extraction artifacts are immutable',
  'completed extraction payload cannot be updated'
);
select throws_ok(
  $$
    delete from public.recipe_extraction_runs
    where id = '80000000-0000-0000-0000-000000000011'
  $$,
  'P0001',
  'Completed recipe extraction artifacts are immutable',
  'completed extraction run cannot be deleted'
);
select throws_ok(
  $$
    update public.recipe_candidate_revisions
    set description = 'Changed'
    where id = '80000000-0000-0000-0000-000000000041'
  $$,
  'P0001',
  'Recipe candidate revisions are immutable',
  'candidate revision cannot be updated'
);
select throws_ok(
  $$
    delete from public.recipe_candidate_revisions
    where id = '80000000-0000-0000-0000-000000000041'
  $$,
  'P0001',
  'Recipe candidate revisions are immutable',
  'candidate revision cannot be deleted'
);
select throws_ok(
  $$
    update public.recipe_candidate_ingredients
    set ingredient_text = 'rye'
    where id = '80000000-0000-0000-0000-000000000051'
  $$,
  'P0001',
  'Recipe candidate ingredients are immutable',
  'candidate ingredient cannot be updated'
);
select throws_ok(
  $$
    delete from public.recipe_candidate_match_suggestions
    where id = '80000000-0000-0000-0000-000000000061'
  $$,
  'P0001',
  'Recipe candidate match suggestions are immutable',
  'candidate match suggestion cannot be deleted'
);
select throws_ok(
  $$
    update public.recipe_markdown_snapshots
    set content_hash = 'changed'
    where id = '80000000-0000-0000-0000-000000000081'
  $$,
  'P0001',
  'Recipe Markdown snapshots are immutable',
  'Markdown snapshot cannot be updated'
);

select throws_ok(
  $$
    insert into public.recipe_candidate_revisions (
      recipe_candidate_id,
      revision_number,
      name,
      recipe_type,
      created_by
    )
    values (
      '80000000-0000-0000-0000-000000000031',
      1,
      'Duplicate revision',
      'menu_item',
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  '23505',
  null,
  'duplicate candidate revision number is rejected'
);
select throws_ok(
  $$
    insert into public.recipe_candidate_ingredients (
      candidate_revision_id,
      line_order,
      original_text,
      ingredient_text
    )
    values (
      '80000000-0000-0000-0000-000000000041',
      1,
      'duplicate line',
      'duplicate line'
    )
  $$,
  '23505',
  null,
  'duplicate ingredient line order is rejected'
);
select throws_ok(
  $$
    insert into public.recipe_candidates (
      organization_id,
      extraction_run_id,
      candidate_index,
      proposed_name,
      normalized_name,
      proposed_recipe_type,
      confidence
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000011',
      2,
      'Invalid confidence',
      'invalid confidence',
      'menu_item',
      1.1
    )
  $$,
  '23514',
  null,
  'candidate confidence outside zero to one is rejected'
);
select throws_ok(
  $$
    insert into public.recipe_candidate_ingredients (
      candidate_revision_id,
      line_order,
      original_text,
      ingredient_text,
      component_kind,
      component_inventory_item_id,
      component_recipe_id,
      resolution_status
    )
    values (
      '80000000-0000-0000-0000-000000000041',
      2,
      'conflicting targets',
      'conflicting targets',
      'inventory_item',
      '10000000-0000-0000-0000-000000000201',
      '10000000-0000-0000-0000-000000000501',
      'confirmed'
    )
  $$,
  '23514',
  null,
  'ingredient cannot target both an inventory item and a recipe'
);
select throws_ok(
  $$
    insert into public.recipe_candidate_match_suggestions (
      candidate_ingredient_id,
      suggested_match_type,
      suggested_match_id,
      score,
      rank
    )
    values (
      '80000000-0000-0000-0000-000000000051',
      'inventory_item',
      '10000000-0000-0000-0000-000000000201',
      0.5,
      0
    )
  $$,
  '23514',
  null,
  'match suggestion rank must be positive'
);
select throws_ok(
  $$
    insert into public.recipe_markdown_snapshots (
      organization_id,
      recipe_candidate_id,
      candidate_revision_id,
      extraction_run_id,
      storage_path,
      content_hash,
      renderer_version
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000031',
      '80000000-0000-0000-0000-000000000041',
      '80000000-0000-0000-0000-000000000011',
      'recipe-review/duplicate.md',
      'duplicate-content-hash',
      'renderer-v1'
    )
  $$,
  '23505',
  null,
  'candidate revision has only one Markdown snapshot'
);

insert into public.recipe_source_links (
  organization_id,
  recipe_id,
  recipe_version_id,
  recipe_candidate_id,
  candidate_revision_id,
  source_import_id,
  extraction_run_id,
  markdown_snapshot_id,
  approved_by,
  approved_at
)
values (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000502',
  '10000000-0000-0000-0000-000000000512',
  '80000000-0000-0000-0000-000000000031',
  '80000000-0000-0000-0000-000000000041',
  '80000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000011',
  '80000000-0000-0000-0000-000000000081',
  '00000000-0000-0000-0000-000000000001',
  now()
);

select throws_ok(
  $$
    insert into public.recipe_source_links (
      organization_id,
      recipe_id,
      recipe_version_id,
      recipe_candidate_id,
      candidate_revision_id,
      source_import_id,
      extraction_run_id,
      markdown_snapshot_id,
      approved_by,
      approved_at
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000502',
      '10000000-0000-0000-0000-000000000512',
      '80000000-0000-0000-0000-000000000031',
      '80000000-0000-0000-0000-000000000041',
      '80000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000011',
      '80000000-0000-0000-0000-000000000081',
      '00000000-0000-0000-0000-000000000001',
      now()
    )
  $$,
  '23505',
  null,
  'candidate revision has only one source link'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.validate_recipe_candidate(uuid)',
    'execute'
  ),
  'authenticated can execute candidate validation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.approve_recipe_candidate(uuid,uuid)',
    'execute'
  ),
  'authenticated can execute candidate approval'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.validate_recipe_candidate(uuid)',
    'execute'
  ),
  'anon cannot execute candidate validation'
);
select ok(
  has_table_privilege(
    'authenticated',
    'public.recipe_candidates',
    'select'
  ),
  'authenticated has explicit candidate select access'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.recipe_candidates',
    'insert'
  ),
  'authenticated has no direct candidate insert access'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.recipe_candidates',
    'select'
  ),
  'anon has no candidate table access'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select results_eq(
  $$
    select id
    from public.recipe_candidates
    order by id
  $$,
  array['80000000-0000-0000-0000-000000000031'::uuid],
  'manager reads candidates in their organization'
);
select is(
  (
    select count(*)::integer
    from public.recipe_candidates
    where id = '90000000-0000-0000-0000-000000000131'
  ),
  0,
  'manager cannot read another organization candidate'
);
select throws_ok(
  $$
    insert into public.recipe_candidates (
      organization_id,
      extraction_run_id,
      candidate_index,
      proposed_name,
      normalized_name,
      proposed_recipe_type
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000011',
      3,
      'Direct insert',
      'direct insert',
      'menu_item'
    )
  $$,
  '42501',
  null,
  'authenticated direct candidate insert is rejected'
);

select * from finish();
rollback;
