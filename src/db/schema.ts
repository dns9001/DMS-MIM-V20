import { pgTable, text, integer, doublePrecision, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

// 9. Salesmen Profile & Reasons
export const salesmen = pgTable("salesmen", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  salesmanCode: text("salesman_code"),
  salesType: text("sales_type").default("CANVASSER"),
  officeId: text("office_id"),
  areaId: text("area_id"),
  supervisorId: text("supervisor_id"),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata"),
});

export const openCallReasons = pgTable("open_call_reasons", {
  id: text("id").primaryKey(), reasonCode: text("reason_code"), reasonName: text("reason_name").notNull(), category: text("category"), status: text("status").default("ACTIVE"), metadata: jsonb("metadata"),
});

// 10. Outlets & Mapping
export const outlets = pgTable("outlets", {
  id: text("id").primaryKey(), outletName: text("outlet_name").notNull(), outletCode: text("outlet_code"), ownerName: text("owner_name"), phone: text("phone"), address: text("address"), latitude: doublePrecision("latitude"), longitude: doublePrecision("longitude"), areaId: text("area_id"), channelId: text("channel_id"), creditLimit: doublePrecision("credit_limit").default(0), paymentTermDays: integer("payment_term_days").default(0), status: text("status").default("ACTIVE"), photoUrl: text("photo_url"), notes: text("notes"), createdAt: timestamp("created_at").defaultNow(), metadata: jsonb("metadata"),
});

export const salesOutlets = pgTable("sales_outlets", {
  id: text("id").primaryKey(), salesmanId: text("salesman_id").notNull(), outletId: text("outlet_id").notNull(), visitDay: text("visit_day"), visitFrequency: text("visit_frequency").default("WEEKLY"), status: text("status").default("ACTIVE"), metadata: jsonb("metadata"),
});

// 11. Call Plans & Items
export const callPlans = pgTable("call_plans", {
  id: text("id").primaryKey(), salesmanId: text("salesman_id").notNull(), planDate: text("plan_date").notNull(), status: text("status").default("ACTIVE"), totalOutlets: integer("total_outlets").default(0), visitedOutlets: integer("visited_outlets").default(0), effectiveCalls: integer("effective_calls").default(0), createdAt: timestamp("created_at").defaultNow(), metadata: jsonb("metadata"),
});

export const callPlanItems = pgTable("call_plan_items", {
  id: text("id").primaryKey(), callPlanId: text("call_plan_id").notNull(), outletId: text("outlet_id").notNull(), sequence: integer("sequence").default(1), status: text("status").default("PLANNED"), metadata: jsonb("metadata"),
});

// 12. Attendance & GPS Tracking
export const attendance = pgTable("attendance", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), date: text("date").notNull(), checkInTime: timestamp("check_in_time"), checkInLat: doublePrecision("check_in_lat"), checkInLng: doublePrecision("check_in_lng"), checkInPhoto: text("check_in_photo"), checkInDistance: doublePrecision("check_in_distance"), checkOutTime: timestamp("check_out_time"), checkOutLat: doublePrecision("check_out_lat"), checkOutLng: doublePrecision("check_out_lng"), checkOutPhoto: text("check_out_photo"), status: text("status").default("PRESENT"), notes: text("notes"), metadata: jsonb("metadata"),
});

export const gpsEvents = pgTable("gps_events", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), latitude: doublePrecision("latitude").notNull(), longitude: doublePrecision("longitude").notNull(), accuracy: doublePrecision("accuracy"), batteryLevel: integer("battery_level"), eventType: text("event_type").default("HEARTBEAT"), timestamp: timestamp("timestamp").defaultNow(), metadata: jsonb("metadata"),
});

// 13. Visits & Orders / Transactions
export const visits = pgTable("visits", {
  id: text("id").primaryKey(), salesmanId: text("salesman_id").notNull(), outletId: text("outlet_id").notNull(), callPlanId: text("call_plan_id"), checkInTime: timestamp("check_in_time").defaultNow(), checkInLat: doublePrecision("check_in_lat"), checkInLng: doublePrecision("check_in_lng"), checkInDistance: doublePrecision("check_in_distance"), checkInPhoto: text("check_in_photo"), checkOutTime: timestamp("check_out_time"), visitDurationSeconds: integer("visit_duration_seconds"), isEffectiveCall: boolean("is_effective_call").default(false), nonProductiveReasonId: text("non_productive_reason_id"), notes: text("notes"), status: text("status").default("COMPLETED"), metadata: jsonb("metadata"),
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(), invoiceNumber: text("invoice_number").notNull().unique(), salesmanId: text("salesman_id").notNull(), outletId: text("outlet_id").notNull(), visitId: text("visit_id"), officeId: text("office_id"), transactionType: text("transaction_type").default("CASH"), subtotal: doublePrecision("subtotal").default(0), discountAmount: doublePrecision("discount_amount").default(0), taxAmount: doublePrecision("tax_amount").default(0), totalAmount: doublePrecision("total_amount").default(0), paidAmount: doublePrecision("paid_amount").default(0), paymentStatus: text("payment_status").default("UNPAID"), deliveryStatus: text("delivery_status").default("DELIVERED"), items: jsonb("items").notNull(), invoicePdfUrl: text("invoice_pdf_url"), notes: text("notes"), createdAt: timestamp("created_at").defaultNow(), metadata: jsonb("metadata"),
});

