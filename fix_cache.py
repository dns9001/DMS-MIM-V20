import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """// Automatic DB persistence hook for all mutating operations (PostgreSQL as Single Source of Truth)"""

replacement = """import { inventory as inventorySchema } from "../src/db/schema.js";
import { sqlDb } from "../src/db/index.js";

async function refreshInventoryCache() {
  const rows = await sqlDb.select().from(inventorySchema);
  db.inventory.length = 0;
  for (const r of rows) {
    db.inventory.push({
      _id: r.id,
      location_type: r.locationType as any,
      location_id: r.locationId,
      office_id: r.locationType === "WAREHOUSE" ? r.locationId : "",
      sku_id: r.skuId,
      stock_on_hand: r.stockOnHand,
      available_stock: r.availableStock,
      allocated_stock: r.allocatedStock,
      status: r.status as any,
      updated_at: r.updatedAt?.toISOString() || "",
      created_at: r.createdAt?.toISOString() || ""
    });
  }
}

// Automatic DB persistence hook for all mutating operations (PostgreSQL as Single Source of Truth)"""

content = content.replace(target, replacement)

# After Handover
h_target = """  try {
    await InventoryService.processHandover(h, h.items as any[], req.user!._id);
    
    await sqlDb.update(stockHandovers).set({ status: "CONFIRMED" }).where(eq(stockHandovers.id, h.id));
    res.json({ message: "Handover confirmed" });"""

h_repl = """  try {
    await InventoryService.processHandover(h, h.items as any[], req.user!._id);
    await refreshInventoryCache();
    await sqlDb.update(stockHandovers).set({ status: "CONFIRMED" }).where(eq(stockHandovers.id, h.id));
    res.json({ message: "Handover confirmed" });"""

# After Return
r_target = """  try {
    await InventoryService.processReturn(r, r.items as any[], req.user!._id);
    
    await sqlDb.update(stockReturns).set({ status: "CONFIRMED" }).where(eq(stockReturns.id, r.id));
    res.json({ message: "Return confirmed" });"""

r_repl = """  try {
    await InventoryService.processReturn(r, r.items as any[], req.user!._id);
    await refreshInventoryCache();
    await sqlDb.update(stockReturns).set({ status: "CONFIRMED" }).where(eq(stockReturns.id, r.id));
    res.json({ message: "Return confirmed" });"""

# After Receiving
rcv_target = """  try {
    await InventoryService.processReceiving(r, r.items, req.user!._id);
  } catch (err: any) {"""

rcv_repl = """  try {
    await InventoryService.processReceiving(r, r.items, req.user!._id);
    await refreshInventoryCache();
  } catch (err: any) {"""

with open("server/stock.routes.ts", "r") as f:
    stock_content = f.read()
    
stock_content = stock_content.replace(h_target, h_repl).replace(r_target, r_repl)

with open("server/stock.routes.ts", "w") as f:
    f.write(stock_content)

content = content.replace(rcv_target, rcv_repl)

with open("server/routes.ts", "w") as f:
    f.write(content)
