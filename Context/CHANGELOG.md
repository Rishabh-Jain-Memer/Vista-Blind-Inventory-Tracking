# Changelog

## 2026-06-28 - UI Polish And Dev Environment Cleanup

- Removed the browser-facing dev-environment/staging switch now that this clone already uses the isolated New Supabase project.
- Deleted `dev-environment.html`, `STAGING_SETUP.md`, and the old staging restore helper scripts.
- Simplified `js/config.js` so browser pages always use `knawjdrsdqgyfzqzddix`.
- Refined the Admin Test Mode UI on Profiles and Settings with shared `css/style.css` classes, clearer status text, and consistent card layout.
- Added a responsive Profiles tab strip so Employees, Customers, and Suppliers do not clip on phone-width screens.
- Updated README and Context handoff docs so future work does not expect the removed dev-environment page or localStorage Supabase switching.

## 2026-06-24 - App Username Login And Temporary Full Role Visibility

- Replaced browser Supabase Auth login usage with database-backed username/password login.
- Added `011_app_level_username_auth.sql` with `profiles.username`, password hashes, `app_sessions`, and RPCs for login, logout, admin profile creation/edit/delete, own profile update, and current-password-verified password changes.
- Updated `login.html` / `js/login.js` to use plain username and password instead of email/password.
- Updated `js/auth.js` so protected pages use the app session token from local storage.
- Gave all roles full website sidebar/page visibility for now; access reduction can be added later one role at a time.
- Kept profile creation/mutation admin-gated in the Profiles UI and profile RPCs.
- Updated personal Settings so users must enter current password plus matching new password fields before changing password.

## 2026-06-24 - New Project Manual-Entry Reset

- Wiped the linked New Supabase project again so catalog, CRM, inventory, RRP, wastage, activity, supplier, customer, order, ticket, master, mechanism, and import-helper tables are empty for manual website entry.
- Preserved the schema/framework, functions, triggers, RLS, frontend files, and the single admin Auth/profile user `rishabhmjain2006@gmail.com`.
- Reset public sequences, including `order_ticket_number_seq`, so new manual tickets and records start cleanly.
- Confirmed all public app tables except `profiles` have zero rows, and `profiles` / `auth.users` each contain only the preserved admin account.

## 2026-06-24 - Vista Inflow Rishi Master Structure Import

- Added `010_import_vista_inflow_rishi_masters.sql` for the new `Excel File/Vista-Inflow Data to Rishi.xlsx` workbook.
- Parsed the workbook as structure-only source data and deduplicated repeated RM/FG/inventory rows into masters.
- Imported fabric hierarchy under Fabrics for Roller Blind, Sheer Dimout, and S-Contour, including patterns like `Roller Blind > Screen Classic > 1% > 111 White`.
- Imported separate Parts, Tracks, and Motors master pages so operational parts and track/motor labels do not mix into fabric combinations.
- Kept this import free of stock quantities, rates, rolls, movements, and RRP values.

## 2026-06-24 - Roles And Quotation Approval Workflow

- Added the four active app roles: `admin`, `management`, `sales`, and `executer`.
- Restricted customer/profile writes to Admin in both UI flow and database policy; non-admin roles can still create tickets and operational records.
- Changed tickets to the three-state CRM model: `active`, `confirmed`, and `cancelled`.
- Changed ticket handoff wording from Create Order to Generate Quotation.
- Generated quotations now create `orders.status = quotation`, remain linked from Tickets, and are hidden from the Orders list until customer confirmation.
- Customer-confirmed quotations move into Orders as `active`.
- Added management approval fields and RPCs so proforma generation is gated by Admin/Management approval.
- Quote output omits GST and bank details; approved proforma output includes GST and bank details.
- Stock is no longer checked at quotation creation. After approval, staff choose either in-house processing or direct order to Vista.

## 2026-06-24 - New Project Data Wipe

- Wiped the linked New Supabase project `knawjdrsdqgyfzqzddix` for a fresh manual setup.
- Cleared app/business/import data from orders, tickets, customers, inventory, masters, mechanisms, RRP, recipes, stock orders, suppliers, wastage, activity logs, and Excel import helper tables.
- Preserved the database schema, RLS, functions, triggers, and frontend framework.
- Removed all other Auth users and profiles, leaving only `rishabhmjain2006@gmail.com` / `Rishabh Jain` as admin.
- Reset `order_ticket_number_seq` so the next ticket starts from a clean sequence.
- Verified key app tables are empty and `public.profiles` / `auth.users` each contain only the preserved admin user.

