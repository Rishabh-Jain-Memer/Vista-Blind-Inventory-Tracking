-- Migration 035: clean app data while preserving the structural framework.
--
-- Run this only after the backup/export is complete.
-- This keeps schemas, functions, triggers, policies, and Supabase Auth users.
-- It removes public app rows so the site starts from an empty framework.

BEGIN;

DO $$
DECLARE
  app_tables TEXT[] := ARRAY[
    -- Customer-facing document/download history.
    'order_quote_downloads',
    'order_quote_forms',
    'stock_order_downloads',

    -- Purchase/stock order workflow.
    'stock_order_items',
    'stock_orders',

    -- Ticket/inquiry workflow.
    'order_ticket_followups',
    'order_tickets',

    -- Production/order transaction records.
    'wastage_logs',
    'execution_logs',
    'activity_logs',
    'order_components',
    'order_items',
    'orders',

    -- Inventory/catalog rows imported or created by the app.
    'fg_stock',
    'recipe_items',
    'product_recipes',
    'rrp_entries',
    'product_codes',
    'inv_movements',
    'inv_rolls',
    'inv_variants',
    'inv_products',
    'inv_categories',

    -- Business profiles owned by the app. Auth users/profiles are handled below.
    'customers',
    'suppliers',

    -- Legacy/drifted tables that may exist on older Supabase projects.
    'cut_logs',
    'inv_stock_entries',
    'inv_items',
    'inventory_movements',
    'rolls',
    'material_categories',
    'materials',
    'order_headers'
  ];
  existing_tables TEXT[] := ARRAY[]::TEXT[];
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY app_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = table_name
        AND c.relkind IN ('r', 'p')
    ) THEN
      existing_tables := array_append(existing_tables, format('public.%I', table_name));
    END IF;
  END LOOP;

  IF array_length(existing_tables, 1) IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE '
      || array_to_string(existing_tables, ', ')
      || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- Ticket IDs should restart at 0001 after the clean reset.
DO $$
BEGIN
  IF to_regclass('public.order_ticket_number_seq') IS NOT NULL THEN
    PERFORM setval('public.order_ticket_number_seq', 1, false);
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Optional full account wipe:
-- The migration above intentionally keeps auth.users and public.profiles so an
-- admin can still sign in and rebuild the clean framework. If you truly want to
-- remove every app account too, run the block below separately in Supabase SQL
-- Editor, then recreate the first admin user from Supabase Auth/dashboard or
-- the admin-users Edge Function.
--
-- BEGIN;
-- TRUNCATE TABLE public.profiles RESTART IDENTITY CASCADE;
-- DELETE FROM auth.users;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
