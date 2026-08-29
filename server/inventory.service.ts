import { sqlDb } from "../src/db/index.js";
import { InventoryRepository } from "./inventory.repository.js";
import { InventoryRules } from "./inventory.rules.js";
import { db } from "./data.js";

export const InventoryService = {
  deductSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
    return await sqlDb.transaction(async (tx) => {
      InventoryRules.validateQuantity(qty);
      
      // Deduct from Sales Inventory
      const inv = await InventoryRepository.createOrUpdateInventory("SALES", salesmanId, skuId, -qty, tx);
      InventoryRules.validateNoNegativeStock(inv.stockOnHand);
      const memInv = db.inventory.find(i => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === skuId);
      if (memInv) {
         memInv.stock_on_hand = inv.stockOnHand;
         memInv.available_stock = inv.availableStock;
      } else {
         db.inventory.push({
            _id: inv.id || `inv-${Date.now()}`,
            location_type: (inv.locationType as any) || "WAREHOUSE",
            location_id: inv.locationId || "",
            office_id: inv.locationType === "WAREHOUSE" ? (inv.locationId || "") : "",
            sku_id: inv.skuId || "",
            stock_on_hand: inv.stockOnHand || 0,
            available_stock: inv.availableStock || 0,
            allocated_stock: inv.allocatedStock || 0,
            status: (inv.status as any) || "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
         });
      }
      
      const mvtCount = Date.now() % 10000;
      const today = new Date().toISOString().slice(0, 10);
      
      // Record Movement
      await InventoryRepository.insertMovement({
        id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        movementType: "SALES_OUT",
        sourceLocationType: "SALES",
        sourceLocationId: salesmanId,
        destLocationType: "OUTLET",
        destLocationId: outletId,
        skuId,
        quantity: qty,
        referenceId,
        performedBy: salesmanId,
        notes,
      }, tx);

      // Update Ledger
      await InventoryRepository.upsertSalesStockLedger(salesmanId, today, skuId, {
        soldStock: qty,
        finalStock: -qty
      }, tx);
      
      return inv;
    });
  },

  deductWarehouseStockForSales: async (warehouseId: string, skuId: string, qty: number, referenceId: string, outletId: string, performedBy: string, notes: string) => {
    return await sqlDb.transaction(async (tx) => {
      InventoryRules.validateQuantity(qty);
      
      // Deduct from Warehouse
      const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", warehouseId, skuId, -qty, tx);
      InventoryRules.validateNoNegativeStock(inv.stockOnHand);
      const memInv = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === warehouseId || i.office_id === warehouseId) && i.sku_id === skuId);
      if (memInv) {
         memInv.stock_on_hand = inv.stockOnHand;
         memInv.available_stock = inv.availableStock;
      } else {
         db.inventory.push({
            _id: inv.id || `inv-${Date.now()}`,
            location_type: (inv.locationType as any) || "WAREHOUSE",
            location_id: inv.locationId || "",
            office_id: inv.locationType === "WAREHOUSE" ? (inv.locationId || "") : "",
            sku_id: inv.skuId || "",
            stock_on_hand: inv.stockOnHand || 0,
            available_stock: inv.availableStock || 0,
            allocated_stock: inv.allocatedStock || 0,
            status: (inv.status as any) || "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
         });
      }
      
      await InventoryRepository.insertMovement({
        id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        movementType: "SALES_OUT",
        sourceLocationType: "WAREHOUSE",
        sourceLocationId: warehouseId,
        destLocationType: "OUTLET",
        destLocationId: outletId,
        skuId,
        quantity: qty,
        referenceId,
        performedBy,
        notes,
      }, tx);

      return inv;
    });
  },
  
  processHandover: async (handover: any, items: any[], performedBy: string) => {
    return await sqlDb.transaction(async (tx) => {
      const today = handover.handover_date || handover.business_date || new Date().toISOString().slice(0, 10);
      
      for (const item of items) {
        const qty = parseInt(item.quantity);
        InventoryRules.validateQuantity(qty);
        
        // Deduct Warehouse
        const invW = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", (handover.warehouse_id || handover.office_id), item.sku_id, -qty, tx);
        const memW = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === (handover.warehouse_id || handover.office_id) || i.office_id === (handover.warehouse_id || handover.office_id)) && i.sku_id === item.sku_id);
        if (memW) { memW.stock_on_hand = invW.stockOnHand; memW.available_stock = invW.availableStock; } else {
         db.inventory.push({
            _id: invW.id || `inv-${Date.now()}`,
            location_type: (invW.locationType as any) || "WAREHOUSE",
            location_id: invW.locationId || "",
            office_id: invW.locationType === "WAREHOUSE" ? (invW.locationId || "") : "",
            sku_id: invW.skuId || "",
            stock_on_hand: invW.stockOnHand || 0,
            available_stock: invW.availableStock || 0,
            allocated_stock: invW.allocatedStock || 0,
            status: (invW.status as any) || "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
         });
      }
        
        // Add Sales
        const invS = await InventoryRepository.createOrUpdateInventory("SALES", handover.salesman_id, item.sku_id, qty, tx);
        const memS = db.inventory.find(i => i.location_type === "SALES" && i.location_id === handover.salesman_id && i.sku_id === item.sku_id);
        if (memS) { memS.stock_on_hand = invS.stockOnHand; memS.available_stock = invS.availableStock; } else {
         db.inventory.push({
            _id: invS.id || `inv-${Date.now()}`,
            location_type: (invS.locationType as any) || "WAREHOUSE",
            location_id: invS.locationId || "",
            office_id: invS.locationType === "WAREHOUSE" ? (invS.locationId || "") : "",
            sku_id: invS.skuId || "",
            stock_on_hand: invS.stockOnHand || 0,
            available_stock: invS.availableStock || 0,
            allocated_stock: invS.allocatedStock || 0,
            status: (invS.status as any) || "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
         });
      }
        
        // Ledger
        await InventoryRepository.upsertSalesStockLedger(handover.salesman_id, today, item.sku_id, {
          loadedStock: qty,
          finalStock: qty
        }, tx);
        
        // Movement Warehouse -> Sales
        await InventoryRepository.insertMovement({
          id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          movementType: "TRANSFER_OUT",
          sourceLocationType: "WAREHOUSE",
          sourceLocationId: (handover.warehouse_id || handover.office_id),
          destLocationType: "SALES",
          destLocationId: handover.salesman_id,
          skuId: item.sku_id,
          quantity: qty,
          referenceId: handover._id,
          performedBy,
          notes: `Handover ke Sales ${handover.salesman_id}`
        }, tx);
      }
    });
  },

  processReturn: async (stockReturn: any, items: any[], performedBy: string) => {
    return await sqlDb.transaction(async (tx) => {
      const today = stockReturn.return_date || stockReturn.business_date || new Date().toISOString().slice(0, 10);
      
      for (const item of items) {
        const qty = parseInt(item.quantity);
        InventoryRules.validateQuantity(qty);
        
        // Deduct Sales
        const invS2 = await InventoryRepository.createOrUpdateInventory("SALES", stockReturn.salesman_id, item.sku_id, -qty, tx);
        const memS2 = db.inventory.find(i => i.location_type === "SALES" && i.location_id === stockReturn.salesman_id && i.sku_id === item.sku_id);
        if (memS2) { memS2.stock_on_hand = invS2.stockOnHand; memS2.available_stock = invS2.availableStock; } else {
         db.inventory.push({
            _id: invS2.id || `inv-${Date.now()}`,
            location_type: (invS2.locationType as any) || "WAREHOUSE",
            location_id: invS2.locationId || "",
            office_id: invS2.locationType === "WAREHOUSE" ? (invS2.locationId || "") : "",
            sku_id: invS2.skuId || "",
            stock_on_hand: invS2.stockOnHand || 0,
            available_stock: invS2.availableStock || 0,
            allocated_stock: invS2.allocatedStock || 0,
            status: (invS2.status as any) || "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
         });
      }
        
        // Add Warehouse
        const invW2 = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", (stockReturn.warehouse_id || stockReturn.office_id), item.sku_id, qty, tx);
        const memW2 = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === (stockReturn.warehouse_id || stockReturn.office_id) || i.office_id === (stockReturn.warehouse_id || stockReturn.office_id)) && i.sku_id === item.sku_id);
        if (memW2) { memW2.stock_on_hand = invW2.stockOnHand; memW2.available_stock = invW2.availableStock; } else {
         db.inventory.push({
            _id: invW2.id || `inv-${Date.now()}`,
            location_type: (invW2.locationType as any) || "WAREHOUSE",
            location_id: invW2.locationId || "",
            office_id: invW2.locationType === "WAREHOUSE" ? (invW2.locationId || "") : "",
            sku_id: invW2.skuId || "",
            stock_on_hand: invW2.stockOnHand || 0,
            available_stock: invW2.availableStock || 0,
            allocated_stock: invW2.allocatedStock || 0,
            status: (invW2.status as any) || "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
         });
      }
        
        // Ledger
        await InventoryRepository.upsertSalesStockLedger(stockReturn.salesman_id, today, item.sku_id, {
          returnedStock: qty,
          finalStock: -qty
        }, tx);
        
        // Movement Sales -> Warehouse
        await InventoryRepository.insertMovement({
          id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          movementType: "TRANSFER_IN",
          sourceLocationType: "SALES",
          sourceLocationId: stockReturn.salesman_id,
          destLocationType: "WAREHOUSE",
          destLocationId: (stockReturn.warehouse_id || stockReturn.office_id),
          skuId: item.sku_id,
          quantity: qty,
          referenceId: stockReturn._id,
          performedBy,
          notes: `Return dari Sales ${stockReturn.salesman_id}`
        }, tx);
      }
    });
  },
  processReceiving: async (receiving: any, items: any[], performedBy: string) => {
    return await sqlDb.transaction(async (tx) => {
      for (const item of items) {
        const qty = parseInt(item.quantity);
        InventoryRules.validateQuantity(qty);
        
        // Add Warehouse
        const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", receiving.warehouse_id || receiving.office_id, item.sku_id, qty, tx);
        const memRcv = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === (receiving.warehouse_id || receiving.office_id) || i.office_id === (receiving.warehouse_id || receiving.office_id)) && i.sku_id === item.sku_id);
        if (memRcv) { memRcv.stock_on_hand = inv.stockOnHand; memRcv.available_stock = inv.availableStock; } else {
         db.inventory.push({
            _id: inv.id || `inv-${Date.now()}`,
            location_type: (inv.locationType as any) || "WAREHOUSE",
            location_id: inv.locationId || "",
            office_id: inv.locationType === "WAREHOUSE" ? (inv.locationId || "") : "",
            sku_id: inv.skuId || "",
            stock_on_hand: inv.stockOnHand || 0,
            available_stock: inv.availableStock || 0,
            allocated_stock: inv.allocatedStock || 0,
            status: (inv.status as any) || "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
         });
      }
        
        // Movement Supplier -> Warehouse
        await InventoryRepository.insertMovement({
          id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          movementType: "PURCHASE_IN",
          sourceLocationType: "SUPPLIER",
          sourceLocationId: receiving.supplier_name || "SUPPLIER",
          destLocationType: "WAREHOUSE",
          destLocationId: receiving.warehouse_id || receiving.office_id,
          skuId: item.sku_id,
          quantity: qty,
          referenceId: receiving._id,
          performedBy,
          notes: `Penerimaan Barang Supplier ${receiving.supplier_name}`
        }, tx);
      }
    });
  },
  reverseSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
    return await sqlDb.transaction(async (tx) => {
      InventoryRules.validateQuantity(qty);
      
      // Add back to Sales Inventory
      const inv = await InventoryRepository.createOrUpdateInventory("SALES", salesmanId, skuId, qty, tx);
      const memInv = db.inventory.find(i => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === skuId);
      if (memInv) {
         memInv.stock_on_hand = inv.stockOnHand;
         memInv.available_stock = inv.availableStock;
      }
      
      const today = new Date().toISOString().slice(0, 10);
      
      // Record official REVERSAL movement
      await InventoryRepository.insertMovement({
        id: `mvt-rev-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        movementType: "REVERSAL",
        sourceLocationType: "OUTLET",
        sourceLocationId: outletId,
        destLocationType: "SALES",
        destLocationId: salesmanId,
        skuId: skuId,
        quantity: qty,
        salesmanId: salesmanId,
        outletId: outletId,
        referenceId: referenceId,
        businessDate: today,
        status: "COMPLETED",
        notes: notes
      }, tx);
      
      // Upsert Ledger
      await InventoryRepository.upsertSalesStockLedger(salesmanId, today, skuId, {
        returnedStock: 0,
        finalStock: qty
      }, tx);
    });
  },
  processOpname: async (warehouseId: string, skuId: string, diff: number, performedBy: string, notes: string, tx: any) => {
    if (diff === 0) return;
    
    // Deduct/Add Warehouse
    const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", warehouseId, skuId, diff, tx);
    InventoryRules.validateNoNegativeStock(inv.stockOnHand);
    const memOp = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === warehouseId || i.office_id === warehouseId) && i.sku_id === skuId);
    if (memOp) { memOp.stock_on_hand = inv.stockOnHand; memOp.available_stock = inv.availableStock; } else {
         db.inventory.push({
            _id: inv.id || `inv-${Date.now()}`,
            location_type: (inv.locationType as any) || "WAREHOUSE",
            location_id: inv.locationId || "",
            office_id: inv.locationType === "WAREHOUSE" ? (inv.locationId || "") : "",
            sku_id: inv.skuId || "",
            stock_on_hand: inv.stockOnHand || 0,
            available_stock: inv.availableStock || 0,
            allocated_stock: inv.allocatedStock || 0,
            status: (inv.status as any) || "ACTIVE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
         });
      }
    
    // Movement
    await InventoryRepository.insertMovement({
      id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      movementType: diff > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
      sourceLocationType: diff > 0 ? "NONE" : "WAREHOUSE",
      sourceLocationId: diff > 0 ? "" : warehouseId,
      destLocationType: diff > 0 ? "WAREHOUSE" : "NONE",
      destLocationId: diff > 0 ? warehouseId : "",
      skuId,
      quantity: Math.abs(diff),
      referenceId: `adj-${Date.now()}`,
      performedBy,
      notes,
    }, tx);
  }
};
