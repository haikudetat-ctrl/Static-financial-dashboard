begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

select has_table('public', 'recipes', 'recipes table exists');
select has_table('public', 'recipe_versions', 'recipe versions table exists');
select has_table(
  'public',
  'recipe_version_components',
  'recipe components table exists'
);
select has_table(
  'public',
  'recipe_menu_item_mappings',
  'menu item mappings table exists'
);
select has_table(
  'public',
  'production_batches',
  'production batches table exists'
);
select has_table(
  'public',
  'production_batch_components',
  'production batch components table exists'
);
select has_table(
  'public',
  'production_yield_variances',
  'production yield variances table exists'
);
select has_table(
  'public',
  'sales_business_days',
  'sales business days table exists'
);
select has_table('public', 'sales_items', 'sales items table exists');
select has_table('public', 'calculation_runs', 'calculation runs table exists');
select has_table(
  'public',
  'calculation_run_inputs',
  'calculation run inputs table exists'
);
select has_table(
  'public',
  'daily_theoretical_usage',
  'daily theoretical usage table exists'
);
select has_function(
  'public',
  'activate_recipe_version',
  array['uuid'],
  'recipe activation function exists'
);
select has_function(
  'public',
  'post_production_batch',
  array['uuid'],
  'production posting function exists'
);
select has_function(
  'public',
  'post_sales_import',
  array['uuid'],
  'sales posting function exists'
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
  is_produced,
  default_storage_location_id
)
select
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Production Test Batch',
  category.id,
  milliliter.id,
  liter.id,
  liter.id,
  false,
  true,
  '10000000-0000-0000-0000-000000000101'
from public.inventory_categories category
join public.units milliliter
  on milliliter.organization_id = category.organization_id
  and milliliter.name = 'Milliliter'
join public.units liter
  on liter.organization_id = category.organization_id
  and liter.name = 'Liter'
where category.organization_id = '10000000-0000-0000-0000-000000000001'
  and category.name = 'Mixers';

insert into public.recipes (
  id,
  organization_id,
  name,
  recipe_type,
  output_inventory_item_id,
  created_by
)
values
  (
    '70000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000001',
    'Production Test Recipe',
    'batch',
    '70000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '70000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000001',
    'Menu Test Recipe',
    'menu_item',
    null,
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '70000000-0000-0000-0000-000000000013',
    '10000000-0000-0000-0000-000000000001',
    'Cycle A',
    'prep',
    '70000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '70000000-0000-0000-0000-000000000014',
    '10000000-0000-0000-0000-000000000001',
    'Cycle B',
    'prep',
    '70000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001'
  );

insert into public.recipe_versions (
  id,
  recipe_id,
  version_number,
  effective_from,
  output_quantity,
  output_unit_id,
  status,
  created_by
)
select
  fixture.id,
  fixture.recipe_id,
  1,
  '2026-06-01',
  fixture.output_quantity,
  unit.id,
  'draft',
  '00000000-0000-0000-0000-000000000001'
from (
  values
    (
      '70000000-0000-0000-0000-000000000021'::uuid,
      '70000000-0000-0000-0000-000000000011'::uuid,
      100::numeric,
      'Milliliter'::text
    ),
    (
      '70000000-0000-0000-0000-000000000022'::uuid,
      '70000000-0000-0000-0000-000000000012'::uuid,
      1::numeric,
      'Each'::text
    ),
    (
      '70000000-0000-0000-0000-000000000023'::uuid,
      '70000000-0000-0000-0000-000000000013'::uuid,
      1::numeric,
      'Milliliter'::text
    ),
    (
      '70000000-0000-0000-0000-000000000024'::uuid,
      '70000000-0000-0000-0000-000000000014'::uuid,
      1::numeric,
      'Milliliter'::text
    )
) as fixture(id, recipe_id, output_quantity, unit_name)
join public.units unit
  on unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and unit.name = fixture.unit_name;

insert into public.recipe_version_components (
  recipe_version_id,
  component_inventory_item_id,
  component_recipe_id,
  quantity,
  unit_id,
  line_order
)
select
  fixture.recipe_version_id,
  fixture.inventory_item_id,
  fixture.component_recipe_id,
  fixture.quantity,
  unit.id,
  fixture.line_order
from (
  values
    (
      '70000000-0000-0000-0000-000000000021'::uuid,
      '10000000-0000-0000-0000-000000000201'::uuid,
      null::uuid,
      100::numeric,
      'Milliliter'::text,
      1
    ),
    (
      '70000000-0000-0000-0000-000000000022'::uuid,
      null::uuid,
      '70000000-0000-0000-0000-000000000011'::uuid,
      50::numeric,
      'Milliliter'::text,
      1
    ),
    (
      '70000000-0000-0000-0000-000000000023'::uuid,
      null::uuid,
      '70000000-0000-0000-0000-000000000014'::uuid,
      1::numeric,
      'Milliliter'::text,
      1
    ),
    (
      '70000000-0000-0000-0000-000000000024'::uuid,
      null::uuid,
      '70000000-0000-0000-0000-000000000013'::uuid,
      1::numeric,
      'Milliliter'::text,
      1
    )
) as fixture(
  recipe_version_id,
  inventory_item_id,
  component_recipe_id,
  quantity,
  unit_name,
  line_order
)
join public.units unit
  on unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and unit.name = fixture.unit_name;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$ select public.activate_recipe_version('70000000-0000-0000-0000-000000000021') $$,
  'manager activates a valid batch recipe version'
);
select is(
  (
    select status::text
    from public.recipe_versions
    where id = '70000000-0000-0000-0000-000000000021'
  ),
  'active',
  'activated recipe version status is persisted'
);

