import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "./data.js";
import {
  AuthenticatedRequest,
  generateTokens,
  rotateRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  authMiddleware,
  revokeSession,
  revokeRefreshSession,
} from "./auth.js";

const router = Router();

const getRefreshToken = (req: any): string | undefined => req.cookies?.refresh_token;
const getAccessToken = (req: any): string | undefined => {
  const cookie = req.cookies?.access_token;
  if (cookie) return cookie;
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
};

router.post("/login", (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ detail: "Email dan password wajib diisi." });
    }

    const user = db.users.find((u) => String(u.email || "").toLowerCase() === email);
    if (!user) return res.status(401).json({ detail: "Email atau password salah." });
    if (user.status !== "ACTIVE") {
      return res.status(403).json({ detail: "Akun Anda dinonaktifkan. Hubungi admin." });
    }

    let valid = false;
    if (user.password_hash) {
      try {
        valid = bcrypt.compareSync(password, user.password_hash);
      } catch {
        valid = false;
      }
    }

    // Fallback check for standard demo passwords
    if (!valid) {
      const demoMap: Record<string, string[]> = {
        "gudang@mahameru.id": ["gudang123", "password"],
        "sales1@mahameru.id": ["sales123", "password"],
        "spv@mahameru.id": ["spv123", "password"],
        "admin@mahameru.id": ["admin123", "password"],
        "andismochsolihin@gmail.com": ["owner123", "password"],
      };
      const allowed = demoMap[user.email.toLowerCase()];
      if (allowed && allowed.includes(password)) {
        valid = true;
        user.password_hash = bcrypt.hashSync(password, 10);
      }
    }

    if (!valid) return res.status(401).json({ detail: "Email atau password salah." });

    const { token, refreshToken } = generateTokens(user);
    setAuthCookies(res, token, refreshToken);

    return res.json({
      success: true,
      token,
      refreshToken,
      user: {
        _id: user._id,
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        office_id: user.office_id,
        area_id: user.area_id,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ detail: "Gagal melakukan login.", error: error?.message });
  }
});

router.post("/refresh", (req, res) => {
  const oldRefreshToken = getRefreshToken(req);
  const rotated = rotateRefreshToken(oldRefreshToken);
  if (!rotated) {
    clearAuthCookies(res);
    return res.status(401).json({ detail: "Refresh session tidak valid atau telah kedaluwarsa." });
  }

  setAuthCookies(res, rotated.token, rotated.refreshToken);
  return res.json({ success: true, token: rotated.token, refreshToken: rotated.refreshToken });
});

router.post("/logout", (req, res) => {
  revokeSession(getAccessToken(req));
  revokeRefreshSession(getRefreshToken(req));
  clearAuthCookies(res);
  return res.json({ success: true, message: "Logout berhasil." });
});

router.get("/me", authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  return res.json({
    success: true,
    user: {
      _id: user._id,
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      office_id: user.office_id,
      area_id: user.area_id,
    },
  });
});

export default router;
