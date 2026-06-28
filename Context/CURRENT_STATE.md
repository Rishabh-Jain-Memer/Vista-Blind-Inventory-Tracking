# Current State

Last updated: 2026-06-28.

## Isolated Clone Created On 2026-06-20

- This checkout was cloned into `D:\Downloads\Vista Blind\Vista Blind Tracking New` from the active local app folder and attached to `https://github.com/Rishabh-Jain-Memer/Vista-Blind-Inventory-Tracking.git`.
- `js/config.js` is configured with the new isolated Supabase project `knawjdrsdqgyfzqzddix` at `https://knawjdrsdqgyfzqzddix.supabase.co`.
- The copied original Supabase project refs in older Context/docs are historical safety references. Do not treat them as the target database for this new clone.
- The local Supabase CLI is currently linked to `knawjdrsdqgyfzqzddix`; `supabase projects list` confirmed the linked project on 2026-06-28.
- `supabase db query --linked`, `supabase migration list --linked`, and `supabase db push --linked --dry-run` currently hang without a remote Postgres password/URL. `VISTA_NEW_DB_URL` and `SUPABASE_ACCESS_TOKEN` were not set on 2026-06-28.
- `supabase status` currently fails because local Docker containers are not running/available; this is local Docker status, not remote project health.
- The older browser dev-environment/staging switch has been removed from this clone; browser pages now always use the isolated New Supabase project configured in `js/config.js`.
- The new-project SQL lane now lives only in `supabase/migrations/`: run `001_new_project_empty_schema.sql`, create the first Auth user in Supabase Dashboard, run `002_link_first_admin_profile.sql`, then continue through the current numbered migrations in order.
- `010_import_vista_inflow_rishi_masters.sql` imports structure-only masters from `Excel File/Vista-Inflow Data to Rishi.xlsx`. It deduplicates repeated RM/FG/inventory rows into Fabrics, Parts, Tracks, and Motors master pages without importing quantities, rolls, rates, movements, or RRP values.

## New Project Data Wiped On 2026-06-24

- The linked New Supabase project `knawjdrsdqgyfzqzddix` was wiped clean again for manual data entry.
- Public app/import/catalog tables were truncated with identity reset, including orders, tickets, customers, inventory categories/products/variants/rolls/movements, masters, mechanisms, RRP, recipes, stock orders, suppliers, wastage, activity logs, and Excel import helper tables.
- Schema/framework objects were preserved: tables, columns, constraints, RLS, functions, triggers, and frontend files remain in place.
- Supabase Auth and `public.profiles` now contain only `rishabhmjain2006@gmail.com` / `Rishabh Jain` as admin.
- Verification after the latest reset: every public app table except `profiles` returned 0 rows, `public.profiles` returned 1 row, `auth.users` returned 1 row, and `order_ticket_number_seq` is reset with `last_value = 1` and `is_called = false`.
- The previously imported workbook-derived masters from `010_import_vista_inflow_rishi_masters.sql` were intentionally cleared from the live New database so masters can now be entered manually through the website.

## Browser Dev Environment Removed On 2026-06-28

- `js/config.js` now always uses the isolated New Supabase project `knawjdrsdqgyfzqzddix`.
- Removed `dev-environment.html`, `STAGING_SETUP.md`, and the old browser/localStorage staging restore helpers because this clone itself is the isolated development lane.
- Do not rely on URL parameters or browser localStorage to switch Supabase projects. If a separate staging database is needed later, use explicit direct DB credentials and document the target before running SQL.

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

## Migration Lane Simplified On 2026-06-20

- The old migration chain `001` through `036` was removed from `supabase/migrations` because this clone is being reworked as a new website.
- `supabase/setup/` was removed as a separate SQL lane. Its setup SQL now lives in `supabase/migrations`.
- The active SQL files are the current numbered files in `supabase/migrations`; do not restore old removed migrations unless explicitly asked.
- Do not run or recreate the older import, cleanup, RRP, component, stock-refresh, or historical patch migrations unless the owner explicitly asks to restore legacy data.
- Future agents must read the Context folder before coding and append/update Context after meaningful changes, especially database resets, table changes, routing changes, and workflow changes.

