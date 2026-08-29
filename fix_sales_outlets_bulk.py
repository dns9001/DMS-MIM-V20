import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""    db\.sales_outlets\.push\(assignment\);
    syncSingleDoc\("sales_outlets", assignment\._id, assignment\);
    assignedCount\.push\(outletId\);
  \}

  saveDatabaseToDisk\(\);"""
repl = r"""    db.sales_outlets.push(assignment);
    syncSingleDoc("sales_outlets", assignment._id, assignment);
    assignedCount.push(outletId);
    
    try {
      const { sqlDb } = require('../src/db/index.js');
      const { salesOutlets: pgSalesOutlets } = require('../src/db/schema.js');
      const { eq } = require('drizzle-orm');
      if (existingActive) {
        await sqlDb.update(pgSalesOutlets).set({ status: "INACTIVE" }).where(eq(pgSalesOutlets.id, existingActive._id));
      }
      await sqlDb.insert(pgSalesOutlets).values({
        id: assignment._id,
        salesmanId: assignment.sales_id,
        outletId: assignment.outlet_id,
        status: assignment.status
      });
    } catch(err: any) {}
  }

  saveDatabaseToDisk();"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
