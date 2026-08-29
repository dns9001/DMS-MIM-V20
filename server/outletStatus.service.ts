import { sqlDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";

export type OutletLifecycleStatus = "NOO" | "Repeat" | "Active" | "Dormant";

/**
 * Canonical outlet lifecycle derived from valid PostgreSQL transactions.
 * Transaction count is based on distinct transaction records, not invoices/items.
 * Dormant takes precedence once the outlet has had no valid purchase for 8 weeks.
 */
export async function getOutletLifecycleStatus(outletId: string, asOfDate?: string) {
  const result = await sqlDb.execute(sql`
    WITH purchases AS (
      SELECT t.id, DATE(t.created_at) AS purchase_date
      FROM transactions t
      WHERE t.outlet_id = ${outletId}
        AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
        AND (${asOfDate ? sql`DATE(t.created_at) <= ${asOfDate}::date` : sql`TRUE`})
      GROUP BY t.id, DATE(t.created_at)
    ), summary AS (
      SELECT COUNT(*)::int AS purchase_count, MAX(purchase_date) AS last_purchase_date
      FROM purchases
    )
    SELECT
      purchase_count,
      last_purchase_date,
      CASE
        WHEN last_purchase_date IS NOT NULL
          AND (${asOfDate ? sql`${asOfDate}::date` : sql`CURRENT_DATE`} - last_purchase_date) >= 56
          THEN 'Dormant'
        WHEN purchase_count = 0 THEN 'NOO'
        WHEN purchase_count = 1 THEN 'NOO'
        WHEN purchase_count = 2 THEN 'Repeat'
        ELSE 'Active'
      END AS status
    FROM summary
  `);

  const row = result.rows[0] as any;
  return {
    outlet_id: outletId,
    status: String(row?.status || "NOO") as OutletLifecycleStatus,
    transaction_count: Number(row?.purchase_count || 0),
    last_purchase_date: row?.last_purchase_date ? String(row.last_purchase_date).slice(0, 10) : null,
  };
}

export async function getOutletLifecycleStatuses(outletIds: string[], asOfDate?: string) {
  if (!outletIds.length) return [];
  const result = await sqlDb.execute(sql`
    WITH purchases AS (
      SELECT t.outlet_id, t.id, DATE(t.created_at) AS purchase_date
      FROM transactions t
      WHERE t.outlet_id IN (${sql.join(outletIds.map((id) => sql`${id}`), sql`, `)})
        AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
        AND (${asOfDate ? sql`DATE(t.created_at) <= ${asOfDate}::date` : sql`TRUE`})
      GROUP BY t.outlet_id, t.id, DATE(t.created_at)
    ), summary AS (
      SELECT outlet_id, COUNT(*)::int AS purchase_count, MAX(purchase_date) AS last_purchase_date
      FROM purchases
      GROUP BY outlet_id
    )
    SELECT outlet_id, purchase_count, last_purchase_date,
      CASE
        WHEN last_purchase_date IS NOT NULL
          AND (${asOfDate ? sql`${asOfDate}::date` : sql`CURRENT_DATE`} - last_purchase_date) >= 56 THEN 'Dormant'
        WHEN purchase_count <= 1 THEN 'NOO'
        WHEN purchase_count = 2 THEN 'Repeat'
        ELSE 'Active'
      END AS status
    FROM summary
  `);

  const found = new Map(result.rows.map((r: any) => [String(r.outlet_id), r]));
  return outletIds.map((outletId) => {
    const row = found.get(outletId) as any;
    return {
      outlet_id: outletId,
      status: String(row?.status || "NOO") as OutletLifecycleStatus,
      transaction_count: Number(row?.purchase_count || 0),
      last_purchase_date: row?.last_purchase_date ? String(row.last_purchase_date).slice(0, 10) : null,
    };
  });
}
