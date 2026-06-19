-- Period close engine, actual COGS, variance, and locking

alter type public.inventory_period_status
  add value 'close_in_progress' before 'closed';

alter table public.calculation_runs
  drop constraint if exists calculation_runs_calculation_type_check;

alter table public.calculation_runs
  add constraint calculation_runs_calculation_type_check
  check (calculation_type in ('theoretical_usage', 'period_close'));

create table public.period_cogs_results (
  id uuid primary key default gen_random_uuid(),
  inventory_period_id uuid not null references public.inventory_periods(id) on delete cascade,
  calculation_run_id uuid not null references public.calculation_runs(id) on delete cascade,
  actual_cogs numeric(24, 6) not null,
  opening_value numeric(24, 6) not null,
  purchases_value numeric(24, 6) not null,
  closing_value numeric(24, 6) not null,
  transfers_in numeric(24, 6) not null default 0,
  transfers_out numeric(24, 6) not null default 0,
  known_loss_value numeric(24, 6) not null default 0,
  theoretical_cogs numeric(24, 6) not null default 0,
  variance_value numeric(24, 6)
    generated always as (actual_cogs - theoretical_cogs) stored,
  variance_pct numeric(8, 4)
    generated always as (
      case when theoretical_cogs > 0
        then ((actual_cogs - theoretical_cogs) / theoretical_cogs) * 100
        else null
      end
    ) stored,
  created_at timestamptz not null default now(),
  unique (inventory_period_id, calculation_run_id)
);

create index period_cogs_results_period_idx
  on public.period_cogs_results(inventory_period_id);

