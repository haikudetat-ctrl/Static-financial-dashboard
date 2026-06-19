begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select has_table('public', 'inventory_periods', 'inventory periods table exists');
select has_table('public', 'inventory_counts', 'inventory counts table exists');
select has_table('public', 'inventory_count_lines', 'inventory count lines table exists');
select has_table('public', 'inventory_transactions', 'inventory transactions table exists');
select has_table(
  'public',
  'inventory_transaction_lines',
  'inventory transaction lines table exists'
);
select has_view('public', 'inventory_on_hand', 'inventory on-hand view exists');
select has_view(
  'public',
  'negative_inventory',
  'negative inventory view exists'
);
select has_function(
  'public',
  'approve_inventory_count',
  array['uuid'],
  'count approval function exists'
);
select has_column(
  'public',
  'inventory_count_lines',
  'approved_at',
  'count lines retain individual approval time'
);
select has_function(
  'public',
  'approve_inventory_count_line',
  array['uuid'],
  'individual line approval function exists'
);

insert into public.storage_locations (
  id,
  organization_id,
  location_id,
  name,
  walk_order,
  area
)
values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  'Ledger Test Zone',
  10,
  'bar'
);

insert into public.inventory_items (
  id,
  organization_id,
  name,
  category_id,
  base_unit_id,
  purchase_unit_id,
  count_unit_id,
  is_purchased,
  allows_tenths_counting,
  default_storage_location_id
)
select
  '50000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Ledger Test Bottle',
  category.id,
  unit.id,
  unit.id,
  unit.id,
  true,
  true,
  '50000000-0000-0000-0000-000000000001'
from public.inventory_categories category
cross join public.units unit
where category.organization_id = '10000000-0000-0000-0000-000000000001'
  and category.name = 'Spirits'
  and unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and unit.name = 'Bottle';

insert into public.inventory_periods (
  id,
  organization_id,
  location_id,
  period_start,
  period_end,
  status,
  opened_by
)
values (
  '50000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '2026-07-01',
  '2026-07-31',
  'count_in_progress',
  '00000000-0000-0000-0000-000000000001'
);

insert into public.inventory_counts (
  id,
  organization_id,
  location_id,
  inventory_period_id,
  count_type,
  status,
  assigned_to
)
values (
  '50000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '50000000-0000-0000-0000-000000000003',
  'full',
  'counted',
  '00000000-0000-0000-0000-000000000002'
);

insert into public.inventory_count_assignments (
  id,
  inventory_count_id,
  storage_location_id,
  assigned_profile_id,
  status
)
values (
  '50000000-0000-0000-0000-000000000005',
  '50000000-0000-0000-0000-000000000004',
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'counted'
);

insert into public.inventory_count_lines (
  id,
  inventory_count_assignment_id,
  inventory_item_id,
  storage_location_id,
  counted_quantity,
  counted_tenths,
  is_open_container,
  expected_quantity,
  status
)
values (
  '50000000-0000-0000-0000-000000000006',
  '50000000-0000-0000-0000-000000000005',
  '50000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000001',
  1,
  0.5,
  true,
  0,
  'counted'
);

insert into public.inventory_item_cost_snapshots (
  inventory_item_id,
  inventory_period_id,
  weighted_average_cost,
  effective_at
)
values (
  '50000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000003',
  10,
  '2026-07-01 12:00:00+00'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$ select public.approve_inventory_count_line('50000000-0000-0000-0000-000000000006') $$,
  'manager can approve an individual counted line'
);

select ok(
  (
    select approved_at is not null
      and approved_by = '00000000-0000-0000-0000-000000000001'
    from public.inventory_count_lines
    where id = '50000000-0000-0000-0000-000000000006'
  ),
  'individual approval records manager and timestamp'
);

select lives_ok(
  $$ select public.approve_inventory_count('50000000-0000-0000-0000-000000000004') $$,
  'manager can approve a completed full count'
);

select is(
  (
    select transaction_type::text
    from public.inventory_transactions
    where source_id = '50000000-0000-0000-0000-000000000004'
  ),
  'opening_balance',
  'first approved full count posts an opening balance'
);

select is(
  (
    select quantity
    from public.inventory_on_hand
    where inventory_item_id = '50000000-0000-0000-0000-000000000002'
  ),
  1125::numeric,
  'on hand stores the counted quantity in the item base unit'
);

select lives_ok(
  $$ select public.approve_inventory_count('50000000-0000-0000-0000-000000000004') $$,
  'repeated approval is idempotent'
);

select is(
  (
    select count(*)::integer
    from public.inventory_transactions
    where idempotency_key =
      'count:50000000-0000-0000-0000-000000000004:approval'
  ),
  1,
  'idempotency key prevents duplicate count posting'
);

insert into public.inventory_transactions (
  id,
  organization_id,
  location_id,
  transaction_type,
  effective_at,
  source_type,
  source_id,
  idempotency_key,
  actor_id
)
values (
  '50000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  'manual_adjustment',
  '2026-07-02 12:00:00+00',
  'test',
  '50000000-0000-0000-0000-000000000007',
  'test:negative-inventory',
  '00000000-0000-0000-0000-000000000001'
);

insert into public.inventory_transaction_lines (
  inventory_transaction_id,
  inventory_item_id,
  storage_location_id,
  quantity,
  unit_cost,
  reason_code
)
values (
  '50000000-0000-0000-0000-000000000007',
  '50000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000001',
  -2000,
  10,
  'test_negative'
);

select is(
  (
    select count(*)::integer
    from public.negative_inventory
    where inventory_item_id = '50000000-0000-0000-0000-000000000002'
  ),
  1,
  'negative posted quantity appears in the blocking exception view'
);

rollback;
