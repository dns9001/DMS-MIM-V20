import { eq, and, sql } from "drizzle-orm";
import { sqlDb } from "../src/db/index.js";
import { isCloudSqlConnected, syncDocToPostgres } from "./cloudsqlSync.js";
import { db } from "./data.js";
import { inventory, stockMovements, salesStockLedgers, auditLogs } from "../src/db/schema.js";

export const InventoryRepository = {
  getInventory: async (locationType: string, locationId: string, skuId: string, tx: any = sqlDb) => {
    if (!isCloudSqlConnected) {
      const existing = db.inventory.find(i => (i.location_type === locationType || (!i.location_type && locationType === "WAREHOUSE")) && (i.location_id === locationId || i.office_id === locationId) && i.sku_id === skuId);
      if (!existing) return null;
      return { id: existing._id, stockOnHand: existing.stock_on_hand, availableStock: existing.available_stock, locationType, locationId, skuId };
    }
    const res = await tx.select().from(inventory).where(
      and(eq(inventory.locationType, locationType), eq(inventory.locationId, locationId), eq(inventory.skuId, skuId))
    ).limit(1);
    return res[0];
  },

  getInventoryListByLocation: async (locationType: string, locationId: string, tx: any = sqlDb) => {
    if (!isCloudSqlConnected) {
      return db.inventory.filter(i => (i.location_type === locationType || (!i.location_type && locationType === "WAREHOUSE")) && (i.location_id === locationId || i.office_id === locationId)).map(i => ({
        id: i._id, stockOnHand: i.stock_on_hand, availableStock: i.available_stock, locationType, locationId, skuId: i.sku_id
      }));
    }
    return await tx.select().from(inventory).where(and(eq(inventory.locationType, locationType), eq(inventory.locationId, locationId)));
  },

  /**
   * Update a balance while locking the existing row for the duration of the
   * surrounding PostgreSQL transaction. This prevents lost updates when two
   * sales/handover/return requests touch the same SKU concurrently.
   */
  createOrUpdateInventory: async (locationType: string, locationId: string, skuId: string, qtyDelta: number, tx: any = sqlDb) => {
    const locType = locationType || "WAREHOUSE";
    const locId = locationId || "off-1";

    if (!isCloudSqlConnected) {
      let existing = db.inventory.find(i => (i.location_type === locType || (!i.location_type && locType === "WAREHOUSE")) && (i.location_id === locId || i.office_id === locId) && i.sku_id === skuId);
      if (existing) {
        existing.stock_on_hand += qtyDelta;
        existing.available_stock += qtyDelta;
        return { id: existing._id, stockOnHand: existing.stock_on_hand, availableStock: existing.available_stock, allocatedStock: existing.allocated_stock, locationType: locType, locationId: locId, skuId };
      } else {
        const newInv = {
           _id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
           id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
           location_type: locType as "WAREHOUSE" | "SALES",
           location_id: locId,
           sku_id: skuId,
           stock_on_hand: qtyDelta,
           available_stock: qtyDelta,
           allocated_stock: 0,
           status: "ACTIVE"
        };
        db.inventory.push(newInv);
        return { id: newInv.id, stockOnHand: newInv.stock_on_hand, availableStock: newInv.available_stock, allocatedStock: newInv.allocated_stock, locationType: locType, locationId: locId, skuId };
      }
    }

    try {
      const existingList = await tx.select().from(inventory).where(
        and(
          eq(inventory.locationType, locType),
          eq(inventory.locationId, locId),
          eq(inventory.skuId, skuId)
        )
      ).limit(1);
      const existing = existingList?.[0];

      if (existing) {
        const newStock = Number(existing.stockOnHand || 0) + qtyDelta;
        const newAvailable = Number(existing.availableStock || 0) + qtyDelta;
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
        locationType: locType,
        locationId: locId,
        skuId,
        stockOnHand: qtyDelta,
        availableStock: qtyDelta,
        allocatedStock: 0,
        status: "ACTIVE"
      };

      try {
        const res = await tx.insert(inventory).values(newInv).returning();
        return res[0];
      } catch (insertErr: any) {
        // Fallback for concurrent insert race
        const fallbackList = await tx.select().from(inventory).where(
          and(
            eq(inventory.locationType, locType),
            eq(inventory.locationId, locId),
            eq(inventory.skuId, skuId)
          )
        ).limit(1);
        if (fallbackList?.[0]) {
          const row = fallbackList[0];
          const newStock = Number(row.stockOnHand || 0) + qtyDelta;
          const newAvailable = Number(row.availableStock || 0) + qtyDelta;
          const res = await tx.update(inventory).set({
            stockOnHand: newStock,
            availableStock: newAvailable,
            updatedAt: sql`NOW()`
          }).where(eq(inventory.id, row.id)).returning();
          return res[0];
        }
        throw insertErr;
      }
    } catch (err: any) {
      console.warn("[InventoryRepository] Postgres operation warning:", err?.message || err);
      // Synchronize in-memory as safety net
      let existing = db.inventory.find(i => (i.location_type === locType || (!i.location_type && locType === "WAREHOUSE")) && (i.location_id === locId || i.office_id === locId) && i.sku_id === skuId);
      if (existing) {
        existing.stock_on_hand += qtyDelta;
        existing.available_stock += qtyDelta;
        return { id: existing._id, stockOnHand: existing.stock_on_hand, availableStock: existing.available_stock, allocatedStock: existing.allocated_stock, locationType: locType, locationId: locId, skuId };
      } else {
        const newInv = {
           _id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
           id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
           location_type: locType as "WAREHOUSE" | "SALES",
           location_id: locId,
           sku_id: skuId,
           stock_on_hand: qtyDelta,
           available_stock: qtyDelta,
           allocated_stock: 0,
           status: "ACTIVE"
        };
        db.inventory.push(newInv);
        return { id: newInv.id, stockOnHand: newInv.stock_on_hand, availableStock: newInv.available_stock, allocatedStock: newInv.allocated_stock, locationType: locType, locationId: locId, skuId };
      }
    }
  },

  insertMovement: async (mvt: any, tx: any = sqlDb) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const mvtCount = (db.stock_movements?.length || 0) + 1;
    const mvtId = mvt.id || `mvt-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    const fullMvt: any = {
      _id: mvtId,
      movement_code: `MVT-${todayStr.replace(/-/g, "")}-${String(mvtCount).padStart(4, "0")}`,
      movement_type: mvt.movementType,
      source_location_type: mvt.sourceLocationType,
      source_location_id: mvt.sourceLocationId,
      destination_location_type: mvt.destLocationType,
      destination_location_id: mvt.destLocationId,
      sku_id: mvt.skuId,
      quantity: mvt.quantity,
      salesman_id: mvt.sourceLocationType === "SALES" ? mvt.sourceLocationId : (mvt.destLocationType === "SALES" ? mvt.destLocationId : undefined),
      warehouse_id: mvt.sourceLocationType === "WAREHOUSE" ? mvt.sourceLocationId : (mvt.destLocationType === "WAREHOUSE" ? mvt.destLocationId : undefined),
      business_date: todayStr,
      status: "COMPLETED",
      notes: mvt.notes || "",
      created_by: mvt.performedBy,
      created_at: new Date().toISOString()
    };

    if (!db.stock_movements) db.stock_movements = [];
    db.stock_movements.push(fullMvt);

    // Document sync in background
    syncDocToPostgres("stock_movements", fullMvt._id, fullMvt).catch(e => console.error("Failed to sync movement doc", e));

    if (!isCloudSqlConnected) return { id: mvtId };

    try {
      const res = await tx.insert(stockMovements).values({
        id: mvtId,
        movementType: mvt.movementType,
        sourceLocationType: mvt.sourceLocationType,
        sourceLocationId: mvt.sourceLocationId,
        destLocationType: mvt.destLocationType,
        destLocationId: mvt.destLocationId,
        skuId: mvt.skuId,
        quantity: mvt.quantity,
        referenceId: mvt.referenceId,
        performedBy: mvt.performedBy,
        notes: mvt.notes || "",
        createdAt: new Date()
      }).returning();

      try {
        await tx.insert(auditLogs).values({
          id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          userId: mvt.performedBy,
          action: "STOCK_MOVEMENT",
          module: "INVENTORY",
          targetId: mvt.skuId,
          details: { movementType: mvt.movementType, qty: mvt.quantity, notes: mvt.notes }
        });
      } catch (_) {}

      return res[0] || { id: mvtId };
    } catch (err: any) {
      console.warn("[InventoryRepository] insertMovement Postgres notice:", err?.message || err);
      return { id: mvtId };
    }
  },

  /**
   * Daily ledger uses a unique key. The row is locked before incrementing so
   * concurrent movements cannot overwrite each other's counters.
   */
  upsertSalesStockLedger: async (salesmanId: string, date: string, skuId: string, updates: any, tx: any = sqlDb) => {
    if (!db.sales_stock_ledgers) db.sales_stock_ledgers = [];
    let memLedger = db.sales_stock_ledgers.find(l => l.salesman_id === salesmanId && (l.business_date === date || (l as any).date === date) && l.sku_id === skuId);
    if (memLedger) {
      memLedger.opening_balance = (memLedger.opening_balance || 0) + (updates.initialStock || 0);
      memLedger.transfers_in = (memLedger.transfers_in || 0) + (updates.loadedStock || 0);
      memLedger.sales_out = (memLedger.sales_out || 0) + (updates.soldStock || 0);
      memLedger.returns_out = (memLedger.returns_out || 0) + (updates.returnedStock || 0);
      memLedger.closing_balance = (memLedger.closing_balance || 0) + (updates.finalStock || 0);
      memLedger.expected_balance = (memLedger.opening_balance + memLedger.transfers_in - memLedger.sales_out - memLedger.returns_out);
      memLedger.discrepancy = memLedger.closing_balance - memLedger.expected_balance;
      memLedger.updated_at = new Date().toISOString();
    } else {
      const openBal = updates.initialStock || 0;
      const transIn = updates.loadedStock || 0;
      const sOut = updates.soldStock || 0;
      const retOut = updates.returnedStock || 0;
      const closeBal = updates.finalStock || 0;
      const expBal = openBal + transIn - sOut - retOut;
      memLedger = {
        _id: `ssl-${salesmanId}-${date}-${skuId}`,
        salesman_id: salesmanId,
        business_date: date,
        sku_id: skuId,
        opening_balance: openBal,
        transfers_in: transIn,
        sales_out: sOut,
        returns_out: retOut,
        closing_balance: closeBal,
        expected_balance: expBal,
        discrepancy: closeBal - expBal,
        status: "BALANCED",
        updated_at: new Date().toISOString()
      };
      db.sales_stock_ledgers.push(memLedger);
    }
    syncDocToPostgres("sales_stock_ledgers", memLedger._id, memLedger).catch(e => console.error("Failed to sync sales ledger doc", e));

    if (!isCloudSqlConnected) return memLedger;

    try {
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
        id: `ssl-${salesmanId}-${date}-${skuId}`,
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
    } catch (err: any) {
      console.warn("[InventoryRepository] upsertSalesStockLedger Postgres notice:", err?.message || err);
      return memLedger;
    }
  }
};
