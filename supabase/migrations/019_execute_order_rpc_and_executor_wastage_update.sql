-- Restore the server-side execution path used by order-detail.js and
-- executer-dashboard.js, and let assigned executers save cut details before
-- clicking Execute.

BEGIN;

DROP POLICY IF EXISTS wastage_logs_executor_update ON public.wastage_logs;
CREATE POLICY wastage_logs_executor_update ON public.wastage_logs
  FOR UPDATE TO authenticated
  USING (
    public.current_app_role() IN ('admin', 'executer')
    AND (order_id IS NULL OR public.can_access_order(order_id))
  )
  WITH CHECK (
    public.current_app_role() IN ('admin', 'executer')
    AND (order_id IS NULL OR public.can_access_order(order_id))
  );

DROP FUNCTION IF EXISTS public.execute_order(UUID, UUID);

CREATE OR REPLACE FUNCTION public.execute_order(
  p_order_id UUID,
  p_executor_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := COALESCE(p_executor_id, auth.uid());
  v_auth_id UUID := auth.uid();
  v_actor_role TEXT;
  v_order RECORD;
  v_item RECORD;
  v_component RECORD;
  v_waste RECORD;
  v_roll RECORD;
  v_remaining NUMERIC;
  v_take NUMERIC;
  v_needed NUMERIC;
  v_unit TEXT;
  v_roll_id UUID;
  v_fabric_count INTEGER := 0;
  v_component_count INTEGER := 0;
  v_raw_count INTEGER := 0;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to execute an order.';
  END IF;

  SELECT role::text INTO v_actor_role
  FROM public.profiles
  WHERE id = v_actor_id;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Executor profile was not found.';
  END IF;

  IF v_auth_id <> v_actor_id AND v_actor_role <> 'admin' THEN
    RAISE EXCEPTION 'You can only execute orders as your own profile.';
  END IF;

  IF v_actor_role NOT IN ('admin', 'executer') THEN
    RAISE EXCEPTION 'Only admin and executer users can execute orders.';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order was not found.';
  END IF;

  IF v_actor_role = 'executer'
     AND COALESCE(v_order.assigned_executor_id::text, '') <> v_actor_id::text THEN
    RAISE EXCEPTION 'This order is not assigned to you.';
  END IF;

  IF LOWER(COALESCE(v_order.status::text, '')) = 'executed' THEN
    RETURN jsonb_build_object(
      'fabric_items_deducted', 0,
      'components_deducted', 0,
      'raw_material_items_deducted', 0
    );
  END IF;

  IF LOWER(COALESCE(v_order.status::text, '')) <> 'processing' THEN
    RAISE EXCEPTION 'Order must be in processing status before execution.';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.order_items
    WHERE order_id = p_order_id
    ORDER BY created_at NULLS LAST, id
  LOOP
    IF COALESCE(v_item.fabric_deducted, false) THEN
      CONTINUE;
    END IF;

    IF COALESCE(v_item.item_type, 'finished_goods') = 'finished_goods'
       AND v_item.variant_id IS NOT NULL THEN
      SELECT *
      INTO v_waste
      FROM public.wastage_logs
      WHERE order_item_id = v_item.id
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 1;

      v_needed := COALESCE(
        v_waste.cut_length_m,
        (COALESCE(v_item.height_cm, 0) / 100)
          * COALESCE(v_item.quantity, 1)
          * CASE WHEN COALESCE(v_item.blind_type, '') LIKE 'Sheer Dimout%' THEN 2 ELSE 1 END
      );

      IF COALESCE(v_needed, 0) <= 0 THEN
        RAISE EXCEPTION 'Fabric cut length is missing for order item %.', v_item.id;
      END IF;

      v_roll_id := COALESCE(v_waste.roll_id, v_item.roll_id);
      IF v_roll_id IS NOT NULL THEN
        SELECT *
        INTO v_roll
        FROM public.inv_rolls
        WHERE id = v_roll_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Selected roll was not found for order item %.', v_item.id;
        END IF;
      ELSE
        SELECT *
        INTO v_roll
        FROM public.inv_rolls
        WHERE variant_id = v_item.variant_id
          AND status = 'in_stock'
          AND COALESCE(remaining_length, 0) >= v_needed
        ORDER BY remaining_length ASC, created_at ASC
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'No in-stock roll has enough fabric for order item %.', v_item.id;
        END IF;
      END IF;

      IF COALESCE(v_roll.remaining_length, 0) < v_needed THEN
        RAISE EXCEPTION 'Selected roll % does not have enough fabric for order item %.', v_roll.batch_code, v_item.id;
      END IF;

      UPDATE public.inv_rolls
      SET
        remaining_length = GREATEST(0, remaining_length - v_needed),
        status = CASE
          WHEN GREATEST(0, remaining_length - v_needed) <= CASE WHEN COALESCE(unit, 'm') = 'm' THEN 0.1 ELSE 0 END
            THEN 'depleted'
          ELSE 'in_stock'
        END
      WHERE id = v_roll.id;

      INSERT INTO public.inv_movements (
        roll_id, variant_id, movement_type, quantity, unit, rate, reference, note, performed_by
      )
      VALUES (
        v_roll.id, v_item.variant_id, 'outflow', v_needed, 'm', v_roll.purchase_rate,
        p_order_id::text, 'Order execution: fabric deducted', v_actor_id
      );

      IF v_waste.id IS NULL THEN
        INSERT INTO public.wastage_logs (
          order_id, order_item_id, variant_id, roll_id,
          cut_length_m, used_length_m, cut_width_m, used_width_m
        )
        VALUES (
          p_order_id, v_item.id, v_item.variant_id, v_roll.id,
          v_needed, v_needed,
          COALESCE(v_item.width_cm, 0) / 100,
          COALESCE(v_item.width_cm, 0) / 100
        );
      ELSE
        UPDATE public.wastage_logs
        SET
          roll_id = v_roll.id,
          cut_length_m = COALESCE(cut_length_m, v_needed),
          used_length_m = COALESCE(used_length_m, cut_length_m, v_needed)
        WHERE id = v_waste.id;
      END IF;

      UPDATE public.order_items
      SET fabric_deducted = true, roll_id = v_roll.id
      WHERE id = v_item.id;

      v_fabric_count := v_fabric_count + 1;
    ELSIF COALESCE(v_item.item_type, '') IN ('raw_material', 'resale')
          AND v_item.variant_id IS NOT NULL THEN
      v_needed := COALESCE(v_item.area_sqm, v_item.quantity, 0);
      v_remaining := v_needed;
      v_unit := CASE
        WHEN COALESCE(v_item.sale_unit, 'pcs') IN ('m', 'ft') THEN 'm'
        ELSE COALESCE(v_item.sale_unit, 'pcs')
      END;

      IF COALESCE(v_remaining, 0) <= 0 THEN
        CONTINUE;
      END IF;

      FOR v_roll IN
        SELECT *
        FROM public.inv_rolls
        WHERE variant_id = v_item.variant_id
          AND status = 'in_stock'
          AND COALESCE(remaining_length, 0) > 0
        ORDER BY remaining_length ASC, created_at ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_take := LEAST(v_remaining, COALESCE(v_roll.remaining_length, 0));

        UPDATE public.inv_rolls
        SET
          remaining_length = GREATEST(0, remaining_length - v_take),
          status = CASE
            WHEN GREATEST(0, remaining_length - v_take) <= CASE WHEN COALESCE(unit, 'pcs') = 'm' THEN 0.1 ELSE 0 END
              THEN 'depleted'
            ELSE 'in_stock'
          END
        WHERE id = v_roll.id;

        INSERT INTO public.inv_movements (
          roll_id, variant_id, movement_type, quantity, unit, rate, reference, note, performed_by
        )
        VALUES (
          v_roll.id, v_item.variant_id, 'outflow', v_take, v_unit, v_roll.purchase_rate,
          p_order_id::text, 'Order execution: raw material deducted', v_actor_id
        );

        v_remaining := v_remaining - v_take;
      END LOOP;

      IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Not enough stock to deduct raw material item %. Short by %.', v_item.id, v_remaining;
      END IF;

      UPDATE public.order_items
      SET fabric_deducted = true
      WHERE id = v_item.id;

      v_raw_count := v_raw_count + 1;
    END IF;
  END LOOP;

  FOR v_component IN
    SELECT *
    FROM public.order_components
    WHERE order_id = p_order_id
      AND COALESCE(deducted, false) = false
      AND variant_id IS NOT NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    v_needed := COALESCE(v_component.actual_qty, v_component.planned_qty, 0);
    v_remaining := CASE
      WHEN COALESCE(v_component.unit, 'pcs') = 'ft' THEN v_needed * 0.3048
      ELSE v_needed
    END;
    v_unit := CASE WHEN COALESCE(v_component.unit, 'pcs') = 'ft' THEN 'm' ELSE COALESCE(v_component.unit, 'pcs') END;

    IF COALESCE(v_remaining, 0) <= 0 THEN
      UPDATE public.order_components
      SET deducted = true, actual_qty = COALESCE(actual_qty, planned_qty)
      WHERE id = v_component.id;
      CONTINUE;
    END IF;

    FOR v_roll IN
      SELECT *
      FROM public.inv_rolls
      WHERE variant_id = v_component.variant_id
        AND status = 'in_stock'
        AND COALESCE(remaining_length, 0) > 0
      ORDER BY remaining_length ASC, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, COALESCE(v_roll.remaining_length, 0));

      UPDATE public.inv_rolls
      SET
        remaining_length = GREATEST(0, remaining_length - v_take),
        status = CASE
          WHEN GREATEST(0, remaining_length - v_take) <= CASE WHEN COALESCE(unit, 'pcs') = 'm' THEN 0.1 ELSE 0 END
            THEN 'depleted'
          ELSE 'in_stock'
        END
      WHERE id = v_roll.id;

      INSERT INTO public.inv_movements (
        roll_id, variant_id, movement_type, quantity, unit, rate, reference, note, performed_by
      )
      VALUES (
        v_roll.id, v_component.variant_id, 'outflow', v_take, v_unit, v_roll.purchase_rate,
        p_order_id::text, 'Order execution: component deducted', v_actor_id
      );

      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Not enough stock to deduct component %. Short by %.', v_component.id, v_remaining;
    END IF;

    UPDATE public.order_components
    SET deducted = true, actual_qty = COALESCE(actual_qty, planned_qty)
    WHERE id = v_component.id;

    v_component_count := v_component_count + 1;
  END LOOP;

  UPDATE public.orders
  SET
    status = 'executed',
    executed_by = v_actor_id,
    executed_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'fabric_items_deducted', v_fabric_count,
    'components_deducted', v_component_count,
    'raw_material_items_deducted', v_raw_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_order(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_order(UUID, UUID) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