## Cleanup Completed

The local codebase has been reduced to the active static app files, shared JS modules, clean Supabase migration lane, and context documentation.

Future agents should read `Context/AI_GUARDRAILS.md` before touching database names, valuation logic, route names, or import logic.

Removed from the working tree:

- Historical Supabase migrations that referenced old schemas.
- The separate `supabase/setup` SQL lane; setup now runs through `supabase/migrations`.
- Duplicate custom migration folder.
- Old Python/Node import scripts.
- Local package files and `node_modules`, because the frontend has no build step.

## Current Feature Direction

- Active roles are `admin`, `management`, `sales`, and `executer`.
- Login is now app-level database login through `profiles.username`, password hashes, and `app_sessions`; frontend pages no longer use Supabase Auth sessions.
- The initial admin app login is username `admin` with temporary password `admin123` unless it has already been changed in Settings.
- All roles currently have full website visibility in the sidebar and page controllers.
- Admin is the only role that can create, edit, or delete employee/customer/supplier profile records through the current UI/RPC flow.
- Management, Sales, and Executer visibility is intentionally broad for now; role-by-role restrictions are planned later.
- Admin now has a `Masters` sidebar tab at `masters.html` for first-pass catalog setup in this clone.
- Main masters are neutral top-level groups, not Fabric/Parts/Finished Goods types.
- Masters are structure-only and stored in `master_nodes`: main masters have no parent, and every sub master points to its parent master node.
- Masters can be edited or deleted from the Masters page. Deleting a master cascades through nested sub masters only; it does not delete already-synced inventory rows.
- Masters can mark any node `exclude_from_pnc_name`, which means that node's label should be skipped later when final PNC names are generated.
- The Masters page supports main masters and unlimited nested sub masters. It must not show generated combination lists inside Masters.
- Masters can sync generated inventory items into `inv_categories`, `inv_products`, and zero-stock `inv_variants`.
- Masters setup must stay free of pieces, rates, quantities, and live stock writes. It does not write `inv_rolls` or `inv_movements`.
- Mechanisms are now separate from the master tree. `mechanism_groups`, `mechanism_options`, and `master_mechanism_groups` store feature dimensions such as headrail, cassette, mono mechanism, and laddertape mechanism, plus dropdown assignments to selected masters.
- Mechanism options can now link to inventory-backed parts through `mechanism_part_links`. Each part link stores the inventory variant, quantity rule, quantity per unit, wastage percentage, unit, and notes. Create Order uses those links to create planned `order_components` for the selected mechanism.
- `014_mechanism_part_links.sql` must be followed by `015_mechanism_part_links_anon_permissions.sql` because the browser app uses the anon key with app-level sessions. Without 015, Masters shows `permission denied for table mechanism_part_links`.
- `003_master_nodes_structure.sql` seeds first-pass master categories from `Excel File/Vista Dealer RRP April 2026.xlsx`, mechanism labels from the RRP/inflow workbooks, and color/code sub masters from `Excel File/Vista Inventory Inflow New.xlsx`.
- Color/code values are nested under a skipped `Color` label for each fabric family, so final generated names include the actual color/code but not the word `Color`.
- The seed imports structure labels only, not stock quantities, purchase rates, rolls, or movements.
- `010_import_vista_inflow_rishi_masters.sql` adds the newer workbook-derived structure from `Excel File/Vista-Inflow Data to Rishi.xlsx`: Roller Blind, Sheer Dimout, S-Contour fabric paths, plus separate Parts, Tracks, and Motors pages. It is also structure-only and intentionally ignores repetitive stock rows except as label evidence.
- Profiles now has Employees, Customers, and Suppliers.
- The visible Settings page (`account-settings.html`) now has an Admin Test Mode card for admin users only. Profiles also carries the same admin-only control. Test mode captures app writes locally in the browser through `js/test-mode.js`; turning it off clears the local sandbox and returns pages to real Supabase data.
- Components and Inventory > Finished Product Code are removed from the active website UI in this clone. RRP, Wastage, Activity Log, Tickets, and Orders are active workflow tabs.
- Employee profiles drill into recent activity log rows.
- Customer profiles summarize order count/value and list linked orders.
- Supplier profiles summarize inward purchases by month, bill number, date, and line item.
- Supplier purchase line items link back into Inventory through variant deep links.
- Reports can be opened with supplier/customer query filters from profile pages.

