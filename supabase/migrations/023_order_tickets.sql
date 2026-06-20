BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.order_ticket_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

CREATE OR REPLACE FUNCTION public.format_order_ticket_uid(ticket_no BIGINT, ticket_created_at TIMESTAMPTZ DEFAULT now())
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT 'TKT-'
    || lpad(ticket_no::text, 4, '0')
    || to_char((COALESCE(ticket_created_at, now()) AT TIME ZONE 'Asia/Kolkata')::date, 'DDMMYY')
$$;

CREATE OR REPLACE FUNCTION public.assign_order_ticket_uid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  IF NEW.ticket_uid IS NULL OR NEW.ticket_uid = '' THEN
    NEW.ticket_uid := public.format_order_ticket_uid(
      nextval('public.order_ticket_number_seq'),
      NEW.created_at
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.order_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_uid TEXT NOT NULL,
  cust_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  converted_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  requirement_notes TEXT NOT NULL,
  follow_up_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_tickets_status_check CHECK (status IN ('open', 'converted', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS order_tickets_ticket_uid_key ON public.order_tickets(ticket_uid);
CREATE INDEX IF NOT EXISTS idx_order_tickets_status_created_at ON public.order_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_tickets_cust_id ON public.order_tickets(cust_id);
CREATE INDEX IF NOT EXISTS idx_order_tickets_created_by ON public.order_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_order_tickets_converted_order_id ON public.order_tickets(converted_order_id);

DROP TRIGGER IF EXISTS trg_assign_order_ticket_uid ON public.order_tickets;
CREATE TRIGGER trg_assign_order_ticket_uid
  BEFORE INSERT ON public.order_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_ticket_uid();

ALTER TABLE public.order_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_tickets_select ON public.order_tickets;
DROP POLICY IF EXISTS order_tickets_insert ON public.order_tickets;
DROP POLICY IF EXISTS order_tickets_update ON public.order_tickets;
DROP POLICY IF EXISTS order_tickets_delete ON public.order_tickets;

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

CREATE POLICY order_tickets_delete ON public.order_tickets
  FOR DELETE TO authenticated
  USING (public.current_app_role() = 'admin');

COMMIT;