## 2026-06-21 - Inventory Sync Memory Guard

- Fixed Masters `Sync Inventory` out-of-memory behavior caused by cartesian-combining unrelated branches.
- Grouped/cartesian sync now only runs when all direct root branches with children are skipped dimension labels.
- Added a 5,000 item sync safety limit and bounded name walkers so oversized structures stop with a clear error instead of exhausting memory.

## 2026-06-21 - Masters Internal Tabs

- Split `masters.html` into two internal tabs:
  - Master Structure
  - Mechanisms
- Hid the Master Structure actions when the Mechanisms tab is active so both workflows no longer appear together on the same page.
- Persisted the selected Masters tab in browser local storage.

## 2026-06-21 - Inflow Color/Code Master Seeds

- Updated `003_master_nodes_structure.sql` to seed color/code sub masters from `Excel File/Vista Inventory Inflow New.xlsx`.
- Added 255 structure-only color/code paths across Roller, Sheer Dimout, and S-Contour fabric families.
- Nested those values under a skipped `Color` label so final generated names can include the actual color/code without adding the word `Color`.
- Kept the import structure-only: no stock quantities, rates, rolls, or movement rows are created.

## 2026-06-21 - Mechanism Groups And Excel-Derived Master Seeds

- Expanded `003_master_nodes_structure.sql` to include separate mechanism tables:
  - `mechanism_groups`
  - `mechanism_options`
  - `master_mechanism_groups`
- Seeded first-pass master category structure from `Excel File/Vista Dealer RRP April 2026.xlsx`.
- Seeded mechanism labels from the RRP workbook and `Excel File/Vista Inventory Inflow New.xlsx`, including headrail, cassette, mono mechanism, and laddertape mechanism options.
- Added a Mechanisms section to `masters.html` / `js/masters.js` for creating, editing, deleting, and assigning mechanism groups to selected masters.
- Kept mechanism setup separate from generated master combinations and kept inventory sync limited to zero-stock catalog rows only.
- Added a disabled/syncing state to the Masters `Sync Inventory` button for clearer feedback.

## 2026-06-20 - Masters Edit And Delete Actions

- Added edit action for each master/sub master row.
- Added delete action for each master/sub master row.
- Delete removes the selected `master_nodes` branch and nested sub masters only; already-synced inventory rows are left untouched.

## 2026-06-20 - Masters To Inventory Sync

- Added `Sync Inventory` back to the Masters page.
- Sync generates final item names from the master tree and skips labels marked `exclude_from_pnc_name`.
- Sync writes only zero-stock catalog rows:
  - `inv_categories`
  - `inv_products`
  - `inv_variants`
- Sync does not write rolls, quantities, rates, or movement/report rows.

## 2026-06-20 - Masters Exclude Label And Compact Layout

- Added `exclude_from_pnc_name` to `master_nodes` through `003_master_nodes_structure.sql`.
- Added a compact include/skip toggle on each Masters row so labels like `Color` can be skipped later when final names are generated.
- Tightened the Masters UI by replacing large stat cards with a slim summary and reducing row/body spacing.
- Kept Masters structure-only: no generated combinations are displayed.

## 2026-06-20 - Single Three-Step Supabase Migration Lane

- Removed the old active migration SQL files from `supabase/migrations`.
- Removed the separate `supabase/setup` SQL lane.
- Added the setup SQL into `supabase/migrations` as the new canonical sequence:
  - `001_new_project_empty_schema.sql`
  - `002_link_first_admin_profile.sql`
  - `003_master_nodes_structure.sql`
- Updated docs and the Masters setup warning to reference `003_master_nodes_structure.sql` instead of the old `036` migration.

## 2026-06-20 - Masters Structure-Only Correction

- Reworked `masters.html` / `js/masters.js` so Masters only manages main masters and nested sub masters.
- Added migration `003_master_nodes_structure.sql` for the `master_nodes` hierarchy table.
- Removed the earlier Masters inventory-combination behavior from the active implementation:
  - no pieces
  - no rates
  - no quantities
  - no generated combinations
  - no writes to `inv_categories`, `inv_products`, `inv_variants`, `inv_rolls`, or `inv_movements`
