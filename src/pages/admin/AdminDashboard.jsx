import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { createMeeting, getMeetings } from "../../services/meetingService";
import { useLanguage } from "../../contexts/LanguageContext";

export default function AdminDashboard() {
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [grades, setGrades] = useState("5A,5B,6A");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMeetings().then(setMeetings).catch(() => setMeetings([]));
  }, []);

  const stats = useMemo(
    () => ({
      total: meetings.length,
      active: meetings.filter((meeting) => meeting.status === "active").length,
      draft: meetings.filter((meeting) => meeting.status !== "active").length,
    }),
    [meetings]
  );

  async function handleCreate(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const meeting = await createMeeting(
        {
          title,
          date,
          grades: grades
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
        currentUser?.uid || "unknown"
      );
      setMeetings((prev) => [meeting, ...prev]);
      setTitle("");
      setDate("");
      setGrades("5A,5B,6A");
      setMessage(t("admin.created"));
      navigate(`/admin/meetings/${meeting.id}`);
    } catch (err) {
      setMessage(err?.message || t("admin.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.badge}>{t("admin.dashboard")}</div>
          <h2 style={styles.title}>{t("admin.dashboard")}</h2>
          <p style={styles.text}>{t("admin.dashboardDescription")}</p>
        </div>

        <div style={styles.stats}>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>{t("admin.totalMeetings")}</span>
            <strong>{stats.total}</strong>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>{t("admin.activeMeetings")}</span>
            <strong>{stats.active}</strong>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>{t("admin.draftMeetings")}</span>
            <strong>{stats.draft}</strong>
          </div>
        </div>
      </section>

      <div style={styles.columns}>
        <section style={styles.card}>
          <h3 style={styles.cardTitle}>{t("admin.newMeeting")}</h3>
          <form onSubmit={handleCreate} style={styles.form}>
            <input placeholder={t("admin.meetingTitle")} value={title} onChange={(e) => setTitle(e.target.value)} style={styles.input} />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={styles.input} />
            <input placeholder={t("admin.meetingGrades")} value={grades} onChange={(e) => setGrades(e.target.value)} style={styles.input} />
            <button style={styles.button} disabled={busy}>
              {busy ? t("admin.creating") : t("admin.createMeeting")}
            </button>
          </form>
          {message ? <p style={styles.message}>{message}</p> : null}
        </section>

        <section style={styles.card}>
          <h3 style={styles.cardTitle}>{t("admin.recentMeetings")}</h3>
          <div style={styles.list}>
            {meetings.slice(0, 5).map((meeting) => (
              <button
                key={meeting.id}
                type="button"
                onClick={() => navigate(`/admin/meetings/${meeting.id}`)}
                style={styles.meetingItem}
              >
                <div>
                  <strong>{meeting.title}</strong>
                  <div style={styles.sub}>{meeting.date || "Tarih yok"} · {meeting.status}</div>
                </div>
                <span style={styles.link}>{t("admin.open")}</span>
              </button>
            ))}
            {!meetings.length ? <p style={styles.text}>{t("admin.noMeetings")}</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "grid",
    gap: 20,
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "stretch",
    padding: 24,
    borderRadius: 24,
    background: "linear-gradient(135deg, #1f2937 0%, #111827 100%)",
    color: "#fff",
    boxShadow: "0 18px 50px rgba(17, 24, 39, 0.2)",
  },
  badge: {
    display: "inline-flex",
    padding: "0.35rem 0.7rem",
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  title: {
    margin: "10px 0 8px",
    fontSize: 30,
  },
  text: {
    margin: 0,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.5,
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    minWidth: 280,
  },
  statCard: {
    borderRadius: 18,
    padding: 16,
    background: "rgba(255,255,255,0.08)",
    display: "grid",
    gap: 6,
  },
  statLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
  },
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.15fr)",
    gap: 20,
  },
  card: {
    background: "#fff",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  cardTitle: {
    margin: "0 0 16px",
    fontSize: 20,
  },
  form: {
    display: "grid",
    gap: 10,
    maxWidth: 420,
  },
  input: {
    padding: "0.9rem 1rem",
    borderRadius: 14,
    border: "1px solid #d1d5db",
    fontSize: 15,
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
  message: {
    marginTop: 12,
    color: "#166534",
    lineHeight: 1.5,
  },
  list: {
    display: "grid",
    gap: 10,
  },
  meetingItem: {
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    background: "#f9fafb",
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
  },
  sub: {
    color: "#6b7280",
    marginTop: 4,
    fontSize: 14,
  },
  link: {
    color: "#1d4ed8",
    fontWeight: 700,
  },
};
