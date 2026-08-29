// Enforce GMT+7 (Asia/Jakarta / WIB) timezone globally
process.env.TZ = "Asia/Jakarta";

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { apiRouter } from "./server/routes.js";
import authRouter from "./server/auth.routes.js";
import transactionRouter from "./server/transaction.routes.js";
import { db as inMemoryDb, saveDatabaseToDisk } from "./server/data.js";
import { initializeCloudSqlTables, loadAllFromPostgres } from "./server/cloudsqlSync.js";
import { applyDatabaseIntegrity } from "./server/databaseIntegrity.js";
import { ensurePhase4Integrity } from "./server/phase4Integrity.js";
import { ensureTransactionItemsTable } from "./server/transaction-items.migration.js";

async function startServer() {
  const production = process.env.NODE_ENV === "production";
  const postgresRequired = production || process.env.DMS_REQUIRE_POSTGRES === "true";

  try {
    const initialized = await initializeCloudSqlTables();
    if (!initialized) {
      if (postgresRequired) throw new Error("PostgreSQL wajib tersedia untuk menjalankan DMS dalam mode produksi.");
      console.warn("[PostgreSQL] Development mode: running without persistent PostgreSQL.");
    } else {
      await applyDatabaseIntegrity();
      await ensurePhase4Integrity();
      await ensureTransactionItemsTable();
      const loaded = await loadAllFromPostgres(inMemoryDb);
      if (!loaded && postgresRequired) throw new Error("PostgreSQL tersedia tetapi data operasional gagal dimuat.");
      if (loaded) saveDatabaseToDisk(true);
    }
  } catch (err) {
    console.error("[PostgreSQL] Startup failure:", err);
    if (postgresRequired) process.exit(1);
  }

  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const configuredOrigins = (process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (configuredOrigins.includes(origin)) return callback(null, true);
      if (!production && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(cookieParser());

  app.use("/api/auth", authRouter);
  app.use("/api/transactions", transactionRouter);
  app.use("/api", apiRouter);

  if (production) {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => console.log(`[DMS] Server running on port ${PORT}`));
}

startServer().catch((err) => {
  console.error("[DMS] Fatal startup error:", err);
  process.exit(1);
});
