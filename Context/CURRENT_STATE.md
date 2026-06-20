# Current State

Last updated: 2026-06-20.

## Isolated Clone Created On 2026-06-20

- This checkout was cloned into `D:\Downloads\Vista Blind\Vista Blind Tracking New` from the active local app folder and attached to `https://github.com/Rishabh-Jain-Memer/Vista-Blind-Inventory-Tracking.git`.
- `js/config.js` is intentionally not configured with the original production Supabase URL/key. The app fails closed until the new Supabase project URL and anon/publishable key are added, or local testing is pointed at a separate project through `dev-environment.html`.
- The copied original Supabase project refs in older Context/docs are historical safety references. Do not treat them as the target database for this new clone.
- The Supabase CLI can see an older `Vista Blind Dev Environment` project (`vehnkaoutoleonigzuzp`), but it is currently `INACTIVE` and did not return API keys during setup.

## Staging Lane Added On 2026-06-09

- `js/config.js` now forces live Supabase on production/non-local hosts and allows staging only on local hosts (`localhost`, `127.0.0.1`, `::1`).
- `dev-environment.html` stores staging Supabase URL/anon key in the local browser and switches local testing between live and staging without editing code.
- App pages show a yellow `STAGING DB` badge when local testing is connected to staging.
- `STAGING_SETUP.md` documents the required staging Supabase project setup, schema/data restore, staging Auth user setup, and local workflow checks.
- `scripts/generate_restore_sql_from_backup.py` generates public-table restore SQL from a backup workbook.
- `scripts/restore_backup_to_staging.ps1` restores backup data to an explicit `STAGING_DB_URL` and refuses the known live project ref `akjybtvaezxayfwtpifd`.
- `scripts/export_supabase_to_excel.mjs` now reads the live constants from `js/config.js` after the config switch, unless `SUPABASE_URL` / `SUPABASE_ANON_KEY` are provided.
- Staging Supabase project `vehnkaoutoleonigzuzp` is now available as `Vista Blind Dev Environment`.
- Because direct Postgres ports were blocked locally, staging was rebuilt through Supabase Management API HTTPS calls using live as a read-only schema source.
- Staging public schema was rebuilt from live public schema metadata, then restored from `exports/vista_supabase_backup_2026-06-06T06-29-40.xlsx`.
- Staging restore verification on 2026-06-09: profiles 7, customers 42, inv_rolls 421, inv_movements 811, product_codes 267, orders 48, order_items 121, order_components 699, wastage_logs 58, activity_logs 152, order_tickets 38, order_ticket_followups 6, order_quote_forms 1, order_quote_downloads 5.
- Staging Auth has an admin login for `rishabhmjain2006@gmail.com`; do not record the password or service-role key in repo files or Context docs.
- Local staging setup page is served at `http://127.0.0.1:8000/dev-environment.html` when the static server is running.

## Supabase Data Restored On 2026-06-09

- The linked Supabase project `akjybtvaezxayfwtpifd` was restored from `exports/vista_supabase_backup_2026-06-06T06-29-40.xlsx`.
- Restore SQL was generated at `exports/restore_supabase_backup_2026-06-06T06-29-40.sql` and executed with `supabase db query --linked --file exports\restore_supabase_backup_2026-06-06T06-29-40.sql`.
- Auth users were not modified. Existing `public.profiles` were upserted from the backup.
- Restored row counts verified against the backup: profiles 7, customers 42, inventory categories/products/variants/rolls/movements 18/170/306/421/811, product codes 267, components 10 recipes and 83 items, RRP 100, orders/items/components 48/121/699, wastage logs 58, activity logs 152, tickets/follow-ups 38/6, quote forms/downloads 1/5.
- Backup had no suppliers, `fg_stock`, execution logs, stock orders, stock order items, or stock order downloads; those tables correctly remain at 0.
- Inventory valuation after restore matches the backup: `SUM(inv_rolls.stock_value) = 7109387.67`, remaining-value basis `7005232.14`, 418 `in_stock` rolls, and 3 `depleted` rolls.
- Ticket sequence was restored to `last_value = 38`; next ticket should continue after `0038`.
- `public.generate_order_uid()` returns `VB-2627-0049`, so sales order numbering continues after the restored 48 orders.
- Referential checks after restore found no missing `order_components.order_item_id` links and no missing `wastage_logs.roll_id` links.

## Clean-Framework Reset Executed On 2026-06-07

