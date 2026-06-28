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
| `masters.html` | `js/masters.js` | Admin-only master setup. Creates main masters, unlimited nested sub masters, separate mechanism groups/options, mechanism assignments, and generated zero-stock inventory variants. |
| `inventory.html` | `js/inventory.js` | Current inventory tree, stock cards, filters, and export. |
| `create.html` | `js/create.js` | Combined Create tab. Hosts Create Purchase Order, Create Sales Order, and Tickets. |
| `orders.html` | `js/orders.js` | Order list, filters, export, create-order side panel. |
| `create-order.html` | `js/create-order.js` | New order form and order submission. |
| `order-detail.html` | `js/order-detail.js` | One order's detail, status, production records, print/PDF. |
| `reports.html` | `js/reports.js` | Inward/outward report grouping. |
| `settings.html` | `js/settings.js` | Admin Profiles screen for employees, customers, and suppliers. Historical filename remains `settings.html`. |
| `tickets.html` | `js/tickets.js` | Shared ticket queue and new-ticket capture, embedded under Create via `tickets.html?embed=1`. |
| `ticket-detail.html` | `js/ticket-detail.js` | Dedicated CRM ticket detail, follow-up timeline, and order handoff. |
| `customer-dashboard.html` | `js/customer-dashboard.js` | Customer-only dashboard. |
| `executer-dashboard.html` | `js/executer-dashboard.js` | Production queue for executer users. |

Removed website pages in this clone: the old Components page and Inventory > Finished Product Code UI. RRP, Wastage, Activity Log, Tickets, Orders, and Reports are active workflow/sidebar tabs in the current clone.

## Shared JavaScript

| File | Role |
|---|---|
| `js/config.js` | Creates global Supabase client `db`. |
| `js/auth.js` | Central auth/session/profile helper. |
| `js/test-mode.js` | Admin-only browser sandbox that captures writes locally when test mode is enabled. |
| `js/sidebar.js` | Shared sidebar, role checks, mobile menu, and per-role drag-to-reorder tab ordering. |
| `js/utils.js` | Formatting, DOM helpers, modals, toasts, unit helpers, activity logging. |
| `js/transitions.js` | Small page transition behavior only. |

## Isolated Supabase

`js/config.js` always uses the isolated Supabase project `knawjdrsdqgyfzqzddix`. The old browser-facing dev-environment/staging switch and its restore helper files have been removed from this clone. If another staging database is needed later, wire it through explicit credentials/scripts instead of localStorage URL overrides.

The Supabase CLI is linked to `knawjdrsdqgyfzqzddix`, confirmed on 2026-06-28 with `supabase projects list`. However `supabase db query --linked`, `supabase migration list --linked`, and `supabase db push --linked --dry-run` hang without a remote Postgres password/URL, and `supabase status` fails because local Docker containers are not running. For direct SQL from this machine, set `VISTA_NEW_DB_URL` or provide the remote DB password. Otherwise run migrations manually in Supabase SQL Editor.

## Master Structure Schema

```text
master_nodes
  master_nodes
    master_nodes
```

The Masters workflow owns the structure. Main masters are rows in `master_nodes` with `parent_id = null`; every sub master is another `master_nodes` row whose `parent_id` points to its parent. A node can set `exclude_from_pnc_name = true` so labels such as `Color` are skipped when final inventory names are generated, while child values under that label can still be used.

`Sync Inventory` turns the master structure into zero-stock inventory variants. It writes only:

```text
inv_categories
  inv_products
    inv_variants
```

It must not write `inv_rolls`, `inv_movements`, stock quantities, rates, or visible combination lists inside Masters.

Editing/deleting Masters changes `master_nodes` only. Deleting a master cascades through its nested sub masters through the `parent_id` foreign key, but does not delete already-synced inventory catalog rows.

## Mechanism Structure Schema

Mechanisms are a separate feature dimension from normal master/sub-master hierarchy:

```text
mechanism_groups
  mechanism_options
    mechanism_part_links

master_nodes
  master_mechanism_groups
    mechanism_groups
```

Examples seeded from the Vista workbooks include Roller Headrail / Cassette, Sheer Dimout Mechanism / Cassette, Roman Mechanism, Mono Mechanism, and S-Contour Cassette. Mechanism options can carry a source label and price key for later pricing work, but this layer does not write stock quantities, rates, rolls, or movements.

`master_mechanism_groups` controls which mechanism groups apply to which selected master nodes. This is intentionally separate from `exclude_from_pnc_name` and from generated inventory variant names.

`mechanism_part_links` links a selected mechanism option to inventory variants. Each link has a quantity rule (`fixed`, `per_blind`, `per_width_m`, `per_height_m`, or `per_area_sqm`), quantity per unit, wastage percent, unit, and optional notes. Create Order resolves these rows into `order_components` when a blind is quoted, so a blind sold as fabric plus mechanism can automatically carry roller chains, headrail parts, cassette parts, and other future inventory-backed components.

## Current Inventory Schema Expected By The App

```text
inv_categories
  inv_products
    inv_variants
      inv_rolls
        inv_movements
```

The frontend inventory and reports currently expect `inv_rolls.stock_value`, `remaining_length`, `purchase_rate`, `bill_no`, `supplier`, and `inward_date`.

## Database Setup Lane

