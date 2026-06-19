insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'manager@static.local',
    crypt('StaticOS123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Demo Manager"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'staff@static.local',
    crypt('StaticOS123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Demo Staff"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '{"sub":"00000000-0000-0000-0000-000000000001","email":"manager@static.local","email_verified":true}',
    'email',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '{"sub":"00000000-0000-0000-0000-000000000002","email":"staff@static.local","email_verified":true}',
    'email',
    now(),
    now(),
    now()
  )
on conflict (provider_id, provider) do nothing;

insert into public.organizations (id, name, slug)
values (
  '10000000-0000-0000-0000-000000000001',
  'Static Cocktail Bar',
  'static-cocktail-bar'
)
on conflict (id) do nothing;

insert into public.locations (
  id,
  organization_id,
  name,
  slug,
  timezone,
  business_day_cutoff
)
values (
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000001',
  'Main Bar',
  'main-bar',
  'America/New_York',
  '04:00'
)
on conflict (id) do nothing;

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
  role.id
from (
  values
    (
      '10000000-0000-0000-0000-000000000021'::uuid,
      '10000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      'manager'::text
    ),
    (
      '10000000-0000-0000-0000-000000000022'::uuid,
      '10000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      'staff'::text
    )
) as membership(id, organization_id, profile_id, role_slug)
join public.roles role on role.slug = membership.role_slug
on conflict (id) do nothing;

insert into public.location_memberships (
  id,
  location_id,
  organization_membership_id,
  role_id
)
select
  '10000000-0000-0000-0000-000000000031',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000022',
  role.id
from public.roles role
where role.slug = 'staff'
on conflict (id) do nothing;

-- ============================================================
-- Seed: Standard Units
-- ============================================================

do $$
declare
  v_org_id uuid := '10000000-0000-0000-0000-000000000001';
  v_ml_id uuid;
  v_g_id uuid;
  v_each_id uuid;
  v_dash_id uuid;
  v_drop_id uuid;
begin
  -- Base units first (no base_unit_id dependency)
  insert into public.units (id, organization_id, name, abbreviation, unit_type, base_unit_id, conversion_factor_to_base)
  values
    (gen_random_uuid(), v_org_id, 'Milliliter', 'ml', 'volume', null, null),
    (gen_random_uuid(), v_org_id, 'Gram', 'g', 'weight', null, null),
    (gen_random_uuid(), v_org_id, 'Each', 'ea', 'each', null, null),
    (gen_random_uuid(), v_org_id, 'Dash', 'dash', 'dash', null, null),
    (gen_random_uuid(), v_org_id, 'Drop', 'drop', 'drop', null, null)
  on conflict (organization_id, name) do nothing;

  -- Get the generated IDs for base units
  select id into v_ml_id from public.units where organization_id = v_org_id and name = 'Milliliter';
  select id into v_g_id from public.units where organization_id = v_org_id and name = 'Gram';
  select id into v_each_id from public.units where organization_id = v_org_id and name = 'Each';
  select id into v_dash_id from public.units where organization_id = v_org_id and name = 'Dash';
  select id into v_drop_id from public.units where organization_id = v_org_id and name = 'Drop';

  -- Derived units (reference base units)
  insert into public.units (id, organization_id, name, abbreviation, unit_type, base_unit_id, conversion_factor_to_base)
  values
    (gen_random_uuid(), v_org_id, 'Ounce', 'oz', 'volume', v_ml_id, 29.5735),
    (gen_random_uuid(), v_org_id, 'Liter', 'L', 'volume', v_ml_id, 1000),
    (gen_random_uuid(), v_org_id, 'Quart', 'qt', 'volume', v_ml_id, 946.353),
    (gen_random_uuid(), v_org_id, 'Pint', 'pt', 'volume', v_ml_id, 473.176),
    (gen_random_uuid(), v_org_id, 'Gallon', 'gal', 'volume', v_ml_id, 3785.41),
    (gen_random_uuid(), v_org_id, 'Pound', 'lb', 'weight', v_g_id, 453.592),
    (gen_random_uuid(), v_org_id, 'Kilogram', 'kg', 'weight', v_g_id, 1000),
    (gen_random_uuid(), v_org_id, 'Case', 'cs', 'count', v_each_id, 1),
    (gen_random_uuid(), v_org_id, 'Bag', 'bag', 'count', v_each_id, 1),
    (gen_random_uuid(), v_org_id, 'Container', 'container', 'count', v_each_id, 1),
    (gen_random_uuid(), v_org_id, 'Bottle', 'btl', 'volume', v_ml_id, 750)
  on conflict (organization_id, name) do nothing;

  -- Update base units to reference themselves as their own base
  update public.units set base_unit_id = v_ml_id, conversion_factor_to_base = 1 where id = v_ml_id;
  update public.units set base_unit_id = v_g_id, conversion_factor_to_base = 1 where id = v_g_id;
  update public.units set base_unit_id = v_each_id, conversion_factor_to_base = 1 where id = v_each_id;
  update public.units set base_unit_id = v_dash_id, conversion_factor_to_base = 1 where id = v_dash_id;
  update public.units set base_unit_id = v_drop_id, conversion_factor_to_base = 1 where id = v_drop_id;
end;
$$;

-- ============================================================
-- Seed: Default Inventory Categories
-- ============================================================

insert into public.inventory_categories (id, organization_id, name, description)
values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Spirits', 'Base spirits, liqueurs, and bitters'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Wine', 'Still and sparkling wine'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Beer', 'Bottled and draft beer'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Liqueurs', 'Cordial and liqueur bottles'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Mixers', 'Juices, sodas, syrups, and bitters'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Produce', 'Fresh fruit, herbs, and vegetables'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Dry Goods', 'Non-perishable packaged goods'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Dairy', 'Milk, cream, eggs, and alternatives'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Proteins', 'Meat, seafood, and other proteins'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Packaging', 'To-go containers, bags, and disposables')
on conflict (organization_id, name) do nothing;

