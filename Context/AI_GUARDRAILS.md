# AI Guardrails

This file exists so future AI agents do not accidentally undo the clean reset or reintroduce old schema assumptions.

## Read This First

Before touching code, read these files:

1. `Context/AI_RULES.md`
2. `Context/ARCHITECTURE.md`
3. `Context/CURRENT_STATE.md`
4. `Context/EXCEL_AUDIT.md`
5. This file

After meaningful changes, update Context before handing off. At minimum append `Context/CHANGELOG.md`; also update `Context/CURRENT_STATE.md`, `Context/ARCHITECTURE.md`, and related README/guide files when database structure, reset behavior, page routing, workflow ownership, or imports change.

## Non-Negotiable Facts

- The current app is static HTML, CSS, and vanilla JS. There is no build step.
- Supabase is the live source of truth.
- The clean inventory value from the fresh import is `Rs 65,79,451.25`.
- The inventory import has 315 valid rows.
- Fabric valuation is `running_metres * rate`, not square metres times rate.
- `settings.html` is still the route, but the visible page name is `Profiles`.
- Do not re-add old migrations, old Python import scripts, `package.json`, or `node_modules`.
- `create.html` is the sidebar Create tab. It owns Create Purchase Order and embeds `create-order.html?embed=1`.
- `create-order.html` remains the full customer order form. Do not duplicate its order submission logic inside `create.html`.
- `tickets.html` is a top-level sidebar page for all employee roles. `order_tickets` is only the pre-order requirement layer. Confirmed production/accounting work must still become normal `orders`, `order_items`, and `order_components` through `js/create-order.js`.
- Sidebar order is user/browser configurable through `localStorage`; do not hard-reset user ordering unless the owner asks.
- Visible UI wording is now `Components`, not `Recipes`. Keep legacy table/file names like `product_recipes`, `recipe_items`, `recipes.html`, and `js/recipes.js` unless the owner explicitly asks for a schema/file rename.
- `supabase/migrations/035_clean_app_data_framework.sql` is the current clean-framework wipe. It clears public app rows but keeps structure, RLS, functions, and Auth users/profiles by default so an admin can still log in.
- Major website/database changes must use the staging lane. Production hosts force live Supabase in `js/config.js`; only local hosts can opt into staging through `dev-environment.html` / browser localStorage.

## Correct Database Tables

Use these names:

| Purpose | Correct table |
|---|---|
| User profiles/auth metadata | `profiles` |
| Customers/dealers | `customers` |
| Orders | `orders` |
| Pre-order tickets | `order_tickets` |
| Ticket follow-up history | `order_ticket_followups` |
| Order line items | `order_items` |
| Order component BOM usage | `order_components` |
| Inventory categories | `inv_categories` |
| Inventory products | `inv_products` |
| Inventory variants/items | `inv_variants` |
| Physical stock batches/rolls/opening rows | `inv_rolls` |
| Inventory ledger/movements | `inv_movements` |
| Product BOM components | `product_recipes` |
| Product BOM component lines | `recipe_items` |
| Purchased finished goods | `fg_stock` |
| Supplier profiles | `suppliers` |
| Wastage | `wastage_logs` |
| Audit trail | `activity_logs` |

## Stale Names That Cause Bugs

Do not use these in new code:

| Bad/stale name | Why it is wrong |
|---|---|
| `materials` | Old material schema. |
| `material_categories` | Old category schema. |
| `rolls` | Old roll schema. Current stock rows are `inv_rolls`. |
| `inventory_movements` | Old movement schema. Current ledger is `inv_movements`. |
| `inv_items` | Drifted temporary schema. Not current. |
| `inv_stock_entries` | Drifted temporary schema. Not current. |
| `order_headers` | Old order schema. Current table is `orders`. |
| `cut_log` | Old singular name. |
| `normalizedName` | JS-style name only. Database column is `normalized_name`. |
| `settings` as UI label | Visible label should be `Profiles`; route/file can stay `settings.html`. |

## Frontend Globals And Shared Functions

These are intentionally global because the app is plain browser JS:

| Name | Defined in | Meaning |
|---|---|---|
| `db` | `js/config.js` | Supabase browser client. |
| `AUTH` | `js/auth.js` | Session/profile/sign-out helper. |
| `initSidebar()` | `js/sidebar.js` | Auth gate, role check, nav render. |
| `fmt$()` | `js/utils.js` | INR currency formatter. |
| `fmtDate()` / `fmtDateTime()` | `js/utils.js` | Date display helpers. |
| `toast()` | `js/utils.js` | User notification. |
| `openModal()` / `closeModal()` | `js/utils.js` | Modal helpers. |
| `logActivity()` | `js/utils.js` | Writes audit rows. |
| `getPreferredUnit()` / `setPreferredUnit()` | `js/utils.js` | Display unit preference only. |

