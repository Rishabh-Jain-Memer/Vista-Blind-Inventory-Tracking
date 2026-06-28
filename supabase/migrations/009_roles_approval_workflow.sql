-- Roles and approval workflow for the rebuilt Vista franchise flow.
-- Keeps the schema/framework intact while making the CRM -> quotation -> order
-- -> management approval -> production/direct-order stages explicit.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'management'::text, 'sales'::text, 'executer'::text]));

UPDATE public.profiles
SET role = CASE
  WHEN role IN ('admin', 'management', 'sales', 'executer') THEN role
  WHEN role = 'staff' THEN 'sales'
  ELSE 'sales'
END;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    new.id,
    new.email,
    CASE
      WHEN new.raw_user_meta_data->>'role' IN ('admin', 'management', 'sales', 'executer')
        THEN new.raw_user_meta_data->>'role'
      ELSE 'sales'
    END,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$function$;

ALTER TABLE public.order_tickets DROP CONSTRAINT IF EXISTS order_tickets_status_check;
ALTER TABLE public.order_tickets ALTER COLUMN status SET DEFAULT 'active';
UPDATE public.order_tickets
SET status = CASE
  WHEN status IN ('open', 'followup') THEN 'active'
  WHEN status IN ('order_confirmed', 'converted') THEN 'confirmed'
  WHEN status = 'cancelled' THEN 'cancelled'
  ELSE 'active'
END;
ALTER TABLE public.order_tickets
  ADD CONSTRAINT order_tickets_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'confirmed'::text, 'cancelled'::text]));

ALTER TABLE public.order_tickets
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.order_ticket_followups DROP CONSTRAINT IF EXISTS order_ticket_followups_status_check;
UPDATE public.order_ticket_followups
SET status = CASE
  WHEN status IN ('order_confirmed', 'converted') THEN 'confirmed'
  WHEN status = 'cancelled' THEN 'cancelled'
  ELSE 'active'
END
WHERE status IS DISTINCT FROM CASE
  WHEN status IN ('order_confirmed', 'converted') THEN 'confirmed'
  WHEN status = 'cancelled' THEN 'cancelled'
  ELSE 'active'
END;
ALTER TABLE public.order_ticket_followups
  ADD CONSTRAINT order_ticket_followups_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'confirmed'::text, 'cancelled'::text]));

DO $$
BEGIN
  ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'quotation';
  ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'active';
  ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'approved';
  ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'direct_order';
  ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.order_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quotation_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS management_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS management_approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fulfilment_mode text NOT NULL DEFAULT 'stock_pending',
  ADD COLUMN IF NOT EXISTS stock_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_checked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_approval_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_approval_status_check
  CHECK (approval_status = ANY (ARRAY[
    'not_requested'::text,
    'pending_management'::text,
    'approved'::text,
    'rejected'::text
  ]));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfilment_mode_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfilment_mode_check
  CHECK (fulfilment_mode = ANY (ARRAY[
    'stock_pending'::text,
    'in_house'::text,
    'direct_order'::text
  ]));

CREATE INDEX IF NOT EXISTS idx_orders_ticket_id ON public.orders(ticket_id);
CREATE INDEX IF NOT EXISTS idx_orders_approval_status ON public.orders(approval_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfilment_mode ON public.orders(fulfilment_mode);

CREATE OR REPLACE FUNCTION public.can_access_order(target_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = target_order_id
      AND (
        public.current_app_role() IN ('admin', 'management', 'sales')
        OR o.customer_id = auth.uid()
        OR o.assigned_executor_id = auth.uid()
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_order(target_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = target_order_id
      AND (
        public.current_app_role() IN ('admin', 'management', 'sales')
        OR o.customer_id = auth.uid()
        OR o.assigned_executor_id = auth.uid()
      )
  )
$function$;

DROP POLICY IF EXISTS orders_insert ON public.orders;
CREATE POLICY orders_insert ON public.orders
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    current_app_role() IN ('admin', 'management', 'sales')
    OR customer_id = auth.uid()
  );

DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    current_app_role() IN ('admin', 'management', 'sales')
    OR customer_id = auth.uid()
    OR assigned_executor_id = auth.uid()
  );

DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_update ON public.orders
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    current_app_role() IN ('admin', 'management', 'sales')
    OR customer_id = auth.uid()
    OR assigned_executor_id = auth.uid()
  )
  WITH CHECK (
    current_app_role() IN ('admin', 'management', 'sales')
    OR customer_id = auth.uid()
    OR assigned_executor_id = auth.uid()
  );

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR current_app_role() IN ('admin', 'management', 'sales', 'executer')
  );

DROP POLICY IF EXISTS customers_insert ON public.customers;
CREATE POLICY customers_insert ON public.customers
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_app_role() = 'admin');

DROP POLICY IF EXISTS customers_admin_update ON public.customers;
CREATE POLICY customers_admin_update ON public.customers
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (current_app_role() = 'admin')
  WITH CHECK (current_app_role() = 'admin');

DROP POLICY IF EXISTS customers_admin_delete ON public.customers;
CREATE POLICY customers_admin_delete ON public.customers
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (current_app_role() = 'admin');

CREATE OR REPLACE FUNCTION public.approve_order_proforma(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role NOT IN ('admin', 'management') THEN
    RAISE EXCEPTION 'Only admin or management can approve proforma invoices.';
  END IF;

  UPDATE public.orders
  SET approval_status = 'approved',
      management_approved_at = now(),
      management_approved_by = auth.uid(),
      status = 'approved'
  WHERE id = p_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_order_stock_decision(
  p_order_id uuid,
  p_fulfilment_mode text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_status public.order_status;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role NOT IN ('admin', 'management', 'sales') THEN
    RAISE EXCEPTION 'Only admin, management, or sales can choose fulfilment mode.';
  END IF;

  IF p_fulfilment_mode NOT IN ('in_house', 'direct_order') THEN
    RAISE EXCEPTION 'Fulfilment mode must be in_house or direct_order.';
  END IF;

  v_status := CASE
    WHEN p_fulfilment_mode = 'direct_order' THEN 'direct_order'::public.order_status
    ELSE 'processing'::public.order_status
  END;

  UPDATE public.orders
  SET fulfilment_mode = p_fulfilment_mode,
      stock_checked_at = now(),
      stock_checked_by = auth.uid(),
      status = v_status
  WHERE id = p_order_id
    AND approval_status = 'approved';
END;
$function$;
