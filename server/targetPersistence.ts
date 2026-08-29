import { eq } from "drizzle-orm";
import { sqlDb } from "../src/db/index.js";
import { targets as pgTargets } from "../src/db/schema.js";
import { Target } from "./data.js";

/**
 * Keeps the legacy in-memory target API and PostgreSQL target table aligned.
 * target_volume is stored in targets.target_volume, never target_revenue.
 */
export async function upsertTargetToPostgres(target: Target): Promise<void> {
  await sqlDb.insert(pgTargets).values({
    id: target._id,
    salesmanId: target.salesman_id || "ALL",
    periodMonth: target.period || "0000-00",
    targetRevenue: 0,
    targetVolume: Math.max(0, Math.trunc(Number(target.target_volume) || 0)),
    metadata: {
      target_code: target.target_code,
      area_id: target.area_id,
      product_id: target.product_id,
      sku_id: target.sku_id,
      unit: target.unit,
      from_date: target.from_date,
      to_date: target.to_date,
      status: target.status,
      notes: target.notes,
    },
  }).onConflictDoUpdate({
    target: pgTargets.id,
    set: {
      salesmanId: target.salesman_id || "ALL",
      periodMonth: target.period || "0000-00",
      targetVolume: Math.max(0, Math.trunc(Number(target.target_volume) || 0)),
      metadata: {
        target_code: target.target_code,
        area_id: target.area_id,
        product_id: target.product_id,
        sku_id: target.sku_id,
        unit: target.unit,
        from_date: target.from_date,
        to_date: target.to_date,
        status: target.status,
        notes: target.notes,
      },
    },
  });
}

export async function deleteTargetFromPostgres(targetId: string): Promise<void> {
  await sqlDb.delete(pgTargets).where(eq(pgTargets.id, targetId));
}
