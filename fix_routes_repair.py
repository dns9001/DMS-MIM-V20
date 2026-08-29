import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

# I will replace the whole POST /stock/handovers block up to the end of POST /stock/handovers/:id/confirm
target_regex = r'apiRouter\.post\("/stock/handovers".*?apiRouter\.post\("/stock/handovers/:id/confirm".*?res\.json\(\{ message: "Stok telah disiapkan di area loading gudang\.", handover: h \}\);\n\}\);'

def repl(match):
    return """apiRouter.post("/stock/handovers", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {
  const { business_date, warehouse_id, salesman_id, items, notes, is_additional, handover_type, handover_time, time, auto_confirm } = req.body || {};

  const targetDate = business_date || getTodayWIB();
  const targetWhId = warehouse_id || req.user?.office_id || "off-1";
  const isAdditional = !!is_additional || handover_type === "ADDITIONAL_HANDOVER";
  const type: "INITIAL_HANDOVER" | "ADDITIONAL_HANDOVER" = isAdditional ? "ADDITIONAL_HANDOVER" : "INITIAL_HANDOVER";
  const handoverTime = handover_time || time || new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  if (!salesman_id || !items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ detail: "Salesman, tanggal, dan daftar item produk wajib diisi." });
  }

  const sales = db.users.find((u) => u._id === salesman_id && u.role === "SALES");
  if (!sales) {
    return res.status(404).json({ detail: "Salesman tidak ditemukan dalam sistem." });
  }

  const wh = db.offices.find((o) => o._id === targetWhId);

  // Validate duplicate handover for same sales & date if initial handover
  if (!isAdditional) {
    const existing = db.stock_handovers.find(
      (h) => h.salesman_id === salesman_id && h.business_date === targetDate && h.status !== "CANCELLED" && !h.is_additional && (h as any).handover_type !== "ADDITIONAL_HANDOVER"
    );
    if (existing) {
      return res.status(400).json({
        detail: `Serah terima stok awal (Initial Handover) untuk ${sales.name} pada tanggal ${targetDate} sudah terdaftar (${existing.handover_code}). Silakan gunakan opsi "Stock Handover Tambahan / Additional Handover" untuk menambah stok lagi.`,
        code: "DUPLICATE_HANDOVER",
      });
    }
  }

  // Validate item quantities and active SKU
  const processedItems: DailyStockHandoverItem[] = [];
  for (const it of items) {
    const qty = parseInt(it.quantity) || 0;
    if (qty <= 0) {
      return res.status(400).json({ detail: "Kuantitas setiap item produk harus lebih dari 0." });
    }
    const sku = db.skus.find((s) => s._id === it.sku_id && s.status === "ACTIVE");
    if (!sku) {
      return res.status(400).json({ detail: `SKU dengan ID ${it.sku_id} tidak valid atau tidak aktif.` });
    }
    processedItems.push({
      sku_id: it.sku_id,
      quantity: qty,
      notes: it.notes || "",
    });
  }

  const count = db.stock_handovers.length + 1;
  const prefix = isAdditional ? "HND-ADD" : "HND";
  const handoverCode = `${prefix}-${targetDate.replace(/-/g, "")}-${String(count).padStart(3, "0")}`;
  const handoverId = `hnd-${Date.now()}`;
  const nowStr = new Date().toISOString();

  const newHandover: DailyStockHandover = {
    _id: handoverId,
    handover_code: handoverCode,
    business_date: targetDate,
    warehouse_id: targetWhId,
    salesman_id,
    status: auto_confirm ? "CONFIRMED" : "DRAFT",
    is_additional: isAdditional,
    items: processedItems,
    notes: notes || "",
    prepared_by: req.user!._id,
    prepared_at: nowStr,
    confirmed_by: auto_confirm ? req.user!._id : undefined,
    confirmed_at: auto_confirm ? nowStr : undefined,
    created_by: req.user!._id,
    created_at: nowStr,
    updated_at: nowStr,
  };
  (newHandover as any).handover_type = type;
  (newHandover as any).handover_time = handoverTime;

  db.stock_handovers.push(newHandover as any);
  syncSingleDoc("stock_handovers", newHandover._id, newHandover);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { stockHandovers } = require('../src/db/schema.js');
    await sqlDb.insert(stockHandovers).values({
      id: newHandover._id,
      handoverNumber: newHandover.handover_code,
      salesmanId: newHandover.salesman_id,
      officeId: newHandover.warehouse_id,
      handoverDate: newHandover.business_date,
      status: newHandover.status,
      items: newHandover.items,
      notes: newHandover.notes,
      approvedBy: newHandover.confirmed_by,
      createdAt: new Date(newHandover.created_at)
    });
  } catch (err: any) {
    console.error("Error inserting handover to Postgres:", err.message);
  }

  if (auto_confirm) {
    try {
      await InventoryService.processHandover(newHandover, newHandover.items, req.user!._id);
      await refreshInventoryCache();
    } catch (err: any) {
      return res.status(400).json({ detail: err.message, code: "INSUFFICIENT_WAREHOUSE_STOCK" });
    }
  }

  res.status(201).json(newHandover);
});

apiRouter.post("/stock/handovers/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {
  const h = db.stock_handovers.find((item) => item._id === req.params.id);
  if (!h) return res.status(404).json({ detail: "Data serah terima tidak ditemukan." });

  if (h.status === "CONFIRMED") {
    return res.status(400).json({ detail: "Serah terima ini sudah pernah dikonfirmasi sebelumnya." });
  }

  if (h.status === "CANCELLED") {
    return res.status(400).json({ detail: "Serah terima yang telah dibatalkan tidak dapat dikonfirmasi." });
  }

  try {
    await InventoryService.processHandover(h, h.items, req.user!._id);
    await refreshInventoryCache();
  } catch (err: any) {
    return res.status(400).json({ detail: err.message, code: "INSUFFICIENT_WAREHOUSE_STOCK" });
  }

  const nowStr = new Date().toISOString();
  h.status = "CONFIRMED";
  h.confirmed_by = req.user!._id;
  h.confirmed_at = nowStr;
  h.updated_at = nowStr;
  syncSingleDoc("stock_handovers", h._id, h);

  res.json({ message: "Stok telah disiapkan di area loading gudang.", handover: h });
});"""

content = re.sub(target_regex, repl, content, flags=re.DOTALL)
with open("server/routes.ts", "w") as f:
    f.write(content)
