import sys

with open("server/inventory.repository.ts", "r") as f:
    content = f.read()

target = """  insertMovement: async (mvt: any, tx: any = sqlDb) => {
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
    
    return res[0];
  },"""

replacement = """  insertMovement: async (mvt: any, tx: any = sqlDb) => {
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
    const { db } = require('./data.js');
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
  },"""

content = content.replace(target, replacement)

# Fix upsertSalesStockLedger memory sync
target_ledger = """  upsertSalesStockLedger: async (salesmanId: string, date: string, skuId: string, updates: any, tx: any = sqlDb) => {
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
  }"""

replacement_ledger = """  upsertSalesStockLedger: async (salesmanId: string, date: string, skuId: string, updates: any, tx: any = sqlDb) => {
    const existing = await tx.select().from(salesStockLedgers).where(
      and(
        eq(salesStockLedgers.salesmanId, salesmanId),
        eq(salesStockLedgers.date, date),
        eq(salesStockLedgers.skuId, skuId)
      )
    ).limit(1);
    
    let resRow;
    if (existing.length > 0) {
      const current = existing[0];
      const res = await tx.update(salesStockLedgers).set({
        initialStock: current.initialStock + (updates.initialStock || 0),
        loadedStock: current.loadedStock + (updates.loadedStock || 0),
        soldStock: current.soldStock + (updates.soldStock || 0),
        returnedStock: current.returnedStock + (updates.returnedStock || 0),
        finalStock: current.finalStock + (updates.finalStock || 0),
      }).where(eq(salesStockLedgers.id, current.id)).returning();
      resRow = res[0];
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
      resRow = res[0];
    }
    
    // SYNC MEMORY CACHE (db.sales_stock_ledgers)
    const { db } = require('./data.js');
    const memLedg = db.sales_stock_ledgers.find((l: any) => l.salesman_id === salesmanId && l.date === date && l.sku_id === skuId);
    if (memLedg) {
      memLedg.initial_stock = resRow.initialStock;
      memLedg.loaded_stock = resRow.loadedStock;
      memLedg.sold_stock = resRow.soldStock;
      memLedg.returned_stock = resRow.returnedStock;
      memLedg.final_stock = resRow.finalStock;
    } else {
      db.sales_stock_ledgers.push({
        _id: resRow.id,
        salesman_id: resRow.salesmanId,
        date: resRow.date,
        sku_id: resRow.skuId,
        initial_stock: resRow.initialStock,
        loaded_stock: resRow.loadedStock,
        sold_stock: resRow.soldStock,
        returned_stock: resRow.returnedStock,
        final_stock: resRow.finalStock,
        created_at: resRow.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: resRow.updatedAt?.toISOString() || new Date().toISOString()
      });
    }
    
    return resRow;
  }"""

content = content.replace(target_ledger, replacement_ledger)

with open("server/inventory.repository.ts", "w") as f:
    f.write(content)
