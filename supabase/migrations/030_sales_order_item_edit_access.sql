-- Migration 030: allow sales users to edit order line items/components.
-- Run after 029_ticket_sequential_numbering.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_order(target_order_id UUID)
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

REVOKE ALL ON FUNCTION public.can_access_order(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_order(UUID) TO authenticated;

DROP POLICY IF EXISTS order_items_insert ON public.order_items;
CREATE POLICY order_items_insert ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_order(order_id));

DROP POLICY IF EXISTS order_items_update ON public.order_items;
CREATE POLICY order_items_update ON public.order_items
  FOR UPDATE TO authenticated
  USING (public.can_access_order(order_id))
  WITH CHECK (public.can_access_order(order_id));

DROP POLICY IF EXISTS order_items_delete ON public.order_items;
CREATE POLICY order_items_delete ON public.order_items
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('admin', 'sales') AND public.can_access_order(order_id));

DROP POLICY IF EXISTS order_components_insert ON public.order_components;
CREATE POLICY order_components_insert ON public.order_components
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_order(order_id));

DROP POLICY IF EXISTS order_components_update ON public.order_components;
CREATE POLICY order_components_update ON public.order_components
  FOR UPDATE TO authenticated
  USING (public.can_access_order(order_id))
  WITH CHECK (public.can_access_order(order_id));

DROP POLICY IF EXISTS order_components_delete ON public.order_components;
CREATE POLICY order_components_delete ON public.order_components
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('admin', 'sales') AND public.can_access_order(order_id));

COMMIT;

NOTIFY pgrst, 'reload schema';
