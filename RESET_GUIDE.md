# Database Clean-Framework Reset Guide

Use this guide when the owner wants the website/Supabase data cleared while keeping the app structure ready for the next round of changes.

Status on 2026-06-07: migration 35 was executed against linked Supabase project `akjybtvaezxayfwtpifd`. Verification showed the checked app tables were empty, ticket numbering was reset to the next `0001`, and admin profiles were preserved for login.

Status on 2026-06-09: data was restored from `exports/vista_supabase_backup_2026-06-06T06-29-40.xlsx` using generated SQL at `exports/restore_supabase_backup_2026-06-06T06-29-40.sql`. Restored counts and inventory valuation matched the backup, ticket numbering continues after `0038`, and the next order UID is `VB-2627-0049`.

## Current Cleanup Path

Run this file in Supabase SQL Editor:

```text
supabase/migrations/035_clean_app_data_framework.sql
```

This migration preserves:

- Supabase Auth users and `public.profiles` by default.
- Existing tables, columns, indexes, policies, triggers, functions, and RPCs.
- The current static frontend code structure.

It clears:

- Orders, order items, order components, wastage, execution logs, and activity logs.
- Tickets and follow-up history.
- Quote/proforma defaults and generated download history.
- Stock orders, stock order line items, and stock order download history.
- Inventory hierarchy rows and ledger rows.
- Component/BOM rows, RRP rows, product-code rows, finished-goods rows.
- Customers and suppliers.
- Legacy/drifted public app tables if they still exist.

Ticket numbering restarts at `0001`.

## Full Account Wipe

The bottom of migration 35 includes a commented optional account-wipe block. Run it separately only if the owner is ready to recreate the first admin account from Supabase Auth/dashboard or the `admin-users` Edge Function.

Do not wipe `auth.users` / `public.profiles` casually. If those are removed without an admin recreation plan, the app can be left with no user able to access the admin workflow.

## Verification After Running Migration 35

Run this in Supabase SQL Editor after the cleanup:

```sql
select
  (select count(*) from public.orders) as orders,
  (select count(*) from public.order_items) as order_items,
  (select count(*) from public.order_components) as order_components,
  (select count(*) from public.order_tickets) as tickets,
  (select count(*) from public.inv_categories) as inv_categories,
  (select count(*) from public.inv_products) as inv_products,
  (select count(*) from public.inv_variants) as inv_variants,
  (select count(*) from public.inv_rolls) as inv_rolls,
  (select count(*) from public.inv_movements) as inv_movements,
  (select count(*) from public.customers) as customers,
  (select count(*) from public.suppliers) as suppliers,
  (select count(*) from public.stock_orders) as stock_orders;
```

Expected result: all listed counts are `0`.

Then confirm at least one admin profile still exists:

```sql
select id, email, full_name, role
from public.profiles
where role = 'admin'
order by created_at
limit 5;
```

## Context Rule

Before future coding work, read the `Context/` folder. After each meaningful change, append `Context/CHANGELOG.md` and update `Context/CURRENT_STATE.md`, `Context/ARCHITECTURE.md`, and related README/guide files when the change affects database behavior, routing, workflows, or imports.
