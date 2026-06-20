-- Remove order headers left behind by failed item inserts.
--
-- The browser used to insert the orders row before inserting order_items. If an
-- item insert failed, for example because decimal quantity hit an integer
-- column, the zero-total order header remained visible in Orders. This cleanup
-- only deletes empty zero-total inquiry headers when a matching real sibling
-- order exists for the same customer/dealer/date.

BEGIN;

WITH orphan_orders AS (
  SELECT o.id
  FROM public.orders o
  WHERE COALESCE(o.total_amount, 0) = 0
    AND COALESCE(LOWER(o.status::text), 'inquiry') IN ('inquiry', 'pending', 'discussing')
    AND NOT EXISTS (
      SELECT 1
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.order_components oc
      WHERE oc.order_id = o.id
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders s
      WHERE s.id <> o.id
        AND COALESCE(s.total_amount, 0) > 0
        AND COALESCE(s.dealer_name, '') = COALESCE(o.dealer_name, '')
        AND COALESCE(s.cust_id::text, '') = COALESCE(o.cust_id::text, '')
        AND COALESCE(s.customer_id::text, '') = COALESCE(o.customer_id::text, '')
        AND COALESCE(s.order_date, s.created_at::date) = COALESCE(o.order_date, o.created_at::date)
        AND EXISTS (
          SELECT 1
          FROM public.order_items si
          WHERE si.order_id = s.id
        )
    )
)
DELETE FROM public.orders o
USING orphan_orders oo
WHERE o.id = oo.id;

COMMIT;
