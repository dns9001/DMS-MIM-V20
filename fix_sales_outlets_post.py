import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  syncSingleDoc\("sales_outlets", newAssignment\._id, newAssignment\);
  saveDatabaseToDisk\(\);"""
repl = r"""  syncSingleDoc("sales_outlets", newAssignment._id, newAssignment);
  saveDatabaseToDisk();

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { salesOutlets: pgSalesOutlets } = require('../src/db/schema.js');
    await sqlDb.insert(pgSalesOutlets).values({
      id: newAssignment._id,
      salesmanId: newAssignment.sales_id,
      outletId: newAssignment.outlet_id,
      status: "ACTIVE"
    });
  } catch (err: any) {
    console.error("Error inserting sales outlet assignment to Postgres:", err.message);
  }"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
