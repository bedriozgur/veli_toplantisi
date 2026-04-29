import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db, doc, getDoc, isFirebaseConfigured } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userRole, setUserRole] = useState(null);
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

  const logout = useCallback(async () => {
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
    login,
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
