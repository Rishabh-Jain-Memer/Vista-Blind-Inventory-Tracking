# Multi-Agent Collaboration Rules

You are working on the Vista Blind Tracking System, an internal manufacturing and inventory management app for a blinds company.

## Critical Context Rule

Before coding, read the `Context/` folder, especially `Context/AI_GUARDRAILS.md`, `Context/CURRENT_STATE.md`, and `Context/ARCHITECTURE.md`. Treat those files as the handoff source of truth for this repo.

After every meaningful change, append the result to `Context/CHANGELOG.md`. If you change tables, RPCs, pages, routing, import flow, reset/cleanup behavior, or user-facing workflow, also update `Context/ARCHITECTURE.md`, `Context/CURRENT_STATE.md`, and any relevant guide/README in the same pass.

## Golden Rules

- Supabase is the source of truth for inventory, orders, components, and customer/profile data.
- The original/live Supabase project must stay untouched. This clone already uses the isolated New Supabase project in `js/config.js`; use explicit database credentials for any additional staging database work.
- Keep the stack simple: HTML, CSS, vanilla JavaScript, Supabase. Do not add React, Vue, TypeScript, Tailwind, or a build tool unless the owner explicitly asks.
- Use one stylesheet: `css/style.css`.
- If the UI shows empty data, check live table counts and RLS before assuming a frontend bug.
- Role routing is enforced in `js/sidebar.js`.
- If any table/variable name is unclear, check `Context/AI_GUARDRAILS.md` before editing.
- Do not move features between pages casually. Current direction:
  - Inventory shows current inventory only.
  - Masters shows structure setup: main masters and nested sub masters from `master_nodes`, plus separate mechanism groups/options and their assignments.
  - Create handles Create Purchase Order, Create Sales Order, and Tickets.
  - Profiles handles Employees, Customers, Suppliers.
  - The old Components page and Inventory > Finished Product Code UI are removed from the active website UI in this clone.
  - RRP, Wastage, Activity Log, Tickets, Orders, and Reports are active workflow/sidebar tabs.
- Keep repeated UI patterns consistent. If changing Profiles toolbar/buttons, update Employees, Customers, and Suppliers together.
- Keep global browser JS style. Functions are intentionally globals because pages call them from inline HTML handlers.

## Active Inventory Tables

```text
inv_categories -> inv_products -> inv_variants -> inv_rolls -> inv_movements
```

## Active Master Structure Table

```text
master_nodes
```

Masters can toggle `exclude_from_pnc_name` for labels to skip in final inventory names. Masters can sync zero-stock catalog variants, but must not create visible combination lists, pieces, rates, quantities, rolls, or movement rows.

## Active Mechanism Tables

```text
mechanism_groups -> mechanism_options
mechanism_options -> mechanism_part_links
master_nodes -> master_mechanism_groups -> mechanism_groups
```

Mechanisms are feature dimensions such as headrail, cassette, mono mechanism, and laddertape mechanism. Keep them separate from the normal master/sub-master tree.

`mechanism_part_links` links a mechanism option to inventory variants for planned BOM/costing. It must not create stock rows or inventory movement rows.

## Active Migration Lane

Use only `supabase/migrations` for database setup in this clone:

1. `001_new_project_empty_schema.sql`
2. Create the first Auth user in Supabase Dashboard.
3. `002_link_first_admin_profile.sql`
4. Continue through the remaining numbered files, currently through `015_mechanism_part_links_anon_permissions.sql`.

The older import, cleanup, RRP, component, stock-refresh, and historical patch migrations were removed from the active lane. Do not recreate or run them unless the owner explicitly asks to restore legacy data.

Supabase CLI note: the local CLI is linked to `knawjdrsdqgyfzqzddix`, but direct DB commands currently hang without a DB URL/password. Manual SQL Editor runs are still valid unless `VISTA_NEW_DB_URL` is provided.

## Current Environment Rule

`js/config.js` always points browser pages at the isolated New Supabase project `knawjdrsdqgyfzqzddix`. The old browser dev-environment switch was removed, so do not rely on localStorage or URL parameters to change Supabase projects. For another staging database, use explicit direct DB credentials and keep the target documented.

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

All roles currently have broad website visibility in the sidebar/page controllers. Keep employee/customer/supplier profile creation, profile mutation, destructive profile actions, master writes, and settings-level admin controls gated to Admin. Role-by-role visibility can be tightened later one page at a time.

## Current Workflow Status Values

Ticket states:

```text
active
confirmed
cancelled
```

Order states:

```text
quotation
active
approved
processing
direct_order
cancelled
completed
```

Treat old `inquiry`, `pending`, and `discussing` statuses as backward-compatible active orders only.

## Inventory Valuation

Fabric value is `running_metres * rate`. Fabric rates are per running metre at the fabric width, not per square metre.

Parts/components value is `quantity * rate`.
