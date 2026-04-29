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
import { isDemoStoreForced } from "../firebase";
import { generateAccessCode } from "../utils/accessCode";

const DEMO_STORE_KEY = "veli_toplantisi_demo_store_v1";

const TURKISH_FIRST_NAMES = [
  "Ahmet","Ayse","Mehmet","Fatma","Mustafa","Emine","Ali","Elif","Huseyin","Merve","Hasan","Zeynep",
  "Ibrahim","Sultan","Osman","Nur","Murat","Esra","Cem","Seda","Burak","Derya","Serkan","Buse",
  "Yusuf","Aylin","Kemal","Hacer","Tolga","Selin","Orhan","Ece","Kaan","Gul","Can","Mina",
  "Onur","Sibel","Emre","Nazan","Eren","Pelin","Gokhan","Ilayda","Volkan","Nisa","Sahin","Bahar"
];

const TURKISH_LAST_NAMES = [
  "Yilmaz","Kaya","Demir","Celik","Sahin","Yildiz","Aydin","Ozturk","Arslan","Aslan","Tas","Kurt",
  "Kilic","Polat","Tekin","Sari","Erdem","Gunes","Koc","Coskun","Guler","Bayram","Balcı","Acar",
  "Uysal","Aksoy","Cetin","Ersen","Karaca","Keskin","Korkmaz","Turan","Ekinci","Yavuz","Karaman","Topal"
];

const TURKISH_SUBJECTS = [
  "Turkce","Matematik","Fen Bilimleri","Sosyal Bilgiler","Ingilizce","Almanca","Fransizca","Din Kulturu",
  "Beden Egitimi","Gorsel Sanatlar","Muzik","Bilisim Teknolojileri","Rehberlik","Kimya","Fizik","Biyoloji",
  "Tarih","Cografya","Edebiyat","Felsefe","Psikoloji","Biyoloji Laboratuvar"
];

const TURKISH_CLASSES = buildClassList();
const TURKISH_MEETING_TITLE = "Demo Veli Toplantisi";
const TURKISH_MEETING_DATE = "2026-05-15";
let demoSyncTimer = null;

function ensureDb() {
  if (!db) {
    throw new Error("Firebase is not configured.");
  }
  return db;
}

function hasFirestore() {
  return Boolean(db) && !isDemoStoreForced();
}

function scheduleDemoStoreSync() {
  if (!db || !isDemoStoreForced()) return;
  if (demoSyncTimer) {
    clearTimeout(demoSyncTimer);
  }
  demoSyncTimer = setTimeout(() => {
    demoSyncTimer = null;
    syncDemoStoreToFirestore().catch(() => {});
  }, 350);
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
    roomsByMeeting: {},
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
      roomsByMeeting: parsed?.roomsByMeeting || {},
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
  scheduleDemoStoreSync();
  return next;
}