Do not convert these into ES modules unless you intentionally convert every HTML script load and test every page.

## Important Page Controllers

| File | Do not forget |
|---|---|
| `js/inventory.js` | Reads `inv_*` tables and `fg_stock`; calculates visible stock cards. |
| `js/reports.js` | Current inward/outward drilldown logic. Reuse grouping patterns for customers/profiles instead of duplicating badly. |
| `js/create-order.js` | Uses `product_recipes`, `recipe_items`, `order_components`, and inventory variants. Tracks now prefer DB-backed component rows when imported. |
| `js/create.js` | Create tab controller. Create Purchase Order uses suppliers and inv categories/products/variants to create pending `stock_orders` and `stock_order_items`. Embeds Create Order. |
| `js/stock-order-detail.js` | Stock order receive/download controller. Writes `inv_rolls` and `inv_movements` only when a pending stock order is received. |
| `js/order-detail.js` | Also uses components/order BOM data and order status/production detail. |
| `js/recipes.js` | Admin-only Components page. Visible wording says Components, but this file still reads/writes `product_recipes` and `recipe_items`. |
| `js/sidebar.js` | Role routing, nav labels, and drag-to-reorder sidebar ordering live here. |
| `js/settings.js` | Admin profile/customer management despite historical filename. |
| `js/tickets.js` | Ticket queue and new-ticket capture. Row clicks open `ticket-detail.html`. |
| `js/ticket-detail.js` | Dedicated CRM ticket detail page, follow-up history, and order conversion handoff. |

## Create Tab Rules

`create.html` has two tabs:

```text
Create Purchase Order
Create Order
```

Create Purchase Order flow:

1. Supplier selection or inline supplier creation.
2. Shared bill details: bill number, bill date, notes.
3. Stock Order Form details for the downloadable supplier order.
4. One or more item cards.

Do not split the Create Purchase Order source of truth. Initial stock order creation writes to:

```text
suppliers       -- only when creating a new supplier profile
stock_orders    -- one pending supplier order header
stock_order_items -- one row per stock order line
stock_order_downloads -- generated stock form snapshots
```

Receiving a pending stock order from `stock-order-detail.html` is the only point that writes inward inventory to:

```text
inv_rolls       -- one row per received stock line
inv_movements   -- one inflow ledger row per received stock line
```

Important Create Purchase Order variables/functions in `js/create.js`:

| Name | Purpose |
|---|---|
| `selectedSupplier` | Currently selected supplier profile object. |
| `isNewSupplier` | Whether the inline new-supplier form is active. |
| `stockItems` | Array of active inward item card IDs. |
| `itemState` | Per-item selected category/product/variant state. |
| `ensureSupplier()` | Returns selected supplier or creates a new one. Uses RLS fallback. |
| `ensureItemEntities(row)` | Creates category/product/variant from typed dropdown values when needed. |
| `saveStock()` | Creates a pending stock order and its line items; it must not insert live inventory rows. |

Do not make supplier phone required. Supplier/customer phone fields are intentionally optional.

Create Order embed rule:

- `create-order.js` sends `{ type: 'create-order-height', height }` to its parent.
- `create.js` listens and resizes `#create-order-frame`.
- Do not reintroduce `height: calc(100vh...)` nested scrolling for the Create tab.

## Sidebar Ordering Rules

Sidebar navigation is generated in `js/sidebar.js` by `initSidebar()`.

Drag ordering helpers:

| Name | Purpose |
|---|---|
| `applySidebarOrder(nav, role)` | Applies saved per-role tab order. |
| `enableSidebarReorder(role)` | Enables drag/drop for admin/staff sidebars. |
| `sidebarOrderKey(role)` | Browser storage key. |
| `saveSidebarOrder(role)` | Persists current order to `localStorage`. |

Do not reorder tabs by editing every HTML page. The sidebar is shared and should remain central.

## Profiles UI Rules

`settings.html` is the Profiles page. Keep the route/file name unless every link and role check is updated.

Profiles has exactly three tabs for now:

```text
Employees
Customers
Suppliers
```

Keep toolbar UI consistent across all three using:

```text
profile-toolbar
profile-toolbar-title
profile-toolbar-subtitle
profile-toolbar-actions
```