- A full public app-data cleanup path now exists at `supabase/migrations/035_clean_app_data_framework.sql`.
- Migration 35 was executed against the linked Supabase project `akjybtvaezxayfwtpifd` through `supabase db query --linked --file supabase\migrations\035_clean_app_data_framework.sql`.
- The cleanup starts the next development phase from an empty structural framework. It preserves tables, columns, indexes, RLS policies, triggers, functions/RPCs, and Supabase Auth users/profiles by default.
- The default wipe clears inventory/catalog rows, order/ticket/quote/stock-order/download rows, customers, suppliers, activity logs, wastage/execution records, and legacy drifted table rows if those old tables still exist.
- Verification after execution showed `0` rows in checked app tables: orders, order items/components, tickets/follow-ups, inventory hierarchy/ledger, customers, suppliers, stock orders/items, components, RRP/product-code catalogs, activity logs, and wastage logs.
- Ticket numbering was reset; `order_ticket_number_seq` is at `last_value = 1` with `is_called = false`, so the next ticket starts again at `0001`.
- Admin profiles were preserved so the app still has admin login access.
- The optional full account wipe at the bottom of migration 35 is intentionally commented out. Only run it separately if the owner is ready to recreate the first admin user from Supabase Auth/dashboard or the `admin-users` Edge Function.
- Future agents must read the Context folder before coding and append/update Context after meaningful changes, especially database resets, table changes, routing changes, and workflow changes.

## Cleanup Completed

The local codebase has been reduced to the active static app files, shared JS modules, clean Supabase migration lane, and context documentation.

Future agents should read `Context/AI_GUARDRAILS.md` before touching database names, valuation logic, route names, or import logic.

Removed from the working tree:

- Historical Supabase migrations that referenced old schemas.
- Duplicate custom migration folder.
- Old Python/Node import scripts.
- Local package files and `node_modules`, because the frontend has no build step.

## Current Feature Direction

- Profiles now has Employees, Customers, and Suppliers.
- Tickets is now a top-level sidebar tab for all employee roles.
- Employee profiles drill into recent activity log rows.
- Customer profiles summarize order count/value and list linked orders.
- Supplier profiles summarize inward purchases by month, bill number, date, and line item.
- Supplier purchase line items link back into Inventory through variant deep links.
- Reports can be opened with supplier/customer query filters from profile pages.

## Current UI State On 2026-05-07

- `create.html` is the main "Create" sidebar tab.
- `Create > Create Purchase Order` is sectioned as Supplier, Bill Details, Stock Order Form, and Items.
- Create Purchase Order supports multiple supplier-order line items under one supplier bill/order reference.
- Create Purchase Order supplier selection follows the same pattern as Create Order customer selection:
  - Select an existing supplier; only the selected supplier chip/details are shown.
  - Or create a new supplier inline with optional contact fields.
  - Supplier phone is optional.
- Create Purchase Order now creates a pending supplier stock order first:
  - New supplier profiles go to `suppliers`.
  - Stock order headers go to `stock_orders`.
  - Stock order lines go to `stock_order_items`.
  - Printable supplier form snapshots go to `stock_order_downloads`.
  - Inventory batches and ledger rows are written to `inv_rolls` and `inv_movements` only after the stock order is opened and received from `stock-order-detail.html`.
- The Create Purchase Order "Add Item" button sits below the current item cards so newly added items push it downward.
- `Create > Create Order` embeds `create-order.html?embed=1`, but the iframe now auto-resizes using `postMessage` so the Create tab scrolls as one page instead of trapping the form in a nested scroll.
- `tickets.html` writes pre-order inquiry records to `order_tickets`. New tickets store typed customer name/mobile, inquiry-for, location, allocation, status, remarks, and the converted `orders.id` once confirmed, then open the dedicated ticket detail page. The inquiry date is database-managed and not shown as a ticket entry field.
- Follow-ups are append-only rows in `order_ticket_followups`. The latest follow-up updates the ticket status/visible remarks, while older follow-ups remain visible as uneditable history.
- Ticket conversion opens `create.html?tab=order&ticket=<id>`, which loads the existing `create-order.html?embed=1&ticket=<id>` form. If the ticket is already linked to a customer it selects that profile; otherwise it prefills the Create Order new-customer form from the typed ticket name/mobile. The ticket is marked `converted` only after the normal order/items/components insert succeeds.
- Create Order item labels are visually renumbered after delete/add. Internal item IDs remain unique, but the UI should show continuous labels like `Item 1`, `Item 2`.
- Sidebar tabs can be drag-reordered for admin/staff sidebars. The order is stored in browser `localStorage` by role and applied by `js/sidebar.js`.
- Profiles toolbars are now consistent across Employees, Customers, and Suppliers.
- Admin now has an admin-only `Components` sidebar tab at `recipes.html`.
- Visible wording across the app should say `Components`, not `Recipes`, even though the database still uses `product_recipes` and `recipe_items`.
- Blind component products now use the same drill-in style as Profiles: click a product, open it fully, then edit its linked inventory components.
- Track components are no longer read-only shells once imported. They are meant to become DB-backed rows through migration 10.

