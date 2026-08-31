import sys

def process_file(filename, replacements):
    with open(filename, "r") as f:
        content = f.read()
    
    for target, replacement in replacements:
        if target in content:
            content = content.replace(target, replacement)
        else:
            print(f"Warning: target not found in {filename}")

    with open(filename, "w") as f:
        f.write(content)

# Fix inventory.routes.ts movements
movements_target = """
  const movements = await sqlDb.select().from(stockMovements).where(and(...conditions)).orderBy(desc(stockMovements.createdAt));

  const enriched = movements.map(m => ({
    _id: m.id, movement_code: m.id, movement_type: m.movementType, source_location_type: m.sourceLocationType,
    source_location_id: m.sourceLocationId, destination_location_type: m.destLocationType,
    destination_location_id: m.destLocationId, sku_id: m.skuId, quantity: m.quantity, reference_id: m.referenceId,
    business_date: m.createdAt?.toISOString().slice(0, 10), notes: m.notes, created_by: m.performedBy,
    created_at: m.createdAt?.toISOString(), sku_name: resolveSkuInfo(m.skuId).resolved_name, sku_code: resolveSkuInfo(m.skuId).sku_code
  }));
"""
movements_replacement = """
  let enriched = [];
  if (isCloudSqlConnected) {
    const movements = await sqlDb.select().from(stockMovements).where(and(...conditions)).orderBy(desc(stockMovements.createdAt));
    enriched = movements.map(m => ({
      _id: m.id, movement_code: m.id, movement_type: m.movementType, source_location_type: m.sourceLocationType,
      source_location_id: m.sourceLocationId, destination_location_type: m.destLocationType,
      destination_location_id: m.destLocationId, sku_id: m.skuId, quantity: m.quantity, reference_id: m.referenceId,
      business_date: m.createdAt?.toISOString().slice(0, 10), notes: m.notes, created_by: m.performedBy,
      created_at: m.createdAt?.toISOString(), sku_name: resolveSkuInfo(m.skuId).resolved_name, sku_code: resolveSkuInfo(m.skuId).sku_code
    }));
  } else {
    enriched = db.stock_movements.filter(m => {
      let match = true;
      if (from_date && m.created_at < from_date) match = false;
      if (to_date && m.created_at > to_date + "T23:59:59") match = false;
      if (sku_id && m.sku_id !== sku_id) match = false;
      if (movement_type && m.movement_type !== movement_type) match = false;
      if (salesman_id && m.created_by !== salesman_id) match = false;
      return match;
    }).map(m => ({
      ...m,
      sku_name: resolveSkuInfo(m.sku_id).resolved_name,
      sku_code: resolveSkuInfo(m.sku_id).sku_code
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
"""

opname_target = """  try {
    const result = await sqlDb.transaction(async (tx) => {
      let totalAdjusted = 0;
      for (const it of items) {
        const diff = Number(it.physical_count) - Number(it.system_stock);
        if (diff !== 0) {
          await InventoryService.processOpname(warehouse_id, it.sku_id, diff, req.user!._id, notes || "Stock Opname", tx);
          totalAdjusted++;
        }
      }
      return totalAdjusted;
    });
    res.json({ message: "Stock Opname berhasil.", total_adjusted: result });
  } catch (err: any) { res.status(400).json({ detail: err.message }); }"""

opname_replacement = """  try {
    let result = 0;
    if (isCloudSqlConnected) {
      result = await sqlDb.transaction(async (tx) => {
        let totalAdjusted = 0;
        for (const it of items) {
          const diff = Number(it.physical_count) - Number(it.system_stock);
          if (diff !== 0) {
            await InventoryService.processOpname(warehouse_id, it.sku_id, diff, req.user!._id, notes || "Stock Opname", tx);
            totalAdjusted++;
          }
        }
        return totalAdjusted;
      });
    } else {
      for (const it of items) {
        const diff = Number(it.physical_count) - Number(it.system_stock);
        if (diff !== 0) {
          await InventoryService.processOpname(warehouse_id, it.sku_id, diff, req.user!._id, notes || "Stock Opname", null);
          result++;
        }
      }
    }
    res.json({ message: "Stock Opname berhasil.", total_adjusted: result });
  } catch (err: any) { res.status(400).json({ detail: err.message }); }"""

