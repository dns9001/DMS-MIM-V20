import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  syncSingleDoc\("audit_logs", log\._id, log\);
  return log;"""
repl = r"""  syncSingleDoc("audit_logs", log._id, log);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { auditLogs: pgAuditLogs } = require('../src/db/schema.js');
    sqlDb.insert(pgAuditLogs).values({
      id: log._id,
      userId: log.user_id,
      action: log.action,
      module: log.entity,
      targetId: log.entity_id,
      details: log.details,
      ipAddress: log.ip_address,
      timestamp: new Date(log.created_at)
    }).catch((err: any) => console.error("Error inserting audit log to Postgres:", err.message));
  } catch (err: any) {}

  return log;"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
