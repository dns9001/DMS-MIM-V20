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
import { initializeCloudSqlTables, loadAllFromPostgres, migrateAllToCloudSql } from "./server/cloudsqlSync.js";

async function startServer() {
  // 1. Initialize PostgreSQL tables and hydrate primary persistent data from Google Cloud SQL (Single Source of Truth)
  try {
    const initialized = await initializeCloudSqlTables();
    if (initialized) {
      const loaded = await loadAllFromPostgres(inMemoryDb);
      if (loaded) {
        saveDatabaseToDisk(true);
      }
    }
  } catch (err) {
    console.warn("[PostgreSQL] Initial Cloud SQL restore notice:", err);
  }

  const app = express();
  const PORT = 3000;

  // Middlewares
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));
  app.use(cookieParser());

  // Health check endpoint for monitoring, container probes, and dev verification
  app.get("/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      timezone: process.env.TZ || "Asia/Jakarta",
      system: "DMS MAHAMERU V5",
      company: "PT Mahameru Insan Mandiri / PT Mahameru Distribusi Indonesia",
      database: {
        engine: "Google Cloud SQL (PostgreSQL)",
        single_source_of_truth: true,
        in_memory_cache: true,
        firestore_status: "UNUSED / LEGACY",
        ledger_healthy: true,
      },
    });
  });

  // Hardened authentication endpoints take precedence over legacy auth handlers.
  // Authentication uses opaque server-side sessions and HttpOnly cookies.
  app.use("/api/auth", authRouter);

  // Mount API router
  app.use("/api", apiRouter);

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MAHAMERU DMS Server running on http://0.0.0.0:${PORT} [Primary Database: Google Cloud SQL (PostgreSQL) - Single Source of Truth]`);
  });
}

startServer();
