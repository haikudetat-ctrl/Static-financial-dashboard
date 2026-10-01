-- Post every Toast menu item as revenue, mapped or not.
--
-- Previously a single unmapped menu item blocked the whole business day, and
-- the day total summed every staged row, including the menu and group
-- subtotal rows that Toast "All Levels" exports contain. Now:
--   * only item-level rows post (Type empty or menuItem, with an item key);
--   * unmapped items post as revenue with no recipe and no theoretical usage,
--     and stay in the mapping queue until someone maps them;
--   * the business date falls back to the date chosen at upload.

alter table public.source_imports add column business_date date;

alter table public.sales_items
  alter column recipe_id drop not null,
  alter column recipe_version_id drop not null;

create or replace function public.post_sales_import(target_import_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_import public.source_imports%rowtype;
  target_business_date date;
  sales_day_id uuid;
  calculation_run_id uuid;
  sales_item record;
begin
  select * into target_import
  from public.source_imports
  where id = target_import_id
    and public.is_organization_manager(organization_id)
  for update;

  if target_import.id is null then
    raise exception 'Sales import not found';
  end if;
  if target_import.source_type <> 'toast_pmix' then
    raise exception 'Only Toast PMIX imports can post sales';
  end if;

  select day.id into sales_day_id
  from public.sales_business_days day
  where day.source_import_id = target_import.id;
  if sales_day_id is not null then
    return sales_day_id;
  end if;

  drop table if exists sales_item_rows;
  create temporary table sales_item_rows on commit drop as
  select row.id, row.normalized_data as nd
  from public.source_import_rows row
  where row.source_import_id = target_import.id
    and coalesce(row.normalized_data ->> 'item_guid', '') <> ''
    and lower(coalesce(row.normalized_data ->> 'type', '')) in ('', 'menuitem', 'menu item');

  select coalesce(
    min(nullif(item.nd ->> 'business_date', '')::date),
    target_import.business_date
  )
  into target_business_date
  from sales_item_rows item;
  if target_business_date is null then
    raise exception 'Sales import has no business date. Set the business date on the import and post again.';
  end if;
  if not exists (select 1 from sales_item_rows) then
    raise exception 'Sales import has no menu item rows';
  end if;

  insert into public.sales_business_days (
    organization_id, location_id, source_import_id, business_date, net_sales, posted_by
  )
  select
    target_import.organization_id,
    target_import.location_id,
    target_import.id,
    target_business_date,
    coalesce(sum((item.nd ->> 'net_sales')::numeric), 0),
    auth.uid()
  from sales_item_rows item
  returning id into sales_day_id;

  insert into public.sales_items (
    sales_business_day_id, source_import_row_id, item_guid, item_name, recipe_id,
    recipe_version_id, quantity_sold, void_quantity, comp_quantity,
    theoretical_sale_quantity, net_sales
  )
  select
    sales_day_id,
    item.id,
    item.nd ->> 'item_guid',
    coalesce(nullif(item.nd ->> 'item_name', ''), 'Unknown item'),
    mapping.recipe_id,
    version.id,
    coalesce((item.nd ->> 'quantity_sold')::numeric, 0),
    coalesce((item.nd ->> 'void_quantity')::numeric, 0),
    coalesce((item.nd ->> 'comp_quantity')::numeric, 0),
    greatest(
      0,
      coalesce((item.nd ->> 'quantity_sold')::numeric, 0)
      - coalesce((item.nd ->> 'void_quantity')::numeric, 0)
    ),
    coalesce((item.nd ->> 'net_sales')::numeric, 0)
  from sales_item_rows item
  left join public.recipe_menu_item_mappings mapping
    on mapping.organization_id = target_import.organization_id
    and mapping.source_system = 'toast'
    and mapping.external_item_guid = item.nd ->> 'item_guid'
    and mapping.active
  left join lateral (
    select candidate.id
    from public.recipe_versions candidate
    where candidate.recipe_id = mapping.recipe_id
      and candidate.status = 'active'
      and candidate.effective_from <= target_business_date
      and (candidate.effective_to is null or candidate.effective_to >= target_business_date)
    order by candidate.effective_from desc
    limit 1
  ) version on true;

  insert into public.calculation_runs (
    organization_id, location_id, calculation_type, calculation_version, business_date, status, started_by
  )
  values (
    target_import.organization_id, target_import.location_id, 'theoretical_usage', '1.1.0',
    target_business_date, 'running', auth.uid()
  )
  returning id into calculation_run_id;

  insert into public.calculation_run_inputs (calculation_run_id, input_type, input_id)
  values (calculation_run_id, 'sales_business_day', sales_day_id);

  for sales_item in
    select * from public.sales_items item
    where item.sales_business_day_id = sales_day_id
      and item.recipe_version_id is not null
  loop
    insert into public.calculation_run_inputs (calculation_run_id, input_type, input_id)
    values (calculation_run_id, 'recipe_version', sales_item.recipe_version_id)
    on conflict do nothing;

    insert into public.daily_theoretical_usage (
      organization_id, location_id, business_date, calculation_run_id, sales_item_id,
      recipe_id, recipe_version_id, inventory_item_id, quantity_base, unit_cost
    )
    with recursive recipe_tree as (
      select
        sales_item.recipe_id as recipe_id,
        sales_item.recipe_version_id as recipe_version_id,
        (sales_item.theoretical_sale_quantity / root_version.output_quantity)::numeric as recipe_factor
      from public.recipe_versions root_version
      where root_version.id = sales_item.recipe_version_id

      union all

      select
        component.component_recipe_id,
        nested_version.id,
        (
          tree.recipe_factor
          * component.quantity
          * component_unit.conversion_factor_to_base
          / (nested_version.output_quantity * nested_output_unit.conversion_factor_to_base)
        )::numeric
      from recipe_tree tree
      join public.recipe_version_components component
        on component.recipe_version_id = tree.recipe_version_id
        and component.component_recipe_id is not null
      join public.units component_unit on component_unit.id = component.unit_id
      join lateral (
        select candidate.*
        from public.recipe_versions candidate
        where candidate.recipe_id = component.component_recipe_id
          and candidate.status = 'active'
          and candidate.effective_from <= target_business_date
          and (candidate.effective_to is null or candidate.effective_to >= target_business_date)
        order by candidate.effective_from desc
        limit 1
      ) nested_version on true
      join public.units nested_output_unit on nested_output_unit.id = nested_version.output_unit_id
    ),
    expanded as (
      select
        component.component_inventory_item_id as inventory_item_id,
        sum(tree.recipe_factor * component.quantity * component_unit.conversion_factor_to_base)::numeric(20, 6)
          as quantity_base
      from recipe_tree tree
      join public.recipe_version_components component
        on component.recipe_version_id = tree.recipe_version_id
        and component.component_inventory_item_id is not null
      join public.units component_unit on component_unit.id = component.unit_id
      group by component.component_inventory_item_id
    )
    select
      target_import.organization_id,
      target_import.location_id,
      target_business_date,
      calculation_run_id,
      sales_item.id,
      sales_item.recipe_id,
      sales_item.recipe_version_id,
      expanded.inventory_item_id,
      expanded.quantity_base,
      coalesce(cost.weighted_average_cost, current_cost.weighted_average_cost, 0)
    from expanded
    left join lateral (
      select snapshot.weighted_average_cost
      from public.inventory_item_cost_snapshots snapshot
      where snapshot.inventory_item_id = expanded.inventory_item_id
        and snapshot.effective_at < (target_business_date + 1)::timestamptz
      order by snapshot.effective_at desc
      limit 1
    ) cost on true
    left join lateral (
      select
        case
          when sum(on_hand.quantity) = 0 then 0::numeric
          else sum(on_hand.extended_value) / sum(on_hand.quantity)
        end as weighted_average_cost
      from public.inventory_on_hand on_hand
      where on_hand.organization_id = target_import.organization_id
        and on_hand.location_id = target_import.location_id
        and on_hand.inventory_item_id = expanded.inventory_item_id
    ) current_cost on true;
  end loop;

  update public.calculation_runs
  set status = 'completed', completed_at = now()
  where id = calculation_run_id;

  update public.source_imports
  set status = 'posted', approved_by = auth.uid(), approved_at = now()
  where id = target_import.id;

  return sales_day_id;
end;
$$;
