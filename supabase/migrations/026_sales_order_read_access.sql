-- Migration 026: let sales users read every order while preserving write limits.
-- Run after 025_order_ticket_inquiry_followups.sql on databases that already
-- applied 012_security_hardening.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_order(target_order_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = target_order_id
      AND (
        public.current_app_role() IN ('admin', 'sales')
        OR o.customer_id = auth.uid()
        OR o.assigned_executor_id = auth.uid()
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_view_order(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_order(UUID) TO authenticated;

DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('admin', 'sales')
    OR customer_id = auth.uid()
    OR assigned_executor_id = auth.uid()
  );

DROP POLICY IF EXISTS order_items_select ON public.order_items;
CREATE POLICY order_items_select ON public.order_items
  FOR SELECT TO authenticated
  USING (public.can_view_order(order_id));

DROP POLICY IF EXISTS order_components_select ON public.order_components;
CREATE POLICY order_components_select ON public.order_components
  FOR SELECT TO authenticated
  USING (public.can_view_order(order_id));

DROP POLICY IF EXISTS wastage_logs_select ON public.wastage_logs;
CREATE POLICY wastage_logs_select ON public.wastage_logs
  FOR SELECT TO authenticated
  USING (order_id IS NULL OR public.can_view_order(order_id));

COMMIT;

NOTIFY pgrst, 'reload schema';
