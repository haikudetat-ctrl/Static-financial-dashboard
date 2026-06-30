-- Recipe extraction staging, review, and provenance

create type public.recipe_extraction_status as enum (
  'queued',
  'extracting',
  'extracted',
  'needs_review',
  'approved',
  'failed',
  'superseded'
);

create type public.recipe_candidate_group_status as enum (
  'suggested',
  'confirmed',
  'split',
  'approved'
);

create type public.recipe_candidate_status as enum (
  'unreviewed',
  'in_review',
  'blocked',
  'ready',
  'approved',
  'rejected',
  'superseded'
);

create type public.recipe_ingredient_resolution_status as enum (
  'unresolved',
  'suggested',
  'confirmed',
  'create_item',
  'blocked'
);

create type public.recipe_issue_severity as enum (
  'warning',
  'blocking'
);

create type public.recipe_issue_status as enum (
  'open',
  'resolved',
  'accepted'
);

create type public.recipe_source_format as enum (
  'docx',
  'jpeg'
);

create table public.recipe_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  location_id uuid not null
    references public.locations(id) on delete cascade,
  source_import_id uuid not null
    references public.source_imports(id) on delete cascade,
  status public.recipe_extraction_status not null default 'queued',
  source_format public.recipe_source_format not null,
  parser_version text not null,
  schema_version text not null,
  renderer_version text not null,
  structured_payload jsonb not null default '{}'::jsonb,
  structured_payload_hash text not null default '',
  started_at timestamptz,
  completed_at timestamptz,
  error_code text not null default '',
  error_message text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create table public.recipe_candidate_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  normalized_name text not null,
  canonical_recipe_id uuid references public.recipes(id) on delete set null,
  status public.recipe_candidate_group_status not null default 'suggested',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(normalized_name) <> '')
);

create table public.recipe_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  extraction_run_id uuid not null
    references public.recipe_extraction_runs(id) on delete cascade,
  candidate_index integer not null check (candidate_index >= 0),
  proposed_name text not null,
  normalized_name text not null,
  proposed_recipe_type public.recipe_type not null,
  proposed_recipe_group_id uuid
    references public.recipe_candidate_groups(id) on delete set null,
  confidence numeric(5, 4) not null default 0
    check (confidence between 0 and 1),
  status public.recipe_candidate_status not null default 'unreviewed',
  source_locator jsonb not null default '{}'::jsonb,
  original_text text not null default '',
  current_revision_id uuid,
  approved_recipe_version_id uuid references public.recipe_versions(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (extraction_run_id, candidate_index),
  check (btrim(proposed_name) <> ''),
  check (btrim(normalized_name) <> '')
);

create table public.recipe_candidate_revisions (
  id uuid primary key default gen_random_uuid(),
  recipe_candidate_id uuid not null
    references public.recipe_candidates(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  name text not null,
  recipe_type public.recipe_type not null,
  description text not null default '',
  yield_quantity numeric(20, 6),
  yield_unit_id uuid references public.units(id),
  yield_unit_text text not null default '',
  yield_is_approximate boolean not null default false,
  method text not null default '',
  service_metadata jsonb not null default '{}'::jsonb,
  revision_payload jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (recipe_candidate_id, revision_number),
  check (btrim(name) <> ''),
  check (yield_quantity is null or yield_quantity > 0)
);

alter table public.recipe_candidates
add constraint recipe_candidates_current_revision_id_fkey
foreign key (current_revision_id)
references public.recipe_candidate_revisions(id)
deferrable initially deferred;

create table public.recipe_candidate_ingredients (
  id uuid primary key default gen_random_uuid(),
  candidate_revision_id uuid not null
    references public.recipe_candidate_revisions(id) on delete cascade,
  line_order integer not null check (line_order > 0),
  original_text text not null,
  quantity numeric(20, 6),
  quantity_text text not null default '',
  unit_id uuid references public.units(id),
  unit_text text not null default '',
  ingredient_text text not null,
  preparation_note text not null default '',
  component_kind text
    check (component_kind in ('inventory_item', 'recipe')),
  component_inventory_item_id uuid references public.inventory_items(id),
  component_recipe_id uuid references public.recipes(id),
  match_confidence numeric(5, 4)
    check (match_confidence between 0 and 1),
  resolution_status public.recipe_ingredient_resolution_status
    not null default 'unresolved',
  source_locator jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (candidate_revision_id, line_order),
  check (quantity is null or quantity > 0),
  check (
    (component_inventory_item_id is not null)::integer
    + (component_recipe_id is not null)::integer <= 1
  ),
  check (
    (
      component_kind is null
      and component_inventory_item_id is null
      and component_recipe_id is null
    )
    or (
      component_kind = 'inventory_item'
      and component_inventory_item_id is not null
      and component_recipe_id is null
    )
    or (
      component_kind = 'recipe'
      and component_recipe_id is not null
      and component_inventory_item_id is null
    )
  ),
  check (
    resolution_status <> 'confirmed'
    or component_kind is not null
  )
);

create table public.recipe_candidate_match_suggestions (
  id uuid primary key default gen_random_uuid(),
  candidate_ingredient_id uuid not null
    references public.recipe_candidate_ingredients(id) on delete cascade,
  suggested_match_type text not null
    check (suggested_match_type in ('inventory_item', 'recipe')),
  suggested_match_id uuid not null,
  score numeric(5, 4) not null check (score between 0 and 1),
  reason_codes jsonb not null default '[]'::jsonb,
  rank integer not null check (rank > 0),
  created_at timestamptz not null default now(),
  unique (candidate_ingredient_id, rank)
);

create table public.recipe_candidate_issues (
  id uuid primary key default gen_random_uuid(),
  recipe_candidate_id uuid not null
    references public.recipe_candidates(id) on delete cascade,
  candidate_revision_id uuid
    references public.recipe_candidate_revisions(id) on delete cascade,
  candidate_ingredient_id uuid
    references public.recipe_candidate_ingredients(id) on delete cascade,
  issue_code text not null,
  severity public.recipe_issue_severity not null,
  message text not null,
  source_locator jsonb not null default '{}'::jsonb,
  status public.recipe_issue_status not null default 'open',
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  resolution_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(issue_code) <> ''),
  check (btrim(message) <> '')
);

