const fs = require('fs');
const content = fs.readFileSync('server/routes.ts', 'utf8');

const target1 = `  syncSingleDoc("attendance", newAtt._id, newAtt);`;
const replacement1 = `  syncSingleDoc("attendance", newAtt._id, newAtt);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    await sqlDb.insert(pgAttendance).values({
      id: newAtt._id,
      userId: newAtt.salesman_id,
      date: newAtt.date,
      checkInTime: newAtt.check_in_time ? new Date(newAtt.check_in_time) : null,
      checkInLat: newAtt.check_in_lat || null,
      checkInLng: newAtt.check_in_lng || null,
      checkInPhoto: newAtt.check_in_photo || null,
      checkInDistance: newAtt.distance_m || null,
      status: newAtt.status,
      notes: newAtt.notes || null,
    }).catch((err: any) => console.error("Error inserting check-in to PG:", err.message));
  } catch(e) {}`;

const target2 = `  syncSingleDoc("attendance", att._id, att);

  return res.status(201).json({
    message: "Absensi manual berhasil dicatat.",
    attendance: att,
  });`;

const replacement2 = `  syncSingleDoc("attendance", att._id, att);
  
  try {
    const { sqlDb } = require('../src/db/index.js');
    const { attendance: pgAttendance } = require('../src/db/schema.js');
    const { eq } = require('drizzle-orm');
    const existing = await sqlDb.select().from(pgAttendance).where(eq(pgAttendance.id, att._id)).limit(1);
    if (!existing[0]) {
      await sqlDb.insert(pgAttendance).values({
        id: att._id,
        userId: att.salesman_id,
        date: att.date,
        checkInTime: att.check_in_time ? new Date(att.check_in_time) : null,
        checkOutTime: att.check_out_time ? new Date(att.check_out_time) : null,
        status: att.status,
        notes: att.notes || null,
      }).catch((err: any) => console.error("Error inserting manual attendance to PG:", err.message));
    }
  } catch(e) {}

  return res.status(201).json({
    message: "Absensi manual berhasil dicatat.",
    attendance: att,
  });`;

let newContent = content.replace(target1, replacement1);
newContent = newContent.replace(target2, replacement2);

fs.writeFileSync('server/routes.ts', newContent);
