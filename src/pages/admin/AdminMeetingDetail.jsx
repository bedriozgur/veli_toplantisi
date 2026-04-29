import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  createClass,
  deleteClass,
  getClasses,
  getMeeting,
  getTeachers,
  replaceTeachers,
  updateClassTeachers,
  updateMeeting,
} from "../../services/meetingService";
import {
  CLASS_ROSTER_TEMPLATE_CSV,
  buildClassRosterPayload,
  downloadTextFile,
  parseClassRosterCsv,
} from "../../utils/importData";

const CLASS_OPTIONS = buildClassOptions();

export default function AdminMeetingDetail() {
  const { meetingId } = useParams();
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const classFileRef = useRef(null);
  const [meeting, setMeeting] = useState(null);
  const [classes, setClasses] = useState([]);
  const [teacherCatalog, setTeacherCatalog] = useState([]);
  const [activeTab, setActiveTab] = useState("settings");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [meetingDraft, setMeetingDraft] = useState({ title: "", date: "", status: "draft" });

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  async function refresh() {
    try {
      setError("");
      const [meetingData, classData, teacherData] = await Promise.all([
        getMeeting(meetingId),
        getClasses(meetingId),
        getTeachers(meetingId),
      ]);
      setMeeting(meetingData);
      setMeetingDraft({
        title: meetingData?.title || "",
        date: meetingData?.date || "",
        status: meetingData?.status || "draft",
      });
      setClasses(classData);
      setTeacherCatalog(buildTeacherCatalog(classData, teacherData));
    } catch {
      setMeeting(null);
      setClasses([]);
      setTeacherCatalog([]);
      setError(t("admin.detailNoMeeting"));
    }
  }

  async function saveMeeting() {
    setBusy("meeting");
    setMessage("");
    setError("");
    try {
      await updateMeeting(meetingId, {
        title: meetingDraft.title,
        date: meetingDraft.date,
        status: meetingDraft.status,
        grades: classes.map((classItem) => classItem.classLabel || classItem.id),
      });
      setMessage(t("admin.detailMeetingSaved"));
      await refresh();
    } catch (err) {
      setError(err?.message || t("app.error"));
    } finally {
      setBusy("");
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
        setMessage(t("admin.detailCsvClassEmpty"));
        return;
      }

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
          meeting
        );
      }

      setMessage(t("admin.detailClassImported").replace("{count}", String(roster.length)));
      await refresh();
    } catch (err) {
      setError(err?.message || t("app.error"));
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  function classIsSelected(className) {
    const normalized = normalizeClassName(className);
    return classes.some((classItem) => normalizeClassName(classItem.classLabel || classItem.id) === normalized);
  }

  async function toggleClassSelection(className) {
    setMessage("");
    setError("");
    const normalized = normalizeClassName(className);
    const existing = classes.find((classItem) => normalizeClassName(classItem.classLabel || classItem.id) === normalized);

    try {
      if (existing) {
        await deleteClass(meetingId, existing.id);
        setMessage(t("admin.detailClassRemoved").replace("{className}", existing.classLabel || existing.id));
      } else {
        const { grade, branch } = splitClassName(className);
        await createClass(
          meetingId,
          {
            grade,
            branch,
            classLabel: className,
            teachers: [],
          },
          meeting
        );
        setMessage(t("admin.detailClassAdded").replace("{className}", className));
      }
      await refresh();
    } catch (err) {
      setError(err?.message || t("app.error"));
    }
  }

  async function saveTeacherAssignments() {
    setBusy("teachers");
    setMessage("");
    setError("");
    try {
      await replaceTeachers(meetingId, teacherCatalog);
      for (const classItem of classes) {
        const assignedTeachers = teacherCatalog
          .filter((teacher) => (teacher.classIds || []).includes(classItem.id))
          .map((teacher, index) => ({
            id: teacher.id,
            name: teacher.name || "",
            subject: teacher.subject || "",
            room: teacher.room || "",
            floor: teacher.floor || "",
            time: teacher.time || "",
            status: teacher.status || "active",
            note: teacher.note || "",
            order: teacher.order || index + 1,
          }));
        await updateClassTeachers(meetingId, classItem.id, assignedTeachers);
      }
      setMessage(t("admin.detailTeachersSavedAll"));
      await refresh();
    } catch (err) {
      setError(err?.message || t("app.error"));
    } finally {
      setBusy("");
    }
  }

  function addTeacher() {
    setTeacherCatalog((previous) => [
      ...previous,
      {
        id: `teacher-${Date.now().toString(36)}`,
        name: "",
        subject: "",
        room: "",
        floor: "",
        time: "",
        status: "active",
        note: "",
        order: previous.length + 1,
        classIds: [],
      },
    ]);
  }

  function updateTeacherField(teacherId, field, value) {
    setTeacherCatalog((previous) =>
      previous.map((teacher) => (teacher.id !== teacherId ? teacher : { ...teacher, [field]: value }))
    );
  }

  function toggleTeacherClass(teacherId, classId) {
    setTeacherCatalog((previous) =>
      previous.map((teacher) => {
        if (teacher.id !== teacherId) return teacher;
        const classIds = new Set(teacher.classIds || []);
        if (classIds.has(classId)) classIds.delete(classId);
        else classIds.add(classId);
        return { ...teacher, classIds: Array.from(classIds) };
      })
    );
  }

  function removeTeacher(teacherId) {
    setTeacherCatalog((previous) => previous.filter((teacher) => teacher.id !== teacherId));
  }

  const teacherList = useMemo(() => buildTeacherCatalog(classes, teacherCatalog), [classes, teacherCatalog]);
  const teachersByClass = useMemo(() => {
    const map = new Map();
    for (const classItem of classes) {
      map.set(
        classItem.id,
        teacherList.filter((teacher) => (teacher.classIds || []).includes(classItem.id))
      );
    }
    return map;
  }, [classes, teacherList]);

  if (!meeting) {
    return <div style={styles.card}>{error || t("admin.detailLoading")}</div>;
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.heroMain}>
          <div style={styles.badge}>{t("admin.detailBadge")}</div>
          <h2 style={styles.title}>{meetingDraft.title || meeting.title}</h2>
          <p style={styles.text}>
            {meetingDraft.date || meeting.date || t("admin.detailDateMissing")} · {meetingDraft.status || meeting.status || "draft"} ·{" "}
            {classes.length} {t("admin.detailClassCount")}
          </p>
        </div>

        <div style={styles.heroMeta}>
          <div style={styles.metaCard}>
            <span style={styles.metaLabel}>{t("admin.detailRole")}</span>
            <strong>{currentUser?.email || t("admin.detailSession")}</strong>
          </div>
          <div style={styles.metaCard}>
            <span style={styles.metaLabel}>{t("admin.detailClassCount")}</span>
            <strong>{classes.length}</strong>
          </div>
          <div style={styles.metaCard}>
            <span style={styles.metaLabel}>{t("parent.meetingCode")}</span>
            <strong>{meeting.meetingCode || t("admin.detailNone")}</strong>
          </div>
        </div>
      </section>

      <div style={styles.tabs}>
        <button type="button" onClick={() => setActiveTab("settings")} style={tabStyle(activeTab === "settings")}>
          {t("admin.detailTabsSettings")}
        </button>
        <button type="button" onClick={() => setActiveTab("classes")} style={tabStyle(activeTab === "classes")}>
          {t("admin.detailTabsClasses")}
        </button>
        <button type="button" onClick={() => setActiveTab("teachers")} style={tabStyle(activeTab === "teachers")}>
          {t("admin.detailTabsTeachers")}
        </button>
      </div>

      {message ? <div style={styles.notice}>{message}</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      {activeTab === "settings" ? (
        <section style={styles.card}>
          <div style={styles.sectionHead}>
            <div>
              <h3 style={styles.cardTitle}>{t("admin.detailSettingsTitle")}</h3>
              <p style={styles.cardText}>{t("admin.detailSettingsHelp")}</p>
            </div>
            <button type="button" onClick={saveMeeting} style={styles.primaryButtonSmall} disabled={busy === "meeting"}>
              {busy === "meeting" ? t("admin.creating") : t("admin.detailSaveMeeting")}
            </button>
          </div>

          <div style={styles.fieldGrid}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>{t("admin.meetingTitle")}</span>
              <input
                value={meetingDraft.title}
                onChange={(event) => setMeetingDraft((prev) => ({ ...prev, title: event.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>{t("admin.meetingDate")}</span>
              <input
                type="date"
                value={meetingDraft.date}
                onChange={(event) => setMeetingDraft((prev) => ({ ...prev, date: event.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>{t("admin.detailStatus")}</span>
              <select
                value={meetingDraft.status}
                onChange={(event) => setMeetingDraft((prev) => ({ ...prev, status: event.target.value }))}
                style={styles.input}
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="closed">closed</option>
              </select>
            </label>
          </div>

          <div>
            <p style={styles.selectionLabel}>{t("admin.detailSelectedClasses")}</p>
            <div style={styles.chipGrid}>
              {CLASS_OPTIONS.map((className) => {
                const active = classIsSelected(className);
                return (
                  <button
                    key={className}
                    type="button"
                    onClick={() => toggleClassSelection(className)}
                    style={{
                      ...styles.classChip,
                      ...(active ? styles.classChipActive : null),
                    }}
                  >
                    {className}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={styles.toolbar}>
            <button
              onClick={() => downloadTextFile("class-roster-template.csv", CLASS_ROSTER_TEMPLATE_CSV, "text/csv;charset=utf-8;")}
              style={styles.secondaryButton}
              type="button"
            >
              {t("admin.classTemplate")}
            </button>
            <button onClick={() => classFileRef.current?.click()} style={styles.primaryButton} disabled={busy === "class"} type="button">
              {busy === "class" ? t("admin.detailUploadingClass") : t("admin.classCsv")}
            </button>
          </div>

          <input ref={classFileRef} type="file" accept=".csv,text/csv" onChange={handleClassRosterUpload} style={styles.hiddenInput} />
        </section>
      ) : null}

      {activeTab === "classes" ? (
        <section style={styles.card}>
          <div style={styles.sectionHead}>
            <div>
              <h3 style={styles.cardTitle}>{t("admin.detailClassesTitle")}</h3>
              <p style={styles.cardText}>{t("admin.detailClassesHelp")}</p>
            </div>
            <button type="button" onClick={saveTeacherAssignments} style={styles.primaryButtonSmall} disabled={busy === "teachers"}>
              {t("admin.detailSaveTeacherPool")}
            </button>
          </div>

          <div style={styles.grid}>
            {classes.map((classItem) => (
              <details key={classItem.id} style={styles.disclosure}>
                <summary style={styles.disclosureSummary}>
                  <div>
                    <h3 style={styles.cardTitle}>{classItem.classLabel || classItem.id}</h3>
                    <p style={styles.cardText}>
                      {t("admin.detailClassCode")}: <strong>{classItem.accessCode || t("admin.detailNone")}</strong> ·{" "}
                      {(teachersByClass.get(classItem.id) || []).length} {t("admin.detailTeacherLabel")}
                    </p>
                  </div>
                  <span style={styles.disclosureHint}>{t("admin.detailClickToEdit")}</span>
                </summary>
                <div style={styles.disclosureBody}>
                  <div style={styles.teacherPicks}>
                    {teacherList.length ? (
                      teacherList.map((teacher) => {
                        const checked = (teacher.classIds || []).includes(classItem.id);
                        return (
                          <label key={teacher.id} style={styles.checkRow}>
                            <input type="checkbox" checked={checked} onChange={() => toggleTeacherClass(teacher.id, classItem.id)} />
                            <span>
                              {teacher.name || t("admin.detailTeacherLabel")}
                              {teacher.subject ? ` · ${teacher.subject}` : ""}
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p style={styles.cardText}>{t("admin.detailNoTeachersCatalog")}</p>
                    )}
                  </div>

                  <div style={styles.teacherSummary}>
                    <span>{t("admin.detailClassTeachers")}</span>
                    <span>{(teachersByClass.get(classItem.id) || []).map((teacher) => teacher.name || t("admin.detailTeacherLabel")).join(", ") || t("admin.detailNone")}</span>
                  </div>
                </div>
              </details>
            ))}
            {!classes.length ? <div style={styles.card}>{t("admin.detailNoClasses")}</div> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "teachers" ? (
        <section style={styles.card}>
          <div style={styles.sectionHead}>
            <div>
              <h3 style={styles.cardTitle}>{t("admin.detailTeachersTitle")}</h3>
              <p style={styles.cardText}>{t("admin.detailTeachersHelp")}</p>
            </div>
            <div style={styles.toolbar}>
              <button type="button" onClick={addTeacher} style={styles.secondaryButtonSmall}>
                {t("admin.detailAddTeacherPool")}
              </button>
              <button type="button" onClick={saveTeacherAssignments} style={styles.primaryButtonSmall} disabled={busy === "teachers"}>
                {busy === "teachers" ? t("admin.creating") : t("admin.detailSaveTeacherPool")}
              </button>
            </div>
          </div>

          <div style={styles.teacherCatalog}>
            {teacherList.map((teacher) => (
              <details key={teacher.id} style={styles.disclosure}>
                <summary style={styles.disclosureSummary}>
                  <div>
                    <h3 style={styles.cardTitle}>{teacher.name || t("admin.detailTeacherLabel")}</h3>
                    <p style={styles.cardText}>{buildTeacherSummary(teacher, t)}</p>
                  </div>
                  <span style={styles.disclosureHint}>{t("admin.detailClickToEdit")}</span>
                </summary>
                <div style={styles.disclosureBody}>
                  <div style={styles.teacherGrid}>
                    <label style={styles.field}>
                      <span style={styles.fieldLabel}>{t("admin.detailTeacherName")}</span>
                      <input
                        value={teacher.name || ""}
                        onChange={(event) => updateTeacherField(teacher.id, "name", event.target.value)}
                        placeholder={t("admin.detailTeacherName")}
                        style={styles.input}
                      />
                    </label>
                    <label style={styles.field}>
                      <span style={styles.fieldLabel}>{t("admin.detailTeacherSubject")}</span>
                      <input
                        value={teacher.subject || ""}
                        onChange={(event) => updateTeacherField(teacher.id, "subject", event.target.value)}
                        placeholder={t("admin.detailTeacherSubject")}
                        style={styles.input}
                      />
                    </label>
                    <label style={styles.field}>
                      <span style={styles.fieldLabel}>{t("admin.detailTeacherRoom")}</span>
                      <input
                        value={teacher.room || ""}
                        onChange={(event) => updateTeacherField(teacher.id, "room", event.target.value)}
                        placeholder={t("admin.detailTeacherRoom")}
                        style={styles.input}
                      />
                    </label>
                    <label style={styles.field}>
                      <span style={styles.fieldLabel}>{t("admin.detailTeacherFloor")}</span>
                      <input
                        value={teacher.floor || ""}
                        onChange={(event) => updateTeacherField(teacher.id, "floor", event.target.value)}
                        placeholder={t("admin.detailTeacherFloor")}
                        style={styles.input}
                      />
                    </label>
                  </div>

                  <div style={styles.teacherActions}>
                    <label style={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={teacher.status !== "unavailable"}
                        onChange={(event) => updateTeacherField(teacher.id, "status", event.target.checked ? "active" : "unavailable")}
                      />
                      <span>{teacher.status !== "unavailable" ? t("admin.detailTeacherActive") : t("admin.detailTeacherInactive")}</span>
                    </label>
                    <button type="button" onClick={() => removeTeacher(teacher.id)} style={styles.linkButton}>
                      {t("admin.detailTeacherRemove")}
                    </button>
                  </div>

                  <div>
                    <p style={styles.selectionLabel}>{t("admin.detailTeacherClassHint")}</p>
                    <div style={styles.teacherClassGrid}>
                      {classes.map((classItem) => {
                        const checked = (teacher.classIds || []).includes(classItem.id);
                        return (
                          <label key={classItem.id} style={styles.checkRow}>
                            <input type="checkbox" checked={checked} onChange={() => toggleTeacherClass(teacher.id, classItem.id)} />
                            <span>{classItem.classLabel || classItem.id}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </details>
            ))}
            {!teacherList.length ? <p style={styles.cardText}>{t("admin.detailNoTeachersCatalog")}</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function buildTeacherCatalog(classList, previous = []) {
  const catalog = new Map();
  const allowedClassIds = new Set((classList || []).map((classItem) => classItem.id));

  for (const teacher of previous || []) {
    if (!teacher?.id) continue;
    catalog.set(teacher.id, {
      ...teacher,
      classIds: Array.isArray(teacher.classIds)
        ? [...new Set(teacher.classIds.filter((classId) => allowedClassIds.has(classId)))]
        : [],
    });
  }

  for (const classItem of classList || []) {
    for (const teacher of classItem.teachers || []) {
      const current = catalog.get(teacher.id) || {
        id: teacher.id,
        name: teacher.name || "",
        subject: teacher.subject || "",
        room: teacher.room || "",
        floor: teacher.floor || "",
        time: teacher.time || "",
        status: teacher.status || "active",
        note: teacher.note || "",
        order: teacher.order || 0,
        classIds: [],
      };

      const classIds = Array.from(new Set([...(current.classIds || []), classItem.id]));
      catalog.set(teacher.id, {
        ...current,
        ...teacher,
        room: current.room || teacher.room || "",
        floor: current.floor || teacher.floor || "",
        classIds,
      });
    }
  }

  return Array.from(catalog.values()).sort((a, b) => {
    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function buildTeacherSummary(teacher, t) {
  const subject = teacher.subject || t("admin.detailTeacherSubject");
  const locationParts = [teacher.floor || "", teacher.room || ""].filter(Boolean);
  const location = locationParts.length ? locationParts.join(" - ") : t("admin.detailTeacherLocation");
  const classCount = `${(teacher.classIds || []).length} Sınıf`;
  return [subject, location, classCount].join(" · ");
}

function splitClassName(className) {
  const normalized = normalizeClassName(className);
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

function buildClassOptions() {
  const classes = [];
  for (let grade = 1; grade <= 12; grade += 1) {
    ["A", "B", "C", "D"].forEach((branch) => {
      classes.push(`${grade}${branch}`);
    });
  }
  classes.push("Hazirlik");
  return classes;
}

function tabStyle(active) {
  return {
    border: "none",
    borderRadius: 999,
    padding: "0.8rem 1.1rem",
    fontWeight: 800,
    cursor: "pointer",
    background: active ? "#1d4ed8" : "#fff",
    color: active ? "#fff" : "#1f2937",
    boxShadow: active ? "0 12px 24px rgba(29, 78, 216, 0.18)" : "0 8px 18px rgba(0,0,0,0.05)",
  };
}

const styles = {
  page: {
    display: "grid",
    gap: 16,
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, 0.6fr)",
    gap: 16,
    alignItems: "stretch",
    padding: 20,
    borderRadius: 24,
    background: "linear-gradient(135deg, #1f2937 0%, #111827 100%)",
    color: "#fff",
    boxShadow: "0 18px 50px rgba(17, 24, 39, 0.2)",
  },
  heroMain: {
    display: "grid",
    gap: 8,
    alignContent: "start",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
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
  tabs: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
    padding: 6,
    borderRadius: 18,
    background: "rgba(255,255,255,0.65)",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
  },
  card: {
    background: "#fff",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    display: "grid",
    gap: 16,
    maxWidth: 1120,
    width: "100%",
    justifySelf: "center",
  },
  sectionHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "start",
    flexWrap: "wrap",
  },
  sectionDivider: {
    display: "grid",
    gap: 12,
    paddingTop: 8,
    borderTop: "1px solid #e5e7eb",
  },
  disclosure: {
    display: "grid",
    gap: 0,
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    background: "#fff",
    overflow: "hidden",
  },
  disclosureSummary: {
    listStyle: "none",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "16px 18px",
    background: "#fafafa",
  },
  disclosureBody: {
    display: "grid",
    gap: 14,
    padding: 18,
    borderTop: "1px solid #eef2f7",
  },
  disclosureHint: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.45rem 0.75rem",
    borderRadius: 999,
    background: "#e5eefc",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: 20,
  },
  cardText: {
    margin: "6px 0 0",
    color: "#6b7280",
    lineHeight: 1.5,
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  },
  field: {
    display: "grid",
    gap: 8,
  },
  fieldLabel: {
    color: "#374151",
    fontWeight: 700,
    fontSize: 14,
  },
  input: {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 12,
    padding: "0.75rem 0.85rem",
    fontSize: 14,
    boxSizing: "border-box",
    background: "#fff",
  },
  selectionLabel: {
    margin: "0 0 10px",
    fontSize: 14,
    fontWeight: 700,
    color: "#374151",
  },
  chipGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
    gap: 8,
  },
  classChip: {
    padding: "0.7rem 0.4rem",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  classChipActive: {
    background: "#1d4ed8",
    color: "#fff",
    borderColor: "#1d4ed8",
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
  primaryButtonSmall: {
    border: "none",
    borderRadius: 12,
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 700,
    padding: "0.7rem 0.9rem",
    cursor: "pointer",
  },
  secondaryButtonSmall: {
    border: "1px solid #d6d3d1",
    borderRadius: 12,
    background: "#fff",
    color: "#111827",
    fontWeight: 700,
    padding: "0.7rem 0.9rem",
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
    gap: 12,
  },
  classCard: {
    background: "#fafafa",
    borderRadius: 18,
    padding: 16,
    border: "1px solid #e5e7eb",
    display: "grid",
    gap: 14,
  },
  cardHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "start",
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
  teacherPicks: {
    display: "grid",
    gap: 8,
    maxHeight: 280,
    overflow: "auto",
    paddingRight: 4,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "#374151",
  },
  teacherSummary: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "start",
    paddingTop: 10,
    borderTop: "1px solid #eef2f7",
    color: "#4b5563",
    fontWeight: 700,
  },
  teacherCatalog: {
    display: "grid",
    gap: 12,
  },
  teacherCard: {
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 16,
    display: "grid",
    gap: 14,
    background: "#fafafa",
  },
  teacherGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  teacherActions: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  teacherClassGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: 8,
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#1d4ed8",
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
  },
};
