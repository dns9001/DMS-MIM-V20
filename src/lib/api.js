import axios from "axios";

export const API =
  typeof process !== "undefined" && process.env && process.env.REACT_APP_BACKEND_URL
    ? `${process.env.REACT_APP_BACKEND_URL}/api`
    : "/api";

// Authentication is carried by HttpOnly cookies. JavaScript never reads or stores credentials.
const api = axios.create({ baseURL: API, withCredentials: true });

// Clear any legacy browser token left by older releases. The new auth flow never reads it.
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("mhm_token");
    localStorage.removeItem("mhm_refresh_token");
  } catch (err) {
    console.warn("Gagal membersihkan credential legacy:", err);
  }
}

export function errDetail(e) {
  return e?.response?.data?.detail;
}

export function errMsg(e) {
  const d = errDetail(e);
  if (d == null) {
    return e?.message === "Network Error" ? "Tidak ada koneksi internet" : e?.message || "Terjadi kesalahan";
  }
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x && x.msg) || JSON.stringify(x)).join(" ");
  if (d.message) return d.message;
  return String(d);
}

export default api;
