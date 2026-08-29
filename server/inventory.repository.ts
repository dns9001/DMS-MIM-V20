import { eq, and, sql } from "drizzle-orm";
import { sqlDb } from "../src/db/index.js";
import { inventory, stockMovements, salesStockLedgers, stockHandovers, stockReturns, stockReceivings, auditLogs } from "../src/db/schema.js";

export const InventoryRepository = {
  getInventory: async (locationType: string, locationId: string, skuId: string, tx: any = sqlDb) => {
    const res = await tx.select().from(inventory).where(
      and(
        eq(inventory.locationType, locationType),
        eq(inventory.locationId, locationId),
        eq(inventory.skuId, skuId)
      )
    ).limit(1);
    return res[0];
  },
  
  getInventoryListByLocation: async (locationType: string, locationId: string, tx: any = sqlDb) => {
    return await tx.select().from(inventory).where(
      and(
        eq(inventory.locationType, locationType),
        eq(inventory.locationId, locationId)
      )
    );
  },
  
  createOrUpdateInventory: async (locationType: string, locationId: string, skuId: string, qtyDelta: number, tx: any = sqlDb) => {
    const existing = await InventoryRepository.getInventory(locationType, locationId, skuId, tx);
    
    if (existing) {
      const newStock = existing.stockOnHand + qtyDelta;
      const newAvailable = existing.availableStock + qtyDelta;
      if (newStock < 0 || newAvailable < 0) throw new Error("Stok tidak mencukupi untuk transaksi ini.");
      
      const res = await tx.update(inventory).set({
        stockOnHand: newStock,
        availableStock: newAvailable,
        updatedAt: sql`NOW()`
      }).where(eq(inventory.id, existing.id)).returning();
      return res[0];
    } else {
      if (qtyDelta < 0) throw new Error("Stok awal tidak mencukupi.");
      const newInv = {
        id: `inv-${Date.now()}-${Math.floor(Math.random()*1000)}`,
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
    }
  },

  insertMovement: async (mvt: any, tx: any = sqlDb) => {
    const res = await tx.insert(stockMovements).values(mvt).returning();
    
    // Add Audit Log
    await tx.insert(auditLogs).values({
      id: `audit-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      userId: mvt.performedBy,
      action: "STOCK_MOVEMENT",
      module: "INVENTORY",
      targetId: mvt.skuId,
      details: { movementType: mvt.movementType, qty: mvt.quantity, notes: mvt.notes }
    });
    
    // SYNC MEMORY CACHE (db.stock_movements)
    const { db } = await import('./data.js');
    db.stock_movements.push({
      _id: res[0].id,
      movement_code: res[0].id,
      movement_type: res[0].movementType as any,
      source_location_type: res[0].sourceLocationType as any,
      source_location_id: res[0].sourceLocationId || "",
      destination_location_type: res[0].destLocationType as any,
      destination_location_id: res[0].destLocationId || "",
      sku_id: res[0].skuId,
      quantity: res[0].quantity,
      warehouse_id: res[0].sourceLocationType === "WAREHOUSE" ? res[0].sourceLocationId : (res[0].destLocationType === "WAREHOUSE" ? res[0].destLocationId : ""),
      salesman_id: res[0].sourceLocationType === "SALES" ? res[0].sourceLocationId : (res[0].destLocationType === "SALES" ? res[0].destLocationId : ""),
      reference_id: res[0].referenceId || "",
      business_date: res[0].createdAt?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10),
      status: "COMPLETED",
      notes: res[0].notes || "",
      created_by: mvt.performedBy || "",
      created_at: res[0].createdAt?.toISOString() || new Date().toISOString()
    });
    
    return res[0];
  },

  upsertSalesStockLedger: async (salesmanId: string, date: string, skuId: string, updates: any, tx: any = sqlDb) => {
    const existing = await tx.select().from(salesStockLedgers).where(
      and(
        eq(salesStockLedgers.salesmanId, salesmanId),
        eq(salesStockLedgers.date, date),
        eq(salesStockLedgers.skuId, skuId)
      )
    ).limit(1);

    if (existing.length > 0) {
      const current = existing[0];
      const res = await tx.update(salesStockLedgers).set({
        initialStock: current.initialStock + (updates.initialStock || 0),
        loadedStock: current.loadedStock + (updates.loadedStock || 0),
        soldStock: current.soldStock + (updates.soldStock || 0),
        returnedStock: current.returnedStock + (updates.returnedStock || 0),
        finalStock: current.finalStock + (updates.finalStock || 0),
      }).where(eq(salesStockLedgers.id, current.id)).returning();
      return res[0];
    } else {
      const newLedger = {
        id: `ledg-${Date.now()}-${Math.floor(Math.random()*1000)}`,
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
  }
};
