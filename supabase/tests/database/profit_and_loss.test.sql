begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

-- Fixture: one manager, one location, two items in different COGS classes.
create temporary table ids (k text primary key, v uuid) on commit drop;

do $$
declare
  u uuid := gen_random_uuid(); org uuid; loc uuid; ml uuid; ea uuid; zone uuid; mgr uuid;
  om uuid; a uuid; b uuid; tx uuid; rec uuid; ver uuid; imp uuid;
begin
  insert into auth.users(id, email) values (u, 'pl-test@example.com');
  insert into public.profiles(id, email) values (u, 'pl-test@example.com') on conflict (id) do nothing;
  select id into mgr from public.roles where slug = 'manager';
  insert into public.organizations(name, slug) values ('PL Test', 'pl-test') returning id into org;
  insert into public.locations(organization_id, name, slug) values (org, 'Bar', 'bar') returning id into loc;
  insert into public.organization_memberships(organization_id, profile_id, role_id)
    values (org, u, mgr) returning id into om;
  insert into public.location_memberships(location_id, organization_membership_id, role_id) values (loc, om, mgr);
  insert into public.units(organization_id, name, abbreviation, unit_type, conversion_factor_to_base)
    values (org, 'Milliliter', 'ml', 'volume', 1) returning id into ml;
  update public.units set base_unit_id = ml where id = ml;
  insert into public.units(organization_id, name, abbreviation, unit_type, conversion_factor_to_base)
    values (org, 'Each', 'ea', 'each', 1) returning id into ea;
  update public.units set base_unit_id = ea where id = ea;
  insert into public.storage_locations(organization_id, location_id, name) values (org, loc, 'Shelf') returning id into zone;
  insert into public.inventory_items(organization_id, name, base_unit_id, cogs_class)
    values (org, 'Vodka', ml, 'liquor') returning id into a;
  insert into public.inventory_items(organization_id, name, base_unit_id, cogs_class)
    values (org, 'Buns', ml, 'food') returning id into b;

  -- Opening $40 vodka / $10 buns, $80 vodka received, count leaves $60 / $6.
  insert into public.inventory_transactions(organization_id, location_id, transaction_type, effective_at, source_type, source_id, idempotency_key, actor_id)
    values (org, loc, 'opening_balance', '2026-10-05 08:30Z', 'test', gen_random_uuid(), 't1', u) returning id into tx;
  insert into public.inventory_transaction_lines(inventory_transaction_id, inventory_item_id, storage_location_id, quantity, unit_cost)
    values (tx, a, zone, 1000, 0.04), (tx, b, zone, 10, 1);
  insert into public.inventory_transactions(organization_id, location_id, transaction_type, effective_at, source_type, source_id, idempotency_key, actor_id)
    values (org, loc, 'receipt', '2026-10-10 15:00Z', 'test', gen_random_uuid(), 't2', u) returning id into tx;
  insert into public.inventory_transaction_lines(inventory_transaction_id, inventory_item_id, storage_location_id, quantity, unit_cost)
    values (tx, a, zone, 2000, 0.04);
  insert into public.inventory_transactions(organization_id, location_id, transaction_type, effective_at, source_type, source_id, idempotency_key, actor_id)
    values (org, loc, 'count_adjustment', '2026-11-01 12:00Z', 'test', gen_random_uuid(), 't3', u) returning id into tx;
  insert into public.inventory_transaction_lines(inventory_transaction_id, inventory_item_id, storage_location_id, quantity, unit_cost)
    values (tx, a, zone, -1500, 0.04), (tx, b, zone, -4, 1);
  -- After the range: must not count.
  insert into public.inventory_transactions(organization_id, location_id, transaction_type, effective_at, source_type, source_id, idempotency_key, actor_id)
    values (org, loc, 'receipt', '2026-11-03 15:00Z', 'test', gen_random_uuid(), 't4', u) returning id into tx;
  insert into public.inventory_transaction_lines(inventory_transaction_id, inventory_item_id, storage_location_id, quantity, unit_cost)
    values (tx, a, zone, 999, 0.04);

  insert into public.recipes(organization_id, name, recipe_type, created_by)
    values (org, 'House Vodka pour', 'menu_item', u) returning id into rec;
  insert into public.recipe_versions(recipe_id, version_number, effective_from, output_quantity, output_unit_id, status, created_by)
    values (rec, 1, '2026-09-01', 1, ea, 'active', u) returning id into ver;
  insert into public.recipe_version_components(recipe_version_id, component_inventory_item_id, quantity, unit_id)
    values (ver, a, 50, ml);
  insert into public.recipe_menu_item_mappings(organization_id, recipe_id, external_item_guid, external_item_name, created_by)
    values (org, rec, 'name:house vodka', 'House Vodka', u);

  insert into public.sales_category_mappings(organization_id, match_field, match_value, gl_account_id)
    select org, 'menu_group', 'Liquor', id from public.gl_accounts where organization_id = org and code = '4100';
  insert into public.sales_category_mappings(organization_id, match_field, match_value, gl_account_id)
    select org, 'subgroup', 'snacks', id from public.gl_accounts where organization_id = org and code = '4500';

  -- All Levels export: three items (one mapped) plus a group subtotal row.
  insert into public.source_imports(organization_id, location_id, source_type, file_hash, file_path, file_name, business_date)
    values (org, loc, 'toast_pmix', 'h', 'p', 'All levels.csv', '2026-10-06') returning id into imp;
  insert into public.source_import_rows(source_import_id, row_index, normalized_data) values
    (imp, 0, '{"item_guid":"name:house vodka","item_name":"House Vodka","type":"menuItem","menu_group":"Liquor","quantity_sold":2,"net_sales":30}'),
    (imp, 1, '{"item_guid":"name:hot dog","item_name":"Hot Dog","type":"","subgroup":"Snacks","quantity_sold":1,"net_sales":7}'),
    (imp, 2, '{"item_guid":"name:mystery","item_name":"Mystery","quantity_sold":1,"net_sales":5}'),
    (imp, 3, '{"item_guid":"name:liquor","item_name":"Liquor","type":"menuGroup","menu_group":"Liquor","quantity_sold":2,"net_sales":30}');

  insert into public.pl_entries(organization_id, location_id, gl_account_id, entry_date, amount, created_by)
    select org, loc, id, '2026-10-15', 300, u from public.gl_accounts where organization_id = org and code = '6100';
  insert into public.pl_entries(organization_id, location_id, gl_account_id, entry_date, amount, created_by)
    select org, loc, id, '2026-11-05', 50, u from public.gl_accounts where organization_id = org and code = '6100';

  insert into ids values ('user', u), ('org', org), ('loc', loc), ('import', imp);
