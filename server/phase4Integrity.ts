import { pool } from "../src/db/index.js";

/**
 * Phase 4 database safeguards.
 * These are intentionally idempotent so startup/migration can run repeatedly.
 */
export async function ensurePhase4Integrity(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Inventory must have exactly one balance row per location + SKU.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_location_sku
      ON inventory (location_type, location_id, sku_id)
    `);

    // One daily ledger per salesman/SKU.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_stock_ledger_daily
      ON sales_stock_ledgers (salesman_id, date, sku_id)
    `);

    // Business-safe quantity constraints.
    await client.query(`
      ALTER TABLE inventory
        ADD CONSTRAINT ck_inventory_stock_nonnegative
        CHECK (stock_on_hand >= 0 AND available_stock >= 0 AND allocated_stock >= 0)
        NOT VALID
    `).catch((e: any) => {
      if (e?.code !== "42710") throw e;
    });

    await client.query(`
      ALTER TABLE stock_movements
        ADD CONSTRAINT ck_stock_movement_quantity_positive
        CHECK (quantity > 0)
        NOT VALID
    `).catch((e: any) => {
      if (e?.code !== "42710") throw e;
    });

    // Useful indexes for atomic stock operations and reconciliation.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_sku_location ON inventory (sku_id, location_type, location_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements (reference_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_visit ON transactions (visit_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_salesman_date ON transactions (salesman_id, created_at)`);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
