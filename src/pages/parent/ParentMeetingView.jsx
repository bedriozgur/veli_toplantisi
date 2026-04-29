import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { buildMailtoLink } from "../../utils/accessCode";
import { getClasses, getStudents, resolveAccessCode, updateTeacherMeeting } from "../../services/meetingService";

export default function ParentMeetingView() {
  const { code } = useParams();
  const [access, setAccess] = useState(null);
  const [classItem, setClassItem] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setError("");
      const resolved = await resolveAccessCode(code);
      if (!resolved) {
        setError("Kod bulunamadı ya da süresi doldu.");
        return;
      }

      const classes = await getClasses(resolved.meetingId);
      const loadedClass = classes.find((item) => item.id === resolved.classId) || null;
      if (!loadedClass) {
        setError("Sınıf kaydı bulunamadı.");
        return;
      }

      const loadedStudents = await getStudents(resolved.meetingId, resolved.classId);
      setAccess(resolved);
      setClassItem(loadedClass);
      setStudents(loadedStudents);

      const firstStudent = loadedStudents[0] || null;
      setSelectedStudentId(firstStudent?.id || "");
      setDrafts(buildDrafts(firstStudent, loadedClass));
    }

    load().catch(() => setError("Toplantı yüklenemedi."));
  }, [code]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  useEffect(() => {
    if (selectedStudent) {
      setDrafts(buildDrafts(selectedStudent, classItem));
    }
  }, [selectedStudent, classItem]);

  async function handleSave() {
    if (!access || !classItem || !selectedStudent) return;
    setSaving(true);
    try {
      for (const teacher of classItem.teachers || []) {
        const draft = drafts[teacher.id] || {};
        await updateTeacherMeeting(access.meetingId, classItem.id, selectedStudent.id, teacher.id, {
          visited: Boolean(draft.visited),
          notes: draft.notes || "",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <div style={styles.page}>{error}</div>;
  }

  if (!access || !classItem) {
    return <div style={styles.page}>Toplantı bilgisi yükleniyor…</div>;
  }

  const mailto = selectedStudent
    ? buildMailtoLink({
        studentName: selectedStudent.studentName,
        meetingTitle: access.meetingTitle || "Veli Toplantısı",
        date: access.meetingDate || "",
        teachers: classItem.teachers || [],
        meetings: drafts,
      })
    : "#";

  return (
    <div style={styles.page}>
      <section style={styles.card}>
        <div style={styles.badge}>Veli Görünümü</div>
        <h1 style={styles.title}>{access.meetingTitle || "Veli Toplantısı"}</h1>
        <p style={styles.text}>
          {access.meetingDate || "Tarih belirtilmedi"} · Kod: {code} · Sınıf: {access.classLabel || classItem.id}
        </p>

        <label style={styles.label}>
          Öğrenci seçin
          <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} style={styles.input}>
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.studentName}</option>
            ))}
          </select>
        </label>

        {selectedStudent ? (
          <>
            <div style={styles.teacherList}>
              {(classItem.teachers || []).map((teacher) => {
                const draft = drafts[teacher.id] || {};
                return (
                  <div key={teacher.id} style={styles.teacherCard}>
                    <div style={styles.teacherTop}>
                  <div>
                    <strong>{teacher.subject || teacher.name}</strong>
                    <div style={styles.sub}>{teacher.name} · {teacher.room || "-"}</div>
                  </div>
                  <label style={styles.checkWrap}>
                        <input
                          type="checkbox"
                          checked={Boolean(draft.visited)}
                          onChange={(e) => setDrafts((prev) => ({
                            ...prev,
                            [teacher.id]: { ...prev[teacher.id], visited: e.target.checked },
                          }))}
                        />
                        Görüşüldü
                      </label>
                    </div>
                    <textarea
                      value={draft.notes || ""}
                      onChange={(e) => setDrafts((prev) => ({
                        ...prev,
                        [teacher.id]: { ...prev[teacher.id], notes: e.target.value },
                      }))}
                      placeholder="Notlar"
                      rows={3}
                      style={styles.textarea}
                    />
                  </div>
                );
              })}
            </div>

            <div style={styles.actions}>
              <button type="button" onClick={handleSave} disabled={saving} style={styles.button}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
              <a href={mailto} style={styles.link}>Notları e-posta ile gönder</a>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function buildDrafts(student, classItem) {
  const meetings = student?.meetings || {};
  return Object.fromEntries((classItem?.teachers || []).map((teacher) => [
    teacher.id,
    {
      visited: Boolean(meetings[teacher.id]?.visited),
      notes: meetings[teacher.id]?.notes || "",
    },
  ]));
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 24,
    background: "radial-gradient(circle at top, #fff8ed 0%, #f6efe4 38%, #efe7da 100%)",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    maxWidth: 960,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 18px 50px rgba(61, 43, 17, 0.12)",
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
  title: { marginTop: 0 },
  text: { color: "#6b7280", lineHeight: 1.5 },
  label: { display: "grid", gap: 8, marginTop: 18, fontWeight: 700 },
  input: { padding: "0.8rem 0.9rem", borderRadius: 12, border: "1px solid #d1d5db" },
  teacherList: { display: "grid", gap: 12, marginTop: 18 },
  teacherCard: { borderRadius: 16, background: "#f9fafb", padding: 16 },
  teacherTop: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" },
  sub: { color: "#6b7280", fontSize: 14, marginTop: 4 },
  checkWrap: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, whiteSpace: "nowrap" },
  textarea: { width: "100%", marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #d1d5db", resize: "vertical" },
  actions: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 18 },
  button: { padding: "0.85rem 1rem", borderRadius: 12, border: "none", background: "#1d4ed8", color: "#fff", fontWeight: 700 },
  link: { color: "#1d4ed8", fontWeight: 700, textDecoration: "none" },
};
