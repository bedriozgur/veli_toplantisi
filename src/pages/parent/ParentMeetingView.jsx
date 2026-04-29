import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { buildMailtoLink } from "../../utils/accessCode";
import { getClasses, resolveAccessCode, updateClassTeacherNotes } from "../../services/meetingService";
import LanguageToggle from "../../components/LanguageToggle";
import { useLanguage } from "../../contexts/LanguageContext";

export default function ParentMeetingView() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [access, setAccess] = useState(null);
  const [classItem, setClassItem] = useState(null);
  const [classes, setClasses] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setError("");
      const resolved = await resolveAccessCode(code);
      if (!resolved) {
        setError(t("parent.invalid"));
        return;
      }

      const classes = await getClasses(resolved.meetingId);
      setAccess(resolved);
      setClasses(classes);

      if (!resolved.classId) {
        setClassItem(null);
        setDrafts({});
        return;
      }

      const loadedClass = classes.find((item) => item.id === resolved.classId) || null;
      if (!loadedClass) {
        setError(t("parent.classMissing"));
        return;
      }

      setClassItem(loadedClass);
      setDrafts(buildDrafts(loadedClass));
    }

    load().catch(() => setError(t("parent.error")));
  }, [code, t]);

  useEffect(() => {
    if (classItem) {
      setDrafts(buildDrafts(classItem));
    }
  }, [classItem]);

  async function handleSave() {
    if (!access || !classItem) return;
    setSaving(true);
    try {
      for (const teacher of classItem.teachers || []) {
        const draft = drafts[teacher.id] || {};
        await updateClassTeacherNotes(access.meetingId, classItem.id, teacher.id, {
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
    if (access?.meetingId && !access.classId) {
      return (
        <div style={styles.page}>
          <LanguageToggle />
          <section style={styles.card}>
            <div style={styles.badge}>{t("parent.view")}</div>
            <h1 style={styles.title}>{access.meetingTitle || t("login.title")}</h1>
            <p style={styles.text}>
              {access.meetingDate || t("parent.notSpecified")} · {t("parent.meetingCode")}: {access.code}
            </p>

            <div style={styles.classPicker}>
              <div style={styles.classPickerHead}>
                <strong>{t("parent.chooseClass")}</strong>
                <span style={styles.hint}>{t("parent.chooseClassHint")}</span>
              </div>
              <div style={styles.classGrid}>
                {classes.map((item) => (
                  <button key={item.id} type="button" onClick={() => navigate(`/parent/${item.accessCode}`)} style={styles.classButton}>
                    <span>{item.classLabel || item.id}</span>
                    <small>{item.accessCode || t("parent.notSpecified")}</small>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      );
    }
    return <div style={styles.page}>{t("parent.loading")}</div>;
  }

  const mailto = buildMailtoLink({
    label: access.classLabel || classItem.classLabel || classItem.id,
    meetingTitle: access.meetingTitle || t("login.title"),
    date: access.meetingDate || "",
    teachers: classItem.teachers || [],
    meetings: drafts,
  });

  return (
    <div style={styles.page}>
      <LanguageToggle />
      <section style={styles.card}>
        <div style={styles.badge}>{t("parent.view")}</div>
          <h1 style={styles.title}>{access.meetingTitle || t("login.title")}</h1>
          <p style={styles.text}>
          {access.meetingDate || t("parent.notSpecified")} · {t("parent.code")}: {code} · {t("parent.classLabel")}: {access.classLabel || classItem.id}
          </p>

        <div style={styles.teacherList}>
          {(classItem.teachers || []).map((teacher) => {
            const draft = drafts[teacher.id] || {};
            return (
              <div key={teacher.id} style={styles.teacherCard}>
                <div style={styles.teacherTop}>
                  <div>
                    <strong>{teacher.subject || teacher.name}</strong>
                    <div style={styles.sub}>
                      {teacher.name} · {teacher.floor || t("parent.notSpecified")} - {teacher.room || t("parent.notSpecified")}
                    </div>
                  </div>
                  <label style={styles.checkWrap}>
                    <input
                      type="checkbox"
                      checked={Boolean(draft.visited)}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [teacher.id]: { ...prev[teacher.id], visited: e.target.checked },
                        }))
                      }
                    />
                    {t("parent.visited")}
                  </label>
                </div>
                <textarea
                  value={draft.notes || ""}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [teacher.id]: { ...prev[teacher.id], notes: e.target.value },
                    }))
                  }
                  placeholder={t("parent.notes")}
                  rows={3}
                  style={styles.textarea}
                />
              </div>
            );
          })}
        </div>

        <div style={styles.actions}>
          <button type="button" onClick={handleSave} disabled={saving} style={styles.button}>
            {saving ? t("parent.sending") : t("parent.save")}
          </button>
          <a href={mailto} style={styles.link}>{t("parent.sendEmail")}</a>
        </div>
      </section>
    </div>
  );
}

function buildDrafts(classItem) {
  const meetings = classItem?.teacherNotes || {};
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
  classPicker: {
    marginTop: 20,
    padding: 16,
    borderRadius: 18,
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    display: "grid",
    gap: 12,
  },
  classPickerHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  hint: {
    color: "#6b7280",
    fontSize: 14,
  },
  classGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  },
  classButton: {
    border: "1px solid #d1d5db",
    background: "#fff",
    borderRadius: 16,
    padding: "0.9rem 1rem",
    textAlign: "left",
    display: "grid",
    gap: 4,
    cursor: "pointer",
    color: "#111827",
    fontWeight: 700,
  },
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
