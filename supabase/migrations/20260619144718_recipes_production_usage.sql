-- Slice 4: Recipes, Production, Sales, and Theoretical Usage

create type public.recipe_type as enum ('menu_item', 'prep', 'batch');
create type public.recipe_version_status as enum ('draft', 'active', 'retired');
create type public.production_batch_status as enum (
  'draft',
  'posted',
  'cancelled'
);
create type public.calculation_run_status as enum (
  'running',
  'completed',
  'failed'
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  recipe_type public.recipe_type not null,
  output_inventory_item_id uuid references public.inventory_items(id),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  check (
    recipe_type = 'menu_item'
    or output_inventory_item_id is not null
  )
);

create trigger set_recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create index recipes_org_type_active_idx
  on public.recipes(organization_id, recipe_type, active);
create index recipes_output_inventory_item_id_idx
  on public.recipes(output_inventory_item_id);
create index recipes_created_by_idx on public.recipes(created_by);

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  version_number integer not null,
  effective_from date not null,
  effective_to date,
  output_quantity numeric(20, 6) not null,
  output_unit_id uuid not null references public.units(id),
  yield_is_approximate boolean not null default false,
  status public.recipe_version_status not null default 'draft',
  notes text not null default '',
  created_by uuid not null references public.profiles(id),
  activated_by uuid references public.profiles(id),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipe_id, version_number),
  check (version_number > 0),
  check (output_quantity > 0),
  check (effective_to is null or effective_to >= effective_from)
);

create index recipe_versions_recipe_status_effective_idx
  on public.recipe_versions(recipe_id, status, effective_from, effective_to);
create index recipe_versions_output_unit_id_idx
  on public.recipe_versions(output_unit_id);
create index recipe_versions_created_by_idx
  on public.recipe_versions(created_by);
create index recipe_versions_activated_by_idx
  on public.recipe_versions(activated_by);

create table public.recipe_version_components (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null references public.recipe_versions(id) on delete cascade,
  component_inventory_item_id uuid references public.inventory_items(id),
  component_recipe_id uuid references public.recipes(id),
  quantity numeric(20, 6) not null,
  unit_id uuid not null references public.units(id),
  line_order integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (quantity > 0),
  check (
    (component_inventory_item_id is not null)::integer
    + (component_recipe_id is not null)::integer = 1
  )
);

create index recipe_components_version_order_idx
  on public.recipe_version_components(recipe_version_id, line_order);
create index recipe_components_inventory_item_id_idx
  on public.recipe_version_components(component_inventory_item_id);
create index recipe_components_recipe_id_idx
  on public.recipe_version_components(component_recipe_id);
create index recipe_components_unit_id_idx
  on public.recipe_version_components(unit_id);

create table public.recipe_menu_item_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  source_system text not null default 'toast',
  external_item_guid text not null,
  external_item_name text not null,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, source_system, external_item_guid)
);

create index recipe_menu_mappings_recipe_id_idx
  on public.recipe_menu_item_mappings(recipe_id);
create index recipe_menu_mappings_created_by_idx
  on public.recipe_menu_item_mappings(created_by);

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id),
  recipe_version_id uuid not null references public.recipe_versions(id),
  status public.production_batch_status not null default 'draft',
  planned_output_quantity numeric(20, 6),
  actual_output_quantity numeric(20, 6) not null,
  output_unit_id uuid not null references public.units(id),
  created_by uuid not null references public.profiles(id),
  produced_at timestamptz not null default now(),
  posted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (planned_output_quantity is null or planned_output_quantity > 0),
  check (actual_output_quantity > 0)
);

create index production_batches_org_location_status_idx
  on public.production_batches(organization_id, location_id, status);
create index production_batches_recipe_produced_idx
  on public.production_batches(recipe_id, produced_at desc);
create index production_batches_version_id_idx
  on public.production_batches(recipe_version_id);
create index production_batches_output_unit_id_idx
  on public.production_batches(output_unit_id);
create index production_batches_created_by_idx
  on public.production_batches(created_by);

