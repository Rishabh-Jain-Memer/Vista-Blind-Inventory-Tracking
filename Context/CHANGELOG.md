# Changelog

## 2026-06-20 - Isolated Supabase Project Wiring

- Wired `js/config.js` to the isolated Supabase project `knawjdrsdqgyfzqzddix` using the public publishable key.
- Updated `dev-environment.html`, `README.md`, `STAGING_SETUP.md`, `Context/CURRENT_STATE.md`, `Context/ARCHITECTURE.md`, and `Context/AI_GUARDRAILS.md` so this clone points future work at the new project, not the original production database.
- Verified the public key reaches the new Supabase REST API; `profiles` currently returns table-not-found, so the database schema still needs migrations applied through a direct database connection string or a Supabase CLI account with project access.
- Attempted `supabase link --project-ref knawjdrsdqgyfzqzddix --yes`; the local Supabase CLI profile returned `403`, so linked CLI migrations are blocked until project access is granted.

## 2026-06-09 - Local Staging Lane Setup

- Reworked `js/config.js` so production/non-local hosts always use the live Supabase project, while local hosts can opt into a staging Supabase project through browser localStorage or URL params.
- Added `dev-environment.html` to save/switch local staging Supabase URL and anon key without editing code.
- Added a visible yellow `STAGING DB` badge on app pages when local development is connected to staging.
- Added `STAGING_SETUP.md` with the staging Supabase setup, restore, Auth-user, and workflow-testing checklist.
- Added `scripts/generate_restore_sql_from_backup.py` and `scripts/restore_backup_to_staging.ps1` for staging data restore from the backup workbook while refusing the known live project ref.
- Updated `scripts/export_supabase_to_excel.mjs` so future backups still read the live Supabase constants after `js/config.js` became environment-aware.
- Rebuilt staging project `vehnkaoutoleonigzuzp` from live public schema metadata through the Supabase Management API, restored backup data into staging, and created a staging admin Auth login for `rishabhmjain2006@gmail.com`.

## 2026-06-09 - Supabase Backup Restore

- Restored linked Supabase project `akjybtvaezxayfwtpifd` from `exports/vista_supabase_backup_2026-06-06T06-29-40.xlsx`.
- Generated and executed `exports/restore_supabase_backup_2026-06-06T06-29-40.sql` as a transaction through `supabase db query --linked --file`.
- Kept Auth users intact and upserted `public.profiles` from the backup.
- Verified restored counts match the backup, including 421 inventory rolls, 811 inventory movements, 48 orders, 121 order items, 699 order components, 38 tickets, 42 customers, 267 product codes, 100 RRP entries, 10 component recipes, and 83 component rows.
- Verified restored inventory value matches the backup: `SUM(inv_rolls.stock_value) = 7109387.67`, current remaining-value basis `7005232.14`, 418 in-stock rolls, and 3 depleted rolls.
- Restored ticket sequence to continue after `0038`; `generate_order_uid()` now returns `VB-2627-0049`.

## 2026-06-07 - Clean Framework Reset

- Added `supabase/migrations/035_clean_app_data_framework.sql` to clear public app data while preserving the structural framework: schema, RLS, functions/RPCs, triggers, Supabase Auth users, and profiles by default.
- The migration clears orders, order items/components, tickets/follow-ups, quote and stock-order downloads, stock orders, inventory rows, components, RRP/product-code rows, customers, suppliers, activity logs, wastage, execution logs, and legacy drifted table rows if present.
- Reset ticket numbering so the next ticket starts at `0001` after the cleanup.
- Added a commented optional full account-wipe block for the rare case where `auth.users` and `public.profiles` should also be removed after an admin recreation plan is ready.
- Updated `RESET_GUIDE.md`, `supabase/migrations/README.md`, `Context/AI_RULES.md`, `Context/AI_GUARDRAILS.md`, `Context/CURRENT_STATE.md`, and `Context/ARCHITECTURE.md` so future agents read Context first and append/update Context after meaningful changes.
- Executed migration 35 against the linked Supabase project `akjybtvaezxayfwtpifd` with `supabase db query --linked --file supabase\migrations\035_clean_app_data_framework.sql`.
- Verified checked app tables are empty, ticket sequence is reset to the next `0001`, and admin profiles remain available for login.

