-- Invoice Intelligence Engine: data foundation

create type public.invoice_source_channel as enum (
  'upload',
  'email_forward',
  'gmail'
);

create type public.invoice_processing_job_status as enum (
  'queued',
  'extracting',
  'validating',
  'matching',
  'needs_review',
  'auto_approved',
  'approved',
  'posted',
  'failed',
  'cancelled',
  'superseded'
);

create type public.invoice_validation_status as enum (
  'unvalidated',
  'valid',
  'warnings',
  'blocking'
);

create type public.invoice_match_strategy as enum (
  'vendor_item_code',
  'previous_invoice_match',
  'inventory_alias',
  'exact_name',
  'fuzzy_similarity',
  'semantic_match',
  'reviewer_history'
);

create type public.invoice_review_status as enum (
  'unreviewed',
  'suggested',
  'confirmed',
  'create_item',
  'blocked',
  'rejected'
);

create type public.invoice_review_type as enum (
  'suggested_match',
  'new_item',
  'price_alert',
  'duplicate_invoice',
  'pack_size_change',
  'vendor_changed',
  'unit_conversion_changed',
  'receipt_mismatch'
);

create type public.review_queue_status as enum (
  'open',
  'in_review',
  'resolved',
  'rejected',
  'dismissed'
);

create type public.review_actor_type as enum (
  'human',
  'ai_worker',
  'system'
);

create type public.review_action_type as enum (
  'approved',
  'edited',
  'rejected',
  'merged',
  'created_inventory_item',
  'linked_alias',
  'dismissed_alert'
);

create type public.price_alert_type as enum (
  'cost_increase',
  'pack_size_changed',
  'vendor_changed',
  'unit_conversion_changed',
  'duplicate_inventory_suspected'
);

create type public.price_alert_status as enum (
  'open',
  'resolved',
  'dismissed'
);

create type public.price_alert_severity as enum (
  'info',
  'warning',
  'critical'
);

alter table public.vendors
  add column normalized_name text not null default '',
  add column email_domains text[] not null default '{}',
  add column account_number text not null default '';

create index vendors_normalized_name_idx
  on public.vendors(organization_id, normalized_name);

alter table public.vendor_items
  add column normalized_description text not null default '',
  add column case_quantity numeric(20, 6),
  add column base_quantity_per_purchase_unit numeric(20, 6),
  add column last_case_price numeric(20, 4),
  add column last_unit_cost numeric(20, 6),
  add column is_preferred boolean not null default false,
  add column created_from_invoice_line_id uuid references public.invoice_lines(id);

create index vendor_items_normalized_description_idx
  on public.vendor_items(organization_id, normalized_description);
create index vendor_items_created_from_invoice_line_id_idx
  on public.vendor_items(created_from_invoice_line_id);

alter table public.invoices
  add column source_channel public.invoice_source_channel not null default 'upload',
  add column external_message_id text,
  add column document_hash text,
  add column duplicate_of_invoice_id uuid references public.invoices(id),
  add column validation_status public.invoice_validation_status not null default 'unvalidated',
  add column processing_job_id uuid,
  add column currency text not null default 'USD',
  add column subtotal_amount numeric(20, 4),
  add column idempotency_key text;

alter table public.invoice_lines
  add column raw_line_text text not null default '',
  add column purchase_unit_text text not null default '',
  add column purchase_unit_id uuid references public.units(id),
  add column pack_size_structured jsonb not null default '{}',
  add column base_quantity numeric(20, 6),
  add column unit_cost_per_base_unit numeric(20, 6),
  add column match_confidence numeric(4, 3),
  add column match_strategy public.invoice_match_strategy,
  add column review_status public.invoice_review_status not null default 'unreviewed',
  add constraint invoice_lines_match_confidence_check
    check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1));

create index invoices_duplicate_of_invoice_id_idx
  on public.invoices(duplicate_of_invoice_id);
create index invoices_processing_job_id_idx
  on public.invoices(processing_job_id);
create index invoices_document_hash_idx
  on public.invoices(organization_id, document_hash);
alter table public.invoices
  add constraint invoices_organization_document_hash_key
  unique (organization_id, document_hash);
create index invoices_external_message_id_idx
  on public.invoices(organization_id, external_message_id);
