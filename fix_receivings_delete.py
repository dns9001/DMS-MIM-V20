import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target_rcv_del = r"""  db.stock_receivings.splice\(idx, 1\);
  recordAuditLog\(
    req.user!\._id,
    "DELETE_STOCK_RECEIVING",
    "stock_receivings",
    req.params.id,
    \{ receiving_code: r.receiving_code \}
  \);
  deleteSingleDoc\("stock_receivings", r._id\);"""

repl_rcv_del = r"""  db.stock_receivings.splice(idx, 1);
  recordAuditLog(
    req.user!._id,
    "DELETE_STOCK_RECEIVING",
    "stock_receivings",
    req.params.id,
    { receiving_code: r.receiving_code }
  );
  deleteSingleDoc("stock_receivings", r._id);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { stockReceivings: pgStockReceivings } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    sqlDb.delete(pgStockReceivings).where(eq(pgStockReceivings.id, r._id))
      .catch((e: any) => console.error("Error deleting receiving in Postgres:", e.message));
  } catch (err: any) {
    console.error("Error syncing receiving deletion to Postgres:", err.message);
  }"""

content = re.sub(target_rcv_del, repl_rcv_del, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
