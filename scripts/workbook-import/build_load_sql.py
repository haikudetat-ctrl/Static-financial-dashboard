"""Turn bundle.json into ordered SQL chunks for a hosted Supabase project.

    python build_load_sql.py <bundle.json> <out_dir> <org_id> <location_id> <actor_profile_id>

Each chunk is one transaction-sized statement block that embeds its data as
dollar-quoted JSON and raises if its row counts do not match the bundle, so a
partial or mistyped chunk fails instead of loading bad data. Chunks are
idempotent where the schema allows (upserts on natural keys).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys

P10_START = "2026-10-05"
P10_END = "2026-11-01"  # 4-week period; confirm and adjust in the app if different.
RECIPE_EFFECTIVE_FROM = "2026-09-01"
WORKBOOK_COST_DATE = "2026-09-29"
BASE_UNIT_TYPES = {"ml": "volume", "oz": "weight", "ea": "each"}


def rnd(value):
    if isinstance(value, float):
        return float(f"{value:.8g}")
    if isinstance(value, list):
        return [rnd(v) for v in value]
    return value


def j(data) -> str:
    text = json.dumps(rnd(data), separators=(",", ":"), ensure_ascii=False)
    assert "$j$" not in text
    return f"$j${text}$j$::jsonb"


def header(org: str, loc: str, actor: str) -> str:
    return (
        f"-- org {org} / location {loc} / actor {actor}\n"
    )


def main(bundle_path: str, out_dir: str, org: str, loc: str, actor: str) -> None:
    b = json.load(open(bundle_path))
    products = b["products"]
    by_code = {p["code"]: p for p in products}
    chunks: list[tuple[str, str]] = []

    # ------------------------------------------------ 01 categories, units, zones
    parents = sorted({p["parent_category"] for p in products if p["parent_category"]})
    children: dict[str, str | None] = {}
    for p in products:
        prev = children.setdefault(p["category"], p["parent_category"])
        assert prev == p["parent_category"], f"category {p['category']} has two parents"
    assert not (set(parents) & set(c for c, par in children.items() if par)), "name collision"
    cats = [[name, None] for name in parents if name not in children] + \
           [[c, par] for c, par in sorted(children.items(), key=lambda kv: (kv[1] or "", kv[0]))]

    units: dict[str, list] = {}
    for p in products:
        u = units.setdefault(p["count_unit"], [p["count_unit"], p["base_unit"], p["count_factor"]])
        assert u[1] == p["base_unit"] and abs(u[2] - p["count_factor"]) < 1e-6, p["count_unit"]
    unit_rows = list(units.values())
    zones = [[z["name"], z["area"], z["walk_order"]] for z in b["zones"]]

    chunks.append(("01_categories_units_zones", f"""
do $$
declare v_org uuid := '{org}'; v_loc uuid := '{loc}'; n int;
begin
  insert into public.inventory_categories(organization_id, name)
  select v_org, x->>0 from jsonb_array_elements({j([c for c in cats if c[1] is None])}) x
  on conflict (organization_id, name) do nothing;
  insert into public.inventory_categories(organization_id, name, parent_id)
  select v_org, x->>0, p.id from jsonb_array_elements({j([c for c in cats if c[1] is not None])}) x
  join public.inventory_categories p on p.organization_id = v_org and p.name = x->>1
  on conflict (organization_id, name) do update set parent_id = excluded.parent_id;
  select count(*) into n from public.inventory_categories where organization_id = v_org;
  if n < {len(cats)} then raise exception 'categories: % < {len(cats)}', n; end if;

  insert into public.units(organization_id, name, abbreviation, unit_type, base_unit_id, conversion_factor_to_base)
  select v_org, x->>0, x->>0, b.unit_type, b.id, (x->>2)::numeric
  from jsonb_array_elements({j(unit_rows)}) x
  join public.units b on b.organization_id = v_org and b.abbreviation = x->>1 and b.base_unit_id is null
  on conflict (organization_id, name) do update set conversion_factor_to_base = excluded.conversion_factor_to_base;
  select count(*) into n from public.units u, jsonb_array_elements({j([u[0] for u in unit_rows])}) x
  where u.organization_id = v_org and u.name = x #>> '{{}}';
  if n <> {len(unit_rows)} then raise exception 'units: % <> {len(unit_rows)}', n; end if;

  insert into public.storage_locations(organization_id, location_id, name, area, walk_order)
  select v_org, v_loc, x->>0, x->>1, (x->>2)::int from jsonb_array_elements({j(zones)}) x
  on conflict (organization_id, location_id, name) do update set area = excluded.area, walk_order = excluded.walk_order;
  select count(*) into n from public.storage_locations where organization_id = v_org and location_id = v_loc;
  if n < {len(zones)} then raise exception 'zones: % < {len(zones)}', n; end if;
