-- A count belongs to a business date (a count taken after close on Sunday
-- night is Sunday's count, even if it runs past midnight). It posts to the
-- ledger as of the end of that business day, whenever it is approved, and
-- adjusts against what the ledger held at that moment. Deliveries and counts
-- recorded after it stay on their own side of the line, so mid-period counts
-- give clean count-to-count windows.

alter table public.inventory_counts add column count_date date;

update public.inventory_counts c
set count_date = (
  (c.created_at at time zone l.timezone) - l.business_day_cutoff::interval
)::date
from public.locations l
where l.id = c.location_id;

create or replace function public.set_inventory_count_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.count_date is null then
    select (
      (coalesce(new.created_at, now()) at time zone l.timezone)
        - l.business_day_cutoff::interval
    )::date
    into new.count_date
    from public.locations l
    where l.id = new.location_id;
  end if;
  if tg_op = 'UPDATE'
    and old.status = 'approved'
    and new.count_date is distinct from old.count_date
  then
    raise exception 'An approved count''s date can''t change';
  end if;
  return new;
end;
$$;

create trigger inventory_counts_count_date
before insert or update of count_date on public.inventory_counts
for each row execute function public.set_inventory_count_date();

alter table public.inventory_counts alter column count_date set not null;

create index if not exists inventory_counts_location_count_date_idx
  on public.inventory_counts(location_id, count_date);

-- The last moment of the count's business day.
create or replace function public.inventory_count_as_of(target_count_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (((c.count_date + 1) + l.business_day_cutoff) at time zone l.timezone)
    - interval '1 second'
  from public.inventory_counts c
  join public.locations l on l.id = c.location_id
  where c.id = target_count_id;
$$;

grant execute on function public.inventory_count_as_of(uuid) to authenticated;

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
  v_as_of timestamptz;
  v_business_today date;
  v_period_end date;
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

  v_as_of := public.inventory_count_as_of(target_count.id);
  select ((now() at time zone l.timezone) - l.business_day_cutoff::interval)::date
  into v_business_today
  from public.locations l
  where l.id = target_count.location_id;

  if target_count.count_date > v_business_today then
    raise exception 'This count is dated after today';
  end if;

  if exists (
    select 1
    from public.inventory_transactions transaction
    where transaction.organization_id = target_count.organization_id
      and transaction.location_id = target_count.location_id
      and transaction.source_type = 'inventory_count'
      and transaction.effective_at > v_as_of
  ) then
    raise exception 'A later count is already approved. Approve counts in date order.';
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
    v_as_of,
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
    counted.inventory_item_id,
    counted.storage_location_id,
    counted.posting_quantity,
    counted.unit_cost,
    case
      when posting_type = 'opening_balance' then 'opening_count'
      else 'approved_count'
    end
  from (
    select
      line.inventory_item_id,
      line.storage_location_id,
      coalesce(cost.weighted_average_cost, 0) as unit_cost,
      (
        line.counted_quantity
        + case when line.is_open_container then line.counted_tenths else 0 end
      ) * coalesce(count_unit.conversion_factor_to_base, 1)
        - case
            when posting_type = 'opening_balance' then 0
            else coalesce(on_hand.quantity, 0)
          end as posting_quantity
    from public.inventory_count_lines line
    join public.inventory_count_assignments assignment
      on assignment.id = line.inventory_count_assignment_id
    join public.inventory_items item
      on item.id = line.inventory_item_id
    join public.units count_unit
      on count_unit.id = coalesce(item.count_unit_id, item.base_unit_id)
    -- What the ledger held at the end of the count's business day.
    left join lateral (
      select sum(ledger_line.quantity) as quantity
      from public.inventory_transaction_lines ledger_line
      join public.inventory_transactions ledger
        on ledger.id = ledger_line.inventory_transaction_id
      where ledger.organization_id = target_count.organization_id
        and ledger.location_id = target_count.location_id
        and ledger.effective_at <= v_as_of
        and ledger_line.inventory_item_id = line.inventory_item_id
        and ledger_line.storage_location_id = line.storage_location_id
    ) on_hand on true
    left join lateral (
      select snapshot.weighted_average_cost
      from public.inventory_item_cost_snapshots snapshot
      where snapshot.inventory_item_id = line.inventory_item_id
        and snapshot.inventory_period_id = target_count.inventory_period_id
      order by snapshot.effective_at desc
      limit 1
    ) cost on true
    where assignment.inventory_count_id = target_count.id
  ) counted
  where counted.posting_quantity <> 0;

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

  -- Only a closing count marks the period counted; opening and mid-period
  -- counts leave it open.
  select period_end into v_period_end
  from public.inventory_periods
  where id = target_count.inventory_period_id;

  if target_count.count_type = 'full'
    and v_period_end is not null
    and target_count.count_date >= v_period_end - 2
  then
    update public.inventory_periods
    set status = 'count_complete'
    where id = target_count.inventory_period_id
      and status not in ('closed', 'close_in_progress');
  end if;

  return posted_transaction_id;
end;
$$;
