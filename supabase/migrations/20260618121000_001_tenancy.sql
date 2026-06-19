create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  timezone text not null default 'America/New_York',
  business_day_cutoff time not null default '04:00',
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('manager', 'staff')),
  name text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create table public.location_memberships (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  organization_membership_id uuid not null references public.organization_memberships(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  created_at timestamptz not null default now(),
  unique (location_id, organization_membership_id)
);

create index organization_memberships_profile_id_idx
  on public.organization_memberships(profile_id);
create index location_memberships_organization_membership_id_idx
  on public.location_memberships(organization_membership_id);

insert into public.roles (slug, name, description)
values
  (
    'manager',
    'Manager',
    'Configure, map, approve, close, reopen, and report within an organization.'
  ),
  (
    'staff',
    'Staff',
    'Receive, count, record production, and record waste at assigned locations.'
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.profile_id = auth.uid()
  );
$$;

create or replace function public.is_organization_manager(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    join public.roles role on role.id = membership.role_id
    where membership.organization_id = target_organization_id
      and membership.profile_id = auth.uid()
      and role.slug = 'manager'
  );
$$;

create or replace function public.shares_organization(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships current_membership
    join public.organization_memberships target_membership
      on target_membership.organization_id = current_membership.organization_id
    where current_membership.profile_id = auth.uid()
      and target_membership.profile_id = target_profile_id
  );
$$;

create or replace function public.can_access_location(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations location
    where location.id = target_location_id
      and (
        public.is_organization_manager(location.organization_id)
        or exists (
          select 1
          from public.location_memberships location_membership
          join public.organization_memberships organization_membership
            on organization_membership.id = location_membership.organization_membership_id
          where location_membership.location_id = location.id
            and organization_membership.profile_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.storage_path_is_accessible(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  organization_segment text := split_part(object_name, '/', 1);
  location_segment text := split_part(object_name, '/', 2);
  target_organization_id uuid;
  target_location_id uuid;
begin
  if organization_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or location_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  target_organization_id := organization_segment::uuid;
  target_location_id := location_segment::uuid;

  return exists (
    select 1
    from public.locations location
    where location.id = target_location_id
      and location.organization_id = target_organization_id
      and public.can_access_location(location.id)
  );
end;
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.roles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.location_memberships enable row level security;

create policy "profiles_select_shared_organization"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.shares_organization(id));

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "organizations_select_member"
on public.organizations
for select
to authenticated
using (public.is_organization_member(id));

create policy "organizations_update_manager"
on public.organizations
for update
to authenticated
using (public.is_organization_manager(id))
with check (public.is_organization_manager(id));

create policy "locations_select_assigned_or_manager"
on public.locations
for select
to authenticated
using (public.can_access_location(id));

create policy "locations_insert_manager"
on public.locations
for insert
to authenticated
with check (public.is_organization_manager(organization_id));

create policy "locations_update_manager"
on public.locations
for update
to authenticated
using (public.is_organization_manager(organization_id))
with check (public.is_organization_manager(organization_id));

create policy "locations_delete_manager"
on public.locations
for delete
to authenticated
using (public.is_organization_manager(organization_id));

create policy "roles_select_authenticated"
on public.roles
for select
to authenticated
using (true);

create policy "organization_memberships_select_member"
on public.organization_memberships
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy "organization_memberships_insert_manager"
on public.organization_memberships
for insert
to authenticated
with check (public.is_organization_manager(organization_id));

create policy "organization_memberships_update_manager"
on public.organization_memberships
for update
to authenticated
using (public.is_organization_manager(organization_id))
with check (public.is_organization_manager(organization_id));

create policy "organization_memberships_delete_manager"
on public.organization_memberships
for delete
to authenticated
using (public.is_organization_manager(organization_id));

create policy "location_memberships_select_assigned_or_manager"
on public.location_memberships
for select
to authenticated
using (public.can_access_location(location_id));

create policy "location_memberships_insert_manager"
on public.location_memberships
for insert
to authenticated
with check (
  exists (
    select 1
    from public.locations location
    where location.id = location_id
      and public.is_organization_manager(location.organization_id)
  )
);

create policy "location_memberships_update_manager"
on public.location_memberships
for update
to authenticated
using (
  exists (
    select 1
    from public.locations location
    where location.id = location_id
      and public.is_organization_manager(location.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.locations location
    where location.id = location_id
      and public.is_organization_manager(location.organization_id)
  )
);

create policy "location_memberships_delete_manager"
on public.location_memberships
for delete
to authenticated
using (
  exists (
    select 1
    from public.locations location
    where location.id = location_id
      and public.is_organization_manager(location.organization_id)
  )
);

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.locations to authenticated;
grant select on public.roles to authenticated;
grant select, insert, update, delete on public.organization_memberships to authenticated;
grant select, insert, update, delete on public.location_memberships to authenticated;

grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_manager(uuid) to authenticated;
grant execute on function public.shares_organization(uuid) to authenticated;
grant execute on function public.can_access_location(uuid) to authenticated;
grant execute on function public.storage_path_is_accessible(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('source-documents', 'source-documents', false, 52428800)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create policy "source_documents_select_scoped"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'source-documents'
  and public.storage_path_is_accessible(name)
);

create policy "source_documents_insert_scoped"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'source-documents'
  and public.storage_path_is_accessible(name)
);

create policy "source_documents_update_scoped"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'source-documents'
  and public.storage_path_is_accessible(name)
)
with check (
  bucket_id = 'source-documents'
  and public.storage_path_is_accessible(name)
);

create policy "source_documents_delete_scoped"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'source-documents'
  and public.storage_path_is_accessible(name)
);