-- ============================================================
-- Seed: Slice 2 Count Fixtures
-- ============================================================

insert into public.storage_locations (
  id,
  organization_id,
  location_id,
  name,
  walk_order,
  area
)
values
  (
    '10000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    'Back Bar',
    10,
    'bar'
  ),
  (
    '10000000-0000-0000-0000-000000000102',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000011',
    'Liquor Room',
    20,
    'storage'
  )
on conflict (organization_id, location_id, name) do nothing;

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
  fixture.id,
  '10000000-0000-0000-0000-000000000001',
  fixture.name,
  category.id,
  base_unit.id,
  purchase_unit.id,
  count_unit.id,
  true,
  fixture.allows_tenths,
  fixture.storage_location_id
from (
  values
    (
      '10000000-0000-0000-0000-000000000201'::uuid,
      'Bourbon 750 ml'::text,
      'Spirits'::text,
      'Milliliter'::text,
      'Bottle'::text,
      'Bottle'::text,
      true,
      '10000000-0000-0000-0000-000000000101'::uuid
    ),
    (
      '10000000-0000-0000-0000-000000000202'::uuid,
      'Gin 750 ml'::text,
      'Spirits'::text,
      'Milliliter'::text,
      'Bottle'::text,
      'Bottle'::text,
      true,
      '10000000-0000-0000-0000-000000000101'::uuid
    ),
    (
      '10000000-0000-0000-0000-000000000203'::uuid,
      'Lime Juice'::text,
      'Mixers'::text,
      'Milliliter'::text,
      'Liter'::text,
      'Liter'::text,
      false,
      '10000000-0000-0000-0000-000000000102'::uuid
    ),
    (
      '10000000-0000-0000-0000-000000000204'::uuid,
      'Cocktail Napkins'::text,
      'Packaging'::text,
      'Each'::text,
      'Case'::text,
      'Each'::text,
      false,
      '10000000-0000-0000-0000-000000000102'::uuid
    )
) as fixture(
  id,
  name,
  category_name,
  base_unit_name,
  purchase_unit_name,
  count_unit_name,
  allows_tenths,
  storage_location_id
)
join public.inventory_categories category
  on category.organization_id = '10000000-0000-0000-0000-000000000001'
  and category.name = fixture.category_name
join public.units base_unit
  on base_unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and base_unit.name = fixture.base_unit_name
join public.units purchase_unit
  on purchase_unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and purchase_unit.name = fixture.purchase_unit_name
join public.units count_unit
  on count_unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and count_unit.name = fixture.count_unit_name
on conflict (id) do nothing;

insert into public.storage_location_items (
  organization_id,
  storage_location_id,
  inventory_item_id,
  default_par
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000201',
    6
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000202',
    4
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000102',
    '10000000-0000-0000-0000-000000000203',
    3
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000102',
    '10000000-0000-0000-0000-000000000204',
    200
  )
