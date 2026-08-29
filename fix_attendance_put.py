import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  syncSingleDoc\("attendance", att\._id, att\);
  return res\.json\(\{
    message: "Koreksi absensi berhasil disimpan\.",
    attendance: att,
  \}\);"""
repl = r"""  syncSingleDoc("attendance", att._id, att);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgAttendance).set({
      checkInTime: att.check_in_time ? new Date(att.check_in_time) : null,
      checkOutTime: att.check_out_time ? new Date(att.check_out_time) : null,
      status: att.status,
      lateMinutes: att.late_minutes,
      workDurationSeconds: att.work_duration_seconds,
      earlyLeaveMinutes: att.early_leave_minutes,
      overtimeMinutes: att.overtime_minutes
    }).where(eq(pgAttendance.id, att._id));
  } catch (err: any) {
    console.error("Error updating attendance to Postgres:", err.message);
  }

  return res.json({
    message: "Koreksi absensi berhasil disimpan.",
    attendance: att,
  });"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