create table public.recipe_markdown_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  recipe_candidate_id uuid not null
    references public.recipe_candidates(id) on delete cascade,
  candidate_revision_id uuid not null unique
    references public.recipe_candidate_revisions(id) on delete cascade,
  extraction_run_id uuid not null
    references public.recipe_extraction_runs(id) on delete cascade,
  storage_path text not null unique,
  content_hash text not null,
  renderer_version text not null,
  created_at timestamptz not null default now(),
  check (btrim(storage_path) <> ''),
  check (btrim(content_hash) <> ''),
  check (btrim(renderer_version) <> '')
);

create table public.recipe_source_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id),
  recipe_version_id uuid not null references public.recipe_versions(id),
  recipe_candidate_id uuid not null references public.recipe_candidates(id),
  candidate_revision_id uuid not null unique
    references public.recipe_candidate_revisions(id),
  source_import_id uuid not null references public.source_imports(id),
  extraction_run_id uuid not null references public.recipe_extraction_runs(id),
  markdown_snapshot_id uuid not null
    references public.recipe_markdown_snapshots(id),
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index recipe_extraction_runs_organization_id_idx
  on public.recipe_extraction_runs(organization_id);
create index recipe_extraction_runs_location_id_idx
  on public.recipe_extraction_runs(location_id);
create index recipe_extraction_runs_source_import_id_idx
  on public.recipe_extraction_runs(source_import_id);
create index recipe_extraction_runs_created_by_idx
  on public.recipe_extraction_runs(created_by);
create index recipe_extraction_runs_org_status_created_idx
  on public.recipe_extraction_runs(organization_id, status, created_at);

create index recipe_candidate_groups_organization_id_idx
  on public.recipe_candidate_groups(organization_id);
create index recipe_candidate_groups_canonical_recipe_id_idx
  on public.recipe_candidate_groups(canonical_recipe_id);
create index recipe_candidate_groups_created_by_idx
  on public.recipe_candidate_groups(created_by);
create index recipe_candidate_groups_org_status_name_idx
  on public.recipe_candidate_groups(organization_id, status, normalized_name);

create index recipe_candidates_organization_id_idx
  on public.recipe_candidates(organization_id);
create index recipe_candidates_extraction_run_id_idx
  on public.recipe_candidates(extraction_run_id);
create index recipe_candidates_proposed_group_id_idx
  on public.recipe_candidates(proposed_recipe_group_id);
create index recipe_candidates_current_revision_id_idx
  on public.recipe_candidates(current_revision_id);
create index recipe_candidates_approved_recipe_version_id_idx
  on public.recipe_candidates(approved_recipe_version_id);
create index recipe_candidates_approved_by_idx
  on public.recipe_candidates(approved_by);
create index recipe_candidates_org_status_created_idx
  on public.recipe_candidates(organization_id, status, created_at);