create table public.production_batch_components (
  id uuid primary key default gen_random_uuid(),
  production_batch_id uuid not null references public.production_batches(id) on delete cascade,
  recipe_component_id uuid not null references public.recipe_version_components(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  storage_location_id uuid not null references public.storage_locations(id),
  quantity_base numeric(20, 6) not null,
  unit_cost numeric(20, 4) not null,
  extended_value numeric(24, 6)
    generated always as (quantity_base * unit_cost) stored,
  created_at timestamptz not null default now(),
  check (quantity_base > 0),
  check (unit_cost >= 0)
);

create index production_batch_components_batch_id_idx
  on public.production_batch_components(production_batch_id);
create index production_batch_components_recipe_component_id_idx
  on public.production_batch_components(recipe_component_id);
create index production_batch_components_item_location_idx
  on public.production_batch_components(inventory_item_id, storage_location_id);

create table public.production_yield_variances (
  id uuid primary key default gen_random_uuid(),
  production_batch_id uuid not null unique references public.production_batches(id) on delete cascade,
  expected_output_base numeric(20, 6) not null,
  actual_output_base numeric(20, 6) not null,
  variance_quantity_base numeric(20, 6) not null,
  output_unit_cost numeric(20, 4) not null,
  variance_value numeric(24, 6)
    generated always as (variance_quantity_base * output_unit_cost) stored,
  created_at timestamptz not null default now(),
  check (expected_output_base > 0),
  check (actual_output_base > 0),
  check (output_unit_cost >= 0)
);

create table public.sales_business_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  source_import_id uuid not null unique references public.source_imports(id),
  business_date date not null,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  net_sales numeric(20, 4) not null default 0,
  posted_by uuid not null references public.profiles(id),
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (location_id, business_date, source_import_id)
);

create index sales_business_days_org_location_date_idx
  on public.sales_business_days(organization_id, location_id, business_date desc);
create index sales_business_days_posted_by_idx
  on public.sales_business_days(posted_by);

create table public.sales_items (
  id uuid primary key default gen_random_uuid(),
  sales_business_day_id uuid not null references public.sales_business_days(id) on delete cascade,
  source_import_row_id uuid not null unique references public.source_import_rows(id),
  item_guid text not null,
  item_name text not null,
  recipe_id uuid not null references public.recipes(id),
  recipe_version_id uuid not null references public.recipe_versions(id),
  quantity_sold numeric(20, 6) not null default 0,
  void_quantity numeric(20, 6) not null default 0,
  comp_quantity numeric(20, 6) not null default 0,
  theoretical_sale_quantity numeric(20, 6) not null default 0,
  net_sales numeric(20, 4) not null default 0,
  created_at timestamptz not null default now(),
  check (quantity_sold >= 0),
  check (void_quantity >= 0),
  check (comp_quantity >= 0),
  check (theoretical_sale_quantity >= 0)
);

create index sales_items_business_day_id_idx
  on public.sales_items(sales_business_day_id);
create index sales_items_guid_idx on public.sales_items(item_guid);
create index sales_items_recipe_version_idx
  on public.sales_items(recipe_id, recipe_version_id);

create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  calculation_type text not null check (calculation_type in ('theoretical_usage')),
  calculation_version text not null,
  business_date date not null,
  status public.calculation_run_status not null default 'running',
  started_by uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text not null default '',
  created_at timestamptz not null default now()
);

create index calculation_runs_org_location_date_idx
  on public.calculation_runs(
    organization_id,
    location_id,
    calculation_type,
    business_date desc
  );
create index calculation_runs_started_by_idx
  on public.calculation_runs(started_by);

create table public.calculation_run_inputs (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.calculation_runs(id) on delete cascade,
  input_type text not null check (input_type in ('sales_business_day', 'recipe_version')),
  input_id uuid not null,
  created_at timestamptz not null default now(),
  unique (calculation_run_id, input_type, input_id)
);

create index calculation_run_inputs_run_id_idx
  on public.calculation_run_inputs(calculation_run_id);

create table public.daily_theoretical_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  calculation_run_id uuid not null references public.calculation_runs(id) on delete cascade,
  sales_item_id uuid not null references public.sales_items(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id),
  recipe_version_id uuid not null references public.recipe_versions(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  quantity_base numeric(20, 6) not null,
  unit_cost numeric(20, 4) not null default 0,
  theoretical_cost numeric(24, 6)
    generated always as (quantity_base * unit_cost) stored,
  created_at timestamptz not null default now(),
  check (quantity_base >= 0),
  check (unit_cost >= 0),
  unique (calculation_run_id, sales_item_id, inventory_item_id)
);

