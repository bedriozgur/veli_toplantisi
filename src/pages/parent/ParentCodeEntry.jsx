import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { resolveAccessCode } from "../../services/meetingService";

export default function ParentCodeEntry() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await resolveAccessCode(code);
      if (!result) {
        setError("Kod bulunamadı ya da süresi doldu.");
        return;
      }
      navigate(`/parent/${result.code.toUpperCase()}`, { replace: true });
    } catch {
      setError("Kod doğrulanamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.badge}>Veli Girişi</div>
        <h1 style={styles.title}>Toplantı kodunuzu girin</h1>
        <p style={styles.text}>Kod geçerliyse sınıf görüşme planınız açılır. Giriş gerekmez.</p>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="5A-X7K2" style={styles.input} />
        {error ? <p style={styles.error}>{error}</p> : null}
        <button disabled={loading} style={styles.button}>{loading ? "Kontrol ediliyor…" : "Devam et"}</button>
      </form>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "radial-gradient(circle at top, #fff8ed 0%, #f6efe4 38%, #efe7da 100%)",
    padding: 24,
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    background: "#fff",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 18px 50px rgba(61, 43, 17, 0.12)",
    display: "grid",
    gap: 14,
  },
  badge: {
    display: "inline-flex",
    alignSelf: "start",
    padding: "0.35rem 0.7rem",
    borderRadius: 999,
    background: "#1f2937",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  title: { margin: 0 },
  text: { margin: 0, color: "#6b7280", lineHeight: 1.5 },
  input: {
    padding: "0.95rem 1rem",
    borderRadius: 14,
    border: "1px solid #d1d5db",
    fontSize: 16,
    letterSpacing: "0.08em",
    fontWeight: 700,
  },
  button: {
    padding: "0.95rem 1rem",
    borderRadius: 14,
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  error: { margin: 0, color: "#b91c1c" },
};
