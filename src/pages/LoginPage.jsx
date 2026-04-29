import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { login, userRole, authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && userRole) {
      navigate(from || (userRole === "admin" ? "/admin" : "/frontdesk"), { replace: true });
    }
  }, [authLoading, from, navigate, userRole]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(getErrorMessage(err?.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Veli Toplantısı</h1>
        <p style={styles.subtitle}>Personel Girişi</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            E-posta
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Şifre
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              style={styles.input}
            />
          </label>

          {error ? <p style={styles.error}>{error}</p> : null}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
          </button>
        </form>

        <p style={styles.parentNote}>
          Veli misiniz? <Link to="/parent" style={styles.link}>Toplantı kodunuzu girin</Link>
        </p>
      </div>
    </div>
  );
}

function getErrorMessage(code) {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "E-posta veya şifre hatalı.";
    case "auth/too-many-requests":
      return "Çok fazla deneme. Lütfen bir süre bekleyin.";
    default:
      return "Giriş yapılırken bir hata oluştu.";
  }
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(180deg, #f8f3eb 0%, #f3eee5 100%)",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 24,
    boxShadow: "0 20px 60px rgba(52, 38, 16, 0.10)",
    padding: 28,
    fontFamily: "system-ui, sans-serif",
  },
  title: { margin: 0, fontSize: 30, color: "#1f2937" },
  subtitle: { marginTop: 6, marginBottom: 20, color: "#6b7280" },
  form: { display: "grid", gap: 14 },
  label: { display: "grid", gap: 6, fontSize: 14, fontWeight: 600, color: "#374151" },
  input: {
    padding: "0.8rem 0.9rem",
    borderRadius: 12,
    border: "1px solid #d6d3d1",
    fontSize: 16,
    outline: "none",
  },
  button: {
    marginTop: 4,
    padding: "0.85rem 1rem",
    borderRadius: 12,
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  error: { margin: 0, color: "#b91c1c", fontSize: 14 },
  parentNote: { marginTop: 18, marginBottom: 0, color: "#6b7280", fontSize: 14 },
  link: { color: "#1d4ed8", textDecoration: "none", fontWeight: 700 },
};
