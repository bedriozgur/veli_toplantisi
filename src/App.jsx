import logoImg from "./assets/logo.png";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeParentPayload,
  buildMeetingsState,
  normalizeTeachers,
} from "./utils/normalizeData";
import { isCloudConfigured, loadEvent, loadProgress, publishEvent, saveProgress } from "./cloud";
import {
  buildEventPayload,
  buildTimeOptions,
  createId,
  DEFAULT_ADMIN_PIN,
  DEFAULT_EVENT,
  DEFAULT_EVENT_STATUS,
  DEFAULT_LANDING_HELP,
  DEFAULT_LANDING_NOTE,
  DEFAULT_NOTES_EMAIL,
  DEFAULT_SCHOOL,
  DEFAULT_START_TIME,
  DEFAULT_END_TIME,
  isEventAccessible,
  isEventExpired,
  makeEventCode,
  normalizeAdminState,
} from "./config/eventConfig";
import {
  CLASS_TEMPLATE_CSV,
  downloadTextFile,
  importClassesFromCsv,
  importStudentsFromCsv,
  importTeachersFromCsv,
  STUDENT_TEMPLATE_CSV,
  TEACHER_TEMPLATE_CSV,
} from "./utils/importData";

const G = "#3A5673";
const G2 = "#4A6A8A";
const A = "#D4A73F";
const CR = "#F2EEE8";
const STORAGE_KEY = "pe_admin_v2";
const PARENT_KEY_PREFIX = "pe_parent_v2:";
const ADMIN_PIN_KEY = "pe_admin_pin";
const ADMIN_UNLOCK_KEY = "pe_admin_unlock";
const MEETING_LIBRARY_KEY = "pe_meeting_library_v1";

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

const TIME_OPTIONS = buildTimeOptions();

