-- ============================================================
-- Migration 012: deployment security hardening
-- - Re-enables RLS after the earlier reset/import compatibility migrations
-- - Removes anonymous table access
-- - Keeps normal app access for authenticated users by role
-- - Supports secure admin user management through the admin-users Edge Function
-- ============================================================

BEGIN;

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role::text
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1
$$;

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
        public.current_app_role() = 'admin'
        OR public.current_app_role() = 'sales'
        OR o.customer_id = auth.uid()
        OR o.assigned_executor_id = auth.uid()
      )
  )
$$;

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

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_order(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_order(UUID) TO authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

DO $$
DECLARE
  t TEXT;
  p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles',
    'customers',
    'suppliers',
    'inv_categories',
    'inv_products',
    'inv_variants',
    'inv_rolls',
    'inv_movements',
    'fg_stock',
    'product_recipes',
    'recipe_items',
    'orders',
    'order_items',
    'order_components',
    'wastage_logs',
    'activity_logs',
    'rrp_entries'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      FOR p IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
      END LOOP;
    END IF;
  END LOOP;
END $$;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.current_app_role() IN ('admin', 'sales', 'executer')
  );
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = public.current_app_role());
CREATE POLICY profiles_admin_write ON public.profiles
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY customers_read ON public.customers
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY customers_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY customers_admin_update ON public.customers
  FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY customers_admin_delete ON public.customers
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

CREATE POLICY suppliers_admin_all ON public.suppliers
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY inv_categories_read ON public.inv_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_products_read ON public.inv_products FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_variants_read ON public.inv_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_rolls_read ON public.inv_rolls FOR SELECT TO authenticated USING (true);
CREATE POLICY fg_stock_read ON public.fg_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY product_recipes_read ON public.product_recipes FOR SELECT TO authenticated USING (true);
CREATE POLICY recipe_items_read ON public.recipe_items FOR SELECT TO authenticated USING (true);
CREATE POLICY rrp_entries_read ON public.rrp_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY inv_categories_admin_write ON public.inv_categories FOR ALL TO authenticated USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY inv_products_admin_write ON public.inv_products FOR ALL TO authenticated USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY inv_variants_admin_write ON public.inv_variants FOR ALL TO authenticated USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY inv_rolls_admin_write ON public.inv_rolls FOR ALL TO authenticated USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY fg_stock_admin_write ON public.fg_stock FOR ALL TO authenticated USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY product_recipes_admin_write ON public.product_recipes FOR ALL TO authenticated USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY recipe_items_admin_write ON public.recipe_items FOR ALL TO authenticated USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY rrp_entries_admin_write ON public.rrp_entries FOR ALL TO authenticated USING (public.current_app_role() = 'admin') WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY inv_movements_staff_read ON public.inv_movements
  FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('admin', 'executer'));
CREATE POLICY inv_movements_staff_insert ON public.inv_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('admin', 'executer'));
CREATE POLICY inv_movements_admin_update ON public.inv_movements
  FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY inv_movements_admin_delete ON public.inv_movements
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

CREATE POLICY orders_select ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('admin', 'sales')
    OR customer_id = auth.uid()
    OR assigned_executor_id = auth.uid()
  );
CREATE POLICY orders_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() = 'admin'
    OR customer_id = auth.uid()
  );
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
CREATE POLICY orders_delete ON public.orders
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

CREATE POLICY order_items_select ON public.order_items
  FOR SELECT TO authenticated
  USING (public.can_view_order(order_id));
CREATE POLICY order_items_insert ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_order(order_id));
CREATE POLICY order_items_update ON public.order_items
  FOR UPDATE TO authenticated
  USING (public.can_access_order(order_id))
  WITH CHECK (public.can_access_order(order_id));
CREATE POLICY order_items_delete ON public.order_items
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('admin', 'sales') AND public.can_access_order(order_id));

CREATE POLICY order_components_select ON public.order_components
  FOR SELECT TO authenticated
  USING (public.can_view_order(order_id));
CREATE POLICY order_components_insert ON public.order_components
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_order(order_id));
CREATE POLICY order_components_update ON public.order_components
  FOR UPDATE TO authenticated
  USING (public.can_access_order(order_id))
  WITH CHECK (public.can_access_order(order_id));
CREATE POLICY order_components_delete ON public.order_components
  FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('admin', 'sales') AND public.can_access_order(order_id));

CREATE POLICY wastage_logs_select ON public.wastage_logs
  FOR SELECT TO authenticated
  USING (order_id IS NULL OR public.can_view_order(order_id));
CREATE POLICY wastage_logs_insert ON public.wastage_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() IN ('admin', 'executer')
    AND (order_id IS NULL OR public.can_access_order(order_id))
  );
CREATE POLICY wastage_logs_admin_write ON public.wastage_logs
  FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY wastage_logs_admin_delete ON public.wastage_logs
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

CREATE POLICY activity_logs_read ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.current_app_role() = 'admin' OR user_id = auth.uid());
CREATE POLICY activity_logs_insert ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY activity_logs_admin_write ON public.activity_logs
  FOR UPDATE TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');
CREATE POLICY activity_logs_admin_delete ON public.activity_logs
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

COMMIT;

NOTIFY pgrst, 'reload schema';
