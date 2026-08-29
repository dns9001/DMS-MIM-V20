import sys

with open("server/inventory.service.ts", "r") as f:
    content = f.read()

target_import = """import { InventoryRules } from "./inventory.rules.js";"""
repl_import = """import { InventoryRules } from "./inventory.rules.js";
import { db } from "./data.js";"""

content = content.replace(target_import, repl_import)

# Deduct Sales
s_target = """      const inv = await InventoryRepository.createOrUpdateInventory("SALES", salesmanId, skuId, -qty, tx);
      InventoryRules.validateNoNegativeStock(inv.stockOnHand);"""
s_repl = """      const inv = await InventoryRepository.createOrUpdateInventory("SALES", salesmanId, skuId, -qty, tx);
      InventoryRules.validateNoNegativeStock(inv.stockOnHand);
      const memInv = db.inventory.find(i => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === skuId);
      if (memInv) {
         memInv.stock_on_hand = inv.stockOnHand;
         memInv.available_stock = inv.availableStock;
      }"""
content = content.replace(s_target, s_repl)

# Deduct WH
w_target = """      const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", warehouseId, skuId, -qty, tx);
      InventoryRules.validateNoNegativeStock(inv.stockOnHand);"""
w_repl = """      const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", warehouseId, skuId, -qty, tx);
      InventoryRules.validateNoNegativeStock(inv.stockOnHand);
      const memInv = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === warehouseId || i.office_id === warehouseId) && i.sku_id === skuId);
      if (memInv) {
         memInv.stock_on_hand = inv.stockOnHand;
         memInv.available_stock = inv.availableStock;
      }"""
content = content.replace(w_target, w_repl)

# Process Handover Deduct WH
h1_target = """// Deduct Warehouse
        await InventoryRepository.createOrUpdateInventory("WAREHOUSE", handover.office_id, item.sku_id, -qty, tx);"""
h1_repl = """// Deduct Warehouse
        const invW = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", handover.office_id, item.sku_id, -qty, tx);
        const memW = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === handover.office_id || i.office_id === handover.office_id) && i.sku_id === item.sku_id);
        if (memW) { memW.stock_on_hand = invW.stockOnHand; memW.available_stock = invW.availableStock; }"""
content = content.replace(h1_target, h1_repl)

# Process Handover Add Sales
h2_target = """// Add Sales
        await InventoryRepository.createOrUpdateInventory("SALES", handover.salesman_id, item.sku_id, qty, tx);"""
h2_repl = """// Add Sales
        const invS = await InventoryRepository.createOrUpdateInventory("SALES", handover.salesman_id, item.sku_id, qty, tx);
        const memS = db.inventory.find(i => i.location_type === "SALES" && i.location_id === handover.salesman_id && i.sku_id === item.sku_id);
        if (memS) { memS.stock_on_hand = invS.stockOnHand; memS.available_stock = invS.availableStock; }"""
content = content.replace(h2_target, h2_repl)

# Process Return Deduct Sales
r1_target = """// Deduct Sales
        await InventoryRepository.createOrUpdateInventory("SALES", stockReturn.salesman_id, item.sku_id, -qty, tx);"""
r1_repl = """// Deduct Sales
        const invS2 = await InventoryRepository.createOrUpdateInventory("SALES", stockReturn.salesman_id, item.sku_id, -qty, tx);
        const memS2 = db.inventory.find(i => i.location_type === "SALES" && i.location_id === stockReturn.salesman_id && i.sku_id === item.sku_id);
        if (memS2) { memS2.stock_on_hand = invS2.stockOnHand; memS2.available_stock = invS2.availableStock; }"""
content = content.replace(r1_target, r1_repl)

# Process Return Add WH
r2_target = """// Add Warehouse
        await InventoryRepository.createOrUpdateInventory("WAREHOUSE", stockReturn.office_id, item.sku_id, qty, tx);"""
r2_repl = """// Add Warehouse
        const invW2 = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", stockReturn.office_id, item.sku_id, qty, tx);
        const memW2 = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === stockReturn.office_id || i.office_id === stockReturn.office_id) && i.sku_id === item.sku_id);
        if (memW2) { memW2.stock_on_hand = invW2.stockOnHand; memW2.available_stock = invW2.availableStock; }"""
content = content.replace(r2_target, r2_repl)

# Process Receiving Add WH
rcv_target = """// Add Warehouse
        const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", receiving.warehouse_id || receiving.office_id, item.sku_id, qty, tx);"""
rcv_repl = """// Add Warehouse
        const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", receiving.warehouse_id || receiving.office_id, item.sku_id, qty, tx);
        const memRcv = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === (receiving.warehouse_id || receiving.office_id) || i.office_id === (receiving.warehouse_id || receiving.office_id)) && i.sku_id === item.sku_id);
        if (memRcv) { memRcv.stock_on_hand = inv.stockOnHand; memRcv.available_stock = inv.availableStock; }"""
content = content.replace(rcv_target, rcv_repl)

# Process Opname Deduct/Add WH
op_target = """// Deduct/Add Warehouse
    const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", warehouseId, skuId, diff, tx);
    InventoryRules.validateNoNegativeStock(inv.stockOnHand);"""
op_repl = """// Deduct/Add Warehouse
    const inv = await InventoryRepository.createOrUpdateInventory("WAREHOUSE", warehouseId, skuId, diff, tx);
    InventoryRules.validateNoNegativeStock(inv.stockOnHand);
    const memOp = db.inventory.find(i => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === warehouseId || i.office_id === warehouseId) && i.sku_id === skuId);
    if (memOp) { memOp.stock_on_hand = inv.stockOnHand; memOp.available_stock = inv.availableStock; }"""
content = content.replace(op_target, op_repl)

with open("server/inventory.service.ts", "w") as f:
    f.write(content)
