import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  syncSingleDoc\("sales_outlets", assignment\._id, assignment\);
  saveDatabaseToDisk\(\);

  recordAuditLog\("""
repl = r"""  syncSingleDoc("sales_outlets", assignment._id, assignment);
  saveDatabaseToDisk();

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { salesOutlets: pgSalesOutlets } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgSalesOutlets).set({
      status: assignment.status
    }).where(eq(pgSalesOutlets.id, assignment._id));
  } catch(err: any) {}

  recordAuditLog("""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
