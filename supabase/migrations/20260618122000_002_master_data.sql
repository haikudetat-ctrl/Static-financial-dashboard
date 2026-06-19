-- Slice 1: Master Data & Historical Source Staging

-- ============================================================
-- 1. Units & Conversions
-- ============================================================

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  abbreviation text not null,
  unit_type text not null check (unit_type in ('volume', 'weight', 'each', 'count', 'dash', 'drop')),
  base_unit_id uuid references public.units(id),
  conversion_factor_to_base numeric(20, 6),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.unit_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_unit_id uuid not null references public.units(id),
  to_unit_id uuid not null references public.units(id),
  conversion_factor numeric(20, 10) not null,
  item_specific boolean not null default false,
  inventory_item_id uuid,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. Inventory Categories
-- ============================================================

create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  parent_id uuid references public.inventory_categories(id),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

-- ============================================================
-- 3. Inventory Items
-- ============================================================

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  category_id uuid references public.inventory_categories(id),
  base_unit_id uuid not null references public.units(id),
  purchase_unit_id uuid references public.units(id),
  count_unit_id uuid references public.units(id),
  is_purchased boolean not null default false,
  is_produced boolean not null default false,
  allows_tenths_counting boolean not null default false,
  default_storage_location_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_inventory_items_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

create table public.inventory_item_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  alias text not null,
  source text not null default '',
  created_at timestamptz not null default now(),
  unique (inventory_item_id, alias)
);

create index inventory_item_aliases_alias_idx on public.inventory_item_aliases(alias);

-- ============================================================
-- 4. Pack Definitions
-- ============================================================

create table public.pack_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  pack_unit_id uuid not null references public.units(id),
  quantity_per_pack numeric(20, 6) not null,
  vendor_item_id uuid,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5. Storage Locations
-- ============================================================

create table public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  walk_order integer not null default 0,
  area text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, location_id, name)
);

create table public.storage_location_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_location_id uuid not null references public.storage_locations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  default_par numeric(20, 6),
  created_at timestamptz not null default now(),
  unique (storage_location_id, inventory_item_id)
);

-- ============================================================
-- 6. Vendors
-- ============================================================

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  vendor_type text not null default '' check (vendor_type in ('plcb', 'beer', 'wine', 'food', 'na', '')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  ordering_method text not null default '' check (ordering_method in ('email', 'portal', 'phone', 'text', '')),
  created_at timestamptz not null default now()
);

create table public.vendor_order_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  cutoff_day integer, -- 0=Sunday, 1=Monday, etc.
  cutoff_time time,
  lead_time_days integer not null default 0,
  minimum_order_amount numeric(20, 2),
  default_ordering_method text not null default '' check (default_ordering_method in ('email', 'portal', 'phone', 'text', '')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.vendor_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id),
  vendor_product_code text not null default '',
  vendor_product_name text not null,
  pack_size text not null default '',
  purchase_unit_id uuid references public.units(id),
  created_at timestamptz not null default now(),
  unique (vendor_id, vendor_product_code)
);

create index vendor_items_inventory_item_id_idx on public.vendor_items(inventory_item_id);
create index vendor_items_vendor_product_code_idx on public.vendor_items(vendor_product_code);

create table public.vendor_item_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor_item_id uuid not null references public.vendor_items(id) on delete cascade,
  unit_price numeric(20, 4) not null,
  effective_date date not null,
  created_at timestamptz not null default now()
);

create index vendor_item_prices_vendor_item_id_idx on public.vendor_item_prices(vendor_item_id);

-- ============================================================
-- 7. Order Guides
-- ============================================================

create table public.order_guides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, location_id, vendor_id)
);

create table public.order_guide_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_guide_id uuid not null references public.order_guides(id) on delete cascade,
  vendor_item_id uuid not null references public.vendor_items(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id),
  default_par numeric(20, 6),
  preferred_pack text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 8. Source Import Staging
-- ============================================================

create type public.source_import_status as enum (
  'received',
  'extracting',
  'extracted',
  'staging',
  'staged',
  'mapping',
  'ready',
  'posted',
  'failed',
  'duplicate',
  'cancelled'
);

create table public.source_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  source_type text not null,
  file_hash text not null,
  file_path text not null,
  file_name text not null,
  parser_version text not null default '',
  status public.source_import_status not null default 'received',
  row_count integer not null default 0,
  error_message text not null default '',
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index source_imports_file_hash_idx on public.source_imports(file_hash);
create index source_imports_status_idx on public.source_imports(status);

create table public.source_import_rows (
  id uuid primary key default gen_random_uuid(),
  source_import_id uuid not null references public.source_imports(id) on delete cascade,
  row_index integer not null,
  raw_data jsonb not null default '{}',
  normalized_data jsonb not null default '{}',
  status text not null default 'staged',
  error_message text not null default '',
  created_at timestamptz not null default now()
);

create index source_import_rows_import_id_idx on public.source_import_rows(source_import_id);

