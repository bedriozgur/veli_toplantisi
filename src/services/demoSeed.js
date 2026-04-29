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
  return next;
}

function hasFirestore() {
  return false;
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

function nowIso() {
  return new Date().toISOString();
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