Do not make one tab use a custom header/button pattern unless all three are updated together.

## Inventory Calculation Rules

Opening stock value:

```text
stock_value = quantity * rate
```

Use this for both fabrics and parts. For fabrics, quantity is running metres of the actual roll width. Do not calculate fabric stock value as square metres.

Dashboard/report/inventory totals should prefer:

```text
SUM(inv_rolls.stock_value)
```

Fallback only when `stock_value` is missing:

```text
quantity * purchase_rate
```

Be careful with `original_length` vs `remaining_length`:

- Opening/import total should use original imported value.
- Current visible inventory value may use remaining stock if the app is showing current stock after consumption.
- Do not add original and remaining together.

## Excel Truth

Inventory workbook:

- File: `Excel File/Vista Inventory Inflow New.xlsx`
- Valid rows: 315
- Total value: `Rs 65,79,451.25`
- Imported into: `inv_categories`, `inv_products`, `inv_variants`, `inv_rolls`, `inv_movements`

Component workbook:

- File: `Excel File/Vista Component Recipie New.xlsx`
- Blind component source groups: 8 workbook sections with 1 duplicate merged into 7 unique blind products
- Blind component lines: refreshed by `009_refresh_recipe_catalog.sql`
- Imported into: `product_recipes`, `recipe_items`

Track component import:

- `010_import_track_recipes.sql` imports 3 DB-backed track products:
  - `Super Track`
  - `Jumbo Track`
  - `M Track`
- Track components are linked to `Curtain Tracks` inventory variants.

Tracks workbook:

- File: `Excel File/Tracks.xlsx`
- It is production/measurement templates, not stock.
- Do not import it into inventory tables.

## Supabase Migration Flow

Only use `supabase/migrations` now:

1. `001_reset_rebuild_inventory_schema.sql`
2. `002_import_inventory_inflow_new.sql`
3. `003_disable_inventory_rls_for_app.sql`
4. `004_import_supporting_workbooks.sql`
5. `005_profiles_suppliers_support.sql`
6. `006_fix_profile_optional_fields_and_rls.sql`
7. `007_order_statuses_and_supplier_rls_repair.sql`
8. `008_order_executor_assignment.sql`
9. `009_refresh_recipe_catalog.sql`
10. `010_import_track_recipes.sql`
11. `011_rrp_catalog.sql`
12. `012_security_hardening.sql`
13. `013_product_codes.sql`
14. `014_order_invoice_details.sql`
15. `015_rrp_catalog_all_blinds.sql`
16. `016_repair_torrent_inventory_link_and_delete_cleanup.sql`
17. `017_order_decimal_quantities_and_rollback_dedupe.sql`
18. `018_cleanup_failed_order_headers.sql`
19. `019_execute_order_rpc_and_executor_wastage_update.sql`
20. `020_order_item_input_measurements.sql`
21. `021_import_vertical_blinds_stock.sql`
22. `022_refresh_vertical_blinds_stock_rates.sql`
23. `023_order_tickets.sql`
24. `024_order_tickets_all_roles.sql`
25. `025_order_ticket_inquiry_followups.sql`
26. `026_sales_order_read_access.sql`
27. `027_sales_order_update_access.sql`
28. `028_employee_profile_read_access.sql`
29. `029_ticket_sequential_numbering.sql`
30. `030_sales_order_item_edit_access.sql`
31. `031_ticket_inquiry_date_default.sql`
32. `032_ticket_plain_sequential_uid.sql`
33. `033_order_quote_forms_and_downloads.sql`
34. `034_stock_orders_and_downloads.sql`
35. `035_clean_app_data_framework.sql`

Do not resurrect deleted historical migrations.

Do not add a Supabase service-role key to browser code. Admin Auth user creation, deletion, email edits, and password resets must go through a server-side function such as `supabase/functions/admin-users`.

For staging work, do not use `supabase db query --linked` for writes because this checkout is linked to live. Use an explicit staging Postgres connection string with `--db-url $env:STAGING_DB_URL`, and verify it does not contain the live project ref `akjybtvaezxayfwtpifd`.

Executer production depends on `public.execute_order(...)` from migration 19. Do not replace it with browser-side inventory deduction; the browser should save cut inputs, then the RPC should deduct inventory and mark rows executed/deducted.

For order measurements, preserve canonical values (`width_cm`, `height_cm`, track chargeable feet in `area_sqm`) for backward compatibility. Optional input columns from migration 20 are display aids; old orders must still render converted units from canonical values.

