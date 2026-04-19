import { parseCsv } from "./csv";
import { createId } from "../config/eventConfig";

export const TEACHER_TEMPLATE_CSV = [
  "name,subject,meeting_location,floor,time,status,note",
  "Deniz Sert,Ingilizce,LHZ/A,Lise 1. Kat,18:00,active,",
  "Tulin Temel,Turkce,9/B,Lise 1. Kat,,unavailable,Izinli",
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
