import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """apiRouter.get("/transactions/sku-list", authMiddleware, (req: AuthenticatedRequest, res) => {
  const salesmanId = req.user?.role === "SALES" ? req.user._id : (req.query.salesman_id as string) || req.user?._id || "";
  const warehouseId = (req.query.warehouse_id as string) || req.user?.office_id || "off-1";

  const skus = db.skus.filter((s) => s.status === "ACTIVE").map((s) => {
    const prc = db.prices.find((p) => p.sku_id === s._id && p.status === "ACTIVE");
    const prd = db.products.find((p) => p._id === s.product_id);
    
    // Check sales stock for this sales rep
    const salesInv = db.inventory.find(
      (i) => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === s._id
    );
    const whInv = db.inventory.find(
      (i) => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === warehouseId || i.office_id === warehouseId) && i.sku_id === s._id
    );

    return {
      _id: s._id,
      sku_id: s._id,
      name: s.name,
      sku_code: s.code,
      unit: s.unit,
      price: prc?.price || 0,
      product_name: prd?.name,
      available_sales_stock: salesInv ? salesInv.available_stock : 0,
      available_warehouse_stock: whInv ? whInv.available_stock : 0,
    };
  });
  res.json({ items: skus, total: skus.length });
});"""

replacement = """apiRouter.get("/transactions/sku-list", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const salesmanId = req.user?.role === "SALES" ? req.user._id : (req.query.salesman_id as string) || req.user?._id || "";
    const warehouseId = (req.query.warehouse_id as string) || req.user?.office_id || "off-1";

    const salesInventory = await InventoryRepository.getInventoryListByLocation("SALES", salesmanId);
    const warehouseInventory = await InventoryRepository.getInventoryListByLocation("WAREHOUSE", warehouseId);

    const salesInvMap = new Map(salesInventory.map(i => [i.skuId, i.availableStock]));
    const whInvMap = new Map(warehouseInventory.map(i => [i.skuId, i.availableStock]));

    const skus = db.skus.filter((s) => s.status === "ACTIVE").map((s) => {
      const prc = db.prices.find((p) => p.sku_id === s._id && p.status === "ACTIVE");
      const prd = db.products.find((p) => p._id === s.product_id);
      
      return {
        _id: s._id,
        sku_id: s._id,
        name: s.name,
        sku_code: s.code,
        unit: s.unit,
        price: prc?.price || 0,
        product_name: prd?.name,
        available_sales_stock: salesInvMap.get(s._id) || 0,
        available_warehouse_stock: whInvMap.get(s._id) || 0,
      };
    });
    res.json({ items: skus, total: skus.length });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});"""

content = content.replace(target, replacement)

with open("server/routes.ts", "w") as f:
    f.write(content)

