// Enforce GMT+7 (Asia/Jakarta / WIB) timezone globally
process.env.TZ = "Asia/Jakarta";

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { apiRouter } from "./server/routes.js";
import authRouter from "./server/auth.routes.js";
import { db as inMemoryDb, saveDatabaseToDisk } from "./server/data.js";
import { initializeCloudSqlTables, loadAllFromPostgres } from "./server/cloudsqlSync.js";

async function startServer() {
  const production = process.env.NODE_ENV === "production";
  const postgresRequired = production || process.env.DMS_REQUIRE_POSTGRES === "true";

  // PostgreSQL is authoritative. In production, never silently start in a
  // memory-only mode because that can acknowledge writes that are not durable.
  try {
    const initialized = await initializeCloudSqlTables();
    if (!initialized) {
      if (postgresRequired) {
        throw new Error("PostgreSQL wajib tersedia untuk menjalankan DMS dalam mode produksi.");
      }
      console.warn("[PostgreSQL] Development mode: running without persistent PostgreSQL.");
    } else {
      const loaded = await loadAllFromPostgres(inMemoryDb);
      if (!loaded && postgresRequired) {
        throw new Error("PostgreSQL tersedia tetapi data operasional gagal dimuat.");
      }
      if (loaded) saveDatabaseToDisk(true);
    }
  } catch (err) {
    console.error("[PostgreSQL] Startup failure:", err);
    if (postgresRequired) process.exit(1);
  }

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  const configuredOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set(configuredOrigins);

  app.use(
    cors({
      credentials: true,
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        if (!production && /^https?:\/\/localhost(?::\d+)?$/.test(origin)) return callback(null, true);
        return callback(new Error("Origin tidak diizinkan oleh kebijakan CORS."));
      },
    })
  );
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));
  app.use(cookieParser());

  app.get("/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      timezone: process.env.TZ || "Asia/Jakarta",
      system: "DMS MAHAMERU",
      company: "PT Mahameru Insan Mandiri / PT Mahameru Distribusi Indonesia",
      database: {
        engine: "Google Cloud SQL (PostgreSQL)",
        single_source_of_truth: true,
        persistence_required: postgresRequired,
        in_memory_cache: true,
        firestore_status: "SECONDARY / LEGACY",
      },
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", apiRouter);

  if (!production) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MAHAMERU DMS Server running on port ${PORT} [PostgreSQL authoritative]`);
  });
}

startServer();
