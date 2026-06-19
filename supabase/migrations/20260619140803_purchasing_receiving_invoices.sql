-- Slice 3: Purchasing, Receiving, and Invoice Posting

create type public.purchase_order_status as enum (
  'draft',
  'approved',
  'sent',
  'partially_received',
  'received',
  'cancelled'
);

create type public.receipt_status as enum (
  'draft',
  'review_required',
  'posted',
  'cancelled'
);

create type public.receipt_exception_type as enum (
  'shortage',
  'substitution',
  'damage',
  'price_mismatch',
  'unknown_item'
);

create type public.invoice_status as enum (
  'uploaded',
  'extracted',
  'reviewed',
  'approved',
  'rejected',
  'posted'
);

create type public.invoice_adjustment_type as enum (
  'discount',
  'tax',
  'freight',
  'deposit',
  'credit'
);

create type public.invoice_match_type as enum ('exact', 'partial', 'unmatched');

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id),
  status public.purchase_order_status not null default 'draft',
  order_date date not null default current_date,
  expected_delivery_date date,
  manager_notes text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    expected_delivery_date is null
    or expected_delivery_date >= order_date
  )
);

create trigger set_purchase_orders_updated_at
  before update on public.purchase_orders
  for each row execute function public.set_updated_at();

create index purchase_orders_org_location_status_idx
  on public.purchase_orders(organization_id, location_id, status);
create index purchase_orders_vendor_status_idx
  on public.purchase_orders(vendor_id, status);
create index purchase_orders_created_by_idx
  on public.purchase_orders(created_by);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  vendor_item_id uuid not null references public.vendor_items(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  quantity_ordered numeric(20, 6) not null,
  quantity_received numeric(20, 6) not null default 0,
  unit_price numeric(20, 4) not null,
  pack_size text not null default '',
  created_at timestamptz not null default now(),
  check (quantity_ordered > 0),
  check (quantity_received >= 0),
  check (unit_price >= 0)
);

create index purchase_order_lines_order_id_idx
  on public.purchase_order_lines(purchase_order_id);
create index purchase_order_lines_vendor_item_id_idx
  on public.purchase_order_lines(vendor_item_id);
create index purchase_order_lines_inventory_item_id_idx
  on public.purchase_order_lines(inventory_item_id);

create table public.purchase_order_approvals (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index purchase_order_approvals_order_id_idx
  on public.purchase_order_approvals(purchase_order_id);
create index purchase_order_approvals_approved_by_idx
  on public.purchase_order_approvals(approved_by);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  purchase_order_id uuid references public.purchase_orders(id),
  vendor_id uuid not null references public.vendors(id),
  status public.receipt_status not null default 'draft',
  received_by uuid not null references public.profiles(id),
  received_at timestamptz not null default now(),
  document_file_path text not null default '',
  notes text not null default '',
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create index receipts_org_location_status_idx
  on public.receipts(organization_id, location_id, status);
create index receipts_purchase_order_id_idx
  on public.receipts(purchase_order_id);
create index receipts_vendor_id_idx on public.receipts(vendor_id);
create index receipts_received_by_idx on public.receipts(received_by);

create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  purchase_order_line_id uuid references public.purchase_order_lines(id),
  vendor_item_id uuid references public.vendor_items(id),
  inventory_item_id uuid references public.inventory_items(id),
  storage_location_id uuid references public.storage_locations(id),
  quantity_received numeric(20, 6) not null,
  quantity_received_base numeric(20, 6) not null,
  unit_price numeric(20, 4) not null,
  is_substitution boolean not null default false,
  substitution_of_line_id uuid references public.receipt_lines(id),
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (quantity_received > 0),
  check (quantity_received_base > 0),
  check (unit_price >= 0)
);

create index receipt_lines_receipt_id_idx on public.receipt_lines(receipt_id);
create index receipt_lines_po_line_id_idx
  on public.receipt_lines(purchase_order_line_id);
create index receipt_lines_inventory_item_id_idx
  on public.receipt_lines(inventory_item_id);
create index receipt_lines_storage_location_id_idx
  on public.receipt_lines(storage_location_id);

