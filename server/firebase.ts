import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore, Firestore, setLogLevel } from "firebase/firestore";
import fs from "fs";
import path from "path";

// Silence verbose internal gRPC retry logs when free daily write limits are reached
try {
  setLogLevel("silent");
} catch {
  // ignore
}

let firestoreInstance: Firestore | null = null;

export function getFirestoreDB(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;

  try {
    const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const app = getApps().length === 0 ? initializeApp(config) : getApp();

    try {
      // In Node.js / container environment, long polling mode ensures instant and reliable connection
      firestoreInstance = initializeFirestore(
        app,
        {
          experimentalLongPollingOptions: { timeoutSeconds: 30 },
        },
        config.firestoreDatabaseId || "(default)"
      );
    } catch {
      firestoreInstance = getFirestore(app, config.firestoreDatabaseId || "(default)");
    }

    return firestoreInstance;
  } catch (err) {
    console.warn("Firestore initialization error in server runtime:", err);
    return null;
  }
}
