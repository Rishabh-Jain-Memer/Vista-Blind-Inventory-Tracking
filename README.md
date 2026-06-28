# Vista Blind Tracking Management System

Vista is a plain HTML/CSS/JavaScript inventory and order tracking app for a blinds manufacturing workflow. It uses Supabase for database reads/writes and server-side stock/order functions. This New clone uses database-backed username/password app sessions instead of browser Supabase Auth sessions.

There is no frontend build step. Open the project through a local HTTP server such as VS Code Live Server. Do not open pages through `file://`, because browser security rules can break relative scripts and Supabase CDN loading.

## Isolated Development Clone

This checkout was created for isolated development under `Rishabh-Jain-Memer/Vista-Blind-Inventory-Tracking`. It is wired to the separate Supabase project `knawjdrsdqgyfzqzddix`, not the existing production Supabase project.

For a clean new database, run the SQL files in `supabase/migrations/` in order. They create the empty app schema, link the first admin profile, add Masters/Mechanisms/RRP/order workflow structure, and add mechanism part-link architecture. Some imports are optional or structure-only; see `supabase/migrations/README.md`.

## Current Code Layout

| Area | Files | Responsibility |
|---|---|---|
| App pages | `*.html` | Page markup only. Each page loads shared scripts, then one matching page controller from `js/`. |
| Shared frontend | `js/config.js`, `js/auth.js`, `js/test-mode.js`, `js/sidebar.js`, `js/utils.js`, `js/transitions.js` | Supabase client, app auth guard, admin test-mode wrapper, role navigation, reusable formatting/modal helpers, page transitions. |
| Masters | `masters.html`, `js/masters.js` | Admin setup for main masters, nested sub masters, separate mechanism groups/options, mechanism-to-master assignments, mechanism part links, and zero-stock inventory sync. |
| Inventory | `inventory.html`, `js/inventory.js` | Current inventory view, stock cards, filters, export. Add Stock is now handled from Create. |
| Create | `create.html`, `js/create.js`, `create-order.html`, `js/create-order.js`, `tickets.html`, `js/tickets.js` | Create purchase orders, sales orders, and tickets from the same sidebar tab. |
| Orders | `orders.html`, `order-detail.html`, matching JS files | Sales/order list, order detail, order status, stock deduction flow. |
| Reports | `reports.html`, `js/reports.js` | Inward/outward accounting-style report views grouped by year, month, bill/order, and line item. |
| Profiles | `settings.html`, `js/settings.js` | Employees, customers, and suppliers. `settings.html` is the historical filename for Profiles. |
| Customer portal | `customer-dashboard.html`, `js/customer-dashboard.js` | Customer-only order dashboard. |
| Database setup | `supabase/migrations/*.sql` | Single SQL setup lane for the new website. Run these manually in Supabase SQL Editor. |
| Project context | `Context/*.md` | Required handoff notes for future AI/coding sessions. Read this folder before changing logic. |

## Isolated Supabase Lane

This clone already points at the isolated New Supabase project, so the old browser-facing dev-environment/staging switch has been removed. Test workflow changes against `knawjdrsdqgyfzqzddix` or provide a direct database URL/credentials for a separate Supabase project when a true staging database is needed.

## Database Setup Flow

Use only the files in `supabase/migrations` and run them in order:

1. `001_new_project_empty_schema.sql`
2. Create the first Auth user in Supabase Dashboard.
3. `002_link_first_admin_profile.sql`
4. Continue through the remaining numbered files, currently through `015_mechanism_part_links_anon_permissions.sql`.

The old historical migration chain was removed from the active lane because this clone is being reworked as a new website. Do not run old import, RRP, component, cleanup, or stock-refresh migrations unless the owner explicitly asks to restore legacy data.

Current Supabase CLI note: this checkout is linked to `knawjdrsdqgyfzqzddix`, but direct DB commands currently need a remote DB URL/password. `supabase status` is local-Docker-only and fails when local containers are unavailable. See `Context/SUPABASE_STATUS.md`.

For deployment, deploy `supabase/functions/admin-users` and set `SUPABASE_SERVICE_ROLE_KEY` as a Supabase function secret. Never place a service-role key in browser JavaScript.

## Frontend Rules

All pages share the same Supabase client from `js/config.js`. Page controllers should not create separate clients unless there is a deliberate admin-only reason. Browser pages always use the isolated Supabase project configured in `js/config.js`.

Inventory totals should come from the cleaned `inv_rolls.stock_value` values or, only as a fallback, `quantity * purchase_rate`. Fabric rates are per running metre of the fabric width, not per square metre.

Reports, dashboard, inventory, and customers should eventually read from the same cleaned transaction source instead of each page recalculating differently.

## Current App Rules

- Inventory is a current-stock view only. Finished Product Code has been removed from Inventory.
- Masters creates, edits, and deletes main masters and nested sub masters in `master_nodes`; it can mark a node `exclude_from_pnc_name` so that label is skipped when final inventory names are generated. Sync Inventory creates zero-stock `inv_categories`, `inv_products`, and `inv_variants` only. Deleting a master does not delete already-synced inventory rows. Masters does not create rolls, rates, quantities, or stock movements.
- Mechanisms are separate from the master tree. `mechanism_groups`, `mechanism_options`, and `master_mechanism_groups` store feature dimensions such as headrail, cassette, mono mechanism, and laddertape mechanism, plus which masters they apply to.
- Mechanism option part links live in `mechanism_part_links`. They link mechanism options to inventory variants with scalable quantity rules and feed planned `order_components`/`orders.cost_amount`; they do not write stock movements.
- `003_master_nodes_structure.sql` seeds color/code sub masters from `Vista Inventory Inflow New.xlsx` under each fabric family with the `Color` label skipped from final generated names. It still does not import stock quantities, rolls, rates, or movements.
- Create has three workflows: Create Purchase Order, Create Sales Order, and Tickets.
- Create Purchase Order creates pending `stock_orders` and `stock_order_items`; receiving a stock order from `stock-order-detail.html` writes `inv_rolls` and `inv_movements`.
- Add Stock creates typed inventory products using the entered item/material name before creating the variant; do not fall back to the first product in a category.
- Profiles has three tabs: Employees, Customers, Suppliers.
- The old Components page and Inventory > Finished Product Code UI are removed. RRP, Wastage, Activity Log, Tickets, Orders, and Reports are active workflow/sidebar tabs.
- Order statuses are `quotation`, `active`, `approved`, `processing`, `direct_order`, `cancelled`, and `completed`.
- Outward reports should count completed orders only.
- Sidebar tab order can be changed by dragging tabs; the order is saved in browser local storage.

## For Future AI Agents

Before editing code, read:

1. `Context/AI_RULES.md`
2. `Context/AI_GUARDRAILS.md`
3. `Context/CURRENT_STATE.md`
4. `Context/ARCHITECTURE.md`
5. `Context/CODEBASE_MAP.md`
6. `Context/SUPABASE_STATUS.md`
7. Latest `Context/SESSION_HANDOFF_*.md`

These files contain the table names, key globals, Create/Profile/sidebar rules, and mistakes that previously broke the app.

After meaningful changes, append `Context/CHANGELOG.md` and update the relevant Context handoff files before handing off.
