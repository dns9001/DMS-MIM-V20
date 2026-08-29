import { and, eq, isNull } from "drizzle-orm";
import { sqlDb } from "../src/db/index.js";
import { attendance } from "../src/db/schema.js";
import { validateAttendanceSequence } from "./attendancePolicy.js";

export async function getTodayAttendance(userId: string, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const rows = await sqlDb.select().from(attendance).where(and(eq(attendance.userId, userId), eq(attendance.date, day))).limit(1);
  return rows[0] ?? null;
}

export async function assertAttendanceSequence(userId: string, action: "CHECK_IN" | "CHECK_OUT", date = new Date()) {
  const current = await getTodayAttendance(userId, date);
  validateAttendanceSequence(action, {
    hasCheckedIn: !!current?.checkInTime,
    hasCheckedOut: !!current?.checkOutTime,
  });
  return current;
}

/**
 * DB-level guard helpers. The final INSERT/UPDATE should execute in the caller's transaction.
 * These predicates intentionally reject an existing check-in/check-out rather than overwriting it.
 */
export const attendanceGuards = {
  checkIn: (userId: string, date: string) => and(eq(attendance.userId, userId), eq(attendance.date, date), isNull(attendance.checkInTime)),
  checkOut: (userId: string, date: string) => and(eq(attendance.userId, userId), eq(attendance.date, date), isNull(attendance.checkOutTime)),
};
