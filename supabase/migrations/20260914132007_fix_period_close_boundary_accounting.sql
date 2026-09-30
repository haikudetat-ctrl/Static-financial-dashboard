-- Value historical inventory from signed ledger values, never today's on-hand
-- view or a future cost snapshot. Opening-balance postings initialize inventory
-- (including a first count during the period); they are not negative usage.
create or replace function public.close_period(target_period_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_period public.inventory_periods%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_run uuid;
  v_opening numeric;
  v_closing numeric;
  v_purchases numeric;
  v_transfer_in numeric;
  v_transfer_out numeric;
  v_loss numeric;
  v_theoretical numeric;
begin
  select p.* into v_period from public.inventory_periods p
  where p.id = target_period_id for update;
  if v_period.id is null then
    raise exception 'Inventory period not found';
  end if;
  if not public.is_organization_manager(v_period.organization_id) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;
  if v_period.status in ('closed', 'close_in_progress') then
    raise exception 'Period is already closed or close is in progress';
  end if;

  select (v_period.period_start + l.business_day_cutoff) at time zone l.timezone,
    ((v_period.period_end + 1) + l.business_day_cutoff) at time zone l.timezone
  into v_start, v_end from public.locations l
  where l.id = v_period.location_id and l.organization_id = v_period.organization_id;
  if v_start is null or v_end is null then
    raise exception 'Period location not found';
  end if;

  update public.inventory_periods set status = 'close_in_progress' where id = v_period.id;
  insert into public.calculation_runs (
    organization_id, location_id, calculation_type, calculation_version, business_date, started_by
  ) values (
    v_period.organization_id, v_period.location_id, 'period_close', '2.0', v_period.period_end, auth.uid()
  ) returning id into v_run;

  select
    coalesce(sum(l.extended_value) filter (
      where t.effective_at < v_start or t.transaction_type = 'opening_balance'), 0),
    coalesce(sum(l.extended_value), 0),
    coalesce(sum(l.extended_value) filter (where t.effective_at >= v_start
      and t.transaction_type in ('receipt', 'receipt_reversal')), 0),
    coalesce(sum(l.extended_value) filter (where t.effective_at >= v_start
      and t.transaction_type = 'transfer_in'), 0),
    -coalesce(sum(l.extended_value) filter (where t.effective_at >= v_start
      and t.transaction_type = 'transfer_out'), 0),
    -coalesce(sum(l.extended_value) filter (where t.effective_at >= v_start
      and t.transaction_type in ('waste', 'spill', 'breakage')), 0)
  into v_opening, v_closing, v_purchases, v_transfer_in, v_transfer_out, v_loss
  from public.inventory_transactions t
  join public.inventory_transaction_lines l on l.inventory_transaction_id = t.id
  where t.organization_id = v_period.organization_id and t.location_id = v_period.location_id
    and t.effective_at < v_end;

  select coalesce(sum(u.theoretical_cost), 0) into v_theoretical
  from public.daily_theoretical_usage u
  where u.organization_id = v_period.organization_id and u.location_id = v_period.location_id
    and u.business_date between v_period.period_start and v_period.period_end;

  insert into public.period_cogs_results (
    inventory_period_id, calculation_run_id, opening_value, purchases_value, closing_value,
    transfers_in, transfers_out, known_loss_value, actual_cogs, theoretical_cogs
  ) values (
    v_period.id, v_run, v_opening, v_purchases, v_closing, v_transfer_in, v_transfer_out,
    v_loss, v_opening + v_purchases + v_transfer_in - v_transfer_out - v_closing, v_theoretical
  );

  -- Algebraically identical to opening + net purchases + net transfers - closing.
  -- Include adjustments, samples and production output; do not hide gains with abs().
  insert into public.period_variance_results (
    inventory_period_id, inventory_item_id, calculation_run_id,
    actual_usage, actual_cost, theoretical_usage, theoretical_cost
  )
  select v_period.id, coalesce(a.inventory_item_id, u.inventory_item_id), v_run,
    coalesce(a.quantity, 0), coalesce(a.cost, 0), coalesce(u.quantity, 0), coalesce(u.cost, 0)
  from (
    select l.inventory_item_id, -sum(l.quantity) as quantity, -sum(l.extended_value) as cost
    from public.inventory_transactions t
    join public.inventory_transaction_lines l on l.inventory_transaction_id = t.id
    where t.organization_id = v_period.organization_id and t.location_id = v_period.location_id
      and t.effective_at >= v_start and t.effective_at < v_end
      and t.transaction_type not in ('opening_balance', 'receipt', 'receipt_reversal', 'transfer_in', 'transfer_out')
    group by l.inventory_item_id
  ) a
  full join (
    select u.inventory_item_id, sum(u.quantity_base) as quantity, sum(u.theoretical_cost) as cost
    from public.daily_theoretical_usage u
    where u.organization_id = v_period.organization_id and u.location_id = v_period.location_id
      and u.business_date between v_period.period_start and v_period.period_end
    group by u.inventory_item_id
  ) u on u.inventory_item_id = a.inventory_item_id
  on conflict (inventory_period_id, inventory_item_id) do update set
    calculation_run_id = excluded.calculation_run_id,
    actual_usage = excluded.actual_usage, actual_cost = excluded.actual_cost,
    theoretical_usage = excluded.theoretical_usage, theoretical_cost = excluded.theoretical_cost;

  -- An item removed from theoretical inputs after reopening must not retain stale variance.
  update public.period_variance_results set calculation_run_id = v_run,
    actual_usage = 0, actual_cost = 0, theoretical_usage = 0, theoretical_cost = 0
  where inventory_period_id = v_period.id and calculation_run_id <> v_run;
  update public.calculation_runs set status = 'completed', completed_at = now() where id = v_run;
  update public.inventory_periods set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where id = v_period.id;
  return v_period.id;
end;
$$;

create table public.period_reopen_events (
  id uuid primary key default gen_random_uuid(),
  inventory_period_id uuid not null references public.inventory_periods(id) on delete cascade,
  reason text not null check (length(btrim(reason)) > 0),
  reopened_by uuid not null references public.profiles(id),
  reopened_at timestamptz not null default now()
);

create index period_reopen_events_period_idx on public.period_reopen_events(inventory_period_id);

create index period_reopen_events_actor_idx on public.period_reopen_events(reopened_by);

alter table public.period_reopen_events enable row level security;

create policy period_reopen_events_select on public.period_reopen_events for select to authenticated
using (exists (select 1 from public.inventory_periods p where p.id = inventory_period_id
  and public.is_organization_member(p.organization_id)));

create policy period_reopen_events_insert on public.period_reopen_events for insert to authenticated
with check (reopened_by = auth.uid() and exists (
  select 1 from public.inventory_periods p where p.id = inventory_period_id
    and public.is_organization_manager(p.organization_id)));

grant select, insert on public.period_reopen_events to authenticated;

create or replace function public.reopen_period(target_period_id uuid, reason text)
returns uuid language plpgsql set search_path = '' as $$
declare
  v_period public.inventory_periods%rowtype;
begin
  select p.* into v_period from public.inventory_periods p
  where p.id = target_period_id for update;
  if v_period.id is null then
    raise exception 'Inventory period not found';
  end if;
  if not public.is_organization_manager(v_period.organization_id) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;
  if v_period.status <> 'closed' then
    raise exception 'Only closed periods can be reopened';
  end if;
  if reason is null or length(btrim(reason)) = 0 then
    raise exception 'Reopening reason is required';
  end if;
  insert into public.period_reopen_events(inventory_period_id, reason, reopened_by)
  values (v_period.id, btrim(reason), auth.uid());
  update public.inventory_periods set status = 'reopened', closed_at = null, closed_by = null
  where id = v_period.id;
  return v_period.id;
end;
$$;
