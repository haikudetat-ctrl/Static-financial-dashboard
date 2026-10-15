-- Suggested items for unmatched invoice lines, and creating an item from a line.
--
-- Lines that miss the exact code/name/alias match on arrival still usually
-- have an obvious item: the vendor sells it under a sibling code (KETCHUPSK1
-- vs KETCHUPSK1PC, houora vs houorah) or the item's name is spelled out in
-- the vendor's description ("citrus, orange cs" -> Oranges). This scores
-- every active, purchased item against an unmatched line on two signals:
--
--   name  share of the item's name words (or one of its aliases or vendor
--         product names) that appear in the line's description
--   code  shared leading characters with a code this vendor already sells
--         the item under
--
-- and damps items in a cost class this vendor has never supplied, so a food
-- vendor's "pears" line does not suggest Pear Brandy. Produced items (syrups,
-- batches) are never suggested: invoices buy ingredients, not preps.
--
-- create_item_from_invoice_line() makes the item, its vendor item (with how
-- many count units one invoice unit holds, which receiving needs), and
-- matches the line, in one transaction.

create or replace function public.invoice_match_tokens(source text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct stemmed), '{}')
  from (
    select case
        when word ~ 'ies$' and length(word) > 4 then regexp_replace(word, 'ies$', 'y')
        when word ~ '[^s]s$' and length(word) > 3 then regexp_replace(word, 's$', '')
        else word
      end as stemmed
    from regexp_split_to_table(
      regexp_replace(lower(coalesce(source, '')), '[^a-z0-9]+', ' ', 'g'), ' '
    ) as word
    where length(word) >= 3
      and word !~ '[0-9]'
      and word not in (
        'and', 'the', 'for', 'with', 'usa', 'ita', 'tha', 'mex', 'fra', 'lcl',
        'each', 'case', 'ctn', 'can', 'cans', 'btl', 'bottle', 'pack', 'pkg',
        'gal', 'gallon', 'half', 'quart', 'liter', 'ltr', 'lbs', 'flat', 'bunch',
        'approx', 'aprx', 'org', 'fz'
      )
  ) words
  where stemmed <> '';
$$;

