-- Slice 2: Opening Count and Inventory Ledger

create type public.inventory_period_status as enum (
  'draft',
  'count_in_progress',
  'count_complete',
  'closed',
  'reopened'
);

create type public.inventory_count_type as enum ('full', 'spot');

create type public.inventory_count_status as enum (
  'draft',
  'in_progress',
  'counted',
  'approved',
  'cancelled'
);

create type public.inventory_count_assignment_status as enum (
  'pending',
  'in_progress',
  'counted'
);

create type public.inventory_count_line_status as enum (
  'pending',
  'counted',
  'recount_requested'
);

create type public.inventory_transaction_type as enum (
  'opening_balance',
  'receipt',
  'receipt_reversal',
  'transfer_out',
  'transfer_in',
  'production_consumption',
  'production_output',
  'waste',
  'spill',
  'breakage',
  'comp_sample',
  'count_adjustment',
  'manual_adjustment',
  'closing_correction'
);

create table public.inventory_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status public.inventory_period_status not null default 'draft',
  opened_by uuid not null references public.profiles(id),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (location_id, period_start, period_end)
);

create index inventory_periods_org_location_status_idx
  on public.inventory_periods(organization_id, location_id, status);
create index inventory_periods_opened_by_idx
  on public.inventory_periods(opened_by);

create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  inventory_period_id uuid not null references public.inventory_periods(id) on delete cascade,
  count_type public.inventory_count_type not null,
  status public.inventory_count_status not null default 'draft',
  assigned_to uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index inventory_counts_org_location_status_idx
  on public.inventory_counts(organization_id, location_id, status);
create index inventory_counts_period_id_idx
  on public.inventory_counts(inventory_period_id);
create index inventory_counts_assigned_to_idx
  on public.inventory_counts(assigned_to);

create table public.inventory_count_assignments (
  id uuid primary key default gen_random_uuid(),
  inventory_count_id uuid not null references public.inventory_counts(id) on delete cascade,
  storage_location_id uuid not null references public.storage_locations(id),
  assigned_profile_id uuid not null references public.profiles(id),
  status public.inventory_count_assignment_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (inventory_count_id, storage_location_id)
);

create index inventory_count_assignments_count_id_idx
  on public.inventory_count_assignments(inventory_count_id);
create index inventory_count_assignments_assignee_status_idx
  on public.inventory_count_assignments(assigned_profile_id, status);
create index inventory_count_assignments_storage_location_id_idx
  on public.inventory_count_assignments(storage_location_id);

create table public.inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  inventory_count_assignment_id uuid not null references public.inventory_count_assignments(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  storage_location_id uuid not null references public.storage_locations(id),
  counted_quantity numeric(20, 6),
  counted_tenths numeric(2, 1) not null default 0,
  is_open_container boolean not null default false,
  expected_quantity numeric(20, 6) not null default 0,
  notes text not null default '',
  status public.inventory_count_line_status not null default 'pending',
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (counted_quantity is null or counted_quantity >= 0),
  check (counted_tenths >= 0 and counted_tenths <= 0.9),
  unique (inventory_count_assignment_id, inventory_item_id)
);

create trigger set_inventory_count_lines_updated_at
  before update on public.inventory_count_lines
  for each row execute function public.set_updated_at();

create index inventory_count_lines_assignment_id_idx
  on public.inventory_count_lines(inventory_count_assignment_id);
create index inventory_count_lines_item_location_idx
  on public.inventory_count_lines(inventory_item_id, storage_location_id);
create index inventory_count_lines_status_idx
  on public.inventory_count_lines(status);
create index inventory_count_lines_approved_by_idx
  on public.inventory_count_lines(approved_by);

