-- Empty schema bootstrap for the isolated Vista Blind Supabase project.
-- Target project: knawjdrsdqgyfzqzddix.
-- Creates tables, functions, triggers, and policies only. It inserts no fabric, inventory, customer, order, RRP, or recipe data.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

DO $$ BEGIN CREATE TYPE public."inventory_movement_type" AS ENUM ('inward', 'sale', 'adjustment', 'import_opening'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."inventory_unit" AS ENUM ('m', 'pcs', 'set', 'nos', 'sqm', 'sqft', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."order_item_inventory_action" AS ENUM ('deducted', 'snapshot_only', 'not_applicable'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."order_source" AS ENUM ('manual', 'excel_outflow', 'excel_inquiry'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."order_status" AS ENUM ('Pending', 'Processing', 'Completed', 'Cancelled', 'Discussing', 'Executed', 'inquiry', 'processing', 'executed', 'completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."user_role" AS ENUM ('admin', 'staff', 'customer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS public.order_ticket_number_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

CREATE TABLE public."activity_logs" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "user_id" UUID,
  "user_name" TEXT,
  "action_type" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "entity_label" TEXT,
  "changes" JSONB,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."blind_recipes" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "blind_type" TEXT NOT NULL,
  "component_name" TEXT NOT NULL,
  "quantity_per_unit" NUMERIC DEFAULT 1 NOT NULL,
  "is_width_dependent" BOOLEAN DEFAULT false NOT NULL,
  "sort_order" INTEGER DEFAULT 0 NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."customers" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "source_system" TEXT DEFAULT 'excel'::text,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "phone2" TEXT,
  "city" TEXT,
  "state" TEXT,
  "pincode" TEXT,
  "gstin" TEXT,
  "notes" TEXT,
  "created_by" UUID,
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "contact_person" TEXT
);

CREATE TABLE public."cut_logs" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "roll_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "cut_length_m" NUMERIC NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."excel_import_row_errors" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "import_run_id" UUID NOT NULL,
  "sheet_name" TEXT NOT NULL,
  "row_number" INTEGER,
  "severity" TEXT DEFAULT 'error'::text NOT NULL,
  "message" TEXT NOT NULL,
  "row_data" JSONB,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."excel_import_runs" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "workbook_name" TEXT NOT NULL,
  "workbook_hash" TEXT,
  "started_at" TIMESTAMPTZ DEFAULT now(),
  "finished_at" TIMESTAMPTZ,
  "status" TEXT DEFAULT 'running'::text NOT NULL,
  "summary" JSONB DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public."execution_logs" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "order_id" UUID NOT NULL,
  "executed_by" UUID,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."fg_stock" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "purchase_date" DATE,
  "purchase_cost" NUMERIC,
  "quantity" NUMERIC DEFAULT 0 NOT NULL,
  "unit" TEXT DEFAULT 'pcs'::text NOT NULL,
  "notes" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public."inv_categories" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "sub_group" TEXT DEFAULT 'Parts'::text,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."inv_items" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "category_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT DEFAULT 'pcs'::text NOT NULL,
  "purchase_rate" NUMERIC,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "width_m" NUMERIC,
  "fabric_type" TEXT
);

CREATE TABLE public."inv_movements" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "roll_id" UUID,
  "variant_id" UUID,
  "movement_type" TEXT NOT NULL,
  "quantity" NUMERIC DEFAULT 0 NOT NULL,
  "unit" TEXT,
  "rate" NUMERIC,
  "reference" TEXT,
  "note" TEXT,
  "performed_by" UUID,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."inv_products" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "category_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."inv_rolls" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "variant_id" UUID NOT NULL,
  "batch_code" TEXT NOT NULL,
  "original_length" NUMERIC DEFAULT 0 NOT NULL,
  "remaining_length" NUMERIC DEFAULT 0 NOT NULL,
  "unit" TEXT DEFAULT 'm'::text NOT NULL,
  "purchase_rate" NUMERIC,
  "status" TEXT DEFAULT 'in_stock'::text NOT NULL,
  "inward_date" DATE,
  "bill_no" TEXT,
  "supplier" TEXT,
  "stock_value" NUMERIC,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."inv_stock_entries" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "item_id" UUID NOT NULL,
  "quantity" NUMERIC NOT NULL,
  "remaining" NUMERIC NOT NULL,
  "batch_code" TEXT,
  "inward_date" DATE DEFAULT CURRENT_DATE,
  "bill_no" TEXT,
  "supplier" TEXT,
  "purchase_rate" NUMERIC,
  "notes" TEXT,
  "status" TEXT DEFAULT 'in_stock'::text NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."inv_variants" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "product_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "width_m" NUMERIC,
  "unit" TEXT DEFAULT 'pcs'::text NOT NULL,
  "purchase_rate" NUMERIC,
  "base_rate_sqm" NUMERIC,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."inventory_movements" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "sku_id" UUID NOT NULL,
  "roll_id" UUID,
  "movement_type" public."inventory_movement_type" NOT NULL,
  "quantity_delta" NUMERIC NOT NULL,
  "balance_after" NUMERIC NOT NULL,
  "unit" public."inventory_unit" NOT NULL,
  "unit_rate" NUMERIC,
  "total_value" NUMERIC,
  "source_sheet" TEXT,
  "source_row" INTEGER,
  "source_ref" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."material_categories" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."materials" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "category_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT,
  "fixed_width_m" NUMERIC NOT NULL,
  "base_rate_sqm" NUMERIC NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "sku_id" UUID,
  "purchase_rate_m" NUMERIC,
  "sale_rate_sqm" NUMERIC,
  "source_product_name" TEXT,
  "source_stock_category" TEXT
);

CREATE TABLE public."order_components" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "order_id" UUID NOT NULL,
  "order_item_id" UUID,
  "variant_id" UUID,
  "planned_qty" NUMERIC DEFAULT 0 NOT NULL,
  "actual_qty" NUMERIC,
  "extra_qty" NUMERIC DEFAULT 0,
  "unit" TEXT DEFAULT 'pcs'::text NOT NULL,
  "is_width_dependent" BOOLEAN DEFAULT false,
  "is_extra" BOOLEAN DEFAULT false,
  "deducted" BOOLEAN DEFAULT false,
  "notes" TEXT,
  "added_by" UUID,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "component_name" TEXT
);

CREATE TABLE public."order_items" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "order_id" UUID NOT NULL,
  "material_id" UUID,
  "width_cm" NUMERIC,
  "height_cm" NUMERIC,
  "area_sqm" NUMERIC NOT NULL,
  "quantity" NUMERIC DEFAULT 1 NOT NULL,
  "rate_applied" NUMERIC NOT NULL,
  "line_total" NUMERIC NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "sku_id" UUID,
  "product_name" TEXT,
  "location" TEXT,
  "unit" public."inventory_unit",
  "actual_width_cm" NUMERIC,
  "actual_height_cm" NUMERIC,
  "actual_area_sqm" NUMERIC,
  "chargeable_width_cm" NUMERIC,
  "chargeable_height_cm" NUMERIC,
  "chargeable_sqft" NUMERIC,
  "source_sheet" TEXT,
  "source_row" INTEGER,
  "inventory_action" public."order_item_inventory_action" DEFAULT 'deducted'::order_item_inventory_action NOT NULL,
  "needs_review" BOOLEAN DEFAULT false NOT NULL,
  "review_reason" TEXT,
  "variant_id" UUID,
  "item_type" TEXT DEFAULT 'finished_goods'::text,
  "sale_unit" TEXT,
  "fabric_deducted" BOOLEAN DEFAULT false,
  "blind_type" TEXT,
  "roll_id" UUID,
  "fg_stock_id" UUID,
  "product_code_id" UUID,
  "input_width_raw" NUMERIC,
  "input_width_unit" TEXT,
  "input_height_raw" NUMERIC,
  "input_height_unit" TEXT,
  "input_length_raw" NUMERIC,
  "input_length_unit" TEXT,
  "input_length_ft" NUMERIC,
  "chargeable_length_ft" NUMERIC
);

CREATE TABLE public."order_quote_downloads" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "order_id" UUID NOT NULL,
  "quote_no" TEXT,
  "document_type" TEXT DEFAULT 'quote'::text NOT NULL,
  "form_data" JSONB DEFAULT '{}'::jsonb NOT NULL,
  "html" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "created_by" UUID
);

