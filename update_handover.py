import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """  // 2. ATOMIC EXECUTION: Move stock from Warehouse to Sales
  const nowStr = new Date().toISOString();
  h.items.forEach((it, idx) => {
    // Deduct Warehouse stock
    const whInv = ensureWarehouseInventory(h.warehouse_id, it.sku_id);
    whInv.stock_on_hand -= it.quantity;
    whInv.available_stock -= it.quantity;
    whInv.updated_at = nowStr;
    syncSingleDoc("inventory", whInv._id, whInv);

    // Add Sales stock
    const salesInv = ensureSalesInventory(h.salesman_id, it.sku_id);
    salesInv.stock_on_hand += it.quantity;
    salesInv.available_stock += it.quantity;
    salesInv.updated_at = nowStr;
    syncSingleDoc("inventory", salesInv._id, salesInv);

    // Record Stock Movement Out (Warehouse)
    const mvtCount = db.stock_movements.length + 1;
    const mvtOut: StockMovement = {
      _id: `mvt-${Date.now()}-${idx}-out`,
      movement_code: `MVT-OUT-${nowStr.slice(0, 10).replace(/-/g, "")}-${String(mvtCount).padStart(4, "0")}`,
      movement_type: "TRANSFER_OUT",
      source_location_type: "WAREHOUSE",
      source_location_id: h.warehouse_id,
      destination_location_type: "SALES",
      destination_location_id: h.salesman_id,
      sku_id: it.sku_id,
      quantity: it.quantity,
      warehouse_id: h.warehouse_id,
      salesman_id: h.salesman_id,
      reference_id: h._id,
      business_date: h.handover_date,
      status: "COMPLETED",
      notes: `Serah Terima ke Sales (No: ${h.handover_number})`,
      created_by: req.user!._id,
      created_at: nowStr,
    };
    db.stock_movements.push(mvtOut);
    syncSingleDoc("stock_movements", mvtOut._id, mvtOut);

    // Record Stock Movement In (Sales)
    const mvtIn: StockMovement = {
      _id: `mvt-${Date.now()}-${idx}-in`,
      movement_code: `MVT-IN-${nowStr.slice(0, 10).replace(/-/g, "")}-${String(mvtCount + 1).padStart(4, "0")}`,
      movement_type: "TRANSFER_IN",
      source_location_type: "WAREHOUSE",
      source_location_id: h.warehouse_id,
      destination_location_type: "SALES",
      destination_location_id: h.salesman_id,
      sku_id: it.sku_id,
      quantity: it.quantity,
      warehouse_id: h.warehouse_id,
      salesman_id: h.salesman_id,
      reference_id: h._id,
      business_date: h.handover_date,
      status: "COMPLETED",
      notes: `Terima dari Gudang (No: ${h.handover_number})`,
      created_by: req.user!._id,
      created_at: nowStr,
    };
    db.stock_movements.push(mvtIn);
    syncSingleDoc("stock_movements", mvtIn._id, mvtIn);
  });"""

replacement = """  // 2. ATOMIC EXECUTION: Move stock from Warehouse to Sales
  try {
    await InventoryService.processHandover(h, h.items, req.user!._id);
  } catch (err: any) {
    return res.status(400).json({ detail: err.message, code: "INVENTORY_ERROR" });
  }"""

content = content.replace(target, replacement)

# Now for Returns
target_ret = """  const nowStr = new Date().toISOString();
  r.items.forEach((it, idx) => {
    // Add Warehouse stock
    const whInv = ensureWarehouseInventory(r.warehouse_id, it.sku_id);
    whInv.stock_on_hand += it.quantity;
    whInv.available_stock += it.quantity;
    whInv.updated_at = nowStr;
    syncSingleDoc("inventory", whInv._id, whInv);

    // Deduct Sales stock
    const salesInv = ensureSalesInventory(r.salesman_id, it.sku_id);
    salesInv.stock_on_hand = Math.max(0, salesInv.stock_on_hand - it.quantity);
    salesInv.available_stock = Math.max(0, salesInv.available_stock - it.quantity);
    salesInv.updated_at = nowStr;
    syncSingleDoc("inventory", salesInv._id, salesInv);

    // Record Stock Movement
    const mvtCount = db.stock_movements.length + 1;
    const mvt: StockMovement = {
      _id: `mvt-${Date.now()}-${idx}`,
      movement_code: `MVT-RET-${nowStr.slice(0, 10).replace(/-/g, "")}-${String(mvtCount).padStart(4, "0")}`,
      movement_type: "RETURN_IN",
      source_location_type: "SALES",
      source_location_id: r.salesman_id,
      destination_location_type: "WAREHOUSE",
      destination_location_id: r.warehouse_id,
      sku_id: it.sku_id,
      quantity: it.quantity,
      warehouse_id: r.warehouse_id,
      salesman_id: r.salesman_id,
      reference_id: r._id,
      business_date: r.return_date,
      status: "COMPLETED",
      notes: `Return dari Sales (No: ${r.return_number})`,
      created_by: req.user!._id,
      created_at: nowStr,
    };
    db.stock_movements.push(mvt);
    syncSingleDoc("stock_movements", mvt._id, mvt);
  });"""

replacement_ret = """  // 2. ATOMIC EXECUTION: Move stock from Sales to Warehouse
  try {
    await InventoryService.processReturn(r, r.items, req.user!._id);
  } catch (err: any) {
    return res.status(400).json({ detail: err.message, code: "INVENTORY_ERROR" });
  }"""

content = content.replace(target_ret, replacement_ret)

# Now we must make the route handlers async!
content = content.replace('apiRouter.post("/stock/handovers/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), (req: AuthenticatedRequest, res) => {', 'apiRouter.post("/stock/handovers/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {')
content = content.replace('apiRouter.post("/stock/returns/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), (req: AuthenticatedRequest, res) => {', 'apiRouter.post("/stock/returns/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {')

with open("server/routes.ts", "w") as f:
    f.write(content)