create table public.inventory_count_recounts (
  id uuid primary key default gen_random_uuid(),
  count_line_id uuid not null references public.inventory_count_lines(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  counted_quantity numeric(20, 6) not null,
  counted_tenths numeric(2, 1) not null default 0,
  reason text not null,
  created_at timestamptz not null default now(),
  check (counted_quantity >= 0),
  check (counted_tenths >= 0 and counted_tenths <= 0.9)
);

create index inventory_count_recounts_line_id_idx
  on public.inventory_count_recounts(count_line_id);
create index inventory_count_recounts_profile_id_idx
  on public.inventory_count_recounts(profile_id);

create table public.inventory_item_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  inventory_period_id uuid not null references public.inventory_periods(id) on delete cascade,
  weighted_average_cost numeric(20, 4) not null default 0,
  effective_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (weighted_average_cost >= 0)
);

create index inventory_item_cost_snapshots_item_effective_idx
  on public.inventory_item_cost_snapshots(inventory_item_id, effective_at desc);
create index inventory_item_cost_snapshots_period_id_idx
  on public.inventory_item_cost_snapshots(inventory_period_id);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  transaction_type public.inventory_transaction_type not null,
  effective_at timestamptz not null,
  posted_at timestamptz not null default now(),
  source_type text not null,
  source_id uuid not null,
  source_line_id uuid,
  approval_id uuid,
  reversal_id uuid references public.inventory_transactions(id),
  idempotency_key text not null unique,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index inventory_transactions_org_location_effective_idx
  on public.inventory_transactions(organization_id, location_id, effective_at);
create index inventory_transactions_source_idx
  on public.inventory_transactions(source_type, source_id);
create index inventory_transactions_actor_id_idx
  on public.inventory_transactions(actor_id);
create index inventory_transactions_reversal_id_idx
  on public.inventory_transactions(reversal_id);

create table public.inventory_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  inventory_transaction_id uuid not null references public.inventory_transactions(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  storage_location_id uuid not null references public.storage_locations(id),
  quantity numeric(20, 6) not null,
  unit_cost numeric(20, 4) not null default 0,
  extended_value numeric(24, 6)
    generated always as (quantity * unit_cost) stored,
  reason_code text,
  created_at timestamptz not null default now(),
  check (quantity <> 0),
  check (unit_cost >= 0)
);

create index inventory_transaction_lines_transaction_id_idx
  on public.inventory_transaction_lines(inventory_transaction_id);
create index inventory_transaction_lines_item_location_idx
  on public.inventory_transaction_lines(inventory_item_id, storage_location_id);

alter table public.inventory_periods enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_assignments enable row level security;
alter table public.inventory_count_lines enable row level security;
alter table public.inventory_count_recounts enable row level security;
alter table public.inventory_item_cost_snapshots enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_transaction_lines enable row level security;

create policy "inventory_periods_select_member"
on public.inventory_periods
for select to authenticated
using ((select public.is_organization_member(organization_id)));

create policy "inventory_periods_insert_manager"
on public.inventory_periods
for insert to authenticated
with check ((select public.is_organization_manager(organization_id)));

create policy "inventory_periods_update_manager"
on public.inventory_periods
for update to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "inventory_counts_select_member"
on public.inventory_counts
for select to authenticated
using ((select public.is_organization_member(organization_id)));

create policy "inventory_counts_insert_manager"
on public.inventory_counts
for insert to authenticated
with check ((select public.is_organization_manager(organization_id)));

create policy "inventory_counts_update_manager_or_assignee"
on public.inventory_counts
for update to authenticated
using (
  (select public.is_organization_manager(organization_id))
  or assigned_to = (select auth.uid())
)
with check (
  (select public.is_organization_manager(organization_id))
  or assigned_to = (select auth.uid())
);

create policy "inventory_count_assignments_select_accessible"
on public.inventory_count_assignments
for select to authenticated
using (
  assigned_profile_id = (select auth.uid())
  or exists (
    select 1
    from public.inventory_counts count
    where count.id = inventory_count_id
      and (select public.is_organization_manager(count.organization_id))
  )
);

create policy "inventory_count_assignments_insert_manager"
on public.inventory_count_assignments
for insert to authenticated
with check (
  exists (
    select 1
    from public.inventory_counts count
    where count.id = inventory_count_id
      and (select public.is_organization_manager(count.organization_id))
  )
);

