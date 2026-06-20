"""
Generate migration 011_rrp_catalog.sql
Reads the Roller sheet of Vista Dealer RRP April 2026.xlsx and produces:
  - CREATE TABLE rrp_entries
  - INSERT rows for all Roller Blind fabrics
Only Roller Blinds are imported now; other sheets are reserved for later.
"""
import openpyxl, os

def sql_str(s):
    return "'" + str(s or '').replace("'", "''") + "'"

def sql_num(n):
    if n is None: return 'NULL'
    try: return str(int(n)) if float(n) == int(float(n)) else str(float(n))
    except: return 'NULL'

wb = openpyxl.load_workbook('Excel File/Vista Dealer RRP April 2026.xlsx', data_only=True)
ws = wb['Roller']

rows_out = []
current_group = 'Screen'
sort_i = 0

GROUP_KEYWORDS = {
    'screen': 'Screen',
    'translucent': 'Translucent',
    'blackout': 'Blackout',
}

for row in ws.iter_rows(values_only=True):
    fabric_name = str(row[0] or '').strip()
    if not fabric_name:
        continue
    # Detect group header rows (col 3 or 4 will be 'RRP' text)
    if str(row[3] or '').strip().upper() == 'RRP':
        # This is a group header row
        low = fabric_name.lower()
        for kw, grp in GROUP_KEYWORDS.items():
            if kw in low:
                current_group = grp
                break
        continue
    # Skip column-header rows
    if fabric_name.lower() in ('shades', 'roller screen fabrics', 'roller translucent fabrics', 'roller blackout fabrics'):
        continue

    # Try to parse numeric prices
    wo  = row[3]  # RRP Without Headrail
    wh  = row[4]  # RRP With Headrail
    pc  = row[5]  # RRP With Plain Cassette
    dc  = row[6]  # RRP With Decorative Cassette

    try: wo = float(wo)
    except: wo = None
    try: wh = float(wh)
    except: wh = None
    try: pc = float(pc)
    except: pc = None
    try: dc = float(dc)
    except: dc = None

    if wo is None and wh is None and pc is None and dc is None:
        continue  # skip non-data rows

    width_raw = str(row[1] or '').strip()

    rows_out.append({
        'group': current_group,
        'name': fabric_name,
        'width': width_raw,
        'wo': wo, 'wh': wh, 'pc': pc, 'dc': dc,
        'sort': sort_i,
    })
    sort_i += 1

print(f'Parsed {len(rows_out)} fabric rows')
for r in rows_out:
    print(f"  [{r['group']:12s}] {r['name']:45s}  WO={r['wo']}  WH={r['wh']}  PC={r['pc']}  DC={r['dc']}")

lines = []
lines.append('-- ============================================================')
lines.append('-- Migration 011: RRP Catalog (Roller Blinds)')
lines.append('-- Run after 010. Adds rrp_entries table + Roller Blind price data.')
lines.append('-- DP (Dealer Price) is always RRP / 2 and computed in the app.')
lines.append('-- ============================================================')
lines.append('')
lines.append('DROP TABLE IF EXISTS rrp_entries;')
lines.append('')
lines.append('CREATE TABLE rrp_entries (')
lines.append('  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),')
lines.append('  blind_type           TEXT NOT NULL,')
lines.append('  fabric_group         TEXT NOT NULL,')
lines.append('  fabric_name          TEXT NOT NULL,')
lines.append('  width_max            TEXT,')
lines.append('  uom                  TEXT NOT NULL DEFAULT \'SQM\',')
lines.append('  rrp_wo_headrail      NUMERIC,')
lines.append('  rrp_w_headrail       NUMERIC,')
lines.append('  rrp_w_plain_cassette NUMERIC,')
lines.append('  rrp_w_dec_cassette   NUMERIC,')
lines.append('  sort_order           INT NOT NULL DEFAULT 0,')
lines.append('  updated_at           TIMESTAMPTZ DEFAULT now(),')
lines.append('  UNIQUE (blind_type, fabric_name)')
lines.append(');')
lines.append('')
lines.append('-- RLS: anyone authenticated can read; only admin can write')
lines.append('ALTER TABLE rrp_entries ENABLE ROW LEVEL SECURITY;')
lines.append('CREATE POLICY "rrp_read" ON rrp_entries FOR SELECT USING (auth.role() = \'authenticated\');')
lines.append('CREATE POLICY "rrp_write" ON rrp_entries FOR ALL USING (')
lines.append("  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')")
lines.append(');')
lines.append('')
lines.append('-- Roller Blind fabrics from Vista Dealer RRP April 2026.xlsx')

for r in rows_out:
    lines.append(
        f"INSERT INTO rrp_entries (blind_type, fabric_group, fabric_name, width_max, uom, "
        f"rrp_wo_headrail, rrp_w_headrail, rrp_w_plain_cassette, rrp_w_dec_cassette, sort_order) VALUES ("
        f"'Roller Blinds', {sql_str(r['group'])}, {sql_str(r['name'])}, "
        f"{sql_str(r['width'])}, 'SQM', "
        f"{sql_num(r['wo'])}, {sql_num(r['wh'])}, {sql_num(r['pc'])}, {sql_num(r['dc'])}, "
        f"{r['sort']});"
    )

lines.append('')
lines.append("SELECT blind_type, fabric_group, COUNT(*) FROM rrp_entries GROUP BY 1, 2 ORDER BY 1, 2;")

out = '\n'.join(lines)
out_path = 'supabase/migrations/011_rrp_catalog.sql'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(out)
print(f'\nWritten: {out_path} ({len(rows_out)} rows)')
