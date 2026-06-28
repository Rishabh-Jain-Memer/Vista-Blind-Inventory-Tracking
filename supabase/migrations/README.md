# Supabase Migration Flow

This folder is the only SQL setup lane for the new Vista Blind clone.

Run these files manually in Supabase SQL Editor in order:

1. `001_new_project_empty_schema.sql`
2. Create the first Auth user in Supabase Dashboard.
3. `002_link_first_admin_profile.sql`
4. `003_master_nodes_structure.sql`
5. Optional test stock import: `004_import_inventory_inflow_stock.sql`
6. `005_import_new_rrp_2026.sql`
7. `006_import_excel_catalog_and_track_structures.sql`
8. `007_cut_pieces_wastage_activity.sql`
9. `008_fix_order_ticket_number_sequence.sql`
10. `009_roles_approval_workflow.sql`
11. `010_import_vista_inflow_rishi_masters.sql`
12. `011_app_level_username_auth.sql`
13. `012_master_page_app_session_permissions.sql`
14. `013_rrp_rule_engine.sql`
15. `014_mechanism_part_links.sql`
16. `015_mechanism_part_links_anon_permissions.sql`

CLI note: `supabase projects list` shows this checkout linked to `knawjdrsdqgyfzqzddix`, but direct DB commands currently hang without a remote DB URL/password. See `Context/SUPABASE_STATUS.md`. Until `VISTA_NEW_DB_URL` or the remote DB password is available, SQL Editor is the reliable path for applying migrations.

`001_new_project_empty_schema.sql` creates the empty app schema without importing old workbook data.
`002_link_first_admin_profile.sql` links the first Auth user to `public.profiles` as admin.
`003_master_nodes_structure.sql` adds `master_nodes` for main masters and nested sub masters, including `exclude_from_pnc_name` for labels that should be skipped later when final names are generated. It also adds separate mechanism tables:

- `master_pages`
- `mechanism_groups`
- `mechanism_options`
- `master_mechanism_groups`
- `master_inventory_sync_items`

The mechanism seed data is derived from `Excel File/Vista Dealer RRP April 2026.xlsx` and `Excel File/Vista Inventory Inflow New.xlsx` for labels such as headrail, cassette, mono mechanism, and laddertape mechanism.

The master seed also reads color/code structure from `Excel File/Vista Inventory Inflow New.xlsx` for Roller, Sheer Dimout, and S-Contour fabrics. These are added as nested sub masters under each fabric family with a skipped `Color` label, so generated names can include values like `551 White`, `CN-01 White`, or `SDAM-05` without including the literal word `Color`.

No stock quantities, purchase rates, rolls, or movements are imported by this file.

`004_import_inventory_inflow_stock.sql` imports only positive-quantity stock rows from `Excel File/Vista Inventory Inflow New.xlsx` into the current `inv_*` inventory tables. It is re-runnable: matching variant/batch rows are updated instead of duplicated.

`005_import_new_rrp_2026.sql` imports the May 2026 RRP PDF into `rrp_entries`: structured blind rates, automation, hospital/manual tracks, drapery rods, Soffio/Heritage rods, and wooden flooring. It adds source tracking columns to `rrp_entries`, stores extracted text for all 50 PDF pages in `rrp_source_pages`, and seeds related blind master/mechanism labels. RRP rates are stored in `price_map` so new products or mechanism columns can be added without changing the table shape.

`006_import_excel_catalog_and_track_structures.sql` reads the Excel workbook catalog sources, stores sheet audit snapshots, imports track and blind component recipes, creates missing component catalog variants without stock quantities, adds awning component RRP rows from `Add Stock Example.xlsx`, and seeds scalable master pages for tracks, awnings, rods, and flooring.

`007_cut_pieces_wastage_activity.sql` restores cut-piece wastage tracking and activity-log support.

`008_fix_order_ticket_number_sequence.sql` restores the ticket number sequence trigger.

`009_roles_approval_workflow.sql` adds the current four-role model (`admin`, `management`, `sales`, `executer`), the ticket states (`active`, `confirmed`, `cancelled`), quotation/order approval fields, management proforma approval RPC, stock/direct-order decision RPC, and Admin-only customer/profile write policies.

`010_import_vista_inflow_rishi_masters.sql` reads `Excel File/Vista-Inflow Data to Rishi.xlsx` and imports structure-only masters from the repeated RM/FG/inventory rows. It deduplicates fabric, parts, track, and motor labels into master pages such as Fabrics, Parts, Tracks, and Motors. It does not import stock quantities, purchase rates, rolls, movements, or RRP values.

`011_app_level_username_auth.sql` adds database-backed app login with `profiles.username`, password hashes, and `app_sessions`. The browser no longer depends on Supabase Auth sessions for login. It gives all roles full website visibility for now while keeping employee/customer/supplier profile creation and profile mutation gated to Admin in the UI/RPC flow.

`012_master_page_app_session_permissions.sql` opens the master/mechanism tables to the browser app's username/password session model while keeping writes behind the app-level admin role gate.

`013_rrp_rule_engine.sql` adds the scalable RRP layer: price books, inherited master-level RRP rules, and per-mechanism override/add-on prices. The old `rrp_entries` import remains as source/reference data; new quotations prefer these rules first and fall back to legacy RRP matching when no rule exists.

`014_mechanism_part_links.sql` adds `mechanism_part_links`, which lets each mechanism option link to inventory variants with scalable quantity rules (`fixed`, `per_blind`, `per_width_m`, `per_height_m`, and `per_area_sqm`). Create Order reads these links to plan `order_components` and include linked parts in order cost.

`015_mechanism_part_links_anon_permissions.sql` repairs browser permissions for `mechanism_part_links` after 014. The app-level login runs over the anon key, so this table needs anon grants and anon RLS policies, matching migration 012's master/mechanism table permissions.

The older import, cleanup, RRP, component, stock-refresh, and historical patch migrations were removed from this clone's active migration lane. Do not run old migrations into this new website database unless the owner explicitly asks to restore legacy data.
