-- Sales drivers from saved Toast checks: checks, covers, net sales,
-- discounts and voids per business day and per local hour opened. Members
-- read through toast_checks' row security (security invoker).

create or replace function public.sales_drivers(
  target_location_id uuid,
  range_start date,
  range_end date
)
returns table (
  grain text,
  bucket text,
  checks integer,
  guests integer,
  net_sales numeric,
  discounts numeric,
  voided integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with zone as (
    select coalesce(nullif(l.timezone, ''), 'America/New_York') as tz
    from public.locations l
    where l.id = target_location_id
  ),
  c as (
    select ch.business_date, ch.voided, ch.guest_count, ch.net_amount,
      ch.discount_amount,
      extract(hour from ch.opened_at at time zone (select tz from zone))::int as hour
    from public.toast_checks ch
    where ch.location_id = target_location_id
      and ch.business_date between range_start and range_end
  )
  select 'day', c.business_date::text,
    (count(*) filter (where not c.voided))::int,
    (coalesce(sum(c.guest_count) filter (where not c.voided), 0))::int,
    coalesce(sum(c.net_amount) filter (where not c.voided), 0),
    coalesce(sum(c.discount_amount) filter (where not c.voided), 0),
    (count(*) filter (where c.voided))::int
  from c
  group by c.business_date
  union all
  select 'hour', c.hour::text,
    (count(*) filter (where not c.voided))::int,
    (coalesce(sum(c.guest_count) filter (where not c.voided), 0))::int,
    coalesce(sum(c.net_amount) filter (where not c.voided), 0),
    coalesce(sum(c.discount_amount) filter (where not c.voided), 0),
    (count(*) filter (where c.voided))::int
  from c
  where c.hour is not null
  group by c.hour;
$$;

revoke execute on function public.sales_drivers(uuid, date, date) from public, anon;
grant execute on function public.sales_drivers(uuid, date, date) to authenticated;
