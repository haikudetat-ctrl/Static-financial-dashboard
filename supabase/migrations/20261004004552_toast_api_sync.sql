-- Toast API connection and nightly sales sync.
--
-- Each location can connect a Toast restaurant with read-only API
-- credentials. The client secret is kept in Supabase Vault; only the
-- server (service role) can read it back. Every sync attempt is logged.

create table public.toast_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null unique references public.locations(id) on delete cascade,
  restaurant_guid text not null check (restaurant_guid ~ '^[0-9a-fA-F-]{36}$'),
  api_host text not null default 'https://ws-api.toasttab.com'
    check (api_host in ('https://ws-api.toasttab.com', 'https://ws-sandbox-api.eng.toasttab.com')),
  client_id text not null check (length(btrim(client_id)) > 0),
  secret_id uuid not null,
  auto_post boolean not null default true,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  last_synced_date date,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index toast_connections_org_idx on public.toast_connections(organization_id);
create index toast_connections_created_by_idx on public.toast_connections(created_by);

create table public.toast_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  trigger text not null check (trigger in ('schedule', 'manual')),
  status text not null check (status in ('posted', 'staged', 'empty', 'skipped', 'failed')),
  order_count integer not null default 0,
  item_count integer not null default 0,
  net_sales numeric(14, 2) not null default 0,
  source_import_id uuid references public.source_imports(id) on delete set null,
  message text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index toast_sync_runs_location_idx on public.toast_sync_runs(location_id, started_at desc);
create index toast_sync_runs_org_idx on public.toast_sync_runs(organization_id);
create index toast_sync_runs_import_idx on public.toast_sync_runs(source_import_id);

alter table public.toast_connections enable row level security;
alter table public.toast_sync_runs enable row level security;

-- Members can see the connection (never the secret); writes go through
-- save_toast_connection(). Sync runs are written by the server.
create policy "toast_connections_select_member" on public.toast_connections
for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "toast_connections_update_manager" on public.toast_connections
for update to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));
create policy "toast_connections_delete_manager" on public.toast_connections
for delete to authenticated
using ((select public.is_organization_manager(organization_id)));
create policy "toast_sync_runs_select_member" on public.toast_sync_runs
for select to authenticated
using ((select public.is_organization_member(organization_id)));

revoke all on public.toast_connections from anon, authenticated;
revoke all on public.toast_sync_runs from anon, authenticated;
grant select, delete on public.toast_connections to authenticated;
grant update (auto_post, active) on public.toast_connections to authenticated;
grant select on public.toast_sync_runs to authenticated;

create trigger set_toast_connections_updated_at
before update on public.toast_connections
for each row execute function public.set_updated_at();

/**
 * Creates or updates a location's Toast connection. A blank secret keeps
 * the stored one.
 */
create or replace function public.save_toast_connection(
  target_location_id uuid,
  new_restaurant_guid text,
  new_client_id text,
  new_client_secret text,
  new_api_host text default 'https://ws-api.toasttab.com',
  new_auto_post boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  existing public.toast_connections%rowtype;
  stored_secret uuid;
begin
  select location.organization_id into target_org
  from public.locations location where location.id = target_location_id;
  if target_org is null or not public.is_organization_manager(target_org) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;

  select * into existing
  from public.toast_connections where location_id = target_location_id;

  if existing.id is null then
    if coalesce(btrim(new_client_secret), '') = '' then
      raise exception 'Enter the client secret';
    end if;
    stored_secret := vault.create_secret(
      btrim(new_client_secret),
      'toast_client_secret_' || target_location_id::text,
      'Toast API client secret'
    );
    insert into public.toast_connections (
      organization_id, location_id, restaurant_guid, api_host, client_id,
      secret_id, auto_post, created_by
    )
    values (
      target_org, target_location_id, btrim(new_restaurant_guid), new_api_host,
      btrim(new_client_id), stored_secret, new_auto_post, auth.uid()
    )
    returning id into existing.id;
  else
    if coalesce(btrim(new_client_secret), '') <> '' then
      perform vault.update_secret(existing.secret_id, btrim(new_client_secret));
    end if;
    update public.toast_connections
    set restaurant_guid = btrim(new_restaurant_guid),
        api_host = new_api_host,
        client_id = btrim(new_client_id),
        auto_post = new_auto_post,
        active = true,
        last_error = ''
    where id = existing.id;
  end if;
  return existing.id;
end;
$$;

/** Server only: the connection with its decrypted secret. */
create or replace function public.get_toast_credentials(target_location_id uuid)
returns table (
  connection_id uuid,
  organization_id uuid,
  location_id uuid,
  restaurant_guid text,
  api_host text,
  client_id text,
  client_secret text,
  auto_post boolean,
  acting_profile_id uuid
)
language sql
security definer
set search_path = ''
as $$
  select c.id, c.organization_id, c.location_id, c.restaurant_guid, c.api_host,
    c.client_id, s.decrypted_secret, c.auto_post, c.created_by
  from public.toast_connections c
  join vault.decrypted_secrets s on s.id = c.secret_id
  where c.location_id = target_location_id and c.active;
$$;

/**
 * Server only: posts a sales import on behalf of the manager who set up
 * the connection (the nightly job has no signed-in user).
 */
create or replace function public.post_sales_import_as(
  target_import_id uuid,
  acting_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', acting_profile_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', acting_profile_id::text, true);
  return public.post_sales_import(target_import_id);
end;
$$;

revoke all on function public.save_toast_connection(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.save_toast_connection(uuid, text, text, text, text, boolean) to authenticated;
revoke all on function public.get_toast_credentials(uuid) from public, anon, authenticated;
grant execute on function public.get_toast_credentials(uuid) to service_role;
revoke all on function public.post_sales_import_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.post_sales_import_as(uuid, uuid) to service_role;

-- Removing a connection removes its stored secret.
create or replace function public.delete_toast_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;
revoke all on function public.delete_toast_secret() from public, anon, authenticated;

create trigger toast_connections_delete_secret
after delete on public.toast_connections
for each row execute function public.delete_toast_secret();
