import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

# 1. Check-In
target1 = r"""  syncSingleDoc\("attendance", newAtt\._id, newAtt\);

  const statusMsg = newAtt\.status === "LATE" """
repl1 = r"""  syncSingleDoc("attendance", newAtt._id, newAtt);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    await sqlDb.insert(pgAttendance).values({
      id: newAtt._id,
      userId: newAtt.salesman_id,
      date: newAtt.date,
      checkInTime: new Date(newAtt.check_in_time),
      checkInLat: newAtt.check_in_lat,
      checkInLng: newAtt.check_in_lng,
      checkInPhoto: newAtt.photo_in,
      checkInDistance: newAtt.distance_in_m,
      status: newAtt.status,
      notes: newAtt.notes || null,
      metadata: { 
        office_id: newAtt.office_id, 
        late_minutes: newAtt.late_minutes, 
        mock_location: newAtt.mock_location 
      }
    });
  } catch (err: any) {
    console.error("Error inserting attendance check-in to Postgres:", err.message);
  }

  const statusMsg = newAtt.status === "LATE" """
content = re.sub(target1, repl1, content)

# 2. Check-Out
target2 = r"""  syncSingleDoc\("attendance", attendance\._id, attendance\);

  return res\.json\(\{"""
repl2 = r"""  syncSingleDoc("attendance", attendance._id, attendance);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgAttendance).set({
      checkOutTime: new Date(attendance.check_out_time),
      checkOutLat: attendance.check_out_lat,
      checkOutLng: attendance.check_out_lng,
      checkOutPhoto: attendance.photo_out,
      metadata: { 
        office_id: attendance.office_id, 
        late_minutes: attendance.late_minutes,
        early_leave_minutes: attendance.early_leave_minutes,
        overtime_minutes: attendance.overtime_minutes,
        mock_location: attendance.mock_location 
      }
    }).where(eq(pgAttendance.id, attendance._id));
  } catch (err: any) {
    console.error("Error updating attendance check-out to Postgres:", err.message);
  }

  return res.json({"""
content = re.sub(target2, repl2, content)

# 3. PUT Attendance
target3 = r"""  syncSingleDoc\("attendance", att\._id, att\);

  return res\.json\(\{"""
repl3 = r"""  syncSingleDoc("attendance", att._id, att);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.update(pgAttendance).set({
      date: att.date,
      checkInTime: att.check_in_time ? new Date(att.check_in_time) : null,
      checkOutTime: att.check_out_time ? new Date(att.check_out_time) : null,
      status: att.status,
      notes: att.notes || null,
      metadata: {
        office_id: att.office_id, 
        late_minutes: att.late_minutes,
        early_leave_minutes: att.early_leave_minutes,
        overtime_minutes: att.overtime_minutes,
        mock_location: att.mock_location 
      }
    }).where(eq(pgAttendance.id, att._id));
  } catch (err: any) {
    console.error("Error manually updating attendance to Postgres:", err.message);
  }

  return res.json({"""
content = re.sub(target3, repl3, content)

# 4. DELETE Attendance
target4 = r"""  const deleted = db\.attendance\.splice\(idx, 1\)\[0\];

  recordAuditLog\("""
repl4 = r"""  const deleted = db.attendance.splice(idx, 1)[0];

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    await sqlDb.delete(pgAttendance).where(eq(pgAttendance.id, req.params.id));
  } catch (err: any) {
    console.error("Error deleting attendance from Postgres:", err.message);
  }

  recordAuditLog("""
content = re.sub(target4, repl4, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
