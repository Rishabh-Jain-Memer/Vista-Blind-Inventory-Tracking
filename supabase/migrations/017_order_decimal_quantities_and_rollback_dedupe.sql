-- Fix decimal order quantities and stop exact duplicate rollback history rows.
--
-- Run this after migration 016 in Supabase. Older live schemas may still have
-- integer order quantity columns, which rejects values such as 1.968 and leaves
-- partial order headers when the browser retries.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    EXECUTE '
      ALTER TABLE public.order_items
        ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric,
        ALTER COLUMN area_sqm TYPE NUMERIC USING area_sqm::numeric,
        ALTER COLUMN rate_applied TYPE NUMERIC USING rate_applied::numeric,
        ALTER COLUMN line_total TYPE NUMERIC USING line_total::numeric';
  END IF;

  IF to_regclass('public.order_components') IS NOT NULL THEN
    EXECUTE '
      ALTER TABLE public.order_components
        ALTER COLUMN planned_qty TYPE NUMERIC USING planned_qty::numeric,
        ALTER COLUMN actual_qty TYPE NUMERIC USING actual_qty::numeric';
  END IF;

  IF to_regclass('public.fg_stock') IS NOT NULL THEN
    EXECUTE '
      ALTER TABLE public.fg_stock
        ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric,
        ALTER COLUMN purchase_cost TYPE NUMERIC USING purchase_cost::numeric';
  END IF;
END $$;

WITH ranked AS (
  SELECT
    id,
    roll_id,
    quantity,
    row_number() OVER (
      PARTITION BY
        COALESCE(roll_id::text, ''),
        COALESCE(variant_id::text, ''),
        movement_type,
        quantity,
        COALESCE(unit, ''),
        COALESCE(rate, 0),
        COALESCE(reference, ''),
        COALESCE(note, ''),
        COALESCE(performed_by::text, '')
      ORDER BY created_at, id
    ) AS rn
  FROM public.inv_movements
  WHERE movement_type = 'inflow'
    AND note LIKE 'Order rollback:%'
),
duplicate_qty AS (
  SELECT roll_id, SUM(quantity) AS qty_to_remove
  FROM ranked
  WHERE rn > 1
    AND roll_id IS NOT NULL
  GROUP BY roll_id
)
UPDATE public.inv_rolls r
SET
  remaining_length = GREATEST(0, r.remaining_length - d.qty_to_remove),
  status = CASE
    WHEN GREATEST(0, r.remaining_length - d.qty_to_remove) <= CASE WHEN COALESCE(r.unit, 'm') = 'm' THEN 0.1 ELSE 0 END
      THEN 'depleted'
    ELSE 'in_stock'
  END
FROM duplicate_qty d
WHERE r.id = d.roll_id;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        COALESCE(roll_id::text, ''),
        COALESCE(variant_id::text, ''),
        movement_type,
        quantity,
        COALESCE(unit, ''),
        COALESCE(rate, 0),
        COALESCE(reference, ''),
        COALESCE(note, ''),
        COALESCE(performed_by::text, '')
      ORDER BY created_at, id
    ) AS rn
  FROM public.inv_movements
  WHERE movement_type = 'inflow'
    AND note LIKE 'Order rollback:%'
)
DELETE FROM public.inv_movements m
USING ranked r
WHERE m.id = r.id
  AND r.rn > 1;

UPDATE public.inv_rolls
SET
  remaining_length = original_length,
  status = CASE
    WHEN original_length <= CASE WHEN COALESCE(unit, 'm') = 'm' THEN 0.1 ELSE 0 END
      THEN 'depleted'
    ELSE 'in_stock'
  END
WHERE original_length > 0
  AND remaining_length > original_length;

COMMIT;
