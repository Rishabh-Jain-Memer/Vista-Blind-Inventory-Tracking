-- Allow the New clone's app-level username/password session model to manage masters.
-- The browser uses the anon key; current_app_role() is the app gate for this clone.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_nodes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mechanism_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mechanism_options TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_mechanism_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_inventory_sync_items TO anon;

DROP POLICY IF EXISTS master_nodes_read_public ON public.master_nodes;
CREATE POLICY master_nodes_read_public ON public.master_nodes
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS master_nodes_admin_write_public ON public.master_nodes;
CREATE POLICY master_nodes_admin_write_public ON public.master_nodes
  FOR ALL TO anon
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS master_pages_read_public ON public.master_pages;
CREATE POLICY master_pages_read_public ON public.master_pages
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS master_pages_admin_write_public ON public.master_pages;
CREATE POLICY master_pages_admin_write_public ON public.master_pages
  FOR ALL TO anon
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS mechanism_groups_read_public ON public.mechanism_groups;
CREATE POLICY mechanism_groups_read_public ON public.mechanism_groups
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS mechanism_groups_admin_write_public ON public.mechanism_groups;
CREATE POLICY mechanism_groups_admin_write_public ON public.mechanism_groups
  FOR ALL TO anon
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS mechanism_options_read_public ON public.mechanism_options;
CREATE POLICY mechanism_options_read_public ON public.mechanism_options
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS mechanism_options_admin_write_public ON public.mechanism_options;
CREATE POLICY mechanism_options_admin_write_public ON public.mechanism_options
  FOR ALL TO anon
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS master_mechanism_groups_read_public ON public.master_mechanism_groups;
CREATE POLICY master_mechanism_groups_read_public ON public.master_mechanism_groups
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS master_mechanism_groups_admin_write_public ON public.master_mechanism_groups;
CREATE POLICY master_mechanism_groups_admin_write_public ON public.master_mechanism_groups
  FOR ALL TO anon
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS master_inventory_sync_items_read_public ON public.master_inventory_sync_items;
CREATE POLICY master_inventory_sync_items_read_public ON public.master_inventory_sync_items
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS master_inventory_sync_items_admin_write_public ON public.master_inventory_sync_items;
CREATE POLICY master_inventory_sync_items_admin_write_public ON public.master_inventory_sync_items
  FOR ALL TO anon
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');
