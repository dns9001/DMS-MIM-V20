import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  syncSingleDoc\("attendance", att._id, att\);
  return res\.json\(\{"""
repl = r"""  syncSingleDoc("attendance", att._id, att);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgAttendance).set({
      checkOutTime: new Date(att.check_out_time!),
      checkOutLat: att.check_out_lat,
      checkOutLng: att.check_out_lng,
      checkOutPhoto: att.photo_out || null,
      checkOutDistance: att.distance_out_m,
      workDurationSeconds: att.work_duration_seconds,
      earlyLeaveMinutes: att.early_leave_minutes,
      overtimeMinutes: att.overtime_minutes
    }).where(eq(pgAttendance.id, att._id));
  } catch (err: any) {
    console.error("Error updating attendance on checkout in Postgres:", err.message);
  }

  return res.json({"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