end $$;

select is(
  (select count(*)::int from public.gl_accounts where organization_id = (select v from ids where k = 'org')),
  28,
  'new organizations get the default chart of accounts'
);

select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'user'), 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', (select v from ids where k = 'user')::text, true);

select lives_ok(
  $$ select public.post_sales_import((select v from ids where k = 'import')) $$,
  'a day with unmapped items still posts'
);
select is(
  (select net_sales from public.sales_business_days where source_import_id = (select v from ids where k = 'import')),
  42.0000::numeric,
  'day total counts item rows only, not group subtotals'
);
select is(
  (select business_date from public.sales_business_days where source_import_id = (select v from ids where k = 'import')),
  '2026-10-06'::date,
  'business date falls back to the date chosen at upload'
);
select is(
  (select count(*)::int from public.sales_items si
   join public.sales_business_days d on d.id = si.sales_business_day_id
   where d.source_import_id = (select v from ids where k = 'import') and si.recipe_id is null),
  2,
  'unmapped items post without a recipe'
);

create temporary table pl on commit drop as
select * from public.profit_and_loss((select v from ids where k = 'loc'), '2026-10-05', '2026-11-01');

select is((select amount from pl where account_code = '4100'), 30.00::numeric, 'menu group maps liquor sales');
select is((select amount from pl where account_code = '4500'), 7.00::numeric, 'subgroup match is case-insensitive');
select is((select amount from pl where account_code = '4900'), 5.00::numeric, 'unmatched sales land in unclassified');
select is(
  (select array[opening_value, purchases_value, closing_value, amount] from pl where account_code = '5100'),
  array[40.00, 80.00, 60.00, 60.00]::numeric[],
  'liquor COGS = opening + purchases - closing'
);
select is((select amount from pl where account_code = '5500'), 4.00::numeric, 'food COGS is separate');
select is((select theoretical_amount from pl where account_code = '5100'), 4.00::numeric, 'theoretical cost by class');
select is((select amount from pl where account_code = '6100'), 300.00::numeric, 'labor entries inside the range only');

select * from finish();
rollback;
