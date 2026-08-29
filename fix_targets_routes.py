import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

# 1. POST /targets
target1 = r"""  db\.targets\.push\(newTarget\);
  syncSingleDoc\("targets", newTarget\._id, newTarget\);

  recordAuditLog\("""
repl1 = r"""  db.targets.push(newTarget);
  syncSingleDoc("targets", newTarget._id, newTarget);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { targets: pgTargets } = require('../src/db/schema.js');
    await sqlDb.insert(pgTargets).values({
      id: newTarget._id,
      salesmanId: newTarget.salesman_id || "ALL",
      periodMonth: newTarget.period || "0000-00",
      targetRevenue: newTarget.target_volume || 0,
      metadata: {
        target_code: newTarget.target_code,
        area_id: newTarget.area_id,
        product_id: newTarget.product_id,
        sku_id: newTarget.sku_id,
        unit: newTarget.unit,
        from_date: newTarget.from_date,
        to_date: newTarget.to_date,
        status: newTarget.status,
        notes: newTarget.notes
      }
    });
  } catch (err: any) {
    console.error("Error inserting target to Postgres:", err.message);
  }

  recordAuditLog("""
content = re.sub(target1, repl1, content)

# 2. PUT /targets/:id
target2 = r"""  syncSingleDoc\("targets", target\._id, target\);

  recordAuditLog\("""
repl2 = r"""  syncSingleDoc("targets", target._id, target);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { targets: pgTargets } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgTargets).set({
      salesmanId: target.salesman_id || "ALL",
      periodMonth: target.period || "0000-00",
      targetRevenue: target.target_volume || 0,
      metadata: {
        target_code: target.target_code,
        area_id: target.area_id,
        product_id: target.product_id,
        sku_id: target.sku_id,
        unit: target.unit,
        from_date: target.from_date,
        to_date: target.to_date,
        status: target.status,
        notes: target.notes
      }
    }).where(eq(pgTargets.id, target._id));
  } catch (err: any) {
    console.error("Error updating target to Postgres:", err.message);
  }

  recordAuditLog("""
content = re.sub(target2, repl2, content)

# 3. DELETE /targets/:id
target3 = r"""  const deleted = db\.targets\.splice\(idx, 1\)\[0\];

  recordAuditLog\("""
repl3 = r"""  const deleted = db.targets.splice(idx, 1)[0];

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { targets: pgTargets } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.delete(pgTargets).where(eq(pgTargets.id, req.params.id));
  } catch (err: any) {
    console.error("Error deleting target from Postgres:", err.message);
  }

  recordAuditLog("""
content = re.sub(target3, repl3, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
