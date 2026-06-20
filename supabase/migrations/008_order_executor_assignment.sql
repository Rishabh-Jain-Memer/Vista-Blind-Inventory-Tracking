BEGIN;

ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS assigned_executor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS executed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_assigned_executor_id ON public.orders(assigned_executor_id);
CREATE INDEX IF NOT EXISTS idx_orders_executed_by ON public.orders(executed_by);
CREATE INDEX IF NOT EXISTS idx_orders_status_assigned_executor_id ON public.orders(status, assigned_executor_id);

COMMIT;
