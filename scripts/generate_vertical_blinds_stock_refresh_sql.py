"""
Generate migration 022_refresh_vertical_blinds_stock_rates.sql.

This refreshes only the Vertical Blind stock imported from:
  Excel File/Vertical Blinds Stock.xlsx / Main Data for MTR Vertical

The generated SQL intentionally avoids temp/staging tables so Supabase SQL
Editor cannot lose the source rows between statements.
"""
from collections import OrderedDict
from pathlib import Path
import re

import openpyxl


SOURCE = Path("Excel File/Vertical Blinds Stock.xlsx")
OUTPUT = Path("supabase/migrations/022_refresh_vertical_blinds_stock_rates.sql")
SHEET = "Main Data for MTR Vertical"
SUPPLIER = "Vista Furnishing Limited"
CATEGORY_NAME = "Vertical Blind Fabrics"
SOURCE_NOTE = f"Import: {SHEET}"
MOVEMENT_NOTE = "Initial vertical blind stock import"

SOURCE_COLUMNS = (
    "product_name, normalized_product, variant_name, normalized_variant, shade, "
    "width_m, unit, batch_code, qty, rate, bill_no, purchase_date, stock_value"
)


def clean_text(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def normalize(value):
    return clean_text(value).lower()


def sql_str(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_num(value):
    if value is None:
        return "NULL"
    value = float(value)
    return str(int(value)) if value.is_integer() else str(value)


def sql_date(value):
    if value is None:
        return "NULL"
    return "DATE " + sql_str(value)


def parse_date(value):
    if value is None:
        return None
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    text = clean_text(value)
    if not text:
        return None
    from datetime import datetime

    for fmt in ("%d-%b-%y", "%d-%b-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    raise ValueError(f"Unsupported date format: {text}")


def read_rows():
    wb = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    ws = wb[SHEET]
    rows = []
    for row_num, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
        _, category, shade, product_code, width_cm, unit, batch, qty, rate, bill_no, purchase_date = row[:11]
        category = clean_text(category)
        product_code = clean_text(product_code)
        batch = clean_text(batch)
        if not (category and product_code and batch and qty is not None and rate is not None):
            continue
        if normalize(category) != normalize(CATEGORY_NAME):
            raise ValueError(f"Unexpected category on row {row_num}: {category}")
        unit_norm = "m" if clean_text(unit).upper() in {"MTR", "M"} else clean_text(unit).lower()
        qty = float(qty)
        rate = float(rate)
        rows.append(
            {
                "row_num": row_num,
                "product": product_code,
                "variant": product_code,
                "normalized_product": normalize(product_code),
                "normalized_variant": normalize(product_code),
                "shade": clean_text(shade),
                "width_m": float(width_cm) / 100 if width_cm not in (None, "") else None,
                "unit": unit_norm,
                "batch": batch,
                "qty": qty,
                "rate": rate,
                "bill_no": clean_text(bill_no),
                "purchase_date": parse_date(purchase_date),
                "stock_value": qty * rate,
            }
        )
    return rows


def build_values(rows):
    lines = []
    for row in rows:
        values = [
            sql_str(row["product"]),
            sql_str(row["normalized_product"]),
            sql_str(row["variant"]),
            sql_str(row["normalized_variant"]),
            sql_str(row["shade"]),
            sql_num(row["width_m"]),
            sql_str(row["unit"]),
            sql_str(row["batch"]),
            sql_num(row["qty"]),
            sql_num(row["rate"]),
            sql_str(row["bill_no"]),
            sql_date(row["purchase_date"]),
            sql_num(row["stock_value"]),
        ]
        lines.append("  (" + ", ".join(values) + ")")
    return ",\n".join(lines)


def source_cte(values_sql, name="src"):
    return f"WITH {name}({SOURCE_COLUMNS}) AS (\nVALUES\n{values_sql}\n)"


def source_table(values_sql, name="src"):
    return f"(VALUES\n{values_sql}\n) AS {name}({SOURCE_COLUMNS})"


def build_sql(rows):
    products = OrderedDict()
    for row in rows:
        products.setdefault(row["normalized_product"], row)

    total_qty = sum(row["qty"] for row in rows)
    total_value = sum(row["stock_value"] for row in rows)
    values_sql = build_values(rows)
    cte = source_cte(values_sql)
    table = source_table(values_sql)
    category_norm = sql_str(normalize(CATEGORY_NAME))

    return f"""-- ============================================================
-- Refresh vertical blind fabric stock rates
-- Source: {SOURCE.as_posix()} / {SHEET}
-- Scope: only category {CATEGORY_NAME}, import note {SOURCE_NOTE}
-- Preserves already-consumed quantity when updating existing rolls.
-- No temp/staging table is used; each statement carries its own source rows.
-- ============================================================
-- Refreshed stock rows: {len(rows)}
-- Refreshed variants: {len(products)}
-- Total quantity: {sql_num(total_qty)} m
-- Total value: {sql_num(total_value)}

BEGIN;

INSERT INTO inv_categories (name, normalized_name, sub_group)
VALUES ({sql_str(CATEGORY_NAME)}, {category_norm}, 'Fabric')
ON CONFLICT (normalized_name) DO UPDATE
SET name = EXCLUDED.name,
    sub_group = EXCLUDED.sub_group;

{cte},
products AS (
  SELECT DISTINCT product_name, normalized_product
  FROM src
)
INSERT INTO inv_products (category_id, name, normalized_name)
SELECT c.id, p.product_name, p.normalized_product
FROM products p
JOIN inv_categories c ON c.normalized_name = {category_norm}
ON CONFLICT (category_id, normalized_name) DO UPDATE
SET name = EXCLUDED.name;

{cte},
variant_rows AS (
  SELECT DISTINCT ON (normalized_product, normalized_variant)
    normalized_product, variant_name, normalized_variant, width_m, unit, rate
  FROM src
  ORDER BY normalized_product, normalized_variant, rate DESC
)
INSERT INTO inv_variants (product_id, name, normalized_name, width_m, unit, purchase_rate, base_rate_sqm)
SELECT p.id, v.variant_name, v.normalized_variant, v.width_m, v.unit, v.rate, NULL
FROM variant_rows v
JOIN inv_products p ON p.normalized_name = v.normalized_product
JOIN inv_categories c ON c.id = p.category_id
WHERE c.normalized_name = {category_norm}
ON CONFLICT (product_id, normalized_name) DO UPDATE
SET name = EXCLUDED.name,
    width_m = EXCLUDED.width_m,
    unit = EXCLUDED.unit,
    purchase_rate = EXCLUDED.purchase_rate;

{cte},
matched AS (
  SELECT
    r.id,
    r.original_length,
    r.remaining_length,
    src.qty,
    src.unit,
    src.rate,
    src.bill_no,
    src.purchase_date,
    src.stock_value
  FROM inv_rolls r
  JOIN inv_variants v ON v.id = r.variant_id
  JOIN inv_products p ON p.id = v.product_id
  JOIN inv_categories c ON c.id = p.category_id
  JOIN src
    ON src.normalized_product = p.normalized_name
   AND src.normalized_variant = v.normalized_name
   AND src.batch_code = r.batch_code
  WHERE c.normalized_name = {category_norm}
    AND r.notes = {sql_str(SOURCE_NOTE)}
)
UPDATE inv_rolls r
SET original_length = m.qty,
    remaining_length = GREATEST(0, m.qty - GREATEST(0, COALESCE(m.original_length, 0) - COALESCE(m.remaining_length, 0))),
    unit = m.unit,
    purchase_rate = m.rate,
    status = CASE
      WHEN GREATEST(0, m.qty - GREATEST(0, COALESCE(m.original_length, 0) - COALESCE(m.remaining_length, 0))) <= CASE WHEN m.unit = 'm' THEN 0.1 ELSE 0 END
        THEN 'depleted'
      ELSE 'in_stock'
    END,
    inward_date = m.purchase_date,
    bill_no = m.bill_no,
    supplier = {sql_str(SUPPLIER)},
    stock_value = m.stock_value,
    notes = {sql_str(SOURCE_NOTE)}
FROM matched m
WHERE r.id = m.id;

{cte},
source_rows AS (
  SELECT
    v.id AS variant_id,
    src.*
  FROM src
  JOIN inv_products p ON p.normalized_name = src.normalized_product
  JOIN inv_categories c ON c.id = p.category_id
  JOIN inv_variants v ON v.product_id = p.id AND v.normalized_name = src.normalized_variant
  WHERE c.normalized_name = {category_norm}
),
ins AS (
  INSERT INTO inv_rolls (
    variant_id, batch_code, original_length, remaining_length, unit, purchase_rate,
    status, inward_date, bill_no, supplier, stock_value, notes
  )
  SELECT
    s.variant_id, s.batch_code, s.qty, s.qty, s.unit, s.rate,
    'in_stock', s.purchase_date, s.bill_no, {sql_str(SUPPLIER)}, s.stock_value, {sql_str(SOURCE_NOTE)}
  FROM source_rows s
  WHERE NOT EXISTS (
    SELECT 1
    FROM inv_rolls r
    WHERE r.variant_id = s.variant_id
      AND r.batch_code = s.batch_code
      AND r.notes = {sql_str(SOURCE_NOTE)}
  )
  RETURNING id, variant_id, original_length, unit, purchase_rate, bill_no
)
INSERT INTO inv_movements (roll_id, variant_id, movement_type, quantity, unit, rate, reference, note)
SELECT id, variant_id, 'inflow', original_length, unit, purchase_rate, bill_no, {sql_str(MOVEMENT_NOTE)}
FROM ins;

{cte},
source_rows AS (
  SELECT
    r.id AS roll_id,
    v.id AS variant_id,
    src.qty,
    src.unit,
    src.rate,
    src.bill_no
  FROM src
  JOIN inv_products p ON p.normalized_name = src.normalized_product
  JOIN inv_categories c ON c.id = p.category_id
  JOIN inv_variants v ON v.product_id = p.id AND v.normalized_name = src.normalized_variant
  JOIN inv_rolls r ON r.variant_id = v.id AND r.batch_code = src.batch_code AND r.notes = {sql_str(SOURCE_NOTE)}
  WHERE c.normalized_name = {category_norm}
)
UPDATE inv_movements m
SET quantity = s.qty,
    unit = s.unit,
    rate = s.rate,
    reference = s.bill_no,
    note = {sql_str(MOVEMENT_NOTE)}
FROM source_rows s
WHERE m.roll_id = s.roll_id
  AND m.movement_type = 'inflow'
  AND m.note = {sql_str(MOVEMENT_NOTE)};

{cte},
source_rows AS (
  SELECT
    r.id AS roll_id,
    v.id AS variant_id,
    src.qty,
    src.unit,
    src.rate,
    src.bill_no
  FROM src
  JOIN inv_products p ON p.normalized_name = src.normalized_product
  JOIN inv_categories c ON c.id = p.category_id
  JOIN inv_variants v ON v.product_id = p.id AND v.normalized_name = src.normalized_variant
  JOIN inv_rolls r ON r.variant_id = v.id AND r.batch_code = src.batch_code AND r.notes = {sql_str(SOURCE_NOTE)}
  WHERE c.normalized_name = {category_norm}
)
INSERT INTO inv_movements (roll_id, variant_id, movement_type, quantity, unit, rate, reference, note)
SELECT s.roll_id, s.variant_id, 'inflow', s.qty, s.unit, s.rate, s.bill_no, {sql_str(MOVEMENT_NOTE)}
FROM source_rows s
WHERE NOT EXISTS (
  SELECT 1
  FROM inv_movements m
  WHERE m.roll_id = s.roll_id
    AND m.movement_type = 'inflow'
    AND m.note = {sql_str(MOVEMENT_NOTE)}
);

{cte}
DELETE FROM inv_rolls r
USING inv_variants v, inv_products p, inv_categories c
WHERE r.variant_id = v.id
  AND v.product_id = p.id
  AND p.category_id = c.id
  AND c.normalized_name = {category_norm}
  AND r.notes = {sql_str(SOURCE_NOTE)}
  AND NOT EXISTS (
    SELECT 1
    FROM src
    WHERE src.normalized_product = p.normalized_name
      AND src.normalized_variant = v.normalized_name
      AND src.batch_code = r.batch_code
  )
  AND NOT EXISTS (
    SELECT 1
    FROM inv_movements m
    WHERE m.roll_id = r.id
      AND NOT (m.movement_type = 'inflow' AND m.note = {sql_str(MOVEMENT_NOTE)})
  );

DO $$
DECLARE
  expected_rolls integer;
  expected_value numeric;
  imported_rolls integer;
  imported_value numeric;
BEGIN
  SELECT COUNT(*), ROUND(COALESCE(SUM(stock_value), 0)::numeric, 2)
    INTO expected_rolls, expected_value
  FROM {table};

  SELECT COUNT(*), ROUND(COALESCE(SUM(r.stock_value), 0)::numeric, 2)
    INTO imported_rolls, imported_value
  FROM inv_rolls r
  JOIN inv_variants v ON v.id = r.variant_id
  JOIN inv_products p ON p.id = v.product_id
  JOIN inv_categories c ON c.id = p.category_id
  JOIN {table}
    ON src.normalized_product = p.normalized_name
   AND src.normalized_variant = v.normalized_name
   AND src.batch_code = r.batch_code
  WHERE c.normalized_name = {category_norm}
    AND r.notes = {sql_str(SOURCE_NOTE)};

  IF imported_rolls <> expected_rolls OR imported_value <> expected_value THEN
    RAISE EXCEPTION 'Vertical blind stock refresh mismatch: expected rolls %, value %, got rolls %, value %',
      expected_rolls, expected_value, imported_rolls, imported_value;
  END IF;
END $$;

COMMIT;
"""


def main():
    rows = read_rows()
    if len(rows) != 95:
        raise ValueError(f"Expected 95 vertical stock rows, found {len(rows)}")
    batches = {(row["normalized_variant"], row["batch"]) for row in rows}
    if len(batches) != len(rows):
        raise ValueError("Duplicate vertical stock variant/batch rows in workbook")
    OUTPUT.write_text(build_sql(rows), encoding="utf-8")
    total_value = sum(row["stock_value"] for row in rows)
    print(f"Wrote {OUTPUT} with {len(rows)} rows, value {total_value:.2f}")


if __name__ == "__main__":
    main()