Billing PDFs must stay derived from persisted `order_items` on `order-detail.html`. Do not add a new billing table just to group repeated blinds; use the saved dimensions/rates so old orders and new orders follow the same output. Blinds bill by total SQM, tracks bill by track count while showing saved chargeable length as reference, and parts are unit-based. Use neutral invoice terms such as item, quantity, measure, bill quantity, rate, and amount; the footer should show only the grand total amount.

Quote/proforma output metadata belongs in `order_quote_forms` and generated snapshots belong in `order_quote_downloads`. These tables are for customer-facing addresses, terms, edited quote rows, and redownload history; do not use them to replace production `order_items` or inventory/component calculations.

Vertical blind stock lives under `Vertical Blind Fabrics`. Use migration 22 or its generator to refresh that stock/rate set; do not rerun broad reset/import migrations just to change vertical rates.

Migration 35 is the current owner-requested cleanup path for an empty structural framework. Do not run older import migrations after it unless the owner explicitly wants old workbook/catalog data restored. If a full account wipe is requested, use the commented optional block in migration 35 separately and plan how to recreate the first admin user before deleting `auth.users` / `public.profiles`.

Sales order visibility depends on both frontend filters and RLS. Do not re-add sales-side `customer_id = currentProfile.id` filters on `orders.html`, order detail, or sales-side assignment surfaces. Migration 26 adds `can_view_order` so sales users can read all order rows and detail rows. Migration 27 lets sales maintain shared order flow fields while delete remains admin-only. Migration 30 lets sales edit order line items/components on shared open orders; do not make the order-detail edit button admin-only again.

Tickets should behave like a lightweight CRM work queue: the list row is clickable and opens `ticket-detail.html?id=<ticket_id>`, follow-ups remain append-only history on the ticket detail page, and Create Order stays a conversion action after the follow-up action. Ticket creator, owner, and follow-up author labels depend on profile read access from migration 28; do not display raw UUIDs in the ticket UI. Ticket IDs must be generated by the database trigger and, after migration 32, display as plain sequence numbers such as `0001`, `0002`; do not generate ticket numbers in browser JavaScript. Do not show a ticket inquiry-date field, but keep date creation stable through `order_tickets.inquiry_date` and migration 31.

## Fast Verification Queries

Inventory counts:

```sql
select
  (select count(*) from inv_categories) as categories,
  (select count(*) from inv_products) as products,
  (select count(*) from inv_variants) as variants,
  (select count(*) from inv_rolls) as rolls,
  (select count(*) from inv_movements) as movements,
  round((select coalesce(sum(stock_value), 0) from inv_rolls)::numeric, 2) as stock_value;
```

Expected result after clean import:

```text
categories = 12
products = 144
variants = 276
rolls = 315
movements = 315
stock_value = 6579451.25
```

Recipe/supporting check:

```sql
select
  (select count(*) from product_recipes) as recipes,
  (select count(*) from recipe_items) as recipe_items,
  (select count(*) from recipe_items where variant_id is null) as unmatched_recipe_items,
  to_regclass('public.fg_stock') as fg_stock_table;
```

Expected after the refreshed component migrations:

```text
recipes >= 10
recipe_items >= 83
unmatched_recipe_items = 0
fg_stock_table = fg_stock
```

Supplier profile check after migration 5:

```sql
select to_regclass('public.suppliers') as suppliers_table;
```

## Common AI Mistakes To Avoid

- Do not calculate fabric stock by width times metres times rate.
- Do not import the same workbook twice.
- Do not deduplicate by `batch_code` only, because multiple line items can share a purchase bill/batch.
- Do not make `inv_rolls.batch_code` unique.
- Do not rename `settings.html` unless you update every link and role check.
- Do not hide Supabase errors in UI work. Log and surface them.
- Do not split business logic across dashboard/reports/customers with different formulas.
- Do not assume empty inventory means Excel failed; first check RLS and table counts.
- Do not use old context claims if they conflict with `EXCEL_AUDIT.md` or this file.
- Do not put Create Purchase Order back inside Inventory. The current direction is Inventory = current stock view only; Create = purchase order/create order.
- Do not make profile/customer/supplier detail panels open below the list again if the owner asked for drill-in behavior.
- Do not use Supabase nested joins that require missing schema-cache relationships, such as `recipe_items(...inv_variants(...))`. `create-order.js`, `order-detail.js`, `wastage.js`, and `recipes.js` intentionally load base rows separately and map variants in JS.
