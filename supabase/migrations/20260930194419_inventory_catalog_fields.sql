-- Catalog fields carried over from the Static! inventory workbook, plus a
-- review list for catalog rows that still need a human decision.

alter table public.inventory_items
  add column item_code text,
  add column cogs_class text
    check (cogs_class in ('liquor', 'wine', 'beer', 'na_bev', 'bar_consumables', 'food')),
  add column par_quantity numeric(20, 6) check (par_quantity is null or par_quantity >= 0),
  add column notes text not null default '';

-- Short, human-facing product number. Plain sequential numbers; category,
-- vendor and class live in their own columns so codes never need to change.
create unique index inventory_items_org_item_code_key
  on public.inventory_items(organization_id, item_code)
  where item_code is not null;

create index inventory_items_org_cogs_class_idx
  on public.inventory_items(organization_id, cogs_class);

-- Shelf position within a storage location, so counts follow the physical walk.
alter table public.storage_location_items
  add column sort_order integer not null default 0;

create index storage_location_items_location_order_idx
  on public.storage_location_items(storage_location_id, sort_order);

create table public.catalog_review_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete cascade,
  issue_type text not null check (issue_type in (
    'unmatched_count_item', 'missing_cost', 'missing_recipe', 'unverified_assumption', 'missing_invoice_date'
  )),
  title text not null,
  detail text not null default '',
  source_context jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text not null default '',
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index catalog_review_items_org_status_idx
  on public.catalog_review_items(organization_id, status, issue_type);
create index catalog_review_items_location_id_idx on public.catalog_review_items(location_id);
create index catalog_review_items_item_id_idx on public.catalog_review_items(inventory_item_id);
create index catalog_review_items_recipe_id_idx on public.catalog_review_items(recipe_id);
create index catalog_review_items_resolved_by_idx on public.catalog_review_items(resolved_by);

alter table public.catalog_review_items enable row level security;

create policy "catalog_review_items_select_member"
on public.catalog_review_items for select to authenticated
using (public.is_organization_member(organization_id));

create policy "catalog_review_items_insert_manager"
on public.catalog_review_items for insert to authenticated
with check (public.is_organization_manager(organization_id));

create policy "catalog_review_items_update_manager"
on public.catalog_review_items for update to authenticated
using (public.is_organization_manager(organization_id))
with check (public.is_organization_manager(organization_id));

grant select, insert, update on public.catalog_review_items to authenticated;