create table public.receipt_exceptions (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  exception_type public.receipt_exception_type not null,
  description text not null,
  requires_manager_review boolean not null default true,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index receipt_exceptions_receipt_id_idx
  on public.receipt_exceptions(receipt_id);
create index receipt_exceptions_resolved_by_idx
  on public.receipt_exceptions(resolved_by);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id),
  invoice_number text not null,
  order_id text not null default '',
  invoice_date date not null,
  status public.invoice_status not null default 'uploaded',
  total_amount numeric(20, 4) not null,
  discount_amount numeric(20, 4) not null default 0,
  tax_amount numeric(20, 4) not null default 0,
  freight_amount numeric(20, 4) not null default 0,
  deposit_amount numeric(20, 4) not null default 0,
  credits_amount numeric(20, 4) not null default 0,
  source_import_id uuid references public.source_imports(id),
  document_file_path text not null default '',
  extractor_version text not null default '',
  reviewed_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (vendor_id, invoice_number)
);

create index invoices_org_location_status_idx
  on public.invoices(organization_id, location_id, status);
create index invoices_vendor_date_idx
  on public.invoices(vendor_id, invoice_date desc);
create index invoices_source_import_id_idx on public.invoices(source_import_id);
create index invoices_reviewed_by_idx on public.invoices(reviewed_by);
create index invoices_approved_by_idx on public.invoices(approved_by);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  line_index integer not null,
  vendor_product_code text not null default '',
  product_description text not null,
  pack_size text not null default '',
  quantity_invoiced numeric(20, 6) not null,
  unit_price numeric(20, 4) not null,
  line_total numeric(20, 4) not null,
  discount_amount numeric(20, 4) not null default 0,
  inventory_item_id uuid references public.inventory_items(id),
  receipt_line_id uuid references public.receipt_lines(id),
  anomaly_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (line_index >= 0),
  check (quantity_invoiced > 0),
  check (unit_price >= 0),
  unique (invoice_id, line_index)
);

create index invoice_lines_invoice_id_idx on public.invoice_lines(invoice_id);
create index invoice_lines_inventory_item_id_idx
  on public.invoice_lines(inventory_item_id);
create index invoice_lines_receipt_line_id_idx
  on public.invoice_lines(receipt_line_id);

create table public.invoice_adjustments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  adjustment_type public.invoice_adjustment_type not null,
  amount numeric(20, 4) not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create index invoice_adjustments_invoice_id_idx
  on public.invoice_adjustments(invoice_id);

