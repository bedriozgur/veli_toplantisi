import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  increment,
  Timestamp,
} from "firebase/firestore";

const PUBLIC_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAh_NW992P4NEq6k8PUwBnNm7FdUa3JPTs",
  authDomain: "veli-toplantisi.firebaseapp.com",
  projectId: "veli-toplantisi",
  appId: "1:654002086861:web:6d1c82d5e4495e04971a84",
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || PUBLIC_FIREBASE_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || PUBLIC_FIREBASE_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || PUBLIC_FIREBASE_CONFIG.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || PUBLIC_FIREBASE_CONFIG.appId,
};

const DEMO_STORE_FLAG = "veli_toplantisi_force_demo_store";

function hasRequiredConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

let app = null;
if (hasRequiredConfig()) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const isFirebaseConfigured = hasRequiredConfig();
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export function isDemoStoreForced() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(DEMO_STORE_FLAG) === "1";
  } catch {
    return false;
  }
}

export function setDemoStoreForced(forced) {
  try {
    if (typeof window === "undefined") return;
    if (forced) {
      window.localStorage.setItem(DEMO_STORE_FLAG, "1");
    } else {
      window.localStorage.removeItem(DEMO_STORE_FLAG);
    }
  } catch {}
}

export {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  increment,
  Timestamp,
};

export default app;
