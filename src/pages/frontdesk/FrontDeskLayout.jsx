import React from "react";
import { Outlet } from "react-router-dom";

export default function FrontDeskLayout() {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.badge}>Front Desk</div>
        <h1 style={styles.title}>Gelen öğrencileri hızlıca yönetin</h1>
        <p style={styles.text}>Sınıf ya da öğrenci adıyla arayın, giriş kaydı yapın.</p>
      </header>
      <Outlet />
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top, #fff8ed 0%, #f6efe4 38%, #efe7da 100%)",
    padding: 28,
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    marginBottom: 20,
    maxWidth: 960,
  },
  badge: {
    display: "inline-flex",
    padding: "0.35rem 0.7rem",
    borderRadius: 999,
    background: "#1f2937",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  title: {
    margin: "10px 0 8px",
    fontSize: 30,
    letterSpacing: "-0.02em",
  },
  text: { margin: 0, color: "#6b7280", lineHeight: 1.5 },
};
