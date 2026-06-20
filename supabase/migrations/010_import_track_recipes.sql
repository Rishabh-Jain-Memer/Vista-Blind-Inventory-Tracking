-- ============================================================
-- Track recipe import from Tracks.xlsx
-- Creates the 3 admin-editable track recipes and links them to
-- Curtain Tracks inventory variants.
-- ============================================================

BEGIN;

UPDATE public.product_recipes
SET
  name = 'Super Track',
  description = 'Imported from Tracks.xlsx',
  is_active = true,
  notes = 'Curtain Tracks / Super Track'
WHERE blind_type = 'Super Track';

INSERT INTO public.product_recipes (name, blind_type, description, is_active, notes)
SELECT 'Super Track', 'Super Track', 'Imported from Tracks.xlsx', true, 'Curtain Tracks / Super Track'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_recipes WHERE blind_type = 'Super Track'
);

DELETE FROM public.recipe_items
WHERE recipe_id IN (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Super Track'
);

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Super Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'section non-ferrous super track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, true, 1 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Super Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'super track- runner'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 2 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Super Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'bracket wall super track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 3 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Super Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name IN ('bracket ceiling-super track', 'bracket ceiling-super track''')
  ORDER BY v.name
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 4 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Super Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'end cap super track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 5 FROM r JOIN v ON true;

UPDATE public.product_recipes
SET
  name = 'Jumbo Track',
  description = 'Imported from Tracks.xlsx',
  is_active = true,
  notes = 'Curtain Tracks / Jumbo Track'
WHERE blind_type = 'Jumbo Track';

INSERT INTO public.product_recipes (name, blind_type, description, is_active, notes)
SELECT 'Jumbo Track', 'Jumbo Track', 'Imported from Tracks.xlsx', true, 'Curtain Tracks / Jumbo Track'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_recipes WHERE blind_type = 'Jumbo Track'
);

DELETE FROM public.recipe_items
WHERE recipe_id IN (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Jumbo Track'
);

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Jumbo Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'al section non-ferrous jumbo track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, true, 1 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Jumbo Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'runner for jumbo track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 2 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Jumbo Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'bracket for jumbo track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 3 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Jumbo Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'ceiling bracket for jumbo track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 4 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'Jumbo Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'end cap for jumbo track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 5 FROM r JOIN v ON true;

UPDATE public.product_recipes
SET
  name = 'M Track',
  description = 'Imported from Tracks.xlsx',
  is_active = true,
  notes = 'Curtain Tracks / M Track'
WHERE blind_type = 'M Track';

INSERT INTO public.product_recipes (name, blind_type, description, is_active, notes)
SELECT 'M Track', 'M Track', 'Imported from Tracks.xlsx', true, 'Curtain Tracks / M Track'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_recipes WHERE blind_type = 'M Track'
);

DELETE FROM public.recipe_items
WHERE recipe_id IN (
  SELECT id FROM public.product_recipes WHERE blind_type = 'M Track'
);

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'M Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'alu section non-ferrous m track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, true, 1 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'M Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'runner for m track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 2 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'M Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'bracket wall for m track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 3 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'M Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'bracket ceiling for m track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 4 FROM r JOIN v ON true;

WITH r AS (
  SELECT id FROM public.product_recipes WHERE blind_type = 'M Track' LIMIT 1
), v AS (
  SELECT v.id, v.name
  FROM public.inv_variants v
  JOIN public.inv_products p ON p.id = v.product_id
  JOIN public.inv_categories c ON c.id = p.category_id
  WHERE c.normalized_name = 'curtain tracks' AND v.normalized_name = 'end cap for m track'
  LIMIT 1
)
INSERT INTO public.recipe_items (recipe_id, variant_id, component_name, quantity_per_unit, is_width_dependent, sort_order)
SELECT r.id, v.id, v.name, 1, false, 5 FROM r JOIN v ON true;

COMMIT;

SELECT
  (SELECT COUNT(*) FROM public.product_recipes WHERE blind_type IN ('Super Track', 'Jumbo Track', 'M Track')) AS track_recipes,
  (SELECT COUNT(*) FROM public.recipe_items WHERE recipe_id IN (SELECT id FROM public.product_recipes WHERE blind_type IN ('Super Track', 'Jumbo Track', 'M Track'))) AS track_recipe_items;
