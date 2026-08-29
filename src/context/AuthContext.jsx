import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/api";

const AuthCtx = createContext(null);

function normalizeUser(payload) {
  return payload?.user || payload || null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let response;
        try {
          response = await api.get("/auth/me");
        } catch (firstError) {
          if (firstError?.response?.status !== 401) throw firstError;
          await api.post("/auth/refresh");
          response = await api.get("/auth/me");
        }
        if (active) setUser(normalizeUser(response.data));
      } catch (e) {
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
    const nextUser = normalizeUser(data);
    setUser(nextUser);
    return nextUser;
  };

  const logout = async () => {
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
      const nextUser = normalizeUser(data);
      setUser(nextUser);
      return nextUser;
    } catch (e) {
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