## 2026-05-25 - Grouped Billing PDF

- Replaced the order-detail PDF billing table with grouped billing lines built from saved `order_items`.
- Matching blind rows now group by blind/detail, fabric/part detail, dimensions, unit, and rate so past orders and new orders render repeated identical blinds as one quantity line.
- The PDF now shows neutral columns (`Item`, `Quantity`, `Measure`, `Bill Qty`, `Rate`, `Amount`) while each row uses type-specific wording: blinds and measured direct items show area, tracks show chargeable length as reference with per-track billing, and raw/material unit rows show their own unit or length basis.
- Expanded the on-page order item card header so direct orders, blinds, tracks, and raw-material rows show saved item identity details instead of only the item title and measurements.

## 2026-05-24 - Sales Order Visibility

- Fixed sales order visibility so sales users can see orders created by any sales profile.
- Removed the sales-only `customer_id` list filter from `js/orders.js` and the sales-only redirect from `js/order-detail.js`.
- Added migration `026_sales_order_read_access.sql` and updated migration `012` so RLS allows sales users to read all orders plus order items/components/wastage detail through `can_view_order` without widening write/delete access.
- Fixed sales Create Order calculations so discount, sell rate, line total, and grand total stay visible while purchase cost/margin stay hidden.
- Updated sales-side order assignment so sales users can assign executers on shared open orders, backed by migration `027_sales_order_update_access.sql`.
- Reworked Tickets into a CRM-style queue plus dedicated `ticket-detail.html` page. Clicking a ticket opens the full customer context, next action, requirement detail, and follow-up timeline. Follow-up actions now appear before Create Order.
- Added migration `028_employee_profile_read_access.sql` so employee roles can resolve ticket creator, owner, and follow-up author names instead of seeing profile UUIDs.
- Added migration `029_ticket_sequential_numbering.sql` so tickets use `TKT-NNNNDDMMYY` numbering and existing tickets are backfilled by creation order.
- Removed the visible ticket date entry/list field; ticket date now comes from the database default/creation time and the `TKT-NNNNDDMMYY` number.
- Restored a hidden defensive `inquiry_date` value in ticket inserts and added migration `031_ticket_inquiry_date_default.sql` so ticket creation stays stable without showing a date field.
- Expanded order-detail editing so sales/admin can edit direct-order dimensions after creation and add finished goods, raw material, track, or direct-order items with the same billing calculations used by Create Sales Order.
- Fixed sales order editing by showing the edit action to sales on open orders and adding migration `030_sales_order_item_edit_access.sql` for line-item/component writes.
- Expanded order-detail editing so direct orders can edit width/height dimensions and added-order rows support finished goods, raw material, track, and direct order item types.
- Refreshed README and Context migration notes through migration 30.

## 2026-05-18 - Personal Repo And Vercel Transfer Prep

- Moved the local Git remotes to the private personal GitHub repository `RishabhJain1950/Timbervision-Vista-Blind-Tracking-System`.
- Added `vercel.json` for Vercel static hosting with basic security headers.
- Added `DEPLOYMENT_TRANSFER.md` with the GitHub, Supabase ownership transfer, Vercel deploy, and verification checklist.
- Updated `supabase/functions/admin-users` so production deployments can restrict CORS with an `ALLOWED_ORIGINS` Edge Function secret while preserving the current wildcard behavior until the Vercel domain is known.
- Removed the Vercel deployment path after switching back to GitHub Pages as the production host, and updated `DEPLOYMENT_TRANSFER.md` with GitHub Pages setup steps.