create index theoretical_usage_org_location_date_idx
  on public.daily_theoretical_usage(
    organization_id,
    location_id,
    business_date desc
  );
create index theoretical_usage_run_id_idx
  on public.daily_theoretical_usage(calculation_run_id);
create index theoretical_usage_sales_item_id_idx
  on public.daily_theoretical_usage(sales_item_id);
create index theoretical_usage_recipe_version_idx
  on public.daily_theoretical_usage(recipe_id, recipe_version_id);
create index theoretical_usage_inventory_item_id_idx
  on public.daily_theoretical_usage(inventory_item_id);

alter table public.recipes enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_version_components enable row level security;
alter table public.recipe_menu_item_mappings enable row level security;
alter table public.production_batches enable row level security;
alter table public.production_batch_components enable row level security;
alter table public.production_yield_variances enable row level security;
alter table public.sales_business_days enable row level security;
alter table public.sales_items enable row level security;
alter table public.calculation_runs enable row level security;
alter table public.calculation_run_inputs enable row level security;
alter table public.daily_theoretical_usage enable row level security;

create policy "recipes_select_member"
on public.recipes for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "recipes_write_manager"
on public.recipes for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "recipe_versions_select_member"
on public.recipe_versions for select to authenticated
using (
  exists (
    select 1 from public.recipes recipe
    where recipe.id = recipe_id
      and (select public.is_organization_member(recipe.organization_id))
  )
);
create policy "recipe_versions_write_manager"
on public.recipe_versions for all to authenticated
using (
  exists (
    select 1 from public.recipes recipe
    where recipe.id = recipe_id
      and (select public.is_organization_manager(recipe.organization_id))
  )
)
with check (
  exists (
    select 1 from public.recipes recipe
    where recipe.id = recipe_id
      and (select public.is_organization_manager(recipe.organization_id))
  )
);

create policy "recipe_components_select_member"
on public.recipe_version_components for select to authenticated
using (
  exists (
    select 1
    from public.recipe_versions version
    join public.recipes recipe on recipe.id = version.recipe_id
    where version.id = recipe_version_id
      and (select public.is_organization_member(recipe.organization_id))
  )
);
create policy "recipe_components_write_manager"
on public.recipe_version_components for all to authenticated
using (
  exists (
    select 1
    from public.recipe_versions version
    join public.recipes recipe on recipe.id = version.recipe_id
    where version.id = recipe_version_id
      and (select public.is_organization_manager(recipe.organization_id))
  )
)
with check (
  exists (
    select 1
    from public.recipe_versions version
    join public.recipes recipe on recipe.id = version.recipe_id
    where version.id = recipe_version_id
      and (select public.is_organization_manager(recipe.organization_id))
  )
);

create policy "recipe_mappings_select_member"
on public.recipe_menu_item_mappings for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "recipe_mappings_write_manager"
on public.recipe_menu_item_mappings for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "production_batches_select_member"
on public.production_batches for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "production_batches_insert_location_member"
on public.production_batches for insert to authenticated
with check (
  (select public.can_access_location(location_id))
  and (
    created_by = (select auth.uid())
    or (select public.is_organization_manager(organization_id))
  )
);
create policy "production_batches_update_creator_or_manager"
on public.production_batches for update to authenticated
using (
  created_by = (select auth.uid())
  or (select public.is_organization_manager(organization_id))
)
with check (
  created_by = (select auth.uid())
  or (select public.is_organization_manager(organization_id))
);

create policy "production_components_select_member"
on public.production_batch_components for select to authenticated
using (
  exists (
    select 1 from public.production_batches batch
    where batch.id = production_batch_id
      and (select public.is_organization_member(batch.organization_id))
  )
);
create policy "production_components_insert_creator_or_manager"
on public.production_batch_components for insert to authenticated
with check (
  exists (
    select 1 from public.production_batches batch
    where batch.id = production_batch_id
      and (
        batch.created_by = (select auth.uid())
        or (select public.is_organization_manager(batch.organization_id))
      )
  )
);

create policy "production_variances_select_member"
on public.production_yield_variances for select to authenticated
using (
  exists (
    select 1 from public.production_batches batch
    where batch.id = production_batch_id
      and (select public.is_organization_member(batch.organization_id))
  )
);
create policy "production_variances_insert_creator_or_manager"
on public.production_yield_variances for insert to authenticated
with check (
  exists (
    select 1 from public.production_batches batch
    where batch.id = production_batch_id
      and (
        batch.created_by = (select auth.uid())
        or (select public.is_organization_manager(batch.organization_id))
      )
  )
);

