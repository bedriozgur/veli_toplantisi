import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { getClasses, getMeetings, getStudents, markArrived } from "../../services/meetingService";

export default function FrontDeskHome() {
  const { currentUser } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [markingKey, setMarkingKey] = useState("");

  useEffect(() => {
    getMeetings().then(setMeetings).catch(() => setMeetings([]));
  }, []);

  const summary = useMemo(
    () => ({
      meetings: meetings.length,
      results: results.length,
    }),
    [meetings.length, results.length]
  );

  async function runSearch() {
    const term = search.trim().toLowerCase();
    if (!term) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const matches = [];
      for (const meeting of meetings) {
        const classes = await getClasses(meeting.id).catch(() => []);
        for (const classItem of classes) {
          const classLabel = (classItem.classLabel || classItem.id || "").toLowerCase();
          if (classLabel.includes(term)) {
            matches.push({ meeting, classItem, kind: "class" });
          }

          const students = await getStudents(meeting.id, classItem.id).catch(() => []);
          for (const student of students) {
            const studentName = String(student.studentName || "").toLowerCase();
            const parentName = String(student.parentName || "").toLowerCase();
            if (studentName.includes(term) || parentName.includes(term)) {
              matches.push({ meeting, classItem, student, kind: "student" });
            }
          }
        }
      }

      setResults(matches);
    } finally {
      setSearching(false);
    }
  }

  async function handleMarkArrived(result) {
    const key = `${result.meeting.id}:${result.classItem.id}:${result.student.id}`;
    setMarkingKey(key);
    try {
      await markArrived(result.meeting.id, result.classItem.id, result.student.id, currentUser?.uid || "frontdesk");
      setResults((prev) =>
        prev.map((item) =>
          item.kind !== "student" || item.meeting.id !== result.meeting.id || item.classItem.id !== result.classItem.id || item.student.id !== result.student.id
            ? item
            : {
                ...item,
                student: {
                  ...item.student,
                  arrivedAt: new Date().toISOString(),
                  arrivedMarkedBy: currentUser?.uid || "frontdesk",
                },
              }
        )
      );
    } finally {
      setMarkingKey("");
    }
  }

  return (
    <section style={styles.card}>
      <div style={styles.head}>
        <div>
          <h2 style={styles.h2}>Hızlı arama</h2>
          <p style={styles.text}>Öğrenci, veli ya da sınıf adıyla arayın. Sonra geliş kaydını girin.</p>
        </div>
        <div style={styles.metrics}>
          <div style={styles.metric}>
            <span style={styles.metricLabel}>Toplantı</span>
            <strong>{summary.meetings}</strong>
          </div>
          <div style={styles.metric}>
            <span style={styles.metricLabel}>Sonuç</span>
            <strong>{summary.results}</strong>
          </div>
        </div>
      </div>

      <div style={styles.searchRow}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Öğrenci, veli ya da sınıf"
          style={styles.input}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runSearch();
            }
          }}
        />
        <button onClick={runSearch} style={styles.button} disabled={searching}>
          {searching ? "Aranıyor…" : "Ara"}
        </button>
      </div>

      <div style={styles.results}>
        {results.map((result) => (
          <article key={`${result.kind}-${result.meeting.id}-${result.classItem.id}-${result.student?.id || ""}`} style={styles.item}>
            {result.kind === "class" ? (
              <>
                <div>
                  <strong>{result.classItem.classLabel || result.classItem.id}</strong>
                  <div style={styles.sub}>{result.meeting.title} · {result.meeting.date || "tarih yok"}</div>
                </div>
                <span style={styles.classBadge}>{result.classItem.accessCode || "-"}</span>
              </>
            ) : (
              <>
                <div style={styles.studentInfo}>
                  <div>
                    <strong>{result.student.studentName}</strong>
                    <div style={styles.sub}>
                      {result.classItem.classLabel || result.classItem.id} · {result.meeting.title}
                    </div>
                    {result.student.parentName ? <div style={styles.muted}>Veli: {result.student.parentName}</div> : null}
                  </div>
                  <div style={styles.badges}>
                    <span style={result.student.arrivedAt ? styles.arrivedBadge : styles.waitBadge}>
                      {result.student.arrivedAt ? "Geldi" : "Bekliyor"}
                    </span>
                    {result.student.parentPhone ? <span style={styles.phoneBadge}>{result.student.parentPhone}</span> : null}
                  </div>
                </div>
                <button
                  style={styles.smallButton}
                  onClick={() => handleMarkArrived(result)}
                  disabled={Boolean(result.student.arrivedAt) && markingKey !== `${result.meeting.id}:${result.classItem.id}:${result.student.id}`}
                >
                  {markingKey === `${result.meeting.id}:${result.classItem.id}:${result.student.id}`
                    ? "Kaydediliyor…"
                    : result.student.arrivedAt
                      ? "Kaydedildi"
                      : "Geldi"}
                </button>
              </>
            )}
          </article>
        ))}
        {!results.length ? <p style={styles.text}>Arama sonucunuz burada görünecek.</p> : null}
      </div>
    </section>
  );
}

const styles = {
  card: {
    background: "#fff",
    borderRadius: 24,
    padding: 22,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    display: "grid",
    gap: 18,
  },
  head: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "start",
  },
  h2: { marginTop: 0, marginBottom: 0 },
  text: { color: "#6b7280", margin: "8px 0 0" },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  metric: {
    minWidth: 100,
    padding: "0.8rem 0.9rem",
    borderRadius: 16,
    background: "#f9fafb",
    display: "grid",
    gap: 6,
  },
  metricLabel: { color: "#6b7280", fontSize: 13 },
  searchRow: { display: "flex", gap: 10 },
  input: {
    flex: 1,
    padding: "0.9rem 1rem",
    borderRadius: 14,
    border: "1px solid #d1d5db",
    fontSize: 16,
  },
  button: {
    padding: "0.9rem 1rem",
    borderRadius: 14,
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  results: {
    display: "grid",
    gap: 10,
  },
  item: {
    padding: 16,
    borderRadius: 16,
    background: "#f9fafb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  sub: { color: "#6b7280", fontSize: 14, marginTop: 4 },
  muted: { color: "#9ca3af", fontSize: 13, marginTop: 4 },
  classBadge: {
    padding: "0.4rem 0.7rem",
    borderRadius: 999,
    background: "#e0f2fe",
    color: "#075985",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  studentInfo: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    width: "100%",
  },
  badges: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
  },
  arrivedBadge: {
    padding: "0.35rem 0.6rem",
    borderRadius: 999,
    background: "#ecfdf5",
    color: "#065f46",
    fontWeight: 700,
    fontSize: 12,
  },
  waitBadge: {
    padding: "0.35rem 0.6rem",
    borderRadius: 999,
    background: "#fef3c7",
    color: "#92400e",
    fontWeight: 700,
    fontSize: 12,
  },
  phoneBadge: {
    padding: "0.35rem 0.6rem",
    borderRadius: 999,
    background: "#f3f4f6",
    color: "#374151",
    fontWeight: 700,
    fontSize: 12,
  },
  smallButton: {
    padding: "0.65rem 0.9rem",
    borderRadius: 12,
    border: "none",
    background: "#059669",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
