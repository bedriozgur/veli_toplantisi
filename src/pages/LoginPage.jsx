import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import LanguageToggle from "../components/LanguageToggle";
import { useLanguage } from "../contexts/LanguageContext";

export default function LoginPage() {
  const { login, loginAsDemo, userRole, authLoading, isDemoMode } = useAuth();
  const { t } = useLanguage();
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
      const tempRole = getTemporaryRole(email, password);
      if (tempRole) {
        await loginAsDemo(tempRole);
        return;
      }

      if (isDemoMode) {
        await loginAsDemo(detectDemoRole(email));
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(getErrorMessage(t, err?.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <LanguageToggle />
      <div style={styles.card}>
        <h1 style={styles.title}>{t("login.title")}</h1>
        <p style={styles.subtitle}>{t("login.subtitle")}</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            {t("login.email")}
            <input
              type="text"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="username"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            {t("login.password")}
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
            {loading ? "..." : isDemoMode ? t("login.demoContinue") : t("login.submit")}
          </button>
        </form>

        {isDemoMode ? (
          <div style={styles.demoBlock}>
            <p style={styles.demoText}>{t("login.demoNote")}</p>
            <p style={styles.demoHint}>{t("login.demoCredentials")}</p>
            <div style={styles.demoButtons}>
              <button type="button" onClick={() => loginAsDemo("admin")} style={styles.demoButton}>
                {t("login.demoAdmin")}
              </button>
              <button type="button" onClick={() => loginAsDemo("frontdesk")} style={styles.demoButtonAlt}>
                {t("login.demoFrontdesk")}
              </button>
            </div>
          </div>
        ) : null}

        <p style={styles.parentNote}>
          {t("login.parentPrompt")} <Link to="/parent" style={styles.link}>{t("app.enterCode")}</Link>
        </p>
      </div>
    </div>
  );
}

function getErrorMessage(t, code) {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return t("login.errorInvalid");
    case "auth/too-many-requests":
      return t("login.errorManyRequests");
    default:
      return t("login.errorGeneric");
  }
}

function detectDemoRole(email) {
  const value = String(email || "").toLowerCase();
  if (value.includes("front")) return "frontdesk";
  return "admin";
}

function getTemporaryRole(email, password) {
  const value = String(email || "").trim().toLowerCase();
  const secret = String(password || "").trim();
  if (secret !== "password") return null;
  if (value === "admin") return "admin";
  if (value === "staff" || value === "frontdesk") return "frontdesk";
  return null;
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
  demoBlock: {
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    background: "#f9fafb",
    display: "grid",
    gap: 12,
  },
  demoText: { margin: 0, color: "#6b7280", fontSize: 14, lineHeight: 1.5 },
  demoHint: { margin: 0, color: "#374151", fontSize: 13, lineHeight: 1.4, fontWeight: 600 },
  demoButtons: { display: "flex", gap: 10, flexWrap: "wrap" },
  demoButton: {
    padding: "0.75rem 0.9rem",
    borderRadius: 12,
    border: "none",
    background: "#111827",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  demoButtonAlt: {
    padding: "0.75rem 0.9rem",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    fontWeight: 700,
    cursor: "pointer",
  },
  parentNote: { marginTop: 18, marginBottom: 0, color: "#6b7280", fontSize: 14 },
  link: { color: "#1d4ed8", textDecoration: "none", fontWeight: 700 },
};
