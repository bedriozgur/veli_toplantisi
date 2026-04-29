import { parseCsv } from "./csv";
import { createId } from "../config/eventConfig";

export const TEACHER_TEMPLATE_CSV = [
  "name,subject,meeting_location,floor,time,status,note",
  "Deniz Sert,Ingilizce,LHZ/A,Lise 1. Kat,18:00,active,",
  "Tulin Temel,Turkce,9/B,Lise 1. Kat,,unavailable,Izinli",
].join("\n");

export const CLASS_ROSTER_TEMPLATE_CSV = [
  "class,teacher_name,subject,meeting_location,floor,time,status,note",
  "5A,Deniz Sert,Ingilizce,LHZ/A,Lise 1. Kat,18:00,active,",
  "5A,Hande Hatipoglu,Matematik,101,Lise 1. Kat,18:15,active,",
].join("\n");

export const STUDENT_ROSTER_TEMPLATE_CSV = [
  "class,student_name,parent_name,parent_phone,note",
  "5A,Ali Yilmaz,Ayse Yilmaz,555 111 22 33,",
  "5A,Zeynep Kaya,Mehmet Kaya,555 444 55 66,",
].join("\n");

export const CLASS_TEMPLATE_CSV = [
  "name,teachers",
  '9/A,"Deniz Sert; Hande Hatipoglu"',
  '9/B,"Sema Tunc; Tulin Temel"',
].join("\n");

export const STUDENT_TEMPLATE_CSV = [
  "child,parent,class",
  "Ali Yilmaz,Ayse Yilmaz,9/A",
  "Zeynep Kaya,Mehmet Kaya,9/A",
].join("\n");

export function downloadTextFile(filename, text, mimeType = "text/plain;charset=utf-8;") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function importTeachersFromCsv(text) {
  return parseCsv(text)
    .map((row) => ({
      id: createId(),
      name: row.name || row.teacher || row.teacher_name || "",
      subject: row.subject || row.department || "",
      room: row.location || row.meeting_location || row.room || "",
      floor: row.floor || "",
      time: row.time || "",
      status: String(row.status || "active").toLowerCase() === "unavailable" ? "unavailable" : "active",
      note: row.note || "",
    }))
    .filter((teacher) => teacher.name);
}

export function importClassesFromCsv(text, teachers) {
  const teacherLookup = new Map(
    (teachers || []).map((teacher) => [String(teacher.name || "").trim().toLowerCase(), teacher.id])
  );

  return parseCsv(text)
    .map((row) => {
      const teacherNames = String(row.teachers || row.teacher_names || row.teacher || "")
        .split(/[;,]/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

      return {
        id: createId(),
        name: row.name || row.class || row.class_name || "",
        tids: teacherNames.map((name) => teacherLookup.get(name)).filter(Boolean),
      };
    })
    .filter((cls) => cls.name);
}

export function importStudentsFromCsv(text, classes) {
  const classLookup = new Map(
    (classes || []).map((item) => [String(item.name).trim().toLowerCase(), item.id])
  );

  return parseCsv(text)
    .map((row) => {
      const className = (row.class || row.class_name || row.classroom || "").trim().toLowerCase();
      return {
        id: createId(),
        child: row.child || row.student || row.student_name || "",
        parent: row.parent || row.parent_name || "",
        cid: classLookup.has(className) ? classLookup.get(className) : null,
      };
    })
    .filter((student) => student.child);
}

function pickRowValue(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function makeStableId(value, fallback = "item") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export function parseClassRosterCsv(text) {
  return parseCsv(text)
    .map((row) => {
      const className = pickRowValue(row, ["class", "class_name", "classroom", "name"]);
      return {
        className,
        teacherName: pickRowValue(row, ["teacher_name", "teacher", "name"]),
        subject: pickRowValue(row, ["subject", "lesson", "branch"]),
        room: pickRowValue(row, ["meeting_location", "room", "location"]),
        floor: pickRowValue(row, ["floor", "level"]),
        time: pickRowValue(row, ["time", "hour"]),
        status: pickRowValue(row, ["status"]) || "active",
        note: pickRowValue(row, ["note", "notes"]),
      };
    })
    .filter((row) => row.className && row.teacherName);
}

export function buildClassRosterPayload(rows) {
  const grouped = new Map();

  rows.forEach((row, index) => {
    const classKey = String(row.className || "").trim();
    if (!classKey) return;

    if (!grouped.has(classKey)) {
      grouped.set(classKey, {
        id: classKey.replace(/\s+/g, "").toUpperCase(),
        className: classKey,
        teachers: [],
      });
    }

    const classItem = grouped.get(classKey);
    const teacherIdBase = makeStableId(`${row.teacherName}-${row.subject || ""}-${index + 1}`, `teacher-${index + 1}`);
    const teacherId = classItem.teachers.some((teacher) => teacher.id === teacherIdBase)
      ? `${teacherIdBase}-${classItem.teachers.length + 1}`
      : teacherIdBase;

    classItem.teachers.push({
      id: teacherId,
      name: row.teacherName,
      subject: row.subject,
      room: row.room,
      floor: row.floor,
      time: row.time,
      status: String(row.status || "active").toLowerCase() === "unavailable" ? "unavailable" : "active",
      note: row.note,
      order: classItem.teachers.length + 1,
    });
  });

  return Array.from(grouped.values());
}

export function parseStudentRosterCsv(text) {
  return parseCsv(text)
    .map((row) => ({
      className: pickRowValue(row, ["class", "class_name", "classroom"]),
      studentName: pickRowValue(row, ["student_name", "student", "child", "name"]),
      parentName: pickRowValue(row, ["parent_name", "parent", "guardian", "veli"]),
      parentPhone: pickRowValue(row, ["parent_phone", "phone", "phone_number", "telefon"]),
      note: pickRowValue(row, ["note", "notes"]),
    }))
    .filter((row) => row.className && row.studentName);
}
