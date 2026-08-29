import { sqlDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";
import { assertAdjustmentRole, assertPositiveQuantity, assertSufficientStock } from "./inventoryPolicy.js";

/**
 * Atomic stock operations. Callers must invoke these inside the same logical
 * transaction as the business document they are posting.
 */
export async function transferStock(args: {
  skuId: string;
  quantity: number;
  sourceLocationType: string;
  sourceLocationId: string;
  destLocationType: string;
  destLocationId: string;
  performedBy: string;
  referenceId?: string;
}) {
  assertPositiveQuantity(args.quantity);

  return sqlDb.transaction(async (tx) => {
    const source = await tx.execute(sql`
      SELECT id, stock_on_hand, available_stock
      FROM inventory
      WHERE location_type = ${args.sourceLocationType}
        AND location_id = ${args.sourceLocationId}
        AND sku_id = ${args.skuId}
      FOR UPDATE
    `);

    const sourceRow: any = source.rows[0];
    if (!sourceRow) throw new Error("SOURCE_STOCK_NOT_FOUND");
    assertSufficientStock(Number(sourceRow.available_stock ?? sourceRow.stock_on_hand ?? 0), args.quantity);

    const destination = await tx.execute(sql`
      SELECT id
      FROM inventory
      WHERE location_type = ${args.destLocationType}
        AND location_id = ${args.destLocationId}
        AND sku_id = ${args.skuId}
      FOR UPDATE
    `);

    if (!destination.rows[0]) {
      await tx.execute(sql`
        INSERT INTO inventory (id, location_type, location_id, sku_id, stock_on_hand, available_stock)
        VALUES (${crypto.randomUUID()}, ${args.destLocationType}, ${args.destLocationId}, ${args.skuId}, 0, 0)
      `);
    }

    await tx.execute(sql`
      UPDATE inventory
      SET stock_on_hand = stock_on_hand - ${args.quantity},
          available_stock = available_stock - ${args.quantity},
          updated_at = NOW()
      WHERE location_type = ${args.sourceLocationType}
        AND location_id = ${args.sourceLocationId}
        AND sku_id = ${args.skuId}
    `);

    await tx.execute(sql`
      UPDATE inventory
      SET stock_on_hand = stock_on_hand + ${args.quantity},
          available_stock = available_stock + ${args.quantity},
          updated_at = NOW()
      WHERE location_type = ${args.destLocationType}
        AND location_id = ${args.destLocationId}
        AND sku_id = ${args.skuId}
    `);

    await tx.execute(sql`
      INSERT INTO stock_movements
        (id, movement_type, source_location_type, source_location_id,
         dest_location_type, dest_location_id, sku_id, quantity, reference_id, performed_by)
      VALUES
        (${crypto.randomUUID()}, 'TRANSFER', ${args.sourceLocationType}, ${args.sourceLocationId},
         ${args.destLocationType}, ${args.destLocationId}, ${args.skuId}, ${args.quantity},
         ${args.referenceId ?? null}, ${args.performedBy})
    `);

    return { ok: true, skuId: args.skuId, quantity: args.quantity };
  });
}

export async function adjustStock(args: {
  role: string;
  skuId: string;
  locationType: string;
  locationId: string;
  quantityDelta: number;
  performedBy: string;
  reason: string;
}) {
  assertAdjustmentRole(args.role);
  if (!Number.isInteger(args.quantityDelta) || args.quantityDelta === 0) {
    throw new Error("INVALID_STOCK_ADJUSTMENT");
  }

  return sqlDb.transaction(async (tx) => {
    const current = await tx.execute(sql`
      SELECT id, stock_on_hand, available_stock
      FROM inventory
      WHERE location_type = ${args.locationType}
        AND location_id = ${args.locationId}
        AND sku_id = ${args.skuId}
      FOR UPDATE
    `);
    const row: any = current.rows[0];
    if (!row) throw new Error("STOCK_NOT_FOUND");
    if (Number(row.stock_on_hand) + args.quantityDelta < 0) throw new Error("INSUFFICIENT_STOCK");

    await tx.execute(sql`
      UPDATE inventory
      SET stock_on_hand = stock_on_hand + ${args.quantityDelta},
          available_stock = available_stock + ${args.quantityDelta},
          updated_at = NOW()
      WHERE id = ${row.id}
    `);

    await tx.execute(sql`
      INSERT INTO stock_movements
        (id, movement_type, source_location_type, source_location_id,
         dest_location_type, dest_location_id, sku_id, quantity, performed_by, notes)
      VALUES
        (${crypto.randomUUID()}, 'ADJUSTMENT', ${args.locationType}, ${args.locationId},
         NULL, NULL, ${args.skuId}, ${Math.abs(args.quantityDelta)}, ${args.performedBy}, ${args.reason})
    `);

    return { ok: true, skuId: args.skuId, quantityDelta: args.quantityDelta };
  });
}
