import { initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";

let dbInstance = null;
const PUBLIC_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAh_NW992P4NEq6k8PUwBnNm7FdUa3JPTs",
  authDomain: "veli-toplantisi.firebaseapp.com",
  projectId: "veli-toplantisi",
  appId: "1:654002086861:web:6d1c82d5e4495e04971a84",
};

function getConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || PUBLIC_FIREBASE_CONFIG.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || PUBLIC_FIREBASE_CONFIG.authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || PUBLIC_FIREBASE_CONFIG.projectId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || PUBLIC_FIREBASE_CONFIG.appId,
  };
}

export function isCloudConfigured() {
  const config = getConfig();
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function getDb() {
  if (dbInstance) return dbInstance;
  if (!isCloudConfigured()) {
    throw new Error("Firebase is not configured.");
  }
  dbInstance = getFirestore(initializeApp(getConfig()));
  return dbInstance;
}

export async function publishEvent(eventCode, payload) {
  const db = getDb();
  await setDoc(
    doc(db, "events", eventCode),
    {
      ...payload,
      eventCode,
      eventStatus: payload.eventStatus || "published",
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function loadEvent(eventCode) {
  const db = getDb();
  const snapshot = await getDoc(doc(db, "events", eventCode));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveProgress(eventCode, studentId, meetings) {
  const db = getDb();
  await setDoc(
    doc(db, "events", eventCode, "progress", String(studentId)),
    {
      meetings,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function loadProgress(eventCode, studentId) {
  const db = getDb();
  const snapshot = await getDoc(doc(db, "events", eventCode, "progress", String(studentId)));
  return snapshot.exists() ? snapshot.data()?.meetings || null : null;
}