end $$;
"""))

    # ------------------------------------------------------------ 02 items
    rows = [[p["code"], p["name"], p["category"], p["cogs_class"], p["base_unit"], p["count_unit"],
             p["tenths"], p["is_produced"], p["par"], p["notes"]] for p in products]
    for i in range(0, len(rows), 160):
        part = rows[i:i + 160]
        chunks.append((f"02_items_{i // 160 + 1}", f"""
do $$
declare v_org uuid := '{org}'; n int;
begin
  insert into public.inventory_items(organization_id, item_code, name, category_id, cogs_class,
    base_unit_id, count_unit_id, allows_tenths_counting, is_produced, is_purchased, par_quantity, notes)
  select v_org, x->>0, x->>1, c.id, x->>3, b.id, cu.id, (x->>6)::boolean, (x->>7)::boolean,
    not (x->>7)::boolean, (x->>8)::numeric, x->>9
  from jsonb_array_elements({j(part)}) x
  join public.inventory_categories c on c.organization_id = v_org and c.name = x->>2
  join public.units b on b.organization_id = v_org and b.abbreviation = x->>4 and b.base_unit_id is null
  join public.units cu on cu.organization_id = v_org and cu.name = x->>5
  on conflict (organization_id, item_code) where item_code is not null do update set
    name = excluded.name, category_id = excluded.category_id, cogs_class = excluded.cogs_class,
    base_unit_id = excluded.base_unit_id, count_unit_id = excluded.count_unit_id,
    allows_tenths_counting = excluded.allows_tenths_counting, is_produced = excluded.is_produced,
    is_purchased = excluded.is_purchased, par_quantity = excluded.par_quantity, notes = excluded.notes;
  get diagnostics n = row_count;
  if n <> {len(part)} then raise exception 'items: % <> {len(part)}', n; end if;
end $$;
"""))

    # ---------------------------------------------------------- 03 placements
    zone_index = {z["name"]: i for i, z in enumerate(b["zones"])}
    placements = [[zone_index[p[0]], p[1], p[2]] for p in b["placements"]]
    zone_names = [z["name"] for z in b["zones"]]
    chunks.append(("03_placements", f"""
do $$
declare v_org uuid := '{org}'; v_loc uuid := '{loc}'; n int;
begin
  insert into public.storage_location_items(organization_id, storage_location_id, inventory_item_id, sort_order)
  select v_org, s.id, i.id, (x->>2)::int from jsonb_array_elements({j(placements)}) x
  join public.storage_locations s on s.organization_id = v_org and s.location_id = v_loc
    and s.name = {j(zone_names)} ->> (x->>0)::int
  join public.inventory_items i on i.organization_id = v_org and i.item_code = x->>1
  on conflict (storage_location_id, inventory_item_id) do update set sort_order = excluded.sort_order;
  get diagnostics n = row_count;
  if n <> {len(placements)} then raise exception 'placements: % <> {len(placements)}', n; end if;

  update public.inventory_items i set default_storage_location_id = d.storage_location_id
  from (
    select distinct on (sli.inventory_item_id) sli.inventory_item_id, sli.storage_location_id
    from public.storage_location_items sli join public.storage_locations s on s.id = sli.storage_location_id
    where sli.organization_id = v_org and s.location_id = v_loc
    order by sli.inventory_item_id, s.walk_order, sli.sort_order
  ) d where d.inventory_item_id = i.id;