create table public.period_variance_results (
  id uuid primary key default gen_random_uuid(),
  inventory_period_id uuid not null references public.inventory_periods(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  calculation_run_id uuid not null references public.calculation_runs(id) on delete cascade,
  actual_usage numeric(24, 6) not null,
  actual_cost numeric(24, 6) not null,
  theoretical_usage numeric(24, 6) not null,
  theoretical_cost numeric(24, 6) not null,
  quantity_variance numeric(24, 6)
    generated always as (actual_usage - theoretical_usage) stored,
  cost_variance numeric(24, 6)
    generated always as (actual_cost - theoretical_cost) stored,
  variance_pct numeric(8, 4)
    generated always as (
      case when theoretical_cost > 0
        then ((actual_cost - theoretical_cost) / theoretical_cost) * 100
        else null
      end
    ) stored,
  created_at timestamptz not null default now(),
  unique (inventory_period_id, inventory_item_id)
);

create index period_variance_results_period_idx
  on public.period_variance_results(inventory_period_id);
create index period_variance_results_item_idx
  on public.period_variance_results(inventory_item_id);

alter table public.period_cogs_results enable row level security;
alter table public.period_variance_results enable row level security;

create policy "period_cogs_results_select_member"
on public.period_cogs_results for select to authenticated
using (
  exists (
    select 1 from public.inventory_periods period
    where period.id = inventory_period_id
      and public.is_organization_member(period.organization_id)
  )
);

create policy "period_cogs_results_write_manager"
on public.period_cogs_results for all to authenticated
using (
  exists (
    select 1 from public.inventory_periods period
    where period.id = inventory_period_id
      and public.is_organization_manager(period.organization_id)
  )
)
with check (
  exists (
    select 1 from public.inventory_periods period
    where period.id = inventory_period_id
      and public.is_organization_manager(period.organization_id)
  )
);

create policy "period_variance_results_select_member"
on public.period_variance_results for select to authenticated
using (
  exists (
    select 1 from public.inventory_periods period
    where period.id = inventory_period_id
      and public.is_organization_member(period.organization_id)
  )
);

create policy "period_variance_results_write_manager"
on public.period_variance_results for all to authenticated
using (
  exists (
    select 1 from public.inventory_periods period
    where period.id = inventory_period_id
      and public.is_organization_manager(period.organization_id)
  )
)
with check (
  exists (
    select 1 from public.inventory_periods period
    where period.id = inventory_period_id
      and public.is_organization_manager(period.organization_id)
  )
);

grant select on public.period_cogs_results to authenticated;
grant select on public.period_variance_results to authenticated;
grant insert, update on public.period_cogs_results to authenticated;
grant insert, update on public.period_variance_results to authenticated;

-- Close period RPC
create or replace function public.close_period(target_period_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_period public.inventory_periods%rowtype;
  location_id uuid;
  organization_id uuid;
  calc_run_id uuid;
  opening_value numeric(24, 6);
  purchases_value numeric(24, 6);
  closing_value numeric(24, 6);
  transfers_in numeric(24, 6);
  transfers_out numeric(24, 6);
  known_loss numeric(24, 6);
  actual_cogs numeric(24, 6);
  theoretical_cogs numeric(24, 6);
begin
  select * into target_period
  from public.inventory_periods
  where id = target_period_id
  for update;

  if target_period.id is null then
    raise exception 'Inventory period not found';
  end if;
  if not public.is_organization_manager(target_period.organization_id) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;
  if target_period.status in ('closed', 'close_in_progress') then
    raise exception 'Period is already closed or close is in progress';
  end if;

  update public.inventory_periods
  set status = 'close_in_progress'
  where id = target_period.id;

  organization_id := target_period.organization_id;
  location_id := target_period.location_id;

  -- Create calculation run
  insert into public.calculation_runs (
    organization_id,
    location_id,
    calculation_type,
    calculation_version,
    business_date,
    started_by
  )
  values (
    organization_id,
    location_id,
    'period_close',
    '1.0',
    target_period.period_end,
    auth.uid()
  )
  returning id into calc_run_id;

  -- Opening inventory value: sum of cost snapshots at period start
  select coalesce(sum(extended_value), 0)
  into opening_value
  from public.inventory_on_hand on_hand
  where on_hand.organization_id = organization_id
    and on_hand.location_id = location_id;

  -- Purchases: sum of receipt transactions within period
  select coalesce(sum(line.quantity * line.unit_cost), 0)
  into purchases_value
  from public.inventory_transactions transaction
  join public.inventory_transaction_lines line
    on line.inventory_transaction_id = transaction.id
  where transaction.organization_id = organization_id
    and transaction.location_id = location_id
    and transaction.transaction_type = 'receipt'
    and transaction.effective_at::date
      between target_period.period_start and target_period.period_end;

  -- Closing inventory value from on-hand at period end
  select coalesce(sum(extended_value), 0)
  into closing_value
  from public.inventory_on_hand on_hand
  where on_hand.organization_id = organization_id
    and on_hand.location_id = location_id;

  -- Transfers in/out
  select
    coalesce(sum(line.quantity * line.unit_cost) filter (
      where transaction.transaction_type = 'transfer_in'
      and transaction.effective_at::date
        between target_period.period_start and target_period.period_end
    ), 0),
    coalesce(sum(line.quantity * line.unit_cost) filter (
      where transaction.transaction_type = 'transfer_out'
      and transaction.effective_at::date
        between target_period.period_start and target_period.period_end
    ), 0)
  into transfers_in, transfers_out
  from public.inventory_transactions transaction
  join public.inventory_transaction_lines line
    on line.inventory_transaction_id = transaction.id
  where transaction.organization_id = organization_id
    and transaction.location_id = location_id;

  -- Known loss: waste, spill, breakage transactions
  select coalesce(sum(abs(line.quantity) * line.unit_cost), 0)
  into known_loss
  from public.inventory_transactions transaction
  join public.inventory_transaction_lines line
    on line.inventory_transaction_id = transaction.id
  where transaction.organization_id = organization_id
    and transaction.location_id = location_id
    and transaction.transaction_type in ('waste', 'spill', 'breakage')
    and transaction.effective_at::date
      between target_period.period_start and target_period.period_end;

  -- Actual COGS = opening + purchases + transfers_in - closing - transfers_out
  actual_cogs := opening_value + purchases_value + transfers_in
    - closing_value - transfers_out;

  -- Theoretical COGS from daily_theoretical_usage
  select coalesce(sum(total_cost), 0)
  into theoretical_cogs
  from public.daily_theoretical_usage usage
  where usage.organization_id = organization_id
    and usage.location_id = location_id
    and usage.business_date
      between target_period.period_start and target_period.period_end;

  insert into public.period_cogs_results (
    inventory_period_id,
    calculation_run_id,
    actual_cogs,
    opening_value,
    purchases_value,
    closing_value,
    transfers_in,
    transfers_out,
    known_loss_value,
    theoretical_cogs
  )
  values (
    target_period.id,
    calc_run_id,
    actual_cogs,
    opening_value,
    purchases_value,
    closing_value,
    transfers_in,
    transfers_out,
    known_loss,
    theoretical_cogs
  );

  -- Per-item variance
  insert into public.period_variance_results (
    inventory_period_id,
    inventory_item_id,
    calculation_run_id,
    actual_usage,
    actual_cost,
    theoretical_usage,
    theoretical_cost
  )
  select
    target_period.id,
    on_hand.inventory_item_id,
    calc_run_id,
    abs(coalesce(on_hand.usage_quantity, 0)),
    abs(coalesce(on_hand.usage_value, 0)),
    coalesce(usage.total_usage, 0),
    coalesce(usage.total_cost, 0)
  from (
    select
      line.inventory_item_id,
      sum(line.quantity) as usage_quantity,
      sum(line.quantity * line.unit_cost) as usage_value
    from public.inventory_transactions transaction
    join public.inventory_transaction_lines line
      on line.inventory_transaction_id = transaction.id
    where transaction.organization_id = organization_id
      and transaction.location_id = location_id
      and transaction.transaction_type in ('production_consumption', 'waste', 'spill', 'breakage')
      and transaction.effective_at::date
        between target_period.period_start and target_period.period_end
    group by line.inventory_item_id
  ) on_hand
  full join (
    select
      inventory_item_id,
      sum(total_usage) as total_usage,
      sum(total_cost) as total_cost
    from public.daily_theoretical_usage usage
    where usage.organization_id = organization_id
      and usage.location_id = location_id
      and usage.business_date
        between target_period.period_start and target_period.period_end
    group by inventory_item_id
  ) usage
    on usage.inventory_item_id = on_hand.inventory_item_id;

  update public.calculation_runs
  set status = 'completed', completed_at = now()
  where id = calc_run_id;

  update public.inventory_periods
  set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where id = target_period.id;

  return target_period.id;
end;
$$;

grant execute on function public.close_period(uuid) to authenticated;

-- Reopen period RPC
create or replace function public.reopen_period(target_period_id uuid, reason text)
returns uuid
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_organization_manager(
    (select organization_id from public.inventory_periods where id = target_period_id)
  ) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;

  if (select status from public.inventory_periods where id = target_period_id) <> 'closed' then
    raise exception 'Only closed periods can be reopened';
  end if;

  update public.inventory_periods
  set status = 'reopened'
  where id = target_period_id;

  return target_period_id;
end;
$$;

grant execute on function public.reopen_period(uuid, text) to authenticated;
