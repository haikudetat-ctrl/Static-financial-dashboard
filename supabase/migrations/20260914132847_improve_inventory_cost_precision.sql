-- Preserve the two dependent views and their grants while widening cost precision.
-- DROP uses RESTRICT so an unexpected dependency aborts the migration safely.
do $$
declare
  v_on_hand text := pg_get_viewdef('public.inventory_on_hand'::regclass, true);
  v_negative text := pg_get_viewdef('public.negative_inventory'::regclass, true);
  v_grants jsonb;
  v_grant jsonb;
  v_definition text;
begin
  select jsonb_agg(jsonb_build_object('name', c.relname, 'grantee',
    case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
    'privilege', a.privilege_type, 'grantable', a.is_grantable)) into v_grants
  from pg_class c cross join lateral aclexplode(c.relacl) a
  where c.oid in ('public.inventory_on_hand'::regclass, 'public.negative_inventory'::regclass);

  drop view public.negative_inventory;
  drop view public.inventory_on_hand;
  alter table public.inventory_transaction_lines drop column extended_value;
  alter table public.inventory_transaction_lines alter column unit_cost type numeric(20,10);
  alter table public.inventory_transaction_lines add column extended_value numeric(24,6)
    generated always as (quantity * unit_cost) stored;
  alter table public.inventory_item_cost_snapshots alter column weighted_average_cost type numeric(20,10);

  execute 'create view public.inventory_on_hand with (security_invoker = true) as ' || v_on_hand;
  execute 'create view public.negative_inventory with (security_invoker = true) as ' || v_negative;
  for v_grant in select value from jsonb_array_elements(v_grants) loop
    execute format('grant %s on public.%I to %s%s', v_grant->>'privilege', v_grant->>'name',
      case when v_grant->>'grantee' = 'PUBLIC' then 'PUBLIC' else quote_ident(v_grant->>'grantee') end,
      case when (v_grant->>'grantable')::boolean then ' with grant option' else '' end);
  end loop;

  select pg_get_functiondef('public.post_receipt(uuid)'::regprocedure) into v_definition;
  if position(E'line.quantity_received_base,\n      new_wac,' in v_definition) = 0 then
    raise exception 'post_receipt acquisition cost patch did not match expected definition';
  end if;
  v_definition := replace(v_definition, E'line.quantity_received_base,\n      new_wac,',
    E'line.quantity_received_base,\n      (line.quantity_received * line.unit_price) / line.quantity_received_base,');
  v_definition := replace(v_definition, 'new_wac numeric(20, 4)', 'new_wac numeric(20, 10)');
  execute v_definition;
end;
$$;

-- Existing policy generator is a simple SQL helper; fix the advisor warning.
alter function public.gen_select_org_member(uuid) set search_path = '';
