import { sqlDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";

export type VolumeTarget = {
  salesmanId: string;
  skuId: string;
  targetQty: number;
};

/**
 * Calculates DMS target achievement from valid transaction quantities.
 * Monetary transaction values are deliberately not used as achievement.
 */
export async function getVolumeTargetAchievement(args: {
  from: string;
  to: string;
  targets: VolumeTarget[];
}) {
  if (!args.from || !args.to) throw new Error("TARGET_PERIOD_REQUIRED");
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
    WHERE DATE(t.created_at) BETWEEN ${args.from}::date AND ${args.to}::date
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
    const achievementPercent = target.targetQty === 0 ? 0 : (achievedQty / target.targetQty) * 100;
    return {
      salesmanId: target.salesmanId,
      skuId: target.skuId,
      targetQty: target.targetQty,
      achievedQty,
      achievementPercent: Math.round(achievementPercent * 100) / 100,
    };
  });
}
