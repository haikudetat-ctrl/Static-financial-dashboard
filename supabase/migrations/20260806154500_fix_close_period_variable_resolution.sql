-- Avoid ambiguous PL/pgSQL variable/column resolution in period close.
-- The function's local organization and location identifiers are intentionally
-- preferred anywhere an unqualified identifier could also name a column.

create or replace function public.close_period(target_period_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
#variable_conflict use_variable
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

  select coalesce(sum(extended_value), 0)
  into opening_value
  from public.inventory_on_hand on_hand
  where on_hand.organization_id = organization_id
    and on_hand.location_id = location_id;

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

  select coalesce(sum(extended_value), 0)
  into closing_value
  from public.inventory_on_hand on_hand
  where on_hand.organization_id = organization_id
    and on_hand.location_id = location_id;

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

  actual_cogs := opening_value + purchases_value + transfers_in
    - closing_value - transfers_out;

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