function fmtEventWindow(startTime, endTime) {
  if (startTime && endTime) return `${startTime} - ${endTime}`;
  return startTime || endTime || "";
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

function safeParseStorage(key, fallback) {
  try {
    const raw = safeGetStorage(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
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
        followUp: Boolean(saved?.[id]?.followUp),
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

function markEntranceSource(payload, sourceType) {
  return {
    ...payload,
    sourceType,
  };
}

function buildParentPayload(source, student) {
  const cls = (source.classes || []).find((c) => c.id === student.cid);
  const teacherList = cls
    ? (source.teachers || []).filter((t) => (cls.tids || []).includes(t.id))
    : [];

  return {
    school: source.school || "",
    evtName: source.evtName || "",
    evtDate: source.evtDate || "",
    startTime: source.startTime || "",
    endTime: source.endTime || "",
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

function loadMeetingLibrary() {
  const parsed = safeParseStorage(MEETING_LIBRARY_KEY, []);
  return Array.isArray(parsed)
    ? parsed.filter(Boolean).map((item) => ({
        id: item.id || createId(),
        label: item.label || item.evtName || "Saved meeting",
        createdAt: item.createdAt || new Date().toISOString(),
        ...buildEventPayload({
          school: item.school || DEFAULT_SCHOOL,
          schoolLogo: item.schoolLogo || "",
          evtName: item.evtName || DEFAULT_EVENT,
          evtDate: item.evtDate || "",
          startTime: item.startTime || DEFAULT_START_TIME,
          endTime: item.endTime || DEFAULT_END_TIME,
          notesEmail: item.notesEmail || DEFAULT_NOTES_EMAIL,
          eventCode: item.eventCode || makeEventCode(),
          eventStatus: item.eventStatus || DEFAULT_EVENT_STATUS,
          expiresAt: item.expiresAt || "",
          landingHelpText: item.landingHelpText || DEFAULT_LANDING_HELP,
          landingNoteText: item.landingNoteText || DEFAULT_LANDING_NOTE,
          teachers: normalizeTeachers(item.teachers || []),
          classes: normalizeClasses(item.classes || []),
          students: normalizeStudents(item.students || []),
        }),
      }))
    : [];
}

export default function App() {
  const [mode, setMode] = useState(null);
  const [bootError, setBootError] = useState("");
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState("settings");

  const [school, setSchool] = useState(DEFAULT_SCHOOL);
  const [schoolLogo, setSchoolLogo] = useState("");
  const [evtName, setEvtName] = useState(DEFAULT_EVENT);
  const [evtDate, setEvtDate] = useState("");
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const [notesEmail, setNotesEmail] = useState(DEFAULT_NOTES_EMAIL);
  const [eventCode, setEventCode] = useState(makeEventCode());
  const [eventStatus, setEventStatus] = useState(DEFAULT_EVENT_STATUS);
  const [expiresAt, setExpiresAt] = useState("");
  const [landingHelpText, setLandingHelpText] = useState(DEFAULT_LANDING_HELP);
  const [landingNoteText, setLandingNoteText] = useState(DEFAULT_LANDING_NOTE);
  const [meetingLibrary, setMeetingLibrary] = useState([]);

  const [teachers, setTeachers] = useState(normalizeAdminState().teachers);
  const [classes, setClasses] = useState(normalizeAdminState().classes);
  const [students, setStudents] = useState(normalizeAdminState().students);

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
  const [pendingStaffMode, setPendingStaffMode] = useState("admin");
  const [landingCode, setLandingCode] = useState("");
  const [landingError, setLandingError] = useState("");
  const [language, setLanguage] = useState(() => safeGetStorage("portal_lang") || "en");

  const openParentState = async (raw) => {
    if (raw?.eventCode && raw?.studentId && cloudReady) {
      const remoteEvent = await loadEvent(raw.eventCode);
      if (!remoteEvent) throw new Error("Published event not found.");
      if (!isEventAccessible(remoteEvent)) {
        throw new Error(
          isEventExpired(remoteEvent)
            ? "This meeting link has expired."
            : "This meeting is not available right now."
        );
      }
      const student = (remoteEvent.students || []).find((item) => item.id === raw.studentId);
      if (!student) throw new Error("Family record not found in event.");
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
      if (!isEventAccessible(remoteEvent)) {
        throw new Error(
          isEventExpired(remoteEvent)
            ? `Meeting code ${code} has expired.`
            : `Meeting code ${code} is not available right now.`
        );
      }
      setEntranceData(markEntranceSource(remoteEvent, "cloud"));
      setMode("entrance");
      return;
    }

    if (hash.startsWith("#event=")) {
      const raw = dec(hash.slice(7));
      setEntranceData(markEntranceSource(normalizeAdminState(raw), "local"));
      setMode("entrance");
    }
  };

  useEffect(() => {
    const lk = document.createElement("link");
    lk.href =
      "https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap";
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
          setSchoolLogo(state.schoolLogo);
          setEvtName(state.evtName);
          setEvtDate(state.evtDate);
          setStartTime(state.startTime);
          setEndTime(state.endTime);
          setNotesEmail(state.notesEmail);
          setEventCode(state.eventCode);
          setEventStatus(state.eventStatus);
          setExpiresAt(state.expiresAt);
          setLandingHelpText(state.landingHelpText);
          setLandingNoteText(state.landingNoteText);
          setTeachers(state.teachers);
          setClasses(state.classes);
          setStudents(state.students);
          setMeetingLibrary(loadMeetingLibrary());
        }
        if (!saved) setMeetingLibrary(loadMeetingLibrary());

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
    if (mode !== "admin" && mode !== "frontdesk") return;
    safeSetStorage(
      STORAGE_KEY,
      JSON.stringify({
        school,
        schoolLogo,
        evtName,
        evtDate,
        startTime,
        endTime,
        notesEmail,
        eventCode,
        eventStatus,
        expiresAt,
        landingHelpText,
        landingNoteText,
        teachers,
        classes,
        students,
      })
    );
  }, [
    mode,
    school,
    schoolLogo,
    evtName,
    evtDate,
    startTime,
    endTime,
     notesEmail,
    eventCode,
    eventStatus,
    expiresAt,
    landingHelpText,
    landingNoteText,
    teachers,
    classes,
    students,
  ]);

  useEffect(() => {
    safeSetStorage(MEETING_LIBRARY_KEY, JSON.stringify(meetingLibrary));
  }, [meetingLibrary]);

  const resolvedLogo = schoolLogo || logoImg;

  useEffect(() => {
    if (adminPin) {
      safeSetStorage(ADMIN_PIN_KEY, adminPin);
    }
  }, [adminPin]);

  useEffect(() => {
    safeSetStorage(ADMIN_UNLOCK_KEY, adminUnlocked ? "yes" : "no");
  }, [adminUnlocked]);

  useEffect(() => {
    safeSetStorage("portal_lang", language);
  }, [language]);

  useEffect(() => {
    if (mode !== "parent" || !pData?.keyId) return;
    safeSetStorage(`${PARENT_KEY_PREFIX}${pData.keyId}`, JSON.stringify(meetings));
    if (cloudReady && pData.eventCode && pData.studentId) {
      saveProgress(pData.eventCode, pData.studentId, meetings).catch(() => {});
    }
  }, [mode, pData, meetings]);

  const currentEvent = buildEventPayload({
    school,
    schoolLogo,
    evtName,
    evtDate,
    startTime,
    endTime,
    notesEmail,
    eventCode,
    eventStatus,
    expiresAt,
    landingHelpText,
    landingNoteText,
    teachers,
    classes,
    students,
  });
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
        await navigator.share({ title: `${evtName} - ${student.child}`, text: `${student.child} meeting plan`, url });
        return;
      } catch {}
    }
    copyText(url, `student-${student.id}`);
  };

  const publishCurrentEvent = async () => {
    try {
      if (!cloudReady) throw new Error("Firebase config is missing.");
      if (!eventCode.trim()) throw new Error("Event code is required.");
      setPublishState("Saving event...");
      await publishEvent(eventCode.trim().toUpperCase(), currentEvent);
      setEventCode(eventCode.trim().toUpperCase());
      setPublishState(
        eventStatus === "closed"
          ? "Event saved as closed"
          : eventStatus === "draft"
            ? "Event saved as draft"
            : "Published to Firebase"
      );
    } catch (error) {
      setPublishState(String(error?.message || error));
    }
  };

  const openParentView = (student, source) => {
    const target =
      source?.sourceType === "cloud" && source.eventCode
        ? { eventCode: source.eventCode, studentId: student.id }
        : buildParentPayload(source, student);
    window.location.hash = `p=${enc(target)}`;
  };

  const openEntranceView = () => {
    const open = async () => {
      if (cloudReady && eventCode) {
        try {
          const remoteEvent = await loadEvent(eventCode);
          if (remoteEvent && isEventAccessible(remoteEvent)) {
            window.location.hash = `eventCode=${encodeURIComponent(eventCode)}`;
            setEntranceData(markEntranceSource(remoteEvent, "cloud"));
            setMode("entrance");
            return;
          }
        } catch {}
      }

      window.location.hash = `event=${enc(currentEvent)}`;
      setEntranceData(markEntranceSource(currentEvent, "local"));
      setMode("entrance");
    };

    open();
  };

  const openEntranceByCode = async (rawCode) => {
    const code = String(rawCode || "").trim().toUpperCase();
    if (!code) {
      setLandingError("Enter the meeting code first.");
      return;
    }
    if (!cloudReady) {
      setLandingError("Cloud event lookup is not available on this build.");
      return;
    }

    try {
      const remoteEvent = await loadEvent(code);
      if (!remoteEvent) {
        setLandingError(`No event was found for code ${code}.`);
        return;
      }
      if (!isEventAccessible(remoteEvent)) {
        setLandingError(
          isEventExpired(remoteEvent)
            ? `Meeting code ${code} has expired.`
            : `Meeting code ${code} is not available right now.`
        );
        return;
      }
      setLandingError("");
      setLandingCode(code);
      window.location.hash = `eventCode=${encodeURIComponent(code)}`;
      setEntranceData(markEntranceSource(remoteEvent, "cloud"));
      setMode("entrance");
    } catch (error) {
      setLandingError(String(error?.message || error));
    }
  };

  const openStaffView = (nextMode) => {
    setPendingStaffMode(nextMode);
    if (adminUnlocked) {
      window.location.hash = "";
      setMode(nextMode);
      return;
    }
    if (!adminPin) {
      window.location.hash = "";
      setAdminUnlocked(true);
      setMode(nextMode);
      return;
    }
    setPinDraft("");
    setPinError("");
    setShowAdminGate(true);
  };

  const openAdminView = () => openStaffView("admin");
  const openFrontDeskView = () => openStaffView("frontdesk");

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
      setMode(pendingStaffMode || "admin");
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
    setPendingStaffMode("admin");
  };

  const resetDemoData = () => {
    setSchool(DEFAULT_SCHOOL);
    setSchoolLogo("");
    setEvtName(DEFAULT_EVENT);
    setEvtDate("");
    setStartTime(DEFAULT_START_TIME);
    setEndTime(DEFAULT_END_TIME);
    setNotesEmail(DEFAULT_NOTES_EMAIL);
    setEventCode(makeEventCode());
    setEventStatus(DEFAULT_EVENT_STATUS);
    setExpiresAt("");
    setLandingHelpText(DEFAULT_LANDING_HELP);
    setLandingNoteText(DEFAULT_LANDING_NOTE);
    const defaults = normalizeAdminState();
    setTeachers(defaults.teachers);
    setClasses(defaults.classes);
    setStudents(defaults.students);
    setMeetingLibrary([]);
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
    setSchoolLogo(state.schoolLogo);
    setEvtName(state.evtName);
    setEvtDate(state.evtDate);
    setStartTime(state.startTime);
    setEndTime(state.endTime);
    setNotesEmail(state.notesEmail);
    setEventCode(state.eventCode);
    setEventStatus(state.eventStatus);
    setExpiresAt(state.expiresAt);
    setLandingHelpText(state.landingHelpText);
    setLandingNoteText(state.landingNoteText);
    setTeachers(state.teachers);
    setClasses(state.classes);
    setStudents(state.students);
  };

  const saveMeetingSnapshot = () => {
    const snapshot = {
      id: createId(),
      label: `${evtName || DEFAULT_EVENT}${evtDate ? ` · ${evtDate}` : ""}`,
      createdAt: new Date().toISOString(),
      ...currentEvent,
    };
    setMeetingLibrary((previous) => [snapshot, ...previous.filter((item) => item.eventCode !== snapshot.eventCode)]);
    setPublishState("Meeting snapshot saved");
  };

  const loadMeetingSnapshot = (snapshot) => {
    if (!snapshot) return;
    setSchool(snapshot.school || DEFAULT_SCHOOL);
    setSchoolLogo(snapshot.schoolLogo || "");
    setEvtName(snapshot.evtName || DEFAULT_EVENT);
    setEvtDate(snapshot.evtDate || "");
    setStartTime(snapshot.startTime || DEFAULT_START_TIME);
    setEndTime(snapshot.endTime || DEFAULT_END_TIME);
    setNotesEmail(snapshot.notesEmail || DEFAULT_NOTES_EMAIL);
    setEventCode(snapshot.eventCode || makeEventCode());
    setEventStatus(snapshot.eventStatus || DEFAULT_EVENT_STATUS);
    setExpiresAt(snapshot.expiresAt || "");
    setLandingHelpText(snapshot.landingHelpText || DEFAULT_LANDING_HELP);
    setLandingNoteText(snapshot.landingNoteText || DEFAULT_LANDING_NOTE);
    setTeachers(normalizeTeachers(snapshot.teachers || []));
    setClasses(normalizeClasses(snapshot.classes || []));
    setStudents(normalizeStudents(snapshot.students || []));
    setAdminTab("settings");
    setPublishState("Meeting snapshot loaded");
    goHome();
  };

  const sendEmail = () => {
    if (!pData) return;
    const dateStr = pData.evtDate ? fmtDate(pData.evtDate) : "";
    const timeStr = fmtEventWindow(pData.startTime, pData.endTime);
    const hdr =
      `${pData.evtName} — ${pData.school}` +
      `${dateStr ? `\n${dateStr}` : ""}` +
      `${timeStr ? `\n${timeStr}` : ""}` +
      `${pData.child ? `\nChild: ${pData.child}` : ""}` +
      `${pData.className ? `\nClass: ${pData.className}` : ""}` +
      `\n${"─".repeat(38)}\n\n`;

    const body =
      hdr +
      (pData.teachers || [])
        .map((t) => {
          const m = meetings?.[t.id] || {};
          return `${t.status === "unavailable" ? "–" : m.done ? "✓" : "○"} ${t.name} (${t.subject})${t.time ? ` · ${t.time}` : ""}${t.room ? ` · ${t.room}` : ""}${t.floor ? ` · ${t.floor}` : ""}${t.status === "unavailable" && t.note ? `\nUnavailable: ${t.note}` : ""}${m.followUp ? "\nNeeds follow-up" : ""}${m.notes ? `\n${m.notes}` : ""}`;
        })
        .join("\n\n");

    window.location.href = `mailto:?subject=${encodeURIComponent(
      `${pData.evtName} Notes${pData.child ? ` — ${pData.child}` : ""}`
    )}&body=${encodeURIComponent(body)}`;
  };

  if (loading) return <LoadingScreen label="Loading event" language={language} setLanguage={setLanguage} />;
  if (mode === "error") return <ErrorScreen message={bootError} language={language} setLanguage={setLanguage} />;

  if (mode === "entrance" && entranceData) {
    return <EntranceView data={entranceData} copyText={copyText} copied={copied} openParentView={openParentView} onBack={goHome} language={language} setLanguage={setLanguage} />;
  }

  if (mode === "parent" && pData) {
    const ts = Array.isArray(pData?.teachers) ? pData.teachers : [];
    const done = Object.values(meetings || {}).filter((m) => m?.done).length;
    const followUpCount = Object.values(meetings || {}).filter((m) => m?.followUp).length;
    const total = ts.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const all = done === total && total > 0;

    return (
      <div style={{ minHeight: "100vh", background: CR, fontFamily: "'DM Sans',sans-serif", maxWidth: 480, margin: "0 auto", paddingBottom: 100, position: "relative" }}>
        <LanguageToggle language={language} setLanguage={setLanguage} dark />
        <div style={{ background: G, padding: "26px 20px 24px", color: "white" }}>
          <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", opacity: 0.5, marginBottom: 6 }}>{pData.school}</div>
          <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 30, fontWeight: 800, lineHeight: 1.08, marginBottom: 4 }}>{pData.evtName}</div>
          {pData.child && <div style={{ fontSize: 16, fontWeight: 600, opacity: 0.88, marginBottom: 2 }}>{pData.child}{pData.parent ? ` · ${pData.parent}` : ""}</div>}
          {(pData.evtDate || pData.startTime || pData.endTime) && (
            <div style={{ fontSize: 12, opacity: 0.5 }}>
              {[pData.evtDate ? fmtDate(pData.evtDate) : "", fmtEventWindow(pData.startTime, pData.endTime)]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 14, padding: "14px 16px", marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                {all ? "All done!" : `${total - done} meeting${total - done !== 1 ? "s" : ""} remaining`}
                {followUpCount ? ` · ${followUpCount} need follow-up` : ""}
              </div>
              <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 24, fontWeight: 800 }}>{pct}%</div>
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
              <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 22, fontWeight: 800, color: G, marginBottom: 8 }}>No teachers assigned yet</div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: "#75695E" }}>
                This family does not have a meeting plan yet. Please check with the staff desk.
              </div>
            </Card>
          )}
          {ts.map((t) => {
            const m = meetings?.[t.id] || {};
            const ex = expanded === t.id;
            const unavailable = t.status === "unavailable";
            return (
              <div key={t.id} style={{ background: unavailable ? "#F3F0EC" : m.done ? "#F0F7F3" : "white", borderRadius: 18, marginBottom: 10, border: unavailable ? "2px solid #E4DDD3" : m.done ? `2px solid ${G}22` : "2px solid transparent", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden", opacity: unavailable ? 0.78 : 1 }}>
                <div style={{ padding: "15px 16px", display: "flex", alignItems: "center", gap: 13 }}>
                  <button
                    onClick={() => {
                      if (unavailable) return;
                      setMeetings((p) => ({ ...p, [t.id]: { ...p[t.id], done: !p[t.id]?.done } }));
                    }}
                    disabled={unavailable}
                    style={{ width: 36, height: 36, borderRadius: "50%", border: unavailable ? "2.5px solid #D8CEC2" : m.done ? `2.5px solid ${G}` : "2.5px solid #D4CCC4", background: unavailable ? "#EEE7DD" : m.done ? G : "transparent", cursor: unavailable ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  >
                    {unavailable ? <span style={{ color: "#9E907F", fontSize: 16 }}>–</span> : m.done && <span style={{ color: "white", fontSize: 17 }}>✓</span>}
                  </button>
                  <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(ex ? null : t.id)}>
                    <div style={{ fontWeight: 700, fontSize: 17, color: unavailable ? "#8E8172" : m.done ? "#5A7A65" : "#1C1C1C", textDecoration: m.done ? "line-through" : "none" }}>{t.name}</div>
                    <div style={{ fontSize: 14, color: "#9A9A9A", marginTop: 3 }}>
                      {[t.subject, t.room, t.floor].filter(Boolean).join(" · ")}
                      {unavailable && t.note ? ` · absent: ${t.note}` : ""}
                      {m.followUp ? " · needs follow-up" : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", cursor: "pointer", flexShrink: 0 }} onClick={() => setExpanded(ex ? null : t.id)}>
                    {unavailable ? <div style={{ fontSize: 12, fontWeight: 700, color: "#9E907F" }}>Unavailable</div> : t.time && <div style={{ fontSize: 12, fontWeight: 700, color: A }}>{t.time}</div>}
                    <div style={{ fontSize: 12, marginTop: 4, color: m.notes ? G : "#BBBBBB" }}>{m.notes ? "📝" : unavailable ? "info ▾" : "note ▾"}</div>
                  </div>
                </div>
                {ex && (
                  <div style={{ borderTop: "1px solid #ECEAE6", padding: "14px 16px", background: "rgba(255,255,255,0.5)" }}>
                    {unavailable && t.note && (
                      <div style={{ background: "#EEE7DD", color: "#7B6D5D", borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
                        This teacher is unavailable. Note: {t.note}
                      </div>
                    )}
                    {!unavailable && (
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <button
                          onClick={() =>
                            setMeetings((p) => ({
                              ...p,
                              [t.id]: { ...p[t.id], followUp: !p[t.id]?.followUp },
                            }))
                          }
                          style={{
                            background: m.followUp ? "#FFF0E3" : "#F5F2EE",
                            color: m.followUp ? A : "#6F655B",
                            border: m.followUp ? `1.5px solid ${A}` : "1.5px solid #E0D8CC",
                            borderRadius: 999,
                            padding: "8px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {m.followUp ? "Needs follow-up" : "Mark for follow-up"}
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#9A9A9A", marginBottom: 8 }}>Notes</div>
                    <textarea disabled={unavailable} value={m.notes || ""} onChange={(e) => setMeetings((p) => ({ ...p, [t.id]: { ...p[t.id], notes: e.target.value } }))} rows={3} style={{ width: "100%", border: "1.5px solid #E0D8CC", borderRadius: 12, padding: "10px 14px", fontSize: 14, resize: "none", fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box", background: unavailable ? "#F6F1EA" : "white", color: unavailable ? "#9E907F" : "#1C1C1C" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, padding: "12px 16px 28px", background: `linear-gradient(to top,${CR} 65%,transparent)` }}>
          <button onClick={sendEmail} style={{ width: "100%", padding: "16px 20px", background: all ? G : done > 0 ? A : "#C4BDB5", color: "white", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
            {all ? "Email notes to myself" : done > 0 || followUpCount > 0 ? `Email notes so far (${done}/${total})` : "Open email draft"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "frontdesk") {
    return (
      <FrontDeskView
        logoSrc={resolvedLogo}
        school={school}
        schoolLogo={schoolLogo}
        evtName={evtName}
        evtDate={evtDate}
        startTime={startTime}
        endTime={endTime}
        students={students}
        classes={classes}
        onBack={goHome}
        onLock={lockAdmin}
        onMarkArrived={(studentId) => {
          setStudents((previous) =>
            previous.map((student) => {
              if (student.id !== studentId) return student;
              const arrivedAt = student.arrivedAt ? null : new Date().toISOString();
              return {
                ...student,
                arrivedAt,
                arrivedMarkedBy: arrivedAt ? "frontdesk" : null,
              };
            })
          );
        }}
        language={language}
        setLanguage={setLanguage}
      />
    );
  }

  if (mode === "home") {
    return (
      <>
        <HomeView
          logoSrc={resolvedLogo}
          cloudReady={cloudReady}
          publishState={publishState}
          onOpenEntrance={openEntranceByCode}
          onOpenAdmin={openAdminView}
          onOpenFrontDesk={openFrontDeskView}
          adminConfigured={Boolean(adminPin)}
          landingCode={landingCode}
          setLandingCode={setLandingCode}
          landingError={landingError}
          school={school}
          schoolLogo={schoolLogo}
          evtName={evtName}
          evtDate={evtDate}
          startTime={startTime}
          endTime={endTime}
          landingHelpText={landingHelpText}
          landingNoteText={landingNoteText}
          language={language}
          setLanguage={setLanguage}
        />
        {showEventQr && (
          <QrModal
            title="Entrance QR"
            subtitle={cloudReady ? "Parents scan, type the child name, and open the meeting plan from a short event link." : "Firebase config missing, so this falls back to local-only QR data."}
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
      logoSrc={resolvedLogo}
      school={school}
      schoolLogo={schoolLogo}
      evtName={evtName}
      evtDate={evtDate}
      startTime={startTime}
      endTime={endTime}
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
      language={language}
      setLanguage={setLanguage}
    >
      <div style={{ padding: "18px 16px 120px" }}>
        {adminTab === "meetings" && (
          <MeetingsTab
            meetings={meetingLibrary}
            currentEvent={currentEvent}
            onSaveSnapshot={saveMeetingSnapshot}
            onLoadSnapshot={loadMeetingSnapshot}
          />
        )}
        {adminTab === "teachers" && (
          <TeachersTab
            teachers={teachers}
            setTeachers={setTeachers}
            classes={classes}
            setClasses={setClasses}
            onRemove={(id) => {
              setTeachers((p) => p.filter((t) => t.id !== id));
              setClasses((p) => p.map((c) => ({ ...c, tids: Array.isArray(c.tids) ? c.tids.filter((x) => x !== id) : [] })));
            }}
          />
        )}
        {adminTab === "settings" && (
          <SettingsTab
            logoSrc={resolvedLogo}
            school={school}
            setSchool={setSchool}
            schoolLogo={schoolLogo}
            setSchoolLogo={setSchoolLogo}
            evtName={evtName}
            setEvtName={setEvtName}
            evtDate={evtDate}
            setEvtDate={setEvtDate}
            startTime={startTime}
            setStartTime={setStartTime}
            endTime={endTime}
            setEndTime={setEndTime}
            notesEmail={notesEmail}
            setNotesEmail={setNotesEmail}
            eventCode={eventCode}
            setEventCode={setEventCode}
            eventStatus={eventStatus}
            setEventStatus={setEventStatus}
            expiresAt={expiresAt}
            setExpiresAt={setExpiresAt}
            landingHelpText={landingHelpText}
            setLandingHelpText={setLandingHelpText}
            landingNoteText={landingNoteText}
            setLandingNoteText={setLandingNoteText}
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
          subtitle={cloudReady ? "Parents scan, type the child name, and open the meeting plan from a short event link." : "Firebase config missing, so this falls back to local-only QR data."}
          imageUrl={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(eventUrl)}&bgcolor=F5F0E8&color=1B3A2D&margin=6`}
          footer={cloudReady ? `Event code ${eventCode}` : "Configure Firebase env vars for cloud mode"}
          primaryLabel={copied === "event-link" ? "✓ Link copied" : "Copy entrance link"}
          onPrimary={() => copyText(eventUrl, "event-link")}
          onClose={() => setShowEventQr(false)}
        />
      )}

      {qrStu && (
        <QrModal
          title={qrStu.parent ? `${qrStu.parent} · ${qrStu.child}` : qrStu.child}
          subtitle={`${classes.find((c) => c.id === qrStu.cid)?.name || ""}${qrStu.parent ? ` · ${qrStu.parent}` : ""}`}
          imageUrl={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(studentUrl(qrStu))}&bgcolor=F5F0E8&color=1B3A2D&margin=6`}
          footer={`${(() => {
            const cls = classes.find((c) => c.id === qrStu.cid);
            return cls ? teachers.filter((t) => (cls.tids || []).includes(t.id) && t.status !== "unavailable").length : 0;
          })()} teachers on this list`}
          primaryLabel={copied === `student-${qrStu.id}` ? "✓ Link copied" : "Copy family link"}
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

function EntranceView({ data, copyText, copied, openParentView, onBack, language, setLanguage }) {
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
    <div style={{ minHeight: "100vh", background: CR, maxWidth: 520, margin: "0 auto", paddingBottom: 28, fontFamily: "'DM Sans',sans-serif", position: "relative" }}>
      <LanguageToggle language={language} setLanguage={setLanguage} dark />
      <div style={{ background: G, color: "white", padding: "28px 20px 22px" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.14)", color: "white", border: "none", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
          ← Home
        </button>
        <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", opacity: 0.55, marginBottom: 8 }}>Meeting Lookup</div>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 32, fontWeight: 800, lineHeight: 1.05, marginBottom: 6 }}>{data.evtName}</div>
        <div style={{ fontSize: 16, fontWeight: 600, opacity: 0.86 }}>{data.school}</div>
        <div style={{ fontSize: 13, opacity: 0.62, marginTop: 4 }}>
          {[data.evtDate ? fmtDate(data.evtDate) : "", fmtEventWindow(data.startTime, data.endTime)]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div style={{ marginTop: 18, background: "rgba(255,255,255,0.12)", borderRadius: 16, padding: "14px 16px" }}>
          Type at least 2 letters from the student name to reveal matches.
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <Card>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search child name" style={{ ...iBase, marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            <Chip label={`All classes (${(data.students || []).length})`} active={selectedClass === "all"} onClick={() => setSelectedClass("all")} />
            {(data.classes || []).map((cls) => (
              <Chip key={cls.id} label={cls.name} active={selectedClass === String(cls.id)} onClick={() => setSelectedClass(String(cls.id))} />
            ))}
          </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 22, fontWeight: 800, color: G }}>Families <N n={visibleStudents.length} /></div>
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
                  <div style={{ fontSize: 18, fontWeight: 800, color: G }}>{student.child}</div>
                  <div style={{ fontSize: 14, color: "#857A70", marginTop: 3 }}>
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

        {revealResults && !visibleStudents.length && <Empty>No matching families found</Empty>}
      </div>
    </div>
  );
}

function HomeView({
  logoSrc,
  cloudReady,
  publishState,
  onOpenEntrance,
  onOpenAdmin,
  onOpenFrontDesk,
  adminConfigured,
  landingCode,
  setLandingCode,
  landingError,
  school,
  schoolLogo,
  evtName,
  evtDate,
  startTime,
  endTime,
  landingHelpText,
  landingNoteText,
  language,
  setLanguage,
}) {
  const statusLabel = cloudReady
    ? publishState || "Enter the meeting code from the school to open your meeting plan."
    : "Cloud event lookup is unavailable on this build.";
  const landingSchool = school || "TED Bursa Koleji";
  const landingEvent = evtName || "Veli Toplantısı Portalı";
  const topWelcome = language === "tr" ? "Okul Toplantı Portalına Hoş Geldiniz" : "Welcome to the School Meeting Portal";
  const entryPrompt = language === "tr" ? "Toplantı kodunuzu girin" : "Enter your meeting code";
  const loginLabel = language === "tr" ? "Toplantı Portalına Giriş" : "Login to the Meeting Portal";
  const howToStartLabel = language === "tr" ? "Nasıl Yapılır" : "How it is Done";
  const langButtonLabel = language === "tr" ? "EN" : "TR";

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'DM Sans',sans-serif", maxWidth: 520, margin: "0 auto" }}>
      <div style={{ background: `linear-gradient(180deg, ${G2} 0%, ${G} 100%)`, color: "white", padding: "20px 20px 42px", position: "relative" }}>
        <button
          onClick={() => setLanguage(language === "tr" ? "en" : "tr")}
          style={{ position: "absolute", top: 18, right: 20, background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.92)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          {langButtonLabel}
        </button>
        <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", opacity: 0.55, textAlign: "center", marginBottom: 8 }}>{topWelcome}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: 34, marginBottom: 22 }}>
          <div style={{ width: 168, minHeight: 168, borderRadius: 38, background: "#FFFFFF", border: "1px solid rgba(255,255,255,0.32)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", marginBottom: 22, overflow: "hidden", padding: 18, boxSizing: "border-box" }}>
            <img src={logoSrc} alt={`${landingSchool} logo`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 32, fontWeight: 800, lineHeight: 1.05, marginBottom: 6 }}>{landingSchool}</div>
          <div style={{ fontSize: 18, opacity: 0.92 }}>{landingEvent}</div>
          <div style={{ fontSize: 13, opacity: 0.68, marginTop: 8 }}>
            {[evtDate ? fmtDate(evtDate) : "", fmtEventWindow(startTime, endTime)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ marginTop: 22, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.16)", backdropFilter: "blur(6px)", borderRadius: 22, padding: "20px 16px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.88)", textAlign: "center", marginBottom: 14, lineHeight: 1.4 }}>
            {entryPrompt}
          </div>
          <input
            value={landingCode}
            onChange={(event) => setLandingCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") onOpenEntrance(landingCode);
            }}
            placeholder="_  _  _  _  _  _"
            maxLength={6}
            style={{
              ...iBase,
              marginTop: 0,
              height: 60,
              padding: "0 18px",
              background: "rgba(255,255,255,0.98)",
              textAlign: "center",
              borderColor: "rgba(212,167,63,0.22)",
              borderRadius: 16,
              color: "#334155",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              boxShadow: "inset 0 1px 2px rgba(15,23,42,0.04)"
            }}
          />
          <Btn amber full onClick={() => onOpenEntrance(landingCode)} style={{ padding: "16px 16px", fontSize: 15, marginTop: 12, borderRadius: 16 }}>
            {loginLabel}
          </Btn>
          {landingError && <div style={{ marginTop: 10, fontSize: 12, color: "#FFD5D5", textAlign: "center" }}>{landingError}</div>}
        </div>
      </div>

      <div style={{ background: CR, padding: "16px 16px 14px" }}>
        <Card>
          <SLabel>{howToStartLabel}</SLabel>
          <div style={{ background: cloudReady ? "#E8F0EC" : "#FFF0E3", borderRadius: 14, padding: "12px 14px", fontSize: 13, color: G, marginBottom: 14 }}>
            {landingHelpText || statusLabel}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "#75695E" }}>
            {landingNoteText || "Parents can scan the printed QR code or enter the meeting code provided by the school."}
          </div>

        </Card>
      </div>

      <div style={{ background: "#FFFFFF", padding: "10px 16px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10 }}>
          <button
            onClick={onOpenFrontDesk}
            style={{
              background: "transparent",
              color: "rgba(58, 86, 115, 0.72)",
              border: "1px solid rgba(58, 86, 115, 0.18)",
              borderRadius: 999,
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Front desk
          </button>
        </div>
        <button
          onClick={onOpenAdmin}
          style={{
            background: "transparent",
            color: "rgba(58, 86, 115, 0.42)",
            border: "none",
            padding: 0,
            fontSize: 11,
            textDecoration: "none",
            cursor: "pointer",
            display: "inline-block"
          }}
        >
          {adminConfigured ? "Staff login" : "Staff dashboard"}
        </button>
      </div>
    </div>
  );
}

function AdminDashboard({
  logoSrc,
  school,
  schoolLogo,
  evtName,
  evtDate,
  startTime,
  endTime,
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
  language,
  setLanguage,
}) {
  return (
    <div style={{ minHeight: "100vh", background: CR, fontFamily: "'DM Sans',sans-serif", maxWidth: 520, margin: "0 auto", position: "relative" }}>
      <LanguageToggle language={language} setLanguage={setLanguage} dark />
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <img src={logoSrc} alt={`${school} logo`} style={{ width: 48, height: 48, borderRadius: 14, objectFit: "contain", background: "#FFFFFF", padding: 6, boxSizing: "border-box", flexShrink: 0 }} />
          <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 28, fontWeight: 800, lineHeight: 1.05 }}>{school}</div>
        </div>
        <div style={{ fontSize: 15, opacity: 0.88 }}>{evtName}</div>
        <div style={{ fontSize: 12, opacity: 0.58, marginTop: 4 }}>
          {[evtDate ? fmtDate(evtDate) : "", fmtEventWindow(startTime, endTime), notesEmail || "", eventCode ? `Code ${eventCode}` : ""]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 18, marginBottom: 14 }}>
          {[
            { label: "Teachers", value: teacherCount },
            { label: "Classes", value: classCount },
            { label: "Families", value: studentCount },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 22, fontWeight: 800 }}>{item.value}</div>
              <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Btn full amber onClick={onOpenEventQr}>Entrance QR</Btn>
          <Btn full light onClick={onOpenEntrance}>Family lookup</Btn>
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
        {[["settings", "Settings"], ["meetings", "Meetings"], ["teachers", "Teachers"], ["classes", "Classes"], ["students", "Families & QR"]].map(([tab, label]) => (
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

function SettingsTab({
  logoSrc,
  school,
  setSchool,
  schoolLogo,
  setSchoolLogo,
  evtName,
  setEvtName,
  evtDate,
  setEvtDate,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  notesEmail,
  setNotesEmail,
  eventCode,
  setEventCode,
  eventStatus,
  setEventStatus,
  expiresAt,
  setExpiresAt,
  landingHelpText,
  setLandingHelpText,
  landingNoteText,
  setLandingNoteText,
  onResetDemo,
  onPublish,
  publishState,
  onDownloadSetup,
  onImportSetup,
  adminPin,
  setAdminPin,
}) {
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onImportSetup(JSON.parse(text));
    event.target.value = "";
  };

  const importLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSchoolLogo(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return (
    <div>
      <div style={{ background: "white", borderRadius: 16, padding: "16px 18px", marginBottom: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <SLabel>Event Details</SLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <img src={logoSrc} alt={`${school} logo`} style={{ width: 56, height: 56, borderRadius: 16, objectFit: "contain", background: "#F5F0E8", padding: 6, boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn light onClick={() => logoInputRef.current?.click()}>Upload logo</Btn>
            {schoolLogo && <Btn light onClick={() => setSchoolLogo("")}>Remove logo</Btn>}
          </div>
        </div>
        <input ref={logoInputRef} type="file" accept="image/*" onChange={importLogo} style={{ display: "none" }} />
        <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="School name" style={{ ...iBase, marginBottom: 8 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input value={evtName} onChange={(e) => setEvtName(e.target.value)} placeholder="Event name" style={iBase} />
          <input type="date" value={evtDate} onChange={(e) => setEvtDate(e.target.value)} style={iBase} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)} style={iBase}>
            {TIME_OPTIONS.map((time) => (
              <option key={`start-${time}`} value={time}>{time}</option>
            ))}
          </select>
          <select value={endTime} onChange={(e) => setEndTime(e.target.value)} style={iBase}>
            {TIME_OPTIONS.map((time) => (
              <option key={`end-${time}`} value={time}>{time}</option>
            ))}
          </select>
        </div>
        <input value={notesEmail} onChange={(e) => setNotesEmail(e.target.value)} placeholder="Default notes email" style={{ ...iBase, marginBottom: 8 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 }}>
          <input value={eventCode} onChange={(e) => setEventCode(e.target.value.toUpperCase())} placeholder="Event code" style={iBase} />
          <Btn light onClick={() => setEventCode(makeEventCode())}>New code</Btn>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <select value={eventStatus} onChange={(e) => setEventStatus(e.target.value)} style={iBase}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </select>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={iBase} />
        </div>
        <textarea
          value={landingHelpText}
          onChange={(e) => setLandingHelpText(e.target.value)}
          rows={3}
          placeholder="Landing page highlight text"
          style={{ ...iBase, marginBottom: 8, resize: "vertical", minHeight: 86 }}
        />
        <textarea
          value={landingNoteText}
          onChange={(e) => setLandingNoteText(e.target.value)}
          rows={3}
          placeholder="Landing page helper text below the box"
          style={{ ...iBase, marginBottom: 12, resize: "vertical", minHeight: 86 }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <Btn full light onClick={onDownloadSetup}>Download setup</Btn>
          <Btn full light onClick={() => fileInputRef.current?.click()}>Import setup</Btn>
        </div>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={importFile} style={{ display: "none" }} />
        <Btn amber full onClick={onPublish}>{cloudReady ? "Save event to Firebase" : "Firebase config missing"}</Btn>
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
      <Card>
        <SLabel>Reset</SLabel>
        <div style={{ fontSize: 14, color: "#75695E", lineHeight: 1.6, marginBottom: 12 }}>
          Reset restores the demo data, clears the uploaded logo, and creates a new event code.
        </div>
        <Btn light onClick={onResetDemo}>Reset demo data</Btn>
      </Card>
    </div>
  );
}

function TeachersTab({ teachers, setTeachers, classes, setClasses, onRemove }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", room: "", floor: "", time: "", status: "active", note: "" });
  const [editId, setEditId] = useState(null);
  const [assignId, setAssignId] = useState(null);
  const [editFm, setEditFm] = useState({});
  const csvInputRef = useRef(null);

  const addT = () => {
    if (!form.name) return;
    setTeachers((p) => [...p, { ...form, id: createId() }]);
    setForm({ name: "", subject: "", room: "", floor: "", time: "", status: "active", note: "" });
    setShowAdd(false);
  };

  const saveEdit = () => {
    setTeachers((p) => p.map((t) => (t.id === editId ? { ...t, ...editFm } : t)));
    setEditId(null);
  };

  const importTeacherCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const nextTeachers = importTeachersFromCsv(text);
    if (nextTeachers.length) {
      setTeachers((previous) => [...previous, ...nextTeachers]);
    }
    event.target.value = "";
  };

  const downloadTeacherTemplate = () => {
    downloadTextFile("teachers-template.csv", TEACHER_TEMPLATE_CSV, "text/csv;charset=utf-8;");
  };

  const toggleTeacherClass = (teacherId, classId) => {
    setClasses((previous) =>
      previous.map((cls) =>
        cls.id !== classId
          ? cls
          : {
              ...cls,
              tids: (cls.tids || []).includes(teacherId)
                ? (cls.tids || []).filter((id) => id !== teacherId)
                : [...(cls.tids || []), teacherId],
            }
      )
    );
  };

  return (
    <div>
      <Row>
        <SHead>Teachers <N n={teachers.length} /></SHead>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={downloadTeacherTemplate} light>Example CSV</Btn>
          <Btn onClick={() => csvInputRef.current?.click()} light>Import CSV</Btn>
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
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 13, color: "#9A9A9A", marginTop: 3 }}>
                    {[t.subject, t.room, t.floor, t.status === "unavailable" ? "İzinli" : t.time, t.note].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ fontSize: 12, color: "#7D746C", marginTop: 6 }}>
                    {(classes || []).filter((cls) => (cls.tids || []).includes(t.id)).map((cls) => cls.name).join(", ") || "No classes assigned"}
                  </div>
                </div>
                <Btn light onClick={() => setAssignId(assignId === t.id ? null : t.id)}>
                  {assignId === t.id ? "Done" : "Classes"}
                </Btn>
                <IBtn onClick={() => { setEditId(t.id); setEditFm({ ...t }); }}>✎</IBtn>
                <IBtn onClick={() => onRemove(t.id)} red>✕</IBtn>
              </div>
              {assignId === t.id && (
                <div style={{ borderTop: "1px solid #F0EBE3", marginTop: 12, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#9A9A9A", marginBottom: 8 }}>
                    Assign Classes
                  </div>
                  {(classes || []).map((cls) => {
                    const checked = (cls.tids || []).includes(t.id);
                    const studentCount = cls.id ? classTeacherCount({ classes, teachers, students: [] }, cls.id) : 0;
                    return (
                      <div
                        key={cls.id}
                        onClick={() => toggleTeacherClass(t.id, cls.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 0",
                          borderBottom: "1px solid #F5F2EE",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            border: checked ? `2px solid ${G}` : "2px solid #D4CCC4",
                            background: checked ? G : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {checked && <span style={{ color: "white", fontSize: 13 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{cls.name}</div>
                          <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 2 }}>
                            {studentCount} active teachers on this class
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
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
  const csvInputRef = useRef(null);

  const addC = () => {
    if (!newName.trim()) return;
    setClasses((p) => [...p, { id: createId(), name: newName.trim(), tids: [] }]);
    setNewName("");
    setShowAdd(false);
  };

  const importClassCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const nextClasses = importClassesFromCsv(text, teachers);
    if (nextClasses.length) {
      setClasses((previous) => [...previous, ...nextClasses]);
    }
    event.target.value = "";
  };

  const downloadClassTemplate = () => {
    downloadTextFile("classes-template.csv", CLASS_TEMPLATE_CSV, "text/csv;charset=utf-8;");
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
      <Row>
        <SHead>Classes <N n={classes.length} /></SHead>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={downloadClassTemplate} light>Example CSV</Btn>
          <Btn onClick={() => csvInputRef.current?.click()} light>Import CSV</Btn>
          <Btn onClick={() => setShowAdd((p) => !p)} amber={!showAdd}>{showAdd ? "Cancel" : "+ Add"}</Btn>
        </div>
      </Row>
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={importClassCsv} style={{ display: "none" }} />
      {showAdd && <Card border><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Class name" style={{ ...iBase, marginBottom: 10 }} /><Btn onClick={addC} amber full>Add Class</Btn></Card>}
      {classes.map((cls) => {
        const isOpen = openId === cls.id;
        const stuCount = students.filter((s) => s.cid === cls.id).length;
        const activeTeacherCount = teachers.filter((t) => (cls?.tids || []).includes(t.id) && t.status !== "unavailable").length;
        return (
          <div key={cls.id} style={{ background: "white", borderRadius: 16, marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: G }}>{cls.name}</div>
                <div style={{ fontSize: 13, color: "#9A9A9A", marginTop: 3 }}>{activeTeacherCount} teachers · {stuCount} students</div>
              </div>
              <Btn onClick={() => setOpenId(isOpen ? null : cls.id)} style={{ background: isOpen ? G : "#E8F0EC", color: isOpen ? "white" : G }}>{isOpen ? "Done ✓" : "Edit Teachers"}</Btn>
              <IBtn onClick={() => onRemove(cls.id)} red>✕</IBtn>
            </div>
            {isOpen && (
              <div style={{ borderTop: "1px solid #F0EBE3", padding: "12px 16px" }}>
                {teachers.map((t, i) => {
                  const checked = (cls?.tids || []).includes(t.id);
                  const unavailable = t.status === "unavailable";
                  return (
                    <div key={t.id} onClick={() => { toggleT(cls.id, t.id); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < teachers.length - 1 ? "1px solid #F5F2EE" : "none", cursor: "pointer", opacity: unavailable ? 0.72 : 1 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, border: checked ? `2px solid ${G}` : "2px solid #D4CCC4", background: checked ? G : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{checked && <span style={{ color: "white", fontSize: 13 }}>✓</span>}</div>
                      <div><div style={{ fontSize: 15, fontWeight: 700 }}>{t.name}{unavailable ? " · Unavailable" : ""}</div><div style={{ fontSize: 13, color: "#9A9A9A", marginTop: 2 }}>{[t.subject, t.room, t.floor, unavailable ? t.note || "Unavailable" : t.time].filter(Boolean).join(" · ")}</div></div>
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
    setStudents((p) => [...p, { ...form, cid: form.cid ? Number(form.cid) : null, id: createId() }]);
    setForm((p) => ({ child: "", parent: "", cid: p.cid }));
    setShowAdd(false);
  };

  const addBulk = () => {
    const names = bulkText.split("\n").map((n) => n.trim()).filter(Boolean);
    setStudents((p) => [...p, ...names.map((child) => ({ id: createId(), child, parent: "", cid: bulkCid ? Number(bulkCid) : null }))]);
    setBulkText("");
    setBulk(false);
  };

  const visible = students.filter((s) => filter === "all" || s.cid === Number(filter));

  const importStudentCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const nextStudents = importStudentsFromCsv(text, classes);
    if (nextStudents.length) {
      setStudents((previous) => [...previous, ...nextStudents]);
    }
    event.target.value = "";
  };

  const downloadStudentTemplate = () => {
    downloadTextFile("students-template.csv", STUDENT_TEMPLATE_CSV, "text/csv;charset=utf-8;");
  };

  return (
    <div>
      <Card>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 20, fontWeight: 800, color: G, marginBottom: 6 }}>Entrance Sharing</div>
        <div style={{ fontSize: 14, color: "#7D746C", marginBottom: 12 }}>
          {cloudReady ? "Use one entrance QR after publishing the event to Firebase." : "Firebase config missing, so only per-family QR links will work reliably."}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn full onClick={onOpenEventQr}>Open Entrance QR</Btn>
          <Btn full light disabled>{publishState || (cloudReady ? "Ready to publish" : "Cloud off")}</Btn>
        </div>
      </Card>

      <Row>
        <SHead>Families <N n={students.length} /></SHead>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={downloadStudentTemplate} light>Example CSV</Btn>
          <Btn onClick={() => csvInputRef.current?.click()} light>Import CSV</Btn>
          <Btn onClick={() => { setBulk((p) => !p); setShowAdd(false); }} light>{bulk ? "Cancel" : "Bulk ↓"}</Btn>
          <Btn onClick={() => { setShowAdd((p) => !p); setBulk(false); }} amber={!showAdd}>{showAdd ? "Cancel" : "+ Add"}</Btn>
        </div>
      </Row>
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={importStudentCsv} style={{ display: "none" }} />

      {showAdd && (
        <Card border>
          <input value={form.child} onChange={(e) => setForm((p) => ({ ...p, child: e.target.value }))} placeholder="Child name *" style={{ ...iBase, marginBottom: 8 }} />
          <input value={form.parent} onChange={(e) => setForm((p) => ({ ...p, parent: e.target.value }))} placeholder="Parent name" style={{ ...iBase, marginBottom: 8 }} />
          <select value={form.cid} onChange={(e) => setForm((p) => ({ ...p, cid: e.target.value }))} style={{ ...iBase, marginBottom: 12 }}>
            <option value="">Assign to class…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Btn onClick={addOne} amber full>Add Family</Btn>
        </Card>
      )}

      {bulk && (
        <Card border>
          <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={5} style={{ width: "100%", border: "1.5px solid #E0D8CC", borderRadius: 10, padding: "10px 12px", fontSize: 14, boxSizing: "border-box", resize: "none", marginBottom: 8 }} />
          <select value={bulkCid} onChange={(e) => setBulkCid(e.target.value)} style={{ ...iBase, marginBottom: 12 }}>
            <option value="">Assign to class…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Btn onClick={addBulk} amber full disabled={!bulkText.trim()}>Add {bulkText.split("\n").filter((n) => n.trim()).length} Families</Btn>
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
              <div style={{ fontSize: 17, fontWeight: 800 }}>{s.child}</div>
              <div style={{ fontSize: 13, color: cls ? "#9A9A9A" : "#D44", marginTop: 3 }}>
                {cls ? `${cls.name} · ${activeTeacherCount} teacher${activeTeacherCount !== 1 ? "s" : ""}` : "⚠ No class assigned"}
                {s.parent ? ` · ${s.parent}` : ""}
                {s.arrivedAt ? " · arrived" : ""}
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

function MeetingsTab({ meetings, currentEvent, onSaveSnapshot, onLoadSnapshot }) {
  const sortedMeetings = Array.isArray(meetings) ? meetings : [];

  return (
    <div>
      <Card>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 20, fontWeight: 800, color: G, marginBottom: 6 }}>Meeting Library</div>
        <div style={{ fontSize: 14, color: "#7D746C", marginBottom: 12 }}>
          Save the current event as a reusable snapshot, then reload it later without rebuilding the whole setup.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn amber onClick={onSaveSnapshot}>Save current meeting</Btn>
          <Btn light onClick={() => onLoadSnapshot(currentEvent)}>Reload current state</Btn>
        </div>
      </Card>

      <Row>
        <SHead>Saved meetings <N n={sortedMeetings.length} /></SHead>
      </Row>

      {sortedMeetings.map((meeting) => (
        <Card key={meeting.id} border>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{meeting.label || meeting.evtName || "Saved meeting"}</div>
              <div style={{ fontSize: 13, color: "#9A9A9A", marginTop: 3 }}>
                {[meeting.evtDate ? fmtDate(meeting.evtDate) : "", meeting.eventCode ? `Code ${meeting.eventCode}` : "", meeting.createdAt ? new Date(meeting.createdAt).toLocaleString() : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div style={{ fontSize: 12, color: "#7D746C", marginTop: 8, lineHeight: 1.5 }}>
                {meeting.school || DEFAULT_SCHOOL}
                {" · "}
                {meeting.classes?.length || 0} classes
                {" · "}
                {meeting.students?.length || 0} students
              </div>
            </div>
            <Btn onClick={() => onLoadSnapshot(meeting)}>Load</Btn>
          </div>
        </Card>
      ))}

      {!sortedMeetings.length && (
        <Empty>No saved meetings yet. Save the current meeting to start building a library.</Empty>
      )}
    </div>
  );
}

function FrontDeskView({ logoSrc, school, schoolLogo, evtName, evtDate, startTime, endTime, students, classes, onBack, onLock, onMarkArrived, language, setLanguage }) {
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");

  const classMap = useMemo(() => new Map(classes.map((cls) => [cls.id, cls])), [classes]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students
      .filter((student) => filterClass === "all" || String(student.cid) === String(filterClass))
      .filter((student) => {
        if (!term) return true;
        const cls = classMap.get(student.cid);
        return [
          student.child,
          student.parent,
          cls?.name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .map((student) => ({
        student,
        cls: classMap.get(student.cid),
      }));
  }, [students, search, filterClass, classMap]);

  const arrivedCount = students.filter((student) => Boolean(student.arrivedAt)).length;
  const waitingCount = students.length - arrivedCount;

  return (
    <div style={{ minHeight: "100vh", background: CR, fontFamily: "'DM Sans',sans-serif", maxWidth: 520, margin: "0 auto", position: "relative", paddingBottom: 34 }}>
      <LanguageToggle language={language} setLanguage={setLanguage} dark />
      <div style={{ background: G, padding: "22px 20px 18px", color: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "none", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            ← Home
          </button>
          <button onClick={onLock} style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "none", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Lock staff
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <img src={logoSrc || schoolLogo || logoImg} alt={`${school} logo`} style={{ width: 48, height: 48, borderRadius: 14, objectFit: "contain", background: "#FFFFFF", padding: 6, boxSizing: "border-box", flexShrink: 0 }} />
          <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 28, fontWeight: 800, lineHeight: 1.05 }}>{school || "Front desk"}</div>
        </div>
        <div style={{ fontSize: 15, opacity: 0.88 }}>Geliş kaydı ve hızlı sınıf arama</div>
        <div style={{ fontSize: 12, opacity: 0.58, marginTop: 4 }}>
          {[evtDate ? fmtDate(evtDate) : "", fmtEventWindow(startTime, endTime), evtName || ""].filter(Boolean).join(" · ")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 18, marginBottom: 4 }}>
          {[
            { label: "Students", value: students.length },
            { label: "Arrived", value: arrivedCount },
            { label: "Waiting", value: waitingCount },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 22, fontWeight: 800 }}>{item.value}</div>
              <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "14px 16px 20px" }}>
        <Card>
          <SLabel>Search</SLabel>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Student, parent, or class"
            style={{ ...iBase, marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip label={`All (${students.length})`} active={filterClass === "all"} onClick={() => setFilterClass("all")} />
            {classes.map((cls) => {
              const count = students.filter((student) => String(student.cid) === String(cls.id)).length;
              return <Chip key={cls.id} label={`${cls.name} (${count})`} active={String(filterClass) === String(cls.id)} onClick={() => setFilterClass(String(cls.id))} />;
            })}
          </div>
        </Card>

        <Row>
          <SHead>Results <N n={rows.length} /></SHead>
        </Row>

        {rows.map(({ student, cls }) => {
          const arrived = Boolean(student.arrivedAt);
          return (
            <div key={student.id} style={{ background: "white", borderRadius: 14, padding: "13px 16px", marginBottom: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{student.child}</div>
                <div style={{ fontSize: 13, color: cls ? "#9A9A9A" : "#D44", marginTop: 3 }}>
                  {cls ? `${cls.name}${student.parent ? ` · ${student.parent}` : ""}` : "⚠ No class assigned"}
                  {arrived ? " · arrived" : ""}
                </div>
              </div>
              <button
                onClick={() => onMarkArrived(student.id)}
                style={{
                  background: arrived ? "#E8F0EC" : G,
                  color: arrived ? G : "white",
                  border: "none",
                  borderRadius: 9,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {arrived ? "Undo" : "Arrived"}
              </button>
            </div>
          );
        })}
        {!rows.length && <Empty>No matches found.</Empty>}
      </div>
    </div>
  );
}


function LanguageToggle({ language, setLanguage, dark = true, style = {} }) {
  return (
    <button
      onClick={() => setLanguage(language === "tr" ? "en" : "tr")}
      style={{
        position: "absolute",
        top: 18,
        right: 20,
        background: dark ? "rgba(255,255,255,0.14)" : "rgba(58,86,115,0.08)",
        color: dark ? "white" : G,
        border: dark ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(58,86,115,0.18)",
        borderRadius: 10,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        zIndex: 5,
        ...style,
      }}
    >
      {language === "tr" ? "EN" : "TR"}
    </button>
  );
}

function LoadingScreen({ label, language, setLanguage }) {
  return (
    <div style={{ minHeight: "100vh", background: CR, display: "flex", alignItems: "center", justifyContent: "center", color: G, fontFamily: "'DM Sans',sans-serif", position: "relative" }}>
      <LanguageToggle language={language} setLanguage={setLanguage} dark={false} />
      {label}...
    </div>
  );
}

function ErrorScreen({ message, language, setLanguage }) {
  return <div style={{ minHeight: "100vh", background: CR, padding: 24, color: G, fontFamily: "'DM Sans',sans-serif" }}><div style={{ maxWidth: 720, margin: "0 auto" }}><div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", opacity: 0.6, marginBottom: 10 }}>App Error</div><h1 style={{ margin: "0 0 12px", fontSize: 28 }}>The app could not open this event</h1><p style={{ margin: 0, lineHeight: 1.5 }}>{message}</p></div></div>;
}

function QrModal({ title, subtitle, imageUrl, footer, primaryLabel, secondaryLabel, onPrimary, onSecondary, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 24, padding: 28, width: "100%", maxWidth: 340, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 22, fontWeight: 800, color: G, marginBottom: 4 }}>{title}</div>
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
        <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 24, fontWeight: 800, color: G, marginBottom: 6 }}>Staff login</div>
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
  return <div style={{ fontFamily: "'Manrope',sans-serif", fontSize: 21, fontWeight: 800, color: G }}>{children}</div>;
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
