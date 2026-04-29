function randomLetters(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function randomDigits(length) {
  const chars = "23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function generateAccessCode() {
  return `${randomLetters(3)}-${randomDigits(3)}`;
}

export function generateMeetingAccessCode() {
  return generateAccessCode();
}

export function buildMailtoLink({ label, meetingTitle, date, teachers, meetings }) {
  const subject = encodeURIComponent(`Veli Toplantısı Notlarım - ${label || ""} - ${date}`);
  const lines = (teachers || [])
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((teacher) => {
      const meeting = meetings?.[teacher.id] || {};
      const status = meeting.visited ? "Görüşüldü" : "Bekliyor";
      const notes = meeting.notes ? `\n   Not: ${meeting.notes}` : "";
      return `- ${teacher.subject || teacher.name} (${teacher.room || "-"}): ${status}${notes}`;
    });

  const body = encodeURIComponent(
    [
      meetingTitle,
      `Tarih: ${date}`,
      label ? `Sınıf: ${label}` : "",
      "",
      ...lines,
    ].join("\n")
  );

  return `mailto:?subject=${subject}&body=${body}`;
}

export function parseStudentCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    return {
      studentNumber: row["öğrenci_no"] || row["no"] || "",
      studentName: row["öğrenci_adı"] || row["öğrenci"] || "",
      parentName: row["veli_adı"] || row["veli"] || "",
      parentPhone: row["veli_telefonu"] || row["telefon"] || "",
    };
  }).filter((student) => student.studentName);
}
