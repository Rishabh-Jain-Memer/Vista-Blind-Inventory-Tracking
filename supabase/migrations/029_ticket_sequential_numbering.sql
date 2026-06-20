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

ALTER TABLE public.order_tickets
  ALTER COLUMN ticket_uid DROP DEFAULT;

-- Avoid unique-index collisions while replacing any existing random ticket IDs.
UPDATE public.order_tickets
SET ticket_uid = 'TKT-TMP-' || id::text;

WITH numbered AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at ASC, id ASC) AS ticket_no,
    created_at
  FROM public.order_tickets
)
UPDATE public.order_tickets t
SET ticket_uid = public.format_order_ticket_uid(numbered.ticket_no, numbered.created_at)
FROM numbered
WHERE t.id = numbered.id;

DO $$
DECLARE
  ticket_count BIGINT;
BEGIN
  SELECT count(*) INTO ticket_count FROM public.order_tickets;

  IF ticket_count > 0 THEN
    PERFORM setval('public.order_ticket_number_seq', ticket_count, true);
  ELSE
    PERFORM setval('public.order_ticket_number_seq', 1, false);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_assign_order_ticket_uid ON public.order_tickets;
CREATE TRIGGER trg_assign_order_ticket_uid
  BEFORE INSERT ON public.order_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_ticket_uid();

COMMIT;

NOTIFY pgrst, 'reload schema';
