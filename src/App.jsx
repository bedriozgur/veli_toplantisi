import React, { useEffect, useMemo, useRef, useState } from "react";
import teachersSeed from "./data/teachers.json";
import classesSeed from "./data/classes.json";
import studentsSeed from "./data/students.json";
import {
  normalizeTeachers,
  normalizeClasses,
  normalizeStudents,
  normalizeParentPayload,
  buildMeetingsState,
} from "./utils/normalizeData";
import { parseCsv } from "./utils/csv";
import { isCloudConfigured, loadEvent, loadProgress, publishEvent, saveProgress } from "./cloud";

const G = "#1B3A2D";
const A = "#C4803A";
const CR = "#F5F0E8";
const STORAGE_KEY = "pe_admin_v2";
const PARENT_KEY_PREFIX = "pe_parent_v2:";
const ADMIN_PIN_KEY = "pe_admin_pin";
const ADMIN_UNLOCK_KEY = "pe_admin_unlock";

const DEFAULT_SCHOOL = "Oakwood Academy";
const DEFAULT_EVENT = "Parents' Evening";
const DEFAULT_NOTES_EMAIL = "parents-evening@school.org";
const DEFAULT_ADMIN_PIN = "";

const iBase = {
  width: "100%",
  border: "1.5px solid #E0D8CC",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 14,
  fontFamily: "'DM Sans',sans-serif",
  boxSizing: "border-box",
  outline: "none",
  background: "white",
  color: "#1C1C1C",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const enc = (data) =>
  btoa(String.fromCharCode(...encoder.encode(JSON.stringify(data))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const dec = (value) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = padded + "=".repeat((4 - (padded.length % 4 || 4)) % 4);
  const bytes = Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
  return JSON.parse(decoder.decode(bytes));
};
const uid = () => Date.now() + Math.floor(Math.random() * 9999);
const cloudReady = isCloudConfigured();

const fmtDate = (value) =>
  value
    ? new Date(value + "T12:00:00").toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

function makeEventCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function safeSetStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function safeGetStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function blankMeetings(teachers) {
  return buildMeetingsState(Array.isArray(teachers) ? teachers : []);
}

function loadParentMeetings(keyId, teachers) {
  try {
    const raw = safeGetStorage(`${PARENT_KEY_PREFIX}${keyId}`);
    if (!raw) return blankMeetings(teachers);
    const saved = JSON.parse(raw);
    const base = blankMeetings(teachers);
    Object.keys(base).forEach((id) => {
      base[id] = {
        done: Boolean(saved?.[id]?.done),
        notes: saved?.[id]?.notes || "",
      };
    });
    return base;
  } catch {
    return blankMeetings(teachers);
  }
}

function getStoredAdminPin() {
  return safeGetStorage(ADMIN_PIN_KEY) || import.meta.env.VITE_ADMIN_PIN || DEFAULT_ADMIN_PIN;
}

function classTeacherCount(source, classId) {
  const cls = (source.classes || []).find((item) => item.id === classId);
  if (!cls) return 0;
  return (source.teachers || []).filter(
    (teacher) => (cls.tids || []).includes(teacher.id) && teacher.status !== "unavailable"
  ).length;
}

function normalizeAdminState(raw) {
  return {
    school: raw?.school || DEFAULT_SCHOOL,
    evtName: raw?.evtName || DEFAULT_EVENT,
    evtDate: raw?.evtDate || "",
    notesEmail: raw?.notesEmail || DEFAULT_NOTES_EMAIL,
    eventCode: raw?.eventCode || makeEventCode(),
    teachers: normalizeTeachers(raw?.teachers ?? teachersSeed),
    classes: normalizeClasses(raw?.classes ?? classesSeed),
    students: normalizeStudents(raw?.students ?? studentsSeed),
  };
}

function buildEventPayload({ school, evtName, evtDate, notesEmail, eventCode, teachers, classes, students }) {
  return { school, evtName, evtDate, notesEmail, eventCode, teachers, classes, students };
}

function buildParentPayload(source, student) {
  const cls = (source.classes || []).find((c) => c.id === student.cid);
  const teacherList = cls
    ? (source.teachers || []).filter((t) => (cls.tids || []).includes(t.id) && t.status !== "unavailable")
    : [];

  return {
    school: source.school || "",
    evtName: source.evtName || "",
    evtDate: source.evtDate || "",
    notesEmail: source.notesEmail || "",
    eventCode: source.eventCode || "",
    studentId: student.id,
    child: student.child || "",
    parent: student.parent || "",
    className: cls?.name || "",
    keyId: `${source.eventCode || "local"}-${student.id}-${source.evtDate || "event"}`,
    teachers: normalizeTeachers(teacherList),
  };
}

export default function App() {
  const [mode, setMode] = useState(null);
  const [bootError, setBootError] = useState("");
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState("teachers");

  const [school, setSchool] = useState(DEFAULT_SCHOOL);
  const [evtName, setEvtName] = useState(DEFAULT_EVENT);
  const [evtDate, setEvtDate] = useState("");
  const [notesEmail, setNotesEmail] = useState(DEFAULT_NOTES_EMAIL);
  const [eventCode, setEventCode] = useState(makeEventCode());

  const [teachers, setTeachers] = useState(normalizeTeachers(teachersSeed));
  const [classes, setClasses] = useState(normalizeClasses(classesSeed));
  const [students, setStudents] = useState(normalizeStudents(studentsSeed));

  const [pData, setPData] = useState(null);
  const [entranceData, setEntranceData] = useState(null);
  const [meetings, setMeetings] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [qrStuId, setQrStuId] = useState(null);
  const [showEventQr, setShowEventQr] = useState(false);
  const [copied, setCopied] = useState("");
  const [publishState, setPublishState] = useState("");
  const [adminPin, setAdminPin] = useState(getStoredAdminPin());
  const [adminUnlocked, setAdminUnlocked] = useState(safeGetStorage(ADMIN_UNLOCK_KEY) === "yes");
  const [showAdminGate, setShowAdminGate] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState("");

  const openParentState = async (raw) => {
    if (raw?.eventCode && raw?.studentId && cloudReady) {
      const remoteEvent = await loadEvent(raw.eventCode);
      if (!remoteEvent) throw new Error("Published event not found.");
      const student = (remoteEvent.students || []).find((item) => item.id === raw.studentId);
      if (!student) throw new Error("Student not found in event.");
      const payload = buildParentPayload(remoteEvent, student);
      const localProgress = loadParentMeetings(payload.keyId, payload.teachers);
      const remoteProgress = await loadProgress(raw.eventCode, raw.studentId);
      setPData(payload);
      setMeetings(remoteProgress || localProgress);
      setMode("parent");
      return;
    }

    const safe = normalizeParentPayload(raw);
    setPData(safe);
    setMeetings(loadParentMeetings(safe.child || "parent", safe.teachers));
    setMode("parent");
  };

  const openEntranceState = async (hash) => {
    if (hash.startsWith("#eventCode=")) {
      const code = decodeURIComponent(hash.slice(11)).toUpperCase();
      if (!cloudReady) throw new Error("Firebase config is missing for this event link.");
      const remoteEvent = await loadEvent(code);
      if (!remoteEvent) throw new Error(`No event found for code ${code}.`);
      setEntranceData(remoteEvent);
      setMode("entrance");
      return;
    }

    if (hash.startsWith("#event=")) {
      const raw = dec(hash.slice(7));
      setEntranceData(normalizeAdminState(raw));
      setMode("entrance");
    }
  };

  useEffect(() => {
    const lk = document.createElement("link");
    lk.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=DM+Sans:wght@300;400;500;600&display=swap";
    lk.rel = "stylesheet";
    document.head.appendChild(lk);

    const init = async () => {
      try {
        const hash = window.location.hash || "";

        if (hash.startsWith("#p=")) {
          await openParentState(dec(hash.slice(3)));
          return;
        }

        if (hash.startsWith("#eventCode=") || hash.startsWith("#event=")) {
          await openEntranceState(hash);
          return;
        }

        const saved = safeGetStorage(STORAGE_KEY);
        if (saved) {
          const state = normalizeAdminState(JSON.parse(saved));
          setSchool(state.school);
          setEvtName(state.evtName);
          setEvtDate(state.evtDate);
          setNotesEmail(state.notesEmail);
          setEventCode(state.eventCode);
          setTeachers(state.teachers);
          setClasses(state.classes);
          setStudents(state.students);
        }

        setMode("home");
      } catch (error) {
        setBootError(String(error?.message || error));
        setMode("error");
      } finally {
        setLoading(false);
      }
    };

    init();

    const onHashChange = async () => {
      const hash = window.location.hash || "";
      try {
        if (hash.startsWith("#p=")) {
          await openParentState(dec(hash.slice(3)));
          return;
        }

        if (hash.startsWith("#eventCode=") || hash.startsWith("#event=")) {
          await openEntranceState(hash);
          return;
        }

        setMode("home");
      } catch (error) {
        setBootError(String(error?.message || error));
        setMode("error");
      }
    };

    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      try {
        document.head.removeChild(lk);
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (mode !== "admin") return;
    safeSetStorage(
      STORAGE_KEY,
      JSON.stringify({ school, evtName, evtDate, notesEmail, eventCode, teachers, classes, students })
    );
  }, [mode, school, evtName, evtDate, notesEmail, eventCode, teachers, classes, students]);

  useEffect(() => {
    if (adminPin) {
      safeSetStorage(ADMIN_PIN_KEY, adminPin);
    }
  }, [adminPin]);

  useEffect(() => {
    safeSetStorage(ADMIN_UNLOCK_KEY, adminUnlocked ? "yes" : "no");
  }, [adminUnlocked]);

  useEffect(() => {
    if (mode !== "parent" || !pData?.keyId) return;
    safeSetStorage(`${PARENT_KEY_PREFIX}${pData.keyId}`, JSON.stringify(meetings));
    if (cloudReady && pData.eventCode && pData.studentId) {
      saveProgress(pData.eventCode, pData.studentId, meetings).catch(() => {});
    }
  }, [mode, pData, meetings]);

  const currentEvent = buildEventPayload({ school, evtName, evtDate, notesEmail, eventCode, teachers, classes, students });
  const eventUrl =
    cloudReady && eventCode
      ? `${window.location.href.split("#")[0]}#eventCode=${encodeURIComponent(eventCode)}`
      : `${window.location.href.split("#")[0]}#event=${enc(currentEvent)}`;

  const studentUrl = (student) => {
    if (cloudReady && eventCode) {
      return `${window.location.href.split("#")[0]}#p=${enc({ eventCode, studentId: student.id })}`;
    }
    return `${window.location.href.split("#")[0]}#p=${enc(buildParentPayload(currentEvent, student))}`;
  };

  const copyText = async (value, key) => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    } catch {}
  };

  const shareStudentCard = async (student) => {
    const url = studentUrl(student);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${evtName} - ${student.child}`, text: `${student.child} meeting list`, url });
        return;
      } catch {}
    }
    copyText(url, `student-${student.id}`);
  };

  const publishCurrentEvent = async () => {
    try {
      if (!cloudReady) throw new Error("Firebase config is missing.");
      if (!eventCode.trim()) throw new Error("Event code is required.");
      setPublishState("Publishing...");
      await publishEvent(eventCode.trim().toUpperCase(), currentEvent);
      setEventCode(eventCode.trim().toUpperCase());
      setPublishState("Published to Firebase");
    } catch (error) {
      setPublishState(String(error?.message || error));
    }
  };

  const openParentView = (student, source) => {
    const target = source.eventCode ? { eventCode: source.eventCode, studentId: student.id } : buildParentPayload(source, student);
    window.location.hash = `p=${enc(target)}`;
  };

  const openEntranceView = () => {
    const open = async () => {
      const savedSetup = safeGetStorage(STORAGE_KEY);

      if (cloudReady && eventCode) {
        try {
          const remoteEvent = await loadEvent(eventCode);
          if (remoteEvent) {
            window.location.hash = `eventCode=${encodeURIComponent(eventCode)}`;
            setEntranceData(remoteEvent);
            setMode("entrance");
            return;
          }
        } catch {}
      }

      if (savedSetup) {
        window.location.hash = `event=${enc(currentEvent)}`;
        setEntranceData(currentEvent);
        setMode("entrance");
        return;
      }

      setBootError("No published entrance event is available yet. Ask staff to publish the event first.");
      setMode("error");
    };

    open();
  };

  const openAdminView = () => {
    if (adminUnlocked) {
      window.location.hash = "";
      setMode("admin");
      return;
    }
    if (!adminPin) {
      window.location.hash = "";
      setAdminUnlocked(true);
      setMode("admin");
      return;
    }
    setPinDraft("");
    setPinError("");
    setShowAdminGate(true);
  };

  const goHome = () => {
    window.location.hash = "";
    setMode("home");
  };

  const unlockAdmin = () => {
    if (!adminPin || pinDraft === adminPin) {
      setAdminUnlocked(true);
      setShowAdminGate(false);
      setPinDraft("");
      setPinError("");
      window.location.hash = "";
      setMode("admin");
      return;
    }
    setPinError("Incorrect PIN");
  };

  const lockAdmin = () => {
    setAdminUnlocked(false);
    setShowAdminGate(false);
    setPinDraft("");
    setPinError("");
    goHome();
  };

  const resetDemoData = () => {
    setSchool(DEFAULT_SCHOOL);
    setEvtName(DEFAULT_EVENT);
    setEvtDate("");
    setNotesEmail(DEFAULT_NOTES_EMAIL);
    setEventCode(makeEventCode());
    setTeachers(normalizeTeachers(teachersSeed));
    setClasses(normalizeClasses(classesSeed));
    setStudents(normalizeStudents(studentsSeed));
    setPublishState("");
    try {
      localStorage.clear();
    } catch {}
  };

  const downloadSetup = () => {
    const blob = new Blob([JSON.stringify(currentEvent, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(eventCode || "parent-evening").toLowerCase()}-setup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSetup = (parsed) => {
    const state = normalizeAdminState(parsed);
    setSchool(state.school);
    setEvtName(state.evtName);
    setEvtDate(state.evtDate);
    setNotesEmail(state.notesEmail);
    setEventCode(state.eventCode);
    setTeachers(state.teachers);
    setClasses(state.classes);
    setStudents(state.students);
  };

  const sendEmail = () => {
    if (!pData) return;
    const dateStr = pData.evtDate ? fmtDate(pData.evtDate) : "";
    const hdr =
      `${pData.evtName} — ${pData.school}` +
      `${dateStr ? `\n${dateStr}` : ""}` +
      `${pData.child ? `\nStudent: ${pData.child}` : ""}` +
      `${pData.className ? `\nClass: ${pData.className}` : ""}` +
      `\n${"─".repeat(38)}\n\n`;

    const body =
      hdr +
      (pData.teachers || [])
        .map((t) => {
          const m = meetings?.[t.id] || {};
          return `${m.done ? "✓" : "○"} ${t.name} (${t.subject})${t.time ? ` · ${t.time}` : ""}${t.room ? ` · ${t.room}` : ""}${t.floor ? ` · ${t.floor}` : ""}${m.notes ? `\n${m.notes}` : ""}`;
        })
        .join("\n\n");

    window.location.href = `mailto:${encodeURIComponent(
      pData.notesEmail || ""
    )}?subject=${encodeURIComponent(
      `${pData.evtName} Notes${pData.child ? ` — ${pData.child}` : ""}`
    )}&body=${encodeURIComponent(body)}`;
  };

  if (loading) return <LoadingScreen label="Loading event" />;
  if (mode === "error") return <ErrorScreen message={bootError} />;

  if (mode === "entrance" && entranceData) {
    return <EntranceView data={entranceData} copyText={copyText} copied={copied} openParentView={openParentView} onBack={goHome} />;
  }

  if (mode === "parent" && pData) {
    const ts = Array.isArray(pData?.teachers) ? pData.teachers : [];
    const done = Object.values(meetings || {}).filter((m) => m?.done).length;
    const total = ts.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const all = done === total && total > 0;

    return (
      <div style={{ minHeight: "100vh", background: CR, fontFamily: "'DM Sans',sans-serif", maxWidth: 480, margin: "0 auto", paddingBottom: 100 }}>
        <div style={{ background: G, padding: "26px 20px 24px", color: "white" }}>
          <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", opacity: 0.5, marginBottom: 6 }}>{pData.school}</div>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 700, lineHeight: 1.1, marginBottom: 4 }}>{pData.evtName}</div>
          {pData.child && <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 2 }}>{pData.child}{pData.parent ? ` · ${pData.parent}` : ""}</div>}
          {pData.evtDate && <div style={{ fontSize: 12, opacity: 0.5 }}>{fmtDate(pData.evtDate)}</div>}
          <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 14, padding: "14px 16px", marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 13, opacity: 0.85 }}>{all ? "All done!" : `${total - done} meeting${total - done !== 1 ? "s" : ""} remaining`}</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700 }}>{pct}%</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 999, height: 8, overflow: "hidden" }}>
              <div style={{ background: all ? "#5DD88A" : A, height: "100%", width: `${pct}%`, borderRadius: 999, transition: "width .5s ease" }} />
            </div>
          </div>
        </div>

        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#9A9A9A", marginBottom: 10 }}>Your Meetings</div>
          {!ts.length && (
            <Card>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, color: G, marginBottom: 8 }}>No teachers assigned yet</div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: "#75695E" }}>
                This class does not have a meeting list yet. Please check with the staff desk.
              </div>
            </Card>
          )}
          {ts.map((t) => {
            const m = meetings?.[t.id] || {};
            const ex = expanded === t.id;
            return (
              <div key={t.id} style={{ background: m.done ? "#F0F7F3" : "white", borderRadius: 18, marginBottom: 10, border: m.done ? `2px solid ${G}22` : "2px solid transparent", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden" }}>
                <div style={{ padding: "15px 16px", display: "flex", alignItems: "center", gap: 13 }}>
                  <button onClick={() => setMeetings((p) => ({ ...p, [t.id]: { ...p[t.id], done: !p[t.id]?.done } }))} style={{ width: 36, height: 36, borderRadius: "50%", border: m.done ? `2.5px solid ${G}` : "2.5px solid #D4CCC4", background: m.done ? G : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {m.done && <span style={{ color: "white", fontSize: 17 }}>✓</span>}
                  </button>
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(ex ? null : t.id)}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: m.done ? "#5A7A65" : "#1C1C1C", textDecoration: m.done ? "line-through" : "none" }}>{t.name}</div>
                    <div style={{ fontSize: 13, color: "#9A9A9A", marginTop: 2 }}>{[t.subject, t.room, t.floor].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div style={{ textAlign: "right", cursor: "pointer", flexShrink: 0 }} onClick={() => setExpanded(ex ? null : t.id)}>
                    {t.time && <div style={{ fontSize: 12, fontWeight: 700, color: A }}>{t.time}</div>}
                    <div style={{ fontSize: 12, marginTop: 4, color: m.notes ? G : "#BBBBBB" }}>{m.notes ? "📝" : "note ▾"}</div>
                  </div>
                </div>
                {ex && (
                  <div style={{ borderTop: "1px solid #ECEAE6", padding: "14px 16px", background: "rgba(255,255,255,0.5)" }}>
                    <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#9A9A9A", marginBottom: 8 }}>Notes</div>
                    <textarea value={m.notes || ""} onChange={(e) => setMeetings((p) => ({ ...p, [t.id]: { ...p[t.id], notes: e.target.value } }))} rows={3} style={{ width: "100%", border: "1.5px solid #E0D8CC", borderRadius: 12, padding: "10px 14px", fontSize: 14, resize: "none", fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, padding: "12px 16px 28px", background: `linear-gradient(to top,${CR} 65%,transparent)` }}>
          <button onClick={sendEmail} style={{ width: "100%", padding: "16px 20px", background: all ? G : done > 0 ? A : "#C4BDB5", color: "white", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
            {pData.notesEmail ? (all ? "Email notes to school" : done > 0 ? `Email notes so far (${done}/${total})` : "Email notes") : "Set notes email in admin"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "home") {
    return (
      <>
        <HomeView
          school={school}
          evtName={evtName}
          evtDate={evtDate}
          eventCode={eventCode}
          cloudReady={cloudReady}
          publishState={publishState}
          teacherCount={teachers.length}
          classCount={classes.length}
          studentCount={students.length}
          onOpenEntrance={openEntranceView}
          onOpenAdmin={openAdminView}
          onOpenEventQr={() => setShowEventQr(true)}
          adminConfigured={Boolean(adminPin)}
        />
        {showEventQr && (
          <QrModal
            title="Entrance QR"
            subtitle={cloudReady ? "Parents scan, type the student name, and open their checklist from a short event link." : "Firebase config missing, so this falls back to local-only QR data."}
            imageUrl={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(eventUrl)}&bgcolor=F5F0E8&color=1B3A2D&margin=6`}
            footer={cloudReady ? `Event code ${eventCode}` : "Configure Firebase env vars for cloud mode"}
            primaryLabel={copied === "event-link" ? "✓ Link copied" : "Copy entrance link"}
            onPrimary={() => copyText(eventUrl, "event-link")}
            onClose={() => setShowEventQr(false)}
          />
        )}
        {showAdminGate && (
          <AdminPinModal
            pinDraft={pinDraft}
            setPinDraft={setPinDraft}
            pinError={pinError}
            onSubmit={unlockAdmin}
            onClose={() => {
              setShowAdminGate(false);
              setPinError("");
              setPinDraft("");
            }}
          />
        )}
      </>
    );
  }

  const qrStu = qrStuId ? students.find((s) => s.id === qrStuId) : null;

  return (
    <AdminDashboard
      school={school}
      evtName={evtName}
      evtDate={evtDate}
      notesEmail={notesEmail}
      eventCode={eventCode}
      publishState={publishState}
      cloudReady={cloudReady}
      teacherCount={teachers.length}
      classCount={classes.length}
      studentCount={students.length}
      adminTab={adminTab}
      setAdminTab={setAdminTab}
      onBack={goHome}
      onOpenEntrance={openEntranceView}
      onOpenEventQr={() => setShowEventQr(true)}
      onLock={lockAdmin}
    >
      <div style={{ padding: "18px 16px 120px" }}>
        {adminTab === "teachers" && (
          <TeachersTab
            school={school}
            setSchool={setSchool}
            evtName={evtName}
            setEvtName={setEvtName}
            evtDate={evtDate}
            setEvtDate={setEvtDate}
            notesEmail={notesEmail}
            setNotesEmail={setNotesEmail}
            eventCode={eventCode}
            setEventCode={setEventCode}
            teachers={teachers}
            setTeachers={setTeachers}
            onRemove={(id) => {
              setTeachers((p) => p.filter((t) => t.id !== id));
              setClasses((p) => p.map((c) => ({ ...c, tids: Array.isArray(c.tids) ? c.tids.filter((x) => x !== id) : [] })));
            }}
            onResetDemo={resetDemoData}
            onPublish={publishCurrentEvent}
            publishState={publishState}
            onDownloadSetup={downloadSetup}
            onImportSetup={importSetup}
            adminPin={adminPin}
            setAdminPin={setAdminPin}
          />
        )}
        {adminTab === "classes" && <ClassesTab classes={classes} setClasses={setClasses} teachers={teachers} students={students} onRemove={(id) => {
          setClasses((p) => p.filter((c) => c.id !== id));
          setStudents((p) => p.map((s) => (s.cid === id ? { ...s, cid: null } : s)));
        }} />}
        {adminTab === "students" && <StudentsTab students={students} setStudents={setStudents} classes={classes} teachers={teachers} studentUrl={studentUrl} qrStuId={qrStuId} setQrStuId={setQrStuId} onOpenEventQr={() => setShowEventQr(true)} cloudReady={cloudReady} publishState={publishState} />}
      </div>

      {showEventQr && (
        <QrModal
          title="Entrance QR"
          subtitle={cloudReady ? "Parents scan, type the student name, and open their checklist from a short event link." : "Firebase config missing, so this falls back to local-only QR data."}
          imageUrl={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(eventUrl)}&bgcolor=F5F0E8&color=1B3A2D&margin=6`}
          footer={cloudReady ? `Event code ${eventCode}` : "Configure Firebase env vars for cloud mode"}
          primaryLabel={copied === "event-link" ? "✓ Link copied" : "Copy entrance link"}
          onPrimary={() => copyText(eventUrl, "event-link")}
          onClose={() => setShowEventQr(false)}
        />
      )}

      {qrStu && (
        <QrModal
          title={qrStu.child}
          subtitle={`${classes.find((c) => c.id === qrStu.cid)?.name || ""}${qrStu.parent ? ` · ${qrStu.parent}` : ""}`}
          imageUrl={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(studentUrl(qrStu))}&bgcolor=F5F0E8&color=1B3A2D&margin=6`}
          footer={`${(() => {
            const cls = classes.find((c) => c.id === qrStu.cid);
            return cls ? teachers.filter((t) => (cls.tids || []).includes(t.id) && t.status !== "unavailable").length : 0;
          })()} teachers on this list`}
          primaryLabel={copied === `student-${qrStu.id}` ? "✓ Link copied" : "Copy student link"}
          secondaryLabel="Share"
          onPrimary={() => copyText(studentUrl(qrStu), `student-${qrStu.id}`)}
          onSecondary={() => shareStudentCard(qrStu)}
          onClose={() => setQrStuId(null)}
        />
      )}
      {showAdminGate && (
        <AdminPinModal
          pinDraft={pinDraft}
          setPinDraft={setPinDraft}
          pinError={pinError}
          onSubmit={unlockAdmin}
          onClose={() => {
            setShowAdminGate(false);
            setPinError("");
            setPinDraft("");
          }}
        />
      )}
    </AdminDashboard>
  );
}

