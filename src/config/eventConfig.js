import teachersSeed from "../data/teachers.json";
import classesSeed from "../data/classes.json";
import studentsSeed from "../data/students.json";
import { normalizeClasses, normalizeStudents, normalizeTeachers } from "../utils/normalizeData";

export const DEFAULT_SCHOOL = "TED Bursa Koleji";
export const DEFAULT_EVENT = "Veli Toplantısı Portalı";
export const DEFAULT_NOTES_EMAIL = "bilgi@tedbursa.k12.tr";
export const DEFAULT_ADMIN_PIN = "";
export const DEFAULT_EVENT_STATUS = "draft";
export const DEFAULT_START_TIME = "09:00";
export const DEFAULT_END_TIME = "15:00";
export const DEFAULT_LANDING_HELP =
  "Toplantı kodunuzu girerek öğrenci arama ve görüşme listesine ulaşabilirsiniz.";
export const DEFAULT_LANDING_NOTE =
  "Yardıma ihtiyacınız olursa girişteki görevli sizi doğru öğrenci sayfasına yönlendirebilir.";

export function makeEventCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function createId() {
  return Date.now() + Math.floor(Math.random() * 9999);
}

export function schoolInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export function normalizeSchoolName(value) {
  const school = String(value || "").trim();
  if (!school) return DEFAULT_SCHOOL;
  if (/oakwood/i.test(school)) return DEFAULT_SCHOOL;
  return school;
}

export function normalizeEventName(value) {
  const evtName = String(value || "").trim();
  if (!evtName) return DEFAULT_EVENT;
  if (/oakwood academy/i.test(evtName)) return DEFAULT_EVENT;
  return evtName;
}

export function normalizeAdminState(raw) {
  return {
    school: normalizeSchoolName(raw?.school),
    schoolLogo: raw?.schoolLogo || "",
    evtName: normalizeEventName(raw?.evtName),
    evtDate: raw?.evtDate || "",
    startTime: raw?.startTime || DEFAULT_START_TIME,
    endTime: raw?.endTime || DEFAULT_END_TIME,
    notesEmail: raw?.notesEmail || DEFAULT_NOTES_EMAIL,
    eventCode: raw?.eventCode || makeEventCode(),
    eventStatus: raw?.eventStatus || DEFAULT_EVENT_STATUS,
    expiresAt: raw?.expiresAt || "",
    landingHelpText: raw?.landingHelpText || DEFAULT_LANDING_HELP,
    landingNoteText: raw?.landingNoteText || DEFAULT_LANDING_NOTE,
    teachers: normalizeTeachers(raw?.teachers ?? teachersSeed),
    classes: normalizeClasses(raw?.classes ?? classesSeed),
    students: normalizeStudents(raw?.students ?? studentsSeed),
  };
}

export function buildEventPayload({
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
}) {
  return {
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
  };
}

export function isEventExpired(event) {
  if (!event?.expiresAt) return false;
  const expiresAt = new Date(`${event.expiresAt}T23:59:59`);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now();
}

export function isEventAccessible(event) {
  if (!event) return false;
  if ((event.eventStatus || DEFAULT_EVENT_STATUS) === "closed") return false;
  if ((event.eventStatus || DEFAULT_EVENT_STATUS) === "draft") return false;
  return !isEventExpired(event);
}

export function buildTimeOptions() {
  const options = [];
  for (let hour = 8; hour <= 22; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      options.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return options;
}