on conflict (storage_location_id, inventory_item_id) do nothing;

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
  '10000000-0000-0000-0000-000000000301',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '2026-06-01',
  '2026-06-30',
  'draft',
  '00000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

-- ============================================================
-- Seed: Slice 3 Purchasing Fixtures
-- ============================================================

insert into public.vendors (
  id,
  organization_id,
  name,
  vendor_type
)
values (
  '10000000-0000-0000-0000-000000000401',
  '10000000-0000-0000-0000-000000000001',
  'PLCB',
  'plcb'
)
on conflict (id) do nothing;

insert into public.vendor_order_rules (
  id,
  organization_id,
  vendor_id,
  location_id,
  cutoff_day,
  cutoff_time,
  lead_time_days,
  minimum_order_amount,
  default_ordering_method,
  notes
)
values (
  '10000000-0000-0000-0000-000000000402',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000401',
  '10000000-0000-0000-0000-000000000011',
  1,
  '14:00',
  2,
  100,
  'portal',
  'Demo PLCB ordering rule.'
)
on conflict (id) do nothing;

insert into public.vendor_items (
  id,
  organization_id,
  vendor_id,
  inventory_item_id,
  vendor_product_code,
  vendor_product_name,
  pack_size,
  purchase_unit_id
)
select
  fixture.id,
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000401',
  fixture.inventory_item_id,
  fixture.product_code,
  fixture.product_name,
  '1 x 750 ml',
  unit.id
from (
  values
    (
      '10000000-0000-0000-0000-000000000411'::uuid,
      '10000000-0000-0000-0000-000000000201'::uuid,
      'PLCB-BOURBON-750'::text,
      'Bourbon 750 ml'::text
    ),
    (
      '10000000-0000-0000-0000-000000000412'::uuid,
      '10000000-0000-0000-0000-000000000202'::uuid,
      'PLCB-GIN-750'::text,
      'Gin 750 ml'::text
    )
) as fixture(id, inventory_item_id, product_code, product_name)
join public.units unit
  on unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and unit.name = 'Bottle'
on conflict (id) do nothing;

insert into public.vendor_item_prices (
  id,
  organization_id,
  vendor_item_id,
  unit_price,
  effective_date
)
values
  (
    '10000000-0000-0000-0000-000000000421',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000411',
    24,
    '2026-06-01'
  ),
  (
    '10000000-0000-0000-0000-000000000422',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000412',
    22,
    '2026-06-01'
  )
on conflict (id) do nothing;

insert into public.order_guides (
  id,
  organization_id,
  location_id,
  vendor_id,
  name
)
values (
  '10000000-0000-0000-0000-000000000431',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000401',
  'Main Bar PLCB'
)
on conflict (id) do nothing;

insert into public.order_guide_items (
  id,
  organization_id,
  order_guide_id,
  vendor_item_id,
  inventory_item_id,
  default_par,
  preferred_pack
)
values
  (
    '10000000-0000-0000-0000-000000000441',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000431',
    '10000000-0000-0000-0000-000000000411',
    '10000000-0000-0000-0000-000000000201',
    12,
    'bottle'
  ),
  (
    '10000000-0000-0000-0000-000000000442',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000431',
    '10000000-0000-0000-0000-000000000412',
    '10000000-0000-0000-0000-000000000202',
    8,
    'bottle'
  )
on conflict (id) do nothing;

insert into public.pack_definitions (
  id,
  organization_id,
  inventory_item_id,
  pack_unit_id,
  quantity_per_pack,
  vendor_item_id
)
select
  fixture.id,
  '10000000-0000-0000-0000-000000000001',
  fixture.inventory_item_id,
  unit.id,
  1,
  fixture.vendor_item_id
from (
  values
    (
      '10000000-0000-0000-0000-000000000451'::uuid,
      '10000000-0000-0000-0000-000000000201'::uuid,
      '10000000-0000-0000-0000-000000000411'::uuid
    ),
    (
      '10000000-0000-0000-0000-000000000452'::uuid,
      '10000000-0000-0000-0000-000000000202'::uuid,
      '10000000-0000-0000-0000-000000000412'::uuid
    )
) as fixture(id, inventory_item_id, vendor_item_id)
join public.units unit
  on unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and unit.name = 'Bottle'
on conflict (id) do nothing;

-- ============================================================
-- Seed: Slice 4 Recipe and Production Fixtures
-- ============================================================

