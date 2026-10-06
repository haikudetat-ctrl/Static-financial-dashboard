-- Order-level detail from the Toast API. The nightly sync already downloads
-- every order; until now only the per-item daily totals were kept. Keeping
-- checks and items (with modifiers, voids, discounts and payments) lets the
-- app count doubles and spirit swaps in usage, audit comps and voids, and
-- report by hour, server and daypart. History only exists from the day it's
-- saved, so this starts saving now and can backfill past days.

create table public.toast_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  order_guid text not null,
  check_guid text not null,
  display_number text not null default '',
  opened_at timestamptz,
  closed_at timestamptz,
  paid_at timestamptz,
  server_guid text,
  dining_option_guid text,
  revenue_center_guid text,
  guest_count integer,
  voided boolean not null default false,
  net_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  tip_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  discounts jsonb not null default '[]'::jsonb,
  payments jsonb not null default '[]'::jsonb,
  unique (location_id, check_guid)
);

create index toast_checks_location_date_idx
  on public.toast_checks(location_id, business_date);

create table public.toast_check_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  check_guid text not null,
  selection_guid text not null,
  item_guid text,
  item_name text not null default '',
  item_group_guid text,
  sales_category_guid text,
  selection_type text,
  quantity numeric(12,4) not null default 1,
  price numeric(12,2) not null default 0,
  pre_discount_price numeric(12,2) not null default 0,
  refund_amount numeric(12,2) not null default 0,
  voided boolean not null default false,
  void_reason_guid text,
  ordered_at timestamptz,
  discounts jsonb not null default '[]'::jsonb,
  -- Flattened modifiers: [{guid, item_guid, name, quantity, price, group_guid, depth}]
  modifiers jsonb not null default '[]'::jsonb,
  unique (location_id, selection_guid)
);

create index toast_check_items_location_date_idx
  on public.toast_check_items(location_id, business_date);
create index toast_check_items_item_idx
  on public.toast_check_items(location_id, item_guid);

-- Which days have detail saved, and how much.
create table public.toast_detail_days (
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  check_count integer not null default 0,
  item_count integer not null default 0,
  net_sales numeric(12,2) not null default 0,
  saved_at timestamptz not null default now(),
  primary key (location_id, business_date)
);

alter table public.toast_checks enable row level security;
alter table public.toast_check_items enable row level security;
alter table public.toast_detail_days enable row level security;

-- Members read; the sync (service role) writes.
create policy "toast_checks_select_member" on public.toast_checks
for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "toast_check_items_select_member" on public.toast_check_items
for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "toast_detail_days_select_member" on public.toast_detail_days
for select to authenticated
using ((select public.is_organization_member(organization_id)));

revoke all on public.toast_checks from anon, authenticated;
revoke all on public.toast_check_items from anon, authenticated;
revoke all on public.toast_detail_days from anon, authenticated;
grant select on public.toast_checks to authenticated;
grant select on public.toast_check_items to authenticated;
grant select on public.toast_detail_days to authenticated;
