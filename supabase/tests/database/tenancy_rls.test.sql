begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'locations', 'locations table exists');
select has_table(
  'public',
  'organization_memberships',
  'organization memberships table exists'
);
select has_table(
  'public',
  'location_memberships',
  'location memberships table exists'
);
select results_eq(
  $$ select slug from public.roles order by slug $$,
  array['manager', 'staff'],
  'manager and staff roles are seeded'
);
select ok(
  (
    select not public
    from storage.buckets
    where id = 'source-documents'
  ),
  'source-documents bucket is private'
);
select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'profiles',
        'organizations',
        'locations',
        'roles',
        'organization_memberships',
        'location_memberships'
      )
      and relation.relrowsecurity
  ),
  6,
  'RLS is enabled on every tenancy table'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000101', 'manager-a@example.com'),
  ('00000000-0000-0000-0000-000000000102', 'staff-a@example.com'),
  ('00000000-0000-0000-0000-000000000201', 'manager-b@example.com');

insert into public.organizations (id, name, slug)
values
  ('11000000-0000-0000-0000-000000000001', 'Organization A', 'organization-a'),
  ('22000000-0000-0000-0000-000000000001', 'Organization B', 'organization-b');

insert into public.locations (
  id,
  organization_id,
  name,
  slug,
  timezone,
  business_day_cutoff
)
values
  (
    '11000000-0000-0000-0000-000000000011',
    '11000000-0000-0000-0000-000000000001',
    'Location A1',
    'location-a1',
    'America/New_York',
    '04:00'
  ),
  (
    '11000000-0000-0000-0000-000000000012',
    '11000000-0000-0000-0000-000000000001',
    'Location A2',
    'location-a2',
    'America/New_York',
    '04:00'
  ),
  (
    '22000000-0000-0000-0000-000000000011',
    '22000000-0000-0000-0000-000000000001',
    'Location B1',
    'location-b1',
    'America/New_York',
    '04:00'
  );

insert into public.organization_memberships (
  id,
  organization_id,
  profile_id,
  role_id
)
select
  membership.id,
  membership.organization_id,
  membership.profile_id,
  roles.id
from (
  values
    (
      '11000000-0000-0000-0000-000000000021'::uuid,
      '11000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000101'::uuid,
      'manager'::text
    ),
    (
      '11000000-0000-0000-0000-000000000022'::uuid,
      '11000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000102'::uuid,
      'staff'::text
    ),
    (
      '22000000-0000-0000-0000-000000000021'::uuid,
      '22000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000201'::uuid,
      'manager'::text
    )
) as membership(id, organization_id, profile_id, role_slug)
join public.roles on roles.slug = membership.role_slug;

insert into public.location_memberships (
  location_id,
  organization_membership_id,
  role_id
)
select
  '11000000-0000-0000-0000-000000000011',
  '11000000-0000-0000-0000-000000000022',
  roles.id
from public.roles
where roles.slug = 'staff';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

select results_eq(
  $$ select slug from public.organizations order by slug $$,
  array['organization-a'],
  'manager sees only their organization'
);

select results_eq(
  $$ select slug from public.locations order by slug $$,
  array['location-a1', 'location-a2'],
  'manager sees locations in their organization'
);

select ok(
  public.storage_path_is_accessible(
    '11000000-0000-0000-0000-000000000001/11000000-0000-0000-0000-000000000011/invoice.pdf'
  ),
  'manager can use an organization and location scoped storage path'
);

select throws_ok(
  $$
    insert into public.locations (
      organization_id,
      name,
      slug,
      timezone,
      business_day_cutoff
    )
    values (
      '22000000-0000-0000-0000-000000000001',
      'Intruding location',
      'intruding-location',
      'America/New_York',
      '04:00'
    )
  $$,
  '42501',
  null,
  'manager cannot write into another organization'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000102',
  true
);

select results_eq(
  $$ select slug from public.locations order by slug $$,
  array['location-a1'],
  'staff sees only assigned locations'
);

rollback;