The active SQL lane is the clean new-project sequence in `supabase/migrations`:

```text
supabase/migrations/001_new_project_empty_schema.sql
supabase/migrations/002_link_first_admin_profile.sql
supabase/migrations/003_master_nodes_structure.sql
supabase/migrations/004_import_inventory_inflow_stock.sql
supabase/migrations/005_import_new_rrp_2026.sql
supabase/migrations/006_import_excel_catalog_and_track_structures.sql
supabase/migrations/007_cut_pieces_wastage_activity.sql
supabase/migrations/008_fix_order_ticket_number_sequence.sql
supabase/migrations/009_roles_approval_workflow.sql
supabase/migrations/010_import_vista_inflow_rishi_masters.sql
supabase/migrations/011_app_level_username_auth.sql
supabase/migrations/012_master_page_app_session_permissions.sql
supabase/migrations/013_rrp_rule_engine.sql
supabase/migrations/014_mechanism_part_links.sql
supabase/migrations/015_mechanism_part_links_anon_permissions.sql
```

The old import, cleanup, RRP, component, stock-refresh, and historical patch migrations were removed from the active migration folder.

## Create And Inventory Write Flow

Masters is now the catalog setup page. Inventory is intended to be a current-stock viewing page. Do not add the old Create Purchase Order/Restock UI back into the Inventory top bar unless the owner reverses that decision.

Master-structure setup starts from:

```text
masters.html -> js/masters.js -> master_nodes
```

`js/masters.js` can sync generated catalog rows into `inv_categories`, `inv_products`, and `inv_variants`. It also manages `mechanism_groups`, `mechanism_options`, and `master_mechanism_groups`. It must not create stock rows, rates, or quantities. Live stock quantities are still created only when a stock order is received.

Mechanism part linking is also owned by `js/masters.js`. Mechanism option rows can link to inventory variants through `mechanism_part_links`; this stores BOM architecture only and does not deduct stock or create inventory movement rows.

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

Inventory filtering follows Masters: first choose a master page such as Fabrics, Parts, Tracks, or Motors, then choose a main master inside that page. Search remains a text search across variant, product, category, linked master, master page, roll, supplier, bill, and cut-piece fields.

The receive action is the boundary where live inventory changes. Do not add `inv_rolls` or `inv_movements` rows during initial stock order creation.

When the Create Purchase Order flow creates a new item/material inline, `js/create.js` must create or reuse an `inv_products` row with the typed name under the selected category, then create the `inv_variants` row under that product. Do not fall back to the first product in the category, because that mis-groups variants under unrelated parent products.

## Create Order Embed Flow

`create.html` embeds `create-order.html?embed=1`.

`js/create-order.js` hides the sidebar/back chrome in embed mode and sends its rendered height to the parent with:

```text
postMessage({ type: 'create-order-height', height }, '*')
```

`js/create.js` listens for that message and resizes `#create-order-frame`. This is intentional so the Create page scrolls naturally instead of having a nested form scroll.

## Tickets Embed Flow

Tickets are now part of the Create page, not a standalone sidebar tab.

```text
create.html?tab=tickets -> tickets.html?embed=1
```

`js/tickets.js` skips sidebar rendering in embed mode and sends:

```text
postMessage({ type: 'tickets-height', height }, '*')
```

When a ticket is converted, embedded Tickets sends `open-create-order-ticket` to the parent and `js/create.js` switches to the Create Sales Order iframe with the ticket prefill.

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

Use only `supabase/migrations` for database setup work in this clone.

Run order:

1. `001_new_project_empty_schema.sql`
2. Create the first Auth user in Supabase Dashboard.
3. `002_link_first_admin_profile.sql`
4. Continue through the remaining numbered files in order, currently through `015_mechanism_part_links_anon_permissions.sql`.

Do not recreate or run the deleted legacy migration chain unless the owner explicitly asks to restore legacy data.

## Inventory Valuation Rule

Fabric value is `running_metres * rate`. The fabric rate is for one running metre at the fabric's roll width, not one square metre.

Parts/components value is `quantity * rate`.

Create Order planned cost for a blind is fabric cost plus linked mechanism/component cost. Selling value still comes from the selected RRP/DP rate. Profit is therefore selling total minus planned cost, not a separate selling price for each part.

## Admin Test Mode

The visible Settings page (`account-settings.html`) has an Admin Test Mode button for admin users only. Profiles also has the same admin-only control while employee management is open. When enabled, `js/test-mode.js` wraps the global `db` client after auth loads. App reads still come from Supabase with a local overlay, while writes and non-auth RPCs are captured in browser `localStorage` instead of being sent to Supabase. Turning test mode off clears the local overlay and reloads real data.

## Excel Files

| Workbook | Role |
|---|---|
| `Vista Inventory Inflow New.xlsx` | Opening inventory source. Imports into `inv_categories`, `inv_products`, `inv_variants`, `inv_rolls`, and `inv_movements`. |
| `Vista Component Recipie New.xlsx` | Blind component/BOM source. Refreshes `product_recipes` and `recipe_items` through migration 9. Visible UI wording says Components, but schema names remain legacy recipe names. |
| `Tracks.xlsx` | Track component/BOM source. Imported into `product_recipes` and `recipe_items` through migration 10. Not imported into inventory stock tables. |