CREATE TABLE public."order_quote_forms" (
  "order_id" UUID NOT NULL,
  "form_data" JSONB DEFAULT '{}'::jsonb NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_by" UUID
);

CREATE TABLE public."order_ticket_followups" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" UUID NOT NULL,
  "status" TEXT DEFAULT 'followup'::text NOT NULL,
  "remarks" TEXT NOT NULL,
  "remark_by" UUID,
  "follow_up_date" DATE,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public."order_tickets" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "ticket_uid" TEXT NOT NULL,
  "cust_id" UUID,
  "created_by" UUID,
  "converted_order_id" UUID,
  "status" TEXT DEFAULT 'open'::text NOT NULL,
  "requirement_notes" TEXT NOT NULL,
  "follow_up_at" TIMESTAMPTZ,
  "converted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "inquiry_date" DATE DEFAULT CURRENT_DATE NOT NULL,
  "customer_name" TEXT,
  "customer_mobile" TEXT,
  "inquiry_for" TEXT,
  "location" TEXT,
  "allocated_to" UUID
);

CREATE TABLE public."orders" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" UUID,
  "dealer_name" TEXT,
  "status" public."order_status" DEFAULT 'Pending'::order_status,
  "total_amount" NUMERIC DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "customer_name" TEXT,
  "source" public."order_source" DEFAULT 'manual'::order_source NOT NULL,
  "source_order_no" TEXT,
  "source_bill_no" TEXT,
  "order_date" DATE,
  "imported_at" TIMESTAMPTZ,
  "notes" TEXT,
  "cust_id" UUID,
  "order_uid" TEXT,
  "deleted_at" TIMESTAMPTZ,
  "cost_amount" NUMERIC DEFAULT 0,
  "assigned_executor_id" UUID,
  "assigned_at" TIMESTAMPTZ,
  "assigned_by" UUID,
  "executed_by" UUID,
  "executed_at" TIMESTAMPTZ,
  "invoice_number" TEXT,
  "invoice_date" DATE
);

CREATE TABLE public."pricing_rules" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "category_id" UUID,
  "material_id" UUID,
  "sku_id" UUID,
  "product_name" TEXT,
  "product_type" TEXT,
  "rate_basis" TEXT NOT NULL,
  "rrp" NUMERIC,
  "discount_pct" NUMERIC DEFAULT 0,
  "net_rate" NUMERIC,
  "gst_rate" NUMERIC,
  "effective_from" DATE,
  "source_sheet" TEXT,
  "source_row" INTEGER,
  "formula_note" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."product_codes" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "stock_category" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "normalized_code" TEXT NOT NULL,
  "is_active" BOOLEAN DEFAULT true NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public."product_recipes" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "blind_type" TEXT NOT NULL,
  "is_active" BOOLEAN DEFAULT true NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "name" TEXT,
  "description" TEXT
);

CREATE TABLE public."profiles" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT DEFAULT 'staff'::text NOT NULL,
  "full_name" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."recipe_items" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "recipe_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "quantity_per_unit" NUMERIC DEFAULT 1 NOT NULL,
  "is_width_dependent" BOOLEAN DEFAULT false NOT NULL,
  "notes" TEXT,
  "sort_order" INTEGER DEFAULT 0,
  "component_name" TEXT
);

CREATE TABLE public."rolls" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "material_id" UUID NOT NULL,
  "batch_number" TEXT NOT NULL,
  "initial_length_m" NUMERIC NOT NULL,
  "remaining_length_m" NUMERIC NOT NULL,
  "status" TEXT DEFAULT 'In Stock'::text,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "sku_id" UUID,
  "source_bill_no" TEXT,
  "purchase_rate_m" NUMERIC,
  "stock_value" NUMERIC,
  "received_at" DATE
);

CREATE TABLE public."rrp_entries" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "blind_type" TEXT NOT NULL,
  "fabric_group" TEXT NOT NULL,
  "fabric_name" TEXT NOT NULL,
  "width_max" TEXT,
  "uom" TEXT DEFAULT 'SQM'::text NOT NULL,
  "rrp_wo_headrail" NUMERIC,
  "rrp_w_headrail" NUMERIC,
  "rrp_w_plain_cassette" NUMERIC,
  "rrp_w_dec_cassette" NUMERIC,
  "sort_order" INTEGER DEFAULT 0 NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "price_map" JSONB DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public."skus" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "category_id" UUID,
  "sku_code" TEXT,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "sku_kind" TEXT DEFAULT 'generic'::text NOT NULL,
  "inventory_unit" public."inventory_unit" DEFAULT 'other'::inventory_unit NOT NULL,
  "hsn_code" TEXT,
  "gst_rate" NUMERIC,
  "purchase_rate" NUMERIC,
  "sale_rate" NUMERIC,
  "current_quantity" NUMERIC DEFAULT 0 NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public."stock_order_downloads" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "stock_order_id" UUID NOT NULL,
  "document_type" TEXT DEFAULT 'stock_order'::text NOT NULL,
  "form_data" JSONB DEFAULT '{}'::jsonb NOT NULL,
  "html" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public."stock_order_items" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "stock_order_id" UUID NOT NULL,
  "line_no" INTEGER NOT NULL,
  "item_type" TEXT DEFAULT 'Fabric'::text NOT NULL,
  "category_id" UUID,
  "category_name" TEXT,
  "variant_id" UUID,
  "variant_name" TEXT NOT NULL,
  "batch_code" TEXT,
  "quantity" NUMERIC DEFAULT 0 NOT NULL,
  "unit" TEXT DEFAULT 'm'::text NOT NULL,
  "rate" NUMERIC DEFAULT 0 NOT NULL,
  "width_m" NUMERIC,
  "line_total" NUMERIC DEFAULT 0 NOT NULL,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public."stock_orders" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "stock_order_uid" TEXT NOT NULL,
  "supplier_id" UUID,
  "supplier_name" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending'::text NOT NULL,
  "bill_no" TEXT,
  "bill_date" DATE,
  "notes" TEXT,
  "order_form_data" JSONB DEFAULT '{}'::jsonb NOT NULL,
  "total_amount" NUMERIC DEFAULT 0 NOT NULL,
  "created_by" UUID,
  "received_at" TIMESTAMPTZ,
  "received_by" UUID,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "deleted_at" TIMESTAMPTZ
);

CREATE TABLE public."suppliers" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "name" TEXT NOT NULL,
  "contact_person" TEXT,
  "phone" TEXT,
  "phone2" TEXT,
  "email" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "gstin" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public."wastage_logs" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "order_id" UUID NOT NULL,
  "order_item_id" UUID,
  "variant_id" UUID NOT NULL,
  "roll_id" UUID,
  "cut_length_m" NUMERIC NOT NULL,
  "used_length_m" NUMERIC NOT NULL,
  "waste_length_m" NUMERIC GENERATED ALWAYS AS ((cut_length_m - used_length_m)) STORED,
  "cut_width_m" NUMERIC,
  "used_width_m" NUMERIC,
  "waste_width_m" NUMERIC GENERATED ALWAYS AS (GREATEST((cut_width_m - used_width_m), (0)::numeric)) STORED,
  "waste_area_sqm" NUMERIC GENERATED ALWAYS AS (CASE WHEN ((cut_width_m IS NOT NULL) AND (used_width_m IS NOT NULL)) THEN (((cut_length_m - used_length_m) * cut_width_m) + (used_length_m * GREATEST((cut_width_m - used_width_m), (0)::numeric))) ELSE ((cut_length_m - used_length_m) * COALESCE(cut_width_m, (0)::numeric)) END) STORED,
  "notes" TEXT,
  "recorded_by" UUID,
  "created_at" TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public."activity_logs" ADD CONSTRAINT "activity_logs_action_type_check" CHECK (action_type = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'status_change'::text, 'stock_adjust'::text, 'stock_receive'::text]));
