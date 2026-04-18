import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isCloudConfigured, loadEvent, loadProgress, publishEvent, saveProgress } from './cloud.js';

const G = '#1B3A2D';
const A = '#C4803A';
const CR = '#F5F0E8';
const STORAGE_KEY = 'parent-evening-admin-v3';
const PARENT_KEY_PREFIX = 'parent-evening-parent-v2:';

const SEED_T = [
  { id: 1, name: 'Ms. Sarah Johnson', subject: 'Maths', room: 'Room 12', time: '' },
  { id: 2, name: 'Mr. David Chen', subject: 'English', room: 'Room 7', time: '' },
  { id: 3, name: 'Dr. Emma Williams', subject: 'Science', room: 'Lab 2', time: '' },
  { id: 4, name: 'Mr. James Taylor', subject: 'History', room: 'Room 4', time: '' },
  { id: 5, name: 'Ms. Priya Patel', subject: 'Art', room: 'Art Studio', time: '' },
  { id: 6, name: 'Mr. Tom Harris', subject: 'PE', room: 'Sports Hall', time: '' },
  { id: 7, name: 'Ms. Liu Wei', subject: 'French', room: 'Room 9', time: '' },
  { id: 8, name: 'Mr. Rob Smith', subject: 'Geography', room: 'Room 3', time: '' },
];

const SEED_C = [
  { id: 10, name: 'Year 7A', tids: [1, 2, 3, 5, 7] },
  { id: 11, name: 'Year 7B', tids: [1, 2, 3, 6, 8] },
  { id: 12, name: 'Year 8A', tids: [1, 2, 3, 4, 5, 7] },
];

const SEED_S = [
  { id: 100, child: 'Alice Brown', parent: 'Mr & Mrs Brown', cid: 10 },
  { id: 101, child: 'James Wilson', parent: 'Ms Wilson', cid: 10 },
  { id: 102, child: 'Sophie Carter', parent: 'Dr Carter', cid: 12 },
];

const iBase = {
  width: '100%',
  border: '1.5px solid #E0D8CC',
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 14,
  boxSizing: 'border-box',
  outline: 'none',
  background: 'white',
  color: '#1C1C1C',
};

const enc = (data) => btoa(unescape(encodeURIComponent(JSON.stringify(data))));
const dec = (value) => JSON.parse(decodeURIComponent(escape(atob(value))));
const uid = () => Date.now() + Math.floor(Math.random() * 9999);
const cloudReady = isCloudConfigured();

const fmtDate = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

function makeEventCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function loadAdminState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeSetStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function safeRemoveStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function loadParentMeetings(keyId, teachers) {
  try {
    const raw = localStorage.getItem(`${PARENT_KEY_PREFIX}${keyId}`);
    if (!raw) return blankMeetings(teachers);
    const saved = JSON.parse(raw);
    return Object.fromEntries(
      (teachers || []).map((t) => [t.id, { done: Boolean(saved?.[t.id]?.done), notes: saved?.[t.id]?.notes || '' }])
    );
  } catch {
    return blankMeetings(teachers);
  }
}

function blankMeetings(teachers) {
  return Object.fromEntries((teachers || []).map((t) => [t.id, { done: false, notes: '' }]));
}

function eventPayload({ school, evtName, evtDate, notesEmail, eventCode, teachers, classes, students }) {
  return { school, evtName, evtDate, notesEmail, eventCode, teachers, classes, students };
}

function buildParentPayload(source, student) {
  const cls = (source.classes || []).find((c) => c.id === student.cid);
  const teacherList = cls ? (source.teachers || []).filter((t) => cls.tids.includes(t.id)) : [];
  return {
    school: source.school,
    evtName: source.evtName,
    evtDate: source.evtDate,
    notesEmail: source.notesEmail || '',
    eventCode: source.eventCode || '',
    studentId: student.id,
    child: student.child,
    parent: student.parent,
    className: cls?.name || '',
    keyId: `${source.eventCode || 'local'}-${student.id}-${source.evtDate || 'event'}`,
    teachers: teacherList,
  };
}