## 2026-05-16 - Vertical Blind Stock Rate Refresh

- Added migration `022_refresh_vertical_blinds_stock_rates.sql`.
  - Refreshes the complete `Vertical Blind Fabrics` stock/rate set from the updated `Excel File/Vertical Blinds Stock.xlsx`.
  - Updates matching imported rolls and their initial inflow ledger rows by variant + batch code.
  - Preserves already-consumed quantity on existing rolls instead of blindly resetting remaining stock.
  - Keeps scope limited to the vertical blind import category/note so unrelated inventory is untouched.
- Added `scripts/generate_vertical_blinds_stock_refresh_sql.py` for repeatable future vertical-stock refreshes.
- Updated README and Context migration lists through migration 22.

## 2026-05-15 - Executer Production Save + Execute Fix

- Added migration `019_execute_order_rpc_and_executor_wastage_update.sql`.
  - Defines `public.execute_order(...)` for the executer/order-detail Execute buttons.
  - Deducts fabric, raw material/resale items, and components server-side.
  - Marks orders, order items, and components as executed/deducted.
  - Adds an executer-safe `wastage_logs` update policy for assigned production orders.
- Fixed migration 19 reruns on databases with an older `execute_order(uuid, uuid)` by dropping that function before recreating it.
- Added migration `020_order_item_input_measurements.sql` for optional original input measurements on future order items.
- Updated `js/executer-dashboard.js` so actual fabric cut width, cut length, and selected roll save immediately to `wastage_logs` instead of only being captured at final Execute click.
- Removed the old frontend workaround that temporarily wrote capitalized `Processing` before calling the RPC and stopped querying the executer queue with capitalized status values; current statuses remain lowercase (`inquiry`, `processing`, `executed`, `completed`).
- Updated order detail and executer production item displays to show dimension conversions across cm, m, inches, and feet. Track rows now show input length, rounded chargeable length, and metre conversion separately.
- Track component quantities entered in metres are converted back to stored feet for execution, so an 8 ft track shows about 2.438 m instead of 8 m.
- Executer users no longer see executed/completed history on the executer dashboard; completed work drops out of the production side after execution.
- Refreshed README and Context migration lists through migration 20.

## 2026-05-10 - Context Refresh + Add Stock Product Link Fix

- Updated README/context handoff docs through migration 16:
  - product code catalog/order item links
  - order invoice fields
  - full blind-family RRP price maps
  - Torrent inventory product-link repair
- Fixed Add Stock inline variant creation so a newly typed item/material creates or reuses the matching `inv_products` row under the selected category before creating the `inv_variants` row.
- Reviewed the static app for leaked service-role keys/stale schema names and ran JavaScript syntax checks across all page controllers.

## 2026-05-09 - Deployment Hardening + Sales Create Order Fix

- Removed the Supabase service-role key from browser code.
- Added secure admin user management through `supabase/functions/admin-users`; deploy it with `SUPABASE_SERVICE_ROLE_KEY` as a server-side function secret.
- Added `012_security_hardening.sql` to revoke anonymous table access and re-enable RLS for active app tables.
- Fixed the Create Order iframe embed so the normal sidebar/app shell is hidden before first paint, preventing the brief blue sidebar flash for sales users.
- Fixed sales Create Order visibility so the money summary is hidden while the Submit Order button remains available.

## 2026-05-07 - RRP Catalog + Auto-fill Selling Rate + Discount

- Added `rrp_entries` table via migration `011_rrp_catalog.sql` (generated by `scripts/generate_011.py`).
  - Source: `Excel File/Vista Dealer RRP April 2026.xlsx` — Roller sheet only; other blind sheets reserved for later.
  - 25 fabrics across 3 groups: Screen (4), Translucent (4), Blackout (17).
  - Columns: `blind_type`, `fabric_group`, `fabric_name`, `width_max`, `uom`, `rrp_wo_headrail`, `rrp_w_headrail`, `rrp_w_plain_cassette`, `rrp_w_dec_cassette`.
  - DP is always RRP ÷ 2 and computed in the app; no separate DB column needed.
  - RLS: authenticated read, admin write.
