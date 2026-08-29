import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target_void = r"""apiRouter\.post\("/transactions/:id/void", authMiddleware, requireRoles\("SUPERVISOR", "ADMIN", "OWNER", "SALES"\), \(req: AuthenticatedRequest, res\) => \{
  const txn = db\.transactions\.find\(\(t\) => t\._id === req\.params\.id \|\| t\.invoice_number === req\.params\.id\);
  if \(!txn\) return res\.status\(404\)\.json\(\{ detail: "Transaksi tidak ditemukan\." \}\);
  if \(req\.user!\.role === "SALES" && txn\.salesman_id !== req\.user!\._id\) \{
    return res\.status\(403\)\.json\(\{ detail: "Akses ditolak\. Anda hanya dapat membatalkan transaksi milik Anda sendiri\." \}\);
  \}
  if \(txn\.status === "CANCELLED"\) return res\.status\(400\)\.json\(\{ detail: "Transaksi sudah dibatalkan sebelumnya\." \}\);

  const \{ reason \} = req\.body \|\| \{\};
  if \(!reason\) return res\.status\(400\)\.json\(\{ detail: "Alasan void/pembatalan transaksi wajib diisi\." \}\);

  txn\.status = "CANCELLED";
  const today = getTodayWIB\(\);

  // Reverse stock back to salesman
  \(txn\.items \|\| \[\]\)\.forEach\(\(it: any, idx: number\) => \{
    const qty = Number\(it\.quantity \?\? it\.volume \?\? 0\);
    let salesInv = db\.inventory\.find\(
      \(i\) => i\.location_type === "SALES" && i\.location_id === txn\.salesman_id && i\.sku_id === it\.sku_id
    \);
    if \(salesInv\) \{
      salesInv\.stock_on_hand \+= qty;
      salesInv\.available_stock \+= qty;
      salesInv\.updated_at = new Date\(\)\.toISOString\(\);
    \}

    db\.stock_movements\.push\(\{
      _id: `mvt-rev-\$\{Date\.now\(\)\}-\$\{idx\}`,
      movement_code: `MVT-REV-\$\{today\.replace\(/-/g, ""\)\}-\$\{String\(db\.stock_movements\.length \+ 1\)\.padStart\(4, "0"\)\}`,
      movement_type: "REVERSAL",
      source_location_type: "OUTLET",
      source_location_id: txn\.outlet_id,
      destination_location_type: "SALES",
      destination_location_id: txn\.salesman_id,
      sku_id: it\.sku_id,
      quantity: qty,
      salesman_id: txn\.salesman_id,
      outlet_id: txn\.outlet_id,
      reference_id: txn\._id,
      business_date: today,
      status: "COMPLETED",
      notes: `Reversal pembatalan \$\{txn\.invoice_number \|\| txn\._id\}: \$\{reason\}`,
      created_by: req\.user!\._id,
      created_at: new Date\(\)\.toISOString\(\),
    \}\);

    syncSalesStockLedger\(txn\.salesman_id, it\.sku_id, today\);
  \}\);

  // Recalculate outlet lifecycle status & metrics after void
  recalculateOutletSummary\(txn\.outlet_id\);
  const updatedOutletAfterCancel = db\.outlets\.find\(\(o\) => o\._id === txn\.outlet_id\);
  if \(updatedOutletAfterCancel\) syncSingleDoc\("outlets", updatedOutletAfterCancel\._id, updatedOutletAfterCancel\);
  syncSingleDoc\("transactions", txn\._id, txn\);

  recordAuditLog\(
    req\.user!\._id,
    "VOID_TRANSACTION",
    "transactions",
    txn\._id,
    \{
      invoice_number: txn\.invoice_number,
      new_status: "CANCELLED",
      reason,
      changed_by_name: req\.user!\.name,
      timestamp: new Date\(\)\.toISOString\(\),
    \}
  \);

  res\.json\(\{
    message: "Transaksi berhasil divoid dan stok telah dikembalikan ke salesman\.",
    transaction: txn,
  \}\);
\}\);"""

