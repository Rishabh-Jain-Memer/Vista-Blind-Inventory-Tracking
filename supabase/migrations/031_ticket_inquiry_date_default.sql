-- Migration 031: keep ticket inquiry date database-managed.
-- Run after 030_sales_order_item_edit_access.sql.

BEGIN;

ALTER TABLE public.order_tickets
  ALTER COLUMN inquiry_date SET DEFAULT CURRENT_DATE;

UPDATE public.order_tickets
SET inquiry_date = COALESCE(inquiry_date, created_at::date, CURRENT_DATE)
WHERE inquiry_date IS NULL;

ALTER TABLE public.order_tickets
  ALTER COLUMN inquiry_date SET NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