end $$;
"""))

    # ------------------------------------------- 04 vendors, SKU map, PLCB book
    sku = [[s["vendor"], s["vendor_code"], s["code"], s["count_units_per_pack"],
            s["count_units_per_pack"] * by_code[s["code"]]["count_factor"]] for s in b["sku_map"]]
    plcb = [[p["plcb_code"], p["name"], p["size_ml"], p["net_paid"], p["list_price"],
             p["order_date"], p["shipper"], p["code"]] for p in b["plcb_prices"]]
    for p in plcb:
        if p[7]:
            assert by_code[p[7]]["base_unit"] == "ml", p
    chunks.append(("04_vendors", f"""
do $$
declare v_org uuid := '{org}'; v_plcb uuid; n int;
begin
  insert into public.vendors(organization_id, name, vendor_type, normalized_name)
  values (v_org, 'PLCB', 'plcb', 'plcb')
  on conflict (organization_id, name) do update set vendor_type = 'plcb'
  returning id into v_plcb;

  update public.vendor_items vi set inventory_item_id = i.id,
    case_quantity = (x->>3)::numeric, base_quantity_per_purchase_unit = (x->>4)::numeric
  from jsonb_array_elements({j(sku)}) x, public.vendors v, public.inventory_items i
  where v.organization_id = v_org and v.name like (x->>0) || '%' and vi.vendor_id = v.id
    and lower(vi.vendor_product_code) = lower(x->>1)
    and i.organization_id = v_org and i.item_code = x->>2;
  get diagnostics n = row_count;
  if n <> {len(sku)} then raise exception 'sku map: % <> {len(sku)}', n; end if;

  create temp table _plcb on commit drop as select x from jsonb_array_elements({j(plcb)}) x;
  insert into public.vendor_items(organization_id, vendor_id, inventory_item_id, vendor_product_code,
    vendor_product_name, normalized_description, pack_size, base_quantity_per_purchase_unit, last_unit_cost, last_case_price)
  select v_org, v_plcb, i.id, x->>0, x->>1, lower(x->>1), (x->>2) || ' ml', (x->>2)::numeric,
    (x->>3)::numeric, (x->>3)::numeric
  from _plcb
  left join public.inventory_items i on i.organization_id = v_org and i.item_code = x->>7
  on conflict (vendor_id, vendor_product_code) do update set inventory_item_id = excluded.inventory_item_id,
    vendor_product_name = excluded.vendor_product_name, pack_size = excluded.pack_size,
    base_quantity_per_purchase_unit = excluded.base_quantity_per_purchase_unit,
    last_unit_cost = excluded.last_unit_cost, last_case_price = excluded.last_case_price;
  get diagnostics n = row_count;
  if n <> {len(plcb)} then raise exception 'plcb items: % <> {len(plcb)}', n; end if;

  insert into public.vendor_item_prices(organization_id, vendor_item_id, unit_price, effective_date)
  select v_org, vi.id, (x->>3)::numeric, (x->>5)::date
  from _plcb
  join public.vendor_items vi on vi.vendor_id = v_plcb and vi.vendor_product_code = x->>0
  where x->>5 is not null and not exists (
    select 1 from public.vendor_item_prices p where p.vendor_item_id = vi.id and p.effective_date = (x->>5)::date);
end $$;
"""))

    # ------------------------------------------------ 05 costs + P10 snapshots
    costs = []
    for p in products:
        if not p["cost_per_count"]:
            continue
        src = p["cost_source"]
        if src.startswith("PLCB"):
            source, vendor = "plcb_invoice", "PLCB"
        elif "invoice" in src.lower():
            source, vendor = "vendor_invoice", p["vendor"]
        elif "BATCHES" in src or p["is_produced"]:
            source, vendor = "recipe_rollup", None
        else:
            source, vendor = "workbook", None
        costs.append([p["code"], p["cost_per_count"], p["cost_date"] or WORKBOOK_COST_DATE,
                      source, vendor])
    chunks.append(("05_costs_period", f"""
do $$
declare v_org uuid := '{org}'; v_loc uuid := '{loc}'; v_actor uuid := '{actor}'; v_period uuid; n int;
  v_effective timestamptz := ('{P10_START}'::date + time '04:00') at time zone 'America/New_York';
