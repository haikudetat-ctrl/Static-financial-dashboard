-- Drive inbox: the app reads the shared Google Drive folder where the team
-- files counts, waste logs, batch sheets, credit notes, drink specs and
-- invoices, and turns each file into something to apply in the app.

create table public.drive_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null unique references public.locations(id) on delete cascade,
  root_folder_id text not null check (root_folder_id ~ '^[A-Za-z0-9_-]{10,}$'),
  root_folder_name text not null default '',
  active boolean not null default true,
  last_synced_at timestamptz,
  last_error text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.drive_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  drive_file_id text not null,
  name text not null,
  mime_type text not null,
  folder_path text not null default '',
  web_view_link text not null default '',
  modified_time timestamptz not null,
  kind text not null check (kind in (
    'count_sheet', 'waste_log', 'batch_sheet', 'credit_note', 'drink_spec',
    'invoice_file', 'other')),
  status text not null default 'new' check (status in (
    'new', 'ready', 'needs_review', 'applied', 'ignored', 'error')),
  parsed jsonb,
  issues jsonb not null default '[]'::jsonb,
  error_message text not null default '',
  applied_at timestamptz,
  applied_by uuid references public.profiles(id),
  applied_modified_time timestamptz,
  applied_target_id uuid,
  applied_summary text not null default '',
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, drive_file_id)
);

create index drive_documents_location_status_idx
  on public.drive_documents(location_id, status, modified_time desc);

alter table public.drive_sources enable row level security;
alter table public.drive_documents enable row level security;

-- Members can read; the server writes after checking manager access.
create policy "drive_sources_select_member" on public.drive_sources
for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "drive_documents_select_member" on public.drive_documents
for select to authenticated
using ((select public.is_organization_member(organization_id)));

revoke all on public.drive_sources from anon, authenticated;
revoke all on public.drive_documents from anon, authenticated;
grant select on public.drive_sources to authenticated;
grant select on public.drive_documents to authenticated;

-- Waste, spills, breakage and comps from a waste log. Each entry is a
-- positive quantity in the item's base unit, taken off the shelf during
-- its business day. Idempotent per source line.
create or replace function public.post_waste_entries(
  target_location_id uuid,
  source_key text,
  entries jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_location public.locations%rowtype;
  v_entry jsonb;
  v_index integer := 0;
  v_posted integer := 0;
  v_type public.inventory_transaction_type;
  v_transaction uuid;
  v_key text;
  v_cost numeric;
begin
  select * into v_location from public.locations where id = target_location_id;
  if v_location.id is null then
    raise exception 'Location not found';
  end if;
  if not public.is_organization_manager(v_location.organization_id) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;
  if jsonb_typeof(entries) <> 'array' then
    raise exception 'Entries must be a list';
  end if;

  for v_entry in select value from jsonb_array_elements(entries) loop
    v_index := v_index + 1;
    v_key := 'waste:' || source_key || ':' || v_index;
    if exists (
      select 1 from public.inventory_transactions where idempotency_key = v_key
    ) then
      continue;
    end if;
    if coalesce((v_entry->>'quantity_base')::numeric, 0) <= 0 then
      raise exception 'Entry % has no quantity', v_index;
    end if;
    if not exists (
      select 1 from public.inventory_items
      where id = (v_entry->>'inventory_item_id')::uuid
        and organization_id = v_location.organization_id
    ) or not exists (
      select 1 from public.storage_locations
      where id = (v_entry->>'storage_location_id')::uuid
        and location_id = v_location.id
    ) then
      raise exception 'Entry % names an item or storage area from elsewhere', v_index;
    end if;

    v_type := case v_entry->>'reason'
      when 'spill' then 'spill'
      when 'breakage' then 'breakage'
      when 'comp_sample' then 'comp_sample'
      else 'waste'
    end;

    select on_hand.weighted_average_cost into v_cost
    from public.inventory_on_hand on_hand
    where on_hand.location_id = v_location.id
      and on_hand.inventory_item_id = (v_entry->>'inventory_item_id')::uuid
    order by on_hand.quantity desc
    limit 1;

    insert into public.inventory_transactions (
      organization_id, location_id, transaction_type, effective_at,
      source_type, source_id, idempotency_key, actor_id
    ) values (
      v_location.organization_id,
      v_location.id,
      v_type,
      -- Midday of the business day it happened.
      (((v_entry->>'business_date')::date + v_location.business_day_cutoff)
        at time zone v_location.timezone) + interval '12 hours',
      'waste_log',
      coalesce((v_entry->>'source_id')::uuid, gen_random_uuid()),
      v_key,
      auth.uid()
    )
    returning id into v_transaction;

    insert into public.inventory_transaction_lines (
      inventory_transaction_id, inventory_item_id, storage_location_id,
      quantity, unit_cost, reason_code
    ) values (
      v_transaction,
      (v_entry->>'inventory_item_id')::uuid,
      (v_entry->>'storage_location_id')::uuid,
      -(v_entry->>'quantity_base')::numeric,
      coalesce(v_cost, 0),
      left(coalesce(v_entry->>'note', ''), 200)
    );
    v_posted := v_posted + 1;
  end loop;

  return v_posted;
end;
$$;

grant execute on function public.post_waste_entries(uuid, text, jsonb) to authenticated;
