-- Toast labor: clocked hours and hourly wages from the Toast Labor API,
-- posted to the P&L as one hourly-wage entry per business day. Salaries,
-- payroll taxes and benefits are not in Toast and stay manual entries.

-- The sync finds the hourly wage account by system key, not by code.
alter table public.gl_accounts drop constraint gl_accounts_system_key_check;
alter table public.gl_accounts add constraint gl_accounts_system_key_check
  check (system_key in ('unmapped_sales', 'unclassified_cogs', 'hourly_wages'));

update public.gl_accounts a
set system_key = 'hourly_wages'
where a.code = '6100'
  and a.account_type = 'labor'
  and a.system_key is null
  and not exists (
    select 1 from public.gl_accounts b
    where b.organization_id = a.organization_id and b.system_key = 'hourly_wages'
  );

create or replace function public.seed_default_chart_of_accounts(target_organization_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.gl_accounts (organization_id, code, name, account_type, cogs_class, system_key, sort_order)
  select target_organization_id, a.code, a.name, a.account_type::public.gl_account_type, a.cogs_class, a.system_key, a.sort_order
  from (values
    ('4100', 'Liquor sales', 'revenue', 'liquor', null, 10),
    ('4200', 'Wine sales', 'revenue', 'wine', null, 20),
    ('4300', 'Beer sales', 'revenue', 'beer', null, 30),
    ('4400', 'Non-alcoholic beverage sales', 'revenue', 'na_bev', null, 40),
    ('4500', 'Food sales', 'revenue', 'food', null, 50),
    ('4900', 'Unclassified sales', 'revenue', null, 'unmapped_sales', 90),
    ('5100', 'Liquor cost', 'cogs', 'liquor', null, 110),
    ('5200', 'Wine cost', 'cogs', 'wine', null, 120),
    ('5300', 'Beer cost', 'cogs', 'beer', null, 130),
    ('5400', 'Non-alcoholic beverage cost', 'cogs', 'na_bev', null, 140),
    ('5500', 'Food cost', 'cogs', 'food', null, 150),
    ('5600', 'Bar consumables cost', 'cogs', 'bar_consumables', null, 160),
    ('5900', 'Unclassified cost of goods', 'cogs', null, 'unclassified_cogs', 190),
    ('6100', 'Hourly wages', 'labor', null, 'hourly_wages', 210),
    ('6200', 'Salaries', 'labor', null, null, 220),
    ('6300', 'Payroll taxes', 'labor', null, null, 230),
    ('6400', 'Employee benefits', 'labor', null, null, 240),
    ('7100', 'Rent and occupancy', 'operating_expense', null, null, 310),
    ('7200', 'Utilities', 'operating_expense', null, null, 320),
    ('7300', 'Repairs and maintenance', 'operating_expense', null, null, 330),
    ('7400', 'Operating supplies', 'operating_expense', null, null, 340),
    ('7500', 'Marketing', 'operating_expense', null, null, 350),
    ('7600', 'Credit card fees', 'operating_expense', null, null, 360),
    ('7700', 'Professional services', 'operating_expense', null, null, 370),
    ('7800', 'Insurance', 'operating_expense', null, null, 380),
    ('7900', 'Other operating expenses', 'operating_expense', null, null, 390),
    ('8100', 'Other income', 'other_income', null, null, 410),
    ('8200', 'Interest and other expense', 'other_expense', null, null, 420)
  ) as a(code, name, account_type, cogs_class, system_key, sort_order)
  on conflict (organization_id, code) do nothing;
$$;

-- Lets an import replace its own entry for a day instead of adding another.
alter table public.pl_entries add column source_ref text;
create unique index pl_entries_location_source_ref
  on public.pl_entries(location_id, source_ref)
  where source_ref is not null;

-- One row per Toast time entry (a clock-in to clock-out shift for a job).
create table public.toast_time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  time_entry_guid text not null,
  employee_guid text,
  job_guid text,
  job_title text not null default '',
  in_at timestamptz,
  out_at timestamptz,
  regular_hours numeric(8, 3) not null default 0,
  overtime_hours numeric(8, 3) not null default 0,
  hourly_wage numeric(10, 4),
  wage_cost numeric(12, 2) not null default 0,
  declared_cash_tips numeric(12, 2) not null default 0,
  non_cash_tips numeric(12, 2) not null default 0,
  unique (location_id, time_entry_guid)
);

create index toast_time_entries_location_date_idx
  on public.toast_time_entries(location_id, business_date);
create index toast_time_entries_org_idx
  on public.toast_time_entries(organization_id);

-- A business day whose labor has been pulled, even when nobody clocked in.
create table public.toast_labor_days (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  entry_count integer not null default 0,
  regular_hours numeric(10, 3) not null default 0,
  overtime_hours numeric(10, 3) not null default 0,
  wage_cost numeric(12, 2) not null default 0,
  synced_at timestamptz not null default now(),
  primary key (location_id, business_date)
);

create index toast_labor_days_org_idx on public.toast_labor_days(organization_id);

alter table public.toast_time_entries enable row level security;
alter table public.toast_labor_days enable row level security;

-- Members read; the sync (service role) writes.
create policy "toast_time_entries_select_member" on public.toast_time_entries
for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "toast_labor_days_select_member" on public.toast_labor_days
for select to authenticated
using ((select public.is_organization_member(organization_id)));

revoke all on public.toast_time_entries from anon, authenticated;
revoke all on public.toast_labor_days from anon, authenticated;
grant select on public.toast_time_entries to authenticated;
grant select on public.toast_labor_days to authenticated;
