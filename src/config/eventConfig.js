import teachersSeed from "../data/teachers.json";
import classesSeed from "../data/classes.json";
import studentsSeed from "../data/students.json";
import { normalizeClasses, normalizeStudents, normalizeTeachers } from "../utils/normalizeData";

export const DEFAULT_SCHOOL = "Oakwood Academy";
export const DEFAULT_EVENT = "Parents' Evening";
export const DEFAULT_NOTES_EMAIL = "parents-evening@school.org";
export const DEFAULT_ADMIN_PIN = "";
export const DEFAULT_EVENT_STATUS = "draft";
export const DEFAULT_START_TIME = "18:00";
export const DEFAULT_END_TIME = "20:00";
export const DEFAULT_LANDING_HELP =
  "Enter the meeting code shared by the school to open the student search and meeting list.";
export const DEFAULT_LANDING_NOTE =
  "If you need help, staff at the entrance can open the correct student page for you.";

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

export function normalizeAdminState(raw) {
  return {
    school: raw?.school || DEFAULT_SCHOOL,
    schoolLogo: raw?.schoolLogo || "",
    evtName: raw?.evtName || DEFAULT_EVENT,
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
