import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """        // Deduct stock from SALES inventory (or warehouse fallback if non-sales admin testing)
        if (req.user!.role === "SALES") {
          let salesInv = db.inventory.find(
            (i) => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === it.sku_id
          );
          if (salesInv) {
            salesInv.stock_on_hand = Math.max(0, salesInv.stock_on_hand - qty);
            salesInv.available_stock = Math.max(0, salesInv.available_stock - qty);
            salesInv.updated_at = new Date().toISOString();
            syncSingleDoc("inventory", salesInv._id, salesInv);
          }

          // Record official SALES_OUT stock movement
          const mvtCount = db.stock_movements.length + 1 + idx;
          const newMvt: StockMovement = {
            _id: `mvt-${Date.now()}-${idx}`,
            movement_code: `MVT-${today.replace(/-/g, "")}-${String(mvtCount).padStart(4, "0")}`,
            movement_type: "SALES_OUT",
            source_location_type: "SALES",
            source_location_id: salesmanId,
            destination_location_type: "OUTLET",
            destination_location_id: outlet_id,
            sku_id: it.sku_id,
            quantity: qty,
            salesman_id: salesmanId,
            outlet_id,
            reference_id: newTxnId,
            business_date: today,
            status: "COMPLETED",
            notes: `Penjualan ${outlet.outlet_name} (${invoiceNumber}) - Volume: ${qty} ${sku?.unit || 'Unit'}`,
            created_by: salesmanId,
            created_at: new Date().toISOString(),
          };
          db.stock_movements.push(newMvt);
          syncSingleDoc("stock_movements", newMvt._id, newMvt);
        } else {
          // Non-sales fallback (e.g. admin test order)
          const whInv = db.inventory.find(
            (i) => (i.location_type === "WAREHOUSE" || !i.location_type) && i.sku_id === it.sku_id
          );
          if (whInv) {
            whInv.stock_on_hand = Math.max(0, whInv.stock_on_hand - qty);
            whInv.available_stock = Math.max(0, whInv.available_stock - qty);
            whInv.updated_at = new Date().toISOString();
            syncSingleDoc("inventory", whInv._id, whInv);
          }
        }"""

replacement = """        // ATOMIC POSTGRES DEDUCTION
        const notes = `Penjualan ${outlet.outlet_name} (${invoiceNumber}) - Volume: ${qty} ${sku?.unit || 'Unit'}`;
        if (req.user!.role === "SALES") {
          await InventoryService.deductSalesStock(salesmanId, it.sku_id, qty, newTxnId, outlet_id, notes);
        } else {
          await InventoryService.deductWarehouseStockForSales("GUDANG-1", it.sku_id, qty, newTxnId, outlet_id, req.user!._id, notes);
        }"""

content = content.replace(target, replacement)
content = content.replace('const processedItems = items.map((it: any, idx: number) => {', 'const processedItems = await Promise.all(items.map(async (it: any, idx: number) => {'))

with open("server/routes.ts", "w") as f:
    f.write(content)
