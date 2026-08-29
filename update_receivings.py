import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """  const nowStr = new Date().toISOString();
  r.items.forEach((it, idx) => {
    const whInv = ensureWarehouseInventory(r.warehouse_id, it.sku_id);
    whInv.stock_on_hand += it.quantity;
    whInv.available_stock += it.quantity;
    whInv.updated_at = nowStr;
    syncSingleDoc("inventory", whInv._id, whInv);

    const mvtCount = db.stock_movements.length + 1;
    const mvt: StockMovement = {
      _id: `mvt-${Date.now()}-rcv-${idx}`,
      movement_code: `MVT-${r.receiving_date.replace(/-/g, "")}-${String(mvtCount).padStart(4, "0")}`,
      movement_type: "PURCHASE_IN",
      source_location_type: "SUPPLIER",
      source_location_id: r.supplier_name,
      destination_location_type: "WAREHOUSE",
      destination_location_id: r.warehouse_id,
      sku_id: it.sku_id,
      quantity: it.quantity,
      warehouse_id: r.warehouse_id,
      reference_id: r._id,
      business_date: r.receiving_date,
      status: "COMPLETED",
      notes: `Penerimaan Barang Supplier ${r.supplier_name} (${r.receiving_code})`,
      created_by: req.user!._id,
      created_at: nowStr,
    };
    db.stock_movements.push(mvt);
    syncSingleDoc("stock_movements", mvt._id, mvt);
  });"""

replacement = """  try {
    await InventoryService.processReceiving(r, r.items, req.user!._id);
  } catch (err: any) {
    return res.status(400).json({ detail: err.message, code: "INVENTORY_ERROR" });
  }"""

content = content.replace(target, replacement)
content = content.replace('apiRouter.post("/stock/receivings/:id/post", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {', 'apiRouter.post("/stock/receivings/:id/post", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {')

with open("server/routes.ts", "w") as f:
    f.write(content)

