alter table public.inventory_item_cost_snapshots alter column created_at set default clock_timestamp();

create or replace view public.inventory_on_hand
with (security_invoker = true)
as
with quantity_by_location as (
  select t.organization_id, t.location_id, l.inventory_item_id, l.storage_location_id,
    sum(l.quantity)::numeric(20,6) as quantity,
    sum(l.extended_value)::numeric(24,6) as ledger_value,
    max(t.effective_at) as last_movement_at
  from public.inventory_transaction_lines l
  join public.inventory_transactions t on t.id = l.inventory_transaction_id
  group by t.organization_id, t.location_id, l.inventory_item_id, l.storage_location_id
)
select q.organization_id, q.location_id, q.inventory_item_id, q.storage_location_id, q.quantity,
  coalesce(c.weighted_average_cost, case when q.quantity = 0 then 0::numeric else q.ledger_value / q.quantity end) as weighted_average_cost,
  (q.quantity * coalesce(c.weighted_average_cost,
    case when q.quantity = 0 then 0::numeric else q.ledger_value / q.quantity end))::numeric(24,6) as extended_value,
  q.last_movement_at
from quantity_by_location q
left join lateral (
  select s.weighted_average_cost
  from public.inventory_item_cost_snapshots s
  join public.inventory_periods p on p.id = s.inventory_period_id
  where s.inventory_item_id = q.inventory_item_id
    and p.organization_id = q.organization_id and p.location_id = q.location_id
  order by s.effective_at desc, s.created_at desc, s.id desc
  limit 1
) c on true;

-- Snapshots apply to the entire location, so receiving must blend all zones.
do $$
declare
  v_definition text;
  v_old text := $old$select
      coalesce(on_hand.quantity, 0),
      coalesce(on_hand.extended_value, 0)
    into prior_quantity, prior_value
    from (select 1) seed
    left join public.inventory_on_hand on_hand
      on on_hand.organization_id = target_receipt.organization_id
      and on_hand.location_id = target_receipt.location_id
      and on_hand.inventory_item_id = line.inventory_item_id
      and on_hand.storage_location_id = line.storage_location_id;$old$;
begin
  select pg_get_functiondef('public.post_receipt(uuid)'::regprocedure) into v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'post_receipt location valuation patch did not match expected definition';
  end if;
  execute replace(v_definition, v_old, $new$select coalesce(sum(on_hand.quantity), 0), coalesce(sum(on_hand.extended_value), 0)
    into prior_quantity, prior_value
    from public.inventory_on_hand on_hand
    where on_hand.organization_id = target_receipt.organization_id
      and on_hand.location_id = target_receipt.location_id
      and on_hand.inventory_item_id = line.inventory_item_id;$new$);
end;
$$;
