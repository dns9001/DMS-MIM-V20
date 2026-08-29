import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
export const db = firestore;
export const auth = getAuth(app);
export const storage = getStorage(app);

export default app;
