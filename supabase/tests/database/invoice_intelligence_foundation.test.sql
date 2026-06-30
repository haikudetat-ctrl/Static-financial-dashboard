begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table('public', 'invoice_processing_jobs', 'invoice processing jobs table exists');
select has_table('public', 'invoice_extraction_runs', 'invoice extraction runs table exists');
select has_table('public', 'invoice_line_candidates', 'invoice line candidates table exists');
select has_table('public', 'invoice_line_match_suggestions', 'invoice line match suggestions table exists');
select has_table('public', 'review_queue', 'review queue table exists');
select has_table('public', 'review_actions', 'review actions table exists');
select has_table('public', 'item_cost_history', 'item cost history table exists');
select has_table('public', 'price_alerts', 'price alerts table exists');

select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = to_regtype('public.invoice_source_channel')
  ),
  'upload,email_forward,gmail',
  'invoice source channels are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = to_regtype('public.invoice_processing_job_status')
  ),
  'queued,extracting,validating,matching,needs_review,auto_approved,approved,posted,failed,cancelled,superseded',
  'invoice processing job statuses are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = to_regtype('public.invoice_validation_status')
  ),
  'unvalidated,valid,warnings,blocking',
  'invoice validation statuses are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = to_regtype('public.invoice_match_strategy')
  ),
  'vendor_item_code,previous_invoice_match,inventory_alias,exact_name,fuzzy_similarity,semantic_match,reviewer_history',
  'invoice match strategies are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = to_regtype('public.invoice_review_status')
  ),
  'unreviewed,suggested,confirmed,create_item,blocked,rejected',
  'invoice review statuses are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = to_regtype('public.invoice_review_type')
  ),
  'suggested_match,new_item,price_alert,duplicate_invoice,pack_size_change,vendor_changed,unit_conversion_changed,receipt_mismatch',
  'invoice review types are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = to_regtype('public.review_queue_status')
  ),
  'open,in_review,resolved,rejected,dismissed',
  'review queue statuses are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = to_regtype('public.review_actor_type')
  ),
  'human,ai_worker,system',
  'review actor types are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = to_regtype('public.review_action_type')
  ),
  'approved,edited,rejected,merged,created_inventory_item,linked_alias,dismissed_alert',
  'review action types are defined'
);
select is(
  (
    select string_agg(enumlabel::text, ',' order by enumsortorder)
    from pg_enum
    where enumtypid = to_regtype('public.price_alert_type')
  ),
  'cost_increase,pack_size_changed,vendor_changed,unit_conversion_changed,duplicate_inventory_suspected',
  'price alert types are defined'
);

select col_type_is('public', 'invoices', 'source_channel', 'invoice_source_channel', 'invoices track source channel');
select col_type_is('public', 'invoices', 'external_message_id', 'text', 'invoices track external email message id');
select col_type_is('public', 'invoices', 'document_hash', 'text', 'invoices track document hash');
select col_type_is('public', 'invoices', 'duplicate_of_invoice_id', 'uuid', 'invoices track duplicate invoice parent');
select col_type_is('public', 'invoices', 'validation_status', 'invoice_validation_status', 'invoices track validation status');
select col_type_is('public', 'invoices', 'processing_job_id', 'uuid', 'invoices link processing job');
select col_type_is('public', 'invoices', 'currency', 'text', 'invoices track currency');
select col_type_is('public', 'invoices', 'subtotal_amount', 'numeric(20,4)', 'invoices track subtotal amount');
select col_type_is('public', 'invoices', 'idempotency_key', 'text', 'invoices track approval idempotency');

