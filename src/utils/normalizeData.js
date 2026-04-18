export function normalizeTeachers(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr.map((t) => ({
    id: Number(t?.id),
    name: t?.name || "",
    subject: t?.subject || "",
    room: t?.room || "",
    floor: t?.floor || "",
    time: t?.time || "",
    status: t?.status === "unavailable" ? "unavailable" : "active",
    note: t?.note || "",
  }));
}

export function normalizeClasses(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr.map((c) => ({
    id: Number(c?.id),
    name: c?.name || "",
    tids: Array.isArray(c?.tids) ? c.tids.map(Number).filter(Number.isFinite) : [],
  }));
}

export function normalizeStudents(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr.map((s) => ({
    id: Number(s?.id),
    child: s?.child || "",
    parent: s?.parent || "",
    cid: Number.isFinite(Number(s?.cid)) ? Number(s.cid) : null,
  }));
}

export function normalizeParentPayload(raw) {
  return {
    school: raw?.school || "",
    evtName: raw?.evtName || "",
    evtDate: raw?.evtDate || "",
    child: raw?.child || "",
    parent: raw?.parent || "",
    teachers: normalizeTeachers(raw?.teachers || []),
  };
}

export function buildMeetingsState(teachers) {
  const safeTeachers = Array.isArray(teachers) ? teachers : [];
  const m = {};
  safeTeachers.forEach((t) => {
    if (t && t.id !== undefined) {
      m[t.id] = { done: false, notes: "" };
    }
  });
  return m;
}
