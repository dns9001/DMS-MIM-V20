import { eq, and, sql } from "drizzle-orm";
import { sqlDb } from "../src/db/index.js";
import { inventory, stockMovements, salesStockLedgers, auditLogs } from "../src/db/schema.js";

export const InventoryRepository = {
  getInventory: async (locationType: string, locationId: string, skuId: string, tx: any = sqlDb) => {
    const res = await tx.select().from(inventory).where(
      and(eq(inventory.locationType, locationType), eq(inventory.locationId, locationId), eq(inventory.skuId, skuId))
    ).limit(1);
    return res[0];
  },

  getInventoryListByLocation: async (locationType: string, locationId: string, tx: any = sqlDb) => {
    return await tx.select().from(inventory).where(and(eq(inventory.locationType, locationType), eq(inventory.locationId, locationId)));
  },

  /**
   * Update a balance while locking the existing row for the duration of the
   * surrounding PostgreSQL transaction. This prevents lost updates when two
   * sales/handover/return requests touch the same SKU concurrently.
   */
  createOrUpdateInventory: async (locationType: string, locationId: string, skuId: string, qtyDelta: number, tx: any = sqlDb) => {
    const locked = await tx.execute(sql`
      SELECT id, stock_on_hand, available_stock, allocated_stock, location_type, location_id, sku_id, status
      FROM inventory
      WHERE location_type = ${locationType}
        AND location_id = ${locationId}
        AND sku_id = ${skuId}
      FOR UPDATE
    `);
    const existing = locked.rows?.[0];

    if (existing) {
      const newStock = Number(existing.stock_on_hand) + qtyDelta;
      const newAvailable = Number(existing.available_stock) + qtyDelta;
      if (newStock < 0 || newAvailable < 0) throw new Error("Stok tidak mencukupi untuk transaksi ini.");

      const res = await tx.update(inventory).set({
        stockOnHand: newStock,
        availableStock: newAvailable,
        updatedAt: sql`NOW()`
      }).where(eq(inventory.id, existing.id)).returning();
      return res[0];
    }

    if (qtyDelta < 0) throw new Error("Stok awal tidak mencukupi.");
    const newInv = {
      id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      locationType,
      locationId,
      skuId,
      stockOnHand: qtyDelta,
      availableStock: qtyDelta,
      allocatedStock: 0,
      status: "ACTIVE"
    };
    const res = await tx.insert(inventory).values(newInv).returning();
    return res[0];
  },

  insertMovement: async (mvt: any, tx: any = sqlDb) => {
    // Movement and audit are part of the caller's DB transaction. Do not mutate
    // the in-memory cache here: if the transaction rolls back, the cache would
    // otherwise contain a movement that does not exist in PostgreSQL.
    const res = await tx.insert(stockMovements).values(mvt).returning();

    await tx.insert(auditLogs).values({
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      userId: mvt.performedBy,
      action: "STOCK_MOVEMENT",
      module: "INVENTORY",
      targetId: mvt.skuId,
      details: { movementType: mvt.movementType, qty: mvt.quantity, notes: mvt.notes }
    });

    return res[0];
  },

  /**
   * Daily ledger uses a unique key. The row is locked before incrementing so
   * concurrent movements cannot overwrite each other's counters.
   */
  upsertSalesStockLedger: async (salesmanId: string, date: string, skuId: string, updates: any, tx: any = sqlDb) => {
    const locked = await tx.execute(sql`
      SELECT id, initial_stock, loaded_stock, sold_stock, returned_stock, final_stock
      FROM sales_stock_ledgers
      WHERE salesman_id = ${salesmanId}
        AND date = ${date}
        AND sku_id = ${skuId}
      FOR UPDATE
    `);
    const current = locked.rows?.[0];

    if (current) {
      const res = await tx.update(salesStockLedgers).set({
        initialStock: Number(current.initial_stock) + (updates.initialStock || 0),
        loadedStock: Number(current.loaded_stock) + (updates.loadedStock || 0),
        soldStock: Number(current.sold_stock) + (updates.soldStock || 0),
        returnedStock: Number(current.returned_stock) + (updates.returnedStock || 0),
        finalStock: Number(current.final_stock) + (updates.finalStock || 0),
      }).where(eq(salesStockLedgers.id, current.id)).returning();
      return res[0];
    }

    const newLedger = {
      id: `ledg-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      salesmanId,
      date,
      skuId,
      initialStock: updates.initialStock || 0,
      loadedStock: updates.loadedStock || 0,
      soldStock: updates.soldStock || 0,
      returnedStock: updates.returnedStock || 0,
      finalStock: updates.finalStock || 0,
    };
    const res = await tx.insert(salesStockLedgers).values(newLedger).returning();
    return res[0];
  }
};
