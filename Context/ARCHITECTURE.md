# System Architecture

## Stack

Vista is a static frontend app:

- HTML pages in the repo root.
- One shared stylesheet: `css/style.css`.
- Vanilla JavaScript page controllers in `js/`.
- Supabase for Auth, Postgres tables, RPCs, and storage of inventory/order data.

There is no build step and no package manager requirement for the current frontend.

## Context Handoff Rule

Every future agent should read `Context/AI_RULES.md`, `Context/AI_GUARDRAILS.md`, `Context/CURRENT_STATE.md`, and this file before changing code. After meaningful changes, append `Context/CHANGELOG.md`; update this file and `Context/CURRENT_STATE.md` when page ownership, table ownership, workflow boundaries, imports, or reset behavior changes.

## Page Ownership

| Page | Controller | Purpose |
|---|---|---|
| `index.html` | inline redirect | Sends users to `login.html`. |
| `login.html` | `js/login.js` | Sign-in and role-based redirect. |
| `dashboard.html` | `js/dashboard.js` | Summary cards, recent orders, low-stock overview. |
| `inventory.html` | `js/inventory.js` | Inventory tree, stock cards, add/edit stock, export. |
| `create.html` | `js/create.js` | Combined Create tab. Adds inward stock and embeds the create-order form. |
| `orders.html` | `js/orders.js` | Order list, filters, export, create-order side panel. |
| `create-order.html` | `js/create-order.js` | New order form and order submission. |
| `order-detail.html` | `js/order-detail.js` | One order's detail, status, production records, print/PDF. |
| `reports.html` | `js/reports.js` | Inward/outward report grouping. |
| `wastage.html` | `js/wastage.js` | Wastage recording and history. |
| `activity-log.html` | `js/activity-log.js` | Audit log filters and list. |
| `settings.html` | `js/settings.js` | Admin Profiles screen for employees, customers, and suppliers. Historical filename remains `settings.html`. |
| `tickets.html` | `js/tickets.js` | Shared ticket queue and new-ticket capture. |
| `ticket-detail.html` | `js/ticket-detail.js` | Dedicated CRM ticket detail, follow-up timeline, and order handoff. |
| `recipes.html` | `js/recipes.js` | Admin-only Components screen. Historical filename remains `recipes.html`. |
| `rrp.html` | `js/rrp.js` | Admin-only RRP price management. Inline-editable table sourced from `rrp_entries`. |
| `customer-dashboard.html` | `js/customer-dashboard.js` | Customer-only dashboard. |
| `executer-dashboard.html` | `js/executer-dashboard.js` | Production queue for executer users. |

## Shared JavaScript

| File | Role |
|---|---|
| `js/config.js` | Creates global Supabase client `db`. |
| `js/auth.js` | Central auth/session/profile helper. |
| `js/sidebar.js` | Shared sidebar, role checks, mobile menu, and per-role drag-to-reorder tab ordering. |
| `js/utils.js` | Formatting, DOM helpers, modals, toasts, unit helpers, activity logging. |
| `js/transitions.js` | Small page transition behavior only. |

## Live And Staging Supabase

`js/config.js` now has a guarded environment selector:

- Production and non-local hosts use the isolated Supabase project `knawjdrsdqgyfzqzddix`.
- Local hosts (`localhost`, `127.0.0.1`, `::1`) can switch to staging through `dev-environment.html`, URL params, or browser `localStorage`.
- When local staging is active, app pages show a yellow `STAGING DB` badge and expose `window.VISTA_SUPABASE_ENV = 'staging'`.

The staging workflow is documented in `STAGING_SETUP.md`. Staging database restore tooling lives in:

```text
scripts/generate_restore_sql_from_backup.py
scripts/restore_backup_to_staging.ps1
```

The local Supabase CLI profile cannot link to `knawjdrsdqgyfzqzddix` yet, so migration writes should use the direct database connection string with `supabase db query --db-url $env:VISTA_NEW_DB_URL` unless CLI project access is granted.