create policy "inventory_count_assignments_update_accessible"
on public.inventory_count_assignments
for update to authenticated
using (
  assigned_profile_id = (select auth.uid())
  or exists (
    select 1
    from public.inventory_counts count
    where count.id = inventory_count_id
      and (select public.is_organization_manager(count.organization_id))
  )
)
with check (
  assigned_profile_id = (select auth.uid())
  or exists (
    select 1
    from public.inventory_counts count
    where count.id = inventory_count_id
      and (select public.is_organization_manager(count.organization_id))
  )
);

create policy "inventory_count_lines_select_accessible"
on public.inventory_count_lines
for select to authenticated
using (
  exists (
    select 1
    from public.inventory_count_assignments assignment
    join public.inventory_counts count
      on count.id = assignment.inventory_count_id
    where assignment.id = inventory_count_assignment_id
      and (
        assignment.assigned_profile_id = (select auth.uid())
        or (select public.is_organization_manager(count.organization_id))
      )
  )
);

create policy "inventory_count_lines_insert_manager"
on public.inventory_count_lines
for insert to authenticated
with check (
  exists (
    select 1
    from public.inventory_count_assignments assignment
    join public.inventory_counts count
      on count.id = assignment.inventory_count_id
    where assignment.id = inventory_count_assignment_id
      and (select public.is_organization_manager(count.organization_id))
  )
);

create policy "inventory_count_lines_update_accessible"
on public.inventory_count_lines
for update to authenticated
using (
  exists (
    select 1
    from public.inventory_count_assignments assignment
    join public.inventory_counts count
      on count.id = assignment.inventory_count_id
    where assignment.id = inventory_count_assignment_id
      and (
        assignment.assigned_profile_id = (select auth.uid())
        or (select public.is_organization_manager(count.organization_id))
      )
  )
)
with check (
  exists (
    select 1
    from public.inventory_count_assignments assignment
    join public.inventory_counts count
      on count.id = assignment.inventory_count_id
    where assignment.id = inventory_count_assignment_id
      and (
        assignment.assigned_profile_id = (select auth.uid())
        or (select public.is_organization_manager(count.organization_id))
      )
  )
);

create policy "inventory_count_recounts_select_accessible"
on public.inventory_count_recounts
for select to authenticated
using (
  exists (
    select 1
    from public.inventory_count_lines line
    join public.inventory_count_assignments assignment
      on assignment.id = line.inventory_count_assignment_id
    join public.inventory_counts count
      on count.id = assignment.inventory_count_id
    where line.id = count_line_id
      and (
        assignment.assigned_profile_id = (select auth.uid())
        or (select public.is_organization_manager(count.organization_id))
      )
  )
);

create policy "inventory_count_recounts_insert_accessible"
on public.inventory_count_recounts
for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.inventory_count_lines line
    join public.inventory_count_assignments assignment
      on assignment.id = line.inventory_count_assignment_id
    join public.inventory_counts count
      on count.id = assignment.inventory_count_id
    where line.id = count_line_id
      and (
        assignment.assigned_profile_id = (select auth.uid())
        or (select public.is_organization_manager(count.organization_id))
      )
  )
);

create policy "inventory_item_cost_snapshots_select_member"
on public.inventory_item_cost_snapshots
for select to authenticated
using (
  exists (
    select 1
    from public.inventory_periods period
    where period.id = inventory_period_id
      and (select public.is_organization_member(period.organization_id))
  )
);

create policy "inventory_item_cost_snapshots_insert_manager"
on public.inventory_item_cost_snapshots
for insert to authenticated
with check (
  exists (
    select 1
    from public.inventory_periods period
    where period.id = inventory_period_id
      and (select public.is_organization_manager(period.organization_id))
  )
);

create policy "inventory_transactions_select_member"
on public.inventory_transactions
for select to authenticated
using ((select public.is_organization_member(organization_id)));

