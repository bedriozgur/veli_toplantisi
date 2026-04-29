import {
  db,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from "../firebase";
import { generateAccessCode } from "../utils/accessCode";

function ensureDb() {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }
  return db;
}

export async function getMeetings() {
  const snap = await getDocs(collection(ensureDb(), "meetings"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMeeting(meetingId) {
  const snap = await getDoc(doc(ensureDb(), "meetings", meetingId));
  if (!snap.exists()) {
    throw new Error(`Meeting ${meetingId} not found`);
  }
  return { id: snap.id, ...snap.data() };
}

export function subscribeMeeting(meetingId, onUpdate) {
  return onSnapshot(doc(ensureDb(), "meetings", meetingId), (snap) => {
    if (snap.exists()) onUpdate({ id: snap.id, ...snap.data() });
  });
}

export async function createMeeting({ title, date, grades }, adminUid) {
  const ref = doc(collection(ensureDb(), "meetings"));
  const payload = {
    id: ref.id,
    title,
    date,
    status: "draft",
    grades,
    labels: {
      teacherColumn: "Öğretmen",
      roomColumn: "Görüşme Yeri",
      statusColumn: "Durum",
      notesLabel: "Notlarım",
      completedText: "Görüşüldü",
      pendingText: "Bekliyor",
    },
    createdAt: serverTimestamp(),
    createdBy: adminUid,
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload);
  return payload;
}

export async function updateMeeting(meetingId, updates) {
  await updateDoc(doc(ensureDb(), "meetings", meetingId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMeeting(meetingId) {
  const classes = await getClasses(meetingId);
  const batch = writeBatch(ensureDb());

  for (const classItem of classes) {
    const students = await getStudents(meetingId, classItem.id);
    for (const student of students) {
      batch.delete(doc(ensureDb(), "meetings", meetingId, "classes", classItem.id, "students", student.id));
    }
    batch.delete(doc(ensureDb(), "meetings", meetingId, "classes", classItem.id));
    if (classItem.accessCode) {
      batch.delete(doc(ensureDb(), "accessCodes", classItem.accessCode));
    }
  }

  batch.delete(doc(ensureDb(), "meetings", meetingId));
  await batch.commit();
}

export async function getClasses(meetingId) {
  const snap = await getDocs(collection(ensureDb(), "meetings", meetingId, "classes"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeClasses(meetingId, onUpdate) {
  return onSnapshot(collection(ensureDb(), "meetings", meetingId, "classes"), (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createClass(meetingId, classData, meetingDateOrMeeting) {
  const { grade, branch, teachers } = classData;
  const classId = `${grade}${branch}`;
  const meetingDate = typeof meetingDateOrMeeting === "string" ? meetingDateOrMeeting : meetingDateOrMeeting?.date;
  const meetingTitle = typeof meetingDateOrMeeting === "object" ? meetingDateOrMeeting?.title || "" : classData.meetingTitle || "";
  const classLabel = classData.classLabel || classData.className || classId;
  const accessCode = generateAccessCode(grade, branch);
  const expiryDate = meetingDate ? new Date(`${meetingDate}T23:59:59`) : new Date();
  expiryDate.setHours(23, 59, 59, 999);
  const expiresAt = Timestamp.fromDate(expiryDate);
  const batch = writeBatch(ensureDb());

  batch.set(doc(ensureDb(), "meetings", meetingId, "classes", classId), {
    id: classId,
    classLabel,
    grade,
    branch,
    meetingTitle,
    meetingDate,
    accessCode,
    teachers: (teachers || []).map((teacher, index) => ({
      ...teacher,
      id: teacher.id || `t${index + 1}`,
      order: index + 1,
    })),
    stats: { totalStudents: 0, visitedCount: 0 },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(ensureDb(), "accessCodes", accessCode), {
    code: accessCode,
    meetingId,
    classId,
    classLabel,
    meetingTitle,
    meetingDate,
    expiresAt,
    active: true,
  });

  await batch.commit();
  return { classId, accessCode };
}

export async function updateClassTeachers(meetingId, classId, teachers) {
  await updateDoc(doc(ensureDb(), "meetings", meetingId, "classes", classId), {
    teachers: teachers.map((teacher, index) => ({
      ...teacher,
      order: index + 1,
    })),
    updatedAt: serverTimestamp(),
  });
}

export async function getStudents(meetingId, classId) {
  const snap = await getDocs(collection(ensureDb(), "meetings", meetingId, "classes", classId, "students"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeStudents(meetingId, classId, onUpdate) {
  return onSnapshot(collection(ensureDb(), "meetings", meetingId, "classes", classId, "students"), (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function importStudents(meetingId, classId, students, teachers) {
  const batch = writeBatch(ensureDb());
  const classRef = doc(ensureDb(), "meetings", meetingId, "classes", classId);
  const emptyMeetings = Object.fromEntries(
    (teachers || []).map((teacher) => [teacher.id, { visited: false, visitedAt: null, notes: "" }])
  );

  for (const student of students) {
    const ref = doc(collection(ensureDb(), "meetings", meetingId, "classes", classId, "students"));
    batch.set(ref, {
      ...student,
      meetings: emptyMeetings,
      arrivedAt: null,
      arrivedMarkedBy: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(classRef, {
    stats: { totalStudents: students.length },
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await batch.commit();
}

export async function replaceStudents(meetingId, classId, students, teachers) {
  const existing = await getStudents(meetingId, classId);
  const batch = writeBatch(ensureDb());

  for (const student of existing) {
    batch.delete(doc(ensureDb(), "meetings", meetingId, "classes", classId, "students", student.id));
  }

  await batch.commit();
  await importStudents(meetingId, classId, students, teachers);
}

export async function markArrived(meetingId, classId, studentId, frontdeskUid) {
  await updateDoc(doc(ensureDb(), "meetings", meetingId, "classes", classId, "students", studentId), {
    arrivedAt: serverTimestamp(),
    arrivedMarkedBy: frontdeskUid,
    updatedAt: serverTimestamp(),
  });
}

export async function updateTeacherMeeting(meetingId, classId, studentId, teacherId, update) {
  const studentRef = doc(ensureDb(), "meetings", meetingId, "classes", classId, "students", studentId);
  await updateDoc(studentRef, {
    [`meetings.${teacherId}`]: {
      ...update,
      visitedAt: update.visited ? serverTimestamp() : null,
    },
    updatedAt: serverTimestamp(),
  });
}

export async function resolveAccessCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;

  const snap = await getDoc(doc(ensureDb(), "accessCodes", normalized));
  if (!snap.exists()) return null;

  const data = snap.data();
  if (!data.active) return null;
  if (data.expiresAt?.toDate && data.expiresAt.toDate() < new Date()) return null;

  return {
    meetingId: data.meetingId,
    classId: data.classId,
    code: data.code,
    classLabel: data.classLabel || data.classId,
    meetingTitle: data.meetingTitle || "",
    meetingDate: data.meetingDate || "",
  };
}

export async function getUsers() {
  const snap = await getDocs(collection(ensureDb(), "users"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function writeUserProfile(uid, { email, displayName, role, createdByUid }) {
  await setDoc(doc(ensureDb(), "users", uid), {
    uid,
    email,
    displayName,
    role,
    createdAt: serverTimestamp(),
    createdBy: createdByUid,
  });
}
