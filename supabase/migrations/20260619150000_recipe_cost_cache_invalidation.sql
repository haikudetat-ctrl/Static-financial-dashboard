-- Recipe cost cache invalidation
-- Marks recipe versions as needing cost recalculation when:
-- 1. A cost snapshot is inserted for an item used by any recipe version
-- 2. A recipe version component is inserted, updated, or deleted

alter table public.recipe_versions
  add column if not exists costed_at timestamptz;

create or replace function public.invalidate_recipe_cost_from_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.recipe_versions
  set costed_at = null
  where id in (
    select distinct component.recipe_version_id
    from public.recipe_version_components component
    where component.component_inventory_item_id = new.inventory_item_id
  );
  return new;
end;
$$;

create or replace function public.invalidate_recipe_cost_from_component()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'delete' then
    update public.recipe_versions
    set costed_at = null
    where id = old.recipe_version_id;
    return old;
  end if;
  update public.recipe_versions
  set costed_at = null
  where id = new.recipe_version_id;
  return new;
end;
$$;

drop trigger if exists on_cost_snapshot_invalidate_recipe_cost
  on public.inventory_item_cost_snapshots;
create trigger on_cost_snapshot_invalidate_recipe_cost
  after insert on public.inventory_item_cost_snapshots
  for each row
  execute function public.invalidate_recipe_cost_from_snapshot();

drop trigger if exists on_component_change_invalidate_recipe_cost
  on public.recipe_version_components;
create trigger on_component_change_invalidate_recipe_cost
  after insert or update or delete on public.recipe_version_components
  for each row
  execute function public.invalidate_recipe_cost_from_component();