ALTER TABLE public."activity_logs" ADD CONSTRAINT "activity_logs_entity_type_check" CHECK (entity_type = ANY (ARRAY['order'::text, 'order_item'::text, 'sku'::text, 'roll'::text, 'material'::text, 'category'::text, 'recipe'::text, 'recipe_item'::text]));
ALTER TABLE public."activity_logs" ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."blind_recipes" ADD CONSTRAINT "blind_recipes_pkey" PRIMARY KEY (id);
ALTER TABLE public."customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);
ALTER TABLE public."cut_logs" ADD CONSTRAINT "cut_logs_cut_length_m_check" CHECK (cut_length_m > 0::numeric);
ALTER TABLE public."cut_logs" ADD CONSTRAINT "cut_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."excel_import_row_errors" ADD CONSTRAINT "excel_import_row_errors_pkey" PRIMARY KEY (id);
ALTER TABLE public."excel_import_row_errors" ADD CONSTRAINT "excel_import_row_errors_severity_check" CHECK (severity = ANY (ARRAY['warning'::text, 'error'::text]));
ALTER TABLE public."excel_import_runs" ADD CONSTRAINT "excel_import_runs_pkey" PRIMARY KEY (id);
ALTER TABLE public."excel_import_runs" ADD CONSTRAINT "excel_import_runs_status_check" CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'completed_with_errors'::text, 'failed'::text]));
ALTER TABLE public."execution_logs" ADD CONSTRAINT "execution_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."fg_stock" ADD CONSTRAINT "fg_stock_pkey" PRIMARY KEY (id);
ALTER TABLE public."inv_categories" ADD CONSTRAINT "inv_categories_pkey" PRIMARY KEY (id);
ALTER TABLE public."inv_items" ADD CONSTRAINT "inv_items_category_id_name_key" UNIQUE (category_id, name);
ALTER TABLE public."inv_items" ADD CONSTRAINT "inv_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."inv_movements" ADD CONSTRAINT "inv_movements_pkey" PRIMARY KEY (id);
ALTER TABLE public."inv_products" ADD CONSTRAINT "inv_products_pkey" PRIMARY KEY (id);
ALTER TABLE public."inv_rolls" ADD CONSTRAINT "inv_rolls_pkey" PRIMARY KEY (id);
ALTER TABLE public."inv_stock_entries" ADD CONSTRAINT "inv_stock_entries_pkey" PRIMARY KEY (id);
ALTER TABLE public."inv_stock_entries" ADD CONSTRAINT "inv_stock_entries_quantity_check" CHECK (quantity > 0::numeric);
ALTER TABLE public."inv_stock_entries" ADD CONSTRAINT "inv_stock_entries_status_check" CHECK (status = ANY (ARRAY['in_stock'::text, 'depleted'::text]));
ALTER TABLE public."inv_variants" ADD CONSTRAINT "inv_variants_pkey" PRIMARY KEY (id);
ALTER TABLE public."inventory_movements" ADD CONSTRAINT "inventory_movements_balance_after_check" CHECK (balance_after >= 0::numeric);
ALTER TABLE public."inventory_movements" ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY (id);
ALTER TABLE public."inventory_movements" ADD CONSTRAINT "inventory_movements_unit_rate_check" CHECK (unit_rate IS NULL OR unit_rate >= 0::numeric);
ALTER TABLE public."material_categories" ADD CONSTRAINT "material_categories_name_key" UNIQUE (name);
ALTER TABLE public."material_categories" ADD CONSTRAINT "material_categories_pkey" PRIMARY KEY (id);
ALTER TABLE public."materials" ADD CONSTRAINT "materials_pkey" PRIMARY KEY (id);
ALTER TABLE public."materials" ADD CONSTRAINT "materials_purchase_rate_m_check" CHECK (purchase_rate_m IS NULL OR purchase_rate_m >= 0::numeric);
ALTER TABLE public."materials" ADD CONSTRAINT "materials_sale_rate_sqm_check" CHECK (sale_rate_sqm IS NULL OR sale_rate_sqm >= 0::numeric);
ALTER TABLE public."order_components" ADD CONSTRAINT "order_components_pkey" PRIMARY KEY (id);
ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_has_item" CHECK (material_id IS NOT NULL OR sku_id IS NOT NULL OR variant_id IS NOT NULL OR item_type = 'track'::text);
ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK (quantity > 0::numeric);
ALTER TABLE public."order_quote_downloads" ADD CONSTRAINT "order_quote_downloads_pkey" PRIMARY KEY (id);
ALTER TABLE public."order_quote_forms" ADD CONSTRAINT "order_quote_forms_pkey" PRIMARY KEY (order_id);
ALTER TABLE public."order_ticket_followups" ADD CONSTRAINT "order_ticket_followups_pkey" PRIMARY KEY (id);
ALTER TABLE public."order_ticket_followups" ADD CONSTRAINT "order_ticket_followups_status_check" CHECK (status = ANY (ARRAY['followup'::text, 'order_confirmed'::text, 'cancelled'::text]));
ALTER TABLE public."order_tickets" ADD CONSTRAINT "order_tickets_pkey" PRIMARY KEY (id);
ALTER TABLE public."order_tickets" ADD CONSTRAINT "order_tickets_status_check" CHECK (status = ANY (ARRAY['open'::text, 'followup'::text, 'order_confirmed'::text, 'converted'::text, 'cancelled'::text]));
ALTER TABLE public."orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY (id);
ALTER TABLE public."pricing_rules" ADD CONSTRAINT "pricing_rules_discount_pct_check" CHECK (discount_pct >= 0::numeric);
ALTER TABLE public."pricing_rules" ADD CONSTRAINT "pricing_rules_net_rate_check" CHECK (net_rate IS NULL OR net_rate >= 0::numeric);
ALTER TABLE public."pricing_rules" ADD CONSTRAINT "pricing_rules_pkey" PRIMARY KEY (id);
ALTER TABLE public."pricing_rules" ADD CONSTRAINT "pricing_rules_rate_basis_check" CHECK (rate_basis = ANY (ARRAY['sqm'::text, 'sqft'::text, 'piece'::text, 'blind'::text, 'meter'::text, 'set'::text]));
ALTER TABLE public."pricing_rules" ADD CONSTRAINT "pricing_rules_rrp_check" CHECK (rrp IS NULL OR rrp >= 0::numeric);
ALTER TABLE public."product_codes" ADD CONSTRAINT "product_codes_pkey" PRIMARY KEY (id);
ALTER TABLE public."product_recipes" ADD CONSTRAINT "product_recipes_blind_type_key" UNIQUE (blind_type);
ALTER TABLE public."product_recipes" ADD CONSTRAINT "product_recipes_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_email_key" UNIQUE (email);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'staff'::text, 'executer'::text, 'sales'::text, 'customer'::text]));
ALTER TABLE public."recipe_items" ADD CONSTRAINT "recipe_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."rolls" ADD CONSTRAINT "rolls_batch_number_key" UNIQUE (batch_number);
ALTER TABLE public."rolls" ADD CONSTRAINT "rolls_initial_length_m_check" CHECK (initial_length_m > 0::numeric);
ALTER TABLE public."rolls" ADD CONSTRAINT "rolls_pkey" PRIMARY KEY (id);
ALTER TABLE public."rolls" ADD CONSTRAINT "rolls_purchase_rate_m_check" CHECK (purchase_rate_m IS NULL OR purchase_rate_m >= 0::numeric);
ALTER TABLE public."rolls" ADD CONSTRAINT "rolls_remaining_length_m_check" CHECK (remaining_length_m >= 0::numeric);
ALTER TABLE public."rolls" ADD CONSTRAINT "rolls_status_check" CHECK (status = ANY (ARRAY['In Stock'::text, 'Depleted'::text]));
ALTER TABLE public."rolls" ADD CONSTRAINT "rolls_stock_value_check" CHECK (stock_value IS NULL OR stock_value >= 0::numeric);
ALTER TABLE public."rrp_entries" ADD CONSTRAINT "rrp_entries_pkey" PRIMARY KEY (id);
ALTER TABLE public."skus" ADD CONSTRAINT "skus_current_quantity_check" CHECK (current_quantity >= 0::numeric);
ALTER TABLE public."skus" ADD CONSTRAINT "skus_normalized_name_inventory_unit_key" UNIQUE (normalized_name, inventory_unit);
ALTER TABLE public."skus" ADD CONSTRAINT "skus_pkey" PRIMARY KEY (id);
ALTER TABLE public."skus" ADD CONSTRAINT "skus_purchase_rate_check" CHECK (purchase_rate IS NULL OR purchase_rate >= 0::numeric);
ALTER TABLE public."skus" ADD CONSTRAINT "skus_sale_rate_check" CHECK (sale_rate IS NULL OR sale_rate >= 0::numeric);
ALTER TABLE public."skus" ADD CONSTRAINT "skus_sku_code_key" UNIQUE (sku_code);
ALTER TABLE public."skus" ADD CONSTRAINT "skus_sku_kind_check" CHECK (sku_kind = ANY (ARRAY['fabric'::text, 'part'::text, 'track'::text, 'motor'::text, 'service'::text, 'generic'::text]));
ALTER TABLE public."stock_order_downloads" ADD CONSTRAINT "stock_order_downloads_pkey" PRIMARY KEY (id);
ALTER TABLE public."stock_order_items" ADD CONSTRAINT "stock_order_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."stock_orders" ADD CONSTRAINT "stock_orders_pkey" PRIMARY KEY (id);
ALTER TABLE public."stock_orders" ADD CONSTRAINT "stock_orders_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'received'::text, 'cancelled'::text]));
ALTER TABLE public."stock_orders" ADD CONSTRAINT "stock_orders_stock_order_uid_key" UNIQUE (stock_order_uid);
ALTER TABLE public."suppliers" ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY (id);
ALTER TABLE public."wastage_logs" ADD CONSTRAINT "wastage_logs_pkey" PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS fg_stock_code_key ON public.fg_stock USING btree (lower(code));
CREATE UNIQUE INDEX IF NOT EXISTS inv_categories_normalized_name_key ON public.inv_categories USING btree (normalized_name);
CREATE UNIQUE INDEX IF NOT EXISTS inv_products_category_id_normalized_name_key ON public.inv_products USING btree (category_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_inv_rolls_batch_code ON public.inv_rolls USING btree (batch_code);
CREATE UNIQUE INDEX IF NOT EXISTS inv_variants_product_id_normalized_name_key ON public.inv_variants USING btree (product_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku ON public.inventory_movements USING btree (sku_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_source ON public.inventory_movements USING btree (source_sheet, source_row);
CREATE UNIQUE INDEX IF NOT EXISTS materials_sku_id_unique_all ON public.materials USING btree (sku_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON public.order_items USING btree (sku_id);
CREATE INDEX IF NOT EXISTS idx_order_items_source ON public.order_items USING btree (source_sheet, source_row);
CREATE INDEX IF NOT EXISTS idx_order_quote_downloads_order_created ON public.order_quote_downloads USING btree (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_ticket_followups_ticket_created ON public.order_ticket_followups USING btree (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_tickets_allocated_to ON public.order_tickets USING btree (allocated_to);
CREATE INDEX IF NOT EXISTS idx_order_tickets_converted_order_id ON public.order_tickets USING btree (converted_order_id);
CREATE INDEX IF NOT EXISTS idx_order_tickets_created_by ON public.order_tickets USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_order_tickets_cust_id ON public.order_tickets USING btree (cust_id);
CREATE INDEX IF NOT EXISTS idx_order_tickets_inquiry_date ON public.order_tickets USING btree (inquiry_date DESC);
CREATE INDEX IF NOT EXISTS idx_order_tickets_status_created_at ON public.order_tickets USING btree (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS order_tickets_ticket_uid_key ON public.order_tickets USING btree (ticket_uid);
CREATE INDEX IF NOT EXISTS idx_orders_active ON public.orders USING btree (created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_executor_id ON public.orders USING btree (assigned_executor_id);
CREATE INDEX IF NOT EXISTS idx_orders_executed_by ON public.orders USING btree (executed_by);
CREATE INDEX IF NOT EXISTS idx_orders_source ON public.orders USING btree (source, source_order_no, source_bill_no);
CREATE INDEX IF NOT EXISTS idx_orders_status_assigned_executor_id ON public.orders USING btree (status, assigned_executor_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_codes_normalized_code_key ON public.product_codes USING btree (normalized_code);
CREATE INDEX IF NOT EXISTS idx_rolls_sku ON public.rolls USING btree (sku_id);
CREATE UNIQUE INDEX IF NOT EXISTS rrp_entries_blind_type_group_fabric_key ON public.rrp_entries USING btree (blind_type, fabric_group, fabric_name);
CREATE INDEX IF NOT EXISTS idx_skus_category ON public.skus USING btree (category_id);
CREATE INDEX IF NOT EXISTS idx_skus_kind ON public.skus USING btree (sku_kind);
CREATE INDEX IF NOT EXISTS idx_skus_normalized_name ON public.skus USING btree (normalized_name);
CREATE INDEX IF NOT EXISTS idx_stock_order_downloads_order ON public.stock_order_downloads USING btree (stock_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_order_items_order ON public.stock_order_items USING btree (stock_order_id, line_no);
CREATE INDEX IF NOT EXISTS idx_stock_orders_created_at ON public.stock_orders USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_orders_status ON public.stock_orders USING btree (status);
CREATE INDEX IF NOT EXISTS idx_suppliers_gstin ON public.suppliers USING btree (gstin);
CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON public.suppliers USING btree (phone);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_key ON public.suppliers USING btree (lower(name));

CREATE OR REPLACE FUNCTION public.current_app_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

  SELECT role::text

  FROM public.profiles

  WHERE id = auth.uid()

  LIMIT 1

$function$;

CREATE OR REPLACE FUNCTION public.can_access_order(target_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

  SELECT EXISTS (

    SELECT 1

    FROM public.orders o

    WHERE o.id = target_order_id

      AND (

        public.current_app_role() IN ('admin', 'sales')

        OR o.customer_id = auth.uid()

        OR o.assigned_executor_id = auth.uid()

      )

  )

$function$;

CREATE OR REPLACE FUNCTION public.can_view_order(target_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

  SELECT EXISTS (

    SELECT 1

    FROM public.orders o

    WHERE o.id = target_order_id

      AND (

        public.current_app_role() IN ('admin', 'sales')

        OR o.customer_id = auth.uid()

        OR o.assigned_executor_id = auth.uid()

      )

  )

$function$;

CREATE OR REPLACE FUNCTION public.apply_recipe_deductions(p_recipe_id uuid, p_width_cm numeric, p_height_cm numeric, p_quantity integer, p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

DECLARE

  v_item      RECORD;

  v_qty       NUMERIC;

  v_new_qty   NUMERIC;

BEGIN

  FOR v_item IN

    SELECT ri.*, s.current_quantity, s.inventory_unit

    FROM recipe_items ri

    JOIN skus s ON s.id = ri.sku_id

    WHERE ri.recipe_id = p_recipe_id

  LOOP

    v_qty := calculate_recipe_qty(

      v_item.quantity_fixed,

      v_item.quantity_per_sqm,

      v_item.quantity_per_width_m,

      v_item.quantity_per_height_m,

      p_width_cm, p_height_cm, p_quantity

    );



    IF v_qty <= 0 THEN CONTINUE; END IF;



    IF v_item.current_quantity < v_qty THEN

      RAISE EXCEPTION 'Insufficient stock for component "%" (need %, have %)',

        v_item.component_name, v_qty, v_item.current_quantity;

    END IF;



    v_new_qty := v_item.current_quantity - v_qty;



    UPDATE skus SET current_quantity = v_new_qty, updated_at = NOW()

    WHERE id = v_item.sku_id;



    INSERT INTO inventory_movements (sku_id, movement_type, quantity_delta, balance_after, unit, reference_id, source_sheet)

    VALUES (v_item.sku_id, 'sale', -v_qty, v_new_qty, v_item.inventory_unit::TEXT, p_order_id::TEXT, 'recipe');

  END LOOP;

END;

$function$;

CREATE OR REPLACE FUNCTION public.assign_order_ticket_uid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

BEGIN

  IF NEW.created_at IS NULL THEN

    NEW.created_at := now();

  END IF;



  IF NEW.ticket_uid IS NULL OR NEW.ticket_uid = '' THEN

    NEW.ticket_uid := public.format_order_ticket_uid(

      nextval('public.order_ticket_number_seq'),

      NEW.created_at

    );

  END IF;



  RETURN NEW;

END;

$function$;

CREATE OR REPLACE FUNCTION public.calculate_recipe_qty(p_fixed numeric, p_per_sqm numeric, p_per_width_m numeric, p_per_height_m numeric, p_width_cm numeric, p_height_cm numeric, p_quantity integer)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$

DECLARE

  v_w   NUMERIC := p_width_cm  / 100.0;

  v_h   NUMERIC := p_height_cm / 100.0;

  v_sqm NUMERIC := v_w * v_h;

BEGIN

  RETURN (

    p_fixed

    + (p_per_sqm    * v_sqm)

    + (p_per_width_m  * v_w)

    + (p_per_height_m * v_h)

  ) * p_quantity;

END;

$function$;

CREATE OR REPLACE FUNCTION public.deduct_order_components(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

DECLARE

  v_comp     RECORD;

  v_roll     RECORD;

  v_qty      NUMERIC;

  v_deducted INTEGER := 0;

BEGIN

  FOR v_comp IN

    SELECT oc.id, oc.variant_id, oc.planned_qty, oc.actual_qty,

           oc.extra_qty, iv.unit

    FROM order_components oc

    JOIN inv_variants iv ON iv.id = oc.variant_id

    WHERE oc.order_id = p_order_id

      AND oc.deducted = false

  LOOP

    -- BUG FIX: was oc.actual_qty (undefined), now v_comp.actual_qty

    v_qty := COALESCE(v_comp.actual_qty, v_comp.planned_qty)

           + COALESCE(v_comp.extra_qty, 0);



    IF v_qty <= 0 THEN CONTINUE; END IF;



    -- Find a roll with enough stock (prefer exact fit)

    SELECT id INTO v_roll

    FROM inv_rolls

    WHERE variant_id = v_comp.variant_id

      AND remaining_length >= v_qty

      AND status = 'in_stock'

    ORDER BY remaining_length ASC

    FOR UPDATE SKIP LOCKED

    LIMIT 1;



    IF NOT FOUND THEN

      -- Allow partial deduction from any roll

      SELECT id INTO v_roll

      FROM inv_rolls

      WHERE variant_id = v_comp.variant_id

        AND status = 'in_stock'

      ORDER BY remaining_length DESC

      FOR UPDATE SKIP LOCKED

      LIMIT 1;

    END IF;



    IF FOUND THEN

      UPDATE inv_rolls

      SET remaining_length = GREATEST(remaining_length - v_qty, 0),

          status = CASE WHEN remaining_length - v_qty <= 0 THEN 'depleted' ELSE 'in_stock' END

      WHERE id = v_roll.id;



      INSERT INTO inv_movements (roll_id, variant_id, movement_type, quantity, unit, reference)

      VALUES (v_roll.id, v_comp.variant_id, 'outflow', -v_qty, v_comp.unit, p_order_id::TEXT);

    END IF;



    UPDATE order_components SET deducted = true WHERE id = v_comp.id;

    v_deducted := v_deducted + 1;

  END LOOP;



  RETURN v_deducted;

END;

$function$;

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

$function$;

CREATE OR REPLACE FUNCTION public.format_order_ticket_uid(ticket_no bigint, ticket_created_at timestamp with time zone DEFAULT now())
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$

  SELECT lpad(ticket_no::text, 4, '0')

$function$;

CREATE OR REPLACE FUNCTION public.generate_order_uid()
 RETURNS text
 LANGUAGE plpgsql
AS $function$

DECLARE

  v_now       TIMESTAMP := NOW();

  v_year      INTEGER   := EXTRACT(YEAR FROM v_now);

  v_month     INTEGER   := EXTRACT(MONTH FROM v_now);

  v_fy_start  INTEGER;   -- e.g. 2025

  v_fy_end    INTEGER;   -- e.g. 2026

  v_fy_label  TEXT;       -- e.g. '2526'

  v_fy_from   DATE;

  v_fy_to     DATE;

  v_seq       INTEGER;

BEGIN

  -- Determine financial year: Apr-Mar

  -- If month >= 4 (April), FY starts this year; otherwise FY started last year

  IF v_month >= 4 THEN

    v_fy_start := v_year;

  ELSE

    v_fy_start := v_year - 1;

  END IF;

  v_fy_end := v_fy_start + 1;



  -- Build FY label: last 2 digits of each year Ã¢Â†Â’ '2526'

  v_fy_label := LPAD((v_fy_start % 100)::TEXT, 2, '0') || LPAD((v_fy_end % 100)::TEXT, 2, '0');



  -- FY date range for counting existing orders

  v_fy_from := (v_fy_start || '-04-01')::DATE;

  v_fy_to   := (v_fy_end   || '-03-31')::DATE;



  -- Count existing orders in this FY

  SELECT COUNT(*) + 1 INTO v_seq

  FROM orders

  WHERE created_at >= v_fy_from

    AND created_at < (v_fy_to + INTERVAL '1 day');



  RETURN 'VB-' || v_fy_label || '-' || LPAD(v_seq::TEXT, 4, '0');

END;

$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

BEGIN

  INSERT INTO public.profiles (id, email, role, full_name)

  VALUES (

    new.id,

    new.email,

    COALESCE(new.raw_user_meta_data->>'role', 'staff'),

    COALESCE(new.raw_user_meta_data->>'full_name', '')

  )

  ON CONFLICT (id) DO NOTHING;

  RETURN new;

END;

$function$;

CREATE OR REPLACE FUNCTION public.import_order_item_snapshot(p_order_id uuid, p_sku_id uuid, p_material_id uuid, p_product_name text, p_location text, p_unit inventory_unit, p_quantity integer, p_width_cm numeric, p_height_cm numeric, p_actual_width_cm numeric, p_actual_height_cm numeric, p_actual_area_sqm numeric, p_chargeable_width_cm numeric, p_chargeable_height_cm numeric, p_chargeable_sqft numeric, p_area_sqm numeric, p_rate numeric, p_line_total numeric, p_source_sheet text, p_source_row integer, p_needs_review boolean DEFAULT false, p_review_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

DECLARE

  v_item_id UUID;

BEGIN

  IF p_sku_id IS NULL AND p_material_id IS NULL THEN

    RAISE EXCEPTION 'Snapshot order item requires either sku_id or material_id';

  END IF;



  INSERT INTO order_items (

    order_id, sku_id, material_id, product_name, location, unit, quantity,

    width_cm, height_cm, actual_width_cm, actual_height_cm, actual_area_sqm,

    chargeable_width_cm, chargeable_height_cm, chargeable_sqft,

    area_sqm, rate_applied, line_total, source_sheet, source_row,

    inventory_action, needs_review, review_reason

  ) VALUES (

    p_order_id, p_sku_id, p_material_id, p_product_name, p_location, p_unit, COALESCE(p_quantity, 1),

    p_width_cm, p_height_cm, p_actual_width_cm, p_actual_height_cm, p_actual_area_sqm,

    p_chargeable_width_cm, p_chargeable_height_cm, p_chargeable_sqft,

    COALESCE(p_area_sqm, 0), COALESCE(p_rate, 0), COALESCE(p_line_total, 0),

    p_source_sheet, p_source_row, 'snapshot_only', p_needs_review, p_review_reason

  )

  RETURNING id INTO v_item_id;



  UPDATE orders

  SET total_amount = total_amount + COALESCE(p_line_total, 0)

  WHERE id = p_order_id;



  RETURN v_item_id;

END;

$function$;

CREATE OR REPLACE FUNCTION public.process_order_item(p_order_id uuid, p_material_id uuid, p_width_cm numeric, p_height_cm numeric, p_quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

DECLARE

  v_material_width_m NUMERIC;

  v_base_rate NUMERIC;

  v_sku_id UUID;

  v_cut_length_m NUMERIC;

  v_area_sqm NUMERIC;

  v_line_total NUMERIC;

  v_roll_id UUID;

  v_remaining NUMERIC;

  v_item_id UUID;

BEGIN

  SELECT fixed_width_m, base_rate_sqm, sku_id

  INTO v_material_width_m, v_base_rate, v_sku_id

  FROM materials

  WHERE id = p_material_id;



  IF NOT FOUND THEN

    RAISE EXCEPTION 'Material not found';

  END IF;



  IF p_quantity <= 0 THEN

    RAISE EXCEPTION 'Quantity must be positive';

  END IF;



  IF p_width_cm > v_material_width_m * 100 THEN

    RAISE EXCEPTION 'Requested width % cm exceeds material roll width of % cm', p_width_cm, v_material_width_m * 100;

  END IF;



  v_area_sqm := (p_width_cm / 100.0) * (p_height_cm / 100.0);

  v_line_total := v_area_sqm * v_base_rate * p_quantity;

  v_cut_length_m := (p_height_cm / 100.0) * p_quantity;



  SELECT id, remaining_length_m

  INTO v_roll_id, v_remaining

  FROM rolls

  WHERE material_id = p_material_id

    AND remaining_length_m >= v_cut_length_m

    AND status = 'In Stock'

  ORDER BY remaining_length_m ASC

  FOR UPDATE SKIP LOCKED

  LIMIT 1;



  IF NOT FOUND THEN

    RAISE EXCEPTION 'Insufficient inventory for material ID % (Need %m)', p_material_id, v_cut_length_m;

  END IF;



  UPDATE rolls

  SET remaining_length_m = remaining_length_m - v_cut_length_m,

      status = CASE WHEN remaining_length_m - v_cut_length_m <= 0.1 THEN 'Depleted' ELSE 'In Stock' END

  WHERE id = v_roll_id;



  IF v_sku_id IS NOT NULL THEN

    UPDATE skus

    SET current_quantity = GREATEST(current_quantity - v_cut_length_m, 0)

    WHERE id = v_sku_id;

  END IF;



  INSERT INTO order_items (

    order_id, material_id, sku_id, product_name, unit,

    width_cm, height_cm, actual_width_cm, actual_height_cm, actual_area_sqm,

    chargeable_width_cm, chargeable_height_cm, chargeable_sqft,

    area_sqm, quantity, rate_applied, line_total, inventory_action

  ) VALUES (

    p_order_id, p_material_id, v_sku_id, NULL, 'sqm',

    p_width_cm, p_height_cm, p_width_cm, p_height_cm, v_area_sqm * p_quantity,

    p_width_cm, p_height_cm, v_area_sqm * 10.764 * p_quantity,

    v_area_sqm, p_quantity, v_base_rate, v_line_total, 'deducted'

  )

  RETURNING id INTO v_item_id;



  INSERT INTO cut_logs (roll_id, order_item_id, cut_length_m)

  VALUES (v_roll_id, v_item_id, v_cut_length_m);



  IF v_sku_id IS NOT NULL THEN

    INSERT INTO inventory_movements (

      sku_id, roll_id, movement_type, quantity_delta, balance_after, unit,

      unit_rate, total_value, source_ref, notes

    )

    SELECT

      v_sku_id, v_roll_id, 'sale', -v_cut_length_m, current_quantity, 'm',

      v_base_rate, v_line_total, p_order_id::TEXT, 'Fabric cut through process_order_item'

    FROM skus

    WHERE id = v_sku_id;

  END IF;



  UPDATE orders SET total_amount = total_amount + v_line_total WHERE id = p_order_id;

END;

$function$;

CREATE OR REPLACE FUNCTION public.process_order_item_v2(p_order_id uuid, p_variant_id uuid, p_width_cm numeric, p_height_cm numeric, p_quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

DECLARE

  v_width_m      NUMERIC;

  v_rate_sqm     NUMERIC;

  v_cut_m        NUMERIC;

  v_area_sqm     NUMERIC;

  v_line_total   NUMERIC;

  v_roll_id      UUID;

  v_item_id      UUID;

BEGIN

  SELECT width_m, base_rate_sqm INTO v_width_m, v_rate_sqm

  FROM inv_variants WHERE id = p_variant_id;



  IF NOT FOUND THEN

    RAISE EXCEPTION 'Variant not found: %', p_variant_id;

  END IF;



  IF v_width_m IS NULL OR v_width_m <= 0 THEN

    RAISE EXCEPTION 'This variant is not a fabric roll (no width defined). Cannot cut.';

  END IF;



  IF p_width_cm > v_width_m * 100 THEN

    RAISE EXCEPTION 'Width % cm exceeds roll width % cm', p_width_cm, v_width_m * 100;

  END IF;



  v_area_sqm   := (p_width_cm / 100.0) * (p_height_cm / 100.0);

  v_line_total := v_area_sqm * COALESCE(v_rate_sqm, 0) * p_quantity;

  v_cut_m      := (p_height_cm / 100.0) * p_quantity;



  SELECT id INTO v_roll_id

  FROM inv_rolls

  WHERE variant_id = p_variant_id

    AND remaining_length >= v_cut_m

    AND status = 'in_stock'

  ORDER BY remaining_length ASC

  FOR UPDATE SKIP LOCKED

  LIMIT 1;



  IF NOT FOUND THEN

    RAISE EXCEPTION 'Insufficient stock for this variant (need % m)', v_cut_m;

  END IF;



  UPDATE inv_rolls

  SET remaining_length = remaining_length - v_cut_m,

      status = CASE WHEN remaining_length - v_cut_m <= 0.1 THEN 'depleted' ELSE 'in_stock' END

  WHERE id = v_roll_id;



  INSERT INTO inv_movements (roll_id, variant_id, movement_type, quantity, unit, reference)

  VALUES (v_roll_id, p_variant_id, 'outflow', v_cut_m, 'm', p_order_id::TEXT);



  INSERT INTO order_items (order_id, variant_id, width_cm, height_cm, area_sqm, quantity, rate_applied, line_total)

  VALUES (p_order_id, p_variant_id, p_width_cm, p_height_cm, v_area_sqm, p_quantity, COALESCE(v_rate_sqm, 0), v_line_total)

  RETURNING id INTO v_item_id;



  INSERT INTO cut_logs (roll_id, order_item_id, cut_length_m)

  VALUES (v_roll_id, v_item_id, v_cut_m);



  UPDATE orders SET total_amount = total_amount + v_line_total WHERE id = p_order_id;

END;

$function$;

CREATE OR REPLACE FUNCTION public.process_sku_order_item(p_order_id uuid, p_sku_id uuid, p_quantity numeric, p_rate numeric, p_unit inventory_unit, p_product_name text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_source_sheet text DEFAULT NULL::text, p_source_row integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

DECLARE

  v_balance NUMERIC(14,4);

  v_item_id UUID;

  v_line_total NUMERIC(14,4);

BEGIN

  IF p_quantity <= 0 THEN

    RAISE EXCEPTION 'Order quantity must be positive';

  END IF;



  SELECT current_quantity

  INTO v_balance

  FROM skus

  WHERE id = p_sku_id

  FOR UPDATE;



  IF NOT FOUND THEN

    RAISE EXCEPTION 'SKU % not found', p_sku_id;

  END IF;



  IF v_balance < p_quantity THEN

    RAISE EXCEPTION 'Insufficient inventory for SKU % (need %, available %)', p_sku_id, p_quantity, v_balance;

  END IF;



  v_line_total := COALESCE(p_quantity, 0) * COALESCE(p_rate, 0);

  v_balance := v_balance - p_quantity;



  UPDATE skus

  SET current_quantity = v_balance

  WHERE id = p_sku_id;



  INSERT INTO order_items (

    order_id, sku_id, product_name, location, unit, quantity,

    area_sqm, rate_applied, line_total, source_sheet, source_row,

    inventory_action

  ) VALUES (

    p_order_id, p_sku_id, p_product_name, p_location, p_unit, p_quantity::INTEGER,

    0, COALESCE(p_rate, 0), v_line_total, p_source_sheet, p_source_row,

    'deducted'

  )

  RETURNING id INTO v_item_id;



  INSERT INTO inventory_movements (

    sku_id, movement_type, quantity_delta, balance_after, unit,

    unit_rate, total_value, source_sheet, source_row, source_ref

  ) VALUES (

    p_sku_id, 'sale', -p_quantity, v_balance, p_unit,

    p_rate, v_line_total, p_source_sheet, p_source_row, p_order_id::TEXT

  );



  UPDATE orders SET total_amount = total_amount + v_line_total WHERE id = p_order_id;



  RETURN v_item_id;

END;

$function$;

CREATE OR REPLACE FUNCTION public.recalculate_order_cost(p_order_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

DECLARE

  v_fabric_cost NUMERIC := 0;

  v_component_cost NUMERIC := 0;

  v_raw_material_cost NUMERIC := 0;

  v_total NUMERIC := 0;

BEGIN

  SELECT COALESCE(SUM(

    COALESCE(w.cut_length_m, 0)

    * COALESCE(w.cut_width_m, iv.width_m, 0)

    * COALESCE(r.purchase_rate, iv.purchase_rate, 0)

  ), 0)

  INTO v_fabric_cost

  FROM wastage_logs w

  LEFT JOIN inv_rolls r ON r.id = w.roll_id

  LEFT JOIN inv_variants iv ON iv.id = w.variant_id

  WHERE w.order_id = p_order_id;



  IF v_fabric_cost = 0 THEN

    SELECT COALESCE(SUM(

      (COALESCE(oi.height_cm, 0) / 100.0)

      * COALESCE(oi.quantity, 1)

      * CASE WHEN COALESCE(oi.blind_type, '') ILIKE 'Sheer Dimout%' THEN 2 ELSE 1 END

      * COALESCE(NULLIF(oi.width_cm, 0) / 100.0, iv.width_m, 0)

      * COALESCE(iv.purchase_rate, 0)

    ), 0)

    INTO v_fabric_cost

    FROM order_items oi

    LEFT JOIN inv_variants iv ON iv.id = oi.variant_id

    WHERE oi.order_id = p_order_id

      AND COALESCE(oi.item_type, 'finished_goods') = 'finished_goods';

  END IF;



  SELECT COALESCE(SUM(

    COALESCE(oc.actual_qty, oc.planned_qty, 0)

    * COALESCE(iv.purchase_rate, 0)

  ), 0)

  INTO v_component_cost

  FROM order_components oc

  LEFT JOIN inv_variants iv ON iv.id = oc.variant_id

  WHERE oc.order_id = p_order_id;



  SELECT COALESCE(SUM(

    COALESCE(oi.area_sqm, oi.quantity, 0)

    * COALESCE(iv.purchase_rate, 0)

  ), 0)

  INTO v_raw_material_cost

  FROM order_items oi

  LEFT JOIN inv_variants iv ON iv.id = oi.variant_id

  WHERE oi.order_id = p_order_id

    AND COALESCE(oi.item_type, 'finished_goods') = 'raw_material';



  v_total := v_fabric_cost + v_component_cost + v_raw_material_cost;



  UPDATE orders

     SET cost_amount = v_total

   WHERE id = p_order_id;



  RETURN v_total;

END;

$function$;

CREATE OR REPLACE FUNCTION public.receive_inventory(p_sku_id uuid, p_quantity numeric, p_unit inventory_unit, p_unit_rate numeric DEFAULT NULL::numeric, p_total_value numeric DEFAULT NULL::numeric, p_roll_id uuid DEFAULT NULL::uuid, p_source_sheet text DEFAULT NULL::text, p_source_row integer DEFAULT NULL::integer, p_source_ref text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

DECLARE

  v_balance NUMERIC(14,4);

  v_movement_id UUID;

BEGIN

  IF p_quantity <= 0 THEN

    RAISE EXCEPTION 'Inventory quantity must be positive';

  END IF;



  UPDATE skus

  SET current_quantity = current_quantity + p_quantity

  WHERE id = p_sku_id

  RETURNING current_quantity INTO v_balance;



  IF NOT FOUND THEN

    RAISE EXCEPTION 'SKU % not found', p_sku_id;

  END IF;



  INSERT INTO inventory_movements (

    sku_id, roll_id, movement_type, quantity_delta, balance_after, unit,

    unit_rate, total_value, source_sheet, source_row, source_ref, notes

  ) VALUES (

    p_sku_id, p_roll_id, 'import_opening', p_quantity, v_balance, p_unit,

    p_unit_rate, p_total_value, p_source_sheet, p_source_row, p_source_ref, p_notes

  )

  RETURNING id INTO v_movement_id;



  RETURN v_movement_id;

END;

$function$;

CREATE OR REPLACE FUNCTION public.restore_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

BEGIN

  UPDATE orders SET deleted_at = NULL WHERE id = p_order_id;

END;

$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

BEGIN

  NEW.updated_at = NOW();

  RETURN NEW;

END;

$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$

BEGIN

  UPDATE orders SET deleted_at = NOW() WHERE id = p_order_id;

END;

$function$;

CREATE OR REPLACE FUNCTION public.stock_orders_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

begin

  new.updated_at = now();

  return new;

end;

$function$;

ALTER TABLE public."activity_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."blind_recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cut_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."excel_import_row_errors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."excel_import_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."execution_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fg_stock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inv_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inv_items" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."inv_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inv_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inv_rolls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inv_stock_entries" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."inv_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_movements" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."material_categories" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."materials" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_quote_downloads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_quote_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_ticket_followups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pricing_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recipe_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rolls" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."rrp_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."skus" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."stock_order_downloads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stock_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stock_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wastage_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_admin_delete" ON public."activity_logs" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((current_app_role() = 'admin'::text));
CREATE POLICY "activity_logs_admin_write" ON public."activity_logs" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "activity_logs_insert" ON public."activity_logs" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "activity_logs_read" ON public."activity_logs" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((current_app_role() = 'admin'::text) OR (user_id = auth.uid())));
CREATE POLICY "auth_read_recipes" ON public."blind_recipes" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "staff_write_recipes" ON public."blind_recipes" AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));
CREATE POLICY "customers_admin_delete" ON public."customers" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((current_app_role() = 'admin'::text));
CREATE POLICY "customers_admin_update" ON public."customers" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "customers_insert" ON public."customers" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "customers_read" ON public."customers" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "execution_logs insert authenticated" ON public."execution_logs" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "execution_logs select staff+" ON public."execution_logs" AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text, 'executer'::text]))))));
CREATE POLICY "fg_stock_admin_write" ON public."fg_stock" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "fg_stock_read" ON public."fg_stock" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "inv_categories_admin_write" ON public."inv_categories" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "inv_categories_read" ON public."inv_categories" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "auth_read_items" ON public."inv_items" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "staff_write_items" ON public."inv_items" AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));
CREATE POLICY "inv_movements_admin_delete" ON public."inv_movements" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((current_app_role() = 'admin'::text));
CREATE POLICY "inv_movements_admin_update" ON public."inv_movements" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "inv_movements_staff_insert" ON public."inv_movements" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((current_app_role() = ANY (ARRAY['admin'::text, 'executer'::text])));
CREATE POLICY "inv_movements_staff_read" ON public."inv_movements" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((current_app_role() = ANY (ARRAY['admin'::text, 'executer'::text])));
CREATE POLICY "inv_products_admin_write" ON public."inv_products" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "inv_products_read" ON public."inv_products" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "inv_rolls_admin_write" ON public."inv_rolls" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "inv_rolls_read" ON public."inv_rolls" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "auth_read_entries" ON public."inv_stock_entries" AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "staff_write_entries" ON public."inv_stock_entries" AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));
CREATE POLICY "inv_variants_admin_write" ON public."inv_variants" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "inv_variants_read" ON public."inv_variants" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Categories are viewable by everyone" ON public."material_categories" AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY "Materials are viewable by everyone" ON public."materials" AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY "order_components_delete" ON public."order_components" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((current_app_role() = ANY (ARRAY['admin'::text, 'sales'::text])) AND can_access_order(order_id)));
CREATE POLICY "order_components_insert" ON public."order_components" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (can_access_order(order_id));
CREATE POLICY "order_components_select" ON public."order_components" AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_order(order_id));
CREATE POLICY "order_components_update" ON public."order_components" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (can_access_order(order_id)) WITH CHECK (can_access_order(order_id));
CREATE POLICY "order_items_delete" ON public."order_items" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((current_app_role() = ANY (ARRAY['admin'::text, 'sales'::text])) AND can_access_order(order_id)));
CREATE POLICY "order_items_insert" ON public."order_items" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (can_access_order(order_id));
CREATE POLICY "order_items_select" ON public."order_items" AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_order(order_id));
CREATE POLICY "order_items_update" ON public."order_items" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (can_access_order(order_id)) WITH CHECK (can_access_order(order_id));
CREATE POLICY "order_quote_downloads_delete" ON public."order_quote_downloads" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((current_app_role() = 'admin'::text));
CREATE POLICY "order_quote_downloads_insert" ON public."order_quote_downloads" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (can_access_order(order_id));
CREATE POLICY "order_quote_downloads_select" ON public."order_quote_downloads" AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_order(order_id));
CREATE POLICY "order_quote_forms_delete" ON public."order_quote_forms" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((current_app_role() = 'admin'::text));
CREATE POLICY "order_quote_forms_insert" ON public."order_quote_forms" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (can_access_order(order_id));
CREATE POLICY "order_quote_forms_select" ON public."order_quote_forms" AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_order(order_id));
CREATE POLICY "order_quote_forms_update" ON public."order_quote_forms" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (can_access_order(order_id)) WITH CHECK (can_access_order(order_id));
CREATE POLICY "order_ticket_followups_delete" ON public."order_ticket_followups" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((current_app_role() = 'admin'::text));
CREATE POLICY "order_ticket_followups_insert" ON public."order_ticket_followups" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "order_ticket_followups_select" ON public."order_ticket_followups" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY "order_ticket_followups_update" ON public."order_ticket_followups" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "order_tickets_delete" ON public."order_tickets" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((current_app_role() = 'admin'::text));
CREATE POLICY "order_tickets_insert" ON public."order_tickets" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "order_tickets_select" ON public."order_tickets" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() IS NOT NULL));
CREATE POLICY "order_tickets_update" ON public."order_tickets" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "orders_delete" ON public."orders" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((current_app_role() = 'admin'::text));
CREATE POLICY "orders_insert" ON public."orders" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((current_app_role() = 'admin'::text) OR (customer_id = auth.uid())));
CREATE POLICY "orders_select" ON public."orders" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((current_app_role() = ANY (ARRAY['admin'::text, 'sales'::text])) OR (customer_id = auth.uid()) OR (assigned_executor_id = auth.uid())));
CREATE POLICY "orders_update" ON public."orders" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((current_app_role() = ANY (ARRAY['admin'::text, 'sales'::text])) OR (customer_id = auth.uid()) OR (assigned_executor_id = auth.uid()))) WITH CHECK (((current_app_role() = ANY (ARRAY['admin'::text, 'sales'::text])) OR (customer_id = auth.uid()) OR (assigned_executor_id = auth.uid())));
CREATE POLICY "Pricing rules are viewable by everyone" ON public."pricing_rules" AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY "product_codes_admin_write" ON public."product_codes" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "product_codes_read" ON public."product_codes" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "product_recipes_admin_write" ON public."product_recipes" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "product_recipes_read" ON public."product_recipes" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "profiles_admin_write" ON public."profiles" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "profiles_select" ON public."profiles" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((id = auth.uid()) OR (current_app_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'executer'::text]))));
CREATE POLICY "profiles_self_update" ON public."profiles" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = auth.uid())) WITH CHECK (((id = auth.uid()) AND (role = current_app_role())));
CREATE POLICY "recipe_items_admin_write" ON public."recipe_items" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "recipe_items_read" ON public."recipe_items" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "rrp_entries_admin_write" ON public."rrp_entries" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "rrp_entries_read" ON public."rrp_entries" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "SKUs are viewable by everyone" ON public."skus" AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY "Admins can manage stock order downloads" ON public."stock_order_downloads" AS PERMISSIVE FOR ALL TO public
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "Admins can manage stock order items" ON public."stock_order_items" AS PERMISSIVE FOR ALL TO public
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "Admins can manage stock orders" ON public."stock_orders" AS PERMISSIVE FOR ALL TO public
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "suppliers_admin_all" ON public."suppliers" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "wastage_logs_admin_delete" ON public."wastage_logs" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((current_app_role() = 'admin'::text));
CREATE POLICY "wastage_logs_admin_write" ON public."wastage_logs" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((current_app_role() = 'admin'::text)) WITH CHECK ((current_app_role() = 'admin'::text));
CREATE POLICY "wastage_logs_executor_update" ON public."wastage_logs" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((current_app_role() = ANY (ARRAY['admin'::text, 'executer'::text])) AND ((order_id IS NULL) OR can_access_order(order_id)))) WITH CHECK (((current_app_role() = ANY (ARRAY['admin'::text, 'executer'::text])) AND ((order_id IS NULL) OR can_access_order(order_id))));
CREATE POLICY "wastage_logs_insert" ON public."wastage_logs" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((current_app_role() = ANY (ARRAY['admin'::text, 'executer'::text])) AND ((order_id IS NULL) OR can_access_order(order_id))));
CREATE POLICY "wastage_logs_select" ON public."wastage_logs" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((order_id IS NULL) OR can_view_order(order_id)));

