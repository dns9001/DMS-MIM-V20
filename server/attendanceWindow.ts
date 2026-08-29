export type AttendanceWindowConfig = {
  checkInStart: string;
  checkInEnd: string;
  checkOutStart: string;
  checkOutEnd: string;
};

function minutes(value: string): number {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) throw new Error("INVALID_ATTENDANCE_TIME");
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function currentMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function withinWindow(now: number, start: string, end: string): boolean {
  const from = minutes(start);
  const to = minutes(end);
  if (from > to) throw new Error("INVALID_ATTENDANCE_WINDOW");
  return now >= from && now <= to;
}

/** Server-side time window validation. Never trust client-provided clock values. */
export function assertAttendanceWindow(
  action: "CHECK_IN" | "CHECK_OUT",
  config: AttendanceWindowConfig,
  now: Date = new Date(),
): void {
  const allowed = action === "CHECK_IN"
    ? withinWindow(currentMinutes(now), config.checkInStart, config.checkInEnd)
    : withinWindow(currentMinutes(now), config.checkOutStart, config.checkOutEnd);

  if (!allowed) {
    throw new Error(action === "CHECK_IN" ? "CHECK_IN_OUTSIDE_ALLOWED_WINDOW" : "CHECK_OUT_OUTSIDE_ALLOWED_WINDOW");
  }
}

export function isAttendanceWindowOpen(
  action: "CHECK_IN" | "CHECK_OUT",
  config: AttendanceWindowConfig,
  now: Date = new Date(),
): boolean {
  try {
    assertAttendanceWindow(action, config, now);
    return true;
  } catch {
    return false;
  }
}