create or replace function public.invoice_code_affinity(code_a text, code_b text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  -- Shared leading characters over the longer code; under 3 shared is noise.
  select case when shared >= 3 then round(shared::numeric / longest, 3) else 0 end
  from (
    select coalesce(max(position_index), 0) as shared,
      greatest(length(a), length(b)) as longest
    from (select lower(btrim(coalesce(code_a, ''))) as a, lower(btrim(coalesce(code_b, ''))) as b) codes
    left join lateral (
      select n as position_index
      from generate_series(1, least(length(a), length(b))) n
      where left(a, n) = left(b, n)
    ) prefix on true
    group by a, b
  ) scored
  where longest > 0;
$$;

create or replace function public.suggest_invoice_line_items(target_invoice_id uuid)
returns table (
  invoice_line_id uuid,
  inventory_item_id uuid,
  item_name text,
  item_code text,
  score numeric,
  reason text,
  rank integer
)
language sql
stable
set search_path = ''
as $$
  with invoice as (
    select i.id, i.organization_id, i.vendor_id
    from public.invoices i
    where i.id = target_invoice_id
  ),
  lines as (
    select l.id, nullif(btrim(l.vendor_product_code), '') as code,
      public.invoice_match_tokens(l.product_description) as tokens
    from public.invoice_lines l
    join invoice on invoice.id = l.invoice_id
    where l.inventory_item_id is null
  ),
  vendor_classes as (
    select array_agg(distinct item.cogs_class) as classes
    from public.vendor_items vi
    join invoice on invoice.vendor_id = vi.vendor_id
    join public.inventory_items item on item.id = vi.inventory_item_id
    where item.cogs_class is not null
  ),
  candidates as (
    select item.id, item.name, item.item_code, item.cogs_class
    from public.inventory_items item
    join invoice on invoice.organization_id = item.organization_id
    where item.active and not coalesce(item.is_produced, false)
  ),
  -- Every name an item goes by: its own, its aliases, any vendor's product name.
  names as (
    select c.id, c.name as label, public.invoice_match_tokens(c.name) as tokens
    from candidates c
    union all
    select c.id, a.alias, public.invoice_match_tokens(a.alias)
    from candidates c
    join public.inventory_item_aliases a on a.inventory_item_id = c.id
    union all
    select c.id, vi.vendor_product_name, public.invoice_match_tokens(vi.vendor_product_name)
    from candidates c
    join public.vendor_items vi on vi.inventory_item_id = c.id
  ),
  name_scores as (
    select l.id as line_id, n.id as item_id,
      max(
        (select count(*) from unnest(n.tokens) t where t = any(l.tokens))::numeric
          / cardinality(n.tokens)
      ) as name_score
    from lines l
    join names n on cardinality(n.tokens) > 0 and n.tokens && l.tokens
    group by l.id, n.id
  ),
  code_scores as (
    select l.id as line_id, vi.inventory_item_id as item_id,
      max(public.invoice_code_affinity(l.code, vi.vendor_product_code)) as code_score,
      (array_agg(vi.vendor_product_code order by
        public.invoice_code_affinity(l.code, vi.vendor_product_code) desc))[1] as sibling_code
    from lines l
    join invoice on true
    join public.vendor_items vi on vi.vendor_id = invoice.vendor_id
      and vi.inventory_item_id is not null
      and nullif(btrim(vi.vendor_product_code), '') is not null
    where l.code is not null
    group by l.id, vi.inventory_item_id
    having max(public.invoice_code_affinity(l.code, vi.vendor_product_code)) > 0
  ),
  scored as (
    select coalesce(n.line_id, c.line_id) as line_id,
      coalesce(n.item_id, c.item_id) as item_id,
      coalesce(n.name_score, 0) as name_score,
      coalesce(c.code_score, 0) as code_score,
      c.sibling_code
    from name_scores n
    full join code_scores c on c.line_id = n.line_id and c.item_id = n.item_id
  ),
  ranked as (
    select s.line_id, cand.id as item_id, cand.name, cand.item_code,
      round(
        (0.65 * s.name_score + 0.35 * s.code_score)
          * case
              when vc.classes is null or cand.cogs_class is null then 1
              when cand.cogs_class = any(vc.classes) then 1
              else 0.7
            end,
        3
      ) as score,
      case
        when s.code_score >= 0.5 and s.name_score >= 0.5
          then 'Name matches, and sold under code ' || s.sibling_code
        when s.code_score >= 0.5 then 'Sold under a similar code, ' || s.sibling_code
        else 'Name matches the description'
      end as reason
    from scored s
    join candidates cand on cand.id = s.item_id
    cross join vendor_classes vc
  )
  select r.line_id, r.item_id, r.name, r.item_code, r.score, r.reason,
    rank_number::integer
  from (
    select r.*, row_number() over (partition by r.line_id order by r.score desc, r.name) as rank_number
    from ranked r
    where r.score >= 0.5
  ) r
  where rank_number <= 3
  order by r.line_id, rank_number;
$$;

create or replace function public.create_item_from_invoice_line(
  target_line_id uuid,
  item_name text,
  target_category_id uuid,
  target_cogs_class text,
  target_count_unit_id uuid,
  count_units_per_invoice_unit numeric
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  line public.invoice_lines%rowtype;
  invoice public.invoices%rowtype;
  count_unit public.units%rowtype;
  new_item_id uuid;
  clean_name text := btrim(coalesce(item_name, ''));
  clean_code text;
begin
  select * into line from public.invoice_lines where id = target_line_id;
  if line.id is null then raise exception 'Invoice line not found'; end if;
  select * into invoice from public.invoices where id = line.invoice_id for update;
  if not public.is_organization_manager(invoice.organization_id) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;
  if invoice.status in ('posted', 'rejected') then
    raise exception 'This invoice is already %', invoice.status;
  end if;
  if clean_name = '' then raise exception 'Name the item'; end if;
  if not (count_units_per_invoice_unit > 0) then
    raise exception 'Say how many count units one invoice unit holds';
  end if;
  if exists (
    select 1 from public.inventory_items item
    where item.organization_id = invoice.organization_id
      and item.active and lower(item.name) = lower(clean_name)
  ) then
    raise exception 'An item named % already exists. Match the line to it instead.', clean_name;
  end if;

  select * into count_unit from public.units
  where id = target_count_unit_id and organization_id = invoice.organization_id;
  if count_unit.id is null or not (count_unit.conversion_factor_to_base > 0) then
    raise exception 'Pick a count unit with a known size';
  end if;

  insert into public.inventory_items (
    organization_id, name, category_id, cogs_class, base_unit_id, count_unit_id,
    is_purchased, is_produced, active
  ) values (
    invoice.organization_id, clean_name, target_category_id, target_cogs_class,
    coalesce(count_unit.base_unit_id, count_unit.id), count_unit.id, true, false, true
  ) returning id into new_item_id;

  clean_code := nullif(btrim(line.vendor_product_code), '');
  if clean_code is not null then
    insert into public.vendor_items (
      organization_id, vendor_id, inventory_item_id, vendor_product_code,
      vendor_product_name, pack_size, normalized_description, case_quantity,
      base_quantity_per_purchase_unit, is_preferred, created_from_invoice_line_id
    ) values (
      invoice.organization_id, invoice.vendor_id, new_item_id, clean_code,
      line.product_description, line.pack_size, lower(btrim(line.product_description)),
      count_units_per_invoice_unit,
      count_units_per_invoice_unit * count_unit.conversion_factor_to_base, true, line.id
    )
    on conflict (vendor_id, vendor_product_code) do update set
      inventory_item_id = excluded.inventory_item_id,
      vendor_product_name = excluded.vendor_product_name,
      pack_size = excluded.pack_size,
      case_quantity = excluded.case_quantity,
      base_quantity_per_purchase_unit = excluded.base_quantity_per_purchase_unit;
  else
    -- No vendor code to key on: still record the pack size so receiving works.
    insert into public.vendor_items (
      organization_id, vendor_id, inventory_item_id, vendor_product_name, pack_size,
      normalized_description, case_quantity, base_quantity_per_purchase_unit,
      is_preferred, created_from_invoice_line_id
    ) values (
      invoice.organization_id, invoice.vendor_id, new_item_id, line.product_description,
      line.pack_size, lower(btrim(line.product_description)), count_units_per_invoice_unit,
      count_units_per_invoice_unit * count_unit.conversion_factor_to_base, true, line.id
    );
  end if;

  -- A manual match: the line trigger keeps it and learns the alias.
  update public.invoice_lines
  set inventory_item_id = new_item_id, match_source = 'manual'
  where id = line.id;

  return new_item_id;
end;
$$;

revoke all on function public.invoice_match_tokens(text) from public, anon;
revoke all on function public.invoice_code_affinity(text, text) from public, anon;
revoke all on function public.suggest_invoice_line_items(uuid) from public, anon;
revoke all on function public.create_item_from_invoice_line(uuid, text, uuid, text, uuid, numeric)
  from public, anon;
grant execute on function public.invoice_match_tokens(text) to authenticated, service_role;
grant execute on function public.invoice_code_affinity(text, text) to authenticated, service_role;
grant execute on function public.suggest_invoice_line_items(uuid) to authenticated, service_role;
grant execute on function public.create_item_from_invoice_line(uuid, text, uuid, text, uuid, numeric)
  to authenticated, service_role;
