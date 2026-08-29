import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  syncSingleDoc\("call_plans", plan\._id, plan\);

  res\.json\(\{"""
repl = r"""  syncSingleDoc("call_plans", plan._id, plan);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { callPlans: pgCallPlans, callPlanItems: pgCallPlanItems } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');

    await sqlDb.update(pgCallPlans).set({
      salesmanId: plan.salesman_id,
      planDate: plan.date,
      status: plan.status,
      totalOutlets: plan.total_outlets,
    }).where(eq(pgCallPlans.id, plan._id));

    // Rebuild items
    await sqlDb.delete(pgCallPlanItems).where(eq(pgCallPlanItems.callPlanId, plan._id));
    const pgItems = rawItemList.map((it, idx) => ({
      id: `cpi-${Date.now()}-${idx}-${Math.floor(Math.random()*1000)}`,
      callPlanId: plan._id,
      outletId: it.outlet_id,
      sequence: Number(it.sequence) || (idx + 1),
      status: oldStatusMap.get(it.outlet_id) === "VISITED" ? "VISITED" : "PLANNED"
    }));
    if (pgItems.length > 0) {
        await sqlDb.insert(pgCallPlanItems).values(pgItems);
    }
  } catch (err: any) {
    console.error("Error updating CallPlan to Postgres:", err.message);
  }

  res.json({"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