create index recipe_candidate_revisions_yield_unit_id_idx
  on public.recipe_candidate_revisions(yield_unit_id);
create index recipe_candidate_revisions_created_by_idx
  on public.recipe_candidate_revisions(created_by);

create index recipe_candidate_ingredients_unit_id_idx
  on public.recipe_candidate_ingredients(unit_id);
create index recipe_candidate_ingredients_inventory_item_id_idx
  on public.recipe_candidate_ingredients(component_inventory_item_id);
create index recipe_candidate_ingredients_recipe_id_idx
  on public.recipe_candidate_ingredients(component_recipe_id);

create index recipe_candidate_issues_candidate_id_idx
  on public.recipe_candidate_issues(recipe_candidate_id);
create index recipe_candidate_issues_revision_id_idx
  on public.recipe_candidate_issues(candidate_revision_id);
create index recipe_candidate_issues_ingredient_id_idx
  on public.recipe_candidate_issues(candidate_ingredient_id);
create index recipe_candidate_issues_resolved_by_idx
  on public.recipe_candidate_issues(resolved_by);
create index recipe_candidate_issues_open_candidate_idx
  on public.recipe_candidate_issues(recipe_candidate_id, severity)
  where status = 'open';

create index recipe_markdown_snapshots_organization_id_idx
  on public.recipe_markdown_snapshots(organization_id);
create index recipe_markdown_snapshots_candidate_id_idx
  on public.recipe_markdown_snapshots(recipe_candidate_id);
create index recipe_markdown_snapshots_extraction_run_id_idx
  on public.recipe_markdown_snapshots(extraction_run_id);

create index recipe_source_links_organization_id_idx
  on public.recipe_source_links(organization_id);
create index recipe_source_links_recipe_id_idx
  on public.recipe_source_links(recipe_id);
create index recipe_source_links_recipe_version_id_idx
  on public.recipe_source_links(recipe_version_id);
create index recipe_source_links_candidate_id_idx
  on public.recipe_source_links(recipe_candidate_id);
create index recipe_source_links_source_import_id_idx
  on public.recipe_source_links(source_import_id);
create index recipe_source_links_extraction_run_id_idx
  on public.recipe_source_links(extraction_run_id);
create index recipe_source_links_markdown_snapshot_id_idx
  on public.recipe_source_links(markdown_snapshot_id);
create index recipe_source_links_approved_by_idx
  on public.recipe_source_links(approved_by);

create trigger set_recipe_extraction_runs_updated_at
  before update on public.recipe_extraction_runs
  for each row execute function public.set_updated_at();
create trigger set_recipe_candidate_groups_updated_at
  before update on public.recipe_candidate_groups
  for each row execute function public.set_updated_at();
create trigger set_recipe_candidates_updated_at
  before update on public.recipe_candidates
  for each row execute function public.set_updated_at();
create trigger set_recipe_candidate_issues_updated_at
  before update on public.recipe_candidate_issues
  for each row execute function public.set_updated_at();

create or replace function public.guard_completed_recipe_extraction_artifact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in (
    'extracted',
    'needs_review',
    'approved',
    'failed',
    'superseded'
  ) then
    if tg_op = 'DELETE' then
      raise exception 'Completed recipe extraction artifacts are immutable';
    end if;

    if new.organization_id is distinct from old.organization_id
      or new.location_id is distinct from old.location_id
      or new.source_import_id is distinct from old.source_import_id
      or new.source_format is distinct from old.source_format
      or new.parser_version is distinct from old.parser_version
      or new.schema_version is distinct from old.schema_version
      or new.renderer_version is distinct from old.renderer_version
      or new.structured_payload is distinct from old.structured_payload
      or new.structured_payload_hash
        is distinct from old.structured_payload_hash
      or new.started_at is distinct from old.started_at
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Completed recipe extraction artifacts are immutable';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_completed_recipe_extraction_artifact
  before update or delete on public.recipe_extraction_runs
  for each row execute function
    public.guard_completed_recipe_extraction_artifact();

create or replace function public.reject_immutable_recipe_artifact_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', tg_argv[0];
end;
$$;

create trigger reject_recipe_candidate_revision_mutation
  before update or delete on public.recipe_candidate_revisions
  for each row execute function
    public.reject_immutable_recipe_artifact_mutation(
      'Recipe candidate revisions are immutable'
    );

create trigger reject_recipe_candidate_ingredient_mutation
  before update or delete on public.recipe_candidate_ingredients
  for each row execute function
    public.reject_immutable_recipe_artifact_mutation(
      'Recipe candidate ingredients are immutable'
    );

