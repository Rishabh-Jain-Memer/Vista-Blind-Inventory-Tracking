BEGIN;

ALTER TABLE public.order_tickets
  ADD COLUMN IF NOT EXISTS inquiry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_mobile TEXT,
  ADD COLUMN IF NOT EXISTS inquiry_for TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS allocated_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.order_tickets
  DROP CONSTRAINT IF EXISTS order_tickets_status_check;

ALTER TABLE public.order_tickets
  ADD CONSTRAINT order_tickets_status_check
  CHECK (status IN ('open', 'followup', 'order_confirmed', 'converted', 'cancelled'));

UPDATE public.order_tickets
SET
  inquiry_date = COALESCE(inquiry_date, created_at::date),
  customer_name = COALESCE(customer_name, ''),
  customer_mobile = COALESCE(customer_mobile, '')
WHERE customer_name IS NULL OR customer_mobile IS NULL;

UPDATE public.order_tickets t
SET
  customer_name = COALESCE(NULLIF(t.customer_name, ''), c.name),
  customer_mobile = COALESCE(NULLIF(t.customer_mobile, ''), c.phone)
FROM public.customers c
WHERE t.cust_id = c.id
  AND (NULLIF(t.customer_name, '') IS NULL OR NULLIF(t.customer_mobile, '') IS NULL);

CREATE TABLE IF NOT EXISTS public.order_ticket_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.order_tickets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'followup',
  remarks TEXT NOT NULL,
  remark_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  follow_up_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_ticket_followups_status_check CHECK (status IN ('followup', 'order_confirmed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_order_ticket_followups_ticket_created
  ON public.order_ticket_followups(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_tickets_allocated_to
  ON public.order_tickets(allocated_to);
CREATE INDEX IF NOT EXISTS idx_order_tickets_inquiry_date
  ON public.order_tickets(inquiry_date DESC);

ALTER TABLE public.order_ticket_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_ticket_followups_select ON public.order_ticket_followups;
DROP POLICY IF EXISTS order_ticket_followups_insert ON public.order_ticket_followups;
DROP POLICY IF EXISTS order_ticket_followups_update ON public.order_ticket_followups;
DROP POLICY IF EXISTS order_ticket_followups_delete ON public.order_ticket_followups;

CREATE POLICY order_ticket_followups_select ON public.order_ticket_followups
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY order_ticket_followups_insert ON public.order_ticket_followups
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY order_ticket_followups_update ON public.order_ticket_followups
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY order_ticket_followups_delete ON public.order_ticket_followups
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

COMMIT;
