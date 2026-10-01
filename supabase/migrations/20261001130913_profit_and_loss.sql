-- Profit and loss: chart of accounts, POS sales classification, manual
-- expense entries, and a P&L calculation over any business-date range.
--
-- Revenue comes from posted Toast sales, classified by sales_category_mappings.
-- Cost of goods comes from the inventory ledger per COGS class
-- (opening + purchases + net transfers - closing), matching close_period.
-- Labor and operating expenses come from pl_entries until payroll and
-- non-inventory bills are imported.

create type public.gl_account_type as enum (
  'revenue',
  'cogs',
  'labor',
  'operating_expense',
  'other_income',
  'other_expense'
);

create table public.gl_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  account_type public.gl_account_type not null,
  cogs_class text
    check (cogs_class in ('liquor', 'wine', 'beer', 'na_bev', 'bar_consumables', 'food')),
  system_key text check (system_key in ('unmapped_sales', 'unclassified_cogs')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  check (cogs_class is null or account_type in ('revenue', 'cogs'))
);

-- One revenue and one COGS account per class, so class cost % is unambiguous.
create unique index gl_accounts_org_type_class_key
  on public.gl_accounts(organization_id, account_type, cogs_class)
  where cogs_class is not null;
create unique index gl_accounts_org_system_key
  on public.gl_accounts(organization_id, system_key)
  where system_key is not null;

create table public.sales_category_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'toast',
  match_field text not null check (match_field in ('item_name', 'subgroup', 'category', 'menu_group')),
  match_value text not null check (length(btrim(match_value)) > 0),
  gl_account_id uuid not null references public.gl_accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index sales_category_mappings_match_key
  on public.sales_category_mappings(organization_id, source_system, match_field, lower(match_value));
create index sales_category_mappings_account_idx on public.sales_category_mappings(gl_account_id);

