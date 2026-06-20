-- ============================================================
-- Migration 015: Full RRP catalog from Vista Dealer RRP April 2026.xlsx
-- Adds flexible price_map data for all blind families.
-- DP remains app-computed as RRP / 2.
-- ============================================================

BEGIN;

ALTER TABLE public.rrp_entries ADD COLUMN IF NOT EXISTS price_map JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.rrp_entries DROP CONSTRAINT IF EXISTS rrp_entries_blind_type_fabric_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS rrp_entries_blind_type_group_fabric_key ON public.rrp_entries (blind_type, fabric_group, fabric_name);

-- Refresh catalog entries from the workbook without dropping existing table policies.
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Screen', 'CLASSIC SCREEN 8%', '2.5', 'SQM', '{"Roller Blinds Without Headrail":2510,"Roller Blinds With Headrail":2800,"Roller Blinds With Plain Cassette":3600,"Roller Blinds With Decorative Cassette":3720}'::jsonb, 2510, 2800, 3600, 3720, 0, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Screen', 'CLASSIC SCREEN 5%', '3', 'SQM', '{"Roller Blinds Without Headrail":2540,"Roller Blinds With Headrail":2830,"Roller Blinds With Plain Cassette":3620,"Roller Blinds With Decorative Cassette":3750}'::jsonb, 2540, 2830, 3620, 3750, 1, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Screen', 'CLASSIC SCREEN 3%', '3', 'SQM', '{"Roller Blinds Without Headrail":2780,"Roller Blinds With Headrail":3070,"Roller Blinds With Plain Cassette":3860,"Roller Blinds With Decorative Cassette":3990}'::jsonb, 2780, 3070, 3860, 3990, 2, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Screen', 'CLASSIC SCREEN 1%', '2.5', 'SQM', '{"Roller Blinds Without Headrail":3090,"Roller Blinds With Headrail":3390,"Roller Blinds With Plain Cassette":4180,"Roller Blinds With Decorative Cassette":4300}'::jsonb, 3090, 3390, 4180, 4300, 3, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Translucent', 'VICTORIAN', '230', 'SQM', '{"Roller Blinds Without Headrail":1850,"Roller Blinds With Headrail":2140,"Roller Blinds With Plain Cassette":2940,"Roller Blinds With Decorative Cassette":3050}'::jsonb, 1850, 2140, 2940, 3050, 4, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Translucent', 'SERENE (TRANSLUCENT)', '230', 'SQM', '{"Roller Blinds Without Headrail":2110,"Roller Blinds With Headrail":2400,"Roller Blinds With Plain Cassette":3200,"Roller Blinds With Decorative Cassette":3320}'::jsonb, 2110, 2400, 3200, 3320, 5, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Translucent', 'SPECTRUM', '180/230', 'SQM', '{"Roller Blinds Without Headrail":2150,"Roller Blinds With Headrail":2440,"Roller Blinds With Plain Cassette":3240,"Roller Blinds With Decorative Cassette":3600}'::jsonb, 2150, 2440, 3240, 3600, 6, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Translucent', 'SOLETO N Blackout', '180/230', 'SQM', '{"Roller Blinds Without Headrail":2600,"Roller Blinds With Headrail":2880,"Roller Blinds With Plain Cassette":3680,"Roller Blinds With Decorative Cassette":3810}'::jsonb, 2600, 2880, 3680, 3810, 7, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'DS OPEQUE - NEW', '250', 'SQM', '{"Roller Blinds Without Headrail":2900,"Roller Blinds With Headrail":3190,"Roller Blinds With Plain Cassette":3990,"Roller Blinds With Decorative Cassette":4100}'::jsonb, 2900, 3190, 3990, 4100, 8, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'SERENO Blackout', '230', 'SQM', '{"Roller Blinds Without Headrail":2370,"Roller Blinds With Headrail":2660,"Roller Blinds With Plain Cassette":3450,"Roller Blinds With Decorative Cassette":3580}'::jsonb, 2370, 2660, 3450, 3580, 9, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'SOLETO Blackout (VENICE, MURANO)', '230', 'SQM', '{"Roller Blinds Without Headrail":2820,"Roller Blinds With Headrail":3100,"Roller Blinds With Plain Cassette":3900,"Roller Blinds With Decorative Cassette":4020}'::jsonb, 2820, 3100, 3900, 4020, 10, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'WONDER DESIGN - PRINTED Blackout', '230', 'SQM', '{"Roller Blinds Without Headrail":3240,"Roller Blinds With Headrail":3520,"Roller Blinds With Plain Cassette":4330,"Roller Blinds With Decorative Cassette":4450}'::jsonb, 3240, 3520, 4330, 4450, 11, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'HARRIS - PRINTED Blackout', '230/300', 'SQM', '{"Roller Blinds Without Headrail":3260,"Roller Blinds With Headrail":3560,"Roller Blinds With Plain Cassette":4350,"Roller Blinds With Decorative Cassette":4470}'::jsonb, 3260, 3560, 4350, 4470, 12, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'MIDNIGHT BLOOM - PRINTED Blackout', '230/300', 'SQM', '{"Roller Blinds Without Headrail":3500,"Roller Blinds With Headrail":3800,"Roller Blinds With Plain Cassette":4590,"Roller Blinds With Decorative Cassette":4710}'::jsonb, 3500, 3800, 4590, 4710, 13, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'PRISM - PRINTED Blackout', '230/300', 'SQM', '{"Roller Blinds Without Headrail":3750,"Roller Blinds With Headrail":4040,"Roller Blinds With Plain Cassette":4830,"Roller Blinds With Decorative Cassette":4960}'::jsonb, 3750, 4040, 4830, 4960, 14, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'CUSTOMISED - PRINTED Blackout', '230/300', 'SQM', '{"Roller Blinds Without Headrail":4350,"Roller Blinds With Headrail":4640,"Roller Blinds With Plain Cassette":5440,"Roller Blinds With Decorative Cassette":5560}'::jsonb, 4350, 4640, 5440, 5560, 15, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'CLOUDNINE (BLACKOUT)', '280', 'SQM', '{"Roller Blinds Without Headrail":2840,"Roller Blinds With Headrail":3120,"Roller Blinds With Plain Cassette":3920,"Roller Blinds With Decorative Cassette":4050}'::jsonb, 2840, 3120, 3920, 4050, 16, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'MELLOW (SCREEN)', '280', 'SQM', '{"Roller Blinds Without Headrail":3020,"Roller Blinds With Headrail":3310,"Roller Blinds With Plain Cassette":4100,"Roller Blinds With Decorative Cassette":4230}'::jsonb, 3020, 3310, 4100, 4230, 17, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'PANAMA (TRANSLUCENT)', '280', 'SQM', '{"Roller Blinds Without Headrail":2540,"Roller Blinds With Headrail":2830,"Roller Blinds With Plain Cassette":3620,"Roller Blinds With Decorative Cassette":3750}'::jsonb, 2540, 2830, 3620, 3750, 18, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'SURGE (TRANSLUCENT)', '280', 'SQM', '{"Roller Blinds Without Headrail":2600,"Roller Blinds With Headrail":2880,"Roller Blinds With Plain Cassette":3680,"Roller Blinds With Decorative Cassette":3810}'::jsonb, 2600, 2880, 3680, 3810, 19, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'TORRENT (TRANSLUCENT)', '280', 'SQM', '{"Roller Blinds Without Headrail":2600,"Roller Blinds With Headrail":2880,"Roller Blinds With Plain Cassette":3680,"Roller Blinds With Decorative Cassette":3810}'::jsonb, 2600, 2880, 3680, 3810, 20, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'SRS - (SCREEN ALUMINIUM BACKING)', '300', 'SQM', '{"Roller Blinds Without Headrail":3810,"Roller Blinds With Headrail":4090,"Roller Blinds With Plain Cassette":4890,"Roller Blinds With Decorative Cassette":5020}'::jsonb, 3810, 4090, 4890, 5020, 21, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'SCREEN BLACKOUT BLISS', '250', 'SQM', '{"Roller Blinds Without Headrail":3680,"Roller Blinds With Headrail":3980,"Roller Blinds With Plain Cassette":4780,"Roller Blinds With Decorative Cassette":4890}'::jsonb, 3680, 3980, 4780, 4890, 22, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'CELESTIAL (TRANSLUCENT)', '250', 'SQM', '{"Roller Blinds Without Headrail":4100,"Roller Blinds With Headrail":4400,"Roller Blinds With Plain Cassette":5200,"Roller Blinds With Decorative Cassette":5310}'::jsonb, 4100, 4400, 5200, 5310, 23, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roller Blinds', 'Blackout', 'VIOLET, SKYLER, ORIBI, ELENA, BAMBERG', '230', 'SQM', '{"Roller Blinds Without Headrail":2820,"Roller Blinds With Headrail":3100,"Roller Blinds With Plain Cassette":3900,"Roller Blinds With Decorative Cassette":4020}'::jsonb, 2820, 3100, 3900, 4020, 24, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'ALCHEMY', '280', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":2780,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":3020,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":3860,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":4100}'::jsonb, NULL, NULL, NULL, NULL, 25, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'ESSENCE', '280', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":3260,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":3500,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":4350,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":4590}'::jsonb, NULL, NULL, NULL, NULL, 26, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'COSMOS', '280', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":3390,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":3620,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":4470,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":4710}'::jsonb, NULL, NULL, NULL, NULL, 27, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'OASIS', '280', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":3500,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":3750,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":4590,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":4830}'::jsonb, NULL, NULL, NULL, NULL, 28, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'DUNE', '320', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":3750,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":3990,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":4830,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":5070}'::jsonb, NULL, NULL, NULL, NULL, 29, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'CALM WAVES', '280', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":3750,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":3990,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":4830,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":5070}'::jsonb, NULL, NULL, NULL, NULL, 30, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'PYLA', '280', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":4230,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":4470,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":5310,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":5560}'::jsonb, NULL, NULL, NULL, NULL, 31, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'TRINITY', '280', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":4710,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":4960,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":5800,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":6040}'::jsonb, NULL, NULL, NULL, NULL, 32, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'DENVER Blackout', '310', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":3750,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":3990,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":4830,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":5070}'::jsonb, NULL, NULL, NULL, NULL, 33, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'NEW THAR Blackout', '310', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":3750,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":3990,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":4830,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":5070}'::jsonb, NULL, NULL, NULL, NULL, 34, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'MEMPHIS Blackout', '310', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":4230,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":4470,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":5310,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":5560}'::jsonb, NULL, NULL, NULL, NULL, 35, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'LAGOS Blackout', '320', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":4230,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":4470,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":5310,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":5560}'::jsonb, NULL, NULL, NULL, NULL, 36, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'NOBLE Blackout', '280', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":4230,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":4470,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":5310,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":5560}'::jsonb, NULL, NULL, NULL, NULL, 37, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'SAHARA Blackout', '280', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":4710,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":4960,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":5800,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":6040}'::jsonb, NULL, NULL, NULL, NULL, 38, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'ALLURE Blackout', '280', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":5920,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":6170,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":7010,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":7250}'::jsonb, NULL, NULL, NULL, NULL, 39, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'AURAVEIL Blackout', '320', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":4960,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":5200,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":6040,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":6280}'::jsonb, NULL, NULL, NULL, NULL, 40, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'PURE SHADE Blackout', '320', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":5200,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":5440,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":6280,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":6520}'::jsonb, NULL, NULL, NULL, NULL, 41, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'SOFT SILK Blackout', '320', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":5200,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":5440,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":6280,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":6520}'::jsonb, NULL, NULL, NULL, NULL, 42, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'ECO LUXE Blackout', '320', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":5680,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":5930,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":6770,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":7010}'::jsonb, NULL, NULL, NULL, NULL, 43, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'DAWN LIGHT Blackout', '320', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":6160,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":6410,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":7250,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":7490}'::jsonb, NULL, NULL, NULL, NULL, 44, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'MIST GLOW Blackout', '320', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":6160,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":6410,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":7250,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":7490}'::jsonb, NULL, NULL, NULL, NULL, 45, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'SILK SHADE Blackout', '320', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":6410,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":6650,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":7490,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":7730}'::jsonb, NULL, NULL, NULL, NULL, 46, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Sheer Dimout Blinds', 'Sheer Dimout', 'SOFT GLOW Blackout', '320', 'SQM', '{"Sheer Dimout Blinds Classic Mechanism with Plain Cassette":6410,"Sheer Dimout Blinds Classic Mechanism with Decorative Cassette":6650,"Sheer Dimout Blinds Premium Mechanism with Plain Cassette":7490,"Sheer Dimout Blinds Premium Mechanism with Decorative Cassette":7730}'::jsonb, NULL, NULL, NULL, NULL, 47, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('S Contour Blinds', 'S-Contour', 'OPERA Blackout', '3', 'SQM', '{"S-Contour Blinds":7730}'::jsonb, NULL, NULL, NULL, NULL, 48, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('S Contour Blinds', 'S-Contour', 'CromaLuxe Blackout', '3', 'SQM', '{"S-Contour Blinds":8700}'::jsonb, NULL, NULL, NULL, NULL, 49, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('S Contour Blinds', 'S-Contour', 'Shadow Luxe Blackout', '3', 'SQM', '{"S-Contour Blinds":9060}'::jsonb, NULL, NULL, NULL, NULL, 50, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('S Contour Blinds', 'S-Contour', 'TriLuxe Blackout', '3', 'SQM', '{"S-Contour Blinds":9430}'::jsonb, NULL, NULL, NULL, NULL, 51, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('S Contour Blinds', 'S-Contour', 'DiamondLuxe Blackout', '3', 'SQM', '{"S-Contour Blinds":9670}'::jsonb, NULL, NULL, NULL, NULL, 52, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('S Contour Blinds', 'S-Contour', 'DashLuxe Blackout', '3', 'SQM', '{"S-Contour Blinds":9910}'::jsonb, NULL, NULL, NULL, NULL, 53, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('S Contour Blinds', 'S-Contour', 'Customised Printed - OPERA Blackout', '3', 'SQM', '{"S-Contour Blinds":10640}'::jsonb, NULL, NULL, NULL, NULL, 54, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('S Contour Blinds', 'S-Contour', 'OPERA Non Blackout', '3', 'SQM', '{"S-Contour Blinds":6280}'::jsonb, NULL, NULL, NULL, NULL, 55, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('S Contour Blinds', 'S-Contour', 'Customised Printed OPERA Non Blackout', '3', 'SQM', '{"S-Contour Blinds":8700}'::jsonb, NULL, NULL, NULL, NULL, 56, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'STERLING (ST 682, 683, 687)', NULL, 'SQM', '{"Vertical Blinds":1870}'::jsonb, NULL, NULL, NULL, NULL, 57, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'STYLO (SY 6706)', NULL, 'SQM', '{"Vertical Blinds":1870}'::jsonb, NULL, NULL, NULL, NULL, 58, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'VICTORIAN (VIC 01-34)', NULL, 'SQM', '{"Vertical Blinds":1870}'::jsonb, NULL, NULL, NULL, NULL, 59, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'SABINE (S 01-05)', NULL, 'SQM', '{"Vertical Blinds":2050}'::jsonb, NULL, NULL, NULL, NULL, 60, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'SPECTRUM (S 01 - 15)', NULL, 'SQM', '{"Vertical Blinds":2050}'::jsonb, NULL, NULL, NULL, NULL, 61, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'CASCADE (012 - 017)', NULL, 'SQM', '{"Vertical Blinds":2110}'::jsonb, NULL, NULL, NULL, NULL, 62, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'GALLERY (G 313 - 314)', NULL, 'SQM', '{"Vertical Blinds":2110}'::jsonb, NULL, NULL, NULL, NULL, 63, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'MARBLE (G 602)', NULL, 'SQM', '{"Vertical Blinds":2110}'::jsonb, NULL, NULL, NULL, NULL, 64, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'QUEBEC (Q 1003 - 1006)', NULL, 'SQM', '{"Vertical Blinds":2110}'::jsonb, NULL, NULL, NULL, NULL, 65, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'SILHOUETTE (S 112)', NULL, 'SQM', '{"Vertical Blinds":2110}'::jsonb, NULL, NULL, NULL, NULL, 66, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'VERGINIA (V 803 - 806)', NULL, 'SQM', '{"Vertical Blinds":2110}'::jsonb, NULL, NULL, NULL, NULL, 67, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'SERENE OPEQUE BO', NULL, 'SQM', '{"Vertical Blinds":2170}'::jsonb, NULL, NULL, NULL, NULL, 68, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Vertical Blinds', '100 MM Vertical', 'DS OPEQUE BO', NULL, 'SQM', '{"Vertical Blinds":2420}'::jsonb, NULL, NULL, NULL, NULL, 69, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitched Mechanism', 'SOLETO Blackout', '225', 'SQM', '{"Roman Blinds":3390,"Roman Blinds With Chain Mechanism":3390,"Roman Blinds With Decorative Cassette":4350}'::jsonb, NULL, NULL, NULL, NULL, 70, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitched Mechanism', 'WONDER DESIGN PRINTED Blackout', '225', 'SQM', '{"Roman Blinds":3730,"Roman Blinds With Chain Mechanism":3730,"Roman Blinds With Decorative Cassette":4710}'::jsonb, NULL, NULL, NULL, NULL, 71, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitched Mechanism', 'ORIBI', '225', 'SQM', '{"Roman Blinds":3390,"Roman Blinds With Chain Mechanism":3390,"Roman Blinds With Decorative Cassette":4350}'::jsonb, NULL, NULL, NULL, NULL, 72, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitched Mechanism', 'ELENA', '225', 'SQM', '{"Roman Blinds":3390,"Roman Blinds With Chain Mechanism":3390,"Roman Blinds With Decorative Cassette":4350}'::jsonb, NULL, NULL, NULL, NULL, 73, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitched Mechanism', 'BAMBERG', '225', 'SQM', '{"Roman Blinds":3390,"Roman Blinds With Chain Mechanism":3390,"Roman Blinds With Decorative Cassette":4350}'::jsonb, NULL, NULL, NULL, NULL, 74, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitched Mechanism', 'CUSTOMIZED PRINT Blackout', '225', 'SQM', '{"Roman Blinds":5440,"Roman Blinds With Chain Mechanism":5440,"Roman Blinds With Decorative Cassette":6410}'::jsonb, NULL, NULL, NULL, NULL, 75, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitchless', 'VIOLET', '225', 'SQM', '{"Roman Blinds":4350,"Roman Blinds With Chain Mechanism":4350,"Roman Blinds With Decorative Cassette":5200}'::jsonb, NULL, NULL, NULL, NULL, 76, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitchless', 'SKYLER', '225', 'SQM', '{"Roman Blinds":4350,"Roman Blinds With Chain Mechanism":4350,"Roman Blinds With Decorative Cassette":5200}'::jsonb, NULL, NULL, NULL, NULL, 77, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitchless', 'ORIBI', '225', 'SQM', '{"Roman Blinds":4350,"Roman Blinds With Chain Mechanism":4350,"Roman Blinds With Decorative Cassette":5200}'::jsonb, NULL, NULL, NULL, NULL, 78, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitchless', 'ELENA', '225', 'SQM', '{"Roman Blinds":4350,"Roman Blinds With Chain Mechanism":4350,"Roman Blinds With Decorative Cassette":5200}'::jsonb, NULL, NULL, NULL, NULL, 79, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitchless', 'BAMBERG', '225', 'SQM', '{"Roman Blinds":4350,"Roman Blinds With Chain Mechanism":4350,"Roman Blinds With Decorative Cassette":5200}'::jsonb, NULL, NULL, NULL, NULL, 80, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Roman Blinds', 'Stitchless', 'CUSTOMIZED PRINT Blackout', '225', 'SQM', '{"Roman Blinds":6410,"Roman Blinds With Chain Mechanism":6410,"Roman Blinds With Decorative Cassette":7250}'::jsonb, NULL, NULL, NULL, NULL, 81, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Wooden Venetian Blinds', 'Wooden Venetian', 'TECHWOOD 50MM (TW 01 - 20)', NULL, 'SQM', '{"Wooden Venetian Blinds":13040}'::jsonb, NULL, NULL, NULL, NULL, 82, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Aluminium Venetian Blinds', 'Aluminium Venetian', '25MM CLASSIC', NULL, 'SQM', '{"Aluminium Venetian Blinds":2280}'::jsonb, NULL, NULL, NULL, NULL, 83, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Cellular Blinds', 'Classic Blinds', 'Translucent', '3', 'Sq FT', '{"Cellular Blinds":4900}'::jsonb, NULL, NULL, NULL, NULL, 84, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Cellular Blinds', 'Classic Blinds', 'Blackout', '3', 'Sq FT', '{"Cellular Blinds":5620}'::jsonb, NULL, NULL, NULL, NULL, 85, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Cellular Blinds', 'Classic Blinds', 'Sheer Fabric', '3', 'Sq FT', '{"Cellular Blinds":8770}'::jsonb, NULL, NULL, NULL, NULL, 86, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Cellular Blinds', 'Top Down Bottom Up', 'Translucent', '3', 'Sq FT', '{"Cellular Blinds":5680}'::jsonb, NULL, NULL, NULL, NULL, 87, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Cellular Blinds', 'Top Down Bottom Up', 'Blackout', '3', 'Sq FT', '{"Cellular Blinds":6520}'::jsonb, NULL, NULL, NULL, NULL, 88, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Cellular Blinds', 'Top Down Bottom Up', 'Sheer Fabric', '3', 'Sq FT', '{"Cellular Blinds":9670}'::jsonb, NULL, NULL, NULL, NULL, 89, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Cellular Blinds', 'Day Night', 'Translucent + Sheer', '3', 'Sq FT', '{"Cellular Blinds":11110}'::jsonb, NULL, NULL, NULL, NULL, 90, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
INSERT INTO public.rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, price_map, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order, updated_at) VALUES
  ('Cellular Blinds', 'Day Night', 'Blackout + Sheer', '3', 'Sq FT', '{"Cellular Blinds":12810}'::jsonb, NULL, NULL, NULL, NULL, 91, now())
ON CONFLICT (blind_type, fabric_group, fabric_name) DO UPDATE SET
  width_max = EXCLUDED.width_max,
  uom = EXCLUDED.uom,
  price_map = EXCLUDED.price_map,
  rrp_wo_headrail = EXCLUDED.rrp_wo_headrail,
  rrp_w_headrail = EXCLUDED.rrp_w_headrail,
  rrp_w_plain_cassette = EXCLUDED.rrp_w_plain_cassette,
  rrp_w_dec_cassette = EXCLUDED.rrp_w_dec_cassette,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

COMMIT;

SELECT blind_type, fabric_group, COUNT(*) FROM public.rrp_entries GROUP BY 1, 2 ORDER BY 1, 2;
