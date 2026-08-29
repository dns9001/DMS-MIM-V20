import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  assignment\.status = "INACTIVE";
  assignment\.unassigned_at = new Date\(\)\.toISOString\(\);
  assignment\.unassigned_by = req\.user!\._id;
  assignment\.notes = \(assignment\.notes \? assignment\.notes \+ " \| " : ""\) \+ "Dihapus/dinonaktifkan oleh Supervisor/Admin";

  syncSingleDoc\("sales_outlets", assignment\._id, assignment\);
  saveDatabaseToDisk\(\);"""
repl = r"""  assignment.status = "INACTIVE";
  assignment.unassigned_at = new Date().toISOString();
  assignment.unassigned_by = req.user!._id;
  assignment.notes = (assignment.notes ? assignment.notes + " | " : "") + "Dihapus/dinonaktifkan oleh Supervisor/Admin";

  syncSingleDoc("sales_outlets", assignment._id, assignment);
  saveDatabaseToDisk();

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { salesOutlets: pgSalesOutlets } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgSalesOutlets).set({
      status: "INACTIVE"
    }).where(eq(pgSalesOutlets.id, assignment._id));
  } catch (err: any) {
    console.error("Error updating sales outlet assignment to Postgres:", err.message);
  }"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
