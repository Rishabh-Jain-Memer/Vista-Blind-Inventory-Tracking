-- ============================================================
-- Profiles support tables
-- Adds supplier profiles used by settings.html/js/settings.js.
-- Existing inward inventory still keeps supplier text on inv_rolls.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  phone2 TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  gstin TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  phone2 TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  gstin TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_key ON public.suppliers (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON public.suppliers (phone);
CREATE INDEX IF NOT EXISTS idx_suppliers_gstin ON public.suppliers (gstin);

ALTER TABLE public.suppliers DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

COMMIT;

SELECT
  (SELECT COUNT(*) FROM public.suppliers) AS suppliers,
  to_regclass('public.suppliers') AS suppliers_table;
