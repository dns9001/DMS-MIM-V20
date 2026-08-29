import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("mhm_token") : null;
      if (!token) {
        if (active) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      try {
        const { data } = await api.get("/auth/me");
        if (active) setUser(data);
      } catch (e) {
        if (typeof window !== "undefined") localStorage.removeItem("mhm_token");
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.token && typeof window !== "undefined") {
      localStorage.setItem("mhm_token", data.token);
    }
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    if (typeof window !== "undefined") localStorage.removeItem("mhm_token");
    try {
      await api.post("/auth/logout");
    } catch (e) {
      console.warn("Permintaan logout backend gagal:", e);
    }
    setUser(null);
  };

  const forgotPassword = async (email) => {
    const res = await api.post("/auth/forgot-password", { email });
    return res.data;
  };

  const refreshUser = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch (e) {
      console.warn("Gagal memperbarui data user:", e);
      return null;
    }
  };

  const changePassword = async (newPassword, oldPassword) => {
    await api.post("/auth/change-password", { old_password: oldPassword, new_password: newPassword });
    await refreshUser();
  };

  const value = useMemo(
    () => ({ user, loading, login, logout, forgotPassword, changePassword, refreshUser }),
    [user, loading]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function homeFor(user) {
  switch (user?.role) {
    case "OWNER":
      return "/owner";
    case "ADMIN":
      return "/admin/masters";
    case "SUPERVISOR":
      return "/monitoring";
    case "WAREHOUSE":
      return "/warehouse";
    default:
      return "/home";
  }
}
