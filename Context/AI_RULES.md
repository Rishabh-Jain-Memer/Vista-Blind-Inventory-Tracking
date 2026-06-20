# Multi-Agent Collaboration Rules

You are working on the Vista Blind Tracking System, an internal manufacturing and inventory management app for a blinds company.

## Critical Context Rule

Before coding, read the `Context/` folder, especially `Context/AI_GUARDRAILS.md`, `Context/CURRENT_STATE.md`, and `Context/ARCHITECTURE.md`. Treat those files as the handoff source of truth for this repo.

After every meaningful change, append the result to `Context/CHANGELOG.md`. If you change tables, RPCs, pages, routing, import flow, reset/cleanup behavior, or user-facing workflow, also update `Context/ARCHITECTURE.md`, `Context/CURRENT_STATE.md`, and any relevant guide/README in the same pass.

## Golden Rules

- Supabase is the source of truth for inventory, orders, components, and customer/profile data.
- Live Supabase must stay operational during major changes. Use the staging lane in `STAGING_SETUP.md` for workflow testing and database experiments.
- Keep the stack simple: HTML, CSS, vanilla JavaScript, Supabase. Do not add React, Vue, TypeScript, Tailwind, or a build tool unless the owner explicitly asks.
- Use one stylesheet: `css/style.css`.
- If the UI shows empty data, check live table counts and RLS before assuming a frontend bug.
- Role routing is enforced in `js/sidebar.js`.
- If any table/variable name is unclear, check `Context/AI_GUARDRAILS.md` before editing.
- Do not move features between pages casually. Current direction:
  - Inventory shows current inventory only.
  - Create handles Create Purchase Order and Create Order.
  - Profiles handles Employees, Customers, Suppliers.
- Keep repeated UI patterns consistent. If changing Profiles toolbar/buttons, update Employees, Customers, and Suppliers together.
- Keep global browser JS style. Functions are intentionally globals because pages call them from inline HTML handlers.

## Active Inventory Tables

```text
inv_categories -> inv_products -> inv_variants -> inv_rolls -> inv_movements
```

## Current Clean-Framework Reset

Migration `035_clean_app_data_framework.sql` is the current data wipe path. It preserves schema, RLS, functions, triggers, and Supabase Auth users/profiles by default while clearing public app data from inventory, orders, tickets, customers, suppliers, components, RRP/product-code catalogs, quote/download history, activity logs, and stock-order rows. Use its optional account-wipe block only if the owner is ready to recreate the first admin user.

## Current Staging Rule

`js/config.js` forces live Supabase outside local hosts. Local development can switch to staging through `dev-environment.html`. Future database experiments and workflow-changing website edits should be tested against staging first, using `--db-url $env:STAGING_DB_URL` for Supabase writes instead of `--linked`.

## Active Supporting Tables

`product_recipes` and `recipe_items` are active. They are legacy schema names for the visible UI feature now called `Components`. Do not rename these tables casually. They are populated and refreshed from `Vista Component Recipie New.xlsx` by the newer recipe/component migrations and are used by `create-order.js` / `order-detail.js` to calculate component requirements.

`fg_stock` is active as an optional purchased finished-goods table used by `inventory.js`.

## Stale Names To Avoid

| Old/stale | Current |
|---|---|
| `materials`, `material_categories` | `inv_categories`, `inv_products`, `inv_variants` |
| `rolls` | `inv_rolls` |
| `inventory_movements` | `inv_movements` |
| `order_headers` | `orders` |
| `process_order_item` RPC | `process_order_item_v2` |
| `apply_recipe_deductions` RPC | No longer used |
| `settings` label | Visible label is `Profiles`; route remains `settings.html` |

## Role Access

| Role | Pages |
|---|---|
| `admin` | All pages |
| `sales` | `orders.html`, `order-detail.html`, `create.html`, `tickets.html`, `ticket-detail.html`, `settings.html`, `account-settings.html` |
| `executer` | `executer-dashboard.html`, `tickets.html`, `ticket-detail.html`, `account-settings.html` |
| `customer` | `customer-dashboard.html`, `create-order.html` |

## Current Order Status Values

Use these exact values:

```text
inquiry
processing
executed
completed
```

Outward reports should only show completed orders.

## Inventory Valuation

Fabric value is `running_metres * rate`. Fabric rates are per running metre at the fabric width, not per square metre.

Parts/components value is `quantity * rate`.
