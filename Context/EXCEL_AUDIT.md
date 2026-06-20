# Excel Audit

Audit date: 2026-05-16.

## Files In `Excel File/`

| File | Sheets | Import status |
|---|---:|---|
| `Vista Inventory Inflow New.xlsx` | 3 | Imported by migration 2. |
| `Vertical Blinds Stock.xlsx` | 2 | Vertical fabric stock imported by migration 21 and refreshed by migration 22; existing MTR fabric sheet is already covered by migration 2. |
| `Vista Component Recipie New.xlsx` | 1 | Refreshed by migration 9 into component tables. |
| `Tracks.xlsx` | 8 | Track components imported by migration 10; not imported as stock. |

## Inventory Inflow Workbook

Source: `Vista Inventory Inflow New.xlsx`

| Sheet | Valid rows | Value |
|---|---:|---:|
| `Main Data for MTR Fabrics` | 159 | Rs 46,04,761.00 |
| `Main Data for MTR - parts` | 63 | Rs 12,48,636.75 |
| `Main Data for Pcs` | 93 | Rs 7,26,053.50 |
| Total | 315 | Rs 65,79,451.25 |

The import valuation rule is `quantity * rate` for all rows. Fabric rates are per running metre of the fabric width, not per square metre.

## Vertical Blinds Stock Workbook

Source: `Vertical Blinds Stock.xlsx`

Migration 21 imports only `Main Data for MTR Vertical`. Migration 22 refreshes the same vertical stock from the updated workbook rates. The workbook also contains `Main Data for MTR Fabrics`, which duplicates the opening MTR fabric catalog already covered by migration 2.

| Sheet | Imported rows | Variants | Quantity | Value |
|---|---:|---:|---:|---:|
| `Main Data for MTR Vertical` | 95 | 16 | 8,067 m | Rs 1,67,364.00 |

The imported category is `Vertical Blind Fabrics` with `sub_group = Fabric`. Product and variant rows follow the existing fabric pattern: one product per fabric code and one matching variant per product. The workbook width is 10 cm, stored as `width_m = 0.1`, so Inventory can calculate area from remaining metres. Migration 22 uses `scripts/generate_vertical_blinds_stock_refresh_sql.py` and preserves consumed quantity when updating existing imported rolls.

## Inventory Category Totals

| Category | Value |
|---|---:|
| Vertical Blind Fabrics | Rs 1,67,364.00 |
| Roller Blind Fabrics | Rs 22,33,085.00 |
| Sheer Dimout Fabrics | Rs 19,12,426.00 |
| S-Contour Fabrics | Rs 4,59,250.00 |
| Roller W/o Headrail Parts | Rs 5,79,486.00 |
| Sheer Dimout Plain Cassette Parts | Rs 4,15,635.00 |
| Sheer Dimout Decorative Cassette Parts | Rs 2,97,235.00 |
| Roller with Headrail Parts | Rs 1,87,395.00 |
| Curtain Tracks | Rs 1,33,154.80 |
| Motors | Rs 1,27,470.00 |
| Roman Blinds Parts | Rs 98,218.00 |
| Vertical Blinds Parts | Rs 82,410.70 |
| S Contour Parts | Rs 53,685.75 |

## Live Supabase Check After Migrations 1-3

The live database matched the inventory workbook exactly:

| Table/check | Result |
|---|---:|
| `inv_categories` | 12 |
| `inv_products` | 144 |
| `inv_variants` | 276 |
| `inv_rolls` | 315 |
| `inv_movements` | 315 |
| Imported roll rows with import notes | 315 |
| Unique purchase bills | 13 |
| `SUM(inv_rolls.stock_value)` | Rs 65,79,451.25 |

## Blind Components Workbook

Source: `Vista Component Recipie New.xlsx`

The updated workbook now has 8 source sections, with 1 repeated block removed by the owner, resulting in 7 unique blind component products for the app.

| Source group | Component lines |
|---|---:|
| Roller W/o Headrail Parts | 14 |
| Roller with Headrail Parts | 17 |
| Sheer Dimout Plain Cassette Parts | 17 |
| Sheer Dimout Decorative Cassette Parts | 19 |
| S Contour Parts | 16 |
| Total | 83 |

All blind component lines are meant to map to imported `inv_variants`. The refreshed migration 9 skips unmatched rows instead of inserting `NULL variant_id`.

## Track Components Workbook

Source: `Tracks.xlsx`

Sheets:

- `Roller Without Headrail`
- `Roller With Headrail`
- `Roman Blinds`
- `S Contour`
- `Sheer Dimout Plain Cassette `
- `Sheer Dimout Decorative Cassett`
- `Vertical`
- `Tracks`

This workbook contains printable production/measurement templates plus track component definitions. It is not imported into inventory stock tables, but the 3 track products are imported into `product_recipes` and `recipe_items` by migration 10:

- `Super Track`
- `Jumbo Track`
- `M Track`
