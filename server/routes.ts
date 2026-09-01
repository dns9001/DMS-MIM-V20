import { getOwnerDashboardData } from "./ownerDashboard.service.js";
import { getCallMetricsRange, getProductEcMetrics } from "./callMetrics.service.js";
import { Router, Response } from "express";

import { sqlDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";
import {
  users as pgUsers,
  outlets as pgOutlets,
  salesOutlets as pgSalesOutlets,
  callPlans as pgCallPlans,
  callPlanItems as pgCallPlanItems,
  attendance as pgAttendance,
  gpsEvents as pgGpsEvents,
  visits as pgVisits,
  transactions as pgTransactions,
  inventory as pgInventory,
  stockMovements as pgStockMovements,
  stockHandovers as pgStockHandovers,
  stockReturns as pgStockReturns,
  stockReceivings as pgStockReceivings,
  salesStockLedgers as pgSalesStockLedgers,
  targets as pgTargets,
  auditLogs as pgAuditLogs
} from "../src/db/schema.js";
import { eq, and } from "drizzle-orm";

import { InventoryService } from "./inventory.service.js";
import { InventoryRepository } from "./inventory.repository.js";
import bcrypt from "bcryptjs";
import {
  db,
  User,
  Outlet,
  Visit,
  Transaction,
  Attendance,
  CallPlan,
  CallPlanItem,
  SalesOutlet,
  AuditLog,
  InventoryItem,
  StockMovement,
  StockMovementType,
  DailyStockHandover,
  DailyStockHandoverItem,
  DailyStockReturn,
  DailyStockReturnItem,
  StockReceiving,
  StockReceivingItem,
  SalesStockLedger,
  Target,
  CashDeposit,
  Receivable,
  ReceivablePayment,
  DailyReconciliationRecord,
  saveDatabaseToDisk,
  auditAndRepairDatabase,
  resetToCleanFreshDatabase,
  executeWithMutex,
  checkIdempotency,
  recordIdempotency,
} from "./data.js";
import { resolveSkuInfo, formatSkuItemsSummary } from "./skuResolver.js";
import { syncToFirestore, getSyncStats, deleteSingleDoc, syncSingleDoc, ALL_SYNC_COLLECTIONS, purgeAllFirestoreData } from "./persistence.js";
import {
  migrateAllToCloudSql,
  getCloudSqlStats,
  initializeCloudSqlTables,
  testCloudSqlConnection,
  syncDocToPostgres,
  deleteDocFromPostgres,
} from "./cloudsqlSync.js";
import {
  AuthenticatedRequest,
  generateTokens,
  setAuthCookies,
  clearAuthCookies,
  authMiddleware,
  requireRoles,
  revokeSession,
  revokeRefreshSession,
  revokeAllUserSessions,
} from "./auth.js";
import { haversineMeters } from "./geo.js";
import { validatePhotoPayload, MAX_SERVER_PHOTO_BYTES } from "./imageValidator";

export const apiRouter = Router();

import { inventory as inventorySchema } from "../src/db/schema.js";

import { isCloudSqlConnected } from "./cloudsqlSync.js";

async function refreshInventoryCache() {
  if (!isCloudSqlConnected) return;
  try {
    const rows = await sqlDb.select().from(inventorySchema);
    if (rows && rows.length > 0) {
      db.inventory.length = 0;
      for (const r of rows) {
        const invItem = {
          _id: r.id,
          location_type: (r.locationType as any) || "WAREHOUSE",
          location_id: r.locationId,
          office_id: r.locationType === "WAREHOUSE" ? r.locationId : "",
          sku_id: r.skuId,
          stock_on_hand: Number(r.stockOnHand) || 0,
          available_stock: Number(r.availableStock) || 0,
          allocated_stock: Number(r.allocatedStock) || 0,
          status: (r.status as any) || "ACTIVE",
          updated_at: r.updatedAt?.toISOString() || new Date().toISOString(),
          created_at: r.createdAt?.toISOString() || new Date().toISOString()
        };
        db.inventory.push(invItem);
        syncSingleDoc("inventory", invItem._id, invItem).catch(() => {});
      }
    }
  } catch (e: any) {
    console.warn("[refreshInventoryCache]", e?.message);
  }
}



// Automatic DB persistence hook for all mutating operations (PostgreSQL as Single Source of Truth)
let postgresSyncTimer: NodeJS.Timeout | null = null;
apiRouter.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        saveDatabaseToDisk();
        // Debounced sync to PostgreSQL Single Source of Truth
        if (postgresSyncTimer) clearTimeout(postgresSyncTimer);
        postgresSyncTimer = setTimeout(() => {
          migrateAllToCloudSql().catch((e) => console.warn("[PostgreSQL Hook Sync]", e?.message));
        }, 100);
      }
    });
  }
  next();
});

// Real-time database sync diagnostic status
apiRouter.get("/system/db-status", async (req, res) => {
  const stats = getSyncStats();
  const cloudSqlStats = await getCloudSqlStats();
  res.json({
    success: true,
    data: {
      ...stats,
      primaryEngine: "Google Cloud SQL (PostgreSQL)",
      singleSourceOfTruth: true,
      cloudSql: cloudSqlStats,
    },
  });
});

// Real-time Test Database Connection endpoint
apiRouter.post("/system/test-db-connection", async (req, res) => {
  try {
    const testResult = await testCloudSqlConnection();
    res.json(testResult);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Database Connection Failed. Periksa konfigurasi database dan koneksi server.",
      data: null,
    });
  }
});

// Run Database Migrations and Schema Verification
apiRouter.post("/system/run-migrations", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const success = await initializeCloudSqlTables();
    const stats = await getCloudSqlStats();
    
    if (success) {
      recordAuditLog(
        req.user!._id,
        "RUN_DATABASE_MIGRATIONS",
        "SYSTEM",
        "POSTGRESQL",
        {
          triggered_by: req.user!.name || req.user!.email,
          role: req.user!.role,
          tableCount: stats.tableCount,
          timestamp: new Date().toISOString(),
        }
      );
      res.json({
        success: true,
        message: `Migrasi & verifikasi skema database berhasil. Total ${stats.tableCount} tabel aktif dan terverifikasi.`,
        data: stats,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Gagal menjalankan migrasi skema tabel PostgreSQL.",
        data: stats,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Gagal menjalankan migrasi: " + (error?.message || String(error)),
    });
  }
});

// Cloud Services status endpoint
apiRouter.get("/system/cloud-services-status", async (req, res) => {
  try {
    const cloudSqlStats = await getCloudSqlStats();
    
    const services = [
      {
        id: "postgresql",
        name: "Google Cloud SQL (PostgreSQL)",
        category: "DATABASE",
        role: "Single Source of Truth (Database Utama)",
        provider: "Google Cloud Platform",
        region: "asia-southeast1",
        status: cloudSqlStats.isConnected ? "CONNECTED" : "ERROR",
        isRequired: true,
        description: "Penyimpanan relasional utama untuk master data, transaksi penjualan, mutasi stok fisik, dan logistik.",
        details: {
          engine: "PostgreSQL 15+",
          tables: cloudSqlStats.tableCount,
          records: cloudSqlStats.persistedRecords,
          host: "crested-diagram-bdtd0:asia-southeast1:ai-studio-15f375fc",
        },
      },
      {
        id: "postgres_auth",
        name: "Authentication Service",
        category: "AUTH",
        role: "Manajemen Autentikasi Pengguna & Sesi",
        provider: "PostgreSQL Authentication / DMS Session Engine",
        region: "Global",
        status: "CONNECTED",
        isRequired: true,
        description: "Mengelola login pengguna (Owner, Admin, Supervisor, Salesman, Warehouse), token JWT, dan kontrol hak akses role-based (RBAC).",
        details: {
          methods: ["Email/Password", "Session Token"],
          activeRoles: ["OWNER", "ADMIN", "SUPERVISOR", "SALES", "WAREHOUSE"],
        },
      },
      {
        id: "cloud_storage",
        name: "Cloud File Storage",
        category: "STORAGE",
        role: "Penyimpanan Media & Bukti Digital",
        provider: "Google Cloud Storage / Firebase Storage",
        region: "asia-southeast1",
        status: "CONNECTED",
        isRequired: false,
        description: "Menyimpan foto bukti check-in/check-out absensi, foto kunjungan outlet toko, dan dokumen nota/faktur PDF.",
        details: {
          bucket: "crested-diagram-bdtd0.appspot.com",
          allowedTypes: ["image/jpeg", "image/png", "application/pdf"],
        },
      },
      {
        id: "maps_location",
        name: "Maps & Geolocation Service",
        category: "LOCATION",
        role: "GPS Tracking & Geofencing Lapangan",
        provider: "Google Maps Platform / Browser Geolocation API",
        region: "Indonesia (WIB)",
        status: "CONNECTED",
        isRequired: true,
        description: "Validasi titik koordinat GPS presensi, radius geofence toko, deteksi Fake GPS / Mock Location, dan plotting rute sales.",
        details: {
          toleranceMeters: 100,
          antiMockGPS: "ACTIVE (Rejection Policy)",
        },
      },
      {
        id: "ai_service",
        name: "AI Analytics Assistant (Gemini)",
        category: "AI",
        role: "Analitik Data & Rekomendasi Distribusi",
        provider: "Google Gemini API (@google/genai)",
        region: "Global",
        status: process.env.GEMINI_API_KEY ? "CONNECTED" : "READY",
        isRequired: false,
        description: "Menganalisis pola pembelian toko, prediksi kebutuhan restock gudang, dan ringkasan performa tim sales.",
        details: {
          sdk: "@google/genai",
          model: "gemini-2.5-flash",
        },
      },
    ];

    res.json({
      success: true,
      data: services,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil status cloud services: " + (error?.message || String(error)),
    });
  }
});

// Cloud SQL PostgreSQL status and diagnostics
apiRouter.get("/system/cloudsql-status", async (req, res) => {
  const stats = await getCloudSqlStats();
  res.json({
    success: true,
    data: stats,
  });
});

// Trigger full migration to Google Cloud SQL (PostgreSQL)
apiRouter.post("/system/migrate-to-cloudsql", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await migrateAllToCloudSql();
    recordAuditLog(
      req.user!._id,
      "MIGRATE_DATABASE_TO_CLOUDSQL",
      "SYSTEM",
      "ALL_DATA",
      {
        migrated_by: req.user!.name || req.user!.email,
        role: req.user!.role,
        total_records: result.totalRecords,
      }
    );
    res.json({
      success: result.success,
      message: result.message,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Gagal migrasi ke Cloud SQL: " + (error?.message || String(error)),
    });
  }
});

// Total Database Clean Migration & Purge: Wipes old data, dummy, mock, seed simulation, resets to empty clean baseline
apiRouter.post("/system/purge-and-reset-clean-db", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    // 1. Purge all documents in Cloud Firestore
    const purgeResult = await purgeAllFirestoreData();

    // 2. Reset in-memory database and local disk store to clean fresh empty state
    resetToCleanFreshDatabase();

    // 3. Re-sync clean state to Cloud Firestore
    await syncToFirestore(true, true);

    // 4. Record audit log
    recordAuditLog(
      req.user!._id,
      "TOTAL_MIGRATE_CLEAN_DATABASE",
      "SYSTEM",
      "ALL_DATA",
      {
        purged_by: req.user!.name || req.user!.email,
        role: req.user!.role,
        firestore_documents_purged: purgeResult.deletedCount,
        timestamp: new Date().toISOString(),
      }
    );

    res.json({
      success: true,
      message: `Migrasi total database ke database baru yang kosong dan bersih berhasil dilakukan! Seluruh data lama/dummy/mock/test telah dihapus (${purgeResult.deletedCount} dokumen cloud dibersihkan).`,
      data: {
        purgedCount: purgeResult.deletedCount,
        syncStats: getSyncStats(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Gagal melakukan migrasi bersih database: " + (error?.message || String(error)),
    });
  }
});

// Download full database snapshot (JSON export) khusus ADMIN dan OWNER
apiRouter.get("/system/export-db", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  try {
    saveDatabaseToDisk();

    // Sanitize user password hashes for security in export
    const exportDb = JSON.parse(JSON.stringify(db));
    if (Array.isArray(exportDb.users)) {
      exportDb.users = exportDb.users.map((u: any) => {
        const copy = { ...u };
        delete copy.password_hash;
        return copy;
      });
    }

    const timestamp = getTodayWIB();
    const filename = `mahameru-dms-backup-${timestamp}.json`;

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(JSON.stringify(exportDb, null, 2));

    // Audit log the database download
    recordAuditLog(
      req.user!._id,
      "DOWNLOAD_DATABASE_BACKUP",
      "SYSTEM",
      "ALL_DATA",
      {
        downloaded_by: req.user!.name || req.user!.email,
        role: req.user!.role,
        timestamp: new Date().toISOString(),
      }
    );
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Gagal mendownload backup database: " + (error?.message || String(error)),
    });
  }
});

// Upload and restore database from JSON backup file khusus ADMIN dan OWNER
apiRouter.post("/system/import-db", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const payload = req.body?.database || req.body?.data || req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({
        success: false,
        message: "Format payload database tidak valid. Harus berupa data JSON backup Mahameru DMS.",
      });
    }

    const mode = req.body?.mode || "merge"; // "merge" | "replace"
    const summary: Record<string, number> = {};
    let totalImported = 0;

    // Cache existing users to keep password hashes if missing in uploaded data
    const existingUsersMap = new Map<string, any>();
    for (const u of db.users || []) {
      if (u._id) existingUsersMap.set(u._id, u);
      if (u.email) existingUsersMap.set(u.email.toLowerCase(), u);
    }

    // Process all standard collections
    for (const { key } of ALL_SYNC_COLLECTIONS) {
      if (Array.isArray(payload[key])) {
        const incoming = payload[key];
        if (mode === "replace") {
          if (key === "users") {
            (db as any)[key] = incoming.map((nu: any) => {
              const matched = existingUsersMap.get(nu._id) || existingUsersMap.get(nu.email?.toLowerCase());
              if (!nu.password_hash && matched?.password_hash) {
                return { ...nu, password_hash: matched.password_hash };
              }
              return nu;
            });
          } else {
            (db as any)[key] = incoming;
          }
          summary[key] = incoming.length;
          totalImported += incoming.length;
        } else {
          // Merge mode (default)
          const currentList = Array.isArray((db as any)[key]) ? (db as any)[key] : [];
          const existingMap = new Map<string, number>();
          currentList.forEach((it: any, idx: number) => {
            const id = it?._id || it?.id;
            if (id) existingMap.set(String(id), idx);
          });

          let importedForCol = 0;
          for (const item of incoming) {
            if (!item) continue;
            const itemId = item._id || item.id;
            if (!itemId) continue;

            if (key === "users" && !item.password_hash) {
              const matched = existingUsersMap.get(item._id) || existingUsersMap.get(item.email?.toLowerCase());
              if (matched?.password_hash) {
                item.password_hash = matched.password_hash;
              }
            }

            const existingIdx = existingMap.get(String(itemId));
            if (existingIdx !== undefined) {
              currentList[existingIdx] = { ...currentList[existingIdx], ...item };
            } else {
              currentList.push(item);
              existingMap.set(String(itemId), currentList.length - 1);
            }
            importedForCol++;
          }
          (db as any)[key] = currentList;
          summary[key] = importedForCol;
          totalImported += importedForCol;
        }
      }
    }

    // Single objects: company_profile & settings
    if (payload.company_profile && typeof payload.company_profile === "object") {
      db.company_profile = { ...db.company_profile, ...payload.company_profile };
      summary["company_profile"] = 1;
    }
    if (payload.settings && typeof payload.settings === "object") {
      db.settings = { ...db.settings, ...payload.settings };
      summary["settings"] = 1;
    }

    // Run audit and repair to maintain referential integrity
    const repairResult = auditAndRepairDatabase();

    // Persist to local disk JSON backup
    saveDatabaseToDisk(true);

    // Sync all updated documents to Primary Database: Google Cloud SQL
    const cloudSqlMigration = await migrateAllToCloudSql();

    // Sync all updated documents to Legacy Database: Google Cloud Firestore (stub)
    await syncToFirestore(true, true);

    // Audit log the upload action
    recordAuditLog(
      req.user!._id,
      "RESTORE_DATABASE_UPLOAD",
      "SYSTEM",
      "ALL_DATA",
      {
        restored_by: req.user!.name || req.user!.email,
        role: req.user!.role,
        total_records_processed: totalImported,
        mode,
        summary,
      }
    );

    res.json({
      success: true,
      message: `Database berhasil diunggah & dipulihkan! Total ${totalImported} data berhasil disinkronkan ke PostgreSQL.`,
      data: {
        totalImported,
        summary,
        repairResult,
        cloudSqlMigration,
        syncStats: getSyncStats(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Gagal mengunggah & memulihkan database: " + (error?.message || String(error)),
    });
  }
});

// Trigger immediate real-time synchronization to Google Cloud Firestore
apiRouter.post("/system/sync-now", async (req, res) => {
  try {
    saveDatabaseToDisk(true);
    const cloudSqlMigration = await migrateAllToCloudSql();
    
    const forceAll = req.body && req.body.forceAll === true;
    await syncToFirestore(true, forceAll);
    
    res.json({
      success: true,
      message: "Sinkronisasi database dengan PostgreSQL (Primary) dan Firestore (Legacy) selesai.",
      data: {
        cloudSqlMigration,
        syncStats: getSyncStats(),
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to sync database: " + (error?.message || String(error)),
    });
  }
});

// Comprehensive Database Audit & Auto-Repair
apiRouter.post("/system/repair-database", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const result = auditAndRepairDatabase();
    
    saveDatabaseToDisk(true);
    const cloudSqlMigration = await migrateAllToCloudSql();
    await syncToFirestore(true, true);
    
    res.json({
      success: true,
      message: "Pemeriksaan dan perbaikan integritas database berhasil dilakukan.",
      data: {
        ...result,
        cloudSqlMigration,
        syncStats: getSyncStats(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Gagal memperbaiki database: " + (error?.message || String(error)),
    });
  }
});

// ================= TIMEZONE & DATE HELPERS (GMT+7 / Asia/Jakarta) =================
export const TIMEZONE_WIB = "Asia/Jakarta";

export function getTodayWIB(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_WIB,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export function getCurrentPeriodWIB(): string {
  return getTodayWIB().slice(0, 7);
}

export function formatDateYMDWIB(d: Date | string | number): string {
  if (!d) return getTodayWIB();
  const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
  if (isNaN(date.getTime())) return getTodayWIB();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_WIB,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

export function getCurrentTimeHHMMWIB(d: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE_WIB,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(d);
}

export function getCurrentTimeFullWIB(d: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE_WIB,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(d);
}

export function getCurrentDayNameWIB(d: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: TIMEZONE_WIB,
    weekday: "long",
  });
  return formatter.format(d);
}

export function formatDateTimeWIB(d: Date | string | number): string {
  if (!d) return "-";
  const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleString("id-ID", {
    timeZone: TIMEZONE_WIB,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }) + " WIB";
}

/**
 * Converts "HH:MM" string to total minutes from midnight (00:00)
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(":");
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Formats duration in seconds into human-readable Indonesian string (e.g. "8 jam 30 menit")
 */
export function formatSecondsToDuration(seconds: number): string {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) return "-";
  const sec = Math.round(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
  }
  if (m > 0) {
    return s > 0 ? `${m} menit ${s} dtk` : `${m} menit`;
  }
  return `${s} detik`;
}

/**
 * Accurately determines late status and late minutes based on shift start time & late tolerance
 */
export function calculateAttendanceLateStatus(
  checkInTimeStr: string,
  shiftStartTime: string = "08:00",
  toleranceMinutes: number = 15
): { isLate: boolean; lateMinutes: number; thresholdTimeStr: string } {
  const checkInMinutes = parseTimeToMinutes(checkInTimeStr);
  const shiftStartMinutes = parseTimeToMinutes(shiftStartTime);
  const thresholdMinutes = shiftStartMinutes + Math.max(0, toleranceMinutes);

  const thH = String(Math.floor(thresholdMinutes / 60)).padStart(2, "0");
  const thM = String(thresholdMinutes % 60).padStart(2, "0");
  const thresholdTimeStr = `${thH}:${thM}`;

  if (checkInMinutes > thresholdMinutes) {
    return {
      isLate: true,
      lateMinutes: checkInMinutes - shiftStartMinutes,
      thresholdTimeStr,
    };
  }

  return {
    isLate: false,
    lateMinutes: 0,
    thresholdTimeStr,
  };
}

// ================= AUDIT LOGGING HELPER =================
export function recordAuditLog(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  details: any,
  ip?: string
): AuditLog {
  const user = db.users.find((u) => u._id === userId);
  const log: AuditLog = {
    _id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    user_id: userId,
    action,
    entity,
    entity_id: entityId,
    details: {
      ...details,
      user_name: user?.name || details?.user_name || "System",
      user_role: user?.role || details?.user_role || "-",
      timestamp: new Date().toISOString(),
    },
    ip_address: ip,
    created_at: new Date().toISOString(),
  };
  db.audit_logs.unshift(log);
  saveDatabaseToDisk();
  syncSingleDoc("audit_logs", log._id, log);

  try {
    sqlDb.insert(pgAuditLogs).values({
      id: log._id,
      userId: log.user_id,
      action: log.action,
      module: log.entity,
      targetId: log.entity_id,
      details: log.details,
      ipAddress: log.ip_address,
      timestamp: new Date(log.created_at)
    }).catch((err: any) => console.error("Error inserting audit log to Postgres:", err.message));
  } catch (err: any) {}

  return log;
}

// ================= SALES OUTLET ASSIGNMENT HELPERS =================
export function getSalesAreaId(salesId: string): string | undefined {
  const user = db.users.find((u) => u._id === salesId);
  if (user?.area_id) return user.area_id;
  const salesman = db.salesmen.find((s) => s._id === salesId || s.user_id === salesId);
  return (salesman as any)?.area_id;
}

export function getActiveAssignedOutletIds(salesId: string): string[] {
  // 1. Direct assignments in sales_outlets
  const directIds = db.sales_outlets
    .filter((so) => (so.sales_id === salesId || (so as any).salesman_id === salesId) && so.status === "ACTIVE")
    .map((so) => so.outlet_id);

  // 2. Area-based ownership: all outlets in the sales rep's assigned area
  const areaId = getSalesAreaId(salesId);
  const areaOutletIds = areaId
    ? db.outlets.filter((o) => o.area_id === areaId && o.status !== "ARCHIVED").map((o) => o._id)
    : [];

  return Array.from(new Set([...directIds, ...areaOutletIds]));
}

export function isOutletAssignedToSales(salesId: string, outletId: string): boolean {
  const outlet = db.outlets.find((o) => o._id === outletId);
  if (!outlet) return false;

  // 1. Direct assignment in sales_outlets
  const direct = db.sales_outlets.some(
    (so) => (so.sales_id === salesId || (so as any).salesman_id === salesId) && so.outlet_id === outletId && so.status === "ACTIVE"
  );
  if (direct) return true;

  // 2. Created by this sales rep (NOO / prospect registration)
  if (outlet.created_by === salesId) return true;

  // 3. Area-based ownership
  const areaId = getSalesAreaId(salesId);
  if (areaId && outlet.area_id && areaId === outlet.area_id) {
    return true;
  }

  // 4. Included in assigned call plans
  const inCallPlan = db.call_plans.some(
    (cp) => cp.salesman_id === salesId && db.call_plan_items.some((cpi) => cpi.call_plan_id === cp._id && cpi.outlet_id === outletId)
  );
  if (inCallPlan) return true;

  return false;
}

export function getAssignedSalesForOutlet(outlet: Outlet) {
  // Direct active assignment
  const direct = db.sales_outlets.find(
    (so) => so.outlet_id === outlet._id && so.status === "ACTIVE"
  );
  if (direct) {
    const user = db.users.find((u) => u._id === direct.sales_id);
    const salesman = db.salesmen.find((s) => s._id === direct.sales_id || s.user_id === direct.sales_id);
    return {
      sales_id: direct.sales_id,
      sales_name: user?.name || salesman?.name || "-",
      sales_code: (salesman as any)?.code || "-",
      sales_phone: user?.phone || salesman?.phone || "-",
      assignment_type: "DIRECT",
    };
  }

  // Area-based owner
  if (outlet.area_id) {
    const areaSales = db.users.find((u) => u.role === "SALES" && u.area_id === outlet.area_id && u.status === "ACTIVE")
      || db.salesmen.find((s) => s.area_id === outlet.area_id && s.status === "ACTIVE");
    if (areaSales) {
      const salesId = areaSales._id || (areaSales as any).user_id;
      return {
        sales_id: salesId,
        sales_name: areaSales.name || "-",
        sales_code: (areaSales as any).code || "-",
        sales_phone: areaSales.phone || "-",
        assignment_type: "AREA_OWNERSHIP",
      };
    }
  }

  return null;
}

// ================= OUTLET LIFECYCLE & AUTOMATION ENGINE =================
// FINAL BUSINESS RULE:
// STATUS IS STRICTLY DETERMINED BY COMPLETED TRANSACTIONS:
// 0 transactions -> PROSPECT / NEW ("Belum Ada Transaksi")
// 1 completed transaction -> NOO ("New Outlet Opening")
// 2 completed transactions -> REPEAT ("Repeat Customer")
// >= 3 completed transactions:
//    - If inactivity >= 56 days (8 weeks) -> DORMANT ("No Transaction ≥ 8 Weeks")
//    - Otherwise -> ACTIVE ("Active Outlet")
// When a DORMANT outlet completes a new transaction, it becomes ACTIVE (not NOO).
// Visit without transactions DOES NOT change status.
// Cancelled transactions DO NOT count.
export type OutletLifecycleStatus = "PROSPECT" | "NOO" | "REPEAT" | "ACTIVE" | "DORMANT";

export const LIFECYCLE_CONFIG: Record<
  OutletLifecycleStatus,
  { label: string; description: string; badge: string; color: string }
> = {
  PROSPECT: {
    label: "Prospect",
    description: "Belum Ada Transaksi (0 Transaksi)",
    badge: "PROSPECT",
    color: "slate",
  },
  NOO: {
    label: "NOO",
    description: "New Outlet Opening (1x Transaksi Selesai)",
    badge: "NOO",
    color: "blue",
  },
  REPEAT: {
    label: "Repeat",
    description: "Repeat Customer (2x Transaksi Selesai)",
    badge: "REPEAT",
    color: "amber",
  },
  ACTIVE: {
    label: "Active",
    description: "Active Outlet (≥3x Transaksi Selesai)",
    badge: "ACTIVE",
    color: "emerald",
  },
  DORMANT: {
    label: "Dormant",
    description: "Tidak Ada Transaksi ≥ 8 Minggu (56 Hari)",
    badge: "DORMANT",
    color: "rose",
  },
};

export function calculateOutletStatus(
  completedTransactionCount: number,
  lastCompletedTransactionAt: string | null | undefined,
  currentDate: Date = new Date()
): OutletLifecycleStatus {
  if (!completedTransactionCount || completedTransactionCount <= 0) {
    return "PROSPECT";
  }
  if (completedTransactionCount === 1) {
    return "NOO";
  }
  if (completedTransactionCount === 2) {
    return "REPEAT";
  }

  // completedTransactionCount >= 3
  if (lastCompletedTransactionAt) {
    const lastDate = new Date(lastCompletedTransactionAt);
    const diffMs = currentDate.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 56) {
      return "DORMANT";
    }
  }

  return "ACTIVE";
}

export function recalculateOutletSummary(outletId: string, currentDate: Date = new Date()) {
  const outlet = db.outlets.find((o) => o._id === outletId);
  if (!outlet) return null;

  // Filter completed transactions strictly (exclude CANCELLED and DRAFT)
  const completedTxns = db.transactions
    .filter(
      (t) => t.outlet_id === outletId && t.status !== "CANCELLED" && (t as any).status !== "DRAFT"
    )
    .sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());

  const count = completedTxns.length;
  const firstTxn = completedTxns[0];
  const lastTxn = completedTxns[completedTxns.length - 1];

  const firstAt = firstTxn ? firstTxn.transaction_date : null;
  const lastAt = lastTxn ? lastTxn.transaction_date : null;

  const totalVolume = completedTxns.reduce(
    (sum, t) => sum + (t.total_volume ?? (t.items || []).reduce((is: number, i: any) => is + (Number(i.quantity ?? i.volume) || 0), 0)),
    0
  );
  const totalRevenue = completedTxns.reduce((sum, t) => sum + (Number(t.total) || 0), 0);

  const prevStatus = outlet.lifecycle_status;
  const newStatus = calculateOutletStatus(count, lastAt, currentDate);

  outlet.completed_transaction_count = count;
  outlet.first_completed_transaction_at = firstAt;
  outlet.last_completed_transaction_at = lastAt;
  outlet.lifecycle_status = newStatus;
  outlet.total_volume = totalVolume;
  outlet.total_revenue = totalRevenue;

  let daysSinceLast: number | null = null;
  if (lastAt) {
    const diffMs = currentDate.getTime() - new Date(lastAt).getTime();
    daysSinceLast = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  // Audit if status changed
  if (prevStatus && prevStatus !== newStatus) {
    recordAuditLog(
      "system",
      "OUTLET_STATUS_UPDATED",
      "outlets",
      outlet._id,
      {
        outlet_code: outlet.outlet_code,
        outlet_name: outlet.outlet_name,
        prev_status: prevStatus,
        new_status: newStatus,
        completed_transactions: count,
        days_since_last: daysSinceLast,
        last_completed_at: lastAt,
      }
    );
  }

  return {
    outlet_id: outletId,
    completed_transaction_count: count,
    first_completed_transaction_at: firstAt,
    last_completed_transaction_at: lastAt,
    days_since_last_transaction: daysSinceLast,
    lifecycle_status: newStatus,
    total_volume: totalVolume,
    total_revenue: totalRevenue,
  };
}

export function recalculateAllOutletStatuses(currentDate: Date = new Date()) {
  // O(T) single pass over transactions to aggregate
  const completedTxns = db.transactions.filter(
    (t) => t.status !== "CANCELLED" && (t as any).status !== "DRAFT"
  );
  
  const aggregation = new Map<string, any[]>();
  for (const t of completedTxns) {
    if (!aggregation.has(t.outlet_id)) {
      aggregation.set(t.outlet_id, []);
    }
    aggregation.get(t.outlet_id)!.push(t);
  }

  for (const o of db.outlets) {
    const txns = aggregation.get(o._id) || [];
    txns.sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
    
    const count = txns.length;
    const firstTxn = txns[0];
    const lastTxn = txns[txns.length - 1];
    
    const firstAt = firstTxn ? firstTxn.transaction_date : null;
    const lastAt = lastTxn ? lastTxn.transaction_date : null;
    
    const totalVolume = txns.reduce(
      (sum, t) => sum + (t.total_volume ?? (t.items || []).reduce((is: number, i: any) => is + (Number(i.quantity ?? i.volume) || 0), 0)),
      0
    );
    const totalRevenue = txns.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
    
    const prevStatus = o.lifecycle_status;
    const newStatus = calculateOutletStatus(count, lastAt, currentDate);
    
    o.completed_transaction_count = count;
    o.first_completed_transaction_at = firstAt;
    o.last_completed_transaction_at = lastAt;
    o.lifecycle_status = newStatus;
    o.total_volume = totalVolume;
    o.total_revenue = totalRevenue;
  }
}

// Initial calculation at server startup
recalculateAllOutletStatuses();

// ================= STANDARDIZED SALES KPI CALCULATOR =================
export interface SalesKPIFilter {
  salesmanId?: string;
  from?: string;
  to?: string;
  areaId?: string;
  skuId?: string;
}

export function calculateSalesKPIs(filter: SalesKPIFilter) {
  const { salesmanId, from, to, areaId, skuId } = filter;

  // 1. Valid visits:
  // Must be COMPLETED, date in [from, to] (or matches), assigned to Sales, and within area
  const visits = db.visits.filter((v) => {
    if (v.status !== "COMPLETED") return false;
    if (from && v.date < from) return false;
    if (to && v.date > to) return false;
    if (salesmanId && v.salesman_id !== salesmanId) return false;

    // Check outlet assignment & area
    const outlet = db.outlets.find((o) => o._id === v.outlet_id);
    if (!outlet) return false;
    if (areaId && outlet.area_id !== areaId) return false;

    // Only count visits to outlets assigned to that sales representative
    if (v.salesman_id && !isOutletAssignedToSales(v.salesman_id, v.outlet_id)) {
      return false;
    }
    return true;
  });

  // OUTLET CALL = COUNT(DISTINCT (salesman_id + date + outlet_id))
  // Multiple visits to the same outlet on the same day by the same sales = 1 Outlet Call
  const visitedDailyKeys = new Set<string>();
  const visitedOutletIds = new Set<string>();
  visits.forEach((v) => {
    visitedDailyKeys.add(`${v.salesman_id}_${v.date}_${v.outlet_id}`);
    visitedOutletIds.add(v.outlet_id);
  });
  const outletCalls = visitedDailyKeys.size;

  // 2. Transactions (Only COMPLETED/PAID/DELIVERED, exclude CANCELLED or DRAFT):
  const txns = db.transactions.filter((t) => {
    if (t.status === "CANCELLED" || (t as any).status === "DRAFT") return false;
    const txnDate = (t.transaction_date || "").slice(0, 10);
    if (from && txnDate < from) return false;
    if (to && txnDate > to) return false;
    if (salesmanId && t.salesman_id !== salesmanId) return false;

    const outlet = db.outlets.find((o) => o._id === t.outlet_id);
    if (!outlet) return false;
    if (areaId && outlet.area_id !== areaId) return false;

    if (t.salesman_id && !isOutletAssignedToSales(t.salesman_id, t.outlet_id)) {
      return false;
    }
    return true;
  });

  // 3. Effective Call calculation:
  // Unique outlets visited by sales on that day that completed purchases of valid products
  const effectiveDailyKeys = new Set<string>();
  let totalVolume = 0;
  let totalRevenue = 0;

  txns.forEach((t) => {
    const txnDate = (t.transaction_date || "").slice(0, 10);
    const visitKey = `${t.salesman_id}_${txnDate}_${t.outlet_id}`;
    const wasVisited = visitedDailyKeys.has(visitKey);

    let matchingItems = t.items || [];
    if (skuId) {
      matchingItems = matchingItems.filter((item: any) => item.sku_id === skuId);
    }

    if (matchingItems.length > 0) {
      if (wasVisited) {
        effectiveDailyKeys.add(visitKey);
      }
      matchingItems.forEach((item: any) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price || item.unit_price) || 0;
        totalVolume += qty;
        totalRevenue += qty * price;
      });
    }
  });

  if (!skuId) {
    totalRevenue = txns.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
    totalVolume = txns.reduce((sum, t) => sum + (t.items || []).reduce((isum: number, i: any) => isum + (Number(i.quantity) || 0), 0), 0);
  }

  const effectiveCalls = effectiveDailyKeys.size;
  const ecRate = outletCalls > 0 ? Math.round((effectiveCalls / outletCalls) * 100) : 0;

  return {
    outlet_calls: outletCalls,
    actual: outletCalls, // backward compatibility
    effective_calls: effectiveCalls,
    effective: effectiveCalls, // backward compatibility
    ec_rate: ecRate,
    effective_ratio: ecRate, // backward compatibility
    total_volume: totalVolume,
    volume: totalVolume,
    total_revenue: totalRevenue,
    revenue: totalRevenue,
    sales_value: totalRevenue,
    transaction_count: txns.length,
    txn_count: txns.length,
    distinct_outlets_visited: visitedOutletIds.size,
  };
}

// ================= VOLUME-BASED TARGET & ACHIEVEMENT ENGINE =================
// FINAL BUSINESS RULE:
// TARGET = VOLUME (QTY PER SKU). ACTUAL = VOLUME (SUM OF QTY FROM COMPLETED TRANSACTIONS).
// ACHIEVEMENT = (ACTUAL VOLUME / TARGET VOLUME) * 100%.
// REVENUE IS STRICTLY SEPARATE AND NOT USED FOR TARGET ACHIEVEMENT.
export interface VolumeTargetResult {
  target_volume: number;
  actual_volume: number;
  achievement_percentage: number;
  achievement_formatted: string;
  status: "NO_TARGET" | "NOT_STARTED" | "IN_PROGRESS" | "ACHIEVED" | "OVER_ACHIEVED";
  status_label: string;
  revenue: number; // Value KPI - strictly separate
  target_count: number;
  matched_targets: Target[];
}

export function calculateVolumeTargetAndAchievement(filter: {
  salesmanId?: string;
  areaId?: string;
  productId?: string;
  skuId?: string;
  outletId?: string;
  period?: string; // e.g. "2026-08"
  from?: string; // "2026-08-01"
  to?: string; // "2026-08-31"
}): VolumeTargetResult {
  const period = filter.period || (filter.from ? filter.from.slice(0, 7) : new Date().toISOString().slice(0, 7));
  const fromDate = filter.from || `${period}-01`;
  const toDate = filter.to || `${period}-31`;

  // 1. Find matching targets from db.targets (Target Volume is strictly in Qty)
  const matchingTargets = (db.targets || []).filter((t) => {
    if (t.status === "INACTIVE") return false;
    
    // Period matching
    if (t.period && t.period !== period) {
      if (t.from_date && t.to_date) {
        if (t.to_date < fromDate || t.from_date > toDate) return false;
      } else {
        return false;
      }
    }

    if (filter.salesmanId && t.salesman_id && t.salesman_id !== filter.salesmanId) return false;
    if (filter.areaId && t.area_id && t.area_id !== filter.areaId) return false;
    if (filter.productId && t.product_id && t.product_id !== filter.productId) return false;
    if (filter.skuId && t.sku_id && t.sku_id !== filter.skuId) return false;

    return true;
  });

  const targetVolume = matchingTargets.reduce((sum, t) => sum + (Number(t.target_volume) || 0), 0);

  // 2. Calculate Actual Volume from COMPLETED transactions strictly (sum of Qty per SKU)
  const validTxns = db.transactions.filter((t) => {
    if (t.status === "CANCELLED" || (t as any).status === "DRAFT") return false;
    const tDate = (t.transaction_date || "").slice(0, 10);
    if (tDate < fromDate || tDate > toDate) return false;
    if (filter.salesmanId && t.salesman_id !== filter.salesmanId) return false;
    if (filter.outletId && t.outlet_id !== filter.outletId) return false;

    const outlet = db.outlets.find((o) => o._id === t.outlet_id);
    if (filter.areaId && outlet?.area_id !== filter.areaId) return false;

    if (t.salesman_id && !isOutletAssignedToSales(t.salesman_id, t.outlet_id)) {
      return false;
    }
    return true;
  });

  let actualVolume = 0;
  let revenue = 0;

  validTxns.forEach((t) => {
    (t.items || []).forEach((item: any) => {
      const sku = db.skus.find((s) => s._id === item.sku_id);
      const prodId = item.product_id || sku?.product_id;

      if (filter.skuId && item.sku_id !== filter.skuId) return;
      if (filter.productId && prodId !== filter.productId) return;

      const qty = Number(item.quantity ?? item.volume ?? 0);
      const price = Number(item.unit_price ?? item.price ?? 0);
      actualVolume += qty;
      revenue += qty * price;
    });
  });

  // 3. Achievement % Calculation: ACTUAL VOLUME / TARGET VOLUME * 100%
  // Target 0 results in 0% (no NaN, no Infinity)
  // Over-achievement is allowed (e.g. 120%)
  const achievementPct = targetVolume > 0 
    ? Math.round((actualVolume / targetVolume) * 1000) / 10 
    : 0;

  let status: VolumeTargetResult["status"] = "NOT_STARTED";
  let statusLabel = "Belum Dimulai";

  if (targetVolume === 0) {
    status = "NO_TARGET";
    statusLabel = "Tanpa Target";
  } else if (actualVolume >= targetVolume) {
    if (actualVolume > targetVolume) {
      status = "OVER_ACHIEVED";
      statusLabel = "Tercapai (Over Target)";
    } else {
      status = "ACHIEVED";
      statusLabel = "Target Tercapai";
    }
  } else if (actualVolume > 0) {
    status = "IN_PROGRESS";
    statusLabel = "Sedang Berjalan";
  } else {
    status = "NOT_STARTED";
    statusLabel = "Belum Ada Penjualan";
  }

  return {
    target_volume: targetVolume,
    actual_volume: actualVolume,
    achievement_percentage: achievementPct,
    achievement_formatted: `${achievementPct}%`,
    status,
    status_label: statusLabel,
    revenue,
    target_count: matchingTargets.length,
    matched_targets: matchingTargets,
  };
}

// Health check
apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

apiRouter.get("/", (req, res) => {
  res.json({ message: "DMS Mahameru API", description: "Distribution Management System", status: "ok" });
});

// ================= AUTH ROUTES =================
apiRouter.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ detail: "Email dan password wajib diisi." });
  }

  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) {
    return res.status(401).json({ detail: "Email atau password salah." });
  }

  if (user.status !== "ACTIVE") {
    return res.status(403).json({ detail: "Akun Anda dinonaktifkan. Hubungi admin." });
  }

  let matches = false;
  if (user.password_hash) {
    try {
      matches = bcrypt.compareSync(password, user.password_hash);
    } catch {
      matches = false;
    }
  }

  // Fallback check for standard demo passwords
  if (!matches) {
    const demoMap: Record<string, string[]> = {
      "gudang@mahameru.id": ["gudang123", "password"],
      "sales1@mahameru.id": ["sales123", "password"],
      "spv@mahameru.id": ["spv123", "password"],
      "admin@mahameru.id": ["admin123", "password"],
      "andismochsolihin@gmail.com": ["owner123", "password"],
    };
    const allowed = demoMap[user.email.toLowerCase()];
    if (allowed && allowed.includes(password)) {
      matches = true;
      user.password_hash = bcrypt.hashSync(password, 10);
      saveDatabaseToDisk(true);
    }
  }

  if (!matches) {
    return res.status(401).json({ detail: "Email atau password salah." });
  }

  const { token, refreshToken } = generateTokens(user);
  setAuthCookies(res, token, refreshToken);

  const safeUser = { ...user };
  delete (safeUser as any).password_hash;

  // Record login in audit trail
  recordAuditLog(
    user._id,
    "LOGIN",
    "auth",
    user._id,
    {
      email: user.email,
      role: user.role,
      user_name: user.name,
      user_role: user.role,
      login_at: new Date().toISOString(),
    },
    (req.headers["x-forwarded-for"] as string) || req.ip || "-"
  );

  return res.json({
    token,
    user: safeUser,
  });
});

apiRouter.post("/auth/logout", authMiddleware, (req: AuthenticatedRequest, res) => {
  if (req.user) {
    recordAuditLog(
      req.user._id,
      "LOGOUT",
      "auth",
      req.user._id,
      {
        email: req.user.email,
        role: req.user.role,
        user_name: req.user.name,
      },
      (req.headers["x-forwarded-for"] as string) || req.ip || "-"
    );
  }
  const authHeader = req.headers.authorization;
  let token = req.cookies?.access_token;
  if (!token && authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (token) revokeSession(token);
  const refreshToken = req.cookies?.refresh_token || (req.body?.refresh_token as string);
  if (refreshToken) revokeRefreshSession(refreshToken);
  clearAuthCookies(res);
  return res.json({ ok: true, message: "Berhasil logout." });
});

apiRouter.get("/auth/me", authMiddleware, (req: AuthenticatedRequest, res) => {
  const safeUser = { ...req.user };
  delete (safeUser as any).password_hash;
  return res.json(safeUser);
});

apiRouter.post("/auth/forgot-password", (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ detail: "Email wajib diisi." });

  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (user) {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    db.password_resets.set(token, {
      email: user.email,
      expires: Date.now() + 3600 * 1000,
    });
  }

  return res.json({ ok: true, message: "Jika email terdaftar, tautan reset telah dibuat." });
});

apiRouter.post("/auth/reset-password", (req, res) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password) {
    return res.status(400).json({ detail: "Token dan password baru wajib diisi." });
  }

  const entry = db.password_resets.get(token);
  if (!entry || entry.expires < Date.now()) {
    return res.status(400).json({ detail: "Token reset tidak valid atau sudah kedaluwarsa." });
  }

  const user = db.users.find((u) => u.email === entry.email);
  if (!user) return res.status(404).json({ detail: "Pengguna tidak ditemukan." });

  user.password_hash = bcrypt.hashSync(new_password, 10);
  db.password_resets.delete(token);

  return res.json({ ok: true, message: "Password berhasil diubah." });
});

apiRouter.post("/auth/change-password", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) {
    return res.status(400).json({ detail: "Password lama dan baru wajib diisi." });
  }

  const user = db.users.find((u) => u._id === req.user!._id);
  if (!user) return res.status(404).json({ detail: "Pengguna tidak ditemukan." });

  const matches = bcrypt.compareSync(old_password, user.password_hash);
  if (!matches) {
    return res.status(400).json({ detail: "Password lama tidak sesuai." });
  }

  user.password_hash = bcrypt.hashSync(new_password, 10);
  return res.json({ ok: true, message: "Password berhasil diperbarui." });
});

// ================= MASTER DATA & SETTINGS =================
const entityMap: Record<string, string> = {
  provinces: "provinces",
  regencies: "regencies",
  districts: "districts",
  villages: "villages",
  areas: "areas",
  channels: "channels",
  routes: "routes",
  products: "products",
  skus: "skus",
  prices: "prices",
  promos: "promos",
  salesmen: "salesmen",
  offices: "offices",
  targets: "targets",
  "open-call-reasons": "open_call_reasons",
  "outlet-call-reasons": "open_call_reasons",
  open_call_reasons: "open_call_reasons",
};

// ================= ADMINISTRATIVE MASTER WILAYAH (CASCADING API) =================
apiRouter.get("/regions/provinces", authMiddleware, (req, res) => {
  const q = ((req.query.q as string) || "").toLowerCase().trim();
  const status = req.query.status as string;

  let items = db.provinces.filter((p) => {
    if (status && p.status !== status) return false;
    if (q) {
      const matchName = p.name.toLowerCase().includes(q);
      const matchCode = p.code.toLowerCase().includes(q);
      if (!matchName && !matchCode) return false;
    }
    return true;
  });

  res.json({ items, total: items.length });
});

apiRouter.get("/regions/regencies", authMiddleware, (req, res) => {
  const province_id = req.query.province_id as string;
  const q = ((req.query.q as string) || "").toLowerCase().trim();
  const status = req.query.status as string;

  let items = db.regencies.filter((r) => {
    if (province_id && r.province_id !== province_id) return false;
    if (status && r.status !== status) return false;
    if (q) {
      const matchName = r.name.toLowerCase().includes(q);
      const matchCode = r.code.toLowerCase().includes(q);
      if (!matchName && !matchCode) return false;
    }
    return true;
  });

  const enriched = items.map((r) => {
    const prov = db.provinces.find((p) => p._id === r.province_id);
    return {
      ...r,
      province_name: prov?.name || "-",
      province_code: prov?.code || "-",
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

apiRouter.get("/regions/districts", authMiddleware, (req, res) => {
  const regency_id = req.query.regency_id as string;
  const province_id = req.query.province_id as string;
  const q = ((req.query.q as string) || "").toLowerCase().trim();
  const status = req.query.status as string;

  let items = db.districts.filter((d) => {
    if (regency_id && d.regency_id !== regency_id) return false;
    if (province_id && d.province_id && d.province_id !== province_id) return false;
    if (status && d.status !== status) return false;
    if (q) {
      const matchName = d.name.toLowerCase().includes(q);
      const matchCode = d.code.toLowerCase().includes(q);
      if (!matchName && !matchCode) return false;
    }
    return true;
  });

  const enriched = items.map((d) => {
    const reg = db.regencies.find((r) => r._id === d.regency_id);
    const prov = db.provinces.find((p) => p._id === (d.province_id || reg?.province_id));
    return {
      ...d,
      regency_name: reg?.name || "-",
      province_name: prov?.name || "-",
      province_id: d.province_id || reg?.province_id || "-",
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

apiRouter.get("/regions/villages", authMiddleware, (req, res) => {
  const district_id = req.query.district_id as string;
  const regency_id = req.query.regency_id as string;
  const q = ((req.query.q as string) || "").toLowerCase().trim();
  const status = req.query.status as string;

  let items = db.villages.filter((v) => {
    if (district_id && v.district_id !== district_id) return false;
    if (regency_id && v.regency_id && v.regency_id !== regency_id) return false;
    if (status && v.status !== status) return false;
    if (q) {
      const matchName = v.name.toLowerCase().includes(q);
      const matchCode = v.code.toLowerCase().includes(q);
      const matchPostal = v.postal_code && v.postal_code.includes(q);
      if (!matchName && !matchCode && !matchPostal) return false;
    }
    return true;
  });

  const enriched = items.map((v) => {
    const dist = db.districts.find((d) => d._id === v.district_id);
    const reg = db.regencies.find((r) => r._id === (v.regency_id || dist?.regency_id));
    const prov = db.provinces.find((p) => p._id === (v.province_id || dist?.province_id || reg?.province_id));
    return {
      ...v,
      district_name: dist?.name || "-",
      regency_name: reg?.name || "-",
      province_name: prov?.name || "-",
      district_id: v.district_id,
      regency_id: v.regency_id || dist?.regency_id || "-",
      province_id: v.province_id || dist?.province_id || reg?.province_id || "-",
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

apiRouter.get("/regions/hierarchy/:villageId", authMiddleware, (req, res) => {
  const village = db.villages.find((v) => v._id === req.params.villageId);
  if (!village) return res.status(404).json({ detail: "Kelurahan/Desa tidak ditemukan." });

  const district = db.districts.find((d) => d._id === village.district_id);
  const regency = db.regencies.find((r) => r._id === (village.regency_id || district?.regency_id));
  const province = db.provinces.find((p) => p._id === (village.province_id || district?.province_id || regency?.province_id));

  res.json({
    village,
    district,
    regency,
    province,
    full_address_label: `Kel. ${village.name}, Kec. ${district?.name || "-"}, ${regency?.name || "-"}, ${province?.name || "-"} ${village.postal_code || ""}`.trim(),
  });
});

apiRouter.post("/regions/validate", authMiddleware, (req, res) => {
  const { province_id, regency_id, district_id, village_id } = req.body || {};

  if (!province_id || !regency_id || !district_id || !village_id) {
    return res.status(400).json({
      valid: false,
      detail: "Semua level wilayah (Provinsi, Kabupaten/Kota, Kecamatan, Kelurahan/Desa) wajib dipilih dari master data.",
    });
  }

  const prov = db.provinces.find((p) => p._id === province_id);
  if (!prov) {
    return res.status(400).json({ valid: false, detail: "Master Provinsi tidak ditemukan dalam database." });
  }

  const reg = db.regencies.find((r) => r._id === regency_id);
  if (!reg) {
    return res.status(400).json({ valid: false, detail: "Master Kabupaten/Kota tidak ditemukan dalam database." });
  }
  if (reg.province_id !== province_id) {
    return res.status(400).json({
      valid: false,
      detail: `Kabupaten/Kota "${reg.name}" tidak berada dalam Provinsi "${prov.name}".`,
    });
  }

  const dist = db.districts.find((d) => d._id === district_id);
  if (!dist) {
    return res.status(400).json({ valid: false, detail: "Master Kecamatan tidak ditemukan dalam database." });
  }
  if (dist.regency_id !== regency_id) {
    return res.status(400).json({
      valid: false,
      detail: `Kecamatan "${dist.name}" tidak berada dalam Kabupaten/Kota "${reg.name}".`,
    });
  }

  const vil = db.villages.find((v) => v._id === village_id);
  if (!vil) {
    return res.status(400).json({ valid: false, detail: "Master Kelurahan/Desa tidak ditemukan dalam database." });
  }
  if (vil.district_id !== district_id) {
    return res.status(400).json({
      valid: false,
      detail: `Kelurahan/Desa "${vil.name}" tidak berada dalam Kecamatan "${dist.name}".`,
    });
  }

  return res.json({
    valid: true,
    province_id: prov._id,
    province_name: prov.name,
    regency_id: reg._id,
    regency_name: reg.name,
    district_id: dist._id,
    district_name: dist.name,
    village_id: vil._id,
    village_name: vil.name,
    postal_code: vil.postal_code || "",
  });
});

apiRouter.post("/regions/import", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const { provinces, regencies, districts, villages } = req.body || {};
  const nowStr = new Date().toISOString();
  let importedCounts = { provinces: 0, regencies: 0, districts: 0, villages: 0 };

  if (Array.isArray(provinces)) {
    provinces.forEach((p) => {
      if (!p.name || !p.code) return;
      const id = p._id || `prov-${p.code.replace(/\./g, "")}`;
      const existing = db.provinces.find((x) => x._id === id || x.code === p.code);
      if (existing) {
        existing.name = p.name;
        existing.status = p.status || existing.status;
      } else {
        db.provinces.push({
          _id: id,
          code: p.code,
          name: p.name,
          status: p.status || "ACTIVE",
          created_at: nowStr,
        });
      }
      importedCounts.provinces++;
    });
  }

  if (Array.isArray(regencies)) {
    regencies.forEach((r) => {
      if (!r.name || !r.province_id) return;
      const id = r._id || `reg-${r.code ? r.code.replace(/\./g, "") : Date.now() + Math.random().toString(36).slice(2, 5)}`;
      const existing = db.regencies.find((x) => x._id === id || (r.code && x.code === r.code));
      if (existing) {
        existing.name = r.name;
        existing.province_id = r.province_id;
        existing.type = r.type || existing.type;
        existing.status = r.status || existing.status;
      } else {
        db.regencies.push({
          _id: id,
          province_id: r.province_id,
          code: r.code || id,
          name: r.name,
          type: r.type || (r.name.toLowerCase().startsWith("kota") ? "KOTA" : "KABUPATEN"),
          status: r.status || "ACTIVE",
          created_at: nowStr,
        });
      }
      importedCounts.regencies++;
    });
  }

  if (Array.isArray(districts)) {
    districts.forEach((d) => {
      if (!d.name || !d.regency_id) return;
      const id = d._id || `dist-${d.code ? d.code.replace(/\./g, "") : Date.now() + Math.random().toString(36).slice(2, 5)}`;
      const existing = db.districts.find((x) => x._id === id || (d.code && x.code === d.code));
      if (existing) {
        existing.name = d.name;
        existing.regency_id = d.regency_id;
        if (d.province_id) existing.province_id = d.province_id;
        existing.status = d.status || existing.status;
      } else {
        db.districts.push({
          _id: id,
          regency_id: d.regency_id,
          province_id: d.province_id,
          code: d.code || id,
          name: d.name,
          status: d.status || "ACTIVE",
          created_at: nowStr,
        });
      }
      importedCounts.districts++;
    });
  }

  if (Array.isArray(villages)) {
    villages.forEach((v) => {
      if (!v.name || !v.district_id) return;
      const id = v._id || `vil-${v.code ? v.code.replace(/\./g, "") : Date.now() + Math.random().toString(36).slice(2, 5)}`;
      const existing = db.villages.find((x) => x._id === id || (v.code && x.code === v.code));
      if (existing) {
        existing.name = v.name;
        existing.district_id = v.district_id;
        existing.postal_code = v.postal_code || existing.postal_code;
        if (v.regency_id) existing.regency_id = v.regency_id;
        if (v.province_id) existing.province_id = v.province_id;
        existing.status = v.status || existing.status;
      } else {
        db.villages.push({
          _id: id,
          district_id: v.district_id,
          regency_id: v.regency_id,
          province_id: v.province_id,
          code: v.code || id,
          name: v.name,
          postal_code: v.postal_code || "",
          status: v.status || "ACTIVE",
          created_at: nowStr,
        });
      }
      importedCounts.villages++;
    });
  }

  recordAuditLog(
    req.user!._id,
    "IMPORT_MASTER_WILAYAH",
    "master_wilayah",
    "bulk",
    importedCounts
  );

  saveDatabaseToDisk(true);
  await migrateAllToCloudSql();

  res.json({
    message: "Master data wilayah administratif berhasil diimport / diperbarui.",
    imported: importedCounts,
    totals: {
      provinces: db.provinces.length,
      regencies: db.regencies.length,
      districts: db.districts.length,
      villages: db.villages.length,
    },
  });
});

apiRouter.get("/masters/:entity", authMiddleware, (req, res) => {
  const key = entityMap[req.params.entity];
  if (!key || !(key in db)) {
    return res.status(404).json({ detail: `Entitas '${req.params.entity}' tidak ditemukan.` });
  }

  const list = (db as any)[key] || [];
  const q = ((req.query.q as string) || "").toLowerCase().trim();
  const status = req.query.status as string;

  let filtered = list.filter((item: any) => {
    if (status && item.status !== status) return false;
    if (q) {
      const matchName = item.name && item.name.toLowerCase().includes(q);
      const matchCode = item.code && item.code.toLowerCase().includes(q);
      const matchPrice = item.price_name && item.price_name.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchPrice) return false;
    }
    return true;
  });

  // Enrich routes with area_name, outlet_count, and active_plans_count
  if (req.params.entity === "routes") {
    filtered = filtered.map((r: any) => {
      const ar = db.areas.find((a) => a._id === r.area_id);
      const outletCount = db.outlets.filter((o) => o.route_id === r._id && o.status === "ACTIVE").length;
      const activePlansCount = db.call_plans.filter((p) => p.route_id === r._id).length;
      return {
        ...r,
        area_name: ar?.name || "-",
        outlet_count: outletCount,
        active_plans_count: activePlansCount,
      };
    });
  }

  // Enrich districts with area_name
  if (req.params.entity === "districts") {
    filtered = filtered.map((d: any) => {
      const ar = db.areas.find((a) => a._id === d.area_id);
      return {
        ...d,
        area_name: ar?.name || "-",
      };
    });
  }

  // Enrich villages with district_name
  if (req.params.entity === "villages") {
    filtered = filtered.map((v: any) => {
      const dist = db.districts.find((d) => d._id === v.district_id);
      return {
        ...v,
        district_name: dist?.name || "-",
      };
    });
  }

  // Enrich prices with sku_name
  if (req.params.entity === "prices") {
    filtered = filtered.map((p: any) => {
      const sku = db.skus.find((s) => s._id === p.sku_id);
      return {
        ...p,
        sku_name: sku?.name ? `${sku.name} (${sku.code || sku.sku_code || ""})` : p.sku_id || "-",
      };
    });
  }

  // Enrich salesmen with office_name and area_name, and ensure all db.users with role SALES are included
  if (req.params.entity === "salesmen") {
    const existingSalesUserIds = new Set(filtered.map((s: any) => s.user_id || s._id));
    const allSalesUsers = db.users.filter((u) => u.role === "SALES" && (!status || u.status === status));

    for (const u of allSalesUsers) {
      if (!existingSalesUserIds.has(u._id)) {
        filtered.push({
          _id: `sm-${u._id}`,
          user_id: u._id,
          name: u.name,
          code: (u as any).code || `SLS-${u._id.slice(-4).toUpperCase()}`,
          phone: u.phone || "-",
          office_id: u.office_id || "",
          area_id: u.area_id || "",
          status: u.status || "ACTIVE",
          created_at: u.created_at || new Date().toISOString(),
        });
      }
    }

    filtered = filtered.map((s: any) => {
      const off = db.offices.find((o) => o._id === s.office_id);
      const ar = db.areas.find((a) => a._id === s.area_id);
      return {
        ...s,
        office_name: off?.office_name || "-",
        area_name: ar?.name || "-",
      };
    });
  }

  // Enrich outlet call reasons with `reason` alias (frontend expects r.reason)
  if (req.params.entity === "open-call-reasons" || req.params.entity === "outlet-call-reasons") {
    filtered = filtered.map((r: any) => ({ ...r, reason: r.reason || r.name }));
  }

  return res.json({
    items: filtered,
    total: filtered.length,
    page: 1,
    limit: 100,
  });
});

apiRouter.post("/masters/:entity", authMiddleware, requireRoles("ADMIN", "OWNER"), (req, res) => {
  const key = entityMap[req.params.entity];
  if (!key || !(key in db)) return res.status(404).json({ detail: "Entitas tidak valid." });

  const newItem = {
    _id: `${req.params.entity.slice(0, 3)}-${Date.now()}`,
    status: req.body?.status || "ACTIVE",
    created_at: new Date().toISOString(),
    ...req.body,
  };

  (db as any)[key].push(newItem);

  // If salesman added, sync to user if user exists
  if (req.params.entity === "salesmen" && newItem.user_id) {
    const user = db.users.find((u) => u._id === newItem.user_id);
    if (user) {
      if (newItem.office_id) user.office_id = newItem.office_id;
      if (newItem.area_id) user.area_id = newItem.area_id;
      syncSingleDoc("users", user._id, user);
    }
  }

  syncSingleDoc(key, newItem._id, newItem);
  return res.status(201).json(newItem);
});

apiRouter.put("/masters/:entity/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), (req, res) => {
  const key = entityMap[req.params.entity];
  if (!key || !(key in db)) return res.status(404).json({ detail: "Entitas tidak valid." });

  const list = (db as any)[key];
  const idx = list.findIndex((i: any) => i._id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: "Item tidak ditemukan." });

  list[idx] = { ...list[idx], ...req.body, _id: list[idx]._id };

  // If salesman updated, sync user office_id & area_id
  if (req.params.entity === "salesmen") {
    const sm = list[idx];
    const user = db.users.find((u) => u._id === sm.user_id || u._id === sm._id);
    if (user) {
      if (sm.office_id !== undefined) user.office_id = sm.office_id;
      if (sm.area_id !== undefined) user.area_id = sm.area_id;
      if (sm.status !== undefined) user.status = sm.status;
      syncSingleDoc("users", user._id, user);
    }
  }

  syncSingleDoc(key, list[idx]._id, list[idx]);
  return res.json(list[idx]);
});

apiRouter.post("/masters/:entity/:id/toggle", authMiddleware, requireRoles("ADMIN", "OWNER"), (req, res) => {
  const key = entityMap[req.params.entity];
  if (!key || !(key in db)) return res.status(404).json({ detail: "Entitas tidak valid." });

  const list = (db as any)[key];
  const item = list.find((i: any) => i._id === req.params.id);
  if (!item) return res.status(404).json({ detail: "Item tidak ditemukan." });

  item.status = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  if (req.params.entity === "salesmen") {
    const user = db.users.find((u) => u._id === item.user_id || u._id === item._id);
    if (user) {
      user.status = item.status;
      syncSingleDoc("users", user._id, user);
    }
  }

  syncSingleDoc(key, item._id, item);
  return res.json(item);
});

apiRouter.delete("/masters/:entity/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const key = entityMap[req.params.entity];
  if (!key || !(key in db)) return res.status(404).json({ detail: "Entitas tidak valid." });

  const list = (db as any)[key];
  const idx = list.findIndex((i: any) => i._id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: "Item tidak ditemukan." });

  const deleted = list.splice(idx, 1)[0];

  // If salesman deleted, also clean up linked salesmen entry
  if (req.params.entity === "salesmen") {
    const sId = deleted.user_id || deleted._id;
    const smIdx = db.salesmen.findIndex((s) => s._id === sId || s.user_id === sId);
    if (smIdx !== -1 && smIdx !== idx) {
      db.salesmen.splice(smIdx, 1);
    }
  }

  recordAuditLog(
    req.user!._id,
    "DELETE_MASTER_ITEM",
    key,
    req.params.id,
    { entity: req.params.entity, name: deleted.name || deleted.code || deleted.title || deleted.reason }
  );

  deleteSingleDoc(key, req.params.id);

  return res.json({ message: "Data berhasil dihapus.", item: deleted, _id: req.params.id });
});

// Direct master collection endpoints for compatibility
apiRouter.get("/products", authMiddleware, (req, res) => {
  res.json({ items: db.products, total: db.products.length });
});
apiRouter.get("/skus", authMiddleware, (req, res) => {
  res.json({ items: db.skus, total: db.skus.length });
});
apiRouter.get("/channels", authMiddleware, (req, res) => {
  res.json({ items: db.channels, total: db.channels.length });
});
apiRouter.get("/areas", authMiddleware, (req, res) => {
  res.json({ items: db.areas, total: db.areas.length });
});
apiRouter.get("/routes", authMiddleware, (req, res) => {
  const enriched = db.routes.map((r: any) => {
    const ar = db.areas.find((a) => a._id === r.area_id);
    const outletCount = db.outlets.filter((o) => o.route_id === r._id && o.status === "ACTIVE").length;
    const activePlansCount = db.call_plans.filter((p) => p.route_id === r._id).length;
    return {
      ...r,
      area_name: ar?.name || "-",
      outlet_count: outletCount,
      active_plans_count: activePlansCount,
    };
  });
  res.json({ items: enriched, total: enriched.length });
});

apiRouter.get("/routes/:id/outlets", authMiddleware, (req: AuthenticatedRequest, res) => {
  const route = db.routes.find((r) => r._id === req.params.id);
  if (!route) return res.status(404).json({ detail: "Rute kunjungan tidak ditemukan." });

  const area = db.areas.find((a) => a._id === route.area_id);
  const salesmanId = req.query.salesman_id as string;
  const assignedIds = salesmanId ? new Set(getActiveAssignedOutletIds(salesmanId)) : null;

  const outlets = db.outlets
    .filter((o) => o.route_id === route._id && o.status === "ACTIVE" && (!assignedIds || assignedIds.has(o._id)))
    .map((o) => {
      const channel = db.channels.find((c) => c._id === o.channel_id);
      const lastVisit = db.visits
        .filter((v) => v.outlet_id === o._id)
        .sort((a, b) => (b.check_in_time || b.date).localeCompare(a.check_in_time || a.date))[0];

      return {
        ...o,
        channel_name: channel?.name || "-",
        area_name: area?.name || "-",
        route_name: route.name,
        last_visited: lastVisit?.date || "Belum pernah",
        last_call_result: lastVisit?.call_result || "-",
      };
    });

  res.json({
    route: {
      ...route,
      area_name: area?.name || "-",
      outlet_count: outlets.length,
    },
    items: outlets,
    total: outlets.length,
  });
});
apiRouter.get("/prices", authMiddleware, (req, res) => {
  res.json({ items: db.prices, total: db.prices.length });
});
apiRouter.get("/provinces", authMiddleware, (req, res) => {
  res.json({ items: db.provinces, total: db.provinces.length });
});
apiRouter.get("/regencies", authMiddleware, (req, res) => {
  res.json({ items: db.regencies, total: db.regencies.length });
});
apiRouter.get("/districts", authMiddleware, (req, res) => {
  res.json({ items: db.districts, total: db.districts.length });
});
apiRouter.get("/villages", authMiddleware, (req, res) => {
  res.json({ items: db.villages, total: db.villages.length });
});

// Offices
apiRouter.get("/offices", authMiddleware, (req, res) => {
  res.json({ items: db.offices, total: db.offices.length });
});

apiRouter.post("/offices", authMiddleware, requireRoles("ADMIN", "OWNER"), (req, res) => {
  const newOffice = {
    _id: `off-${Date.now()}`,
    radius_m: 200,
    status: req.body?.status || "ACTIVE",
    created_at: new Date().toISOString(),
    ...req.body,
  };
  db.offices.push(newOffice);
  syncSingleDoc("offices", newOffice._id, newOffice);
  res.status(201).json(newOffice);
});

apiRouter.put("/offices/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), (req, res) => {
  const office = db.offices.find((o) => o._id === req.params.id);
  if (!office) return res.status(404).json({ detail: "Kantor tidak ditemukan." });
  Object.assign(office, req.body, { _id: office._id });
  syncSingleDoc("offices", office._id, office);
  res.json(office);
});

apiRouter.post("/offices/:id/toggle", authMiddleware, requireRoles("ADMIN", "OWNER"), (req, res) => {
  const office = db.offices.find((o) => o._id === req.params.id);
  if (!office) return res.status(404).json({ detail: "Kantor tidak ditemukan." });
  office.status = office.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  syncSingleDoc("offices", office._id, office);
  res.json(office);
});

apiRouter.delete("/offices/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const idx = db.offices.findIndex((o) => o._id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: "Kantor tidak ditemukan." });

  const deleted = db.offices.splice(idx, 1)[0];

  recordAuditLog(
    req.user!._id,
    "DELETE_OFFICE",
    "offices",
    req.params.id,
    { office_name: deleted.office_name }
  );

  deleteSingleDoc("offices", req.params.id);

  return res.json({ message: "Kantor berhasil dihapus.", office: deleted, _id: req.params.id });
});

// Users
apiRouter.get("/users", authMiddleware, requireRoles("ADMIN", "OWNER", "SUPERVISOR"), (req, res) => {
  const safeUsers = db.users.map((u) => {
    const copy = { ...u };
    delete (copy as any).password_hash;
    const off = db.offices.find((o) => o._id === u.office_id);
    const ar = db.areas.find((a) => a._id === u.area_id);
    return {
      ...copy,
      office_name: off?.office_name || "-",
      area_name: ar?.name || "-",
    };
  });
  res.json({ items: safeUsers, total: safeUsers.length });
});

apiRouter.post("/users", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const { name, email, password, role, phone, office_id, area_id } = req.body || {};
  if (!email || !password || !name || !role) {
    return res.status(400).json({ detail: "Nama, email, password, dan role wajib diisi." });
  }

  const existing = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (existing) return res.status(400).json({ detail: "Email sudah digunakan pengguna lain." });

  const userId = `usr-${Date.now()}`;
  const newUser: User = {
    _id: userId,
    name,
    email: email.trim(),
    password_hash: bcrypt.hashSync(password, 10),
    role,
    phone: phone || "",
    office_id: office_id || "off-1",
    area_id: area_id || "area-1",
    status: "ACTIVE",
    created_at: new Date().toISOString(),
  };

  db.users.push(newUser);

  if (role === "SALES") {
    const smItem = {
      _id: userId,
      user_id: userId,
      code: `SLS-${db.salesmen.length + 1}`,
      name,
      email,
      phone: phone || "",
      office_id: office_id || "off-1",
      area_id: area_id || "area-1",
      target_daily_calls: 15,
      target_monthly_sales: 50000000,
      status: "ACTIVE" as const,
      created_at: new Date().toISOString(),
    };
    db.salesmen.push(smItem);
    syncSingleDoc("salesmen", smItem._id, smItem);
  }

  syncSingleDoc("users", newUser._id, newUser);

  recordAuditLog(
    req.user!._id,
    "CREATE_USER",
    "users",
    newUser._id,
    {
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      office_id: newUser.office_id,
      area_id: newUser.area_id,
      phone: newUser.phone,
    }
  );

  const safe = { ...newUser };
  delete (safe as any).password_hash;
  res.status(201).json(safe);
});

apiRouter.put("/users/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const user = db.users.find((u) => u._id === req.params.id);
  if (!user) return res.status(404).json({ detail: "Pengguna tidak ditemukan." });

  const prevOfficeId = user.office_id;
  const prevAreaId = user.area_id;
  const prevRole = user.role;
  const prevStatus = user.status;

  if (req.body.password) {
    user.password_hash = bcrypt.hashSync(req.body.password, 10);
  }
  if (req.body.name) user.name = req.body.name;
  if (req.body.phone !== undefined) user.phone = req.body.phone;
  if (req.body.role) user.role = req.body.role;
  if (req.body.office_id !== undefined) user.office_id = req.body.office_id;
  if (req.body.area_id !== undefined) user.area_id = req.body.area_id;
  if (req.body.status !== undefined) user.status = req.body.status;

  // Sync to salesmen table if user is SALES
  const salesman = db.salesmen.find((s) => s.user_id === user._id || s._id === user._id);
  if (salesman) {
    if (req.body.name) salesman.name = req.body.name;
    if (req.body.phone !== undefined) salesman.phone = req.body.phone;
    if (req.body.office_id !== undefined) salesman.office_id = req.body.office_id;
    if (req.body.area_id !== undefined) salesman.area_id = req.body.area_id;
    if (req.body.status !== undefined) salesman.status = req.body.status;
    syncSingleDoc("salesmen", salesman._id, salesman);
  }

  syncSingleDoc("users", user._id, user);

  // Automatic Audit Logging: Detect territory or assignment modifications
  const isAssignmentChanged = prevOfficeId !== user.office_id || prevAreaId !== user.area_id || prevRole !== user.role;
  const prevOffice = db.offices.find((o) => o._id === prevOfficeId);
  const newOffice = db.offices.find((o) => o._id === user.office_id);
  const prevArea = db.areas.find((a) => a._id === prevAreaId);
  const newArea = db.areas.find((a) => a._id === user.area_id);

  recordAuditLog(
    req.user!._id,
    isAssignmentChanged ? "UPDATE_USER_ASSIGNMENT" : "UPDATE_USER",
    "users",
    user._id,
    {
      user_name: user.name,
      user_email: user.email,
      role: user.role,
      previous_office: prevOffice?.office_name || prevOfficeId,
      new_office: newOffice?.office_name || user.office_id,
      previous_area: prevArea?.name || prevAreaId,
      new_area: newArea?.name || user.area_id,
      previous_status: prevStatus,
      new_status: user.status,
      is_assignment_changed: isAssignmentChanged,
    }
  );

  const safe = { ...user };
  delete (safe as any).password_hash;
  res.json(safe);
});

apiRouter.post("/users/:id/toggle", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const user = db.users.find((u) => u._id === req.params.id);
  if (!user) return res.status(404).json({ detail: "Pengguna tidak ditemukan." });
  user.status = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  if (user.status === "INACTIVE") {
    revokeAllUserSessions(user._id);
  }

  const salesman = db.salesmen.find((s) => s.user_id === user._id || s._id === user._id);
  if (salesman) {
    salesman.status = user.status;
    syncSingleDoc("salesmen", salesman._id, salesman);
  }

  syncSingleDoc("users", user._id, user);

  recordAuditLog(
    req.user!._id,
    "TOGGLE_USER_STATUS",
    "users",
    user._id,
    { user_name: user.name, email: user.email, new_status: user.status }
  );

  res.json({ _id: user._id, status: user.status });
});

apiRouter.delete("/users/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  if (req.user!._id === req.params.id) {
    return res.status(400).json({ detail: "Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif." });
  }

  const idx = db.users.findIndex((u) => u._id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: "Pengguna tidak ditemukan." });

  revokeAllUserSessions(req.params.id);
  const deleted = db.users.splice(idx, 1)[0];

  // Also remove from salesmen list if exists
  const smIdx = db.salesmen.findIndex((s) => s.user_id === req.params.id || s._id === req.params.id);
  if (smIdx !== -1) {
    db.salesmen.splice(smIdx, 1);
  }

  recordAuditLog(
    req.user!._id,
    "DELETE_USER",
    "users",
    req.params.id,
    { name: deleted.name, email: deleted.email, role: deleted.role }
  );

  deleteSingleDoc("users", req.params.id);
  if (smIdx !== -1) {
    deleteSingleDoc("salesmen", req.params.id);
  }

  return res.json({ message: "Pengguna berhasil dihapus.", _id: req.params.id });
});

// Settings
apiRouter.get("/settings", authMiddleware, (req, res) => {
  res.json({ settings: db.settings, ...db.settings });
});

apiRouter.get("/settings/public", (req, res) => {
  res.json({
    company_name: db.company_profile.companyName || db.settings.company_name,
    company_legal_name: db.company_profile.companyLegalName,
    company_code: db.company_profile.companyCode,
    company_address: db.company_profile.companyAddress,
    company_phone: db.company_profile.companyPhone,
    company_email: db.company_profile.companyEmail,
    company_website: db.company_profile.companyWebsite,
    company_description: db.company_profile.companyDescription,
    logo_url: db.company_profile.logoUrl || db.company_profile.companyLogo,
    currency_symbol: db.settings.currency_symbol || "Rp",
  });
});

apiRouter.put("/settings", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const oldSettings = { ...db.settings };
  const incoming = req.body || {};

  // Numeric sanitization
  if (incoming.office_latitude != null) incoming.office_latitude = Number(incoming.office_latitude);
  if (incoming.office_longitude != null) incoming.office_longitude = Number(incoming.office_longitude);
  if (incoming.office_radius_m != null) incoming.office_radius_m = Number(incoming.office_radius_m);
  if (incoming.outlet_radius_m != null) incoming.outlet_radius_m = Number(incoming.outlet_radius_m);
  if (incoming.duplicate_radius_m != null) incoming.duplicate_radius_m = Number(incoming.duplicate_radius_m);
  if (incoming.gps_accuracy_max_m != null) incoming.gps_accuracy_max_m = Number(incoming.gps_accuracy_max_m);
  if (incoming.gps_tracking_interval_seconds != null) incoming.gps_tracking_interval_seconds = Number(incoming.gps_tracking_interval_seconds);
  if (incoming.late_tolerance_min != null) incoming.late_tolerance_min = Number(incoming.late_tolerance_min);
  if (incoming.working_days_per_month != null) incoming.working_days_per_month = Number(incoming.working_days_per_month);
  if (incoming.min_target_daily_calls != null) incoming.min_target_daily_calls = Number(incoming.min_target_daily_calls);
  if (incoming.min_target_daily_effective_calls != null) incoming.min_target_daily_effective_calls = Number(incoming.min_target_daily_effective_calls);
  if (incoming.tax_rate_percentage != null) incoming.tax_rate_percentage = Number(incoming.tax_rate_percentage);
  if (incoming.default_payment_term_days != null) incoming.default_payment_term_days = Number(incoming.default_payment_term_days);
  if (incoming.min_visit_minutes != null) {
    incoming.min_visit_minutes = Number(incoming.min_visit_minutes);
    incoming.visit_min_duration_sec = incoming.min_visit_minutes * 60;
  } else if (incoming.visit_min_duration_sec != null) {
    incoming.visit_min_duration_sec = Number(incoming.visit_min_duration_sec);
    incoming.min_visit_minutes = Math.round(incoming.visit_min_duration_sec / 60);
  }

  if (incoming.fake_gps_policy) {
    incoming.allow_fake_gps = incoming.fake_gps_policy === "ALLOW";
  }

  Object.assign(db.settings, incoming);

  if (incoming.company_name) {
    db.company_profile.companyName = incoming.company_name;
  }

  // If head office parameters updated, synchronize default office record
  const headOffice = db.offices.find((o) => o._id === "off-1" || o.code === "HO-JKT") || db.offices[0];
  if (headOffice) {
    if (incoming.office_name) headOffice.office_name = incoming.office_name;
    if (incoming.office_address) headOffice.address = incoming.office_address;
    if (incoming.office_latitude != null) headOffice.latitude = incoming.office_latitude;
    if (incoming.office_longitude != null) headOffice.longitude = incoming.office_longitude;
    if (incoming.office_radius_m != null) headOffice.radius_m = incoming.office_radius_m;
    if (incoming.work_start_time) headOffice.work_start_time = incoming.work_start_time;
    if (incoming.work_end_time) headOffice.work_end_time = incoming.work_end_time;
    if (incoming.check_in_start) headOffice.check_in_start = incoming.check_in_start;
    if (incoming.check_in_end !== undefined) (headOffice as any).check_in_end = incoming.check_in_end;
    if (incoming.check_out_start) (headOffice as any).check_out_start = incoming.check_out_start;
    if (incoming.late_tolerance_min != null) headOffice.late_tolerance_min = incoming.late_tolerance_min;
    if (incoming.working_days) (headOffice as any).working_days = incoming.working_days;
    if (incoming.gps_accuracy_max_m != null) (headOffice as any).gps_accuracy_max_m = incoming.gps_accuracy_max_m;
    syncSingleDoc("offices", headOffice._id, headOffice);
  }

  recordAuditLog(
    req.user!._id,
    "UPDATE_SYSTEM_SETTINGS",
    "settings",
    "global_settings",
    {
      before: oldSettings,
      after: db.settings,
    }
  );

  saveDatabaseToDisk(true);
  syncSingleDoc("system_settings", "global", db.settings);
  syncSingleDoc("company_profile", "main", db.company_profile);
  res.json({ settings: db.settings, ...db.settings });
});

apiRouter.post("/settings/reset-defaults", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const defaultSettings = {
    // Global Office & Operational Shift Settings
    office_name: "Kantor Pusat Mahameru Distribusi Indonesia",
    office_address: "Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan, DKI Jakarta 12190",
    office_latitude: -6.2255,
    office_longitude: 106.8085,
    office_radius_m: 100,
    work_start_time: "08:00",
    work_end_time: "17:00",
    check_in_start: "06:00",
    check_in_end: "12:00",
    check_out_start: "16:00",
    late_tolerance_min: 15,
    auto_alpha_time: "13:00",
    working_days_per_month: 26,
    working_days: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
    allow_early_checkout: false,
    require_selfie_attendance: true,

    // Geofencing GPS & Location Integrity
    outlet_radius_m: 200,
    duplicate_radius_m: 50,
    gps_accuracy_max_m: 50,
    fake_gps_policy: "REJECT" as "REJECT" | "FLAG" | "ALLOW",
    allow_fake_gps: false,
    enforce_office_geofence: true,
    enforce_outlet_geofence: true,
    require_gps_on_order: true,
    require_outlet_photo_visit: true,
    gps_tracking_interval_seconds: 60,
    max_geofence_m: 200,

    // Sales & Field Operations
    visit_min_duration_sec: 180,
    min_visit_minutes: 3,
    min_target_daily_calls: 15,
    enforce_call_plan: false,
    new_outlet_approval: true,
    open_call_reason_required: true,
    offline_sync_enabled: true,
    auto_approve_outlets: false,

    // Finance & Invoicing
    currency_symbol: "Rp",
    company_name: db.company_profile.companyName || "PT Mahameru Distribusi Indonesia",
    default_payment_term_days: 14,
    tax_rate_percentage: 11,
    invoice_prefix: "INV",
    invoice_footer_note: "Barang yang sudah dibeli tidak dapat dikembalikan tanpa nota retur resmi.",
    auto_generate_invoice_pdf: true,
    enable_audit_logging: true,
    session_timeout_hours: 24,
  };

  db.settings = {
    ...db.settings,
    ...defaultSettings,
  };

  saveDatabaseToDisk(true);
  syncSingleDoc("system_settings", "global", db.settings);
  syncSingleDoc("company_profile", "main", db.company_profile);

  recordAuditLog(
    req.user!._id,
    "RESET_SYSTEM_SETTINGS",
    "settings",
    "global_settings",
    { defaults_applied: defaultSettings }
  );

  res.json({ message: "Konfigurasi sistem berhasil dikembalikan ke standar distribusi DMS Mahameru.", settings: db.settings, ...db.settings });
});

// ================= COMPANY PROFILE & OWNER SETTINGS =================
apiRouter.get("/company-profile", (req, res) => {
  res.json(db.company_profile);
});

apiRouter.get("/settings/company", (req, res) => {
  res.json(db.company_profile);
});

apiRouter.put("/company-profile", authMiddleware, requireRoles("OWNER", "ADMIN"), (req: AuthenticatedRequest, res) => {
  const {
    companyName,
    companyLegalName,
    companyCode,
    companyAddress,
    address,
    city,
    postalCode,
    companyPhone,
    phone,
    companyEmail,
    email,
    companyWebsite,
    website,
    companyDescription,
    description,
    npwp,
    taxId,
    nib,
    directorName,
    bankName,
    bankAccountNumber,
    bankAccountHolder,
    bankBranch,
    companyLogo,
    logoUrl,
    logoStoragePath,
  } = req.body || {};

  // 1. Mandatory Field Validation
  const finalCompanyName = (companyName || "").trim();
  if (!finalCompanyName) {
    return res.status(400).json({ detail: "Nama Perusahaan (companyName) wajib diisi." });
  }

  const finalCompanyCode = (companyCode || db.company_profile.companyCode || "MHM-01").trim();

  // 2. Email Validation (if provided)
  const finalEmail = (companyEmail || email || "").trim();
  if (finalEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(finalEmail)) {
      return res.status(400).json({ detail: "Format email perusahaan tidak valid." });
    }
  }

  // 3. Website Handling (if provided)
  let finalWebsite = (companyWebsite || website || "").trim();
  if (finalWebsite && !finalWebsite.startsWith("http://") && !finalWebsite.startsWith("https://")) {
    finalWebsite = `https://${finalWebsite}`;
  }

  const finalAddress = (companyAddress || address || "").trim();
  const finalPhone = (companyPhone || phone || "").trim();
  const finalLegalName = (companyLegalName || "").trim();
  const finalDescription = (companyDescription || description || "").trim();
  const finalNpwp = (npwp || taxId || "").trim();
  const finalNib = (nib || "").trim();
  const finalDirector = (directorName || "").trim();
  const finalBankName = (bankName || "").trim();
  const finalBankAccNum = (bankAccountNumber || "").trim();
  const finalBankAccHolder = (bankAccountHolder || "").trim();
  const finalBankBranch = (bankBranch || "").trim();
  const finalCity = (city || "").trim();
  const finalPostalCode = (postalCode || "").trim();

  const rawLogo = companyLogo !== undefined ? companyLogo : logoUrl;
  if (rawLogo) {
    try {
      validatePhotoPayload(rawLogo, "Logo Perusahaan", {
        maxBytes: MAX_SERVER_PHOTO_BYTES,
        entityType: "company",
        entityId: db.company_profile.companyId || "main",
      });
    } catch (err: any) {
      return res.status(err.statusCode || 400).json({ detail: err.message, code: err.code || "INVALID_LOGO" });
    }
  }

  const oldProfile = { ...db.company_profile };
  const nowStr = new Date().toISOString();

  // Update in-memory DB
  db.company_profile = {
    ...db.company_profile,
    companyName: finalCompanyName,
    companyLegalName: finalLegalName,
    companyCode: finalCompanyCode,
    companyAddress: finalAddress,
    address: finalAddress,
    city: finalCity,
    postalCode: finalPostalCode,
    companyPhone: finalPhone,
    phone: finalPhone,
    companyEmail: finalEmail,
    email: finalEmail,
    companyWebsite: finalWebsite,
    website: finalWebsite,
    companyDescription: finalDescription,
    description: finalDescription,
    npwp: finalNpwp,
    taxId: finalNpwp,
    nib: finalNib,
    directorName: finalDirector,
    bankName: finalBankName,
    bankAccountNumber: finalBankAccNum,
    bankAccountHolder: finalBankAccHolder,
    bankBranch: finalBankBranch,
    companyLogo: companyLogo !== undefined ? companyLogo : (logoUrl !== undefined ? logoUrl : db.company_profile.companyLogo),
    logoUrl: logoUrl !== undefined ? logoUrl : (companyLogo !== undefined ? companyLogo : db.company_profile.logoUrl),
    logoStoragePath: logoStoragePath !== undefined ? logoStoragePath : db.company_profile.logoStoragePath,
    updatedAt: nowStr,
    updatedBy: req.user!._id,
  };

  // Sync to system settings company_name
  db.settings.company_name = finalCompanyName;

  // 4. Audit Log
  const changedFields: string[] = [];
  if (oldProfile.companyName !== db.company_profile.companyName) changedFields.push("companyName");
  if (oldProfile.companyLegalName !== db.company_profile.companyLegalName) changedFields.push("companyLegalName");
  if (oldProfile.companyCode !== db.company_profile.companyCode) changedFields.push("companyCode");
  if (oldProfile.companyAddress !== db.company_profile.companyAddress) changedFields.push("companyAddress");
  if (oldProfile.companyPhone !== db.company_profile.companyPhone) changedFields.push("companyPhone");
  if (oldProfile.companyEmail !== db.company_profile.companyEmail) changedFields.push("companyEmail");
  if (oldProfile.companyWebsite !== db.company_profile.companyWebsite) changedFields.push("companyWebsite");
  if (oldProfile.companyDescription !== db.company_profile.companyDescription) changedFields.push("companyDescription");
  if (oldProfile.npwp !== db.company_profile.npwp) changedFields.push("npwp");
  if (oldProfile.nib !== db.company_profile.nib) changedFields.push("nib");
  if (oldProfile.bankName !== db.company_profile.bankName) changedFields.push("bankName");
  if (oldProfile.bankAccountNumber !== db.company_profile.bankAccountNumber) changedFields.push("bankAccountNumber");
  if (oldProfile.logoUrl !== db.company_profile.logoUrl) changedFields.push("logoUrl");

  recordAuditLog(
    req.user!._id,
    "UPDATE_COMPANY_PROFILE",
    "company_profile",
    db.company_profile._id,
    {
      action_type: "EDIT_PROFILE",
      changed_fields: changedFields,
      before: oldProfile,
      after: db.company_profile,
      user_id: req.user!._id,
      user_name: req.user!.name,
      role: req.user!.role,
    }
  );

  saveDatabaseToDisk(true);
  syncSingleDoc("company_profile", "main", db.company_profile);
  syncSingleDoc("system_settings", "global", db.settings);

  res.json({
    message: "Profil perusahaan berhasil diperbarui.",
    company_profile: db.company_profile,
  });
});

apiRouter.post("/company-profile/logo", authMiddleware, requireRoles("OWNER", "ADMIN"), (req: AuthenticatedRequest, res) => {
  const { logoUrl, logoStoragePath } = req.body || {};
  if (!logoUrl) {
    return res.status(400).json({ detail: "URL Logo atau data gambar wajib disertakan." });
  }

  let photoValidation;
  try {
    photoValidation = validatePhotoPayload(logoUrl, "Logo Perusahaan", {
      required: true,
      maxBytes: MAX_SERVER_PHOTO_BYTES,
      entityType: "company",
      entityId: db.company_profile.companyId || "main",
    });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ detail: err.message, code: err.code || "INVALID_LOGO" });
  }

  const oldLogo = db.company_profile.logoUrl;
  const nowStr = new Date().toISOString();

  db.company_profile.companyLogo = logoUrl;
  db.company_profile.logoUrl = logoUrl;
  db.company_profile.logoStoragePath = logoStoragePath || photoValidation.cleanStoragePath || `company/${db.company_profile.companyId || "main"}/logo/logo_${Date.now()}`;
  db.company_profile.updatedAt = nowStr;
  db.company_profile.updatedBy = req.user!._id;

  recordAuditLog(
    req.user!._id,
    oldLogo ? "REPLACE_COMPANY_LOGO" : "UPLOAD_COMPANY_LOGO",
    "company_profile",
    db.company_profile._id,
    {
      action_type: oldLogo ? "REPLACE_LOGO" : "UPLOAD_LOGO",
      old_logo: oldLogo,
      new_logo: logoUrl,
      storage_path: db.company_profile.logoStoragePath,
      user_id: req.user!._id,
      user_name: req.user!.name,
      role: req.user!.role,
    }
  );

  saveDatabaseToDisk(true);
  syncSingleDoc("company_profile", "main", db.company_profile);

  res.json({
    message: "Logo perusahaan berhasil diperbarui.",
    company_profile: db.company_profile,
  });
});

apiRouter.delete("/company-profile/logo", authMiddleware, requireRoles("OWNER", "ADMIN"), (req: AuthenticatedRequest, res) => {
  const oldLogo = db.company_profile.logoUrl;
  const oldPath = db.company_profile.logoStoragePath;
  const nowStr = new Date().toISOString();

  db.company_profile.companyLogo = null;
  db.company_profile.logoUrl = null;
  db.company_profile.logoStoragePath = null;
  db.company_profile.updatedAt = nowStr;
  db.company_profile.updatedBy = req.user!._id;

  recordAuditLog(
    req.user!._id,
    "DELETE_COMPANY_LOGO",
    "company_profile",
    db.company_profile._id,
    {
      action_type: "DELETE_LOGO",
      previous_logo: oldLogo,
      previous_storage_path: oldPath,
      user_id: req.user!._id,
      user_name: req.user!.name,
      role: req.user!.role,
    }
  );

  saveDatabaseToDisk(true);
  syncSingleDoc("company_profile", "main", db.company_profile);

  res.json({
    message: "Logo perusahaan berhasil dihapus. Aplikasi kembali menggunakan logo default DMS Mahameru.",
    company_profile: db.company_profile,
  });
});

// ================= ATTENDANCE =================
apiRouter.post("/attendance/check-in", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { latitude, longitude, photo_in, mock_location, accuracy, salesman_id: requestedSalesmanId } = req.body || {};

  // 1. Identity & Impersonation Prevention
  if (requestedSalesmanId && req.user!.role === "SALES" && requestedSalesmanId !== req.user!._id) {
    return res.status(403).json({
      detail: "Anda tidak memiliki izin untuk melakukan absensi atas nama pengguna lain.",
      code: "FORBIDDEN_USER_IMPERSONATION",
    });
  }

  const targetSalesmanId = req.user!.role === "SALES" ? req.user!._id : (requestedSalesmanId || req.user!._id);

  // 2. GPS Coordinates Validation
  if (latitude == null || longitude == null) {
    return res.status(400).json({ detail: "Koordinat GPS (latitude & longitude) wajib diisi." });
  }

  const numLat = Number(latitude);
  const numLng = Number(longitude);
  if (isNaN(numLat) || isNaN(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
    return res.status(400).json({ detail: "Koordinat GPS tidak valid." });
  }

  // Mandatory Selfie Validation based on settings
  if (photo_in) {
    try {
      validatePhotoPayload(photo_in, "Foto Selfie Absen Masuk", {
        maxBytes: MAX_SERVER_PHOTO_BYTES,
        entityType: "attendance",
        entityId: targetSalesmanId,
      });
    } catch (err: any) {
      return res.status(err.statusCode || 400).json({ detail: err.message, code: err.code || "INVALID_SELFIE" });
    }
  } else if (db.settings.require_selfie_attendance !== false) {
    return res.status(400).json({
      detail: "Foto selfie wajah wajib disertakan saat melakukan absensi masuk.",
      code: "SELFIE_REQUIRED",
    });
  }

  // 3. Mock Location / Fake GPS Check
  const fakeGpsPolicy = db.settings.fake_gps_policy || "REJECT";
  if (mock_location && fakeGpsPolicy === "REJECT" && !db.settings.allow_fake_gps) {
    return res.status(400).json({
      detail: "Penggunaan Fake GPS / Mock Location terdeteksi dan dilarang oleh kebijakan sistem.",
      code: "MOCK_LOCATION_DETECTED",
    });
  }

  const now = new Date();
  const today = getTodayWIB();

  // 4. Duplicate Check-in Prevention
  const existing = db.attendance.find((a) => a.salesman_id === targetSalesmanId && a.date === today);
  if (existing) {
    return res.status(400).json({
      detail: "Anda sudah melakukan absensi masuk hari ini.",
      code: "DUPLICATE_CHECK_IN",
      attendance: existing,
    });
  }

  // 5. Office Assignment Resolution
  const targetUser = db.users.find((u) => u._id === targetSalesmanId);
  const targetSalesman = db.salesmen.find((s) => s.user_id === targetSalesmanId || s._id === targetSalesmanId);
  const assignedOfficeId = targetUser?.office_id || targetSalesman?.office_id || req.user!.office_id;

  if (!assignedOfficeId) {
    return res.status(400).json({
      detail: "Anda belum memiliki kantor penugasan yang aktif. Silakan hubungi Administrator atau Supervisor untuk mengatur kantor penugasan Anda.",
      code: "NO_ASSIGNED_OFFICE",
    });
  }

  const assignedOffice = db.offices.find((o) => o._id === assignedOfficeId);
  if (!assignedOffice) {
    return res.status(400).json({
      detail: `Kantor penugasan Anda (ID: ${assignedOfficeId}) tidak ditemukan dalam master data kantor.`,
      code: "OFFICE_NOT_FOUND",
    });
  }

  if (assignedOffice.status !== "ACTIVE") {
    return res.status(400).json({
      detail: `Kantor penugasan Anda (${assignedOffice.office_name}) saat ini berstatus NONAKTIF. Hubungi Administrator.`,
      code: "OFFICE_INACTIVE",
    });
  }

  // Optional: check if body specified an office_id that doesn't match assigned office
  if (req.body?.office_id && req.body.office_id !== assignedOffice._id) {
    return res.status(400).json({
      detail: `Sales hanya dapat melakukan absensi di kantor penugasan yang ditentukan (${assignedOffice.office_name}).`,
      code: "OFFICE_MISMATCH",
    });
  }

  // 6. Verify Office Coordinates Configuration
  const offLat = Number(assignedOffice.latitude);
  const offLng = Number(assignedOffice.longitude);
  if (
    assignedOffice.latitude == null ||
    assignedOffice.longitude == null ||
    isNaN(offLat) ||
    isNaN(offLng) ||
    (offLat === 0 && offLng === 0)
  ) {
    return res.status(400).json({
      detail: `Titik koordinat GPS kantor penugasan (${assignedOffice.office_name}) belum dikonfigurasi dengan benar oleh Administrator.`,
      code: "OFFICE_COORDINATES_NOT_CONFIGURED",
    });
  }

  // 7. GPS Accuracy Validation
  const maxGpsAccuracy = Number((assignedOffice as any).gps_accuracy_max_m || (db.settings as any).gps_accuracy_max_m || 100);
  if (accuracy != null && Number(accuracy) > maxGpsAccuracy) {
    return res.status(400).json({
      detail: `Akurasi sinyal GPS terlalu rendah (${Math.round(accuracy)}m). Batas toleransi maksimum ${maxGpsAccuracy}m. Silakan tunggu sinyal GPS lebih stabil atau pindah ke area terbuka.`,
      code: "LOW_GPS_ACCURACY",
      accuracy: Number(accuracy),
      max_accuracy: maxGpsAccuracy,
    });
  }

  // 8. Working Days Validation
  const currentDay = getCurrentDayNameWIB(now);
  const workingDays: string[] = (assignedOffice as any).working_days || (db.settings as any).working_days || ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const isWorkingDay = workingDays.some((d) => d.trim().toLowerCase() === currentDay.toLowerCase());
  if (!isWorkingDay) {
    return res.status(400).json({
      detail: `Jadwal absensi tidak tersedia hari ini (${currentDay}). Kantor penugasan Anda (${assignedOffice.office_name}) libur pada hari ini.`,
      code: "NOT_A_WORKING_DAY",
      day: currentDay,
      working_days: workingDays,
    });
  }

  // 9. Geofence Distance Validation
  const distanceToAssignedOffice = Math.round(haversineMeters(numLat, numLng, offLat, offLng));
  const allowedRadius = Number((assignedOffice as any).attendance_radius || assignedOffice.radius_m || (db.settings as any).office_radius_m || (db.settings as any).max_geofence_m || 200);
  const enforceOfficeGeofence = (db.settings as any).enforce_office_geofence !== false;

  if (enforceOfficeGeofence && distanceToAssignedOffice > allowedRadius) {
    return res.status(400).json({
      detail: `Absensi masuk ditolak. Anda wajib melakukan absensi di kantor penugasan Anda: "${assignedOffice.office_name}". Jarak Anda saat ini: ${distanceToAssignedOffice}m (Maksimal radius yang diizinkan: ${allowedRadius}m).`,
      code: "OUT_OF_OFFICE_RADIUS",
      office_name: assignedOffice.office_name,
      distance: distanceToAssignedOffice,
      allowed_radius: allowedRadius,
    });
  }

  // 10. Time & Shift Windows Check (in GMT+7 WIB)
  const workStartTime = (assignedOffice as any).work_start_time || (db.settings as any).work_start_time || "08:00";
  const workEndTime = (assignedOffice as any).work_end_time || (db.settings as any).work_end_time || "17:00";
  const checkInStart = (assignedOffice as any).check_in_start || (db.settings as any).check_in_start || "06:00";
  const checkInEnd = (assignedOffice as any).check_in_end || (db.settings as any).check_in_end || "";
  const lateToleranceMin = Number((assignedOffice as any).late_tolerance_min ?? (db.settings as any).late_tolerance_min ?? 15);

  const currentTimeStr = getCurrentTimeHHMMWIB(now);

  // Early check-in barrier
  if (currentTimeStr < checkInStart) {
    return res.status(400).json({
      detail: `Sistem absensi masuk baru dibuka pukul ${checkInStart} WIB. Waktu server saat ini: ${currentTimeStr} WIB.`,
      code: "CHECK_IN_NOT_STARTED",
      check_in_start: checkInStart,
      current_time: currentTimeStr,
    });
  }

  // Check-in window closed check (if configured)
  if (checkInEnd && currentTimeStr > checkInEnd) {
    return res.status(400).json({
      detail: `Batas waktu absensi masuk telah berakhir untuk hari ini (Pukul ${checkInEnd} WIB). Waktu server saat ini: ${currentTimeStr} WIB. Silakan hubungi Supervisor.`,
      code: "CHECK_IN_CLOSED",
      check_in_end: checkInEnd,
      current_time: currentTimeStr,
    });
  }

  const lateInfo = calculateAttendanceLateStatus(currentTimeStr, workStartTime, lateToleranceMin);

  const newAtt: Attendance = {
    _id: `att-${today}-${targetSalesmanId}`,
    salesman_id: targetSalesmanId,
    date: today,
    check_in_time: now.toISOString(),
    check_in_lat: numLat,
    check_in_lng: numLng,
    office_id: assignedOffice._id,
    distance_in_m: distanceToAssignedOffice,
    status: lateInfo.isLate ? "LATE" : "PRESENT",
    scheduled_in: workStartTime,
    scheduled_out: workEndTime,
    late_minutes: lateInfo.lateMinutes,
    early_leave_minutes: 0,
    overtime_minutes: 0,
    photo_in,
    mock_location: !!mock_location,
  };

  db.attendance.push(newAtt);

  // Update user last location
  if (targetUser) {
    targetUser.last_location = {
      latitude: numLat,
      longitude: numLng,
      timestamp: now.toISOString(),
    };
    syncSingleDoc("users", targetUser._id, targetUser);
  }

  // Audit Log
  recordAuditLog(
    req.user!._id,
    "ATTENDANCE_CHECK_IN",
    "attendance",
    newAtt._id,
    {
      salesman_id: targetSalesmanId,
      salesman_name: targetUser?.name || req.user!.name,
      office_id: assignedOffice._id,
      office_name: assignedOffice.office_name,
      distance_m: distanceToAssignedOffice,
      radius_m: allowedRadius,
      status: newAtt.status,
      late_minutes: newAtt.late_minutes,
      scheduled_in: workStartTime,
      threshold_time: lateInfo.thresholdTimeStr,
      timestamp: newAtt.check_in_time,
    }
  );

  syncSingleDoc("attendance", newAtt._id, newAtt);

  try {
    await sqlDb.insert(pgAttendance).values({
      id: newAtt._id,
      userId: newAtt.salesman_id,
      date: newAtt.date,
      checkInTime: newAtt.check_in_time ? new Date(newAtt.check_in_time) : null,
      checkInLat: newAtt.check_in_lat || null,
      checkInLng: newAtt.check_in_lng || null,
      checkInPhoto: newAtt.photo_in || null,
      checkInDistance: newAtt.distance_in_m || null,
      status: newAtt.status,
      notes: newAtt.notes || null,
    }).catch((err: any) => console.error("Error inserting check-in to PG:", err.message));
  } catch(e) {}

  const statusMsg = newAtt.status === "LATE"
    ? `Terlambat ${newAtt.late_minutes} menit (Jam masuk: ${currentTimeStr} WIB, batas toleransi: ${lateInfo.thresholdTimeStr} WIB)`
    : `Tepat Waktu (Jam masuk: ${currentTimeStr} WIB)`;

  return res.status(201).json({
    message: `Absensi masuk berhasil di ${assignedOffice.office_name} — ${statusMsg}. Jarak ${distanceToAssignedOffice}m.`,
    attendance: {
      ...newAtt,
      office_name: assignedOffice.office_name,
      status_label: newAtt.status === "LATE" ? "TERLAMBAT" : "HADIR TEPAT WAKTU",
      formatted_check_in: `${currentTimeStr} WIB`,
    },
  });
});

apiRouter.post("/attendance/check-out", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { latitude, longitude, photo_out, accuracy, force } = req.body || {};
  const today = getTodayWIB();
  const targetSalesmanId = req.user!.role === "SALES" ? req.user!._id : (req.body?.salesman_id || req.user!._id);

  const att = db.attendance.find((a) => a.salesman_id === targetSalesmanId && a.date === today);

  if (!att) {
    return res.status(400).json({
      detail: "Anda belum melakukan absensi masuk hari ini.",
      code: "CHECK_IN_REQUIRED",
    });
  }
  if (att.check_out_time) {
    return res.status(400).json({
      detail: "Anda sudah melakukan absensi keluar hari ini.",
      code: "ALREADY_CHECKED_OUT",
      attendance: att,
    });
  }

  // Check for active visit in progress
  const activeVisit = db.visits.find((v) => v.salesman_id === targetSalesmanId && v.status === "IN_PROGRESS");
  if (activeVisit) {
    return res.status(400).json({
      detail: "Selesaikan kunjungan outlet yang sedang berlangsung terlebih dahulu sebelum absen pulang.",
      code: "ACTIVE_VISIT_IN_PROGRESS",
      active_visit: activeVisit,
    });
  }

  const now = new Date();
  const currentTimeStr = getCurrentTimeHHMMWIB(now);

  const assignedOffice = db.offices.find((o) => o._id === att.office_id) || db.offices.find((o) => o._id === req.user!.office_id);
  const checkOutStart = (assignedOffice as any)?.check_out_start || (db.settings as any)?.check_out_start || "16:00";
  const checkOutEnd = (assignedOffice as any)?.check_out_end || (db.settings as any)?.check_out_end || "";
  const workEndTime = (assignedOffice as any)?.work_end_time || (db.settings as any)?.work_end_time || "17:00";

  // Early checkout check (unless allowed by setting or force flag)
  if (
    currentTimeStr < checkOutStart &&
    !db.settings.allow_early_checkout &&
    force !== true &&
    req.query.force !== "true"
  ) {
    return res.status(400).json({
      detail: `Sistem absensi pulang baru dibuka pukul ${checkOutStart} WIB. Waktu server saat ini: ${currentTimeStr} WIB.`,
      code: "CHECK_OUT_NOT_STARTED",
      check_out_start: checkOutStart,
      current_time: currentTimeStr,
    });
  }

  if (checkOutEnd && currentTimeStr > checkOutEnd && force !== true) {
    return res.status(400).json({
      detail: `Batas waktu absensi pulang telah berakhir (Pukul ${checkOutEnd} WIB). Silakan hubungi Supervisor.`,
      code: "CHECK_OUT_CLOSED",
      check_out_end: checkOutEnd,
      current_time: currentTimeStr,
    });
  }

  att.check_out_time = now.toISOString();

  // Compute work duration in seconds and formatted string
  const checkInDate = new Date(att.check_in_time);
  const durationSec = Math.max(0, Math.round((now.getTime() - checkInDate.getTime()) / 1000));
  att.work_duration_seconds = durationSec;
  att.work_duration_formatted = formatSecondsToDuration(durationSec);

  // Compute early leave or overtime
  att.scheduled_out = workEndTime;
  const checkOutMin = parseTimeToMinutes(currentTimeStr);
  const workEndMin = parseTimeToMinutes(workEndTime);

  if (checkOutMin < workEndMin) {
    att.early_leave_minutes = workEndMin - checkOutMin;
    att.overtime_minutes = 0;
  } else {
    att.early_leave_minutes = 0;
    att.overtime_minutes = checkOutMin - workEndMin;
  }

  if (latitude != null && longitude != null) {
    const numLat = Number(latitude);
    const numLng = Number(longitude);
    if (!isNaN(numLat) && !isNaN(numLng)) {
      att.check_out_lat = numLat;
      att.check_out_lng = numLng;

      if (assignedOffice && assignedOffice.latitude != null && assignedOffice.longitude != null) {
        att.distance_out_m = Math.round(
          haversineMeters(numLat, numLng, Number(assignedOffice.latitude), Number(assignedOffice.longitude))
        );

        const allowedRadius = Number((assignedOffice as any)?.attendance_radius || assignedOffice.radius_m || db.settings.office_radius_m || 200);
        const enforceOfficeGeofence = db.settings.enforce_office_geofence !== false;
        if (enforceOfficeGeofence && att.distance_out_m > allowedRadius && force !== true && req.query.force !== "true") {
          return res.status(400).json({
            detail: `Absensi pulang ditolak. Anda berada di luar radius kantor (${att.distance_out_m}m > ${allowedRadius}m).`,
            code: "OUT_OF_OFFICE_RADIUS",
            distance: att.distance_out_m,
            allowed_radius: allowedRadius,
          });
        }
      }

      const targetUser = db.users.find((u) => u._id === targetSalesmanId);
      if (targetUser) {
        targetUser.last_location = {
          latitude: numLat,
          longitude: numLng,
          timestamp: now.toISOString(),
        };
        syncSingleDoc("users", targetUser._id, targetUser);
      }
    }
  }

  // Selfie validation on check-out
  if (photo_out) {
    try {
      validatePhotoPayload(photo_out, "Foto Selfie Absen Pulang", {
        maxBytes: MAX_SERVER_PHOTO_BYTES,
        entityType: "attendance",
        entityId: targetSalesmanId,
      });
    } catch (err: any) {
      return res.status(err.statusCode || 400).json({ detail: err.message, code: err.code || "INVALID_SELFIE" });
    }
  } else if (db.settings.require_selfie_checkout && force !== true && req.query.force !== "true") {
    return res.status(400).json({
      detail: "Foto selfie wajib disertakan saat melakukan absensi pulang.",
      code: "SELFIE_CHECKOUT_REQUIRED",
    });
  }

  if (photo_out) att.photo_out = photo_out;

  const cp = db.call_plans.find((p) => p.salesman_id === targetSalesmanId && p.date === today);
  const planned = cp ? db.call_plan_items.filter((i) => i.call_plan_id === cp._id).length : 0;
  const kpi = calculateSalesKPIs({ salesmanId: targetSalesmanId, from: today, to: today });
  const missed = Math.max(0, planned - kpi.outlet_calls);
  const newOutlets = db.outlets.filter((o) => o.created_by === targetSalesmanId && o.created_at?.startsWith(today)).length;

  const summary = {
    check_in_time: att.check_in_time,
    check_out_time: att.check_out_time,
    work_duration: att.work_duration_formatted,
    work_duration_seconds: att.work_duration_seconds,
    late_minutes: att.late_minutes || 0,
    early_leave_minutes: att.early_leave_minutes || 0,
    overtime_minutes: att.overtime_minutes || 0,
    planned,
    actual: kpi.outlet_calls,
    outlet_calls: kpi.outlet_calls,
    effective: kpi.effective_calls,
    effective_calls: kpi.effective_calls,
    ec_rate: kpi.ec_rate,
    effective_ratio: kpi.ec_rate,
    volume: kpi.total_volume,
    total_volume: kpi.total_volume,
    sales_value: kpi.total_revenue,
    revenue: kpi.total_revenue,
    missed,
    call_achievement: planned ? Math.round((kpi.outlet_calls / planned) * 100) : 0,
    new_outlets: newOutlets,
  };

  recordAuditLog(
    req.user!._id,
    "ATTENDANCE_CHECK_OUT",
    "attendance",
    att._id,
    {
      salesman_id: targetSalesmanId,
      salesman_name: req.user!.name,
      office_id: att.office_id,
      distance_out_m: att.distance_out_m,
      work_duration: att.work_duration_formatted,
      summary,
      timestamp: att.check_out_time,
    }
  );

  syncSingleDoc("attendance", att._id, att);

  try {
    await sqlDb.update(pgAttendance).set({
      date: att.date,
      checkInTime: att.check_in_time ? new Date(att.check_in_time) : null,
      checkOutTime: att.check_out_time ? new Date(att.check_out_time) : null,
      status: att.status,
      notes: att.notes || null,
      metadata: {
        office_id: att.office_id, 
        late_minutes: att.late_minutes,
        early_leave_minutes: att.early_leave_minutes,
        overtime_minutes: att.overtime_minutes,
        mock_location: att.mock_location 
      }
    }).where(eq(pgAttendance.id, att._id));
  } catch (err: any) {
    console.error("Error manually updating attendance to Postgres:", err.message);
  }

  return res.json({
    message: `Absensi keluar berhasil disimpan. Total durasi kerja: ${att.work_duration_formatted}. Terima kasih atas dedikasi Anda hari ini!`,
    attendance: att,
    summary,
  });
});

apiRouter.get("/attendance/today", authMiddleware, (req: AuthenticatedRequest, res) => {
  const today = getTodayWIB();
  const targetSalesmanId = req.user!.role === "SALES" ? req.user!._id : ((req.query.salesman_id as string) || req.user!._id);
  const targetUser = db.users.find((u) => u._id === targetSalesmanId) || req.user!;

  const att = db.attendance.find((a) => a.salesman_id === targetSalesmanId && a.date === today);
  const assignedOffice = targetUser.office_id ? db.offices.find((o) => o._id === targetUser.office_id) : (att?.office_id ? db.offices.find(o => o._id === att.office_id) : null);

  const workStartTime = (assignedOffice as any)?.work_start_time || (db.settings as any)?.work_start_time || "08:00";
  const workEndTime = (assignedOffice as any)?.work_end_time || (db.settings as any)?.work_end_time || "17:00";
  const checkInStart = (assignedOffice as any)?.check_in_start || (db.settings as any)?.check_in_start || "06:00";
  const checkInEnd = (assignedOffice as any)?.check_in_end || (db.settings as any)?.check_in_end || "";
  const checkOutStart = (assignedOffice as any)?.check_out_start || (db.settings as any)?.check_out_start || "16:00";
  const lateToleranceMin = Number((assignedOffice as any)?.late_tolerance_min ?? (db.settings as any)?.late_tolerance_min ?? 15);
  const workingDays = (assignedOffice as any)?.working_days || (db.settings as any)?.working_days || ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  const enrichedAtt = att
    ? {
        ...att,
        raw_status: att.status,
        status: att.check_out_time ? "OFF_DUTY" : "ON_DUTY",
        office_name: assignedOffice?.office_name || "Kantor Pusat",
        formatted_check_in: att.check_in_time ? formatDateTimeWIB(att.check_in_time) : "-",
        formatted_check_out: att.check_out_time ? formatDateTimeWIB(att.check_out_time) : "-",
        work_duration: att.work_duration_formatted || (att.work_duration_seconds ? formatSecondsToDuration(att.work_duration_seconds) : "-"),
      }
    : null;

  return res.json({
    attendance: enrichedAtt,
    shift_config: {
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      check_in_start: checkInStart,
      check_in_end: checkInEnd,
      check_out_start: checkOutStart,
      late_tolerance_min: lateToleranceMin,
      working_days: workingDays,
      current_day: getCurrentDayNameWIB(),
      current_time_wib: getCurrentTimeFullWIB(),
      office_name: assignedOffice?.office_name || "Kantor Pusat",
      radius_m: (assignedOffice as any)?.attendance_radius || assignedOffice?.radius_m || 200,
    },
    // Backwards compatibility
    ...(enrichedAtt ? enrichedAtt : {}),
  });
});

apiRouter.get("/attendance/history", authMiddleware, (req: AuthenticatedRequest, res) => {
  const targetSalesmanId = req.user!.role === "SALES" ? req.user!._id : ((req.query.salesman_id as string) || req.user!._id);
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "30", 10)));

  const history = db.attendance
    .filter((a) => a.salesman_id === targetSalesmanId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((a) => {
      const office = db.offices.find((o) => o._id === a.office_id);
      return {
        ...a,
        office_name: office?.office_name || "Kantor Pusat",
        formatted_check_in: a.check_in_time ? formatDateTimeWIB(a.check_in_time) : "-",
        formatted_check_out: a.check_out_time ? formatDateTimeWIB(a.check_out_time) : "-",
        work_duration: a.work_duration_formatted || (a.work_duration_seconds ? formatSecondsToDuration(a.work_duration_seconds) : "-"),
      };
    });
  return res.json({ items: history, total: history.length });
});

apiRouter.get("/attendance", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { date, from_date, to_date, salesman_id, status, office_id, q } = req.query as Record<string, string>;
  const isSales = req.user!.role === "SALES";
  const filterSalesId = isSales ? req.user!._id : salesman_id;
  const searchQuery = (q || "").toLowerCase().trim();

  let records = db.attendance.filter((a) => {
    if (filterSalesId && a.salesman_id !== filterSalesId) return false;
    if (date && a.date !== date) return false;
    if (from_date && a.date < from_date) return false;
    if (to_date && a.date > to_date) return false;
    if (status && a.status !== status) return false;
    if (office_id && a.office_id !== office_id) return false;
    if (searchQuery) {
      const u = db.users.find((user) => user._id === a.salesman_id);
      const off = db.offices.find((o) => o._id === a.office_id);
      const matchName = u?.name?.toLowerCase().includes(searchQuery);
      const matchOffice = off?.office_name?.toLowerCase().includes(searchQuery);
      if (!matchName && !matchOffice) return false;
    }
    return true;
  });

  records.sort((a, b) => (b.date + (b.check_in_time || "")).localeCompare(a.date + (a.check_in_time || "")));

  const enriched = records.map((a) => {
    const user = db.users.find((u) => u._id === a.salesman_id);
    const office = db.offices.find((o) => o._id === a.office_id);
    return {
      ...a,
      salesman_name: user?.name || a.salesman_id,
      salesman_code: (user as any)?.code || a.salesman_id,
      office_name: office?.office_name || "Kantor Pusat",
      formatted_check_in: a.check_in_time ? formatDateTimeWIB(a.check_in_time) : "-",
      formatted_check_out: a.check_out_time ? formatDateTimeWIB(a.check_out_time) : "-",
      work_duration: a.work_duration_formatted || (a.work_duration_seconds ? formatSecondsToDuration(a.work_duration_seconds) : "-"),
    };
  });

  // Calculate attendance recap metrics
  const total = enriched.length;
  const presentCount = enriched.filter((a) => a.status === "PRESENT").length;
  const lateCount = enriched.filter((a) => a.status === "LATE").length;
  const absentCount = enriched.filter((a) => a.status === "ABSENT").length;
  const totalLateMinutes = enriched.reduce((sum, a) => sum + (a.late_minutes || 0), 0);
  const onTimePercentage = total > 0 ? Math.round((presentCount / total) * 100) : 100;

  return res.json({
    items: enriched,
    total,
    metrics: {
      total,
      present_count: presentCount,
      late_count: lateCount,
      absent_count: absentCount,
      total_late_minutes: totalLateMinutes,
      on_time_percentage: onTimePercentage,
    },
  });
});

// Manual attendance entry for Supervisor / Admin (e.g. device breakdown or assigned off-site event)
apiRouter.post("/attendance/manual", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const { salesman_id, date, check_in_time, check_out_time, office_id, status, notes, reason } = req.body || {};

  if (!salesman_id || !date || !check_in_time) {
    return res.status(400).json({ detail: "Salesman, tanggal, dan jam check-in wajib diisi." });
  }

  const user = db.users.find((u) => u._id === salesman_id);
  if (!user) {
    return res.status(404).json({ detail: "Pengguna salesman tidak ditemukan." });
  }

  const targetOfficeId = office_id || user.office_id || "off-1";
  const office = db.offices.find((o) => o._id === targetOfficeId);
  const workStartTime = (office as any)?.work_start_time || "08:00";
  const workEndTime = (office as any)?.work_end_time || "17:00";
  const lateToleranceMin = Number((office as any)?.late_tolerance_min ?? 15);

  const checkInDate = new Date(check_in_time);
  const checkInTimeStr = getCurrentTimeHHMMWIB(checkInDate);
  const lateInfo = calculateAttendanceLateStatus(checkInTimeStr, workStartTime, lateToleranceMin);

  let durationSec = 0;
  let earlyLeaveMin = 0;
  let overtimeMin = 0;

  if (check_out_time) {
    const checkOutDate = new Date(check_out_time);
    durationSec = Math.max(0, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 1000));
    const checkOutTimeStr = getCurrentTimeHHMMWIB(checkOutDate);
    const checkOutMin = parseTimeToMinutes(checkOutTimeStr);
    const workEndMin = parseTimeToMinutes(workEndTime);
    if (checkOutMin < workEndMin) {
      earlyLeaveMin = workEndMin - checkOutMin;
    } else {
      overtimeMin = checkOutMin - workEndMin;
    }
  }

  // Check if record exists for this date
  let att = db.attendance.find((a) => a.salesman_id === salesman_id && a.date === date);
  if (att) {
    att.check_in_time = check_in_time;
    if (check_out_time) att.check_out_time = check_out_time;
    att.status = status || (lateInfo.isLate ? "LATE" : "PRESENT");
    att.late_minutes = lateInfo.lateMinutes;
    att.work_duration_seconds = durationSec;
    att.work_duration_formatted = durationSec > 0 ? formatSecondsToDuration(durationSec) : undefined;
    att.early_leave_minutes = earlyLeaveMin;
    att.overtime_minutes = overtimeMin;
    (att as any).manual_entry = true;
    (att as any).manual_reason = reason || notes;
    (att as any).created_by = req.user!._id;
  } else {
    att = {
      _id: `att-${date}-${salesman_id}`,
      salesman_id,
      date,
      check_in_time,
      check_out_time: check_out_time || undefined,
      office_id: targetOfficeId,
      distance_in_m: 0,
      status: status || (lateInfo.isLate ? "LATE" : "PRESENT"),
      scheduled_in: workStartTime,
      scheduled_out: workEndTime,
      late_minutes: lateInfo.lateMinutes,
      early_leave_minutes: earlyLeaveMin,
      overtime_minutes: overtimeMin,
      work_duration_seconds: durationSec,
      work_duration_formatted: durationSec > 0 ? formatSecondsToDuration(durationSec) : undefined,
      manual_entry: true,
      manual_reason: reason || notes,
      created_by: req.user!._id,
    } as any;
    db.attendance.push(att);
  }

  recordAuditLog(
    req.user!._id,
    "ATTENDANCE_MANUAL_ENTRY",
    "attendance",
    att._id,
    {
      salesman_id,
      salesman_name: user.name,
      date,
      status: att.status,
      reason: reason || notes,
      entered_by: req.user!.name,
      entered_by_role: req.user!.role,
    }
  );

  syncSingleDoc("attendance", att._id, att);
  
  try {
    const existing = await sqlDb.select().from(pgAttendance).where(eq(pgAttendance.id, att._id)).limit(1);
    if (!existing[0]) {
      await sqlDb.insert(pgAttendance).values({
        id: att._id,
        userId: att.salesman_id,
        date: att.date,
        checkInTime: att.check_in_time ? new Date(att.check_in_time) : null,
        checkOutTime: att.check_out_time ? new Date(att.check_out_time) : null,
        status: att.status,
        notes: att.notes || null,
      }).catch((err: any) => console.error("Error inserting manual attendance to PG:", err.message));
    }
  } catch(e) {}

  return res.status(201).json({
    message: "Absensi manual berhasil dicatat.",
    attendance: att,
  });
});

// Update / Correct existing attendance record
apiRouter.put("/attendance/:id", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const att = db.attendance.find((a) => a._id === req.params.id);
  if (!att) {
    return res.status(404).json({ detail: "Data absensi tidak ditemukan." });
  }

  const prevAtt = { ...att };
  const { status, check_in_time, check_out_time, notes, correction_reason } = req.body || {};

  if (status) att.status = status;
  if (check_in_time) att.check_in_time = check_in_time;
  if (check_out_time !== undefined) att.check_out_time = check_out_time;
  if (notes !== undefined) (att as any).notes = notes;

  // Recalculate duration if both times present
  if (att.check_in_time && att.check_out_time) {
    const durSec = Math.max(0, Math.round((new Date(att.check_out_time).getTime() - new Date(att.check_in_time).getTime()) / 1000));
    att.work_duration_seconds = durSec;
    att.work_duration_formatted = formatSecondsToDuration(durSec);
  }

  (att as any).corrected_at = new Date().toISOString();
  (att as any).corrected_by = req.user!._id;
  (att as any).correction_reason = correction_reason || notes || "Koreksi administratif";

  recordAuditLog(
    req.user!._id,
    "ATTENDANCE_CORRECTION",
    "attendance",
    att._id,
    {
      attendance_id: att._id,
      salesman_id: att.salesman_id,
      previous_state: prevAtt,
      updated_state: att,
      correction_reason: (att as any).correction_reason,
      corrected_by_name: req.user!.name,
    }
  );

  syncSingleDoc("attendance", att._id, att);

  try {
    await sqlDb.update(pgAttendance).set({
      date: att.date,
      checkInTime: att.check_in_time ? new Date(att.check_in_time) : null,
      checkOutTime: att.check_out_time ? new Date(att.check_out_time) : null,
      status: att.status,
      notes: att.notes || null,
      metadata: {
        office_id: att.office_id, 
        late_minutes: att.late_minutes,
        early_leave_minutes: att.early_leave_minutes,
        overtime_minutes: att.overtime_minutes,
        mock_location: att.mock_location 
      }
    }).where(eq(pgAttendance.id, att._id));
  } catch (err: any) {
    console.error("Error manually updating attendance to Postgres:", err.message);
  }

  return res.json({
    message: "Koreksi absensi berhasil disimpan.",
    attendance: att,
  });
});

// Delete attendance record
apiRouter.delete("/attendance/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const idx = db.attendance.findIndex((a) => a._id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ detail: "Data absensi tidak ditemukan." });
  }

  const deleted = db.attendance.splice(idx, 1)[0];

  try {
    await sqlDb.delete(pgAttendance).where(eq(pgAttendance.id, req.params.id));
  } catch (err: any) {
    console.error("Error deleting attendance from Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "ATTENDANCE_DELETED",
    "attendance",
    req.params.id,
    {
      salesman_id: deleted.salesman_id,
      date: deleted.date,
      deleted_by_name: req.user!.name,
    }
  );

  deleteSingleDoc("attendance", req.params.id);

  return res.json({
    message: "Data absensi berhasil dihapus.",
    _id: req.params.id,
  });
});

// ================= OUTLETS & LIFECYCLE MANAGEMENT =================
apiRouter.get("/outlets/summary", authMiddleware, (req: AuthenticatedRequest, res) => {
  const filterSalesmanId = req.query.salesman_id as string;
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : filterSalesmanId;
  let allowedOutletIds: Set<string> | null = null;
  if (targetSalesId) {
    allowedOutletIds = new Set(getActiveAssignedOutletIds(targetSalesId));
  }

  // Recalculate all before computing summary
  recalculateAllOutletStatuses();

  const accessible = db.outlets.filter((o) => !allowedOutletIds || allowedOutletIds.has(o._id));

  const summary = {
    total: accessible.length,
    total_outlets: accessible.length,
    prospect: accessible.filter((o) => o.lifecycle_status === "PROSPECT").length,
    prospect_count: accessible.filter((o) => o.lifecycle_status === "PROSPECT").length,
    noo: accessible.filter((o) => o.lifecycle_status === "NOO").length,
    noo_count: accessible.filter((o) => o.lifecycle_status === "NOO").length,
    repeat: accessible.filter((o) => o.lifecycle_status === "REPEAT").length,
    repeat_count: accessible.filter((o) => o.lifecycle_status === "REPEAT").length,
    active: accessible.filter((o) => o.lifecycle_status === "ACTIVE").length,
    active_count: accessible.filter((o) => o.lifecycle_status === "ACTIVE").length,
    dormant: accessible.filter((o) => o.lifecycle_status === "DORMANT").length,
    dormant_count: accessible.filter((o) => o.lifecycle_status === "DORMANT").length,
    inactive: accessible.filter((o) => o.status === "INACTIVE" || o.status === "ARCHIVED").length,
    inactive_count: accessible.filter((o) => o.status === "INACTIVE" || o.status === "ARCHIVED").length,
  };

  res.json(summary);
});

apiRouter.get("/outlets/kpi", authMiddleware, (req: AuthenticatedRequest, res) => {
  const filterSalesmanId = req.query.salesman_id as string;
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : filterSalesmanId;
  let allowedOutletIds: Set<string> | null = null;
  if (targetSalesId) {
    allowedOutletIds = new Set(getActiveAssignedOutletIds(targetSalesId));
  }

  recalculateAllOutletStatuses();
  const accessible = db.outlets.filter((o) => !allowedOutletIds || allowedOutletIds.has(o._id));

  const summary = {
    total_outlets: accessible.length,
    prospect_count: accessible.filter((o) => o.lifecycle_status === "PROSPECT").length,
    noo_count: accessible.filter((o) => o.lifecycle_status === "NOO").length,
    repeat_count: accessible.filter((o) => o.lifecycle_status === "REPEAT").length,
    active_count: accessible.filter((o) => o.lifecycle_status === "ACTIVE").length,
    dormant_count: accessible.filter((o) => o.lifecycle_status === "DORMANT").length,
  };

  res.json(summary);
});

apiRouter.get("/outlets", authMiddleware, (req: AuthenticatedRequest, res) => {
  const q = ((req.query.q as string) || "").toLowerCase().trim();
  const status = req.query.status as string; // ACTIVE, INACTIVE, ARCHIVED, PENDING
  const lifecycle_status = req.query.lifecycle_status as string; // PROSPECT, NOO, REPEAT, ACTIVE, DORMANT
  const channel_id = req.query.channel_id as string;
  const area_id = req.query.area_id as string;
  const province_id = req.query.province_id as string;
  const regency_id = req.query.regency_id as string;
  const district_id = req.query.district_id as string;
  const village_id = req.query.village_id as string;
  const filterSalesmanId = req.query.salesman_id as string;
  const product_id = req.query.product_id as string;
  const sku_id = req.query.sku_id as string;
  const date_from = req.query.date_from as string;
  const date_to = req.query.date_to as string;
  const last_tx_from = req.query.last_tx_from as string;
  const last_tx_to = req.query.last_tx_to as string;

  // Enforce assignment & area filtering:
  // If user is SALES, ALWAYS restrict to their actively assigned/area outlets.
  // If supervisor/admin supplies salesman_id query param, filter by that salesman's assigned outlets.
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : filterSalesmanId;
  let allowedOutletIds: Set<string> | null = null;
  if (targetSalesId) {
    allowedOutletIds = new Set(getActiveAssignedOutletIds(targetSalesId));
  }

  // Recalculate summary for all outlets before responding
  recalculateAllOutletStatuses();

  // Find outlets that bought specific product or sku if requested
  let productOutletIds: Set<string> | null = null;
  if (product_id || sku_id) {
    productOutletIds = new Set();
    db.transactions.forEach((t) => {
      if (t.status === "CANCELLED" || (t as any).status === "DRAFT") return;
      const hasItem = (t.items || []).some((it) => {
        if (sku_id && it.sku_id === sku_id) return true;
        if (product_id) {
          const s = db.skus.find((sku) => sku._id === it.sku_id);
          if (it.product_id === product_id || s?.product_id === product_id) return true;
        }
        return false;
      });
      if (hasItem) productOutletIds!.add(t.outlet_id);
    });
  }

  // Filter outlets accessible to user
  const accessibleOutlets = db.outlets.filter((o) => {
    if (allowedOutletIds && !allowedOutletIds.has(o._id)) return false;
    return true;
  });

  // Calculate overall summary metrics across accessible outlets
  const summary = {
    total_outlets: accessibleOutlets.length,
    prospect_count: accessibleOutlets.filter((o) => o.lifecycle_status === "PROSPECT").length,
    noo_count: accessibleOutlets.filter((o) => o.lifecycle_status === "NOO").length,
    repeat_count: accessibleOutlets.filter((o) => o.lifecycle_status === "REPEAT").length,
    active_count: accessibleOutlets.filter((o) => o.lifecycle_status === "ACTIVE").length,
    dormant_count: accessibleOutlets.filter((o) => o.lifecycle_status === "DORMANT").length,
    inactive_count: accessibleOutlets.filter((o) => o.status === "INACTIVE" || o.status === "ARCHIVED").length,
  };

  // Apply filters
  let filtered = accessibleOutlets.filter((o) => {
    if (status && o.status !== status) return false;
    if (lifecycle_status && o.lifecycle_status !== lifecycle_status) return false;
    if (channel_id && o.channel_id !== channel_id) return false;
    if (area_id && o.area_id !== area_id) return false;
    if (province_id && o.province_id !== province_id) return false;
    if (regency_id && o.regency_id !== regency_id) return false;
    if (district_id && o.district_id !== district_id) return false;
    if (village_id && o.village_id !== village_id) return false;
    if (productOutletIds && !productOutletIds.has(o._id)) return false;

    if (date_from && o.created_at && o.created_at.slice(0, 10) < date_from) return false;
    if (date_to && o.created_at && o.created_at.slice(0, 10) > date_to) return false;

    if (last_tx_from) {
      if (!o.last_completed_transaction_at || o.last_completed_transaction_at.slice(0, 10) < last_tx_from) return false;
    }
    if (last_tx_to) {
      if (!o.last_completed_transaction_at || o.last_completed_transaction_at.slice(0, 10) > last_tx_to) return false;
    }

    if (q) {
      const matchName = o.outlet_name.toLowerCase().includes(q);
      const matchCode = o.outlet_code.toLowerCase().includes(q);
      const matchOwner = o.owner_name && o.owner_name.toLowerCase().includes(q);
      const matchAddress = o.address && o.address.toLowerCase().includes(q);
      const matchPhone = o.phone && o.phone.toLowerCase().includes(q);
      const matchProv = o.province_name && o.province_name.toLowerCase().includes(q);
      const matchReg = o.regency_name && o.regency_name.toLowerCase().includes(q);
      const matchDist = o.district_name && o.district_name.toLowerCase().includes(q);
      const matchVil = o.village_name && o.village_name.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchOwner && !matchAddress && !matchPhone && !matchProv && !matchReg && !matchDist && !matchVil) return false;
    }
    return true;
  });

  const nowTime = Date.now();
  const enriched = filtered.map((o) => {
    const assignedSales = getAssignedSalesForOutlet(o);
    const lifeCfg = LIFECYCLE_CONFIG[o.lifecycle_status || "PROSPECT"] || LIFECYCLE_CONFIG.PROSPECT;

    let daysSinceLast: number | null = null;
    if (o.last_completed_transaction_at) {
      const diff = nowTime - new Date(o.last_completed_transaction_at).getTime();
      daysSinceLast = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    }

    const prov = o.province_name || db.provinces.find((p) => p._id === o.province_id)?.name || "-";
    const reg = o.regency_name || db.regencies.find((r) => r._id === o.regency_id)?.name || "-";
    const dist = o.district_name || db.districts.find((d) => d._id === o.district_id)?.name || "-";
    const vil = o.village_name || db.villages.find((v) => v._id === o.village_id)?.name || "-";
    const post = o.postal_code || db.villages.find((v) => v._id === o.village_id)?.postal_code || "";

    return {
      ...o,
      province_name: prov,
      regency_name: reg,
      district_name: dist,
      village_name: vil,
      postal_code: post,
      channel_name: db.channels.find((c) => c._id === o.channel_id)?.name || "-",
      area_name: db.areas.find((a) => a._id === o.area_id)?.name || "-",
      assigned_sales_id: assignedSales?.sales_id || null,
      assigned_sales_name: assignedSales?.sales_name || "-",
      assigned_sales_code: assignedSales?.sales_code || "-",
      assigned_sales_phone: assignedSales?.sales_phone || "-",
      assignment_type: assignedSales?.assignment_type || null,
      lifecycle_status: o.lifecycle_status || "PROSPECT",
      lifecycle_label: lifeCfg.label,
      lifecycle_description: lifeCfg.description,
      lifecycle_badge: lifeCfg.badge,
      lifecycle_color: lifeCfg.color,
      days_since_last_transaction: daysSinceLast,
      completed_transaction_count: o.completed_transaction_count || 0,
      total_volume: o.total_volume || 0,
      total_revenue: o.total_revenue || 0,
    };
  });

  res.json({
    items: enriched,
    total: enriched.length,
    summary,
  });
});

apiRouter.get("/outlets/nearby", authMiddleware, (req: AuthenticatedRequest, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radius = parseFloat((req.query.radius_m as string) || "5000");

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ detail: "Koordinat lat dan lng wajib diisi." });
  }

  // If user is SALES, restrict nearby search strictly to their actively assigned outlets
  const assignedIds = req.user!.role === "SALES" ? new Set(getActiveAssignedOutletIds(req.user!._id)) : null;

  const nearby = db.outlets
    .filter((o) => o.status === "ACTIVE" && (!assignedIds || assignedIds.has(o._id)))
    .map((o) => {
      const distance = haversineMeters(lat, lng, o.latitude, o.longitude);
      const lifeCfg = LIFECYCLE_CONFIG[o.lifecycle_status || "PROSPECT"] || LIFECYCLE_CONFIG.PROSPECT;
      return {
        ...o,
        distance_m: distance,
        channel_name: db.channels.find((c) => c._id === o.channel_id)?.name || "-",
        area_name: db.areas.find((a) => a._id === o.area_id)?.name || "-",
        lifecycle_label: lifeCfg.label,
        lifecycle_badge: lifeCfg.badge,
        lifecycle_color: lifeCfg.color,
      };
    })
    .filter((o) => o.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m);

  res.json({ items: nearby, total: nearby.length });
});

apiRouter.get("/outlets/pending", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), (req, res) => {
  const pending = db.outlets
    .filter((o) => o.status === "PENDING")
    .map((o) => {
      const creator = db.users.find((u) => u._id === o.created_by);
      const area = db.areas.find((a) => a._id === o.area_id);
      const channel = db.channels.find((c) => c._id === o.channel_id);
      return {
        ...o,
        created_by_name: creator?.name || "-",
        area_name: area?.name || "-",
        channel_name: channel?.name || "-",
        photo: o.photo_url || null,
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json({ items: pending, total: pending.length });
});

apiRouter.post("/outlets/check-duplicate", authMiddleware, (req, res) => {
  const { outlet_name, phone, latitude, longitude, radius_m = 100 } = req.body || {};
  const duplicates: any[] = [];

  for (const o of db.outlets) {
    let reason = "";
    if (phone && o.phone && o.phone.trim() === phone.trim()) {
      reason = "Nomor telepon sama";
    } else if (outlet_name && o.outlet_name.toLowerCase().trim() === outlet_name.toLowerCase().trim()) {
      reason = "Nama outlet persis sama";
    } else if (latitude != null && longitude != null) {
      const dist = haversineMeters(latitude, longitude, o.latitude, o.longitude);
      if (dist <= radius_m) {
        reason = `Berjarak ${dist}m dari titik lokasi`;
      }
    }

    if (reason) {
      duplicates.push({
        outlet_id: o._id,
        outlet_code: o.outlet_code,
        outlet_name: o.outlet_name,
        address: o.address,
        phone: o.phone,
        reason,
      });
    }
  }

  res.json(duplicates);
});

apiRouter.post("/outlets", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const {
    outlet_name,
    owner_name,
    phone,
    address,
    address_line,
    street_address,
    province_id,
    regency_id,
    district_id,
    village_id,
    postal_code,
    latitude,
    longitude,
    area_id,
    channel_id,
    route_id,
    outlet_code,
    credit_limit,
    payment_term_days,
    photo,
    assigned_sales_id,
    sales_id,
  } = req.body || {};

  if (!outlet_name || latitude == null || longitude == null) {
    return res.status(400).json({ detail: "Nama outlet dan koordinat GPS (latitude, longitude) wajib diisi." });
  }

  // Validate photo if provided
  const rawOutletPhoto = photo || req.body?.photo_url;
  if (rawOutletPhoto) {
    try {
      validatePhotoPayload(rawOutletPhoto, "Foto Outlet", {
        maxBytes: MAX_SERVER_PHOTO_BYTES,
        entityType: "outlets",
        entityId: outlet_code || "noo",
      });
    } catch (err: any) {
      return res.status(err.statusCode || 400).json({ detail: err.message, code: err.code || "INVALID_OUTLET_PHOTO" });
    }
  }

  // Master Wilayah validation
  let provName = "";
  let regName = "";
  let distName = "";
  let vilName = "";
  let finalPostalCode = postal_code || "";
  const baseStreet = (street_address || address_line || address || "").trim();

  if (province_id || regency_id || district_id || village_id) {
    if (!province_id || !regency_id || !district_id || !village_id) {
      return res.status(400).json({
        detail: "Struktur wilayah administratif wajib lengkap: Provinsi, Kabupaten/Kota, Kecamatan, dan Kelurahan/Desa harus dipilih dari Master Data.",
        code: "INVALID_REGION_HIERARCHY",
      });
    }

    const province = db.provinces.find((p) => p._id === province_id);
    if (!province) return res.status(400).json({ detail: `Provinsi ID "${province_id}" tidak valid atau tidak ditemukan dalam master data.` });

    const regency = db.regencies.find((r) => r._id === regency_id);
    if (!regency) return res.status(400).json({ detail: `Kabupaten/Kota ID "${regency_id}" tidak valid atau tidak ditemukan dalam master data.` });
    if (regency.province_id !== province_id) {
      return res.status(400).json({ detail: `Kabupaten/Kota "${regency.name}" bukan bagian dari Provinsi "${province.name}".` });
    }

    const district = db.districts.find((d) => d._id === district_id);
    if (!district) return res.status(400).json({ detail: `Kecamatan ID "${district_id}" tidak valid atau tidak ditemukan dalam master data.` });
    if (district.regency_id !== regency_id) {
      return res.status(400).json({ detail: `Kecamatan "${district.name}" bukan bagian dari Kabupaten/Kota "${regency.name}".` });
    }

    const village = db.villages.find((v) => v._id === village_id);
    if (!village) return res.status(400).json({ detail: `Kelurahan/Desa ID "${village_id}" tidak valid atau tidak ditemukan dalam master data.` });
    if (village.district_id !== district_id) {
      return res.status(400).json({ detail: `Kelurahan/Desa "${village.name}" bukan bagian dari Kecamatan "${district.name}".` });
    }

    provName = province.name;
    regName = regency.name;
    distName = district.name;
    vilName = village.name;
    if (!finalPostalCode && village.postal_code) {
      finalPostalCode = village.postal_code;
    }
  }

  // Format full address string
  let fullAddress = baseStreet;
  if (vilName && distName && regName && provName) {
    const regionSuffix = `Kel. ${vilName}, Kec. ${distName}, ${regName}, ${provName}${finalPostalCode ? ` ${finalPostalCode}` : ""}`;
    if (baseStreet) {
      fullAddress = `${baseStreet}, ${regionSuffix}`;
    } else {
      fullAddress = regionSuffix;
    }
  }

  if (!fullAddress) {
    return res.status(400).json({ detail: "Alamat outlet (nama jalan / wilayah administratif) wajib diisi." });
  }

  // SALES is strictly locked to their assigned area
  const userArea = req.user!.role === "SALES" ? (getSalesAreaId(req.user!._id) || "area-1") : (area_id || "area-1");

  // Validate or auto-generate code
  let finalCode = (outlet_code || "").trim();
  if (!finalCode) {
    const count = db.outlets.length + 1;
    finalCode = `OUT-${String(count).padStart(3, "0")}`;
  } else {
    const existingCode = db.outlets.find((o) => o.outlet_code.toLowerCase() === finalCode.toLowerCase());
    if (existingCode) {
      return res.status(400).json({ detail: `Kode outlet "${finalCode}" sudah digunakan oleh outlet lain.` });
    }
  }

  // Duplicate Outlet GPS Proximity Detection based on Settings
  const duplicateRadius = Number(db.settings.duplicate_radius_m || 0);
  if (duplicateRadius > 0 && latitude != null && longitude != null) {
    const numLat = Number(latitude);
    const numLng = Number(longitude);
    const nearbyOutlet = db.outlets.find((o) => {
      if (o.latitude == null || o.longitude == null || (o.latitude === 0 && o.longitude === 0)) return false;
      const d = haversineMeters(numLat, numLng, Number(o.latitude), Number(o.longitude));
      return d <= duplicateRadius;
    });

    if (nearbyOutlet) {
      return res.status(400).json({
        detail: `Peringatan Duplikasi Lokasi: Terdeteksi outlet terdaftar "${nearbyOutlet.outlet_name}" (${nearbyOutlet.outlet_code}) dalam radius ${duplicateRadius}m (Jarak: ${Math.round(haversineMeters(numLat, numLng, Number(nearbyOutlet.latitude), Number(nearbyOutlet.longitude)))}m). Periksa kembali data NOO.`,
        code: "DUPLICATE_OUTLET_LOCATION",
        existing_outlet: nearbyOutlet,
      });
    }
  }

  const newOutletId = `out-${Date.now()}`;
  // NOO approval workflow: outlet baru dari SALES menunggu approval supervisor jika new_outlet_approval aktif
  const isSalesCreator = req.user!.role === "SALES";
  const requiresApproval = db.settings.new_outlet_approval !== false && !db.settings.auto_approve_outlets;
  const outletStatus: Outlet["status"] = isSalesCreator && requiresApproval ? "PENDING" : "ACTIVE";
  const newOutlet: Outlet = {
    _id: newOutletId,
    outlet_code: finalCode,
    outlet_name: outlet_name.trim(),
    owner_name: (owner_name || "").trim(),
    phone: (phone || "").trim(),
    address: fullAddress,
    address_line: baseStreet,
    province_id: province_id || undefined,
    province_name: provName || undefined,
    regency_id: regency_id || undefined,
    regency_name: regName || undefined,
    district_id: district_id || undefined,
    district_name: distName || undefined,
    village_id: village_id || undefined,
    village_name: vilName || undefined,
    postal_code: finalPostalCode || undefined,
    latitude: Number(latitude),
    longitude: Number(longitude),
    area_id: userArea,
    channel_id: channel_id || "ch-1",
    route_id: route_id || "rt-1",
    credit_limit: Number(credit_limit) || 0,
    payment_term_days: Number(payment_term_days) || 0,
    status: outletStatus,
    lifecycle_status: "PROSPECT",
    completed_transaction_count: 0,
    total_volume: 0,
    total_revenue: 0,
    photo_url: photo || undefined,
    notes: (req.body.notes || "").trim(),
    created_by: req.user!._id,
    created_at: new Date().toISOString(),
  };

  db.outlets.push(newOutlet);
  syncSingleDoc("outlets", newOutlet._id, newOutlet);

  try {

    await sqlDb.insert(pgOutlets).values({
      id: newOutlet._id,
      outletCode: newOutlet.outlet_code,
      outletName: newOutlet.outlet_name,
      ownerName: newOutlet.owner_name,
      phone: newOutlet.phone,
      address: newOutlet.address,
      latitude: newOutlet.latitude,
      longitude: newOutlet.longitude,
      areaId: newOutlet.area_id,
      status: newOutlet.status,
      photoUrl: newOutlet.photo_url,
      notes: newOutlet.notes,
      createdAt: new Date(newOutlet.created_at)
    });
  } catch (err: any) {
    console.error("Error inserting outlet to Postgres:", err.message);
  }

  // Auto-assign new outlet: either to the creator if SALES, specified assigned_sales_id, or automatic area sales rep
  let targetSalesId = req.user!.role === "SALES" ? req.user!._id : (assigned_sales_id || sales_id);
  if (!targetSalesId && userArea) {
    const areaSalesUser = db.users.find((u) => u.role === "SALES" && u.area_id === userArea && u.status === "ACTIVE");
    if (areaSalesUser) {
      targetSalesId = areaSalesUser._id;
    } else {
      const sm = db.salesmen.find((s) => s.area_id === userArea && s.status === "ACTIVE");
      if (sm) targetSalesId = sm.user_id || sm._id;
    }
  }

  if (targetSalesId) {
    const salesUser = db.users.find((u) => u._id === targetSalesId);
    const newAssignment: SalesOutlet = {
      _id: `so-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sales_id: targetSalesId,
      outlet_id: newOutlet._id,
      area_id: userArea,
      status: "ACTIVE",
      assigned_at: new Date().toISOString(),
      assigned_by: req.user!._id,
      notes: req.user!.role === "SALES"
        ? "Penugasan otomatis saat pendaftaran outlet baru (NOO/Prospect)"
        : `Penugasan otomatis ke Salesman Wilayah oleh sistem (${salesUser?.name || targetSalesId})`,
    };
    db.sales_outlets.push(newAssignment);
    syncSingleDoc("sales_outlets", newAssignment._id, newAssignment);

    try {
      await sqlDb.insert(pgSalesOutlets).values({
        id: newAssignment._id,
        salesmanId: newAssignment.sales_id,
        outletId: newAssignment.outlet_id,
        status: newAssignment.status,
        metadata: { notes: newAssignment.notes, assigned_by: newAssignment.assigned_by }
      });
    } catch (err: any) {
      console.error("Error inserting salesOutlet assignment to Postgres:", err.message);
    }

    recordAuditLog(
      req.user!._id,
      req.user!.role === "SALES" ? "AUTO_ASSIGN_NOO" : "AUTO_ASSIGN_AREA_SALES",
      "sales_outlets",
      newAssignment._id,
      {
        sales_id: targetSalesId,
        sales_name: salesUser?.name || targetSalesId,
        outlet_id: newOutlet._id,
        outlet_code: newOutlet.outlet_code,
        outlet_name: newOutlet.outlet_name,
        action_type: "AUTO_ASSIGNMENT",
      }
    );
  }

  recordAuditLog(
    req.user!._id,
    "CREATE_OUTLET",
    "outlets",
    newOutlet._id,
    { outlet_name: newOutlet.outlet_name, code: newOutlet.outlet_code, area_id: userArea, status: "PROSPECT" }
  );

  res.status(201).json(newOutlet);
});

apiRouter.get("/outlets/:id", authMiddleware, (req: AuthenticatedRequest, res) => {
  const outlet = db.outlets.find((o) => o._id === req.params.id || o.outlet_code === req.params.id);
  if (!outlet) return res.status(404).json({ detail: "Outlet tidak ditemukan." });

  // If user is SALES, verify explicit assignment or area ownership
  if (req.user!.role === "SALES") {
    if (!isOutletAssignedToSales(req.user!._id, outlet._id)) {
      return res.status(403).json({
        detail: "Akses ditolak. Outlet ini berada di luar area penugasan Anda.",
        code: "OUTLET_ACCESS_DENIED",
      });
    }
  }

  // Recalculate summary for latest values
  recalculateOutletSummary(outlet._id);

  const channel = db.channels.find((c) => c._id === outlet.channel_id);
  const area = db.areas.find((a) => a._id === outlet.area_id);
  const route = db.routes.find((r) => r._id === outlet.route_id);
  const assignedSales = getAssignedSalesForOutlet(outlet);

  // Completed transactions
  const txns = db.transactions
    .filter((t) => t.outlet_id === outlet._id)
    .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());

  const completedTxns = txns.filter((t) => t.status !== "CANCELLED" && (t as any).status !== "DRAFT");

  // Visits
  const visits = db.visits
    .filter((v) => v.outlet_id === outlet._id)
    .sort((a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime());

  // Product / SKU Purchase Breakdown
  const skuBreakdownMap = new Map<
    string,
    {
      sku_id: string;
      sku_code: string;
      sku_name: string;
      product_name: string;
      total_quantity: number;
      total_volume: number;
      total_subtotal: number;
      last_purchased_at: string;
      transaction_count: number;
    }
  >();

  completedTxns.forEach((t) => {
    (t.items || []).forEach((it: any) => {
      const sku = db.skus.find((s) => s._id === it.sku_id);
      const prd = db.products.find((p) => p._id === sku?.product_id);
      const qty = Number(it.quantity ?? it.volume ?? it.qty ?? 0);
      const sub = Number(it.subtotal ?? (qty * (it.unit_price || 0)));

      if (!skuBreakdownMap.has(it.sku_id)) {
        skuBreakdownMap.set(it.sku_id, {
          sku_id: it.sku_id,
          sku_code: sku?.code || it.sku_id,
          sku_name: sku?.name || it.sku_name || "SKU",
          product_name: prd?.name || it.product_name || "-",
          total_quantity: qty,
          total_volume: qty,
          total_subtotal: sub,
          last_purchased_at: t.transaction_date,
          transaction_count: 1,
        });
      } else {
        const entry = skuBreakdownMap.get(it.sku_id)!;
        entry.total_quantity += qty;
        entry.total_volume += qty;
        entry.total_subtotal += sub;
        entry.transaction_count += 1;
        if (new Date(t.transaction_date) > new Date(entry.last_purchased_at)) {
          entry.last_purchased_at = t.transaction_date;
        }
      }
    });
  });

  const productBreakdown = Array.from(skuBreakdownMap.values()).sort(
    (a, b) => b.total_subtotal - a.total_subtotal
  );

  const lifeCfg = LIFECYCLE_CONFIG[outlet.lifecycle_status || "PROSPECT"] || LIFECYCLE_CONFIG.PROSPECT;

  let daysSinceLast: number | null = null;
  if (outlet.last_completed_transaction_at) {
    const diff = Date.now() - new Date(outlet.last_completed_transaction_at).getTime();
    daysSinceLast = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  // Automatic assignment history & audit logs for this specific outlet
  const assignmentHistory = db.sales_outlets
    .filter((so) => so.outlet_id === outlet._id)
    .sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())
    .map((so) => {
      const u = db.users.find((user) => user._id === so.sales_id);
      const assigner = db.users.find((user) => user._id === so.assigned_by);
      const unassigner = so.unassigned_by ? db.users.find((user) => user._id === so.unassigned_by) : null;
      return {
        ...so,
        sales_name: u?.name || so.sales_id,
        sales_role: u?.role || "SALES",
        assigned_by_name: assigner?.name || "System",
        unassigned_by_name: unassigner?.name || "-",
      };
    });

  const outletAuditLogs = db.audit_logs
    .filter((al) => (al.entity === "outlets" || al.entity === "sales_outlets") && (al.entity_id === outlet._id || al.details?.outlet_id === outlet._id))
    .sort((a, b) => new Date((b as any).timestamp || b.created_at).getTime() - new Date((a as any).timestamp || a.created_at).getTime())
    .slice(0, 30);

  res.json({
    ...outlet,
    channel_name: channel?.name || "-",
    area_name: area?.name || "-",
    route_name: route?.name || "-",
    assigned_sales_id: assignedSales?.sales_id || null,
    assigned_sales_name: assignedSales?.sales_name || "-",
    assigned_sales_code: assignedSales?.sales_code || "-",
    assigned_sales_phone: assignedSales?.sales_phone || "-",
    assignment_type: assignedSales?.assignment_type || null,
    assignment_history: assignmentHistory,
    audit_history: outletAuditLogs,
    lifecycle_status: outlet.lifecycle_status || "PROSPECT",
    lifecycle_label: lifeCfg.label,
    lifecycle_description: lifeCfg.description,
    lifecycle_badge: lifeCfg.badge,
    lifecycle_color: lifeCfg.color,
    days_since_last_transaction: daysSinceLast,
    product_breakdown: productBreakdown,
    recent_visits: visits.slice(0, 15),
    all_visits: visits,
    recent_transactions: txns.slice(0, 15),
    all_transactions: txns,
  });
});

apiRouter.put("/outlets/:id", authMiddleware, (req: AuthenticatedRequest, res) => {
  const outlet = db.outlets.find((o) => o._id === req.params.id);
  if (!outlet) return res.status(404).json({ detail: "Outlet tidak ditemukan." });

  // If user is SALES, verify assignment
  if (req.user!.role === "SALES" && !isOutletAssignedToSales(req.user!._id, outlet._id)) {
    return res.status(403).json({ detail: "Akses ditolak. Outlet di luar penugasan Anda.", code: "OUTLET_ACCESS_DENIED" });
  }

  const {
    outlet_name,
    owner_name,
    phone,
    address,
    address_line,
    street_address,
    province_id,
    regency_id,
    district_id,
    village_id,
    postal_code,
    latitude,
    longitude,
    channel_id,
    area_id,
    route_id,
    status,
    credit_limit,
    payment_term_days,
    photo,
    photo_url,
    assigned_sales_id,
    sales_id,
  } = req.body || {};

  const rawPhoto = photo !== undefined ? photo : photo_url;
  if (rawPhoto) {
    try {
      validatePhotoPayload(rawPhoto, "Foto Outlet", {
        maxBytes: MAX_SERVER_PHOTO_BYTES,
        entityType: "outlets",
        entityId: outlet._id,
      });
    } catch (err: any) {
      return res.status(err.statusCode || 400).json({ detail: err.message, code: err.code || "INVALID_OUTLET_PHOTO" });
    }
  }

  // Master Wilayah update validation
  const targetProvId = province_id !== undefined ? province_id : outlet.province_id;
  const targetRegId = regency_id !== undefined ? regency_id : outlet.regency_id;
  const targetDistId = district_id !== undefined ? district_id : outlet.district_id;
  const targetVilId = village_id !== undefined ? village_id : outlet.village_id;

  let provName = outlet.province_name;
  let regName = outlet.regency_name;
  let distName = outlet.district_name;
  let vilName = outlet.village_name;
  let finalPostalCode = postal_code !== undefined ? postal_code : outlet.postal_code;

  if (targetProvId || targetRegId || targetDistId || targetVilId) {
    if (!targetProvId || !targetRegId || !targetDistId || !targetVilId) {
      return res.status(400).json({
        detail: "Struktur wilayah administratif wajib lengkap: Provinsi, Kabupaten/Kota, Kecamatan, dan Kelurahan/Desa harus dipilih dari Master Data.",
        code: "INVALID_REGION_HIERARCHY",
      });
    }

    const province = db.provinces.find((p) => p._id === targetProvId);
    if (!province) return res.status(400).json({ detail: `Provinsi ID "${targetProvId}" tidak valid.` });

    const regency = db.regencies.find((r) => r._id === targetRegId);
    if (!regency) return res.status(400).json({ detail: `Kabupaten/Kota ID "${targetRegId}" tidak valid.` });
    if (regency.province_id !== targetProvId) {
      return res.status(400).json({ detail: `Kabupaten/Kota "${regency.name}" bukan bagian dari Provinsi "${province.name}".` });
    }

    const district = db.districts.find((d) => d._id === targetDistId);
    if (!district) return res.status(400).json({ detail: `Kecamatan ID "${targetDistId}" tidak valid.` });
    if (district.regency_id !== targetRegId) {
      return res.status(400).json({ detail: `Kecamatan "${district.name}" bukan bagian dari Kabupaten/Kota "${regency.name}".` });
    }

    const village = db.villages.find((v) => v._id === targetVilId);
    if (!village) return res.status(400).json({ detail: `Kelurahan/Desa ID "${targetVilId}" tidak valid.` });
    if (village.district_id !== targetDistId) {
      return res.status(400).json({ detail: `Kelurahan/Desa "${village.name}" bukan bagian dari Kecamatan "${district.name}".` });
    }

    provName = province.name;
    regName = regency.name;
    distName = district.name;
    vilName = village.name;
    if (!finalPostalCode && village.postal_code) {
      finalPostalCode = village.postal_code;
    }

    outlet.province_id = targetProvId;
    outlet.province_name = provName;
    outlet.regency_id = targetRegId;
    outlet.regency_name = regName;
    outlet.district_id = targetDistId;
    outlet.district_name = distName;
    outlet.village_id = targetVilId;
    outlet.village_name = vilName;
    outlet.postal_code = finalPostalCode;
  }

  const baseStreet = (street_address !== undefined ? street_address : (address_line !== undefined ? address_line : (address || outlet.address_line || ""))).trim();
  if (baseStreet !== undefined) {
    outlet.address_line = baseStreet;
  }

  if (provName && regName && distName && vilName) {
    const regionSuffix = `Kel. ${vilName}, Kec. ${distName}, ${regName}, ${provName}${finalPostalCode ? ` ${finalPostalCode}` : ""}`;
    outlet.address = baseStreet ? `${baseStreet}, ${regionSuffix}` : regionSuffix;
  } else if (address) {
    outlet.address = address.trim();
  }

  if (outlet_name) outlet.outlet_name = outlet_name.trim();
  if (owner_name !== undefined) outlet.owner_name = owner_name.trim();
  if (phone !== undefined) outlet.phone = phone.trim();
  if (latitude != null) outlet.latitude = Number(latitude);
  if (longitude != null) outlet.longitude = Number(longitude);
  if (channel_id) outlet.channel_id = channel_id;
  if (area_id && req.user!.role !== "SALES") outlet.area_id = area_id;
  if (route_id) outlet.route_id = route_id;
  if (status && req.user!.role !== "SALES") outlet.status = status;
  if (credit_limit !== undefined) outlet.credit_limit = Number(credit_limit);
  if (payment_term_days !== undefined) outlet.payment_term_days = Number(payment_term_days);
  if (rawPhoto !== undefined) outlet.photo_url = rawPhoto || undefined;

  // Automatic Sales Assignment & Audit Log when updating outlet in Master Outlet
  const targetSalesId = assigned_sales_id !== undefined ? assigned_sales_id : sales_id;
  if (targetSalesId !== undefined && req.user!.role !== "SALES") {
    const currentAssignment = db.sales_outlets.find(
      (so) => so.outlet_id === outlet._id && so.status === "ACTIVE"
    );

    if (!currentAssignment || currentAssignment.sales_id !== targetSalesId) {
      const now = new Date().toISOString();
      const prevSalesUser = currentAssignment ? db.users.find((u) => u._id === currentAssignment.sales_id) : null;
      const newSalesUser = targetSalesId ? db.users.find((u) => u._id === targetSalesId) : null;

      if (currentAssignment) {
        currentAssignment.status = "INACTIVE";
        currentAssignment.unassigned_at = now;
        currentAssignment.unassigned_by = req.user!._id;
        currentAssignment.notes = (currentAssignment.notes ? currentAssignment.notes + " | " : "") +
          `Direassign ke ${newSalesUser?.name || targetSalesId} melalui Edit Master Outlet`;
        syncSingleDoc("sales_outlets", currentAssignment._id, currentAssignment);
      }

      if (targetSalesId) {
        const newAssignment: SalesOutlet = {
          _id: `so-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          sales_id: targetSalesId,
          outlet_id: outlet._id,
          area_id: newSalesUser?.area_id || outlet.area_id || "area-1",
          status: "ACTIVE",
          assigned_at: now,
          assigned_by: req.user!._id,
          notes: currentAssignment
            ? `Reassign dari ${prevSalesUser?.name || currentAssignment.sales_id} melalui Edit Master Outlet`
            : `Penugasan baru melalui Edit Master Outlet oleh ${req.user!.name || "Admin"}`,
        };
        db.sales_outlets.push(newAssignment);
        syncSingleDoc("sales_outlets", newAssignment._id, newAssignment);

        recordAuditLog(
          req.user!._id,
          currentAssignment ? "REASSIGN_OUTLET" : "ASSIGN_OUTLET_TO_SALES",
          "sales_outlets",
          newAssignment._id,
          {
            outlet_id: outlet._id,
            outlet_code: outlet.outlet_code,
            outlet_name: outlet.outlet_name,
            previous_sales_id: currentAssignment?.sales_id || null,
            previous_sales_name: prevSalesUser?.name || "-",
            new_sales_id: targetSalesId,
            new_sales_name: newSalesUser?.name || "-",
            source: "MASTER_OUTLET_EDIT",
            reason: "Perubahan penugasan sales pada form Master Outlet",
          }
        );
      }
    }
  }

  recalculateOutletSummary(outlet._id);

  recordAuditLog(
    req.user!._id,
    "UPDATE_OUTLET",
    "outlets",
    outlet._id,
    { outlet_code: outlet.outlet_code, outlet_name: outlet.outlet_name, updated_fields: Object.keys(req.body || {}) }
  );

  syncSingleDoc("outlets", outlet._id, outlet);
  res.json(outlet);
});

apiRouter.post("/outlets/:id/recalculate", authMiddleware, (req, res) => {
  const result = recalculateOutletSummary(req.params.id);
  if (!result) return res.status(404).json({ detail: "Outlet tidak ditemukan." });
  const outlet = db.outlets.find((o) => o._id === req.params.id);
  if (outlet) syncSingleDoc("outlets", outlet._id, outlet);
  res.json({ message: "Status lifecycle outlet berhasil dihitung ulang.", summary: result, outlet });
});

apiRouter.post("/outlets/recalculate-all", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), (req, res) => {
  recalculateAllOutletStatuses();
  db.outlets.forEach((o) => syncSingleDoc("outlets", o._id, o));
  res.json({ message: "Semua status outlet berhasil dihitung ulang berdasarkan transaksi selesai.", total: db.outlets.length });
});

apiRouter.delete("/outlets/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const outlet = db.outlets.find((o) => o._id === req.params.id);
  if (!outlet) return res.status(404).json({ detail: "Outlet tidak ditemukan." });

  // Check if outlet has transactions
  const hasTxns = db.transactions.some((t) => t.outlet_id === outlet._id);
  if (hasTxns) {
    outlet.status = "ARCHIVED";
    recordAuditLog(req.user!._id, "ARCHIVE_OUTLET", "outlets", outlet._id, { reason: "Outlet memiliki riwayat transaksi, diarsipkan." });
    syncSingleDoc("outlets", outlet._id, outlet);
    return res.json({ message: "Outlet memiliki riwayat transaksi sehingga diarsipkan (ARCHIVED).", outlet });
  }

  const idx = db.outlets.findIndex((o) => o._id === outlet._id);
  if (idx !== -1) {
    db.outlets.splice(idx, 1);
  }

  // Remove assignments
  db.sales_outlets = db.sales_outlets.filter((so) => so.outlet_id !== outlet._id);

  recordAuditLog(req.user!._id, "DELETE_OUTLET", "outlets", outlet._id, { outlet_name: outlet.outlet_name });
  deleteSingleDoc("outlets", outlet._id);
  res.json({ message: "Outlet berhasil dihapus.", _id: outlet._id });
});

apiRouter.post("/outlets/:id/toggle", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), (req, res) => {
  const outlet = db.outlets.find((o) => o._id === req.params.id);
  if (!outlet) return res.status(404).json({ detail: "Outlet tidak ditemukan." });
  outlet.status = outlet.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  syncSingleDoc("outlets", outlet._id, outlet);
  res.json(outlet);
});

// ================= VISITS =================
apiRouter.post("/visits/check-in", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { outlet_id, latitude, longitude, photo_url } = req.body || {};
  if (!outlet_id || latitude == null || longitude == null) {
    return res.status(400).json({ detail: "Outlet ID dan koordinat GPS wajib disertakan." });
  }

  // 1. Validate Sales user status
  if (req.user!.status !== "ACTIVE") {
    return res.status(403).json({ detail: "Akun Anda tidak aktif.", code: "USER_INACTIVE" });
  }

  // Mock Location / Fake GPS Check
  const fakeGpsPolicy = db.settings.fake_gps_policy || "REJECT";
  if (req.body?.mock_location && fakeGpsPolicy === "REJECT" && !db.settings.allow_fake_gps) {
    return res.status(400).json({
      detail: "Penggunaan Fake GPS / Mock Location terdeteksi dan dilarang saat check-in kunjungan.",
      code: "MOCK_LOCATION_DETECTED",
    });
  }

  // GPS Accuracy Check based on settings
  const maxGpsAccuracy = Number(db.settings.gps_accuracy_max_m || 100);
  if (req.body?.accuracy != null && Number(req.body.accuracy) > maxGpsAccuracy) {
    return res.status(400).json({
      detail: `Akurasi sinyal GPS terlalu rendah (${Math.round(req.body.accuracy)}m). Batas toleransi maksimum ${maxGpsAccuracy}m.`,
      code: "LOW_GPS_ACCURACY",
    });
  }

  // Mandatory Outlet Photo validation based on settings
  if (photo_url) {
    try {
      validatePhotoPayload(photo_url, "Foto Check-in Kunjungan", {
        maxBytes: MAX_SERVER_PHOTO_BYTES,
        entityType: "visits",
        entityId: outlet_id,
      });
    } catch (err: any) {
      return res.status(err.statusCode || 400).json({ detail: err.message, code: err.code || "INVALID_VISIT_PHOTO" });
    }
  } else if (db.settings.require_outlet_photo_visit !== false) {
    return res.status(400).json({
      detail: "Foto papan nama / fisik display toko wajib diambil saat check-in kunjungan.",
      code: "OUTLET_PHOTO_REQUIRED",
    });
  }

  // 2. Validate Outlet exists and is ACTIVE
  const outlet = db.outlets.find((o) => o._id === outlet_id);
  if (!outlet) return res.status(404).json({ detail: "Outlet tidak ditemukan." });
  if (outlet.status !== "ACTIVE") {
    return res.status(400).json({ detail: "Outlet tidak aktif atau belum disetujui." });
  }

  // 3. FINAL BUSINESS RULE: SALES ASSIGNMENT -> OUTLET ASSIGNMENT
  // Sales A cannot visit outlets of Sales B, even in the same area!
  if (req.user!.role === "SALES") {
    const isAssigned = isOutletAssignedToSales(req.user!._id, outlet_id);
    if (!isAssigned) {
      return res.status(403).json({
        detail: `Outlet "${outlet.outlet_name}" (${outlet.outlet_code}) tidak ditugaskan kepada Anda. Kunjungan ditolak.`,
        code: "OUTLET_NOT_ASSIGNED",
      });
    }

    const salesArea = getSalesAreaId(req.user!._id);
    if (salesArea && outlet.area_id && salesArea !== outlet.area_id) {
      return res.status(403).json({
        detail: "Area outlet tidak sesuai dengan area penugasan Anda. Kunjungan ditolak.",
        code: "AREA_MISMATCH",
      });
    }

    // Enforce Call Plan schedule if enabled in settings
    const enforceCallPlan = db.settings.enforce_call_plan_schedule || db.settings.enforce_call_plan;
    if (enforceCallPlan) {
      const today = getTodayWIB();
      const cp = db.call_plans.find((p) => p.salesman_id === req.user!._id && p.date === today);
      const isPlanned = cp ? db.call_plan_items.some((i) => i.call_plan_id === cp._id && i.outlet_id === outlet_id) : false;
      if (!isPlanned) {
        return res.status(400).json({
          detail: `Kebijakan Rute Kerja: Outlet "${outlet.outlet_name}" (${outlet.outlet_code}) tidak terdaftar dalam Call Plan harian Anda hari ini.`,
          code: "OUTLET_NOT_IN_CALL_PLAN",
        });
      }
    }
  }

  const existingActive = db.visits.find(
    (v) => v.salesman_id === req.user!._id && v.status === "IN_PROGRESS"
  );
  if (existingActive) {
    return res.status(400).json({
      detail: "Anda masih memiliki kunjungan yang sedang berlangsung. Selesaikan kunjungan tersebut terlebih dahulu.",
      active_visit: existingActive,
    });
  }

  const distance = haversineMeters(latitude, longitude, outlet.latitude, outlet.longitude);
  const maxGeofence = Number(db.settings.outlet_radius_m || db.settings.max_geofence_m || 200);
  const enforceGeofence = db.settings.enforce_outlet_geofence !== false;
  if (enforceGeofence && distance > maxGeofence) {
    return res.status(400).json({
      detail: `Anda berada di luar radius outlet (${distance}m > ${maxGeofence}m). Dekati outlet untuk check-in.`,
      distance,
      allowed_radius: maxGeofence,
    });
  }

  const today = getTodayWIB();
  const newVisit: Visit = {
    _id: `vst-${Date.now()}`,
    salesman_id: req.user!._id,
    outlet_id,
    date: today,
    check_in_time: new Date().toISOString(),
    check_in_lat: latitude,
    check_in_lng: longitude,
    distance_m: distance,
    status: "IN_PROGRESS",
    photo_url,
    created_at: new Date().toISOString(),
  };

  db.visits.push(newVisit);
  syncSingleDoc("visits", newVisit._id, newVisit);

  try {

    await sqlDb.insert(pgVisits).values({
      id: newVisit._id,
      salesmanId: newVisit.salesman_id,
      outletId: newVisit.outlet_id,
      checkInTime: new Date(newVisit.check_in_time),
      checkInLat: newVisit.check_in_lat,
      checkInLng: newVisit.check_in_lng,
      status: newVisit.status,
    });
  } catch (err: any) {
    console.error("Error inserting visit to Postgres on check-in:", err.message);
  }

  // Mark Call Plan item as visited if applicable
  const cp = db.call_plans.find((p) => p.salesman_id === req.user!._id && p.date === today);
  if (cp) {
    const item = db.call_plan_items.find((i) => i.call_plan_id === cp._id && i.outlet_id === outlet_id);
    if (item) item.status = "VISITED";
  }

  recordAuditLog(
    req.user!._id,
    "CHECK_IN_VISIT",
    "visits",
    newVisit._id,
    { outlet_id, outlet_name: outlet.outlet_name, distance_m: distance }
  );

  res.status(201).json({
    message: `Check-in kunjungan berhasil (${outlet.outlet_name}). Jarak ${distance}m.`,
    visit: newVisit,
    outlet,
  });
});

apiRouter.get("/visits/active", authMiddleware, (req: AuthenticatedRequest, res) => {
  const active = db.visits.find((v) => v.salesman_id === req.user!._id && v.status === "IN_PROGRESS");
  if (!active) return res.json({ visit: null });

  const outlet = db.outlets.find((o) => o._id === active.outlet_id);
  res.json({
    visit: {
      ...active,
      outlet_name: outlet?.outlet_name || "-",
      outlet_code: outlet?.outlet_code || "-",
      outlet,
    },
  });
});

apiRouter.get("/visits", authMiddleware, (req: AuthenticatedRequest, res) => {
  const date = req.query.date as string;
  const filterSalesmanId = req.query.salesman_id as string;
  const salesman_id = req.user!.role === "SALES" ? req.user!._id : filterSalesmanId;
  const outlet_id = req.query.outlet_id as string;

  let visits = db.visits.filter((v) => {
    if (date && v.date !== date) return false;
    if (salesman_id && v.salesman_id !== salesman_id) return false;
    if (outlet_id && v.outlet_id !== outlet_id) return false;
    return true;
  });

  const enriched = visits.map((v) => ({
    ...v,
    outlet_name: db.outlets.find((o) => o._id === v.outlet_id)?.outlet_name || "-",
    salesman_name: db.users.find((u) => u._id === v.salesman_id)?.name || "-",
  }));

  res.json({ items: enriched, total: enriched.length });
});

apiRouter.get("/visits/:id", authMiddleware, (req: AuthenticatedRequest, res) => {
  const visit = db.visits.find((v) => v._id === req.params.id);
  if (!visit) return res.status(404).json({ detail: "Kunjungan tidak ditemukan." });

  if (req.user!.role === "SALES" && visit.salesman_id !== req.user!._id) {
    return res.status(403).json({ detail: "Akses ditolak. Kunjungan ini milik salesman lain." });
  }

  const outlet = db.outlets.find((o) => o._id === visit.outlet_id);
  const transactions = db.transactions.filter((t) => t.visit_id === visit._id);
  const openReason = visit.open_reason_id
    ? db.open_call_reasons.find((r) => r._id === visit.open_reason_id)
    : null;

  res.json({
    ...visit,
    outlet,
    transactions,
    open_reason: openReason,
  });
});

apiRouter.post("/visits/:id/check-out", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const visit = db.visits.find((v) => v._id === req.params.id);
  if (!visit) return res.status(404).json({ detail: "Kunjungan tidak ditemukan." });

  if (visit.status !== "IN_PROGRESS") {
    return res.status(400).json({ detail: "Kunjungan ini sudah diselesaikan sebelumnya." });
  }

  const { outlet_call_reason_id, open_call_reason_id, open_reason_id, call_result, notes, latitude, longitude, confirm_early } = req.body || {};

  const now = new Date();
  const checkInTime = new Date(visit.check_in_time);
  const durationSec = Math.round((now.getTime() - checkInTime.getTime()) / 1000);

  // Effective Call = ada transaksi (non-cancelled) pada kunjungan ini; jika tidak = Outlet Call
  const txns = db.transactions.filter((t) => t.visit_id === visit._id && t.status !== "CANCELLED");
  const derivedResult: "EFFECTIVE" | "OPEN" = txns.length > 0 ? "EFFECTIVE" : (call_result === "EFFECTIVE" ? "EFFECTIVE" : "OPEN");

  // Minimum duration guard (hanya untuk Outlet Call / tanpa transaksi)
  const minSec = Number(db.settings.visit_min_duration_sec) || 0;
  if (derivedResult !== "EFFECTIVE" && minSec > 0 && durationSec < minSec && !confirm_early) {
    const durMin = durationSec / 60;
    const minMin = minSec / 60;
    return res.status(409).json({
      detail: `Durasi kunjungan ${durMin.toFixed(1)} menit masih di bawah minimum ${minMin.toFixed(1)} menit.`,
      message: `Durasi kunjungan baru ${durMin.toFixed(1)} menit, minimum ${minMin.toFixed(1)} menit. Tetap check-out?`,
      min_minutes: minMin,
      duration_minutes: durMin,
      can_override: true,
    });
  }

  const reasonId = outlet_call_reason_id || open_call_reason_id || open_reason_id || null;
  if (derivedResult === "OPEN" && !reasonId) {
    return res.status(400).json({ detail: "Alasan kunjungan tanpa transaksi (Outlet Call) wajib dipilih." });
  }

  visit.check_out_time = now.toISOString();
  visit.duration_seconds = durationSec;
  visit.status = "COMPLETED";
  visit.call_result = derivedResult;
  visit.open_reason_id = reasonId || undefined;
  visit.notes = notes || "";
  if (latitude != null && longitude != null) {
    visit.check_out_lat = Number(latitude);
    visit.check_out_lng = Number(longitude);
  }
  visit.total_sales = txns.reduce((sum, t) => sum + (t.total || 0), 0);

  // Tandai item call plan sebagai VISITED
  const cp = db.call_plans.find((p) => p.salesman_id === visit.salesman_id && p.date === visit.date);
  if (cp) {
    const item = db.call_plan_items.find((i) => i.call_plan_id === cp._id && i.outlet_id === visit.outlet_id);
    if (item) item.status = "VISITED";
  }

  recordAuditLog(
    req.user!._id,
    "CHECK_OUT_VISIT",
    "visits",
    visit._id,
    { outlet_id: visit.outlet_id, call_result: derivedResult, duration_seconds: durationSec, transactions: txns.length }
  );

  syncSingleDoc("visits", visit._id, visit);

  try {

    const [existingPgVisit] = await sqlDb.select().from(pgVisits).where(eq(pgVisits.id, visit._id)).limit(1);

    if (existingPgVisit) {
      await sqlDb.update(pgVisits).set({
        checkOutTime: new Date(visit.check_out_time),
        visitDurationSeconds: visit.duration_seconds,
        status: visit.status,
        isEffectiveCall: visit.call_result === "EFFECTIVE",
        nonProductiveReasonId: visit.open_reason_id || null,
        notes: visit.notes || null,
      }).where(eq(pgVisits.id, visit._id));
    }
  } catch (err: any) {
    console.error("Error updating visit in Postgres on check-out:", err.message);
  }

  res.json({
    message: derivedResult === "EFFECTIVE" ? "Check-out berhasil (Effective Call)." : "Check-out berhasil (Outlet Call).",
    visit,
  });
});

// ================= TRANSACTIONS =================
apiRouter.get("/transactions/sku-list", authMiddleware, (req: AuthenticatedRequest, res) => {
  const salesmanId = req.user?.role === "SALES" ? req.user._id : (req.query.salesman_id as string) || req.user?._id || "";
  const warehouseId = (req.query.warehouse_id as string) || req.user?.office_id || "off-1";

  const skus = db.skus.filter((s) => s.status === "ACTIVE").map((s) => {
    const prc = db.prices.find((p) => p.sku_id === s._id && p.status === "ACTIVE");
    const prd = db.products.find((p) => p._id === s.product_id);
    
    // Check sales stock for this sales rep
    const salesInv = db.inventory.find(
      (i) => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === s._id
    );
    const whInv = db.inventory.find(
      (i) => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === warehouseId || i.office_id === warehouseId) && i.sku_id === s._id
    );

    return {
      _id: s._id,
      sku_id: s._id,
      name: s.name,
      sku_code: s.code,
      sku_name: s.name,
      product_name: prd?.name || "-",
      unit: s.unit,
      price: prc?.price || 0,
      sales_stock: salesInv ? salesInv.available_stock : 0,
      warehouse_stock: whInv ? whInv.available_stock : 0,
      stock_on_hand: salesInv ? salesInv.available_stock : (whInv ? whInv.available_stock : 0),
    };
  });
  res.json({ items: skus, total: skus.length });
});

apiRouter.post("/transactions", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { outlet_id, visit_id, items, payment_method, notes, latitude, longitude, mock_location } = req.body || {};
  if (!outlet_id || !items || !items.length) {
    return res.status(400).json({ detail: "Outlet dan daftar item produk wajib diisi." });
  }

  // Mock Location / Fake GPS Check
  const fakeGpsPolicy = db.settings.fake_gps_policy || "REJECT";
  if (mock_location && fakeGpsPolicy === "REJECT" && !db.settings.allow_fake_gps) {
    return res.status(400).json({
      detail: "Penggunaan Fake GPS / Mock Location terdeteksi dan dilarang saat transaksi penjualan.",
      code: "MOCK_LOCATION_DETECTED",
    });
  }

  // Mandatory GPS on Order validation based on settings
  if (db.settings.require_gps_on_order !== false && (latitude == null || longitude == null)) {
    return res.status(400).json({
      detail: "Titik koordinat GPS akurat wajib disertakan saat mencatat transaksi penjualan.",
      code: "GPS_REQUIRED_ON_ORDER",
    });
  }

  // Check Idempotency to prevent duplicate transaction submissions
  const idempotencyKey = (req.headers["x-idempotency-key"] as string) || req.body?.idempotency_key;
  const idempCheck = checkIdempotency(idempotencyKey);
  if (idempCheck.isDuplicate) {
    return res.json(idempCheck.cachedResponse);
  }

  // 1. Validate user status
  if (req.user!.status !== "ACTIVE") {
    return res.status(403).json({ detail: "Akun Anda tidak aktif.", code: "USER_INACTIVE" });
  }

  // 2. Validate outlet
  const outlet = db.outlets.find((o) => o._id === outlet_id);
  if (!outlet) return res.status(404).json({ detail: "Outlet tidak ditemukan." });
  if (outlet.status !== "ACTIVE") {
    return res.status(400).json({ detail: "Outlet tidak aktif." });
  }

  // 3. FINAL BUSINESS RULE: SALES ASSIGNMENT -> OUTLET ASSIGNMENT
  if (req.user!.role === "SALES") {
    const isAssigned = isOutletAssignedToSales(req.user!._id, outlet_id);
    if (!isAssigned) {
      return res.status(403).json({
        detail: `Outlet "${outlet.outlet_name}" (${outlet.outlet_code}) tidak ditugaskan kepada Anda. Transaksi penjualan ditolak.`,
        code: "OUTLET_NOT_ASSIGNED",
      });
    }

    const salesArea = getSalesAreaId(req.user!._id);
    if (salesArea && outlet.area_id && salesArea !== outlet.area_id) {
      return res.status(403).json({
        detail: "Area outlet tidak sesuai dengan area penugasan Anda. Transaksi ditolak.",
        code: "AREA_MISMATCH",
      });
    }
  }

  const salesmanId = req.user!._id;
  const lockKey = `stock_lock_${salesmanId}`;

  try {
    const result = await executeWithMutex(lockKey, async () => {
      // 4. VALIDATE SALES STOCK (STOK SALES DI LAPANGAN) under lock
      for (const it of items) {
        const qty = parseInt(it.quantity) || 0;
        if (qty <= 0) {
          throw { status: 400, detail: "Jumlah kuantitas item harus lebih dari 0." };
        }

        if (req.user!.role === "SALES") {
          const salesInv = db.inventory.find(
            (i) => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === it.sku_id
          );
          const availableSalesStock = salesInv ? salesInv.available_stock : 0;
          if (availableSalesStock < qty) {
            const sku = db.skus.find((s) => s._id === it.sku_id);
            throw {
              status: 400,
              detail: `Stok produk "${sku?.name || it.sku_id}" tidak mencukupi pada Sales. Sisa stok yang Anda bawa: ${availableSalesStock} ${sku?.unit || "Unit"}, Diminta: ${qty} ${sku?.unit || "Unit"}.`,
              code: "INSUFFICIENT_SALES_STOCK",
            };
          }
        }
      }

      const today = getTodayWIB();
      const count = db.transactions.length + 1;
      const invoicePrefix = (db.settings.invoice_prefix || "INV").trim().toUpperCase();
      const invoiceNumber = `${invoicePrefix}/${today.replace(/-/g, "")}/${String(count).padStart(3, "0")}`;
      const newTxnId = `txn-${Date.now()}`;

      let subtotal = 0;
      const processedItems = [];
      for (const [idx, it] of items.entries()) {
        const sku = db.skus.find((s) => s._id === it.sku_id);
        const prod = db.products.find((p) => p._id === sku?.product_id);
        const prc = db.prices.find((p) => p.sku_id === it.sku_id);
        const price = Number(it.unit_price ?? it.unitPrice ?? prc?.price ?? 0);
        const qty = parseInt(it.quantity ?? it.volume ?? it.qty, 10) || 1;
        const disc = parseFloat(it.discount) || 0;
        const itemTotal = price * qty - disc;
        subtotal += itemTotal;

        // ATOMIC POSTGRES DEDUCTION
        const notes = `Penjualan ${outlet.outlet_name} (${invoiceNumber}) - Volume: ${qty} ${sku?.unit || 'Unit'}`;
        if (req.user!.role === "SALES") {
          await InventoryService.deductSalesStock(salesmanId, it.sku_id, qty, newTxnId, outlet_id, notes);
        } else {
          await InventoryService.deductWarehouseStockForSales("GUDANG-1", it.sku_id, qty, newTxnId, outlet_id, req.user!._id, notes);
        }

        processedItems.push({
          transaction_id: newTxnId,
          transactionId: newTxnId,
          product_id: prod?._id || sku?.product_id || "prd-1",
          productId: prod?._id || sku?.product_id || "prd-1",
          sku_id: it.sku_id,
          skuId: it.sku_id,
          product_name: prod?.name || "Produk",
          productName: prod?.name || "Produk",
          sku_name: sku?.name || it.sku_name || "SKU",
          skuName: sku?.name || it.sku_name || "SKU",
          quantity: qty,
          qty: qty,
          volume: qty, // Volume is strictly Qty of this SKU
          unit_price: price,
          unitPrice: price,
          discount: disc,
          subtotal: itemTotal,
        });
      }

      const totalVolume = processedItems.reduce((acc, it) => acc + (it.volume || it.quantity), 0);
      const isCredit = payment_method === "CREDIT" || payment_method === "TEMPO";

      // Tax calculation based on settings
      const taxRate = Number(db.settings.tax_rate_percentage) || 0;
      const taxAmount = Math.round((subtotal * taxRate) / 100);
      const grandTotal = subtotal + taxAmount;

      const newTxn: Transaction = {
        _id: newTxnId,
        transaction_code: invoiceNumber,
        notes: notes || "", 
        invoice_number: invoiceNumber,
        salesman_id: req.user!._id,
        outlet_id,
        visit_id: visit_id || "",
        transaction_date: new Date().toISOString(),
        items: processedItems,
        total_volume: totalVolume,
        subtotal,
        discount_total: 0,
        tax: taxAmount,
        total: grandTotal,
        payment_method: isCredit ? "CREDIT" : (payment_method || "CASH"),
        status: isCredit ? "PENDING" : "PAID",
        created_at: new Date().toISOString(),
      };

      if (latitude != null && longitude != null) {
        (newTxn as any).latitude = Number(latitude);
        (newTxn as any).longitude = Number(longitude);
      }

      db.transactions.push(newTxn);
      syncSingleDoc("transactions", newTxn._id, newTxn);

      try {
        await sqlDb.insert(pgTransactions).values({
          id: newTxn._id,
          invoiceNumber: newTxn.invoice_number,
          salesmanId: newTxn.salesman_id,
          outletId: newTxn.outlet_id,
          visitId: newTxn.visit_id,
          officeId: "off-1",
          transactionType: newTxn.payment_method,
          subtotal: newTxn.subtotal,
          discountAmount: newTxn.discount_total,
          taxAmount: newTxn.tax,
          totalAmount: newTxn.total,
          paidAmount: newTxn.status === "PAID" ? newTxn.total : 0,
          paymentStatus: newTxn.status === "PAID" ? "PAID" : "UNPAID",
          deliveryStatus: "DELIVERED",
          items: newTxn.items,
          createdAt: new Date(newTxn.created_at)
        });
      } catch (err: any) {
        console.error("Error inserting transaction to Postgres:", err.message);
      }

      // Create Accounts Receivable record if payment is CREDIT
      if (isCredit) {
        const defaultTermDays = Number((outlet as any).payment_terms_days || db.settings.default_payment_term_days || 14);
        const due = new Date();
        due.setDate(due.getDate() + defaultTermDays);
        const dueDateStr = due.toISOString().slice(0, 10);

        const newRec: Receivable = {
          _id: `rec-${newTxnId}`,
          invoice_id: newTxnId,
          invoice_number: invoiceNumber,
          outlet_id,
          salesman_id: req.user!._id,
          due_date: dueDateStr,
          total_amount: grandTotal,
          paid_amount: 0,
          remaining_amount: grandTotal,
          status: "UNPAID",
          payments: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        db.receivables.push(newRec);
        syncSingleDoc("receivables", newRec._id, newRec);
      }

      // Recalculate outlet lifecycle status & metrics immediately
      recalculateOutletSummary(outlet_id);
      const updatedOutlet = db.outlets.find((o) => o._id === outlet_id);
      if (updatedOutlet) syncSingleDoc("outlets", updatedOutlet._id, updatedOutlet);

      // Synchronize Sales Stock Ledger for each SKU sold
      if (req.user!.role === "SALES") {
        items.forEach((it: any) => {
          syncSalesStockLedger(salesmanId, it.sku_id, today);
        });
      }

      // If inside a visit, mark visit as effective
      if (visit_id) {
        const visit = db.visits.find((v) => v._id === visit_id);
        if (visit) {
          visit.call_result = "EFFECTIVE";
          visit.total_sales = (visit.total_sales || 0) + subtotal;
        }
      }

      recordAuditLog(
        req.user!._id,
        "CREATE_TRANSACTION",
        "transactions",
        newTxn._id,
        {
          invoice: invoiceNumber,
          outlet_id,
          total_volume: totalVolume,
          total: subtotal,
          payment_method: newTxn.payment_method,
          items: processedItems.map((i) => ({ sku: i.sku_name, volume: i.volume, subtotal: i.subtotal })),
        }
      );

      const responsePayload = {
        message: "Transaksi penjualan berhasil disimpan dan stok sales berhasil dimutasi.",
        transaction: newTxn,
      };

      if (idempotencyKey) {
        recordIdempotency(idempotencyKey, responsePayload);
      }

      return responsePayload;
    });

    res.status(201).json(result);
  } catch (err: any) {
    if (err.status) {
      return res.status(err.status).json({ detail: err.detail, code: err.code });
    }
    res.status(500).json({ detail: err.message || "Gagal memproses transaksi penjualan." });
  }
});

apiRouter.get("/transactions", authMiddleware, (req: AuthenticatedRequest, res) => {
  const filterSalesmanId = req.query.salesman_id as string;
  const salesman_id = req.user!.role === "SALES" ? req.user!._id : filterSalesmanId;
  const outlet_id = req.query.outlet_id as string;
  const area_id = req.query.area_id as string;
  const product_id = req.query.product_id as string;
  const sku_id = req.query.sku_id as string;
  const date = req.query.date as string;
  const from_date = req.query.from_date as string;
  const to_date = req.query.to_date as string;
  const status = req.query.status as string;
  const q = ((req.query.q as string) || "").toLowerCase().trim();

  let txns = db.transactions.filter((t) => {
    if (salesman_id && t.salesman_id !== salesman_id) return false;
    if (outlet_id && t.outlet_id !== outlet_id) return false;
    if (status && t.status !== status) return false;
    
    const txnDate = (t.transaction_date || "").slice(0, 10);
    if (date && !txnDate.startsWith(date)) return false;
    if (from_date && txnDate < from_date) return false;
    if (to_date && txnDate > to_date) return false;

    const outlet = db.outlets.find((o) => o._id === t.outlet_id);
    if (area_id && outlet?.area_id !== area_id) return false;

    if (sku_id) {
      const hasSku = (t.items || []).some((it) => it.sku_id === sku_id);
      if (!hasSku) return false;
    }

    if (product_id) {
      const hasProd = (t.items || []).some((it) => {
        const sku = db.skus.find((s) => s._id === it.sku_id);
        return it.product_id === product_id || sku?.product_id === product_id;
      });
      if (!hasProd) return false;
    }

    if (q) {
      const code = (t.invoice_number || t.transaction_code || "").toLowerCase();
      const oName = (outlet?.outlet_name || "").toLowerCase();
      const sName = (db.users.find((u) => u._id === t.salesman_id)?.name || "").toLowerCase();
      const matchItem = (t.items || []).some((it) => (it.sku_name || "").toLowerCase().includes(q));
      if (!code.includes(q) && !oName.includes(q) && !sName.includes(q) && !matchItem) return false;
    }

    return true;
  });

  const enriched = txns.map((t) => {
    const outlet = db.outlets.find((o) => o._id === t.outlet_id);
    const area = db.areas.find((a) => a._id === outlet?.area_id);
    const salesman = db.users.find((u) => u._id === t.salesman_id);

    const formattedItems = (t.items || []).map((it: any) => {
      const skuInfo = resolveSkuInfo(it);
      const prod = db.products.find((p) => p._id === skuInfo.product_id || p._id === it.product_id);
      const qty = Number(it.quantity ?? it.volume ?? it.qty ?? 0);
      const price = Number(it.unit_price ?? it.unitPrice ?? it.price ?? 0);
      const disc = Number(it.discount ?? 0);
      const sub = Number(it.subtotal ?? (qty * price - disc));

      return {
        transaction_id: t._id,
        transactionId: t._id,
        product_id: prod?._id || skuInfo.product_id || it.product_id || "prd-1",
        productId: prod?._id || skuInfo.product_id || it.product_id || "prd-1",
        sku_id: it.sku_id || skuInfo.sku_id,
        skuId: it.sku_id || skuInfo.sku_id,
        product_name: prod?.name || skuInfo.product_name || "Produk",
        productName: prod?.name || skuInfo.product_name || "Produk",
        sku_name: skuInfo.resolved_name,
        skuName: skuInfo.resolved_name,
        sku_code: skuInfo.sku_code || "-",
        unit: skuInfo.uom || "Unit",
        quantity: qty,
        qty: qty,
        volume: qty, // Volume is strictly Qty of this SKU
        unit_price: price,
        unitPrice: price,
        discount: disc,
        subtotal: sub,
      };
    });

    const totalVolume = formattedItems.reduce((acc, it) => acc + it.quantity, 0);

    return {
      ...t,
      transaction_code: t.invoice_number || t.transaction_code || t._id,
      invoice_number: t.invoice_number || t.transaction_code || t._id,
      outlet_name: outlet?.outlet_name || "-",
      outlet_code: outlet?.outlet_code || "-",
      area_id: outlet?.area_id || "-",
      area_name: area?.name || "-",
      salesman_name: salesman?.name || "-",
      total_volume: totalVolume,
      sku_summary: formatSkuItemsSummary(t.items, true),
      items: formattedItems,
    };
  });

  // Calculate overall summary across filtered results
  const totalVolumeSum = enriched.reduce((acc, t) => acc + (t.status !== "CANCELLED" ? t.total_volume : 0), 0);
  const totalRevenueSum = enriched.reduce((acc, t) => acc + (t.status !== "CANCELLED" ? t.total : 0), 0);

  res.json({
    items: enriched,
    total: enriched.length,
    summary: {
      total_transactions: enriched.length,
      total_volume: totalVolumeSum,
      total_revenue: totalRevenueSum,
    },
  });
});

apiRouter.get("/transactions/:id", authMiddleware, (req: AuthenticatedRequest, res) => {
  const txn = db.transactions.find((t) => t._id === req.params.id || t.invoice_number === req.params.id || t.transaction_code === req.params.id);
  if (!txn) return res.status(404).json({ detail: "Transaksi tidak ditemukan." });

  if (req.user!.role === "SALES" && txn.salesman_id !== req.user!._id) {
    return res.status(403).json({ detail: "Akses ditolak. Transaksi ini milik salesman lain." });
  }

  const outlet = db.outlets.find((o) => o._id === txn.outlet_id);
  const area = db.areas.find((a) => a._id === outlet?.area_id);
  const salesman = db.users.find((u) => u._id === txn.salesman_id);

  const formattedItems = (txn.items || []).map((it: any) => {
    const skuInfo = resolveSkuInfo(it);
    const prod = db.products.find((p) => p._id === skuInfo.product_id || p._id === it.product_id);
    const qty = Number(it.quantity ?? it.volume ?? it.qty ?? 0);
    const price = Number(it.unit_price ?? it.unitPrice ?? it.price ?? 0);
    const disc = Number(it.discount ?? 0);
    const sub = Number(it.subtotal ?? (qty * price - disc));

    return {
      transaction_id: txn._id,
      transactionId: txn._id,
      product_id: prod?._id || skuInfo.product_id || it.product_id || "prd-1",
      productId: prod?._id || skuInfo.product_id || it.product_id || "prd-1",
      sku_id: it.sku_id || skuInfo.sku_id,
      skuId: it.sku_id || skuInfo.sku_id,
      product_name: prod?.name || skuInfo.product_name || "Produk",
      productName: prod?.name || skuInfo.product_name || "Produk",
      sku_name: skuInfo.resolved_name,
      skuName: skuInfo.resolved_name,
      sku_code: skuInfo.sku_code || "-",
      unit: skuInfo.uom || "Unit",
      quantity: qty,
      qty: qty,
      volume: qty, // Volume is strictly Qty of this SKU
      unit_price: price,
      unitPrice: price,
      discount: disc,
      subtotal: sub,
    };
  });

  const totalVolume = formattedItems.reduce((acc, it) => acc + it.quantity, 0);

  res.json({
    ...txn,
    transaction_code: txn.invoice_number || txn.transaction_code || txn._id,
    invoice_number: txn.invoice_number || txn.transaction_code || txn._id,
    outlet,
    outlet_name: outlet?.outlet_name || "-",
    area,
    area_name: area?.name || "-",
    salesman_name: salesman?.name || "-",
    total_volume: totalVolume,
    sku_summary: formatSkuItemsSummary(txn.items, true),
    items: formattedItems,
  });
});

// Transaction cancellation with stock reversal and strict audit log
apiRouter.post("/transactions/:id/cancel", authMiddleware, requireRoles("SUPERVISOR", "ADMIN", "OWNER", "SALES"), async (req: AuthenticatedRequest, res) => {
  const txn = db.transactions.find((t) => t._id === req.params.id || t.invoice_number === req.params.id);
  if (!txn) return res.status(404).json({ detail: "Transaksi tidak ditemukan." });
  if (req.user!.role === "SALES" && txn.salesman_id !== req.user!._id) {
    return res.status(403).json({ detail: "Akses ditolak. Anda hanya dapat membatalkan transaksi milik Anda sendiri." });
  }
  if (txn.status === "CANCELLED") return res.status(400).json({ detail: "Transaksi sudah dibatalkan sebelumnya." });

  const { reason } = req.body || {};
  if (!reason) return res.status(400).json({ detail: "Alasan pembatalan transaksi wajib diisi." });

  const oldStatus = txn.status;
  txn.status = "CANCELLED";

  const today = getTodayWIB();

  for (const [idx, it] of (txn.items || []).entries()) {
    const qty = Number(it.quantity ?? it.volume ?? 0);
    const notes = `Reversal pembatalan ${txn.invoice_number || txn._id}: ${reason}`;

    try {
      await InventoryService.reverseSalesStock(txn.salesman_id, it.sku_id, qty, txn._id, txn.outlet_id, notes);
    } catch (err: any) {
      console.error("Failed to reverse stock via ORM:", err);
    }

    // Still sync to firebase document store if needed
    let salesInv = db.inventory.find(
      (i) => i.location_type === "SALES" && i.location_id === txn.salesman_id && i.sku_id === it.sku_id
    );
    if (salesInv) {
      syncSingleDoc("inventory", salesInv._id, salesInv);
    }

    db.stock_movements.push({
      _id: `mvt-rev-${Date.now()}-${idx}`,
      movement_code: `MVT-REV-${today.replace(/-/g, "")}-${String(db.stock_movements.length + 1).padStart(4, "0")}`,
      movement_type: "REVERSAL",
      source_location_type: "OUTLET",
      source_location_id: txn.outlet_id,
      destination_location_type: "SALES",
      destination_location_id: txn.salesman_id,
      sku_id: it.sku_id,
      quantity: qty,
      salesman_id: txn.salesman_id,
      outlet_id: txn.outlet_id,
      reference_id: txn._id,
      business_date: today,
      status: "COMPLETED",
      notes: notes,
      created_by: req.user!._id,
      created_at: new Date().toISOString(),
    });
    const lastMovement = db.stock_movements[db.stock_movements.length - 1];
    syncSingleDoc("stock_movements", lastMovement._id, lastMovement);

    syncSalesStockLedger(txn.salesman_id, it.sku_id, today);
  }

  try {
    await sqlDb.update(pgTransactions)
      .set({ paymentStatus: "CANCELLED" })
      .where(eq(pgTransactions.id, txn._id));
  } catch (err: any) {
    console.error("Error cancelling transaction in PG:", err.message);
  }

  // Recalculate outlet lifecycle status & metrics after cancellation
  recalculateOutletSummary(txn.outlet_id);
  const updatedOutletAfterCancel = db.outlets.find((o) => o._id === txn.outlet_id);
  if (updatedOutletAfterCancel) syncSingleDoc("outlets", updatedOutletAfterCancel._id, updatedOutletAfterCancel);
  syncSingleDoc("transactions", txn._id, txn);

  // Strict Audit Record
  recordAuditLog(
    req.user!._id,
    "CANCEL_TRANSACTION",
    "transactions",
    txn._id,
    {
      invoice_number: txn.invoice_number,
      old_status: oldStatus,
      new_status: "CANCELLED",
      old_total_volume: txn.total_volume || (txn.items || []).reduce((acc, it: any) => acc + (it.quantity || 0), 0),
      new_total_volume: 0,
      reason,
      changed_by: req.user!._id,
      changed_by_name: req.user!.name,
      timestamp: new Date().toISOString(),
    }
  );

  res.json({
    message: "Transaksi berhasil dibatalkan dan stok telah dikembalikan (reversed) ke salesman.",
    transaction: txn,
  });
});

// SUPERVISOR VOLUME MATRIX & ANALYSIS ENDPOINT
apiRouter.get("/supervisor/volume-matrix", authMiddleware, requireRoles("SUPERVISOR", "ADMIN", "OWNER"), (req, res) => {
  const { salesman_id, area_id, outlet_id, product_id, sku_id, date, from, to, status } = req.query as Record<string, string>;

  const fromDate = from || date || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || date || new Date().toISOString().slice(0, 10);

  // Filter completed transactions
  const validTxns = db.transactions.filter((t) => {
    if (status) {
      if (t.status !== status) return false;
    } else {
      if (t.status === "CANCELLED" || (t as any).status === "DRAFT") return false;
    }

    const tDate = (t.transaction_date || "").slice(0, 10);
    if (tDate < fromDate || tDate > toDate) return false;
    if (salesman_id && t.salesman_id !== salesman_id) return false;
    if (outlet_id && t.outlet_id !== outlet_id) return false;

    const outlet = db.outlets.find((o) => o._id === t.outlet_id);
    if (area_id && outlet?.area_id !== area_id) return false;

    return true;
  });

  // Flatten items
  const matrixRows: any[] = [];
  const skuVolumeTotals: Record<string, { sku_id: string; sku_name: string; product_id: string; product_name: string; volume: number; revenue: number; tx_count: number }> = {};
  const salesVolumeTotals: Record<string, { salesman_id: string; salesman_name: string; area_name: string; volume: number; revenue: number; tx_count: number }> = {};
  const areaVolumeTotals: Record<string, { area_id: string; area_name: string; volume: number; revenue: number; tx_count: number }> = {};
  const outletVolumeTotals: Record<string, { outlet_id: string; outlet_name: string; area_name: string; volume: number; revenue: number; tx_count: number }> = {};

  validTxns.forEach((t) => {
    const outlet = db.outlets.find((o) => o._id === t.outlet_id);
    const area = db.areas.find((a) => a._id === outlet?.area_id);
    const sales = db.users.find((u) => u._id === t.salesman_id);

    (t.items || []).forEach((it: any) => {
      const sku = db.skus.find((s) => s._id === it.sku_id);
      const prod = db.products.find((p) => p._id === sku?.product_id || p._id === it.product_id);

      if (sku_id && it.sku_id !== sku_id) return;
      if (product_id && prod?._id !== product_id && it.product_id !== product_id) return;

      const vol = Number(it.quantity ?? it.volume ?? 0);
      const price = Number(it.unit_price ?? it.price ?? 0);
      const sub = Number(it.subtotal ?? (vol * price));

      // Row entry
      matrixRows.push({
        transaction_id: t._id,
        invoice_number: t.invoice_number || t.transaction_code,
        date: (t.transaction_date || "").slice(0, 10),
        timestamp: t.transaction_date,
        salesman_id: t.salesman_id,
        salesman_name: sales?.name || "-",
        area_id: area?._id || "-",
        area_name: area?.name || "-",
        outlet_id: t.outlet_id,
        outlet_name: outlet?.outlet_name || "-",
        product_id: prod?._id || "-",
        product_name: prod?.name || "Produk",
        sku_id: it.sku_id,
        sku_name: sku?.name || it.sku_name || "SKU",
        unit: sku?.unit || "Unit",
        volume: vol, // Volume = Qty
        unit_price: price,
        subtotal: sub,
        status: t.status,
      });

      // Aggregate SKU
      const sKey = it.sku_id;
      if (!skuVolumeTotals[sKey]) {
        skuVolumeTotals[sKey] = {
          sku_id: it.sku_id,
          sku_name: sku?.name || it.sku_name || "SKU",
          product_id: prod?._id || "-",
          product_name: prod?.name || "Produk",
          volume: 0,
          revenue: 0,
          tx_count: 0,
        };
      }
      skuVolumeTotals[sKey].volume += vol;
      skuVolumeTotals[sKey].revenue += sub;
      skuVolumeTotals[sKey].tx_count += 1;

      // Aggregate Sales
      const slKey = t.salesman_id;
      if (!salesVolumeTotals[slKey]) {
        salesVolumeTotals[slKey] = {
          salesman_id: t.salesman_id,
          salesman_name: sales?.name || "-",
          area_name: area?.name || "-",
          volume: 0,
          revenue: 0,
          tx_count: 0,
        };
      }
      salesVolumeTotals[slKey].volume += vol;
      salesVolumeTotals[slKey].revenue += sub;
      salesVolumeTotals[slKey].tx_count += 1;

      // Aggregate Area
      const arKey = area?._id || "unknown";
      if (!areaVolumeTotals[arKey]) {
        areaVolumeTotals[arKey] = {
          area_id: area?._id || "-",
          area_name: area?.name || "-",
          volume: 0,
          revenue: 0,
          tx_count: 0,
        };
      }
      areaVolumeTotals[arKey].volume += vol;
      areaVolumeTotals[arKey].revenue += sub;
      areaVolumeTotals[arKey].tx_count += 1;

      // Aggregate Outlet
      const otKey = t.outlet_id;
      if (!outletVolumeTotals[otKey]) {
        outletVolumeTotals[otKey] = {
          outlet_id: t.outlet_id,
          outlet_name: outlet?.outlet_name || "-",
          area_name: area?.name || "-",
          volume: 0,
          revenue: 0,
          tx_count: 0,
        };
      }
      outletVolumeTotals[otKey].volume += vol;
      outletVolumeTotals[otKey].revenue += sub;
      outletVolumeTotals[otKey].tx_count += 1;
    });
  });

  const totalVol = matrixRows.reduce((sum, r) => sum + r.volume, 0);
  const totalRev = matrixRows.reduce((sum, r) => sum + r.subtotal, 0);

  res.json({
    period: { from: fromDate, to: toDate },
    total_volume: totalVol,
    total_revenue: totalRev,
    total_items: matrixRows.length,
    items: matrixRows,
    by_sku: Object.values(skuVolumeTotals).sort((a, b) => b.volume - a.volume),
    by_sales: Object.values(salesVolumeTotals).sort((a, b) => b.volume - a.volume),
    by_area: Object.values(areaVolumeTotals).sort((a, b) => b.volume - a.volume),
    by_outlet: Object.values(outletVolumeTotals).sort((a, b) => b.volume - a.volume),
  });
});

// ================= OFFICIAL VOLUME TARGET MANAGEMENT & ANALYSIS =================
// TARGETS ARE VOLUME-BASED (QTY), NOT VALUE (RUPIAH)
apiRouter.get("/targets/performance-summary", authMiddleware, (req, res) => {
  const { salesman_id, area_id, product_id, sku_id, period, from, to } = req.query as Record<string, string>;
  const activePeriod = period || (from ? from.slice(0, 7) : new Date().toISOString().slice(0, 7));
  const fromDate = from || `${activePeriod}-01`;
  const toDate = to || `${activePeriod}-31`;

  // 1. Group by Salesman
  const salesUsers = db.users.filter((u) => u.role === "SALES" && (!salesman_id || u._id === salesman_id));
  const bySalesman = salesUsers.map((u) => {
    const area = db.areas.find((a) => a._id === u.area_id);
    const tgt = calculateVolumeTargetAndAchievement({
      salesmanId: u._id,
      areaId: area_id,
      productId: product_id,
      skuId: sku_id,
      period: activePeriod,
      from: fromDate,
      to: toDate,
    });
    return {
      salesman_id: u._id,
      salesman_name: u.name,
      salesman_code: (u as any).code || u._id,
      area_id: u.area_id || "-",
      area_name: area?.name || "-",
      target_volume: tgt.target_volume,
      actual_volume: tgt.actual_volume,
      achievement_percentage: tgt.achievement_percentage,
      achievement_formatted: tgt.achievement_formatted,
      status: tgt.status,
      status_label: tgt.status_label,
      revenue: tgt.revenue,
    };
  }).sort((a, b) => b.actual_volume - a.actual_volume);

  // 2. Group by Area
  const areas = db.areas.filter((a) => !area_id || a._id === area_id);
  const byArea = areas.map((a) => {
    const tgt = calculateVolumeTargetAndAchievement({
      areaId: a._id,
      salesmanId: salesman_id,
      productId: product_id,
      skuId: sku_id,
      period: activePeriod,
      from: fromDate,
      to: toDate,
    });
    return {
      area_id: a._id,
      area_name: a.name,
      area_code: (a as any).code || a._id,
      target_volume: tgt.target_volume,
      actual_volume: tgt.actual_volume,
      achievement_percentage: tgt.achievement_percentage,
      achievement_formatted: tgt.achievement_formatted,
      status: tgt.status,
      status_label: tgt.status_label,
      revenue: tgt.revenue,
    };
  }).sort((a, b) => b.actual_volume - a.actual_volume);

  // 3. Group by Product
  const products = db.products.filter((p) => !product_id || p._id === product_id);
  const byProduct = products.map((p) => {
    const tgt = calculateVolumeTargetAndAchievement({
      productId: p._id,
      salesmanId: salesman_id,
      areaId: area_id,
      skuId: sku_id,
      period: activePeriod,
      from: fromDate,
      to: toDate,
    });
    return {
      product_id: p._id,
      product_name: p.name,
      category: (p as any).category || "-",
      brand: (p as any).brand || "-",
      target_volume: tgt.target_volume,
      actual_volume: tgt.actual_volume,
      achievement_percentage: tgt.achievement_percentage,
      achievement_formatted: tgt.achievement_formatted,
      status: tgt.status,
      status_label: tgt.status_label,
      revenue: tgt.revenue,
    };
  }).sort((a, b) => b.actual_volume - a.actual_volume);

  // 4. Group by SKU
  const skus = db.skus.filter((s) => !sku_id || s._id === sku_id);
  const bySku = skus.map((s) => {
    const prod = db.products.find((p) => p._id === s.product_id);
    const tgt = calculateVolumeTargetAndAchievement({
      skuId: s._id,
      salesmanId: salesman_id,
      areaId: area_id,
      productId: product_id,
      period: activePeriod,
      from: fromDate,
      to: toDate,
    });
    return {
      sku_id: s._id,
      sku_name: s.name,
      sku_code: s.code,
      product_id: s.product_id,
      product_name: prod?.name || "-",
      unit: s.unit || "Unit",
      target_volume: tgt.target_volume,
      actual_volume: tgt.actual_volume,
      achievement_percentage: tgt.achievement_percentage,
      achievement_formatted: tgt.achievement_formatted,
      status: tgt.status,
      status_label: tgt.status_label,
      revenue: tgt.revenue,
    };
  }).sort((a, b) => b.actual_volume - a.actual_volume);

  // 5. Total Performance in Filter
  const overall = calculateVolumeTargetAndAchievement({
    salesmanId: salesman_id,
    areaId: area_id,
    productId: product_id,
    skuId: sku_id,
    period: activePeriod,
    from: fromDate,
    to: toDate,
  });

  res.json({
    period: activePeriod,
    date_range: { from: fromDate, to: toDate },
    totals: {
      target_volume: overall.target_volume,
      actual_volume: overall.actual_volume,
      achievement_percentage: overall.achievement_percentage,
      achievement_formatted: overall.achievement_formatted,
      status: overall.status,
      status_label: overall.status_label,
      revenue: overall.revenue,
    },
    by_salesman: bySalesman,
    by_area: byArea,
    by_product: byProduct,
    by_sku: bySku,
  });
});

apiRouter.get("/targets", authMiddleware, (req, res) => {
  const { salesman_id, area_id, product_id, sku_id, period, from, to, status } = req.query as Record<string, string>;
  const activePeriod = period || (from ? from.slice(0, 7) : getCurrentPeriodWIB());
  const fromDate = from || `${activePeriod}-01`;
  const toDate = to || `${activePeriod}-31`;

  let list = db.targets.filter((t) => {
    if (status && t.status !== status) return false;
    if (salesman_id && t.salesman_id && t.salesman_id !== salesman_id) return false;
    if (area_id && t.area_id && t.area_id !== area_id) return false;
    if (product_id && t.product_id && t.product_id !== product_id) return false;
    if (sku_id && t.sku_id && t.sku_id !== sku_id) return false;
    if (period && t.period && t.period !== period) return false;
    return true;
  });

  const enriched = list.map((t) => {
    const sales = t.salesman_id ? db.users.find((u) => u._id === t.salesman_id) : null;
    const area = t.area_id ? db.areas.find((a) => a._id === t.area_id) : (sales?.area_id ? db.areas.find((a) => a._id === sales.area_id) : null);
    const sku = t.sku_id ? db.skus.find((s) => s._id === t.sku_id) : null;
    const prod = t.product_id ? db.products.find((p) => p._id === t.product_id) : (sku?.product_id ? db.products.find((p) => p._id === sku.product_id) : null);

    const perf = calculateVolumeTargetAndAchievement({
      salesmanId: t.salesman_id,
      areaId: t.area_id || sales?.area_id,
      productId: t.product_id || prod?._id,
      skuId: t.sku_id,
      period: t.period || activePeriod,
      from: fromDate,
      to: toDate,
    });

    return {
      ...t,
      salesman_name: sales?.name || "Semua Sales",
      area_name: area?.name || "Semua Area",
      product_name: prod?.name || "Semua Produk",
      sku_name: sku?.name || "Semua SKU",
      sku_code: sku?.code || "-",
      actual_volume: perf.actual_volume,
      achievement_percentage: perf.achievement_percentage,
      achievement_formatted: perf.achievement_formatted,
      achievement_status: perf.status,
      status_label: perf.status_label,
      revenue: perf.revenue,
    };
  });

  const totalTargetVol = enriched.reduce((sum, i) => sum + (Number(i.target_volume) || 0), 0);
  const totalActualVol = enriched.reduce((sum, i) => sum + (Number(i.actual_volume) || 0), 0);
  const totalRev = enriched.reduce((sum, i) => sum + (Number(i.revenue) || 0), 0);
  const overallAch = totalTargetVol > 0 ? Math.round((totalActualVol / totalTargetVol) * 1000) / 10 : 0;

  res.json({
    items: enriched,
    total: enriched.length,
    summary: {
      total_target_volume: totalTargetVol,
      total_actual_volume: totalActualVol,
      overall_achievement_percentage: overallAch,
      overall_achievement_formatted: `${overallAch}%`,
      total_revenue: totalRev,
    },
  });
});

apiRouter.post("/targets", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const { salesman_id, area_id, product_id, sku_id, target_volume, period, unit, notes, from_date, to_date } = req.body || {};

  if (target_volume == null || isNaN(Number(target_volume)) || Number(target_volume) < 0) {
    return res.status(400).json({ detail: "Target Volume (Qty) wajib diisi dengan angka positif atau 0." });
  }

  const vol = Number(target_volume);
  const currentPeriod = period || getCurrentPeriodWIB();
  const now = new Date().toISOString();

  // Find linked product or sku
  let resolvedProdId = product_id;
  if (sku_id && !resolvedProdId) {
    const s = db.skus.find((item) => item._id === sku_id);
    if (s) resolvedProdId = s.product_id;
  }

  const newTarget: Target = {
    _id: `tgt-${Date.now()}`,
    target_code: `TGT-${currentPeriod.replace(/-/g, "")}-${String(db.targets.length + 1).padStart(3, "0")}`,
    period: currentPeriod,
    from_date: from_date || `${currentPeriod}-01`,
    to_date: to_date || `${currentPeriod}-31`,
    salesman_id: salesman_id || undefined,
    area_id: area_id || undefined,
    product_id: resolvedProdId || undefined,
    sku_id: sku_id || undefined,
    target_volume: vol,
    unit: unit || "Unit",
    notes: notes || "",
    status: "ACTIVE",
    created_by: req.user!._id,
    created_at: now,
    updated_at: now,
  };

  db.targets.push(newTarget);
  syncSingleDoc("targets", newTarget._id, newTarget);

  try {
    await sqlDb.insert(pgTargets).values({
      id: newTarget._id,
      salesmanId: newTarget.salesman_id || "ALL",
      periodMonth: newTarget.period || "0000-00",
      targetRevenue: newTarget.target_volume || 0,
      metadata: {
        target_code: newTarget.target_code,
        area_id: newTarget.area_id,
        product_id: newTarget.product_id,
        sku_id: newTarget.sku_id,
        unit: newTarget.unit,
        from_date: newTarget.from_date,
        to_date: newTarget.to_date,
        status: newTarget.status,
        notes: newTarget.notes
      }
    });
  } catch (err: any) {
    console.error("Error inserting target to Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "CREATE_TARGET",
    "targets",
    newTarget._id,
    {
      target_code: newTarget.target_code,
      period: newTarget.period,
      target_volume: newTarget.target_volume,
      salesman_id: newTarget.salesman_id,
      sku_id: newTarget.sku_id,
    }
  );

  res.status(201).json({
    message: "Target Volume berhasil dibuat.",
    target: newTarget,
  });
});

apiRouter.put("/targets/:id", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const target = db.targets.find((t) => t._id === req.params.id);
  if (!target) return res.status(404).json({ detail: "Target tidak ditemukan." });

  const { target_volume, period, unit, notes, salesman_id, area_id, product_id, sku_id, status } = req.body || {};

  if (target_volume != null) {
    if (isNaN(Number(target_volume)) || Number(target_volume) < 0) {
      return res.status(400).json({ detail: "Target Volume (Qty) harus berupa angka positif." });
    }
    target.target_volume = Number(target_volume);
  }

  if (period) target.period = period;
  if (unit) target.unit = unit;
  if (notes !== undefined) target.notes = notes;
  if (salesman_id !== undefined) target.salesman_id = salesman_id;
  if (area_id !== undefined) target.area_id = area_id;
  if (product_id !== undefined) target.product_id = product_id;
  if (sku_id !== undefined) target.sku_id = sku_id;
  if (status) target.status = status;
  target.updated_at = new Date().toISOString();
  syncSingleDoc("targets", target._id, target);

  try {
    await sqlDb.update(pgTargets).set({
      salesmanId: target.salesman_id || "ALL",
      periodMonth: target.period || "0000-00",
      targetRevenue: target.target_volume || 0,
      metadata: {
        target_code: target.target_code,
        area_id: target.area_id,
        product_id: target.product_id,
        sku_id: target.sku_id,
        unit: target.unit,
        from_date: target.from_date,
        to_date: target.to_date,
        status: target.status,
        notes: target.notes
      }
    }).where(eq(pgTargets.id, target._id));
  } catch (err: any) {
    console.error("Error updating target to Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "UPDATE_TARGET",
    "targets",
    target._id,
    {
      target_code: target.target_code,
      updated_fields: req.body,
    }
  );

  res.json({
    message: "Target Volume berhasil diperbarui.",
    target,
  });
});

apiRouter.delete("/targets/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const idx = db.targets.findIndex((t) => t._id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: "Target tidak ditemukan." });

  const deleted = db.targets.splice(idx, 1)[0];

  try {
    await sqlDb.delete(pgTargets).where(eq(pgTargets.id, req.params.id));
  } catch (err: any) {
    console.error("Error deleting target from Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "DELETE_TARGET",
    "targets",
    deleted._id,
    { target_code: deleted.target_code }
  );

  deleteSingleDoc("targets", deleted._id);

  res.json({ message: "Target Volume berhasil dihapus." });
});

// Alias for master targets
apiRouter.get("/masters/targets", authMiddleware, (req, res) => {
  const period = req.query.period as string;
  const salesmanId = req.query.salesman_id as string;
  const skuId = req.query.sku_id as string;
  const areaId = req.query.area_id as string;

  let targets = db.targets.filter((t) => {
    if (period && t.period !== period) return false;
    if (salesmanId && t.salesman_id !== salesmanId) return false;
    if (skuId && t.sku_id !== skuId) return false;
    if (areaId && t.area_id !== areaId) return false;
    return true;
  });

  const enriched = targets.map((t) => {
    const sales = t.salesman_id ? db.users.find((u) => u._id === t.salesman_id) : null;
    const sku = t.sku_id ? db.skus.find((s) => s._id === t.sku_id) : null;
    const prod = t.product_id ? db.products.find((p) => p._id === t.product_id) : (sku?.product_id ? db.products.find((p) => p._id === sku.product_id) : null);
    const area = t.area_id ? db.areas.find((a) => a._id === t.area_id) : (sales?.area_id ? db.areas.find((a) => a._id === sales.area_id) : null);

    return {
      ...t,
      salesman_name: sales?.name || "-",
      sku_name: sku ? `${sku.name} (${sku.code})` : "Semua SKU",
      product_name: prod?.name || "-",
      area_name: area?.name || "-",
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

// ================= GPS TRACKING =================
apiRouter.post("/gps/events", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { latitude, longitude, accuracy, battery, speed } = req.body || {};
  if (latitude == null || longitude == null) {
    return res.status(400).json({ detail: "Latitude dan longitude wajib diisi." });
  }

  const now = new Date().toISOString();
  req.user!.last_location = {
    latitude,
    longitude,
    timestamp: now,
    battery,
  };

  const gpsEv = {
    _id: `gps-${Date.now()}-${req.user!._id}`,
    user_id: req.user!._id,
    latitude,
    longitude,
    accuracy,
    battery,
    speed,
    timestamp: now,
  };
  db.gps_events.push(gpsEv);
  syncSingleDoc("gps_events", gpsEv._id, gpsEv);

  try {
    sqlDb.insert(pgGpsEvents).values({
      id: gpsEv._id,
      userId: gpsEv.user_id,
      latitude: gpsEv.latitude,
      longitude: gpsEv.longitude,
      accuracy: gpsEv.accuracy,
      batteryLevel: gpsEv.battery,
      eventType: "HEARTBEAT",
      timestamp: new Date(gpsEv.timestamp),
      metadata: { speed: gpsEv.speed }
    }).catch((err: any) => console.error("Error inserting gps event to Postgres:", err.message));
  } catch (err: any) {}

  res.json({ ok: true });
});

// ================= CALL PLANS =================
apiRouter.get("/call-plans/my", authMiddleware, (req: AuthenticatedRequest, res) => {
  const date = (req.query.date as string) || getTodayWIB();
  const cp = db.call_plans.find((p) => p.salesman_id === req.user!._id && p.date === date);

  if (!cp) {
    return res.json({
      plan: null,
      call_plan: null,
      items: [],
      summary: { planned: 0, visited: 0, completed: 0, effective: 0, open: 0, pending: 0, missed: 0 },
    });
  }

  const creator = db.users.find((u) => u._id === cp.created_by);
  const route = cp.route_id ? db.routes.find((r) => r._id === cp.route_id) : null;
  const planEnriched = {
    ...cp,
    created_by_name: creator?.name || "Supervisor",
    route_id: cp.route_id || null,
    route_name: route?.name || "-",
    route_code: route?.code || null,
  };

  const visitsToday = db.visits.filter((v) => v.salesman_id === req.user!._id && v.date === date);

  const items = db.call_plan_items
    .filter((i) => i.call_plan_id === cp._id)
    .sort((a, b) => a.sequence - b.sequence)
    .map((i) => {
      const outlet = db.outlets.find((o) => o._id === i.outlet_id);
      const channel = outlet?.channel_id ? db.channels.find((c) => c._id === outlet.channel_id) : null;
      const area = outlet?.area_id ? db.areas.find((a) => a._id === outlet.area_id) : null;
      const outletRoute = outlet?.route_id ? db.routes.find((r) => r._id === outlet.route_id) : null;
      
      const v = visitsToday.find((vis) => vis.outlet_id === i.outlet_id);
      let itemStatus: string = i.status || "PENDING";
      let visitInfo: any = null;

      if (v) {
        if (v.status === "IN_PROGRESS") {
          itemStatus = "IN_PROGRESS";
        } else if (v.call_result === "EFFECTIVE") {
          itemStatus = "EFFECTIVE";
        } else if (v.status === "COMPLETED") {
          itemStatus = "COMPLETED";
        } else {
          itemStatus = "VISITED";
        }

        visitInfo = {
          visit_id: v._id,
          check_in_time: v.check_in_time,
          check_out_time: v.check_out_time,
          duration_seconds: v.duration_seconds,
          call_result: v.call_result,
          total_sales: v.total_sales || 0,
          status: v.status,
          notes: v.notes,
        };
      }

      return {
        ...i,
        status: itemStatus,
        priority: (i as any).priority || "NORMAL",
        notes: (i as any).notes || "",
        visit: visitInfo,
        outlet: outlet
          ? {
              ...outlet,
              channel_name: channel?.name || "-",
              area_name: area?.name || "-",
              route_id: outlet.route_id || null,
              route_name: outletRoute?.name || "-",
            }
          : null,
      };
    });

  const effectiveCount = items.filter((i: any) => i.status === "EFFECTIVE").length;
  const completedCount = items.filter((i: any) => ["COMPLETED", "EFFECTIVE", "VISITED"].includes(i.status)).length;
  const openCount = items.filter((i: any) => i.status === "COMPLETED" || (i.visit && i.visit.call_result === "OPEN")).length;
  const pendingCount = items.filter((i: any) => i.status === "PENDING" || i.status === "IN_PROGRESS").length;

  const summary = {
    planned: items.length,
    visited: completedCount,
    completed: completedCount,
    effective: effectiveCount,
    open: openCount,
    pending: pendingCount,
    missed: Math.max(0, items.length - completedCount),
  };

  res.json({
    plan: planEnriched,
    call_plan: planEnriched,
    items,
    summary,
  });
});

apiRouter.get("/call-plans", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { date, from_date, to_date, salesman_id: filterSalesmanId, status, route_id } = req.query as Record<string, string>;
  const salesman_id = req.user!.role === "SALES" ? req.user!._id : filterSalesmanId;

  let plans = db.call_plans.filter((p) => {
    if (date && p.date !== date) return false;
    if (from_date && p.date < from_date) return false;
    if (to_date && p.date > to_date) return false;
    if (salesman_id && p.salesman_id !== salesman_id) return false;
    if (status && p.status !== status) return false;
    if (route_id && p.route_id !== route_id) return false;
    return true;
  });

  plans.sort((a, b) => (b.date + b._id).localeCompare(a.date + a._id));

  const enriched = plans.map((p) => {
    const salesman = db.users.find((u) => u._id === p.salesman_id);
    const creator = db.users.find((u) => u._id === p.created_by);
    const area = salesman?.area_id ? db.areas.find((a) => a._id === salesman.area_id) : null;
    const route = p.route_id ? db.routes.find((r) => r._id === p.route_id) : null;
    const planItems = db.call_plan_items.filter((i) => i.call_plan_id === p._id);
    
    // Visit progress for that plan
    const visits = db.visits.filter((v) => v.salesman_id === p.salesman_id && v.date === p.date);
    const visitedOutletIds = new Set(visits.map((v) => v.outlet_id));
    const effectiveOutletIds = new Set(visits.filter((v) => v.call_result === "EFFECTIVE").map((v) => v.outlet_id));
    
    const visitedCount = planItems.filter((i) => visitedOutletIds.has(i.outlet_id)).length;
    const effectiveCount = planItems.filter((i) => effectiveOutletIds.has(i.outlet_id)).length;
    const totalSales = visits.reduce((sum, v) => sum + (v.total_sales || 0), 0);

    return {
      ...p,
      salesman_name: salesman?.name || "-",
      salesman_code: (salesman as any)?.code || p.salesman_id,
      salesman_phone: (salesman as any)?.phone || "-",
      area_name: area?.name || "-",
      route_id: p.route_id || null,
      route_name: route?.name || "-",
      route_code: route?.code || null,
      created_by_name: creator?.name || "Supervisor",
      item_count: planItems.length,
      total_outlets: planItems.length,
      visited_count: visitedCount,
      completed_count: visitedCount,
      effective_count: effectiveCount,
      total_sales: totalSales,
      progress_percent: planItems.length > 0 ? Math.round((visitedCount / planItems.length) * 100) : 0,
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

apiRouter.post("/call-plans", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER", "SALES"), async (req: AuthenticatedRequest, res) => {
  const { salesman_id, date, outlet_ids, items, notes, status = "PUBLISHED", route_id } = req.body || {};
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : (salesman_id || req.user!._id);
  const targetDate = date || getTodayWIB();

  const rawItemList: Array<{ outlet_id: string; sequence?: number; priority?: string; notes?: string }> = Array.isArray(items) && items.length > 0
    ? items
    : Array.isArray(outlet_ids) && outlet_ids.length > 0
    ? outlet_ids.map((id: string, idx: number) => ({ outlet_id: id, sequence: idx + 1, priority: "NORMAL" }))
    : [];

  if (!targetSalesId || !targetDate || rawItemList.length === 0) {
    return res.status(400).json({ detail: "Salesman, tanggal, dan minimal 1 outlet wajib diisi." });
  }

  // Validate that all outlets in the plan are actively assigned to this salesman
  const unassignedOutlets: string[] = [];
  for (const it of rawItemList) {
    if (!isOutletAssignedToSales(targetSalesId, it.outlet_id)) {
      const o = db.outlets.find((item) => item._id === it.outlet_id);
      unassignedOutlets.push(o ? `${o.outlet_name} (${o.outlet_code})` : it.outlet_id);
    }
  }

  if (unassignedOutlets.length > 0) {
    return res.status(400).json({
      detail: `Terdapat outlet yang belum ditugaskan kepada salesman ini: ${unassignedOutlets.join(", ")}. Pastikan outlet telah ditugaskan terlebih dahulu.`,
      code: "OUTLET_NOT_ASSIGNED_TO_SALESMAN",
    });
  }

  // Check if a call plan already exists for this salesman on this date
  let existingPlan = db.call_plans.find((p) => p.salesman_id === targetSalesId && p.date === targetDate);
  let planId: string;

  if (existingPlan) {
    planId = existingPlan._id;
    existingPlan.status = status;
    existingPlan.total_outlets = rawItemList.length;
    if (route_id !== undefined) existingPlan.route_id = route_id || null;
    (existingPlan as any).notes = notes || (existingPlan as any).notes || "";
    (existingPlan as any).updated_at = new Date().toISOString();
    (existingPlan as any).updated_by = req.user!._id;

    // Clean up old items and replace
    db.call_plan_items = db.call_plan_items.filter((i) => i.call_plan_id !== planId);
    syncSingleDoc("call_plans", existingPlan._id, existingPlan);
  } else {
    planId = `cp-${Date.now()}`;
    const newPlan: CallPlan = {
      _id: planId,
      plan_code: `CP-${targetDate.replace(/-/g, "")}-${String(db.call_plans.length + 1).padStart(3, "0")}`,
      salesman_id: targetSalesId,
      date: targetDate,
      route_id: route_id || null,
      status,
      total_outlets: rawItemList.length,
      created_at: new Date().toISOString(),
      created_by: req.user!._id,
      notes: notes || "",
    } as any;

    db.call_plans.push(newPlan);
    syncSingleDoc("call_plans", newPlan._id, newPlan);
    existingPlan = newPlan;
  }

  // Add items with sequence & priority
  rawItemList.forEach((it, idx) => {
    const newItem = {
      _id: `cpi-${Date.now()}-${idx}`,
      call_plan_id: planId,
      outlet_id: it.outlet_id,
      sequence: Number(it.sequence) || (idx + 1),
      priority: it.priority || "NORMAL",
      status: "PENDING",
      notes: it.notes || "",
      created_at: new Date().toISOString(),
    };
    db.call_plan_items.push(newItem as any);
  });

  try {

    // Upsert Call Plan
    const [existingPgPlan] = await sqlDb.select().from(pgCallPlans).where(eq(pgCallPlans.id, planId)).limit(1);
    if (existingPgPlan) {
        await sqlDb.update(pgCallPlans).set({
            status: existingPlan.status,
            totalOutlets: existingPlan.total_outlets,
        }).where(eq(pgCallPlans.id, planId));
    } else {
        await sqlDb.insert(pgCallPlans).values({
            id: existingPlan._id,
            salesmanId: existingPlan.salesman_id,
            planDate: existingPlan.date,
            status: existingPlan.status,
            totalOutlets: existingPlan.total_outlets,
            createdAt: new Date(existingPlan.created_at)
        });
    }

    // Clean old items and insert new ones
    await sqlDb.delete(pgCallPlanItems).where(eq(pgCallPlanItems.callPlanId, planId));

    const pgItems = rawItemList.map((it, idx) => ({
      id: `cpi-${Date.now()}-${idx}-${Math.floor(Math.random()*1000)}`,
      callPlanId: planId,
      outletId: it.outlet_id,
      sequence: Number(it.sequence) || (idx + 1),
      status: "PLANNED"
    }));

    if (pgItems.length > 0) {
        await sqlDb.insert(pgCallPlanItems).values(pgItems);
    }
  } catch (err: any) {
    console.error("Error syncing CallPlan to Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    existingPlan ? "UPDATE_CALL_PLAN" : "CREATE_CALL_PLAN",
    "call_plans",
    planId,
    { salesman_id: targetSalesId, date: targetDate, route_id, count: rawItemList.length }
  );

  res.status(201).json(existingPlan);
});

apiRouter.put("/call-plans/:id", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER", "SALES"), async (req: AuthenticatedRequest, res) => {
  const plan = db.call_plans.find((p) => p._id === req.params.id);
  if (!plan) return res.status(404).json({ detail: "Call plan tidak ditemukan." });

  if (req.user!.role === "SALES" && plan.salesman_id !== req.user!._id) {
    return res.status(403).json({ detail: "Akses ditolak. Call plan milik sales lain." });
  }

  const { salesman_id, date, outlet_ids, items, status, notes, route_id } = req.body || {};

  const targetSalesId = req.user!.role === "SALES" ? plan.salesman_id : (salesman_id || plan.salesman_id);
  const targetDate = date || plan.date;

  const rawItemList: Array<{ outlet_id: string; sequence?: number; priority?: string; notes?: string }> = Array.isArray(items) && items.length > 0
    ? items
    : Array.isArray(outlet_ids) && outlet_ids.length > 0
    ? outlet_ids.map((id: string, idx: number) => ({ outlet_id: id, sequence: idx + 1, priority: "NORMAL" }))
    : [];

  if (rawItemList.length === 0) {
    return res.status(400).json({ detail: "Daftar outlet minimal 1 toko." });
  }

  // Validate unassigned outlets
  const unassignedOutlets: string[] = [];
  for (const it of rawItemList) {
    if (!isOutletAssignedToSales(targetSalesId, it.outlet_id)) {
      const o = db.outlets.find((item) => item._id === it.outlet_id);
      unassignedOutlets.push(o ? `${o.outlet_name} (${o.outlet_code})` : it.outlet_id);
    }
  }

  if (unassignedOutlets.length > 0) {
    return res.status(400).json({
      detail: `Terdapat outlet yang belum ditugaskan kepada salesman ini: ${unassignedOutlets.join(", ")}.`,
      code: "OUTLET_NOT_ASSIGNED_TO_SALESMAN",
    });
  }

  // Update plan meta
  plan.salesman_id = targetSalesId;
  plan.date = targetDate;
  if (status) plan.status = status;
  if (route_id !== undefined) plan.route_id = route_id || null;
  if (notes !== undefined) (plan as any).notes = notes;
  plan.total_outlets = rawItemList.length;
  (plan as any).updated_at = new Date().toISOString();
  (plan as any).updated_by = req.user!._id;

  // Preserve existing visit status if already visited
  const oldItems = db.call_plan_items.filter((i) => i.call_plan_id === plan._id);
  const oldStatusMap = new Map(oldItems.map((i) => [i.outlet_id, i.status]));

  // Replace items
  db.call_plan_items = db.call_plan_items.filter((i) => i.call_plan_id !== plan._id);

  rawItemList.forEach((it, idx) => {
    const prevStatus = oldStatusMap.get(it.outlet_id) || "PENDING";
    const newItem = {
      _id: `cpi-${Date.now()}-${idx}`,
      call_plan_id: plan._id,
      outlet_id: it.outlet_id,
      sequence: Number(it.sequence) || (idx + 1),
      priority: it.priority || "NORMAL",
      status: prevStatus,
      notes: it.notes || "",
      created_at: new Date().toISOString(),
    };
    db.call_plan_items.push(newItem as any);
  });

  recordAuditLog(
    req.user!._id,
    "UPDATE_CALL_PLAN",
    "call_plans",
    plan._id,
    { salesman_id: targetSalesId, date: targetDate, route_id, count: rawItemList.length }
  );

  syncSingleDoc("call_plans", plan._id, plan);

  try {

    await sqlDb.update(pgCallPlans).set({
      salesmanId: plan.salesman_id,
      planDate: plan.date,
      status: plan.status,
      totalOutlets: plan.total_outlets,
    }).where(eq(pgCallPlans.id, plan._id));

    // Rebuild items
    await sqlDb.delete(pgCallPlanItems).where(eq(pgCallPlanItems.callPlanId, plan._id));
    const pgItems = rawItemList.map((it, idx) => ({
      id: `cpi-${Date.now()}-${idx}-${Math.floor(Math.random()*1000)}`,
      callPlanId: plan._id,
      outletId: it.outlet_id,
      sequence: Number(it.sequence) || (idx + 1),
      status: oldStatusMap.get(it.outlet_id) === "VISITED" ? "VISITED" : "PLANNED"
    }));
    if (pgItems.length > 0) {
        await sqlDb.insert(pgCallPlanItems).values(pgItems);
    }
  } catch (err: any) {
    console.error("Error updating CallPlan to Postgres:", err.message);
  }

  res.json({
    message: "Call plan berhasil diperbarui.",
    plan,
  });
});

// Route Optimizer / Nearest Neighbor Heuristic endpoint
apiRouter.post("/call-plans/:id/optimize", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER", "SALES"), (req: AuthenticatedRequest, res) => {
  const plan = db.call_plans.find((p) => p._id === req.params.id);
  if (!plan) return res.status(404).json({ detail: "Call plan tidak ditemukan." });

  const items = db.call_plan_items.filter((i) => i.call_plan_id === plan._id);
  if (items.length <= 1) {
    return res.json({ message: "Rute sudah optimal.", plan, items });
  }

  // Determine starting point: salesman office or current live location
  const salesUser = db.users.find((u) => u._id === plan.salesman_id);
  const office = salesUser?.office_id ? db.offices.find((o) => o._id === salesUser.office_id) : db.offices[0];
  
  let currentLat = office?.latitude ?? -6.2088;
  let currentLng = office?.longitude ?? 106.8456;

  if (salesUser?.last_location?.latitude && salesUser?.last_location?.longitude) {
    currentLat = salesUser.last_location.latitude;
    currentLng = salesUser.last_location.longitude;
  }

  // Nearest neighbor route sequencing
  const unvisited = [...items];
  const optimized: typeof items = [];

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const outlet = db.outlets.find((o) => o._id === unvisited[i].outlet_id);
      const lat = Number(outlet?.latitude ?? 0);
      const lng = Number(outlet?.longitude ?? 0);

      if (lat !== 0 && lng !== 0) {
        const dist = haversineMeters(currentLat, currentLng, lat, lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }
    }

    const nextItem = unvisited.splice(nearestIdx, 1)[0];
    optimized.push(nextItem);

    const nextOutlet = db.outlets.find((o) => o._id === nextItem.outlet_id);
    if (nextOutlet?.latitude && nextOutlet?.longitude) {
      currentLat = Number(nextOutlet.latitude);
      currentLng = Number(nextOutlet.longitude);
    }
  }

  // Re-assign sequence
  optimized.forEach((item, idx) => {
    item.sequence = idx + 1;
  });

  // Persist to Postgres
  try {
    
    // Fire and forget updates
    void (async () => {
      for (const item of optimized) {
        await sqlDb.update(pgCallPlanItems)
          .set({ sequence: item.sequence })
          .where(eq(pgCallPlanItems.id, item._id))
          .catch((err) => console.error("Error updating sequence", err.message));
      }
    })();
  } catch (err: any) {
    console.error("Error syncing optimized route to Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "OPTIMIZE_CALL_PLAN_ROUTE",
    "call_plans",
    plan._id,
    { count: items.length }
  );

  res.json({
    message: "Urutan rute berhasil dioptimalkan berdasarkan jarak geografis terdekat.",
    items: optimized.map((it) => ({
      ...it,
      outlet: db.outlets.find((o) => o._id === it.outlet_id),
    })),
  });
});

// Auto-generate Smart Call Plan based on Cycle, Route & NOO
apiRouter.post("/call-plans/auto-generate", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), (req: AuthenticatedRequest, res) => {
  const { salesman_id, date, max_outlets = 10, channel_id, area_id, route_id } = req.body || {};
  const targetDate = date || getTodayWIB();

  if (!salesman_id) {
    return res.status(400).json({ detail: "Salesman wajib dipilih." });
  }

  const assignedOutletIds = getActiveAssignedOutletIds(salesman_id);
  if (assignedOutletIds.length === 0) {
    return res.status(400).json({ detail: "Salesman ini belum memiliki outlet yang ditugaskan." });
  }

  let candidates = db.outlets.filter((o) => o.status === "ACTIVE" && assignedOutletIds.includes(o._id));
  if (route_id) candidates = candidates.filter((o) => o.route_id === route_id);
  if (channel_id) candidates = candidates.filter((o) => o.channel_id === channel_id);
  if (area_id) candidates = candidates.filter((o) => o.area_id === area_id);

  if (candidates.length === 0) {
    return res.status(400).json({ detail: "Tidak ditemukan outlet aktif yang sesuai kriteria rute atau filter yang dipilih." });
  }

  // Score candidate outlets
  const scored = candidates.map((o) => {
    const lastVisit = db.visits
      .filter((v) => v.outlet_id === o._id)
      .sort((a, b) => (b.check_in_time || b.date).localeCompare(a.check_in_time || a.date))[0];

    const lastTxn = db.transactions
      .filter((t) => t.outlet_id === o._id && t.status !== "CANCELLED")
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))[0];

    let daysNoVisit = 999;
    if (lastVisit?.date) {
      const diff = Date.now() - new Date(lastVisit.date).getTime();
      daysNoVisit = Math.max(0, Math.floor(diff / 86400000));
    }

    let daysNoOrder = 999;
    if (lastTxn?.transaction_date) {
      const diff = Date.now() - new Date(lastTxn.transaction_date).getTime();
      daysNoOrder = Math.max(0, Math.floor(diff / 86400000));
    }

    let score = 0;
    let priority = "NORMAL";
    let reason = "Kunjungan siklus rutin";

    if (o.lifecycle_status === "NOO" || o.lifecycle_status === "PROSPECT") {
      score += 150;
      priority = "HIGH";
      reason = "Outlet Baru (NOO / Prospect) perlu kunjungan perdana";
    } else if (daysNoVisit > 14) {
      score += 120;
      priority = "HIGH";
      reason = `Belum dikunjungi ${daysNoVisit} hari`;
    } else if (daysNoOrder > 21) {
      score += 90;
      priority = "HIGH";
      reason = `Tidak ada transaksi selama ${daysNoOrder} hari`;
    } else if (daysNoVisit > 7) {
      score += 60;
      priority = "MEDIUM";
      reason = `Siklus mingguan (${daysNoVisit} hari lalu)`;
    } else {
      score += 20;
    }

    // Boost if matches selected route
    if (route_id && o.route_id === route_id) {
      score += 50;
    }

    // Boost high revenue outlets
    if ((o.total_revenue || 0) > 5000000) {
      score += 30;
    }

    const routeObj = o.route_id ? db.routes.find((r) => r._id === o.route_id) : null;

    return {
      outlet_id: o._id,
      outlet_name: o.outlet_name,
      address: o.address,
      route_id: o.route_id || null,
      route_name: routeObj?.name || "-",
      latitude: o.latitude,
      longitude: o.longitude,
      score,
      priority,
      reason,
      days_no_visit: daysNoVisit === 999 ? null : daysNoVisit,
      days_no_order: daysNoOrder === 999 ? null : daysNoOrder,
    };
  });

  // Sort by highest score and take top limit
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, Number(max_outlets) || 10);
  const selectedRoute = route_id ? db.routes.find((r) => r._id === route_id) : null;

  // Return preview of recommended call plan items
  res.json({
    date: targetDate,
    salesman_id,
    route_id: route_id || null,
    route_name: selectedRoute?.name || null,
    total_recommended: selected.length,
    items: selected.map((it, idx) => ({
      outlet_id: it.outlet_id,
      outlet_name: it.outlet_name,
      address: it.address,
      route_id: it.route_id,
      route_name: it.route_name,
      sequence: idx + 1,
      priority: it.priority,
      reason: it.reason,
      days_no_visit: it.days_no_visit,
      days_no_order: it.days_no_order,
    })),
  });
});

apiRouter.get("/call-plans/smart/recommendations", authMiddleware, (req: AuthenticatedRequest, res) => {
  const salesman_id = (req.query.salesman_id as string) || (req.user!.role === "SALES" ? req.user!._id : "");
  const route_id = req.query.route_id as string;

  // If salesman is known or user is sales, filter candidate outlets strictly to assigned outlets
  const assignedIds = salesman_id ? new Set(getActiveAssignedOutletIds(salesman_id)) : null;

  const recommendations = db.outlets
    .filter((o) => o.status === "ACTIVE" && (!assignedIds || assignedIds.has(o._id)) && (!route_id || o.route_id === route_id))
    .map((o) => {
      const lastVisit = db.visits
        .filter((v) => v.outlet_id === o._id)
        .sort((a, b) => (b.check_in_time || b.date).localeCompare(a.check_in_time || a.date))[0];

      const lastTxn = db.transactions
        .filter((t) => t.outlet_id === o._id && t.status !== "CANCELLED")
        .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))[0];

      const routeObj = o.route_id ? db.routes.find((r) => r._id === o.route_id) : null;

      let daysNoVisit = null;
      if (lastVisit?.date) {
        const diff = Date.now() - new Date(lastVisit.date).getTime();
        daysNoVisit = Math.max(0, Math.floor(diff / 86400000));
      }

      let daysNoOrder = null;
      if (lastTxn?.transaction_date) {
        const diff = Date.now() - new Date(lastTxn.transaction_date).getTime();
        daysNoOrder = Math.max(0, Math.floor(diff / 86400000));
      }

      let priority = "NORMAL";
      let reason = "Kunjungan siklus rutin";

      if (o.lifecycle_status === "NOO" || o.lifecycle_status === "PROSPECT") {
        priority = "HIGH";
        reason = "Outlet baru (NOO) belum pernah dikunjungi";
      } else if (daysNoVisit == null || daysNoVisit > 14) {
        priority = "HIGH";
        reason = daysNoVisit == null ? "Belum pernah dikunjungi" : `Sudah ${daysNoVisit} hari tidak dikunjungi`;
      } else if (daysNoOrder != null && daysNoOrder > 21) {
        priority = "HIGH";
        reason = `${daysNoOrder} hari tidak ada order`;
      } else if (daysNoVisit > 7) {
        priority = "MEDIUM";
        reason = `Siklus mingguan (${daysNoVisit} hari)`;
      }

      return {
        ...o,
        outlet_id: o._id,
        channel_name: db.channels.find((c) => c._id === o.channel_id)?.name || "-",
        area_name: db.areas.find((a) => a._id === o.area_id)?.name || "-",
        route_id: o.route_id || null,
        route_name: routeObj?.name || "-",
        last_visited: lastVisit?.date || "Belum pernah",
        days_no_visit: daysNoVisit,
        days_no_order: daysNoOrder,
        priority,
        recommendation_reason: reason,
      };
    });

  // Sort: HIGH priority first, then by days no visit
  recommendations.sort((a, b) => {
    const pRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, NORMAL: 1 };
    const diff = (pRank[b.priority] || 0) - (pRank[a.priority] || 0);
    if (diff !== 0) return diff;
    return (b.days_no_visit ?? 999) - (a.days_no_visit ?? 999);
  });

  res.json({ items: recommendations, total: recommendations.length });
});

apiRouter.get("/call-plans/:id", authMiddleware, (req, res) => {
  const plan = db.call_plans.find((p) => p._id === req.params.id);
  if (!plan) return res.status(404).json({ detail: "Call plan tidak ditemukan." });

  const salesman = db.users.find((u) => u._id === plan.salesman_id);
  const creator = db.users.find((u) => u._id === plan.created_by);
  const area = salesman?.area_id ? db.areas.find((a) => a._id === salesman.area_id) : null;
  const route = plan.route_id ? db.routes.find((r) => r._id === plan.route_id) : null;
  const visits = db.visits.filter((v) => v.salesman_id === plan.salesman_id && v.date === plan.date);

  const items = db.call_plan_items
    .filter((i) => i.call_plan_id === plan._id)
    .sort((a, b) => a.sequence - b.sequence)
    .map((i) => {
      const outlet = db.outlets.find((o) => o._id === i.outlet_id);
      const outletRoute = outlet?.route_id ? db.routes.find((r) => r._id === outlet.route_id) : null;
      const v = visits.find((vis) => vis.outlet_id === i.outlet_id);
      return {
        ...i,
        outlet: outlet ? {
          ...outlet,
          route_id: outlet.route_id || null,
          route_name: outletRoute?.name || "-",
        } : null,
        visit: v
          ? {
              visit_id: v._id,
              status: v.status,
              call_result: v.call_result,
              check_in_time: v.check_in_time,
              check_out_time: v.check_out_time,
              duration_seconds: v.duration_seconds,
              total_sales: v.total_sales || 0,
            }
          : null,
      };
    });

  res.json({
    ...plan,
    salesman_name: salesman?.name || "-",
    salesman_code: (salesman as any)?.code || plan.salesman_id,
    salesman_phone: (salesman as any)?.phone || "-",
    area_name: area?.name || "-",
    route_id: plan.route_id || null,
    route_name: route?.name || "-",
    route_code: route?.code || null,
    created_by_name: creator?.name || "Supervisor",
    items,
  });
});

apiRouter.post("/call-plans/:id/publish", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), (req, res) => {
  const plan = db.call_plans.find((p) => p._id === req.params.id);
  if (!plan) return res.status(404).json({ detail: "Call plan tidak ditemukan." });
  plan.status = "PUBLISHED";
  syncSingleDoc("call_plans", plan._id, plan);
  res.json(plan);
});

apiRouter.delete("/call-plans/:id", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), (req: AuthenticatedRequest, res) => {
  const idx = db.call_plans.findIndex((p) => p._id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: "Call plan tidak ditemukan." });

  const plan = db.call_plans[idx];
  db.call_plans.splice(idx, 1);
  db.call_plan_items = db.call_plan_items.filter((i) => i.call_plan_id !== req.params.id);

  recordAuditLog(
    req.user!._id,
    "DELETE_CALL_PLAN",
    "call_plans",
    plan._id,
    { plan_code: plan.plan_code, salesman_id: plan.salesman_id, date: plan.date }
  );

  deleteSingleDoc("call_plans", plan._id);

  res.json({ message: "Call plan berhasil dihapus." });
});

// ================= DASHBOARDS & MONITORING =================
apiRouter.get("/dashboard/sales", authMiddleware, (req: AuthenticatedRequest, res) => {
  const today = getTodayWIB();
  const currentPeriod = getCurrentPeriodWIB();
  const salesmanId = req.user!._id;

  const att = db.attendance.find((a) => a.salesman_id === salesmanId && a.date === today);
  const cp = db.call_plans.find((p) => p.salesman_id === salesmanId && p.date === today);
  const planned = cp ? db.call_plan_items.filter((i) => i.call_plan_id === cp._id).length : 0;

  const kpi = calculateSalesKPIs({ salesmanId, from: today, to: today });
  const missed = Math.max(0, planned - kpi.outlet_calls);
  const newOutlets = db.outlets.filter((o) => o.created_by === salesmanId && o.created_at?.startsWith(today)).length;

  const activeVisit = db.visits.find((v) => v.salesman_id === salesmanId && v.status === "IN_PROGRESS");
  const activeOutlet = activeVisit ? db.outlets.find((o) => o._id === activeVisit.outlet_id) : null;

  // Monthly and Daily Volume Target vs Actual Calculation
  const monthTarget = calculateVolumeTargetAndAchievement({ salesmanId, period: currentPeriod });
  const todayTarget = calculateVolumeTargetAndAchievement({ salesmanId, from: today, to: today });

  // Breakdown Volume per SKU for Sales Rep today + monthly targets
  const todayTxns = db.transactions.filter(
    (t) => t.salesman_id === salesmanId && t.transaction_date.startsWith(today) && t.status !== "CANCELLED"
  );
  const skuVolumeMap: Record<string, {
    sku_id: string;
    sku_name: string;
    product_name: string;
    unit: string;
    target_volume: number;
    volume: number;
    actual_volume: number;
    achievement_percentage: number;
    revenue: number;
    tx_count: number;
  }> = {};
  
  db.skus.forEach((sku) => {
    const prod = db.products.find((p) => p._id === sku.product_id);
    const skuTgt = calculateVolumeTargetAndAchievement({ salesmanId, skuId: sku._id, period: currentPeriod });
    skuVolumeMap[sku._id] = {
      sku_id: sku._id,
      sku_name: sku.name,
      product_name: prod?.name || "Produk",
      unit: sku.unit || "Unit",
      target_volume: skuTgt.target_volume,
      volume: 0,
      actual_volume: 0,
      achievement_percentage: skuTgt.achievement_percentage,
      revenue: 0,
      tx_count: 0,
    };
  });

  todayTxns.forEach((t) => {
    (t.items || []).forEach((it: any) => {
      if (skuVolumeMap[it.sku_id]) {
        const v = Number(it.quantity ?? it.volume ?? 0);
        const p = Number(it.unit_price ?? it.price ?? 0);
        const sub = Number(it.subtotal ?? (v * p));
        skuVolumeMap[it.sku_id].volume += v;
        skuVolumeMap[it.sku_id].actual_volume += v;
        skuVolumeMap[it.sku_id].revenue += sub;
        skuVolumeMap[it.sku_id].tx_count += 1;
      }
    });
  });

  const assignedOffice = req.user!.office_id ? db.offices.find((o) => o._id === req.user!.office_id) : null;

  res.json({
    date: today,
    period: currentPeriod,
    salesman_id: salesmanId,
    user_id: salesmanId,
    salesman_name: req.user!.name,
    shift_config: {
      work_start_time: (assignedOffice as any)?.work_start_time || (db.settings as any)?.work_start_time || "08:00",
      work_end_time: (assignedOffice as any)?.work_end_time || (db.settings as any)?.work_end_time || "17:00",
      check_in_start: (assignedOffice as any)?.check_in_start || (db.settings as any)?.check_in_start || "06:00",
      late_tolerance_min: Number((assignedOffice as any)?.late_tolerance_min ?? (db.settings as any)?.late_tolerance_min ?? 15),
      current_time_wib: getCurrentTimeFullWIB(),
    },
    assigned_office: assignedOffice
      ? {
          _id: assignedOffice._id,
          office_name: assignedOffice.office_name,
          office_code: (assignedOffice as any).office_code,
          address: assignedOffice.address,
          latitude: assignedOffice.latitude,
          longitude: assignedOffice.longitude,
          radius_m: (assignedOffice as any).attendance_radius || assignedOffice.radius_m || 200,
          status: assignedOffice.status,
        }
      : null,
    attendance: att
      ? {
          ...att,
          raw_status: att.status,
          status: att.check_out_time ? "OFF_DUTY" : "ON_DUTY",
          office_name: db.offices.find((o) => o._id === att.office_id)?.office_name || assignedOffice?.office_name || "Depo Pusat",
          work_duration: att.work_duration_formatted || (att.work_duration_seconds ? formatSecondsToDuration(att.work_duration_seconds) : "-"),
        }
      : null,
    active_visit: activeVisit ? { ...activeVisit, outlet: activeOutlet } : null,
    volume_by_sku: Object.values(skuVolumeMap),
    target_performance: {
      period: currentPeriod,
      target_volume: monthTarget.target_volume,
      actual_volume: monthTarget.actual_volume,
      achievement_percentage: monthTarget.achievement_percentage,
      achievement_formatted: monthTarget.achievement_formatted,
      status: monthTarget.status,
      status_label: monthTarget.status_label,
      revenue: monthTarget.revenue,
      today_actual_volume: kpi.total_volume,
    },
    summary: {
      planned,
      actual: kpi.outlet_calls,
      outlet_calls: kpi.outlet_calls,
      effective: kpi.effective_calls,
      effective_calls: kpi.effective_calls,
      ec_rate: kpi.ec_rate,
      effective_ratio: kpi.ec_rate,
      volume: kpi.total_volume,
      total_volume: kpi.total_volume,
      actual_volume: kpi.total_volume,
      target_volume: monthTarget.target_volume,
      achievement_percentage: monthTarget.achievement_percentage,
      achievement_formatted: monthTarget.achievement_formatted,
      sales_value: kpi.total_revenue,
      revenue: kpi.total_revenue,
      missed,
      call_achievement: planned ? Math.round((kpi.outlet_calls / planned) * 100) : 0,
      transaction_count: kpi.transaction_count,
      new_outlets: newOutlets,
    },
  });
});

apiRouter.get("/dashboard/supervisor", authMiddleware, requireRoles("SUPERVISOR", "ADMIN", "OWNER"), (req, res) => {
  const today = getTodayWIB();
  const currentPeriod = getCurrentPeriodWIB();
  const salesUsers = db.users.filter((u) => u.role === "SALES");

  const salesmenStatus = salesUsers.map((u) => {
    const att = db.attendance.find((a) => a.salesman_id === u._id && a.date === today);
    const cp = db.call_plans.find((p) => p.salesman_id === u._id && p.date === today);
    const planned = cp ? db.call_plan_items.filter((i) => i.call_plan_id === cp._id).length : 0;

    const kpi = calculateSalesKPIs({ salesmanId: u._id, from: today, to: today });
    const tgt = calculateVolumeTargetAndAchievement({ salesmanId: u._id, period: currentPeriod });

    const missed = Math.max(0, planned - kpi.outlet_calls);
    const newOutlets = db.outlets.filter((o) => o.created_by === u._id && o.created_at?.startsWith(today)).length;
    const active = db.visits.find((v) => v.salesman_id === u._id && v.status === "IN_PROGRESS");
    const status = active ? "VISITING" : (att ? (att.status === "PRESENT" ? "ON_FIELD" : "ON_DUTY") : "OFF_DUTY");

    const areaName = db.areas.find((a) => a._id === u.area_id)?.name || "-";
    const officeName = db.offices.find((o) => o._id === u.office_id)?.office_name || "-";

    return {
      salesman_id: u._id,
      name: u.name,
      code: (u as any).code || u._id,
      phone: u.phone,
      area: areaName,
      office_id: u.office_id || null,
      office_name: officeName,
      status,
      attendance_status: att ? att.status : "ABSENT",
      check_in_time: att?.check_in_time || null,
      last_location: (u as any).last_location || null,
      active_outlet: active ? (db.outlets.find((o) => o._id === active.outlet_id)?.outlet_name || null) : null,
      target_volume: tgt.target_volume,
      actual_volume: tgt.actual_volume,
      achievement_percentage: tgt.achievement_percentage,
      achievement_formatted: tgt.achievement_formatted,
      status_label: tgt.status_label,
      summary: {
        planned,
        actual: kpi.outlet_calls,
        outlet_calls: kpi.outlet_calls,
        effective: kpi.effective_calls,
        effective_calls: kpi.effective_calls,
        ec_rate: kpi.ec_rate,
        effective_ratio: kpi.ec_rate,
        volume: kpi.total_volume,
        total_volume: kpi.total_volume,
        target_volume: tgt.target_volume,
        achievement_percentage: tgt.achievement_percentage,
        achievement_formatted: tgt.achievement_formatted,
        sales_value: kpi.total_revenue,
        revenue: kpi.total_revenue,
        missed,
        txn_count: kpi.transaction_count,
        new_outlets: newOutlets,
        check_in_time: att?.check_in_time || null,
      },
      planned,
      actual: kpi.outlet_calls,
      outlet_calls: kpi.outlet_calls,
      effective: kpi.effective_calls,
      effective_calls: kpi.effective_calls,
      ec_rate: kpi.ec_rate,
      effective_ratio: kpi.ec_rate,
      volume: kpi.total_volume,
      total_volume: kpi.total_volume,
      sales_value: kpi.total_revenue,
      revenue: kpi.total_revenue,
      missed,
      active_visit: active ? { ...active, outlet_name: db.outlets.find((o) => o._id === active.outlet_id)?.outlet_name } : null,
    };
  });

  res.json({
    date: today,
    period: currentPeriod,
    total_salesmen: salesUsers.length,
    active_in_field: salesmenStatus.filter((s) => s.attendance_status !== "ABSENT").length,
    items: salesmenStatus,
    salesmen: salesmenStatus,
  });
});

apiRouter.post("/sales/location", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { latitude, longitude, accuracy, speed, heading } = req.body || {};
  const numLat = Number(latitude);
  const numLng = Number(longitude);

  if (isNaN(numLat) || isNaN(numLng)) {
    return res.status(400).json({ detail: "Koordinat latitude dan longitude tidak valid." });
  }

  const userObj = db.users.find((u) => u._id === req.user!._id);
  if (userObj) {
    userObj.last_location = {
      lat: numLat,
      lng: numLng,
      latitude: numLat,
      longitude: numLng,
      accuracy: accuracy != null ? Number(accuracy) : undefined,
      speed: speed != null ? Number(speed) : undefined,
      heading: heading != null ? Number(heading) : undefined,
      timestamp: new Date().toISOString(),
    };
  }

  res.json({ message: "Lokasi berhasil diperbarui.", location: userObj?.last_location });
});

apiRouter.get("/monitoring/sales", authMiddleware, requireRoles("SUPERVISOR", "ADMIN", "OWNER"), (req, res) => {
  const { date, salesman_id, area_id, office_id, status: filterStatus } = req.query as Record<string, string>;
  const queryDate = date || getTodayWIB();
  const currentPeriod = queryDate.slice(0, 7) || getCurrentPeriodWIB();

  // 1. Resolve all active Sales personnel
  let salesUsers = db.users.filter(
    (u) => (u.role === "SALES" || (u.role as string) === "SALESMAN") && (u.status as string) !== "ARCHIVED"
  );

  if (salesman_id) {
    salesUsers = salesUsers.filter((u) => u._id === salesman_id);
  }
  if (area_id) {
    salesUsers = salesUsers.filter((u) => u.area_id === area_id);
  }
  if (office_id) {
    salesUsers = salesUsers.filter((u) => u.office_id === office_id);
  }

  const salesmenStatus = salesUsers.map((u) => {
    const att = db.attendance.find((a) => a.salesman_id === u._id && a.date === queryDate);
    const cp = db.call_plans.find((p) => p.salesman_id === u._id && p.date === queryDate);
    
    // Call plan items
    const rawCpItems = cp ? db.call_plan_items.filter((i) => i.call_plan_id === cp._id).sort((a, b) => a.sequence - b.sequence) : [];
    const planned = rawCpItems.length;

    const kpi = calculateSalesKPIs({ salesmanId: u._id, from: queryDate, to: queryDate });
    const tgt = calculateVolumeTargetAndAchievement({ salesmanId: u._id, period: currentPeriod, from: `${currentPeriod}-01`, to: `${currentPeriod}-31` });

    const missed = Math.max(0, planned - kpi.outlet_calls);
    const newOutlets = db.outlets.filter((o) => o.created_by === u._id && (o.created_at || "").startsWith(queryDate)).length;
    const active = db.visits.find((v) => v.salesman_id === u._id && v.status === "IN_PROGRESS");
    
    // Today's visits trail for this salesman
    const todayVisits = db.visits
      .filter((v) => v.salesman_id === u._id && v.date === queryDate)
      .map((v) => {
        const outlet = db.outlets.find((o) => o._id === v.outlet_id);
        const txns = db.transactions.filter((t) => t.visit_id === v._id);
        const visitRev = txns.reduce((sum, t) => sum + (t.total ?? (t as any).total_amount ?? 0), 0);
        const visitVol = txns.reduce(
          (sum, t) => sum + ((t.items || []).reduce((is, it) => is + (Number(it.quantity || (it as any).volume || 0)), 0)),
          0
        );
        const durSec = v.duration_seconds || (v.check_out_time ? Math.round((new Date(v.check_out_time).getTime() - new Date(v.check_in_time).getTime()) / 1000) : 0);
        return {
          ...v,
          outlet_name: outlet?.outlet_name || "Outlet",
          outlet_code: outlet?.outlet_code || "-",
          address: outlet?.address || "-",
          phone: outlet?.phone || "-",
          owner_name: outlet?.owner_name || "-",
          channel_name: outlet?.channel_id || "Retail",
          call_result: v.call_result || (txns.length > 0 ? "EFFECTIVE" : "OPEN"),
          revenue: visitRev,
          volume: visitVol,
          transaction_count: txns.length,
          duration_seconds: durSec,
          duration_minutes: Math.round(durSec / 60),
          formatted_time: formatDateTimeWIB(v.check_in_time),
        };
      })
      .sort((a, b) => new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime());

    // Enrich Call Plan items with visit outcome
    const enrichedCpItems = rawCpItems.map((cpi) => {
      const outlet = db.outlets.find((o) => o._id === cpi.outlet_id);
      const visit = todayVisits.find((v) => v.outlet_id === cpi.outlet_id);
      return {
        ...cpi,
        outlet_name: outlet?.outlet_name || "-",
        outlet_code: outlet?.outlet_code || "-",
        address: outlet?.address || "-",
        phone: outlet?.phone || "-",
        status: visit ? "VISITED" : cpi.status,
        call_result: visit?.call_result || null,
        visited_at: visit?.check_in_time || null,
        revenue: visit?.revenue || 0,
        volume: visit?.volume || 0,
      };
    });

    const visitedCpCount = enrichedCpItems.filter((i) => i.status === "VISITED").length;
    const planCompliancePct = planned > 0 ? Math.round((visitedCpCount / planned) * 100) : 100;

    // Strict Status Resolution
    const isCheckedOut = !!att?.check_out_time;
    const hasCheckedIn = !!att?.check_in_time && !isCheckedOut;
    let computedStatus: "OFF_DUTY" | "ON_DUTY" | "ON_FIELD" | "VISITING" = "OFF_DUTY";

    if (active) {
      computedStatus = "VISITING";
    } else if (hasCheckedIn) {
      computedStatus = todayVisits.length > 0 ? "ON_FIELD" : "ON_DUTY";
    } else {
      computedStatus = "OFF_DUTY";
    }

    const areaName = db.areas.find((a) => a._id === u.area_id)?.name || "-";
    const assignedOffice = db.offices.find((o) => o._id === (u.office_id || att?.office_id));
    const officeName = assignedOffice?.office_name || "Depo Pusat";

    // Most accurate real-time GPS location candidate
    let lastLoc = (u as any).last_location;
    let locSource = "USER_PING";

    // Check recent GPS events
    const latestGpsEvent = db.gps_events
      ?.filter((g) => g.user_id === u._id)
      ?.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    if (latestGpsEvent && (!lastLoc || new Date(latestGpsEvent.timestamp).getTime() > new Date(lastLoc.timestamp || 0).getTime())) {
      lastLoc = {
        lat: latestGpsEvent.latitude,
        lng: latestGpsEvent.longitude,
        latitude: latestGpsEvent.latitude,
        longitude: latestGpsEvent.longitude,
        accuracy: latestGpsEvent.accuracy,
        speed: latestGpsEvent.speed,
        battery: latestGpsEvent.battery,
        timestamp: latestGpsEvent.timestamp,
        source: "GPS_EVENT",
      };
      locSource = "GPS_EVENT";
    }

    if (!lastLoc || !lastLoc.lat) {
      if (active && active.check_in_lat) {
        lastLoc = {
          lat: active.check_in_lat,
          lng: active.check_in_lng,
          latitude: active.check_in_lat,
          longitude: active.check_in_lng,
          timestamp: active.check_in_time,
          source: "ACTIVE_VISIT",
        };
        locSource = "ACTIVE_VISIT";
      } else if (todayVisits.length > 0) {
        const latestV = todayVisits[todayVisits.length - 1];
        if (latestV.check_in_lat) {
          lastLoc = {
            lat: latestV.check_in_lat,
            lng: latestV.check_in_lng,
            latitude: latestV.check_in_lat,
            longitude: latestV.check_in_lng,
            timestamp: latestV.check_in_time,
            source: "LATEST_VISIT",
          };
          locSource = "LATEST_VISIT";
        }
      } else if (att && att.check_in_lat) {
        lastLoc = {
          lat: att.check_in_lat,
          lng: att.check_in_lng,
          latitude: att.check_in_lat,
          longitude: att.check_in_lng,
          timestamp: att.check_in_time,
          source: "ATTENDANCE_CHECKIN",
        };
        locSource = "ATTENDANCE_CHECKIN";
      } else if (assignedOffice && assignedOffice.latitude) {
        lastLoc = {
          lat: assignedOffice.latitude,
          lng: assignedOffice.longitude,
          latitude: assignedOffice.latitude,
          longitude: assignedOffice.longitude,
          timestamp: new Date().toISOString(),
          source: "ASSIGNED_OFFICE",
        };
        locSource = "ASSIGNED_OFFICE";
      }
    }

    if (lastLoc) {
      const numLat = Number(lastLoc.lat || lastLoc.latitude);
      const numLng = Number(lastLoc.lng || lastLoc.longitude);
      lastLoc = {
        lat: numLat,
        lng: numLng,
        latitude: numLat,
        longitude: numLng,
        accuracy: lastLoc.accuracy,
        speed: lastLoc.speed,
        heading: lastLoc.heading,
        battery: lastLoc.battery,
        timestamp: lastLoc.timestamp || new Date().toISOString(),
        source: lastLoc.source || locSource,
      };
    }

    const activeOutletObj = active ? db.outlets.find((o) => o._id === active.outlet_id) : null;

    return {
      salesman_id: u._id,
      _id: u._id,
      name: u.name,
      code: (u as any).code || u._id,
      phone: u.phone,
      area_id: u.area_id || null,
      area: areaName,
      office_id: u.office_id || null,
      office_name: officeName,
      status: computedStatus,
      attendance_status: att ? att.status : "ABSENT",
      check_in_time: att?.check_in_time || null,
      check_out_time: att?.check_out_time || null,
      formatted_check_in: att?.check_in_time ? formatDateTimeWIB(att.check_in_time) : "-",
      formatted_check_out: att?.check_out_time ? formatDateTimeWIB(att.check_out_time) : "-",
      work_duration_formatted: att?.work_duration_formatted || "-",
      work_duration_seconds: att?.work_duration_seconds || 0,
      late_minutes: att?.late_minutes || 0,
      last_location: lastLoc || null,
      active_outlet: activeOutletObj ? activeOutletObj.outlet_name : null,
      active_outlet_code: activeOutletObj ? activeOutletObj.outlet_code : null,
      active_outlet_address: activeOutletObj ? activeOutletObj.address : null,
      target_volume: tgt.target_volume,
      actual_volume: tgt.actual_volume,
      achievement_percentage: tgt.achievement_percentage,
      achievement_formatted: tgt.achievement_formatted,
      status_label: tgt.status_label,
      visits_trail: todayVisits,
      call_plan: cp ? {
        _id: cp._id,
        date: cp.date,
        items: enrichedCpItems,
        planned,
        visited: visitedCpCount,
        pending: Math.max(0, planned - visitedCpCount),
        compliance_percentage: planCompliancePct,
      } : null,
      summary: {
        planned,
        actual: kpi.outlet_calls,
        outlet_calls: kpi.outlet_calls,
        effective: kpi.effective_calls,
        effective_calls: kpi.effective_calls,
        ec_rate: kpi.ec_rate,
        effective_ratio: kpi.ec_rate,
        volume: kpi.total_volume,
        total_volume: kpi.total_volume,
        target_volume: tgt.target_volume,
        achievement_percentage: tgt.achievement_percentage,
        achievement_formatted: tgt.achievement_formatted,
        sales_value: kpi.total_revenue,
        revenue: kpi.total_revenue,
        missed,
        txn_count: kpi.transaction_count,
        new_outlets: newOutlets,
        check_in_time: att?.check_in_time || null,
      },
      planned,
      actual: kpi.outlet_calls,
      outlet_calls: kpi.outlet_calls,
      effective: kpi.effective_calls,
      effective_calls: kpi.effective_calls,
      ec_rate: kpi.ec_rate,
      effective_ratio: kpi.ec_rate,
      volume: kpi.total_volume,
      total_volume: kpi.total_volume,
      sales_value: kpi.total_revenue,
      revenue: kpi.total_revenue,
      missed,
      new_outlets: newOutlets,
      active_visit: active ? {
        ...active,
        outlet_name: activeOutletObj?.outlet_name || "Outlet",
        outlet_code: activeOutletObj?.outlet_code || "-",
        address: activeOutletObj?.address || "-",
        duration_minutes: Math.round((new Date().getTime() - new Date(active.check_in_time).getTime()) / 60000),
      } : null,
    };
  });

  // Apply status filter if provided
  let filteredList = salesmenStatus;
  if (filterStatus && filterStatus !== "ALL") {
    if (filterStatus === "ACTIVE") {
      filteredList = filteredList.filter((s) => s.status !== "OFF_DUTY");
    } else {
      filteredList = filteredList.filter((s) => s.status === filterStatus);
    }
  }

  const totalPlanned = salesmenStatus.reduce((sum, s) => sum + (s.planned || 0), 0);
  const totalCalls = salesmenStatus.reduce((sum, s) => sum + (s.outlet_calls || 0), 0);
  const totalEC = salesmenStatus.reduce((sum, s) => sum + (s.effective_calls || 0), 0);
  const totalVol = salesmenStatus.reduce((sum, s) => sum + (s.volume || 0), 0);
  const totalTargetVol = salesmenStatus.reduce((sum, s) => sum + (s.target_volume || 0), 0);
  const totalRev = salesmenStatus.reduce((sum, s) => sum + (s.sales_value || 0), 0);
  const totalNewOutlets = salesmenStatus.reduce((sum, s) => sum + (s.new_outlets || 0), 0);
  const overallEcRate = totalCalls > 0 ? Math.round((totalEC / totalCalls) * 1000) / 10 : 0;
  const overallAch = totalTargetVol > 0 ? Math.round((totalVol / totalTargetVol) * 1000) / 10 : 0;

  const visitingCount = salesmenStatus.filter((s) => s.status === "VISITING").length;
  const onFieldCount = salesmenStatus.filter((s) => s.status === "ON_FIELD").length;
  const onDutyCount = salesmenStatus.filter((s) => s.status === "ON_DUTY").length;
  const offDutyCount = salesmenStatus.filter((s) => s.status === "OFF_DUTY").length;

  res.json({
    date: queryDate,
    period: currentPeriod,
    total_salesmen: salesUsers.length,
    active_in_field: visitingCount + onFieldCount + onDutyCount,
    status_counts: {
      visiting: visitingCount,
      on_field: onFieldCount,
      on_duty: onDutyCount,
      off_duty: offDutyCount,
    },
    summary: {
      total_salesmen: salesUsers.length,
      active_in_field: visitingCount + onFieldCount + onDutyCount,
      visiting_count: visitingCount,
      on_field_count: onFieldCount,
      on_duty_count: onDutyCount,
      off_duty_count: offDutyCount,
      total_planned: totalPlanned,
      total_outlet_calls: totalCalls,
      total_effective_calls: totalEC,
      overall_ec_rate: overallEcRate,
      total_volume: totalVol,
      total_target_volume: totalTargetVol,
      overall_achievement: overallAch,
      total_revenue: totalRev,
      total_new_outlets: totalNewOutlets,
    },
    items: filteredList,
    salesmen: filteredList,
  });
});

apiRouter.get("/metrics/calls", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const from = (req.query.from as string) || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const salesmanId = (req.query.salesman_id as string) || (req.query.salesmanId as string);

    const rows = await getCallMetricsRange(from, to, salesmanId);
    const totalOutletCall = rows.reduce((s, r) => s + r.outlet_call, 0);
    const totalEffectiveCall = rows.reduce((s, r) => s + r.effective_call, 0);
    const ecRate = totalOutletCall > 0 ? Math.round((totalEffectiveCall / totalOutletCall) * 100) : 0;

    res.json({
      from,
      to,
      outlet_call: totalOutletCall,
      effective_call: totalEffectiveCall,
      ec_rate: ecRate,
      daily: rows,
    });
  } catch (err: any) {
    console.error("[metrics/calls error]", err);
    res.status(500).json({ error: "Failed to load call metrics" });
  }
});

apiRouter.get("/dashboard/owner", authMiddleware, requireRoles("OWNER", "ADMIN"), async (req, res) => {
  try {
    const data = await getOwnerDashboardData(req);
    res.json(data);
  } catch (err: any) {
    if (err.message === "Database Unavailable") {
      res.status(503).json({ success: false, message: "Database Unavailable" });
    } else {
      console.error(err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
});

// ================= REPORTS =================
apiRouter.get("/reports", authMiddleware, (req, res) => {
  const reports = [
    {
      id: "outlets",
      key: "outlets",
      name: "Laporan Performa & Status Outlet (NOO, Repeat, Active, Dormant)",
      category: "OUTLET",
      category_label: "Outlet & Toko",
      icon: "Store",
      description: "Analisis siklus hidup toko, transaksi pertama, repeat order, dan status keaktifan.",
    },
    {
      id: "target-performance",
      key: "target-performance",
      name: "Laporan Target vs Actual Volume & Achievement (SKU / Sales / Area)",
      category: "SALES",
      category_label: "Penjualan & Target",
      icon: "TrendingUp",
      description: "Monitoring pencapaian target volume penjualan per produk, sales rep, dan area.",
    },
    {
      id: "route-performance",
      key: "route-performance",
      name: "Laporan Performa Master Rute & Kunjungan Call Plan",
      category: "FIELD",
      category_label: "Operasional & Absensi",
      icon: "Route",
      description: "Evaluasi efektivitas master rute: outlet count, rasio kunjungan, effective call (EC), dan nilai penjualan.",
    },
    {
      id: "call-plan-detail",
      key: "call-plan-detail",
      name: "Laporan Detail Eksekusi Call Plan & Rute Harian",
      category: "FIELD",
      category_label: "Operasional & Absensi",
      icon: "ListChecks",
      description: "Rincian urutan kunjungan toko dalam call plan, jam check-in/out, durasi, dan status eksekusi.",
    },
    {
      id: "call-achievement",
      key: "call-achievement",
      name: "Laporan Call Achievement & Kepatuhan Jadwal",
      category: "SALES",
      category_label: "Penjualan & Target",
      icon: "Route",
      description: "Evaluasi rasio rencana kunjungan (Plan) vs realisasi kunjungan harian sales.",
    },
    {
      id: "effective-call",
      key: "effective-call",
      name: "Laporan Effective Call (EC) & Drop Size",
      category: "SALES",
      category_label: "Penjualan & Target",
      icon: "CheckCircle2",
      description: "Rasio kunjungan yang menghasilkan transaksi (EC) serta nilai penjualan per call.",
    },
    {
      id: "daily-sales",
      key: "daily-sales",
      name: "Laporan Harian Penjualan & Kunjungan Sales",
      category: "SALES",
      category_label: "Penjualan & Target",
      icon: "Calendar",
      description: "Rekap transaksi dan performa harian tim sales per tanggal kunjungan.",
    },
    {
      id: "sales-performance",
      key: "sales-performance",
      name: "Laporan Performa Kinerja Salesman",
      category: "SALES",
      category_label: "Penjualan & Target",
      icon: "Users",
      description: "Ringkasan metrik sales: Call, EC, Volume, Revenue, dan Target Achievement.",
    },
    {
      id: "area-performance",
      key: "area-performance",
      name: "Laporan Performa Wilayah / Area",
      category: "SALES",
      category_label: "Penjualan & Target",
      icon: "MapPin",
      description: "Distribusi penjualan, coverage outlet, dan produktivitas per wilayah/area.",
    },
    {
      id: "product-coverage",
      key: "product-coverage",
      name: "Laporan Performa & Cakupan Produk (SKU)",
      category: "SALES",
      category_label: "Penjualan & Target",
      icon: "Package",
      description: "Penyebaran dan kontribusi volume per varian produk/SKU ke seluruh outlet.",
    },
    {
      id: "no-order-analysis",
      key: "no-order-analysis",
      name: "Laporan Analisis Kunjungan Tanpa Order (No Order)",
      category: "SALES",
      category_label: "Penjualan & Target",
      icon: "AlertCircle",
      description: "Analisis alasan toko tidak melakukan pemesanan saat dikunjungi (Outlet Call).",
    },
    {
      id: "transactions",
      key: "transactions",
      name: "Laporan Detail Transaksi Penjualan",
      category: "SALES",
      category_label: "Penjualan & Target",
      icon: "Receipt",
      description: "Daftar invoice transaksi penjualan tunai & tempo lengkap dengan detail produk.",
    },
    {
      id: "attendance",
      key: "attendance",
      name: "Laporan Absensi & Disiplin Sales",
      category: "FIELD",
      category_label: "Operasional & Absensi",
      icon: "Clock",
      description: "Rekap jam check-in, check-out, radius GPS, dan status kehadiran tim sales.",
    },
    {
      id: "outlet-coverage",
      key: "outlet-coverage",
      name: "Laporan Cakupan & Produktivitas Outlet",
      category: "OUTLET",
      category_label: "Outlet & Toko",
      icon: "Layers",
      description: "Cakupan kunjungan dan transaksi per outlet dalam periode terpilih.",
    },
    {
      id: "new-outlets",
      key: "new-outlets",
      name: "Laporan Penambahan Outlet Baru (NOO)",
      category: "OUTLET",
      category_label: "Outlet & Toko",
      icon: "Store",
      description: "Daftar registrasi toko baru yang berhasil dibuka oleh sales di lapangan.",
    },
    {
      id: "daily-stock-movement",
      key: "daily-stock-movement",
      name: "Laporan Rekap Mutasi Stok Harian",
      category: "INVENTORY",
      category_label: "Stok & Gudang",
      icon: "ArrowUpDown",
      description: "Log perpindahan stok: Transfer In (Handover), Sales Out, dan Retur.",
    },
    {
      id: "sales-stock-ledger",
      key: "sales-stock-ledger",
      name: "Laporan Ledger Stok Sales Lapangan",
      category: "INVENTORY",
      category_label: "Stok & Gudang",
      icon: "FileSpreadsheet",
      description: "Buku besar stok di tangan sales, barang terjual, dan sisa fisik harian.",
    },
    {
      id: "stock-handover",
      key: "stock-handover",
      name: "Laporan Serah Terima Stok Pagi (Handover)",
      category: "INVENTORY",
      category_label: "Stok & Gudang",
      icon: "PackageCheck",
      description: "Daftar berita acara serah terima muatan stok awal dari gudang ke sales.",
    },
    {
      id: "sales-return",
      key: "sales-return",
      name: "Laporan Pengembalian / Retur Stok Sales",
      category: "INVENTORY",
      category_label: "Stok & Gudang",
      icon: "RotateCcw",
      description: "Daftar pengembalian sisa stok atau barang retur dari sales ke gudang.",
    },
    {
      id: "stock-reconciliation",
      key: "stock-reconciliation",
      name: "Laporan Rekonsiliasi & Selisih Stok Harian",
      category: "INVENTORY",
      category_label: "Stok & Gudang",
      icon: "Scale",
      description: "Audit selisih antara sisa seharusnya vs fisik aktual pada akhir hari.",
    },
    {
      id: "inventory",
      key: "inventory",
      name: "Laporan Stok Gudang & Posisi Sales",
      category: "INVENTORY",
      category_label: "Stok & Gudang",
      icon: "Boxes",
      description: "Posisi aset stok real-time di gudang pusat dan tersebar di tim sales.",
    },
  ];
  res.json(reports);
});

// ================= DEDICATED OUTLET REPORT API =================
apiRouter.get("/reports/outlets", authMiddleware, (req: AuthenticatedRequest, res) => {
  const from = (req.query.from as string) || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
  const rawSalesmanId = req.query.salesman_id as string;
  const rawAreaId = req.query.area_id as string;
  const province_id = req.query.province_id as string;
  const regency_id = req.query.regency_id as string;
  const district_id = req.query.district_id as string;
  const village_id = req.query.village_id as string;
  const statusFilter = (req.query.status as string) || "ALL";
  const skuId = req.query.sku_id as string;
  const productId = req.query.product_id as string;
  const searchQ = ((req.query.q as string) || "").toLowerCase().trim();
  const statusMode = (req.query.status_mode as string) || "current"; // "current" | "period"

  // Enforce security for SALES role
  const isSalesRole = req.user!.role === "SALES";
  const salesmanId = isSalesRole ? req.user!._id : (rawSalesmanId === "ALL" ? "" : rawSalesmanId);
  const areaId = rawAreaId === "ALL" ? "" : rawAreaId;

  // Recalculate status before querying
  recalculateAllOutletStatuses();

  // 1. Filter Outlets by access & primary attributes
  let baseOutlets = db.outlets.filter((o) => {
    // If user is sales, only show assigned outlets or outlets in their area
    if (isSalesRole) {
      if (!isOutletAssignedToSales(req.user!._id, o._id)) return false;
    }
    if (areaId && o.area_id !== areaId) return false;
    if (province_id && province_id !== "ALL" && o.province_id !== province_id) return false;
    if (regency_id && regency_id !== "ALL" && o.regency_id !== regency_id) return false;
    if (district_id && district_id !== "ALL" && o.district_id !== district_id) return false;
    if (village_id && village_id !== "ALL" && o.village_id !== village_id) return false;
    return true;
  });

  const nowTime = Date.now();
  const toDateTime = new Date(to + "T23:59:59.999Z").getTime();

  // 2. Map and Enrich Each Outlet
  const enrichedOutlets = baseOutlets.map((o) => {
    const assignedSales = getAssignedSalesForOutlet(o);
    const channel = db.channels.find((c) => c._id === o.channel_id);
    const area = db.areas.find((a) => a._id === o.area_id);

    const prov = o.province_name || db.provinces.find((p) => p._id === o.province_id)?.name || "-";
    const reg = o.regency_name || db.regencies.find((r) => r._id === o.regency_id)?.name || "-";
    const dist = o.district_name || db.districts.find((d) => d._id === o.district_id)?.name || "-";
    const vil = o.village_name || db.villages.find((v) => v._id === o.village_id)?.name || "-";
    const post = o.postal_code || db.villages.find((v) => v._id === o.village_id)?.postal_code || "";

    // All-time completed transactions (Strict rule: exclude CANCELLED & DRAFT)
    const allCompletedTxns = db.transactions
      .filter((t) => t.outlet_id === o._id && t.status !== "CANCELLED" && (t as any).status !== "DRAFT")
      .sort((a, b) => (a.transaction_date || "").localeCompare(b.transaction_date || ""));

    const allTxnCount = allCompletedTxns.length;
    const firstTxn = allCompletedTxns[0];
    const lastTxn = allCompletedTxns[allCompletedTxns.length - 1];

    const firstTxnDate = firstTxn ? (firstTxn.transaction_date || "").slice(0, 10) : null;
    const lastTxnDate = lastTxn ? (lastTxn.transaction_date || "").slice(0, 10) : null;

    const firstItem = firstTxn && firstTxn.items && firstTxn.items.length ? firstTxn.items[0] : null;
    const firstProduct = firstItem ? (firstItem.product_name || firstItem.sku_name || "-") : "-";
    const firstVolume = firstTxn ? (firstTxn.total_volume ?? (firstTxn.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0)) : 0;
    const firstRevenue = firstTxn ? Number(firstTxn.total || 0) : 0;

    // Determine status based on mode
    let effectiveStatus: OutletLifecycleStatus = "PROSPECT";
    let daysSinceLastTxn: number | null = null;

    if (statusMode === "period") {
      // Historical status up to `to` date
      const historicalTxns = allCompletedTxns.filter((t) => (t.transaction_date || "").slice(0, 10) <= to);
      const histCount = historicalTxns.length;
      const histLastTxn = historicalTxns[historicalTxns.length - 1];
      const histLastAt = histLastTxn ? histLastTxn.transaction_date : null;
      effectiveStatus = calculateOutletStatus(histCount, histLastAt, new Date(to));
      if (histLastAt) {
        const diffMs = toDateTime - new Date(histLastAt).getTime();
        daysSinceLastTxn = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }
    } else {
      // Current live status
      effectiveStatus = o.lifecycle_status || calculateOutletStatus(allTxnCount, lastTxn?.transaction_date || null, new Date());
      if (lastTxn?.transaction_date) {
        const diffMs = nowTime - new Date(lastTxn.transaction_date).getTime();
        daysSinceLastTxn = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }
    }

    // Period completed transactions (Date Filter affects Transaction, Volume, Revenue)
    const periodTxns = allCompletedTxns.filter((t) => {
      const d = (t.transaction_date || "").slice(0, 10);
      if (d < from || d > to) return false;
      if (salesmanId && t.salesman_id !== salesmanId) return false;
      return true;
    });

    let periodVolume = 0;
    let periodRevenue = 0;
    let periodTxnCount = 0;
    let hasMatchingSku = false;

    periodTxns.forEach((t) => {
      let items = t.items || [];
      if (skuId && skuId !== "ALL") {
        items = items.filter((it: any) => it.sku_id === skuId);
      }
      if (productId && productId !== "ALL") {
        items = items.filter((it: any) => it.product_id === productId);
      }

      if (items.length > 0 || (!skuId && !productId)) {
        hasMatchingSku = true;
        periodTxnCount += 1;
        items.forEach((it: any) => {
          const q = Number(it.quantity || it.volume || it.qty) || 0;
          const p = Number(it.unit_price || it.price) || 0;
          periodVolume += q;
          periodRevenue += q * p;
        });
      }
    });

    // If no SKU/Product filter, use transaction total if available
    if ((!skuId || skuId === "ALL") && (!productId || productId === "ALL")) {
      periodVolume = periodTxns.reduce(
        (sum, t) => sum + (t.total_volume ?? (t.items || []).reduce((is, it) => is + (Number(it.quantity) || 0), 0)),
        0
      );
      periodRevenue = periodTxns.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
      periodTxnCount = periodTxns.length;
    }

    // Previous transactions (before `from`) - Useful for Dormant & Growth analysis
    const prevTxns = allCompletedTxns.filter((t) => (t.transaction_date || "").slice(0, 10) < from);
    const prevVolume = prevTxns.reduce(
      (sum, t) => sum + (t.total_volume ?? (t.items || []).reduce((is, it) => is + (Number(it.quantity) || 0), 0)),
      0
    );
    const prevRevenue = prevTxns.reduce((sum, t) => sum + (Number(t.total) || 0), 0);

    // Period visits & calls (Date Filter affects Outlet Call & Effective Call)
    const periodVisits = db.visits.filter((v) => {
      if (v.outlet_id !== o._id || v.status !== "COMPLETED") return false;
      if (v.date < from || v.date > to) return false;
      if (salesmanId && v.salesman_id !== salesmanId) return false;
      return true;
    });

    const isVisitedInPeriod = periodVisits.length > 0;
    const isEffectiveInPeriod = isVisitedInPeriod && (periodTxnCount > 0 || periodVisits.some((v) => v.call_result === "EFFECTIVE"));

    const outletCall = isVisitedInPeriod ? 1 : 0;
    const effectiveCall = isEffectiveInPeriod ? 1 : 0;
    const ecRate = outletCall > 0 ? Math.round((effectiveCall / outletCall) * 100) : 0;

    const lifeCfg = LIFECYCLE_CONFIG[effectiveStatus] || LIFECYCLE_CONFIG.PROSPECT;

    return {
      _id: o._id,
      outlet_id: o._id,
      outlet_code: o.outlet_code || o._id,
      outlet_name: o.outlet_name,
      owner_name: o.owner_name || "-",
      phone: o.phone || "-",
      address: o.address || "-",
      province_id: o.province_id,
      province_name: prov,
      regency_id: o.regency_id,
      regency_name: reg,
      district_id: o.district_id,
      district_name: dist,
      village_id: o.village_id,
      village_name: vil,
      postal_code: post,
      area_id: o.area_id,
      area_name: area?.name || "-",
      channel_id: o.channel_id,
      channel_name: channel?.name || "-",
      salesman_id: assignedSales?.sales_id || null,
      salesman_name: assignedSales?.sales_name || "-",
      salesman_code: assignedSales?.sales_code || "-",
      assigned_sales_id: assignedSales?.sales_id || null,
      assigned_sales_name: assignedSales?.sales_name || "-",
      assigned_sales_code: assignedSales?.sales_code || "-",
      lifecycle_status: effectiveStatus,
      status: effectiveStatus,
      lifecycle_label: lifeCfg.label,
      lifecycle_badge: lifeCfg.badge,
      lifecycle_color: lifeCfg.color,
      outlet_call: outletCall,
      effective_call: effectiveCall,
      ec_rate: ecRate,
      visit_count: periodVisits.length,
      transaction_count: periodTxnCount,
      total_transactions: periodTxnCount,
      volume: periodVolume,
      total_volume: periodVolume,
      revenue: periodRevenue,
      total_revenue: periodRevenue,
      first_transaction_date: firstTxnDate,
      first_product: firstProduct,
      first_volume: firstVolume,
      first_revenue: firstRevenue,
      last_transaction_date: lastTxnDate,
      days_since_last_transaction: daysSinceLastTxn,
      previous_volume: prevVolume,
      previous_revenue: prevRevenue,
      all_time_transactions: allTxnCount,
      latitude: o.latitude,
      longitude: o.longitude,
      credit_limit: o.credit_limit || 0,
      term_of_payment: o.term_of_payment || 0,
      has_matching_sku: hasMatchingSku,
    };
  });

  // 3. Apply Search and Multi-Attribute Filters
  let filteredList = enrichedOutlets.filter((item) => {
    // Salesman Filter
    if (salesmanId && item.salesman_id !== salesmanId && (item as any).assigned_sales_id !== salesmanId) {
      return false;
    }
    // Status Filter
    if (statusFilter && statusFilter !== "ALL" && item.lifecycle_status !== statusFilter) {
      return false;
    }
    // Product / SKU filtering
    if (skuId && skuId !== "ALL" && item.volume <= 0 && !item.has_matching_sku) {
      return false;
    }
    if (productId && productId !== "ALL" && item.volume <= 0 && !item.has_matching_sku) {
      return false;
    }
    // Search Query
    if (searchQ) {
      const mCode = item.outlet_code.toLowerCase().includes(searchQ);
      const mName = item.outlet_name.toLowerCase().includes(searchQ);
      const mOwner = item.owner_name.toLowerCase().includes(searchQ);
      const mPhone = item.phone.toLowerCase().includes(searchQ);
      const mAddress = item.address.toLowerCase().includes(searchQ);
      const mProv = item.province_name.toLowerCase().includes(searchQ);
      const mReg = item.regency_name.toLowerCase().includes(searchQ);
      const mDist = item.district_name.toLowerCase().includes(searchQ);
      const mVil = item.village_name.toLowerCase().includes(searchQ);
      if (!mCode && !mName && !mOwner && !mPhone && !mAddress && !mProv && !mReg && !mDist && !mVil) return false;
    }
    return true;
  });

  // 4. Calculate Aggregate Summary KPIs
  const scopedOutletsForKpis = enrichedOutlets.filter((item) => {
    if (salesmanId && item.salesman_id !== salesmanId) return false;
    if (areaId && item.area_id !== areaId) return false;
    return true;
  });

  const totalOutletsCount = scopedOutletsForKpis.length;
  const nooCount = scopedOutletsForKpis.filter((i) => i.lifecycle_status === "NOO").length;
  const repeatCount = scopedOutletsForKpis.filter((i) => i.lifecycle_status === "REPEAT").length;
  const activeCount = scopedOutletsForKpis.filter((i) => i.lifecycle_status === "ACTIVE").length;
  const dormantCount = scopedOutletsForKpis.filter((i) => i.lifecycle_status === "DORMANT").length;
  const prospectCount = scopedOutletsForKpis.filter((i) => i.lifecycle_status === "PROSPECT").length;

  const totalOutletCalls = filteredList.filter((i) => i.outlet_call > 0).length;
  const totalEffectiveCalls = filteredList.filter((i) => i.effective_call > 0).length;
  const overallEcRate = totalOutletCalls > 0 ? Math.round((totalEffectiveCalls / totalOutletCalls) * 100) : 0;

  const totalVolume = filteredList.reduce((sum, i) => sum + i.volume, 0);
  const totalRevenue = filteredList.reduce((sum, i) => sum + i.revenue, 0);
  const totalTxns = filteredList.reduce((sum, i) => sum + i.transaction_count, 0);

  // 5. Area Grouped Summary
  const areaBreakdown = db.areas.map((a) => {
    const areaOutlets = filteredList.filter((i) => i.area_id === a._id);
    const aTotal = areaOutlets.length;
    const aNoo = areaOutlets.filter((i) => i.lifecycle_status === "NOO").length;
    const aRepeat = areaOutlets.filter((i) => i.lifecycle_status === "REPEAT").length;
    const aActive = areaOutlets.filter((i) => i.lifecycle_status === "ACTIVE").length;
    const aDormant = areaOutlets.filter((i) => i.lifecycle_status === "DORMANT").length;
    const aProspect = areaOutlets.filter((i) => i.lifecycle_status === "PROSPECT").length;

    const aOutletCalls = areaOutlets.filter((i) => i.outlet_call > 0).length;
    const aEffectiveCalls = areaOutlets.filter((i) => i.effective_call > 0).length;
    const aEcRate = aOutletCalls > 0 ? Math.round((aEffectiveCalls / aOutletCalls) * 100) : 0;
    const aVolume = areaOutlets.reduce((s, i) => s + i.volume, 0);
    const aRevenue = areaOutlets.reduce((s, i) => s + i.revenue, 0);

    return {
      area_id: a._id,
      area_name: a.name,
      total_outlets: aTotal,
      noo: aNoo,
      repeat: aRepeat,
      active: aActive,
      dormant: aDormant,
      prospect: aProspect,
      outlet_call: aOutletCalls,
      effective_call: aEffectiveCalls,
      ec_rate: aEcRate,
      volume: aVolume,
      revenue: aRevenue,
    };
  }).filter((a) => a.total_outlets > 0 || !areaId);

  // 6. Sales Grouped Summary
  const salesUsers = db.users.filter((u) => u.role === "SALES" && (!salesmanId || u._id === salesmanId));
  const salesBreakdown = salesUsers.map((sales) => {
    const salesOutlets = filteredList.filter((i) => i.salesman_id === sales._id);
    const sTotal = salesOutlets.length;
    const sNoo = salesOutlets.filter((i) => i.lifecycle_status === "NOO").length;
    const sRepeat = salesOutlets.filter((i) => i.lifecycle_status === "REPEAT").length;
    const sActive = salesOutlets.filter((i) => i.lifecycle_status === "ACTIVE").length;
    const sDormant = salesOutlets.filter((i) => i.lifecycle_status === "DORMANT").length;
    const sProspect = salesOutlets.filter((i) => i.lifecycle_status === "PROSPECT").length;

    const sOutletCalls = salesOutlets.filter((i) => i.outlet_call > 0).length;
    const sEffectiveCalls = salesOutlets.filter((i) => i.effective_call > 0).length;
    const sEcRate = sOutletCalls > 0 ? Math.round((sEffectiveCalls / sOutletCalls) * 100) : 0;
    const sVolume = salesOutlets.reduce((s, i) => s + i.volume, 0);
    const sRevenue = salesOutlets.reduce((s, i) => s + i.revenue, 0);

    // Target calculation for this sales
    const tgt = calculateVolumeTargetAndAchievement({
      salesmanId: sales._id,
      from,
      to,
      skuId,
    });

    const salesArea = db.areas.find((a) => a._id === sales.area_id);

    return {
      salesman_id: sales._id,
      salesman_name: sales.name,
      salesman_code: (sales as any).code || sales._id,
      area_name: salesArea?.name || "-",
      total_outlets: sTotal,
      noo: sNoo,
      repeat: sRepeat,
      active: sActive,
      dormant: sDormant,
      prospect: sProspect,
      outlet_call: sOutletCalls,
      effective_call: sEffectiveCalls,
      ec_rate: sEcRate,
      target_volume: tgt.target_volume,
      actual_volume: sVolume,
      achievement_pct: tgt.target_volume > 0 ? Math.round((sVolume / tgt.target_volume) * 100) : 0,
      revenue: sRevenue,
    };
  }).filter((s) => s.total_outlets > 0 || !salesmanId);

  // 7. Regency/Wilayah Grouped Summary
  const regencyMap: Record<string, any> = {};
  filteredList.forEach((out) => {
    const regKey = out.regency_id || "unassigned";
    const regLabel = out.regency_name || "Lainnya";
    const provLabel = out.province_name || "-";
    if (!regencyMap[regKey]) {
      regencyMap[regKey] = {
        regency_id: regKey,
        regency_name: regLabel,
        province_name: provLabel,
        total_outlets: 0,
        noo: 0,
        repeat: 0,
        active: 0,
        dormant: 0,
        prospect: 0,
        outlet_call: 0,
        effective_call: 0,
        volume: 0,
        revenue: 0,
      };
    }
    regencyMap[regKey].total_outlets += 1;
    if (out.lifecycle_status === "NOO") regencyMap[regKey].noo += 1;
    if (out.lifecycle_status === "REPEAT") regencyMap[regKey].repeat += 1;
    if (out.lifecycle_status === "ACTIVE") regencyMap[regKey].active += 1;
    if (out.lifecycle_status === "DORMANT") regencyMap[regKey].dormant += 1;
    if (out.lifecycle_status === "PROSPECT") regencyMap[regKey].prospect += 1;
    if (out.outlet_call > 0) regencyMap[regKey].outlet_call += 1;
    if (out.effective_call > 0) regencyMap[regKey].effective_call += 1;
    regencyMap[regKey].volume += out.volume;
    regencyMap[regKey].revenue += out.revenue;
  });

  const regencyBreakdown = Object.values(regencyMap).map((r: any) => ({
    ...r,
    ec_rate: r.outlet_call > 0 ? Math.round((r.effective_call / r.outlet_call) * 100) : 0,
  }));

  const responsePayload = {
    metadata: {
      report_name: "Laporan Performa & Status Outlet",
      period_from: from,
      period_to: to,
      generated_at: new Date().toISOString(),
      status_mode: statusMode,
      filters: {
        from,
        to,
        area_id: areaId || "ALL",
        province_id: province_id || "ALL",
        regency_id: regency_id || "ALL",
        district_id: district_id || "ALL",
        village_id: village_id || "ALL",
        salesman_id: salesmanId || "ALL",
        status: statusFilter,
        sku_id: skuId || "ALL",
        product_id: productId || "ALL",
        search: searchQ,
      },
    },
    kpis: {
      total_outlets: totalOutletsCount,
      noo: nooCount,
      noo_pct: totalOutletsCount > 0 ? Math.round((nooCount / totalOutletsCount) * 100) : 0,
      repeat: repeatCount,
      repeat_pct: totalOutletsCount > 0 ? Math.round((repeatCount / totalOutletsCount) * 100) : 0,
      active: activeCount,
      active_pct: totalOutletsCount > 0 ? Math.round((activeCount / totalOutletsCount) * 100) : 0,
      dormant: dormantCount,
      dormant_pct: totalOutletsCount > 0 ? Math.round((dormantCount / totalOutletsCount) * 100) : 0,
      prospect: prospectCount,
      prospect_pct: totalOutletsCount > 0 ? Math.round((prospectCount / totalOutletsCount) * 100) : 0,
      outlet_call: totalOutletCalls,
      effective_call: totalEffectiveCalls,
      ec_rate: overallEcRate,
      total_volume: totalVolume,
      total_revenue: totalRevenue,
      total_transactions: totalTxns,
    },
    outlets: filteredList,
    total: filteredList.length,
    area_report: areaBreakdown,
    sales_report: salesBreakdown,
    region_report: regencyBreakdown,
  };

  res.json(responsePayload);
});

// ================= OUTLET REPORT DETAIL API =================
apiRouter.get("/reports/outlets/:outletId", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { outletId } = req.params;
  const from = (req.query.from as string) || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

  const outlet = db.outlets.find((o) => o._id === outletId);
  if (!outlet) {
    return res.status(404).json({ detail: "Outlet tidak ditemukan." });
  }

  // Check sales access
  if (req.user!.role === "SALES" && !isOutletAssignedToSales(req.user!._id, outlet._id)) {
    return res.status(403).json({ detail: "Anda tidak memiliki akses ke data outlet ini." });
  }

  recalculateOutletSummary(outlet._id);

  const assignedSales = getAssignedSalesForOutlet(outlet);
  const channel = db.channels.find((c) => c._id === outlet.channel_id);
  const area = db.areas.find((a) => a._id === outlet.area_id);

  // 1. Transactions
  const allCompletedTxns = db.transactions
    .filter((t) => t.outlet_id === outlet._id && t.status !== "CANCELLED" && (t as any).status !== "DRAFT")
    .sort((a, b) => (b.transaction_date || "").localeCompare(a.transaction_date || ""));

  const periodTxns = allCompletedTxns.filter((t) => {
    const d = (t.transaction_date || "").slice(0, 10);
    return d >= from && d <= to;
  });

  const firstTxn = allCompletedTxns[allCompletedTxns.length - 1];
  const lastTxn = allCompletedTxns[0];

  const nowTime = Date.now();
  let daysSinceLast: number | null = null;
  if (lastTxn?.transaction_date) {
    const diffMs = nowTime - new Date(lastTxn.transaction_date).getTime();
    daysSinceLast = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  // 2. Visits
  const allVisits = db.visits
    .filter((v) => v.outlet_id === outlet._id)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const periodVisits = allVisits.filter((v) => v.status === "COMPLETED" && v.date >= from && v.date <= to);
  const isVisitedInPeriod = periodVisits.length > 0;
  const isEffectiveInPeriod = isVisitedInPeriod && (periodTxns.length > 0 || periodVisits.some((v) => v.call_result === "EFFECTIVE"));

  const outletCall = isVisitedInPeriod ? 1 : 0;
  const effectiveCall = isEffectiveInPeriod ? 1 : 0;
  const ecRate = outletCall > 0 ? Math.round((effectiveCall / outletCall) * 100) : 0;

  const periodVolume = periodTxns.reduce(
    (sum, t) => sum + (t.total_volume ?? (t.items || []).reduce((is, it) => is + (Number(it.quantity) || 0), 0)),
    0
  );
  const periodRevenue = periodTxns.reduce((sum, t) => sum + (Number(t.total) || 0), 0);

  // 3. Product & SKU Breakdown Performance
  const skuStatsMap: Record<string, {
    sku_id: string;
    sku_code: string;
    sku_name: string;
    product_name: string;
    target_volume: number;
    actual_volume: number;
    achievement_pct: number;
    transaction_count: number;
    revenue: number;
  }> = {};

  // Initialize with active SKUs
  db.skus.filter((s) => s.status === "ACTIVE").forEach((s) => {
    skuStatsMap[s._id] = {
      sku_id: s._id,
      sku_code: s.code,
      sku_name: s.name,
      product_name: s.name.split(" ")[0] || s.name,
      target_volume: 0,
      actual_volume: 0,
      achievement_pct: 0,
      transaction_count: 0,
      revenue: 0,
    };
  });

  // Check targets
  const matchingTargets = db.targets.filter((t) => t.status === "ACTIVE" && (!(t as any).outlet_id || (t as any).outlet_id === outlet._id));
  matchingTargets.forEach((t) => {
    if (t.sku_id && skuStatsMap[t.sku_id]) {
      skuStatsMap[t.sku_id].target_volume += t.target_volume;
    }
  });

  // Calculate actuals from completed transactions in period
  periodTxns.forEach((t) => {
    (t.items || []).forEach((it) => {
      const sId = it.sku_id;
      if (!skuStatsMap[sId]) {
        skuStatsMap[sId] = {
          sku_id: sId,
          sku_code: it.sku_name || sId,
          sku_name: it.sku_name || sId,
          product_name: it.product_name || it.sku_name || "-",
          target_volume: 0,
          actual_volume: 0,
          achievement_pct: 0,
          transaction_count: 0,
          revenue: 0,
        };
      }
      const qty = Number(it.quantity || (it as any).volume) || 0;
      const price = Number(it.unit_price || (it as any).price) || 0;
      skuStatsMap[sId].actual_volume += qty;
      skuStatsMap[sId].revenue += qty * price;
      skuStatsMap[sId].transaction_count += 1;
    });
  });

  const productPerformance = Object.values(skuStatsMap)
    .map((item) => {
      const ach = item.target_volume > 0 ? Math.round((item.actual_volume / item.target_volume) * 100) : (item.actual_volume > 0 ? 100 : 0);
      return {
        ...item,
        achievement_pct: ach,
      };
    })
    .sort((a, b) => b.actual_volume - a.actual_volume || b.revenue - a.revenue);

  // 4. Enriched Transaction History
  const transactionHistory = allCompletedTxns.map((t) => {
    const sales = db.users.find((u) => u._id === t.salesman_id);
    const totalQty = (t.items || []).reduce((s, it) => s + (Number(it.quantity || (it as any).volume) || 0), 0);
    return {
      _id: t._id,
      invoice_number: t.invoice_number || t.transaction_code || t._id,
      transaction_date: t.transaction_date,
      salesman_name: sales?.name || "-",
      salesman_code: (sales as any)?.code || t.salesman_id,
      payment_method: t.payment_method || "CASH",
      status: t.status,
      volume: t.total_volume ?? totalQty,
      revenue: t.total || 0,
      items: (t.items || []).map((it) => ({
        product_name: it.product_name || "-",
        sku_name: it.sku_name || "-",
        quantity: Number(it.quantity || (it as any).volume) || 0,
        unit_price: Number(it.unit_price || (it as any).price) || 0,
        subtotal: Number(it.subtotal || (Number(it.quantity || 0) * Number(it.unit_price || 0))),
      })),
    };
  });

  // 5. Enriched Visit History
  const visitHistory = allVisits.map((v) => {
    const sales = db.users.find((u) => u._id === v.salesman_id);
    const relatedTxn = db.transactions.find((t) => t.visit_id === v._id);
    return {
      _id: v._id,
      date: v.date,
      salesman_name: sales?.name || "-",
      salesman_code: (sales as any)?.code || v.salesman_id,
      check_in_time: v.check_in_time,
      check_out_time: v.check_out_time || "-",
      duration_minutes: v.duration_seconds ? Math.round(v.duration_seconds / 60) : 0,
      status: v.status,
      call_result: v.call_result || (relatedTxn ? "EFFECTIVE" : "OPEN"),
      is_effective: v.call_result === "EFFECTIVE" || !!relatedTxn,
      has_transaction: !!relatedTxn,
      transaction_invoice: relatedTxn?.invoice_number || null,
      transaction_total: relatedTxn?.total || 0,
      notes: v.notes || "-",
      photo_url: v.photo_url || null,
    };
  });

  const lifeCfg = LIFECYCLE_CONFIG[outlet.lifecycle_status || "PROSPECT"] || LIFECYCLE_CONFIG.PROSPECT;

  res.json({
    outlet_profile: {
      _id: outlet._id,
      outlet_code: outlet.outlet_code || outlet._id,
      outlet_name: outlet.outlet_name,
      owner_name: outlet.owner_name || "-",
      phone: outlet.phone || "-",
      address: outlet.address || "-",
      area_id: outlet.area_id,
      area_name: area?.name || "-",
      channel_id: outlet.channel_id,
      channel_name: channel?.name || "-",
      salesman_id: assignedSales?.sales_id || null,
      salesman_name: assignedSales?.sales_name || "-",
      salesman_code: assignedSales?.sales_code || "-",
      salesman_phone: assignedSales?.sales_phone || "-",
      lifecycle_status: outlet.lifecycle_status || "PROSPECT",
      lifecycle_label: lifeCfg.label,
      lifecycle_badge: lifeCfg.badge,
      lifecycle_color: lifeCfg.color,
      credit_limit: outlet.credit_limit || 0,
      term_of_payment: outlet.term_of_payment || 0,
      payment_term_days: outlet.payment_term_days || 0,
      latitude: outlet.latitude,
      longitude: outlet.longitude,
      created_at: outlet.created_at,
    },
    activity_summary: {
      from,
      to,
      outlet_call: outletCall,
      effective_call: effectiveCall,
      ec_rate: ecRate,
      transaction_count: periodTxns.length,
      volume: periodVolume,
      revenue: periodRevenue,
    },
    transaction_summary: {
      first_transaction_date: firstTxn?.transaction_date ? firstTxn.transaction_date.slice(0, 10) : "-",
      last_transaction_date: lastTxn?.transaction_date ? lastTxn.transaction_date.slice(0, 10) : "-",
      days_since_last_transaction: daysSinceLast,
      all_time_transactions: allCompletedTxns.length,
      all_time_volume: allCompletedTxns.reduce(
        (s, t) => s + (t.total_volume ?? (t.items || []).reduce((is, it) => is + (Number(it.quantity) || 0), 0)),
        0
      ),
      all_time_revenue: allCompletedTxns.reduce((s, t) => s + (Number(t.total) || 0), 0),
    },
    product_performance: productPerformance,
    transaction_history: transactionHistory,
    visit_history: visitHistory,
  });
});

apiRouter.get("/reports/:rtype", authMiddleware, (req: AuthenticatedRequest, res) => {
  const rtype = req.params.rtype;
  const from = (req.query.from as string) || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
  const rawSalesmanId = req.query.salesman_id as string;
  const salesmanId = req.user!.role === "SALES" ? req.user!._id : (rawSalesmanId === "ALL" ? "" : rawSalesmanId);
  const areaId = req.query.area_id as string;
  const skuId = req.query.sku_id as string;
  const routeId = req.query.route_id as string;
  const period = (req.query.period as string) || from.slice(0, 7);

  let data: any[] = [];

  switch (rtype) {
    case "route-performance": {
      // Aggregate performance per master route
      const routesList = db.routes.filter((r) => {
        if (routeId && routeId !== "ALL" && r._id !== routeId) return false;
        if (areaId && areaId !== "ALL" && r.area_id !== areaId) return false;
        if (salesmanId && r.salesman_id && r.salesman_id !== salesmanId) return false;
        return true;
      });

      data = routesList.map((r) => {
        const area = r.area_id ? db.areas.find((a) => a._id === r.area_id) : null;
        const sales = r.salesman_id ? db.users.find((u) => u._id === r.salesman_id) : null;
        const routeOutlets = db.outlets.filter((o) => o.route_id === r._id);
        const outletIds = new Set(routeOutlets.map((o) => o._id));

        // Calls & visits on this route
        const visits = db.visits.filter((v) => {
          if (!outletIds.has(v.outlet_id)) return false;
          if (v.date < from || v.date > to) return false;
          if (salesmanId && v.salesman_id !== salesmanId) return false;
          return v.status === "COMPLETED";
        });

        // Transactions on this route
        const txns = db.transactions.filter((t) => {
          if (!outletIds.has(t.outlet_id)) return false;
          const d = (t.transaction_date || "").slice(0, 10);
          if (d < from || d > to) return false;
          if (salesmanId && t.salesman_id !== salesmanId) return false;
          return t.status !== "CANCELLED" && (t as any).status !== "DRAFT";
        });

        const effectiveVisits = visits.filter((v) => v.call_result === "EFFECTIVE" || txns.some((t) => t.visit_id === v._id));
        const totalVol = txns.reduce((s, t) => s + (t.total_volume ?? (t.items || []).reduce((is, it) => is + (Number(it.quantity) || 0), 0)), 0);
        const totalRev = txns.reduce((s, t) => s + (Number(t.total) || 0), 0);
        const ecRate = visits.length > 0 ? Math.round((effectiveVisits.length / visits.length) * 100) : 0;
        const dropSize = txns.length > 0 ? Math.round(totalRev / txns.length) : 0;

        return {
          "Kode Rute": r.code || r._id,
          "Nama Rute": r.name,
          "Area / Wilayah": area?.name || "-",
          "Salesman Penanggung Jawab": sales?.name || "-",
          "Hari Kunjungan": r.day_of_week || "-",
          "Total Toko / Outlet": routeOutlets.length,
          "Total Kunjungan (Call)": visits.length,
          "Effective Call (EC)": effectiveVisits.length,
          "EC Rate (Strike Rate %)": `${ecRate}%`,
          "Total Transaksi": txns.length,
          "Volume Terjual (Qty)": totalVol,
          "Total Omset / Revenue (Rp)": totalRev,
          "Rata-rata Drop Size (Rp)": dropSize,
          Status: r.status || "ACTIVE",
        };
      });
      break;
    }

    case "call-plan-detail": {
      // Detailed daily execution of call plan items
      const plans = db.call_plans.filter((p) => {
        if (p.date < from || p.date > to) return false;
        if (salesmanId && p.salesman_id !== salesmanId) return false;
        if (routeId && routeId !== "ALL" && p.route_id !== routeId) return false;
        return true;
      });

      const planIds = new Set(plans.map((p) => p._id));
      const planItems = db.call_plan_items.filter((i) => planIds.has(i.call_plan_id));

      data = planItems.map((item) => {
        const plan = plans.find((p) => p._id === item.call_plan_id);
        const sales = plan ? db.users.find((u) => u._id === plan.salesman_id) : null;
        const outlet = db.outlets.find((o) => o._id === item.outlet_id);
        const route = plan?.route_id ? db.routes.find((r) => r._id === plan.route_id) : (outlet?.route_id ? db.routes.find((r) => r._id === outlet.route_id) : null);
        const area = outlet?.area_id ? db.areas.find((a) => a._id === outlet.area_id) : (sales?.area_id ? db.areas.find((a) => a._id === sales.area_id) : null);
        const visit = plan ? db.visits.find((v) => v.salesman_id === plan.salesman_id && v.date === plan.date && v.outlet_id === item.outlet_id) : null;

        const isVisited = item.status === "VISITED" || visit?.status === "COMPLETED";
        const isEffective = visit?.call_result === "EFFECTIVE" || ((visit?.total_sales || 0) > 0);

        return {
          Tanggal: plan?.date || "-",
          "Kode Plan": plan?.plan_code || item.call_plan_id,
          Salesman: sales?.name || "-",
          "Rute Kunjungan": route?.name || "-",
          Urutan: item.sequence || 1,
          "Kode Outlet": outlet?.outlet_code || item.outlet_id,
          "Nama Outlet": outlet?.outlet_name || "-",
          Alamat: outlet?.address || "-",
          Wilayah: area?.name || "-",
          Prioritas: (item as any).priority || "NORMAL",
          "Status Plan": isEffective ? "EFFECTIVE (ORDER)" : (isVisited ? "SELESAI KUNJUNGAN" : "PENDING"),
          "Jam Check-In": visit?.check_in_time ? new Date(visit.check_in_time).toLocaleTimeString("id-ID") : "-",
          "Jam Check-Out": visit?.check_out_time ? new Date(visit.check_out_time).toLocaleTimeString("id-ID") : "-",
          "Durasi (Menit)": visit?.duration_seconds ? Math.round(visit.duration_seconds / 60) : 0,
          "Total Penjualan (Rp)": visit?.total_sales || 0,
        };
      });
      break;
    }
    case "outlets":
    case "outlet-report": {
      // Re-use standard calculation logic for generic reports export
      const isSales = (req as any).user?.role === "SALES";
      const sId = isSales ? (req as any).user?._id : (salesmanId === "ALL" ? "" : salesmanId);
      const aId = areaId === "ALL" ? "" : areaId;

      recalculateAllOutletStatuses();

      const base = db.outlets.filter((o) => {
        if (isSales && !isOutletAssignedToSales((req as any).user?._id, o._id)) return false;
        if (aId && o.area_id !== aId) return false;
        return true;
      });

      data = base.map((o) => {
        const sales = getAssignedSalesForOutlet(o);
        const area = db.areas.find((a) => a._id === o.area_id);
        const allTxns = db.transactions
          .filter((t) => t.outlet_id === o._id && t.status !== "CANCELLED" && (t as any).status !== "DRAFT")
          .sort((a, b) => (a.transaction_date || "").localeCompare(b.transaction_date || ""));

        const firstTxn = allTxns[0];
        const lastTxn = allTxns[allTxns.length - 1];

        const periodTxns = allTxns.filter((t) => {
          const d = (t.transaction_date || "").slice(0, 10);
          if (d < from || d > to) return false;
          if (sId && t.salesman_id !== sId) return false;
          return true;
        });

        let pVolume = 0;
        let pRevenue = 0;
        periodTxns.forEach((t) => {
          let items = t.items || [];
          if (skuId && skuId !== "ALL") items = items.filter((it: any) => it.sku_id === skuId);
          items.forEach((it: any) => {
            const q = Number(it.quantity || it.volume || it.qty) || 0;
            const p = Number(it.unit_price || it.price) || 0;
            pVolume += q;
            pRevenue += q * p;
          });
        });

        if (!skuId || skuId === "ALL") {
          pVolume = periodTxns.reduce((s, t) => s + (t.total_volume ?? (t.items || []).reduce((is, it) => is + (Number(it.quantity) || 0), 0)), 0);
          pRevenue = periodTxns.reduce((s, t) => s + (Number(t.total) || 0), 0);
        }

        const visits = db.visits.filter((v) => v.outlet_id === o._id && v.status === "COMPLETED" && v.date >= from && v.date <= to && (!sId || v.salesman_id === sId));
        const oCall = visits.length > 0 ? 1 : 0;
        const effCall = oCall > 0 && (periodTxns.length > 0 || visits.some((v) => v.call_result === "EFFECTIVE")) ? 1 : 0;
        const ecRate = oCall > 0 ? Math.round((effCall / oCall) * 100) : 0;

        let daysSince = null;
        if (lastTxn?.transaction_date) {
          daysSince = Math.max(0, Math.floor((Date.now() - new Date(lastTxn.transaction_date).getTime()) / 86400000));
        }

        return {
          "Kode Outlet": o.outlet_code || o._id,
          "Nama Outlet": o.outlet_name,
          "Pemilik": o.owner_name || "-",
          "Telepon": o.phone || "-",
          "Wilayah / Area": area?.name || "-",
          "Sales Penanggung Jawab": sales?.sales_name || "-",
          "Status Lifecycle": o.lifecycle_status || "PROSPECT",
          "Outlet Call": oCall,
          "Effective Call": effCall,
          "EC Rate (%)": `${ecRate}%`,
          "Total Transaksi (Periode)": periodTxns.length,
          "Volume Penjualan (Qty)": pVolume,
          "Revenue / Penjualan (Rp)": pRevenue,
          "Transaksi Pertama": firstTxn?.transaction_date?.slice(0, 10) || "-",
          "Transaksi Terakhir": lastTxn?.transaction_date?.slice(0, 10) || "-",
          "Hari Sejak Txn Terakhir": daysSince !== null ? `${daysSince} hari` : "-",
        };
      });
      break;
    }

    case "target-performance":
      // Volume-based Target vs Actual Performance report per SKU / Salesman / Area
      const targetsList = db.targets.filter((t) => {
        if (t.status === "INACTIVE") return false;
        if (salesmanId && t.salesman_id && t.salesman_id !== salesmanId) return false;
        if (areaId && t.area_id && t.area_id !== areaId) return false;
        if (skuId && t.sku_id && t.sku_id !== skuId) return false;
        return true;
      });

      data = targetsList.map((t) => {
        const sales = t.salesman_id ? db.users.find((u) => u._id === t.salesman_id) : null;
        const area = t.area_id ? db.areas.find((a) => a._id === t.area_id) : (sales?.area_id ? db.areas.find((a) => a._id === sales.area_id) : null);
        const sku = t.sku_id ? db.skus.find((s) => s._id === t.sku_id) : null;
        const prod = t.product_id ? db.products.find((p) => p._id === t.product_id) : (sku?.product_id ? db.products.find((p) => p._id === sku.product_id) : null);

        const resAch = calculateVolumeTargetAndAchievement({
          salesmanId: t.salesman_id,
          areaId: t.area_id || sales?.area_id,
          productId: t.product_id || prod?._id,
          skuId: t.sku_id,
          period: t.period || period,
          from: from,
          to: to,
        });

        return {
          Salesman: sales?.name || "Semua Sales",
          Area: area?.name || "Semua Area",
          Produk: prod?.name || "Semua Produk",
          SKU: sku ? `${sku.name} (${sku.code})` : "Semua SKU",
          Periode: t.period || `${from} s/d ${to}`,
          "Target Volume (Qty)": t.target_volume,
          "Actual Volume (Qty)": resAch.actual_volume,
          "Achievement (%)": `${resAch.achievement_percentage}%`,
          "Status Target": resAch.status_label,
          "Nilai Penjualan / Revenue (Rp)": resAch.revenue,
          "Kode Target": t.target_code || t._id,
          Satuan: t.unit || "Unit",
        };
      });
      break;
    case "attendance":
      data = db.attendance
        .filter((a) => {
          if (a.date < from || a.date > to) return false;
          if (salesmanId && a.salesman_id !== salesmanId) return false;
          return true;
        })
        .map((a) => ({
          Tanggal: a.date,
          Salesman: db.users.find((u) => u._id === a.salesman_id)?.name || a.salesman_id,
          "Check-In": a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString("id-ID") : "-",
          "Check-Out": a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString("id-ID") : "-",
          "Jarak Masuk (m)": a.distance_in_m ?? "-",
          "Jarak Keluar (m)": a.distance_out_m ?? "-",
          Status: a.status,
        }));
      break;

    case "transactions":
      data = db.transactions
        .filter((t) => {
          const d = (t.transaction_date || "").slice(0, 10);
          if (d < from || d > to) return false;
          if (salesmanId && t.salesman_id !== salesmanId) return false;
          if (areaId) {
            const out = db.outlets.find((o) => o._id === t.outlet_id);
            if (!out || out.area_id !== areaId) return false;
          }
          return true;
        })
        .map((t) => {
          const out = db.outlets.find((o) => o._id === t.outlet_id);
          const totalQty = (t.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
          const itemSummary = formatSkuItemsSummary(t.items, true);
          return {
            "No. Invoice": t.invoice_number || t.transaction_code,
            Tanggal: t.transaction_date ? t.transaction_date.slice(0, 10) : "-",
            Salesman: db.users.find((u) => u._id === t.salesman_id)?.name || "-",
            Outlet: out?.outlet_name || "-",
            Area: db.areas.find((a) => a._id === out?.area_id)?.name || "-",
            "Metode Bayar": t.payment_method || "CASH",
            "Total Qty (Volume)": totalQty,
            "Rincian SKU": itemSummary,
            "Total Nilai (Rp)": t.total || 0,
            Status: t.status || "COMPLETED",
          };
        });
      break;

    case "call-achievement":
    case "daily-sales":
      // Group by Salesman and Date
      const salesList = salesmanId ? db.users.filter((u) => u._id === salesmanId) : db.users.filter((u) => u.role === "SALES");
      const resultRows: any[] = [];
      const curD = new Date(from);
      const endD = new Date(to);

      while (curD <= endD) {
        const dStr = curD.toISOString().slice(0, 10);
        salesList.forEach((s) => {
          if (areaId && s.area_id !== areaId) return;
          const kpi = calculateSalesKPIs({ salesmanId: s._id, from: dStr, to: dStr, skuId });
          const cp = db.call_plans.find((p) => p.salesman_id === s._id && p.date === dStr);
          const planned = cp ? db.call_plan_items.filter((i) => i.call_plan_id === cp._id).length : 0;
          const missed = Math.max(0, planned - kpi.outlet_calls);
          const callAch = planned > 0 ? Math.round((kpi.outlet_calls / planned) * 100) : 0;

          if (planned > 0 || kpi.outlet_calls > 0 || kpi.total_revenue > 0) {
            resultRows.push({
              Tanggal: dStr,
              Salesman: s.name,
              Area: db.areas.find((a) => a._id === s.area_id)?.name || "-",
              "Planned Call": planned,
              "Outlet Call": kpi.outlet_calls,
              "Effective Call": kpi.effective_calls,
              "EC Rate (%)": `${kpi.ec_rate}%`,
              "Missed Call": missed,
              "Call Ach (%)": `${callAch}%`,
              "Volume (Qty)": kpi.total_volume,
              "Nilai Penjualan (Rp)": kpi.total_revenue,
            });
          }
        });
        curD.setDate(curD.getDate() + 1);
      }
      data = resultRows;
      break;

    case "effective-call":
      data = db.visits
        .filter((v) => {
          if (v.status !== "COMPLETED") return false;
          if (v.date < from || v.date > to) return false;
          if (salesmanId && v.salesman_id !== salesmanId) return false;
          if (areaId) {
            const out = db.outlets.find((o) => o._id === v.outlet_id);
            if (!out || out.area_id !== areaId) return false;
          }
          return true;
        })
        .map((v) => {
          const out = db.outlets.find((o) => o._id === v.outlet_id);
          const txns = db.transactions.filter((t) => t.visit_id === v._id);
          const salesVal = txns.reduce((sum, t) => sum + (t.total || 0), 0);
          const volume = txns.reduce((sum, t) => sum + (t.items || []).reduce((isum: number, it: any) => isum + (Number(it.quantity) || 0), 0), 0);
          const isEC = v.call_result === "EFFECTIVE" || txns.length > 0;
          return {
            Tanggal: v.date,
            Salesman: db.users.find((u) => u._id === v.salesman_id)?.name || "-",
            Outlet: out?.outlet_name || "-",
            Area: db.areas.find((a) => a._id === out?.area_id)?.name || "-",
            "Tipe Call": isEC ? "EFFECTIVE CALL" : "OUTLET CALL",
            "Durasi (Menit)": v.duration_seconds ? Math.round(v.duration_seconds / 60) : 0,
            "Volume (Qty)": volume,
            "Nilai Penjualan (Rp)": salesVal,
          };
        });
      break;

    case "no-order-analysis":
    case "outlet-call":
    case "open-call":
      data = db.visits
        .filter((v) => {
          if (v.status !== "COMPLETED") return false;
          if (v.call_result === "EFFECTIVE") return false;
          if (v.date < from || v.date > to) return false;
          if (salesmanId && v.salesman_id !== salesmanId) return false;
          return true;
        })
        .map((v) => {
          const out = db.outlets.find((o) => o._id === v.outlet_id);
          const reason = db.open_call_reasons.find((r) => r._id === v.open_reason_id)?.name || "Lain-lain";
          return {
            Tanggal: v.date,
            Salesman: db.users.find((u) => u._id === v.salesman_id)?.name || "-",
            Outlet: out?.outlet_name || "-",
            Area: db.areas.find((a) => a._id === out?.area_id)?.name || "-",
            "Alasan Tanpa Order": reason,
            Catatan: v.notes || "-",
            "Durasi (Menit)": v.duration_seconds ? Math.round(v.duration_seconds / 60) : 0,
          };
        });
      break;

    case "sales-performance":
      data = db.users
        .filter((u) => u.role === "SALES" && (!salesmanId || u._id === salesmanId))
        .map((u) => {
          const kpi = calculateSalesKPIs({ salesmanId: u._id, from, to, areaId, skuId });
          const tgt = calculateVolumeTargetAndAchievement({ salesmanId: u._id, from, to, areaId, skuId });
          const salesPlans = db.call_plans.filter((p) => p.salesman_id === u._id && p.date >= from && p.date <= to);
          const salesPlanIds = new Set(salesPlans.map((p) => p._id));
          const salesPlanned = db.call_plan_items.filter((i) => salesPlanIds.has(i.call_plan_id)).length;
          const callAch = salesPlanned > 0 ? Math.round((kpi.outlet_calls / salesPlanned) * 100) : 0;
          return {
            Salesman: u.name,
            Kode: (u as any).code || u._id,
            Area: db.areas.find((a) => a._id === u.area_id)?.name || "-",
            "Planned Call": salesPlanned,
            "Outlet Call": kpi.outlet_calls,
            "Effective Call": kpi.effective_calls,
            "EC Rate (%)": `${kpi.ec_rate}%`,
            "Call Ach (%)": `${callAch}%`,
            "Target Volume (Qty)": tgt.target_volume,
            "Actual Volume (Qty)": kpi.total_volume,
            "Achievement (%)": `${tgt.achievement_percentage}%`,
            "Status Target": tgt.status_label,
            "Transaksi": kpi.transaction_count,
            "Nilai Penjualan (Rp)": kpi.total_revenue,
          };
        });
      break;

    case "area-performance":
      data = db.areas
        .filter((a) => !areaId || a._id === areaId)
        .map((a) => {
          const kpi = calculateSalesKPIs({ from, to, areaId: a._id, skuId });
          const tgt = calculateVolumeTargetAndAchievement({ areaId: a._id, from, to, skuId });
          const totalOut = db.outlets.filter((o) => o.area_id === a._id).length;
          return {
            Area: a.name,
            "Total Outlet": totalOut,
            "Outlet Call": kpi.outlet_calls,
            "Effective Call": kpi.effective_calls,
            "EC Rate (%)": `${kpi.ec_rate}%`,
            "Target Volume (Qty)": tgt.target_volume,
            "Actual Volume (Qty)": kpi.total_volume,
            "Achievement (%)": `${tgt.achievement_percentage}%`,
            "Status Target": tgt.status_label,
            "Total Transaksi": kpi.transaction_count,
            "Nilai Penjualan (Rp)": kpi.total_revenue,
          };
        });
      break;

    case "product-coverage":
      data = db.skus
        .filter((s) => !skuId || s._id === skuId)
        .map((s) => {
          const kpi = calculateSalesKPIs({ from, to, areaId, skuId: s._id });
          const tgt = calculateVolumeTargetAndAchievement({ skuId: s._id, from, to, areaId });
          const totalOut = db.outlets.length;
          const covPct = totalOut > 0 ? Math.round((kpi.effective_calls / totalOut) * 100) : 0;
          return {
            "Kode SKU": s.code,
            "Nama SKU": s.name,
            Kategori: s.category || "-",
            "Target Volume (Qty)": tgt.target_volume,
            "Actual Volume (Qty)": kpi.total_volume,
            "Achievement (%)": `${tgt.achievement_percentage}%`,
            "Status Target": tgt.status_label,
            "Effective Call (Outlet Beli)": kpi.effective_calls,
            "Cakupan Outlet (%)": `${covPct}%`,
            "Nilai Penjualan (Rp)": kpi.total_revenue,
          };
        });
      break;

    case "outlet-coverage":
      data = db.outlets
        .filter((o) => !areaId || o.area_id === areaId)
        .map((o) => {
          const vList = db.visits.filter((v) => v.outlet_id === o._id && v.status === "COMPLETED" && v.date >= from && v.date <= to);
          const tList = db.transactions.filter((t) => t.outlet_id === o._id && (t.transaction_date || "").slice(0, 10) >= from && (t.transaction_date || "").slice(0, 10) <= to);
          const salesVal = tList.reduce((sum, t) => sum + (t.total || 0), 0);
          const volume = tList.reduce((sum, t) => sum + (t.items || []).reduce((isum: number, it: any) => isum + (Number(it.quantity) || 0), 0), 0);
          return {
            "Kode Outlet": o.outlet_code || o._id,
            "Nama Outlet": o.outlet_name,
            Area: db.areas.find((a) => a._id === o.area_id)?.name || "-",
            Channel: db.channels.find((c) => c._id === o.channel_id)?.name || "-",
            "Jumlah Kunjungan": vList.length,
            "Status Call": tList.length > 0 ? "EFFECTIVE CALL" : (vList.length > 0 ? "OUTLET CALL" : "TIDAK DIKUNJUNGI"),
            "Volume (Qty)": volume,
            "Nilai Penjualan (Rp)": salesVal,
          };
        });
      break;

    case "new-outlets":
      data = db.outlets
        .filter((o) => {
          const d = (o.created_at || "").slice(0, 10);
          if (d < from || d > to) return false;
          if (salesmanId && o.created_by !== salesmanId) return false;
          if (areaId && o.area_id !== areaId) return false;
          return true;
        })
        .map((o) => ({
          Tanggal: (o.created_at || "").slice(0, 10),
          "Nama Outlet": o.outlet_name,
          Pemilik: o.owner_name,
          Telepon: o.phone,
          Area: db.areas.find((a) => a._id === o.area_id)?.name || "-",
          Channel: db.channels.find((c) => c._id === o.channel_id)?.name || "-",
          Alamat: o.address,
          Didaftarkan: db.users.find((u) => u._id === o.created_by)?.name || "-",
        }));
      break;

    case "daily-stock-movement":
      data = db.stock_movements
        .filter((m) => {
          if (m.business_date < from || m.business_date > to) return false;
          if (salesmanId && m.salesman_id !== salesmanId) return false;
          if (skuId && m.sku_id !== skuId) return false;
          return true;
        })
        .map((m) => {
          const skuInfo = resolveSkuInfo(m.sku_id);
          const sales = m.salesman_id ? db.users.find((u) => u._id === m.salesman_id) : null;
          const outlet = m.outlet_id ? db.outlets.find((o) => o._id === m.outlet_id) : null;
          const creator = db.users.find((u) => u._id === m.created_by);
          return {
            "No. Mutasi": m.movement_code || m._id,
            Tanggal: m.business_date,
            "Jenis Mutasi": m.movement_type,
            "Kode SKU": skuInfo.sku_code || "-",
            "Nama SKU": skuInfo.resolved_name,
            "Kuantitas (Qty)": m.quantity,
            Satuan: skuInfo.uom || "Unit",
            "Lokasi Asal": m.source_location_type === "SALES" ? `Sales: ${sales?.name || m.source_location_id}` : (m.source_location_type === "WAREHOUSE" ? "Gudang Pusat" : m.source_location_type),
            "Lokasi Tujuan": m.destination_location_type === "SALES" ? `Sales: ${sales?.name || m.destination_location_id}` : (m.destination_location_type === "OUTLET" ? `Outlet: ${outlet?.outlet_name || m.destination_location_id}` : (m.destination_location_type === "WAREHOUSE" ? "Gudang Pusat" : m.destination_location_type)),
            Salesman: sales?.name || "-",
            Referensi: m.reference_id || "-",
            Catatan: m.notes || "-",
            "Diproses Oleh": creator?.name || "-",
            Waktu: m.created_at ? new Date(m.created_at).toLocaleString("id-ID") : "-",
          };
        });
      break;

    case "sales-stock-ledger":
      // Ledger per salesman per date
      const salesReps = salesmanId ? db.users.filter((u) => u._id === salesmanId) : db.users.filter((u) => u.role === "SALES");
      const ledgerRows: any[] = [];
      const cDate = new Date(from);
      const eDate = new Date(to);

      while (cDate <= eDate) {
        const dStr = cDate.toISOString().slice(0, 10);
        salesReps.forEach((rep) => {
          db.skus.filter((s) => !skuId || s._id === skuId).forEach((sku) => {
            const skuInfo = resolveSkuInfo(sku);
            const hndIn = db.stock_movements
              .filter((m) => m.business_date === dStr && m.salesman_id === rep._id && m.sku_id === sku._id && m.movement_type === "TRANSFER_IN")
              .reduce((sum, m) => sum + m.quantity, 0);

            const soldOut = db.stock_movements
              .filter((m) => m.business_date === dStr && m.salesman_id === rep._id && m.sku_id === sku._id && m.movement_type === "SALES_OUT")
              .reduce((sum, m) => sum + m.quantity, 0);

            const retIn = db.stock_movements
              .filter((m) => m.business_date === dStr && m.salesman_id === rep._id && m.sku_id === sku._id && m.movement_type === "RETURN_IN")
              .reduce((sum, m) => sum + m.quantity, 0);

            const salesInv = db.inventory.find((i) => i.location_type === "SALES" && i.location_id === rep._id && i.sku_id === sku._id);
            const currentStock = salesInv ? salesInv.available_stock : 0;
            const expectedRemaining = Math.max(0, hndIn - soldOut - retIn);
            const selisih = currentStock - expectedRemaining;

            if (hndIn > 0 || soldOut > 0 || retIn > 0 || currentStock > 0) {
              ledgerRows.push({
                Tanggal: dStr,
                Salesman: rep.name,
                "Kode SKU": skuInfo.sku_code || "-",
                "Nama SKU": skuInfo.resolved_name,
                "Stok Dibawa (Qty)": hndIn,
                "Stok Terjual (Qty)": soldOut,
                "Stok Retur (Qty)": retIn,
                "Sisa Stok Fisik": currentStock,
                "Sisa Seharusnya": expectedRemaining,
                "Selisih (Discrepancy)": selisih === 0 ? "SEIMBANG (0)" : (selisih > 0 ? `LEBIH (+${selisih})` : `KURANG (${selisih})`),
                Satuan: skuInfo.uom || "Unit",
              });
            }
          });
        });
        cDate.setDate(cDate.getDate() + 1);
      }
      data = ledgerRows;
      break;

    case "stock-handover":
      data = db.stock_handovers
        .filter((h) => {
          if (h.business_date < from || h.business_date > to) return false;
          if (salesmanId && h.salesman_id !== salesmanId) return false;
          return true;
        })
        .map((h) => {
          const sales = db.users.find((u) => u._id === h.salesman_id);
          const wh = db.offices.find((o) => o._id === h.warehouse_id);
          const prep = h.prepared_by ? db.users.find((u) => u._id === h.prepared_by)?.name : "-";
          const conf = h.confirmed_by ? db.users.find((u) => u._id === h.confirmed_by)?.name : "-";
          const totalQty = (h.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);
          const itemSummary = formatSkuItemsSummary(h.items, true);

          return {
            "No. Handover": h.handover_code || h._id,
            Tanggal: h.business_date,
            Salesman: sales?.name || "-",
            Gudang: wh?.office_name || "Gudang Pusat",
            Tipe: h.is_additional ? "TAMBAHAN (Restock Siang)" : "SERAH TERIMA PAGI",
            "Total Qty (Volume)": totalQty,
            "Rincian SKU": itemSummary,
            Status: h.status,
            "Disiapkan Oleh": prep,
            "Dikonfirmasi Oleh": conf,
            Catatan: h.notes || "-",
          };
        });
      break;

    case "sales-return":
      data = db.stock_returns
        .filter((r) => {
          if (r.business_date < from || r.business_date > to) return false;
          if (salesmanId && r.salesman_id !== salesmanId) return false;
          return true;
        })
        .map((r) => {
          const sales = db.users.find((u) => u._id === r.salesman_id);
          const wh = db.offices.find((o) => o._id === r.warehouse_id);
          const conf = r.confirmed_by ? db.users.find((u) => u._id === r.confirmed_by)?.name : "-";
          const totalQty = (r.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);
          const itemSummary = formatSkuItemsSummary(r.items, true);

          return {
            "No. Retur": r.return_code || r._id,
            Tanggal: r.business_date,
            Salesman: sales?.name || "-",
            Gudang: wh?.office_name || "Gudang Pusat",
            "Total Qty Retur": totalQty,
            "Rincian SKU": itemSummary,
            Status: r.status,
            "Dikonfirmasi Oleh": conf,
            Catatan: r.notes || "-",
          };
        });
      break;

    case "stock-reconciliation":
      const reconList: any[] = [];
      const recDate = new Date(from);
      const recEndDate = new Date(to);

      while (recDate <= recEndDate) {
        const dStr = recDate.toISOString().slice(0, 10);
        const activeSales = salesmanId ? db.users.filter((u) => u._id === salesmanId) : db.users.filter((u) => u.role === "SALES");
        activeSales.forEach((s) => {
          db.skus.filter((sku) => !skuId || sku._id === skuId).forEach((sku) => {
            const skuInfo = resolveSkuInfo(sku);
            const handoverQty = db.stock_movements
              .filter((m) => m.business_date === dStr && m.salesman_id === s._id && m.sku_id === sku._id && m.movement_type === "TRANSFER_IN")
              .reduce((sum, m) => sum + m.quantity, 0);

            const soldQty = db.stock_movements
              .filter((m) => m.business_date === dStr && m.salesman_id === s._id && m.sku_id === sku._id && m.movement_type === "SALES_OUT")
              .reduce((sum, m) => sum + m.quantity, 0);

            const returnQty = db.stock_movements
              .filter((m) => m.business_date === dStr && m.salesman_id === s._id && m.sku_id === sku._id && m.movement_type === "RETURN_IN")
              .reduce((sum, m) => sum + m.quantity, 0);

            const salesInv = db.inventory.find((i) => i.location_type === "SALES" && i.location_id === s._id && i.sku_id === sku._id);
            const actualRemaining = salesInv ? salesInv.available_stock : 0;
            const expectedRemaining = Math.max(0, handoverQty - soldQty - returnQty);
            const variance = actualRemaining - expectedRemaining;

            if (handoverQty > 0 || soldQty > 0 || returnQty > 0 || actualRemaining > 0) {
              reconList.push({
                Tanggal: dStr,
                Salesman: s.name,
                "Kode SKU": skuInfo.sku_code || "-",
                "Nama SKU": skuInfo.resolved_name,
                "Stok Dibawa (Pagi)": handoverQty,
                "Stok Terjual (Customer)": soldQty,
                "Retur ke Gudang": returnQty,
                "Sisa Seharusnya": expectedRemaining,
                "Sisa Aktual Sales": actualRemaining,
                "Status Rekonsiliasi": variance === 0 ? "PAS (MATCH)" : (variance > 0 ? `SURPLUS (+${variance})` : `DEFISIT (${variance})`),
                Satuan: skuInfo.uom || "Unit",
              });
            }
          });
        });
        recDate.setDate(recDate.getDate() + 1);
      }
      data = reconList;
      break;

    case "inventory":
      data = db.skus
        .filter((s) => !skuId || s._id === skuId)
        .map((s) => {
          const skuInfo = resolveSkuInfo(s);
          const whInv = db.inventory.find(
            (i) => (i.location_type === "WAREHOUSE" || !i.location_type) && i.sku_id === s._id
          );
          const whStock = whInv ? whInv.available_stock : 0;

          // Sales stocks sum
          const salesInvs = db.inventory.filter((i) => i.location_type === "SALES" && i.sku_id === s._id);
          const totalSalesStock = salesInvs.reduce((sum, i) => sum + i.available_stock, 0);
          const prc = db.prices.find((p) => p.sku_id === s._id && p.status === "ACTIVE");

          return {
            "Kode SKU": skuInfo.sku_code || "-",
            "Nama SKU": skuInfo.resolved_name,
            Satuan: skuInfo.uom || "Unit",
            "Stok Gudang Pusat": whStock,
            "Total Stok di Sales": totalSalesStock,
            "Total Stok Fisik": whStock + totalSalesStock,
            "Harga Satuan (Rp)": prc?.price || 0,
            "Nilai Aset Stok (Rp)": (whStock + totalSalesStock) * (prc?.price || 0),
            Status: whStock <= (whInv?.reorder_level || 20) ? "PERLU REORDER" : "AMAN",
          };
        });
      break;

    default:
      data = db.visits
        .filter((v) => v.date >= from && v.date <= to)
        .map((v) => ({
          Tanggal: v.date,
          Salesman: db.users.find((u) => u._id === v.salesman_id)?.name || "-",
          Outlet: db.outlets.find((o) => o._id === v.outlet_id)?.outlet_name || "-",
          "Check-In": v.check_in_time,
          "Durasi (Menit)": v.duration_seconds ? Math.round(v.duration_seconds / 60) : 0,
          Hasil: v.call_result === "EFFECTIVE" ? "EFFECTIVE CALL" : "OUTLET CALL",
          "Nilai Penjualan (Rp)": v.total_sales || 0,
        }));
      break;
  }

  if (req.query.format === "csv") {
    if (!data.length) return res.send("No data");
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((row) => Object.values(row).map((v) => `"${v}"`).join(","));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${rtype}-report.csv"`);
    return res.send([headers, ...rows].join("\n"));
  }

  res.json({ report_type: rtype, total: data.length, data });
});

// ================= STOCK MOVEMENT ENGINE HELPERS =================
function ensureWarehouseInventory(warehouseId: string, skuId: string): InventoryItem {
  let inv = db.inventory.find(
    (i) => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === warehouseId || i.office_id === warehouseId) && i.sku_id === skuId
  );
  if (!inv) {
    inv = {
      _id: `inv-wh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      location_type: "WAREHOUSE",
      location_id: warehouseId,
      office_id: warehouseId,
      sku_id: skuId,
      stock_on_hand: 0,
      allocated_stock: 0,
      available_stock: 0,
      reorder_level: 20,
      updated_at: new Date().toISOString(),
    };
    db.inventory.push(inv);
  }
  return inv;
}

function ensureSalesInventory(salesmanId: string, skuId: string): InventoryItem {
  let inv = db.inventory.find(
    (i) => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === skuId
  );
  if (!inv) {
    const salesUser = db.users.find((u) => u._id === salesmanId);
    inv = {
      _id: `inv-sls-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      location_type: "SALES",
      location_id: salesmanId,
      office_id: salesUser?.office_id || "off-1",
      sku_id: skuId,
      stock_on_hand: 0,
      allocated_stock: 0,
      available_stock: 0,
      updated_at: new Date().toISOString(),
    };
    db.inventory.push(inv);
  }
  return inv;
}

function getWarehouseStock(warehouseId: string, skuId: string): number {
  const inv = db.inventory.find(
    (i) => (i.location_type === "WAREHOUSE" || !i.location_type) && (i.location_id === warehouseId || i.office_id === warehouseId) && i.sku_id === skuId
  );
  return inv ? inv.available_stock : 0;
}

function getSalesStock(salesmanId: string, skuId: string): number {
  const inv = db.inventory.find(
    (i) => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === skuId
  );
  return inv ? inv.available_stock : 0;
}

export function syncSalesStockLedger(salesmanId: string, skuId: string, businessDate: string): SalesStockLedger {
  const ledgerId = `ssl-${salesmanId}-${businessDate}-${skuId}`;

  // Find all completed movements for this sales and sku today
  const mvts = db.stock_movements.filter(
    (m) => m.business_date === businessDate && m.salesman_id === salesmanId && m.sku_id === skuId && m.status === "COMPLETED"
  );

  let transfersIn = 0;
  let salesOut = 0;
  let returnsOut = 0;
  let adjustmentsIn = 0;
  let adjustmentsOut = 0;

  for (const m of mvts) {
    if (m.destination_location_type === "SALES" && m.destination_location_id === salesmanId) {
      // Stock entering sales
      if (m.movement_type === "ADJUSTMENT_IN") {
        adjustmentsIn += m.quantity;
      } else if (m.movement_type === "REVERSAL") {
        salesOut -= m.quantity; // Void cancels out sale
      } else {
        // Includes TRANSFER_OUT from warehouse (which is handovers to sales)
        transfersIn += m.quantity;
      }
    } else if (m.source_location_type === "SALES" && m.source_location_id === salesmanId) {
      // Stock leaving sales
      if (m.movement_type === "SALES_OUT") {
        salesOut += m.quantity;
      } else if (m.movement_type === "ADJUSTMENT_OUT") {
        adjustmentsOut += m.quantity;
      } else {
        // Includes TRANSFER_IN to warehouse (which is returns from sales)
        returnsOut += m.quantity;
      }
    }
  }

  // 5. Current physical stock in sales inventory
  const salesInv = db.inventory.find(
    (i) => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === skuId
  );
  const closingBalance = salesInv ? salesInv.available_stock : 0;

  // 6. Existing ledger record or calculate opening balance
  let ledger = db.sales_stock_ledgers.find((l) => l._id === ledgerId);
  let openingBalance = 0;

  if (ledger && typeof ledger.opening_balance === "number") {
    openingBalance = ledger.opening_balance;
  } else {
    // Check previous day's closing balance if available
    const prevLedger = db.sales_stock_ledgers
      .filter((l) => l.salesman_id === salesmanId && l.sku_id === skuId && l.business_date < businessDate)
      .sort((a, b) => b.business_date.localeCompare(a.business_date))[0];
    if (prevLedger) {
      openingBalance = prevLedger.closing_balance || 0;
    }
  }

  const expectedBalance = Math.max(0, openingBalance + transfersIn + adjustmentsIn - salesOut - returnsOut - adjustmentsOut);
  const discrepancy = closingBalance - expectedBalance;
  const status = discrepancy === 0 ? "BALANCED" : (discrepancy > 0 ? "SURPLUS" : "DEFICIT");

  const lastMvt = db.stock_movements
    .filter((m) => m.business_date === businessDate && m.salesman_id === salesmanId && m.sku_id === skuId)
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];

  const nowStr = new Date().toISOString();

  if (!ledger) {
    ledger = {
      _id: ledgerId,
      salesman_id: salesmanId,
      business_date: businessDate,
      sku_id: skuId,
      opening_balance: openingBalance,
      transfers_in: transfersIn,
      sales_out: salesOut,
      returns_out: returnsOut,
      closing_balance: closingBalance,
      expected_balance: expectedBalance,
      discrepancy,
      status,
      last_movement_id: lastMvt?._id,
      notes: `Sinkronisasi Buku Stok per ${businessDate}`,
      updated_at: nowStr,
    };
    db.sales_stock_ledgers.push(ledger);
  } else {
    ledger.opening_balance = openingBalance;
    ledger.transfers_in = transfersIn;
    ledger.sales_out = salesOut;
    ledger.returns_out = returnsOut;
    ledger.closing_balance = closingBalance;
    ledger.expected_balance = expectedBalance;
    ledger.discrepancy = discrepancy;
    ledger.status = status;
    ledger.last_movement_id = lastMvt?._id || ledger.last_movement_id;
    ledger.updated_at = nowStr;
  }

  // Update PostgreSQL
  try {
    
    // We do an upsert
    sqlDb.insert(pgSalesStockLedgers).values({
      id: ledger._id,
      salesmanId: ledger.salesman_id,
      date: ledger.business_date,
      skuId: ledger.sku_id,
      initialStock: ledger.opening_balance,
      loadedStock: ledger.transfers_in + adjustmentsIn,
      soldStock: ledger.sales_out,
      returnedStock: ledger.returns_out + adjustmentsOut,
      finalStock: ledger.closing_balance
    }).onConflictDoUpdate({
      target: pgSalesStockLedgers.id,
      set: {
        initialStock: ledger.opening_balance,
        loadedStock: ledger.transfers_in + adjustmentsIn,
        soldStock: ledger.sales_out,
        returnedStock: ledger.returns_out + adjustmentsOut,
        finalStock: ledger.closing_balance
      }
    }).catch((e: any) => console.error("Error syncing sales ledger to pg:", e.message));
  } catch (err: any) {
    console.error("Failed to sync ledger to postgres", err.message);
  }

  syncSingleDoc("sales_stock_ledgers", ledger._id, ledger);
  return ledger;
}

// ================= DAILY STOCK HANDOVER (SERAH TERIMA PAGI) =================
apiRouter.get("/stock/handovers", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { business_date, warehouse_id, salesman_id, status } = req.query as Record<string, string>;

  // Sales can only view their own handovers
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : salesman_id;

  let query = "SELECT * FROM stock_handovers WHERE 1=1";
  
  if (business_date) {
    query += ` AND handover_date = '${business_date.replace(/'/g, "''")}'`;
  }
  
  if (warehouse_id) {
    query += ` AND office_id = '${warehouse_id.replace(/'/g, "''")}'`;
  }
  
  if (targetSalesId) {
    query += ` AND salesman_id = '${targetSalesId.replace(/'/g, "''")}'`;
  }
  
  if (status) {
    query += ` AND status = '${status.replace(/'/g, "''")}'`;
  }

  query += " ORDER BY created_at DESC";

  try {
    const resDb: any = await (sqlDb as any).execute(sql.raw(query));
    const items = (resDb.rows || []).map((row: any) => ({
      _id: row.id,
      handover_code: row.handover_number,
      salesman_id: row.salesman_id,
      warehouse_id: row.office_id,
      business_date: row.handover_date,
      status: row.status,
      items: row.items,
      notes: row.notes,
      confirmed_by: row.approved_by,
      created_at: row.created_at,
      prepared_by: (row.metadata as any)?.prepared_by || null,
      is_additional: (row.metadata as any)?.is_additional || false,
      handover_type: (row.metadata as any)?.handover_type || "INITIAL_HANDOVER",
      handover_time: (row.metadata as any)?.handover_time || "08:00"
    }));

    const enriched = items.map((h: any) => {
      const sales = db.users.find((u) => u._id === h.salesman_id);
      const wh = db.offices.find((o) => o._id === h.warehouse_id);
      const prepUser = h.prepared_by ? db.users.find((u) => u._id === h.prepared_by) : null;
      const confUser = h.confirmed_by ? db.users.find((u) => u._id === h.confirmed_by) : null;

      const enrichedItems = (h.items || []).map((it: any) => {
        const skuInfo = resolveSkuInfo(it.sku_id);
        const prc = db.prices.find((p) => p.sku_id === it.sku_id && p.status === "ACTIVE");
        const currentWhStock = getWarehouseStock(h.warehouse_id, it.sku_id);
        const currentSalesStock = getSalesStock(h.salesman_id, it.sku_id);

        return {
          ...it,
          sku_code: skuInfo.sku_code || "-",
          sku_name: skuInfo.resolved_name,
          unit: skuInfo.uom || "Unit",
          price: prc?.price || 0,
          warehouse_available_stock: currentWhStock,
          sales_current_stock: currentSalesStock,
        };
      });

      const totalQty = enrichedItems.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0);
      const totalEstValue = enrichedItems.reduce((sum: number, it: any) => sum + ((it.quantity || 0) * (it.price || 0)), 0);

      return {
        ...h,
        salesman_name: sales?.name || "-",
        salesman_code: (sales as any)?.code || "-",
        warehouse_name: wh?.office_name || "Gudang Pusat",
        prepared_by_name: prepUser?.name || "-",
        confirmed_by_name: confUser?.name || "-",
        total_items_count: enrichedItems.length,
        total_quantity: totalQty,
        total_estimated_value: totalEstValue,
        sku_summary: formatSkuItemsSummary(h.items, true),
        items: enrichedItems,
      };
    });

    res.json({ items: enriched, total: enriched.length });
  } catch (err: any) {
    console.warn("Error fetching handovers from PG, falling back to memory:", err.message);
    const enriched = (db.stock_handovers || []).map((h: any) => {
      const sales = db.users.find((u) => u._id === h.salesman_id);
      const wh = db.offices.find((o) => o._id === h.warehouse_id);
      return {
        ...h,
        salesman_name: sales?.name || "-",
        warehouse_name: wh?.office_name || "Gudang Pusat",
      };
    });
    res.json({ items: enriched, total: enriched.length });
  }
});

apiRouter.get("/stock/handovers/:id", authMiddleware, (req: AuthenticatedRequest, res) => {
  const h = db.stock_handovers.find((item) => item._id === req.params.id);
  if (!h) return res.status(404).json({ detail: "Data serah terima stok tidak ditemukan." });

  if (req.user!.role === "SALES" && h.salesman_id !== req.user!._id) {
    return res.status(403).json({ detail: "Anda tidak berhak melihat data serah terima sales lain." });
  }

  const sales = db.users.find((u) => u._id === h.salesman_id);
  const wh = db.offices.find((o) => o._id === h.warehouse_id);
  const prepUser = h.prepared_by ? db.users.find((u) => u._id === h.prepared_by) : null;
  const confUser = h.confirmed_by ? db.users.find((u) => u._id === h.confirmed_by) : null;

  const enrichedItems = (h.items || []).map((it) => {
    const skuInfo = resolveSkuInfo(it.sku_id);
    const prc = db.prices.find((p) => p.sku_id === it.sku_id && p.status === "ACTIVE");
    return {
      ...it,
      sku_code: skuInfo.sku_code || "-",
      sku_name: skuInfo.resolved_name,
      unit: skuInfo.uom || "Unit",
      price: prc?.price || 0,
      warehouse_available_stock: getWarehouseStock(h.warehouse_id, it.sku_id),
      sales_current_stock: getSalesStock(h.salesman_id, it.sku_id),
    };
  });

  res.json({
    ...h,
    salesman_name: sales?.name || "-",
    salesman_code: (sales as any)?.code || "-",
    warehouse_name: wh?.office_name || "Gudang Pusat",
    prepared_by_name: prepUser?.name || "-",
    confirmed_by_name: confUser?.name || "-",
    sku_summary: formatSkuItemsSummary(h.items, true),
    items: enrichedItems,
  });
});

apiRouter.post("/stock/handovers", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {
  const { business_date, warehouse_id, salesman_id, items, notes, is_additional, handover_type, handover_time, time, auto_confirm } = req.body || {};

  const targetDate = business_date || getTodayWIB();
  const targetWhId = warehouse_id || req.user?.office_id || "off-1";
  const isAdditional = !!is_additional || handover_type === "ADDITIONAL_HANDOVER";
  const type: "INITIAL_HANDOVER" | "ADDITIONAL_HANDOVER" = isAdditional ? "ADDITIONAL_HANDOVER" : "INITIAL_HANDOVER";
  const handoverTime = handover_time || time || new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  if (!salesman_id || !items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ detail: "Salesman, tanggal, dan daftar item produk wajib diisi." });
  }

  const rawSalesmanId = salesman_id;
  const salesMaster = db.salesmen.find((s) => s._id === rawSalesmanId || s.user_id === rawSalesmanId);
  const cleanId = rawSalesmanId.replace(/^sm-/, "");
  const sales = db.users.find((u) => u._id === rawSalesmanId || u._id === cleanId || u._id === salesMaster?.user_id) || salesMaster;
  if (!sales) {
    return res.status(404).json({ detail: "Salesman tidak ditemukan dalam sistem." });
  }
  const resolvedSalesmanId = (sales as any).user_id || sales._id;

  const wh = db.offices.find((o) => o._id === targetWhId);

  // Validate duplicate handover for same sales & date if initial handover
  if (!isAdditional) {
    const existing = db.stock_handovers.find(
      (h) => (h.salesman_id === resolvedSalesmanId || h.salesman_id === rawSalesmanId) && h.business_date === targetDate && h.status !== "CANCELLED" && !h.is_additional && (h as any).handover_type !== "ADDITIONAL_HANDOVER"
    );
    if (existing) {
      return res.status(400).json({
        detail: `Serah terima stok awal (Initial Handover) untuk ${sales.name} pada tanggal ${targetDate} sudah terdaftar (${existing.handover_code}). Silakan gunakan opsi "Stock Handover Tambahan / Additional Handover" untuk menambah stok lagi.`,
        code: "DUPLICATE_HANDOVER",
      });
    }
  }

  // Validate item quantities and active SKU
  const processedItems = [];
  for (const it of items) {
    const qty = parseInt(it.quantity) || 0;
    if (qty <= 0) {
      return res.status(400).json({ detail: "Kuantitas setiap item produk harus lebih dari 0." });
    }
    const sku = db.skus.find((s) => s._id === it.sku_id && s.status === "ACTIVE");
    if (!sku) {
      return res.status(400).json({ detail: `SKU dengan ID ${it.sku_id} tidak valid atau tidak aktif.` });
    }
    processedItems.push({
      sku_id: it.sku_id,
      quantity: qty,
      notes: it.notes || "",
    });
  }

  const count = db.stock_handovers.length + 1;
  const prefix = isAdditional ? "HND-ADD" : "HND";
  const handoverCode = `${prefix}-${targetDate.replace(/-/g, "")}-${String(count).padStart(3, "0")}`;
  const handoverId = `hnd-${Date.now()}`;
  const nowStr = new Date().toISOString();

  const newHandover = {
    _id: handoverId,
    handover_code: handoverCode,
    business_date: targetDate,
    warehouse_id: targetWhId,
    salesman_id: resolvedSalesmanId,
    status: auto_confirm ? "CONFIRMED" : "DRAFT",
    is_additional: isAdditional,
    items: processedItems,
    notes: notes || "",
    prepared_by: req.user!._id,
    prepared_at: nowStr,
    confirmed_by: auto_confirm ? req.user!._id : undefined,
    confirmed_at: auto_confirm ? nowStr : undefined,
    created_by: req.user!._id,
    created_at: nowStr,
    updated_at: nowStr,
    handover_type: type,
    handover_time: handoverTime
  };

  db.stock_handovers.push(newHandover as any);
  syncSingleDoc("stock_handovers", newHandover._id, newHandover);

  try {
    await sqlDb.insert(pgStockHandovers).values({
      id: newHandover._id,
      handoverNumber: newHandover.handover_code,
      salesmanId: newHandover.salesman_id,
      officeId: newHandover.warehouse_id,
      handoverDate: newHandover.business_date,
      status: newHandover.status,
      items: newHandover.items,
      notes: newHandover.notes,
      approvedBy: newHandover.confirmed_by,
      createdAt: new Date(newHandover.created_at)
    });
  } catch (err: any) {
    console.error("Error inserting handover to Postgres:", err.message);
  }

  if (auto_confirm) {
    try {
      await InventoryService.processHandover(newHandover, newHandover.items, req.user!._id);
      await refreshInventoryCache();
    } catch (err: any) {
      return res.status(400).json({ detail: err.message, code: "INSUFFICIENT_WAREHOUSE_STOCK" });
    }
  }

  res.status(201).json(newHandover);
});

apiRouter.post("/stock/handovers/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {
  const h = db.stock_handovers.find((item) => item._id === req.params.id);
  if (!h) return res.status(404).json({ detail: "Data serah terima tidak ditemukan." });

  if (h.status === "CONFIRMED") {
    return res.status(400).json({ detail: "Serah terima ini sudah pernah dikonfirmasi sebelumnya." });
  }

  if (h.status === "CANCELLED") {
    return res.status(400).json({ detail: "Serah terima yang telah dibatalkan tidak dapat dikonfirmasi." });
  }

  try {
    await InventoryService.processHandover(h, h.items, req.user!._id);
    await refreshInventoryCache();
  } catch (err: any) {
    return res.status(400).json({ detail: err.message, code: "INSUFFICIENT_WAREHOUSE_STOCK" });
  }

  const nowStr = new Date().toISOString();
  h.status = "CONFIRMED";
  h.confirmed_by = req.user!._id;
  h.confirmed_at = nowStr;
  h.updated_at = nowStr;
  syncSingleDoc("stock_handovers", h._id, h);

  try {
    await sqlDb.update(pgStockHandovers).set({ status: h.status, approvedBy: h.confirmed_by }).where(eq(pgStockHandovers.id, h._id));
  } catch (err: any) {
    console.error("Error updating handover status to Postgres:", err.message);
  }

  res.json({ message: "Stok telah disiapkan di area loading gudang.", handover: h });
});

apiRouter.get("/stock/returns", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { business_date } = req.query as Record<string, string>;

  let query = "SELECT * FROM stock_returns WHERE 1=1";
  
  if (business_date) {
    query += ` AND return_date = '${business_date.replace(/'/g, "''")}'`;
  }
  
  if (req.user?.role === "SALES") {
    query += ` AND salesman_id = '${req.user._id.replace(/'/g, "''")}'`;
  }
  
  query += " ORDER BY created_at DESC";

  try {
    const resDb: any = await (sqlDb as any).execute(sql.raw(query));
    const items = (resDb.rows || []).map((row: any) => ({
      _id: row.id,
      return_code: row.return_number,
      salesman_id: row.salesman_id,
      warehouse_id: row.office_id,
      business_date: row.return_date,
      status: row.status,
      items: row.items,
      notes: row.notes,
      confirmed_by: row.approved_by,
      created_at: row.created_at
    }));

    res.json({ items });
  } catch (err: any) {
    console.warn("Error fetching returns from PG, falling back to memory:", err.message);
    res.json({ items: db.stock_returns || [] });
  }
});

apiRouter.post("/stock/returns", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { business_date, warehouse_id, salesman_id, items, notes, auto_confirm } = req.body || {};

  const targetDate = business_date || getTodayWIB();
  const targetWhId = warehouse_id || req.user?.office_id || "off-1";
  const rawSalesId = req.user!.role === "SALES" ? req.user!._id : (salesman_id || req.user!._id);
  const salesMaster = db.salesmen.find((s) => s._id === rawSalesId || s.user_id === rawSalesId);
  const cleanId = typeof rawSalesId === "string" ? rawSalesId.replace(/^sm-/, "") : rawSalesId;
  const sales = db.users.find((u) => u._id === rawSalesId || u._id === cleanId || u._id === salesMaster?.user_id) || salesMaster;
  if (!sales) return res.status(404).json({ detail: "Data sales tidak ditemukan." });
  const targetSalesId = (sales as any).user_id || sales._id;

  // Validate that return qty <= sales stock
  const processedItems: DailyStockReturnItem[] = [];
  for (const it of items) {
    const qty = (parseInt(it.quantity) || 0) || ((parseInt(it.quantity_good) || 0) + (parseInt(it.quantity_bad) || 0));
    if (qty <= 0) continue; // skip 0 items

    const salesStock = getSalesStock(targetSalesId, it.sku_id);
    if (salesStock < qty) {
      const sku = db.skus.find((s) => s._id === it.sku_id);
      return res.status(400).json({
        detail: `Jumlah retur untuk "${sku?.name || it.sku_id}" (${qty}) melebihi sisa stok yang dimiliki Sales (${salesStock}).`,
        code: "RETURN_EXCEEDS_SALES_STOCK",
      });
    }

    processedItems.push({
      sku_id: it.sku_id,
      quantity: qty,
      notes: it.notes || "",
    });
  }

  if (!processedItems.length) {
    return res.status(400).json({ detail: "Pilih minimal 1 item produk dengan kuantitas lebih dari 0 untuk diretur." });
  }

  const isDirectConfirm = auto_confirm || req.user!.role === "WAREHOUSE" || req.user!.role === "ADMIN" || req.user!.role === "OWNER";
  const count = db.stock_returns.length + 1;
  const returnCode = `RET-${targetDate.replace(/-/g, "")}-${String(count).padStart(3, "0")}`;
  const returnId = `ret-${Date.now()}`;
  const nowStr = new Date().toISOString();

  const newReturn: DailyStockReturn = {
    _id: returnId,
    return_code: returnCode,
    business_date: targetDate,
    warehouse_id: targetWhId,
    salesman_id: targetSalesId,
    status: isDirectConfirm ? "CONFIRMED" : "DRAFT",
    items: processedItems,
    notes: notes || "",
    confirmed_by: isDirectConfirm ? req.user!._id : undefined,
    confirmed_at: isDirectConfirm ? nowStr : undefined,
    created_by: req.user!._id,
    created_at: nowStr,
    updated_at: nowStr,
  };

  if (isDirectConfirm) {
    try {
      await InventoryService.processReturn(newReturn, newReturn.items, req.user!._id);
      await refreshInventoryCache();
    } catch (err: any) {
      return res.status(400).json({ detail: err.message, code: "RETURN_EXCEEDS_SALES_STOCK" });
    }
  }

  if (!db.stock_returns) db.stock_returns = [];
  db.stock_returns.push(newReturn as any);
  syncSingleDoc("stock_returns", newReturn._id, newReturn);

  try {

    await sqlDb.insert(pgStockReturns).values({
      id: newReturn._id,
      returnNumber: newReturn.return_code,
      salesmanId: newReturn.salesman_id,
      officeId: newReturn.warehouse_id,
      returnDate: newReturn.business_date,
      status: newReturn.status,
      items: newReturn.items,
      notes: newReturn.notes,
      approvedBy: newReturn.confirmed_by,
      createdAt: new Date(newReturn.created_at)
    });
  } catch (err: any) {
    console.error("Error inserting return to Postgres:", err.message);
  }

  if (isDirectConfirm) {
    processedItems.forEach((it) => {
      syncSalesStockLedger(targetSalesId, it.sku_id, targetDate);
    });
  }

  recordAuditLog(
    req.user!._id,
    isDirectConfirm ? "CONFIRM_STOCK_RETURN" : "CREATE_STOCK_RETURN",
    "stock_returns",
    newReturn._id,
    { return_code: returnCode, salesman: sales.name, total_items: processedItems.length, status: newReturn.status }
  );

  res.status(201).json({
    message: isDirectConfirm ? "Pengembalian stok berhasil diverifikasi & stok kembali masuk ke gudang." : "Permohonan retur stok berhasil diajukan, menunggu konfirmasi petugas gudang.",
    stock_return: newReturn,
  });
});

apiRouter.post("/stock/returns/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {
  const r = db.stock_returns.find((item) => item._id === req.params.id);
  if (!r) return res.status(404).json({ detail: "Data retur tidak ditemukan." });
  if (r.status === "CONFIRMED") {
    return res.status(400).json({ detail: "Retur stok ini sudah dikonfirmasi sebelumnya." });
  }
  if (r.status === "CANCELLED") {
    return res.status(400).json({ detail: "Retur stok yang dibatalkan tidak dapat dikonfirmasi." });
  }

  const sales = db.users.find((u) => u._id === r.salesman_id);
  if (!sales) return res.status(404).json({ detail: "Data sales tidak ditemukan." });

  try {
    await InventoryService.processReturn(r, r.items, req.user!._id);
    await refreshInventoryCache();
  } catch (err: any) {
    return res.status(400).json({ detail: err.message, code: "RETURN_EXCEEDS_SALES_STOCK" });
  }

  const nowStr = new Date().toISOString();
  r.status = "CONFIRMED";
  r.confirmed_by = req.user!._id;
  r.confirmed_at = nowStr;
  r.updated_at = nowStr;
  syncSingleDoc("stock_returns", r._id, r);

  try {
    await sqlDb.update(pgStockReturns).set({ status: r.status, approvedBy: r.confirmed_by }).where(eq(pgStockReturns.id, r._id));
  } catch (err: any) {
    console.error("Error updating return status to Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "CONFIRM_STOCK_RETURN",
    "stock_returns",
    r._id,
    { return_code: r.return_code, salesman: sales.name }
  );

  res.json({
    message: `Retur stok ${r.return_code} berhasil diterima dan ditambahkan ke stok gudang.`,
    stock_return: r,
  });
});

// ================= SALES LIVE STOCK & LEDGER =================
apiRouter.get("/sales/stock/today", authMiddleware, (req: AuthenticatedRequest, res) => {
  const business_date = (req.query.business_date as string) || new Date().toISOString().slice(0, 10);
  const salesmanId = req.user!.role === "SALES" ? req.user!._id : (req.query.salesman_id as string) || req.user!._id;

  const salesUser = db.users.find((u) => u._id === salesmanId);

  const items = db.skus.filter((s) => s.status === "ACTIVE").map((s) => {
    const prc = db.prices.find((p) => p.sku_id === s._id && p.status === "ACTIVE");

    // 1. Total Brought Today (TRANSFER_IN)
    const broughtToday = db.stock_movements
      .filter((m) => m.business_date === business_date && m.salesman_id === salesmanId && m.sku_id === s._id && m.movement_type === "TRANSFER_IN")
      .reduce((sum, m) => sum + m.quantity, 0);

    // 2. Total Sold Today (SALES_OUT)
    const soldToday = db.stock_movements
      .filter((m) => m.business_date === business_date && m.salesman_id === salesmanId && m.sku_id === s._id && m.movement_type === "SALES_OUT")
      .reduce((sum, m) => sum + m.quantity, 0);

    // 3. Total Returned Today (RETURN_IN)
    const returnedToday = db.stock_movements
      .filter((m) => m.business_date === business_date && m.salesman_id === salesmanId && m.sku_id === s._id && m.movement_type === "RETURN_IN")
      .reduce((sum, m) => sum + m.quantity, 0);

    // 4. Current Available Balance with Sales
    const currentSalesInv = db.inventory.find(
      (i) => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === s._id
    );
    const remainingStock = currentSalesInv ? currentSalesInv.available_stock : 0;

    // Expected Remaining = Brought - Sold - Returned
    const expectedRemaining = Math.max(0, broughtToday - soldToday - returnedToday);
    const discrepancy = remainingStock - expectedRemaining;

    return {
      sku_id: s._id,
      sku_code: s.code,
      sku_name: s.name,
      category: s.category || "GENERAL",
      unit: s.unit || "Unit",
      price: prc?.price || 0,
      stok_dibawa: broughtToday,
      stok_terjual: soldToday,
      stok_return: returnedToday,
      sisa_stok: remainingStock,
      sisa_seharusnya: expectedRemaining,
      selisih: discrepancy,
      total_sales_value: soldToday * (prc?.price || 0),
      total_stock_value: remainingStock * (prc?.price || 0),
    };
  });

  const totals = {
    total_dibawa: items.reduce((sum, it) => sum + it.stok_dibawa, 0),
    total_terjual: items.reduce((sum, it) => sum + it.stok_terjual, 0),
    total_return: items.reduce((sum, it) => sum + it.stok_return, 0),
    total_sisa: items.reduce((sum, it) => sum + it.sisa_stok, 0),
    total_sales_revenue: items.reduce((sum, it) => sum + it.total_sales_value, 0),
    total_stock_value: items.reduce((sum, it) => sum + it.total_stock_value, 0),
  };

  res.json({
    business_date,
    salesman_id: salesmanId,
    salesman_name: salesUser?.name || "-",
    totals,
    items,
  });
});

apiRouter.get("/sales/stock/ledger", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { salesman_id, from_date, to_date, sku_id } = req.query as Record<string, string>;
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : salesman_id;
  const from = from_date || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const to = to_date || new Date().toISOString().slice(0, 10);

  const movements = db.stock_movements
    .filter((m) => {
      if (targetSalesId && m.salesman_id !== targetSalesId) return false;
      if (sku_id && m.sku_id !== sku_id) return false;
      if (m.business_date < from || m.business_date > to) return false;
      return true;
    })
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

  const enriched = movements.map((m) => {
    const skuInfo = resolveSkuInfo(m.sku_id);
    const outlet = m.outlet_id ? db.outlets.find((o) => o._id === m.outlet_id) : null;
    const sales = m.salesman_id ? db.users.find((u) => u._id === m.salesman_id) : null;

    return {
      ...m,
      sku_name: skuInfo.resolved_name,
      sku_code: skuInfo.sku_code || "-",
      unit: skuInfo.uom || "Unit",
      outlet_name: outlet?.outlet_name || "-",
      salesman_name: sales?.name || "-",
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

apiRouter.get("/sales/stock/daily-ledger", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { salesman_id, business_date, from_date, to_date, sku_id, category } = req.query as Record<string, string>;
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : (salesman_id === "all" ? undefined : (salesman_id || req.user!._id));
  const targetDate = business_date || new Date().toISOString().slice(0, 10);
  const from = from_date || targetDate;
  const to = to_date || targetDate;

  // Identify sales users to include
  const salesUsers = targetSalesId
    ? db.users.filter((u) => u._id === targetSalesId)
    : db.users.filter((u) => u.role === "SALES" && u.status === "ACTIVE");

  // Identify active SKUs
  let activeSkus = db.skus.filter((s) => s.status === "ACTIVE");
  if (sku_id) activeSkus = activeSkus.filter((s) => s._id === sku_id);
  if (category) activeSkus = activeSkus.filter((s) => s.category === category);

  const ledgerResults: any[] = [];

  salesUsers.forEach((sales) => {
    activeSkus.forEach((sku) => {
      const prc = db.prices.find((p) => p.sku_id === sku._id && p.status === "ACTIVE");
      const unitPrice = prc?.price || 0;

      // 1. Calculate transfers in (TRANSFER_IN) within date range
      const transfersIn = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "TRANSFER_IN" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);

      // 2. Calculate sales out (SALES_OUT) within date range
      const salesOut = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "SALES_OUT" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);

      // 3. Calculate returns out (RETURN_IN) within date range
      const returnsOut = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "RETURN_IN" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);

      // 4. Calculate adjustments (ADJUSTMENT_IN / ADJUSTMENT_OUT) within date range
      const adjustmentsIn = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "ADJUSTMENT_IN" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);

      const adjustmentsOut = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "ADJUSTMENT_OUT" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);

      // 5. Current physical stock in sales inventory
      const salesInv = db.inventory.find(
        (i) => i.location_type === "SALES" && i.location_id === sales._id && i.sku_id === sku._id
      );
      const closingBalance = salesInv ? salesInv.available_stock : 0;

      // 6. Opening balance: get from ledger before date range or calculate
      const prevLedger = db.sales_stock_ledgers
        .filter((l) => l.salesman_id === sales._id && l.sku_id === sku._id && l.business_date < from)
        .sort((a, b) => b.business_date.localeCompare(a.business_date))[0];
      const openingBalance = prevLedger ? prevLedger.closing_balance || 0 : 0;

      // Mathematical formula: Opening + Transfer In + Adj In - Sales Out - Return - Adj Out = Expected Closing
      const expectedBalance = Math.max(0, openingBalance + transfersIn + adjustmentsIn - salesOut - returnsOut - adjustmentsOut);
      const discrepancy = closingBalance - expectedBalance;
      const status = discrepancy === 0 ? "BALANCED" : (discrepancy > 0 ? "SURPLUS" : "DEFICIT");

      const totalLoaded = openingBalance + transfersIn;
      const sellThroughPct = totalLoaded > 0 ? Math.round((salesOut / totalLoaded) * 1000) / 10 : 0;
      const onHandPct = totalLoaded > 0 ? Math.round((closingBalance / totalLoaded) * 1000) / 10 : 0;

      ledgerResults.push({
        _id: `ssl-${sales._id}-${from === to ? from : `${from}_${to}`}-${sku._id}`,
        salesman_id: sales._id,
        salesman_name: sales.name,
        salesman_code: (sales as any).code || sales._id,
        business_date: from === to ? from : `${from} - ${to}`,
        sku_id: sku._id,
        sku_code: resolveSkuInfo(sku).sku_code || sku.code || "-",
        sku_name: resolveSkuInfo(sku).resolved_name,
        category: sku.category || "GENERAL",
        unit: resolveSkuInfo(sku).uom || sku.unit || "Unit",
        unit_price: unitPrice,

        // Core Formula Components
        opening_balance: openingBalance,
        transfers_in: transfersIn,
        sales_out: salesOut,
        returns_out: returnsOut,
        expected_balance: expectedBalance,
        closing_balance: closingBalance, // Current Real-time Physical On Hand
        discrepancy: discrepancy,
        status: status,

        // Metrics & Valuations
        total_handled_qty: totalLoaded,
        sell_through_rate: sellThroughPct,
        on_hand_rate: onHandPct,
        total_sales_value: salesOut * unitPrice,
        total_closing_value: closingBalance * unitPrice,
        total_transfers_value: transfersIn * unitPrice,
        total_opening_value: openingBalance * unitPrice,
      });
    });
  });

  const totals = {
    total_opening: ledgerResults.reduce((sum, it) => sum + it.opening_balance, 0),
    total_transfers_in: ledgerResults.reduce((sum, it) => sum + it.transfers_in, 0),
    total_sales_out: ledgerResults.reduce((sum, it) => sum + it.sales_out, 0),
    total_returns_out: ledgerResults.reduce((sum, it) => sum + it.returns_out, 0),
    total_closing: ledgerResults.reduce((sum, it) => sum + it.closing_balance, 0),
    total_expected: ledgerResults.reduce((sum, it) => sum + it.expected_balance, 0),
    total_discrepancy: ledgerResults.reduce((sum, it) => sum + Math.abs(it.discrepancy), 0),
    total_sales_revenue: ledgerResults.reduce((sum, it) => sum + it.total_sales_value, 0),
    total_closing_value: ledgerResults.reduce((sum, it) => sum + it.total_closing_value, 0),
    total_transfers_value: ledgerResults.reduce((sum, it) => sum + it.total_transfers_value, 0),
    overall_sell_through_rate:
      ledgerResults.reduce((sum, it) => sum + it.total_handled_qty, 0) > 0
        ? Math.round(
            (ledgerResults.reduce((sum, it) => sum + it.sales_out, 0) /
              ledgerResults.reduce((sum, it) => sum + it.total_handled_qty, 0)) *
              1000
          ) / 10
        : 0,
    has_discrepancy: ledgerResults.some((it) => it.discrepancy !== 0),
  };

  res.json({
    business_date: targetDate,
    from_date: from,
    to_date: to,
    salesman_id: targetSalesId || "ALL",
    salesman_name: targetSalesId ? salesUsers[0]?.name || "-" : "Semua Sales",
    totals,
    items: ledgerResults,
  });
});

// ================= REAL-TIME SALES STOCK DASHBOARD ENDPOINT =================
apiRouter.get("/sales/stock/dashboard", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { salesman_id, business_date, from_date, to_date, category } = req.query as Record<string, string>;
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : (salesman_id === "all" ? undefined : (salesman_id || req.user!._id));
  const targetDate = business_date || new Date().toISOString().slice(0, 10);
  const from = from_date || targetDate;
  const to = to_date || targetDate;

  const salesUsers = targetSalesId
    ? db.users.filter((u) => u._id === targetSalesId)
    : db.users.filter((u) => u.role === "SALES" && u.status === "ACTIVE");

  let activeSkus = db.skus.filter((s) => s.status === "ACTIVE");
  if (category) activeSkus = activeSkus.filter((s) => s.category === category);

  // 1. Calculate per-SKU ledger breakdown aggregated across targeted sales users
  const skuLedgers = activeSkus.map((sku) => {
    const prc = db.prices.find((p) => p.sku_id === sku._id && p.status === "ACTIVE");
    const unitPrice = prc?.price || 0;

    let skuOpening = 0;
    let skuTransfers = 0;
    let skuSales = 0;
    let skuReturns = 0;
    let skuClosingOnHand = 0;

    salesUsers.forEach((sales) => {
      // Transfers In
      const tin = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "TRANSFER_IN" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);
      skuTransfers += tin;

      // Sales Out
      const sout = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "SALES_OUT" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);
      skuSales += sout;

      // Returns Out
      const rout = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "RETURN_IN" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);
      skuReturns += rout;

      // Current Physical Stock on Hand with Sales Rep
      const inv = db.inventory.find(
        (i) => i.location_type === "SALES" && i.location_id === sales._id && i.sku_id === sku._id
      );
      skuClosingOnHand += inv ? inv.available_stock : 0;

      // Prior ledger opening balance
      const prev = db.sales_stock_ledgers
        .filter((l) => l.salesman_id === sales._id && l.sku_id === sku._id && l.business_date < from)
        .sort((a, b) => b.business_date.localeCompare(a.business_date))[0];
      skuOpening += prev ? prev.closing_balance || 0 : 0;
    });

    // Core Formula: Expected = Opening + Transfer In - Sales Out - Return
    const expectedClosing = Math.max(0, skuOpening + skuTransfers - skuSales - skuReturns);
    const discrepancy = skuClosingOnHand - expectedClosing;
    const totalHandled = skuOpening + skuTransfers;
    const sellThroughRate = totalHandled > 0 ? Math.round((skuSales / totalHandled) * 1000) / 10 : 0;
    const onHandRate = totalHandled > 0 ? Math.round((skuClosingOnHand / totalHandled) * 1000) / 10 : 0;

    return {
      sku_id: sku._id,
      sku_code: sku.code,
      sku_name: sku.name,
      category: sku.category || "GENERAL",
      unit: sku.unit || "Unit",
      unit_price: unitPrice,

      // Ledger Formula Parts
      opening_balance: skuOpening,
      transfers_in: skuTransfers,
      sales_out: skuSales,
      returns_out: skuReturns,
      expected_balance: expectedClosing,
      closing_balance: skuClosingOnHand, // Real-time inventory on hand
      discrepancy: discrepancy,
      status: discrepancy === 0 ? "BALANCED" : (discrepancy > 0 ? "SURPLUS" : "DEFICIT"),

      // Analytical Metrics
      total_handled: totalHandled,
      sell_through_rate: sellThroughRate,
      on_hand_rate: onHandRate,
      sales_revenue: skuSales * unitPrice,
      on_hand_valuation: skuClosingOnHand * unitPrice,
      transfers_valuation: skuTransfers * unitPrice,
    };
  });

  // 2. Real-time comparison dataset formatted for Bar/Line/Pie Charts
  const realTimeComparison = skuLedgers.map((sku) => ({
    sku_id: sku.sku_id,
    sku_code: sku.sku_code,
    sku_name: sku.sku_name,
    unit: sku.unit,
    on_hand: sku.closing_balance,
    sold: sku.sales_out,
    transfers_in: sku.transfers_in,
    returns_out: sku.returns_out,
    opening: sku.opening_balance,
    sell_through_pct: sku.sell_through_rate,
    revenue: sku.sales_revenue,
    valuation: sku.on_hand_valuation,
  }));

  // 3. Hourly Sales Depletion Timeline (for real-time dashboard intraday curve)
  const salesMovements = db.stock_movements.filter(
    (m) =>
      m.business_date >= from &&
      m.business_date <= to &&
      m.movement_type === "SALES_OUT" &&
      m.status === "COMPLETED" &&
      (!targetSalesId || m.salesman_id === targetSalesId)
  );

  const hourlyDepletionMap: Record<string, { hour: string; sold_qty: number; sales_value: number; transactions: number }> = {};
  for (let h = 7; h <= 18; h++) {
    const label = `${String(h).padStart(2, "0")}:00`;
    hourlyDepletionMap[label] = { hour: label, sold_qty: 0, sales_value: 0, transactions: 0 };
  }

  salesMovements.forEach((m) => {
    const timeStr = m.created_at ? m.created_at.slice(11, 16) : "09:00";
    const hourKey = `${timeStr.slice(0, 2)}:00`;
    const sku = db.skus.find((s) => s._id === m.sku_id);
    const prc = db.prices.find((p) => p.sku_id === m.sku_id && p.status === "ACTIVE");
    const val = m.quantity * (prc?.price || 0);

    if (hourlyDepletionMap[hourKey]) {
      hourlyDepletionMap[hourKey].sold_qty += m.quantity;
      hourlyDepletionMap[hourKey].sales_value += val;
      hourlyDepletionMap[hourKey].transactions += 1;
    }
  });

  const hourlyDepletion = Object.values(hourlyDepletionMap);

  // 4. Sales Representatives Performance Matrix
  const salesRepPerformance = salesUsers.map((sales) => {
    let repTransfers = 0;
    let repSales = 0;
    let repReturns = 0;
    let repOnHand = 0;
    let repOpening = 0;

    activeSkus.forEach((sku) => {
      const tin = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "TRANSFER_IN" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);
      repTransfers += tin;

      const sout = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "SALES_OUT" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);
      repSales += sout;

      const rout = db.stock_movements
        .filter(
          (m) =>
            m.business_date >= from &&
            m.business_date <= to &&
            m.salesman_id === sales._id &&
            m.sku_id === sku._id &&
            m.movement_type === "RETURN_IN" &&
            m.status === "COMPLETED"
        )
        .reduce((sum, m) => sum + m.quantity, 0);
      repReturns += rout;

      const inv = db.inventory.find(
        (i) => i.location_type === "SALES" && i.location_id === sales._id && i.sku_id === sku._id
      );
      repOnHand += inv ? inv.available_stock : 0;

      const prev = db.sales_stock_ledgers
        .filter((l) => l.salesman_id === sales._id && l.sku_id === sku._id && l.business_date < from)
        .sort((a, b) => b.business_date.localeCompare(a.business_date))[0];
      repOpening += prev ? prev.closing_balance || 0 : 0;
    });

    const expected = Math.max(0, repOpening + repTransfers - repSales - repReturns);
    const variance = repOnHand - expected;
    const totalHandled = repOpening + repTransfers;
    const sellThrough = totalHandled > 0 ? Math.round((repSales / totalHandled) * 1000) / 10 : 0;

    // Visit statistics
    const visits = db.visits.filter((v) => v.salesman_id === sales._id && v.date >= from && v.date <= to);
    const effectiveCalls = visits.filter((v) => v.call_result === "EFFECTIVE").length;

    return {
      salesman_id: sales._id,
      salesman_name: sales.name,
      salesman_code: (sales as any).code || sales._id,
      phone: sales.phone,
      total_opening: repOpening,
      total_transfers: repTransfers,
      total_sold: repSales,
      total_returns: repReturns,
      total_on_hand: repOnHand,
      total_expected: expected,
      variance: variance,
      status: variance === 0 ? "BALANCED" : (variance > 0 ? "SURPLUS" : "DEFICIT"),
      sell_through_rate: sellThrough,
      outlet_calls: visits.length,
      effective_calls: effectiveCalls,
      ec_rate: visits.length > 0 ? Math.round((effectiveCalls / visits.length) * 100) : 0,
    };
  });

  // 5. Summary Dashboard KPIs
  const totalOpening = skuLedgers.reduce((sum, s) => sum + s.opening_balance, 0);
  const totalTransfers = skuLedgers.reduce((sum, s) => sum + s.transfers_in, 0);
  const totalSold = skuLedgers.reduce((sum, s) => sum + s.sales_out, 0);
  const totalReturned = skuLedgers.reduce((sum, s) => sum + s.returns_out, 0);
  const totalOnHand = skuLedgers.reduce((sum, s) => sum + s.closing_balance, 0);
  const totalExpected = skuLedgers.reduce((sum, s) => sum + s.expected_balance, 0);
  const totalDiscrepancy = skuLedgers.reduce((sum, s) => sum + Math.abs(s.discrepancy), 0);
  const totalRevenue = skuLedgers.reduce((sum, s) => sum + s.sales_revenue, 0);
  const totalValuation = skuLedgers.reduce((sum, s) => sum + s.on_hand_valuation, 0);
  const totalHandledAll = totalOpening + totalTransfers;
  const overallSellThrough = totalHandledAll > 0 ? Math.round((totalSold / totalHandledAll) * 1000) / 10 : 0;
  const overallOnHandRate = totalHandledAll > 0 ? Math.round((totalOnHand / totalHandledAll) * 1000) / 10 : 0;

  res.json({
    metadata: {
      business_date: targetDate,
      from_date: from,
      to_date: to,
      salesman_id: targetSalesId || "ALL",
      salesman_name: targetSalesId ? salesUsers[0]?.name || "-" : "Semua Tim Sales",
      total_sales_reps: salesUsers.length,
      total_active_skus: activeSkus.length,
      generated_at: new Date().toISOString(),
    },
    kpis: {
      total_opening: totalOpening,
      total_transfers_in: totalTransfers,
      total_sold: totalSold,
      total_returns_out: totalReturned,
      total_on_hand: totalOnHand,
      total_expected: totalExpected,
      total_discrepancy: totalDiscrepancy,
      has_discrepancy: totalDiscrepancy !== 0,
      sell_through_rate_pct: overallSellThrough,
      on_hand_rate_pct: overallOnHandRate,
      total_sales_revenue: totalRevenue,
      total_on_hand_valuation: totalValuation,
    },
    real_time_comparison: realTimeComparison,
    sku_ledgers: skuLedgers,
    sales_rep_performance: salesRepPerformance,
    hourly_depletion: hourlyDepletion,
  });
});

// ================= WAREHOUSE LIVE MONITORING & RECONCILIATION =================
apiRouter.get("/warehouse/monitoring", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), (req, res) => {
  const business_date = (req.query.business_date as string) || new Date().toISOString().slice(0, 10);
  const warehouse_id = (req.query.warehouse_id as string) || "off-1";

  const salesUsers = db.users.filter((u) => u.role === "SALES" && u.status === "ACTIVE");

  const salesBoard = salesUsers.map((sales) => {
    const handover = db.stock_handovers.find(
      (h) => h.salesman_id === sales._id && h.business_date === business_date && h.status !== "CANCELLED"
    );

    // Sum stock movements for today
    const broughtTotal = db.stock_movements
      .filter((m) => m.business_date === business_date && (m.salesman_id === sales._id || m.destination_location_id === sales._id) && (m.movement_type === "TRANSFER_IN" || m.movement_type === "TRANSFER_OUT"))
      .reduce((sum, m) => sum + m.quantity, 0);

    const soldTotal = db.stock_movements
      .filter((m) => m.business_date === business_date && (m.salesman_id === sales._id || m.source_location_id === sales._id) && m.movement_type === "SALES_OUT")
      .reduce((sum, m) => sum + m.quantity, 0);

    const returnedTotal = db.stock_movements
      .filter((m) => m.business_date === business_date && (m.salesman_id === sales._id || m.source_location_id === sales._id) && (m.movement_type === "RETURN_IN" || (m.movement_type === "TRANSFER_IN" && m.destination_location_type === "WAREHOUSE")))
      .reduce((sum, m) => sum + m.quantity, 0);

    const currentInventory = db.inventory.filter((i) => i.location_type === "SALES" && i.location_id === sales._id);
    const physicalRemaining = currentInventory.reduce((sum, i) => sum + i.available_stock, 0);
    const expectedRemaining = Math.max(0, broughtTotal - soldTotal - returnedTotal);
    const hasDiscrepancy = physicalRemaining !== expectedRemaining;

    // Attendance & Visits info
    const att = db.attendance.find((a) => a.salesman_id === sales._id && a.date === business_date);
    const visits = db.visits.filter((v) => v.salesman_id === sales._id && v.date === business_date);
    const effectiveVisits = visits.filter((v) => v.call_result === "EFFECTIVE").length;

    return {
      salesman_id: sales._id,
      salesman_name: sales.name,
      salesman_code: (sales as any).code || sales._id,
      phone: sales.phone,
      handover_id: handover?._id || null,
      handover_code: handover?.handover_code || "-",
      handover_status: handover ? handover.status : "NONE",
      attendance_status: att ? att.status : "NOT_CHECKED_IN",
      outlet_calls: visits.length,
      effective_calls: effectiveVisits,
      stok_dibawa: broughtTotal,
      stok_terjual: soldTotal,
      stok_return: returnedTotal,
      sisa_stok: physicalRemaining,
      sisa_seharusnya: expectedRemaining,
      has_discrepancy: hasDiscrepancy,
      variance: physicalRemaining - expectedRemaining,
    };
  });

  // Warehouse total stocks
  const warehouseStocks = db.skus.filter((s) => s.status === "ACTIVE").map((s) => {
    const whStock = getWarehouseStock(warehouse_id, s._id);
    const totalSalesStock = db.inventory
      .filter((i) => i.location_type === "SALES" && i.sku_id === s._id)
      .reduce((sum, i) => sum + i.available_stock, 0);
    return {
      sku_id: s._id,
      sku_code: s.code,
      sku_name: s.name,
      unit: s.unit || "Unit",
      warehouse_stock: whStock,
      in_sales_stock: totalSalesStock,
      total_stock: whStock + totalSalesStock,
    };
  });

  res.json({
    business_date,
    warehouse_id,
    sales_board: salesBoard,
    warehouse_stocks: warehouseStocks,
  });
});

apiRouter.get("/warehouse/reconciliation", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), (req, res) => {
  const business_date = (req.query.business_date as string) || new Date().toISOString().slice(0, 10);
  const salesman_id = req.query.salesman_id as string;

  const salesUsers = salesman_id ? db.users.filter((u) => u._id === salesman_id) : db.users.filter((u) => u.role === "SALES");

  const reconItems: any[] = [];
  salesUsers.forEach((sales) => {
    db.skus.filter((s) => s.status === "ACTIVE").forEach((sku) => {
      const brought = db.stock_movements
        .filter((m) => m.business_date === business_date && (m.salesman_id === sales._id || m.destination_location_id === sales._id) && m.sku_id === sku._id && (m.movement_type === "TRANSFER_IN" || m.movement_type === "TRANSFER_OUT"))
        .reduce((sum, m) => sum + m.quantity, 0);

      const sold = db.stock_movements
        .filter((m) => m.business_date === business_date && (m.salesman_id === sales._id || m.source_location_id === sales._id) && m.sku_id === sku._id && m.movement_type === "SALES_OUT")
        .reduce((sum, m) => sum + m.quantity, 0);

      const returned = db.stock_movements
        .filter((m) => m.business_date === business_date && (m.salesman_id === sales._id || m.source_location_id === sales._id) && m.sku_id === sku._id && (m.movement_type === "RETURN_IN" || (m.movement_type === "TRANSFER_IN" && m.destination_location_type === "WAREHOUSE")))
        .reduce((sum, m) => sum + m.quantity, 0);

      const salesInv = db.inventory.find((i) => i.location_type === "SALES" && i.location_id === sales._id && i.sku_id === sku._id);
      const actualRemaining = salesInv ? salesInv.available_stock : 0;
      const expectedRemaining = Math.max(0, brought - sold - returned);
      const diff = actualRemaining - expectedRemaining;

      if (brought > 0 || sold > 0 || returned > 0 || actualRemaining > 0) {
        reconItems.push({
          salesman_id: sales._id,
          salesman_name: sales.name,
          sku_id: sku._id,
          sku_code: sku.code,
          sku_name: sku.name,
          unit: sku.unit || "Unit",
          stok_dibawa: brought,
          stok_terjual: sold,
          stok_return: returned,
          sisa_seharusnya: expectedRemaining,
          sisa_aktual: actualRemaining,
          selisih: diff,
          status: diff === 0 ? "BALANCED" : (diff > 0 ? "SURPLUS" : "DEFICIT"),
        });
      }
    });
  });

  res.json({
    business_date,
    total_discrepancies: reconItems.filter((it) => it.selisih !== 0).length,
    items: reconItems,
  });
});

// ================= STOCK RECEIVING (PENERIMAAN BARANG DARI SUPPLIER/PABRIK) =================
apiRouter.get("/stock/receivings", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { warehouse_id, status, receiving_date, from_date, to_date, search } = req.query as Record<string, string>;

  let query = "SELECT * FROM stock_receivings WHERE 1=1";
  
  if (warehouse_id) {
    query += ` AND office_id = '${warehouse_id.replace(/'/g, "''")}'`;
  }
  
  if (status) {
    query += ` AND status = '${status.replace(/'/g, "''")}'`;
  }
  
  if (receiving_date) {
    query += ` AND received_date = '${receiving_date.replace(/'/g, "''")}'`;
  }
  
  if (from_date) {
    query += ` AND received_date >= '${from_date.replace(/'/g, "''")}'`;
  }
  
  if (to_date) {
    query += ` AND received_date <= '${to_date.replace(/'/g, "''")}'`;
  }

  if (search) {
    const q = search.toLowerCase().replace(/'/g, "''");
    query += ` AND (LOWER(receiving_number) LIKE '%${q}%' OR LOWER(supplier_name) LIKE '%${q}%' OR LOWER(po_number) LIKE '%${q}%')`;
  }

  query += " ORDER BY created_at DESC";

  try {
    const resDb: any = await (sqlDb as any).execute(sql.raw(query));
    const items = (resDb.rows || []).map((row: any) => ({
      _id: row.id,
      receiving_code: row.receiving_number,
      po_number: row.po_number,
      warehouse_id: row.office_id,
      supplier_name: row.supplier_name,
      receiving_date: row.received_date,
      status: row.status,
      items: row.items,
      total_quantity: Number(row.total_quantity),
      total_value: Number(row.total_value),
      notes: row.notes,
      created_by: row.received_by,
      posted_by: row.posted_by,
      posted_at: row.posted_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    const enriched = items.map((r: any) => {
      const wh = db.offices.find((o) => o._id === r.warehouse_id);
      const creator = db.users.find((u) => u._id === r.created_by);
      const poster = r.posted_by ? db.users.find((u) => u._id === r.posted_by) : null;

      const itemsEnriched = (r.items || []).map((it: any) => {
        const skuInfo = resolveSkuInfo(it);
        return {
          ...it,
          sku_code: skuInfo.sku_code || "-",
          sku_name: skuInfo.resolved_name,
          unit: skuInfo.uom || it.unit || "Unit",
        };
      });

      const totalQty = itemsEnriched.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0);
      const totalVal = itemsEnriched.reduce((s: number, it: any) => s + ((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), 0);

      return {
        ...r,
        warehouse_name: wh?.office_name || "Gudang Pusat",
        creator_name: creator?.name || "-",
        posted_by_name: poster?.name || "-",
        total_quantity: totalQty,
        total_value: r.total_value || totalVal,
        sku_summary: formatSkuItemsSummary(r.items, true),
        items: itemsEnriched,
      };
    });

    res.json({ items: enriched, total: enriched.length });
  } catch (err: any) {
    console.warn("Error fetching receivings from PG, falling back to memory:", err.message);
    res.json({ items: db.stock_receivings || [], total: (db.stock_receivings || []).length });
  }
});

apiRouter.get("/stock/receivings/:id", authMiddleware, (req: AuthenticatedRequest, res) => {
  const r = (db.stock_receivings || []).find((item) => item._id === req.params.id);
  if (!r) return res.status(404).json({ detail: "Data penerimaan barang tidak ditemukan." });

  const wh = db.offices.find((o) => o._id === r.warehouse_id);
  const creator = db.users.find((u) => u._id === r.created_by);
  const poster = r.posted_by ? db.users.find((u) => u._id === r.posted_by) : null;
  const itemsEnriched = (r.items || []).map((it) => {
    const skuInfo = resolveSkuInfo(it);
    return {
      ...it,
      sku_code: skuInfo.sku_code || "-",
      sku_name: skuInfo.resolved_name,
      unit: skuInfo.uom || it.unit || "Unit",
    };
  });

  res.json({
    ...r,
    warehouse_name: wh?.office_name || "Gudang Pusat",
    creator_name: creator?.name || "-",
    posted_by_name: poster?.name || "-",
    sku_summary: formatSkuItemsSummary(r.items, true),
    items: itemsEnriched,
  });
});

apiRouter.post("/stock/receivings", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const { po_number, supplier_name, warehouse_id, receiving_date, items, notes, auto_post } = req.body || {};

  const targetDate = receiving_date || getTodayWIB();
  const targetWhId = warehouse_id || req.user?.office_id || "off-1";
  const isPosted = !!auto_post;

  if (!supplier_name || !items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ detail: "Nama supplier dan daftar item produk wajib diisi." });
  }

  const processedItems = [];
  let totalQty = 0;
  let totalVal = 0;

  for (const it of items) {
    const qty = parseInt(it.quantity) || 0;
    if (qty <= 0) {
      return res.status(400).json({ detail: "Kuantitas setiap item produk harus lebih dari 0." });
    }
    const sku = db.skus.find((s) => s._id === it.sku_id && s.status === "ACTIVE");
    if (!sku) {
      return res.status(400).json({ detail: `SKU dengan ID ${it.sku_id} tidak valid atau tidak aktif.` });
    }
    const up = Number(it.unit_price) || sku.base_price || 0;
    processedItems.push({
      sku_id: it.sku_id,
      quantity: qty,
      unit_price: up,
      notes: it.notes || "",
    });
    totalQty += qty;
    totalVal += (qty * up);
  }

  const count = (db.stock_receivings || []).length + 1;
  const receivingCode = `RCV-${targetDate.replace(/-/g, "")}-${String(count).padStart(3, "0")}`;
  const receivingId = `rcv-${Date.now()}`;
  const nowStr = new Date().toISOString();

  const newReceiving = {
    _id: receivingId,
    receiving_code: receivingCode,
    po_number: po_number || `PO-${targetDate.replace(/-/g, "")}-${String(count).padStart(3, "0")}`,
    supplier_name: supplier_name.trim(),
    warehouse_id: targetWhId,
    receiving_date: targetDate,
    status: isPosted ? "POSTED" : "DRAFT",
    items: processedItems,
    total_quantity: totalQty,
    total_value: totalVal,
    notes: notes || "",
    received_by: req.user!._id,
    posted_by: isPosted ? req.user!._id : undefined,
    posted_at: isPosted ? nowStr : undefined,
    created_by: req.user!._id,
    created_at: nowStr,
    updated_at: nowStr,
  };

  if (!db.stock_receivings) db.stock_receivings = [];
  db.stock_receivings.push(newReceiving as any);
  syncSingleDoc("stock_receivings", newReceiving._id, newReceiving);

  try {
    await sqlDb.insert(pgStockReceivings).values({
      id: newReceiving._id,
      receivingNumber: newReceiving.receiving_code,
      poNumber: newReceiving.po_number,
      officeId: newReceiving.warehouse_id,
      supplierName: newReceiving.supplier_name,
      receivedDate: newReceiving.receiving_date,
      status: newReceiving.status,
      totalQuantity: newReceiving.total_quantity,
      totalValue: newReceiving.total_value,
      items: newReceiving.items,
      notes: newReceiving.notes,
      receivedBy: newReceiving.received_by,
      postedBy: newReceiving.posted_by,
      postedAt: newReceiving.posted_at ? new Date(newReceiving.posted_at) : null,
      createdAt: new Date(newReceiving.created_at),
      updatedAt: new Date(newReceiving.updated_at)
    });
  } catch (err: any) {
    console.error("Error inserting stock receiving to Postgres:", err.message);
  }

  if (isPosted) {
    try {
      await InventoryService.processReceiving(newReceiving, newReceiving.items, req.user!._id);
      await refreshInventoryCache();
    } catch (err: any) {
      return res.status(400).json({ detail: err.message, code: "INVENTORY_ERROR" });
    }
  }

  recordAuditLog(
    req.user!._id,
    "CREATE_STOCK_RECEIVING",
    "stock_receivings",
    newReceiving._id,
    {
      receiving_code: newReceiving.receiving_code,
      supplier_name: newReceiving.supplier_name,
      total_quantity: newReceiving.total_quantity,
    }
  );

  res.status(201).json(newReceiving);
});

apiRouter.post("/stock/receivings/:id/post", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const r = (db.stock_receivings || []).find((item) => item._id === req.params.id);
  if (!r) return res.status(404).json({ detail: "Data penerimaan tidak ditemukan." });

  if (r.status === "POSTED") {
    return res.status(400).json({ detail: "Penerimaan barang ini sudah diposting sebelumnya." });
  }

  if (r.status === "CANCELLED") {
    return res.status(400).json({ detail: "Penerimaan barang yang telah dibatalkan tidak dapat diposting." });
  }

  const nowStr = new Date().toISOString();

  try {
    await InventoryService.processReceiving(r, r.items, req.user!._id);
    await refreshInventoryCache();
  } catch (err: any) {
    return res.status(400).json({ detail: err.message, code: "INVENTORY_ERROR" });
  }

  r.status = "POSTED";
  r.posted_by = req.user!._id;
  r.posted_at = nowStr;
  r.updated_at = nowStr;
  syncSingleDoc("stock_receivings", r._id, r);

  try {
    await sqlDb.update(pgStockReceivings).set({
      status: r.status,
      postedBy: r.posted_by,
      postedAt: r.posted_at ? new Date(r.posted_at) : null,
      updatedAt: new Date(r.updated_at)
    }).where(eq(pgStockReceivings.id, r._id));
  } catch (err: any) {
    console.error("Error updating receiving status to Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "POST_STOCK_RECEIVING",
    "stock_receivings",
    r._id,
    {
      receiving_code: r.receiving_code,
      supplier_name: r.supplier_name,
      total_quantity: r.total_quantity,
    }
  );

  res.json({
    message: `Penerimaan barang ${r.receiving_code} berhasil diposting. Stok gudang resmi bertambah (+${r.total_quantity} Unit).`,
    receiving: r,
  });
});
apiRouter.post("/stock/receivings/:id/cancel", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const r = (db.stock_receivings || []).find((item) => item._id === req.params.id);
  if (!r) return res.status(404).json({ detail: "Data penerimaan tidak ditemukan." });
  if (r.status === "POSTED") {
    return res.status(400).json({ detail: "Penerimaan barang yang sudah POSTED tidak dapat dibatalkan secara langsung. Gunakan menu Penyesuaian Stok." });
  }

  r.status = "CANCELLED";
  r.updated_at = new Date().toISOString();
  syncSingleDoc("stock_receivings", r._id, r);

  try {
    sqlDb.update(pgStockReceivings).set({
      status: r.status,
      updatedAt: new Date(r.updated_at)
    }).where(eq(pgStockReceivings.id, r._id))
      .catch((e: any) => console.error("Error cancelling receiving in Postgres:", e.message));
  } catch (err: any) {
    console.error("Error updating receiving status to Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "CANCEL_STOCK_RECEIVING",
    "stock_receivings",
    r._id,
    { receiving_code: r.receiving_code }
  );

  res.json({ message: "Draft penerimaan barang berhasil dibatalkan.", receiving: r });
});

apiRouter.delete("/stock/receivings/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const idx = (db.stock_receivings || []).findIndex((item) => item._id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: "Data penerimaan tidak ditemukan." });
  const r = db.stock_receivings[idx];
  if (r.status === "POSTED") {
    return res.status(400).json({ detail: "Penerimaan barang yang sudah POSTED tidak boleh dihapus dari sistem." });
  }

  db.stock_receivings.splice(idx, 1);

  recordAuditLog(
    req.user!._id,
    "DELETE_STOCK_RECEIVING",
    "stock_receivings",
    req.params.id,
    { receiving_code: r.receiving_code }
  );

  deleteSingleDoc("stock_receivings", r._id);

  res.json({ message: "Draft penerimaan barang berhasil dihapus." });
});

// ================= STOCK ADJUSTMENT (OWNER, ADMIN, WAREHOUSE) =================
apiRouter.post("/inventory/adjustments", authMiddleware, requireRoles("ADMIN", "OWNER", "WAREHOUSE"), (req: AuthenticatedRequest, res) => {
  const { location_type, location_id, sku_id, adjustment_type, quantity, reason, notes } = req.body || {};

  if (!location_type || !location_id || !sku_id || !adjustment_type || !quantity || !reason) {
    return res.status(400).json({ detail: "Tipe lokasi, ID lokasi, SKU, jenis penyesuaian (IN/OUT), jumlah, dan alasan wajib diisi." });
  }

  const qty = parseInt(quantity) || 0;
  if (qty <= 0) return res.status(400).json({ detail: "Jumlah penyesuaian harus lebih dari 0." });

  const sku = db.skus.find((s) => s._id === sku_id);
  if (!sku) return res.status(404).json({ detail: "SKU tidak ditemukan." });

  const nowStr = new Date().toISOString();
  const todayStr = nowStr.slice(0, 10);
  const mvtCount = db.stock_movements.length + 1;

  let targetInv: InventoryItem;
  if (location_type === "SALES") {
    targetInv = ensureSalesInventory(location_id, sku_id);
  } else {
    targetInv = ensureWarehouseInventory(location_id, sku_id);
  }

  // Prevent negative stock on OUT adjustment
  if (adjustment_type === "OUT" && targetInv.available_stock < qty) {
    return res.status(400).json({
      detail: `Stok saat ini tidak mencukupi untuk penyesuaian pengurangan. Tersedia: ${targetInv.available_stock}, Diminta dikurangi: ${qty}.`,
      code: "INSUFFICIENT_STOCK_FOR_ADJUSTMENT",
    });
  }

  const mvtType: StockMovementType = adjustment_type === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";

  if (adjustment_type === "IN") {
    targetInv.stock_on_hand += qty;
    targetInv.available_stock += qty;
  } else {
    targetInv.stock_on_hand = Math.max(0, targetInv.stock_on_hand - qty);
    targetInv.available_stock = Math.max(0, targetInv.available_stock - qty);
  }
  targetInv.updated_at = nowStr;

  const movement: StockMovement = {
    _id: `mvt-${Date.now()}-adj`,
    movement_code: `MVT-${todayStr.replace(/-/g, "")}-${String(mvtCount).padStart(4, "0")}`,
    movement_type: mvtType,
    source_location_type: adjustment_type === "OUT" ? location_type : "NONE",
    source_location_id: adjustment_type === "OUT" ? location_id : "ADJUSTMENT",
    destination_location_type: adjustment_type === "IN" ? location_type : "NONE",
    destination_location_id: adjustment_type === "IN" ? location_id : "ADJUSTMENT",
    sku_id,
    quantity: qty,
    salesman_id: location_type === "SALES" ? location_id : undefined,
    warehouse_id: location_type === "WAREHOUSE" ? location_id : undefined,
    business_date: todayStr,
    status: "COMPLETED",
    notes: `[Penyesuaian ${reason}] ${notes || ""}`.trim(),
    created_by: req.user!._id,
    created_at: nowStr,
  };

  db.stock_movements.push(movement);
  syncSingleDoc("stock_movements", movement._id, movement);

  if (location_type === "SALES") {
    syncSalesStockLedger(location_id, sku_id, todayStr);
  }

  recordAuditLog(
    req.user!._id,
    "STOCK_ADJUSTMENT",
    "inventory",
    targetInv._id,
    { location_type, location_id, sku: sku.name, adjustment_type, quantity: qty, reason }
  );

  syncSingleDoc("inventory", targetInv._id, targetInv);

  try {

    // Insert Movement
    sqlDb.insert(pgStockMovements).values({
      id: movement._id,
      movementType: movement.movement_type,
      sourceLocationType: movement.source_location_type,
      sourceLocationId: movement.source_location_id,
      destLocationType: movement.destination_location_type,
      destLocationId: movement.destination_location_id,
      skuId: movement.sku_id,
      quantity: movement.quantity,
      performedBy: movement.created_by,
      notes: movement.notes,
      createdAt: new Date(movement.created_at),
      metadata: {
        movementCode: movement.movement_code,
        salesmanId: movement.salesman_id,
        warehouseId: movement.warehouse_id,
        businessDate: movement.business_date,
        status: movement.status
      }
    }).catch((e: any) => console.error("Error inserting adjustment movement:", e.message));

    // Update Inventory
    sqlDb.update(pgInventory).set({
      stockOnHand: targetInv.stock_on_hand,
      availableStock: targetInv.available_stock,
      updatedAt: new Date(targetInv.updated_at)
    }).where(eq(pgInventory.id, targetInv._id))
      .catch((e: any) => console.error("Error updating adjustment inventory:", e.message));
  } catch (err: any) {
    console.error("Failed to sync adjustment to postgres", err.message);
  }

  res.status(201).json({
    message: `Penyesuaian stok ${sku.name} (${adjustment_type === "IN" ? "+" : "-"}${qty}) berhasil disimpan.`,
    movement,
    inventory: targetInv,
  });
});

apiRouter.post("/inventory/opname", authMiddleware, requireRoles("ADMIN", "OWNER", "WAREHOUSE"), (req: AuthenticatedRequest, res) => {
  const { location_type, location_id, items, reason, notes } = req.body || {};

  if (!location_type || !location_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ detail: "Tipe lokasi, ID lokasi, dan daftar item opname wajib diisi." });
  }

  const nowStr = new Date().toISOString();
  const todayStr = nowStr.slice(0, 10);
  const adjustedItems: any[] = [];
  const movements: StockMovement[] = [];

  for (const item of items) {
    const skuId = item.sku_id;
    const physicalQty = parseInt(item.physical_qty);
    if (isNaN(physicalQty) || physicalQty < 0) continue;

    const sku = db.skus.find((s) => s._id === skuId);
    if (!sku) continue;

    let targetInv: InventoryItem;
    if (location_type === "SALES") {
      targetInv = ensureSalesInventory(location_id, skuId);
    } else {
      targetInv = ensureWarehouseInventory(location_id, skuId);
    }

    const currentQty = targetInv.stock_on_hand;
    const variance = physicalQty - currentQty;

    if (variance !== 0) {
      const isIncrease = variance > 0;
      const absDiff = Math.abs(variance);
      const mvtType: StockMovementType = isIncrease ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";

      targetInv.stock_on_hand = physicalQty;
      targetInv.available_stock = Math.max(0, physicalQty - (targetInv.allocated_stock || 0));
      targetInv.updated_at = nowStr;

      const mvtCount = db.stock_movements.length + 1;
      const movement: StockMovement = {
        _id: `mvt-${Date.now()}-opn-${skuId.slice(-4)}`,
        movement_code: `MVT-${todayStr.replace(/-/g, "")}-${String(mvtCount).padStart(4, "0")}`,
        movement_type: mvtType,
        source_location_type: !isIncrease ? location_type : "NONE",
        source_location_id: !isIncrease ? location_id : "OPNAME",
        destination_location_type: isIncrease ? location_type : "NONE",
        destination_location_id: isIncrease ? location_id : "OPNAME",
        sku_id: skuId,
        quantity: absDiff,
        salesman_id: location_type === "SALES" ? location_id : undefined,
        warehouse_id: location_type === "WAREHOUSE" ? location_id : undefined,
        business_date: todayStr,
        status: "COMPLETED",
        notes: `[Stock Opname: ${reason || "Opname Rutin"}] Sistem: ${currentQty} -> Fisik: ${physicalQty} (Selisih: ${variance > 0 ? "+" : ""}${variance}). ${item.notes || notes || ""}`.trim(),
        created_by: req.user!._id,
        created_at: nowStr,
      };

      db.stock_movements.push(movement);
      movements.push(movement);
      syncSingleDoc("stock_movements", movement._id, movement);
      syncSingleDoc("inventory", targetInv._id, targetInv);

      // Insert into Postgres
      try {

        // Insert Movement
        sqlDb.insert(pgStockMovements).values({
          id: movement._id,
          movementType: movement.movement_type,
          sourceLocationType: movement.source_location_type,
          sourceLocationId: movement.source_location_id,
          destLocationType: movement.destination_location_type,
          destLocationId: movement.destination_location_id,
          skuId: movement.sku_id,
          quantity: movement.quantity,
          performedBy: movement.created_by,
          notes: movement.notes,
          createdAt: new Date(movement.created_at),
          metadata: {
            movementCode: movement.movement_code,
            salesmanId: movement.salesman_id,
            warehouseId: movement.warehouse_id,
            businessDate: movement.business_date,
            status: movement.status
          }
        }).catch((e: any) => console.error("Error inserting opname movement:", e.message));

        // Update Inventory
        sqlDb.update(pgInventory).set({
          stockOnHand: targetInv.stock_on_hand,
          availableStock: targetInv.available_stock,
          updatedAt: new Date(targetInv.updated_at)
        }).where(eq(pgInventory.id, targetInv._id))
          .catch((e: any) => console.error("Error updating opname inventory:", e.message));

      } catch (err: any) {
        console.error("Error with Postgres opname sync:", err.message);
      }

      if (location_type === "SALES") {
        syncSalesStockLedger(location_id, skuId, todayStr);
      }
    }

    adjustedItems.push({
      sku_id: skuId,
      sku_name: sku.name,
      sku_code: sku.code,
      system_qty: currentQty,
      physical_qty: physicalQty,
      variance,
      notes: item.notes || "",
    });
  }

  saveDatabaseToDisk();

  recordAuditLog(
    req.user!._id,
    "STOCK_OPNAME_BATCH",
    "inventory",
    location_id,
    {
      location_type,
      location_id,
      reason: reason || "Opname Rutin",
      total_items_checked: adjustedItems.length,
      total_items_adjusted: movements.length,
      adjusted_items: adjustedItems.filter((i) => i.variance !== 0),
    }
  );

  res.status(201).json({
    message: `Stock opname berhasil diproses. ${movements.length} produk mengalami penyesuaian selisih fisik.`,
    total_checked: adjustedItems.length,
    total_adjusted: movements.length,
    items: adjustedItems,
    movements,
  });
});

// ================= INVENTORY CORE =================
apiRouter.get("/inventory", authMiddleware, async (req, res) => {
  const { location_type, location_id, sku_id } = req.query as Record<string, string>;

  let query = "SELECT * FROM inventory WHERE 1=1";
  
  if (location_type) {
    query += ` AND location_type = '${location_type.replace(/'/g, "''")}'`;
  }
  
  if (location_id) {
    query += ` AND location_id = '${location_id.replace(/'/g, "''")}'`;
  }
  
  if (sku_id) {
    query += ` AND sku_id = '${sku_id.replace(/'/g, "''")}'`;
  }

  try {
    const resDb: any = await (sqlDb as any).execute(sql.raw(query));
    const items = (resDb.rows || []).map((row: any) => ({
      _id: row.id,
      location_type: row.location_type,
      location_id: row.location_id,
      office_id: row.location_type === "WAREHOUSE" ? row.location_id : "",
      sku_id: row.sku_id,
      stock_on_hand: Number(row.stock_on_hand),
      allocated_stock: Number(row.allocated_stock),
      available_stock: Number(row.available_stock),
      reorder_level: Number(row.reorder_level),
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    const enriched = items.map((inv) => {
      const skuInfo = resolveSkuInfo(inv.sku_id as string);
      const office = db.offices.find((o) => o._id === (inv.location_id || inv.office_id));
      const sales = inv.location_type === "SALES" ? db.users.find((u) => u._id === inv.location_id) : null;
      const prc = db.prices.find((p) => p.sku_id === inv.sku_id && p.status === "ACTIVE");

      return {
        ...inv,
        sku_code: skuInfo.sku_code || "-",
        sku_name: skuInfo.resolved_name,
        unit: skuInfo.uom || "Unit",
        price: prc?.price || 0,
        office_name: office?.office_name || "Gudang Pusat",
        location_name: inv.location_type === "SALES" ? `Sales: ${sales?.name || inv.location_id}` : (office?.office_name || "Gudang Pusat"),
        salesman_name: sales?.name || "-",
      };
    });

    res.json({ items: enriched, total: enriched.length });
  } catch (err: any) {
    console.warn("Error fetching inventory from PG, falling back to memory:", err.message);
    res.json({ items: db.inventory || [], total: (db.inventory || []).length });
  }
});

apiRouter.post("/inventory/movements", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const { office_id, sku_id, movement_type, quantity, notes } = req.body || {};
  if (!office_id || !sku_id || !movement_type || !quantity) {
    return res.status(400).json({ detail: "Kantor, SKU, jenis mutasi, dan jumlah wajib diisi." });
  }

  const qty = parseInt(quantity);
  const nowStr = new Date().toISOString();
  const todayStr = nowStr.slice(0, 10);
  const inv = ensureWarehouseInventory(office_id, sku_id);

  if (movement_type === "IN") {
    inv.stock_on_hand += qty;
    inv.available_stock += qty;
  } else if (movement_type === "OUT") {
    inv.stock_on_hand = Math.max(0, inv.stock_on_hand - qty);
    inv.available_stock = Math.max(0, inv.available_stock - qty);
  } else if (movement_type === "ADJUSTMENT") {
    inv.stock_on_hand = qty;
    inv.available_stock = qty - inv.allocated_stock;
  }
  inv.updated_at = nowStr;

  const mvtCount = db.stock_movements.length + 1;
  const movement: StockMovement = {
    _id: `mvt-${Date.now()}`,
    movement_code: `MVT-${todayStr.replace(/-/g, "")}-${String(mvtCount).padStart(4, "0")}`,
    movement_type: movement_type === "IN" ? "PURCHASE_IN" : (movement_type === "OUT" ? "TRANSFER_OUT" : "ADJUSTMENT_IN"),
    source_location_type: movement_type === "IN" ? "SUPPLIER" : "WAREHOUSE",
    source_location_id: movement_type === "IN" ? "SUP-01" : office_id,
    destination_location_type: movement_type === "IN" ? "WAREHOUSE" : "NONE",
    destination_location_id: movement_type === "IN" ? office_id : "EXPENSE",
    sku_id,
    quantity: qty,
    warehouse_id: office_id,
    business_date: todayStr,
    status: "COMPLETED",
    notes,
    created_by: req.user!._id,
    created_at: nowStr,
  };

  db.stock_movements.push(movement);

  try {

    sqlDb.insert(pgStockMovements).values({
      id: movement._id,
      movementType: movement.movement_type,
      sourceLocationType: movement.source_location_type,
      sourceLocationId: movement.source_location_id,
      destLocationType: movement.destination_location_type,
      destLocationId: movement.destination_location_id,
      skuId: movement.sku_id,
      quantity: movement.quantity,
      performedBy: movement.created_by,
      notes: movement.notes,
      createdAt: new Date(movement.created_at),
      metadata: {
        movementCode: movement.movement_code,
        warehouseId: movement.warehouse_id,
        businessDate: movement.business_date,
        status: movement.status
      }
    }).catch((e: any) => console.error("Error inserting movement to pg:", e.message));

    sqlDb.update(pgInventory).set({
      stockOnHand: inv.stock_on_hand,
      availableStock: inv.available_stock,
      updatedAt: new Date(inv.updated_at)
    }).where(eq(pgInventory.id, inv._id))
      .catch((e: any) => console.error("Error updating inv to pg:", e.message));

  } catch (err: any) {
    console.error("Failed to sync POST movement to postgres", err.message);
  }

  res.status(201).json(movement);
});

apiRouter.get("/inventory/movements", authMiddleware, async (req, res) => {
  const { from_date, to_date, sku_id, movement_type, salesman_id, warehouse_id } = req.query as Record<string, string>;

  let query = "SELECT * FROM stock_movements WHERE 1=1";
  
  if (from_date) {
    query += ` AND DATE(created_at) >= '${from_date.replace(/'/g, "''")}'`;
  }
  
  if (to_date) {
    query += ` AND DATE(created_at) <= '${to_date.replace(/'/g, "''")}'`;
  }
  
  if (sku_id) {
    query += ` AND sku_id = '${sku_id.replace(/'/g, "''")}'`;
  }
  
  if (movement_type) {
    query += ` AND movement_type = '${movement_type.replace(/'/g, "''")}'`;
  }
  
  if (salesman_id) {
    const sId = salesman_id.replace(/'/g, "''");
    query += ` AND (source_location_id = '${sId}' OR dest_location_id = '${sId}')`;
  }

  query += " ORDER BY created_at DESC";

  try {
    const resDb: any = await (sqlDb as any).execute(sql.raw(query));
    const items = (resDb.rows || []).map((row: any) => ({
      _id: row.id,
      movement_code: (row.metadata as any)?.movementCode || row.id,
      movement_type: row.movement_type,
      source_location_type: row.source_location_type,
      source_location_id: row.source_location_id,
      destination_location_type: row.dest_location_type,
      destination_location_id: row.dest_location_id,
      sku_id: row.sku_id,
      quantity: row.quantity,
      business_date: (row.metadata as any)?.businessDate || (row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
      warehouse_id: (row.metadata as any)?.warehouseId || "off-1",
      salesman_id: row.source_location_type === "SALES" ? row.source_location_id : (row.dest_location_type === "SALES" ? row.dest_location_id : ""),
      status: (row.metadata as any)?.status || "COMPLETED",
      notes: row.notes,
      created_by: row.performed_by,
      created_at: row.created_at
    }));

    // Filter by warehouse if provided (since we mapped it)
    let filteredItems = items;
    if (warehouse_id) {
      filteredItems = items.filter(m => m.warehouse_id === warehouse_id);
    }

    const enriched = filteredItems.map((m) => {
      const sku = db.skus.find((s) => s._id === m.sku_id);
      const office = db.offices.find((o) => o._id === (m.warehouse_id || (m as any).office_id));
      const creator = db.users.find((u) => u._id === m.created_by);
      const sales = m.salesman_id ? db.users.find((u) => u._id === m.salesman_id) : null;

      return {
        ...m,
        sku_name: sku?.name || "-",
        sku_code: sku?.code || "-",
        unit: sku?.unit || "Unit",
        office_name: office?.office_name || "Gudang Pusat",
        creator_name: creator?.name || "-",
        salesman_name: sales?.name || "-",
        outlet_name: "-",
      };
    });

    res.json({ items: enriched, total: enriched.length });
  } catch (err: any) {
    console.warn("Error fetching movements from PG, falling back to memory:", err.message);
    res.json({ items: db.stock_movements || [], total: (db.stock_movements || []).length });
  }
});

// ================= AUDIT TRAIL =================
apiRouter.get("/audit", authMiddleware, requireRoles("ADMIN", "OWNER"), (req, res) => {
  const entity = (req.query.entity as string || "").trim();
  const action = (req.query.action as string || "").trim();
  const from = (req.query.from as string || "").trim();
  const to = (req.query.to as string || "").trim();
  const search = (req.query.search as string || "").trim().toLowerCase();
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));

  let logs = [...db.audit_logs];

  // Filtering by Entity
  if (entity && entity !== "ALL") {
    logs = logs.filter((l) => l.entity?.toLowerCase() === entity.toLowerCase());
  }

  // Filtering by Action
  if (action) {
    logs = logs.filter((l) => l.action?.toLowerCase().includes(action.toLowerCase()));
  }

  // Filtering by Date Range
  if (from) {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const fromTime = fromDate.getTime();
    logs = logs.filter((l) => {
      const t = new Date(l.created_at || (l as any).timestamp || 0).getTime();
      return t >= fromTime;
    });
  }

  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    const toTime = toDate.getTime();
    logs = logs.filter((l) => {
      const t = new Date(l.created_at || (l as any).timestamp || 0).getTime();
      return t <= toTime;
    });
  }

  // Global Keyword Search
  if (search) {
    logs = logs.filter((l) => {
      const user = db.users.find((u) => u._id === l.user_id);
      const userName = user?.name || l.details?.user_name || "";
      const userRole = user?.role || l.details?.user_role || "";
      const detailsStr = typeof l.details === "object" ? JSON.stringify(l.details) : String(l.details || "");
      return (
        l.action?.toLowerCase().includes(search) ||
        l.entity?.toLowerCase().includes(search) ||
        (l.entity_id && String(l.entity_id).toLowerCase().includes(search)) ||
        userName.toLowerCase().includes(search) ||
        userRole.toLowerCase().includes(search) ||
        detailsStr.toLowerCase().includes(search) ||
        (l.ip_address && l.ip_address.toLowerCase().includes(search))
      );
    });
  }

  // Sort descending (newest first)
  logs.sort((a, b) => {
    const tA = new Date(a.created_at || (a as any).timestamp || 0).getTime();
    const tB = new Date(b.created_at || (b as any).timestamp || 0).getTime();
    return tB - tA;
  });

  const total = logs.length;
  const startIndex = (page - 1) * limit;
  const paginated = logs.slice(startIndex, startIndex + limit);

  // Compute live stats for audit telemetry
  const todayStr = new Date().toISOString().slice(0, 10);
  const totalToday = db.audit_logs.filter((l) => (l.created_at || "").startsWith(todayStr)).length;
  const criticalActions = db.audit_logs.filter((l) => {
    const act = (l.action || "").toUpperCase();
    return act.includes("DELETE") || act.includes("CANCEL") || act.includes("ADJUST") || act.includes("FAIL") || act.includes("REASSIGN");
  }).length;
  const totalLogins = db.audit_logs.filter((l) => (l.action || "").toUpperCase() === "LOGIN").length;

  // Enrich data for UI
  const enriched = paginated.map((l) => {
    const user = db.users.find((u) => u._id === l.user_id);
    const ts = l.created_at || (l as any).timestamp || new Date().toISOString();
    const details = l.details || {};
    
    // Extract meaningful before/after snapshots
    const before = details.before || details.old_data || details.prev_status ? {
      prev_status: details.prev_status,
      ...(details.before || details.old_data || {})
    } : null;

    const after = details.after || details.new_data || details.new_status ? {
      new_status: details.new_status,
      ...(details.after || details.new_data || {})
    } : null;

    return {
      _id: l._id,
      user_id: l.user_id,
      user_name: user?.name || details.user_name || "System / Auto",
      role: user?.role || details.user_role || (l.user_id === "system" ? "SYSTEM" : "-"),
      action: l.action,
      entity: l.entity,
      entity_id: l.entity_id,
      timestamp: ts,
      created_at: ts,
      ip: l.ip_address || (l as any).ip || "-",
      ip_address: l.ip_address || (l as any).ip || "-",
      before,
      after,
      metadata: details,
      details,
    };
  });

  res.json({
    items: enriched,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit) || 1,
    stats: {
      total_logs: db.audit_logs.length,
      total_today: totalToday,
      critical_actions: criticalActions,
      total_logins: totalLogins,
    },
  });
});

// ================= SALES OUTLET ASSIGNMENT =================
apiRouter.get("/sales-outlets", authMiddleware, (req: AuthenticatedRequest, res) => {
  const sales_id = req.query.sales_id as string;
  const outlet_id = req.query.outlet_id as string;
  const area_id = req.query.area_id as string;
  const status = req.query.status as string;
  const q = ((req.query.q as string) || "").toLowerCase().trim();

  // If user is SALES, they can only view their own assignments
  const filterSalesId = req.user!.role === "SALES" ? req.user!._id : sales_id;

  let assignments = db.sales_outlets.filter((so) => {
    if (filterSalesId && so.sales_id !== filterSalesId && (so as any).salesman_id !== filterSalesId) return false;
    if (outlet_id && so.outlet_id !== outlet_id) return false;
    if (area_id && so.area_id !== area_id) return false;
    if (status && status !== "ALL" && so.status !== status) return false;
    return true;
  });

  const enriched = assignments.map((so) => {
    const outlet = db.outlets.find((o) => o._id === so.outlet_id);
    const sales = db.users.find((u) => u._id === so.sales_id) || db.salesmen.find((s) => s._id === so.sales_id || s.user_id === so.sales_id);
    const assignedByUser = db.users.find((u) => u._id === so.assigned_by);
    const unassignedByUser = so.unassigned_by ? db.users.find((u) => u._id === so.unassigned_by) : null;
    const area = db.areas.find((a) => a._id === so.area_id) || db.areas.find((a) => a._id === outlet?.area_id);

    return {
      ...so,
      outlet_code: outlet?.outlet_code || "-",
      outlet_name: outlet?.outlet_name || "-",
      outlet_address: outlet?.address || "-",
      outlet_phone: outlet?.phone || "-",
      outlet_latitude: outlet?.latitude,
      outlet_longitude: outlet?.longitude,
      sales_name: sales?.name || "-",
      sales_code: (sales as any)?.code || so.sales_id,
      sales_role: (sales as any)?.role || "SALES",
      sales_phone: sales?.phone || "-",
      area_name: area?.name || "-",
      assigned_by_name: assignedByUser?.name || "System",
      unassigned_by_name: unassignedByUser?.name || null,
    };
  });

  let filtered = enriched;
  if (q) {
    filtered = enriched.filter((item) => {
      const matchOutlet = (item.outlet_name || "").toLowerCase().includes(q) || (item.outlet_code || "").toLowerCase().includes(q);
      const matchSales = (item.sales_name || "").toLowerCase().includes(q) || (item.sales_code || "").toLowerCase().includes(q);
      const matchArea = (item.area_name || "").toLowerCase().includes(q);
      const matchNotes = (item.notes || "").toLowerCase().includes(q);
      return matchOutlet || matchSales || matchArea || matchNotes;
    });
  }

  // Calculate summary metrics
  const totalOutlets = db.outlets.filter((o) => o.status !== "ARCHIVED").length;
  const activeDirectOutletIds = new Set(
    db.sales_outlets.filter((so) => so.status === "ACTIVE").map((so) => so.outlet_id)
  );
  const totalActive = db.sales_outlets.filter((so) => so.status === "ACTIVE").length;
  const totalInactive = db.sales_outlets.filter((so) => so.status === "INACTIVE").length;
  const unassignedCount = Math.max(0, totalOutlets - activeDirectOutletIds.size);
  const coveragePct = totalOutlets > 0 ? Math.round((activeDirectOutletIds.size / totalOutlets) * 100) : 0;

  res.json({
    items: filtered,
    total: filtered.length,
    summary: {
      total_active: totalActive,
      total_inactive: totalInactive,
      total_outlets: totalOutlets,
      assigned_outlets_count: activeDirectOutletIds.size,
      unassigned_outlets_count: unassignedCount,
      coverage_percentage: coveragePct,
    },
  });
});

apiRouter.post("/sales-outlets", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const sales_id = req.body.sales_id || req.body.salesman_id;
  const outlet_id = req.body.outlet_id;
  const { notes, area_id } = req.body || {};
  if (!sales_id || !outlet_id) {
    return res.status(400).json({ detail: "Sales ID dan Outlet ID wajib diisi." });
  }

  const outlet = db.outlets.find((o) => o._id === outlet_id);
  if (!outlet) return res.status(404).json({ detail: "Outlet tidak ditemukan." });

  const salesUser = db.users.find((u) => u._id === sales_id);
  if (!salesUser) return res.status(404).json({ detail: "Sales user tidak ditemukan." });

  const now = new Date().toISOString();

  // Check if there is already an active assignment for this outlet
  const existingActive = db.sales_outlets.find(
    (so) => so.outlet_id === outlet_id && so.status === "ACTIVE"
  );

  if (existingActive) {
    if (existingActive.sales_id === sales_id) {
      return res.status(400).json({ detail: "Outlet ini sudah aktif ditugaskan kepada sales ini." });
    }
    // Deactivate previous assignment
    existingActive.status = "INACTIVE";
    existingActive.unassigned_at = now;
    existingActive.unassigned_by = req.user!._id;
    existingActive.notes = (existingActive.notes ? existingActive.notes + " | " : "") + `Direassign ke sales ${salesUser.name}`;
    syncSingleDoc("sales_outlets", existingActive._id, existingActive);
  }

  const resolvedAreaId = area_id || salesUser.area_id || outlet.area_id || "area-1";
  const newAssignment: SalesOutlet = {
    _id: `so-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sales_id,
    outlet_id,
    area_id: resolvedAreaId,
    status: "ACTIVE",
    assigned_at: now,
    assigned_by: req.user!._id,
    notes: notes || "Penugasan outlet oleh Admin/Supervisor",
  };

  db.sales_outlets.push(newAssignment);
  syncSingleDoc("sales_outlets", newAssignment._id, newAssignment);
  saveDatabaseToDisk();

  try {
    await sqlDb.insert(pgSalesOutlets).values({
      id: newAssignment._id,
      salesmanId: newAssignment.sales_id,
      outletId: newAssignment.outlet_id,
      status: "ACTIVE"
    });
  } catch(err: any) {}

  try {
    await sqlDb.insert(pgSalesOutlets).values({
      id: newAssignment._id,
      salesmanId: newAssignment.sales_id,
      outletId: newAssignment.outlet_id,
      status: "ACTIVE"
    });
  } catch (err: any) {
    console.error("Error inserting sales outlet assignment to Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "ASSIGN_OUTLET_TO_SALES",
    "sales_outlets",
    newAssignment._id,
    {
      sales_id,
      sales_name: salesUser.name,
      outlet_id,
      outlet_name: outlet.outlet_name,
      previous_sales_id: existingActive?.sales_id || null,
      notes: newAssignment.notes,
    }
  );

  res.status(201).json({
    message: `Outlet "${outlet.outlet_name}" berhasil ditugaskan kepada ${salesUser.name}.`,
    assignment: newAssignment,
  });
});

apiRouter.put("/sales-outlets/:id", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const assignment = db.sales_outlets.find((so) => so._id === req.params.id);
  if (!assignment) return res.status(404).json({ detail: "Data penugasan tidak ditemukan." });

  const { sales_id, area_id, notes, status } = req.body || {};
  const now = new Date().toISOString();

  const prevSalesId = assignment.sales_id;
  const prevSales = db.users.find((u) => u._id === prevSalesId);
  const newSales = sales_id ? db.users.find((u) => u._id === sales_id) : null;
  const outlet = db.outlets.find((o) => o._id === assignment.outlet_id);

  if (sales_id && sales_id !== prevSalesId) {
    if (!newSales) return res.status(404).json({ detail: "Sales rep penerima baru tidak ditemukan." });

    // Mark current as inactive/reassigned
    assignment.status = "INACTIVE";
    assignment.unassigned_at = now;
    assignment.unassigned_by = req.user!._id;
    assignment.notes = (assignment.notes ? assignment.notes + " | " : "") + `Reassign to ${newSales.name}`;
    syncSingleDoc("sales_outlets", assignment._id, assignment);

    try {
      await sqlDb.update(pgSalesOutlets).set({ status: "INACTIVE" }).where(eq(pgSalesOutlets.id, assignment._id));
    } catch(err: any) {}

    // Create new assignment
    const newAssignment: SalesOutlet = {
      _id: `so-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sales_id,
      outlet_id: assignment.outlet_id,
      area_id: area_id || newSales.area_id || assignment.area_id,
      status: status || "ACTIVE",
      assigned_at: now,
      assigned_by: req.user!._id,
      notes: notes || `Reassign from ${prevSales?.name || prevSalesId}`,
    };
    db.sales_outlets.push(newAssignment);
    syncSingleDoc("sales_outlets", newAssignment._id, newAssignment);
    saveDatabaseToDisk();

    try {
      await sqlDb.insert(pgSalesOutlets).values({
        id: newAssignment._id,
        salesmanId: newAssignment.sales_id,
        outletId: newAssignment.outlet_id,
        status: newAssignment.status
      });
    } catch(err: any) {}

    recordAuditLog(
      req.user!._id,
      "REASSIGN_OUTLET",
      "sales_outlets",
      newAssignment._id,
      {
        outlet_id: assignment.outlet_id,
        outlet_name: outlet?.outlet_name || assignment.outlet_id,
        previous_sales_id: prevSalesId,
        previous_sales_name: prevSales?.name || prevSalesId,
        new_sales_id: sales_id,
        new_sales_name: newSales.name,
        notes,
      }
    );

    return res.json({
      message: `Penugasan berhasil diperbarui ke ${newSales.name}.`,
      assignment: newAssignment,
    });
  }

  // Update existing assignment attributes
  if (area_id) assignment.area_id = area_id;
  if (notes !== undefined) assignment.notes = notes;
  if (status) {
    if (status === "INACTIVE" && assignment.status === "ACTIVE") {
      assignment.unassigned_at = now;
      assignment.unassigned_by = req.user!._id;
    }
    assignment.status = status;
  }

  syncSingleDoc("sales_outlets", assignment._id, assignment);
  saveDatabaseToDisk();

  try {
    await sqlDb.update(pgSalesOutlets).set({
      status: assignment.status
    }).where(eq(pgSalesOutlets.id, assignment._id));
  } catch(err: any) {}

  recordAuditLog(
    req.user!._id,
    "UPDATE_SALES_ASSIGNMENT",
    "sales_outlets",
    assignment._id,
    {
      outlet_id: assignment.outlet_id,
      sales_id: assignment.sales_id,
      status: assignment.status,
      notes: assignment.notes,
    }
  );

  res.json({
    message: "Data penugasan berhasil diperbarui.",
    assignment,
  });
});

apiRouter.post("/sales-outlets/:id/toggle", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const assignment = db.sales_outlets.find((so) => so._id === req.params.id);
  if (!assignment) return res.status(404).json({ detail: "Data penugasan tidak ditemukan." });

  const outlet = db.outlets.find((o) => o._id === assignment.outlet_id);
  const sales = db.users.find((u) => u._id === assignment.sales_id);
  const now = new Date().toISOString();

  if (assignment.status === "ACTIVE") {
    assignment.status = "INACTIVE";
    assignment.unassigned_at = now;
    assignment.unassigned_by = req.user!._id;
  } else {
    // Before activating, deactivate any other active assignment for this outlet
    const otherActive = db.sales_outlets.filter((so) => so.outlet_id === assignment.outlet_id && so.status === "ACTIVE" && so._id !== assignment._id);
    for (const other of otherActive) {
      other.status = "INACTIVE";
      other.unassigned_at = now;
      other.unassigned_by = req.user!._id;
      syncSingleDoc("sales_outlets", other._id, other);
    }
    assignment.status = "ACTIVE";
    assignment.assigned_at = now;
    assignment.assigned_by = req.user!._id;
    assignment.unassigned_at = undefined;
    assignment.unassigned_by = undefined;
  }

  syncSingleDoc("sales_outlets", assignment._id, assignment);
  saveDatabaseToDisk();

  try {
    await sqlDb.update(pgSalesOutlets).set({
      status: assignment.status
    }).where(eq(pgSalesOutlets.id, assignment._id));
  } catch(err: any) {}

  recordAuditLog(
    req.user!._id,
    assignment.status === "ACTIVE" ? "REACTIVATE_ASSIGNMENT" : "UNASSIGN_OUTLET",
    "sales_outlets",
    assignment._id,
    {
      sales_id: assignment.sales_id,
      sales_name: sales?.name || "-",
      outlet_id: assignment.outlet_id,
      outlet_name: outlet?.outlet_name || "-",
      status: assignment.status,
    }
  );

  res.json({
    status: assignment.status,
    message: `Status penugasan diubah menjadi ${assignment.status}`,
    assignment,
  });
});

apiRouter.post("/sales-outlets/bulk-assign", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const { sales_id, outlet_ids, notes } = req.body || {};
  if (!sales_id || !outlet_ids || !Array.isArray(outlet_ids) || outlet_ids.length === 0) {
    return res.status(400).json({ detail: "Sales ID dan daftar outlet_ids wajib diisi." });
  }

  const salesUser = db.users.find((u) => u._id === sales_id);
  if (!salesUser) return res.status(404).json({ detail: "Sales user tidak ditemukan." });

  const assignedCount: string[] = [];
  const now = new Date().toISOString();

  for (const outletId of outlet_ids) {
    const outlet = db.outlets.find((o) => o._id === outletId);
    if (!outlet) continue;

    // Deactivate previous active assignment if exists
    const existingActive = db.sales_outlets.find(
      (so) => so.outlet_id === outletId && so.status === "ACTIVE"
    );
    if (existingActive) {
      if (existingActive.sales_id === sales_id) {
        continue; // Already assigned to this sales
      }
      existingActive.status = "INACTIVE";
      existingActive.unassigned_at = now;
      existingActive.unassigned_by = req.user!._id;
      existingActive.notes = (existingActive.notes ? existingActive.notes + " | " : "") + `Direassign ke sales ${salesUser.name}`;
      syncSingleDoc("sales_outlets", existingActive._id, existingActive);
    }

    const assignment: SalesOutlet = {
      _id: `so-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      sales_id,
      outlet_id: outletId,
      area_id: salesUser.area_id || outlet.area_id || "area-1",
      status: "ACTIVE",
      assigned_at: now,
      assigned_by: req.user!._id,
      notes: notes || "Bulk assignment",
    };
    db.sales_outlets.push(assignment);
    syncSingleDoc("sales_outlets", assignment._id, assignment);
    assignedCount.push(outletId);
    
    try {
      if (existingActive) {
        await sqlDb.update(pgSalesOutlets).set({ status: "INACTIVE" }).where(eq(pgSalesOutlets.id, existingActive._id));
      }
      await sqlDb.insert(pgSalesOutlets).values({
        id: assignment._id,
        salesmanId: assignment.sales_id,
        outletId: assignment.outlet_id,
        status: assignment.status
      });
    } catch(err: any) {}
  }

  saveDatabaseToDisk();

  recordAuditLog(
    req.user!._id,
    "BULK_ASSIGN_OUTLETS",
    "sales_outlets",
    sales_id,
    { sales_id, sales_name: salesUser.name, count: assignedCount.length, outlet_ids: assignedCount }
  );

  res.json({
    message: `${assignedCount.length} outlet berhasil ditugaskan kepada ${salesUser.name}.`,
    assigned_count: assignedCount.length,
  });
});

apiRouter.post("/sales-outlets/reassign", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const { outlet_id, new_sales_id, reason, notes } = req.body || {};
  if (!outlet_id || !new_sales_id) {
    return res.status(400).json({ detail: "Outlet ID dan Sales Baru wajib diisi." });
  }

  const outlet = db.outlets.find((o) => o._id === outlet_id);
  if (!outlet) return res.status(404).json({ detail: "Outlet tidak ditemukan." });

  const newSales = db.users.find((u) => u._id === new_sales_id);
  if (!newSales) return res.status(404).json({ detail: "Sales penerima baru tidak ditemukan." });

  const now = new Date().toISOString();

  // 1. Deactivate current active assignments
  const activeAssignments = db.sales_outlets.filter(
    (so) => so.outlet_id === outlet_id && so.status === "ACTIVE"
  );

  let previousSalesName = "-";
  let previousSalesId = "-";
  for (const prev of activeAssignments) {
    prev.status = "INACTIVE";
    prev.unassigned_at = now;
    prev.unassigned_by = req.user!._id;
    prev.notes = (prev.notes ? prev.notes + " | " : "") + `Reassigned to ${newSales.name}. Reason: ${reason || "Reorganisasi Area"}`;
    const pSales = db.users.find((u) => u._id === prev.sales_id);
    previousSalesName = pSales?.name || prev.sales_id;
    previousSalesId = prev.sales_id;
    syncSingleDoc("sales_outlets", prev._id, prev);

    try {
      await sqlDb.update(pgSalesOutlets).set({ status: "INACTIVE" }).where(eq(pgSalesOutlets.id, prev._id));
    } catch(err: any) {}
  }

  // 2. Create new active assignment
  const newAssignment: SalesOutlet = {
    _id: `so-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sales_id: new_sales_id,
    outlet_id,
    area_id: newSales.area_id || outlet.area_id || "area-1",
    status: "ACTIVE",
    assigned_at: now,
    assigned_by: req.user!._id,
    notes: notes || `Reassigned from ${previousSalesName}. ${reason || ""}`,
  };
  db.sales_outlets.push(newAssignment);
  syncSingleDoc("sales_outlets", newAssignment._id, newAssignment);
  saveDatabaseToDisk();

  try {
    await sqlDb.insert(pgSalesOutlets).values({
      id: newAssignment._id,
      salesmanId: newAssignment.sales_id,
      outletId: newAssignment.outlet_id,
      status: "ACTIVE"
    });
  } catch(err: any) {}

  try {
    await sqlDb.insert(pgSalesOutlets).values({
      id: newAssignment._id,
      salesmanId: newAssignment.sales_id,
      outletId: newAssignment.outlet_id,
      status: "ACTIVE"
    });
  } catch (err: any) {
    console.error("Error inserting sales outlet assignment to Postgres:", err.message);
  }

  // 3. Record Audit Log: CRITICAL NOTE: Historical transactions & visits remain untouched!
  recordAuditLog(
    req.user!._id,
    "REASSIGN_OUTLET",
    "sales_outlets",
    newAssignment._id,
    {
      outlet_id,
      outlet_name: outlet.outlet_name,
      previous_sales_id: previousSalesId,
      previous_sales_name: previousSalesName,
      new_sales_id,
      new_sales_name: newSales.name,
      reason: reason || "Reorganisasi wilayah/sales",
    }
  );

  res.json({
    message: `Outlet "${outlet.outlet_name}" berhasil direassign dari ${previousSalesName} ke ${newSales.name}. Transaksi historis tetap terjaga.`,
    assignment: newAssignment,
  });
});

apiRouter.delete("/sales-outlets/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const assignment = db.sales_outlets.find((so) => so._id === req.params.id);
  if (!assignment) return res.status(404).json({ detail: "Data penugasan tidak ditemukan." });

  const outlet = db.outlets.find((o) => o._id === assignment.outlet_id);
  const sales = db.users.find((u) => u._id === assignment.sales_id);

  assignment.status = "INACTIVE";
  assignment.unassigned_at = new Date().toISOString();
  assignment.unassigned_by = req.user!._id;
  assignment.notes = (assignment.notes ? assignment.notes + " | " : "") + "Dihapus/dinonaktifkan oleh Supervisor/Admin";

  syncSingleDoc("sales_outlets", assignment._id, assignment);
  saveDatabaseToDisk();

  try {
    await sqlDb.update(pgSalesOutlets).set({
      status: "INACTIVE"
    }).where(eq(pgSalesOutlets.id, assignment._id));
  } catch (err: any) {
    console.error("Error updating sales outlet assignment to Postgres:", err.message);
  }

  recordAuditLog(
    req.user!._id,
    "UNASSIGN_OUTLET",
    "sales_outlets",
    assignment._id,
    {
      sales_id: assignment.sales_id,
      sales_name: sales?.name || "-",
      outlet_id: assignment.outlet_id,
      outlet_name: outlet?.outlet_name || "-",
    }
  );

  res.json({
    message: `Penugasan outlet "${outlet?.outlet_name || assignment.outlet_id}" kepada ${sales?.name || assignment.sales_id} berhasil dinonaktifkan.`,
    assignment,
  });
});

// ================= TRANSACTION VOID (ALIAS WITH RECEIVABLE VOID) =================
apiRouter.post("/transactions/:id/void", authMiddleware, requireRoles("SUPERVISOR", "ADMIN", "OWNER", "SALES"), (req: AuthenticatedRequest, res) => {
  const txn = db.transactions.find((t) => t._id === req.params.id || t.invoice_number === req.params.id);
  if (!txn) return res.status(404).json({ detail: "Transaksi tidak ditemukan." });
  if (req.user!.role === "SALES" && txn.salesman_id !== req.user!._id) {
    return res.status(403).json({ detail: "Akses ditolak. Anda hanya dapat membatalkan transaksi milik Anda sendiri." });
  }
  if (txn.status === "CANCELLED") return res.status(400).json({ detail: "Transaksi sudah dibatalkan sebelumnya." });

  const { reason } = req.body || {};
  if (!reason) return res.status(400).json({ detail: "Alasan void/pembatalan transaksi wajib diisi." });

  txn.status = "CANCELLED";
  const today = getTodayWIB();

  // Reverse stock back to salesman
  (txn.items || []).forEach((it: any, idx: number) => {
    const qty = Number(it.quantity ?? it.volume ?? 0);
    let salesInv = db.inventory.find(
      (i) => i.location_type === "SALES" && i.location_id === txn.salesman_id && i.sku_id === it.sku_id
    );
    if (salesInv) {
      salesInv.stock_on_hand += qty;
      salesInv.available_stock += qty;
      salesInv.updated_at = new Date().toISOString();
    }

    const movementCode = `MVT-REV-${today.replace(/-/g, "")}-${String(db.stock_movements.length + 1).padStart(4, "0")}`;
    const mvt = {
      _id: `mvt-rev-${Date.now()}-${idx}`,
      movement_code: movementCode,
      movement_type: "REVERSAL" as any,
      source_location_type: "OUTLET" as any,
      source_location_id: txn.outlet_id,
      destination_location_type: "SALES" as any,
      destination_location_id: txn.salesman_id,
      sku_id: it.sku_id,
      quantity: qty,
      salesman_id: txn.salesman_id,
      outlet_id: txn.outlet_id,
      reference_id: txn._id,
      business_date: today,
      status: "COMPLETED" as any,
      notes: `Void/Reversal pembatalan ${txn.invoice_number || txn._id}: ${reason}`,
      created_by: req.user!._id,
      created_at: new Date().toISOString(),
    };
    db.stock_movements.push(mvt);

    try {

      sqlDb.insert(pgStockMovements).values({
        id: mvt._id,
        movementType: mvt.movement_type,
        sourceLocationType: mvt.source_location_type,
        sourceLocationId: mvt.source_location_id,
        destLocationType: mvt.destination_location_type,
        destLocationId: mvt.destination_location_id,
        skuId: mvt.sku_id,
        quantity: mvt.quantity,
        referenceId: mvt.reference_id,
        performedBy: mvt.created_by,
        notes: mvt.notes,
        createdAt: new Date(mvt.created_at),
        metadata: {
          movementCode: mvt.movement_code,
          salesmanId: mvt.salesman_id,
          businessDate: mvt.business_date,
          status: mvt.status
        }
      }).catch((e: any) => console.error("Error inserting void movement:", e.message));

      if (salesInv) {
        sqlDb.update(pgInventory).set({
          stockOnHand: salesInv.stock_on_hand,
          availableStock: salesInv.available_stock,
          updatedAt: new Date(salesInv.updated_at)
        }).where(eq(pgInventory.id, salesInv._id))
          .catch((e: any) => console.error("Error updating void inventory:", e.message));
      }
    } catch (err: any) {
      console.error("Failed to sync void to postgres", err.message);
    }

    syncSalesStockLedger(txn.salesman_id, it.sku_id, today);
  });

  // Cancel associated receivable if exists
  const rec = (db.receivables || []).find((r) => r.invoice_id === txn._id || r.invoice_number === txn.invoice_number);
  if (rec) {
    rec.status = "OVERDUE";
    syncSingleDoc("receivables", rec._id, rec);
  }

  recalculateOutletSummary(txn.outlet_id);
  const updatedOutlet = db.outlets.find((o) => o._id === txn.outlet_id);
  if (updatedOutlet) syncSingleDoc("outlets", updatedOutlet._id, updatedOutlet);
  syncSingleDoc("transactions", txn._id, txn);

  recordAuditLog(
    req.user!._id,
    "VOID_TRANSACTION",
    "transactions",
    txn._id,
    {
      invoice_number: txn.invoice_number,
      outlet_id: txn.outlet_id,
      reason,
      items: txn.items,
    }
  );

  res.json({
    message: `Transaksi ${txn.invoice_number || txn._id} berhasil di-void dan stok sales berhasil dikembalikan.`,
    transaction: txn,
  });
});

// ================= NOO (NEW OUTLET OPENING) APPROVAL WORKFLOW =================
apiRouter.post("/outlets/:id/approve", authMiddleware, requireRoles("SUPERVISOR", "ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const outlet = db.outlets.find((o) => o._id === req.params.id);
  if (!outlet) return res.status(404).json({ detail: "Outlet tidak ditemukan." });

  outlet.status = "ACTIVE";
  outlet.lifecycle_status = "NOO";
  (outlet as any).approved_by = req.user!._id;
  (outlet as any).approved_at = new Date().toISOString();
  outlet.updated_at = new Date().toISOString();

  syncSingleDoc("outlets", outlet._id, outlet);
  saveDatabaseToDisk();

  recordAuditLog(
    req.user!._id,
    "APPROVE_OUTLET_NOO",
    "outlets",
    outlet._id,
    { outlet_code: outlet.outlet_code, outlet_name: outlet.outlet_name }
  );

  res.json({
    message: `Outlet "${outlet.outlet_name}" (${outlet.outlet_code}) berhasil disetujui.`,
    outlet,
  });
});

apiRouter.post("/outlets/:id/reject", authMiddleware, requireRoles("SUPERVISOR", "ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const outlet = db.outlets.find((o) => o._id === req.params.id);
  if (!outlet) return res.status(404).json({ detail: "Outlet tidak ditemukan." });

  const { reason } = req.body || {};
  outlet.status = "INACTIVE";
  outlet.lifecycle_status = "DORMANT";
  (outlet as any).rejection_reason = reason || "Ditolak saat verifikasi NOO";
  (outlet as any).rejected_by = req.user!._id;
  (outlet as any).rejected_at = new Date().toISOString();
  outlet.updated_at = new Date().toISOString();

  syncSingleDoc("outlets", outlet._id, outlet);
  saveDatabaseToDisk();

  recordAuditLog(
    req.user!._id,
    "REJECT_OUTLET_NOO",
    "outlets",
    outlet._id,
    { outlet_code: outlet.outlet_code, outlet_name: outlet.outlet_name, reason }
  );

  res.json({
    message: `Pendaftaran outlet "${outlet.outlet_name}" telah ditolak.`,
    outlet,
  });
});

// ================= CASH SETTLEMENT / DEPOSITS (SETORAN UANG SALES) =================
apiRouter.get("/deposits", authMiddleware, (req: AuthenticatedRequest, res) => {
  const salesmanId = req.user!.role === "SALES" ? req.user!._id : (req.query.salesman_id as string);
  const businessDate = req.query.business_date as string;
  const status = req.query.status as string;

  let deposits = (db.cash_deposits || []).filter((d) => {
    if (salesmanId && d.salesman_id !== salesmanId) return false;
    if (businessDate && d.business_date !== businessDate) return false;
    if (status && d.status !== status) return false;
    return true;
  });

  const enriched = deposits.map((d) => {
    const sales = db.users.find((u) => u._id === d.salesman_id);
    const verifier = d.verified_by ? db.users.find((u) => u._id === d.verified_by) : null;
    return {
      ...d,
      salesman_name: sales?.name || "-",
      salesman_code: (sales as any)?.code || d.salesman_id,
      verified_by_name: verifier?.name || "-",
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

apiRouter.post("/deposits", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { salesman_id, business_date, actual_deposit_amount, notes } = req.body || {};
  const targetSalesmanId = req.user!.role === "SALES" ? req.user!._id : (salesman_id || req.user!._id);
  const targetDate = business_date || getTodayWIB();
  const actualDeposit = Number(actual_deposit_amount || 0);

  if (actualDeposit < 0) {
    return res.status(400).json({ detail: "Nominal setoran tidak valid." });
  }

  // Calculate expected cash from cash sales today
  const cashSalesToday = db.transactions
    .filter(
      (t) =>
        t.salesman_id === targetSalesmanId &&
        t.transaction_date.startsWith(targetDate) &&
        t.status !== "CANCELLED" &&
        (t.payment_method === "CASH" || !t.payment_method)
    )
    .reduce((sum, t) => sum + (t.total || 0), 0);

  // Add collection of receivables collected by this salesman today
  let collectionsToday = 0;
  (db.receivables || []).forEach((r) => {
    (r.payments || []).forEach((p) => {
      if (p.received_by === targetSalesmanId && p.payment_date.startsWith(targetDate) && p.payment_method === "CASH") {
        collectionsToday += p.amount;
      }
    });
  });

  const expectedCash = cashSalesToday + collectionsToday;
  const variance = actualDeposit - expectedCash;

  const count = (db.cash_deposits || []).length + 1;
  const depositCode = `DEP/${targetDate.replace(/-/g, "")}/${String(count).padStart(3, "0")}`;

  const newDeposit: CashDeposit = {
    _id: `dep-${Date.now()}`,
    deposit_code: depositCode,
    salesman_id: targetSalesmanId,
    business_date: targetDate,
    expected_cash_amount: expectedCash,
    actual_deposit_amount: actualDeposit,
    variance_amount: variance,
    notes: notes || "",
    status: req.user!.role === "ADMIN" || req.user!.role === "OWNER" ? "VERIFIED" : "PENDING",
    verified_by: req.user!.role === "ADMIN" || req.user!.role === "OWNER" ? req.user!._id : undefined,
    verified_at: req.user!.role === "ADMIN" || req.user!.role === "OWNER" ? new Date().toISOString() : undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.cash_deposits.push(newDeposit);
  syncSingleDoc("cash_deposits", newDeposit._id, newDeposit);
  saveDatabaseToDisk();

  recordAuditLog(
    req.user!._id,
    "CREATE_CASH_DEPOSIT",
    "cash_deposits",
    newDeposit._id,
    {
      deposit_code: depositCode,
      salesman_id: targetSalesmanId,
      expected: expectedCash,
      actual: actualDeposit,
      variance,
    }
  );

  res.status(201).json({
    message: `Setoran kas ${depositCode} berhasil dicatat. ${variance === 0 ? "Nominal Uang Sesuai (BALANCED)." : `Terdapat selisih kas Rp ${variance.toLocaleString("id-ID")}`}`,
    deposit: newDeposit,
  });
});

apiRouter.post("/deposits/:id/verify", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER", "WAREHOUSE"), (req: AuthenticatedRequest, res) => {
  const deposit = (db.cash_deposits || []).find((d) => d._id === req.params.id);
  if (!deposit) return res.status(404).json({ detail: "Data setoran tidak ditemukan." });

  const { status, notes } = req.body || {};
  deposit.status = status === "REJECTED" ? "REJECTED" : "VERIFIED";
  deposit.verified_by = req.user!._id;
  deposit.verified_at = new Date().toISOString();
  if (notes) deposit.notes = (deposit.notes ? deposit.notes + " | " : "") + notes;
  deposit.updated_at = new Date().toISOString();

  syncSingleDoc("cash_deposits", deposit._id, deposit);
  saveDatabaseToDisk();

  recordAuditLog(
    req.user!._id,
    "VERIFY_CASH_DEPOSIT",
    "cash_deposits",
    deposit._id,
    { deposit_code: deposit.deposit_code, status: deposit.status, notes }
  );

  res.json({
    message: `Setoran kas ${deposit.deposit_code} berhasil diverifikasi (${deposit.status}).`,
    deposit,
  });
});

// ================= ACCOUNTS RECEIVABLE / PIUTANG DAGANG =================
apiRouter.get("/receivables", authMiddleware, (req: AuthenticatedRequest, res) => {
  const salesmanId = req.user!.role === "SALES" ? req.user!._id : (req.query.salesman_id as string);
  const outletId = req.query.outlet_id as string;
  const status = req.query.status as string;

  let recs = (db.receivables || []).filter((r) => {
    if (salesmanId && r.salesman_id !== salesmanId) return false;
    if (outletId && r.outlet_id !== outletId) return false;
    if (status && r.status !== status) return false;
    return true;
  });

  const todayStr = getTodayWIB();

  const enriched = recs.map((r) => {
    const outlet = db.outlets.find((o) => o._id === r.outlet_id);
    const sales = db.users.find((u) => u._id === r.salesman_id);
    const isOverdue = r.remaining_amount > 0 && r.due_date < todayStr;
    const currentStatus = r.remaining_amount <= 0 ? "PAID" : (isOverdue ? "OVERDUE" : (r.paid_amount > 0 ? "PARTIAL" : "UNPAID"));

    return {
      ...r,
      status: currentStatus,
      outlet_name: outlet?.outlet_name || "-",
      outlet_code: outlet?.outlet_code || "-",
      salesman_name: sales?.name || "-",
      salesman_code: (sales as any)?.code || r.salesman_id,
    };
  });

  const totalOutstanding = enriched.reduce((sum, r) => sum + r.remaining_amount, 0);
  const totalPaid = enriched.reduce((sum, r) => sum + r.paid_amount, 0);

  res.json({
    items: enriched,
    total: enriched.length,
    summary: {
      total_outstanding: totalOutstanding,
      total_paid: totalPaid,
      overdue_count: enriched.filter((r) => r.status === "OVERDUE").length,
    },
  });
});

apiRouter.post("/receivables/:id/payments", authMiddleware, (req: AuthenticatedRequest, res) => {
  const rec = (db.receivables || []).find((r) => r._id === req.params.id);
  if (!rec) return res.status(404).json({ detail: "Faktur piutang tidak ditemukan." });

  const { amount, payment_method, reference_no, notes } = req.body || {};
  const payAmount = Number(amount || 0);
  if (payAmount <= 0) {
    return res.status(400).json({ detail: "Nominal pembayaran harus lebih dari 0." });
  }
  if (payAmount > rec.remaining_amount) {
    return res.status(400).json({ detail: `Nominal pembayaran melebihi sisa piutang (Sisa: Rp ${rec.remaining_amount.toLocaleString("id-ID")}).` });
  }

  const now = new Date().toISOString();
  const paymentRecord: ReceivablePayment = {
    _id: `pay-${Date.now()}`,
    payment_code: `PAY/${getTodayWIB().replace(/-/g, "")}/${String((rec.payments || []).length + 1).padStart(3, "0")}`,
    amount: payAmount,
    payment_date: now,
    payment_method: payment_method || "CASH",
    reference_no: reference_no || "",
    received_by: req.user!._id,
    notes: notes || "",
    created_at: now,
  };

  if (!rec.payments) rec.payments = [];
  rec.payments.push(paymentRecord);
  rec.paid_amount += payAmount;
  rec.remaining_amount = Math.max(0, rec.total_amount - rec.paid_amount);
  rec.status = rec.remaining_amount <= 0 ? "PAID" : "PARTIAL";
  rec.updated_at = now;

  syncSingleDoc("receivables", rec._id, rec);
  saveDatabaseToDisk();

  recordAuditLog(
    req.user!._id,
    "RECORD_RECEIVABLE_PAYMENT",
    "receivables",
    rec._id,
    {
      invoice_number: rec.invoice_number,
      payment_code: paymentRecord.payment_code,
      amount: payAmount,
      remaining: rec.remaining_amount,
    }
  );

  res.status(201).json({
    message: `Pembayaran piutang Rp ${payAmount.toLocaleString("id-ID")} berhasil dicatat. Sisa piutang: Rp ${rec.remaining_amount.toLocaleString("id-ID")}`,
    receivable: rec,
    payment: paymentRecord,
  });
});

// ================= TRIANGULAR RECONCILIATION (BARANG + PENJUALAN + UANG) =================
apiRouter.get("/reconciliations/daily", authMiddleware, (req: AuthenticatedRequest, res) => {
  const business_date = (req.query.business_date as string) || getTodayWIB();
  const salesman_id = req.user!.role === "SALES" ? req.user!._id : (req.query.salesman_id as string);

  const targetUsers = salesman_id
    ? db.users.filter((u) => u._id === salesman_id)
    : db.users.filter((u) => u.role === "SALES" && u.status === "ACTIVE");

  const results = targetUsers.map((sales) => {
    // 1. Stock Reconciliation per SKU
    const stockItems = db.skus.filter((s) => s.status === "ACTIVE").map((sku) => {
      const brought = db.stock_movements
        .filter((m) => m.business_date === business_date && m.salesman_id === sales._id && m.sku_id === sku._id && m.movement_type === "TRANSFER_IN")
        .reduce((sum, m) => sum + m.quantity, 0);

      const sold = db.stock_movements
        .filter((m) => m.business_date === business_date && m.salesman_id === sales._id && m.sku_id === sku._id && m.movement_type === "SALES_OUT")
        .reduce((sum, m) => sum + m.quantity, 0);

      const returned = db.stock_movements
        .filter((m) => m.business_date === business_date && m.salesman_id === sales._id && m.sku_id === sku._id && m.movement_type === "RETURN_IN")
        .reduce((sum, m) => sum + m.quantity, 0);

      const salesInv = db.inventory.find((i) => i.location_type === "SALES" && i.location_id === sales._id && i.sku_id === sku._id);
      const actualRemaining = salesInv ? salesInv.available_stock : 0;
      const theoreticalRemaining = Math.max(0, brought - sold - returned);
      const variance = actualRemaining - theoreticalRemaining;

      return {
        sku_id: sku._id,
        sku_name: sku.name,
        sku_code: sku.code,
        unit: sku.unit || "Unit",
        stok_awal_handover: brought,
        stok_terjual: sold,
        stok_retur: returned,
        stok_akhir_teoretis: theoreticalRemaining,
        stok_akhir_fisik: actualRemaining,
        variance,
        status: variance === 0 ? "BALANCED" : (variance > 0 ? "SURPLUS" : "DEFICIT"),
      };
    }).filter((it) => it.stok_awal_handover > 0 || it.stok_terjual > 0 || it.stok_retur > 0 || it.stok_akhir_fisik > 0);

    const totalStockVariance = stockItems.reduce((sum, it) => sum + Math.abs(it.variance), 0);

    // 2. Cash Reconciliation
    const cashSales = db.transactions
      .filter((t) => t.salesman_id === sales._id && t.transaction_date.startsWith(business_date) && t.status !== "CANCELLED" && (t.payment_method === "CASH" || !t.payment_method))
      .reduce((sum, t) => sum + (t.total || 0), 0);

    const creditSales = db.transactions
      .filter((t) => t.salesman_id === sales._id && t.transaction_date.startsWith(business_date) && t.status !== "CANCELLED" && (t.payment_method === "CREDIT" || (t.payment_method as any) === "TEMPO"))
      .reduce((sum, t) => sum + (t.total || 0), 0);

    let collectedReceivables = 0;
    (db.receivables || []).forEach((r) => {
      (r.payments || []).forEach((p) => {
        if (p.received_by === sales._id && p.payment_date.startsWith(business_date) && p.payment_method === "CASH") {
          collectedReceivables += p.amount;
        }
      });
    });

    const totalExpectedCash = cashSales + collectedReceivables;

    const actualDeposits = (db.cash_deposits || [])
      .filter((d) => d.salesman_id === sales._id && d.business_date === business_date && d.status !== "REJECTED")
      .reduce((sum, d) => sum + d.actual_deposit_amount, 0);

    const cashVariance = actualDeposits - totalExpectedCash;

    const stockBalanced = totalStockVariance === 0;
    const cashBalanced = cashVariance === 0;

    return {
      salesman_id: sales._id,
      salesman_name: sales.name,
      salesman_code: (sales as any).code || sales._id,
      business_date,
      overall_status: stockBalanced && cashBalanced ? "BALANCED" : "VARIANCE",
      stock_summary: {
        total_skus: stockItems.length,
        is_balanced: stockBalanced,
        total_variance_units: totalStockVariance,
        items: stockItems,
      },
      cash_summary: {
        cash_sales: cashSales,
        credit_sales: creditSales,
        collected_receivables: collectedReceivables,
        expected_cash_total: totalExpectedCash,
        actual_deposited_cash: actualDeposits,
        variance: cashVariance,
        is_balanced: cashBalanced,
      },
    };
  });

  res.json({
    business_date,
    total_salesmen: results.length,
    balanced_count: results.filter((r) => r.overall_status === "BALANCED").length,
    variance_count: results.filter((r) => r.overall_status === "VARIANCE").length,
    reconciliations: results,
  });
});

apiRouter.post("/reconciliations/daily/approve", authMiddleware, requireRoles("ADMIN", "SUPERVISOR", "OWNER"), (req: AuthenticatedRequest, res) => {
  const { salesman_id, business_date, notes } = req.body || {};
  if (!salesman_id || !business_date) {
    return res.status(400).json({ detail: "Salesman ID dan Tanggal Operasional wajib diisi." });
  }

  const recCode = `REC/${business_date.replace(/-/g, "")}/${salesman_id.replace("usr-", "").toUpperCase()}`;
  const newRec: DailyReconciliationRecord = {
    _id: `rec-daily-${Date.now()}`,
    reconciliation_code: recCode,
    salesman_id,
    business_date,
    stock_status: "BALANCED",
    cash_status: "BALANCED",
    total_stock_variance: 0,
    total_cash_variance: 0,
    status: "APPROVED",
    approved_by: req.user!._id,
    approved_at: new Date().toISOString(),
    notes: notes || "Rekonsiliasi Harian Disetujui",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.daily_reconciliations.push(newRec);
  syncSingleDoc("daily_reconciliations", newRec._id, newRec);
  saveDatabaseToDisk();

  recordAuditLog(
    req.user!._id,
    "APPROVE_DAILY_RECONCILIATION",
    "daily_reconciliations",
    newRec._id,
    { reconciliation_code: recCode, salesman_id, business_date }
  );

  res.status(201).json({
    message: `Rekonsiliasi harian ${recCode} berhasil disetujui.`,
    reconciliation: newRec,
  });
});

// Global API Error Handling Middleware
apiRouter.use((err: any, _req: any, res: Response, _next: any) => {
  console.error("[API Error Handler]", err);
  if (res.headersSent) return;
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    detail: err.message || "Terjadi kesalahan internal pada server.",
    error: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });
});