create policy "sales_days_select_member"
on public.sales_business_days for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "sales_days_write_manager"
on public.sales_business_days for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "sales_items_select_member"
on public.sales_items for select to authenticated
using (
  exists (
    select 1 from public.sales_business_days day
    where day.id = sales_business_day_id
      and (select public.is_organization_member(day.organization_id))
  )
);
create policy "sales_items_write_manager"
on public.sales_items for all to authenticated
using (
  exists (
    select 1 from public.sales_business_days day
    where day.id = sales_business_day_id
      and (select public.is_organization_manager(day.organization_id))
  )
)
with check (
  exists (
    select 1 from public.sales_business_days day
    where day.id = sales_business_day_id
      and (select public.is_organization_manager(day.organization_id))
  )
);

create policy "calculation_runs_select_member"
on public.calculation_runs for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "calculation_runs_write_manager"
on public.calculation_runs for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "calculation_inputs_select_member"
on public.calculation_run_inputs for select to authenticated
using (
  exists (
    select 1 from public.calculation_runs run
    where run.id = calculation_run_id
      and (select public.is_organization_member(run.organization_id))
  )
);
create policy "calculation_inputs_write_manager"
on public.calculation_run_inputs for all to authenticated
using (
  exists (
    select 1 from public.calculation_runs run
    where run.id = calculation_run_id
      and (select public.is_organization_manager(run.organization_id))
  )
)
with check (
  exists (
    select 1 from public.calculation_runs run
    where run.id = calculation_run_id
      and (select public.is_organization_manager(run.organization_id))
  )
);

create policy "theoretical_usage_select_member"
on public.daily_theoretical_usage for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "theoretical_usage_write_manager"
on public.daily_theoretical_usage for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "inventory_transactions_insert_production"
on public.inventory_transactions for insert to authenticated
with check (
  source_type = 'production_batch'
  and exists (
    select 1 from public.production_batches batch
    where batch.id = source_id
      and batch.organization_id = organization_id
      and batch.location_id = location_id
      and (
        batch.created_by = (select auth.uid())
        or (select public.is_organization_manager(batch.organization_id))
      )
  )
);

create policy "inventory_transaction_lines_insert_production"
on public.inventory_transaction_lines for insert to authenticated
with check (
  exists (
    select 1
    from public.inventory_transactions transaction
    join public.production_batches batch
      on batch.id = transaction.source_id
    where transaction.id = inventory_transaction_id
      and transaction.source_type = 'production_batch'
      and (
        batch.created_by = (select auth.uid())
        or (select public.is_organization_manager(batch.organization_id))
      )
  )
);

grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_versions to authenticated;
grant select, insert, update, delete on public.recipe_version_components to authenticated;
grant select, insert, update, delete on public.recipe_menu_item_mappings to authenticated;
grant select, insert, update on public.production_batches to authenticated;
grant select, insert on public.production_batch_components to authenticated;
grant select, insert on public.production_yield_variances to authenticated;
grant select, insert, update on public.sales_business_days to authenticated;
grant select, insert, update, delete on public.sales_items to authenticated;
grant select, insert, update on public.calculation_runs to authenticated;
grant select, insert, update, delete on public.calculation_run_inputs to authenticated;
grant select, insert, update, delete on public.daily_theoretical_usage to authenticated;

