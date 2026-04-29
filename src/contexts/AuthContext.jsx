import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db, doc, getDoc, isFirebaseConfigured } from "../firebase";

const AuthContext = createContext(null);
const DEMO_STORAGE_KEY = "veli_toplantisi_demo_user";

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
      setUserProfile(null);
      setUserRole(null);
      if (auth) {
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
    return signInWithEmailAndPassword(auth, email, password);
  }, []);

  const loginAsDemo = useCallback(async (role = "admin") => {
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