select col_type_is('public', 'invoice_lines', 'raw_line_text', 'text', 'invoice lines retain raw line text');
select col_type_is('public', 'invoice_lines', 'purchase_unit_text', 'text', 'invoice lines retain purchase unit text');
select col_type_is('public', 'invoice_lines', 'purchase_unit_id', 'uuid', 'invoice lines link purchase unit');
select col_type_is('public', 'invoice_lines', 'pack_size_structured', 'jsonb', 'invoice lines track structured pack size');
select col_type_is('public', 'invoice_lines', 'base_quantity', 'numeric(20,6)', 'invoice lines track base quantity');
select col_type_is('public', 'invoice_lines', 'unit_cost_per_base_unit', 'numeric(20,6)', 'invoice lines track base-unit cost');
select col_type_is('public', 'invoice_lines', 'match_confidence', 'numeric(4,3)', 'invoice lines track match confidence');
select col_type_is('public', 'invoice_lines', 'match_strategy', 'invoice_match_strategy', 'invoice lines track match strategy');
select col_type_is('public', 'invoice_lines', 'review_status', 'invoice_review_status', 'invoice lines track review status');

select col_type_is('public', 'vendors', 'normalized_name', 'text', 'vendors track normalized name');
select col_type_is('public', 'vendors', 'email_domains', 'text[]', 'vendors track known email domains');
select col_type_is('public', 'vendors', 'account_number', 'text', 'vendors track account number');

select col_type_is('public', 'vendor_items', 'normalized_description', 'text', 'vendor items track normalized description');
select col_type_is('public', 'vendor_items', 'case_quantity', 'numeric(20,6)', 'vendor items track case quantity');
select col_type_is('public', 'vendor_items', 'base_quantity_per_purchase_unit', 'numeric(20,6)', 'vendor items track base quantity per purchase unit');
select col_type_is('public', 'vendor_items', 'last_case_price', 'numeric(20,4)', 'vendor items track last case price');
select col_type_is('public', 'vendor_items', 'last_unit_cost', 'numeric(20,6)', 'vendor items track last unit cost');
select col_type_is('public', 'vendor_items', 'is_preferred', 'boolean', 'vendor items track preferred status');
select col_type_is('public', 'vendor_items', 'created_from_invoice_line_id', 'uuid', 'vendor items link originating invoice line');

select col_type_is('public', 'inventory_item_aliases', 'vendor_id', 'uuid', 'aliases can be vendor-scoped');
select col_type_is('public', 'inventory_item_aliases', 'normalized_alias', 'text', 'aliases track normalized text');
select col_type_is('public', 'inventory_item_aliases', 'confidence', 'numeric(4,3)', 'aliases track confidence');
select col_type_is('public', 'inventory_item_aliases', 'created_from_review_action_id', 'uuid', 'aliases link review action');

select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'invoice_processing_jobs',
        'invoice_extraction_runs',
        'invoice_line_candidates',
        'invoice_line_match_suggestions',
        'review_queue',
        'review_actions',
        'item_cost_history',
        'price_alerts'
      )
      and relation.relrowsecurity
  ),
  8,
  'RLS is enabled on every invoice intelligence table'
);

select is(
  (
    select count(*)::integer
    from pg_constraint constraint_definition
    join pg_class relation
      on relation.oid = constraint_definition.conrelid
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    cross join lateral unnest(constraint_definition.conkey) as key_column(attnum)
    where constraint_definition.contype = 'f'
      and namespace.nspname = 'public'
      and relation.relname in (
        'invoice_processing_jobs',
        'invoice_extraction_runs',
        'invoice_line_candidates',
        'invoice_line_match_suggestions',
        'review_queue',
        'review_actions',
        'item_cost_history',
        'price_alerts'
      )
      and not exists (
        select 1
        from pg_index index_definition
        where index_definition.indrelid = constraint_definition.conrelid
          and key_column.attnum = any(index_definition.indkey)
      )
  ),
  0,
  'every invoice intelligence foreign key column is indexed'
);

select col_is_unique(
  'public',
  'invoice_processing_jobs',
  array['idempotency_key'],
  'invoice processing job idempotency key is unique'
);
select col_is_unique(
  'public',
  'invoice_extraction_runs',
  array['job_id', 'payload_hash'],
  'invoice extraction payload hashes are unique per job'
);
select col_is_unique(
  'public',
  'invoice_line_candidates',
  array['invoice_id', 'line_index'],
  'invoice line candidates are unique per invoice line index'
);
select col_is_unique(
  'public',
  'invoices',
  array['organization_id', 'document_hash'],
  'invoice document hashes are unique per organization'
);

select * from finish();

rollback;