## Current Inventory Schema Expected By The App

```text
inv_categories
  inv_products
    inv_variants
      inv_rolls
        inv_movements
```

The frontend inventory and reports currently expect `inv_rolls.stock_value`, `remaining_length`, `purchase_rate`, `bill_no`, `supplier`, and `inward_date`.

## Clean-Framework Data Reset

The current owner-requested app-data cleanup path is:

```text
supabase/migrations/035_clean_app_data_framework.sql
```

Migration 35 keeps the structural framework intact: tables, columns, indexes, RLS policies, triggers, functions/RPCs, Supabase Auth users, and `public.profiles` stay in place by default. It clears public app content for the next development phase, including orders, tickets, quote/download history, stock orders, inventory rows, customers, suppliers, components, RRP/product-code catalogs, activity logs, wastage, and execution records.

The optional account-wipe block at the bottom of migration 35 is deliberately commented out. Only run it separately if the first admin user will be recreated immediately.

## Create And Inventory Write Flow

Inventory is now intended to be a current-stock viewing page. Do not add the old Create Purchase Order/Restock UI back into the Inventory top bar unless the owner reverses that decision.

Stock inward should start from:

```text
create.html -> js/create.js -> stock_orders + stock_order_items
stock-order-detail.html -> js/stock-order-detail.js -> inv_rolls + inv_movements
```

Create Purchase Order form writes:

| User action | Table |
|---|---|
| Create supplier inline | `suppliers` |
| Create category | `inv_categories` |
| Create item/product | `inv_products` |
| Create variant/material | `inv_variants` |
| Create stock order header | `stock_orders` |
| Create stock order line item | `stock_order_items` |
| Save generated stock form snapshot | `stock_order_downloads` |
| Receive stock order line item | `inv_rolls` |
| Receive stock order ledger row | `inv_movements` |

Reports, Profiles > Suppliers, and Inventory should read from those same inward rows rather than maintaining separate duplicate import state.

The receive action is the boundary where live inventory changes. Do not add `inv_rolls` or `inv_movements` rows during initial stock order creation.

When the Create Purchase Order flow creates a new item/material inline, `js/create.js` must create or reuse an `inv_products` row with the typed name under the selected category, then create the `inv_variants` row under that product. Do not fall back to the first product in the category, because that mis-groups variants under unrelated parent products.

## Create Order Embed Flow

`create.html` embeds `create-order.html?embed=1`.

`js/create-order.js` hides the sidebar/back chrome in embed mode and sends its rendered height to the parent with:

```text
postMessage({ type: 'create-order-height', height }, '*')
```

`js/create.js` listens for that message and resizes `#create-order-frame`. This is intentional so the Create page scrolls naturally instead of having a nested form scroll.

## Profiles Flow

Profiles are still routed through `settings.html` and `js/settings.js`.

Tabs:

| Tab | Data |
|---|---|
| Employees | `profiles` plus recent `activity_logs` |
| Customers | `customers` plus linked `orders` |
| Suppliers | `suppliers` plus inward rows from `inv_rolls` |

The three profile tabs share toolbar CSS classes in `css/style.css`: `profile-toolbar`, `profile-toolbar-title`, `profile-toolbar-subtitle`, and `profile-toolbar-actions`.

## Sidebar Flow

All sidebar tabs are generated in `js/sidebar.js`.

Admin/staff sidebars can be dragged to rearrange tabs. The order is saved in browser `localStorage` under a per-role key from `sidebarOrderKey(role)`. Future agents should not hardcode a different order in each page.

## Database Migration Rule

Use only `supabase/migrations` for future database reset/import work. The old historical migration chain has been removed from the working tree because it mixed multiple schema eras.

Run order:

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

`012_security_hardening.sql` is the deployment pass. It re-enables RLS, removes anonymous table grants, and expects admin Auth user creation/deletion to happen through `supabase/functions/admin-users` instead of a browser-exposed service key.

