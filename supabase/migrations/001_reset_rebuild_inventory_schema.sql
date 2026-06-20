-- ============================================================
-- Clean reset for current app (safe on drifted schemas)
-- - Keeps auth.users intact
-- - Clears app transactional + inventory data
-- - Recreates current inventory hierarchy tables if missing
-- ============================================================

BEGIN;

-- 1) Clear transactional tables only if they exist
DO $$
BEGIN
  IF to_regclass('public.wastage_logs')      IS NOT NULL THEN DELETE FROM public.wastage_logs; END IF;
  IF to_regclass('public.order_components')  IS NOT NULL THEN DELETE FROM public.order_components; END IF;
  IF to_regclass('public.cut_logs')          IS NOT NULL THEN DELETE FROM public.cut_logs; END IF;
  IF to_regclass('public.order_items')       IS NOT NULL THEN DELETE FROM public.order_items; END IF;
  IF to_regclass('public.orders')            IS NOT NULL THEN DELETE FROM public.orders; END IF;
  IF to_regclass('public.customers')         IS NOT NULL THEN DELETE FROM public.customers; END IF;
  IF to_regclass('public.execution_logs')    IS NOT NULL THEN DELETE FROM public.execution_logs; END IF;
  IF to_regclass('public.activity_logs')     IS NOT NULL THEN DELETE FROM public.activity_logs; END IF;
  IF to_regclass('public.fg_stock')          IS NOT NULL THEN DELETE FROM public.fg_stock; END IF;
END $$;

-- 2) Rebuild inventory hierarchy in canonical shape (drop drifted tables first)
DROP TABLE IF EXISTS public.inv_movements CASCADE;
DROP TABLE IF EXISTS public.inv_rolls CASCADE;
DROP TABLE IF EXISTS public.inv_variants CASCADE;
DROP TABLE IF EXISTS public.inv_products CASCADE;
DROP TABLE IF EXISTS public.inv_categories CASCADE;

CREATE TABLE public.inv_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sub_group TEXT DEFAULT 'Parts',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_categories_normalized_name_key ON public.inv_categories(normalized_name);

CREATE TABLE public.inv_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.inv_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_products_category_id_normalized_name_key ON public.inv_products(category_id, normalized_name);

CREATE TABLE public.inv_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.inv_products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  width_m NUMERIC,
  unit TEXT NOT NULL DEFAULT 'pcs',
  purchase_rate NUMERIC,
  base_rate_sqm NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS inv_variants_product_id_normalized_name_key ON public.inv_variants(product_id, normalized_name);

CREATE TABLE public.inv_rolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.inv_variants(id) ON DELETE CASCADE,
  batch_code TEXT NOT NULL,
  original_length NUMERIC NOT NULL DEFAULT 0,
  remaining_length NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'm',
  purchase_rate NUMERIC,
  status TEXT NOT NULL DEFAULT 'in_stock',
  inward_date DATE,
  bill_no TEXT,
  supplier TEXT,
  stock_value NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
DROP INDEX IF EXISTS inv_rolls_batch_code_key;
CREATE INDEX IF NOT EXISTS idx_inv_rolls_batch_code ON public.inv_rolls(batch_code);

CREATE TABLE public.inv_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_id UUID REFERENCES public.inv_rolls(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.inv_variants(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  rate NUMERIC,
  reference TEXT,
  note TEXT,
  performed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inv_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_variants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_rolls DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_movements DISABLE ROW LEVEL SECURITY;

-- 3) Clear legacy inventory model too (if present)
DO $$
BEGIN
  IF to_regclass('public.inv_stock_entries') IS NOT NULL THEN DELETE FROM public.inv_stock_entries; END IF;
  IF to_regclass('public.inv_items')         IS NOT NULL THEN DELETE FROM public.inv_items; END IF;
END $$;

COMMIT;