select lives_ok(
  $$ select public.activate_recipe_version('70000000-0000-0000-0000-000000000024') $$,
  'first side of a future cycle can activate'
);
select throws_ok(
  $$ select public.activate_recipe_version('70000000-0000-0000-0000-000000000023') $$,
  'P0001',
  'Recipe dependency cycle detected',
  'activation rejects an indirect recipe cycle'
);

insert into public.inventory_transactions (
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
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  'opening_balance',
  '2026-06-01 12:00:00+00',
  'slice_4_test',
  '70000000-0000-0000-0000-000000000031',
  'slice-4-opening-bourbon',
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
select
  transaction.id,
  '10000000-0000-0000-0000-000000000201',
  '10000000-0000-0000-0000-000000000101',
  1000,
  0.04,
  'slice_4_test'
from public.inventory_transactions transaction
where transaction.idempotency_key = 'slice-4-opening-bourbon';

insert into public.production_batches (
  id,
  organization_id,
  location_id,
  recipe_id,
  recipe_version_id,
  status,
  planned_output_quantity,
  actual_output_quantity,
  output_unit_id,
  created_by,
  produced_at
)
select
  '70000000-0000-0000-0000-000000000041',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '70000000-0000-0000-0000-000000000011',
  '70000000-0000-0000-0000-000000000021',
  'draft',
  100,
  100,
  unit.id,
  '00000000-0000-0000-0000-000000000002',
  '2026-06-19 15:00:00+00'
from public.units unit
where unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and unit.name = 'Milliliter';

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);

select lives_ok(
  $$ select public.post_production_batch('70000000-0000-0000-0000-000000000041') $$,
  'location member posts a valid production batch'
);
select is(
  (
    select count(*)::integer
    from public.inventory_transactions
    where source_type = 'production_batch'
      and source_id = '70000000-0000-0000-0000-000000000041'
  ),
  2,
  'production creates one consumption and one output transaction'
);
select is(
  (
    select round(abs(sum(line.extended_value)), 4)
    from public.inventory_transaction_lines line
    join public.inventory_transactions transaction
      on transaction.id = line.inventory_transaction_id
    where transaction.source_type = 'production_batch'
      and transaction.source_id = '70000000-0000-0000-0000-000000000041'
  ),
  0::numeric,
  'production input and output values conserve value'
);
select is(
  (
    select quantity
    from public.inventory_on_hand
    where inventory_item_id = '70000000-0000-0000-0000-000000000001'
  ),
  100::numeric,
  'production output increases physical on-hand'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$ select public.activate_recipe_version('70000000-0000-0000-0000-000000000022') $$,
  'manager activates a valid menu recipe'
);

insert into public.recipe_menu_item_mappings (
  organization_id,
  recipe_id,
  source_system,
  external_item_guid,
  external_item_name,
  created_by
)
values (
  '10000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000012',
  'toast',
  'toast-test-old-fashioned',
  'Test Old Fashioned',
  '00000000-0000-0000-0000-000000000001'
);

insert into public.source_imports (
  id,
  organization_id,
  location_id,
  source_type,
  file_hash,
  file_path,
  file_name,
  parser_version,
  status,
  row_count
)
values (
  '70000000-0000-0000-0000-000000000051',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  'toast_pmix',
  'slice-4-toast-hash',
  'slice-4/toast.csv',
  'toast.csv',
  '1.0.0',
  'staged',
  1
);

insert into public.source_import_rows (
  source_import_id,
  row_index,
  raw_data,
  normalized_data,
  status
)
values (
  '70000000-0000-0000-0000-000000000051',
  0,
  '{}',
  '{
    "item_guid": "toast-test-old-fashioned",
    "item_name": "Test Old Fashioned",
    "business_date": "2026-06-19",
    "quantity_sold": 2,
    "void_quantity": 0,
    "comp_quantity": 1,
    "net_sales": 24
  }',
  'staged'
);

select lives_ok(
  $$ select public.post_sales_import('70000000-0000-0000-0000-000000000051') $$,
  'manager posts a fully mapped Toast PMIX import'
);
select is(
  (
    select count(*)::integer
    from public.sales_business_days
    where source_import_id = '70000000-0000-0000-0000-000000000051'
  ),
  1,
  'sales import creates one business day'
);
select is(
  (
    select quantity_base
    from public.daily_theoretical_usage
    where inventory_item_id = '10000000-0000-0000-0000-000000000201'
  ),
  100::numeric,
  'nested menu recipe expands to purchased theoretical usage'
);
select is(
  (
    select theoretical_cost
    from public.daily_theoretical_usage
    where inventory_item_id = '10000000-0000-0000-0000-000000000201'
  ),
  4::numeric,
  'theoretical usage uses the available weighted-average inventory cost'
);
select is(
  (
    select count(*)::integer
    from public.inventory_transactions
    where source_type = 'sales_import'
  ),
  0,
  'theoretical sales usage does not mutate physical inventory'
);
select lives_ok(
  $$ select public.post_sales_import('70000000-0000-0000-0000-000000000051') $$,
  'sales import posting is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.sales_items
    where sales_business_day_id in (
      select id
      from public.sales_business_days
      where source_import_id = '70000000-0000-0000-0000-000000000051'
    )
  ),
  1,
  'replaying sales import does not duplicate sales rows'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);
select throws_ok(
  $$ select public.activate_recipe_version('70000000-0000-0000-0000-000000000023') $$,
  'P0001',
  'Recipe version not found',
  'staff cannot activate recipe versions hidden by manager policy'
);

rollback;
