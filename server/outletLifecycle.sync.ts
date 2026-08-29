import { sqlDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";

/**
 * Synchronizes persisted outlet status from canonical transaction history.
 * Run after transaction posting/cancellation and from a scheduled maintenance job.
 */
export async function syncOutletLifecycleStatuses(asOfDate?: string) {
  const asOf = asOfDate ? sql`${asOfDate}::date` : sql`CURRENT_DATE`;

  return sqlDb.transaction(async (tx) => {
    const result = await tx.execute(sql`
      WITH summary AS (
        SELECT
          o.id AS outlet_id,
          COUNT(t.id)::int AS purchase_count,
          MAX(DATE(t.created_at)) AS last_purchase_date
        FROM outlets o
        LEFT JOIN transactions t
          ON t.outlet_id = o.id
         AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
         AND DATE(t.created_at) <= ${asOf}
        GROUP BY o.id
      ), calculated AS (
        SELECT outlet_id, purchase_count, last_purchase_date,
          CASE
            WHEN last_purchase_date IS NOT NULL AND (${asOf} - last_purchase_date) >= 56 THEN 'Dormant'
            WHEN purchase_count = 0 THEN 'PROSPECT'
            WHEN purchase_count = 1 THEN 'NOO'
            WHEN purchase_count = 2 THEN 'Repeat'
            ELSE 'Active'
          END AS status
        FROM summary
      )
      UPDATE outlets o
      SET status = c.status,
          updated_at = NOW()
      FROM calculated c
      WHERE o.id = c.outlet_id
        AND COALESCE(o.status, '') <> c.status
      RETURNING o.id AS outlet_id, c.status, c.purchase_count, c.last_purchase_date
    `);

    return result.rows;
  });
}
