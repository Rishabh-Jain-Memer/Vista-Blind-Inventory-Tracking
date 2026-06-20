# Vista Blind Tracking Management System

Vista is a plain HTML/CSS/JavaScript inventory and order tracking app for a blinds manufacturing workflow. It uses Supabase for authentication, database reads/writes, and server-side stock/order functions.

There is no frontend build step. Open the project through a local HTTP server such as VS Code Live Server. Do not open pages through `file://`, because browser security rules can break relative scripts and Supabase CDN loading.

## Isolated Development Clone

This checkout was created for isolated development under `Rishabh-Jain-Memer/Vista-Blind-Inventory-Tracking`. It is wired to the separate Supabase project `knawjdrsdqgyfzqzddix`, not the existing production Supabase project.

## Current Code Layout

| Area | Files | Responsibility |
|---|---|---|
| App pages | `*.html` | Page markup only. Each page loads shared scripts, then one matching page controller from `js/`. |
| Shared frontend | `js/config.js`, `js/auth.js`, `js/sidebar.js`, `js/utils.js`, `js/transitions.js` | Supabase client, auth guard, role navigation, reusable formatting/modal helpers, page transitions. |
| Inventory | `inventory.html`, `js/inventory.js` | Current inventory view, stock cards, filters, export. Add Stock is now handled from Create. |
| Create | `create.html`, `js/create.js`, `create-order.html`, `js/create-order.js` | Add inward stock by supplier bill, and create customer orders from the same sidebar tab. |
| Orders | `orders.html`, `order-detail.html`, matching JS files | Sales/order list, order detail, order status, stock deduction flow. |
| Reports | `reports.html`, `js/reports.js` | Inward/outward accounting-style report views grouped by year, month, bill/order, and line item. |
| Profiles | `settings.html`, `js/settings.js` | Employees, customers, and suppliers. `settings.html` is the historical filename for Profiles. |
| Customer portal | `customer-dashboard.html`, `js/customer-dashboard.js` | Customer-only order dashboard. |
| Database reset/import | `supabase/migrations/*.sql` | Clean future migration lane. Run these manually in Supabase SQL Editor when we work on the database. |
| Project context | `Context/*.md` | Required handoff notes for future AI/coding sessions. Read this folder before changing logic. |

## Safe Staging Lane

Major website/database changes should be tested against the new isolated Supabase project, never the current production database. In this isolated clone, production/non-local pages use the project configured in `js/config.js`; local development can still opt into another separate project through `dev-environment.html`.

Use `STAGING_SETUP.md` for the full setup. The short version:

1. Create a separate Supabase staging project.
2. Give staging the current public schema.
3. Restore backup data into staging with `scripts/restore_backup_to_staging.ps1`.
4. Open `dev-environment.html` on `localhost`, paste the staging URL/anon key, and switch local testing to staging.
5. Confirm app pages show the yellow `STAGING DB` badge before testing destructive workflows.

## Clean Database Flow

When we are ready to reset Supabase, use only the files in `supabase/migrations` and run them in order:

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

The old historical migration chain and Node/Python import helpers were removed because they referenced mixed schemas and old Excel assumptions. This prevents accidental duplicate imports or wrong table names such as `inv_items`, `inv_stock_entries`, or missing `normalized_name`.

Migration `026` is the live-database follow-up for sales order visibility. It lets sales users read every order plus its line/component detail while preserving the stricter write policies from migration `012`.
Migration `027` lets sales users maintain the shared order flow, such as assigning executers, across all open sales orders while delete access remains admin-only.
Migration `028` lets employee roles read staff profile display rows so ticket creator, owner, and follow-up names resolve in the CRM ticket detail view.
Migration `029` gives tickets sequence-backed IDs in `TKT-NNNNDDMMYY` format and backfills existing tickets in creation order.
Migration `030` lets sales users edit order line items/components on shared open orders.
Migration `031` reasserts the database default for ticket inquiry dates so the UI can keep the date field hidden while inserts stay stable.
Migration `032` changes ticket IDs to plain sequence numbers such as `0001`, `0002`.
Migration `033` adds quote/proforma form defaults and generated quote download history.
Migration `034` adds pending stock orders, line items, and stock-order download history.
Migration `035` clears public app data for a clean structural framework while preserving schema/RLS/functions and keeping Auth users/profiles by default.

For deployment, deploy `supabase/functions/admin-users` and set `SUPABASE_SERVICE_ROLE_KEY` as a Supabase function secret. Never place a service-role key in browser JavaScript.

## Frontend Rules

All pages share the same Supabase client from `js/config.js`. Page controllers should not create separate clients unless there is a deliberate admin-only reason.

`js/config.js` deliberately forces live Supabase outside local hosts. Do not bypass that guard for production. For local staging, use `dev-environment.html` or URL/localStorage settings documented in `STAGING_SETUP.md`.

Inventory totals should come from the cleaned `inv_rolls.stock_value` values or, only as a fallback, `quantity * purchase_rate`. Fabric rates are per running metre of the fabric width, not per square metre.

Reports, dashboard, inventory, and customers should eventually read from the same cleaned transaction source instead of each page recalculating differently.

## Current App Rules

- Inventory is a current-stock view only. Do not put Add Stock/Restock buttons back there unless requested.
- Create has two workflows: Add Stock and Create Order.
- Add Stock writes one `inv_rolls` row and one `inv_movements` row per bill line item.
- Add Stock creates typed inventory products using the entered item/material name before creating the variant; do not fall back to the first product in a category.
- Profiles has three tabs: Employees, Customers, Suppliers.
- Order statuses are `inquiry`, `processing`, `executed`, and `completed`.
- Outward reports should count completed orders only.
- Sidebar tab order can be changed by dragging tabs; the order is saved in browser local storage.

## For Future AI Agents

Before editing code, read:

1. `Context/AI_RULES.md`
2. `Context/AI_GUARDRAILS.md`
3. `Context/CURRENT_STATE.md`
4. `Context/ARCHITECTURE.md`
5. `Context/CODEBASE_MAP.md`

These files contain the table names, key globals, Create/Profile/sidebar rules, and mistakes that previously broke the app.

After meaningful changes, append `Context/CHANGELOG.md` and update the relevant Context handoff files before handing off.
