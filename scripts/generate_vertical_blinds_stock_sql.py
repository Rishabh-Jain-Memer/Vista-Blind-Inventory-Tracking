"""
Generate migration 021_import_vertical_blinds_stock.sql.

Imports only the Vertical Blind stock sheet from:
  Excel File/Vertical Blinds Stock.xlsx

The workbook also contains the existing MTR fabric sheet, which is already
covered by migration 002. This generator intentionally skips that sheet.
"""
from collections import OrderedDict
from pathlib import Path
import re

import openpyxl


SOURCE = Path("Excel File/Vertical Blinds Stock.xlsx")
OUTPUT = Path("supabase/migrations/021_import_vertical_blinds_stock.sql")
SHEET = "Main Data for MTR Vertical"
SUPPLIER = "Vista Furnishing Limited"
CATEGORY_NAME = "Vertical Blind Fabrics"
PRODUCT_PARENT_BY_CODE = True


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


def parse_date(value):
    if value is None:
        return None
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    text = clean_text(value)
    if not text:
        return None
    # Workbook stores dates as 1-Jan-26 style strings.
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
        stock_group, category, shade, product_code, width_cm, unit, batch, qty, rate, bill_no, purchase_date = row[:11]
        category = clean_text(category)
        product_code = clean_text(product_code)
        batch = clean_text(batch)
        if not (category and product_code and batch and qty is not None and rate is not None):
            continue
        if normalize(category) != normalize(CATEGORY_NAME):
            raise ValueError(f"Unexpected category on row {row_num}: {category}")
        width_m = float(width_cm) / 100 if width_cm not in (None, "") else None
        unit_norm = "m" if clean_text(unit).upper() in {"MTR", "M"} else clean_text(unit).lower()
        qty = float(qty)
        rate = float(rate)
        rows.append(
            {
                "row_num": row_num,
                "category": CATEGORY_NAME,
                "product": product_code if PRODUCT_PARENT_BY_CODE else CATEGORY_NAME,
                "variant": product_code,
                "normalized_product": normalize(product_code if PRODUCT_PARENT_BY_CODE else CATEGORY_NAME),
                "normalized_variant": normalize(product_code),
                "shade": clean_text(shade),
                "width_m": width_m,
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


def build_sql(rows):
    products = OrderedDict()
    for row in rows:
        products.setdefault(row["normalized_product"], row)

    total_value = sum(row["stock_value"] for row in rows)
    total_qty = sum(row["qty"] for row in rows)

    lines = [
        "-- ============================================================",
        "-- Import vertical blind fabric stock",
        f"-- Source: {SOURCE.as_posix()} / {SHEET}",
        "-- Append-only import; does not reset existing inventory.",
        "-- Valuation logic: stock_value = quantity * rate.",
        "-- ============================================================",
        f"-- Imported stock rows: {len(rows)}",
        f"-- Imported variants: {len(products)}",
        f"-- Total quantity: {sql_num(total_qty)} m",
        f"-- Total value: {sql_num(total_value)}",
        "",
        "BEGIN;",
        "",
        "-- Ensure the vertical fabric category exists.",
        "INSERT INTO inv_categories (name, normalized_name, sub_group)",
        f"VALUES ({sql_str(CATEGORY_NAME)}, {sql_str(normalize(CATEGORY_NAME))}, 'Fabric')",
        "ON CONFLICT (normalized_name) DO UPDATE",
        "SET name = EXCLUDED.name, sub_group = EXCLUDED.sub_group;",
        "",
        "-- Product rows mirror the existing fabric import pattern: one product per fabric code.",
    ]

    for row in products.values():
        lines.extend(
            [
                "INSERT INTO inv_products (category_id, name, normalized_name)",
                "SELECT c.id, {name}, {norm}".format(name=sql_str(row["product"]), norm=sql_str(row["normalized_product"])),
                "FROM inv_categories c",
                f"WHERE c.normalized_name = {sql_str(normalize(CATEGORY_NAME))}",
                "ON CONFLICT (category_id, normalized_name) DO UPDATE",
                "SET name = EXCLUDED.name;",
            ]
        )

    lines.append("")
    lines.append("-- Variants carry 10cm slat width as 0.1m so inventory area displays correctly.")
    for row in products.values():
        lines.extend(
            [
                "INSERT INTO inv_variants (product_id, name, normalized_name, width_m, unit, purchase_rate, base_rate_sqm)",
                "SELECT p.id, {name}, {norm}, {width}, {unit}, {rate}, NULL".format(
                    name=sql_str(row["variant"]),
                    norm=sql_str(row["normalized_variant"]),
                    width=sql_num(row["width_m"]),
                    unit=sql_str(row["unit"]),
                    rate=sql_num(row["rate"]),
                ),
                "FROM inv_products p",
                "JOIN inv_categories c ON c.id = p.category_id",
                f"WHERE c.normalized_name = {sql_str(normalize(CATEGORY_NAME))}",
                f"  AND p.normalized_name = {sql_str(row['normalized_product'])}",
                "ON CONFLICT (product_id, normalized_name) DO UPDATE",
                "SET name = EXCLUDED.name,",
                "    width_m = EXCLUDED.width_m,",
                "    unit = EXCLUDED.unit,",
                "    purchase_rate = EXCLUDED.purchase_rate;",
            ]
        )

    lines.append("")
    lines.append("-- Stock rolls and inward ledger movements.")
    for row in rows:
        source_note = f"Import: {SHEET}"
        lines.append(
            "WITH v AS ("
            "SELECT v.id AS variant_id "
            "FROM inv_variants v "
            "JOIN inv_products p ON p.id = v.product_id "
            "JOIN inv_categories c ON c.id = p.category_id "
            f"WHERE c.normalized_name = {sql_str(normalize(CATEGORY_NAME))} "
            f"AND p.normalized_name = {sql_str(row['normalized_product'])} "
            f"AND v.normalized_name = {sql_str(row['normalized_variant'])} "
            "LIMIT 1"
            "), ins AS ("
            "INSERT INTO inv_rolls (variant_id, batch_code, original_length, remaining_length, unit, purchase_rate, status, inward_date, bill_no, supplier, stock_value, notes) "
            f"SELECT v.variant_id, {sql_str(row['batch'])}, {sql_num(row['qty'])}, {sql_num(row['qty'])}, {sql_str(row['unit'])}, "
            f"{sql_num(row['rate'])}, 'in_stock', {sql_str(row['purchase_date'])}, {sql_str(row['bill_no'])}, {sql_str(SUPPLIER)}, "
            f"{sql_num(row['stock_value'])}, {sql_str(source_note)} "
            "FROM v "
            "WHERE NOT EXISTS ("
            "SELECT 1 FROM inv_rolls r "
            f"WHERE r.variant_id = v.variant_id AND r.batch_code = {sql_str(row['batch'])} AND r.notes = {sql_str(source_note)}"
            ") "
            "RETURNING id, variant_id"
            ") "
            "INSERT INTO inv_movements (roll_id, variant_id, movement_type, quantity, unit, rate, reference, note) "
            f"SELECT ins.id, ins.variant_id, 'inflow', {sql_num(row['qty'])}, {sql_str(row['unit'])}, {sql_num(row['rate'])}, "
            f"{sql_str(row['bill_no'])}, 'Initial vertical blind stock import' FROM ins;"
        )

    lines.extend(
        [
            "",
            "-- Verification summary for this import.",
            "DO $$",
            "DECLARE",
            "  imported_rolls integer;",
            "  imported_value numeric;",
            "BEGIN",
            "  SELECT COUNT(*), COALESCE(SUM(stock_value), 0)",
            "    INTO imported_rolls, imported_value",
            "  FROM inv_rolls r",
            "  JOIN inv_variants v ON v.id = r.variant_id",
            "  JOIN inv_products p ON p.id = v.product_id",
            "  JOIN inv_categories c ON c.id = p.category_id",
            f"  WHERE c.normalized_name = {sql_str(normalize(CATEGORY_NAME))}",
            f"    AND r.notes = {sql_str('Import: ' + SHEET)};",
            f"  IF imported_rolls <> {len(rows)} OR ROUND(imported_value::numeric, 2) <> {sql_num(round(total_value, 2))} THEN",
            "    RAISE EXCEPTION 'Vertical blind import mismatch: rolls %, value %', imported_rolls, imported_value;",
            "  END IF;",
            "END $$;",
            "",
            "COMMIT;",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    rows = read_rows()
    if len(rows) != 95:
        raise ValueError(f"Expected 95 vertical stock rows, found {len(rows)}")
    OUTPUT.write_text(build_sql(rows), encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(rows)} stock rows")


if __name__ == "__main__":
    main()
