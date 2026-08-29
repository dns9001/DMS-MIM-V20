import { sqlDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";

export type VolumeTargetRow = {
  salesmanId: string;
  skuId: string;
  targetQty: number;
};

/**
 * Production-safe target report. Achievement is quantity/volume only.
 * Cancelled transactions are excluded and zero-target rows are retained.
 */
export async function buildVolumeTargetReport(args: {
  from: string;
  to: string;
  targets: VolumeTargetRow[];
}) {
  if (!args.from || !args.to) throw new Error("TARGET_PERIOD_REQUIRED");
  if (args.from > args.to) throw new Error("INVALID_TARGET_PERIOD");

  for (const target of args.targets) {
    if (!target.salesmanId || !target.skuId || !Number.isInteger(target.targetQty) || target.targetQty < 0) {
      throw new Error("INVALID_VOLUME_TARGET");
    }
  }

  const result = await sqlDb.execute(sql`
    SELECT
      t.salesman_id,
      item->>'sku_id' AS sku_id,
      SUM(COALESCE((item->>'quantity')::numeric, 0))::numeric AS achieved_qty
    FROM transactions t
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.items, '[]'::jsonb)) item
    WHERE DATE(t.created_at) >= ${args.from}::date
      AND DATE(t.created_at) < (${args.to}::date + INTERVAL '1 day')
      AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
      AND NULLIF(item->>'sku_id', '') IS NOT NULL
    GROUP BY t.salesman_id, item->>'sku_id'
  `);

  const achieved = new Map<string, number>();
  for (const row of result.rows as any[]) {
    achieved.set(`${row.salesman_id}:${row.sku_id}`, Number(row.achieved_qty || 0));
  }

  return args.targets.map((target) => {
    const achievedQty = achieved.get(`${target.salesmanId}:${target.skuId}`) || 0;
    const achievementPercent = target.targetQty === 0 ? 0 : Math.round((achievedQty / target.targetQty) * 10000) / 100;
    return {
      salesmanId: target.salesmanId,
      skuId: target.skuId,
      targetQty: target.targetQty,
      achievedQty,
      remainingQty: Math.max(0, target.targetQty - achievedQty),
      achievementPercent,
    };
  });
}
