-- ============================================================
-- Migration 011: RRP Catalog (Roller Blinds)
-- Run after 010. Adds rrp_entries table + Roller Blind price data.
-- DP (Dealer Price) is always RRP / 2 and computed in the app.
-- ============================================================

DROP TABLE IF EXISTS rrp_entries;

CREATE TABLE rrp_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blind_type           TEXT NOT NULL,
  fabric_group         TEXT NOT NULL,
  fabric_name          TEXT NOT NULL,
  width_max            TEXT,
  uom                  TEXT NOT NULL DEFAULT 'SQM',
  rrp_wo_headrail      NUMERIC,
  rrp_w_headrail       NUMERIC,
  rrp_w_plain_cassette NUMERIC,
  rrp_w_dec_cassette   NUMERIC,
  sort_order           INT NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE (blind_type, fabric_name)
);

-- RLS: anyone authenticated can read; only admin can write
ALTER TABLE rrp_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rrp_read" ON rrp_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rrp_write" ON rrp_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Roller Blind fabrics from Vista Dealer RRP April 2026.xlsx
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Screen', 'CLASSIC SCREEN 8%', '2.5', 'SQM', 2510, 2800, 3600, 3720, 0);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Screen', 'CLASSIC SCREEN 5%', '3', 'SQM', 2540, 2830, 3620, 3750, 1);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Screen', 'CLASSIC SCREEN 3%', '3', 'SQM', 2780, 3070, 3860, 3990, 2);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Screen', 'CLASSIC SCREEN 1%', '2.5', 'SQM', 3090, 3390, 4180, 4300, 3);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Translucent', 'VICTORIAN', '230', 'SQM', 1850, 2140, 2940, 3050, 4);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Translucent', 'SERENE (TRANSLUCENT)', '230', 'SQM', 2110, 2400, 3200, 3320, 5);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Translucent', 'SPECTRUM', '180/230', 'SQM', 2150, 2440, 3240, 3600, 6);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Translucent', 'SOLETO N B/O', '180/230', 'SQM', 2600, 2880, 3680, 3810, 7);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'DS OPEQUE - NEW', '250', 'SQM', 2900, 3190, 3990, 4100, 8);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'SERENO B/O', '230', 'SQM', 2370, 2660, 3450, 3580, 9);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'SOLETO B/O (VENICE, MURANO)', '230', 'SQM', 2820, 3100, 3900, 4020, 10);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'WONDER DESIGN - PRINTED B/O', '230', 'SQM', 3240, 3520, 4330, 4450, 11);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'HARRIS - PRINTED B/O', '230/300', 'SQM', 3260, 3560, 4350, 4470, 12);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'MIDNIGHT BLOOM - PRINTED B/O', '230/300', 'SQM', 3500, 3800, 4590, 4710, 13);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'PRISM - PRINTED B/O', '230/300', 'SQM', 3750, 4040, 4830, 4960, 14);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'CUSTOMISED - PRINTED B/O', '230/300', 'SQM', 4350, 4640, 5440, 5560, 15);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'CLOUDNINE (BLACKOUT)', '280', 'SQM', 2840, 3120, 3920, 4050, 16);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'MELLOW (SCREEN)', '280', 'SQM', 3020, 3310, 4100, 4230, 17);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'PANAMA (TRANSLUCENT)', '280', 'SQM', 2540, 2830, 3620, 3750, 18);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'SURGE (TRANSLUCENT)', '280', 'SQM', 2600, 2880, 3680, 3810, 19);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'TORRENT (TRANSLUCENT)', '280', 'SQM', 2600, 2880, 3680, 3810, 20);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'SRS - (SCREEN ALUMINIUM BACKING)', '300', 'SQM', 3810, 4090, 4890, 5020, 21);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'SCREEN BLACKOUT BLISS', '250', 'SQM', 3680, 3980, 4780, 4890, 22);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'CELESTIAL (TRANSLUCENT)', '250', 'SQM', 4100, 4400, 5200, 5310, 23);
INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ('Roller Blinds', 'Blackout', 'VIOLET, SKYLER, ORIBI, ELENA, BAMBERG', '230', 'SQM', 2820, 3100, 3900, 4020, 24);

SELECT blind_type, fabric_group, COUNT(*) FROM rrp_entries GROUP BY 1, 2 ORDER BY 1, 2;