begin
  create temp table _cost on commit drop as
  select i.id item_id, (x->>1)::numeric case_price, cu.conversion_factor_to_base factor, cu.name pack,
    (x->>2)::date eff, x->>3 src, x->>4 vendor
  from jsonb_array_elements({j(costs)}) x
  join public.inventory_items i on i.organization_id = v_org and i.item_code = x->>0
  join public.units cu on cu.id = i.count_unit_id;
  select count(*) into n from _cost;
  if n <> {len(costs)} then raise exception 'costs: % <> {len(costs)}', n; end if;
  insert into public.item_cost_history(organization_id, location_id, inventory_item_id, vendor_id,
    effective_date, case_price, base_unit_cost, base_quantity, pack_size_text, cost_source)
  select v_org, v_loc, c.item_id, v.id, c.eff, c.case_price, c.case_price / c.factor, c.factor, c.pack, c.src
  from _cost c
  left join public.vendors v on v.organization_id = v_org and c.vendor is not null and v.name like c.vendor || '%'
  where not exists (select 1 from public.item_cost_history h where h.inventory_item_id = c.item_id
    and h.effective_date = c.eff and h.cost_source = c.src);

  select id into v_period from public.inventory_periods
  where organization_id = v_org and location_id = v_loc and period_start = '{P10_START}';
  if v_period is null then
    insert into public.inventory_periods(organization_id, location_id, period_start, period_end, opened_by)
    values (v_org, v_loc, '{P10_START}', '{P10_END}', v_actor) returning id into v_period;
  end if;

  insert into public.inventory_item_cost_snapshots(inventory_item_id, inventory_period_id, weighted_average_cost, effective_at)
  select c.item_id, v_period, c.case_price / c.factor, v_effective from _cost c
  where not exists (select 1 from public.inventory_item_cost_snapshots s
    where s.inventory_item_id = c.item_id and s.inventory_period_id = v_period);
  select count(*) into n from public.inventory_item_cost_snapshots where inventory_period_id = v_period;
  if n <> {len(costs)} then raise exception 'snapshots: % <> {len(costs)}', n; end if;
end $$;
"""))

    # ------------------------------------------------------------ 06 recipes
    recs = [[r["name"], r["type"], r["output_code"], r["output_qty"], r["output_unit"], r["notes"]]
            for r in b["recipes"]]
    comps = [[r["name"], k, c["code"], c["recipe"], c["qty"], c["unit"], c["note"]]
             for r in b["recipes"] for k, c in enumerate(r["components"])]
    pos = [[p["item"], p["recipe"], p["menu"], p["group"]] for p in b["pos_map"] if p["recipe"]]
    chunks.append(("06_recipes", f"""
