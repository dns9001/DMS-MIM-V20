import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  deleteSingleDoc\("attendance", req\.params\.id\);
  return res\.json\(\{"""
repl = r"""  deleteSingleDoc("attendance", req.params.id);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.delete(pgAttendance).where(eq(pgAttendance.id, req.params.id));
  } catch (err: any) {
    console.error("Error deleting attendance from Postgres:", err.message);
  }

  return res.json({"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
