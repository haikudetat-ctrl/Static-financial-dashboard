"""Normalize the Static! inventory workbook into an import bundle.

The workbook is authored with formulas but saved without cached values, so it
is recalculated first with the `formulas` package (LibreOffice is not needed).

    pip install openpyxl formulas
    python extract_static_workbook.py <workbook.xlsx> <out_dir>

Writes <out_dir>/bundle.json. `build_load_sql.py` turns the bundle into SQL.
Every judgment call made while normalizing is recorded as a review item so it
shows up on the in-app review list instead of being silently assumed.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime

import openpyxl

ML_PER_FL_OZ = 29.5735
ML_PER_GAL = 3785.4118
GAL_TOLERANCE = 1.0

CLASS_MAP = {
    "Liquor": "liquor",
    "Wine": "wine",
    "Beer": "beer",
    "NA Bev": "na_bev",
    "Bar Consumables": "bar_consumables",
    "Food": "food",
}

# Workbook rows 342-356 are walk-in infusions, 357-368 batched cocktails; the
# workbook leaves their category blank.
INFUSION_CODES = range(342, 357)
BATCHED_COCKTAIL_CODES = range(357, 369)
# House blends and infusions are made in house, not bought.
PRODUCED_CODES = set(range(151, 178)) | set(INFUSION_CODES) | set(BATCHED_COCKTAIL_CODES)

# BATCHES tab: blend name -> output product, and component label -> product.
# Component labels on that tab are short names, so the mapping is explicit.
BLEND_OUTPUTS = {
    "House Vodka": 151, "House Gin": 152, "House White Rum": 153, "House Aged Rum": 154,
    "House Dark Rum": 155, "House Tequila Blanco": 156, "House Tequila Repo": 157,
    "House Mezcal": 158, "House Bourbon": 159, "House Rye": 160, "House Scotch": 161,
    "House Brandy": 162, "House Triple": 163, "House Aperitif": 164, "House Bitter": 165,
    "House Amaro": 166, "House Pisco": 167, "Hoagie Batch": 176,
}
BLEND_COMPONENTS = {
    ("House Vodka", "Gordon's"): 116, ("House Vodka", "Hidden Still"): 118,
    ("House Gin", "5 O'clock"): 119, ("House Gin", "Gordon's"): 121,
    ("House White Rum", "Diamond White"): 122, ("House White Rum", "Hidden Still"): 124,
    ("House Aged Rum", "El Dorado 5 yr"): 125, ("House Aged Rum", "Don Q Gold"): 126,
    ("House Dark Rum", "Gosling's"): 127, ("House Dark Rum", "Diamond Reserve Black"): 128,
    ("House Tequila Blanco", "Casco Viejo Tequila Blanco"): 129,
    ("House Tequila Blanco", "Arette Blanco"): 130,
    ("House Tequila Repo", "Casco Viejo Tequila Reposado"): 131,
    ("House Tequila Repo", "Arette Reposado"): 132,
    ("House Mezcal", "Banhez"): 133, ("House Mezcal", "Catedral"): 134,
    ("House Bourbon", "Evan Williams Bonded"): 135, ("House Bourbon", "Ancient Age"): 136,
    ("House Rye", "Dickel"): 137, ("House Rye", "Hazel Baker"): 138,
    ("House Scotch", "Cutty Sark"): 139, ("House Scotch", "Wee Beastie"): 140,
    ("House Brandy", "Laird's Applejack"): 141, ("House Brandy", "Salignac"): 142,
    ("House Triple", "Hidden Still"): 143, ("House Triple", "JM Shrub"): 144,
    ("House Aperitif", "Arancia"): 145, ("House Aperitif", "Contratto"): 146,
    ("House Bitter", "Faccia Bruto"): 147, ("House Bitter", "Contratto"): 148,
    ("House Amaro", "Meletti"): 149, ("House Amaro", "Lucano"): 150,
    ("House Pisco", "Control C"): 21, ("House Pisco", "Capel"): 20,
    ("Hoagie Batch", "Banhez"): 133, ("Hoagie Batch", "Arette Reposado"): 132,
}
# BATCH RECIPES / DRINK COSTING batch names that differ from the product name.
BATCH_OUTPUT_ALIASES = {"A Decade of Blue": "Decade of Blue"}

# House prep that recipes and the shelf walk need but PRODUCTS does not carry.
# (code, name, count container label, container ml)
EIGHT_OZ = 236.588
QUART = 946.353
PREP_ITEMS = [
    ("2001", "Simple Syrup", "8 oz bottle", EIGHT_OZ),
    ("2002", "Demerara Syrup", "8 oz bottle", EIGHT_OZ),
    ("2003", "Agave Syrup", "8 oz bottle", EIGHT_OZ),
    ("2004", "Honey Syrup", "8 oz bottle", EIGHT_OZ),
    ("2005", "Ginger Syrup", "8 oz bottle", EIGHT_OZ),
    ("2006", "Elderflower Syrup", "8 oz bottle", EIGHT_OZ),
    ("2007", "Raspberry Syrup", "8 oz bottle", EIGHT_OZ),
    ("2008", "Melon Syrup", "8 oz bottle", EIGHT_OZ),
    ("2009", "Cran Orange Syrup", "8 oz bottle", EIGHT_OZ),
    ("2010", "Pocari Watermelon Syrup", "8 oz bottle", EIGHT_OZ),
    ("2011", "Lemon Oleo", "8 oz bottle", EIGHT_OZ),
    ("2012", "Peach Oleo", "8 oz bottle", EIGHT_OZ),
    ("2013", "Olive Brine", "8 oz bottle", EIGHT_OZ),
    ("2014", "Espresso", "8 oz bottle", EIGHT_OZ),
    ("2015", "Saline Solution", "8 oz bottle", EIGHT_OZ),
    ("2016", "MSG Solution", "8 oz bottle", EIGHT_OZ),
    ("2017", "Clove Tincture", "8 oz bottle", EIGHT_OZ),
    ("2018", "Orange Bitters", "8 oz bottle", EIGHT_OZ),
    ("2019", "Angostura Bitters", "8 oz bottle", EIGHT_OZ),
    ("2020", "Acid Adjusted Water", "quart container", QUART),
    ("2021", "Peach Vanilla Cream", "quart container", QUART),
    ("2022", "Egg White", "quart container", QUART),
    ("2023", "Guava Punch", "quart container", QUART),
    ("2024", "Bubbly Bamboo Batch", "quart container", QUART),
]
PREP_BY_NAME = {name.lower(): code for code, name, _, _ in PREP_ITEMS}

# Recipe ingredient labels without a product ID -> prep item code.
INGREDIENT_ALIASES = {
    "olive brine": "2013", "peach oleo": "2012", "melon syrup": "2008",
    "cran orange syrup": "2009", "pocari watermelon syrup": "2010", "simple syrup": "2001",
    "acid adjusted water (20% of weight)": "2020", "orange bitters (3 dash)": "2018",
    "msg (3 drops)": "2016", "saline (4 drops)": "2015", "peach vanilla cream topper": "2021",
    "raspberry": "2007", "egg white": "2022", "clove tincture (1 dash)": "2017",
    "guava punch": "2023", "angostura (7 dash)": "2019", "evoo (3 drops)": "1053",
    "verdejo": "376",
}
# Ingredient mappings that are a guess and must be confirmed by a person.
ASSUMED_INGREDIENTS = {
    "raspberry": "Club Static lists 'Raspberry 0.75 oz'; mapped to Raspberry Syrup.",
}

NEW_BOTTLES = [
    # (code, name, category, class, size_ml, note)
    ("376", "Verdejo (batch wine)", "White", "Wine", 750.0,
     "Added for the Barbara Rabarbaro batch; confirm the exact wine and its cost."),
]

POS_POUR_UNIT = "fl oz"


def num(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def text(value):
    if value is None:
        return ""
    return str(value).strip()


def parse_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    s = text(value)
    for fmt in ("%b %d, %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def fmt_qty(value: float) -> str:
    return f"{round(value, 3):g}"


def bottle_container(size: float, unit: str, count_as: str) -> tuple[str, float]:
    """Return (container label, ml) for a bottle/can product."""
    if unit == "oz":
        ml = size * ML_PER_FL_OZ
        label = f"{fmt_qty(size)} fl oz"
    elif unit == "gal":
        ml = size * ML_PER_GAL
        label = f"{fmt_qty(size)} gal"
    else:
        ml = size
        label = f"{fmt_qty(size / 1000)} L" if size >= 1000 else f"{fmt_qty(size)} ml"
    if abs(ml - EIGHT_OZ) < 0.01:
        return "8 oz decant", ml
    if unit == "gal":
        noun = "jug"
    elif count_as.lower() == "each" and unit == "oz":
        noun = "can"
    else:
        noun = "bottle"
    return f"{label} {noun}", ml


def category_path(category: str, cls: str, code: int) -> tuple[str | None, str]:
    if code in INFUSION_CODES:
        return "House Made", "Infusions"
    if code in BATCHED_COCKTAIL_CODES:
        return "House Made", "Batched Cocktails"
    if not category:
        return None, "Uncategorized"
    if "|" in category:
        parent, child = [p.strip() for p in category.split("|", 1)]
        return parent, child
    if cls == "Beer" and category != "Beer":
        return "Beer", category
    if cls == "Wine" and category != "Wine":
        return "Wine", category
    return None, category


def main(path: str, out_dir: str) -> None:
    wb = openpyxl.load_workbook(path, data_only=True)
    review: list[dict] = []

    # ---------------------------------------------------------------- products
    products: dict[str, dict] = {}
    name_to_code: dict[str, str] = {}
    ws = wb["PRODUCTS"]
    for r in ws.iter_rows(min_row=5, values_only=True):
        code_num = r[0]
        if not isinstance(code_num, (int, float)):
            continue
        code_num = int(code_num)
        code = str(code_num)
        name, category, count_as = text(r[1]), text(r[2]), text(r[3])
        size, unit = num(r[4]), text(r[5])
        cost = num(r[7])
        cls = text(r[22]) or "Liquor"
        parent, child = category_path(category, cls, code_num)
        # Workbook "no cost" warnings are superseded by the review list, and
        # many predate the PLCB repricing that later supplied a cost.
        notes = [n for n in (text(r[15]),) if n and not n.startswith("⚠")]
        if code_num < 1001:
            container, ml = bottle_container(size or 750.0, unit or "ml", count_as)
            base, per_count = "ml", ml
            count_label = container
        else:
            base = {"wt oz": "oz", "ml": "ml"}.get(unit, "ea")
            per_count = size or 1.0
            count_label = f"{count_as} [{fmt_qty(per_count)} {base}]"
            flags = text(r[27])
            if flags:
                notes.append(f"Invoice flags: {flags}")
        products[code] = {
            "code": code,
            "name": name,
            "parent_category": parent,
            "category": child,
            "cogs_class": CLASS_MAP[cls],
            "base_unit": base,
            "count_unit": count_label,
            "count_factor": round(per_count, 6),
            "tenths": count_as.lower() == "tenths",
            "is_produced": code_num in PRODUCED_CODES,
            "cost_per_count": round(cost, 6) if cost else None,
            "cost_source": text(r[17]),
            "cost_date": parse_date(r[18]),
            "plcb_code": text(r[16]) or None,
            "par": num(r[12]),
            "vendor": text(r[23]) or None,
            "vendor_code": text(r[24]) or None,
            "notes": " · ".join(notes),
        }
        name_to_code[name.lower()] = code
        if not cost and code_num not in PRODUCED_CODES:
            review.append({
                "type": "missing_cost", "code": code,
                "title": f"No cost for {name}",
                "detail": "The workbook has no bottle or invoice cost, so this item values at $0 "
                          "until a cost is entered or an invoice posts.",
            })

    for code, name, category, cls, ml, note in NEW_BOTTLES:
        container, _ = bottle_container(ml, "ml", "Tenths")
        products[code] = {
            "code": code, "name": name, "parent_category": "Wine", "category": category,
            "cogs_class": CLASS_MAP[cls], "base_unit": "ml", "count_unit": container,
            "count_factor": ml, "tenths": True, "is_produced": False,
            "cost_per_count": None, "cost_source": "", "cost_date": None, "plcb_code": None,
            "par": None, "vendor": None, "vendor_code": None, "notes": note,
        }
        name_to_code[name.lower()] = code
        review.append({"type": "missing_cost", "code": code, "title": f"No cost for {name}",
                       "detail": note})

    for code, name, label, ml in PREP_ITEMS:
        products[code] = {
            "code": code, "name": name, "parent_category": "House Made", "category": "House Prep",
            "cogs_class": "bar_consumables", "base_unit": "ml", "count_unit": label,
            "count_factor": ml, "tenths": True, "is_produced": True,
            "cost_per_count": None, "cost_source": "", "cost_date": None, "plcb_code": None,
            "par": None, "vendor": None, "vendor_code": None,
            "notes": "House prep added during the workbook import.",
        }
        review.append({
            "type": "missing_recipe", "code": code, "title": f"Add a recipe or cost for {name}",
            "detail": "House prep has no recipe yet, so anything that uses it costs it at $0.",
        })

    # --------------------------------------------------- locations + shelf walk
    setup = wb["SETUP"]
    zones: list[dict] = []
    in_list = False
    for r in setup.iter_rows(values_only=True):
        first = text(r[0])
        if first == "Location" and text(r[1]) == "Area":
            in_list = True
            continue
        if in_list:
            if first.startswith("Rewrite this list"):
                break
            if not first:
                continue
            zones.append({"name": first, "area": text(r[1]) if first != "UNASSIGNED" else ""})
    for i, z in enumerate(zones, start=1):
        if z["name"] == "UNASSIGNED":
            z["name"] = "Unassigned"
            z["area"] = "Parking lot"
        z["walk_order"] = i * 10

    zone_names = {z["name"] for z in zones}
    placements: list[list] = []
    seen = set()
    count_ws = wb["COUNT"]
    unassigned_seq = 0
    for r in count_ws.iter_rows(min_row=5, values_only=True):
        loc, seq, code_num = text(r[0]), r[1], r[2]
        if not isinstance(code_num, (int, float)):
            continue
        loc = "Unassigned" if loc == "UNASSIGNED" else loc
        if loc not in zone_names:
            continue
        code = str(int(code_num))
        if code not in products or (loc, code) in seen:
            continue
        seen.add((loc, code))
        if isinstance(seq, (int, float)):
            order = int(seq)
        else:
            unassigned_seq += 1
            order = 1000 + unassigned_seq
        placements.append([loc, code, order])

    needs = wb["NEEDS MAPPING"]
    for r in needs.iter_rows(min_row=5, values_only=True):
        loc, seq, recorded = text(r[0]), r[1], text(r[2])
        if not recorded:
            continue
        prep_code = PREP_BY_NAME.get(recorded.lower())
        if prep_code:
            placements.append([loc, prep_code, int(seq) if isinstance(seq, (int, float)) else 999])
            continue
        review.append({
            "type": "unmatched_count_item", "code": None,
            "title": f"Match '{recorded}' ({text(r[3])})",
            "detail": f"{text(r[4])} Recorded at {loc}, position {seq}. "
                      "Map it to an existing product or add a new one, then place it on the shelf.",
            "context": {"location": loc, "seq": seq, "recorded_item": recorded,
                        "container": text(r[3])},
        })

    # An item on a real shelf is not also parked in Unassigned; an item on no
    # shelf at all still needs a place to be counted.
    shelved = {p[1] for p in placements if p[0] != "Unassigned"}
    placements = [p for p in placements if p[0] != "Unassigned" or p[1] not in shelved]
    placed = {p[1] for p in placements}
    for code in sorted((c for c in products if c not in placed), key=int):
        unassigned_seq += 1
        placements.append(["Unassigned", code, 1000 + unassigned_seq])

    # ------------------------------------------------------------- vendors
    sku_map = []
    for r in wb["SKU MAP"].iter_rows(min_row=5, values_only=True):
        vendor, code, prod = text(r[0]), text(r[1]), r[4]
        if not vendor or not code or not isinstance(prod, (int, float)):
            continue
        sku_map.append({"vendor": vendor, "vendor_code": code, "code": str(int(prod)),
                        "count_units_per_pack": num(r[6]) or 1.0})

    plcb_codes = {p["plcb_code"]: p["code"] for p in products.values() if p["plcb_code"]}
    plcb = []
    for r in wb["PLCB PRICES"].iter_rows(min_row=5, values_only=True):
        code = text(r[0])
        if not code or not re.match(r"^\d+$", code):
            continue
        plcb.append({
            "plcb_code": code, "name": text(r[1]), "size_ml": num(r[2]),
            "net_paid": num(r[3]), "list_price": num(r[4]),
            "order_date": parse_date(r[6]), "shipper": text(r[7]),
            "code": plcb_codes.get(code),
        })

    # ------------------------------------------------------------- recipes
    recipes: list[dict] = []

    def ingredient_code(label: str, source) -> tuple[str | None, str | None]:
        """Return (item code, recipe name) for a recipe ingredient."""
        if isinstance(source, (int, float)):
            return str(int(source)), None
        if isinstance(source, str) and source.strip():
            return None, source.strip()
        key = label.strip().lower()
        return INGREDIENT_ALIASES.get(key), None

    # House blends (BATCHES)
    current = None
    for r in wb["BATCHES"].iter_rows(min_row=5, values_only=True):
        label = r[0]
        if not label:
            continue
        if not str(label).startswith("   "):
            name = text(label)
            if name not in BLEND_OUTPUTS:
                current = None
                continue
            current = {"name": name, "type": "batch", "output_code": str(BLEND_OUTPUTS[name]),
                       "output_qty": num(r[6]), "output_unit": "ml", "components": [],
                       "notes": "House blend from the BATCHES tab."}
            recipes.append(current)
            continue
        if current is None:
            continue
        comp = text(label)
        code = BLEND_COMPONENTS.get((current["name"], comp))
        parts, container = num(r[3]), num(r[4])
        current["components"].append({"code": str(code), "recipe": None,
                                      "qty": parts * container, "unit": "ml", "note": comp})

    # Infusions and batched cocktails (BATCH RECIPES)
    br = wb["BATCH RECIPES"]
    rows = list(br.iter_rows(min_row=1, values_only=True))
    section = None
    for r in rows:
        first = text(r[0])
        if first.startswith("1 — INFUSIONS"):
            section = "infusions"
            continue
        if first.startswith("2 — BATCHED"):
            section = "batches"
            current = None
            continue
        if section == "infusions" and first and first not in ("Infusion",) and not first.startswith("Yield"):
            base = r[1]
            out = name_to_code.get(first.lower())
            if not out:
                continue
            comps = []
            if isinstance(base, (int, float)):
                comps.append({"code": str(int(base)), "recipe": None, "qty": 1.0, "unit": "gal",
                              "note": text(r[2])})
            recipes.append({"name": first, "type": "batch", "output_code": out,
                            "output_qty": 1.0, "output_unit": "gal", "components": comps,
                            "notes": text(r[9])})
            review.append({"type": "unverified_assumption", "code": out, "recipe": first,
                           "title": f"Confirm the {first} recipe",
                           "detail": f"{text(r[9])} Flavouring cost is not included yet."})
        elif section == "batches":
            if first in ("Cocktail / ingredient",) or not first:
                continue
            if not str(r[0]).startswith("   "):
                if first.startswith(("Static Cosmo has", "Peaches & Cream:", "Bleat Punch")):
                    continue
                out_name = BATCH_OUTPUT_ALIASES.get(first, first)
                out = name_to_code.get(out_name.lower()) or PREP_BY_NAME.get(f"{first} batch".lower())
                current = {"name": f"{first} (batch)", "type": "batch", "output_code": out,
                           "output_qty": num(r[3]), "output_unit": "ml", "components": [],
                           "notes": "Batched cocktail from the BATCH RECIPES tab."}
                recipes.append(current)
                continue
            if current is None:
                continue
            label = text(r[0])
            if label.lower() == "water":
                current["notes"] += f" Includes {fmt_qty(num(r[3]))} ml water (no cost)."
                continue
            code, rec = ingredient_code(re.sub(r"\s*\(infused\)$", "", label), r[4])
            if rec:
                rec = f"{rec}"
            current["components"].append({"code": code, "recipe": rec, "qty": num(r[3]),
                                          "unit": "ml", "note": label})

    # Drinks (DRINK COSTING)
    batch_recipe_names = {r["name"].removesuffix(" (batch)") for r in recipes if r["type"] == "batch"}
    current = None
    for r in wb["DRINK COSTING"].iter_rows(min_row=5, values_only=True):
        first = text(r[0])
        if not first:
            continue
        if not str(r[0]).startswith("   "):
            if num(r[1]) is None:
                # Footnotes under the drink list, not drinks.
                current = None
                continue
            current = {"name": first, "type": "menu_item", "output_code": None,
                       "output_qty": 1.0, "output_unit": "ea", "components": [],
                       "notes": text(r[8])}
            recipes.append(current)
            continue
        if current is None:
            continue
        oz, source = num(r[1]), r[2]
        if oz is None:
            current["notes"] += f" Garnish: {first} (cost not tracked)."
            continue
        label = first
        if isinstance(source, str) and source.strip() in batch_recipe_names:
            src = source.strip()
            batch_name = f"{src} (batch)" if f"{src} (batch)" in {x['name'] for x in recipes} else src
            current["components"].append({"code": None, "recipe": batch_name, "qty": oz,
                                          "unit": POS_POUR_UNIT, "note": label})
            continue
        code, rec = ingredient_code(label, source)
        current["components"].append({"code": code, "recipe": rec, "qty": oz,
                                      "unit": POS_POUR_UNIT, "note": label})
        if label.strip().lower() in ASSUMED_INGREDIENTS:
            review.append({"type": "unverified_assumption", "code": code, "recipe": current["name"],
                           "title": f"Confirm '{label}' in {current['name']}",
                           "detail": ASSUMED_INGREDIENTS[label.strip().lower()]})

    # Infusion recipes are referenced by their product name; batches by "(batch)".
    recipe_names = {r["name"] for r in recipes}
    for rec in recipes:
        for c in rec["components"]:
            if c["recipe"] and c["recipe"] not in recipe_names:
                alt = f"{c['recipe']} (batch)"
                if alt in recipe_names:
                    c["recipe"] = alt

    # POS MAP -> Toast item mappings (by item name; see import-toast fallback)
    pos = []
    for r in wb["POS MAP"].iter_rows(min_row=5, values_only=True):
        item = text(r[2])
        if not item or item == "TOTAL":
            continue
        kind, recipe_name, prod, pour = text(r[5]), text(r[6]), r[7], num(r[8])
        entry = {"menu": text(r[0]), "group": text(r[1]), "item": item,
                 "avg_price": num(r[4]), "recipe": None}
        if kind == "Recipe" and recipe_name:
            entry["recipe"] = recipe_name
        elif kind == "Pour" and isinstance(prod, (int, float)) and pour:
            name = f"{item} ({fmt_qty(pour)} oz pour)"
            recipes.append({"name": name, "type": "menu_item", "output_code": None,
                            "output_qty": 1.0, "output_unit": "ea",
                            "components": [{"code": str(int(prod)), "recipe": None, "qty": pour,
                                            "unit": POS_POUR_UNIT, "note": "Straight pour"}],
                            "notes": text(r[11]) or "Straight pour from the POS MAP tab."})
            entry["recipe"] = name
        else:
            review.append({"type": "missing_recipe", "code": None,
                           "title": f"Map Toast item '{item}'",
                           "detail": (text(r[11]) or "No recipe or bottle yet.")
                                     + f" ({text(r[0])} / {text(r[1])})",
                           "context": {"toast_item": item, "menu": text(r[0]),
                                       "group": text(r[1])}})
        pos.append(entry)

    recipes = [r for r in recipes if r["components"]]
    # A reference to a recipe that has no spec falls back to its product.
    recipe_names = {r["name"] for r in recipes}
    for rec in recipes:
        for c in rec["components"]:
            if c["recipe"] and c["recipe"] not in recipe_names:
                c["code"], c["recipe"] = name_to_code[c["recipe"].lower()], None
    missing_components = [
        (rec["name"], c["note"]) for rec in recipes for c in rec["components"]
        if not c["code"] and not c["recipe"]
    ]
    if missing_components:
        raise SystemExit(f"Unresolved recipe components: {missing_components}")

    bundle = {
        "generated_from": os.path.basename(path),
        "products": list(products.values()),
        "zones": zones,
        "placements": placements,
        "sku_map": sku_map,
        "plcb_prices": plcb,
        "recipes": recipes,
        "pos_map": pos,
        "review": review,
    }
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "bundle.json"), "w") as f:
        json.dump(bundle, f, indent=1, default=str)
    print(json.dumps({k: len(v) for k, v in bundle.items() if isinstance(v, list)}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
