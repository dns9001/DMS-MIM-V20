import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """  syncSingleDoc("visits", visit._id, visit);"""
repl = """  syncSingleDoc("visits", visit._id, visit);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { visits: pgVisits } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');

    const [existingPgVisit] = await sqlDb.select().from(pgVisits).where(eq(pgVisits.id, visit._id)).limit(1);

    if (existingPgVisit) {
      await sqlDb.update(pgVisits).set({
        checkOutTime: new Date(visit.check_out_time),
        visitDurationSeconds: visit.duration_seconds,
        status: visit.status,
        isEffectiveCall: visit.call_result === "EFFECTIVE",
        nonProductiveReasonId: visit.open_reason_id || null,
        notes: visit.notes || null,
      }).where(eq(pgVisits.id, visit._id));
    }
  } catch (err: any) {
    console.error("Error updating visit in Postgres on check-out:", err.message);
  }"""
content = content.replace(target, repl)

target_in = """  syncSingleDoc("visits", newVisit._id, newVisit);"""
repl_in = """  syncSingleDoc("visits", newVisit._id, newVisit);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { visits: pgVisits } = require('../src/db/schema.js');

    await sqlDb.insert(pgVisits).values({
      id: newVisit._id,
      salesmanId: newVisit.salesman_id,
      outletId: newVisit.outlet_id,
      checkInTime: new Date(newVisit.check_in_time),
      checkInLat: newVisit.check_in_lat,
      checkInLng: newVisit.check_in_lng,
      status: newVisit.status,
    });
  } catch (err: any) {
    console.error("Error inserting visit to Postgres on check-in:", err.message);
  }"""
content = content.replace(target_in, repl_in)

with open("server/routes.ts", "w") as f:
    f.write(content)
