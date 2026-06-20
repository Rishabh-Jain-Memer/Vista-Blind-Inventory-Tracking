-- Migration 027: let sales users maintain open order flow across all sales orders.
-- Run after 026_sales_order_read_access.sql.

BEGIN;

DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_update ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.current_app_role() IN ('admin', 'sales')
    OR customer_id = auth.uid()
    OR assigned_executor_id = auth.uid()
  )
  WITH CHECK (
    public.current_app_role() IN ('admin', 'sales')
    OR customer_id = auth.uid()
    OR assigned_executor_id = auth.uid()
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