do $$
declare v_org uuid := '{org}'; v_actor uuid := '{actor}'; n int;
begin
  create temp table _rec on commit drop as select x from jsonb_array_elements({j(recs)}) x;
  insert into public.recipes(organization_id, name, description, recipe_type, output_inventory_item_id, created_by)
  select v_org, x->>0, x->>5, (x->>1)::public.recipe_type, i.id, v_actor
  from _rec
  left join public.inventory_items i on i.organization_id = v_org and i.item_code = x->>2
  on conflict (organization_id, name) do update set description = excluded.description,
    output_inventory_item_id = excluded.output_inventory_item_id;
  get diagnostics n = row_count;
  if n <> {len(recs)} then raise exception 'recipes: % <> {len(recs)}', n; end if;

  insert into public.recipe_versions(recipe_id, version_number, effective_from, output_quantity, output_unit_id,
    status, notes, created_by, activated_by, activated_at)
  select r.id, 1, '{RECIPE_EFFECTIVE_FROM}', (x->>3)::numeric, u.id, 'active', 'Imported from the Static! workbook.',
    v_actor, v_actor, now()
  from _rec
  join public.recipes r on r.organization_id = v_org and r.name = x->>0
  join public.units u on u.organization_id = v_org and u.abbreviation = x->>4
  on conflict (recipe_id, version_number) do nothing;

  delete from public.recipe_version_components c using public.recipe_versions v, public.recipes r
  where c.recipe_version_id = v.id and v.recipe_id = r.id and r.organization_id = v_org and v.version_number = 1
    and v.notes = 'Imported from the Static! workbook.';
  insert into public.recipe_version_components(recipe_version_id, component_inventory_item_id, component_recipe_id,
    quantity, unit_id, line_order, notes)
  select v.id, i.id, cr.id, (x->>4)::numeric, u.id, (x->>1)::int, x->>6
  from jsonb_array_elements({j(comps)}) x
  join public.recipes r on r.organization_id = v_org and r.name = x->>0
  join public.recipe_versions v on v.recipe_id = r.id and v.version_number = 1
  join public.units u on u.organization_id = v_org and u.abbreviation = x->>5
  left join public.inventory_items i on i.organization_id = v_org and i.item_code = x->>2
  left join public.recipes cr on cr.organization_id = v_org and cr.name = x->>3;
  get diagnostics n = row_count;
  if n <> {len(comps)} then raise exception 'components: % <> {len(comps)}', n; end if;

  -- Toast "All Levels" exports carry no item GUID; import-toast keys those rows
  -- as 'name:' || lower(item name), which is what these mappings match.
  insert into public.recipe_menu_item_mappings(organization_id, recipe_id, source_system, external_item_guid,
    external_item_name, created_by)
  select v_org, r.id, 'toast', 'name:' || lower(btrim(x->>0)), x->>0, v_actor
  from jsonb_array_elements({j(pos)}) x
  join public.recipes r on r.organization_id = v_org and r.name = x->>1
  on conflict (organization_id, source_system, external_item_guid) do update set recipe_id = excluded.recipe_id;
  get diagnostics n = row_count;
  if n <> {len(pos)} then raise exception 'pos map: % <> {len(pos)}', n; end if;
end $$;
"""))

    # ------------------------------------------------------------- 07 review
    review = [[r["type"], r.get("code"), r.get("recipe"), r["title"], r["detail"], r.get("context", {})]
              for r in b["review"]]
    chunks.append(("07_review", f"""
do $$
declare v_org uuid := '{org}'; v_loc uuid := '{loc}'; n int;
begin
  insert into public.catalog_review_items(organization_id, location_id, inventory_item_id, recipe_id,
    issue_type, title, detail, source_context)
  select v_org, v_loc, i.id, r.id, x->>0, x->>3, x->>4, x->5
  from jsonb_array_elements({j(review)}) x
  left join public.inventory_items i on i.organization_id = v_org and i.item_code = x->>1
  left join public.recipes r on r.organization_id = v_org and r.name = x->>2
  where not exists (select 1 from public.catalog_review_items c
    where c.organization_id = v_org and c.title = x->>3);

  -- Invoices imported from undated order exports (stored as 1970-01-01).
  insert into public.catalog_review_items(organization_id, location_id, issue_type, title, detail, source_context)
  select v_org, v_loc, 'missing_invoice_date', 'Date ' || v.name || ' invoice ' || i.invoice_number,
    'Imported from an order export with no date, so it counts toward no period. Total $' || round(i.total_amount, 2)
      || '. The vendor portal order history shows the delivery date.',
    jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number)
  from public.invoices i join public.vendors v on v.id = i.vendor_id
  where i.organization_id = v_org and i.invoice_date < '2000-01-01'
    and not exists (select 1 from public.catalog_review_items c
      where c.organization_id = v_org and c.source_context->>'invoice_id' = i.id::text);
end $$;
"""))

    os.makedirs(out_dir, exist_ok=True)
    for name, sql in chunks:
        with open(os.path.join(out_dir, f"{name}.sql"), "w") as f:
            f.write(header(org, loc, actor) + sql.strip() + "\n")
        print(f"{name}.sql {len(sql):>7} bytes")

    fingerprint = "\n".join(f"{p['code']}|{p['name']}" for p in sorted(products, key=lambda p: int(p["code"])))
    print("items md5", hashlib.md5(fingerprint.encode()).hexdigest())


if __name__ == "__main__":
    main(*sys.argv[1:6])
