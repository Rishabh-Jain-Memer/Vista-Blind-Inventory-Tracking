-- Migration 016: Repair generated UUID defaults for manually managed app tables.
-- Safe to rerun. This fixes partial/older schema states where browser inserts
-- fail with null id errors because an existing UUID id column missed its default.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $$
DECLARE
  target_column RECORD;
BEGIN
  FOR target_column IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'id'
      AND udt_name = 'uuid'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()',
      target_column.table_schema,
      target_column.table_name
    );
  END LOOP;
END;
$$;

COMMIT;
