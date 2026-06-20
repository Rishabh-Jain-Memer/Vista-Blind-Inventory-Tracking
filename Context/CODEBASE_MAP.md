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
3. HTML page loads `js/auth.js`, `js/utils.js`, `js/transitions.js`, and `js/sidebar.js`.
4. Page controller calls `initSidebar()`.
5. Page controller fetches page data and renders DOM.

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

## Excel Import Status

`Vista Inventory Inflow New.xlsx` is imported by migration 2. It contains 315 valid opening-stock rows with total value Rs 65,79,451.25.

Visible UI wording is now `Components`, but the schema still uses `product_recipes` and `recipe_items`.

`Vista Component Recipie New.xlsx` is refreshed by migration 9 into those legacy recipe tables. The updated workbook now represents 8 source sections with 1 duplicate merged into 7 unique blind component products.

`Tracks.xlsx` is not stock data. It feeds 3 track component products through migration 10:

- `Super Track`
- `Jumbo Track`
- `M Track`
