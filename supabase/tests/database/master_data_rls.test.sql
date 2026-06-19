begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select has_table(
  'public',
  'source_import_rows',
  'source import rows table exists'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000301', 'manager-master-data@example.com'),
  ('00000000-0000-0000-0000-000000000302', 'manager-other-org@example.com');

insert into public.organizations (id, name, slug)
values
  ('33000000-0000-0000-0000-000000000001', 'Master Data Org', 'master-data-org'),
  ('44000000-0000-0000-0000-000000000001', 'Other Master Data Org', 'other-master-data-org');

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
    '33000000-0000-0000-0000-000000000011',
    '33000000-0000-0000-0000-000000000001',
    'Master Data Location',
    'master-data-location',
    'America/New_York',
    '04:00'
  ),
  (
    '44000000-0000-0000-0000-000000000011',
    '44000000-0000-0000-0000-000000000001',
    'Other Master Data Location',
    'other-master-data-location',
    'America/New_York',
    '04:00'
  );

insert into public.organization_memberships (
  organization_id,
  profile_id,
  role_id
)
select
  membership.organization_id,
  membership.profile_id,
  roles.id
from (
  values
    (
      '33000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000301'::uuid,
      'manager'::text
    ),
    (
      '44000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000302'::uuid,
      'manager'::text
    )
) as membership(organization_id, profile_id, role_slug)
join public.roles on roles.slug = membership.role_slug;

insert into public.source_imports (
  id,
  organization_id,
  location_id,
  source_type,
  file_hash,
  file_path,
  file_name
)
values
  (
    '33000000-0000-0000-0000-000000000101',
    '33000000-0000-0000-0000-000000000001',
    '33000000-0000-0000-0000-000000000011',
    'plcb_invoice',
    'master-data-own',
    '33000000-0000-0000-0000-000000000001/33000000-0000-0000-0000-000000000011/own.pdf',
    'own.pdf'
  ),
  (
    '44000000-0000-0000-0000-000000000101',
    '44000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000011',
    'plcb_invoice',
    'master-data-other',
    '44000000-0000-0000-0000-000000000001/44000000-0000-0000-0000-000000000011/other.pdf',
    'other.pdf'
  );

insert into public.source_import_rows (
  id,
  source_import_id,
  row_index,
  raw_data,
  normalized_data
)
values
  (
    '33000000-0000-0000-0000-000000000201',
    '33000000-0000-0000-0000-000000000101',
    1,
    '{"product":"Own row"}',
    '{"product":"Own row"}'
  ),
  (
    '44000000-0000-0000-0000-000000000201',
    '44000000-0000-0000-0000-000000000101',
    1,
    '{"product":"Other row"}',
    '{"product":"Other row"}'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000301',
  true
);

select results_eq(
  $$
    select id
    from public.source_import_rows
    order by id
  $$,
  array['33000000-0000-0000-0000-000000000201'::uuid],
  'members only see staged rows through imports in their organization'
);

select lives_ok(
  $$
    insert into public.source_import_rows (
      source_import_id,
      row_index,
      raw_data,
      normalized_data
    )
    values (
      '33000000-0000-0000-0000-000000000101',
      2,
      '{"product":"Second own row"}',
      '{"product":"Second own row"}'
    )
  $$,
  'members can add rows to imports in their organization'
);

select throws_ok(
  $$
    insert into public.source_import_rows (
      source_import_id,
      row_index,
      raw_data,
      normalized_data
    )
    values (
      '44000000-0000-0000-0000-000000000101',
      2,
      '{"product":"Intruding row"}',
      '{"product":"Intruding row"}'
    )
  $$,
  '42501',
  null,
  'members cannot add rows to another organization import'
);

rollback;
