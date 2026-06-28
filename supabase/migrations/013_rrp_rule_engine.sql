-- Migration 013: Scalable RRP rule engine
-- Keeps the legacy rrp_entries table as imported source data, and adds a
-- maintainable rule layer that can inherit from masters and override by mechanism.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rrp_price_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  effective_from DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  source_file TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rrp_price_books_status_check CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS rrp_price_books_normalized_name_key
  ON public.rrp_price_books(normalized_name);

CREATE UNIQUE INDEX IF NOT EXISTS rrp_price_books_single_default_idx
  ON public.rrp_price_books(is_default)
  WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS public.rrp_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_book_id UUID NOT NULL REFERENCES public.rrp_price_books(id) ON DELETE CASCADE,
  master_node_id UUID REFERENCES public.master_nodes(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  pricing_basis TEXT NOT NULL DEFAULT 'sqm',
  uom TEXT NOT NULL DEFAULT 'SQM',
  currency TEXT NOT NULL DEFAULT 'INR',
  base_rrp NUMERIC,
  dealer_price NUMERIC,
  min_charge NUMERIC,
  width_max_cm NUMERIC,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_entry_id UUID REFERENCES public.rrp_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rrp_rules_pricing_basis_check CHECK (pricing_basis IN ('sqm', 'running_m', 'piece', 'fixed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS rrp_rules_book_master_key
  ON public.rrp_rules(price_book_id, master_node_id)
  WHERE master_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rrp_rules_price_book_active
  ON public.rrp_rules(price_book_id, is_active, priority);

CREATE INDEX IF NOT EXISTS idx_rrp_rules_master_node
  ON public.rrp_rules(master_node_id);

CREATE TABLE IF NOT EXISTS public.rrp_rule_mechanism_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.rrp_rules(id) ON DELETE CASCADE,
  mechanism_option_id UUID REFERENCES public.mechanism_options(id) ON DELETE SET NULL,
  mechanism_label TEXT NOT NULL,
  normalized_mechanism_label TEXT NOT NULL,
  price_key TEXT,
  modifier_type TEXT NOT NULL DEFAULT 'override',
  rrp NUMERIC NOT NULL,
  dealer_price NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rrp_rule_mechanism_prices_modifier_check CHECK (modifier_type IN ('override', 'add'))
);

CREATE INDEX IF NOT EXISTS idx_rrp_rule_mech_prices_rule
  ON public.rrp_rule_mechanism_prices(rule_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_rrp_rule_mech_prices_option
  ON public.rrp_rule_mechanism_prices(mechanism_option_id);

CREATE OR REPLACE FUNCTION public.set_rrp_rule_engine_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rrp_price_books_updated_at ON public.rrp_price_books;
CREATE TRIGGER trg_rrp_price_books_updated_at
BEFORE UPDATE ON public.rrp_price_books
FOR EACH ROW
EXECUTE FUNCTION public.set_rrp_rule_engine_updated_at();

DROP TRIGGER IF EXISTS trg_rrp_rules_updated_at ON public.rrp_rules;
CREATE TRIGGER trg_rrp_rules_updated_at
BEFORE UPDATE ON public.rrp_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_rrp_rule_engine_updated_at();

DROP TRIGGER IF EXISTS trg_rrp_rule_mech_prices_updated_at ON public.rrp_rule_mechanism_prices;
CREATE TRIGGER trg_rrp_rule_mech_prices_updated_at
BEFORE UPDATE ON public.rrp_rule_mechanism_prices
FOR EACH ROW
EXECUTE FUNCTION public.set_rrp_rule_engine_updated_at();

ALTER TABLE public.rrp_price_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrp_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrp_rule_mechanism_prices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rrp_price_books TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rrp_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rrp_rule_mechanism_prices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rrp_price_books TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rrp_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rrp_rule_mechanism_prices TO anon;

DROP POLICY IF EXISTS rrp_price_books_read ON public.rrp_price_books;
CREATE POLICY rrp_price_books_read ON public.rrp_price_books
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS rrp_price_books_admin_write ON public.rrp_price_books;
CREATE POLICY rrp_price_books_admin_write ON public.rrp_price_books
  FOR ALL TO anon, authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS rrp_rules_read ON public.rrp_rules;
CREATE POLICY rrp_rules_read ON public.rrp_rules
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS rrp_rules_admin_write ON public.rrp_rules;
CREATE POLICY rrp_rules_admin_write ON public.rrp_rules
  FOR ALL TO anon, authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS rrp_rule_mechanism_prices_read ON public.rrp_rule_mechanism_prices;
CREATE POLICY rrp_rule_mechanism_prices_read ON public.rrp_rule_mechanism_prices
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS rrp_rule_mechanism_prices_admin_write ON public.rrp_rule_mechanism_prices;
CREATE POLICY rrp_rule_mechanism_prices_admin_write ON public.rrp_rule_mechanism_prices
  FOR ALL TO anon, authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

INSERT INTO public.rrp_price_books(name, normalized_name, effective_from, status, is_default, source_file, notes)
VALUES (
  'Vista RRP 2026',
  'vista rrp 2026',
  DATE '2026-05-18',
  'active',
  TRUE,
  'New RRP - 2026 (18 May 2026).pdf',
  'Default scalable price book. Add inherited master rules here; legacy rrp_entries remains as source reference.'
)
ON CONFLICT (normalized_name)
DO UPDATE SET
  effective_from = EXCLUDED.effective_from,
  status = EXCLUDED.status,
  is_default = EXCLUDED.is_default,
  source_file = EXCLUDED.source_file,
  notes = COALESCE(public.rrp_price_books.notes, EXCLUDED.notes),
  updated_at = NOW();

COMMIT;