CREATE TRIGGER trg_assign_order_ticket_uid BEFORE INSERT ON order_tickets FOR EACH ROW EXECUTE FUNCTION assign_order_ticket_uid();
CREATE TRIGGER set_skus_updated_at BEFORE UPDATE ON skus FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stock_orders_updated_at BEFORE UPDATE ON stock_orders FOR EACH ROW EXECUTE FUNCTION stock_orders_set_updated_at();
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.inv_products ADD CONSTRAINT inv_products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.inv_categories(id) ON DELETE CASCADE;
ALTER TABLE public.inv_variants ADD CONSTRAINT inv_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.inv_products(id) ON DELETE CASCADE;
ALTER TABLE public.inv_rolls ADD CONSTRAINT inv_rolls_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inv_variants(id) ON DELETE CASCADE;
ALTER TABLE public.inv_movements ADD CONSTRAINT inv_movements_roll_id_fkey FOREIGN KEY (roll_id) REFERENCES public.inv_rolls(id) ON DELETE CASCADE;
ALTER TABLE public.inv_movements ADD CONSTRAINT inv_movements_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inv_variants(id) ON DELETE CASCADE;

ALTER TABLE public.orders ADD CONSTRAINT orders_cust_id_fkey FOREIGN KEY (cust_id) REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_assigned_executor_id_fkey FOREIGN KEY (assigned_executor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_executed_by_fkey FOREIGN KEY (executed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inv_variants(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_roll_id_fkey FOREIGN KEY (roll_id) REFERENCES public.inv_rolls(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_fg_stock_id_fkey FOREIGN KEY (fg_stock_id) REFERENCES public.fg_stock(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_product_code_id_fkey FOREIGN KEY (product_code_id) REFERENCES public.product_codes(id) ON DELETE SET NULL;

ALTER TABLE public.order_components ADD CONSTRAINT order_components_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_components ADD CONSTRAINT order_components_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;
ALTER TABLE public.order_components ADD CONSTRAINT order_components_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inv_variants(id) ON DELETE SET NULL;
ALTER TABLE public.order_components ADD CONSTRAINT order_components_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.recipe_items ADD CONSTRAINT recipe_items_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.product_recipes(id) ON DELETE CASCADE;
ALTER TABLE public.recipe_items ADD CONSTRAINT recipe_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inv_variants(id) ON DELETE CASCADE;

ALTER TABLE public.wastage_logs ADD CONSTRAINT wastage_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.wastage_logs ADD CONSTRAINT wastage_logs_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;
ALTER TABLE public.wastage_logs ADD CONSTRAINT wastage_logs_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inv_variants(id) ON DELETE SET NULL;
ALTER TABLE public.wastage_logs ADD CONSTRAINT wastage_logs_roll_id_fkey FOREIGN KEY (roll_id) REFERENCES public.inv_rolls(id) ON DELETE SET NULL;

ALTER TABLE public.order_quote_forms ADD CONSTRAINT order_quote_forms_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_quote_forms ADD CONSTRAINT order_quote_forms_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.order_quote_downloads ADD CONSTRAINT order_quote_downloads_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_quote_downloads ADD CONSTRAINT order_quote_downloads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.order_tickets ADD CONSTRAINT order_tickets_cust_id_fkey FOREIGN KEY (cust_id) REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.order_tickets ADD CONSTRAINT order_tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_tickets ADD CONSTRAINT order_tickets_converted_order_id_fkey FOREIGN KEY (converted_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.order_tickets ADD CONSTRAINT order_tickets_allocated_to_fkey FOREIGN KEY (allocated_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_ticket_followups ADD CONSTRAINT order_ticket_followups_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.order_tickets(id) ON DELETE CASCADE;
ALTER TABLE public.order_ticket_followups ADD CONSTRAINT order_ticket_followups_remark_by_fkey FOREIGN KEY (remark_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.stock_orders ADD CONSTRAINT stock_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.stock_order_items ADD CONSTRAINT stock_order_items_stock_order_id_fkey FOREIGN KEY (stock_order_id) REFERENCES public.stock_orders(id) ON DELETE CASCADE;
ALTER TABLE public.stock_order_items ADD CONSTRAINT stock_order_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.inv_categories(id) ON DELETE SET NULL;
ALTER TABLE public.stock_order_items ADD CONSTRAINT stock_order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inv_variants(id) ON DELETE SET NULL;
ALTER TABLE public.stock_order_downloads ADD CONSTRAINT stock_order_downloads_stock_order_id_fkey FOREIGN KEY (stock_order_id) REFERENCES public.stock_orders(id) ON DELETE CASCADE;
ALTER TABLE public.stock_order_downloads ADD CONSTRAINT stock_order_downloads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
