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

// Server-side session registry. Access and refresh tokens are opaque random
// credentials and never contain user IDs or other user-controlled identity data.
export const activeSessions = new Map<string, SessionRecord>();
export const activeRefreshSessions = new Map<string, SessionRecord>();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function createOpaqueToken(prefix: string): string {
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
}

export function generateTokens(user: User) {
  const token = createOpaqueToken("mhm_sess_");
  const refreshToken = createOpaqueToken("mhm_ref_");
  const now = Date.now();

  const session: SessionRecord = {
    userId: user._id,
    email: user.email,
    role: user.role,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };

  activeSessions.set(token, session);
  activeRefreshSessions.set(refreshToken, {
    ...session,
    expiresAt: now + REFRESH_TTL_MS,
  });

  return { token, refreshToken };
}

export function rotateRefreshToken(refreshToken: string | undefined) {
  if (!refreshToken) return null;

  const existing = activeRefreshSessions.get(refreshToken);
  if (!existing || Date.now() >= existing.expiresAt) {
    if (existing) activeRefreshSessions.delete(refreshToken);
    return null;
  }

  const user = db.users.find((u) => u._id === existing.userId && u.status === "ACTIVE");
  if (!user) {
    activeRefreshSessions.delete(refreshToken);
    return null;
  }

  // One-time refresh token rotation prevents replay of an already-used token.
  activeRefreshSessions.delete(refreshToken);
  return generateTokens(user);
}

export function setAuthCookies(res: Response, token: string, refreshToken: string) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: REFRESH_TTL_MS,
    path: "/",
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("access_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = req.cookies?.access_token;

  if (!token && authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    return res.status(401).json({ detail: "Sesi tidak ditemukan. Silakan login kembali." });
  }

  const session = activeSessions.get(token);

  // No token parsing fallback is allowed. A server restart invalidates active
  // sessions unless a future persistent session store is explicitly configured.
  if (!session) {
    return res.status(401).json({ detail: "Sesi tidak valid atau telah kedaluwarsa." });
  }

  if (Date.now() >= session.expiresAt) {
    activeSessions.delete(token);
    return res.status(401).json({ detail: "Sesi telah kedaluwarsa. Silakan login kembali." });
  }

  const user = db.users.find((u) => u._id === session.userId && u.status === "ACTIVE");
  if (!user) {
    activeSessions.delete(token);
    return res.status(401).json({ detail: "Pengguna tidak aktif atau tidak ditemukan." });
  }

  session.email = user.email;
  session.role = user.role;
  req.user = user;
  return next();
}

export function revokeSession(token: string | undefined): void {
  if (token) activeSessions.delete(token);
}

export function revokeRefreshSession(token: string | undefined): void {
  if (token) activeRefreshSessions.delete(token);
}

export function revokeAllUserSessions(userId: string): number {
  let revoked = 0;
  for (const [token, session] of activeSessions.entries()) {
    if (session.userId === userId) {
      activeSessions.delete(token);
      revoked++;
    }
  }
  for (const [token, session] of activeRefreshSessions.entries()) {
    if (session.userId === userId) activeRefreshSessions.delete(token);
  }
  return revoked;
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
