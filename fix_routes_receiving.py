import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

# Replace receiving post
target_start = """  if (!db.stock_receivings) db.stock_receivings = [];"""
target_end = """    await refreshInventoryCache();
  }"""

match = re.search(re.escape(target_start) + r".*?" + re.escape(target_end), content, re.DOTALL)
if match:
    repl = """  if (!db.stock_receivings) db.stock_receivings = [];
  db.stock_receivings.push(newReceiving);
  syncSingleDoc("stock_receivings", newReceiving._id, newReceiving);

  try {
    // INSERT TO POSTGRESQL NATIVELY
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

  // If auto_post: Immediately increase warehouse inventory and create stock movements
  if (isPosted) {
  const nowStr = new Date().toISOString();
  try {
    await InventoryService.processReceiving(newReceiving, newReceiving.items, req.user!._id);
    await refreshInventoryCache();
  }"""
    content = content.replace(match.group(0), repl)

with open("server/routes.ts", "w") as f:
    f.write(content)