## Active Order Status Values

Use only these current statuses in app code and SQL:

```text
inquiry
processing
executed
completed
```

Outward reports should only count/show completed orders.

## Supabase Verification On 2026-05-06

After running migrations 1-3, live Supabase was reachable through the app REST API and showed:

- `inv_categories`: 12
- `inv_products`: 144
- `inv_variants`: 276
- `inv_rolls`: 315
- `inv_movements`: 315
- `SUM(inv_rolls.stock_value)`: Rs 65,79,451.25

Supporting tables before migration 4:

- `product_recipes`: 0
- `recipe_items`: 0
- `fg_stock`: missing

Migration 5 adds the `suppliers` table used by the Suppliers tab in Profiles.
Migration 6 repairs optional profile fields and disables profile-table RLS for the current frontend flow.
Migration 7 drops lingering supplier RLS policies and normalizes order statuses to `inquiry`, `processing`, `executed`, and `completed`.
Migration 8 adds order executer assignment support.
Migration 9 refreshes blind component definitions from the updated workbook while preventing `NULL variant_id` inserts.
Migration 10 imports the 3 track component products into `product_recipes` and `recipe_items`.
Migration 11 adds Roller Blind RRP pricing.
Migration 12 is the deployment security pass: anonymous table grants are revoked, RLS is enabled for active app tables, and admin user management moves to the `admin-users` Supabase Edge Function.
Migration 13 adds the `product_codes` catalog and links order items to product code/name fields.
Migration 14 adds optional order invoice number/date fields.
Migration 15 expands `rrp_entries` with `price_map` data for all blind families while keeping DP app-computed as RRP / 2.
Migration 16 repairs Torrent fabric inventory links by moving Torrent variants from incorrect parent products to matching Torrent products.
Migration 17 converts order quantities/component quantities to numeric-safe columns and dedupes duplicate rollback ledger rows.
Migration 18 removes empty zero-total inquiry order headers left behind by failed order item inserts.
Migration 19 restores the `execute_order` RPC and lets assigned executers save fabric cut/roll details in `wastage_logs` before execution.
Migration 20 adds optional original input measurement columns to `order_items` so future orders can show raw input values next to normalized/rounded dimensions.
Migration 21 imports `Excel File/Vertical Blinds Stock.xlsx` into inventory as append-only vertical fabric stock: category `Vertical Blind Fabrics`, 16 variants, 95 stock rolls, and Rs 53,66,790.00 stock value.
Migration 22 refreshes the complete `Vertical Blind Fabrics` stock/rate set from the updated `Vertical Blinds Stock.xlsx`: 95 stock rolls, 16 variants, 8,067 m, and Rs 1,67,364.00 stock value. It updates matching imported rolls/ledger rows by variant + batch code and preserves already-consumed quantity if any vertical stock was deducted.
Migration 23 adds `order_tickets` for pre-order customer requirement capture and conversion into confirmed orders.
Migration 24 opens ticket read/write RLS policies to all authenticated employee roles so the sidebar Tickets page works for admin, sales, and executer users.
Migration 25 adds ticket inquiry fields (`inquiry_date`, typed customer name/mobile, inquiry-for, location, allocation) and immutable `order_ticket_followups` history.
Migration 26 fixes sales order visibility under RLS. Sales users can read every order plus order items/components/wastage detail through `can_view_order`, while write access remains governed by the stricter `can_access_order` policies.
Migration 27 opens order update access to sales users so shared sales workflows such as executer assignment work across orders created by any sales profile. Order delete remains admin-only.
Migration 28 opens employee profile display reads to employee roles so ticket creator, owner, and follow-up author names resolve instead of leaking profile UUIDs.
Migration 29 replaces random ticket IDs with database-generated `TKT-NNNNDDMMYY` IDs. Existing tickets are backfilled by creation order, and new tickets use the same sequence trigger.
Migration 30 lets sales users edit order items/components on shared open orders, matching the visible edit controls in `order-detail.html`.
Migration 32 changes ticket IDs from `TKT-NNNNDDMMYY` to plain sequence numbers such as `0001`, `0002`, while preserving database-side generation.
Migration 33 adds `order_quote_forms` for the latest editable Quote / Proforma Invoice defaults per order and `order_quote_downloads` for every generated quote snapshot.
Migration 34 adds `stock_orders`, `stock_order_items`, and `stock_order_downloads` so Create > Create Purchase Order creates a pending supplier stock order with download history before inventory is received.
Migration 35 clears public app data for a clean structural framework while preserving schema/RLS/functions and keeping Auth users/profiles by default.

