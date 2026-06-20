-- ============================================================
-- Internal app access fix
-- Allows the browser client to read/write current inventory tables.
-- Run after reset/import if inventory appears empty in the UI.
-- Deployment note: this is a compatibility step only. Always run
-- 012_security_hardening.sql after the import flow before going live.
-- ============================================================

ALTER TABLE IF EXISTS public.inv_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inv_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inv_variants DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inv_rolls DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inv_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fg_stock DISABLE ROW LEVEL SECURITY;

-- Legacy/simple inventory tables, if present.
ALTER TABLE IF EXISTS public.inv_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inv_stock_entries DISABLE ROW LEVEL SECURITY;

-- Quick verification for SQL editor.
SELECT
  (SELECT COUNT(*) FROM public.inv_categories) AS categories,
  (SELECT COUNT(*) FROM public.inv_products) AS products,
  (SELECT COUNT(*) FROM public.inv_variants) AS variants,
  (SELECT COUNT(*) FROM public.inv_rolls) AS rolls,
  ROUND((SELECT COALESCE(SUM(stock_value), 0) FROM public.inv_rolls)::numeric, 2) AS stock_value;