-- ============================================================
-- 9. External Item Mappings
-- ============================================================

create table public.external_item_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null,
  external_id text not null,
  external_name text not null,
  inventory_item_id uuid references public.inventory_items(id),
  recipe_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, source_system, external_id)
);

create index external_item_mappings_external_id_idx on public.external_item_mappings(source_system, external_id);
create index external_item_mappings_inventory_item_id_idx on public.external_item_mappings(inventory_item_id);

-- ============================================================
-- 10. Mapping Queue
-- ============================================================

create type public.mapping_queue_type as enum (
  'toast_item_to_recipe',
  'toast_item_to_inventory',
  'vendor_item_to_inventory',
  'unknown_unit_to_unit'
);

create type public.mapping_queue_status as enum (
  'pending',
  'suggested',
  'confirmed',
  'skipped',
  'blocked'
);

create table public.mapping_queue_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  queue_type public.mapping_queue_type not null,
  status public.mapping_queue_status not null default 'pending',
  source_value text not null,
  source_context jsonb not null default '{}',
  suggested_match_id uuid,
  suggested_match_label text not null default '',
  suggested_confidence numeric(3, 2), -- 0.00 to 1.00
  confirmed_match_id uuid,
  confirmed_match_type text, -- 'inventory_item', 'recipe', 'unit'
  notes text not null default '',
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index mapping_queue_items_type_status_idx on public.mapping_queue_items(queue_type, status);

-- ============================================================
-- RLS Policies
-- ============================================================

alter table public.units enable row level security;
alter table public.unit_conversions enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_item_aliases enable row level security;
alter table public.pack_definitions enable row level security;
alter table public.storage_locations enable row level security;
alter table public.storage_location_items enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_contacts enable row level security;
alter table public.vendor_order_rules enable row level security;
alter table public.vendor_items enable row level security;
alter table public.vendor_item_prices enable row level security;
alter table public.order_guides enable row level security;
alter table public.order_guide_items enable row level security;
alter table public.source_imports enable row level security;
alter table public.source_import_rows enable row level security;
alter table public.external_item_mappings enable row level security;
alter table public.mapping_queue_items enable row level security;

-- Helper: any authenticated member of an organization
create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.profile_id = auth.uid()
  );
$$;

grant execute on function public.is_organization_member(uuid) to authenticated;

-- Generic policy: select if org member
create or replace function public.gen_select_org_member(org_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_organization_member(org_id);
$$;

-- Apply RLS: all master-data tables scoped to organization
do $$
declare
  tables text[] := array[
    'units', 'unit_conversions', 'inventory_categories', 'inventory_items',
    'inventory_item_aliases', 'pack_definitions', 'storage_locations',
    'storage_location_items', 'vendors', 'vendor_contacts', 'vendor_order_rules',
    'vendor_items', 'vendor_item_prices', 'order_guides', 'order_guide_items',
    'source_imports', 'external_item_mappings', 'mapping_queue_items'
  ];
  t text;
begin
  foreach t in array tables
  loop
    execute format(
      'create policy "%s_select_member" on public.%I for select to authenticated using (public.is_organization_member(organization_id));',
      replace(t, '_', '_'), t
    );
    execute format(
      'create policy "%s_insert_member" on public.%I for insert to authenticated with check (public.is_organization_member(organization_id));',
      replace(t, '_', '_'), t
    );
    execute format(
      'create policy "%s_update_member" on public.%I for update to authenticated using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));',
      replace(t, '_', '_'), t
    );
    execute format(
      'create policy "%s_delete_member" on public.%I for delete to authenticated using (public.is_organization_member(organization_id));',
      replace(t, '_', '_'), t
    );
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated;',
      t
    );
  end loop;
end;
$$;

create policy "source_import_rows_select_member"
on public.source_import_rows
for select
to authenticated
using (
  exists (
    select 1
    from public.source_imports source_import
    where source_import.id = source_import_id
      and public.is_organization_member(source_import.organization_id)
  )
);

create policy "source_import_rows_insert_member"
on public.source_import_rows
for insert
to authenticated
with check (
  exists (
    select 1
    from public.source_imports source_import
    where source_import.id = source_import_id
      and public.is_organization_member(source_import.organization_id)
  )
);

create policy "source_import_rows_update_member"
on public.source_import_rows
for update
to authenticated
using (
  exists (
    select 1
    from public.source_imports source_import
    where source_import.id = source_import_id
      and public.is_organization_member(source_import.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.source_imports source_import
    where source_import.id = source_import_id
      and public.is_organization_member(source_import.organization_id)
  )
);

create policy "source_import_rows_delete_member"
on public.source_import_rows
for delete
to authenticated
using (
  exists (
    select 1
    from public.source_imports source_import
    where source_import.id = source_import_id
      and public.is_organization_member(source_import.organization_id)
  )
);

grant select, insert, update, delete on public.source_import_rows to authenticated;
