import { pool } from "../src/db/index.js";

/**
 * Production database integrity hardening.
 *
 * Constraints are added NOT VALID so existing legacy records do not prevent
 * deployment. PostgreSQL still enforces them for every new/updated row.
 * Existing data can be validated and cleaned in a later controlled migration.
 */
export async function applyDatabaseIntegrity(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const statements = [
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_outlets_salesman_outlet ON sales_outlets (salesman_id, outlet_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_location_sku ON inventory (location_type, location_id, sku_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_stock_ledger_salesman_date_sku ON sales_stock_ledgers (salesman_id, date, sku_id)`,
      `CREATE INDEX IF NOT EXISTS idx_regencies_province_id ON regencies (province_id)`,
      `CREATE INDEX IF NOT EXISTS idx_districts_regency_id ON districts (regency_id)`,
      `CREATE INDEX IF NOT EXISTS idx_villages_district_id ON villages (district_id)`,
      `CREATE INDEX IF NOT EXISTS idx_areas_office_id ON areas (office_id)`,
      `CREATE INDEX IF NOT EXISTS idx_areas_regency_id ON areas (regency_id)`,
      `CREATE INDEX IF NOT EXISTS idx_routes_area_id ON routes (area_id)`,
      `CREATE INDEX IF NOT EXISTS idx_skus_product_id ON skus (product_id)`,
      `CREATE INDEX IF NOT EXISTS idx_prices_sku_id ON prices (sku_id)`,
      `CREATE INDEX IF NOT EXISTS idx_prices_area_id ON prices (area_id)`,
      `CREATE INDEX IF NOT EXISTS idx_prices_channel_id ON prices (channel_id)`,
      `CREATE INDEX IF NOT EXISTS idx_salesmen_user_id ON salesmen (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_salesmen_area_id ON salesmen (area_id)`,
      `CREATE INDEX IF NOT EXISTS idx_salesmen_office_id ON salesmen (office_id)`,
      `CREATE INDEX IF NOT EXISTS idx_outlets_area_id ON outlets (area_id)`,
      `CREATE INDEX IF NOT EXISTS idx_outlets_channel_id ON outlets (channel_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sales_outlets_salesman_id ON sales_outlets (salesman_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sales_outlets_outlet_id ON sales_outlets (outlet_id)`,
      `CREATE INDEX IF NOT EXISTS idx_call_plans_salesman_date ON call_plans (salesman_id, plan_date)`,
      `CREATE INDEX IF NOT EXISTS idx_call_plan_items_plan_outlet ON call_plan_items (call_plan_id, outlet_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_user_date ON attendance (user_id, date)`,
      `CREATE INDEX IF NOT EXISTS idx_visits_salesman_date ON visits (salesman_id, check_in_time)`,
      `CREATE INDEX IF NOT EXISTS idx_visits_outlet_date ON visits (outlet_id, check_in_time)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_salesman_date ON transactions (salesman_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_outlet_date ON transactions (outlet_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_visit_id ON transactions (visit_id)`,
      `CREATE INDEX IF NOT EXISTS idx_stock_movements_sku_date ON stock_movements (sku_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements (reference_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time ON audit_logs (user_id, timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_id)`,
      `CREATE INDEX IF NOT EXISTS idx_document_store_collection ON dms_document_store (collection_name)`,

      `ALTER TABLE regencies ADD CONSTRAINT fk_regencies_province FOREIGN KEY (province_id) REFERENCES provinces(id) NOT VALID`,
      `ALTER TABLE districts ADD CONSTRAINT fk_districts_regency FOREIGN KEY (regency_id) REFERENCES regencies(id) NOT VALID`,
      `ALTER TABLE villages ADD CONSTRAINT fk_villages_district FOREIGN KEY (district_id) REFERENCES districts(id) NOT VALID`,
      `ALTER TABLE areas ADD CONSTRAINT fk_areas_office FOREIGN KEY (office_id) REFERENCES offices(id) NOT VALID`,
      `ALTER TABLE areas ADD CONSTRAINT fk_areas_regency FOREIGN KEY (regency_id) REFERENCES regencies(id) NOT VALID`,
      `ALTER TABLE routes ADD CONSTRAINT fk_routes_area FOREIGN KEY (area_id) REFERENCES areas(id) NOT VALID`,
      `ALTER TABLE users ADD CONSTRAINT fk_users_office FOREIGN KEY (office_id) REFERENCES offices(id) NOT VALID`,
      `ALTER TABLE users ADD CONSTRAINT fk_users_area FOREIGN KEY (area_id) REFERENCES areas(id) NOT VALID`,
      `ALTER TABLE salesmen ADD CONSTRAINT fk_salesmen_user FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID`,
      `ALTER TABLE salesmen ADD CONSTRAINT fk_salesmen_office FOREIGN KEY (office_id) REFERENCES offices(id) NOT VALID`,
      `ALTER TABLE salesmen ADD CONSTRAINT fk_salesmen_area FOREIGN KEY (area_id) REFERENCES areas(id) NOT VALID`,
      `ALTER TABLE salesmen ADD CONSTRAINT fk_salesmen_supervisor FOREIGN KEY (supervisor_id) REFERENCES users(id) NOT VALID`,
      `ALTER TABLE skus ADD CONSTRAINT fk_skus_product FOREIGN KEY (product_id) REFERENCES products(id) NOT VALID`,
      `ALTER TABLE prices ADD CONSTRAINT fk_prices_sku FOREIGN KEY (sku_id) REFERENCES skus(id) NOT VALID`,
      `ALTER TABLE prices ADD CONSTRAINT fk_prices_channel FOREIGN KEY (channel_id) REFERENCES channels(id) NOT VALID`,
      `ALTER TABLE prices ADD CONSTRAINT fk_prices_area FOREIGN KEY (area_id) REFERENCES areas(id) NOT VALID`,
      `ALTER TABLE outlets ADD CONSTRAINT fk_outlets_area FOREIGN KEY (area_id) REFERENCES areas(id) NOT VALID`,
      `ALTER TABLE outlets ADD CONSTRAINT fk_outlets_channel FOREIGN KEY (channel_id) REFERENCES channels(id) NOT VALID`,
      `ALTER TABLE sales_outlets ADD CONSTRAINT fk_sales_outlets_salesman FOREIGN KEY (salesman_id) REFERENCES salesmen(id) NOT VALID`,
      `ALTER TABLE sales_outlets ADD CONSTRAINT fk_sales_outlets_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) NOT VALID`,
      `ALTER TABLE call_plans ADD CONSTRAINT fk_call_plans_salesman FOREIGN KEY (salesman_id) REFERENCES salesmen(id) NOT VALID`,
      `ALTER TABLE call_plan_items ADD CONSTRAINT fk_call_plan_items_plan FOREIGN KEY (call_plan_id) REFERENCES call_plans(id) NOT VALID`,
      `ALTER TABLE call_plan_items ADD CONSTRAINT fk_call_plan_items_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) NOT VALID`,
      `ALTER TABLE visits ADD CONSTRAINT fk_visits_salesman FOREIGN KEY (salesman_id) REFERENCES salesmen(id) NOT VALID`,
      `ALTER TABLE visits ADD CONSTRAINT fk_visits_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) NOT VALID`,
      `ALTER TABLE visits ADD CONSTRAINT fk_visits_call_plan FOREIGN KEY (call_plan_id) REFERENCES call_plans(id) NOT VALID`,
      `ALTER TABLE transactions ADD CONSTRAINT fk_transactions_salesman FOREIGN KEY (salesman_id) REFERENCES salesmen(id) NOT VALID`,
      `ALTER TABLE transactions ADD CONSTRAINT fk_transactions_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) NOT VALID`,
      `ALTER TABLE transactions ADD CONSTRAINT fk_transactions_visit FOREIGN KEY (visit_id) REFERENCES visits(id) NOT VALID`,
      `ALTER TABLE inventory ADD CONSTRAINT fk_inventory_sku FOREIGN KEY (sku_id) REFERENCES skus(id) NOT VALID`,
      `ALTER TABLE stock_movements ADD CONSTRAINT fk_stock_movements_sku FOREIGN KEY (sku_id) REFERENCES skus(id) NOT VALID`,
      `ALTER TABLE stock_handovers ADD CONSTRAINT fk_stock_handovers_salesman FOREIGN KEY (salesman_id) REFERENCES salesmen(id) NOT VALID`,
      `ALTER TABLE stock_returns ADD CONSTRAINT fk_stock_returns_salesman FOREIGN KEY (salesman_id) REFERENCES salesmen(id) NOT VALID`,
      `ALTER TABLE stock_receivings ADD CONSTRAINT fk_stock_receivings_office FOREIGN KEY (office_id) REFERENCES offices(id) NOT VALID`,
      `ALTER TABLE sales_stock_ledgers ADD CONSTRAINT fk_sales_stock_ledgers_salesman FOREIGN KEY (salesman_id) REFERENCES salesmen(id) NOT VALID`,
      `ALTER TABLE sales_stock_ledgers ADD CONSTRAINT fk_sales_stock_ledgers_sku FOREIGN KEY (sku_id) REFERENCES skus(id) NOT VALID`,
      `ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID`,

      `ALTER TABLE inventory ADD CONSTRAINT ck_inventory_nonnegative CHECK (stock_on_hand >= 0 AND allocated_stock >= 0 AND available_stock >= 0) NOT VALID`,
      `ALTER TABLE stock_movements ADD CONSTRAINT ck_stock_movements_quantity_positive CHECK (quantity > 0) NOT VALID`,
      `ALTER TABLE transactions ADD CONSTRAINT ck_transactions_amounts_nonnegative CHECK (subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND paid_amount >= 0) NOT VALID`,
      `ALTER TABLE outlets ADD CONSTRAINT ck_outlets_coordinates CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)) NOT VALID`,
    ];

    for (const statement of statements) {
      try {
        await client.query(statement);
      } catch (error: any) {
        // Idempotent startup: an already-created constraint is safe to ignore.
        if (!String(error?.message || "").includes("already exists")) {
          throw error;
        }
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
