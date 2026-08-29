import { sqlDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";

/**
 * Canonical DMS call metrics. Metrics are derived from PostgreSQL facts,
 * never from client-supplied effective-call flags.
 */
export async function getCallMetrics(date: string, salesmanId?: string) {
  const salesmanFilter = salesmanId ? sql`AND v.salesman_id = ${salesmanId}` : sql``;

  const result = await sqlDb.execute(sql`
    WITH visits_day AS (
      SELECT DISTINCT v.salesman_id, v.outlet_id
      FROM visits v
      WHERE v.status <> 'CANCELLED'
        AND DATE(v.check_in_time) = ${date}
        ${salesmanFilter}
    ),
    purchases_day AS (
      SELECT DISTINCT t.salesman_id, t.outlet_id
      FROM transactions t
      WHERE DATE(t.created_at) = ${date}
        AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
        ${salesmanId ? sql`AND t.salesman_id = ${salesmanId}` : sql``}
    ),
    product_purchases AS (
      SELECT DISTINCT t.salesman_id, t.outlet_id, item->>'sku_id' AS sku_id
      FROM transactions t
      CROSS JOIN LATERAL jsonb_array_elements(t.items) item
      WHERE DATE(t.created_at) = ${date}
        AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
        AND NULLIF(item->>'sku_id', '') IS NOT NULL
        ${salesmanId ? sql`AND t.salesman_id = ${salesmanId}` : sql``}
    )
    SELECT
      (SELECT COUNT(*) FROM visits_day)::int AS outlet_call,
      (SELECT COUNT(*) FROM visits_day v JOIN purchases_day p
         ON p.salesman_id = v.salesman_id AND p.outlet_id = v.outlet_id)::int AS effective_call,
      (SELECT COUNT(*) FROM product_purchases)::int AS ec_product_rows
  `);

  return result.rows[0] ?? { outlet_call: 0, effective_call: 0, ec_product_rows: 0 };
}

export async function getProductEcMetrics(date: string, salesmanId?: string) {
  const result = await sqlDb.execute(sql`
    SELECT
      t.salesman_id,
      item->>'sku_id' AS sku_id,
      COUNT(DISTINCT t.outlet_id)::int AS effective_call,
      SUM(COALESCE((item->>'quantity')::numeric, 0))::numeric AS volume,
      COUNT(*)::int AS transaction_item_count
    FROM transactions t
    CROSS JOIN LATERAL jsonb_array_elements(t.items) item
    WHERE DATE(t.created_at) = ${date}
      AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
      AND NULLIF(item->>'sku_id', '') IS NOT NULL
      ${salesmanId ? sql`AND t.salesman_id = ${salesmanId}` : sql``}
    GROUP BY t.salesman_id, item->>'sku_id'
    ORDER BY item->>'sku_id'
  `);

  return result.rows;
}