create index invoice_lines_purchase_unit_id_idx
  on public.invoice_lines(purchase_unit_id);
create index invoice_lines_review_status_idx
  on public.invoice_lines(review_status);

create table public.invoice_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  source_import_id uuid references public.source_imports(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  idempotency_key text not null unique,
  source_channel public.invoice_source_channel not null default 'upload',
  status public.invoice_processing_job_status not null default 'queued',
  attempt_count integer not null default 0,
  priority integer not null default 100,
  locked_by text,
  locked_at timestamptz,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_code text not null default '',
  error_message text not null default '',
  worker_provider text not null default '',
  worker_run_id text not null default '',
  parser_version text not null default '',
  schema_version text not null default '2026-06-30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (attempt_count >= 0),
  check (priority >= 0)
);

create trigger set_invoice_processing_jobs_updated_at
  before update on public.invoice_processing_jobs
  for each row execute function public.set_updated_at();

alter table public.invoices
  add constraint invoices_processing_job_id_fkey
  foreign key (processing_job_id)
  references public.invoice_processing_jobs(id)
  on delete set null;

create table public.invoice_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  job_id uuid not null references public.invoice_processing_jobs(id) on delete cascade,
  source_import_id uuid references public.source_imports(id) on delete set null,
  parser_version text not null,
  ocr_provider text not null default '',
  llm_model text not null default '',
  schema_version text not null,
  raw_text_path text not null default '',
  structured_payload jsonb not null default '{}',
  payload_hash text not null,
  confidence numeric(4, 3),
  issues jsonb not null default '[]',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, payload_hash),
  check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table public.invoice_line_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  extraction_run_id uuid not null references public.invoice_extraction_runs(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  line_index integer not null,
  raw_text text not null default '',
  vendor_item_code text not null default '',
  description text not null,
  quantity numeric(20, 6) not null,
  unit_price numeric(20, 4) not null,
  line_total numeric(20, 4) not null,
  purchase_unit_text text not null default '',
  pack_size_text text not null default '',
  page_number integer,
  bbox jsonb not null default '{}',
  extraction_confidence numeric(4, 3),
  validation_status public.invoice_validation_status not null default 'unvalidated',
  current_best_match_id uuid,
  created_at timestamptz not null default now(),
  unique (invoice_id, line_index),
  check (line_index >= 0),
  check (quantity > 0),
  check (unit_price >= 0),
  check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1))
);

create table public.invoice_line_match_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  line_candidate_id uuid not null references public.invoice_line_candidates(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  vendor_item_id uuid references public.vendor_items(id) on delete set null,
  strategy public.invoice_match_strategy not null,
  score numeric(4, 3) not null,
  rank integer not null,
  reason_codes text[] not null default '{}',
  unit_compatibility text not null default '',
  price_compatibility text not null default '',
  created_at timestamptz not null default now(),
  unique (line_candidate_id, rank),
  check (score >= 0 and score <= 1),
  check (rank > 0)
);

alter table public.invoice_line_candidates
  add constraint invoice_line_candidates_current_best_match_id_fkey
  foreign key (current_best_match_id)
  references public.invoice_line_match_suggestions(id)
  on delete set null
  deferrable initially deferred;

create table public.review_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  review_type public.invoice_review_type not null,
  severity public.price_alert_severity not null default 'warning',
  status public.review_queue_status not null default 'open',
  title text not null,
  summary text not null default '',
  prefill_payload jsonb not null default '{}',
  blocking_reasons text[] not null default '{}',
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_review_queue_updated_at
  before update on public.review_queue
  for each row execute function public.set_updated_at();

create table public.review_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  review_queue_id uuid not null references public.review_queue(id) on delete cascade,
  actor_type public.review_actor_type not null,
  actor_id uuid references public.profiles(id) on delete set null,
  action public.review_action_type not null,
  before_payload jsonb not null default '{}',
  after_payload jsonb not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.inventory_item_aliases
  add column vendor_id uuid references public.vendors(id) on delete set null,
  add column normalized_alias text not null default '',
  add column confidence numeric(4, 3),
  add column created_from_review_action_id uuid references public.review_actions(id) on delete set null,
  add constraint inventory_item_aliases_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1));

create index inventory_item_aliases_vendor_id_idx
  on public.inventory_item_aliases(vendor_id);
