import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";

function LoadingScreen() {
  const { t } = useLanguage();
  return (
    <div style={styles.wrap}>
      <div style={styles.card}>{t("app.loading")}</div>
    </div>
  );
}

export function RequireAuth({ children }) {
  const { currentUser, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) return <LoadingScreen />;
  if (!currentUser) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export function RequireAdmin({ children }) {
  const { currentUser, isAdmin, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) return <LoadingScreen />;
  if (!currentUser) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isAdmin) return <Navigate to="/unauthorized" replace />;
  return children;
}

export function RequireFrontDesk({ children }) {
  const { currentUser, isFrontDesk, authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) return <LoadingScreen />;
  if (!currentUser) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isFrontDesk) return <Navigate to="/unauthorized" replace />;
  return children;
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f4f1ea",
    color: "#2b2b2b",
  },
  card: {
    padding: "1rem 1.25rem",
    borderRadius: 12,
    background: "#fff",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    fontFamily: "system-ui, sans-serif",
  },
};
