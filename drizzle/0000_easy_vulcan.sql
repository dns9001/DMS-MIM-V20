CREATE TABLE "areas" (
	"id" text PRIMARY KEY NOT NULL,
	"area_name" text NOT NULL,
	"area_code" text,
	"office_id" text,
	"regency_id" text,
	"status" text DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"check_in_time" timestamp,
	"check_in_lat" double precision,
	"check_in_lng" double precision,
	"check_in_photo" text,
	"check_in_distance" double precision,
	"check_out_time" timestamp,
	"check_out_lat" double precision,
	"check_out_lng" double precision,
	"check_out_photo" text,
	"status" text DEFAULT 'PRESENT',
	"notes" text,
	"metadata" jsonb
);

CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"target_id" text,
	"details" jsonb,
	"ip_address" text,
	"timestamp" timestamp DEFAULT now()
);

CREATE TABLE "call_plan_items" (
	"id" text PRIMARY KEY NOT NULL,
	"call_plan_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"sequence" integer DEFAULT 1,
	"status" text DEFAULT 'PLANNED',
	"metadata" jsonb
);

CREATE TABLE "call_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"salesman_id" text NOT NULL,
	"plan_date" text NOT NULL,
	"status" text DEFAULT 'ACTIVE',
	"total_outlets" integer DEFAULT 0,
	"visited_outlets" integer DEFAULT 0,
	"effective_calls" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_name" text NOT NULL,
	"channel_code" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "company_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"company_legal_name" text,
	"company_code" text,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"description" text,
	"logo_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text,
	"metadata" jsonb
);

