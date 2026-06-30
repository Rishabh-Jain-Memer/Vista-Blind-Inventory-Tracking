# Codebase Map

This file is a quick orientation guide before touching the app.

For detailed do-not-break rules, read `Context/AI_GUARDRAILS.md`.

## Do Not Start In The Database

The browser currently reads Supabase directly. If inventory cards show zero, first confirm that the live database has rows in:

- `inv_categories`
- `inv_products`
- `inv_variants`
- `inv_rolls`
- `inv_movements`

## Main Frontend Flow

1. HTML page loads Supabase CDN.
2. HTML page loads `js/config.js`, creating `db`.
3. Authenticated app pages load `js/auth.js`, then `js/test-mode.js`, then `js/utils.js`, `js/transitions.js`, and `js/sidebar.js`.
4. Page controller calls `initSidebar()`.
5. Page controller fetches page data and renders DOM.

`js/test-mode.js` wraps `db` only when Admin Test Mode is enabled and the current app profile is admin. It captures writes locally in browser storage and leaves login/session RPCs real.

Admin Test Mode controls live in:

```text
account-settings.html -> js/account-settings.js
settings.html -> js/settings.js
```

Only admin profiles see the control. Turning test mode off clears the local overlay from browser storage and reloads the real Supabase data.

## Sidebar

`js/sidebar.js` is the only place sidebar page order/labels should be changed.

The owner can drag sidebar tabs to reorder them. The saved order lives in browser `localStorage`, not Supabase:

```text
vista.sidebar.order.admin
vista.sidebar.order.staff
```

Key functions:

```text
initSidebar()
applySidebarOrder()
enableSidebarReorder()
saveSidebarOrder()
```

Do not add sidebar markup manually inside individual HTML pages.

## Create Tab

`create.html` is not a duplicate of `create-order.html`.

It has:

- Create Purchase Order, controlled by `js/create.js`.
- Create Order, embedded from `create-order.html?embed=1`.
- Tickets, embedded from `tickets.html?embed=1`.

Important `js/create.js` state:

```text
selectedSupplier
isNewSupplier
stockItems
itemState
```

Important `js/create.js` functions:

```text
ensureSupplier()
ensureItemEntities()
saveStock()
```

As of migration 34, Create > Create Purchase Order first creates `stock_orders` and `stock_order_items`; the actual `inv_rolls` and `inv_movements` inserts happen from `stock-order-detail.html` when the pending stock order is received. Reports and Supplier Profiles continue to rely on `inv_rolls` and `inv_movements`.
Inline item/material creation must create or reuse the matching `inv_products` parent by typed name before creating an `inv_variants` row.

Do not move Create Purchase Order back into Inventory unless explicitly asked.

The old Components page and Inventory > Finished Product Code UI were removed from the active website UI in the isolated clone. RRP, Wastage, Activity Log, Tickets, Orders, and Reports are active workflow/sidebar tabs. Do not re-add the old Components page or old product-code workflow unless explicitly asked.

Create Sales Order now also reads `mechanism_part_links` through the RRP/master engine. Mechanism-linked parts are inserted as planned `order_components`, and order planned cost is stored in `orders.cost_amount`.

## Masters And Mechanism Parts

`masters.html` / `js/masters.js` owns:

- master pages
- nested `master_nodes`
- inventory sync from masters to zero-stock `inv_variants`
- `mechanism_groups`
- `mechanism_options`
- `master_mechanism_groups`
- `mechanism_part_links`

`mechanism_part_links` stores architecture only: selected mechanism option, linked inventory variant, quantity rule, quantity per unit, wastage percent, unit, and notes. It does not create stock, deduct stock, or write inventory movement rows.

If any Masters create/edit/sync action reports a null `id` insert failure, check whether `supabase/migrations/016_repair_generated_uuid_defaults.sql` has been run in SQL Editor. `js/masters.js` now sends explicit UUIDs for its own inserts, but 016 still repairs missing UUID defaults on public UUID `id` columns for older or indirect writes.

## Profiles Page

`settings.html` is the historical route, but the UI label is Profiles.

Tabs:

```text
employees
customers
suppliers
```

Toolbar classes that should stay uniform:

```text
profile-toolbar
profile-toolbar-title
profile-toolbar-subtitle
profile-toolbar-actions
```

If you change button/search/export layout for one profile tab, update all three tabs consistently.

## Main Accounting Data Flow

Inventory value should come from `inv_rolls`:

```text
stock_value if present
else remaining/original quantity * purchase_rate
```

Do not multiply fabric rate by square metres during import. Fabric rates are per running metre of the actual fabric width.

For new quotations, planned blind cost is fabric cost plus linked mechanism/component cost. Selling price remains the selected RRP/DP value; profit is selling total minus planned cost.

## Supabase CLI Status

Current remote project:

```text
ref: knawjdrsdqgyfzqzddix
name: rishabh.jain28082006@gmail.com's Project
region: Northeast Asia (Tokyo)
```

As of 2026-06-28, `supabase projects list` works and shows the New project as linked. Direct database commands hang without DB credentials: `supabase db query --linked`, `supabase migration list --linked`, and `supabase db push --linked --dry-run`. `supabase status` checks local Docker only and fails because local Supabase containers are not running.

## Excel Import Status

`Vista Inventory Inflow New.xlsx` is imported by migration 2. It contains 315 valid opening-stock rows with total value Rs 65,79,451.25.

The old Components page is removed from the website, but the schema still uses `product_recipes` and `recipe_items` for BOM/order calculations.

`Vista Component Recipie New.xlsx` is refreshed by migration 9 into those legacy recipe tables. The updated workbook now represents 8 source sections with 1 duplicate merged into 7 unique blind component products.

`Tracks.xlsx` is not stock data. It feeds 3 track component products through migration 10:

- `Super Track`
- `Jumbo Track`
- `M Track`