adjust_target = """  try {
    const result = await sqlDb.transaction(async (tx) => {
      for (const it of items) {
        const qty = Number(it.quantity);
        if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity adjustment harus bilangan bulat positif.");
        const diff = adjustment_type === "IN" ? qty : -qty;
        await InventoryService.processOpname(warehouse_id, it.sku_id, diff, req.user!._id, notes || "Stock Adjustment", tx);
      }
      return items.length;
    });
    res.json({ message: "Stock Adjustment berhasil.", total_adjusted: result });
  } catch (err: any) { res.status(400).json({ detail: err.message }); }"""

adjust_replacement = """  try {
    let result = 0;
    if (isCloudSqlConnected) {
      result = await sqlDb.transaction(async (tx) => {
        for (const it of items) {
          const qty = Number(it.quantity);
          if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity adjustment harus bilangan bulat positif.");
          const diff = adjustment_type === "IN" ? qty : -qty;
          await InventoryService.processOpname(warehouse_id, it.sku_id, diff, req.user!._id, notes || "Stock Adjustment", tx);
        }
        return items.length;
      });
    } else {
      for (const it of items) {
        const qty = Number(it.quantity);
        if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity adjustment harus bilangan bulat positif.");
        const diff = adjustment_type === "IN" ? qty : -qty;
        await InventoryService.processOpname(warehouse_id, it.sku_id, diff, req.user!._id, notes || "Stock Adjustment", null);
      }
      result = items.length;
    }
    res.json({ message: "Stock Adjustment berhasil.", total_adjusted: result });
  } catch (err: any) { res.status(400).json({ detail: err.message }); }"""

process_file("server/inventory.routes.ts", [
  (movements_target, movements_replacement),
  (opname_target, opname_replacement),
  (adjust_target, adjust_replacement)
])

# Now for inventory.service.ts
deduct_sales = """  deductSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
    return await sqlDb.transaction(async (tx) => {"""
deduct_sales_rep = """  deductSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
    if (!isCloudSqlConnected) {
      InventoryRules.validateQuantity(qty);
      const memInv = db.inventory.find(i => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === skuId);
      if (memInv) {
        InventoryRules.validateNoNegativeStock(memInv.stock_on_hand - qty);
        memInv.stock_on_hand -= qty;
        memInv.available_stock -= qty;
      }
      return null;
    }
    return await sqlDb.transaction(async (tx) => {"""

deduct_wh = """  deductWarehouseStockForSales: async (warehouseId: string, skuId: string, qty: number, referenceId: string, outletId: string, performedBy: string, notes: string) => {
    return await sqlDb.transaction(async (tx) => {"""
deduct_wh_rep = """  deductWarehouseStockForSales: async (warehouseId: string, skuId: string, qty: number, referenceId: string, outletId: string, performedBy: string, notes: string) => {
    if (!isCloudSqlConnected) {
      InventoryRules.validateQuantity(qty);
      const memInv = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === warehouseId || i.office_id === warehouseId) && i.sku_id === skuId);
      if (memInv) {
        InventoryRules.validateNoNegativeStock(memInv.stock_on_hand - qty);
        memInv.stock_on_hand -= qty;
        memInv.available_stock -= qty;
      }
      return null;
    }
    return await sqlDb.transaction(async (tx) => {"""

process_handover = """  processHandover: async (handover: any, items: any[], performedBy: string) => {
    return await sqlDb.transaction(async (tx) => {"""
process_handover_rep = """  processHandover: async (handover: any, items: any[], performedBy: string) => {
    if (!isCloudSqlConnected) {
      for (const item of items) {
        const qty = parseInt(item.quantity);
        InventoryRules.validateQuantity(qty);
        const memW = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === (handover.warehouse_id || handover.office_id) || i.office_id === (handover.warehouse_id || handover.office_id)) && i.sku_id === item.sku_id);
        if (memW) { memW.stock_on_hand -= qty; memW.available_stock -= qty; }
        const memS = db.inventory.find(i => i.location_type === "SALES" && i.location_id === handover.salesman_id && i.sku_id === item.sku_id);
        if (memS) { memS.stock_on_hand += qty; memS.available_stock += qty; } else {
          db.inventory.push({
            _id: `inv-${Date.now()}`, location_type: "SALES", location_id: handover.salesman_id, sku_id: item.sku_id,
            stock_on_hand: qty, available_stock: qty, allocated_stock: 0, status: "ACTIVE", updated_at: new Date().toISOString()
          });
        }
      }
      return null;
    }
    return await sqlDb.transaction(async (tx) => {"""