create table public.pl_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  gl_account_id uuid not null references public.gl_accounts(id),
  entry_date date not null,
  amount numeric(14, 2) not null,
  memo text not null default '',
  vendor_id uuid references public.vendors(id),
  invoice_id uuid references public.invoices(id),
  source_type text not null default 'manual' check (source_type in ('manual', 'invoice', 'payroll_import')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index pl_entries_location_date_idx on public.pl_entries(location_id, entry_date);
create index pl_entries_org_idx on public.pl_entries(organization_id);
create index pl_entries_account_idx on public.pl_entries(gl_account_id);
create index pl_entries_vendor_idx on public.pl_entries(vendor_id);
create index pl_entries_invoice_idx on public.pl_entries(invoice_id);
create index pl_entries_created_by_idx on public.pl_entries(created_by);

alter table public.gl_accounts enable row level security;
alter table public.sales_category_mappings enable row level security;
alter table public.pl_entries enable row level security;

create policy "gl_accounts_select_member" on public.gl_accounts
for select to authenticated using (public.is_organization_member(organization_id));
create policy "gl_accounts_write_manager" on public.gl_accounts
for all to authenticated
using (public.is_organization_manager(organization_id))
with check (public.is_organization_manager(organization_id));

create policy "sales_category_mappings_select_member" on public.sales_category_mappings
for select to authenticated using (public.is_organization_member(organization_id));
create policy "sales_category_mappings_write_manager" on public.sales_category_mappings
for all to authenticated
using (public.is_organization_manager(organization_id))
with check (public.is_organization_manager(organization_id));

create policy "pl_entries_select_member" on public.pl_entries
for select to authenticated
using (public.is_organization_member(organization_id) and public.can_access_location(location_id));
create policy "pl_entries_insert_manager" on public.pl_entries
for insert to authenticated
with check (
  public.is_organization_manager(organization_id)
  and public.can_access_location(location_id)
  and created_by = auth.uid()
);
create policy "pl_entries_delete_manager" on public.pl_entries
for delete to authenticated
using (public.is_organization_manager(organization_id) and source_type = 'manual');

grant select, insert, update, delete on public.gl_accounts to authenticated;
grant select, insert, update, delete on public.sales_category_mappings to authenticated;
grant select, insert, delete on public.pl_entries to authenticated;

-- Default restaurant chart of accounts (USAR-style numbering).
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
    ('6100', 'Hourly wages', 'labor', null, null, 210),
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

revoke execute on function public.seed_default_chart_of_accounts(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_chart_of_accounts(uuid) to service_role;

create or replace function public.seed_chart_of_accounts_for_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_default_chart_of_accounts(new.id);
  return new;
end;
$$;

revoke execute on function public.seed_chart_of_accounts_for_new_organization() from public, anon, authenticated;

create trigger seed_chart_of_accounts
  after insert on public.organizations
  for each row execute function public.seed_chart_of_accounts_for_new_organization();

select public.seed_default_chart_of_accounts(id) from public.organizations;

-- P&L over business dates [range_start, range_end], inclusive, for one location.
-- Returns one row per active account. COGS rows also carry the inventory
-- bridge (opening, purchases, closing) and theoretical cost.
create or replace function public.profit_and_loss(
  target_location_id uuid,
  range_start date,
  range_end date
)
returns table (
  account_id uuid,
  account_code text,
  account_name text,
  account_type public.gl_account_type,
  cogs_class text,
  sort_order integer,
  amount numeric,
  opening_value numeric,
  purchases_value numeric,
  closing_value numeric,
  theoretical_amount numeric
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  if range_end < range_start then
    raise exception 'Range end must be on or after range start';
  end if;
  if not public.can_access_location(target_location_id) then
    raise exception 'Location access required' using errcode = '42501';
  end if;

  select l.organization_id,
    (range_start + l.business_day_cutoff) at time zone l.timezone,
    ((range_end + 1) + l.business_day_cutoff) at time zone l.timezone
  into v_org, v_start, v_end
  from public.locations l
  where l.id = target_location_id;

  return query
  with sales as (
    select si.net_sales, si.item_name, coalesce(r.normalized_data, '{}'::jsonb) as nd
    from public.sales_items si
    join public.sales_business_days d on d.id = si.sales_business_day_id
    left join public.source_import_rows r on r.id = si.source_import_row_id
    where d.location_id = target_location_id
      and d.business_date between range_start and range_end
  ),
  classified_sales as (
    select coalesce(
      (
        select m.gl_account_id
        from public.sales_category_mappings m
        where m.organization_id = v_org
          and (
            (m.match_field = 'item_name' and lower(m.match_value) = lower(s.item_name))
            or (m.match_field = 'subgroup' and lower(m.match_value) = lower(s.nd ->> 'subgroup'))
            or (m.match_field = 'category' and lower(m.match_value) = lower(s.nd ->> 'category'))
            or (m.match_field = 'menu_group' and lower(m.match_value) = lower(s.nd ->> 'menu_group'))
          )
        order by case m.match_field
          when 'item_name' then 0 when 'subgroup' then 1 when 'category' then 2 else 3 end
        limit 1
      ),
      (select a.id from public.gl_accounts a
       where a.organization_id = v_org and a.system_key = 'unmapped_sales')
    ) as gl_account_id,
    s.net_sales
    from sales s
  ),
  revenue as (
    select c.gl_account_id, sum(c.net_sales) as amount
    from classified_sales c
    group by c.gl_account_id
  ),
  ledger as (
    select i.cogs_class,
      coalesce(sum(l.extended_value) filter (
        where t.effective_at < v_start or t.transaction_type = 'opening_balance'), 0) as opening,
      coalesce(sum(l.extended_value) filter (
        where t.effective_at >= v_start and t.transaction_type in ('receipt', 'receipt_reversal')), 0) as purchases,
      coalesce(sum(l.extended_value), 0) as closing,
      -coalesce(sum(l.extended_value) filter (
        where t.effective_at >= v_start
          and t.transaction_type not in (
            'opening_balance', 'receipt', 'receipt_reversal', 'transfer_in', 'transfer_out')), 0) as cogs
    from public.inventory_transactions t
    join public.inventory_transaction_lines l on l.inventory_transaction_id = t.id
    join public.inventory_items i on i.id = l.inventory_item_id
    where t.location_id = target_location_id and t.effective_at < v_end
    group by i.cogs_class
  ),
  theoretical as (
    select i.cogs_class, sum(u.theoretical_cost) as amount
    from public.daily_theoretical_usage u
    join public.inventory_items i on i.id = u.inventory_item_id
    where u.location_id = target_location_id
      and u.business_date between range_start and range_end
    group by i.cogs_class
  ),
  cogs as (
    select a.id as gl_account_id,
      sum(lg.cogs) as amount, sum(lg.opening) as opening, sum(lg.purchases) as purchases,
      sum(lg.closing) as closing
    from ledger lg
    join public.gl_accounts a on a.organization_id = v_org and a.account_type = 'cogs'
      and (a.cogs_class = lg.cogs_class or (lg.cogs_class is null and a.system_key = 'unclassified_cogs'))
    group by a.id
  ),
  cogs_theoretical as (
    select a.id as gl_account_id, sum(th.amount) as amount
    from theoretical th
    join public.gl_accounts a on a.organization_id = v_org and a.account_type = 'cogs'
      and (a.cogs_class = th.cogs_class or (th.cogs_class is null and a.system_key = 'unclassified_cogs'))
    group by a.id
  ),
  entries as (
    select e.gl_account_id, sum(e.amount) as amount
    from public.pl_entries e
    where e.location_id = target_location_id
      and e.entry_date between range_start and range_end
    group by e.gl_account_id
  )
  select a.id, a.code, a.name, a.account_type, a.cogs_class, a.sort_order,
    (coalesce(rv.amount, 0) + coalesce(cg.amount, 0) + coalesce(en.amount, 0))::numeric(14, 2),
    cg.opening::numeric(14, 2), cg.purchases::numeric(14, 2), cg.closing::numeric(14, 2),
    ct.amount::numeric(14, 2)
  from public.gl_accounts a
  left join revenue rv on rv.gl_account_id = a.id
  left join cogs cg on cg.gl_account_id = a.id
  left join cogs_theoretical ct on ct.gl_account_id = a.id
  left join entries en on en.gl_account_id = a.id
  where a.organization_id = v_org
    and (a.active or rv.amount is not null or cg.amount is not null or en.amount is not null)
  order by a.sort_order, a.code;
end;
$$;

revoke execute on function public.profit_and_loss(uuid, date, date) from public, anon;
grant execute on function public.profit_and_loss(uuid, date, date) to authenticated;