// 14. Inventory & Stock Movements
export const inventory = pgTable("inventory", {
  id: text("id").primaryKey(), locationType: text("location_type").notNull(), locationId: text("location_id").notNull(), skuId: text("sku_id").notNull(), stockOnHand: integer("stock_on_hand").default(0), allocatedStock: integer("allocated_stock").default(0), availableStock: integer("available_stock").default(0), reorderLevel: integer("reorder_level").default(10), status: text("status").default("ACTIVE"), createdAt: timestamp("created_at").defaultNow(), updatedAt: timestamp("updated_at").defaultNow(), metadata: jsonb("metadata"),
});

export const stockMovements = pgTable("stock_movements", {
  id: text("id").primaryKey(), movementType: text("movement_type").notNull(), sourceLocationType: text("source_location_type"), sourceLocationId: text("source_location_id"), destLocationType: text("dest_location_type"), destLocationId: text("dest_location_id"), skuId: text("sku_id").notNull(), quantity: integer("quantity").notNull(), referenceId: text("reference_id"), performedBy: text("performed_by").notNull(), createdAt: timestamp("created_at").defaultNow(), notes: text("notes"), metadata: jsonb("metadata"),
});

export const stockHandovers = pgTable("stock_handovers", {
  id: text("id").primaryKey(), handoverNumber: text("handover_number").notNull(), salesmanId: text("salesman_id").notNull(), officeId: text("office_id"), handoverDate: text("handover_date").notNull(), status: text("status").default("PENDING"), items: jsonb("items").notNull(), notes: text("notes"), approvedBy: text("approved_by"), createdAt: timestamp("created_at").defaultNow(), metadata: jsonb("metadata"),
});

export const stockReturns = pgTable("stock_returns", {
  id: text("id").primaryKey(), returnNumber: text("return_number").notNull(), salesmanId: text("salesman_id").notNull(), officeId: text("office_id"), returnDate: text("return_date").notNull(), status: text("status").default("PENDING"), items: jsonb("items").notNull(), notes: text("notes"), approvedBy: text("approved_by"), createdAt: timestamp("created_at").defaultNow(), metadata: jsonb("metadata"),
});

export const stockReceivings = pgTable("stock_receivings", {
  id: text("id").primaryKey(), receivingNumber: text("receiving_number").notNull(), poNumber: text("po_number"), officeId: text("office_id").notNull(), supplierName: text("supplier_name"), receivedDate: text("received_date").notNull(), status: text("status").default("DRAFT"), totalQuantity: integer("total_quantity").default(0), totalValue: doublePrecision("total_value").default(0), items: jsonb("items").notNull(), notes: text("notes"), receivedBy: text("received_by").notNull(), postedBy: text("posted_by"), postedAt: timestamp("posted_at"), createdAt: timestamp("created_at").defaultNow(), updatedAt: timestamp("updated_at").defaultNow(), metadata: jsonb("metadata"),
});

export const salesStockLedgers = pgTable("sales_stock_ledgers", {
  id: text("id").primaryKey(), salesmanId: text("salesman_id").notNull(), date: text("date").notNull(), skuId: text("sku_id").notNull(), initialStock: integer("initial_stock").default(0), loadedStock: integer("loaded_stock").default(0), soldStock: integer("sold_stock").default(0), returnedStock: integer("returned_stock").default(0), finalStock: integer("final_stock").default(0), metadata: jsonb("metadata"),
});

// 15. Targets & Audit Logs
export const targets = pgTable("targets", {
  id: text("id").primaryKey(), salesmanId: text("salesman_id").notNull(), periodMonth: text("period_month").notNull(), targetRevenue: doublePrecision("target_revenue").default(0), targetVolume: integer("target_volume").default(0), targetCalls: integer("target_calls").default(0), targetEffectiveCalls: integer("target_effective_calls").default(0), targetNewOutlets: integer("target_new_outlets").default(0), achievedRevenue: doublePrecision("achieved_revenue").default(0), metadata: jsonb("metadata"),
});

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), action: text("action").notNull(), module: text("module").notNull(), targetId: text("target_id"), details: jsonb("details"), ipAddress: text("ip_address"), timestamp: timestamp("timestamp").defaultNow(),
});
