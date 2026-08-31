import { pool } from "../src/db/index.js";

/**
 * Phase 4 database safeguards.
 * These are intentionally idempotent so startup/migration can run repeatedly.
 */
export async function ensurePhase4Integrity(): Promise<void> {
  const client = await pool.connect();
  try {
    const runQuery = async (sql: string) => {
      try {
        await client.query(sql);
      } catch (e: any) {
        if (e?.code !== "42710" && !String(e?.message).includes("must be owner")) {
          console.warn("[PostgreSQL] Phase4 integrity check warning:", String(e?.message).substring(0, 100));
        }
      }
    };

    // Inventory must have exactly one balance row per location + SKU.
    await runQuery(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_location_sku
      ON inventory (location_type, location_id, sku_id)
    `);

    // One daily ledger per salesman/SKU.
    await runQuery(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_stock_ledger_daily
      ON sales_stock_ledgers (salesman_id, date, sku_id)
    `);

    // Business-safe quantity constraints.
    await runQuery(`
      ALTER TABLE inventory
        ADD CONSTRAINT ck_inventory_stock_nonnegative
        CHECK (stock_on_hand >= 0 AND available_stock >= 0 AND allocated_stock >= 0)
        NOT VALID
    `);

    await runQuery(`
      ALTER TABLE stock_movements
        ADD CONSTRAINT ck_stock_movement_quantity_positive
        CHECK (quantity > 0)
        NOT VALID
    `);

    // Useful indexes for atomic stock operations and reconciliation.
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_inventory_sku_location ON inventory (sku_id, location_type, location_id)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements (reference_id)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_transactions_visit ON transactions (visit_id)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_transactions_salesman_date ON transactions (salesman_id, created_at)`);

  } catch (error) {
    console.error("[PostgreSQL] Phase 4 integrity error:", error);
  } finally {
    client.release();
  }
}
