import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  createClass,
  createRoom,
  deleteRoom,
  getClasses,
  getMeeting,
  getRooms,
  replaceStudents,
  updateClassTeachers,
  updateRoom,
} from "../../services/meetingService";
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
  const { t } = useLanguage();
  const classFileRef = useRef(null);
  const studentFileRef = useRef(null);
  const [meeting, setMeeting] = useState(null);
  const [classes, setClasses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [roomDraft, setRoomDraft] = useState({ name: "", floor: "" });

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  async function refresh() {
    try {
      setError("");
      const [meetingData, classData, roomData] = await Promise.all([
        getMeeting(meetingId),
        getClasses(meetingId),
        getRooms(meetingId),
      ]);
      setMeeting(meetingData);
      setClasses(classData);
      setRooms(roomData);
    } catch {
      setMeeting(null);
      setClasses([]);
      setRooms([]);
      setError(t("admin.detailNoMeeting"));
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

      setMessage(t("admin.detailClassImported").replace("{count}", String(roster.length)));
      await refresh();
    } catch (err) {
      setError(err?.message || t("app.error"));
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
        setMessage(t("admin.detailCsvStudentEmpty"));
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
          ? t("admin.detailStudentImportedSkipped")
              .replace("{imported}", String(imported))
              .replace("{skipped}", String(skipped))
          : t("admin.detailStudentImported").replace("{count}", String(imported))
      );
      await refresh();
    } catch (err) {
      setError(err?.message || t("app.error"));
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  function updateClassTeacherField(classId, teacherId, field, value) {
    setClasses((previous) =>
      previous.map((classItem) => {
        if (classItem.id !== classId) return classItem;
        return {
          ...classItem,
          teachers: (classItem.teachers || []).map((teacher) =>
            teacher.id !== teacherId ? teacher : { ...teacher, [field]: value }
          ),
        };
      })
    );
  }

  function updateRoomField(roomId, field, value) {
    setRooms((previous) =>
      previous.map((room) => (room.id !== roomId ? room : { ...room, [field]: value }))
    );
  }

  async function saveRoom(room) {
    await updateRoom(meetingId, room.id, room);
    setMessage(t("admin.detailRoomSaved").replace("{name}", room.name || t("admin.detailRoomName")));
    await refresh();
  }

  async function addRoom() {
    const name = String(roomDraft.name || "").trim();
    if (!name) return;
    await createRoom(meetingId, { name, floor: roomDraft.floor || "" });
    setRoomDraft({ name: "", floor: "" });
    setMessage(t("admin.detailRoomAdded").replace("{name}", name));
    await refresh();
  }

  async function removeRoom(roomId) {
    await deleteRoom(meetingId, roomId);
    setMessage(t("admin.detailRoomDeleted"));
    await refresh();
  }

  function addTeacherRow(classId) {
    setClasses((previous) =>
      previous.map((classItem) => {
        if (classItem.id !== classId) return classItem;
        const nextTeachers = Array.isArray(classItem.teachers) ? classItem.teachers : [];
        return {
          ...classItem,
          teachers: [
            ...nextTeachers,
            {
              id: `teacher-${Date.now().toString(36)}`,
              name: "",
              subject: "",
              room: "",
              floor: "",
              time: "",
              status: "active",
              note: "",
              order: nextTeachers.length + 1,
            },
          ],
        };
      })
    );
  }

  function removeTeacherRow(classId, teacherId) {
    setClasses((previous) =>
      previous.map((classItem) => {
        if (classItem.id !== classId) return classItem;
        const nextTeachers = (classItem.teachers || [])
          .filter((teacher) => teacher.id !== teacherId)
          .map((teacher, index) => ({ ...teacher, order: index + 1 }));
        return { ...classItem, teachers: nextTeachers };
      })
    );
  }

  async function saveClassTeachers(classItem) {
    await updateClassTeachers(meetingId, classItem.id, classItem.teachers || []);
    setMessage(t("admin.detailTeachersSaved").replace("{className}", classItem.classLabel || classItem.id));
    await refresh();
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
    return <div style={styles.card}>{error || t("admin.detailLoading")}</div>;
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.badge}>{t("admin.detailBadge")}</div>
          <h2 style={styles.title}>{meeting.title}</h2>
          <p style={styles.text}>
            {meeting.date || t("admin.detailDateMissing")} · {meeting.status || "draft"} · {classStats.length} {t("admin.detailClassCount")}
          </p>
        </div>

        <div style={styles.heroMeta}>
          <div style={styles.metaCard}>
            <span style={styles.metaLabel}>{t("admin.detailRole")}</span>
            <strong>{currentUser?.email || t("admin.detailSession")}</strong>
          </div>
          <div style={styles.metaCard}>
            <span style={styles.metaLabel}>{t("admin.detailClassCount")}</span>
            <strong>{classStats.length}</strong>
          </div>
        </div>
      </section>

      <section style={styles.toolbar}>
        <button onClick={() => downloadTextFile("class-roster-template.csv", CLASS_ROSTER_TEMPLATE_CSV, "text/csv;charset=utf-8;")} style={styles.secondaryButton}>
          {t("admin.detailClassCsv")}
        </button>
        <button onClick={() => classFileRef.current?.click()} style={styles.primaryButton} disabled={busy === "class"}>
          {busy === "class" ? t("admin.detailUploadingClass") : t("admin.detailUploadClass")}
        </button>
        <button onClick={() => downloadTextFile("student-roster-template.csv", STUDENT_ROSTER_TEMPLATE_CSV, "text/csv;charset=utf-8;")} style={styles.secondaryButton}>
          {t("admin.detailStudentCsv")}
        </button>
        <button onClick={() => studentFileRef.current?.click()} style={styles.primaryButton} disabled={busy === "student"}>
          {busy === "student" ? t("admin.detailUploadingStudent") : t("admin.detailUploadStudent")}
        </button>
      </section>

      <input ref={classFileRef} type="file" accept=".csv,text/csv" onChange={handleClassRosterUpload} style={styles.hiddenInput} />
      <input ref={studentFileRef} type="file" accept=".csv,text/csv" onChange={handleStudentUpload} style={styles.hiddenInput} />

      {message ? <div style={styles.notice}>{message}</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}

      <section style={styles.roomCard}>
        <div style={styles.roomHead}>
          <div>
            <h3 style={styles.cardTitle}>{t("admin.detailRoomSection")}</h3>
            <p style={styles.cardText}>{t("admin.detailRoomHelp")}</p>
          </div>
          <div style={styles.roomAddRow}>
            <input
              value={roomDraft.name}
              onChange={(event) => setRoomDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t("admin.detailRoomName")}
              style={styles.teacherInput}
            />
            <input
              value={roomDraft.floor}
              onChange={(event) => setRoomDraft((prev) => ({ ...prev, floor: event.target.value }))}
              placeholder={t("admin.detailFloor")}
              style={styles.teacherInput}
            />
            <button type="button" onClick={addRoom} style={styles.primaryButtonSmall}>
              {t("admin.detailAddRoom")}
            </button>
          </div>
        </div>
        <div style={styles.roomList}>
          {rooms.map((room) => (
            <div key={room.id} style={styles.roomItem}>
              <input
                value={room.name || ""}
                onChange={(event) => updateRoomField(room.id, "name", event.target.value)}
                placeholder={t("admin.detailRoomName")}
                style={styles.teacherInput}
              />
              <input
                value={room.floor || ""}
                onChange={(event) => updateRoomField(room.id, "floor", event.target.value)}
                placeholder={t("admin.detailFloor")}
                style={styles.teacherInput}
              />
              <button type="button" onClick={() => saveRoom(room)} style={styles.secondaryButtonSmall}>
                {t("admin.detailSaveRoom")}
              </button>
              <button type="button" onClick={() => removeRoom(room.id)} style={styles.linkButton}>
                {t("admin.detailDeleteRoom")}
              </button>
            </div>
          ))}
          {!rooms.length ? <p style={styles.cardText}>{t("admin.detailNoRooms")}</p> : null}
        </div>
      </section>

      <section style={styles.grid}>
        {classStats.map((classItem) => (
          <article key={classItem.id} style={styles.card}>
            <div style={styles.cardHead}>
              <div>
                <h3 style={styles.cardTitle}>{classItem.classLabel || classItem.id}</h3>
                <p style={styles.cardText}>
                  {t("admin.detailClassCode")}: <strong>{classItem.accessCode || t("admin.detailNone")}</strong>
                </p>
              </div>
              <span style={styles.pill}>{classItem.studentCount} {t("admin.detailStudentList")}</span>
            </div>

            <div style={styles.teacherList}>
              {(classItem.teachers || []).map((teacher) => (
                <div key={teacher.id} style={styles.teacherEditor}>
                  <div style={styles.teacherGrid}>
                    <input
                      value={teacher.name || ""}
                      onChange={(event) => updateClassTeacherField(classItem.id, teacher.id, "name", event.target.value)}
                      placeholder={t("admin.detailTeacherName")}
                      style={styles.teacherInput}
                    />
                    <input
                      value={teacher.subject || ""}
                      onChange={(event) => updateClassTeacherField(classItem.id, teacher.id, "subject", event.target.value)}
                      placeholder={t("admin.detailTeacherSubject")}
                      style={styles.teacherInput}
                    />
                    <input
                      value={teacher.room || ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        const selected = rooms.find((room) => room.name === value || room.id === value);
                        setClasses((previous) =>
                          previous.map((item) => {
                            if (item.id !== classItem.id) return item;
                            return {
                              ...item,
                              teachers: (item.teachers || []).map((current) =>
                                current.id !== teacher.id
                                  ? current
                                  : {
                                      ...current,
                                      room: value,
                                      roomId: selected?.id || "",
                                    }
                              ),
                            };
                          })
                        );
                      }}
                      placeholder={t("admin.detailTeacherRoom")}
                      style={styles.teacherInput}
                      list={`room-list-${classItem.id}`}
                    />
                    <datalist id={`room-list-${classItem.id}`}>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.name}>
                          {room.name}
                        </option>
                      ))}
                    </datalist>
                    <input
                      value={teacher.floor || ""}
                      onChange={(event) => updateClassTeacherField(classItem.id, teacher.id, "floor", event.target.value)}
                      placeholder={t("admin.detailTeacherFloor")}
                      style={styles.teacherInput}
                    />
                  </div>
                  <div style={styles.teacherActions}>
                    <label style={styles.teacherStatus}>
                      <input
                        type="checkbox"
                        checked={teacher.status !== "unavailable"}
                        onChange={(event) =>
                          updateClassTeacherField(
                            classItem.id,
                            teacher.id,
                            "status",
                            event.target.checked ? "active" : "unavailable"
                          )
                        }
                      />
                      {teacher.status !== "unavailable" ? t("admin.detailTeacherActive") : t("admin.detailTeacherInactive")}
                    </label>
                    <button type="button" onClick={() => removeTeacherRow(classItem.id, teacher.id)} style={styles.linkButton}>
                      {t("admin.detailTeacherRemove")}
                    </button>
                  </div>
                </div>
              ))}
              {!classItem.teachers?.length ? <p style={styles.cardText}>{t("admin.detailNoTeachers")}</p> : null}
              <div style={styles.teacherFooter}>
                <button type="button" onClick={() => addTeacherRow(classItem.id)} style={styles.secondaryButtonSmall}>
                  {t("admin.detailTeacherAdd")}
                </button>
                <button type="button" onClick={() => saveClassTeachers(classItem)} style={styles.primaryButtonSmall}>
                  {t("admin.detailTeacherSave")}
                </button>
              </div>
            </div>

            <div style={styles.studentSummary}>
              <span>{t("admin.detailStudentList")}</span>
              <span>{classesById.get(classItem.id)?.stats?.totalStudents || 0}</span>
            </div>
          </article>
        ))}

        {!classStats.length ? <div style={styles.card}>{t("admin.detailNoClasses")}</div> : null}
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
    gap: 14,
  },
  roomCard: {
    background: "#fff",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    display: "grid",
    gap: 14,
  },
  roomHead: {
    display: "grid",
    gap: 12,
  },
  roomAddRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
    gap: 10,
    alignItems: "center",
  },
  roomList: {
    display: "grid",
    gap: 10,
  },
  roomItem: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto auto",
    gap: 10,
    alignItems: "center",
    paddingTop: 10,
    borderTop: "1px solid #f1f5f9",
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
  teacherEditor: {
    display: "grid",
    gap: 10,
    padding: "0.9rem 0",
    borderTop: "1px solid #f1f5f9",
  },
  teacherGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  teacherInput: {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 12,
    padding: "0.75rem 0.85rem",
    fontSize: 14,
    boxSizing: "border-box",
  },
  teacherActions: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  teacherStatus: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#374151",
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#1d4ed8",
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
  },
  teacherFooter: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    paddingTop: 4,
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
