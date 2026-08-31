const fs = require('fs');
const content = fs.readFileSync('server/routes.ts', 'utf8');

const target = `  // Re-assign sequence
  optimized.forEach((item, idx) => {
    item.sequence = idx + 1;
  });

  recordAuditLog(`;

const replacement = `  // Re-assign sequence
  optimized.forEach((item, idx) => {
    item.sequence = idx + 1;
  });

  // Persist to Postgres
  try {
    const { sqlDb } = require('../src/db/index.js');
    const { callPlanItems: pgCallPlanItems } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    
    // Fire and forget updates
    void (async () => {
      for (const item of optimized) {
        await sqlDb.update(pgCallPlanItems)
          .set({ sequence: item.sequence })
          .where(eq(pgCallPlanItems.id, item._id))
          .catch((err) => console.error("Error updating sequence", err.message));
      }
    })();
  } catch (err: any) {
    console.error("Error syncing optimized route to Postgres:", err.message);
  }

  recordAuditLog(`;

fs.writeFileSync('server/routes.ts', content.replace(target, replacement));
