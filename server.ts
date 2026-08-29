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
import { applyDatabaseIntegrity } from "./server/databaseIntegrity.js";

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
      // Apply idempotent FK, uniqueness, index and data-quality constraints
      // before the application starts accepting requests.
      await applyDatabaseIntegrity();
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