function EntranceView({ data, copyText, copied, openParentView, onBack }) {
  const [query, setQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState("all");
  const revealResults = query.trim().length >= 2;

  const visibleStudents = useMemo(() => {
    if (!revealResults) return [];
    return (data.students || [])
      .filter((student) => selectedClass === "all" || String(student.cid) === selectedClass)
      .filter((student) => student.child.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.child.localeCompare(b.child));
  }, [data.students, query, selectedClass, revealResults]);

  return (
    <div style={{ minHeight: "100vh", background: CR, maxWidth: 520, margin: "0 auto", paddingBottom: 28, fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ background: G, color: "white", padding: "28px 20px 22px" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.14)", color: "white", border: "none", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
          ← Home
        </button>
        <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", opacity: 0.55, marginBottom: 8 }}>Entrance List</div>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 30, lineHeight: 1.05, marginBottom: 6 }}>{data.evtName}</div>
        <div style={{ fontSize: 14, opacity: 0.82 }}>{data.school}</div>
        <div style={{ fontSize: 13, opacity: 0.62, marginTop: 4 }}>{fmtDate(data.evtDate)}</div>
        <div style={{ marginTop: 18, background: "rgba(255,255,255,0.12)", borderRadius: 16, padding: "14px 16px" }}>
          Type at least 2 letters from the student name to reveal matches.
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <Card>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search student name" style={{ ...iBase, marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            <Chip label={`All classes (${(data.students || []).length})`} active={selectedClass === "all"} onClick={() => setSelectedClass("all")} />
            {(data.classes || []).map((cls) => (
              <Chip key={cls.id} label={cls.name} active={selectedClass === String(cls.id)} onClick={() => setSelectedClass(String(cls.id))} />
            ))}
          </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, color: G }}>Families <N n={visibleStudents.length} /></div>
          <Btn light onClick={() => copyText(window.location.href, "entrance-link")}>{copied === "entrance-link" ? "✓ Link copied" : "Copy this page"}</Btn>
        </div>

        {!revealResults && <Empty>Start typing the student name to reveal results.</Empty>}

        {visibleStudents.map((student) => {
          const cls = (data.classes || []).find((c) => c.id === student.cid);
          const activeTeacherCount = cls
            ? (data.teachers || []).filter((t) => (cls.tids || []).includes(t.id) && t.status !== "unavailable").length
            : 0;
          return (
            <Card key={student.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: G }}>{student.child}</div>
                  <div style={{ fontSize: 13, color: "#857A70", marginTop: 2 }}>
                    {activeTeacherCount
                      ? [cls?.name, `${activeTeacherCount} teachers`].filter(Boolean).join(" · ")
                      : [cls?.name, "Teacher list not assigned yet"].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Btn amber onClick={() => openParentView(student, data)}>Open list</Btn>
              </div>
            </Card>
          );
        })}

        {revealResults && !visibleStudents.length && <Empty>No matching students found</Empty>}
      </div>
    </div>
  );
}

