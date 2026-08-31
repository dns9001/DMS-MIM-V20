import { sqlDb } from "../src/db/index.js";
import { InventoryRepository } from "./inventory.repository.js";
import { InventoryRules } from "./inventory.rules.js";
import { db } from "./data.js";

import { isCloudSqlConnected } from "./cloudsqlSync.js";
export const InventoryService = {
  deductSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
    InventoryRules.validateQuantity(qty);
    const memInv = db.inventory.find(i => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === skuId);
    if (memInv) {
      memInv.stock_on_hand = Math.max(0, (memInv.stock_on_hand || 0) - qty);
      memInv.available_stock = Math.max(0, (memInv.available_stock || 0) - qty);
      memInv.updated_at = new Date().toISOString();
    }

    if (!isCloudSqlConnected) return null;

    try {
      return await sqlDb.transaction(async (tx: any) => {
        const inv = await InventoryRepository.createOrUpdateInventory("SALES", salesmanId, skuId, -qty, tx);
        const today = new Date().toISOString().slice(0, 10);
        
        await InventoryRepository.insertMovement({
          id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000000)}`,
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

        await InventoryRepository.upsertSalesStockLedger(salesmanId, today, skuId, {
          soldStock: qty,
          finalStock: -qty
        }, tx);
        
        return inv;
      });
    } catch (err: any) {
      console.warn("[InventoryService] deductSalesStock Postgres notice:", err?.message || err);
      return null;
    }
  },

  deductWarehouseStockForSales: async (warehouseId: string, skuId: string, qty: number, referenceId: string, outletId: string, performedBy: string, notes: string) => {
    InventoryRules.validateQuantity(qty);
    const targetWhId = warehouseId || "off-1";
    const memInv = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === targetWhId || i.office_id === targetWhId) && i.sku_id === skuId);
    if (memInv) {
      memInv.stock_on_hand = Math.max(0, (memInv.stock_on_hand || 0) - qty);
      memInv.available_stock = Math.max(0, (memInv.available_stock || 0) - qty);
      memInv.updated_at = new Date().toISOString();
    }

    if (!isCloudSqlConnected) return null;

    try {
      return await sqlDb.transaction(async (tx: any) => {
        const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", targetWhId, skuId, -qty, tx);
        
        await InventoryRepository.insertMovement({
          id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000000)}`,
          movementType: "SALES_OUT",
          sourceLocationType: "WAREHOUSE",
          sourceLocationId: targetWhId,
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
    } catch (err: any) {
      console.warn("[InventoryService] deductWarehouseStockForSales Postgres notice:", err?.message || err);
      return null;
    }
  },
  
  processHandover: async (handover: any, items: any[], performedBy: string) => {
    const targetWhId = handover.warehouse_id || handover.office_id || "off-1";
    const today = handover.handover_date || handover.business_date || new Date().toISOString().slice(0, 10);

    for (const item of items) {
      const qty = parseInt(item.quantity) || 0;
      if (qty <= 0) continue;
      InventoryRules.validateQuantity(qty);

      const memW = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === targetWhId || i.office_id === targetWhId) && i.sku_id === item.sku_id);
      if (memW) {
        memW.stock_on_hand = Math.max(0, (memW.stock_on_hand || 0) - qty);
        memW.available_stock = Math.max(0, (memW.available_stock || 0) - qty);
        memW.updated_at = new Date().toISOString();
      }

      const memS = db.inventory.find(i => i.location_type === "SALES" && i.location_id === handover.salesman_id && i.sku_id === item.sku_id);
      if (memS) {
        memS.stock_on_hand = (memS.stock_on_hand || 0) + qty;
        memS.available_stock = (memS.available_stock || 0) + qty;
        memS.updated_at = new Date().toISOString();
      } else {
        db.inventory.push({
          _id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          location_type: "SALES",
          location_id: handover.salesman_id,
          sku_id: item.sku_id,
          stock_on_hand: qty,
          available_stock: qty,
          allocated_stock: 0,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }

    if (!isCloudSqlConnected) return null;

    try {
      await sqlDb.transaction(async (tx: any) => {
        for (const item of items) {
          const qty = parseInt(item.quantity) || 0;
          if (qty <= 0) continue;
          InventoryRules.validateQuantity(qty);
          
          await InventoryRepository.createOrUpdateInventory("WAREHOUSE", targetWhId, item.sku_id, -qty, tx);
          await InventoryRepository.createOrUpdateInventory("SALES", handover.salesman_id, item.sku_id, qty, tx);
          
          await InventoryRepository.upsertSalesStockLedger(handover.salesman_id, today, item.sku_id, {
            loadedStock: qty,
            finalStock: qty
          }, tx);
          
          await InventoryRepository.insertMovement({
            id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000000)}`,
            movementType: "TRANSFER_OUT",
            sourceLocationType: "WAREHOUSE",
            sourceLocationId: targetWhId,
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
    } catch (err: any) {
      console.warn("[InventoryService] processHandover Postgres notice:", err?.message || err);
    }
  },

  processReturn: async (stockReturn: any, items: any[], performedBy: string) => {
    const targetWhId = stockReturn.warehouse_id || stockReturn.office_id || "off-1";
    const today = stockReturn.return_date || stockReturn.business_date || new Date().toISOString().slice(0, 10);

    for (const item of items) {
      const qty = parseInt(item.quantity) || 0;
      if (qty <= 0) continue;
      InventoryRules.validateQuantity(qty);

      const memS = db.inventory.find(i => i.location_type === "SALES" && i.location_id === stockReturn.salesman_id && i.sku_id === item.sku_id);
      if (memS) {
        memS.stock_on_hand = Math.max(0, (memS.stock_on_hand || 0) - qty);
        memS.available_stock = Math.max(0, (memS.available_stock || 0) - qty);
        memS.updated_at = new Date().toISOString();
      }

      const memW = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === targetWhId || i.office_id === targetWhId) && i.sku_id === item.sku_id);
      if (memW) {
        memW.stock_on_hand = (memW.stock_on_hand || 0) + qty;
        memW.available_stock = (memW.available_stock || 0) + qty;
        memW.updated_at = new Date().toISOString();
      } else {
        db.inventory.push({
          _id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          location_type: "WAREHOUSE",
          location_id: targetWhId,
          office_id: targetWhId,
          sku_id: item.sku_id,
          stock_on_hand: qty,
          available_stock: qty,
          allocated_stock: 0,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }

    if (!isCloudSqlConnected) return null;

    try {
      await sqlDb.transaction(async (tx: any) => {
        for (const item of items) {
          const qty = parseInt(item.quantity) || 0;
          if (qty <= 0) continue;
          InventoryRules.validateQuantity(qty);
          
          await InventoryRepository.createOrUpdateInventory("SALES", stockReturn.salesman_id, item.sku_id, -qty, tx);
          await InventoryRepository.createOrUpdateInventory("WAREHOUSE", targetWhId, item.sku_id, qty, tx);
          
          await InventoryRepository.upsertSalesStockLedger(stockReturn.salesman_id, today, item.sku_id, {
            returnedStock: qty,
            finalStock: -qty
          }, tx);
          
          await InventoryRepository.insertMovement({
            id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000000)}`,
            movementType: "RETURN_IN",
            sourceLocationType: "SALES",
            sourceLocationId: stockReturn.salesman_id,
            destLocationType: "WAREHOUSE",
            destLocationId: targetWhId,
            skuId: item.sku_id,
            quantity: qty,
            referenceId: stockReturn._id,
            performedBy,
            notes: `Return dari Sales ${stockReturn.salesman_id}`
          }, tx);
        }
      });
    } catch (err: any) {
      console.warn("[InventoryService] processReturn Postgres notice:", err?.message || err);
    }
  },
  processReceiving: async (receiving: any, items: any[], performedBy: string) => {
    const targetWhId = receiving.warehouse_id || receiving.office_id || "off-1";

    // Immediate in-memory update
    for (const item of items) {
      const qty = parseInt(item.quantity) || 0;
      if (qty <= 0) continue;
      InventoryRules.validateQuantity(qty);
      const memW = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === targetWhId || i.office_id === targetWhId) && i.sku_id === item.sku_id);
      if (memW) {
        memW.stock_on_hand += qty;
        memW.available_stock += qty;
        memW.updated_at = new Date().toISOString();
      } else {
        db.inventory.push({
          _id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          location_type: "WAREHOUSE",
          location_id: targetWhId,
          office_id: targetWhId,
          sku_id: item.sku_id,
          stock_on_hand: qty,
          available_stock: qty,
          allocated_stock: 0,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }

    if (!isCloudSqlConnected) return null;

    try {
      await sqlDb.transaction(async (tx: any) => {
        for (const item of items) {
          const qty = parseInt(item.quantity) || 0;
          if (qty <= 0) continue;
          InventoryRules.validateQuantity(qty);
          
          // Add Warehouse
          const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", targetWhId, item.sku_id, qty, tx);
          
          // Movement Supplier -> Warehouse
          await InventoryRepository.insertMovement({
            id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000000)}`,
            movementType: "PURCHASE_IN",
            sourceLocationType: "SUPPLIER",
            sourceLocationId: receiving.supplier_name || "SUPPLIER",
            destLocationType: "WAREHOUSE",
            destLocationId: targetWhId,
            skuId: item.sku_id,
            quantity: qty,
            referenceId: receiving._id,
            performedBy,
            notes: `Penerimaan Barang Supplier ${receiving.supplier_name || ""}`
          }, tx);
        }
      });
    } catch (err: any) {
      console.warn("[InventoryService] Postgres transaction notice in processReceiving:", err?.message || err);
    }
  },
  reverseSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
    InventoryRules.validateQuantity(qty);
    const memInv = db.inventory.find(i => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === skuId);
    if (memInv) {
      memInv.stock_on_hand = (memInv.stock_on_hand || 0) + qty;
      memInv.available_stock = (memInv.available_stock || 0) + qty;
      memInv.updated_at = new Date().toISOString();
    }

    if (!isCloudSqlConnected) return null;

    try {
      return await sqlDb.transaction(async (tx: any) => {
        const inv = await InventoryRepository.createOrUpdateInventory("SALES", salesmanId, skuId, qty, tx);
        const today = new Date().toISOString().slice(0, 10);
        
        // Record official REVERSAL movement
        await InventoryRepository.insertMovement({
          id: `mvt-rev-${Date.now()}-${Math.floor(Math.random()*1000000)}`,
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

        return inv;
      });
    } catch (err: any) {
      console.warn("[InventoryService] reverseSalesStock Postgres notice:", err?.message || err);
      return null;
    }
  },
  processOpname: async (warehouseId: string, skuId: string, diff: number, performedBy: string, notes: string, tx?: any) => {
    if (diff === 0) return;
    const targetWhId = warehouseId || "off-1";
    const memOp = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === targetWhId || i.office_id === targetWhId) && i.sku_id === skuId);
    if (memOp) {
      memOp.stock_on_hand = Math.max(0, (memOp.stock_on_hand || 0) + diff);
      memOp.available_stock = Math.max(0, (memOp.available_stock || 0) + diff);
      memOp.updated_at = new Date().toISOString();
    } else {
      db.inventory.push({
        _id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        location_type: "WAREHOUSE",
        location_id: targetWhId,
        office_id: targetWhId,
        sku_id: skuId,
        stock_on_hand: Math.max(0, diff),
        available_stock: Math.max(0, diff),
        allocated_stock: 0,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    if (!isCloudSqlConnected) return;

    try {
      const runner = tx || sqlDb;
      const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", targetWhId, skuId, diff, runner);
      
      // Movement
      await InventoryRepository.insertMovement({
        id: `mvt-${Date.now()}-${Math.floor(Math.random()*1000000)}`,
        movementType: diff > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
        sourceLocationType: diff > 0 ? "NONE" : "WAREHOUSE",
        sourceLocationId: diff > 0 ? "" : targetWhId,
        destLocationType: diff > 0 ? "WAREHOUSE" : "NONE",
        destLocationId: diff > 0 ? targetWhId : "",
        skuId,
        quantity: Math.abs(diff),
        referenceId: `adj-${Date.now()}`,
        performedBy,
        notes,
      }, runner);
    } catch (err: any) {
      console.warn("[InventoryService] processOpname Postgres notice:", err?.message || err);
    }
  }
};
