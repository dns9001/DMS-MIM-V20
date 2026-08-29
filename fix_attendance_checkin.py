import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  syncSingleDoc\("attendance", newAtt._id, newAtt\);"""
repl = r"""  syncSingleDoc("attendance", newAtt._id, newAtt);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    await sqlDb.insert(pgAttendance).values({
      id: newAtt._id,
      userId: targetSalesmanId,
      date: newAtt.date,
      checkInTime: new Date(newAtt.check_in_time),
      checkInLat: newAtt.check_in_lat,
      checkInLng: newAtt.check_in_lng,
      checkInPhoto: newAtt.photo_in || null,
      checkInDistance: newAtt.distance_in_m,
      officeId: newAtt.office_id,
      status: newAtt.status,
      lateMinutes: newAtt.late_minutes
    });
  } catch (err: any) {
    console.error("Error inserting attendance to Postgres:", err.message);
  }"""

content = content.replace(target, repl)

with open("server/routes.ts", "w") as f:
    f.write(content)
