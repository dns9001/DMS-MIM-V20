import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """        if (req.user!.role === "SALES") {
          await InventoryService.deductSalesStock(salesmanId, it.sku_id, qty, newTxnId, outlet_id, notes);
        } else {
          await InventoryService.deductWarehouseStockForSales("GUDANG-1", it.sku_id, qty, newTxnId, outlet_id, req.user!._id, notes);
        }
        
        // Sync in-memory cache to prevent stale reads in VisitPage
        const memInv = db.inventory.find(i => 
          (req.user!.role === "SALES" ? (i.location_type === "SALES" && i.location_id === salesmanId) : 
                                       ((i.location_type === "WAREHOUSE" || !i.location_type) && i.location_id === "GUDANG-1")) 
          && i.sku_id === it.sku_id
        );
        if (memInv) {
          memInv.stock_on_hand -= qty;
          memInv.available_stock -= qty;
        }"""

replacement = """        if (req.user!.role === "SALES") {
          await InventoryService.deductSalesStock(salesmanId, it.sku_id, qty, newTxnId, outlet_id, notes);
        } else {
          await InventoryService.deductWarehouseStockForSales("GUDANG-1", it.sku_id, qty, newTxnId, outlet_id, req.user!._id, notes);
        }"""

content = content.replace(target, replacement)

with open("server/routes.ts", "w") as f:
    f.write(content)
