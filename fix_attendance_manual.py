import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  \}

  syncSingleDoc\("attendance", att\._id, att\);"""
repl = r"""  }

  syncSingleDoc("attendance", att._id, att);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.insert(pgAttendance).values({
      id: att._id,
      userId: att.salesman_id,
      date: att.date,
      checkInTime: new Date(att.check_in_time),
      checkOutTime: att.check_out_time ? new Date(att.check_out_time) : null,
      officeId: att.office_id,
      status: att.status,
      lateMinutes: att.late_minutes,
      workDurationSeconds: att.work_duration_seconds,
      earlyLeaveMinutes: att.early_leave_minutes,
      overtimeMinutes: att.overtime_minutes
    }).onConflictDoUpdate({
      target: pgAttendance.id,
      set: {
        checkInTime: new Date(att.check_in_time),
        checkOutTime: att.check_out_time ? new Date(att.check_out_time) : null,
        officeId: att.office_id,
        status: att.status,
        lateMinutes: att.late_minutes,
        workDurationSeconds: att.work_duration_seconds,
        earlyLeaveMinutes: att.early_leave_minutes,
        overtimeMinutes: att.overtime_minutes
      }
    });
  } catch (err: any) {
    console.error("Error inserting/updating manual attendance to Postgres:", err.message);
  }"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
