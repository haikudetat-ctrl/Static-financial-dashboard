# Static! workbook import

One-time migration of the `Static_Inventory_System` workbook into Static OS.
After the import the app is the system of record; the workbook is retired.

## What it loads

| Workbook tab                             | Static OS                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| PRODUCTS                                 | `inventory_items` (`item_code` = workbook ID), categories, count units     |
| SETUP locations + COUNT (Location / Seq) | `storage_locations` (walk order) + `storage_location_items.sort_order`     |
| SKU MAP                                  | Baldor / Giordano `vendor_items` linked to products with pack conversions  |
| PLCB PRICES                              | PLCB `vendor_items` + `vendor_item_prices`                                 |
| PRODUCTS costs                           | `item_cost_history` + P10 opening `inventory_item_cost_snapshots`          |
| BATCHES, BATCH RECIPES, DRINK COSTING    | batch and menu-item `recipes` with active version 1                        |
| POS MAP                                  | `recipe_menu_item_mappings` keyed `name:<toast item>` (see `import-toast`) |
| NEEDS MAPPING + judgment calls           | `catalog_review_items`, shown at `/exceptions/catalog-review`              |

Item codes are plain numbers: 1–376 bottles, 1001+ food and bar supplies,
2001+ house prep. Category, vendor and COGS class live in their own columns,
so a code never has to change when a product moves vendor or category.

## Running it

```bash
pip install openpyxl formulas
python extract_static_workbook.py <workbook.xlsx> <out_dir>
python build_load_sql.py <out_dir>/bundle.json <sql_dir> <org_id> <location_id> <actor_profile_id>
```

The workbook is saved without cached formula values, so the extractor expects
a copy recalculated by `formulas` (`ExcelModel().loads(path).finish().calculate()`
then `.write()`), which takes a few minutes.

Run the generated chunks in file order. Each chunk checks its own row counts
and raises instead of partially loading; chunks are safe to re-run.