## Current UI State On 2026-06-04

- `create-order.html` now has a `Quote / Proforma Invoice` section between Order Details and Items. Billing address, delivery address, intro copy, payment terms, tax rates, and bank details are saved to `order_quote_forms` when the order is created.
- `order-detail.html` uses saved quote/proforma defaults when opening the Quote editor. Generating a quote updates the latest saved form data and inserts a snapshot into `order_quote_downloads`; the Downloads button next to Quote lists previous generated copies for redownload.
- Quote/proforma document metadata is separate from production billing math. Line rows still start from persisted `order_items` unless a saved quote version already has edited rows.
- `create.html` Create Purchase Order now creates a pending stock order instead of immediately adding live inventory. The new Stock Order Form fields store billing address, delivery address, dispatch/contact details, terms, freight, and instructions in `stock_orders.order_form_data`.
- `orders.html` has separate Sales Orders and Stock Orders sections for admins. Stock order rows open `stock-order-detail.html`.
- `stock-order-detail.html` can generate/redownload stock form snapshots and has the receive action labeled Receive Stock. Receiving a pending stock order inserts the same `inv_rolls` and `inv_movements` rows that reports and supplier profiles already read.

## Current UI State On 2026-05-24

- Sales users should see all non-deleted orders on `orders.html`, regardless of which sales profile created the order. The sales view still hides total/cost/profit/export controls.
- `create-order.html` and `order-detail.html` use the same sales math as admin for area, discount, sell rate, line total, and grand total. Purchase cost, profit margin, and admin financial summaries stay hidden for sales.
- `order-detail.html` no longer redirects sales users away from orders created by another profile. Sales users can assign executers and edit line items on any inquiry/processing order.
- `order-detail.html` PDF billing is generated from persisted `order_items`, not from the Create Order form. Identical item/detail/dimension/rate rows are grouped into one billing line with neutral columns (`Item`, `Quantity`, `Measure`, `Bill Qty`, `Rate`, `Amount`). Each row adapts by type: blinds and measured direct items show area, tracks show chargeable length as reference with per-track billing, and raw/material rows show their own unit or length basis. The PDF footer shows only the grand total amount.
- `tickets.html` is now a CRM-style ticket queue. Clicking a ticket opens `ticket-detail.html?id=<ticket_id>` with customer context, owner/status/next action, requirement notes, append-only follow-up timeline, and order handoff. Row/detail actions show Follow-up before Create Order.
- `ticket-detail.html` resolves `created_by`, `allocated_to`, and follow-up `remark_by` through employee profiles. Live Supabase needs migration 28 for all employee roles to see those staff names.
- Ticket IDs are assigned by Supabase, not browser code. After migration 32, the visible ticket format is a plain sequence such as `0001`, `0002`.
- `tickets.html` no longer shows an inquiry date field or list column. The insert still sends today's date defensively, Supabase defaults the date from creation, and migration 31 reasserts that default.

## Current UI State On 2026-05-15

- Executer-side fabric cut width, cut length, and selected roll inputs save immediately to `wastage_logs` from the production queue.
- Execute actions use the server-side `execute_order` RPC. The RPC deducts fabric, raw material/resale items, and components, then marks order/items/components as executed/deducted.
- Order detail and executer production views show normalized dimension conversions across cm, m, inches, and feet. Track lengths show input feet, rounded chargeable feet, and converted metres separately.
- Executer users only see active processing work; executed jobs are removed from the executer queue/history display after completion.

## Current UI State On 2026-05-10

- Create Purchase Order inline item creation now creates/uses an `inv_products` row matching the entered item/material name in the selected category before creating the `inv_variants` row.
- This avoids grouping new variants under the first available category product and aligns the frontend with the Torrent link repair in migration 16.

## Important Naming Note

`settings.html` and `js/settings.js` are historical filenames. The visible app label is now "Profiles" because the page manages team users and customer profiles.

`create-order.html` is still the full order form. `create.html` is the combined Create tab that includes Create Purchase Order and embeds Create Order.

`recipes.html` and `js/recipes.js` are historical filenames. The visible app label is now "Components".
