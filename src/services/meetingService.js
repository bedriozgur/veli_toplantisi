import {
  db,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from "../firebase";
import { generateAccessCode } from "../utils/accessCode";

const DEMO_STORE_KEY = "veli_toplantisi_demo_store_v1";

function ensureDb() {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }
  return db;
}

function hasFirestore() {
  return Boolean(db);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultUsers() {
  return [
    {
      id: "demo-admin",
      uid: "demo-admin",
      email: "admin@local",
      displayName: "Local Admin",
      role: "admin",
    },
    {
      id: "demo-frontdesk",
      uid: "demo-frontdesk",
      email: "frontdesk@local",
      displayName: "Local Front Desk",
      role: "frontdesk",
    },
  ];
}

function emptyDemoStore() {
  return {
    meetings: [],
    classesByMeeting: {},
    studentsByMeeting: {},
    accessCodes: {},
    users: defaultUsers(),
  };
}

function readDemoStore() {
  try {
    const raw = localStorage.getItem(DEMO_STORE_KEY);
    if (!raw) return emptyDemoStore();
    const parsed = JSON.parse(raw);
    return {
      ...emptyDemoStore(),
      ...parsed,
      meetings: Array.isArray(parsed?.meetings) ? parsed.meetings : [],
      classesByMeeting: parsed?.classesByMeeting || {},
      studentsByMeeting: parsed?.studentsByMeeting || {},
      accessCodes: parsed?.accessCodes || {},
      users: Array.isArray(parsed?.users) ? parsed.users : defaultUsers(),
    };
  } catch {
    return emptyDemoStore();
  }
}

function writeDemoStore(nextStore) {
  try {
    localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(nextStore));
  } catch {}
}

function updateDemoStore(updater) {
  const current = readDemoStore();
  const next = updater(clone(current)) || current;
  writeDemoStore(next);
  return next;
}

function ensureMeetingClassArray(store, meetingId) {
  if (!store.classesByMeeting[meetingId]) {
    store.classesByMeeting[meetingId] = [];
  }
  if (!store.studentsByMeeting[meetingId]) {
    store.studentsByMeeting[meetingId] = {};
  }
}

function nowIso() {
  return new Date().toISOString();
}

function localTimestamp() {
  return nowIso();
}

function localId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeMeetingDate(meetingDateOrMeeting) {
  if (typeof meetingDateOrMeeting === "string") return meetingDateOrMeeting;
  return meetingDateOrMeeting?.date || "";
}

function normalizeMeetingTitle(meetingDateOrMeeting, fallback = "") {
  if (typeof meetingDateOrMeeting === "object") return meetingDateOrMeeting?.title || "";
  return fallback;
}

function localResponse(value) {
  return Promise.resolve(value);
}

