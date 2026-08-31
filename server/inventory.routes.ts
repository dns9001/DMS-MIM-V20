import { Router } from "express";
import { authMiddleware, requireRoles } from "./auth.js";
import { AuthenticatedRequest } from "./auth.js";
import { sqlDb } from "../src/db/index.js";
import { inventory, stockMovements } from "../src/db/schema.js";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { InventoryService } from "./inventory.service.js";
import { db } from "./data.js";
import { resolveSkuInfo } from "./skuResolver.js";
import { isCloudSqlConnected } from "./cloudsqlSync.js";

const router = Router();

router.get("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { location_type, location_id, sku_id } = req.query as Record<string, string>;
  let items: any[] = [];
  
  if (isCloudSqlConnected) {
    const conditions = [];
    if (location_type) conditions.push(eq(inventory.locationType, location_type));
    if (location_id) conditions.push(eq(inventory.locationId, location_id));
    if (sku_id) conditions.push(eq(inventory.skuId, sku_id));
    items = await sqlDb.select().from(inventory).where(and(...conditions));
  } else {
    items = db.inventory.filter((i) => {
      let m = true;
      if (location_type && i.location_type !== location_type) m = false;
      if (location_id && i.location_id !== location_id) m = false;
      if (sku_id && i.sku_id !== sku_id) m = false;
      return m;
    }).map((i) => ({
      id: i._id, locationType: i.location_type, locationId: i.location_id, skuId: i.sku_id,
      stockOnHand: i.stock_on_hand, availableStock: i.available_stock, allocatedStock: i.allocated_stock,
      status: i.status, updatedAt: i.updated_at ? new Date(i.updated_at) : new Date(),
    }));
  }

  const enriched = items.map((inv) => {
    const skuInfo = resolveSkuInfo(inv.skuId);
    const office = db.offices.find((o) => o._id === inv.locationId);
    const sales = inv.locationType === "SALES" ? db.users.find((u) => u._id === inv.locationId) : null;
    const prc = db.prices.find((p) => p.sku_id === inv.skuId && p.status === "ACTIVE");
    return {
      _id: inv.id, location_type: inv.locationType, location_id: inv.locationId, sku_id: inv.skuId,
      stock_on_hand: inv.stockOnHand, available_stock: inv.availableStock, allocated_stock: inv.allocatedStock,
      status: inv.status, updated_at: inv.updatedAt, sku_code: skuInfo.sku_code || "-", sku_name: skuInfo.resolved_name,
      unit: skuInfo.uom || "Unit", price: prc?.price || 0, office_name: office?.office_name || "Gudang Pusat",
      location_name: inv.locationType === "SALES" ? `Sales: ${sales?.name || inv.locationId}` : (office?.office_name || "Gudang Pusat"),
      salesman_name: sales?.name || "-",
    };
  });
  res.json({ items: enriched, total: enriched.length });
});

router.get("/movements", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { from_date, to_date, sku_id, movement_type, salesman_id } = req.query as Record<string, string>;
  let enriched: any[] = [];
  
  if (isCloudSqlConnected) {
    const conditions = [];
    if (from_date) conditions.push(gte(stockMovements.createdAt, new Date(from_date)));
    if (to_date) { const toDate = new Date(to_date); toDate.setHours(23, 59, 59, 999); conditions.push(lte(stockMovements.createdAt, toDate)); }
    if (sku_id) conditions.push(eq(stockMovements.skuId, sku_id));
    if (movement_type) conditions.push(eq(stockMovements.movementType, movement_type));
    if (salesman_id) conditions.push(eq(stockMovements.performedBy, salesman_id));
    
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
  
  res.json({ items: enriched, total: enriched.length });
});

router.post("/opname", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const { warehouse_id, items, notes } = req.body || {};
  if (!warehouse_id || !items || !items.length) return res.status(400).json({ detail: "Warehouse dan item wajib diisi." });
  try {
    let totalAdjusted = 0;
    if (isCloudSqlConnected) {
      totalAdjusted = await sqlDb.transaction(async (tx) => {
        let count = 0;
        for (const it of items) {
          const diff = Number(it.physical_count) - Number(it.system_stock);
          if (diff !== 0) {
            await InventoryService.processOpname(warehouse_id, it.sku_id, diff, req.user!._id, notes || "Stock Opname", tx);
            count++;
          }
        }
        return count;
      });
    } else {
      for (const it of items) {
        const diff = Number(it.physical_count) - Number(it.system_stock);
        if (diff !== 0) {
          await InventoryService.processOpname(warehouse_id, it.sku_id, diff, req.user!._id, notes || "Stock Opname", null);
          totalAdjusted++;
        }
      }
    }
    res.json({ message: "Stock Opname berhasil.", total_adjusted: totalAdjusted });
  } catch (err: any) { res.status(400).json({ detail: err.message }); }
});

router.post("/adjustments", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const { warehouse_id, items, adjustment_type, notes } = req.body || {};
  if (!warehouse_id || !items || !items.length || !adjustment_type) return res.status(400).json({ detail: "Semua field wajib diisi." });
  if (!["IN", "OUT"].includes(adjustment_type)) return res.status(400).json({ detail: "Jenis adjustment tidak valid." });
  try {
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
  } catch (err: any) { res.status(400).json({ detail: err.message }); }
});

export default router;
