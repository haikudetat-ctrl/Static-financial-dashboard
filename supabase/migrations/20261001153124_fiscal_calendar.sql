-- 12-period fiscal calendar.
--
-- Each fiscal year starts on the first Monday of January and is split into
-- four 13-week quarters. The pattern says how each quarter's weeks fall
-- across its three periods (4-4-5 by default). A year that runs 53 weeks
-- puts the extra week in P12.

create extension if not exists btree_gist with schema extensions;

create table public.fiscal_calendars (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  pattern text not null default '4-4-5' check (pattern in ('4-4-5', '4-5-4', '5-4-4')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fiscal_calendars enable row level security;

create policy "fiscal_calendars_select_member" on public.fiscal_calendars
for select to authenticated
using ((select public.is_organization_member(organization_id)));

create policy "fiscal_calendars_write_manager" on public.fiscal_calendars
for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

grant select, insert, update, delete on public.fiscal_calendars to authenticated;

insert into public.fiscal_calendars (organization_id)
select id from public.organizations
on conflict do nothing;

create or replace function public.seed_fiscal_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.fiscal_calendars (organization_id)
  values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger organizations_seed_fiscal_calendar
after insert on public.organizations
for each row execute function public.seed_fiscal_calendar();

alter table public.inventory_periods
  add column fiscal_year smallint,
  add column period_number smallint check (period_number between 1 and 12),
  add constraint inventory_periods_fiscal_pair
    check ((fiscal_year is null) = (period_number is null));

create unique index inventory_periods_location_fiscal_key
  on public.inventory_periods(location_id, fiscal_year, period_number)
  where fiscal_year is not null;

-- Periods for one location may never overlap.
alter table public.inventory_periods
  add constraint inventory_periods_no_overlap
  exclude using gist (
    location_id with =,
    daterange(period_start, period_end, '[]') with &&
  );

/** First day of a fiscal year: the first Monday on or after January 1. */
create or replace function public.fiscal_year_start(target_year integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(target_year, 1, 1)
    + ((8 - extract(isodow from make_date(target_year, 1, 1))::integer) % 7);
$$;

/** The 12 periods of a fiscal year for a week pattern. */
create or replace function public.fiscal_periods(
  target_year integer,
  week_pattern text default '4-4-5'
)
returns table (period_number smallint, period_start date, period_end date)
language plpgsql
immutable
set search_path = ''
as $$
declare
  weeks integer[];
  year_start date := public.fiscal_year_start(target_year);
  year_end date := public.fiscal_year_start(target_year + 1) - 1;
  cursor_date date := year_start;
  n integer;
  length_weeks integer;
begin
  weeks := string_to_array(week_pattern, '-')::integer[];
  if array_length(weeks, 1) <> 3 or weeks[1] + weeks[2] + weeks[3] <> 13 then
    raise exception 'Week pattern must be three numbers adding to 13';
  end if;

  for n in 1..12 loop
    length_weeks := weeks[((n - 1) % 3) + 1];
    period_number := n;
    period_start := cursor_date;
    -- P12 absorbs a 53rd week so the year always ends the day before the
    -- next fiscal year starts.
    period_end := case
      when n = 12 then year_end
      else cursor_date + length_weeks * 7 - 1
    end;
    return next;
    cursor_date := period_end + 1;
  end loop;
end;
$$;

/**
 * Creates the fiscal periods of target_year for a location, skipping any
 * that already exist or end before skip_before. Returns how many it made.
 */
create or replace function public.ensure_fiscal_periods(
  target_location_id uuid,
  target_year integer,
  skip_before date default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_organization_id uuid;
  week_pattern text;
  created integer;
begin
  select location.organization_id
  into target_organization_id
  from public.locations location
  where location.id = target_location_id;

  if target_organization_id is null then
    raise exception 'Location not found';
  end if;
  if not public.is_organization_manager(target_organization_id) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;

  select calendar.pattern
  into week_pattern
  from public.fiscal_calendars calendar
  where calendar.organization_id = target_organization_id;

  insert into public.inventory_periods (
    organization_id,
    location_id,
    period_start,
    period_end,
    fiscal_year,
    period_number,
    status,
    opened_by
  )
  select
    target_organization_id,
    target_location_id,
    fiscal.period_start,
    fiscal.period_end,
    target_year,
    fiscal.period_number,
    'draft',
    auth.uid()
  from public.fiscal_periods(target_year, coalesce(week_pattern, '4-4-5')) fiscal
  where (skip_before is null or fiscal.period_end >= skip_before)
    and not exists (
      select 1
      from public.inventory_periods existing
      where existing.location_id = target_location_id
        and daterange(existing.period_start, existing.period_end, '[]')
          && daterange(fiscal.period_start, fiscal.period_end, '[]')
    );

  get diagnostics created = row_count;
  return created;
end;
$$;

grant execute on function public.fiscal_year_start(integer) to authenticated;
grant execute on function public.fiscal_periods(integer, text) to authenticated;
grant execute on function public.ensure_fiscal_periods(uuid, integer, date) to authenticated;

-- Tag existing periods whose dates line up exactly with a fiscal period.
update public.inventory_periods period
set fiscal_year = matched.fiscal_year,
    period_number = matched.period_number
from (
  select
    candidate.id,
    years.fiscal_year,
    fiscal.period_number
  from public.inventory_periods candidate
  join public.fiscal_calendars calendar
    on calendar.organization_id = candidate.organization_id
  cross join generate_series(2020, 2040) as years(fiscal_year)
  cross join lateral public.fiscal_periods(years.fiscal_year, calendar.pattern) fiscal
  where fiscal.period_start = candidate.period_start
    and fiscal.period_end = candidate.period_end
) matched
where matched.id = period.id
  and period.fiscal_year is null;