create trigger reject_recipe_candidate_match_suggestion_mutation
  before update or delete on public.recipe_candidate_match_suggestions
  for each row execute function
    public.reject_immutable_recipe_artifact_mutation(
      'Recipe candidate match suggestions are immutable'
    );

create trigger reject_recipe_markdown_snapshot_mutation
  before update or delete on public.recipe_markdown_snapshots
  for each row execute function
    public.reject_immutable_recipe_artifact_mutation(
      'Recipe Markdown snapshots are immutable'
    );

revoke execute on function
  public.guard_completed_recipe_extraction_artifact()
from public, anon, authenticated;
revoke execute on function
  public.reject_immutable_recipe_artifact_mutation()
from public, anon, authenticated;

alter table public.recipe_extraction_runs enable row level security;
alter table public.recipe_candidate_groups enable row level security;
alter table public.recipe_candidates enable row level security;
alter table public.recipe_candidate_revisions enable row level security;
alter table public.recipe_candidate_ingredients enable row level security;
alter table public.recipe_candidate_match_suggestions
  enable row level security;
alter table public.recipe_candidate_issues enable row level security;
alter table public.recipe_markdown_snapshots enable row level security;
alter table public.recipe_source_links enable row level security;

create policy "recipe_extraction_runs_select_manager"
on public.recipe_extraction_runs
for select
to authenticated
using ((select public.is_organization_manager(organization_id)));

create policy "recipe_candidate_groups_select_manager"
on public.recipe_candidate_groups
for select
to authenticated
using ((select public.is_organization_manager(organization_id)));

create policy "recipe_candidates_select_manager"
on public.recipe_candidates
for select
to authenticated
using ((select public.is_organization_manager(organization_id)));

create policy "recipe_candidate_revisions_select_manager"
on public.recipe_candidate_revisions
for select
to authenticated
using (
  exists (
    select 1
    from public.recipe_candidates candidate
    where candidate.id = recipe_candidate_id
      and (
        select public.is_organization_manager(candidate.organization_id)
      )
  )
);

create policy "recipe_candidate_ingredients_select_manager"
on public.recipe_candidate_ingredients
for select
to authenticated
using (
  exists (
    select 1
    from public.recipe_candidate_revisions revision
    join public.recipe_candidates candidate
      on candidate.id = revision.recipe_candidate_id
    where revision.id = candidate_revision_id
      and (
        select public.is_organization_manager(candidate.organization_id)
      )
  )
);

create policy "recipe_candidate_suggestions_select_manager"
on public.recipe_candidate_match_suggestions
for select
to authenticated
using (
  exists (
    select 1
    from public.recipe_candidate_ingredients ingredient
    join public.recipe_candidate_revisions revision
      on revision.id = ingredient.candidate_revision_id
    join public.recipe_candidates candidate
      on candidate.id = revision.recipe_candidate_id
    where ingredient.id = candidate_ingredient_id
      and (
        select public.is_organization_manager(candidate.organization_id)
      )
  )
);

create policy "recipe_candidate_issues_select_manager"
on public.recipe_candidate_issues
for select
to authenticated
using (
  exists (
    select 1
    from public.recipe_candidates candidate
    where candidate.id = recipe_candidate_id
      and (
        select public.is_organization_manager(candidate.organization_id)
      )
  )
);

create policy "recipe_markdown_snapshots_select_manager"
on public.recipe_markdown_snapshots
for select
to authenticated
using ((select public.is_organization_manager(organization_id)));

create policy "recipe_source_links_select_manager"
on public.recipe_source_links
for select
to authenticated
using ((select public.is_organization_manager(organization_id)));

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
from anon, authenticated, service_role;

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

create or replace function public.validate_recipe_candidate(
  target_candidate_id uuid
)
returns table (
  issue_code text,
  severity public.recipe_issue_severity,
  message text,
  ingredient_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    null::text,
    null::public.recipe_issue_severity,
    null::text,
    null::uuid
  where false;
$$;

create or replace function public.approve_recipe_candidate(
  target_candidate_id uuid,
  target_revision_id uuid
)
returns table (
  recipe_id uuid,
  recipe_version_id uuid,
  already_approved boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Recipe candidate approval is not implemented';
end;
$$;

revoke execute on function public.validate_recipe_candidate(uuid)
  from public, anon;
revoke execute on function public.approve_recipe_candidate(uuid, uuid)
  from public, anon;
grant execute on function public.validate_recipe_candidate(uuid)
  to authenticated;
grant execute on function public.approve_recipe_candidate(uuid, uuid)
  to authenticated;
