/**
 * Formatting and utility helpers for DMS Mahameru (Distribution Management System)
 * Configured strictly for GMT+7 (Asia/Jakarta / WIB)
 */

export const APP_TIMEZONE = "Asia/Jakarta";

export function formatNumber(num) {
  if (num === undefined || num === null || isNaN(num)) return "0";
  return Number(num).toLocaleString("id-ID");
}

export function rupiah(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return "Rp 0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function todayLocal() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export function currentMonthLocal() {
  return todayLocal().slice(0, 7);
}

export function fmtDayDateWIB(d = new Date()) {
  if (!d) return "-";
  try {
    const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("id-ID", {
      timeZone: APP_TIMEZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

export function fmtDate(d) {
  if (!d) return "-";
  try {
    const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("id-ID", {
      timeZone: APP_TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

export function fmtDateShort(d) {
  if (!d) return "-";
  try {
    const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("id-ID", {
      timeZone: APP_TIMEZONE,
      day: "numeric",
      month: "short",
    });
  } catch {
    return String(d);
  }
}

export function fmtTime(d) {
  if (!d) return "-";
  try {
    const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleTimeString("id-ID", {
      timeZone: APP_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " WIB";
  } catch {
    return String(d);
  }
}

export function fmtTimeHHMM(d) {
  if (!d) return "-";
  try {
    const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleTimeString("id-ID", {
      timeZone: APP_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return String(d);
  }
}

export function fmtDateTime(d) {
  if (!d) return "-";
  try {
    const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (isNaN(date.getTime())) return String(d);
    const datePart = date.toLocaleDateString("id-ID", {
      timeZone: APP_TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const timePart = date.toLocaleTimeString("id-ID", {
      timeZone: APP_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${datePart}, ${timePart} WIB`;
  } catch {
    return String(d);
  }
}

/**
 * Formats duration in seconds or minutes to friendly Indonesian string
 * @param {number} seconds 
 * @returns {string} e.g. "8 jam 45 menit", "12 menit 30 detik", "45 detik"
 */
export function formatDuration(seconds) {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) {
    return "-";
  }
  const sec = Math.round(seconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainingSecs = sec % 60;

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours} jam ${minutes} menit`;
    }
    return `${hours} jam`;
  }
  if (minutes > 0) {
    if (remainingSecs > 0) {
      return `${minutes} menit ${remainingSecs} dtk`;
    }
    return `${minutes} menit`;
  }
  return `${remainingSecs} detik`;
}

/**
 * Relative time in Indonesian (e.g. "Baru saja", "5 menit lalu", "2 jam lalu")
 */
export function formatRelativeTime(d) {
  if (!d) return "-";
  try {
    const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
    if (isNaN(date.getTime())) return String(d);
    
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 45) return "Baru saja";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
    if (diffSec < 172800) return `Kemarin, ${fmtTime(date)}`;
    return fmtDate(date);
  } catch {
    return String(d);
  }
}

export function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
