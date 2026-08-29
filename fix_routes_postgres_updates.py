import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

# 1. Handovers Confirm
target_ho = r'  h\.updated_at = nowStr;\n  syncSingleDoc\("stock_handovers", h\._id, h\);(?!.*?sqlDb\.update)'
repl_ho = r"""  h.updated_at = nowStr;
  syncSingleDoc("stock_handovers", h._id, h);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { stockHandovers: pgStockHandovers } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgStockHandovers).set({
      status: h.status,
      approvedBy: h.confirmed_by,
      updatedAt: new Date(h.updated_at)
    }).where(eq(pgStockHandovers.id, h._id));
  } catch (err: any) {
    console.error("Error updating handover status to Postgres:", err.message);
  }"""
content = re.sub(target_ho, repl_ho, content)

# 2. Returns Confirm
target_ret = r'  r\.updated_at = nowStr;\n  syncSingleDoc\("stock_returns", r\._id, r\);(?!.*?sqlDb\.update)'
repl_ret = r"""  r.updated_at = nowStr;
  syncSingleDoc("stock_returns", r._id, r);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { stockReturns: pgStockReturns } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgStockReturns).set({
      status: r.status,
      approvedBy: r.confirmed_by,
      updatedAt: new Date(r.updated_at)
    }).where(eq(pgStockReturns.id, r._id));
  } catch (err: any) {
    console.error("Error updating return status to Postgres:", err.message);
  }"""
content = re.sub(target_ret, repl_ret, content)

# 3. Receivings
target_rcv = r'  r\.updated_at = nowStr;\n  syncSingleDoc\("stock_receivings", r\._id, r\);(?!.*?sqlDb\.update)'
repl_rcv = r"""  r.updated_at = nowStr;
  syncSingleDoc("stock_receivings", r._id, r);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { stockReceivings: pgStockReceivings } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgStockReceivings).set({
      status: r.status,
      postedBy: r.posted_by,
      postedAt: r.posted_at ? new Date(r.posted_at) : null,
      updatedAt: new Date(r.updated_at)
    }).where(eq(pgStockReceivings.id, r._id));
  } catch (err: any) {
    console.error("Error updating receiving status to Postgres:", err.message);
  }"""
content = re.sub(target_rcv, repl_rcv, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