function App() {
  const [mode, setMode] = useState(null);
  const [bootError, setBootError] = useState('');
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState('teachers');
  const [school, setSchool] = useState('Oakwood Academy');
  const [evtName, setEvtName] = useState("Parents' Evening");
  const [evtDate, setEvtDate] = useState('');
  const [notesEmail, setNotesEmail] = useState('parents-evening@school.org');
  const [eventCode, setEventCode] = useState(makeEventCode());
  const [teachers, setTeachers] = useState(SEED_T);
  const [classes, setClasses] = useState(SEED_C);
  const [students, setStudents] = useState(SEED_S);
  const [pData, setPData] = useState(null);
  const [entranceData, setEntranceData] = useState(null);
  const [meetings, setMeetings] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [qrStuId, setQrStuId] = useState(null);
  const [showEventQr, setShowEventQr] = useState(false);
  const [copied, setCopied] = useState('');
  const [publishState, setPublishState] = useState('');
  const [routeMeta, setRouteMeta] = useState({ eventCode: '', studentId: '' });

  useEffect(() => {
    const link = document.createElement('link');
    link.href =
      'https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    const init = async () => {
      try {
        const hash = window.location.hash;
        if (hash.startsWith('#p=')) {
          const decoded = dec(hash.slice(3));
          if (decoded.eventCode && decoded.studentId && cloudReady) {
            const remoteEvent = await loadEvent(decoded.eventCode);
            if (!remoteEvent) throw new Error('The event could not be loaded from the cloud.');
            const student = (remoteEvent.students || []).find((s) => s.id === decoded.studentId);
            if (!student) throw new Error('This student is not in the published event.');
            const payload = buildParentPayload(remoteEvent, student);
            const local = loadParentMeetings(payload.keyId, payload.teachers);
            const remote = await loadProgress(decoded.eventCode, decoded.studentId);
            setPData(payload);
            setMeetings(remote || local);
            setRouteMeta({ eventCode: decoded.eventCode, studentId: decoded.studentId });
          } else {
            setPData(decoded);
            setMeetings(loadParentMeetings(decoded.keyId || decoded.child || 'parent', decoded.teachers || []));
          }
          setMode('parent');
        } else if (hash.startsWith('#eventCode=')) {
          const code = decodeURIComponent(hash.slice(11)).toUpperCase();
          setRouteMeta({ eventCode: code, studentId: '' });
          if (!cloudReady) throw new Error('This QR needs Firebase cloud mode. Add the Firebase env vars and restart the app.');
          const remoteEvent = await loadEvent(code);
          if (!remoteEvent) throw new Error(`No published event was found for code ${code}.`);
          setEntranceData(remoteEvent);
          setMode('entrance');
        } else if (hash.startsWith('#event=')) {
          setEntranceData(dec(hash.slice(7)));
          setMode('entrance');
        } else {
          const saved = loadAdminState();
          if (saved) {
            setSchool(saved.school ?? 'Oakwood Academy');
            setEvtName(saved.evtName ?? "Parents' Evening");
            setEvtDate(saved.evtDate ?? '');
            setNotesEmail(saved.notesEmail ?? 'parents-evening@school.org');
            setEventCode(saved.eventCode ?? makeEventCode());
            setTeachers(saved.teachers ?? SEED_T);
            setClasses(saved.classes ?? SEED_C);
            setStudents(saved.students ?? SEED_S);
          }
          setMode('admin');
        }
      } catch (error) {
        setBootError(String(error?.message || error));
        setMode('error');
      } finally {
        setLoading(false);
      }
    };

    init();

    return () => {
      try {
        document.head.removeChild(link);
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (mode !== 'admin') return;
    safeSetStorage(
      STORAGE_KEY,
      JSON.stringify({ school, evtName, evtDate, notesEmail, eventCode, teachers, classes, students })
    );
  }, [mode, school, evtName, evtDate, notesEmail, eventCode, teachers, classes, students]);

  useEffect(() => {
    if (mode !== 'parent' || !pData?.keyId) return;
    safeSetStorage(`${PARENT_KEY_PREFIX}${pData.keyId}`, JSON.stringify(meetings));
    if (cloudReady && pData.eventCode && pData.studentId) {
      saveProgress(pData.eventCode, pData.studentId, meetings).catch(() => {});
    }
  }, [mode, pData, meetings]);

  const currentEvent = eventPayload({ school, evtName, evtDate, notesEmail, eventCode, teachers, classes, students });
  const eventUrl = cloudReady && eventCode
    ? `${window.location.href.split('#')[0]}#eventCode=${encodeURIComponent(eventCode)}`
    : `${window.location.href.split('#')[0]}#event=${enc(currentEvent)}`;

  const studentUrl = (student) => {
    if (cloudReady && eventCode) {
      return `${window.location.href.split('#')[0]}#p=${enc({ eventCode, studentId: student.id })}`;
    }
    return `${window.location.href.split('#')[0]}#p=${enc(buildParentPayload(currentEvent, student))}`;
  };

  const copyText = async (value, key) => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch {}
  };

  const shareStudentCard = async (student) => {
    const url = studentUrl(student);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${evtName} - ${student.child}`, text: `${student.child} meeting list`, url });
        return;
      } catch {}
    }
    copyText(url, `student-${student.id}`);
  };

  const publishCurrentEvent = async () => {
    try {
      if (!cloudReady) throw new Error('Firebase cloud mode is not configured yet.');
      if (!eventCode.trim()) throw new Error('Add an event code first.');
      setPublishState('Publishing...');
      await publishEvent(eventCode.trim().toUpperCase(), currentEvent);
      setEventCode(eventCode.trim().toUpperCase());
      setPublishState('Published to cloud');
    } catch (error) {
      setPublishState(String(error?.message || error));
    }
  };

  const openParentView = async (student, source) => {
    const payload = buildParentPayload(source, student);
    window.location.hash = `p=${enc(source.eventCode ? { eventCode: source.eventCode, studentId: student.id } : payload)}`;
  };

  const resetDemoData = () => {
    if (!window.confirm('Reset all admin data back to the demo seed data?')) return;
    safeRemoveStorage(STORAGE_KEY);
    setSchool('Oakwood Academy');
    setEvtName("Parents' Evening");
    setEvtDate('');
    setNotesEmail('parents-evening@school.org');
    setEventCode(makeEventCode());
    setTeachers(SEED_T);
    setClasses(SEED_C);
    setStudents(SEED_S);
    setPublishState('');
  };

  const importSetup = (nextState) => {
    setSchool(nextState.school ?? 'Oakwood Academy');
    setEvtName(nextState.evtName ?? "Parents' Evening");
    setEvtDate(nextState.evtDate ?? '');
    setNotesEmail(nextState.notesEmail ?? 'parents-evening@school.org');
    setEventCode(nextState.eventCode ?? makeEventCode());
    setTeachers(Array.isArray(nextState.teachers) ? nextState.teachers : []);
    setClasses(Array.isArray(nextState.classes) ? nextState.classes : []);
    setStudents(Array.isArray(nextState.students) ? nextState.students : []);
  };

  const sendEmail = () => {
    if (!pData) return;
    const dateLine = fmtDate(pData.evtDate);
    const header = `${pData.evtName} - ${pData.school}${dateLine ? `\n${dateLine}` : ''}${pData.child ? `\nStudent: ${pData.child}` : ''}${pData.className ? `\nClass: ${pData.className}` : ''}\n${'-'.repeat(36)}\n\n`;
    const body =
      header +
      (pData.teachers || [])
        .map((t) => {
          const m = meetings[t.id] || {};
          return `${m.done ? '[x]' : '[ ]'} ${t.name} (${t.subject})${t.time ? ` - ${t.time}` : ''}${t.room ? ` - ${t.room}` : ''}${m.notes ? `\n${m.notes}` : ''}`;
        })
        .join('\n\n');
    window.location.href = `mailto:${encodeURIComponent(pData.notesEmail || '')}?subject=${encodeURIComponent(
      `${pData.evtName} Notes${pData.child ? ` - ${pData.child}` : ''}`
    )}&body=${encodeURIComponent(body)}`;
  };

  if (loading) return <LoadingScreen label="Loading event" />;

  if (mode === 'error') return <ErrorScreen message={bootError} routeMeta={routeMeta} />;

  if (mode === 'entrance' && entranceData) {
    return <EntranceView data={entranceData} copyText={copyText} copied={copied} openParentView={openParentView} />;
  }

  if (mode === 'parent' && pData) {
    const ts = pData.teachers || [];
    const done = Object.values(meetings).filter((m) => m.done).length;
    const total = ts.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const all = done === total && total > 0;

    return (
      <div style={{ minHeight: '100vh', background: CR, maxWidth: 480, margin: '0 auto', paddingBottom: 100 }}>
        <div style={{ background: G, padding: '26px 20px 24px', color: 'white' }}>
          <div style={{ fontSize: 10, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.5, marginBottom: 6 }}>{pData.school}</div>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 700, lineHeight: 1.1, marginBottom: 4 }}>{pData.evtName}</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 2 }}>{pData.child}{pData.parent ? ` · ${pData.parent}` : ''}</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>{[pData.className, fmtDate(pData.evtDate)].filter(Boolean).join(' · ')}</div>
          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '14px 16px', marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontSize: 13, opacity: 0.9 }}>{all ? 'All meetings complete' : `${total - done} remaining`}</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700 }}>{pct}%</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
              <div style={{ background: all ? '#5DD88A' : A, height: '100%', width: `${pct}%`, borderRadius: 999, transition: 'width .5s ease' }} />
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#9A9A9A', marginBottom: 10 }}>Your meetings</div>
          {ts.map((t) => {
            const m = meetings[t.id] || {};
            const ex = expanded === t.id;
            return (
              <div key={t.id} style={{ background: m.done ? '#F0F7F3' : 'white', borderRadius: 18, marginBottom: 10, border: m.done ? `2px solid ${G}22` : '2px solid transparent', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
                  <button onClick={() => setMeetings((prev) => ({ ...prev, [t.id]: { ...prev[t.id], done: !prev[t.id]?.done } }))} style={{ width: 36, height: 36, borderRadius: '50%', border: m.done ? `2.5px solid ${G}` : '2.5px solid #D4CCC4', background: m.done ? G : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {m.done && <span style={{ color: 'white', fontSize: 17 }}>✓</span>}
                  </button>
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpanded(ex ? null : t.id)}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: m.done ? '#5A7A65' : '#1C1C1C', textDecoration: m.done ? 'line-through' : 'none' }}>{t.name}</div>
                    <div style={{ fontSize: 13, color: '#9A9A9A', marginTop: 2 }}>{[t.subject, t.room, t.time].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div style={{ textAlign: 'right', cursor: 'pointer', flexShrink: 0 }} onClick={() => setExpanded(ex ? null : t.id)}>
                    <div style={{ fontSize: 12, marginTop: 4, color: m.notes ? G : '#BBBBBB' }}>{m.notes ? 'note saved ▾' : 'note ▾'}</div>
                  </div>
                </div>
                {ex && (
                  <div style={{ borderTop: '1px solid #ECEAE6', padding: '14px 16px', background: 'rgba(255,255,255,0.5)' }}>
                    <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#9A9A9A', marginBottom: 8 }}>Notes</div>
                    <textarea value={m.notes || ''} onChange={(e) => setMeetings((prev) => ({ ...prev, [t.id]: { ...prev[t.id], notes: e.target.value } }))} rows={3} style={{ width: '100%', border: '1.5px solid #E0D8CC', borderRadius: 12, padding: '10px 14px', fontSize: 14, resize: 'none', boxSizing: 'border-box', outline: 'none', background: 'white', lineHeight: 1.6 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, padding: '12px 16px 28px', background: `linear-gradient(to top,${CR} 65%,transparent)` }}>
          <button onClick={sendEmail} style={{ width: '100%', padding: '16px 20px', background: all ? G : done > 0 ? A : '#C4BDB5', color: 'white', border: 'none', borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {pData.notesEmail ? (all ? 'Email notes to school' : done > 0 ? `Email notes so far (${done}/${total})` : 'Email notes') : 'Set notes email in admin'}
          </button>
        </div>
      </div>
    );
  }

  const qrStudent = qrStuId ? students.find((s) => s.id === qrStuId) : null;

  return (
    <div style={{ minHeight: '100vh', background: CR, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ background: G, padding: '22px 20px 0', color: 'white' }}>
        <div style={{ fontSize: 10, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.5, marginBottom: 4 }}>Admin panel</div>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, marginBottom: 14 }}>{school} · {evtName}</div>
        <div style={{ display: 'flex' }}>
          {[
            ['teachers', 'Teachers'],
            ['classes', 'Classes'],
            ['students', 'Students & QR'],
          ].map(([tab, label]) => (
            <button key={tab} onClick={() => setAdminTab(tab)} style={{ flex: 1, background: adminTab === tab ? CR : 'transparent', color: adminTab === tab ? G : 'rgba(255,255,255,0.6)', border: 'none', padding: '11px 4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: adminTab === tab ? '10px 10px 0 0' : 0 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 16px 120px' }}>
        {adminTab === 'teachers' && (
          <TeachersTab
            school={school}
            setSchool={setSchool}
            evtName={evtName}
            setEvtName={setEvtName}
            evtDate={evtDate}
            setEvtDate={setEvtDate}
            notesEmail={notesEmail}
            setNotesEmail={setNotesEmail}
            eventCode={eventCode}
            setEventCode={setEventCode}
            teachers={teachers}
            setTeachers={setTeachers}
            onRemove={(id) => {
              setTeachers((prev) => prev.filter((t) => t.id !== id));
              setClasses((prev) => prev.map((c) => ({ ...c, tids: c.tids.filter((x) => x !== id) })));
            }}
            resetDemoData={resetDemoData}
            exportData={currentEvent}
            importSetup={importSetup}
            copyText={copyText}
            copied={copied}
            publishCurrentEvent={publishCurrentEvent}
            publishState={publishState}
          />
        )}
        {adminTab === 'classes' && (
          <ClassesTab classes={classes} setClasses={setClasses} teachers={teachers} students={students} onRemove={(id) => {
            setClasses((prev) => prev.filter((c) => c.id !== id));
            setStudents((prev) => prev.map((s) => (s.cid === id ? { ...s, cid: null } : s)));
          }} />
        )}
        {adminTab === 'students' && (
          <StudentsTab students={students} setStudents={setStudents} classes={classes} teachers={teachers} qrStuId={qrStuId} setQrStuId={setQrStuId} copied={copied} shareStudentCard={shareStudentCard} setShowEventQr={setShowEventQr} cloudReady={cloudReady} eventCode={eventCode} publishState={publishState} />
        )}
      </div>

      {showEventQr && (
        <QrModal
          title="Entrance QR"
          subtitle={cloudReady ? 'Parents scan, search their child, and open the checklist without exposing the whole roster in the URL.' : 'Cloud mode is not configured yet. This QR falls back to local hash data.'}
          imageUrl={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(eventUrl)}&bgcolor=F5F0E8&color=1B3A2D&margin=6`}
          footer={cloudReady ? `Event code ${eventCode}` : 'Configure Firebase env vars for privacy-safe cloud mode'}
          primaryLabel={copied === 'event-link' ? '✓ Link copied' : 'Copy entrance link'}
          onPrimary={() => copyText(eventUrl, 'event-link')}
          onClose={() => setShowEventQr(false)}
        />
      )}

      {qrStudent && (
        <QrModal
          title={qrStudent.child}
          subtitle={`${classes.find((c) => c.id === qrStudent.cid)?.name || 'No class assigned'}${qrStudent.parent ? ` · ${qrStudent.parent}` : ''}`}
          imageUrl={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(studentUrl(qrStudent))}&bgcolor=F5F0E8&color=1B3A2D&margin=6`}
          footer={`${(classes.find((c) => c.id === qrStudent.cid)?.tids || []).length} teachers on this list`}
          primaryLabel={copied === `student-${qrStudent.id}` ? '✓ Link copied' : 'Copy student link'}
          secondaryLabel="Share"
          onPrimary={() => copyText(studentUrl(qrStudent), `student-${qrStudent.id}`)}
          onSecondary={() => shareStudentCard(qrStudent)}
          onClose={() => setQrStuId(null)}
        />
      )}
    </div>
  );
}

function EntranceView({ data, copyText, copied, openParentView }) {
  const [query, setQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const revealResults = query.trim().length >= 2;

  const visibleStudents = useMemo(() => {
    if (!revealResults) return [];
    return (data.students || [])
      .filter((student) => selectedClass === 'all' || String(student.cid) === selectedClass)
      .filter((student) => student.child.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => a.child.localeCompare(b.child));
  }, [data.students, query, selectedClass, revealResults]);

  return (
    <div style={{ minHeight: '100vh', background: CR, maxWidth: 520, margin: '0 auto', paddingBottom: 28 }}>
      <div style={{ background: G, color: 'white', padding: '28px 20px 22px' }}>
        <div style={{ fontSize: 10, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.55, marginBottom: 8 }}>Entrance list</div>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 30, lineHeight: 1.05, marginBottom: 6 }}>{data.evtName}</div>
        <div style={{ fontSize: 14, opacity: 0.82 }}>{data.school}</div>
        <div style={{ fontSize: 13, opacity: 0.62, marginTop: 4 }}>{fmtDate(data.evtDate)}</div>
        <div style={{ marginTop: 18, background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: '14px 16px' }}>Type at least 2 letters from the student name to reveal matching families.</div>
      </div>

      <div style={{ padding: 16 }}>
        <Card>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search student name" style={{ ...iBase, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            <Chip label={`All classes (${data.students.length})`} active={selectedClass === 'all'} onClick={() => setSelectedClass('all')} />
            {(data.classes || []).map((cls) => <Chip key={cls.id} label={cls.name} active={selectedClass === String(cls.id)} onClick={() => setSelectedClass(String(cls.id))} />)}
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, color: G }}>Families <N n={visibleStudents.length} /></div>
          <Btn light onClick={() => copyText(window.location.href, 'entrance-link')}>{copied === 'entrance-link' ? '✓ Link copied' : 'Copy this page'}</Btn>
        </div>

        {!revealResults && <Empty>Start typing the student name to reveal results.</Empty>}

        {visibleStudents.map((student) => {
          const cls = (data.classes || []).find((c) => c.id === student.cid);
          const teacherCount = cls?.tids?.length || 0;
          return (
            <Card key={student.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: G }}>{student.child}</div>
                  <div style={{ fontSize: 13, color: '#857A70', marginTop: 2 }}>{[cls?.name, `${teacherCount} teachers`].filter(Boolean).join(' · ')}</div>
                </div>
                <Btn amber onClick={() => openParentView(student, data)}>Open list</Btn>
              </div>
            </Card>
          );
        })}

        {revealResults && !visibleStudents.length && <Empty>No matching students found</Empty>}
      </div>
    </div>
  );
}

function TeachersTab({ school, setSchool, evtName, setEvtName, evtDate, setEvtDate, notesEmail, setNotesEmail, eventCode, setEventCode, teachers, setTeachers, onRemove, resetDemoData, exportData, importSetup, copyText, copied, publishCurrentEvent, publishState }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', subject: '', room: '', time: '' });
  const [editId, setEditId] = useState(null);
  const [editFm, setEditFm] = useState({});
  const fileInputRef = useRef(null);

  const addTeacher = () => {
    if (!form.name.trim()) return;
    setTeachers((prev) => [...prev, { ...form, id: uid() }]);
    setForm({ name: '', subject: '', room: '', time: '' });
    setShowAdd(false);
  };

  const saveEdit = () => {
    setTeachers((prev) => prev.map((t) => (t.id === editId ? { ...t, ...editFm } : t)));
    setEditId(null);
  };

  const downloadSetup = () => {
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(eventCode || 'parent-evening').toLowerCase()}-setup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importSetup(JSON.parse(text));
    event.target.value = '';
  };

  return (
    <div>
      <Card>
        <SLabel>Event details</SLabel>
        <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="School name" style={{ ...iBase, marginBottom: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input value={evtName} onChange={(e) => setEvtName(e.target.value)} placeholder="Event name" style={iBase} />
          <input type="date" value={evtDate} onChange={(e) => setEvtDate(e.target.value)} style={iBase} />
        </div>
        <input value={notesEmail} onChange={(e) => setNotesEmail(e.target.value)} placeholder="Notes recipient email" style={{ ...iBase, marginBottom: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
          <input value={eventCode} onChange={(e) => setEventCode(e.target.value.toUpperCase())} placeholder="Event code" style={iBase} />
          <Btn light onClick={() => setEventCode(makeEventCode())}>New code</Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <Btn full light onClick={downloadSetup}>Download setup file</Btn>
          <Btn full light onClick={() => fileInputRef.current?.click()}>Import setup file</Btn>
        </div>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={importFile} style={{ display: 'none' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <Btn full light onClick={() => copyText(JSON.stringify(exportData, null, 2), 'setup-json')}>{copied === 'setup-json' ? '✓ Setup copied' : 'Copy setup JSON'}</Btn>
          <Btn full onClick={resetDemoData}>Reset demo</Btn>
        </div>
        <Btn amber full onClick={publishCurrentEvent}>{cloudReady ? 'Publish or update cloud event' : 'Publish disabled until Firebase env is configured'}</Btn>
        <div style={{ fontSize: 12, color: publishState.includes('Published') ? '#2E7D4F' : '#7A6D61', marginTop: 8 }}>{publishState || (cloudReady ? 'Cloud mode is ready. Publish before using the shared entrance QR.' : 'Cloud mode is off. Add Firebase env vars for privacy-safe entrance QR and shared progress.')}</div>
      </Card>

      <Row><SHead>Teachers <N n={teachers.length} /></SHead><Btn onClick={() => setShowAdd((prev) => !prev)} amber={!showAdd}>{showAdd ? 'Cancel' : '+ Add'}</Btn></Row>

      {showAdd && (
        <Card border>
          <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Full name *" style={{ ...iBase, marginBottom: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[['subject', 'Subject'], ['room', 'Room'], ['time', 'Time slot']].map(([key, placeholder]) => <input key={key} value={form[key]} onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} style={{ ...iBase, padding: '8px 10px', fontSize: 13 }} />)}
          </div>
          <Btn onClick={addTeacher} amber full>Add teacher</Btn>
        </Card>
      )}

      {teachers.map((t) => (
        <Card key={t.id}>
          {editId === t.id ? (
            <>
              <input value={editFm.name || ''} onChange={(e) => setEditFm((prev) => ({ ...prev, name: e.target.value }))} style={{ ...iBase, marginBottom: 8 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                {[['subject', 'Subject'], ['room', 'Room'], ['time', 'Time slot']].map(([key, placeholder]) => <input key={key} value={editFm[key] || ''} onChange={(e) => setEditFm((prev) => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} style={{ ...iBase, padding: '8px 10px', fontSize: 13 }} />)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={saveEdit} full>Save</Btn>
                <Btn onClick={() => setEditId(null)} full light>Cancel</Btn>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: '#9A9A9A', marginTop: 2 }}>{[t.subject, t.room, t.time].filter(Boolean).join(' · ')}</div>
              </div>
              <IBtn onClick={() => { setEditId(t.id); setEditFm({ ...t }); }}>✎</IBtn>
              <IBtn onClick={() => onRemove(t.id)} red>✕</IBtn>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function ClassesTab({ classes, setClasses, teachers, students, onRemove }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [openId, setOpenId] = useState(null);

  const addClass = () => {
    if (!newName.trim()) return;
    setClasses((prev) => [...prev, { id: uid(), name: newName.trim(), tids: [] }]);
    setNewName('');
    setShowAdd(false);
  };

  const toggleTeacher = (cid, tid) => setClasses((prev) => prev.map((c) => c.id !== cid ? c : { ...c, tids: c.tids.includes(tid) ? c.tids.filter((x) => x !== tid) : [...c.tids, tid] }));

  return (
    <div>
      <Row><SHead>Classes <N n={classes.length} /></SHead><Btn onClick={() => setShowAdd((prev) => !prev)} amber={!showAdd}>{showAdd ? 'Cancel' : '+ Add'}</Btn></Row>
      {showAdd && <Card border><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Class name, e.g. Year 8A" style={{ ...iBase, marginBottom: 10 }} /><Btn onClick={addClass} amber full>Add class</Btn></Card>}
      {classes.map((cls) => {
        const isOpen = openId === cls.id;
        const studentCount = students.filter((s) => s.cid === cls.id).length;
        return (
          <div key={cls.id} style={{ background: 'white', borderRadius: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: G }}>{cls.name}</div>
                <div style={{ fontSize: 12, color: '#9A9A9A', marginTop: 2 }}>{cls.tids.length} teachers · {studentCount} students</div>
              </div>
              <Btn onClick={() => setOpenId(isOpen ? null : cls.id)} style={{ background: isOpen ? G : '#E8F0EC', color: isOpen ? 'white' : G }}>{isOpen ? 'Done ✓' : 'Edit teachers'}</Btn>
              <IBtn onClick={() => onRemove(cls.id)} red>✕</IBtn>
            </div>
            {isOpen && <div style={{ borderTop: '1px solid #F0EBE3', padding: '12px 16px' }}>{teachers.map((t, index) => {
              const checked = cls.tids.includes(t.id);
              return <div key={t.id} onClick={() => toggleTeacher(cls.id, t.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: index < teachers.length - 1 ? '1px solid #F5F2EE' : 'none', cursor: 'pointer' }}><div style={{ width: 24, height: 24, borderRadius: 6, border: checked ? `2px solid ${G}` : '2px solid #D4CCC4', background: checked ? G : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{checked && <span style={{ color: 'white', fontSize: 13 }}>✓</span>}</div><div><div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div><div style={{ fontSize: 12, color: '#9A9A9A' }}>{[t.subject, t.room].filter(Boolean).join(' · ')}</div></div></div>;
            })}</div>}
          </div>
        );
      })}
    </div>
  );
}

function StudentsTab({ students, setStudents, classes, qrStuId, setQrStuId, copied, shareStudentCard, setShowEventQr, cloudReady, eventCode, publishState }) {
  const [showAdd, setShowAdd] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [form, setForm] = useState({ child: '', parent: '', cid: '' });
  const [bulkText, setBulkText] = useState('');
  const [bulkCid, setBulkCid] = useState('');
  const [filter, setFilter] = useState('all');

  const addOne = () => {
    if (!form.child.trim()) return;
    setStudents((prev) => [...prev, { ...form, cid: form.cid ? Number(form.cid) : null, id: uid() }]);
    setForm((prev) => ({ child: '', parent: '', cid: prev.cid }));
    setShowAdd(false);
  };

  const addBulk = () => {
    const names = bulkText.split('\n').map((n) => n.trim()).filter(Boolean);
    setStudents((prev) => [...prev, ...names.map((child) => ({ id: uid(), child, parent: '', cid: bulkCid ? Number(bulkCid) : null }))]);
    setBulkText('');
    setBulk(false);
  };

  const visible = useMemo(() => students.filter((s) => filter === 'all' || s.cid === Number(filter)), [students, filter]);
  const selStyle = { ...iBase, appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\'%3E%3Cpath d=\'M5 7l5 5 5-5\' stroke=\'%23999\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 36 };

  return (
    <div>
      <Card>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, color: G, marginBottom: 6 }}>Entrance sharing</div>
        <div style={{ fontSize: 13, color: '#7D746C', marginBottom: 12 }}>{cloudReady ? `Publish code ${eventCode} before placing the shared entrance QR.` : 'Configure Firebase env vars to replace the full-data QR with a short event-code QR.'}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Btn full onClick={() => setShowEventQr(true)}>Open entrance QR</Btn>
          <Btn full light disabled>{publishState || (cloudReady ? 'Ready to publish' : 'Cloud off')}</Btn>
        </div>
      </Card>

      <Row><SHead>Students <N n={students.length} /></SHead><div style={{ display: 'flex', gap: 6 }}><Btn onClick={() => { setBulk((prev) => !prev); setShowAdd(false); }} light>{bulk ? 'Cancel' : 'Bulk ↓'}</Btn><Btn onClick={() => { setShowAdd((prev) => !prev); setBulk(false); }} amber={!showAdd}>{showAdd ? 'Cancel' : '+ Add'}</Btn></div></Row>

      {showAdd && <Card border><input value={form.child} onChange={(e) => setForm((prev) => ({ ...prev, child: e.target.value }))} placeholder="Student name *" style={{ ...iBase, marginBottom: 8 }} /><input value={form.parent} onChange={(e) => setForm((prev) => ({ ...prev, parent: e.target.value }))} placeholder="Parent name (optional)" style={{ ...iBase, marginBottom: 8 }} /><select value={form.cid} onChange={(e) => setForm((prev) => ({ ...prev, cid: e.target.value }))} style={{ ...selStyle, marginBottom: 12 }}><option value="">Assign to class…</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Btn onClick={addOne} amber full>Add student</Btn></Card>}

      {bulk && <Card border><textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={5} placeholder={'Alice Brown\nJames Wilson'} style={{ width: '100%', border: '1.5px solid #E0D8CC', borderRadius: 10, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', outline: 'none', resize: 'none', marginBottom: 8 }} /><select value={bulkCid} onChange={(e) => setBulkCid(e.target.value)} style={{ ...selStyle, marginBottom: 12 }}><option value="">Assign to class…</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Btn onClick={addBulk} amber full disabled={!bulkText.trim()}>Add {bulkText.split('\n').filter((n) => n.trim()).length} students</Btn></Card>}

      {classes.length > 0 && <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}><Chip label={`All (${students.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />{classes.map((c) => <Chip key={c.id} label={`${c.name} (${students.filter((s) => s.cid === c.id).length})`} active={filter === String(c.id)} onClick={() => setFilter(String(c.id))} />)}</div>}

      {visible.map((s) => {
        const cls = classes.find((c) => c.id === s.cid);
        const teacherCount = cls ? cls.tids.length : 0;
        return <div key={s.id} style={{ background: 'white', borderRadius: 14, padding: '13px 16px', marginBottom: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{s.child}</div><div style={{ fontSize: 12, color: cls ? '#9A9A9A' : '#D44', marginTop: 2 }}>{cls ? `${cls.name} · ${teacherCount} teachers` : 'No class assigned'}{s.parent ? ` · ${s.parent}` : ''}</div></div><button onClick={() => setQrStuId(qrStuId === s.id ? null : s.id)} style={{ background: qrStuId === s.id ? G : '#E8F0EC', color: qrStuId === s.id ? 'white' : G, border: 'none', borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{qrStuId === s.id ? '▲ Close' : 'QR'}</button><Btn light onClick={() => shareStudentCard(s)}>Share</Btn><IBtn onClick={() => setStudents((prev) => prev.filter((x) => x.id !== s.id))} red>✕</IBtn></div>;
      })}
    </div>
  );
}

function LoadingScreen({ label }) {
  return <div style={{ minHeight: '100vh', background: CR, display: 'flex', alignItems: 'center', justifyContent: 'center', color: G, fontFamily: "'DM Sans',sans-serif" }}>{label}...</div>;
}

function ErrorScreen({ message, routeMeta }) {
  return <div style={{ minHeight: '100vh', background: CR, padding: 24, color: G }}><div style={{ maxWidth: 720, margin: '0 auto' }}><div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6, marginBottom: 10 }}>App error</div><h1 style={{ margin: '0 0 12px', fontSize: 28 }}>The app could not open this event</h1><p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>{message}</p>{routeMeta.eventCode && <p style={{ margin: 0, opacity: 0.7 }}>Event code: {routeMeta.eventCode}</p>}</div></div>;
}

function QrModal({ title, subtitle, imageUrl, footer, primaryLabel, secondaryLabel, onPrimary, onSecondary, onClose }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }} onClick={onClose}><div style={{ background: 'white', borderRadius: 24, padding: 28, width: '100%', maxWidth: 340, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}><div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: G, marginBottom: 4 }}>{title}</div><div style={{ fontSize: 12, color: '#9A9A9A', marginBottom: 12 }}>{subtitle}</div><div style={{ background: '#F5F0E8', borderRadius: 16, padding: 14, display: 'inline-block', marginBottom: 14 }}><img src={imageUrl} alt="QR" style={{ width: 220, height: 220, display: 'block', borderRadius: 8 }} /></div><div style={{ background: '#E8F0EC', borderRadius: 10, padding: '8px 14px', fontSize: 12, color: G, fontWeight: 600, marginBottom: 14 }}>{footer}</div><button onClick={onPrimary} style={{ width: '100%', background: '#F0EBE3', color: G, border: 'none', borderRadius: 12, padding: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: secondaryLabel ? 8 : 10 }}>{primaryLabel}</button>{secondaryLabel && <button onClick={onSecondary} style={{ width: '100%', background: '#E8F0EC', color: G, border: 'none', borderRadius: 12, padding: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>{secondaryLabel}</button>}<button onClick={onClose} style={{ width: '100%', background: G, color: 'white', border: 'none', borderRadius: 12, padding: 11, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Close</button></div></div>;
}

function Btn({ onClick, children, amber, light, full, disabled, style = {} }) {
  return <button onClick={onClick} disabled={disabled} style={{ background: amber ? A : light ? '#F0EBE3' : G, color: amber || !light ? 'white' : '#555', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', width: full ? '100%' : 'auto', opacity: disabled ? 0.6 : 1, ...style }}>{children}</button>;
}

function IBtn({ onClick, red, children }) {
  return <button onClick={onClick} style={{ background: red ? '#FEF0F0' : '#F5F2EE', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: red ? '#D44' : '#666', fontSize: 14, flexShrink: 0 }}>{children}</button>;
}

function Card({ children, border }) {
  return <div style={{ background: 'white', borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: border ? `2px solid ${A}` : 'none' }}>{children}</div>;
}

function Row({ children }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>{children}</div>;
}

function SLabel({ children }) {
  return <div style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#9A9A9A', marginBottom: 12 }}>{children}</div>;
}

function SHead({ children }) {
  return <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600, color: G }}>{children}</div>;
}

function N({ n }) {
  return <span style={{ fontSize: 13, color: '#9A9A9A', fontWeight: 400 }}> ({n})</span>;
}

function Chip({ label, active, onClick }) {
  return <button onClick={onClick} style={{ background: active ? G : '#E8F0EC', color: active ? 'white' : G, border: active ? 'none' : '1.5px solid #D0E4D8', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>{label}</button>;
}

function Empty({ children }) {
  return <div style={{ textAlign: 'center', padding: '36px 20px', color: '#BBBBBB', fontSize: 13 }}>{children}</div>;
}

export default App;