export async function syncDemoStoreToFirestore() {
  if (!db || !isDemoStoreForced()) return;

  const store = readDemoStore();
  const ops = [];
  const pushSet = (ref, data) => {
    ops.push((batch) => batch.set(ref, data, { merge: true }));
  };

  for (const user of store.users || []) {
    const uid = user.uid || user.id;
    if (!uid) continue;
    pushSet(doc(ensureDb(), "users", uid), {
      uid,
      email: user.email || "",
      displayName: user.displayName || "",
      role: user.role || "frontdesk",
      temp: Boolean(user.temp),
      createdAt: user.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
  }

  for (const meeting of store.meetings || []) {
    pushSet(doc(ensureDb(), "meetings", meeting.id), {
      ...meeting,
      updatedAt: meeting.updatedAt || nowIso(),
    });

    for (const room of store.roomsByMeeting?.[meeting.id] || []) {
      pushSet(doc(ensureDb(), "meetings", meeting.id, "rooms", room.id), {
        ...room,
        updatedAt: room.updatedAt || nowIso(),
      });
    }

    for (const classItem of store.classesByMeeting?.[meeting.id] || []) {
      pushSet(doc(ensureDb(), "meetings", meeting.id, "classes", classItem.id), {
        ...classItem,
        updatedAt: classItem.updatedAt || nowIso(),
      });

      for (const student of store.studentsByMeeting?.[meeting.id]?.[classItem.id] || []) {
        pushSet(doc(ensureDb(), "meetings", meeting.id, "classes", classItem.id, "students", student.id), {
          ...student,
          updatedAt: student.updatedAt || nowIso(),
        });
      }
    }
  }

  for (const [code, accessCode] of Object.entries(store.accessCodes || {})) {
    pushSet(doc(ensureDb(), "accessCodes", code), {
      ...accessCode,
      updatedAt: accessCode.updatedAt || nowIso(),
    });
  }

  if (!ops.length) return;

  const MAX_OPS = 450;
  for (let index = 0; index < ops.length; index += MAX_OPS) {
    const batch = writeBatch(ensureDb());
    ops.slice(index, index + MAX_OPS).forEach((op) => op(batch));
    await batch.commit();
  }
}

export function hasDemoData() {
  return readDemoStore().meetings.length > 0;
}

export function hasFullSchoolSeed() {
  const store = readDemoStore();
  const meeting = store.meetings.find((item) => item.id === "demo-school-meeting");
  if (!meeting) return false;
  const classes = store.classesByMeeting?.[meeting.id] || [];
  if (classes.length !== TURKISH_CLASSES.length) return false;
  return classes.every((classItem) => (store.studentsByMeeting?.[meeting.id]?.[classItem.id] || []).length === 20);
}

export function seedDemoSchoolData({ replace = false } = {}) {
  const seed = buildSeedMeeting();
  updateDemoStore((store) => {
    if (!replace && store.meetings.length > 0) {
      return store;
    }

    const next = emptyDemoStore();
    next.meetings = [seed.meeting];
    next.users = defaultUsers();
    next.roomsByMeeting[seed.meeting.id] = seed.rooms;
    next.classesByMeeting[seed.meeting.id] = seed.classes.map((classItem) => ({
      id: classItem.id,
      classLabel: classItem.classLabel,
      grade: classItem.grade,
      branch: classItem.branch,
      meetingTitle: classItem.meetingTitle,
      meetingDate: classItem.meetingDate,
      accessCode: classItem.accessCode,
      teachers: classItem.teachers,
      stats: classItem.stats,
      createdAt: classItem.createdAt,
      updatedAt: classItem.updatedAt,
    }));
    next.studentsByMeeting[seed.meeting.id] = seed.studentsByClass;
    next.accessCodes = seed.accessCodes;
    return next;
  });
  return readDemoStore();
}

function ensureMeetingClassArray(store, meetingId) {
  if (!store.classesByMeeting[meetingId]) {
    store.classesByMeeting[meetingId] = [];
  }
  if (!store.studentsByMeeting[meetingId]) {
    store.studentsByMeeting[meetingId] = {};
  }
  if (!store.roomsByMeeting[meetingId]) {
    store.roomsByMeeting[meetingId] = [];
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

function randomPick(list, seedIndex) {
  return list[seedIndex % list.length];
}

function makeName(seedIndex) {
  return `${randomPick(TURKISH_FIRST_NAMES, seedIndex)} ${randomPick(TURKISH_LAST_NAMES, seedIndex * 7 + 3)}`;
}

function makeTeacherName(seedIndex) {
  return `${randomPick(TURKISH_FIRST_NAMES, seedIndex)} ${randomPick(TURKISH_LAST_NAMES, seedIndex * 11 + 5)}`;
}

function makeClassCode(grade, branch) {
  return grade === "Hazirlik" ? "Hazirlik" : `${grade}${branch}`;
}

function makeStudentRecord(classLabel, classId, classTeachers, seedIndex, studentIndex) {
  const name = makeName(seedIndex * 31 + studentIndex * 17);
  const parentName = makeName(seedIndex * 29 + studentIndex * 13 + 5);
  return {
    id: localId(`student-${classId}-${studentIndex + 1}`),
    studentName: name,
    child: name,
    parentName,
    parentPhone: `5${((seedIndex * 97 + studentIndex * 53) % 900000000).toString().padStart(9, "0")}`,
    note: `${classLabel} ogrencisi`,
    meetings: Object.fromEntries(
      (classTeachers || []).map((teacher) => [teacher.id, { visited: false, visitedAt: null, notes: "" }])
    ),
    arrivedAt: null,
    arrivedMarkedBy: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function buildClassList() {
  const grades = [];
  for (let grade = 1; grade <= 12; grade += 1) {
    ["A", "B", "C", "D"].forEach((branch) => grades.push({ id: `${grade}${branch}`, classLabel: `${grade}${branch}` }));
  }
  grades.push({ id: "Hazirlik", classLabel: "Hazirlik" });
  return grades;
}

function buildSeedTeachers() {
  return Array.from({ length: 30 }, (_, index) => ({
    id: `teacher-${index + 1}`,
    name: makeTeacherName(index + 1),
    subject: TURKISH_SUBJECTS[index % TURKISH_SUBJECTS.length],
    room: `${(index % 4) + 1}. Kat ${String.fromCharCode(65 + (index % 4))}`,
    floor: `${(index % 4) + 1}. Kat`,
    time: `${17 + (index % 3)}:${index % 2 === 0 ? "00" : "30"}`,
    status: "active",
    note: "",
    order: index + 1,
  }));
}

function createTeacherAssignments(teachers, classIndex) {
  const count = 5 + (classIndex % 3);
  const selected = [];
  let cursor = classIndex * 3;
  while (selected.length < count) {
    const teacher = teachers[cursor % teachers.length];
    if (!selected.some((item) => item.id === teacher.id)) {
      selected.push({
        ...teacher,
        order: selected.length + 1,
      });
    }
    cursor += 1;
  }
  return selected;
}

function buildSeedMeeting() {
  const teachers = buildSeedTeachers();
  const rooms = Array.from(
    new Map(
      teachers
        .map((teacher, index) => ({
          id: `room-${index + 1}`,
          name: teacher.room,
          floor: teacher.floor,
          note: "",
          order: index + 1,
        }))
        .map((room) => [room.name, room])
    ).values()
  );
  const classes = TURKISH_CLASSES.map((classItem, index) => {
    const isHazirlik = classItem.id === "Hazirlik";
    const classTeachers = createTeacherAssignments(teachers, index);
    const students = Array.from({ length: 20 }, (_, studentIndex) =>
      makeStudentRecord(classItem.classLabel, classItem.id, classTeachers, index + 1, studentIndex)
    );

    return {
      id: isHazirlik ? "Hazirlik" : classItem.id,
      classLabel: classItem.classLabel,
      grade: isHazirlik ? "Hazirlik" : String(classItem.id).replace(/[A-Z]+$/, ""),
      branch: isHazirlik ? "" : String(classItem.id).replace(/^\d+/, ""),
      meetingTitle: TURKISH_MEETING_TITLE,
      meetingDate: TURKISH_MEETING_DATE,
      accessCode: isHazirlik ? `HZ-${index + 1}${index + 2}${index + 3}${index + 4}` : `${classItem.id}-DEMO`,
      teachers: classTeachers,
      stats: { totalStudents: students.length, visitedCount: 0 },
      students,
    };
  });

  return {
    meeting: {
      id: "demo-school-meeting",
      title: TURKISH_MEETING_TITLE,
      date: TURKISH_MEETING_DATE,
      status: "active",
      grades: TURKISH_CLASSES.map((item) => item.classLabel),
      labels: {
        teacherColumn: "Ogrenci",
        roomColumn: "Gorusme Yeri",
        statusColumn: "Durum",
        notesLabel: "Notlarim",
        completedText: "Gorusuldu",
        pendingText: "Bekliyor",
      },
      createdAt: nowIso(),
      createdBy: "demo-system",
      updatedAt: nowIso(),
    },
    teachers,
    rooms,
    classes,
    studentsByClass: Object.fromEntries(classes.map((classItem) => [classItem.id, classItem.students])),
    accessCodes: Object.fromEntries(
      classes.map((classItem) => [
        classItem.accessCode,
        {
          code: classItem.accessCode,
          meetingId: "demo-school-meeting",
          classId: classItem.id,
          classLabel: classItem.classLabel,
          meetingTitle: TURKISH_MEETING_TITLE,
          meetingDate: TURKISH_MEETING_DATE,
          expiresAt: new Date(`${TURKISH_MEETING_DATE}T23:59:59.999Z`).toISOString(),
          active: true,
        },
      ])
    ),
  };
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

function sortRooms(rooms) {
  return [...rooms].sort((a, b) => {
    const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
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
      delete store.roomsByMeeting[meetingId];
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

export async function getRooms(meetingId) {
  if (!hasFirestore()) {
    return sortRooms(clone(readDemoStore().roomsByMeeting[meetingId] || []));
  }

  const snap = await getDocs(collection(ensureDb(), "meetings", meetingId, "rooms"));
  return sortRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

export function subscribeRooms(meetingId, onUpdate) {
  if (!hasFirestore()) {
    onUpdate(sortRooms(clone(readDemoStore().roomsByMeeting[meetingId] || [])));
    return () => {};
  }

  return onSnapshot(collection(ensureDb(), "meetings", meetingId, "rooms"), (snap) => {
    onUpdate(sortRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  });
}

export async function createRoom(meetingId, roomData) {
  const roomId = roomData.id || localId("room");
  const order = Number.isFinite(Number(roomData.order)) ? Number(roomData.order) : Date.now();

  if (!hasFirestore()) {
    const payload = {
      id: roomId,
      name: roomData.name || "",
      floor: roomData.floor || "",
      note: roomData.note || "",
      order,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    updateDemoStore((store) => {
      ensureMeetingClassArray(store, meetingId);
      const rooms = store.roomsByMeeting[meetingId];
      const existing = rooms.findIndex((item) => item.id === roomId);
      if (existing >= 0) rooms[existing] = payload;
      else rooms.push(payload);
      return store;
    });
    return payload;
  }

  const payload = {
    id: roomId,
    name: roomData.name || "",
    floor: roomData.floor || "",
    note: roomData.note || "",
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(ensureDb(), "meetings", meetingId, "rooms", roomId), payload);
  return payload;
}

export async function updateRoom(meetingId, roomId, updates) {
  if (!hasFirestore()) {
    updateDemoStore((store) => {
      const room = store.roomsByMeeting?.[meetingId]?.find((item) => item.id === roomId);
      if (room) {
        Object.assign(room, updates, { updatedAt: nowIso() });
      }
      return store;
    });
    return;
  }

  await updateDoc(doc(ensureDb(), "meetings", meetingId, "rooms", roomId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteRoom(meetingId, roomId) {
  if (!hasFirestore()) {
    updateDemoStore((store) => {
      store.roomsByMeeting[meetingId] = (store.roomsByMeeting[meetingId] || []).filter((room) => room.id !== roomId);
      return store;
    });
    return;
  }

  await deleteDoc(doc(ensureDb(), "meetings", meetingId, "rooms", roomId));
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

export async function unmarkArrived(meetingId, classId, studentId) {
  if (!hasFirestore()) {
    updateDemoStore((store) => {
      const student = store.studentsByMeeting?.[meetingId]?.[classId]?.find((item) => item.id === studentId);
      if (student) {
        student.arrivedAt = null;
        student.arrivedMarkedBy = null;
        student.updatedAt = nowIso();
      }
      return store;
    });
    return;
  }

  await updateDoc(doc(ensureDb(), "meetings", meetingId, "classes", classId, "students", studentId), {
    arrivedAt: null,
    arrivedMarkedBy: null,
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
