import { db, saveDatabaseToDisk } from "./data.js";
import { getFirestoreDB } from "./firebase.js";
import { doc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import { syncDocToPostgres, deleteDocFromPostgres } from "./cloudsqlSync.js";

let isRestoring = false;
let lastSyncTimestamp: string | null = null;
let lastSyncStatus: "SUCCESS" | "SYNCING" | "ERROR" | "IDLE" = "SUCCESS";
let lastSyncError: string | null = null;

export const ALL_SYNC_COLLECTIONS: Array<{ key: keyof typeof db; colName: string }> = [
  { key: "users", colName: "users" },
  { key: "offices", colName: "offices" },
  { key: "provinces", colName: "provinces" },
  { key: "regencies", colName: "regencies" },
  { key: "districts", colName: "districts" },
  { key: "villages", colName: "villages" },
  { key: "areas", colName: "areas" },
  { key: "channels", colName: "channels" },
  { key: "routes", colName: "routes" },
  { key: "products", colName: "products" },
  { key: "skus", colName: "skus" },
  { key: "prices", colName: "prices" },
  { key: "promos", colName: "promos" },
  { key: "salesmen", colName: "salesmen" },
  { key: "open_call_reasons", colName: "open_call_reasons" },
  { key: "outlets", colName: "outlets" },
  { key: "sales_outlets", colName: "sales_outlets" },
  { key: "call_plans", colName: "call_plans" },
  { key: "call_plan_items", colName: "call_plan_items" },
  { key: "attendance", colName: "attendance" },
  { key: "visits", colName: "visits" },
  { key: "transactions", colName: "transactions" },
  { key: "inventory", colName: "inventory" },
  { key: "stock_movements", colName: "stock_movements" },
  { key: "stock_handovers", colName: "stock_handovers" },
  { key: "stock_returns", colName: "stock_returns" },
  { key: "stock_receivings", colName: "stock_receivings" },
  { key: "sales_stock_ledgers", colName: "sales_stock_ledgers" },
  { key: "targets", colName: "targets" },
  { key: "cash_deposits", colName: "cash_deposits" },
  { key: "receivables", colName: "receivables" },
  { key: "daily_reconciliations", colName: "daily_reconciliations" },
  { key: "audit_logs", colName: "audit_logs" },
  { key: "gps_events", colName: "gps_events" },
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
    isFirestoreReady: !!getFirestoreDB(),
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

/**
 * Legacy Firestore loader retained for compatibility. PostgreSQL is the
 * authoritative startup source and is loaded by cloudsqlSync.ts.
 */
export async function loadAllFromFirestore(_inMemoryDb: any): Promise<boolean> {
  return false;
}

/**
 * Persist a document to PostgreSQL BEFORE acknowledging the mutation.
 * Firestore is retained only as an optional secondary copy.
 */
export async function syncSingleDoc(colName: string, docId: string, data: any): Promise<boolean> {
  if (isRestoring || !docId) return false;

  lastSyncStatus = "SYNCING";
  lastSyncError = null;

  try {
    const persisted = await syncDocToPostgres(colName, String(docId), data);
    if (!persisted) {
      lastSyncStatus = "ERROR";
      lastSyncError = "PostgreSQL persistence failed";
      return false;
    }

    // Secondary Firestore copy; failure here must not hide a successful
    // PostgreSQL commit.
    try {
      const fdb = getFirestoreDB();
      if (fdb) {
        const sanitized = JSON.parse(JSON.stringify(data));
        await setDoc(doc(fdb, colName, String(docId)), sanitized, { merge: true });
      }
    } catch (err: any) {
      if (process.env.DEBUG_SYNC) console.warn(`[Firestore secondary sync ${colName}/${docId}]:`, err?.message);
    }

    // Local JSON is backup/debug only, never the source of truth.
    saveDatabaseToDisk();
    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = "SUCCESS";
    return true;
  } catch (err: any) {
    lastSyncStatus = "ERROR";
    lastSyncError = err?.message || String(err);
    return false;
  }
}

export async function deleteSingleDoc(colName: string, docId: string): Promise<boolean> {
  if (isRestoring || !docId) return false;

  lastSyncStatus = "SYNCING";
  lastSyncError = null;

  try {
    const deleted = await deleteDocFromPostgres(colName, String(docId));
    if (!deleted) {
      lastSyncStatus = "ERROR";
      lastSyncError = "PostgreSQL deletion failed";
      return false;
    }

    try {
      const fdb = getFirestoreDB();
      if (fdb) await deleteDoc(doc(fdb, colName, String(docId)));
    } catch (err: any) {
      if (process.env.DEBUG_SYNC) console.warn(`[Firestore secondary delete ${colName}/${docId}]:`, err?.message);
    }

    saveDatabaseToDisk();
    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = "SUCCESS";
    return true;
  } catch (err: any) {
    lastSyncStatus = "ERROR";
    lastSyncError = err?.message || String(err);
    return false;
  }
}

/**
 * One-time migration utility. It copies the current in-memory snapshot into
 * PostgreSQL inside one transaction; normal mutations must use syncSingleDoc.
 */
export async function migrateAllToCloudSql(): Promise<{ success: boolean; totalRecords: number; collectionCounts: Record<string, number>; message: string }> {
  const { migrateSnapshotToPostgres } = await import("./cloudsqlSync.js");
  return migrateSnapshotToPostgres();
}
