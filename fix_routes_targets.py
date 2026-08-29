import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """apiRouter.post("/targets", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), (req: AuthenticatedRequest, res) => {"""
repl = """apiRouter.post("/targets", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), async (req: AuthenticatedRequest, res) => {"""
content = content.replace(target, repl)

target_save = """  db.targets.push(newTarget as any);
  syncSingleDoc("targets", newTarget._id, newTarget);

  recordAuditLog("""
repl_save = """  db.targets.push(newTarget as any);
  syncSingleDoc("targets", newTarget._id, newTarget);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { targets: pgTargets } = require('../src/db/schema.js');
    
    // Note: the original schema structure for target is slightly different from the payload
    // Here we're saving the basics if applicable
    await sqlDb.insert(pgTargets).values({
      id: newTarget._id,
      salesmanId: newTarget.salesman_id || "ALL",
      periodMonth: newTarget.period,
      targetRevenue: 0, // In payload it's usually volume based. Assuming volume mapping elsewhere or ignoring for now
      targetCalls: 0,
      targetEffectiveCalls: 0,
      targetNewOutlets: 0,
      metadata: { ...newTarget }
    });
  } catch (err: any) {
    console.error("Error inserting target to Postgres:", err.message);
  }

  recordAuditLog("""
content = content.replace(target_save, repl_save)

with open("server/routes.ts", "w") as f:
    f.write(content)
