import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target_rcv_can = r"""  r.status = "CANCELLED";
  r.updated_at = new Date\(\).toISOString\(\);
  syncSingleDoc\("stock_receivings", r._id, r\);"""

repl_rcv_can = r"""  r.status = "CANCELLED";
  r.updated_at = new Date().toISOString();
  syncSingleDoc("stock_receivings", r._id, r);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { stockReceivings: pgStockReceivings } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    sqlDb.update(pgStockReceivings).set({
      status: r.status,
      updatedAt: new Date(r.updated_at)
    }).where(eq(pgStockReceivings.id, r._id))
      .catch((e: any) => console.error("Error cancelling receiving in Postgres:", e.message));
  } catch (err: any) {
    console.error("Error updating receiving status to Postgres:", err.message);
  }"""

content = re.sub(target_rcv_can, repl_rcv_can, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
