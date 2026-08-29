import { pgTable, text, integer, timestamp, doublePrecision, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Normalized sales lines. The legacy transactions.items JSONB is retained for
 * backward compatibility, while new postings also persist one row per SKU.
 */
export const transactionItems = pgTable("transaction_items", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").notNull(),
  skuId: text("sku_id").notNull(),
  productId: text("product_id"),
  quantity: integer("quantity").notNull(),
  volume: integer("volume").notNull(),
  unitPrice: doublePrecision("unit_price").default(0),
  discountAmount: doublePrecision("discount_amount").default(0),
  subtotal: doublePrecision("subtotal").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  transactionIdx: index("transaction_items_transaction_idx").on(table.transactionId),
  skuIdx: index("transaction_items_sku_idx").on(table.skuId),
}));
