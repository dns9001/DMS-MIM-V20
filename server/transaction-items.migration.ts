import { pool } from "../src/db/index.js";

export async function ensureTransactionItemsTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaction_items (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        sku_id TEXT NOT NULL,
        product_id TEXT,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        volume INTEGER NOT NULL CHECK (volume > 0),
        unit_price DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
        discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
        subtotal DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS transaction_items_transaction_idx ON transaction_items(transaction_id);
      CREATE INDEX IF NOT EXISTS transaction_items_sku_idx ON transaction_items(sku_id);
      CREATE INDEX IF NOT EXISTS transaction_items_product_idx ON transaction_items(product_id);
    `);
  } finally {
    client.release();
  }
}
