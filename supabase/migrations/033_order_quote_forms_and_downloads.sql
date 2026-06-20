-- Persist editable quote/proforma invoice defaults and every generated copy.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.order_quote_forms (
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.order_quote_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  quote_no TEXT,
  document_type TEXT NOT NULL DEFAULT 'quote',
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_quote_downloads_order_created
  ON public.order_quote_downloads(order_id, created_at DESC);

ALTER TABLE public.order_quote_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_quote_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_quote_forms_select ON public.order_quote_forms;
CREATE POLICY order_quote_forms_select ON public.order_quote_forms
  FOR SELECT TO authenticated
  USING (public.can_view_order(order_id));

DROP POLICY IF EXISTS order_quote_forms_insert ON public.order_quote_forms;
CREATE POLICY order_quote_forms_insert ON public.order_quote_forms
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_order(order_id));

DROP POLICY IF EXISTS order_quote_forms_update ON public.order_quote_forms;
CREATE POLICY order_quote_forms_update ON public.order_quote_forms
  FOR UPDATE TO authenticated
  USING (public.can_access_order(order_id))
  WITH CHECK (public.can_access_order(order_id));

DROP POLICY IF EXISTS order_quote_forms_delete ON public.order_quote_forms;
CREATE POLICY order_quote_forms_delete ON public.order_quote_forms
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS order_quote_downloads_select ON public.order_quote_downloads;
CREATE POLICY order_quote_downloads_select ON public.order_quote_downloads
  FOR SELECT TO authenticated
  USING (public.can_view_order(order_id));

DROP POLICY IF EXISTS order_quote_downloads_insert ON public.order_quote_downloads;
CREATE POLICY order_quote_downloads_insert ON public.order_quote_downloads
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_order(order_id));

DROP POLICY IF EXISTS order_quote_downloads_delete ON public.order_quote_downloads;
CREATE POLICY order_quote_downloads_delete ON public.order_quote_downloads
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

COMMIT;

NOTIFY pgrst, 'reload schema';
