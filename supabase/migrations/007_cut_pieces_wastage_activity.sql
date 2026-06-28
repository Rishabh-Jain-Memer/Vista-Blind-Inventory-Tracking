-- Track fabric cut pieces created during execution and allow them to be used as inventory.

CREATE TABLE IF NOT EXISTS public.fabric_cut_pieces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_id UUID NOT NULL REFERENCES public.inv_variants(id) ON DELETE CASCADE,
  source_roll_id UUID REFERENCES public.inv_rolls(id) ON DELETE SET NULL,
  source_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  source_order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  source_wastage_log_id UUID,
  width_m NUMERIC NOT NULL CHECK (width_m > 0),
  length_m NUMERIC NOT NULL CHECK (length_m > 0),
  remaining_length_m NUMERIC NOT NULL CHECK (remaining_length_m >= 0),
  unit TEXT DEFAULT 'm' NOT NULL,
  status TEXT DEFAULT 'available' NOT NULL CHECK (status = ANY (ARRAY['available', 'depleted', 'scrapped'])),
  created_from TEXT DEFAULT 'side_trim' NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fabric_cut_pieces_variant ON public.fabric_cut_pieces(variant_id);
CREATE INDEX IF NOT EXISTS idx_fabric_cut_pieces_roll ON public.fabric_cut_pieces(source_roll_id);
CREATE INDEX IF NOT EXISTS idx_fabric_cut_pieces_order ON public.fabric_cut_pieces(source_order_id);
CREATE INDEX IF NOT EXISTS idx_fabric_cut_pieces_status ON public.fabric_cut_pieces(status);

ALTER TABLE public.wastage_logs
  ADD COLUMN IF NOT EXISTS source_piece_id UUID REFERENCES public.fabric_cut_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_piece_id UUID REFERENCES public.fabric_cut_pieces(id) ON DELETE SET NULL;

ALTER TABLE public.fabric_cut_pieces
  DROP CONSTRAINT IF EXISTS fabric_cut_pieces_source_wastage_log_id_fkey;
ALTER TABLE public.fabric_cut_pieces
  ADD CONSTRAINT fabric_cut_pieces_source_wastage_log_id_fkey
  FOREIGN KEY (source_wastage_log_id) REFERENCES public.wastage_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wastage_logs_source_piece ON public.wastage_logs(source_piece_id);
CREATE INDEX IF NOT EXISTS idx_wastage_logs_created_piece ON public.wastage_logs(created_piece_id);

ALTER TABLE public.fabric_cut_pieces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fabric_cut_pieces_select ON public.fabric_cut_pieces;
DROP POLICY IF EXISTS fabric_cut_pieces_insert ON public.fabric_cut_pieces;
DROP POLICY IF EXISTS fabric_cut_pieces_update ON public.fabric_cut_pieces;
DROP POLICY IF EXISTS fabric_cut_pieces_admin_delete ON public.fabric_cut_pieces;

CREATE POLICY fabric_cut_pieces_select ON public.fabric_cut_pieces
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY fabric_cut_pieces_insert ON public.fabric_cut_pieces
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_app_role() = ANY (ARRAY['admin', 'executer']));

CREATE POLICY fabric_cut_pieces_update ON public.fabric_cut_pieces
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (current_app_role() = ANY (ARRAY['admin', 'executer']))
  WITH CHECK (current_app_role() = ANY (ARRAY['admin', 'executer']));

