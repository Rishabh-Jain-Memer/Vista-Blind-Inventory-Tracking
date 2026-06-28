-- Repair ticket UID generation for projects where the sequence was missing.

CREATE SEQUENCE IF NOT EXISTS public.order_ticket_number_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

DO $$
DECLARE
  v_max_ticket_no bigint := 0;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(ticket_uid, '\D', '', 'g'), '')::bigint), 0)
  INTO v_max_ticket_no
  FROM public.order_tickets;

  PERFORM setval('public.order_ticket_number_seq', GREATEST(v_max_ticket_no, 1), v_max_ticket_no > 0);
END $$;

CREATE OR REPLACE FUNCTION public.assign_order_ticket_uid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

DROP TRIGGER IF EXISTS trg_assign_order_ticket_uid ON public.order_tickets;
CREATE TRIGGER trg_assign_order_ticket_uid
  BEFORE INSERT ON public.order_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_ticket_uid();
