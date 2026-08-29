import sys

with open("server/routes.ts", "r") as f:
    lines = f.readlines()

new_block = """apiRouter.post("/stock/receivings", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const { po_number, supplier_name, warehouse_id, receiving_date, items, notes, auto_post } = req.body || {};

  const targetDate = receiving_date || getTodayWIB();
  const targetWhId = warehouse_id || req.user?.office_id || "off-1";
  const isPosted = !!auto_post;

  if (!supplier_name || !items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ detail: "Nama supplier dan daftar item produk wajib diisi." });
  }

  const processedItems = [];
  let totalQty = 0;
  let totalVal = 0;

  for (const it of items) {
    const qty = parseInt(it.quantity) || 0;
    if (qty <= 0) {
      return res.status(400).json({ detail: "Kuantitas setiap item produk harus lebih dari 0." });
    }
    const sku = db.skus.find((s) => s._id === it.sku_id && s.status === "ACTIVE");
    if (!sku) {
      return res.status(400).json({ detail: `SKU dengan ID ${it.sku_id} tidak valid atau tidak aktif.` });
    }
    const up = Number(it.unit_price) || sku.base_price || 0;
    processedItems.push({
      sku_id: it.sku_id,
      quantity: qty,
      unit_price: up,
      notes: it.notes || "",
    });
    totalQty += qty;
    totalVal += (qty * up);
  }

  const count = (db.stock_receivings || []).length + 1;
  const receivingCode = `RCV-${targetDate.replace(/-/g, "")}-${String(count).padStart(3, "0")}`;
  const receivingId = `rcv-${Date.now()}`;
  const nowStr = new Date().toISOString();

  const newReceiving = {
    _id: receivingId,
    receiving_code: receivingCode,
    po_number: po_number || `PO-${targetDate.replace(/-/g, "")}-${String(count).padStart(3, "0")}`,
    supplier_name: supplier_name.trim(),
    warehouse_id: targetWhId,
    receiving_date: targetDate,
    status: isPosted ? "POSTED" : "DRAFT",
    items: processedItems,
    total_quantity: totalQty,
    total_value: totalVal,
    notes: notes || "",
    received_by: req.user!._id,
    posted_by: isPosted ? req.user!._id : undefined,
    posted_at: isPosted ? nowStr : undefined,
    created_by: req.user!._id,
    created_at: nowStr,
    updated_at: nowStr,
  };

  if (!db.stock_receivings) db.stock_receivings = [];
  db.stock_receivings.push(newReceiving as any);
  syncSingleDoc("stock_receivings", newReceiving._id, newReceiving);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { stockReceivings } = require('../src/db/schema.js');
    await sqlDb.insert(stockReceivings).values({
      id: newReceiving._id,
      receivingNumber: newReceiving.receiving_code,
      poNumber: newReceiving.po_number,
      officeId: newReceiving.warehouse_id,
      supplierName: newReceiving.supplier_name,
      receivedDate: newReceiving.receiving_date,
      status: newReceiving.status,
      totalQuantity: newReceiving.total_quantity,
      totalValue: newReceiving.total_value,
      items: newReceiving.items,
      notes: newReceiving.notes,
      receivedBy: newReceiving.received_by,
      postedBy: newReceiving.posted_by,
      postedAt: newReceiving.posted_at ? new Date(newReceiving.posted_at) : null,
      createdAt: new Date(newReceiving.created_at),
      updatedAt: new Date(newReceiving.updated_at)
    });
  } catch (err: any) {
    console.error("Error inserting stock receiving to Postgres:", err.message);
  }

  if (isPosted) {
    try {
      await InventoryService.processReceiving(newReceiving, newReceiving.items, req.user!._id);
      await refreshInventoryCache();
    } catch (err: any) {
      return res.status(400).json({ detail: err.message, code: "INVENTORY_ERROR" });
    }
  }

  recordAuditLog(
    req.user!._id,
    "CREATE_STOCK_RECEIVING",
    "stock_receivings",
    newReceiving._id,
    {
      receiving_code: newReceiving.receiving_code,
      supplier_name: newReceiving.supplier_name,
      total_quantity: newReceiving.total_quantity,
    }
  );

  res.status(201).json(newReceiving);
});

apiRouter.post("/stock/receivings/:id/post", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const r = (db.stock_receivings || []).find((item) => item._id === req.params.id);
  if (!r) return res.status(404).json({ detail: "Data penerimaan tidak ditemukan." });

  if (r.status === "POSTED") {
    return res.status(400).json({ detail: "Penerimaan barang ini sudah diposting sebelumnya." });
  }

  if (r.status === "CANCELLED") {
    return res.status(400).json({ detail: "Penerimaan barang yang telah dibatalkan tidak dapat diposting." });
  }

  const nowStr = new Date().toISOString();

  try {
    await InventoryService.processReceiving(r, r.items, req.user!._id);
    await refreshInventoryCache();
  } catch (err: any) {
    return res.status(400).json({ detail: err.message, code: "INVENTORY_ERROR" });
  }

  r.status = "POSTED";
  r.posted_by = req.user!._id;
  r.posted_at = nowStr;
  r.updated_at = nowStr;
  syncSingleDoc("stock_receivings", r._id, r);

  recordAuditLog(
    req.user!._id,
    "POST_STOCK_RECEIVING",
    "stock_receivings",
    r._id,
    {
      receiving_code: r.receiving_code,
      supplier_name: r.supplier_name,
      total_quantity: r.total_quantity,
    }
  );

  res.json({
    message: `Penerimaan barang ${r.receiving_code} berhasil diposting. Stok gudang resmi bertambah (+${r.total_quantity} Unit).`,
    receiving: r,
  });
});
"""

lines = lines[:10202] + [new_block] + lines[10333:]

with open("server/routes.ts", "w") as f:
    f.writelines(lines)