## Current UI State On 2026-05-07

- `masters.html` is the admin master-structure setup tab. Inventory links back to it from the header `Masters` button.
- `inventory.html` filters now follow the Masters structure: first by master page, then by main master inside that page, with search covering inventory names, master names, page names, roll/batch/bill/supplier data, and cut pieces.
- `create.html` is the main "Create" sidebar tab. It has Create Purchase Order, Create Sales Order, and Tickets tabs.
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
- `tickets.html` writes CRM records to `order_tickets`. It now runs both as a sidebar Tickets page and inside Create through `tickets.html?embed=1`. New tickets store typed customer name/mobile, inquiry-for, location, allocation, status, remarks, and the linked quotation `orders.id` once generated. The inquiry date is database-managed and not shown as a ticket entry field.
- Follow-ups are append-only rows in `order_ticket_followups`. The latest follow-up updates the ticket status/visible remarks, while older follow-ups remain visible as uneditable history.
- Ticket quotation generation opens `create.html?tab=order&ticket=<id>`, which loads `create-order.html?embed=1&ticket=<id>`. If the ticket is already linked to a customer it selects that profile; otherwise it prefills typed customer fields from the ticket name/mobile. The ticket is marked `confirmed` only after the quotation/order/items/components insert succeeds.
- Quotations insert into `orders` with `status = quotation`, remain visible from Tickets, and are hidden from the Orders list until the customer confirms the quote.
- Customer confirmation from the ticket detail page moves the linked quotation to `orders.status = active`.
- Active orders can request management approval. Admin/Management approval changes `approval_status` to `approved`, after which proforma invoice generation is available.
- Quote documents omit GST and bank details. Approved proforma documents include GST and bank details.
- Inventory stock is not checked during quotation creation. After management approval, staff choose `in_house` to move to processing or `direct_order` when the franchise has no stock and must order from Vista.
- Create Order item labels are visually renumbered after delete/add. Internal item IDs remain unique, but the UI should show continuous labels like `Item 1`, `Item 2`.
- Sidebar tabs can be drag-reordered for admin/staff sidebars. The order is stored in browser `localStorage` by role and applied by `js/sidebar.js`.
- Profiles toolbars are now consistent across Employees, Customers, and Suppliers.
- The old admin Components page files were removed. `product_recipes` and `recipe_items` remain database-side BOM inputs used by order and production code.

## Active Workflow Status Values

Use these current ticket statuses:

```text
active
confirmed
cancelled
```

Use these current order statuses in app code and SQL:

```text
quotation
active
approved
processing
direct_order
cancelled
completed
```

Legacy `inquiry`, `pending`, and `discussing` values should be treated as `active` only for backward compatibility.

## Active Database Setup

Run the current numbered SQL lane for this new website clone:

1. `supabase/migrations/001_new_project_empty_schema.sql`
2. Create the first Auth user in Supabase Dashboard.
3. `supabase/migrations/002_link_first_admin_profile.sql`
4. Continue through the remaining numbered migration files in order, currently through `015_mechanism_part_links_anon_permissions.sql`.

The previous numbered import and cleanup migration notes are historical and their SQL files were removed from the active migration folder.

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

`create-order.html` is still the full order form. `create.html` is the combined Create tab that includes Create Purchase Order, embeds Create Order, and embeds Tickets.
