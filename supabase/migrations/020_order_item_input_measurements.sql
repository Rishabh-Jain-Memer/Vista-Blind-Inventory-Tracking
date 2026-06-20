-- Preserve original input measurements for future order displays.
-- Existing orders still render from canonical width_cm/height_cm/area_sqm values.

BEGIN;

ALTER TABLE IF EXISTS public.order_items
  ADD COLUMN IF NOT EXISTS input_width_raw NUMERIC,
  ADD COLUMN IF NOT EXISTS input_width_unit TEXT,
  ADD COLUMN IF NOT EXISTS input_height_raw NUMERIC,
  ADD COLUMN IF NOT EXISTS input_height_unit TEXT,
  ADD COLUMN IF NOT EXISTS input_length_raw NUMERIC,
  ADD COLUMN IF NOT EXISTS input_length_unit TEXT,
  ADD COLUMN IF NOT EXISTS input_length_ft NUMERIC,
  ADD COLUMN IF NOT EXISTS chargeable_length_ft NUMERIC;

COMMIT;

NOTIFY pgrst, 'reload schema';