create policy "inventory_transactions_insert_manager"
on public.inventory_transactions
for insert to authenticated
with check ((select public.is_organization_manager(organization_id)));

create policy "inventory_transaction_lines_select_member"
on public.inventory_transaction_lines
for select to authenticated
using (
  exists (
    select 1
    from public.inventory_transactions transaction
    where transaction.id = inventory_transaction_id
      and (select public.is_organization_member(transaction.organization_id))
  )
);

create policy "inventory_transaction_lines_insert_manager"
on public.inventory_transaction_lines
for insert to authenticated
with check (
  exists (
    select 1
    from public.inventory_transactions transaction
    where transaction.id = inventory_transaction_id
      and (select public.is_organization_manager(transaction.organization_id))
  )
);

grant select, insert, update on public.inventory_periods to authenticated;
grant select, insert, update on public.inventory_counts to authenticated;
grant select, insert, update on public.inventory_count_assignments to authenticated;
grant select, insert, update on public.inventory_count_lines to authenticated;
grant select, insert on public.inventory_count_recounts to authenticated;
grant select, insert on public.inventory_item_cost_snapshots to authenticated;
grant select, insert on public.inventory_transactions to authenticated;
grant select, insert on public.inventory_transaction_lines to authenticated;

create view public.inventory_on_hand
with (security_invoker = true)
as
select
  transaction.organization_id,
  transaction.location_id,
  line.inventory_item_id,
  line.storage_location_id,
  sum(line.quantity)::numeric(20, 6) as quantity,
  case
    when sum(line.quantity) = 0 then 0::numeric
    else (sum(line.extended_value) / sum(line.quantity))::numeric(20, 4)
  end as weighted_average_cost,
  sum(line.extended_value)::numeric(24, 6) as extended_value,
  max(transaction.effective_at) as last_movement_at
from public.inventory_transaction_lines line
join public.inventory_transactions transaction
  on transaction.id = line.inventory_transaction_id
group by
  transaction.organization_id,
  transaction.location_id,
  line.inventory_item_id,
  line.storage_location_id;

create view public.negative_inventory
with (security_invoker = true)
as
select *
from public.inventory_on_hand
where quantity < 0;

grant select on public.inventory_on_hand to authenticated;
grant select on public.negative_inventory to authenticated;

