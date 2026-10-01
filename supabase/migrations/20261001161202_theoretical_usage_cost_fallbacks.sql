-- Theoretical usage rows that come out of posting with no cost (no period
-- snapshot and no on-hand value) fall back to the item's standard cost and
-- then the vendor's last price per base unit.
create or replace function public.fill_theoretical_usage_cost()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.unit_cost, 0) = 0 then
    new.unit_cost := coalesce(
      (
        select item.standard_unit_cost
        from public.inventory_items item
        where item.id = new.inventory_item_id
      ),
      (
        select vendor_item.last_case_price / vendor_item.base_quantity_per_purchase_unit
        from public.vendor_items vendor_item
        where vendor_item.inventory_item_id = new.inventory_item_id
          and vendor_item.last_case_price is not null
          and vendor_item.base_quantity_per_purchase_unit > 0
        order by vendor_item.is_preferred desc, vendor_item.created_at desc
        limit 1
      ),
      0
    );
  end if;
  return new;
end;
$$;

create trigger daily_theoretical_usage_fill_cost
before insert on public.daily_theoretical_usage
for each row execute function public.fill_theoretical_usage_cost();
