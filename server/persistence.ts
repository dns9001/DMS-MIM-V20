import { db } from "./data.js";
import { syncDocToPostgres, deleteDocFromPostgres } from "./cloudsqlSync.js";

let isRestoring = false;
let lastSyncTimestamp: string | null = null;
let lastSyncStatus: "SUCCESS" | "SYNCING" | "ERROR" | "IDLE" = "SUCCESS";
let lastSyncError: string | null = null;

export const ALL_SYNC_COLLECTIONS: Array<{ key: keyof typeof db; colName: string }> = [
  { key: "users", colName: "users" }, { key: "offices", colName: "offices" },
  { key: "provinces", colName: "provinces" }, { key: "regencies", colName: "regencies" },
  { key: "districts", colName: "districts" }, { key: "villages", colName: "villages" },
  { key: "areas", colName: "areas" }, { key: "channels", colName: "channels" },
  { key: "routes", colName: "routes" }, { key: "products", colName: "products" },
  { key: "skus", colName: "skus" }, { key: "prices", colName: "prices" },
  { key: "promos", colName: "promos" }, { key: "salesmen", colName: "salesmen" },
  { key: "open_call_reasons", colName: "open_call_reasons" }, { key: "outlets", colName: "outlets" },
  { key: "sales_outlets", colName: "sales_outlets" }, { key: "call_plans", colName: "call_plans" },
  { key: "call_plan_items", colName: "call_plan_items" }, { key: "attendance", colName: "attendance" },
  { key: "visits", colName: "visits" }, { key: "transactions", colName: "transactions" },
  { key: "inventory", colName: "inventory" }, { key: "stock_movements", colName: "stock_movements" },
  { key: "stock_handovers", colName: "stock_handovers" }, { key: "stock_returns", colName: "stock_returns" },
  { key: "stock_receivings", colName: "stock_receivings" }, { key: "sales_stock_ledgers", colName: "sales_stock_ledgers" },
  { key: "targets", colName: "targets" }, { key: "cash_deposits", colName: "cash_deposits" },
  { key: "receivables", colName: "receivables" }, { key: "daily_reconciliations", colName: "daily_reconciliations" },
  { key: "audit_logs", colName: "audit_logs" }, { key: "gps_events", colName: "gps_events" },
];

export function getSyncStats() {
  const collectionCounts: Record<string, number> = {};
  for (const { key, colName } of ALL_SYNC_COLLECTIONS) {
    const arr = (db as any)[key];
    collectionCounts[colName] = Array.isArray(arr) ? arr.length : 0;
  }
  return {
    databaseEngine: "Google Cloud SQL (PostgreSQL)",
    isCloudConnected: !!process.env.SQL_HOST && !!process.env.SQL_USER,
    isFirestoreReady: false,
    isQuotaPaused: false,
    lastSyncTimestamp,
    lastSyncStatus,
    lastSyncError,
    pendingDirtyDocs: 0,
    totalCollections: ALL_SYNC_COLLECTIONS.length,
    totalRecords: Object.values(collectionCounts).reduce((a, b) => a + b, 0),
    collectionCounts,
  };
}

// PostgreSQL is the startup source. Firestore is no longer loaded into the operational cache.
export async function loadAllFromFirestore(_inMemoryDb: any): Promise<boolean> {
  return false;
}

/** PostgreSQL persistence is completed before the caller receives success. */
export async function syncSingleDoc(colName: string, docId: string, data: any): Promise<boolean> {
  if (isRestoring || !docId) return false;
  lastSyncStatus = "SYNCING";
  lastSyncError = null;
  try {
    const pgSuccess = await syncDocToPostgres(colName, String(docId), data);
    if (!pgSuccess) {
      lastSyncStatus = "ERROR";
      lastSyncError = "PostgreSQL persistence failed";
    }

    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = pgSuccess ? "SUCCESS" : "ERROR";
    return pgSuccess;
  } catch (err: any) {
    lastSyncStatus = "ERROR";
    lastSyncError = err?.message || String(err);
    return false;
  }
}

export async function deleteSingleDoc(colName: string, docId: string): Promise<boolean> {
  if (isRestoring || !docId) return false;
  lastSyncStatus = "SYNCING";
  try {
    const pgSuccess = await deleteDocFromPostgres(colName, String(docId));
    if (!pgSuccess) {
      lastSyncStatus = "ERROR";
      lastSyncError = "PostgreSQL deletion failed";
    }
    
    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = pgSuccess ? "SUCCESS" : "ERROR";
    return pgSuccess;
  } catch (err: any) {
    lastSyncStatus = "ERROR";
    lastSyncError = err?.message || String(err);
    return false;
  }
}

export async function syncToFirestore(_forceAll = false, _skipCache = false): Promise<void> {
  // Legacy stub - Firestore is no longer the primary database
  console.log("syncToFirestore stub called - operations now handled by Cloud SQL.");
}

export async function purgeAllFirestoreData(): Promise<{ success: boolean; message: string; deletedCount: number }> {
  console.log("purgeAllFirestoreData stub called - operations now handled by Cloud SQL.");
  return { success: true, message: "Firestore is no longer the primary data store.", deletedCount: 0 };
}
