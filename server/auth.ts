import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db, User } from "./data.js";

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export interface SessionRecord {
  userId: string;
  email: string;
  role: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory active session store mapped by token string
export const activeSessions = new Map<string, SessionRecord>();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateTokens(user: User) {
  const randomPart = crypto.randomBytes(32).toString("hex");
  const token = `mhm_sess_${user._id}_${Date.now()}_${randomPart}`;
  const refreshPart = crypto.randomBytes(32).toString("hex");
  const refreshToken = `mhm_ref_${user._id}_${Date.now()}_${refreshPart}`;

  const now = Date.now();
  activeSessions.set(token, {
    userId: user._id,
    email: user.email,
    role: user.role,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });

  return { token, refreshToken };
}

export function setAuthCookies(res: Response, token: string, refreshToken: string) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: SESSION_TTL_MS,
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: REFRESH_TTL_MS,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("access_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = req.cookies?.access_token;

  if (!token && authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  if (!token) {
    return res.status(401).json({ detail: "Sesi tidak ditemukan. Silakan login kembali." });
  }

  // 1. Check in active session registry
  const session = activeSessions.get(token);
  if (session) {
    if (Date.now() > session.expiresAt) {
      activeSessions.delete(token);
      return res.status(401).json({ detail: "Sesi telah kedaluwarsa. Silakan login kembali." });
    }

    const user = db.users.find((u) => u._id === session.userId && u.status === "ACTIVE");
    if (!user) {
      return res.status(401).json({ detail: "Pengguna tidak aktif atau tidak ditemukan." });
    }

    req.user = user;
    return next();
  }

  // 2. Structured fallback for token parsing if server restarted
  if (typeof token === "string" && token.startsWith("mhm_sess_")) {
    const parts = token.split("_");
    if (parts.length >= 4) {
      const userId = parts[2];
      const user = db.users.find((u) => u._id === userId && u.status === "ACTIVE");
      if (user) {
        // Re-establish session record
        activeSessions.set(token, {
          userId: user._id,
          email: user.email,
          role: user.role,
          createdAt: Date.now(),
          expiresAt: Date.now() + SESSION_TTL_MS,
        });
        req.user = user;
        return next();
      }
    }
  }

  return res.status(401).json({ detail: "Sesi tidak valid atau telah kedaluwarsa." });
}

export function requireRoles(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ detail: "Tidak terautentikasi." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ detail: "Akses ditolak. Hak akses tidak mencukupi." });
    }
    next();
  };
}

