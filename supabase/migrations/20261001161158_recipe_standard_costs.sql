-- Recipe costing without a posted ledger: items get a standard cost per
-- base unit (entered, or derived from the item's own recipe) and recipes
-- get an optional menu price for cost %.

alter table public.inventory_items
  add column standard_unit_cost numeric(20, 10) check (standard_unit_cost >= 0),
  add column standard_cost_source text check (standard_cost_source in ('manual', 'recipe')),
  add column standard_cost_updated_at timestamptz;

comment on column public.inventory_items.standard_unit_cost is
  'Cost per base unit used when the item has no on-hand value or cost snapshot.';

alter table public.recipes
  add column menu_price numeric(10, 2) check (menu_price >= 0);