create index inventory_item_aliases_normalized_alias_idx
  on public.inventory_item_aliases(organization_id, normalized_alias);
create index inventory_item_aliases_created_from_review_action_id_idx
  on public.inventory_item_aliases(created_from_review_action_id);

create table public.item_cost_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_item_id uuid references public.vendor_items(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  invoice_line_id uuid references public.invoice_lines(id) on delete set null,
  effective_date date not null,
  case_price numeric(20, 4),
  base_unit_cost numeric(20, 6) not null,
  purchase_unit_id uuid references public.units(id) on delete set null,
  base_quantity numeric(20, 6),
  pack_size_text text not null default '',
  cost_source text not null default 'invoice',
  previous_base_unit_cost numeric(20, 6),
  cost_change_pct numeric(12, 6),
  created_at timestamptz not null default now(),
  check (base_unit_cost >= 0),
  check (case_price is null or case_price >= 0),
  check (base_quantity is null or base_quantity > 0)
);

create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  invoice_line_id uuid references public.invoice_lines(id) on delete set null,
  review_queue_id uuid references public.review_queue(id) on delete set null,
  alert_type public.price_alert_type not null,
  severity public.price_alert_severity not null default 'warning',
  previous_value numeric(20, 6),
  current_value numeric(20, 6),
  change_pct numeric(12, 6),
  status public.price_alert_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index invoice_processing_jobs_organization_id_idx on public.invoice_processing_jobs(organization_id);
create index invoice_processing_jobs_location_id_idx on public.invoice_processing_jobs(location_id);
create index invoice_processing_jobs_source_import_id_idx on public.invoice_processing_jobs(source_import_id);
create index invoice_processing_jobs_invoice_id_idx on public.invoice_processing_jobs(invoice_id);
create index invoice_processing_jobs_status_priority_idx on public.invoice_processing_jobs(status, priority, queued_at);
create index invoice_processing_jobs_org_location_status_idx on public.invoice_processing_jobs(organization_id, location_id, status);

create index invoice_extraction_runs_organization_id_idx on public.invoice_extraction_runs(organization_id);
create index invoice_extraction_runs_location_id_idx on public.invoice_extraction_runs(location_id);
create index invoice_extraction_runs_job_id_idx on public.invoice_extraction_runs(job_id);
create index invoice_extraction_runs_source_import_id_idx on public.invoice_extraction_runs(source_import_id);
create index invoice_extraction_runs_payload_hash_idx on public.invoice_extraction_runs(payload_hash);

create index invoice_line_candidates_organization_id_idx on public.invoice_line_candidates(organization_id);
create index invoice_line_candidates_location_id_idx on public.invoice_line_candidates(location_id);
create index invoice_line_candidates_extraction_run_id_idx on public.invoice_line_candidates(extraction_run_id);
create index invoice_line_candidates_invoice_id_idx on public.invoice_line_candidates(invoice_id);
create index invoice_line_candidates_current_best_match_id_idx on public.invoice_line_candidates(current_best_match_id);
create index invoice_line_candidates_validation_status_idx on public.invoice_line_candidates(validation_status);

create index invoice_line_match_suggestions_organization_id_idx on public.invoice_line_match_suggestions(organization_id);
create index invoice_line_match_suggestions_location_id_idx on public.invoice_line_match_suggestions(location_id);
create index invoice_line_match_suggestions_line_candidate_id_idx on public.invoice_line_match_suggestions(line_candidate_id);
create index invoice_line_match_suggestions_inventory_item_id_idx on public.invoice_line_match_suggestions(inventory_item_id);
create index invoice_line_match_suggestions_vendor_item_id_idx on public.invoice_line_match_suggestions(vendor_item_id);
create index invoice_line_match_suggestions_line_rank_idx on public.invoice_line_match_suggestions(line_candidate_id, rank);

create index review_queue_organization_id_idx on public.review_queue(organization_id);
create index review_queue_location_id_idx on public.review_queue(location_id);
create index review_queue_assigned_to_idx on public.review_queue(assigned_to);
create index review_queue_resolved_by_idx on public.review_queue(resolved_by);
create index review_queue_org_location_status_idx on public.review_queue(organization_id, location_id, status, severity, created_at);
create index review_queue_entity_idx on public.review_queue(entity_type, entity_id);

