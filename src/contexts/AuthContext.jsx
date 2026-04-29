import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, db, doc, getDoc, isFirebaseConfigured, setDemoStoreForced } from "../firebase";
import { hasFullSchoolSeed, seedDemoSchoolData } from "../services/demoSeed";
import { setDoc } from "firebase/firestore";

const AuthContext = createContext(null);
const DEMO_STORAGE_KEY = "veli_toplantisi_demo_user";
const TEMP_ACCOUNTS = {
  admin: { email: "admin@veli-toplantisi.local", password: "password", role: "admin" },
  frontdesk: { email: "staff@veli-toplantisi.local", password: "password", role: "frontdesk" },
};

function loadDemoUser() {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDemoUser(user) {
  try {
    if (!user) {
      localStorage.removeItem(DEMO_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(user));
  } catch {}
}

function roleFromEmail(email) {
  const value = String(email || "").toLowerCase();
  if (value === TEMP_ACCOUNTS.admin.email) return TEMP_ACCOUNTS.admin.role;
  if (value === TEMP_ACCOUNTS.frontdesk.email) return TEMP_ACCOUNTS.frontdesk.role;
  return null;
}

function tempAccountForLogin(email, password) {
  const username = String(email || "").trim().toLowerCase();
  const secret = String(password || "").trim();
  if (secret !== TEMP_ACCOUNTS.admin.password) return null;
  if (username === "admin") return TEMP_ACCOUNTS.admin;
  if (username === "staff" || username === "frontdesk") return TEMP_ACCOUNTS.frontdesk;
  return null;
}

export function AuthProvider({ children }) {
  const demoUser = !isFirebaseConfigured ? loadDemoUser() : null;
  const [currentUser, setCurrentUser] = useState(demoUser);
  const [userProfile, setUserProfile] = useState(demoUser);
  const [userRole, setUserRole] = useState(demoUser?.role || null);
  const [authLoading, setAuthLoading] = useState(true);

  const fetchUserProfile = useCallback(async (firebaseUser) => {
    if (!firebaseUser || !db) {
      setUserProfile(null);
      setUserRole(null);
      return;
    }

    const snap = await getDoc(doc(db, "users", firebaseUser.uid));
    if (!snap.exists()) {
      const fallbackRole = roleFromEmail(firebaseUser.email);
      setUserProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email || "",
        displayName: firebaseUser.displayName || "",
        role: fallbackRole,
      });
      setUserRole(fallbackRole);
      if (!fallbackRole && auth) {
        await signOut(auth);
      }
      return;
    }

    const data = snap.data();
    setUserProfile(data);
    setUserRole(data.role || null);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setDemoStoreForced(true);
      if (!hasFullSchoolSeed()) {
        seedDemoSchoolData({ replace: true });
      }
      const existing = loadDemoUser();
      setCurrentUser(existing);
      setUserProfile(existing);
      setUserRole(existing?.role || null);
      setAuthLoading(false);
      return undefined;
    }

    if (!auth) {
      setAuthLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, async (firebaseUser) => {
      setCurrentUser(firebaseUser);
      await fetchUserProfile(firebaseUser);
      setAuthLoading(false);
    });
  }, [fetchUserProfile]);

  const login = useCallback(async (email, password) => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error("Firebase configuration is missing.");
    }
    const tempAccount = tempAccountForLogin(email, password);
    if (tempAccount) {
      setDemoStoreForced(true);
      let credential;
      try {
        credential = await signInWithEmailAndPassword(auth, tempAccount.email, tempAccount.password);
      } catch (err) {
        if (err?.code !== "auth/user-not-found" && err?.code !== "auth/invalid-credential") {
          throw err;
        }
        credential = await createUserWithEmailAndPassword(auth, tempAccount.email, tempAccount.password);
      }

      if (credential?.user) {
        await setDoc(
          doc(db, "users", credential.user.uid),
          {
            email: credential.user.email || tempAccount.email,
            displayName: tempAccount.role === "admin" ? "Local Admin" : "Local Front Desk",
            role: tempAccount.role,
            temp: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
      return credential;
    }
    setDemoStoreForced(false);
    return signInWithEmailAndPassword(auth, email, password);
  }, []);

  const loginAsDemo = useCallback(async (role = "admin") => {
    setDemoStoreForced(true);
    const normalizedRole = role === "frontdesk" ? "frontdesk" : "admin";
    const demo = {
      uid: `demo-${normalizedRole}`,
      email: `${normalizedRole}@local`,
      displayName: normalizedRole === "admin" ? "Local Admin" : "Local Front Desk",
      role: normalizedRole,
      demo: true,
    };
    saveDemoUser(demo);
    setCurrentUser(demo);
    setUserProfile(demo);
    setUserRole(normalizedRole);
  }, []);

  const logout = useCallback(async () => {
    setDemoStoreForced(false);
    if (!isFirebaseConfigured || !auth) {
      saveDemoUser(null);
      setCurrentUser(null);
      setUserProfile(null);
      setUserRole(null);
      return;
    }

    if (auth) {
      await signOut(auth);
    }
  }, []);

  const value = {
    currentUser,
    userProfile,
    userRole,
    authLoading,
    isAdmin: userRole === "admin",
    isFrontDesk: userRole === "frontdesk" || userRole === "admin",
    isDemoMode: !isFirebaseConfigured,
    login,
    loginAsDemo,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