`019_execute_order_rpc_and_executor_wastage_update.sql` is required for executer-side production. It defines `public.execute_order(...)`, deducts inventory server-side, and allows assigned executers to update fabric cut details in `wastage_logs`.

`020_order_item_input_measurements.sql` adds optional original input measurement fields to `order_items`. Older orders still render converted dimensions from canonical stored values such as `width_cm`, `height_cm`, and track `area_sqm` chargeable feet.

`js/order-detail.js` builds the PDF billing list from persisted `order_items`. The PDF groups matching item/detail, dimensions, unit, and rate into one row, then shows neutral columns (`Item`, `Quantity`, `Measure`, `Bill Qty`, `Rate`, `Amount`). The row display adapts by type: blinds and measured direct items show area, tracks show chargeable length as reference with per-track billing, and raw/material rows show their own unit or length basis. The footer shows only the grand total amount.

`021_import_vertical_blinds_stock.sql` imports the vertical blind fabric stock category. `022_refresh_vertical_blinds_stock_rates.sql` refreshes that complete vertical stock/rate set from the updated workbook without touching other categories.

`026_sales_order_read_access.sql` repairs the sales order visibility contract. `orders_select`, `order_items_select`, `order_components_select`, and `wastage_logs_select` use read-level access for sales, while modification policies continue to use the stricter order access checks.

`027_sales_order_update_access.sql` lets sales users update shared order-flow fields for all orders, which keeps executer assignment consistent across sales profiles. `orders_delete` remains admin-only.

`028_employee_profile_read_access.sql` lets employee roles read staff profile display rows so ticket creator, owner, and follow-up author names resolve in `ticket-detail.html`.

`029_ticket_sequential_numbering.sql` replaces random ticket IDs with sequence-backed IDs in `TKT-NNNNDDMMYY` format. Existing tickets are backfilled by `created_at` order, and future inserts are assigned by the `trg_assign_order_ticket_uid` trigger.

`030_sales_order_item_edit_access.sql` lets sales users insert/update/delete order line items and components on shared open orders. This backs the `order-detail.html` edit panel for sales profiles.

`031_ticket_inquiry_date_default.sql` reasserts `order_tickets.inquiry_date DEFAULT CURRENT_DATE` so ticket creation does not need a visible date field.

`032_ticket_plain_sequential_uid.sql` changes ticket display IDs to plain sequence numbers such as `0001`, `0002` while keeping database-side generation.

`033_order_quote_forms_and_downloads.sql` adds `order_quote_forms` and `order_quote_downloads`. These tables store customer-facing quote/proforma defaults and generated quote snapshots only; `order_items` remains the source for order quantities, rates, and generated line math.

`034_stock_orders_and_downloads.sql` adds `stock_orders`, `stock_order_items`, and `stock_order_downloads`. These tables store pending supplier stock orders and generated supplier-order form history. `inv_rolls` and `inv_movements` remain the live inventory/reporting source and are written only when the stock order is received.

`035_clean_app_data_framework.sql` clears public app rows for an empty structural framework while preserving schema, RLS, triggers, functions/RPCs, Auth users, and profiles by default.

## Inventory Valuation Rule

Fabric value is `running_metres * rate`. The fabric rate is for one running metre at the fabric's roll width, not one square metre.

Parts/components value is `quantity * rate`.

## Excel Files

| Workbook | Role |
|---|---|
| `Vista Inventory Inflow New.xlsx` | Opening inventory source. Imports into `inv_categories`, `inv_products`, `inv_variants`, `inv_rolls`, and `inv_movements`. |
| `Vista Component Recipie New.xlsx` | Blind component/BOM source. Refreshes `product_recipes` and `recipe_items` through migration 9. Visible UI wording says Components, but schema names remain legacy recipe names. |
| `Tracks.xlsx` | Track component/BOM source. Imported into `product_recipes` and `recipe_items` through migration 10. Not imported into inventory stock tables. |