repl_void = r"""apiRouter.post("/transactions/:id/void", authMiddleware, requireRoles("SUPERVISOR", "ADMIN", "OWNER", "SALES"), async (req: AuthenticatedRequest, res) => {
  const txn = db.transactions.find((t) => t._id === req.params.id || t.invoice_number === req.params.id);
  if (!txn) return res.status(404).json({ detail: "Transaksi tidak ditemukan." });
  if (req.user!.role === "SALES" && txn.salesman_id !== req.user!._id) {
    return res.status(403).json({ detail: "Akses ditolak. Anda hanya dapat membatalkan transaksi milik Anda sendiri." });
  }
  if (txn.status === "CANCELLED") return res.status(400).json({ detail: "Transaksi sudah dibatalkan sebelumnya." });

  const { reason } = req.body || {};
  if (!reason) return res.status(400).json({ detail: "Alasan void/pembatalan transaksi wajib diisi." });

  txn.status = "CANCELLED";
  const today = getTodayWIB();

  for (const [idx, it] of (txn.items || []).entries()) {
    const qty = Number(it.quantity ?? it.volume ?? 0);
    const notes = `Reversal pembatalan ${txn.invoice_number || txn._id}: ${reason}`;

    try {
      await InventoryService.reverseSalesStock(txn.salesman_id, it.sku_id, qty, txn._id, txn.outlet_id, notes);
    } catch (err: any) {
      console.error("Failed to reverse stock via ORM:", err);
    }

    let salesInv = db.inventory.find(
      (i) => i.location_type === "SALES" && i.location_id === txn.salesman_id && i.sku_id === it.sku_id
    );
    if (salesInv) {
      syncSingleDoc("inventory", salesInv._id, salesInv);
    }

    db.stock_movements.push({
      _id: `mvt-rev-${Date.now()}-${idx}`,
      movement_code: `MVT-REV-${today.replace(/-/g, "")}-${String(db.stock_movements.length + 1).padStart(4, "0")}`,
      movement_type: "REVERSAL",
      source_location_type: "OUTLET",
      source_location_id: txn.outlet_id,
      destination_location_type: "SALES",
      destination_location_id: txn.salesman_id,
      sku_id: it.sku_id,
      quantity: qty,
      salesman_id: txn.salesman_id,
      outlet_id: txn.outlet_id,
      reference_id: txn._id,
      business_date: today,
      status: "COMPLETED",
      notes: notes,
      created_by: req.user!._id,
      created_at: new Date().toISOString(),
    });
    const lastMovement = db.stock_movements[db.stock_movements.length - 1];
    syncSingleDoc("stock_movements", lastMovement._id, lastMovement);

    syncSalesStockLedger(txn.salesman_id, it.sku_id, today);
  }

  // Recalculate outlet lifecycle status & metrics after void
  recalculateOutletSummary(txn.outlet_id);
  const updatedOutletAfterCancel = db.outlets.find((o) => o._id === txn.outlet_id);
  if (updatedOutletAfterCancel) syncSingleDoc("outlets", updatedOutletAfterCancel._id, updatedOutletAfterCancel);
  syncSingleDoc("transactions", txn._id, txn);
  
  try {
    const { sqlDb } = require('../src/db/index.js');
    const { transactions: pgTransactions } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgTransactions)
      .set({ paymentStatus: "CANCELLED" })
      .where(eq(pgTransactions.id, txn._id));
  } catch (err: any) {
    console.error("Error voiding transaction in PG:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "VOID_TRANSACTION",
    "transactions",
    txn._id,
    {
      invoice_number: txn.invoice_number,
      new_status: "CANCELLED",
      reason,
      changed_by_name: req.user!.name,
      timestamp: new Date().toISOString(),
    }
  );

  res.json({
    message: "Transaksi berhasil divoid dan stok telah dikembalikan ke salesman.",
    transaction: txn,
  });
});"""

content = re.sub(target_void, repl_void, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
