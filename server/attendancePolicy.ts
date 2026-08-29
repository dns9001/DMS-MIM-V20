export type AttendanceAction = "CHECK_IN" | "CHECK_OUT";

export type AttendancePolicyConfig = {
  checkInStart: string;
  checkInEnd: string;
  checkOutStart: string;
  checkOutEnd: string;
  officeLatitude?: number;
  officeLongitude?: number;
  allowedRadiusMeters?: number;
};

function parseTime(value: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("INVALID_ATTENDANCE_TIME");
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function inWindow(now: Date, start: string, end: string): boolean {
  const current = now.getHours() * 60 + now.getMinutes();
  const from = parseTime(start), to = parseTime(end);
  if (from > to) throw new Error("INVALID_ATTENDANCE_WINDOW");
  return current >= from && current <= to;
}

export function validateAttendanceAction(
  action: AttendanceAction,
  config: AttendancePolicyConfig,
  now: Date = new Date(),
): { allowed: true } {
  const validWindow = action === "CHECK_IN"
    ? inWindow(now, config.checkInStart, config.checkInEnd)
    : inWindow(now, config.checkOutStart, config.checkOutEnd);

  if (!validWindow) {
    throw new Error(action === "CHECK_IN" ? "CHECK_IN_OUTSIDE_ALLOWED_WINDOW" : "CHECK_OUT_OUTSIDE_ALLOWED_WINDOW");
  }

  return { allowed: true };
}

export function validateAttendanceSequence(action: AttendanceAction, state: {
  hasCheckedIn: boolean;
  hasCheckedOut: boolean;
}): void {
  if (action === "CHECK_IN" && state.hasCheckedIn) throw new Error("ALREADY_CHECKED_IN");
  if (action === "CHECK_OUT" && !state.hasCheckedIn) throw new Error("CHECK_OUT_REQUIRES_CHECK_IN");
  if (action === "CHECK_OUT" && state.hasCheckedOut) throw new Error("ALREADY_CHECKED_OUT");
}
