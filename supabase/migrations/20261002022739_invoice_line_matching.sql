-- Invoice line matching and one-step invoice posting.
--
-- Lines match an inventory item automatically when they arrive: by the
-- vendor's product code, then the vendor's product name, then a saved alias.
-- Matching a line by hand teaches the vendor's code and name for next time.
-- post_vendor_invoice() approves an invoice in one step; when its date falls
-- in an open period it also receives the goods into stock.

alter table public.invoice_lines
  add column if not exists match_source text
    check (match_source in ('code', 'name', 'alias', 'manual'));

create or replace function public.find_invoice_line_item(
  target_organization_id uuid,
  target_vendor_id uuid,
  product_code text,
  product_description text,
  out inventory_item_id uuid,
  out match_source text
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(product_code, '') <> '' then
    select vendor_item.inventory_item_id into inventory_item_id
    from public.vendor_items vendor_item
    where vendor_item.vendor_id = target_vendor_id
      and vendor_item.vendor_product_code = product_code
      and vendor_item.inventory_item_id is not null
    limit 1;
    if inventory_item_id is not null then
      match_source := 'code';
      return;
    end if;
  end if;

  if coalesce(product_description, '') <> '' then
    select vendor_item.inventory_item_id into inventory_item_id
    from public.vendor_items vendor_item
    where vendor_item.vendor_id = target_vendor_id
      and lower(vendor_item.vendor_product_name) = lower(btrim(product_description))
      and vendor_item.inventory_item_id is not null
    order by vendor_item.is_preferred desc, vendor_item.created_at desc
    limit 1;
    if inventory_item_id is not null then
      match_source := 'name';
      return;
    end if;

    select alias.inventory_item_id into inventory_item_id
    from public.inventory_item_aliases alias
    join public.inventory_items item on item.id = alias.inventory_item_id
    where alias.organization_id = target_organization_id
      and item.active
      and lower(alias.alias) = lower(btrim(product_description))
    order by (alias.vendor_id = target_vendor_id) desc nulls last, alias.created_at desc
    limit 1;
    if inventory_item_id is not null then
      match_source := 'alias';
    end if;
  end if;
end;
$$;

create or replace function public.match_invoice_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_invoice public.invoices%rowtype;
  found record;
begin
  if new.inventory_item_id is not null then
    if tg_op = 'UPDATE' and new.inventory_item_id is distinct from old.inventory_item_id
      and new.match_source is not distinct from old.match_source then
      new.match_source := 'manual';
    end if;
    return new;
  end if;
  select * into target_invoice from public.invoices where id = new.invoice_id;
  select * into found
  from public.find_invoice_line_item(
    target_invoice.organization_id, target_invoice.vendor_id,
    new.vendor_product_code, new.product_description
  );
  if found.inventory_item_id is not null then
    new.inventory_item_id := found.inventory_item_id;
    new.match_source := found.match_source;
  end if;
  return new;
end;
$$;

create trigger invoice_lines_match_item
before insert or update of inventory_item_id on public.invoice_lines
for each row execute function public.match_invoice_line();

/** A hand match teaches the vendor's product code and name. */
create or replace function public.learn_invoice_line_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_invoice public.invoices%rowtype;
begin
  if new.match_source <> 'manual' or new.inventory_item_id is null then
    return new;
  end if;
  select * into target_invoice from public.invoices where id = new.invoice_id;
  if not public.is_organization_manager(target_invoice.organization_id) then
    return new;
  end if;

  if coalesce(new.vendor_product_code, '') <> '' then
    insert into public.vendor_items (
      organization_id, vendor_id, inventory_item_id, vendor_product_code,
      vendor_product_name, pack_size, normalized_description,
      created_from_invoice_line_id
    )
    values (
      target_invoice.organization_id, target_invoice.vendor_id, new.inventory_item_id,
      new.vendor_product_code, new.product_description, new.pack_size,
      lower(btrim(new.product_description)), new.id
    )
    on conflict (vendor_id, vendor_product_code)
    do update set inventory_item_id = excluded.inventory_item_id;
  end if;

  insert into public.inventory_item_aliases (
    organization_id, inventory_item_id, alias, normalized_alias, source, vendor_id, confidence
  )
  values (
    target_invoice.organization_id, new.inventory_item_id, btrim(new.product_description),
    lower(btrim(new.product_description)), 'invoice_match', target_invoice.vendor_id, 1
  )
  on conflict (inventory_item_id, alias) do nothing;
  return new;
end;
$$;

create trigger invoice_lines_learn_match
after update of inventory_item_id on public.invoice_lines
for each row execute function public.learn_invoice_line_match();

-- Older invoices must not overwrite a vendor item's newer last price.
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
    order by (vendor_item.vendor_product_code = line.vendor_product_code) desc,
      vendor_item.is_preferred desc, vendor_item.created_at desc
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

    if matched_vendor_item is not null and not exists (
      select 1 from public.item_cost_history history
      where history.vendor_item_id = matched_vendor_item
        and history.effective_date > new.invoice_date
    ) then
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

/**
 * Approves an invoice in one step. Returns 'received' when the goods went
 * into stock (the invoice date falls in an open period) or 'prices' when
 * only its prices were recorded (an older invoice).
 */
create or replace function public.post_vendor_invoice(target_invoice_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  target_invoice public.invoices%rowtype;
  target_period public.inventory_periods%rowtype;
  new_receipt_id uuid;
  line record;
  per_unit_base numeric;
  storage_id uuid;
  new_receipt_line_id uuid;
begin
  select * into target_invoice
  from public.invoices
  where id = target_invoice_id
  for update;

  if target_invoice.id is null then
    raise exception 'Invoice not found';
  end if;
  if not public.is_organization_manager(target_invoice.organization_id) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;
  if target_invoice.status = 'posted' then
    return 'posted';
  end if;
  if target_invoice.status = 'rejected' then
    raise exception 'Invoice was rejected';
  end if;
  if target_invoice.invoice_date < date '2000-01-01' then
    raise exception 'Set the invoice date before approving';
  end if;
  if exists (
    select 1 from public.invoice_lines invoice_line
    where invoice_line.invoice_id = target_invoice.id
      and invoice_line.inventory_item_id is null
  ) then
    raise exception 'Match every line to an item before approving';
  end if;

  select * into target_period
  from public.inventory_periods period
  where period.location_id = target_invoice.location_id
    and target_invoice.invoice_date between period.period_start and period.period_end
    and period.status <> 'closed'
  limit 1;

  -- Receive into stock when the invoice falls in an open period and no
  -- line is tied to a receipt already.
  if target_period.id is not null and not exists (
    select 1 from public.invoice_lines invoice_line
    where invoice_line.invoice_id = target_invoice.id
      and invoice_line.receipt_line_id is not null
  ) then
    insert into public.receipts (
      organization_id, location_id, vendor_id, status, received_by, received_at, notes
    )
    values (
      target_invoice.organization_id, target_invoice.location_id, target_invoice.vendor_id,
      'draft', auth.uid(),
      (target_invoice.invoice_date + time '12:00') at time zone 'America/New_York',
      'Invoice ' || target_invoice.invoice_number
    )
    returning id into new_receipt_id;

    for line in
      select invoice_line.*, item.purchase_unit_id, item.count_unit_id,
        item.default_storage_location_id
      from public.invoice_lines invoice_line
      join public.inventory_items item on item.id = invoice_line.inventory_item_id
      where invoice_line.invoice_id = target_invoice.id
        and invoice_line.quantity_invoiced > 0
    loop
      select vendor_item.base_quantity_per_purchase_unit into per_unit_base
      from public.vendor_items vendor_item
      where vendor_item.vendor_id = target_invoice.vendor_id
        and vendor_item.inventory_item_id = line.inventory_item_id
        and vendor_item.base_quantity_per_purchase_unit > 0
      order by (vendor_item.vendor_product_code = line.vendor_product_code) desc,
        vendor_item.is_preferred desc, vendor_item.created_at desc
      limit 1;
      if per_unit_base is null then
        select unit.conversion_factor_to_base into per_unit_base
        from public.units unit
        where unit.id = coalesce(line.purchase_unit_id, line.count_unit_id);
      end if;
      if not (per_unit_base > 0) then
        raise exception 'No pack size for %: set how much one unit holds before approving',
          line.product_description;
      end if;

      storage_id := coalesce(
        line.default_storage_location_id,
        (
          select placement.storage_location_id
          from public.storage_location_items placement
          join public.storage_locations zone on zone.id = placement.storage_location_id
          where placement.inventory_item_id = line.inventory_item_id
            and zone.location_id = target_invoice.location_id
          order by zone.walk_order
          limit 1
        ),
        (
          select zone.id from public.storage_locations zone
          where zone.location_id = target_invoice.location_id and zone.active
          order by (zone.name = 'Unassigned') desc, zone.walk_order desc
          limit 1
        )
      );

      insert into public.receipt_lines (
        receipt_id, inventory_item_id, storage_location_id, quantity_received,
        quantity_received_base, unit_price
      )
      values (
        new_receipt_id, line.inventory_item_id, storage_id, line.quantity_invoiced,
        line.quantity_invoiced * per_unit_base, line.line_total / line.quantity_invoiced
      )
      returning id into new_receipt_line_id;

      update public.invoice_lines
      set receipt_line_id = new_receipt_line_id
      where id = line.id;
      per_unit_base := null;
    end loop;

    perform public.post_receipt(new_receipt_id);
  end if;

  update public.invoices
  set status = 'reviewed', reviewed_by = coalesce(reviewed_by, auth.uid())
  where id = target_invoice.id
    and status in ('uploaded', 'extracted');

  perform public.approve_invoice(target_invoice.id);

  return case when new_receipt_id is not null then 'received' else 'prices' end;
end;
$$;

grant execute on function public.post_vendor_invoice(uuid) to authenticated;
grant execute on function public.find_invoice_line_item(uuid, uuid, text, text) to authenticated;
revoke all on function public.learn_invoice_line_match() from public, anon;

-- Match the lines already waiting for review.
update public.invoice_lines invoice_line
set inventory_item_id = matched.inventory_item_id,
    match_source = matched.match_source
from (
  select pending.id, found.inventory_item_id, found.match_source
  from public.invoice_lines pending
  join public.invoices invoice on invoice.id = pending.invoice_id
  cross join lateral public.find_invoice_line_item(
    invoice.organization_id, invoice.vendor_id,
    pending.vendor_product_code, pending.product_description
  ) found
  where pending.inventory_item_id is null
    and found.inventory_item_id is not null
) matched
where matched.id = invoice_line.id;