- Added `rrp.html` + `js/rrp.js` — new admin-only RRP management page.
  - Table grouped by fabric group (Screen / Translucent / Blackout) matching Excel layout.
  - Inline cell editing: click any RRP cell → edit → Tab/Enter to commit, Escape to cancel.
  - DP column auto-updates (computed = RRP ÷ 2, shown read-only).
  - Unsaved-changes bar with Save and Discard buttons.
  - Only Roller Blinds tab active; Other Blinds tab shows "Soon" and is disabled.
- Added `RRP` tab to admin sidebar (`js/sidebar.js`), between Components and Create.
  - `rrp.html` added to `adminOnlyPages` list so non-admin roles are redirected.
- Modified `js/create-order.js`:
  - Loads `rrp_entries` on init alongside other data.
  - Added `lookupRRP(fabricName, subType)` — normalised name match against `allRRP`, maps sub-type to the right DB column.
  - `selectFabVar(i, v)` auto-fills the rate field from RRP when a Roller Blind sub-type + fabric combo has a matching entry.
  - `onSubTypeChange(i)` also re-applies RRP when the user switches sub-type with a fabric already selected.
  - Renamed "Selling Rate" label to "RRP" in the rate input row.
  - Added a **Discount %** field next to the rate input.
  - `calcItem` and `submitOrder` both apply the discount: `sellRate = rate × (1 − disc/100)`. Revenue and line totals use `sellRate`; cost stays at purchase rate.
  - Financial breakdown row shows `Sell: ₹X/m² (−Y%)` badge when a discount is active.

## 2026-05-07 - Components Naming, Blind Refresh, Track Import

- Changed visible app wording from `Recipes` to `Components` on the admin BOM management page and sidebar while keeping legacy schema/file names (`product_recipes`, `recipe_items`, `recipes.html`, `js/recipes.js`) stable.
- Refined `recipes.html` into a Profiles-style drill-in flow:
  - click a blind product to open its full component detail
  - click a track product to open its full component detail
  - edit inventory-linked component rows from the same modal flow
- Updated `js/recipes.js` so component selection stays inventory-linked and user-facing labels consistently say Components.
- Regenerated `009_refresh_recipe_catalog.sql` from the updated blind component workbook:
  - skips unmatched rows instead of inserting `NULL variant_id`
  - prefers category-aware inventory matching with safer fallback matching
- Added `010_import_track_recipes.sql` to import DB-backed component rows for:
  - `Super Track`
  - `Jumbo Track`
  - `M Track`
- Updated `js/create-order.js` and `js/order-detail.js` so track orders/components prefer DB-backed component rows when present instead of only frontend constants.
- Updated Context docs so future AI understands:
  - visible wording is `Components`
  - schema still uses legacy recipe table names
  - blind components refresh from migration 9
  - track components import from migration 10

## 2026-05-07 - Create, Profiles, Sidebar Stabilization

- Added the `create.html` sidebar page as the combined Create workflow.
- Added `js/create.js` for Add Stock:
  - Supplier selector/new-supplier flow.
  - Optional supplier phone/contact fields.
  - Shared bill details.
  - Multiple inward item cards per bill.
  - Inline category/product/variant creation.
  - Inserts inward rows into `inv_rolls` and ledger rows into `inv_movements`.
