-- Immutable extraction evidence; all review/post mutations use checked RPCs.
create table public.plcb_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  source_import_id uuid not null references public.source_imports(id),
  document_hash text not null,
  order_number text,
  parser_version text not null,
  extraction jsonb not null,
  review jsonb not null default '{}',
  revision integer not null default 1,
  status text not null default 'needs_review' check (status in ('needs_review','posted','rejected')),
  invoice_id uuid references public.invoices(id),
  receipt_id uuid references public.receipts(id),
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  unique (organization_id, location_id, document_hash)
);

create index plcb_documents_source_idx on public.plcb_documents(source_import_id);

create index plcb_documents_order_idx on public.plcb_documents(organization_id,location_id,order_number);

create unique index plcb_posted_order_unique on public.plcb_documents(organization_id,location_id,order_number) where status='posted';

alter table public.plcb_documents enable row level security;

create policy plcb_documents_read on public.plcb_documents for select to authenticated
using (public.is_organization_member(organization_id) and public.can_access_location(location_id));

revoke all on public.plcb_documents from anon, authenticated;

grant select on public.plcb_documents to authenticated;

grant all on public.plcb_documents to service_role;

create table public.plcb_review_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.plcb_documents(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index plcb_review_events_document_idx on public.plcb_review_events(document_id);

alter table public.plcb_review_events enable row level security;

create policy plcb_events_read on public.plcb_review_events for select to authenticated using (
  exists(select 1 from public.plcb_documents d where d.id=document_id)
);

revoke all on public.plcb_review_events from anon, authenticated;

grant select on public.plcb_review_events to authenticated;

grant all on public.plcb_review_events to service_role;

create or replace function public.save_plcb_review(target_document_id uuid, expected_revision integer, decisions jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare d public.plcb_documents%rowtype;
begin
  select * into d from public.plcb_documents where id=target_document_id for update;
  if auth.uid() is null or d.id is null or not public.is_organization_manager(d.organization_id)
    or not public.can_access_location(d.location_id) then
    raise exception 'Manager access required' using errcode='42501';
  end if;
  if d.status <> 'needs_review' then raise exception 'Document is not reviewable'; end if;
  if d.revision <> expected_revision then raise exception 'Review changed. Reload before saving.'; end if;
  if jsonb_typeof(decisions) <> 'object' then raise exception 'Invalid review'; end if;
  update public.plcb_documents set review=decisions,revision=revision+1 where id=d.id;
  insert into public.plcb_review_events(document_id,actor_id,action,payload)
    values(d.id,auth.uid(),'review_saved',decisions);
  return d.revision+1;
end; $$;

revoke all on function public.save_plcb_review(uuid,integer,jsonb) from public,anon;

grant execute on function public.save_plcb_review(uuid,integer,jsonb) to authenticated;

create or replace function public.post_plcb_document(target_document_id uuid, expected_revision integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  d public.plcb_documents%rowtype;
  v_data jsonb;
  v_location public.locations%rowtype;
  v_period public.inventory_periods%rowtype;
  v_item public.inventory_items%rowtype;
  v_vendor uuid; v_zone uuid; v_ml uuid; v_invoice uuid; v_receipt uuid; v_tx uuid;
  v_item_id uuid; v_vendor_item uuid; v_receipt_line uuid; v_invoice_line uuid;
  v_line jsonb; v_decision jsonb; v_idx integer; v_received date; v_effective timestamptz;
  v_total numeric; v_merch numeric; v_charges numeric; v_allocated numeric:=0; v_allocation numeric;
  v_qty numeric; v_amount numeric; v_base numeric; v_size numeric; v_factor numeric;
  v_landed numeric; v_prior_qty numeric; v_prior_value numeric; v_wac numeric; v_last integer;
begin
  select * into d from public.plcb_documents where id=target_document_id for update;
  if auth.uid() is null or d.id is null or not public.is_organization_manager(d.organization_id)
    or not public.can_access_location(d.location_id) then
    raise exception 'Manager access required' using errcode='42501';
  end if;
  if d.status='posted' then return d.invoice_id; end if;
  if d.status <> 'needs_review' or d.revision <> expected_revision then raise exception 'Review changed. Reload before approval.'; end if;
  if coalesce((d.review->>'confirmed')::boolean,false) is not true then raise exception 'Confirm the entire invoice before posting'; end if;
  if nullif(d.order_number,'') is null or d.order_number='unknown' then raise exception 'Order identity is required'; end if;
  v_data := coalesce(d.review->'correctedExtraction',d.extraction);
  if d.review ? 'correctedExtraction' then
    if length(trim(coalesce(d.review->>'correctionReason',''))) < 10
      or v_data->>'orderId' is distinct from d.extraction->>'orderId'
      or jsonb_array_length(v_data->'lines') is distinct from jsonb_array_length(d.extraction->'lines') then
      raise exception 'Corrections require a reason and must retain every source line';
    end if;
  end if;
  if exists(select 1 from unnest(array['totalAmount','merchandiseAmount','taxAmount','freightAmount','handlingAmount','supplierShippingAmount']) key
    where jsonb_typeof(v_data->key) is distinct from 'number' or (v_data->>key)::numeric<0) then
    raise exception 'All invoice amounts must be finite non-negative numbers';
  end if;
  if exists(select 1 from jsonb_array_elements(v_data->'issues') issue where (issue->>'blocking')::boolean) then
    raise exception 'Resolve extraction errors before posting';
  end if;
  -- Serialize all postings for a location: protects order replay and weighted costs.
  select * into v_location from public.locations where id=d.location_id and organization_id=d.organization_id for update;
  if v_location.id is null then raise exception 'Invalid location'; end if;
  if exists(select 1 from public.plcb_documents p where p.organization_id=d.organization_id and p.location_id=d.location_id
    and p.order_number=d.order_number and p.status='posted') then raise exception 'This PLCB order has already been posted'; end if;
  v_received := (d.review->>'receivedDate')::date;
  if v_received is null or v_received > (now() at time zone v_location.timezone)::date then raise exception 'Valid receipt date required'; end if;
  v_effective := (v_received + v_location.business_day_cutoff) at time zone v_location.timezone;
  select * into v_period from public.inventory_periods p where p.organization_id=d.organization_id and p.location_id=d.location_id
    and v_received between p.period_start and p.period_end order by p.period_start desc limit 1 for update;
  if v_period.id is null or v_period.status::text not in ('draft','count_in_progress','count_complete','reopened') then raise exception 'Receipt date requires an open inventory period'; end if;
  if exists(select 1 from public.inventory_transactions t where t.location_id=d.location_id and t.effective_at>v_effective) then
    raise exception 'Receipt predates posted movements. Review historical imports in staging before posting.';
  end if;
  v_total := (v_data->>'totalAmount')::numeric;
  v_merch := (v_data->>'merchandiseAmount')::numeric;
  v_charges := (v_data->>'taxAmount')::numeric + (v_data->>'freightAmount')::numeric + (v_data->>'handlingAmount')::numeric + coalesce((v_data->>'supplierShippingAmount')::numeric,0);
  if v_total is null or v_merch is null or v_charges is null or v_merch<=0 or v_charges<0 or abs(v_total-v_merch-v_charges)>0.01 then
    raise exception 'Invoice totals do not reconcile';
  end if;
  if jsonb_array_length(v_data->'lines')=0 or jsonb_array_length(d.review->'lines') is distinct from jsonb_array_length(v_data->'lines') then
    raise exception 'Every extracted line needs an explicit decision';
  end if;
  if abs((select sum((x->>'lineTotal')::numeric) from jsonb_array_elements(v_data->'lines') x)-v_merch)>0.01 then
    raise exception 'Line merchandise amounts do not reconcile';
  end if;
  v_vendor := nullif(d.review->>'vendorId','')::uuid;
  if v_vendor is null then
    if d.review->>'newVendorName' <> 'PLCB' then raise exception 'Choose a vendor or explicitly create PLCB'; end if;
    select id into v_vendor from public.vendors where organization_id=d.organization_id and name='PLCB' limit 1;
    if v_vendor is null then insert into public.vendors(organization_id,name,vendor_type) values(d.organization_id,'PLCB','plcb') returning id into v_vendor; end if;
  end if;
  if not exists(select 1 from public.vendors where id=v_vendor and organization_id=d.organization_id and vendor_type='plcb') then raise exception 'Choose a PLCB vendor in this organization'; end if;
  v_zone := nullif(d.review->>'storageLocationId','')::uuid;
  if v_zone is null then
    if nullif(trim(d.review->>'newStorageName'),'') is null then raise exception 'Storage location required'; end if;
    insert into public.storage_locations(organization_id,location_id,name) values(d.organization_id,d.location_id,trim(d.review->>'newStorageName'))
      on conflict(organization_id,location_id,name) do update set name=excluded.name returning id into v_zone;
  end if;
  if not exists(select 1 from public.storage_locations where id=v_zone and organization_id=d.organization_id and location_id=d.location_id and active) then raise exception 'Invalid storage location'; end if;
  insert into public.invoices(organization_id,location_id,vendor_id,invoice_number,order_id,invoice_date,status,total_amount,tax_amount,freight_amount,
    source_import_id,document_file_path,extractor_version,reviewed_by,approved_by,posted_at,document_hash,validation_status)
    select d.organization_id,d.location_id,v_vendor,d.order_number,d.order_number,(v_data->>'date')::date,'posted',v_total,
      (v_data->>'taxAmount')::numeric,(v_data->>'freightAmount')::numeric+(v_data->>'handlingAmount')::numeric+coalesce((v_data->>'supplierShippingAmount')::numeric,0),
      d.source_import_id,s.file_path,d.parser_version,auth.uid(),auth.uid(),now(),d.document_hash,'valid'
      from public.source_imports s where s.id=d.source_import_id returning id into v_invoice;
  insert into public.receipts(organization_id,location_id,vendor_id,status,received_by,received_at,document_file_path,posted_at,notes)
    select d.organization_id,d.location_id,v_vendor,'posted',auth.uid(),v_effective,s.file_path,now(),'PLCB order '||d.order_number
    from public.source_imports s where s.id=d.source_import_id returning id into v_receipt;
  insert into public.inventory_transactions(organization_id,location_id,transaction_type,effective_at,source_type,source_id,idempotency_key,actor_id)
    values(d.organization_id,d.location_id,'receipt',v_effective,'plcb_invoice',v_invoice,'plcb:'||d.id,auth.uid()) returning id into v_tx;
  select max(ordinality)::integer-1 into v_last from jsonb_array_elements(v_data->'lines') with ordinality
    where (value->>'shippedQuantity')::numeric>0;
  for v_line,v_idx in select value,ordinality::integer-1 from jsonb_array_elements(v_data->'lines') with ordinality loop
    if exists(select 1 from unnest(array['orderedQuantity','shippedQuantity','unitPrice','lineTotal','bottleSizeMl']) key
      where jsonb_typeof(v_line->key) is distinct from 'number' or (v_line->>key)::numeric<0) then
      raise exception 'Every quantity, price and bottle size must be a finite non-negative number';
    end if;
    if (v_line->>'orderedQuantity')::numeric <> trunc((v_line->>'orderedQuantity')::numeric)
      or (v_line->>'shippedQuantity')::numeric <> trunc((v_line->>'shippedQuantity')::numeric) then
      raise exception 'Bottle quantities must be whole numbers';
    end if;
    v_decision := d.review->'lines'->v_idx;
    if coalesce((v_decision->>'accepted')::boolean,false) is not true then raise exception 'Line % needs explicit acceptance',v_idx+1; end if;
    v_qty := (v_line->>'shippedQuantity')::numeric;
    v_amount := (v_line->>'lineTotal')::numeric;
    v_size := (v_line->>'bottleSizeMl')::numeric;
    if coalesce(v_line->>'itemCode','') !~ '^[0-9]{3,}$' or nullif(trim(v_line->>'product'),'') is null
      or (v_line->>'orderedQuantity')::numeric is null or (v_line->>'orderedQuantity')::numeric<v_qty
      or (v_line->>'unitPrice')::numeric is null or (v_line->>'unitPrice')::numeric<0
      or abs(v_qty*(v_line->>'unitPrice')::numeric-v_amount)>0.01 then
      raise exception 'Line identity, quantities and prices must reconcile';
    end if;
    if v_qty is null or v_qty<0 or v_amount is null or v_amount<0 then raise exception 'Invalid received quantity or cost'; end if;
    if v_qty=0 then
      if v_amount<>0 then raise exception 'An unshipped line cannot carry merchandise value'; end if;
      continue;
    end if;
    if v_size is null or v_size<=0 then raise exception 'Bottle size must be resolved'; end if;
    v_item_id := nullif(v_decision->>'inventoryItemId','')::uuid;
    if v_item_id is null then
      if nullif(trim(v_decision->>'newItemName'),'') is null then raise exception 'Choose or name inventory item for line %',v_idx+1; end if;
      select id into v_ml from public.units where organization_id=d.organization_id and abbreviation='ml' and unit_type='volume' and conversion_factor_to_base=1 limit 1;
      if v_ml is null then
        insert into public.units(organization_id,name,abbreviation,unit_type,conversion_factor_to_base) values(d.organization_id,'PLCB milliliter','ml','volume',1) returning id into v_ml;
        update public.units set base_unit_id=v_ml where id=v_ml;
      end if;
      insert into public.inventory_items(organization_id,name,base_unit_id,count_unit_id,is_purchased,default_storage_location_id)
        values(d.organization_id,trim(v_decision->>'newItemName'),v_ml,v_ml,true,v_zone) returning id into v_item_id;
    end if;
    select * into v_item from public.inventory_items where id=v_item_id and organization_id=d.organization_id and active for update;
    if v_item.id is null then raise exception 'Inventory item is outside this organization'; end if;
    select u.conversion_factor_to_base into v_factor from public.units u join public.units b on b.id=u.base_unit_id
      where u.id=v_item.base_unit_id and u.organization_id=d.organization_id and b.organization_id=d.organization_id
      and u.unit_type='volume' and b.abbreviation='ml';
    if v_factor is null or v_factor<=0 then raise exception 'Choose a volume item with a milliliter conversion'; end if;
    v_base := v_qty*v_size/v_factor;
    if v_idx=v_last then v_allocation := v_charges-v_allocated;
    else v_allocation:=round(v_charges*v_amount/v_merch,2); end if;
    v_allocated:=v_allocated+v_allocation;
    v_landed:=v_amount+v_allocation;
    select coalesce(sum(quantity),0),coalesce(sum(extended_value),0) into v_prior_qty,v_prior_value from public.inventory_on_hand
      where organization_id=d.organization_id and location_id=d.location_id and inventory_item_id=v_item_id;
    if v_prior_qty<0 then raise exception 'Negative prior inventory blocks posting'; end if;
    v_wac:=(v_prior_value+v_landed)/(v_prior_qty+v_base);
    select id into v_vendor_item from public.vendor_items where vendor_id=v_vendor and vendor_product_code=v_line->>'itemCode' for update;
    if v_vendor_item is not null and exists(select 1 from public.vendor_items where id=v_vendor_item and inventory_item_id is not null and inventory_item_id<>v_item_id) then
      raise exception 'PLCB SKU already maps to another item; resolve the catalog mapping before approval';
    end if;
    insert into public.vendor_items(organization_id,vendor_id,inventory_item_id,vendor_product_code,vendor_product_name,pack_size,base_quantity_per_purchase_unit)
      values(d.organization_id,v_vendor,v_item_id,v_line->>'itemCode',v_line->>'product',v_line->>'bottleSize',v_size/v_factor)
      on conflict(vendor_id,vendor_product_code) do update set inventory_item_id=excluded.inventory_item_id,
        pack_size=excluded.pack_size,base_quantity_per_purchase_unit=excluded.base_quantity_per_purchase_unit returning id into v_vendor_item;
    insert into public.vendor_item_prices(organization_id,vendor_item_id,unit_price,effective_date)
      values(d.organization_id,v_vendor_item,v_amount/v_qty,v_received);
    insert into public.receipt_lines(receipt_id,vendor_item_id,inventory_item_id,storage_location_id,quantity_received,quantity_received_base,unit_price,notes)
      values(v_receipt,v_vendor_item,v_item_id,v_zone,v_qty,v_base,v_landed/v_qty,'PLCB landed receipt; allocations in review evidence') returning id into v_receipt_line;
    insert into public.invoice_lines(invoice_id,line_index,vendor_product_code,product_description,pack_size,quantity_invoiced,unit_price,line_total,inventory_item_id,receipt_line_id)
      values(v_invoice,v_idx,v_line->>'itemCode',v_line->>'product',v_line->>'bottleSize',v_qty,v_amount/v_qty,v_amount,v_item_id,v_receipt_line) returning id into v_invoice_line;
    insert into public.inventory_transaction_lines(inventory_transaction_id,inventory_item_id,storage_location_id,quantity,unit_cost,reason_code)
      values(v_tx,v_item_id,v_zone,v_base,v_landed/v_base,'plcb_landed_receipt');
    insert into public.inventory_item_cost_snapshots(inventory_item_id,inventory_period_id,weighted_average_cost,effective_at)
      values(v_item_id,v_period.id,v_wac,v_effective);
    insert into public.item_cost_history(organization_id,location_id,inventory_item_id,vendor_id,vendor_item_id,invoice_id,invoice_line_id,effective_date,base_unit_cost,base_quantity,pack_size_text,cost_source)
      values(d.organization_id,d.location_id,v_item_id,v_vendor,v_vendor_item,v_invoice,v_invoice_line,v_received,v_landed/v_base,v_base,v_line->>'bottleSize','plcb_landed');
    insert into public.plcb_review_events(document_id,actor_id,action,payload) values(d.id,auth.uid(),'line_posted',jsonb_build_object(
      'lineIndex',v_idx,'inventoryItemId',v_item_id,'orderedQuantity',v_line->'orderedQuantity','shippedQuantity',v_qty,
      'merchandise',v_amount,'allocatedCharges',v_allocation,'landedCost',v_landed,'quantityBase',v_base));
  end loop;
  insert into public.invoice_adjustments(invoice_id,adjustment_type,amount,description)
    select v_invoice,'tax',(v_data->>'taxAmount')::numeric,'PLCB merchandise tax' where (v_data->>'taxAmount')::numeric<>0;
  insert into public.invoice_adjustments(invoice_id,adjustment_type,amount,description)
    select v_invoice,'freight',(v_data->>'freightAmount')::numeric,'PLCB freight' where (v_data->>'freightAmount')::numeric<>0;
  insert into public.invoice_adjustments(invoice_id,adjustment_type,amount,description)
    select v_invoice,'freight',coalesce((v_data->>'supplierShippingAmount')::numeric,0),'PLCB supplier shipping' where coalesce((v_data->>'supplierShippingAmount')::numeric,0)<>0;
  insert into public.invoice_adjustments(invoice_id,adjustment_type,amount,description)
    select v_invoice,'freight',(v_data->>'handlingAmount')::numeric,'PLCB handling' where (v_data->>'handlingAmount')::numeric<>0;
  update public.plcb_documents set status='posted',invoice_id=v_invoice,receipt_id=v_receipt,approved_by=auth.uid(),posted_at=now() where id=d.id;
  update public.source_imports set status='posted',approved_by=auth.uid(),approved_at=now() where id=d.source_import_id;
  insert into public.plcb_review_events(document_id,actor_id,action,payload) values(d.id,auth.uid(),'posted',jsonb_build_object('invoiceId',v_invoice,'receiptId',v_receipt,'review',d.review,'revision',d.revision));
  return v_invoice;
end; $$;

revoke all on function public.post_plcb_document(uuid,integer) from public,anon;

grant execute on function public.post_plcb_document(uuid,integer) to authenticated;
