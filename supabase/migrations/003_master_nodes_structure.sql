-- Migration 003: Masters and mechanism structure
-- Creates a nested master/sub-master tree plus separate mechanism/feature groups.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.master_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.master_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  exclude_from_pnc_name BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.master_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mechanism_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mechanism_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.mechanism_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  source_label TEXT,
  price_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.master_mechanism_groups (
  master_node_id UUID NOT NULL REFERENCES public.master_nodes(id) ON DELETE CASCADE,
  mechanism_group_id UUID NOT NULL REFERENCES public.mechanism_groups(id) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (master_node_id, mechanism_group_id)
);

CREATE TABLE IF NOT EXISTS public.master_inventory_sync_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_id UUID REFERENCES public.master_nodes(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.inv_variants(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  normalized_variant_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.master_nodes
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.master_pages
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.mechanism_groups
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.mechanism_options
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.master_inventory_sync_items
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.master_nodes
  ADD COLUMN IF NOT EXISTS exclude_from_pnc_name BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS page_id UUID;

DO $$
BEGIN
  ALTER TABLE public.master_nodes
    ADD CONSTRAINT master_nodes_page_id_fkey
    FOREIGN KEY (page_id) REFERENCES public.master_pages(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE public.mechanism_groups
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.mechanism_options
  ADD COLUMN IF NOT EXISTS source_label TEXT,
  ADD COLUMN IF NOT EXISTS price_key TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS master_nodes_root_normalized_name_key
  ON public.master_nodes(normalized_name)
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS master_nodes_parent_normalized_name_key
  ON public.master_nodes(parent_id, normalized_name)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_master_nodes_parent_id
  ON public.master_nodes(parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS master_pages_normalized_name_key
  ON public.master_pages(normalized_name);

CREATE INDEX IF NOT EXISTS idx_master_nodes_page_id
  ON public.master_nodes(page_id);

CREATE UNIQUE INDEX IF NOT EXISTS mechanism_groups_normalized_name_key
  ON public.mechanism_groups(normalized_name);

CREATE UNIQUE INDEX IF NOT EXISTS mechanism_options_group_normalized_name_key
  ON public.mechanism_options(group_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_mechanism_options_group_id
  ON public.mechanism_options(group_id);

CREATE INDEX IF NOT EXISTS idx_master_mechanism_groups_group_id
  ON public.master_mechanism_groups(mechanism_group_id);

CREATE INDEX IF NOT EXISTS idx_master_inventory_sync_items_root_id
  ON public.master_inventory_sync_items(root_id);

CREATE INDEX IF NOT EXISTS idx_master_inventory_sync_items_variant_id
  ON public.master_inventory_sync_items(variant_id);

CREATE INDEX IF NOT EXISTS idx_master_inventory_sync_items_active_lookup
  ON public.master_inventory_sync_items(root_id, normalized_variant_name)
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.set_master_nodes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_master_nodes_updated_at ON public.master_nodes;
CREATE TRIGGER trg_master_nodes_updated_at
BEFORE UPDATE ON public.master_nodes
FOR EACH ROW
EXECUTE FUNCTION public.set_master_nodes_updated_at();

DROP TRIGGER IF EXISTS trg_master_pages_updated_at ON public.master_pages;
CREATE TRIGGER trg_master_pages_updated_at
BEFORE UPDATE ON public.master_pages
FOR EACH ROW
EXECUTE FUNCTION public.set_master_nodes_updated_at();

DROP TRIGGER IF EXISTS trg_mechanism_groups_updated_at ON public.mechanism_groups;
CREATE TRIGGER trg_mechanism_groups_updated_at
BEFORE UPDATE ON public.mechanism_groups
FOR EACH ROW
EXECUTE FUNCTION public.set_master_nodes_updated_at();

DROP TRIGGER IF EXISTS trg_mechanism_options_updated_at ON public.mechanism_options;
CREATE TRIGGER trg_mechanism_options_updated_at
BEFORE UPDATE ON public.mechanism_options
FOR EACH ROW
EXECUTE FUNCTION public.set_master_nodes_updated_at();

DROP TRIGGER IF EXISTS trg_master_inventory_sync_items_updated_at ON public.master_inventory_sync_items;
CREATE TRIGGER trg_master_inventory_sync_items_updated_at
BEFORE UPDATE ON public.master_inventory_sync_items
FOR EACH ROW
EXECUTE FUNCTION public.set_master_nodes_updated_at();

ALTER TABLE public.master_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mechanism_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mechanism_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_mechanism_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_inventory_sync_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_nodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mechanism_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mechanism_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_mechanism_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_inventory_sync_items TO authenticated;

DROP POLICY IF EXISTS master_nodes_read ON public.master_nodes;
CREATE POLICY master_nodes_read ON public.master_nodes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS master_nodes_admin_write ON public.master_nodes;
CREATE POLICY master_nodes_admin_write ON public.master_nodes
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS master_pages_read ON public.master_pages;
CREATE POLICY master_pages_read ON public.master_pages
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS master_pages_admin_write ON public.master_pages;
CREATE POLICY master_pages_admin_write ON public.master_pages
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS mechanism_groups_read ON public.mechanism_groups;
CREATE POLICY mechanism_groups_read ON public.mechanism_groups
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS mechanism_groups_admin_write ON public.mechanism_groups;
CREATE POLICY mechanism_groups_admin_write ON public.mechanism_groups
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS mechanism_options_read ON public.mechanism_options;
CREATE POLICY mechanism_options_read ON public.mechanism_options
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS mechanism_options_admin_write ON public.mechanism_options;
CREATE POLICY mechanism_options_admin_write ON public.mechanism_options
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS master_mechanism_groups_read ON public.master_mechanism_groups;
CREATE POLICY master_mechanism_groups_read ON public.master_mechanism_groups
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS master_mechanism_groups_admin_write ON public.master_mechanism_groups;
CREATE POLICY master_mechanism_groups_admin_write ON public.master_mechanism_groups
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS master_inventory_sync_items_read ON public.master_inventory_sync_items;
CREATE POLICY master_inventory_sync_items_read ON public.master_inventory_sync_items
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS master_inventory_sync_items_admin_write ON public.master_inventory_sync_items;
CREATE POLICY master_inventory_sync_items_admin_write ON public.master_inventory_sync_items
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

CREATE OR REPLACE FUNCTION public.normalize_master_seed_name(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.ensure_master_page_seed(
  p_name TEXT,
  p_sort_order INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_normalized TEXT := public.normalize_master_seed_name(p_name);
BEGIN
  SELECT id INTO v_id
  FROM public.master_pages
  WHERE normalized_name = v_normalized
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.master_pages(name, normalized_name, sort_order)
    VALUES (trim(p_name), v_normalized, p_sort_order)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.master_pages
    SET name = trim(p_name),
        sort_order = p_sort_order
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_master_node_seed(
  p_parent_id UUID,
  p_name TEXT,
  p_exclude_from_pnc_name BOOLEAN DEFAULT FALSE,
  p_sort_order INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_normalized TEXT := public.normalize_master_seed_name(p_name);
BEGIN
  IF p_parent_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.master_nodes
    WHERE parent_id IS NULL AND normalized_name = v_normalized
    LIMIT 1;
  ELSE
    SELECT id INTO v_id
    FROM public.master_nodes
    WHERE parent_id = p_parent_id AND normalized_name = v_normalized
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.master_nodes(parent_id, name, normalized_name, exclude_from_pnc_name, sort_order)
    VALUES (p_parent_id, trim(p_name), v_normalized, p_exclude_from_pnc_name, p_sort_order)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.master_nodes
    SET name = trim(p_name),
        sort_order = p_sort_order
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_mechanism_group_seed(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_sort_order INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_normalized TEXT := public.normalize_master_seed_name(p_name);
BEGIN
  SELECT id INTO v_id
  FROM public.mechanism_groups
  WHERE normalized_name = v_normalized
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.mechanism_groups(name, normalized_name, description, sort_order)
    VALUES (trim(p_name), v_normalized, p_description, p_sort_order)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.mechanism_groups
    SET name = trim(p_name),
        description = p_description,
        sort_order = p_sort_order
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_mechanism_option_seed(
  p_group_id UUID,
  p_name TEXT,
  p_source_label TEXT DEFAULT NULL,
  p_price_key TEXT DEFAULT NULL,
  p_sort_order INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_normalized TEXT := public.normalize_master_seed_name(p_name);
BEGIN
  SELECT id INTO v_id
  FROM public.mechanism_options
  WHERE group_id = p_group_id AND normalized_name = v_normalized
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.mechanism_options(group_id, name, normalized_name, source_label, price_key, sort_order)
    VALUES (p_group_id, trim(p_name), v_normalized, p_source_label, p_price_key, p_sort_order)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.mechanism_options
    SET name = trim(p_name),
        source_label = p_source_label,
        price_key = p_price_key,
        sort_order = p_sort_order,
        is_active = TRUE
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

DO $$
DECLARE
  rec RECORD;
  v_root UUID;
  v_parent UUID;
  v_group UUID;
  v_group_node UUID;
  v_family UUID;
  v_color_label UUID;
  v_blinds_page UUID;
  v_tracks_page UUID;
  v_motors_page UUID;
BEGIN
  v_blinds_page := public.ensure_master_page_seed('Blinds', 10);
  v_tracks_page := public.ensure_master_page_seed('Tracks', 20);
  v_motors_page := public.ensure_master_page_seed('Motors', 30);

  FOR rec IN
    SELECT * FROM (VALUES
      ('Roller Blind', 'Classic Roller Series', 'CLASSIC SCREEN 8%'),
      ('Roller Blind', 'Classic Roller Series', 'CLASSIC SCREEN 5%'),
      ('Roller Blind', 'Classic Roller Series', 'CLASSIC SCREEN 3%'),
      ('Roller Blind', 'Classic Roller Series', 'CLASSIC SCREEN 1%'),
      ('Roller Blind', 'Classic Roller Series', 'VICTORIAN'),
      ('Roller Blind', 'Classic Roller Series', 'SERENE (TRANSLUCENT)'),
      ('Roller Blind', 'Classic Roller Series', 'SPECTRUM'),
      ('Roller Blind', 'Classic Roller Series', 'SOLETO N Blackout'),
      ('Roller Blind', 'Classic Roller Series', 'DS OPEQUE - NEW'),
      ('Roller Blind', 'Classic Roller Series', 'SERENO Blackout'),
      ('Roller Blind', 'Classic Roller Series', 'SOLETO Blackout (VENICE, MURANO)'),
      ('Roller Blind', 'Wonder Design', 'WONDER DESIGN - PRINTED Blackout'),
      ('Roller Blind', 'Harris', 'HARRIS - PRINTED Blackout'),
      ('Roller Blind', 'Midnight Bloom', 'MIDNIGHT BLOOM - PRINTED Blackout'),
      ('Roller Blind', 'Prism', 'PRISM - PRINTED Blackout'),
      ('Roller Blind', 'Customized', 'CUSTOMISED - PRINTED Blackout'),
      ('Roller Blind', 'Classic Roller Series', 'CLOUDNINE (BLACKOUT)'),
      ('Roller Blind', 'Classic Roller Series', 'MELLOW (SCREEN)'),
      ('Roller Blind', 'Classic Roller Series', 'PANAMA (TRANSLUCENT)'),
      ('Roller Blind', 'Classic Roller Series', 'SURGE (TRANSLUCENT)'),
      ('Roller Blind', 'Classic Roller Series', 'TORRENT (TRANSLUCENT)'),
      ('Roller Blind', 'Classic Roller Series', 'SRS - (SCREEN ALUMINIUM BACKING)'),
      ('Roller Blind', 'Classic Roller Series', 'SCREEN BLACKOUT BLISS'),
      ('Roller Blind', 'Classic Roller Series', 'CELESTIAL (TRANSLUCENT)'),
      ('Roller Blind', 'Classic Roller Series', 'VIOLET, SKYLER, ORIBI, ELENA, BAMBERG'),
      ('Sheer Dimout Blind', 'Collections', 'ALCHEMY'),
      ('Sheer Dimout Blind', 'Collections', 'ESSENCE'),
      ('Sheer Dimout Blind', 'Collections', 'COSMOS'),
      ('Sheer Dimout Blind', 'Collections', 'OASIS'),
      ('Sheer Dimout Blind', 'Collections', 'DUNE'),
      ('Sheer Dimout Blind', 'Collections', 'CALM WAVES'),
      ('Sheer Dimout Blind', 'Collections', 'PYLA'),
      ('Sheer Dimout Blind', 'Collections', 'TRINITY'),
      ('Sheer Dimout Blind', 'Collections', 'DENVER Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'NEW THAR Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'MEMPHIS Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'LAGOS Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'NOBLE Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'SAHARA Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'ALLURE Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'AURAVEIL Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'PURE SHADE Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'SOFT SILK Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'ECO LUXE Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'DAWN LIGHT Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'MIST GLOW Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'SILK SHADE Blackout'),
      ('Sheer Dimout Blind', 'Collections', 'SOFT GLOW Blackout'),
      ('S-Contour Blind', 'Collections', 'OPERA Blackout'),
      ('S-Contour Blind', 'Collections', 'CromaLuxe Blackout'),
      ('S-Contour Blind', 'Collections', 'Shadow Luxe Blackout'),
      ('S-Contour Blind', 'Collections', 'TriLuxe Blackout'),
      ('S-Contour Blind', 'Collections', 'DiamondLuxe Blackout'),
      ('S-Contour Blind', 'Collections', 'DashLuxe Blackout'),
      ('S-Contour Blind', 'Collections', 'Customised Printed - OPERA Blackout'),
      ('S-Contour Blind', 'Collections', 'OPERA Non Blackout'),
      ('S-Contour Blind', 'Collections', 'Customised Printed OPERA Non Blackout'),
      ('Vertical Blind', 'Collections', 'STERLING (ST 682, 683, 687)'),
      ('Vertical Blind', 'Collections', 'STYLO (SY 6706)'),
      ('Vertical Blind', 'Collections', 'VICTORIAN (VIC 01-34)'),
      ('Vertical Blind', 'Collections', 'SABINE (S 01-05)'),
      ('Vertical Blind', 'Collections', 'SPECTRUM (S 01 - 15)'),
      ('Vertical Blind', 'Collections', 'CASCADE (012 - 017)'),
      ('Vertical Blind', 'Collections', 'GALLERY (G 313 - 314)'),
      ('Vertical Blind', 'Collections', 'MARBLE (G 602)'),
      ('Vertical Blind', 'Collections', 'QUEBEC (Q 1003 - 1006)'),
      ('Vertical Blind', 'Collections', 'SILHOUETTE (S 112)'),
      ('Vertical Blind', 'Collections', 'VERGINIA (V 803 - 806)'),
      ('Vertical Blind', 'Collections', 'SERENE OPEQUE BO'),
      ('Vertical Blind', 'Collections', 'DS OPEQUE BO'),
      ('Roman Blind', 'Stitched Mechanism', 'SOLETO Blackout'),
      ('Roman Blind', 'Stitched Mechanism', 'WONDER DESIGN PRINTED Blackout'),
      ('Roman Blind', 'Stitched Mechanism', 'ORIBI'),
      ('Roman Blind', 'Stitched Mechanism', 'ELENA'),
      ('Roman Blind', 'Stitched Mechanism', 'BAMBERG'),
      ('Roman Blind', 'Stitched Mechanism', 'CUSTOMIZED PRINT Blackout'),
      ('Roman Blind', 'Stitchless', 'VIOLET'),
      ('Roman Blind', 'Stitchless', 'SKYLER'),
      ('Roman Blind', 'Stitchless', 'ORIBI'),
      ('Roman Blind', 'Stitchless', 'ELENA'),
      ('Roman Blind', 'Stitchless', 'BAMBERG'),
      ('Roman Blind', 'Stitchless', 'CUSTOMIZED PRINT Blackout'),
      ('Wooden Venetian Blind', 'Collections', 'TECHWOOD 50MM (TW 01 - 20)'),
      ('Aluminium Venetian Blind', 'Collections', '25MM CLASSIC'),
      ('Cellular Blind', 'Classic Blinds', 'Translucent'),
      ('Cellular Blind', 'Classic Blinds', 'Blackout'),
      ('Cellular Blind', 'Classic Blinds', 'Sheer Fabric'),
      ('Cellular Blind', 'Top Down Bottom Up', 'Translucent'),
      ('Cellular Blind', 'Top Down Bottom Up', 'Blackout'),
      ('Cellular Blind', 'Top Down Bottom Up', 'Sheer Fabric'),
      ('Cellular Blind', 'Day Night', 'Translucent + Sheer'),
      ('Cellular Blind', 'Day Night', 'Blackout + Sheer')
    ) AS seed(root_name, parent_name, leaf_name)
  LOOP
    v_root := public.ensure_master_node_seed(NULL, rec.root_name, FALSE, 0);
    UPDATE public.master_nodes SET page_id = v_blinds_page WHERE id = v_root AND page_id IS DISTINCT FROM v_blinds_page;
    v_parent := public.ensure_master_node_seed(v_root, rec.parent_name, rec.parent_name = 'Collections', 0);
    PERFORM public.ensure_master_node_seed(v_parent, rec.leaf_name, FALSE, 0);
  END LOOP;

  -- Inflow fabric colors/codes: structure only, no stock quantities or rates.
  FOR rec IN
    SELECT * FROM (VALUES
      ('Roller Blind', 'Blackout', 'Bamberg', '01'),
      ('Roller Blind', 'Blackout', 'Bamberg', '02'),
      ('Roller Blind', 'Blackout', 'Bamberg', '03'),
      ('Roller Blind', 'Blackout', 'Bamberg', '04'),
      ('Roller Blind', 'Blackout', 'Bamberg', '05'),
      ('Roller Blind', 'Blackout', 'Cloudnine', 'CN-01 White'),
      ('Roller Blind', 'Blackout', 'Cloudnine', 'CN-02 Ivory'),
      ('Roller Blind', 'Blackout', 'Cloudnine', 'CN-03 Grey'),
      ('Roller Blind', 'Blackout', 'DS Opaque', 'Linen'),
      ('Roller Blind', 'Blackout', 'DS Opaque', 'Grey'),
      ('Roller Blind', 'Blackout', 'DS Opaque', 'White'),
      ('Roller Blind', 'Blackout', 'DS Opaque', 'Fawn'),
      ('Roller Blind', 'Blackout', 'DS Opaque', 'Champagne'),
      ('Roller Blind', 'Blackout', 'Elena', '01'),
      ('Roller Blind', 'Blackout', 'Elena', '02'),
      ('Roller Blind', 'Blackout', 'Elena', '04'),
      ('Roller Blind', 'Blackout', 'Elena', '05'),
      ('Roller Blind', 'Blackout', 'Murano', 'Opaque-01'),
      ('Roller Blind', 'Blackout', 'Murano', 'Opaque-03'),
      ('Roller Blind', 'Blackout', 'Murano', 'Opaque-05'),
      ('Roller Blind', 'Blackout', 'Murano', 'Opaque-07'),
      ('Roller Blind', 'Blackout', 'Oribi', '01'),
      ('Roller Blind', 'Blackout', 'Oribi', '02'),
      ('Roller Blind', 'Blackout', 'Oribi', '03'),
      ('Roller Blind', 'Blackout', 'Oribi', '04'),
      ('Roller Blind', 'Blackout', 'Oribi', '05'),
      ('Roller Blind', 'Blackout', 'Oribi', '06'),
      ('Roller Blind', 'Blackout', 'Oribi', '07'),
      ('Roller Blind', 'Blackout', 'Oribi', '08'),
      ('Roller Blind', 'Blackout', 'Oribi', '09'),
      ('Roller Blind', 'Blackout', 'Oribi', '10'),
      ('Roller Blind', 'Blackout', 'Serene Opaque', '01 White'),
      ('Roller Blind', 'Blackout', 'Serene Opaque', '02 Beige'),
      ('Roller Blind', 'Blackout', 'Serene Opaque', '03 Sand'),
      ('Roller Blind', 'Blackout', 'Serene Opaque', '04 Grey'),
      ('Roller Blind', 'Blackout', 'Skyler', '01'),
      ('Roller Blind', 'Blackout', 'Skyler', '02'),
      ('Roller Blind', 'Blackout', 'Skyler', '04'),
      ('Roller Blind', 'Blackout', 'Skyler', '05'),
      ('Roller Blind', 'Blackout', 'Skyler', '06'),
      ('Roller Blind', 'Blackout', 'Venice', 'Opaque-01'),
      ('Roller Blind', 'Blackout', 'Venice', 'Opaque-02'),
      ('Roller Blind', 'Blackout', 'Venice', 'Opaque-03'),
      ('Roller Blind', 'Blackout', 'Venice', 'Opaque-05'),
      ('Roller Blind', 'Blackout', 'Venice', 'Opaque-06'),
      ('Roller Blind', 'Blackout', 'Violet', '01'),
      ('Roller Blind', 'Blackout', 'Violet', '02'),
      ('Roller Blind', 'Blackout', 'Violet', '03'),
      ('Roller Blind', 'Blackout', 'Violet', '04'),
      ('Roller Blind', 'Blackout', 'Violet', '05'),
      ('Roller Blind', 'Screen', 'Classic Screen 1%', '111 White'),
      ('Roller Blind', 'Screen', 'Classic Screen 1%', '112 Beige'),
      ('Roller Blind', 'Screen', 'Classic Screen 1%', '113 Grey'),
      ('Roller Blind', 'Screen', 'Classic Screen 3%', '331 White'),
      ('Roller Blind', 'Screen', 'Classic Screen 3%', '332 Beige'),
      ('Roller Blind', 'Screen', 'Classic Screen 3%', '334 Grey'),
      ('Roller Blind', 'Screen', 'Classic Screen 5%', '551 White'),
      ('Roller Blind', 'Screen', 'Classic Screen 5%', '552 Fawn'),
      ('Roller Blind', 'Screen', 'Classic Screen 5%', '554 Grey'),
      ('Roller Blind', 'Screen', 'Classic Screen 5%', '556 Black Grey'),
      ('Roller Blind', 'Screen', 'Classic Screen 5%', '557 Light Grey'),
      ('Roller Blind', 'Screen', 'Mellow', 'ML-01 White'),
      ('Roller Blind', 'Screen', 'Mellow', 'ML-02 Ivory'),
      ('Roller Blind', 'Screen', 'Mellow', 'ML-03 Beige'),
      ('Roller Blind', 'Screen', 'Mellow', 'ML-04 Chocolate'),
      ('Roller Blind', 'Screen', 'Mellow', 'ML-05 Grey'),
      ('Roller Blind', NULL, 'Surge', 'SG-01'),
      ('Roller Blind', NULL, 'Surge', 'SG-04'),
      ('Roller Blind', NULL, 'Surge', 'SG-05'),
      ('Roller Blind', 'Translucent', 'Serene NBO', '01 White'),
      ('Roller Blind', 'Translucent', 'Serene NBO', '02 Beige'),
      ('Roller Blind', 'Translucent', 'Serene NBO', '03 Sand'),
      ('Roller Blind', 'Translucent', 'Serene NBO', '04 Grey'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-01'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-03'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-09'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-16'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-31'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-33'),
      ('Sheer Dimout Blind', NULL, 'Denver Blackout', 'SDDR-02'),
      ('Sheer Dimout Blind', NULL, 'Denver Blackout', 'SDDR-03'),
      ('Sheer Dimout Blind', NULL, 'Denver Blackout', 'SDDR-04'),
      ('Sheer Dimout Blind', NULL, 'Novel', 'SDNB-01'),
      ('Sheer Dimout Blind', NULL, 'Novel', 'SDNB-02'),
      ('Sheer Dimout Blind', NULL, 'Novel', 'SDNB-03'),
      ('Sheer Dimout Blind', NULL, 'Novel', 'SDNB-04'),
      ('Sheer Dimout Blind', NULL, 'Novel', 'SDNB-05'),
      ('Sheer Dimout Blind', NULL, 'Novel', 'SDNB-06'),
      ('Sheer Dimout Blind', NULL, 'Sahara Blackout', 'SDSR-01'),
      ('Sheer Dimout Blind', NULL, 'Sahara Blackout', 'SDSR-03'),
      ('Sheer Dimout Blind', NULL, 'Sahara Blackout', 'SDSR-04'),
      ('Sheer Dimout Blind', NULL, 'Sahara Blackout', 'SDSR-05'),
      ('Sheer Dimout Blind', NULL, 'Sahara Blackout', 'SDSR-07'),
      ('Sheer Dimout Blind', NULL, 'Thar Blackout', 'SDTH-03'),
      ('Sheer Dimout Blind', NULL, 'Thar Blackout', 'SDTH-04'),
      ('Sheer Dimout Blind', NULL, 'Thar Blackout', 'SDTH-05'),
      ('Sheer Dimout Blind', NULL, 'Thar Blackout', 'SDTH-06'),
      ('Sheer Dimout Blind', NULL, 'Alchemy', 'SDAM-01'),
      ('Sheer Dimout Blind', NULL, 'Alchemy', 'SDAM-02'),
      ('Sheer Dimout Blind', NULL, 'Alchemy', 'SDAM-03'),
      ('Sheer Dimout Blind', NULL, 'Alchemy', 'SDAM-07'),
      ('Sheer Dimout Blind', NULL, 'Alchemy', 'SDAM-08'),
      ('Sheer Dimout Blind', NULL, 'Alchemy', 'SDAM-09'),
      ('Sheer Dimout Blind', NULL, 'Allure', 'SDAL-02'),
      ('Sheer Dimout Blind', NULL, 'Allure', 'SDAL-03'),
      ('Sheer Dimout Blind', NULL, 'Allure', 'SDAL-04'),
      ('Sheer Dimout Blind', NULL, 'Cosmos', 'SDCS-01'),
      ('Sheer Dimout Blind', NULL, 'Cosmos', 'SDCS-02'),
      ('Sheer Dimout Blind', NULL, 'Cosmos', 'SDCS-03'),
      ('Sheer Dimout Blind', NULL, 'Cosmos', 'SDCS-05'),
      ('Sheer Dimout Blind', NULL, 'Dune', 'SDDN-01'),
      ('Sheer Dimout Blind', NULL, 'Dune', 'SDDN-02'),
      ('Sheer Dimout Blind', NULL, 'Dune', 'SDDN-03'),
      ('Sheer Dimout Blind', NULL, 'Dune', 'SDDN-04'),
      ('Sheer Dimout Blind', NULL, 'Dune', 'SDDN-05'),
      ('Sheer Dimout Blind', NULL, 'Essence', 'SDEC-01'),
      ('Sheer Dimout Blind', NULL, 'Essence', 'SDEC-02'),
      ('Sheer Dimout Blind', NULL, 'Essence', 'SDEC-03'),
      ('Sheer Dimout Blind', NULL, 'Essence', 'SDEC-04'),
      ('Sheer Dimout Blind', NULL, 'Essence', 'SDEC-05'),
      ('Sheer Dimout Blind', NULL, 'Lagos', 'SDLG-01'),
      ('Sheer Dimout Blind', NULL, 'Lagos', 'SDLG-02'),
      ('Sheer Dimout Blind', NULL, 'Lagos', 'SDLG-03'),
      ('Sheer Dimout Blind', NULL, 'Lagos', 'SDLG-04'),
      ('Sheer Dimout Blind', NULL, 'Lagos', 'SDLG-05'),
      ('Sheer Dimout Blind', NULL, 'Pyla', 'SDPL-01'),
      ('Sheer Dimout Blind', NULL, 'Pyla', 'SDPL-04'),
      ('Sheer Dimout Blind', NULL, 'Trinity', 'SDTR-01'),
      ('Sheer Dimout Blind', NULL, 'Trinity', 'SDTR-02'),
      ('Sheer Dimout Blind', NULL, 'Trinity', 'SDTR-04'),
      ('S-Contour Blind', NULL, 'Opera Blackout', 'SCOPB-01'),
      ('S-Contour Blind', NULL, 'Opera Blackout', 'SCOPB-03'),
      ('S-Contour Blind', NULL, 'Opera NBO', 'SCOP-01'),
      ('S-Contour Blind', NULL, 'Opera NBO', 'SCOP-02'),
      ('S-Contour Blind', NULL, 'Opera NBO', 'SCOP-03'),
      ('Roller Blind', 'Screen', 'Classic Screen 5%', '558 Dark Grey'),
      ('Roller Blind', 'Screen', 'Classic Screen 5%', '560 Black Brown'),
      ('Roller Blind', 'Screen', 'Classic Screen 5%', '561 White Blue'),
      ('Roller Blind', 'Screen', 'Classic Screen 5%', '561 Black White'),
      ('Roller Blind', 'Screen', 'Solaris (with Silver Backing)', 'SRS-301 White'),
      ('Roller Blind', 'Screen', 'Solaris (with Silver Backing)', 'SRS-302 Beige'),
      ('Roller Blind', 'Screen', 'Solaris (with Silver Backing)', 'SRS-303 Grey'),
      ('Roller Blind', 'Translucent', 'Panama', 'PN-01 White'),
      ('Roller Blind', 'Translucent', 'Panama', 'PN-02 Cream'),
      ('Roller Blind', 'Translucent', 'Panama', 'PN-03 Pearl'),
      ('Roller Blind', 'Translucent', 'Panama', 'PN-04 Beige'),
      ('Roller Blind', 'Translucent', 'Panama', 'PN-05 Brown'),
      ('Roller Blind', 'Translucent', 'Panama', 'PN-06 Chocolate'),
      ('Roller Blind', 'Translucent', 'Panama', 'PN-07 Grey'),
      ('Roller Blind', 'Translucent', 'Panama', 'PN-08 Charcoal'),
      ('Roller Blind', 'Translucent', 'Celestial', '4% 401 White'),
      ('Roller Blind', 'Translucent', 'Celestial', '4% 402 Ivory'),
      ('Roller Blind', 'Translucent', 'Celestial', '4% 403 Beige'),
      ('Roller Blind', 'Translucent', 'Celestial', '4% 404 Grey'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-10'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-20'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-25'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-28'),
      ('Roller Blind', 'Translucent', 'Victorian', 'VIC-34'),
      ('Roller Blind', 'Blackout', 'Venice', 'Opaque-04'),
      ('Roller Blind', 'Blackout', 'Elena', '03'),
      ('Roller Blind', 'Blackout', 'Skyler', '03'),
      ('Roller Blind', 'Blackout', 'Oribi', '11'),
      ('Roller Blind', 'Blackout', 'Oribi', '12'),
      ('Roller Blind', 'Blackout', 'Oribi', '13'),
      ('Roller Blind', 'Blackout', 'Oribi', '14'),
      ('Roller Blind', 'Blackout', 'Oribi', '15'),
      ('Roller Blind', 'Blackout', 'Oribi', '16'),
      ('Roller Blind', 'Screen', 'Mellow', 'ML-06 Black'),
      ('S-Contour Blind', NULL, 'Opera Blackout', 'SCOPB-02'),
      ('S-Contour Blind', NULL, 'Croma Luxe Blackout', 'SCCL-01'),
      ('S-Contour Blind', NULL, 'Croma Luxe Blackout', 'SCCL-02'),
      ('S-Contour Blind', NULL, 'Croma Luxe Blackout', 'SCCL-03'),
      ('S-Contour Blind', NULL, 'Croma Luxe Blackout', 'SCCL-04'),
      ('S-Contour Blind', NULL, 'Dash Luxe Blackout', 'SCDX-01'),
      ('S-Contour Blind', NULL, 'Dash Luxe Blackout', 'SCDX-02'),
      ('S-Contour Blind', NULL, 'Dash Luxe Blackout', 'SCDX-03'),
      ('S-Contour Blind', NULL, 'Dash Luxe Blackout', 'SCDX-04'),
      ('S-Contour Blind', NULL, 'Diamond Luxe Blackout', 'SCDL-01'),
      ('S-Contour Blind', NULL, 'Diamond Luxe Blackout', 'SCDL-02'),
      ('S-Contour Blind', NULL, 'Diamond Luxe Blackout', 'SCDL-03'),
      ('S-Contour Blind', NULL, 'Diamond Luxe Blackout', 'SCDL-04'),
      ('S-Contour Blind', NULL, 'Diamond Luxe Blackout', 'SCDL-05'),
      ('S-Contour Blind', NULL, 'Shadow Luxe Blackout', 'SCSL-01'),
      ('S-Contour Blind', NULL, 'Shadow Luxe Blackout', 'SCSL-02'),
      ('S-Contour Blind', NULL, 'Shadow Luxe Blackout', 'SCSL-03'),
      ('S-Contour Blind', NULL, 'Shadow Luxe Blackout', 'SCSL-04'),
      ('S-Contour Blind', NULL, 'Tri Luxe Blackout', 'SCTL-01'),
      ('S-Contour Blind', NULL, 'Tri Luxe Blackout', 'SCTL-02'),
      ('S-Contour Blind', NULL, 'Tri Luxe Blackout', 'SCTL-03'),
      ('S-Contour Blind', NULL, 'Tri Luxe Blackout', 'SCTL-04'),
      ('Sheer Dimout Blind', NULL, 'Silk Blackout', 'SDSS-01'),
      ('Sheer Dimout Blind', NULL, 'Silk Blackout', 'SDSS-02'),
      ('Sheer Dimout Blind', NULL, 'Silk Blackout', 'SDSS-03'),
      ('Sheer Dimout Blind', NULL, 'Silk Blackout', 'SDSS-04'),
      ('Sheer Dimout Blind', NULL, 'Silk Blackout', 'SDSS-05'),
      ('Sheer Dimout Blind', NULL, 'Pure Blackout', 'SDPS-01'),
      ('Sheer Dimout Blind', NULL, 'Pure Blackout', 'SDPS-02'),
      ('Sheer Dimout Blind', NULL, 'Pure Blackout', 'SDPS-03'),
      ('Sheer Dimout Blind', NULL, 'Pure Blackout', 'SDPS-04'),
      ('Sheer Dimout Blind', NULL, 'Pure Blackout', 'SDPS-05'),
      ('Sheer Dimout Blind', NULL, 'Pure Blackout', 'SDPS-06'),
      ('Sheer Dimout Blind', NULL, 'Soft Silk Blackout', 'SDSK-01'),
      ('Sheer Dimout Blind', NULL, 'Soft Silk Blackout', 'SDSK-02'),
      ('Sheer Dimout Blind', NULL, 'Soft Silk Blackout', 'SDSK-03'),
      ('Sheer Dimout Blind', NULL, 'Soft Silk Blackout', 'SDSK-04'),
      ('Sheer Dimout Blind', NULL, 'Mist Glow Blackout', 'SDMG-01'),
      ('Sheer Dimout Blind', NULL, 'Mist Glow Blackout', 'SDMG-02'),
      ('Sheer Dimout Blind', NULL, 'Mist Glow Blackout', 'SDMG-03'),
      ('Sheer Dimout Blind', NULL, 'Mist Glow Blackout', 'SDMG-04'),
      ('Sheer Dimout Blind', NULL, 'Mist Glow Blackout', 'SDMG-05'),
      ('Sheer Dimout Blind', NULL, 'Mist Glow Blackout', 'SDMG-06'),
      ('Sheer Dimout Blind', NULL, 'Soft Glow Blackout', 'SDSG-01'),
      ('Sheer Dimout Blind', NULL, 'Soft Glow Blackout', 'SDSG-02'),
      ('Sheer Dimout Blind', NULL, 'Soft Glow Blackout', 'SDSG-03'),
      ('Sheer Dimout Blind', NULL, 'Soft Glow Blackout', 'SDSG-04'),
      ('Sheer Dimout Blind', NULL, 'Soft Glow Blackout', 'SDSG-05'),
      ('Sheer Dimout Blind', NULL, 'Dawn Light Blackout', 'SDDL-01'),
      ('Sheer Dimout Blind', NULL, 'Dawn Light Blackout', 'SDDL-02'),
      ('Sheer Dimout Blind', NULL, 'Dawn Light Blackout', 'SDDL-03'),
      ('Sheer Dimout Blind', NULL, 'Dawn Light Blackout', 'SDDL-04'),
      ('Sheer Dimout Blind', NULL, 'Aura Veil Blackout', 'SDAV-01'),
      ('Sheer Dimout Blind', NULL, 'Aura Veil Blackout', 'SDAV-02'),
      ('Sheer Dimout Blind', NULL, 'Aura Veil Blackout', 'SDAV-03'),
      ('Sheer Dimout Blind', NULL, 'Aura Veil Blackout', 'SDAV-04'),
      ('Sheer Dimout Blind', NULL, 'Aura Veil Blackout', 'SDAV-05'),
      ('Sheer Dimout Blind', NULL, 'Aura Veil Blackout', 'SDAV-06'),
      ('Sheer Dimout Blind', NULL, 'Eco Luxe Blackout', 'SDEL-01'),
      ('Sheer Dimout Blind', NULL, 'Eco Luxe Blackout', 'SDEL-02'),
      ('Sheer Dimout Blind', NULL, 'Eco Luxe Blackout', 'SDEL-03'),
      ('Sheer Dimout Blind', NULL, 'Eco Luxe Blackout', 'SDEL-04'),
      ('Sheer Dimout Blind', NULL, 'Eco Luxe Blackout', 'SDEL-05'),
      ('Sheer Dimout Blind', NULL, 'Eco Luxe Blackout', 'SDEL-06'),
      ('Sheer Dimout Blind', NULL, 'Memphis Blackout', 'SDMS-01'),
      ('Sheer Dimout Blind', NULL, 'Memphis Blackout', 'SDMS-02'),
      ('Sheer Dimout Blind', NULL, 'Memphis Blackout', 'SDMS-03'),
      ('Sheer Dimout Blind', NULL, 'Memphis Blackout', 'SDMS-04'),
      ('Sheer Dimout Blind', NULL, 'Memphis Blackout', 'SDMS-05'),
      ('Sheer Dimout Blind', NULL, 'Sahara Blackout', 'SDSR-02'),
      ('Sheer Dimout Blind', NULL, 'Sahara Blackout', 'SDSR-06'),
      ('Sheer Dimout Blind', NULL, 'Dune', 'SDDN-06'),
      ('Sheer Dimout Blind', NULL, 'Calm Waves', 'SDCW-01'),
      ('Sheer Dimout Blind', NULL, 'Calm Waves', 'SDCW-02'),
      ('Sheer Dimout Blind', NULL, 'Calm Waves', 'SDCW-03'),
      ('Sheer Dimout Blind', NULL, 'Calm Waves', 'SDCW-04'),
      ('Sheer Dimout Blind', NULL, 'Oasis', 'SDOA-01'),
      ('Sheer Dimout Blind', NULL, 'Oasis', 'SDOA-02'),
      ('Sheer Dimout Blind', NULL, 'Oasis', 'SDOA-03'),
      ('Sheer Dimout Blind', NULL, 'Oasis', 'SDOA-04'),
      ('Sheer Dimout Blind', NULL, 'Oasis', 'SDOA-05'),
      ('Sheer Dimout Blind', NULL, 'Oasis', 'SDOA-06'),
      ('Sheer Dimout Blind', NULL, 'Pyla', 'SDPL-02'),
      ('Sheer Dimout Blind', NULL, 'Pyla', 'SDPL-03'),
      ('Sheer Dimout Blind', NULL, 'Pyla', 'SDPL-05'),
      ('Sheer Dimout Blind', NULL, 'Alchemy', 'SDAM-05')
    ) AS seed(root_name, group_name, family_name, color_name)
  LOOP
    v_root := public.ensure_master_node_seed(NULL, rec.root_name, FALSE, 0);
    UPDATE public.master_nodes SET page_id = v_blinds_page WHERE id = v_root AND page_id IS DISTINCT FROM v_blinds_page;
    IF rec.group_name IS NULL THEN
      v_family := public.ensure_master_node_seed(v_root, rec.family_name, FALSE, 0);
    ELSE
      v_group_node := public.ensure_master_node_seed(v_root, rec.group_name, FALSE, 0);
      v_family := public.ensure_master_node_seed(v_group_node, rec.family_name, FALSE, 0);
    END IF;
    v_color_label := public.ensure_master_node_seed(v_family, 'Color', TRUE, 0);
    PERFORM public.ensure_master_node_seed(v_color_label, rec.color_name, FALSE, 0);
  END LOOP;

  v_root := public.ensure_master_node_seed(NULL, 'Curtain Tracks', FALSE, 0);
  UPDATE public.master_nodes SET page_id = v_tracks_page WHERE id = v_root AND page_id IS DISTINCT FROM v_tracks_page;
  v_root := public.ensure_master_node_seed(NULL, 'Motors', FALSE, 0);
  UPDATE public.master_nodes SET page_id = v_motors_page WHERE id = v_root AND page_id IS DISTINCT FROM v_motors_page;

  v_group := public.ensure_mechanism_group_seed('Roller Headrail / Cassette', 'Roller RRP columns and inflow part families: without headrail, with headrail, plain cassette, decorative cassette.', 10);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'Without Headrail', 'Without Headrail / Roller W/o Headrail Parts', 'rrp_wo_headrail', 10);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'With Headrail', 'With Headrail / Roller with Headrail Parts', 'rrp_w_headrail', 20);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'With Plain Cassette', 'With Plan Cassette', 'rrp_w_plain_cassette', 30);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'With Decorative Cassette', 'With Decorative cassette', 'rrp_w_dec_cassette', 40);
  INSERT INTO public.master_mechanism_groups(master_node_id, mechanism_group_id, sort_order)
  SELECT mn.id, v_group, 10 FROM public.master_nodes mn
  WHERE mn.parent_id IS NULL AND mn.normalized_name = public.normalize_master_seed_name('Roller Blind')
  ON CONFLICT (master_node_id, mechanism_group_id) DO NOTHING;

  v_group := public.ensure_mechanism_group_seed('Sheer Dimout Mechanism / Cassette', 'Zebra blind options from Classic/Premium mechanism and plain/decorative cassette columns.', 20);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'Classic Mechanism with Plain Cassette', 'Classic Mechanism / Plain Cassette', 'classic_plain_cassette', 10);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'Classic Mechanism with Decorative Cassette', 'Classic Mechanism / Decorative Cassette', 'classic_decorative_cassette', 20);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'Premium Mechanism with Plain Cassette', 'Premium Mechanism / Plain Cassette', 'premium_plain_cassette', 30);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'Premium Mechanism with Decorative Cassette', 'Premium Mechanism / Decorative Cassette', 'premium_decorative_cassette', 40);
  INSERT INTO public.master_mechanism_groups(master_node_id, mechanism_group_id, sort_order)
  SELECT mn.id, v_group, 20 FROM public.master_nodes mn
  WHERE mn.parent_id IS NULL AND mn.normalized_name = public.normalize_master_seed_name('Sheer Dimout Blind')
  ON CONFLICT (master_node_id, mechanism_group_id) DO NOTHING;

  v_group := public.ensure_mechanism_group_seed('Roman Mechanism', 'Roman chain mechanism and decorative cassette pricing columns.', 30);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'With Chain Mech', 'WITH CHAIN MECH', 'with_chain_mech', 10);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'With Decorative Cassette', 'WITH DECORATIVE CASSETTE', 'with_decorative_cassette', 20);
  INSERT INTO public.master_mechanism_groups(master_node_id, mechanism_group_id, sort_order)
  SELECT mn.id, v_group, 30 FROM public.master_nodes mn
  WHERE mn.parent_id IS NULL AND mn.normalized_name = public.normalize_master_seed_name('Roman Blind')
  ON CONFLICT (master_node_id, mechanism_group_id) DO NOTHING;

  v_group := public.ensure_mechanism_group_seed('Mono Mechanism', 'Single mechanism pricing columns such as mono mech and laddertape with mono mech.', 40);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'Mono Mech', 'MONO MECH', 'mono_mech', 10);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'Laddertape with Mono Mech', 'LADDERTAPE WITH MONO MECH', 'laddertape_mono_mech', 20);
  INSERT INTO public.master_mechanism_groups(master_node_id, mechanism_group_id, sort_order)
  SELECT mn.id, v_group, 40 FROM public.master_nodes mn
  WHERE mn.parent_id IS NULL AND mn.normalized_name IN (
    public.normalize_master_seed_name('Vertical Blind'),
    public.normalize_master_seed_name('Wooden Venetian Blind'),
    public.normalize_master_seed_name('Aluminium Venetian Blind'),
    public.normalize_master_seed_name('Cellular Blind')
  )
  ON CONFLICT (master_node_id, mechanism_group_id) DO NOTHING;

  v_group := public.ensure_mechanism_group_seed('S-Contour Cassette', 'S-Contour decorative cassette pricing column and matching inflow parts.', 50);
  PERFORM public.ensure_mechanism_option_seed(v_group, 'With Decorative Cassette', 'With Decorative cassette / S Contour Parts', 'with_decorative_cassette', 10);
  INSERT INTO public.master_mechanism_groups(master_node_id, mechanism_group_id, sort_order)
  SELECT mn.id, v_group, 50 FROM public.master_nodes mn
  WHERE mn.parent_id IS NULL AND mn.normalized_name = public.normalize_master_seed_name('S-Contour Blind')
  ON CONFLICT (master_node_id, mechanism_group_id) DO NOTHING;
END;
$$;

COMMIT;
