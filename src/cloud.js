import { initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";

let dbInstance = null;

function getConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
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