insert into public.inventory_items (
  id,
  organization_id,
  name,
  description,
  category_id,
  base_unit_id,
  purchase_unit_id,
  count_unit_id,
  is_purchased,
  is_produced,
  default_storage_location_id
)
select
  '10000000-0000-0000-0000-000000000205',
  '10000000-0000-0000-0000-000000000001',
  'Old Fashioned Batch',
  'Produced cocktail batch used by the seeded Old Fashioned menu recipe.',
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
  and category.name = 'Mixers'
on conflict (id) do nothing;

insert into public.storage_location_items (
  id,
  organization_id,
  storage_location_id,
  inventory_item_id,
  default_par
)
values (
  '10000000-0000-0000-0000-000000000461',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000101',
  '10000000-0000-0000-0000-000000000205',
  2000
)
on conflict (storage_location_id, inventory_item_id) do nothing;

insert into public.recipes (
  id,
  organization_id,
  name,
  description,
  recipe_type,
  output_inventory_item_id,
  created_by
)
values
  (
    '10000000-0000-0000-0000-000000000501',
    '10000000-0000-0000-0000-000000000001',
    'Old Fashioned Batch',
    'Seeded prep batch for production and nested recipe expansion.',
    'batch',
    '10000000-0000-0000-0000-000000000205',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000502',
    '10000000-0000-0000-0000-000000000001',
    'Old Fashioned',
    'Seeded sellable menu recipe mapped to a durable Toast GUID.',
    'menu_item',
    null,
    '00000000-0000-0000-0000-000000000001'
  )
on conflict (id) do nothing;

insert into public.recipe_versions (
  id,
  recipe_id,
  version_number,
  effective_from,
  output_quantity,
  output_unit_id,
  status,
  notes,
  created_by,
  activated_by,
  activated_at
)
select
  fixture.id,
  fixture.recipe_id,
  1,
  '2026-06-01',
  fixture.output_quantity,
  unit.id,
  'active',
  'Seeded Slice 4 active version.',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  now()
from (
  values
    (
      '10000000-0000-0000-0000-000000000511'::uuid,
      '10000000-0000-0000-0000-000000000501'::uuid,
      1000::numeric,
      'Milliliter'::text
    ),
    (
      '10000000-0000-0000-0000-000000000512'::uuid,
      '10000000-0000-0000-0000-000000000502'::uuid,
      1::numeric,
      'Each'::text
    )
) as fixture(id, recipe_id, output_quantity, unit_name)
join public.units unit
  on unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and unit.name = fixture.unit_name
on conflict (id) do nothing;

insert into public.recipe_version_components (
  id,
  recipe_version_id,
  component_inventory_item_id,
  component_recipe_id,
  quantity,
  unit_id,
  line_order
)
select
  fixture.id,
  fixture.recipe_version_id,
  fixture.inventory_item_id,
  fixture.component_recipe_id,
  fixture.quantity,
  unit.id,
  fixture.line_order
from (
  values
    (
      '10000000-0000-0000-0000-000000000521'::uuid,
      '10000000-0000-0000-0000-000000000511'::uuid,
      '10000000-0000-0000-0000-000000000201'::uuid,
      null::uuid,
      750::numeric,
      'Milliliter'::text,
      1
    ),
    (
      '10000000-0000-0000-0000-000000000522'::uuid,
      '10000000-0000-0000-0000-000000000511'::uuid,
      '10000000-0000-0000-0000-000000000203'::uuid,
      null::uuid,
      250::numeric,
      'Milliliter'::text,
      2
    ),
    (
      '10000000-0000-0000-0000-000000000523'::uuid,
      '10000000-0000-0000-0000-000000000512'::uuid,
      null::uuid,
      '10000000-0000-0000-0000-000000000501'::uuid,
      90::numeric,
      'Milliliter'::text,
      1
    )
) as fixture(
  id,
  recipe_version_id,
  inventory_item_id,
  component_recipe_id,
  quantity,
  unit_name,
  line_order
)
join public.units unit
  on unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and unit.name = fixture.unit_name
on conflict (id) do nothing;

insert into public.recipe_menu_item_mappings (
  id,
  organization_id,
  recipe_id,
  source_system,
  external_item_guid,
  external_item_name,
  created_by
)
values (
  '10000000-0000-0000-0000-000000000531',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000502',
  'toast',
  'toast-old-fashioned',
  'Old Fashioned',
  '00000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;