create or replace function public.approve_inventory_count_line(target_line_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_organization_id uuid;
  target_status public.inventory_count_line_status;
begin
  select count.organization_id, line.status
  into target_organization_id, target_status
  from public.inventory_count_lines line
  join public.inventory_count_assignments assignment
    on assignment.id = line.inventory_count_assignment_id
  join public.inventory_counts count
    on count.id = assignment.inventory_count_id
  where line.id = target_line_id
  for update of line;

  if target_organization_id is null then
    raise exception 'Inventory count line not found';
  end if;

  if not public.is_organization_manager(target_organization_id) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;

  if target_status <> 'counted' then
    raise exception 'Only counted lines can be approved';
  end if;

  update public.inventory_count_lines
  set
    approved_by = auth.uid(),
    approved_at = now()
  where id = target_line_id;

  return target_line_id;
end;
$$;

grant execute on function public.approve_inventory_count_line(uuid)
  to authenticated;

create or replace function public.approve_inventory_count(target_count_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_count public.inventory_counts%rowtype;
  existing_transaction_id uuid;
  posted_transaction_id uuid;
  posting_type public.inventory_transaction_type;
begin
  select *
  into target_count
  from public.inventory_counts
  where id = target_count_id
  for update;

  if target_count.id is null then
    raise exception 'Inventory count not found';
  end if;

  if not public.is_organization_manager(target_count.organization_id) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;

  select id
  into existing_transaction_id
  from public.inventory_transactions
  where idempotency_key = 'count:' || target_count_id::text || ':approval';

  if existing_transaction_id is not null then
    return existing_transaction_id;
  end if;

  if target_count.status <> 'counted' then
    raise exception 'Count must be completed before approval';
  end if;

  if exists (
    select 1
    from public.inventory_count_lines line
    join public.inventory_count_assignments assignment
      on assignment.id = line.inventory_count_assignment_id
    where assignment.inventory_count_id = target_count_id
      and (
        line.status <> 'counted'
        or line.counted_quantity is null
      )
  ) then
    raise exception 'Every count line must be counted before approval';
  end if;

  if target_count.count_type = 'full'
    and not exists (
      select 1
      from public.inventory_transactions transaction
      where transaction.organization_id = target_count.organization_id
        and transaction.location_id = target_count.location_id
    )
  then
    posting_type := 'opening_balance';
  else
    posting_type := 'count_adjustment';
  end if;

  insert into public.inventory_transactions (
    organization_id,
    location_id,
    transaction_type,
    effective_at,
    source_type,
    source_id,
    approval_id,
    idempotency_key,
    actor_id
  )
  values (
    target_count.organization_id,
    target_count.location_id,
    posting_type,
    now(),
    'inventory_count',
    target_count.id,
    target_count.id,
    'count:' || target_count.id::text || ':approval',
    auth.uid()
  )
  returning id into posted_transaction_id;

  insert into public.inventory_transaction_lines (
    inventory_transaction_id,
    inventory_item_id,
    storage_location_id,
    quantity,
    unit_cost,
    reason_code
  )
  select
    posted_transaction_id,
    line.inventory_item_id,
    line.storage_location_id,
    case
      when posting_type = 'opening_balance'
        then (
          line.counted_quantity
          + case when line.is_open_container then line.counted_tenths else 0 end
        ) * coalesce(count_unit.conversion_factor_to_base, 1)
      else (
        line.counted_quantity
        + case when line.is_open_container then line.counted_tenths else 0 end
      ) * coalesce(count_unit.conversion_factor_to_base, 1)
        - coalesce(on_hand.quantity, 0)
    end as posting_quantity,
    coalesce(cost.weighted_average_cost, 0),
    case
      when posting_type = 'opening_balance' then 'opening_count'
      else 'approved_count'
    end
  from public.inventory_count_lines line
  join public.inventory_count_assignments assignment
    on assignment.id = line.inventory_count_assignment_id
  join public.inventory_items item
    on item.id = line.inventory_item_id
  join public.units count_unit
    on count_unit.id = coalesce(item.count_unit_id, item.base_unit_id)
  left join public.inventory_on_hand on_hand
    on on_hand.organization_id = target_count.organization_id
    and on_hand.location_id = target_count.location_id
    and on_hand.inventory_item_id = line.inventory_item_id
    and on_hand.storage_location_id = line.storage_location_id
  left join lateral (
    select snapshot.weighted_average_cost
    from public.inventory_item_cost_snapshots snapshot
    where snapshot.inventory_item_id = line.inventory_item_id
      and snapshot.inventory_period_id = target_count.inventory_period_id
    order by snapshot.effective_at desc
    limit 1
  ) cost on true
  where assignment.inventory_count_id = target_count.id
    and (
      case
        when posting_type = 'opening_balance'
          then (
            line.counted_quantity
            + case when line.is_open_container then line.counted_tenths else 0 end
          ) * coalesce(count_unit.conversion_factor_to_base, 1)
        else (
          line.counted_quantity
          + case when line.is_open_container then line.counted_tenths else 0 end
        ) * coalesce(count_unit.conversion_factor_to_base, 1)
          - coalesce(on_hand.quantity, 0)
      end
    ) <> 0;

  update public.inventory_count_lines line
  set
    approved_by = auth.uid(),
    approved_at = coalesce(line.approved_at, now())
  from public.inventory_count_assignments assignment
  where assignment.id = line.inventory_count_assignment_id
    and assignment.inventory_count_id = target_count.id;

  update public.inventory_counts
  set
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now()
  where id = target_count.id;

  update public.inventory_periods
  set status = 'count_complete'
  where id = target_count.inventory_period_id;

  return posted_transaction_id;
end;
$$;

grant execute on function public.approve_inventory_count(uuid) to authenticated;
