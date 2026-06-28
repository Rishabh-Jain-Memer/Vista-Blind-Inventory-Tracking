-- Migration 014: Mechanism part links
-- Links mechanism options to inventory variants so order BOM/costing can be
-- driven by Masters > Mechanisms instead of hardcoded recipes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.mechanism_part_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanism_option_id UUID NOT NULL REFERENCES public.mechanism_options(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.inv_variants(id) ON DELETE SET NULL,
  part_name TEXT NOT NULL,
  quantity_rule TEXT NOT NULL DEFAULT 'per_blind',
  quantity_per_unit NUMERIC NOT NULL DEFAULT 1,
  wastage_pct NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mechanism_part_links_quantity_rule_check
    CHECK (quantity_rule IN ('fixed', 'per_blind', 'per_width_m', 'per_height_m', 'per_area_sqm'))
);

CREATE INDEX IF NOT EXISTS idx_mechanism_part_links_option_id
  ON public.mechanism_part_links(mechanism_option_id);

CREATE INDEX IF NOT EXISTS idx_mechanism_part_links_variant_id
  ON public.mechanism_part_links(variant_id);

DROP TRIGGER IF EXISTS trg_mechanism_part_links_updated_at ON public.mechanism_part_links;
CREATE TRIGGER trg_mechanism_part_links_updated_at
BEFORE UPDATE ON public.mechanism_part_links
FOR EACH ROW
EXECUTE FUNCTION public.set_master_nodes_updated_at();

ALTER TABLE public.mechanism_part_links ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mechanism_part_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mechanism_part_links TO anon;

DROP POLICY IF EXISTS mechanism_part_links_read ON public.mechanism_part_links;
CREATE POLICY mechanism_part_links_read ON public.mechanism_part_links
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS mechanism_part_links_admin_write ON public.mechanism_part_links;
CREATE POLICY mechanism_part_links_admin_write ON public.mechanism_part_links
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS mechanism_part_links_read_public ON public.mechanism_part_links;
CREATE POLICY mechanism_part_links_read_public ON public.mechanism_part_links
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS mechanism_part_links_admin_write_public ON public.mechanism_part_links;
CREATE POLICY mechanism_part_links_admin_write_public ON public.mechanism_part_links
  FOR ALL TO anon
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

NOTIFY pgrst, 'reload schema';

COMMIT;
