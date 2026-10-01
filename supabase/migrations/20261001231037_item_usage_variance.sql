-- Actual vs theoretical usage by item between two inventory counts.
--
-- Actual usage comes from the ledger: everything that left stock between
-- the two count postings, ignoring receipts, transfers and production (a
-- batch made from gin is a move, not usage; the batch is used when poured).
-- Theoretical usage comes from posted sales expanded through recipes,
-- stopping at batches and preps that are counted as their own item.
create or replace function public.item_usage_variance(
  target_location_id uuid,
  from_at timestamptz,
  to_at timestamptz,
  sales_start date,
  sales_end date
)
returns table (
  inventory_item_id uuid,
  opening_quantity numeric,
  purchased_quantity numeric,
  closing_quantity numeric,
  actual_quantity numeric,
  theoretical_quantity numeric
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  if to_at <= from_at then
    raise exception 'The closing count must come after the opening count';
  end if;
  if not public.can_access_location(target_location_id) then
    raise exception 'Location access required' using errcode = '42501';
  end if;

  return query
  with recursive ledger as (
    select l.inventory_item_id,
      coalesce(sum(l.quantity) filter (where t.effective_at <= from_at), 0) as opening,
      coalesce(sum(l.quantity) filter (
        where t.effective_at > from_at
          and t.transaction_type in ('receipt', 'receipt_reversal')), 0) as purchased,
      coalesce(sum(l.quantity), 0) as closing,
      -coalesce(sum(l.quantity) filter (
        where t.effective_at > from_at
          and t.transaction_type not in (
            'opening_balance', 'receipt', 'receipt_reversal', 'transfer_in',
            'transfer_out', 'production_consumption', 'production_output')), 0) as actual
    from public.inventory_transactions t
    join public.inventory_transaction_lines l on l.inventory_transaction_id = t.id
    where t.location_id = target_location_id
      and t.effective_at <= to_at
    group by l.inventory_item_id
  ),
  tree as (
    select d.business_date,
      v.id as version_id,
      (si.theoretical_sale_quantity / v.output_quantity)::numeric as factor
    from public.sales_items si
    join public.sales_business_days d on d.id = si.sales_business_day_id
    join public.recipe_versions v on v.id = si.recipe_version_id
    where d.location_id = target_location_id
      and d.status = 'posted'
      and d.business_date between sales_start and sales_end
      and v.output_quantity > 0

    union all

    select tree.business_date,
      nested.id,
      (tree.factor * c.quantity * cu.conversion_factor_to_base
        / (nested.output_quantity * nu.conversion_factor_to_base))::numeric
    from tree
    join public.recipe_version_components c
      on c.recipe_version_id = tree.version_id
      and c.component_recipe_id is not null
    join public.recipes nested_recipe
      on nested_recipe.id = c.component_recipe_id
      and nested_recipe.output_inventory_item_id is null
    join public.units cu on cu.id = c.unit_id
    join lateral (
      select candidate.*
      from public.recipe_versions candidate
      where candidate.recipe_id = c.component_recipe_id
        and candidate.status = 'active'
        and candidate.effective_from <= tree.business_date
        and (candidate.effective_to is null or candidate.effective_to >= tree.business_date)
      order by candidate.effective_from desc
      limit 1
    ) nested on true
    join public.units nu on nu.id = nested.output_unit_id
    where nested.output_quantity > 0
  ),
  theoretical as (
    select coalesce(c.component_inventory_item_id, made.output_inventory_item_id) as inventory_item_id,
      sum(tree.factor * c.quantity * cu.conversion_factor_to_base) as quantity
    from tree
    join public.recipe_version_components c on c.recipe_version_id = tree.version_id
    join public.units cu on cu.id = c.unit_id
    left join public.recipes made on made.id = c.component_recipe_id
    where c.component_inventory_item_id is not null
      or made.output_inventory_item_id is not null
    group by 1
  )
  select coalesce(lg.inventory_item_id, th.inventory_item_id),
    coalesce(lg.opening, 0)::numeric,
    coalesce(lg.purchased, 0)::numeric,
    coalesce(lg.closing, 0)::numeric,
    coalesce(lg.actual, 0)::numeric,
    coalesce(th.quantity, 0)::numeric
  from ledger lg
  full join theoretical th on th.inventory_item_id = lg.inventory_item_id;
end;
$$;

grant execute on function public.item_usage_variance(uuid, timestamptz, timestamptz, date, date)
  to authenticated;
