import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

# Replace call plan creation/update to insert to postgres
target_regex = r'  rawItemList\.forEach\(\(it, idx\) => \{.*?  \}\);\n'
match = re.search(target_regex, content, re.DOTALL)

if match:
    repl = """  rawItemList.forEach((it, idx) => {
    const newItem = {
      _id: `cpi-${Date.now()}-${idx}`,
      call_plan_id: planId,
      outlet_id: it.outlet_id,
      sequence: Number(it.sequence) || (idx + 1),
      priority: it.priority || "NORMAL",
      status: "PENDING",
      notes: it.notes || "",
      created_at: new Date().toISOString(),
    };
    db.call_plan_items.push(newItem as any);
  });

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { callPlans: pgCallPlans, callPlanItems: pgCallPlanItems } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');

    // Upsert Call Plan
    const [existingPgPlan] = await sqlDb.select().from(pgCallPlans).where(eq(pgCallPlans.id, planId)).limit(1);
    if (existingPgPlan) {
        await sqlDb.update(pgCallPlans).set({
            status: existingPlan.status,
            totalOutlets: existingPlan.total_outlets,
        }).where(eq(pgCallPlans.id, planId));
    } else {
        await sqlDb.insert(pgCallPlans).values({
            id: existingPlan._id,
            salesmanId: existingPlan.salesman_id,
            planDate: existingPlan.date,
            status: existingPlan.status,
            totalOutlets: existingPlan.total_outlets,
            createdAt: new Date(existingPlan.created_at)
        });
    }

    // Clean old items and insert new ones
    await sqlDb.delete(pgCallPlanItems).where(eq(pgCallPlanItems.callPlanId, planId));

    const pgItems = rawItemList.map((it, idx) => ({
      id: `cpi-${Date.now()}-${idx}-${Math.floor(Math.random()*1000)}`,
      callPlanId: planId,
      outletId: it.outlet_id,
      sequence: Number(it.sequence) || (idx + 1),
      status: "PLANNED"
    }));

    if (pgItems.length > 0) {
        await sqlDb.insert(pgCallPlanItems).values(pgItems);
    }
  } catch (err: any) {
    console.error("Error syncing CallPlan to Postgres:", err.message);
  }
"""
    content = content.replace(match.group(0), repl)

# Fix missing async in apiRouter.post("/call-plans")
target_async = """apiRouter.post("/call-plans", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER", "SALES"), (req: AuthenticatedRequest, res) => {"""
repl_async = """apiRouter.post("/call-plans", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER", "SALES"), async (req: AuthenticatedRequest, res) => {"""
content = content.replace(target_async, repl_async)

with open("server/routes.ts", "w") as f:
    f.write(content)