create table public.invoice_match_results (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  receipt_id uuid references public.receipts(id),
  match_type public.invoice_match_type not null,
  confidence numeric(4, 3),
  reviewed_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index invoice_match_results_invoice_id_idx
  on public.invoice_match_results(invoice_id);
create index invoice_match_results_receipt_id_idx
  on public.invoice_match_results(receipt_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_approvals enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.receipt_exceptions enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_adjustments enable row level security;
alter table public.invoice_match_results enable row level security;

create policy "purchase_orders_select_member"
on public.purchase_orders for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "purchase_orders_insert_manager"
on public.purchase_orders for insert to authenticated
with check ((select public.is_organization_manager(organization_id)));
create policy "purchase_orders_update_manager"
on public.purchase_orders for update to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "purchase_order_lines_select_member"
on public.purchase_order_lines for select to authenticated
using (
  exists (
    select 1 from public.purchase_orders purchase_order
    where purchase_order.id = purchase_order_id
      and (select public.is_organization_member(purchase_order.organization_id))
  )
);
create policy "purchase_order_lines_write_manager"
on public.purchase_order_lines for all to authenticated
using (
  exists (
    select 1 from public.purchase_orders purchase_order
    where purchase_order.id = purchase_order_id
      and (select public.is_organization_manager(purchase_order.organization_id))
  )
)
with check (
  exists (
    select 1 from public.purchase_orders purchase_order
    where purchase_order.id = purchase_order_id
      and (select public.is_organization_manager(purchase_order.organization_id))
  )
);

create policy "purchase_order_approvals_select_member"
on public.purchase_order_approvals for select to authenticated
using (
  exists (
    select 1 from public.purchase_orders purchase_order
    where purchase_order.id = purchase_order_id
      and (select public.is_organization_member(purchase_order.organization_id))
  )
);
create policy "purchase_order_approvals_insert_manager"
on public.purchase_order_approvals for insert to authenticated
with check (
  exists (
    select 1 from public.purchase_orders purchase_order
    where purchase_order.id = purchase_order_id
      and (select public.is_organization_manager(purchase_order.organization_id))
  )
);

create policy "receipts_select_member"
on public.receipts for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "receipts_insert_location_member"
on public.receipts for insert to authenticated
with check ((select public.can_access_location(location_id)));
create policy "receipts_update_location_member"
on public.receipts for update to authenticated
using (
  (select public.can_access_location(location_id))
  and (
    received_by = (select auth.uid())
    or (select public.is_organization_manager(organization_id))
  )
)
with check (
  (select public.can_access_location(location_id))
  and (
    received_by = (select auth.uid())
    or (select public.is_organization_manager(organization_id))
  )
);

create policy "receipt_lines_select_member"
on public.receipt_lines for select to authenticated
using (
  exists (
    select 1 from public.receipts receipt
    where receipt.id = receipt_id
      and (select public.is_organization_member(receipt.organization_id))
  )
);
create policy "receipt_lines_write_location_member"
on public.receipt_lines for all to authenticated
using (
  exists (
    select 1 from public.receipts receipt
    where receipt.id = receipt_id
      and (select public.can_access_location(receipt.location_id))
      and (
        receipt.received_by = (select auth.uid())
        or (select public.is_organization_manager(receipt.organization_id))
      )
  )
)
with check (
  exists (
    select 1 from public.receipts receipt
    where receipt.id = receipt_id
      and (select public.can_access_location(receipt.location_id))
      and (
        receipt.received_by = (select auth.uid())
        or (select public.is_organization_manager(receipt.organization_id))
      )
  )
);

create policy "receipt_exceptions_select_member"
on public.receipt_exceptions for select to authenticated
using (
  exists (
    select 1 from public.receipts receipt
    where receipt.id = receipt_id
      and (select public.is_organization_member(receipt.organization_id))
  )
);
create policy "receipt_exceptions_write_location_member"
on public.receipt_exceptions for all to authenticated
using (
  exists (
    select 1 from public.receipts receipt
    where receipt.id = receipt_id
      and (select public.can_access_location(receipt.location_id))
  )
)
with check (
  exists (
    select 1 from public.receipts receipt
    where receipt.id = receipt_id
      and (select public.can_access_location(receipt.location_id))
  )
);

create policy "invoices_select_member"
on public.invoices for select to authenticated
using ((select public.is_organization_member(organization_id)));
create policy "invoices_write_manager"
on public.invoices for all to authenticated
using ((select public.is_organization_manager(organization_id)))
with check ((select public.is_organization_manager(organization_id)));

create policy "invoice_lines_select_member"
on public.invoice_lines for select to authenticated
using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_id
      and (select public.is_organization_member(invoice.organization_id))
  )
);
create policy "invoice_lines_write_manager"
on public.invoice_lines for all to authenticated
using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_id
      and (select public.is_organization_manager(invoice.organization_id))
  )
)
with check (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_id
      and (select public.is_organization_manager(invoice.organization_id))
  )
);

create policy "invoice_adjustments_member"
on public.invoice_adjustments for all to authenticated
using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_id
      and (select public.is_organization_manager(invoice.organization_id))
  )
)
with check (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_id
      and (select public.is_organization_manager(invoice.organization_id))
  )
);

create policy "invoice_match_results_member"
on public.invoice_match_results for all to authenticated
using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_id
      and (select public.is_organization_manager(invoice.organization_id))
  )
)
with check (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_id
      and (select public.is_organization_manager(invoice.organization_id))
  )
);

grant select, insert, update on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_lines to authenticated;
grant select, insert on public.purchase_order_approvals to authenticated;
grant select, insert, update on public.receipts to authenticated;
grant select, insert, update, delete on public.receipt_lines to authenticated;
grant select, insert, update, delete on public.receipt_exceptions to authenticated;
grant select, insert, update on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_lines to authenticated;
grant select, insert, update, delete on public.invoice_adjustments to authenticated;
grant select, insert, update, delete on public.invoice_match_results to authenticated;