function HomeView({
  school,
  evtName,
  evtDate,
  eventCode,
  cloudReady,
  publishState,
  teacherCount,
  classCount,
  studentCount,
  onOpenEntrance,
  onOpenAdmin,
  onOpenEventQr,
  adminConfigured,
}) {
  const statusLabel = cloudReady
    ? publishState || "Parents can use the entrance search and meeting list."
    : "Firebase config is missing, so sharing stays in local preview mode.";

  return (
    <div style={{ minHeight: "100vh", background: CR, fontFamily: "'DM Sans',sans-serif", maxWidth: 520, margin: "0 auto", paddingBottom: 28 }}>
      <div style={{ background: `linear-gradient(180deg, ${G} 0%, #264636 100%)`, color: "white", padding: "28px 20px 30px" }}>
        <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", opacity: 0.55, marginBottom: 8 }}>Parent Entrance</div>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 34, lineHeight: 1.02, marginBottom: 10 }}>{school}</div>
        <div style={{ fontSize: 18, opacity: 0.92, marginBottom: 4 }}>{evtName}</div>
        {evtDate && <div style={{ fontSize: 13, opacity: 0.66 }}>{fmtDate(evtDate)}</div>}
        <div style={{ marginTop: 22, background: "rgba(255,255,255,0.12)", borderRadius: 20, padding: "18px 16px" }}>
          <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.92 }}>
            Search for the student name and open the meeting checklist on the parent phone.
          </div>
          <Btn amber full onClick={onOpenEntrance} style={{ padding: "14px 16px", fontSize: 15, marginTop: 16 }}>Find my child</Btn>
          <button onClick={onOpenAdmin} style={{ marginTop: 14, background: "transparent", color: "rgba(255,255,255,0.76)", border: "none", padding: 0, fontSize: 13, textDecoration: "underline", cursor: "pointer" }}>
            {adminConfigured ? "Staff login" : "Open staff dashboard"}
          </button>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <Card>
          <SLabel>Event Status</SLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Teachers", value: teacherCount },
              { label: "Classes", value: classCount },
              { label: "Students", value: studentCount },
            ].map((item) => (
              <div key={item.label} style={{ background: "#F8F4EE", borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 24, color: G }}>{item.value}</div>
                <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#8B8075", marginTop: 4 }}>{item.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: cloudReady ? "#E8F0EC" : "#FFF0E3", borderRadius: 14, padding: "12px 14px", fontSize: 13, color: G, marginBottom: 14 }}>
            {statusLabel}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 13, color: "#75695E", marginBottom: 14 }}>
            <span>Event code</span>
            <strong style={{ color: G, letterSpacing: 1 }}>{eventCode || "Not set"}</strong>
          </div>
          <Btn full light onClick={onOpenEventQr}>Show entrance QR</Btn>
        </Card>
      </div>
    </div>
  );
}