- Embedded `create-order.html?embed=1` inside Create while preventing nested form scrolling.
- Added iframe auto-height messaging between `js/create-order.js` and `js/create.js`.
- Fixed Create Order visible item labels so deleting/re-adding items keeps labels continuous.
- Moved Add Stock's "Add Item" button below the item cards so it is pushed down as more items are added.
- Removed visible Add Stock/New Variant/Restock actions from Inventory directionally; Inventory should act as the current stock view.
- Fixed Create Order recipe loading to avoid Supabase schema-cache relationship errors by loading `recipe_items` separately and mapping variants in JS.
- Normalized active order statuses to `inquiry`, `processing`, `executed`, and `completed`.
- Ensured customer phone is optional in order customer creation.
- Updated Reports outward behavior direction: completed orders only.
- Added supplier profile creation/delete support and RLS fallback behavior.
- Added Suppliers to Reports inward supplier filter even when a supplier has no current inward rows yet.
- Added drag-to-reorder sidebar tabs in `js/sidebar.js`, persisted per role in browser `localStorage`.
- Made Profiles UI more consistent across Employees, Customers, and Suppliers using shared toolbar classes.
- Updated Context files with the current source-of-truth variables, routes, guardrails, and do-not-break rules.

## 2026-05-06 - Local Codebase Cleanup

- Promoted the clean inventory reset/import SQL flow into `supabase/migrations`.
- Removed stale historical migrations, duplicate custom migration folder, old import scripts, package files, local `node_modules`, and old Supabase reference SQL files.
- Added file-level ownership comments to active HTML, CSS, and JavaScript files.
- Renamed the visible admin navigation/header from "Settings" to "Profiles" while keeping `settings.html` as the stable route.
- Rewrote `README.md`, `RESET_GUIDE.md`, `Context/ARCHITECTURE.md`, and `Context/CURRENT_STATE.md` to describe the current app instead of older schema eras.
- Audited all three Excel files, verified live inventory import totals, and added `004_import_supporting_workbooks.sql` for component recipes plus `fg_stock`.
- Added `Context/AI_GUARDRAILS.md` with table names, globals, valuation rules, verification SQL, and common AI mistakes to avoid.
- Added `005_profiles_suppliers_support.sql` for supplier profile records used by the Profiles page.
- Added `006_fix_profile_optional_fields_and_rls.sql` to repair optional customer/supplier profile fields and supplier RLS.
- Added `007_order_statuses_and_supplier_rls_repair.sql` to drop lingering supplier policies and normalize order statuses.

## Working Rule Going Forward

Do not reintroduce old migration chains or one-off import scripts unless we intentionally design a new importer. The clean database path is:

1. `supabase/migrations/001_reset_rebuild_inventory_schema.sql`
2. `supabase/migrations/002_import_inventory_inflow_new.sql`
3. `supabase/migrations/003_disable_inventory_rls_for_app.sql`
4. `supabase/migrations/004_import_supporting_workbooks.sql`
5. `supabase/migrations/005_profiles_suppliers_support.sql`
6. `supabase/migrations/006_fix_profile_optional_fields_and_rls.sql`
7. `supabase/migrations/007_order_statuses_and_supplier_rls_repair.sql`
8. `supabase/migrations/008_order_executor_assignment.sql`
9. `supabase/migrations/009_refresh_recipe_catalog.sql`
10. `supabase/migrations/010_import_track_recipes.sql`
11. `supabase/migrations/011_rrp_catalog.sql`
12. `supabase/migrations/012_security_hardening.sql`
13. `supabase/migrations/013_product_codes.sql`
14. `supabase/migrations/014_order_invoice_details.sql`
15. `supabase/migrations/015_rrp_catalog_all_blinds.sql`
16. `supabase/migrations/016_repair_torrent_inventory_link_and_delete_cleanup.sql`
17. `supabase/migrations/017_order_decimal_quantities_and_rollback_dedupe.sql`
18. `supabase/migrations/018_cleanup_failed_order_headers.sql`
19. `supabase/migrations/019_execute_order_rpc_and_executor_wastage_update.sql`
20. `supabase/migrations/020_order_item_input_measurements.sql`
21. `supabase/migrations/021_import_vertical_blinds_stock.sql`
22. `supabase/migrations/022_refresh_vertical_blinds_stock_rates.sql`
