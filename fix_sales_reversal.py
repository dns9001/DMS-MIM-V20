import sys

with open("server/inventory.service.ts", "r") as f:
    content = f.read()

target = """  processOpname: async"""

repl = """  reverseSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
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
  processOpname: async"""

content = content.replace(target, repl)

with open("server/inventory.service.ts", "w") as f:
    f.write(content)
