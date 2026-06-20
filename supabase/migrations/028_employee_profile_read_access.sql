BEGIN;

-- Tickets store creator, owner, and follow-up authors as profile UUIDs.
-- Employee roles need read access to staff profile rows so CRM ticket detail can
-- show names instead of unresolved UUIDs.
DROP POLICY IF EXISTS profiles_select ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.current_app_role() IN ('admin', 'sales', 'executer')
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
