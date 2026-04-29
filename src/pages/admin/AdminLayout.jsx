import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import LanguageToggle from "../../components/LanguageToggle";
import { useLanguage } from "../../contexts/LanguageContext";

export default function AdminLayout() {
  const { logout, userProfile } = useAuth();
  const { t } = useLanguage();

  return (
    <div style={styles.shell}>
      <LanguageToggle />
      <aside style={styles.sidebar}>
        <div>
          <h1 style={styles.brand}>{t("admin.dashboard")}</h1>
          <p style={styles.meta}>{userProfile?.displayName || t("admin.adminLabel")}</p>
        </div>

        <nav style={styles.nav}>
          <NavLink to="/admin" style={navStyle}>{t("admin.dashboard")}</NavLink>
          <NavLink to="/admin/meetings" style={navStyle}>{t("admin.meetings")}</NavLink>
          <NavLink to="/admin/users" style={navStyle}>{t("admin.users")}</NavLink>
        </nav>

        <button onClick={logout} style={styles.logout}>{t("admin.logout")}</button>
      </aside>

      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

function navStyle({ isActive }) {
  return {
    ...styles.navLink,
    background: isActive ? "rgba(255,255,255,0.16)" : "transparent",
    boxShadow: isActive ? "inset 0 0 0 1px rgba(255,255,255,0.12)" : "none",
  };
}

const styles = {
  shell: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "260px 1fr",
    background: "linear-gradient(180deg, #f8f3eb 0%, #f4eee4 100%)",
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: 24,
    background: "linear-gradient(180deg, #111827 0%, #1f2937 100%)",
    color: "#fff",
    boxShadow: "4px 0 24px rgba(15, 23, 42, 0.12)",
  },
  brand: { margin: 0, fontSize: 24, letterSpacing: "-0.02em" },
  meta: { opacity: 0.72, marginTop: 6, lineHeight: 1.4 },
  nav: { display: "grid", gap: 10, marginTop: 24 },
  navLink: {
    color: "#fff",
    textDecoration: "none",
    padding: "0.8rem 0.95rem",
    borderRadius: 14,
    transition: "background 120ms ease, box-shadow 120ms ease",
  },
  logout: {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "transparent",
    color: "#fff",
    padding: "0.85rem 0.95rem",
    borderRadius: 14,
    cursor: "pointer",
  },
  main: { padding: 28, maxWidth: 1280, width: "100%" },
};