CREATE POLICY fabric_cut_pieces_admin_delete ON public.fabric_cut_pieces
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (current_app_role() = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fabric_cut_pieces TO authenticated;
GRANT ALL ON public.fabric_cut_pieces TO service_role;

ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_action_type_check;
ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_entity_type_check;

CREATE OR REPLACE FUNCTION public.execute_order(p_order_id uuid, p_executor_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id UUID := COALESCE(p_executor_id, auth.uid());
  v_auth_id UUID := auth.uid();
  v_actor_role TEXT;
  v_actor_name TEXT;
  v_order RECORD;
  v_item RECORD;
  v_component RECORD;
  v_waste RECORD;
  v_roll RECORD;
  v_piece RECORD;
  v_remaining NUMERIC;
  v_take NUMERIC;
  v_needed NUMERIC;
  v_unit TEXT;
  v_roll_id UUID;
  v_source_piece_id UUID;
  v_source_roll_id UUID;
  v_cut_width NUMERIC;
  v_used_width NUMERIC;
  v_side_width NUMERIC;
  v_side_length NUMERIC;
  v_created_piece_id UUID;
  v_fabric_count INTEGER := 0;
  v_component_count INTEGER := 0;
  v_raw_count INTEGER := 0;
  v_cut_piece_count INTEGER := 0;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to execute an order.';
  END IF;

  SELECT role::text, COALESCE(full_name, email)
  INTO v_actor_role, v_actor_name
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
      'raw_material_items_deducted', 0,
      'cut_pieces_created', 0
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

      v_source_piece_id := v_waste.source_piece_id;
      v_source_roll_id := NULL;
      v_cut_width := COALESCE(v_waste.cut_width_m, COALESCE(v_item.width_cm, 0) / 100);
      v_used_width := COALESCE(v_waste.used_width_m, COALESCE(v_item.width_cm, 0) / 100, v_cut_width);

      IF v_source_piece_id IS NOT NULL THEN
        SELECT *
        INTO v_piece
        FROM public.fabric_cut_pieces
        WHERE id = v_source_piece_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Selected cut piece was not found for order item %.', v_item.id;
        END IF;

        IF v_piece.variant_id <> v_item.variant_id THEN
          RAISE EXCEPTION 'Selected cut piece does not match the fabric for order item %.', v_item.id;
        END IF;

        IF v_piece.status <> 'available' OR COALESCE(v_piece.remaining_length_m, 0) < v_needed THEN
          RAISE EXCEPTION 'Selected cut piece does not have enough remaining length for order item %.', v_item.id;
        END IF;

        v_cut_width := COALESCE(v_waste.cut_width_m, v_piece.width_m);
        v_used_width := COALESCE(v_waste.used_width_m, COALESCE(v_item.width_cm, 0) / 100, v_piece.width_m);

        IF v_piece.width_m + 0.0001 < v_used_width THEN
          RAISE EXCEPTION 'Selected cut piece is too narrow for order item %.', v_item.id;
        END IF;

        UPDATE public.fabric_cut_pieces
        SET
          remaining_length_m = GREATEST(0, remaining_length_m - v_needed),
          status = CASE WHEN GREATEST(0, remaining_length_m - v_needed) <= 0.001 THEN 'depleted' ELSE 'available' END,
          updated_at = now()
        WHERE id = v_piece.id;

        v_source_roll_id := v_piece.source_roll_id;

        INSERT INTO public.inv_movements (
          roll_id, variant_id, movement_type, quantity, unit, rate, reference, note, performed_by
        )
        VALUES (
          v_source_roll_id, v_item.variant_id, 'outflow', v_needed, 'm', NULL,
          p_order_id::text, 'Order execution: cut piece fabric deducted', v_actor_id
        );
      ELSE
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

        v_source_roll_id := v_roll.id;
        v_cut_width := COALESCE(v_waste.cut_width_m, v_cut_width, COALESCE(v_item.width_cm, 0) / 100);
        v_used_width := COALESCE(v_waste.used_width_m, v_used_width, COALESCE(v_item.width_cm, 0) / 100, v_cut_width);

        INSERT INTO public.inv_movements (
          roll_id, variant_id, movement_type, quantity, unit, rate, reference, note, performed_by
        )
        VALUES (
          v_roll.id, v_item.variant_id, 'outflow', v_needed, 'm', v_roll.purchase_rate,
          p_order_id::text, 'Order execution: fabric deducted', v_actor_id
        );
      END IF;

      IF v_waste.id IS NULL THEN
        INSERT INTO public.wastage_logs (
          order_id, order_item_id, variant_id, roll_id, source_piece_id,
          cut_length_m, used_length_m, cut_width_m, used_width_m, recorded_by
        )
        VALUES (
          p_order_id, v_item.id, v_item.variant_id, v_source_roll_id, v_source_piece_id,
          v_needed, v_needed, v_cut_width, v_used_width, v_actor_id
        )
        RETURNING * INTO v_waste;
      ELSE
        UPDATE public.wastage_logs
        SET
          roll_id = COALESCE(v_source_roll_id, roll_id),
          source_piece_id = v_source_piece_id,
          cut_length_m = COALESCE(cut_length_m, v_needed),
          used_length_m = COALESCE(used_length_m, cut_length_m, v_needed),
          cut_width_m = COALESCE(cut_width_m, v_cut_width),
          used_width_m = COALESCE(used_width_m, v_used_width),
          recorded_by = COALESCE(recorded_by, v_actor_id)
        WHERE id = v_waste.id
        RETURNING * INTO v_waste;
      END IF;

      v_side_width := GREATEST(COALESCE(v_waste.cut_width_m, 0) - COALESCE(v_waste.used_width_m, 0), 0);
      v_side_length := COALESCE(v_waste.used_length_m, v_needed);

      IF v_side_width > 0.001 AND v_side_length > 0.001 AND v_waste.created_piece_id IS NULL THEN
        INSERT INTO public.fabric_cut_pieces (
          variant_id, source_roll_id, source_order_id, source_order_item_id,
          source_wastage_log_id, width_m, length_m, remaining_length_m,
          created_from, notes, created_by
        )
        VALUES (
          v_item.variant_id, v_source_roll_id, p_order_id, v_item.id,
          v_waste.id, v_side_width, v_side_length, v_side_length,
          'side_trim',
          'Side cut piece created during order execution',
          v_actor_id
        )
        RETURNING id INTO v_created_piece_id;

        UPDATE public.wastage_logs
        SET created_piece_id = v_created_piece_id
        WHERE id = v_waste.id;

        INSERT INTO public.inv_movements (
          roll_id, variant_id, movement_type, quantity, unit, reference, note, performed_by
        )
        VALUES (
          v_source_roll_id, v_item.variant_id, 'cut_piece_created',
          v_side_width * v_side_length, 'sqm', p_order_id::text,
          'Cut piece created: ' || ROUND(v_side_width, 3)::text || 'm x ' || ROUND(v_side_length, 3)::text || 'm',
          v_actor_id
        );

        INSERT INTO public.activity_logs (
          user_id, user_name, action_type, entity_type, entity_id, entity_label, changes
        )
        VALUES (
          v_actor_id, v_actor_name, 'create', 'cut_piece', v_created_piece_id::text,
          ROUND(v_side_width, 3)::text || 'm x ' || ROUND(v_side_length, 3)::text || 'm',
          jsonb_build_object('order_id', p_order_id, 'order_item_id', v_item.id, 'variant_id', v_item.variant_id)
        );

        v_cut_piece_count := v_cut_piece_count + 1;
      END IF;

      UPDATE public.order_items
      SET fabric_deducted = true, roll_id = v_source_roll_id
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
    'raw_material_items_deducted', v_raw_count,
    'cut_pieces_created', v_cut_piece_count
  );
END;
$function$;