CREATE TABLE "districts" (
	"id" text PRIMARY KEY NOT NULL,
	"regency_id" text,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "gps_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy" double precision,
	"battery_level" integer,
	"event_type" text DEFAULT 'HEARTBEAT',
	"timestamp" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"location_type" text NOT NULL,
	"location_id" text NOT NULL,
	"sku_id" text NOT NULL,
	"stock_on_hand" integer DEFAULT 0,
	"allocated_stock" integer DEFAULT 0,
	"available_stock" integer DEFAULT 0,
	"reorder_level" integer DEFAULT 10,
	"status" text DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "offices" (
	"id" text PRIMARY KEY NOT NULL,
	"office_name" text NOT NULL,
	"office_code" text,
	"address" text,
	"phone" text,
	"latitude" double precision,
	"longitude" double precision,
	"radius_meters" integer DEFAULT 100,
	"status" text DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "open_call_reasons" (
	"id" text PRIMARY KEY NOT NULL,
	"reason_code" text,
	"reason_name" text NOT NULL,
	"category" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_name" text NOT NULL,
	"outlet_code" text,
	"owner_name" text,
	"phone" text,
	"address" text,
	"latitude" double precision,
	"longitude" double precision,
	"area_id" text,
	"channel_id" text,
	"credit_limit" double precision DEFAULT 0,
	"payment_term_days" integer DEFAULT 0,
	"status" text DEFAULT 'ACTIVE',
	"photo_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "prices" (
	"id" text PRIMARY KEY NOT NULL,
	"sku_id" text NOT NULL,
	"price_type" text DEFAULT 'DEFAULT',
	"price_value" double precision NOT NULL,
	"min_qty" integer DEFAULT 1,
	"channel_id" text,
	"area_id" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"product_name" text NOT NULL,
	"product_code" text,
	"category" text,
	"brand" text,
	"status" text DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "promos" (
	"id" text PRIMARY KEY NOT NULL,
	"promo_name" text NOT NULL,
	"promo_code" text,
	"promo_type" text,
	"discount_percent" double precision,
	"discount_amount" double precision,
	"start_date" timestamp,
	"end_date" timestamp,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "provinces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "regencies" (
	"id" text PRIMARY KEY NOT NULL,
	"province_id" text,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "routes" (
	"id" text PRIMARY KEY NOT NULL,
	"route_name" text NOT NULL,
	"route_code" text,
	"area_id" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "sales_outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"salesman_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"visit_day" text,
	"visit_frequency" text DEFAULT 'WEEKLY',
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "sales_stock_ledgers" (
	"id" text PRIMARY KEY NOT NULL,
	"salesman_id" text NOT NULL,
	"date" text NOT NULL,
	"sku_id" text NOT NULL,
	"initial_stock" integer DEFAULT 0,
	"loaded_stock" integer DEFAULT 0,
	"sold_stock" integer DEFAULT 0,
	"returned_stock" integer DEFAULT 0,
	"final_stock" integer DEFAULT 0,
	"metadata" jsonb
);

CREATE TABLE "salesmen" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"salesman_code" text,
	"sales_type" text DEFAULT 'CANVASSER',
	"office_id" text,
	"area_id" text,
	"supervisor_id" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "skus" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"sku_code" text NOT NULL,
	"sku_name" text NOT NULL,
	"barcode" text,
	"uom" text DEFAULT 'PCS',
	"pack_size" integer DEFAULT 1,
	"base_price" double precision DEFAULT 0,
	"status" text DEFAULT 'ACTIVE',
	"image_url" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "stock_handovers" (
	"id" text PRIMARY KEY NOT NULL,
	"handover_number" text NOT NULL,
	"salesman_id" text NOT NULL,
	"office_id" text,
	"handover_date" text NOT NULL,
	"status" text DEFAULT 'PENDING',
	"items" jsonb NOT NULL,
	"notes" text,
	"approved_by" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_type" text NOT NULL,
	"source_location_type" text,
	"source_location_id" text,
	"dest_location_type" text,
	"dest_location_id" text,
	"sku_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"reference_id" text,
	"performed_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"notes" text,
	"metadata" jsonb
);

CREATE TABLE "stock_receivings" (
	"id" text PRIMARY KEY NOT NULL,
	"receiving_number" text NOT NULL,
	"po_number" text,
	"office_id" text NOT NULL,
	"supplier_name" text,
	"received_date" text NOT NULL,
	"status" text DEFAULT 'DRAFT',
	"total_quantity" integer DEFAULT 0,
	"total_value" double precision DEFAULT 0,
	"items" jsonb NOT NULL,
	"notes" text,
	"received_by" text NOT NULL,
	"posted_by" text,
	"posted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "stock_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"return_number" text NOT NULL,
	"salesman_id" text NOT NULL,
	"office_id" text,
	"return_date" text NOT NULL,
	"status" text DEFAULT 'PENDING',
	"items" jsonb NOT NULL,
	"notes" text,
	"approved_by" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);

CREATE TABLE "system_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"settings_data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text
);

CREATE TABLE "targets" (
	"id" text PRIMARY KEY NOT NULL,
	"salesman_id" text NOT NULL,
	"period_month" text NOT NULL,
	"target_revenue" double precision DEFAULT 0,
	"target_volume" integer DEFAULT 0,
	"target_calls" integer DEFAULT 0,
	"target_effective_calls" integer DEFAULT 0,
	"target_new_outlets" integer DEFAULT 0,
	"achieved_revenue" double precision DEFAULT 0,
	"metadata" jsonb
);

CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"salesman_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"visit_id" text,
	"office_id" text,
	"transaction_type" text DEFAULT 'CASH',
	"subtotal" double precision DEFAULT 0,
	"discount_amount" double precision DEFAULT 0,
	"tax_amount" double precision DEFAULT 0,
	"total_amount" double precision DEFAULT 0,
	"paid_amount" double precision DEFAULT 0,
	"payment_status" text DEFAULT 'UNPAID',
	"delivery_status" text DEFAULT 'DELIVERED',
	"items" jsonb NOT NULL,
	"invoice_pdf_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "transactions_invoice_number_unique" UNIQUE("invoice_number")
);

CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'ACTIVE',
	"phone" text,
	"password_hash" text,
	"avatar_url" text,
	"office_id" text,
	"area_id" text,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "villages" (
	"id" text PRIMARY KEY NOT NULL,
	"district_id" text,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'ACTIVE',
	"metadata" jsonb
);

CREATE TABLE "visits" (
	"id" text PRIMARY KEY NOT NULL,
	"salesman_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"call_plan_id" text,
	"check_in_time" timestamp DEFAULT now(),
	"check_in_lat" double precision,
	"check_in_lng" double precision,
	"check_in_distance" double precision,
	"check_in_photo" text,
	"check_out_time" timestamp,
	"visit_duration_seconds" integer,
	"is_effective_call" boolean DEFAULT false,
	"non_productive_reason_id" text,
	"notes" text,
	"status" text DEFAULT 'COMPLETED',
	"metadata" jsonb
);
