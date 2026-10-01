-- Price change tracking.
--
-- Every invoice that posts records each line's cost per base unit in
-- item_cost_history (PLCB posting already did; other vendors now do too,
-- and their vendor item's last price is updated). Each new invoice price is
-- compared with the item's previous invoice price, and a change of 5% or
-- more opens a price alert for review.

create index if not exists price_alerts_org_status_idx
  on public.price_alerts(organization_id, status, created_at desc);
create index if not exists item_cost_history_item_date_idx
  on public.item_cost_history(inventory_item_id, effective_date desc, created_at desc);

/** Sources that are real purchase prices (not estimates or rollups). */
create or replace function public.is_invoice_cost_source(source text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(source, '') not in ('workbook', 'recipe_rollup', 'manual', '');
$$;

create or replace function public.fill_item_cost_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.previous_base_unit_cost is null then
    -- Compare with the last invoice price, else any earlier cost on file.
    select history.base_unit_cost
    into new.previous_base_unit_cost
    from public.item_cost_history history
    where history.inventory_item_id = new.inventory_item_id
      and history.effective_date <= new.effective_date
      and history.base_unit_cost > 0
    order by public.is_invoice_cost_source(history.cost_source) desc,
      history.effective_date desc, history.created_at desc
    limit 1;
  end if;
  if new.previous_base_unit_cost > 0 and new.cost_change_pct is null then
    new.cost_change_pct :=
      (new.base_unit_cost - new.previous_base_unit_cost) / new.previous_base_unit_cost;
  end if;
  return new;
end;
$$;

create trigger item_cost_history_fill_change
before insert on public.item_cost_history
for each row execute function public.fill_item_cost_change();

create or replace function public.raise_price_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_invoice_cost_source(new.cost_source)
    or new.cost_change_pct is null
    or abs(new.cost_change_pct) < 0.05
  then
    return new;
  end if;

  -- One open alert per item: a newer price replaces the older alert.
  update public.price_alerts
  set status = 'dismissed', resolved_at = now()
  where inventory_item_id = new.inventory_item_id
    and status = 'open'
    and alert_type in ('cost_increase', 'cost_decrease');

  insert into public.price_alerts (
    organization_id, location_id, inventory_item_id, vendor_id, invoice_line_id,
    alert_type, severity, previous_value, current_value, change_pct
  )
  values (
    new.organization_id,
    new.location_id,
    new.inventory_item_id,
    new.vendor_id,
    new.invoice_line_id,
    case when new.cost_change_pct > 0 then 'cost_increase' else 'cost_decrease' end::public.price_alert_type,
    case
      when new.cost_change_pct >= 0.15 then 'critical'
      when new.cost_change_pct > 0 then 'warning'
      else 'info'
    end::public.price_alert_severity,
    new.previous_base_unit_cost,
    new.base_unit_cost,
    new.cost_change_pct
  );
  return new;
end;
$$;

create trigger item_cost_history_raise_alert
after insert on public.item_cost_history
for each row execute function public.raise_price_alert();

create or replace function public.record_invoice_costs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  line record;
  per_unit_base numeric;
  matched_vendor_item uuid;
begin
  if new.status <> 'posted' or old.status = 'posted' then
    return new;
  end if;

  for line in
    select invoice_line.*, item.purchase_unit_id, item.count_unit_id, item.base_unit_id
    from public.invoice_lines invoice_line
    join public.inventory_items item on item.id = invoice_line.inventory_item_id
    where invoice_line.invoice_id = new.id
      and invoice_line.quantity_invoiced > 0
      and not exists (
        select 1 from public.item_cost_history history
        where history.invoice_line_id = invoice_line.id
      )
  loop
    select vendor_item.id, vendor_item.base_quantity_per_purchase_unit
    into matched_vendor_item, per_unit_base
    from public.vendor_items vendor_item
    where vendor_item.vendor_id = new.vendor_id
      and vendor_item.inventory_item_id = line.inventory_item_id
      and vendor_item.base_quantity_per_purchase_unit > 0
    order by vendor_item.is_preferred desc, vendor_item.created_at desc
    limit 1;

    if per_unit_base is null then
      select unit.conversion_factor_to_base into per_unit_base
      from public.units unit
      where unit.id = coalesce(line.purchase_unit_id, line.count_unit_id);
    end if;
    if not (per_unit_base > 0) then
      continue;
    end if;

    insert into public.item_cost_history (
      organization_id, location_id, inventory_item_id, vendor_id, vendor_item_id,
      invoice_id, invoice_line_id, effective_date, case_price, base_unit_cost,
      base_quantity, pack_size_text, cost_source
    )
    values (
      new.organization_id, new.location_id, line.inventory_item_id, new.vendor_id,
      matched_vendor_item, new.id, line.id, new.invoice_date,
      line.line_total / line.quantity_invoiced,
      line.line_total / line.quantity_invoiced / per_unit_base,
      per_unit_base, line.pack_size, 'vendor_invoice'
    );

    if matched_vendor_item is not null then
      update public.vendor_items
      set last_case_price = line.line_total / line.quantity_invoiced,
          last_unit_cost = line.line_total / line.quantity_invoiced / per_unit_base
      where id = matched_vendor_item;
    end if;
    matched_vendor_item := null;
    per_unit_base := null;
  end loop;
  return new;
end;
$$;

create trigger invoices_record_costs
after update of status on public.invoices
for each row execute function public.record_invoice_costs();

revoke all on function public.raise_price_alert() from public, anon;
revoke all on function public.record_invoice_costs() from public, anon;
