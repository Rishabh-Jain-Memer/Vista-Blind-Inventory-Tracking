BEGIN;

DROP POLICY IF EXISTS order_tickets_select ON public.order_tickets;
DROP POLICY IF EXISTS order_tickets_insert ON public.order_tickets;
DROP POLICY IF EXISTS order_tickets_update ON public.order_tickets;

CREATE POLICY order_tickets_select ON public.order_tickets
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY order_tickets_insert ON public.order_tickets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY order_tickets_update ON public.order_tickets
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
