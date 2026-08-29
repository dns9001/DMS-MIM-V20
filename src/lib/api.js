import axios from "axios";

export const API =
  typeof process !== "undefined" && process.env && process.env.REACT_APP_BACKEND_URL
    ? `${process.env.REACT_APP_BACKEND_URL}/api`
    : "/api";

const api = axios.create({ baseURL: API, withCredentials: true });

// Attach JWT bearer token automatically
api.interceptors.request.use((config) => {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("mhm_token") : null;
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn("Gagal menyematkan token:", err);
  }
  return config;
});

// Clear stale token on auth failure to avoid stuck sessions
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("mhm_token");
    }
    return Promise.reject(err);
  }
);

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
