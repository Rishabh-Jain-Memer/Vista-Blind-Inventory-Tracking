-- Migration 015: Browser app permissions for mechanism part links
-- The app-level username/password session uses the anon key, so mechanism
-- part links need the same anon grants/policies as the master mechanism tables.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mechanism_part_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mechanism_part_links TO authenticated;

DROP POLICY IF EXISTS mechanism_part_links_read_public ON public.mechanism_part_links;
CREATE POLICY mechanism_part_links_read_public ON public.mechanism_part_links
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS mechanism_part_links_admin_write_public ON public.mechanism_part_links;
CREATE POLICY mechanism_part_links_admin_write_public ON public.mechanism_part_links
  FOR ALL TO anon
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS mechanism_part_links_read ON public.mechanism_part_links;
CREATE POLICY mechanism_part_links_read ON public.mechanism_part_links
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS mechanism_part_links_admin_write ON public.mechanism_part_links;
CREATE POLICY mechanism_part_links_admin_write ON public.mechanism_part_links
  FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

NOTIFY pgrst, 'reload schema';

COMMIT;