export async function getMeetings() {
  if (!hasFirestore()) {
    return readDemoStore().meetings.map((meeting) => clone(meeting));
  }

  const snap = await getDocs(collection(ensureDb(), "meetings"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMeeting(meetingId) {
  if (!hasFirestore()) {
    const meeting = readDemoStore().meetings.find((item) => item.id === meetingId);
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }
    return clone(meeting);
  }

  const snap = await getDoc(doc(ensureDb(), "meetings", meetingId));
  if (!snap.exists()) {
    throw new Error(`Meeting ${meetingId} not found`);
  }
  return { id: snap.id, ...snap.data() };
}

export function subscribeMeeting(meetingId, onUpdate) {
  if (!hasFirestore()) {
    const meeting = readDemoStore().meetings.find((item) => item.id === meetingId);
    if (meeting) onUpdate(clone(meeting));
    return () => {};
  }

  return onSnapshot(doc(ensureDb(), "meetings", meetingId), (snap) => {
    if (snap.exists()) onUpdate({ id: snap.id, ...snap.data() });
  });
}

export async function createMeeting({ title, date, grades }, adminUid) {
  if (!hasFirestore()) {
    const meeting = {
      id: localId("meeting"),
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
      createdAt: nowIso(),
      createdBy: adminUid,
      updatedAt: nowIso(),
    };

    updateDemoStore((store) => {
      store.meetings.unshift(meeting);
      ensureMeetingClassArray(store, meeting.id);
      return store;
    });

    return clone(meeting);
  }

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
  if (!hasFirestore()) {
    updateDemoStore((store) => {
      const meeting = store.meetings.find((item) => item.id === meetingId);
      if (meeting) {
        Object.assign(meeting, updates, { updatedAt: nowIso() });
      }
      return store;
    });
    return;
  }

  await updateDoc(doc(ensureDb(), "meetings", meetingId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMeeting(meetingId) {
  if (!hasFirestore()) {
    updateDemoStore((store) => {
      store.meetings = store.meetings.filter((meeting) => meeting.id !== meetingId);
      delete store.classesByMeeting[meetingId];
      delete store.studentsByMeeting[meetingId];
      Object.keys(store.accessCodes).forEach((code) => {
        if (store.accessCodes[code]?.meetingId === meetingId) {
          delete store.accessCodes[code];
        }
      });
      return store;
    });
    return;
  }

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
  if (!hasFirestore()) {
    return clone(readDemoStore().classesByMeeting[meetingId] || []);
  }

  const snap = await getDocs(collection(ensureDb(), "meetings", meetingId, "classes"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeClasses(meetingId, onUpdate) {
  if (!hasFirestore()) {
    onUpdate(clone(readDemoStore().classesByMeeting[meetingId] || []));
    return () => {};
  }

  return onSnapshot(collection(ensureDb(), "meetings", meetingId, "classes"), (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createClass(meetingId, classData, meetingDateOrMeeting) {
  const { grade, branch, teachers } = classData;
  const classId = `${grade}${branch}`;
  const meetingDate = normalizeMeetingDate(meetingDateOrMeeting);
  const meetingTitle = normalizeMeetingTitle(meetingDateOrMeeting, classData.meetingTitle || "");
  const classLabel = classData.classLabel || classData.className || classId;
  const accessCode = generateAccessCode(grade, branch);
  const expiryDate = meetingDate ? new Date(`${meetingDate}T23:59:59`) : new Date();
  expiryDate.setHours(23, 59, 59, 999);
  const expiresAt = Timestamp.fromDate(expiryDate);

  if (!hasFirestore()) {
    updateDemoStore((store) => {
      ensureMeetingClassArray(store, meetingId);
      const meetingClasses = store.classesByMeeting[meetingId];
      const existingIndex = meetingClasses.findIndex((item) => item.id === classId);
      const classItem = {
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
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      if (existingIndex >= 0) {
        meetingClasses[existingIndex] = classItem;
      } else {
        meetingClasses.push(classItem);
      }

      store.accessCodes[accessCode] = {
        code: accessCode,
        meetingId,
        classId,
        classLabel,
        meetingTitle,
        meetingDate,
        expiresAt: expiryDate.toISOString(),
        active: true,
      };

      return store;
    });

    return { classId, accessCode };
  }

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
  if (!hasFirestore()) {
    updateDemoStore((store) => {
      const classItem = store.classesByMeeting[meetingId]?.find((item) => item.id === classId);
      if (classItem) {
        classItem.teachers = teachers.map((teacher, index) => ({
          ...teacher,
          order: index + 1,
        }));
        classItem.updatedAt = nowIso();
      }
      return store;
    });
    return;
  }

  await updateDoc(doc(ensureDb(), "meetings", meetingId, "classes", classId), {
    teachers: teachers.map((teacher, index) => ({
      ...teacher,
      order: index + 1,
    })),
    updatedAt: serverTimestamp(),
  });
}

export async function getStudents(meetingId, classId) {
  if (!hasFirestore()) {
    return clone(readDemoStore().studentsByMeeting?.[meetingId]?.[classId] || []);
  }

  const snap = await getDocs(collection(ensureDb(), "meetings", meetingId, "classes", classId, "students"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeStudents(meetingId, classId, onUpdate) {
  if (!hasFirestore()) {
    onUpdate(clone(readDemoStore().studentsByMeeting?.[meetingId]?.[classId] || []));
    return () => {};
  }

  return onSnapshot(collection(ensureDb(), "meetings", meetingId, "classes", classId, "students"), (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function importStudents(meetingId, classId, students, teachers) {
  if (!hasFirestore()) {
    updateDemoStore((store) => {
      ensureMeetingClassArray(store, meetingId);
      const studentList = (students || []).map((student, index) => {
        const id = student.id || localId(`student-${index + 1}`);
        const meetings = Object.fromEntries(
          (teachers || []).map((teacher) => [teacher.id, { visited: false, visitedAt: null, notes: "" }])
        );

        return {
          id,
          studentName: student.studentName || student.child || "",
          child: student.studentName || student.child || "",
          parentName: student.parentName || student.parent || "",
          parentPhone: student.parentPhone || "",
          note: student.note || "",
          meetings,
          arrivedAt: null,
          arrivedMarkedBy: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
      });

      store.studentsByMeeting[meetingId][classId] = studentList;

      const classItem = store.classesByMeeting[meetingId].find((item) => item.id === classId);
      if (classItem) {
        classItem.stats = {
          ...classItem.stats,
          totalStudents: studentList.length,
        };
        classItem.updatedAt = nowIso();
      }

      return store;
    });

    return;
  }

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

  batch.set(
    classRef,
    {
      stats: { totalStudents: students.length },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();
}

export async function replaceStudents(meetingId, classId, students, teachers) {
  if (!hasFirestore()) {
    await importStudents(meetingId, classId, students, teachers);
    return;
  }

  const existing = await getStudents(meetingId, classId);
  const batch = writeBatch(ensureDb());

  for (const student of existing) {
    batch.delete(doc(ensureDb(), "meetings", meetingId, "classes", classId, "students", student.id));
  }

  await batch.commit();
  await importStudents(meetingId, classId, students, teachers);
}

export async function markArrived(meetingId, classId, studentId, frontdeskUid) {
  if (!hasFirestore()) {
    updateDemoStore((store) => {
      const student = store.studentsByMeeting?.[meetingId]?.[classId]?.find((item) => item.id === studentId);
      if (student) {
        student.arrivedAt = nowIso();
        student.arrivedMarkedBy = frontdeskUid;
        student.updatedAt = nowIso();
      }
      return store;
    });
    return;
  }

  await updateDoc(doc(ensureDb(), "meetings", meetingId, "classes", classId, "students", studentId), {
    arrivedAt: serverTimestamp(),
    arrivedMarkedBy: frontdeskUid,
    updatedAt: serverTimestamp(),
  });
}

export async function updateTeacherMeeting(meetingId, classId, studentId, teacherId, update) {
  if (!hasFirestore()) {
    updateDemoStore((store) => {
      const student = store.studentsByMeeting?.[meetingId]?.[classId]?.find((item) => item.id === studentId);
      if (student) {
        student.meetings = student.meetings || {};
        student.meetings[teacherId] = {
          ...update,
          visitedAt: update.visited ? nowIso() : null,
        };
        student.updatedAt = nowIso();
      }
      return store;
    });
    return;
  }

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

  if (!hasFirestore()) {
    const access = readDemoStore().accessCodes[normalized];
    if (!access || !access.active) return null;
    if (access.expiresAt && new Date(access.expiresAt) < new Date()) return null;
    return clone(access);
  }

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
  if (!hasFirestore()) {
    return clone(readDemoStore().users);
  }

  const snap = await getDocs(collection(ensureDb(), "users"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function writeUserProfile(uid, { email, displayName, role, createdByUid }) {
  if (!hasFirestore()) {
    updateDemoStore((store) => {
      const index = store.users.findIndex((user) => user.uid === uid || user.id === uid);
      const nextUser = {
        id: uid,
        uid,
        email,
        displayName,
        role,
        createdAt: nowIso(),
        createdBy: createdByUid,
      };

      if (index >= 0) {
        store.users[index] = { ...store.users[index], ...nextUser };
      } else {
        store.users.push(nextUser);
      }

      return store;
    });
    return;
  }

  await setDoc(doc(ensureDb(), "users", uid), {
    uid,
    email,
    displayName,
    role,
    createdAt: serverTimestamp(),
    createdBy: createdByUid,
  });
}
