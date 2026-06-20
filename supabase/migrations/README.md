# Supabase Migration Flow

This folder is now the only migration lane for the current app.

Run files manually in Supabase SQL Editor in this order:

1. `001_reset_rebuild_inventory_schema.sql`
2. `002_import_inventory_inflow_new.sql`
3. `003_disable_inventory_rls_for_app.sql`
4. `004_import_supporting_workbooks.sql`
5. `005_profiles_suppliers_support.sql`
6. `006_fix_profile_optional_fields_and_rls.sql`
7. `007_order_statuses_and_supplier_rls_repair.sql`
8. `008_order_executor_assignment.sql`
9. `009_refresh_recipe_catalog.sql`
10. `010_import_track_recipes.sql`
11. `011_rrp_catalog.sql`
12. `012_security_hardening.sql`
13. `013_product_codes.sql`
14. `014_order_invoice_details.sql`
15. `015_rrp_catalog_all_blinds.sql`
16. `016_repair_torrent_inventory_link_and_delete_cleanup.sql`
17. `017_order_decimal_quantities_and_rollback_dedupe.sql`
18. `018_cleanup_failed_order_headers.sql`
19. `019_execute_order_rpc_and_executor_wastage_update.sql`
20. `020_order_item_input_measurements.sql`
21. `021_import_vertical_blinds_stock.sql`
22. `022_refresh_vertical_blinds_stock_rates.sql`
23. `023_order_tickets.sql`
24. `024_order_tickets_all_roles.sql`
25. `025_order_ticket_inquiry_followups.sql`
26. `026_sales_order_read_access.sql`
27. `027_sales_order_update_access.sql`
28. `028_employee_profile_read_access.sql`
29. `029_ticket_sequential_numbering.sql`
30. `030_sales_order_item_edit_access.sql`
31. `031_ticket_inquiry_date_default.sql`
32. `032_ticket_plain_sequential_uid.sql`
33. `033_order_quote_forms_and_downloads.sql`
34. `034_stock_orders_and_downloads.sql`
35. `035_clean_app_data_framework.sql`

The previous historical migrations were removed from the working tree because they mixed older schemas, old Excel imports, and partial fixes. Keeping one clean flow avoids errors such as missing `inv_rolls`, missing `normalized_name`, duplicate `batch_code`, and double-counted inventory.

Migration `012` is the deployment hardening pass. It removes anonymous table grants and re-enables RLS for the app's active tables. Migration `013` adds the product-code catalog imported from `Excel File/Product Codes.xlsx`. Migration `021` imports `Excel File/Vertical Blinds Stock.xlsx` into the current inventory hierarchy without resetting existing stock. Migration `022` refreshes the complete vertical blind stock/rate set from the updated workbook while preserving already-consumed quantities on existing imported rolls. Migration `023` adds pre-order tickets that can be converted through the normal Create Order flow. Migration `024` opens ticket read/write policies to all authenticated employee roles so Tickets can be a shared sidebar tab. Migration `025` adds spreadsheet-style inquiry fields and immutable follow-up history for tickets. Migration `026` lets sales users read every order and its line/component detail. Migration `027` lets sales maintain shared order flow fields across all orders while delete access remains admin-only. Migration `028` lets employee roles read staff profile display rows so ticket creator, owner, and follow-up names resolve instead of showing profile UUIDs. Migration `029` replaces random ticket IDs with sequence-backed IDs in `TKT-NNNNDDMMYY` format and backfills existing tickets by creation order. Migration `030` lets sales users edit order line items/components on shared open orders. Migration `031` reasserts the database default for ticket inquiry dates so the UI can keep the date field hidden while inserts stay stable. Migration `032` changes ticket IDs to plain sequence numbers such as `0001`, `0002`, and backfills existing tickets in creation order. Migration `033` adds editable order quote/proforma defaults and generated quote download history. Migration `034` adds pending stock orders, stock order items, and stock order download history so Create Purchase Order can create a supplier order first and receive inventory later. Migration `035` clears public app data for a clean structural framework while preserving schema, RLS, functions, triggers, Supabase Auth users, and profiles by default.