process_return = """  processReturn: async (stockReturn: any, items: any[], performedBy: string) => {
    return await sqlDb.transaction(async (tx) => {"""
process_return_rep = """  processReturn: async (stockReturn: any, items: any[], performedBy: string) => {
    if (!isCloudSqlConnected) {
      for (const item of items) {
        const qty = parseInt(item.quantity);
        InventoryRules.validateQuantity(qty);
        const memS = db.inventory.find(i => i.location_type === "SALES" && i.location_id === stockReturn.salesman_id && i.sku_id === item.sku_id);
        if (memS) { memS.stock_on_hand -= qty; memS.available_stock -= qty; }
        const memW = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === (stockReturn.warehouse_id || stockReturn.office_id) || i.office_id === (stockReturn.warehouse_id || stockReturn.office_id)) && i.sku_id === item.sku_id);
        if (memW) { memW.stock_on_hand += qty; memW.available_stock += qty; }
      }
      return null;
    }
    return await sqlDb.transaction(async (tx) => {"""

process_rcv = """  processReceiving: async (receiving: any, items: any[], performedBy: string) => {
    return await sqlDb.transaction(async (tx) => {"""
process_rcv_rep = """  processReceiving: async (receiving: any, items: any[], performedBy: string) => {
    if (!isCloudSqlConnected) {
      for (const item of items) {
        const qty = parseInt(item.quantity);
        InventoryRules.validateQuantity(qty);
        const memW = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === (receiving.warehouse_id || receiving.office_id) || i.office_id === (receiving.warehouse_id || receiving.office_id)) && i.sku_id === item.sku_id);
        if (memW) { memW.stock_on_hand += qty; memW.available_stock += qty; } else {
          db.inventory.push({
            _id: `inv-${Date.now()}`, location_type: "WAREHOUSE", location_id: (receiving.warehouse_id || receiving.office_id), sku_id: item.sku_id,
            stock_on_hand: qty, available_stock: qty, allocated_stock: 0, status: "ACTIVE", updated_at: new Date().toISOString()
          });
        }
      }
      return null;
    }
    return await sqlDb.transaction(async (tx) => {"""

rev_sales = """  reverseSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
    return await sqlDb.transaction(async (tx) => {"""
rev_sales_rep = """  reverseSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
    if (!isCloudSqlConnected) {
      InventoryRules.validateQuantity(qty);
      const memInv = db.inventory.find(i => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === skuId);
      if (memInv) { memInv.stock_on_hand += qty; memInv.available_stock += qty; }
      return null;
    }
    return await sqlDb.transaction(async (tx) => {"""

opname = """  processOpname: async (warehouseId: string, skuId: string, diff: number, performedBy: string, notes: string, tx: any) => {
    if (diff === 0) return;
    
    // Deduct/Add Warehouse
    const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", warehouseId, skuId, diff, tx);"""
opname_rep = """  processOpname: async (warehouseId: string, skuId: string, diff: number, performedBy: string, notes: string, tx: any) => {
    if (diff === 0) return;
    if (!isCloudSqlConnected) {
      const memOp = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === warehouseId || i.office_id === warehouseId) && i.sku_id === skuId);
      if (memOp) { memOp.stock_on_hand += diff; memOp.available_stock += diff; } else {
         db.inventory.push({
            _id: `inv-${Date.now()}`, location_type: "WAREHOUSE", location_id: warehouseId, office_id: warehouseId, sku_id: skuId,
            stock_on_hand: diff, available_stock: diff, allocated_stock: 0, status: "ACTIVE", created_at: new Date().toISOString(), updated_at: new Date().toISOString()
         });
      }
      return;
    }
    
    // Deduct/Add Warehouse
    const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", warehouseId, skuId, diff, tx);"""

process_file("server/inventory.service.ts", [
  (deduct_sales, deduct_sales_rep),
  (deduct_wh, deduct_wh_rep),
  (process_handover, process_handover_rep),
  (process_return, process_return_rep),
  (process_rcv, process_rcv_rep),
  (rev_sales, rev_sales_rep),
  (opname, opname_rep)
])
