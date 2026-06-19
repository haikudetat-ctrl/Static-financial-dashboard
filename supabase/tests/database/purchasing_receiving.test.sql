begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select has_table('public', 'purchase_orders', 'purchase orders table exists');
select has_table('public', 'purchase_order_lines', 'purchase order lines table exists');
select has_table('public', 'purchase_order_approvals', 'purchase approvals table exists');
select has_table('public', 'receipts', 'receipts table exists');
select has_table('public', 'receipt_lines', 'receipt lines table exists');
select has_table('public', 'receipt_exceptions', 'receipt exceptions table exists');
select has_table('public', 'invoices', 'invoices table exists');
select has_table('public', 'invoice_lines', 'invoice lines table exists');
select has_table('public', 'invoice_adjustments', 'invoice adjustments table exists');
select has_function(
  'public',
  'approve_purchase_order',
  array['uuid'],
  'purchase-order approval function exists'
);
select has_function(
  'public',
  'post_receipt',
  array['uuid'],
  'receipt posting function exists'
);
select has_function(
  'public',
  'approve_invoice',
  array['uuid'],
  'invoice approval function exists'
);

insert into public.vendors (
  id,
  organization_id,
  name,
  vendor_type
)
values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Purchasing Test Vendor',
  'plcb'
);

insert into public.vendor_items (
  id,
  organization_id,
  vendor_id,
  inventory_item_id,
  vendor_product_code,
  vendor_product_name,
  pack_size,
  purchase_unit_id
)
select
  '60000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000201',
  'TEST-BOURBON',
  'Test Bourbon',
  '1 x 750 ml',
  unit.id
from public.units unit
where unit.organization_id = '10000000-0000-0000-0000-000000000001'
  and unit.name = 'Bottle';

insert into public.purchase_orders (
  id,
  organization_id,
  location_id,
  vendor_id,
  status,
  order_date,
  expected_delivery_date
)
values (
  '60000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '60000000-0000-0000-0000-000000000001',
  'draft',
  '2026-06-19',
  '2026-06-20'
);

insert into public.purchase_order_lines (
  id,
  purchase_order_id,
  vendor_item_id,
  inventory_item_id,
  quantity_ordered,
  unit_price,
  pack_size
)
values (
  '60000000-0000-0000-0000-000000000004',
  '60000000-0000-0000-0000-000000000003',
  '60000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000201',
  2,
  20,
  '1 x 750 ml'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$ select public.approve_purchase_order('60000000-0000-0000-0000-000000000003') $$,
  'manager can approve a draft purchase order'
);
select is(
  (
    select status::text
    from public.purchase_orders
    where id = '60000000-0000-0000-0000-000000000003'
  ),
  'approved',
  'approved purchase order status is persisted'
);

insert into public.receipts (
  id,
  organization_id,
  location_id,
  purchase_order_id,
  vendor_id,
  status,
  received_by,
  received_at
)
values (
  '60000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '60000000-0000-0000-0000-000000000003',
  '60000000-0000-0000-0000-000000000001',
  'draft',
  '00000000-0000-0000-0000-000000000002',
  '2026-06-20 12:00:00+00'
);

insert into public.receipt_lines (
  receipt_id,
  purchase_order_line_id,
  vendor_item_id,
  inventory_item_id,
  storage_location_id,
  quantity_received,
  quantity_received_base,
  unit_price
)
values (
  '60000000-0000-0000-0000-000000000005',
  '60000000-0000-0000-0000-000000000004',
  '60000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000201',
  '10000000-0000-0000-0000-000000000101',
  2,
  1500,
  20
);

select lives_ok(
  $$ select public.post_receipt('60000000-0000-0000-0000-000000000005') $$,
  'clean approved-PO receipt posts inventory'
);
select is(
  (
    select count(*)::integer
    from public.inventory_transactions
    where source_type = 'receipt'
      and source_id = '60000000-0000-0000-0000-000000000005'
  ),
  1,
  'receipt creates one idempotent inventory transaction'
);
select is(
  (
    select weighted_average_cost
    from public.inventory_item_cost_snapshots
    where inventory_item_id = '10000000-0000-0000-0000-000000000201'
    order by effective_at desc
    limit 1
  ),
  0.0267::numeric,
  'receipt establishes base-unit weighted-average cost'
);

insert into public.invoices (
  id,
  organization_id,
  location_id,
  vendor_id,
  invoice_number,
  invoice_date,
  status,
  total_amount
)
values (
  '60000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '60000000-0000-0000-0000-000000000001',
  'INV-TEST-1',
  '2026-06-20',
  'reviewed',
  45
);

insert into public.invoice_lines (
  invoice_id,
  line_index,
  vendor_product_code,
  product_description,
  pack_size,
  quantity_invoiced,
  unit_price,
  line_total,
  inventory_item_id,
  receipt_line_id
)
select
  '60000000-0000-0000-0000-000000000006',
  1,
  'TEST-BOURBON',
  'Test Bourbon',
  '1 x 750 ml',
  2,
  22.5,
  45,
  '10000000-0000-0000-0000-000000000201',
  receipt_line.id
from public.receipt_lines receipt_line
where receipt_line.receipt_id = '60000000-0000-0000-0000-000000000005';

select lives_ok(
  $$ select public.approve_invoice('60000000-0000-0000-0000-000000000006') $$,
  'manager can approve a mapped reviewed invoice'
);
select is(
  (
    select status::text
    from public.invoices
    where id = '60000000-0000-0000-0000-000000000006'
  ),
  'posted',
  'approved invoice is posted'
);
select throws_ok(
  $$
    insert into public.invoices (
      organization_id,
      location_id,
      vendor_id,
      invoice_number,
      invoice_date,
      total_amount
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '60000000-0000-0000-0000-000000000001',
      'INV-TEST-1',
      '2026-06-21',
      45
    )
  $$,
  '23505',
  null,
  'vendor invoice number cannot be duplicated'
);

insert into public.purchase_orders (
  id,
  organization_id,
  location_id,
  vendor_id,
  status,
  order_date
)
values (
  '60000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '60000000-0000-0000-0000-000000000001',
  'draft',
  '2026-06-21'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);

select throws_ok(
  $$ select public.approve_purchase_order('60000000-0000-0000-0000-000000000007') $$,
  'P0001',
  'Purchase order not found',
  'staff cannot approve a purchase order'
);

select lives_ok(
  $$
    insert into public.receipts (
      id,
      organization_id,
      location_id,
      vendor_id,
      status,
      received_by,
      received_at
    )
    values (
      '60000000-0000-0000-0000-000000000008',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '60000000-0000-0000-0000-000000000001',
      'review_required',
      '00000000-0000-0000-0000-000000000002',
      '2026-06-21 12:00:00+00'
    )
  $$,
  'assigned location staff can create a receipt'
);

select throws_ok(
  $$
    insert into public.invoices (
      organization_id,
      location_id,
      vendor_id,
      invoice_number,
      invoice_date,
      total_amount
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000011',
      '60000000-0000-0000-0000-000000000001',
      'STAFF-INVOICE',
      '2026-06-21',
      12
    )
  $$,
  '42501',
  null,
  'staff cannot create invoices'
);

rollback;
