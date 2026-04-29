import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMeetings } from "../../services/meetingService";
import { useLanguage } from "../../contexts/LanguageContext";

export default function AdminMeetings() {
  const { t } = useLanguage();
  const [meetings, setMeetings] = useState([]);

  useEffect(() => {
    getMeetings().then(setMeetings).catch(() => setMeetings([]));
  }, []);

  return (
    <div style={styles.card}>
      <div style={styles.head}>
        <div>
          <h2 style={styles.h2}>{t("admin.meetings")}</h2>
          <p style={styles.text}>{t("admin.meetingsDescription")}</p>
        </div>
        <span style={styles.count}>{meetings.length} kayıt</span>
      </div>
      <div style={styles.list}>
        {meetings.map((meeting) => (
          <Link key={meeting.id} to={`/admin/meetings/${meeting.id}`} style={styles.linkItem}>
            <div>
              <strong>{meeting.title}</strong>
              <div style={styles.sub}>{meeting.date || "Tarih yok"} · {meeting.status}</div>
            </div>
            <span style={styles.go}>{t("admin.open")}</span>
          </Link>
        ))}
        {!meetings.length ? <p style={styles.text}>{t("admin.noMeetings")}</p> : null}
      </div>
    </div>
  );
}

const styles = {
  card: { background: "#fff", borderRadius: 20, padding: 20, boxShadow: "0 10px 30px rgba(0,0,0,0.06)" },
  head: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16 },
  h2: { marginTop: 0 },
  text: { color: "#6b7280", margin: "6px 0 0" },
  count: { padding: "0.35rem 0.7rem", borderRadius: 999, background: "#f3f4f6", fontWeight: 700 },
  list: { display: "grid", gap: 10 },
  linkItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    padding: 14,
    borderRadius: 14,
    background: "#f9fafb",
    color: "#111827",
    textDecoration: "none",
  },
  sub: { color: "#6b7280", marginTop: 4, fontSize: 14 },
  go: { color: "#1d4ed8", fontWeight: 700 },
};
