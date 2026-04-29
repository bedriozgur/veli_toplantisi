import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { createClass, getClasses, getMeeting, replaceStudents } from "../../services/meetingService";
import {
  CLASS_ROSTER_TEMPLATE_CSV,
  STUDENT_ROSTER_TEMPLATE_CSV,
  buildClassRosterPayload,
  downloadTextFile,
  parseClassRosterCsv,
  parseStudentRosterCsv,
} from "../../utils/importData";

export default function AdminMeetingDetail() {
  const { meetingId } = useParams();
  const { currentUser } = useAuth();
  const classFileRef = useRef(null);
  const studentFileRef = useRef(null);
  const [meeting, setMeeting] = useState(null);
  const [classes, setClasses] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  async function refresh() {
    try {
      setError("");
      const [meetingData, classData] = await Promise.all([getMeeting(meetingId), getClasses(meetingId)]);
      setMeeting(meetingData);
      setClasses(classData);
    } catch {
      setMeeting(null);
      setClasses([]);
      setError("Toplantı yüklenemedi.");
    }
  }

  async function handleClassRosterUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy("class");
    setMessage("");
    setError("");
    try {
      const text = await file.text();
      const parsed = parseClassRosterCsv(text);
      const roster = buildClassRosterPayload(parsed);

      if (!roster.length) {
        setMessage("CSV içinde sınıf kaydı bulunamadı.");
        return;
      }

      const meetingDate = meeting?.date || "";
      for (const classItem of roster) {
        const { grade, branch } = splitClassName(classItem.className);
        await createClass(
          meetingId,
          {
            grade,
            branch,
            classLabel: classItem.className,
            teachers: classItem.teachers,
          },
          {
            title: meeting?.title || "",
            date: meetingDate,
          }
        );
      }

      setMessage(`${roster.length} sınıf CSV'den içe aktarıldı.`);
      await refresh();
    } catch (err) {
      setError(err?.message || "Sınıf CSV içe aktarımı başarısız oldu.");
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  async function handleStudentUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy("student");
    setMessage("");
    setError("");
    try {
      const text = await file.text();
      const parsed = parseStudentRosterCsv(text);

      if (!parsed.length) {
        setMessage("CSV içinde öğrenci kaydı bulunamadı.");
        return;
      }

      const classLookup = new Map(
        classes.map((classItem) => [normalizeClassName(classItem.classLabel || classItem.id), classItem])
      );
      const groups = new Map();
      parsed.forEach((row) => {
        const key = normalizeClassName(row.className);
        if (!key) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });

      let imported = 0;
      let skipped = 0;

      for (const [key, students] of groups.entries()) {
        const classItem = classLookup.get(key);
        if (!classItem) {
          skipped += students.length;
          continue;
        }

        await replaceStudents(
          meetingId,
          classItem.id,
          students.map((student) => ({
            studentName: student.studentName,
            parentName: student.parentName,
            parentPhone: student.parentPhone,
            note: student.note,
          })),
          classItem.teachers || []
        );
        imported += students.length;
      }

      setMessage(
        skipped > 0
          ? `${imported} öğrenci içe aktarıldı, ${skipped} satır eşleşen sınıf bulamadığı için atlandı.`
          : `${imported} öğrenci içe aktarıldı.`
      );
      await refresh();
    } catch (err) {
      setError(err?.message || "Öğrenci CSV içe aktarımı başarısız oldu.");
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  const classesById = useMemo(() => new Map(classes.map((classItem) => [classItem.id, classItem])), [classes]);

  const classStats = useMemo(
    () =>
      classes.map((classItem) => ({
        ...classItem,
        studentCount: Number(classItem?.stats?.totalStudents || 0),
      })),
    [classes]
  );

  if (!meeting) {
    return <div style={styles.card}>{error || "Toplantı yükleniyor…"}</div>;
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.badge}>Toplantı Detayı</div>
          <h2 style={styles.title}>{meeting.title}</h2>
          <p style={styles.text}>
            {meeting.date || "Tarih belirtilmedi"} · {meeting.status || "draft"} · {classStats.length} sınıf
          </p>
        </div>

        <div style={styles.heroMeta}>
          <div style={styles.metaCard}>
            <span style={styles.metaLabel}>Yetkili</span>
            <strong>{currentUser?.email || "Firebase oturumu"}</strong>
          </div>
          <div style={styles.metaCard}>
            <span style={styles.metaLabel}>Toplam sınıf</span>
            <strong>{classStats.length}</strong>
          </div>
        </div>
      </section>

      <section style={styles.toolbar}>
        <button onClick={() => downloadTextFile("class-roster-template.csv", CLASS_ROSTER_TEMPLATE_CSV, "text/csv;charset=utf-8;")} style={styles.secondaryButton}>
          Sınıf şablonu indir
        </button>
        <button onClick={() => classFileRef.current?.click()} style={styles.primaryButton} disabled={busy === "class"}>
          {busy === "class" ? "Sınıflar içe aktarılıyor…" : "Sınıf CSV yükle"}
        </button>
        <button onClick={() => downloadTextFile("student-roster-template.csv", STUDENT_ROSTER_TEMPLATE_CSV, "text/csv;charset=utf-8;")} style={styles.secondaryButton}>
          Öğrenci şablonu indir
        </button>
        <button onClick={() => studentFileRef.current?.click()} style={styles.primaryButton} disabled={busy === "student"}>
          {busy === "student" ? "Öğrenciler içe aktarılıyor…" : "Öğrenci CSV yükle"}
        </button>
      </section>

      <input ref={classFileRef} type="file" accept=".csv,text/csv" onChange={handleClassRosterUpload} style={styles.hiddenInput} />
      <input ref={studentFileRef} type="file" accept=".csv,text/csv" onChange={handleStudentUpload} style={styles.hiddenInput} />

      {message ? <div style={styles.notice}>{message}</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      <section style={styles.grid}>
        {classStats.map((classItem) => (
          <article key={classItem.id} style={styles.card}>
            <div style={styles.cardHead}>
              <div>
                <h3 style={styles.cardTitle}>{classItem.classLabel || classItem.id}</h3>
                <p style={styles.cardText}>
                  Kod: <strong>{classItem.accessCode || "yok"}</strong>
                </p>
              </div>
              <span style={styles.pill}>{classItem.studentCount} öğrenci</span>
            </div>

            <div style={styles.teacherList}>
              {(classItem.teachers || []).map((teacher) => (
                <div key={teacher.id} style={styles.teacherRow}>
                  <div>
                    <strong>{teacher.subject || teacher.name}</strong>
                    <div style={styles.teacherMeta}>
                      {teacher.name}
                      {teacher.room ? ` · ${teacher.room}` : ""}
                      {teacher.floor ? ` · ${teacher.floor}` : ""}
                    </div>
                  </div>
                  <span style={teacher.status === "unavailable" ? styles.statusOff : styles.statusOn}>
                    {teacher.status === "unavailable" ? "İzinli" : "Aktif"}
                  </span>
                </div>
              ))}
              {!classItem.teachers?.length ? <p style={styles.cardText}>Bu sınıfta henüz öğretmen yok.</p> : null}
            </div>

            <div style={styles.studentSummary}>
              <span>Öğrenci listesi</span>
              <span>{classesById.get(classItem.id)?.stats?.totalStudents || 0}</span>
            </div>
          </article>
        ))}

        {!classStats.length ? <div style={styles.card}>Henüz sınıf yok. CSV ile sınıf ekleyin.</div> : null}
      </section>
    </div>
  );
}

function splitClassName(className) {
  const normalized = String(className || "").replace(/\s+/g, "").toUpperCase();
  const match = normalized.match(/^(\d+)([A-ZÇĞİÖŞÜ]+)$/);
  if (match) {
    return { grade: match[1], branch: match[2] };
  }

  const gradeMatch = normalized.match(/^(\d+)/);
  if (gradeMatch) {
    return {
      grade: gradeMatch[1],
      branch: normalized.slice(gradeMatch[1].length) || "A",
    };
  }

  return { grade: "1", branch: normalized || "A" };
}

function normalizeClassName(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[\/.]/g, "")
    .toUpperCase();
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
  heroMeta: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    minWidth: 280,
  },
  metaCard: {
    borderRadius: 18,
    padding: 16,
    background: "rgba(255,255,255,0.08)",
    display: "grid",
    gap: 6,
  },
  metaLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  hiddenInput: {
    display: "none",
  },
  primaryButton: {
    border: "none",
    borderRadius: 14,
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 700,
    padding: "0.85rem 1rem",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #d6d3d1",
    borderRadius: 14,
    background: "#fff",
    color: "#111827",
    fontWeight: 700,
    padding: "0.85rem 1rem",
    cursor: "pointer",
  },
  notice: {
    padding: "0.9rem 1rem",
    borderRadius: 14,
    background: "#ecfdf5",
    color: "#065f46",
    border: "1px solid #a7f3d0",
  },
  error: {
    padding: "0.9rem 1rem",
    borderRadius: 14,
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
  },
  grid: {
    display: "grid",
    gap: 14,
  },
  card: {
    background: "#fff",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    display: "grid",
    gap: 16,
  },
  cardHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "start",
  },
  cardTitle: {
    margin: 0,
    fontSize: 22,
  },
  cardText: {
    margin: "6px 0 0",
    color: "#6b7280",
  },
  pill: {
    padding: "0.4rem 0.75rem",
    borderRadius: 999,
    background: "#f3f4f6",
    color: "#111827",
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  teacherList: {
    display: "grid",
    gap: 10,
  },
  teacherRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    padding: "0.9rem 0",
    borderTop: "1px solid #f1f5f9",
  },
  teacherMeta: {
    color: "#6b7280",
    marginTop: 4,
    fontSize: 14,
  },
  statusOn: {
    padding: "0.35rem 0.6rem",
    borderRadius: 999,
    background: "#ecfdf5",
    color: "#065f46",
    fontSize: 12,
    fontWeight: 700,
  },
  statusOff: {
    padding: "0.35rem 0.6rem",
    borderRadius: 999,
    background: "#fef2f2",
    color: "#991b1b",
    fontSize: 12,
    fontWeight: 700,
  },
  studentSummary: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTop: "1px solid #f1f5f9",
    color: "#4b5563",
    fontWeight: 700,
  },
};
