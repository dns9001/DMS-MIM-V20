import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target1 = r"""    syncSingleDoc\("sales_outlets", assignment\._id, assignment\);

    // Create new assignment
    const newAssignment: SalesOutlet = \{"""
repl1 = r"""    syncSingleDoc("sales_outlets", assignment._id, assignment);

    try {
      const { sqlDb } = require('../src/db/index.js');
      const { salesOutlets: pgSalesOutlets } = require('../src/db/schema.js');
      const { eq } = require('drizzle-orm');
      await sqlDb.update(pgSalesOutlets).set({ status: "INACTIVE" }).where(eq(pgSalesOutlets.id, assignment._id));
    } catch(err: any) {}

    // Create new assignment
    const newAssignment: SalesOutlet = {"""

target2 = r"""    syncSingleDoc\("sales_outlets", newAssignment\._id, newAssignment\);
    saveDatabaseToDisk\(\);"""
repl2 = r"""    syncSingleDoc("sales_outlets", newAssignment._id, newAssignment);
    saveDatabaseToDisk();

    try {
      const { sqlDb } = require('../src/db/index.js');
      const { salesOutlets: pgSalesOutlets } = require('../src/db/schema.js');
      await sqlDb.insert(pgSalesOutlets).values({
        id: newAssignment._id,
        salesmanId: newAssignment.sales_id,
        outletId: newAssignment.outlet_id,
        status: newAssignment.status
      });
    } catch(err: any) {}"""

target3 = r"""  if \(status !== undefined\) assignment\.status = status;

  syncSingleDoc\("sales_outlets", assignment\._id, assignment\);
  saveDatabaseToDisk\(\);

  recordAuditLog\("""
repl3 = r"""  if (status !== undefined) assignment.status = status;

  syncSingleDoc("sales_outlets", assignment._id, assignment);
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

content = re.sub(target1, repl1, content)
content = re.sub(target2, repl2, content)
content = re.sub(target3, repl3, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
