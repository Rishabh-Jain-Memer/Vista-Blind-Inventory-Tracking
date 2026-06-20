-- ============================================================
-- Migration 016: Repair Torrent fabric product link
-- The Torrent variant was created under a Bamberg product, which made
-- inventory/order grouping show the wrong parent name.
-- ============================================================

BEGIN;

WITH torrent_variants AS (
  SELECT
    v.id AS variant_id,
    v.name AS variant_name,
    lower(trim(v.name)) AS normalized_variant_name,
    p.category_id
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  WHERE v.name ILIKE '%torrent%'
    AND p.name NOT ILIKE '%torrent%'
),
upsert_products AS (
  INSERT INTO public.inv_products (category_id, name, normalized_name)
  SELECT DISTINCT
    category_id,
    variant_name,
    normalized_variant_name
  FROM torrent_variants
  ON CONFLICT (category_id, normalized_name) DO UPDATE
    SET name = EXCLUDED.name
  RETURNING id, category_id, normalized_name
)
UPDATE public.inv_variants v
SET product_id = p.id
FROM torrent_variants tv
JOIN upsert_products p
  ON p.category_id = tv.category_id
 AND p.normalized_name = tv.normalized_variant_name
WHERE v.id = tv.variant_id;

COMMIT;

SELECT
  v.name AS variant_name,
  p.name AS product_name
FROM public.inv_variants v
JOIN public.inv_products p ON p.id = v.product_id
WHERE v.name ILIKE '%torrent%';
