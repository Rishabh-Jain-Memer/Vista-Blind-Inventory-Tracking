-- Migration 004: Import positive stock rows from Vista Inventory Inflow New.xlsx
-- Optional test stock import. Re-runnable: updates matching variant/batch rows instead of duplicating them.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_inventory_import_name(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.import_inventory_inflow_stock_row(
  p_category_name TEXT,
  p_sub_group TEXT,
  p_product_name TEXT,
  p_variant_name TEXT,
  p_width_m NUMERIC,
  p_unit TEXT,
  p_batch_code TEXT,
  p_quantity NUMERIC,
  p_rate NUMERIC,
  p_bill_no TEXT,
  p_purchase_date DATE,
  p_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_category_id UUID;
  v_product_id UUID;
  v_variant_id UUID;
  v_roll_id UUID;
  v_category_norm TEXT := public.normalize_inventory_import_name(p_category_name);
  v_product_norm TEXT := public.normalize_inventory_import_name(p_product_name);
  v_variant_norm TEXT := public.normalize_inventory_import_name(p_variant_name);
BEGIN
  INSERT INTO public.inv_categories(name, normalized_name, sub_group)
  VALUES (trim(p_category_name), v_category_norm, p_sub_group)
  ON CONFLICT (normalized_name) DO UPDATE
    SET name = EXCLUDED.name, sub_group = EXCLUDED.sub_group
  RETURNING id INTO v_category_id;

  INSERT INTO public.inv_products(category_id, name, normalized_name)
  VALUES (v_category_id, trim(p_product_name), v_product_norm)
  ON CONFLICT (category_id, normalized_name) DO UPDATE
    SET name = EXCLUDED.name
  RETURNING id INTO v_product_id;

  INSERT INTO public.inv_variants(product_id, name, normalized_name, width_m, unit, purchase_rate)
  VALUES (v_product_id, trim(p_variant_name), v_variant_norm, p_width_m, p_unit, p_rate)
  ON CONFLICT (product_id, normalized_name) DO UPDATE
    SET name = EXCLUDED.name,
        width_m = COALESCE(EXCLUDED.width_m, public.inv_variants.width_m),
        unit = EXCLUDED.unit,
        purchase_rate = EXCLUDED.purchase_rate
  RETURNING id INTO v_variant_id;

  SELECT id INTO v_roll_id
  FROM public.inv_rolls
  WHERE variant_id = v_variant_id AND batch_code = p_batch_code
  ORDER BY created_at
  LIMIT 1;

  IF v_roll_id IS NULL THEN
    INSERT INTO public.inv_rolls(variant_id, batch_code, original_length, remaining_length, unit, purchase_rate, status, inward_date, bill_no, stock_value, notes)
    VALUES (v_variant_id, p_batch_code, p_quantity, p_quantity, p_unit, p_rate, 'in_stock', p_purchase_date, p_bill_no, p_quantity * COALESCE(p_rate, 0), p_note)
    RETURNING id INTO v_roll_id;
  ELSE
    UPDATE public.inv_rolls
    SET original_length = p_quantity,
        remaining_length = p_quantity,
        unit = p_unit,
        purchase_rate = p_rate,
        status = CASE WHEN p_quantity > 0 THEN 'in_stock' ELSE status END,
        inward_date = p_purchase_date,
        bill_no = p_bill_no,
        stock_value = p_quantity * COALESCE(p_rate, 0),
        notes = p_note
    WHERE id = v_roll_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inv_movements
    WHERE roll_id = v_roll_id
      AND variant_id = v_variant_id
      AND movement_type = 'inward'
      AND reference IS NOT DISTINCT FROM p_bill_no
      AND quantity = p_quantity
  ) THEN
    INSERT INTO public.inv_movements(roll_id, variant_id, movement_type, quantity, unit, rate, reference, note)
    VALUES (v_roll_id, v_variant_id, 'inward', p_quantity, p_unit, p_rate, p_bill_no, p_note);
  END IF;
END;
$$;

SELECT public.import_inventory_inflow_stock_row(category_name, sub_group, product_name, variant_name, width_m, unit, batch_code, quantity, rate, bill_no, purchase_date, note)
FROM (VALUES
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Bamberg 01', 2.3, 'm', 'R-001', 36, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 3'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Bamberg 02', 2.3, 'm', 'R-002', 36, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 4'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Bamberg 03', 2.3, 'm', 'R-003', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 5'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Bamberg 04', 2.3, 'm', 'R-004', 33, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 6'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Bamberg 05', 2.3, 'm', 'R-005', 33, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 7'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Cloudnine CN-01 White', 2.8, 'm', 'R-006', 32, 1140, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 8'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Cloudnine CN-02 Ivory', 2.8, 'm', 'R-007', 32, 1140, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 9'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Cloudnine CN-03 Grey', 2.8, 'm', 'R-008', 32, 1140, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 10'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout DS Opaque Linen', 2.3, 'm', 'R-009', 30, 875, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 11'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout DS Opaque Grey', 2.3, 'm', 'R-010', 30, 875, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 12'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout DS Opaque White', 2.3, 'm', 'R-011', 30, 875, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 13'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout DS Opaque Fawn', 2.3, 'm', 'R-012', 30, 875, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 14'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout DS Opaque Champagne', 2.3, 'm', 'R-013', 30, 875, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 15'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Elena 01', 2.3, 'm', 'R-014', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 16'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Elena 02', 2.3, 'm', 'R-015', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 17'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Elena 04', 2.3, 'm', 'R-016', 32, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 18'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Elena 05', 2.3, 'm', 'R-017', 41, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 19'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Murano Opaque-01', 2.3, 'm', 'R-018', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 20'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Murano Opaque-03', 2.3, 'm', 'R-019', 34, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 21'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Murano Opaque-05', 2.3, 'm', 'R-020', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 22'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Murano Opaque-07', 2.3, 'm', 'R-021', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 23'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Oribi 01', 2.3, 'm', 'R-022', 38, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 24'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Oribi 02', 2.3, 'm', 'R-023', 33, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 25'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Oribi 03', 2.3, 'm', 'R-024', 32, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 26'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Oribi 04', 2.3, 'm', 'R-025', 33, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 27'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Oribi 05', 2.3, 'm', 'R-026', 35, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 28'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Oribi 06', 2.3, 'm', 'R-027', 31, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 29'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Oribi 07', 2.3, 'm', 'R-028', 37, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 30'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Oribi 08', 2.3, 'm', 'R-029', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 31'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Oribi 09', 2.3, 'm', 'R-030', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 32'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Oribi 10', 2.3, 'm', 'R-031', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 33'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Serene Opaque-01 White', 2.3, 'm', 'R-032', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 34'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Serene Opaque-01 White', 2.3, 'm', 'R-033', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 35'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Serene Opaque-02 Beige', 2.3, 'm', 'R-034', 32, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 36'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Serene Opaque-02 Beige', 2.3, 'm', 'R-035', 32, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 37'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Serene Opaque-03 Sand', 2.3, 'm', 'R-036', 28, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 38'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Serene Opaque-03 Sand', 2.3, 'm', 'R-037', 28, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 39'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Serene Opaque-04 Grey', 2.3, 'm', 'R-038', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 40'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Serene Opaque-04 Grey', 2.3, 'm', 'R-039', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 41'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Skyler 01', 2.3, 'm', 'R-040', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 42'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Skyler 02', 2.3, 'm', 'R-041', 33, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 43'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Skyler 04', 2.3, 'm', 'R-042', 35, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 44'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Skyler 05', 2.3, 'm', 'R-043', 35, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 45'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Skyler 06', 2.3, 'm', 'R-044', 31, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 46'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Venice Opaque-01', 2.3, 'm', 'R-045', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 47'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Venice Opaque-02', 2.3, 'm', 'R-046', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 48'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Venice Opaque-03', 2.3, 'm', 'R-047', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 49'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Venice Opaque-05', 2.3, 'm', 'R-048', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 50'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Venice Opaque-06', 2.3, 'm', 'R-049', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 51'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Violet 01', 2.3, 'm', 'R-050', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 52'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Violet 02', 2.3, 'm', 'R-051', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 53'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Violet 03', 2.3, 'm', 'R-052', 32, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 54'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Violet 04', 2.3, 'm', 'R-053', 31, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 55'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Blackout Violet 05', 2.3, 'm', 'R-054', 30, 565, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 56'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 1% 111 White', 2.5, 'm', 'R-077', 35, 925, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 57'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 1% 112 Beige', 2.5, 'm', 'R-078', 35, 925, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 58'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 1% 113 Grey', 2.5, 'm', 'R-079', 35, 925, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 59'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 3% 331 White', 2.5, 'm', 'R-080', 35, 665, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 60'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 3% 331 White', 2.5, 'm', 'R-081', 35, 665, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 61'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 3% 331 White', 2.5, 'm', 'R-082', 35, 665, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 62'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 3% 332 Beige', 2.5, 'm', 'R-083', 35, 665, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 63'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 3% 332 Beige', 2.5, 'm', 'R-084', 35, 665, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 64'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 3% 332 Beige', 2.5, 'm', 'R-085', 35, 665, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 65'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 3% 334 Grey', 2.5, 'm', 'R-086', 35, 665, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 66'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 3% 334 Grey', 2.5, 'm', 'R-087', 35, 665, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 67'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 3% 334 Grey', 2.5, 'm', 'R-088', 35, 665, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 68'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 551 White', 2.5, 'm', 'R-089', 35, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 69'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 551 White', 2.5, 'm', 'R-090', 35, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 70'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 551 White', 2.5, 'm', 'R-091', 35, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 71'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 552 Fawn', 2.5, 'm', 'R-092', 40, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 72'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 552 Fawn', 2.5, 'm', 'R-093', 40, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 73'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 552 Fawn', 2.5, 'm', 'R-094', 40, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 74'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 554 Grey', 2.5, 'm', 'R-095', 35, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 75'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 554 Grey', 2.5, 'm', 'R-096', 35, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 76'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 554 Grey', 2.5, 'm', 'R-097', 35, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 77'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 556 Black Grey', 2.5, 'm', 'R-098', 35, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 78'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 556 Black Grey', 2.5, 'm', 'R-099', 35, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 79'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 557 Light Grey', 2.5, 'm', 'R-100', 35, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 80'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Classic 5% 557 Light Grey', 2.5, 'm', 'R-101', 35, 640, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 81'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Mellow ML-01 White', 2.8, 'm', 'R-102', 40, 1280, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 82'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Mellow ML-02 Ivory', 2.8, 'm', 'R-103', 40, 1280, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 83'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Mellow ML-03 Beige', 2.8, 'm', 'R-104', 40, 1280, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 84'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Mellow ML-04 Chocolate', 2.8, 'm', 'R-105', 40, 1280, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 85'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Screen Mellow ML-05 Grey', 2.8, 'm', 'R-106', 40, 1280, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 86'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Surge SG-01', 2.8, 'm', 'R-107', 50, 975, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 87'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Surge SG-04', 2.8, 'm', 'R-108', 50, 975, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 88'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Surge SG-05', 2.8, 'm', 'R-109', 50, 975, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 89'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Translucent Serene NBO 01 White', 2.3, 'm', 'R-110', 60, 430, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 90'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Translucent Serene NBO 02 Beige', 2.3, 'm', 'R-111', 54, 430, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 91'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Translucent Serene NBO 03 Sand', 2.3, 'm', 'R-112', 60, 430, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 92'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Translucent Serene NBO 04 Grey', 2.3, 'm', 'R-113', 62, 430, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 93'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Translucent Victorian VIC-01', 2.3, 'm', 'R-114', 30, 310, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 94'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Translucent Victorian VIC-03', 2.3, 'm', 'R-115', 30, 310, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 95'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Translucent Victorian VIC-09', 2.3, 'm', 'R-116', 30, 310, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 96'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Translucent Victorian VIC-16', 2.3, 'm', 'R-117', 30, 310, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 97'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Translucent Victorian VIC-31', 2.3, 'm', 'R-118', 30, 310, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 98'),
  ('Roller Blind', 'Fabric', 'Roller Blind', 'Roller Blind Translucent Victorian VIC-33', 2.3, 'm', 'R-119', 30, 310, 'A2TR/25-26/3005', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 99'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Denver Blackout SDDR-02', 3.15, 'm', 'R-055', 50, 720, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 100'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Denver Blackout SDDR-03', 3.15, 'm', 'R-056', 50, 720, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 101'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Denver Blackout SDDR-04', 3.15, 'm', 'R-057', 50, 720, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 102'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Novel SDNB-01', 2.8, 'm', 'R-058', 45, 770, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 103'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Novel SDNB-02', 2.8, 'm', 'R-059', 40, 770, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 104'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Novel SDNB-03', 2.8, 'm', 'R-060', 40, 770, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 105'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Novel SDNB-04', 2.8, 'm', 'R-061', 40, 770, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 106'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Novel SDNB-05', 2.8, 'm', 'R-062', 35, 770, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 107'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Novel SDNB-06', 2.8, 'm', 'R-063', 40, 770, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 108'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Sahara Blackout SDSR-01', 2.8, 'm', 'R-066', 50, 845, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 109'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Sahara Blackout SDSR-01', 2.8, 'm', 'R-067', 50, 845, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 110'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Sahara Blackout SDSR-03', 2.8, 'm', 'R-068', 50, 845, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 111'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Sahara Blackout SDSR-04', 2.8, 'm', 'R-069', 50, 845, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 112'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Sahara Blackout SDSR-05', 2.8, 'm', 'R-070', 50, 845, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 113'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Sahara Blackout SDSR-05', 2.8, 'm', 'R-071', 50, 845, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 114'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Sahara Blackout SDSR-07', 2.8, 'm', 'R-072', 56, 845, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 115'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Thar Blackout SDTH-03', 3.15, 'm', 'R-073', 50, 699, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 116'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Thar Blackout SDTH-04', 3.15, 'm', 'R-074', 44, 699, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 117'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Thar Blackout SDTH-05', 3.15, 'm', 'R-075', 50, 699, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 118'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Thar Blackout SDTH-06', 3.15, 'm', 'R-076', 50, 699, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 119'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Alchemy SDAM-01', 2.8, 'm', 'R-120', 70, 320, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 120'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Alchemy SDAM-01', 2.8, 'm', 'R-121', 47, 320, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 121'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Alchemy SDAM-02', 2.8, 'm', 'R-122', 70, 320, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 122'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Alchemy SDAM-02', 2.8, 'm', 'R-123', 70, 320, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 123'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Alchemy SDAM-03', 2.8, 'm', 'R-124', 70, 320, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 124'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Alchemy SDAM-03', 2.8, 'm', 'R-125', 70, 320, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 125'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Alchemy SDAM-07', 2.8, 'm', 'R-126', 70, 320, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 126'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Alchemy SDAM-07', 2.8, 'm', 'R-127', 70, 320, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 127'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Alchemy SDAM-08', 2.8, 'm', 'R-128', 70, 320, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 128'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Alchemy SDAM-09', 2.8, 'm', 'R-129', 70, 320, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 129'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Allure SDAL-02', 2.8, 'm', 'R-130', 50, 1650, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 130'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Allure SDAL-03', 2.8, 'm', 'R-131', 50, 1650, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 131'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Allure SDAL-04', 2.8, 'm', 'R-132', 50, 1650, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 132'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Cosmos SDCS-01', 2.8, 'm', 'R-133', 50, 490, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 133'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Cosmos SDCS-02', 2.8, 'm', 'R-134', 50, 490, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 134'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Cosmos SDCS-03', 2.8, 'm', 'R-135', 50, 490, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 135'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Cosmos SDCS-05', 2.8, 'm', 'R-136', 50, 490, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 136'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Dune SDDN-01', 3.2, 'm', 'R-137', 40, 665, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 137'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Dune SDDN-02', 3.2, 'm', 'R-138', 40, 665, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 138'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Dune SDDN-03', 3.2, 'm', 'R-139', 40, 665, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 139'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Dune SDDN-04', 3.2, 'm', 'R-140', 40, 665, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 140'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Dune SDDN-05', 3.2, 'm', 'R-141', 43, 665, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 141'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Essence SDEC-01', 2.8, 'm', 'R-142', 50, 450, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 142'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Essence SDEC-02', 2.8, 'm', 'R-143', 50, 450, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 143'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Essence SDEC-03', 2.8, 'm', 'R-144', 50, 450, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 144'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Essence SDEC-04', 2.8, 'm', 'R-145', 50, 450, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 145'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Essence SDEC-05', 2.8, 'm', 'R-146', 50, 450, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 146'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Lagos SDLG-01', 3.2, 'm', 'R-147', 40, 885, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 147'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Lagos SDLG-02', 3.2, 'm', 'R-148', 40, 885, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 148'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Lagos SDLG-03', 3.2, 'm', 'R-149', 40, 885, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 149'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Lagos SDLG-04', 3.2, 'm', 'R-150', 40, 885, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 150'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Lagos SDLG-05', 3.2, 'm', 'R-151', 40, 885, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 151'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Pyla SDPL-01', 3, 'm', 'R-152', 50, 879, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 152'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Pyla SDPL-04', 2.8, 'm', 'R-153', 47, 820, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 153'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Trinity SDTR-01', 2.8, 'm', 'R-154', 50, 845, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 154'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Trinity SDTR-02', 2.8, 'm', 'R-155', 45, 845, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 155'),
  ('Sheer Dimout Fabrics', 'Fabric', 'Sheer Dimout', 'Sheer Dimout Trinity SDTR-04', 2.8, 'm', 'R-156', 40, 845, 'A2TR/25-26/3011', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 156'),
  ('S-Contour Fabrics', 'Fabric', 'S-Contour', 'S-Contour Opera Blackout SCOPB-01', 3, 'm', 'R-064', 33, 3800, 'A2TR/25-26/3016', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 157'),
  ('S-Contour Fabrics', 'Fabric', 'S-Contour', 'S-Contour Opera Blackout SCOPB-03', 3, 'm', 'R-065', 35, 3800, 'A2TR/25-26/3016', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 158'),
  ('S-Contour Fabrics', 'Fabric', 'S-Contour', 'S-Contour Opera NBO SCOP-01', 3, 'm', 'R-157', 33, 1950, 'A2TR/25-26/3016', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 159'),
  ('S-Contour Fabrics', 'Fabric', 'S-Contour', 'S-Contour Opera NBO SCOP-02', 3, 'm', 'R-158', 35, 1950, 'A2TR/25-26/3016', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 160'),
  ('S-Contour Fabrics', 'Fabric', 'S-Contour', 'S-Contour Opera NBO SCOP-03', 3, 'm', 'R-159', 35, 1950, 'A2TR/25-26/3016', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR Fabrics row 161'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'ALUMINIUM CHANNEL 4.572 MTR', NULL, 'm', 'A2TR/25-26/3000', 137.2, 190, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 3'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'TILT ROD 4.572 MTR', NULL, 'm', 'A2TR/25-26/3000', 137.2, 26, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 4'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'CORD 2.2MM WHITE', NULL, 'm', 'A2TR/25-26/3000', 500, 2, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 5'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'BOTTOM CHAIN 4 INCH', NULL, 'm', 'A2TR/25-26/3000', 500, 5, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 6'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'TILTING CHAIN', NULL, 'm', 'A2TR/25-26/3000', 250, 10, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 7'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'ALUMINIUM ROLLER TUBE (4.575) 38 MM', NULL, 'm', 'A2TR/25-26/3002', 915, 195, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 8'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'ALU BOTTOM RAIL (4.575 MTR)', NULL, 'm', 'A2TR/25-26/3002', 915, 100, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 9'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'Double Sided Fixon Tape 12MM', NULL, 'm', 'A2TR/25-26/3002', 2160, 3, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 10'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'Operating Ball Chain''', NULL, 'm', 'A2TR/25-26/3002', 2000, 10, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 11'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'PVC INSERT 15MM', NULL, 'm', 'A2TR/25-26/3002', 1000, 6, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 12'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'PVC INSERT 12 MM', NULL, 'm', 'A2TR/25-26/3002', 1000, 6, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 13'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'POLY TUBE 5"', NULL, 'm', 'A2TR/25-26/3002', 1000, 4, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 14'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'ALU ROLLER TUBE 39MM (4.575 MTR)', NULL, 'm', 'A2TR/25-26/3004', 228.75, 195, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 15'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'ALU. ROUND BOTTOM RAIL(4.57 MTR)', NULL, 'm', 'A2TR/25-26/3004', 228.75, 100, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 16'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'ALU.HEADRAIL PATTI (4.575 MTR)', NULL, 'm', 'A2TR/25-26/3004', 228.75, 145, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 17'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'Double Sided Fixon Tape 12MM', NULL, 'm', 'A2TR/25-26/3004', 540, 3, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 18'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'Operating Ball Chain', NULL, 'm', 'A2TR/25-26/3004', 500, 10, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 19'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'PVC INSERT 15MM', NULL, 'm', 'A2TR/25-26/3004', 250, 6, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 20'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'PVC INSERT 12 MM', NULL, 'm', 'A2TR/25-26/3004', 250, 6, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 21'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'POLY TUBE 5"', NULL, 'm', 'A2TR/25-26/3004', 250, 4, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 22'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-ALU ROLLER TUBE 39MM (4.575 MTR)', NULL, 'm', 'A2TR/25-26/3008', 45.75, 195, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 23'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-ALU BOTTOM RAIL (4.575 MTR)', NULL, 'm', 'A2TR/25-26/3008', 45.75, 160, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 24'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-Alu. Headrail with Cover', NULL, 'm', 'A2TR/25-26/3008', 45.75, 470, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 25'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-End Less Chain', NULL, 'm', 'A2TR/25-26/3008', 30, 32, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 26'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-PVC SHEET WIDTH 87 MM', NULL, 'm', 'A2TR/25-26/3008', 50, 16, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 27'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-PVC INSERT 12 MM', NULL, 'm', 'A2TR/25-26/3008', 50, 6, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 28'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-Double Sided Fixon Tape 12MM', NULL, 'm', 'A2TR/25-26/3008', 108, 4, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 29'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-POLY TUBE 5"', NULL, 'm', 'A2TR/25-26/3008', 50, 4, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 30'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'ALU ROLLER TUBE 39MM (4.575 MTR)', NULL, 'm', 'A2TR/25-26/3009', 457.5, 165, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 31'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'ALU. ROUND BOTTOM RAIL(4.57 MTR)', NULL, 'm', 'A2TR/25-26/3009', 457.5, 71, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 32'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'ALU. TRIANGLE TYPE BOTTOM RAIL', NULL, 'm', 'A2TR/25-26/3009', 457.5, 118, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 33'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'Alu. Headrail with Cover', NULL, 'm', 'A2TR/25-26/3009', 457.5, 288, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 34'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'End Less Chain', NULL, 'm', 'A2TR/25-26/3009', 300, 32, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 35'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'P.V.C INSERT 10MM', NULL, 'm', 'A2TR/25-26/3009', 500, 4, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 36'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'PVC INSERT 12 MM', NULL, 'm', 'A2TR/25-26/3009', 500, 6, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 37'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'Double Sided Fixon Tape 12MM', NULL, 'm', 'A2TR/25-26/3009', 1080, 4, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 38'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'POLY TUBE 5"', NULL, 'm', 'A2TR/25-26/3009', 500, 4, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 39'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'ALU ROLLER TUBE 39MM (4.575 MTR)', NULL, 'm', 'A2TR/25-26/3010', 228.75, 195, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 40'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'ALU. ROUND BOTTOM RAIL(4.57 MTR)', NULL, 'm', 'A2TR/25-26/3010', 228.75, 115, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 41'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'ALU. U TYPE BOTTOM RAIL', NULL, 'm', 'A2TR/25-26/3010', 228.75, 160, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 42'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'End Less Chain', NULL, 'm', 'A2TR/25-26/3010', 150, 32, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 43'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'P.V.C INSERT 10MM', NULL, 'm', 'A2TR/25-26/3010', 250, 4, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 44'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'PVC INSERT 12 MM', NULL, 'm', 'A2TR/25-26/3010', 250, 6, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 45'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'Double Sided Fixon Tape 12MM', NULL, 'm', 'A2TR/25-26/3010', 540, 4, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 46'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'POLY TUBE 5"', NULL, 'm', 'A2TR/25-26/3010', 250, 4, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 47'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'Alu. Headrail with Cover', NULL, 'm', 'A2TR/25-26/3010', 228.75, 470, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 48'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'PVC SHEET WIDTH 87 MM', NULL, 'm', 'A2TR/25-26/3010', 250, 16, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 49'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'Head Rail Aluminium', NULL, 'm', 'A2TR/25-26/3012', 100, 353, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 50'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'TILT ROD 4.572 MTR', NULL, 'm', 'A2TR/25-26/3012', 100, 44, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 51'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'M.S.Rod 4 MM', NULL, 'm', 'A2TR/25-26/3012', 450, 49, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 52'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'M.S.Rod 7 MM', NULL, 'm', 'A2TR/25-26/3012', 100, 112, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 53'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'CORD', NULL, 'm', 'A2TR/25-26/3012', 400, 1.65, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 54'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'VELCROW TAPE', NULL, 'm', 'A2TR/25-26/3012', 100, 17, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 55'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'SECTION NON-FERROUS SUPER TRACK', NULL, 'm', 'A2TR/25-26/3014', 228.6, 111, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 56'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'AL SECTION NON-FERROUS JUMBO TRACK', NULL, 'm', 'A2TR/25-26/3014', 228.6, 86, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 57'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'ALU SECTION NON-FERROUS M TRACK', NULL, 'm', 'A2TR/25-26/3014', 228.6, 96, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 58'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'ALUMINIUM ROLLER TUBE (4.575) 38 MM', NULL, 'm', 'A2TR/25-26/3048', 183, 195, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 59'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'ALU BOTTOM RAIL (4.575 MTR)', NULL, 'm', 'A2TR/25-26/3048', 183, 100, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 60'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'Double Sided Fixon Tape 12MM', NULL, 'm', 'A2TR/25-26/3048', 432, 3, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 61'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'Operating Ball Chain''', NULL, 'm', 'A2TR/25-26/3048', 400, 10, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 62'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'PVC INSERT 15MM', NULL, 'm', 'A2TR/25-26/3048', 200, 6, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 63'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'PVC INSERT 12 MM', NULL, 'm', 'A2TR/25-26/3048', 200, 6, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 64'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'POLY TUBE 5"', NULL, 'm', 'A2TR/25-26/3048', 200, 4, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for MTR - parts row 65'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'RUNNERS', NULL, 'pcs', 'A2TR/25-26/3000', 1650, 8.5, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 3'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'SPACERS', NULL, 'pcs', 'A2TR/25-26/3000', 1650, 1, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 4'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'P. CLIP', NULL, 'pcs', 'A2TR/25-26/3000', 180, 10.5, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 5'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'CONTROL UNIT', NULL, 'pcs', 'A2TR/25-26/3000', 90, 45, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 6'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'TILT CHAIN LOCK', NULL, 'pcs', 'A2TR/25-26/3000', 90, 1, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 7'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'M.S. LOCK', NULL, 'pcs', 'A2TR/25-26/3000', 90, 1, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 8'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'ROD SUPPORT', NULL, 'pcs', 'A2TR/25-26/3000', 45, 7, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 9'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', '3 PCS SET', NULL, 'pcs', 'A2TR/25-26/3000', 90, 6, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 10'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'CORD DRIVE RUNNER', NULL, 'pcs', 'A2TR/25-26/3000', 45, 5, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 11'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'CORD WEIGHT', NULL, 'pcs', 'A2TR/25-26/3000', 90, 23, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 12'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'HANGERS', NULL, 'pcs', 'A2TR/25-26/3000', 1650, 2.25, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 13'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'C-LOCK', NULL, 'pcs', 'A2TR/25-26/3000', 135, 2, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 14'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'SPACING TUBE', NULL, 'pcs', 'A2TR/25-26/3000', 180, 1, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 15'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'L BRACKET', NULL, 'pcs', 'A2TR/25-26/3000', 180, 9.5, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 16'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'BOTTOM WEIGHT NEW', NULL, 'pcs', 'A2TR/25-26/3000', 1650, 9, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 17'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'SILICON SPRAY BOTTLE', NULL, 'pcs', 'A2TR/25-26/3000', 2, 95, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 18'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'STICKER VISTA', NULL, 'pcs', 'A2TR/25-26/3000', 90, 5, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 19'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'ROYAL PLUG 8X50', NULL, 'pcs', 'A2TR/25-26/3000', 360, 0.65, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 20'),
  ('Vertical Blinds Parts', 'Parts', 'Vertical Blinds', 'ROYAL SCREW 8X50', NULL, 'pcs', 'A2TR/25-26/3000', 360, 0.65, 'A2TR/25-26/3000', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 21'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'CONTROL UNIT KS 38 MM', NULL, 'pcs', 'A2TR/25-26/3002', 600, 240, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 22'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'CORD WEIGHT', NULL, 'pcs', 'A2TR/25-26/3002', 600, 23, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 23'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'Connector - Bush Type''', NULL, 'pcs', 'A2TR/25-26/3002', 600, 2.5, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 24'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'Bottom Rail End Cap''', NULL, 'pcs', 'A2TR/25-26/3002', 1200, 3, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 25'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'Chain Stopper', NULL, 'pcs', 'A2TR/25-26/3002', 600, 4, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 26'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'ROYAL SCREW 8X50', NULL, 'pcs', 'A2TR/25-26/3002', 4000, 0.65, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 27'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'ROYAL PLUG 8X50', NULL, 'pcs', 'A2TR/25-26/3002', 4000, 0.65, 'A2TR/25-26/3002', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 28'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'CONTROL UNIT 38MM', NULL, 'pcs', 'A2TR/25-26/3004', 150, 400, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 29'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'CORD WEIGHT', NULL, 'pcs', 'A2TR/25-26/3004', 150, 23, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 30'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'Connector - Bush Type''', NULL, 'pcs', 'A2TR/25-26/3004', 150, 2.5, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 31'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'Bottom Rail End Cap''', NULL, 'pcs', 'A2TR/25-26/3004', 300, 3, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 32'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'Chain Stopper', NULL, 'pcs', 'A2TR/25-26/3004', 150, 4, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 33'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'L BRACKET', NULL, 'pcs', 'A2TR/25-26/3004', 500, 5, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 34'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'P. CLIP', NULL, 'pcs', 'A2TR/25-26/3004', 500, 14, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 35'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'ROYAL PLUG 8X50', NULL, 'pcs', 'A2TR/25-26/3004', 1000, 0.65, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 36'),
  ('Roller with Headrail Parts', 'Parts', 'Roller with Headrail', 'ROYAL SCREW 8X50', NULL, 'pcs', 'A2TR/25-26/3004', 1000, 0.65, 'A2TR/25-26/3004', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 37'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-CONTROL UNIT 38MM', NULL, 'pcs', 'A2TR/25-26/3008', 30, 140, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 38'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-Bottom Rail End Cap''', NULL, 'pcs', 'A2TR/25-26/3008', 60, 5, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 39'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-Chain Stopper', NULL, 'pcs', 'A2TR/25-26/3008', 30, 5, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 40'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-Metal End Cap', NULL, 'pcs', 'A2TR/25-26/3008', 30, 87, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 41'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-CEILING BRACKET', NULL, 'pcs', 'A2TR/25-26/3008', 90, 56, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 42'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-CORD WEIGHT', NULL, 'pcs', 'A2TR/25-26/3008', 30, 23, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 43'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-ROYAL SCREW 8X50', NULL, 'pcs', 'A2TR/25-26/3008', 200, 0.65, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 44'),
  ('S Contour Parts', 'Parts', 'S', 'Contour-ROYAL PLUG 8X50', NULL, 'pcs', 'A2TR/25-26/3008', 200, 0.65, 'A2TR/25-26/3008', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 45'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'CONTROL UNIT KS 38 MM', NULL, 'pcs', 'A2TR/25-26/3009', 300, 126, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 46'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'END CAP ROUND BOTTOM RAIL', NULL, 'pcs', 'A2TR/25-26/3009', 600, 8, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 47'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'END CAP TRIANGULAR BOTTOM RAIL', NULL, 'pcs', 'A2TR/25-26/3009', 600, 8, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 48'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'Metal End Cap', NULL, 'pcs', 'A2TR/25-26/3009', 300, 57, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 49'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'CEILLING BRACKET''', NULL, 'pcs', 'A2TR/25-26/3009', 900, 30, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 50'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'CORD WEIGHT', NULL, 'pcs', 'A2TR/25-26/3009', 300, 23, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 51'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'ROYAL SCREW 8X50', NULL, 'pcs', 'A2TR/25-26/3009', 2000, 0.65, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 52'),
  ('Sheer Dimout Plain Cassette Parts', 'Parts', 'Sheer Dimout Plain Cassette', 'ROYAL PLUG 8X50', NULL, 'pcs', 'A2TR/25-26/3009', 2000, 0.65, 'A2TR/25-26/3009', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 53'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'CONTROL UNIT', NULL, 'pcs', 'A2TR/25-26/3010', 150, 140, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 54'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'END CAP ROUND BOTTOM RAIL', NULL, 'pcs', 'A2TR/25-26/3010', 300, 5, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 55'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'END CAP U TYPE BOTTOM RAIL', NULL, 'pcs', 'A2TR/25-26/3010', 300, 5, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 56'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'Metal End Cap', NULL, 'pcs', 'A2TR/25-26/3010', 150, 87, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 57'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'CEILLING BRACKET''', NULL, 'pcs', 'A2TR/25-26/3010', 450, 56, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 58'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'CORD WEIGHT', NULL, 'pcs', 'A2TR/25-26/3010', 150, 23, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 59'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'Chain Stopper', NULL, 'pcs', 'A2TR/25-26/3010', 150, 5, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 60'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'ROYAL SCREW 8X50', NULL, 'pcs', 'A2TR/25-26/3010', 1000, 0.65, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 61'),
  ('Sheer Dimout Decorative Cassette Parts', 'Parts', 'Sheer Dimout Decorative Cassette', 'ROYAL PLUG 8X50', NULL, 'pcs', 'A2TR/25-26/3010', 1000, 0.65, 'A2TR/25-26/3010', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 62'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'CONTROL UNIT', NULL, 'pcs', 'A2TR/25-26/3012', 60, 145, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 63'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'Drum Holder', NULL, 'pcs', 'A2TR/25-26/3012', 180, 29, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 64'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'INSTALLATION BRACKET', NULL, 'pcs', 'A2TR/25-26/3012', 180, 22, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 65'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'CORD WEIGHT', NULL, 'pcs', 'A2TR/25-26/3012', 60, 23, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 66'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'CAP 4MM', NULL, 'pcs', 'A2TR/25-26/3012', 600, 0.8, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 67'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'CAP 7MM', NULL, 'pcs', 'A2TR/25-26/3012', 120, 1, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 68'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'D RING-RH 09 MM', NULL, 'pcs', 'A2TR/25-26/3012', 540, 1, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 69'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'ENDLESS CHAIN 3 MTR', NULL, 'pcs', 'A2TR/25-26/3012', 60, 34, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 70'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'ROYAL PLUG 8X50', NULL, 'pcs', 'A2TR/25-26/3012', 360, 0.65, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 71'),
  ('Roman Blinds Parts', 'Parts', 'Roman Blinds', 'ROYAL SCREW 8X50', NULL, 'pcs', 'A2TR/25-26/3012', 360, 0.65, 'A2TR/25-26/3012', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 72'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'SUPER TRACK- RUNNER', NULL, 'pcs', 'A2TR/25-26/3014', 2250, 6.3, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 73'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'BRACKET WALL SUPER TRACK', NULL, 'pcs', 'A2TR/25-26/3014', 100, 71, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 74'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'BRACKET CEILING-SUPER TRACK''', NULL, 'pcs', 'A2TR/25-26/3014', 400, 22, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 75'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'END CAP SUPER TRACK', NULL, 'pcs', 'A2TR/25-26/3014', 100, 2, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 76'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'RUNNER FOR JUMBO TRACK', NULL, 'pcs', 'A2TR/25-26/3014', 2250, 5, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 77'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'BRACKET FOR JUMBO TRACK', NULL, 'pcs', 'A2TR/25-26/3014', 100, 63, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 78'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'CEILING BRACKET FOR JUMBO TRACK', NULL, 'pcs', 'A2TR/25-26/3014', 400, 21.4, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 79'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'END CAP FOR JUMBO TRACK', NULL, 'pcs', 'A2TR/25-26/3014', 100, 11.4, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 80'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'Runner for M Track', NULL, 'pcs', 'A2TR/25-26/3014', 2250, 1.4, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 81'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'Bracket Wall for M Track', NULL, 'pcs', 'A2TR/25-26/3014', 100, 10, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 82'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'Bracket Ceiling for M Track', NULL, 'pcs', 'A2TR/25-26/3014', 400, 10, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 83'),
  ('Curtain Tracks', 'Parts', 'Curtain Tracks', 'End Cap for M Track', NULL, 'pcs', 'A2TR/25-26/3014', 100, 5, 'A2TR/25-26/3014', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 84'),
  ('Motors', 'Parts', 'Motors', 'MOTOR PREMIUM (RTS)', NULL, 'pcs', 'A2TR/25-26/3015', 15, 4865, 'A2TR/25-26/3015', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 85'),
  ('Motors', 'Parts', 'Motors', 'MOTOR PREMIUM (RTS)', NULL, 'pcs', 'A2TR/25-26/3015', 10, 4293, 'A2TR/25-26/3015', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 86'),
  ('Motors', 'Parts', 'Motors', 'REMOTE SINGLE CHANNEL-PREMIUM', NULL, 'pcs', 'A2TR/25-26/3015', 5, 1125, 'A2TR/25-26/3015', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 87'),
  ('Motors', 'Parts', 'Motors', 'REMOTE 5 CHANNEL-PREMIUM', NULL, 'pcs', 'A2TR/25-26/3015', 3, 1980, 'A2TR/25-26/3015', '2026-01-01'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 88'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'CONTROL UNIT KS 38 MM', NULL, 'pcs', 'A2TR/25-26/3048', 120, 240, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 89'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'CORD WEIGHT', NULL, 'pcs', 'A2TR/25-26/3048', 120, 23, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 90'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'Connector - Bush Type''', NULL, 'pcs', 'A2TR/25-26/3048', 120, 2.5, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 91'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'Bottom Rail End Cap''', NULL, 'pcs', 'A2TR/25-26/3048', 240, 3, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 92'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'Chain Stopper', NULL, 'pcs', 'A2TR/25-26/3048', 120, 4, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 93'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'ROYAL SCREW 8X50', NULL, 'pcs', 'A2TR/25-26/3048', 800, 0.65, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 94'),
  ('Roller W/o Headrail Parts', 'Parts', 'Roller W/o Headrail', 'ROYAL PLUG 8X50', NULL, 'pcs', 'A2TR/25-26/3048', 800, 0.65, 'A2TR/25-26/3048', '2026-01-03'::date, 'Imported from Vista Inventory Inflow New.xlsx sheet Main Data for Pcs row 95')
) AS stock(category_name, sub_group, product_name, variant_name, width_m, unit, batch_code, quantity, rate, bill_no, purchase_date, note);

DROP FUNCTION public.import_inventory_inflow_stock_row(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, DATE, TEXT);

COMMIT;
