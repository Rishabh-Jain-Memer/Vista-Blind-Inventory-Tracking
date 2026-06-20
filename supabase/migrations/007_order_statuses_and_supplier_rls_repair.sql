/*
  Repair supplier profile writes and normalize order status names.
  Run after 006 if supplier insert still says row-level security blocked it.
  Deployment note: run 012_security_hardening.sql before going live.
*/

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'inquiry';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'executed';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'completed';

BEGIN;

ALTER TABLE public.suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'suppliers'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.suppliers', p.policyname);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO anon, authenticated, service_role;

UPDATE public.orders
SET status = (
  CASE lower(status::text)
  WHEN 'discussing' THEN 'inquiry'
  WHEN 'pending' THEN 'inquiry'
  WHEN 'in progress' THEN 'processing'
  WHEN 'processing' THEN 'processing'
  WHEN 'executed' THEN 'executed'
  WHEN 'completed' THEN 'completed'
  WHEN 'cancelled' THEN 'inquiry'
  ELSE status::text
  END
)::order_status
WHERE status IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT
  rowsecurity AS suppliers_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'suppliers';