function AdminDashboard({
  school,
  evtName,
  evtDate,
  notesEmail,
  eventCode,
  publishState,
  cloudReady,
  teacherCount,
  classCount,
  studentCount,
  adminTab,
  setAdminTab,
  onBack,
  onOpenEntrance,
  onOpenEventQr,
  onLock,
  children,
}) {
  return (
    <div style={{ minHeight: "100vh", background: CR, fontFamily: "'DM Sans',sans-serif", maxWidth: 520, margin: "0 auto" }}>
      <div style={{ background: G, padding: "22px 20px 18px", color: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "none", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            ← Parent screen
          </button>
          <button onClick={onLock} style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "none", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Lock staff
          </button>
        </div>
        <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", opacity: 0.5, marginBottom: 6 }}>Staff Dashboard</div>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, lineHeight: 1.05, marginBottom: 6 }}>{school}</div>
        <div style={{ fontSize: 15, opacity: 0.88 }}>{evtName}</div>
        <div style={{ fontSize: 12, opacity: 0.58, marginTop: 4 }}>
          {[evtDate ? fmtDate(evtDate) : "", notesEmail || "", eventCode ? `Code ${eventCode}` : ""].filter(Boolean).join(" · ")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 18, marginBottom: 14 }}>
          {[
            { label: "Teachers", value: teacherCount },
            { label: "Classes", value: classCount },
            { label: "Students", value: studentCount },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22 }}>{item.value}</div>
              <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Btn full amber onClick={onOpenEventQr}>Entrance QR</Btn>
          <Btn full light onClick={onOpenEntrance}>Parent search</Btn>
        </div>
        {!cloudReady && (
          <div style={{ background: "rgba(196,128,58,0.2)", borderRadius: 12, padding: "10px 12px", fontSize: 12, color: "#F7E8D8" }}>
            Firebase config is missing. The dashboard still works, but cloud publishing is off.
          </div>
        )}
        {cloudReady && publishState && (
          <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 12px", fontSize: 12, color: "white" }}>
            {publishState}
          </div>
        )}
      </div>

      <div style={{ display: "flex", background: "#EEE7DD", padding: 6, gap: 6, margin: "14px 16px 0", borderRadius: 16 }}>
        {[["teachers", "Teachers"], ["classes", "Classes"], ["students", "Students & QR"]].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setAdminTab(tab)}
            style={{
              flex: 1,
              background: adminTab === tab ? "white" : "transparent",
              color: adminTab === tab ? G : "#6F655B",
              border: "none",
              padding: "12px 8px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              borderRadius: 12,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {children}
    </div>
  );
}

function TeachersTab({
  school,
  setSchool,
  evtName,
  setEvtName,
  evtDate,
  setEvtDate,
  notesEmail,
  setNotesEmail,
  eventCode,
  setEventCode,
  teachers,
  setTeachers,
  onRemove,
  onResetDemo,
  onPublish,
  publishState,
  onDownloadSetup,
  onImportSetup,
  adminPin,
  setAdminPin,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", room: "", floor: "", time: "", status: "active", note: "" });
  const [editId, setEditId] = useState(null);
  const [editFm, setEditFm] = useState({});
  const fileInputRef = useRef(null);
  const csvInputRef = useRef(null);

  const addT = () => {
    if (!form.name) return;
    setTeachers((p) => [...p, { ...form, id: uid() }]);
    setForm({ name: "", subject: "", room: "", floor: "", time: "", status: "active", note: "" });
    setShowAdd(false);
  };

  const saveEdit = () => {
    setTeachers((p) => p.map((t) => (t.id === editId ? { ...t, ...editFm } : t)));
    setEditId(null);
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onImportSetup(JSON.parse(text));
    event.target.value = "";
  };

  const importTeacherCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    const nextTeachers = rows
      .map((row) => ({
        id: uid(),
        name: row.name || row.teacher || row.teacher_name || "",
        subject: row.subject || row.department || "",
        room: row.location || row.meeting_location || row.room || "",
        floor: row.floor || "",
        time: row.time || "",
        status: String(row.status || "active").toLowerCase() === "unavailable" ? "unavailable" : "active",
        note: row.note || "",
      }))
      .filter((teacher) => teacher.name);

    if (nextTeachers.length) {
      setTeachers((previous) => [...previous, ...nextTeachers]);
    }
    event.target.value = "";
  };

  return (
    <div>
      <div style={{ background: "white", borderRadius: 16, padding: "16px 18px", marginBottom: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <SLabel>Event Details</SLabel>
        <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="School name" style={{ ...iBase, marginBottom: 8 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input value={evtName} onChange={(e) => setEvtName(e.target.value)} placeholder="Event name" style={iBase} />
          <input type="date" value={evtDate} onChange={(e) => setEvtDate(e.target.value)} style={iBase} />
        </div>
        <input value={notesEmail} onChange={(e) => setNotesEmail(e.target.value)} placeholder="Notes recipient email" style={{ ...iBase, marginBottom: 8 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 }}>
          <input value={eventCode} onChange={(e) => setEventCode(e.target.value.toUpperCase())} placeholder="Event code" style={iBase} />
          <Btn light onClick={() => setEventCode(makeEventCode())}>New code</Btn>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <Btn full light onClick={onDownloadSetup}>Download setup</Btn>
          <Btn full light onClick={() => fileInputRef.current?.click()}>Import setup</Btn>
        </div>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={importFile} style={{ display: "none" }} />
        <Btn amber full onClick={onPublish}>{cloudReady ? "Publish to Firebase" : "Firebase config missing"}</Btn>
        <div style={{ fontSize: 12, color: publishState.includes("Published") ? "#2E7D4F" : "#7A6D61", marginTop: 8 }}>
          {publishState || (cloudReady ? "Publish before using the shared entrance QR." : "Firebase env vars are missing.")}
        </div>
      </div>

      <Card>
        <SLabel>Staff Access</SLabel>
        <input
          value={adminPin}
          onChange={(e) => setAdminPin(e.target.value)}
          placeholder="Set a staff PIN"
          style={{ ...iBase, marginBottom: 8 }}
        />
        <div style={{ fontSize: 12, color: "#75695E" }}>
          This is a simple screen lock for staff tools. For stronger protection, real authentication would still be needed later.
        </div>
      </Card>

      <Row>
        <SHead>Teachers <N n={teachers.length} /></SHead>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => csvInputRef.current?.click()} light>Import CSV</Btn>
          <Btn onClick={onResetDemo} light>Reset Demo</Btn>
          <Btn onClick={() => setShowAdd((p) => !p)} amber={!showAdd}>{showAdd ? "Cancel" : "+ Add"}</Btn>
        </div>
      </Row>
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={importTeacherCsv} style={{ display: "none" }} />

      {showAdd && (
        <Card border>
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Full name *" style={{ ...iBase, marginBottom: 8 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} placeholder="Subject" style={iBase} />
            <input value={form.room} onChange={(e) => setForm((p) => ({ ...p, room: e.target.value }))} placeholder="Meeting location" style={iBase} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input value={form.floor} onChange={(e) => setForm((p) => ({ ...p, floor: e.target.value }))} placeholder="Floor" style={iBase} />
            <input value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} placeholder="Time" style={iBase} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} style={iBase}>
              <option value="active">Active</option>
              <option value="unavailable">Unavailable</option>
            </select>
            <input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="Note" style={iBase} />
          </div>
          <Btn onClick={addT} amber full>Add Teacher</Btn>
        </Card>
      )}

      {teachers.map((t) => (
        <Card key={t.id}>
          {editId === t.id ? (
            <>
              <input value={editFm.name || ""} onChange={(e) => setEditFm((p) => ({ ...p, name: e.target.value }))} style={{ ...iBase, marginBottom: 8 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <input value={editFm.subject || ""} onChange={(e) => setEditFm((p) => ({ ...p, subject: e.target.value }))} placeholder="Subject" style={iBase} />
                <input value={editFm.room || ""} onChange={(e) => setEditFm((p) => ({ ...p, room: e.target.value }))} placeholder="Meeting location" style={iBase} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <input value={editFm.floor || ""} onChange={(e) => setEditFm((p) => ({ ...p, floor: e.target.value }))} placeholder="Floor" style={iBase} />
                <input value={editFm.time || ""} onChange={(e) => setEditFm((p) => ({ ...p, time: e.target.value }))} placeholder="Time" style={iBase} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <select value={editFm.status || "active"} onChange={(e) => setEditFm((p) => ({ ...p, status: e.target.value }))} style={iBase}>
                  <option value="active">Active</option>
                  <option value="unavailable">Unavailable</option>
                </select>
                <input value={editFm.note || ""} onChange={(e) => setEditFm((p) => ({ ...p, note: e.target.value }))} placeholder="Note" style={iBase} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={saveEdit} full>Save</Btn>
                <Btn onClick={() => setEditId(null)} full light>Cancel</Btn>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 2 }}>
                  {[t.subject, t.room, t.floor, t.status === "unavailable" ? "İzinli" : t.time, t.note].filter(Boolean).join(" · ")}
                </div>
              </div>
              <IBtn onClick={() => { setEditId(t.id); setEditFm({ ...t }); }}>✎</IBtn>
              <IBtn onClick={() => onRemove(t.id)} red>✕</IBtn>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function ClassesTab({ classes, setClasses, teachers, students, onRemove }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState(null);

  const addC = () => {
    if (!newName.trim()) return;
    setClasses((p) => [...p, { id: uid(), name: newName.trim(), tids: [] }]);
    setNewName("");
    setShowAdd(false);
  };

  const toggleT = (cid, tid) =>
    setClasses((p) =>
      p.map((c) =>
        c.id !== cid
          ? c
          : { ...c, tids: (c.tids || []).includes(tid) ? (c.tids || []).filter((x) => x !== tid) : [...(c.tids || []), tid] }
      )
    );

  return (
    <div>
      <Row><SHead>Classes <N n={classes.length} /></SHead><Btn onClick={() => setShowAdd((p) => !p)} amber={!showAdd}>{showAdd ? "Cancel" : "+ Add"}</Btn></Row>
      {showAdd && <Card border><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Class name" style={{ ...iBase, marginBottom: 10 }} /><Btn onClick={addC} amber full>Add Class</Btn></Card>}
      {classes.map((cls) => {
        const isOpen = openId === cls.id;
        const stuCount = students.filter((s) => s.cid === cls.id).length;
        const activeTeacherCount = teachers.filter((t) => (cls?.tids || []).includes(t.id) && t.status !== "unavailable").length;
        return (
          <div key={cls.id} style={{ background: "white", borderRadius: 16, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: G }}>{cls.name}</div>
                <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 2 }}>{activeTeacherCount} teachers · {stuCount} students</div>
              </div>
              <Btn onClick={() => setOpenId(isOpen ? null : cls.id)} style={{ background: isOpen ? G : "#E8F0EC", color: isOpen ? "white" : G }}>{isOpen ? "Done ✓" : "Edit Teachers"}</Btn>
              <IBtn onClick={() => onRemove(cls.id)} red>✕</IBtn>
            </div>
            {isOpen && (
              <div style={{ borderTop: "1px solid #F0EBE3", padding: "12px 16px" }}>
                {teachers.map((t, i) => {
                  const checked = (cls?.tids || []).includes(t.id);
                  const disabled = t.status === "unavailable";
                  return (
                    <div key={t.id} onClick={() => { if (!disabled) toggleT(cls.id, t.id); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < teachers.length - 1 ? "1px solid #F5F2EE" : "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, border: disabled ? "2px solid #D8D8D8" : checked ? `2px solid ${G}` : "2px solid #D4CCC4", background: disabled ? "#F1F1F1" : checked ? G : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{checked && !disabled && <span style={{ color: "white", fontSize: 13 }}>✓</span>}</div>
                      <div><div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}{disabled ? " · İzinli" : ""}</div><div style={{ fontSize: 12, color: "#9A9A9A" }}>{[t.subject, t.room, t.floor, disabled ? "İzinli" : t.time].filter(Boolean).join(" · ")}</div></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StudentsTab({ students, setStudents, classes, teachers, studentUrl, qrStuId, setQrStuId, onOpenEventQr, cloudReady, publishState }) {
  const [showAdd, setShowAdd] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [form, setForm] = useState({ child: "", parent: "", cid: "" });
  const [bulkText, setBulkText] = useState("");
  const [bulkCid, setBulkCid] = useState("");
  const [filter, setFilter] = useState("all");
  const csvInputRef = useRef(null);

  const addOne = () => {
    if (!form.child) return;
    setStudents((p) => [...p, { ...form, cid: form.cid ? Number(form.cid) : null, id: uid() }]);
    setForm((p) => ({ child: "", parent: "", cid: p.cid }));
    setShowAdd(false);
  };

  const addBulk = () => {
    const names = bulkText.split("\n").map((n) => n.trim()).filter(Boolean);
    setStudents((p) => [...p, ...names.map((child) => ({ id: uid(), child, parent: "", cid: bulkCid ? Number(bulkCid) : null }))]);
    setBulkText("");
    setBulk(false);
  };

  const visible = students.filter((s) => filter === "all" || s.cid === Number(filter));

  const importStudentCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    const classLookup = new Map(classes.map((item) => [String(item.name).trim().toLowerCase(), item.id]));
    const nextStudents = rows
      .map((row) => {
        const className = (row.class || row.class_name || row.classroom || "").trim().toLowerCase();
        return {
          id: uid(),
          child: row.child || row.student || row.student_name || "",
          parent: row.parent || row.parent_name || "",
          cid: classLookup.has(className) ? classLookup.get(className) : null,
        };
      })
      .filter((student) => student.child);

    if (nextStudents.length) {
      setStudents((previous) => [...previous, ...nextStudents]);
    }
    event.target.value = "";
  };

  return (
    <div>
      <Card>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, color: G, marginBottom: 6 }}>Entrance Sharing</div>
        <div style={{ fontSize: 13, color: "#7D746C", marginBottom: 12 }}>
          {cloudReady ? "Use one entrance QR after publishing the event to Firebase." : "Firebase config missing, so only per-student QR links will work reliably."}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn full onClick={onOpenEventQr}>Open Entrance QR</Btn>
          <Btn full light disabled>{publishState || (cloudReady ? "Ready to publish" : "Cloud off")}</Btn>
        </div>
      </Card>

      <Row>
        <SHead>Students <N n={students.length} /></SHead>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={() => csvInputRef.current?.click()} light>Import CSV</Btn>
          <Btn onClick={() => { setBulk((p) => !p); setShowAdd(false); }} light>{bulk ? "Cancel" : "Bulk ↓"}</Btn>
          <Btn onClick={() => { setShowAdd((p) => !p); setBulk(false); }} amber={!showAdd}>{showAdd ? "Cancel" : "+ Add"}</Btn>
        </div>
      </Row>
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={importStudentCsv} style={{ display: "none" }} />

      {showAdd && (
        <Card border>
          <input value={form.child} onChange={(e) => setForm((p) => ({ ...p, child: e.target.value }))} placeholder="Student name *" style={{ ...iBase, marginBottom: 8 }} />
          <input value={form.parent} onChange={(e) => setForm((p) => ({ ...p, parent: e.target.value }))} placeholder="Parent name" style={{ ...iBase, marginBottom: 8 }} />
          <select value={form.cid} onChange={(e) => setForm((p) => ({ ...p, cid: e.target.value }))} style={{ ...iBase, marginBottom: 12 }}>
            <option value="">Assign to class…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Btn onClick={addOne} amber full>Add Student</Btn>
        </Card>
      )}

      {bulk && (
        <Card border>
          <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={5} style={{ width: "100%", border: "1.5px solid #E0D8CC", borderRadius: 10, padding: "10px 12px", fontSize: 14, boxSizing: "border-box", resize: "none", marginBottom: 8 }} />
          <select value={bulkCid} onChange={(e) => setBulkCid(e.target.value)} style={{ ...iBase, marginBottom: 12 }}>
            <option value="">Assign to class…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Btn onClick={addBulk} amber full disabled={!bulkText.trim()}>Add {bulkText.split("\n").filter((n) => n.trim()).length} Students</Btn>
        </Card>
      )}

      {classes.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
          <Chip label={`All (${students.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
          {classes.map((c) => {
            const n = students.filter((s) => s.cid === c.id).length;
            return <Chip key={c.id} label={`${c.name} (${n})`} active={filter == c.id} onClick={() => setFilter(String(c.id))} />;
          })}
        </div>
      )}

      {visible.map((s) => {
        const cls = classes.find((c) => c.id === s.cid);
        const activeTeacherCount = cls ? teachers.filter((t) => (cls?.tids || []).includes(t.id) && t.status !== "unavailable").length : 0;
        return (
          <div key={s.id} style={{ background: "white", borderRadius: 14, padding: "13px 16px", marginBottom: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.child}</div>
              <div style={{ fontSize: 12, color: cls ? "#9A9A9A" : "#D44", marginTop: 2 }}>
                {cls ? `${cls.name} · ${activeTeacherCount} teacher${activeTeacherCount !== 1 ? "s" : ""}` : "⚠ No class assigned"}
                {s.parent ? ` · ${s.parent}` : ""}
              </div>
            </div>
            <button onClick={() => setQrStuId(qrStuId === s.id ? null : s.id)} style={{ background: qrStuId === s.id ? G : "#E8F0EC", color: qrStuId === s.id ? "white" : G, border: "none", borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {qrStuId === s.id ? "▲ Close" : "QR"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function LoadingScreen({ label }) {
  return <div style={{ minHeight: "100vh", background: CR, display: "flex", alignItems: "center", justifyContent: "center", color: G, fontFamily: "'DM Sans',sans-serif" }}>{label}...</div>;
}

function ErrorScreen({ message }) {
  return <div style={{ minHeight: "100vh", background: CR, padding: 24, color: G, fontFamily: "'DM Sans',sans-serif" }}><div style={{ maxWidth: 720, margin: "0 auto" }}><div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", opacity: 0.6, marginBottom: 10 }}>App Error</div><h1 style={{ margin: "0 0 12px", fontSize: 28 }}>The app could not open this event</h1><p style={{ margin: 0, lineHeight: 1.5 }}>{message}</p></div></div>;
}

function QrModal({ title, subtitle, imageUrl, footer, primaryLabel, secondaryLabel, onPrimary, onSecondary, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 24, padding: 28, width: "100%", maxWidth: 340, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: G, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#9A9A9A", marginBottom: 12 }}>{subtitle}</div>
        <div style={{ background: "#F5F0E8", borderRadius: 16, padding: 14, display: "inline-block", marginBottom: 14 }}>
          <img src={imageUrl} alt="QR" style={{ width: 220, height: 220, display: "block", borderRadius: 8 }} />
        </div>
        <div style={{ background: "#E8F0EC", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: G, fontWeight: 600, marginBottom: 14 }}>{footer}</div>
        <button onClick={onPrimary} style={{ width: "100%", background: "#F0EBE3", color: G, border: "none", borderRadius: 12, padding: 11, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: secondaryLabel ? 8 : 10 }}>{primaryLabel}</button>
        {secondaryLabel && <button onClick={onSecondary} style={{ width: "100%", background: "#E8F0EC", color: G, border: "none", borderRadius: 12, padding: 11, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}>{secondaryLabel}</button>}
        <button onClick={onClose} style={{ width: "100%", background: G, color: "white", border: "none", borderRadius: 12, padding: 11, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Close</button>
      </div>
    </div>
  );
}

function AdminPinModal({ pinDraft, setPinDraft, pinError, onSubmit, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 24, padding: 24, width: "100%", maxWidth: 340 }} onClick={(event) => event.stopPropagation()}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 24, color: G, marginBottom: 6 }}>Staff login</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "#75695E", marginBottom: 14 }}>
          Enter the staff PIN to open the dashboard.
        </div>
        <input
          autoFocus
          type="password"
          value={pinDraft}
          onChange={(event) => setPinDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
          }}
          placeholder="PIN"
          style={{ ...iBase, marginBottom: 10 }}
        />
        {pinError && <div style={{ fontSize: 12, color: "#C24646", marginBottom: 10 }}>{pinError}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn full light onClick={onClose}>Cancel</Btn>
          <Btn full onClick={onSubmit}>Open dashboard</Btn>
        </div>
      </div>
    </div>
  );
}

function Btn({ onClick, children, amber, light, full, disabled, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: amber ? A : light ? "#F0EBE3" : G, color: amber || !light ? "white" : "#555", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: disabled ? "default" : "pointer", width: full ? "100%" : "auto", opacity: disabled ? 0.6 : 1, ...style }}>
      {children}
    </button>
  );
}

function IBtn({ onClick, red, children }) {
  return <button onClick={onClick} style={{ background: red ? "#FEF0F0" : "#F5F2EE", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: red ? "#D44" : "#666", fontSize: 14, flexShrink: 0 }}>{children}</button>;
}

function Card({ children, border }) {
  return <div style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: border ? `2px solid ${A}` : "none" }}>{children}</div>;
}

function Row({ children }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>{children}</div>;
}

function SLabel({ children }) {
  return <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9A9A9A", marginBottom: 12 }}>{children}</div>;
}

function SHead({ children }) {
  return <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600, color: G }}>{children}</div>;
}

function N({ n }) {
  return <span style={{ fontSize: 13, color: "#9A9A9A", fontWeight: 400 }}> ({n})</span>;
}

function Chip({ label, active, onClick }) {
  return <button onClick={onClick} style={{ background: active ? G : "#E8F0EC", color: active ? "white" : G, border: active ? "none" : "1.5px solid #D0E4D8", borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: onClick ? "pointer" : "default", whiteSpace: "nowrap" }}>{label}</button>;
}

function Empty({ children }) {
  return <div style={{ textAlign: "center", padding: "36px 20px", color: "#BBBBBB", fontSize: 13 }}>{children}</div>;
}