create index review_actions_organization_id_idx on public.review_actions(organization_id);
create index review_actions_location_id_idx on public.review_actions(location_id);
create index review_actions_review_queue_id_idx on public.review_actions(review_queue_id);
create index review_actions_actor_id_idx on public.review_actions(actor_id);

create index item_cost_history_organization_id_idx on public.item_cost_history(organization_id);
create index item_cost_history_location_id_idx on public.item_cost_history(location_id);
create index item_cost_history_inventory_item_id_idx on public.item_cost_history(inventory_item_id);
create index item_cost_history_vendor_id_idx on public.item_cost_history(vendor_id);
create index item_cost_history_vendor_item_id_idx on public.item_cost_history(vendor_item_id);
create index item_cost_history_invoice_id_idx on public.item_cost_history(invoice_id);
create index item_cost_history_invoice_line_id_idx on public.item_cost_history(invoice_line_id);
create index item_cost_history_purchase_unit_id_idx on public.item_cost_history(purchase_unit_id);
create index item_cost_history_item_effective_date_idx on public.item_cost_history(inventory_item_id, effective_date desc);
create index item_cost_history_vendor_item_effective_date_idx on public.item_cost_history(vendor_item_id, effective_date desc);

create index price_alerts_organization_id_idx on public.price_alerts(organization_id);
create index price_alerts_location_id_idx on public.price_alerts(location_id);
create index price_alerts_inventory_item_id_idx on public.price_alerts(inventory_item_id);
create index price_alerts_vendor_id_idx on public.price_alerts(vendor_id);
create index price_alerts_invoice_line_id_idx on public.price_alerts(invoice_line_id);
create index price_alerts_review_queue_id_idx on public.price_alerts(review_queue_id);
create index price_alerts_org_location_status_idx on public.price_alerts(organization_id, location_id, status, severity);
create index price_alerts_item_created_at_idx on public.price_alerts(inventory_item_id, created_at desc);

alter table public.invoice_processing_jobs enable row level security;
alter table public.invoice_extraction_runs enable row level security;
alter table public.invoice_line_candidates enable row level security;
alter table public.invoice_line_match_suggestions enable row level security;
alter table public.review_queue enable row level security;
alter table public.review_actions enable row level security;
alter table public.item_cost_history enable row level security;
alter table public.price_alerts enable row level security;

create policy "invoice_processing_jobs_select_member"
on public.invoice_processing_jobs for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "invoice_processing_jobs_write_manager"
on public.invoice_processing_jobs for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "invoice_extraction_runs_select_member"
on public.invoice_extraction_runs for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "invoice_extraction_runs_write_manager"
on public.invoice_extraction_runs for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "invoice_line_candidates_select_member"
on public.invoice_line_candidates for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "invoice_line_candidates_write_manager"
on public.invoice_line_candidates for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "invoice_line_match_suggestions_select_member"
on public.invoice_line_match_suggestions for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "invoice_line_match_suggestions_write_manager"
on public.invoice_line_match_suggestions for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "review_queue_select_member"
on public.review_queue for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "review_queue_write_manager"
on public.review_queue for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "review_actions_select_member"
on public.review_actions for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "review_actions_insert_manager"
on public.review_actions for insert to authenticated
with check ((select public.is_organization_manager(organization_id)));

create policy "item_cost_history_select_member"
on public.item_cost_history for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "item_cost_history_insert_manager"
on public.item_cost_history for insert to authenticated
with check ((select public.is_organization_manager(organization_id)));

create policy "price_alerts_select_member"
on public.price_alerts for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "price_alerts_write_manager"
on public.price_alerts for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

grant select, insert, update, delete on public.invoice_processing_jobs to authenticated;
grant select, insert, update, delete on public.invoice_extraction_runs to authenticated;
grant select, insert, update, delete on public.invoice_line_candidates to authenticated;
grant select, insert, update, delete on public.invoice_line_match_suggestions to authenticated;
grant select, insert, update, delete on public.review_queue to authenticated;
grant select, insert on public.review_actions to authenticated;
grant select, insert on public.item_cost_history to authenticated;
grant select, insert, update, delete on public.price_alerts to authenticated;