- Updated README and Context docs so future work keeps Masters separate from inventory.

## 2026-06-20 - Website Surface Cleanup And Neutral Masters

- Removed standalone website pages/controllers for RRP, Wastage, Components, and Activity Log:
  - `rrp.html`, `js/rrp.js`
  - `wastage.html`, `js/wastage.js`
  - `recipes.html`, `js/recipes.js`
  - `activity-log.html`, `js/activity-log.js`
- Removed those pages plus standalone Tickets from sidebar routing in `js/sidebar.js`.
- Merged Tickets into Create as a third tab:
  - `create.html` now has Create Purchase Order, Create Sales Order, and Tickets tabs.
  - `tickets.html` supports `?embed=1` and skips its own sidebar in embed mode.
  - `js/create.js` handles ticket iframe height messages and ticket-to-order conversion messages.
- Removed Inventory > Finished Product Code UI and deleted its active startup/controller path from `js/inventory.js`.
- Updated Masters so main masters are neutral groups, not Fabric/Parts/Finished Goods types. This was later corrected on the same date to use `master_nodes` instead of inventory catalog tables.
- Removed the Profiles employee detail link to the deleted Activity Log page.
- Updated README and Context docs for the new website structure.

## 2026-06-20 - Superseded Masters Combination Prototype

- Added admin route `masters.html` with controller `js/masters.js`.
- Added the `Masters` sidebar tab before Inventory for admin users.
- This first prototype used inventory catalog tables and generated combinations. It is no longer the active direction.
- The active direction is the `master_nodes` structure-only flow documented above.
- Inventory now points its header `Masters` button to `masters.html`; stock receiving remains in the Create Purchase Order / stock-order-detail flow.
- Added master-tree styling in `css/style.css`.

## 2026-06-20 - Isolated Supabase Project Wiring

- Wired `js/config.js` to the isolated Supabase project `knawjdrsdqgyfzqzddix` using the public publishable key.
- Updated `dev-environment.html`, `README.md`, `STAGING_SETUP.md`, `Context/CURRENT_STATE.md`, `Context/ARCHITECTURE.md`, and `Context/AI_GUARDRAILS.md` so this clone points future work at the new project, not the original production database.
- Verified the public key reaches the new Supabase REST API; `profiles` currently returns table-not-found, so the database schema still needs migrations applied through a direct database connection string or a Supabase CLI account with project access.
- Attempted `supabase link --project-ref knawjdrsdqgyfzqzddix --yes`; the local Supabase CLI profile returned `403`, so linked CLI migrations are blocked until project access is granted.
- Added `supabase/setup/001_new_project_empty_schema.sql` and `002_link_first_admin_profile.sql` to bootstrap the new Supabase project with empty structural tables and the first admin profile, without importing fabric/catalog data.

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
# 2026-06-28 - Inventory Filters, Mechanism Parts, Test Mode

- Refreshed context handoff docs after the mechanism/test-mode work:
  - updated architecture, current state, codebase map, AI guardrails, and AI rules
  - added `Context/SUPABASE_STATUS.md` with the linked project, CLI limitations, and manual SQL rule
  - updated `Context/SESSION_HANDOFF_2026-06-28.md` so the next session starts from current facts
- Added `015_mechanism_part_links_anon_permissions.sql` after the first 014 run exposed that the browser app needs anon grants/RLS on `mechanism_part_links`.
- Updated Inventory filters to follow Masters: master page first, then main master inside the selected page.
- Kept Inventory search broad across variant/product/category, linked master/page names, roll/batch/bill/supplier fields, and cut pieces.
- Added `supabase/migrations/014_mechanism_part_links.sql` with `mechanism_part_links` for scalable mechanism-to-inventory-part BOM setup.
- Extended Masters > Mechanisms so each mechanism option can link inventory parts with quantity rules, wastage, units, and notes.
- Updated Create Order to include mechanism-linked parts in planned `order_components` and to calculate `orders.cost_amount` as fabric cost plus linked parts/components.
- Added `js/test-mode.js` plus admin-only controls in the visible Settings page and Profiles. Test mode captures browser writes locally and clears them when turned off so admins can test workflows without changing Supabase data.