create or replace function public.approve_purchase_order(target_order_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_order public.purchase_orders%rowtype;
begin
  select * into target_order
  from public.purchase_orders
  where id = target_order_id
  for update;

  if target_order.id is null then
    raise exception 'Purchase order not found';
  end if;
  if not public.is_organization_manager(target_order.organization_id) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;
  if target_order.status <> 'draft' then
    raise exception 'Only draft purchase orders can be approved';
  end if;
  if not exists (
    select 1 from public.purchase_order_lines
    where purchase_order_id = target_order.id
  ) then
    raise exception 'Purchase order requires at least one line';
  end if;

  update public.purchase_orders
  set status = 'approved'
  where id = target_order.id;

  insert into public.purchase_order_approvals (
    purchase_order_id,
    approved_by
  )
  values (target_order.id, auth.uid());

  return target_order.id;
end;
$$;

grant execute on function public.approve_purchase_order(uuid) to authenticated;

create or replace function public.post_receipt(target_receipt_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_receipt public.receipts%rowtype;
  posted_transaction_id uuid;
  target_period_id uuid;
  line record;
  prior_quantity numeric;
  prior_value numeric;
  new_wac numeric;
begin
  select * into target_receipt
  from public.receipts
  where id = target_receipt_id
  for update;

  if target_receipt.id is null then
    raise exception 'Receipt not found';
  end if;
  if not public.can_access_location(target_receipt.location_id) then
    raise exception 'Location access required' using errcode = '42501';
  end if;
  if target_receipt.purchase_order_id is null
    and not public.is_organization_manager(target_receipt.organization_id)
  then
    raise exception 'No-PO receipts require manager approval';
  end if;
  if exists (
    select 1 from public.receipt_exceptions exception
    where exception.receipt_id = target_receipt.id
      and exception.requires_manager_review
      and exception.resolved_at is null
  ) then
    raise exception 'Receipt has unresolved manager-review exceptions';
  end if;
  if target_receipt.status = 'posted' then
    select id into posted_transaction_id
    from public.inventory_transactions
    where idempotency_key = 'receipt:' || target_receipt.id::text || ':post';
    return posted_transaction_id;
  end if;
  if not exists (
    select 1 from public.receipt_lines receipt_line
    where receipt_line.receipt_id = target_receipt.id
      and receipt_line.inventory_item_id is not null
      and receipt_line.storage_location_id is not null
  ) then
    raise exception 'Receipt requires mapped lines';
  end if;

  select period.id into target_period_id
  from public.inventory_periods period
  where period.organization_id = target_receipt.organization_id
    and period.location_id = target_receipt.location_id
    and target_receipt.received_at::date between period.period_start and period.period_end
  order by period.period_start desc
  limit 1;

  if target_period_id is null then
    raise exception 'Receipt date is outside an inventory period';
  end if;

  insert into public.inventory_transactions (
    organization_id,
    location_id,
    transaction_type,
    effective_at,
    source_type,
    source_id,
    idempotency_key,
    actor_id
  )
  values (
    target_receipt.organization_id,
    target_receipt.location_id,
    'receipt',
    target_receipt.received_at,
    'receipt',
    target_receipt.id,
    'receipt:' || target_receipt.id::text || ':post',
    auth.uid()
  )
  returning id into posted_transaction_id;

  for line in
    select * from public.receipt_lines
    where receipt_id = target_receipt.id
  loop
    select
      coalesce(on_hand.quantity, 0),
      coalesce(on_hand.extended_value, 0)
    into prior_quantity, prior_value
    from (select 1) seed
    left join public.inventory_on_hand on_hand
      on on_hand.organization_id = target_receipt.organization_id
      and on_hand.location_id = target_receipt.location_id
      and on_hand.inventory_item_id = line.inventory_item_id
      and on_hand.storage_location_id = line.storage_location_id;

    if prior_quantity < 0 then
      raise exception 'Cannot calculate WAC with negative prior on-hand';
    end if;

    new_wac := (
      prior_value + (line.quantity_received * line.unit_price)
    ) / (prior_quantity + line.quantity_received_base);

    insert into public.inventory_transaction_lines (
      inventory_transaction_id,
      inventory_item_id,
      storage_location_id,
      quantity,
      unit_cost,
      reason_code
    )
    values (
      posted_transaction_id,
      line.inventory_item_id,
      line.storage_location_id,
      line.quantity_received_base,
      new_wac,
      'approved_receipt'
    );

    insert into public.inventory_item_cost_snapshots (
      inventory_item_id,
      inventory_period_id,
      weighted_average_cost,
      effective_at
    )
    values (
      line.inventory_item_id,
      target_period_id,
      new_wac,
      target_receipt.received_at
    );

    if line.purchase_order_line_id is not null then
      update public.purchase_order_lines
      set quantity_received = quantity_received + line.quantity_received
      where id = line.purchase_order_line_id;
    end if;
  end loop;

  update public.receipts
  set status = 'posted', posted_at = now()
  where id = target_receipt.id;

  if target_receipt.purchase_order_id is not null then
    update public.purchase_orders purchase_order
    set status = case
      when not exists (
        select 1
        from public.purchase_order_lines purchase_order_line
        where purchase_order_line.purchase_order_id = purchase_order.id
          and purchase_order_line.quantity_received
            < purchase_order_line.quantity_ordered
      ) then 'received'::public.purchase_order_status
      else 'partially_received'::public.purchase_order_status
    end
    where purchase_order.id = target_receipt.purchase_order_id;
  end if;

  return posted_transaction_id;
end;
$$;

grant execute on function public.post_receipt(uuid) to authenticated;

create or replace function public.approve_invoice(target_invoice_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_invoice public.invoices%rowtype;
  target_period_id uuid;
  line record;
  receipt_line public.receipt_lines%rowtype;
  on_hand_quantity numeric;
  on_hand_value numeric;
  cost_delta numeric;
  new_wac numeric;
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
  if target_invoice.status not in ('reviewed', 'approved') then
    raise exception 'Invoice must be reviewed before approval';
  end if;
  if exists (
    select 1 from public.invoice_lines invoice_line
    where invoice_line.invoice_id = target_invoice.id
      and invoice_line.inventory_item_id is null
  ) then
    raise exception 'Every invoice line must be mapped';
  end if;

  select period.id into target_period_id
  from public.inventory_periods period
  where period.organization_id = target_invoice.organization_id
    and period.location_id = target_invoice.location_id
    and target_invoice.invoice_date between period.period_start and period.period_end
  order by period.period_start desc
  limit 1;

  for line in
    select * from public.invoice_lines
    where invoice_id = target_invoice.id
      and receipt_line_id is not null
  loop
    select * into receipt_line
    from public.receipt_lines
    where id = line.receipt_line_id;

    select
      coalesce(sum(on_hand.quantity), 0),
      coalesce(sum(on_hand.extended_value), 0)
    into on_hand_quantity, on_hand_value
    from public.inventory_on_hand on_hand
    where on_hand.organization_id = target_invoice.organization_id
      and on_hand.location_id = target_invoice.location_id
      and on_hand.inventory_item_id = line.inventory_item_id;

    if on_hand_quantity < 0 then
      raise exception 'Cannot revalue invoice with negative on-hand';
    end if;
    if on_hand_quantity = 0 then
      continue;
    end if;

    cost_delta := line.line_total
      - (receipt_line.quantity_received * receipt_line.unit_price);
    new_wac := (on_hand_value + cost_delta) / on_hand_quantity;

    insert into public.inventory_item_cost_snapshots (
      inventory_item_id,
      inventory_period_id,
      weighted_average_cost,
      effective_at
    )
    values (
      line.inventory_item_id,
      target_period_id,
      new_wac,
      target_invoice.invoice_date::timestamptz
    );
  end loop;

  update public.invoices
  set
    status = 'posted',
    approved_by = auth.uid(),
    posted_at = now()
  where id = target_invoice.id;

  return target_invoice.id;
end;
$$;

grant execute on function public.approve_invoice(uuid) to authenticated;

create or replace view public.inventory_on_hand
with (security_invoker = true)
as
with quantity_by_location as (
  select
    transaction.organization_id,
    transaction.location_id,
    line.inventory_item_id,
    line.storage_location_id,
    sum(line.quantity)::numeric(20, 6) as quantity,
    sum(line.extended_value)::numeric(24, 6) as ledger_value,
    max(transaction.effective_at) as last_movement_at
  from public.inventory_transaction_lines line
  join public.inventory_transactions transaction
    on transaction.id = line.inventory_transaction_id
  group by
    transaction.organization_id,
    transaction.location_id,
    line.inventory_item_id,
    line.storage_location_id
)
select
  quantity.organization_id,
  quantity.location_id,
  quantity.inventory_item_id,
  quantity.storage_location_id,
  quantity.quantity,
  coalesce(
    latest_cost.weighted_average_cost,
    case
      when quantity.quantity = 0 then 0::numeric
      else quantity.ledger_value / quantity.quantity
    end
  ) as weighted_average_cost,
  (
    quantity.quantity
    * coalesce(
      latest_cost.weighted_average_cost,
      case
        when quantity.quantity = 0 then 0
        else quantity.ledger_value / quantity.quantity
      end
    )
  )::numeric(24, 6) as extended_value,
  quantity.last_movement_at
from quantity_by_location quantity
left join lateral (
  select snapshot.weighted_average_cost
  from public.inventory_item_cost_snapshots snapshot
  where snapshot.inventory_item_id = quantity.inventory_item_id
  order by snapshot.effective_at desc
  limit 1
) latest_cost on true;
