import React from "react";
import { Link } from "react-router-dom";

export default function UnauthorizedPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Erişim Yetkiniz Yok</h1>
        <p style={styles.text}>Bu sayfayı görüntüleme yetkiniz bulunmuyor.</p>
        <Link to="/login" style={styles.link}>Giriş sayfasına dön</Link>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f6f1e8",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 28,
    borderRadius: 20,
    background: "#fff",
    boxShadow: "0 16px 50px rgba(0,0,0,0.08)",
    fontFamily: "system-ui, sans-serif",
  },
  title: { margin: 0, fontSize: 28 },
  text: { color: "#555", lineHeight: 1.5 },
  link: { color: "#1d4ed8", textDecoration: "none", fontWeight: 700 },
};
