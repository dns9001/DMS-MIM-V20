import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""    syncSingleDoc\("sales_outlets", prev\._id, prev\);
  \}

  // 2\. Create new active assignment
  const newAssignment: SalesOutlet = \{"""
repl = r"""    syncSingleDoc("sales_outlets", prev._id, prev);

    try {
      const { sqlDb } = require('../src/db/index.js');
      const { salesOutlets: pgSalesOutlets } = require('../src/db/schema.js');
      const { eq } = require('drizzle-orm');
      await sqlDb.update(pgSalesOutlets).set({ status: "INACTIVE" }).where(eq(pgSalesOutlets.id, prev._id));
    } catch(err: any) {}
  }

  // 2. Create new active assignment
  const newAssignment: SalesOutlet = {"""

target2 = r"""  db\.sales_outlets\.push\(newAssignment\);
  syncSingleDoc\("sales_outlets", newAssignment\._id, newAssignment\);
  saveDatabaseToDisk\(\);"""
repl2 = r"""  db.sales_outlets.push(newAssignment);
  syncSingleDoc("sales_outlets", newAssignment._id, newAssignment);
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
  } catch(err: any) {}"""

content = re.sub(target, repl, content)
content = re.sub(target2, repl2, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