create or replace function public.activate_recipe_version(target_version_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_version public.recipe_versions%rowtype;
  target_recipe public.recipes%rowtype;
begin
  select version.* into target_version
  from public.recipe_versions version
  join public.recipes recipe on recipe.id = version.recipe_id
  where version.id = target_version_id
    and public.is_organization_manager(recipe.organization_id)
  for update of version;

  if target_version.id is null then
    raise exception 'Recipe version not found';
  end if;

  select * into target_recipe
  from public.recipes
  where id = target_version.recipe_id;

  if target_version.status <> 'draft' then
    raise exception 'Only draft recipe versions can be activated';
  end if;
  if target_version.output_quantity <= 0 then
    raise exception 'Recipe output yield must be positive';
  end if;
  if target_recipe.recipe_type <> 'menu_item'
    and target_recipe.output_inventory_item_id is null
  then
    raise exception 'Produced recipes require an output inventory item';
  end if;
  if not exists (
    select 1 from public.recipe_version_components component
    where component.recipe_version_id = target_version.id
  ) then
    raise exception 'Recipe version requires at least one component';
  end if;
  if exists (
    select 1
    from public.recipe_versions version
    where version.recipe_id = target_recipe.id
      and version.status = 'active'
      and version.id <> target_version.id
      and version.effective_from >= target_version.effective_from
  ) then
    raise exception 'Recipe version effective dates overlap';
  end if;

  if exists (
    with recursive dependencies(recipe_id, path) as (
      select
        component.component_recipe_id,
        array[target_recipe.id, component.component_recipe_id]
      from public.recipe_version_components component
      where component.recipe_version_id = target_version.id
        and component.component_recipe_id is not null

      union all

      select
        component.component_recipe_id,
        dependency.path || component.component_recipe_id
      from dependencies dependency
      join lateral (
        select version.id
        from public.recipe_versions version
        where version.recipe_id = dependency.recipe_id
          and version.status = 'active'
          and version.effective_from <= target_version.effective_from
          and (
            version.effective_to is null
            or version.effective_to >= target_version.effective_from
          )
        order by version.effective_from desc
        limit 1
      ) nested_version on true
      join public.recipe_version_components component
        on component.recipe_version_id = nested_version.id
        and component.component_recipe_id is not null
      where not component.component_recipe_id = any(dependency.path)
        or component.component_recipe_id = target_recipe.id
    )
    select 1
    from dependencies
    where recipe_id = target_recipe.id
  ) then
    raise exception 'Recipe dependency cycle detected';
  end if;

  update public.recipe_versions
  set effective_to = target_version.effective_from - 1
  where recipe_id = target_recipe.id
    and status = 'active'
    and effective_from < target_version.effective_from
    and (
      effective_to is null
      or effective_to >= target_version.effective_from
    );

  update public.recipe_versions
  set
    status = 'active',
    activated_by = auth.uid(),
    activated_at = now()
  where id = target_version.id;

  return target_version.id;
end;
$$;

revoke execute on function public.activate_recipe_version(uuid) from public;
grant execute on function public.activate_recipe_version(uuid) to authenticated;

create or replace function public.post_production_batch(target_batch_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_batch public.production_batches%rowtype;
  target_recipe public.recipes%rowtype;
  target_version public.recipe_versions%rowtype;
  consumption_transaction_id uuid;
  output_transaction_id uuid;
  component record;
  component_item_id uuid;
  component_storage_id uuid;
  component_quantity_base numeric;
  component_on_hand numeric;
  component_unit_cost numeric;
  consumed_value numeric := 0;
  output_factor numeric;
  output_quantity_base numeric;
  output_unit_cost numeric;
  expected_output_base numeric;
begin
  select * into target_batch
  from public.production_batches
  where id = target_batch_id
    and (
      created_by = auth.uid()
      or public.is_organization_manager(organization_id)
    )
  for update;

  if target_batch.id is null then
    raise exception 'Production batch not found';
  end if;
  if target_batch.status = 'posted' then
    return target_batch.id;
  end if;
  if target_batch.status <> 'draft' then
    raise exception 'Only draft production batches can be posted';
  end if;
  if not public.can_access_location(target_batch.location_id) then
    raise exception 'Location access required';
  end if;

  select * into target_recipe
  from public.recipes
  where id = target_batch.recipe_id;
  select * into target_version
  from public.recipe_versions
  where id = target_batch.recipe_version_id
    and recipe_id = target_batch.recipe_id;

  if target_recipe.recipe_type = 'menu_item'
    or target_recipe.output_inventory_item_id is null
  then
    raise exception 'Production requires a prep or batch recipe';
  end if;
  if target_version.status <> 'active' then
    raise exception 'Production requires an active recipe version';
  end if;
  if target_batch.actual_output_quantity <= 0 then
    raise exception 'Actual output must be positive';
  end if;

  select unit.conversion_factor_to_base into output_factor
  from public.units unit
  where unit.id = target_batch.output_unit_id;
  if output_factor is null then
    raise exception 'Output unit conversion is missing';
  end if;
  output_quantity_base := target_batch.actual_output_quantity * output_factor;
  expected_output_base :=
    coalesce(target_batch.planned_output_quantity, target_version.output_quantity)
    * output_factor;

  insert into public.inventory_transactions (
    organization_id,
    location_id,
    transaction_type,
    effective_at,
    source_type,
    source_id,
    idempotency_key,
    actor_id
  )
  values (
    target_batch.organization_id,
    target_batch.location_id,
    'production_consumption',
    target_batch.produced_at,
    'production_batch',
    target_batch.id,
    'production:' || target_batch.id::text || ':consumption',
    auth.uid()
  )
  returning id into consumption_transaction_id;

  for component in
    select
      recipe_component.*,
      unit.conversion_factor_to_base,
      nested_recipe.output_inventory_item_id as nested_output_item_id
    from public.recipe_version_components recipe_component
    join public.units unit on unit.id = recipe_component.unit_id
    left join public.recipes nested_recipe
      on nested_recipe.id = recipe_component.component_recipe_id
    where recipe_component.recipe_version_id = target_version.id
    order by recipe_component.line_order, recipe_component.created_at
  loop
    component_item_id := coalesce(
      component.component_inventory_item_id,
      component.nested_output_item_id
    );
    if component_item_id is null then
      raise exception 'Nested production component has no output item';
    end if;
    if component.conversion_factor_to_base is null then
      raise exception 'Component unit conversion is missing';
    end if;

    component_quantity_base :=
      component.quantity
      * component.conversion_factor_to_base
      * (
        coalesce(
          target_batch.planned_output_quantity,
          target_batch.actual_output_quantity
        )
        / target_version.output_quantity
      );

    select item.default_storage_location_id into component_storage_id
    from public.inventory_items item
    where item.id = component_item_id;
    if component_storage_id is null then
      raise exception 'Component storage location is missing';
    end if;

    select
      coalesce(on_hand.quantity, 0),
      coalesce(on_hand.weighted_average_cost, 0)
    into component_on_hand, component_unit_cost
    from (select 1) seed
    left join public.inventory_on_hand on_hand
      on on_hand.organization_id = target_batch.organization_id
      and on_hand.location_id = target_batch.location_id
      and on_hand.inventory_item_id = component_item_id
      and on_hand.storage_location_id = component_storage_id;

    if component_on_hand < component_quantity_base then
      raise exception 'Insufficient physical component on-hand';
    end if;

    insert into public.production_batch_components (
      production_batch_id,
      recipe_component_id,
      inventory_item_id,
      storage_location_id,
      quantity_base,
      unit_cost
    )
    values (
      target_batch.id,
      component.id,
      component_item_id,
      component_storage_id,
      component_quantity_base,
      component_unit_cost
    );

    insert into public.inventory_transaction_lines (
      inventory_transaction_id,
      inventory_item_id,
      storage_location_id,
      quantity,
      unit_cost,
      reason_code
    )
    values (
      consumption_transaction_id,
      component_item_id,
      component_storage_id,
      -component_quantity_base,
      component_unit_cost,
      'production_component'
    );

    consumed_value :=
      consumed_value + (component_quantity_base * component_unit_cost);
  end loop;

  output_unit_cost := consumed_value / output_quantity_base;

  insert into public.inventory_transactions (
    organization_id,
    location_id,
    transaction_type,
    effective_at,
    source_type,
    source_id,
    idempotency_key,
    actor_id
  )
  values (
    target_batch.organization_id,
    target_batch.location_id,
    'production_output',
    target_batch.produced_at,
    'production_batch',
    target_batch.id,
    'production:' || target_batch.id::text || ':output',
    auth.uid()
  )
  returning id into output_transaction_id;

  select item.default_storage_location_id into component_storage_id
  from public.inventory_items item
  where item.id = target_recipe.output_inventory_item_id;
  if component_storage_id is null then
    raise exception 'Output storage location is missing';
  end if;

  insert into public.inventory_transaction_lines (
    inventory_transaction_id,
    inventory_item_id,
    storage_location_id,
    quantity,
    unit_cost,
    reason_code
  )
  values (
    output_transaction_id,
    target_recipe.output_inventory_item_id,
    component_storage_id,
    output_quantity_base,
    output_unit_cost,
    'production_output'
  );

  insert into public.production_yield_variances (
    production_batch_id,
    expected_output_base,
    actual_output_base,
    variance_quantity_base,
    output_unit_cost
  )
  values (
    target_batch.id,
    expected_output_base,
    output_quantity_base,
    output_quantity_base - expected_output_base,
    output_unit_cost
  );

  update public.production_batches
  set status = 'posted', posted_at = now()
  where id = target_batch.id;

  return target_batch.id;
end;
$$;

revoke execute on function public.post_production_batch(uuid) from public;
grant execute on function public.post_production_batch(uuid) to authenticated;

create or replace function public.post_sales_import(target_import_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_import public.source_imports%rowtype;
  target_business_date date;
  sales_day_id uuid;
  calculation_run_id uuid;
  sales_item record;
begin
  select * into target_import
  from public.source_imports
  where id = target_import_id
    and public.is_organization_manager(organization_id)
  for update;

  if target_import.id is null then
    raise exception 'Sales import not found';
  end if;
  if target_import.source_type <> 'toast_pmix' then
    raise exception 'Only Toast PMIX imports can post sales';
  end if;

  select day.id into sales_day_id
  from public.sales_business_days day
  where day.source_import_id = target_import.id;
  if sales_day_id is not null then
    return sales_day_id;
  end if;

  select min((row.normalized_data ->> 'business_date')::date)
  into target_business_date
  from public.source_import_rows row
  where row.source_import_id = target_import.id;
  if target_business_date is null then
    raise exception 'Sales import has no business date';
  end if;
  if exists (
    select 1
    from public.source_import_rows row
    left join public.recipe_menu_item_mappings mapping
      on mapping.organization_id = target_import.organization_id
      and mapping.source_system = 'toast'
      and mapping.external_item_guid = row.normalized_data ->> 'item_guid'
      and mapping.active
    where row.source_import_id = target_import.id
      and mapping.id is null
  ) then
    raise exception 'Sales import contains unmapped menu items';
  end if;

  insert into public.sales_business_days (
    organization_id,
    location_id,
    source_import_id,
    business_date,
    net_sales,
    posted_by
  )
  select
    target_import.organization_id,
    target_import.location_id,
    target_import.id,
    target_business_date,
    coalesce(sum((row.normalized_data ->> 'net_sales')::numeric), 0),
    auth.uid()
  from public.source_import_rows row
  where row.source_import_id = target_import.id
  returning id into sales_day_id;

  insert into public.sales_items (
    sales_business_day_id,
    source_import_row_id,
    item_guid,
    item_name,
    recipe_id,
    recipe_version_id,
    quantity_sold,
    void_quantity,
    comp_quantity,
    theoretical_sale_quantity,
    net_sales
  )
  select
    sales_day_id,
    row.id,
    row.normalized_data ->> 'item_guid',
    coalesce(row.normalized_data ->> 'item_name', 'Unknown item'),
    mapping.recipe_id,
    version.id,
    coalesce((row.normalized_data ->> 'quantity_sold')::numeric, 0),
    coalesce((row.normalized_data ->> 'void_quantity')::numeric, 0),
    coalesce((row.normalized_data ->> 'comp_quantity')::numeric, 0),
    greatest(
      0,
      coalesce((row.normalized_data ->> 'quantity_sold')::numeric, 0)
      - coalesce((row.normalized_data ->> 'void_quantity')::numeric, 0)
    ),
    coalesce((row.normalized_data ->> 'net_sales')::numeric, 0)
  from public.source_import_rows row
  join public.recipe_menu_item_mappings mapping
    on mapping.organization_id = target_import.organization_id
    and mapping.source_system = 'toast'
    and mapping.external_item_guid = row.normalized_data ->> 'item_guid'
    and mapping.active
  join lateral (
    select candidate.id
    from public.recipe_versions candidate
    where candidate.recipe_id = mapping.recipe_id
      and candidate.status = 'active'
      and candidate.effective_from <= target_business_date
      and (
        candidate.effective_to is null
        or candidate.effective_to >= target_business_date
      )
    order by candidate.effective_from desc
    limit 1
  ) version on true
  where row.source_import_id = target_import.id;

  if (
    select count(*) from public.sales_items item
    where item.sales_business_day_id = sales_day_id
  ) <> (
    select count(*) from public.source_import_rows row
    where row.source_import_id = target_import.id
  ) then
    raise exception 'Sales import has no effective recipe version';
  end if;

  insert into public.calculation_runs (
    organization_id,
    location_id,
    calculation_type,
    calculation_version,
    business_date,
    status,
    started_by
  )
  values (
    target_import.organization_id,
    target_import.location_id,
    'theoretical_usage',
    '1.0.0',
    target_business_date,
    'running',
    auth.uid()
  )
  returning id into calculation_run_id;

  insert into public.calculation_run_inputs (
    calculation_run_id,
    input_type,
    input_id
  )
  values (calculation_run_id, 'sales_business_day', sales_day_id);

  for sales_item in
    select * from public.sales_items item
    where item.sales_business_day_id = sales_day_id
  loop
    insert into public.calculation_run_inputs (
      calculation_run_id,
      input_type,
      input_id
    )
    values (
      calculation_run_id,
      'recipe_version',
      sales_item.recipe_version_id
    )
    on conflict do nothing;

    insert into public.daily_theoretical_usage (
      organization_id,
      location_id,
      business_date,
      calculation_run_id,
      sales_item_id,
      recipe_id,
      recipe_version_id,
      inventory_item_id,
      quantity_base,
      unit_cost
    )
    with recursive recipe_tree as (
      select
        sales_item.recipe_id as recipe_id,
        sales_item.recipe_version_id as recipe_version_id,
        (
          sales_item.theoretical_sale_quantity
          / root_version.output_quantity
        )::numeric as recipe_factor
      from public.recipe_versions root_version
      where root_version.id = sales_item.recipe_version_id

      union all

      select
        component.component_recipe_id,
        nested_version.id,
        (
          tree.recipe_factor
          * component.quantity
          * component_unit.conversion_factor_to_base
          / (
            nested_version.output_quantity
            * nested_output_unit.conversion_factor_to_base
          )
        )::numeric
      from recipe_tree tree
      join public.recipe_version_components component
        on component.recipe_version_id = tree.recipe_version_id
        and component.component_recipe_id is not null
      join public.units component_unit on component_unit.id = component.unit_id
      join lateral (
        select candidate.*
        from public.recipe_versions candidate
        where candidate.recipe_id = component.component_recipe_id
          and candidate.status = 'active'
          and candidate.effective_from <= target_business_date
          and (
            candidate.effective_to is null
            or candidate.effective_to >= target_business_date
          )
        order by candidate.effective_from desc
        limit 1
      ) nested_version on true
      join public.units nested_output_unit
        on nested_output_unit.id = nested_version.output_unit_id
    ),
    expanded as (
      select
        component.component_inventory_item_id as inventory_item_id,
        sum(
          tree.recipe_factor
          * component.quantity
          * component_unit.conversion_factor_to_base
        )::numeric(20, 6) as quantity_base
      from recipe_tree tree
      join public.recipe_version_components component
        on component.recipe_version_id = tree.recipe_version_id
        and component.component_inventory_item_id is not null
      join public.units component_unit on component_unit.id = component.unit_id
      group by component.component_inventory_item_id
    )
    select
      target_import.organization_id,
      target_import.location_id,
      target_business_date,
      calculation_run_id,
      sales_item.id,
      sales_item.recipe_id,
      sales_item.recipe_version_id,
      expanded.inventory_item_id,
      expanded.quantity_base,
      coalesce(
        cost.weighted_average_cost,
        current_cost.weighted_average_cost,
        0
      )
    from expanded
    left join lateral (
      select snapshot.weighted_average_cost
      from public.inventory_item_cost_snapshots snapshot
      where snapshot.inventory_item_id = expanded.inventory_item_id
        and snapshot.effective_at < (target_business_date + 1)::timestamptz
      order by snapshot.effective_at desc
      limit 1
    ) cost on true
    left join lateral (
      select
        case
          when sum(on_hand.quantity) = 0 then 0::numeric
          else sum(on_hand.extended_value) / sum(on_hand.quantity)
        end as weighted_average_cost
      from public.inventory_on_hand on_hand
      where on_hand.organization_id = target_import.organization_id
        and on_hand.location_id = target_import.location_id
        and on_hand.inventory_item_id = expanded.inventory_item_id
    ) current_cost on true;
  end loop;

  update public.calculation_runs
  set status = 'completed', completed_at = now()
  where id = calculation_run_id;

  update public.source_imports
  set
    status = 'posted',
    approved_by = auth.uid(),
    approved_at = now()
  where id = target_import.id;

  return sales_day_id;
end;
$$;

revoke execute on function public.post_sales_import(uuid) from public;
grant execute on function public.post_sales_import(uuid) to authenticated;
