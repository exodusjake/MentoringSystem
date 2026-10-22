import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { ConfirmX } from '../../components/ConfirmX.jsx';
import DateInput from '../../components/DateInput.jsx';
import Empty from '../../components/Empty.jsx';
import { showToast } from '../../components/Notify.jsx';
import Select from '../../components/Select.jsx';
import TimeInput from '../../components/TimeInput.jsx';
import { apiRequest, validateUploadFile } from '../../lib/api.js';
import { checkpointDateAllowed, checkpointToday, checkpointWindow } from '../../lib/checkpoint-window.js';
import { CONFIG } from '../../lib/config.js';
import { sessionDisplayStatus } from '../../lib/dashboard-sessions.js';
import { loadScript } from '../../lib/loadScript.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { getSession } from '../../lib/session.js';
import { useStayOnBack } from './useStayOnBack.js';

// Mentor Sessions (MENTOR/HTML/sessions.html + sessions.js): the session log, logging/editing/
// cancelling/deleting sessions, QR attendance, and session proof upload.

// Mirrors the backend's Constants/MentoringSlots.cs.
const MENTORING_SLOTS = ['Mentoring Assembly', 'Before Prelims', 'After Prelims', 'Before Midterms', 'After Midterms', 'Before Finals'];
const slotsForSemester = semester => semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;
const QR_LIB = '/MENTOR/JS/html5-qrcode.min.js';

function localISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const longDate = date => date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
const shortTime = date => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
const stripSection = topic => (topic || '').replace(/^\[[^\]]+\]\s*/, '');

// Why a session can't take a proof upload yet ('' when it can).
function proofUnavailableReason(session) {
  if (!session) return 'This session is no longer available. Refresh the session list.';
  if (session.sessionStatus === 'Cancelled') return 'Proof cannot be uploaded for a cancelled session.';
  // Older API responses have no hasVerifiedAttendance; fall back to the present count.
  const verified = typeof session.hasVerifiedAttendance === 'boolean' ? session.hasVerifiedAttendance : Number(session.presentCount) > 0;
  return verified ? '' : 'Record at least one verified QR attendance before uploading proof.';
}
// Phones keep native capture; desktop browsers use a small webcam preview.
const markSelected = el => { if (el) el.setAttribute('selected', ''); };
const usesNativeCamera = () => navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export default function MentorSessions() {
  useStayOnBack();
  const [user] = useState(() => getSession().user);
  const [data, setData] = useState({ state: 'loading' });     // { state, sessions, calendar }
  const [sections, setSections] = useState([]);               // { sectionCode, course, courseSchool, courseKey }
  const period = useRef({ schoolYear: '2026-2027', semester: '1st Semester' });
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const sessionsRef = useRef([]);
  sessionsRef.current = data.sessions || [];
  const calendarRef = useRef(null);

  // Log / edit modals
  const [log, setLog] = useState({ open: false, error: '', section: '', slot: '', date: '', time: '', notes: '', busy: false, sectionOptions: null });
  const [edit, setEdit] = useState({ open: false, id: null, error: '', section: '', slot: '', date: '', time: '', notes: '', busy: false, sectionOptions: null, showSlot: true, showCancel: true });
  const [slotOptions, setSlotOptions] = useState({ log: null, edit: null });   // per picker: [{ name, blocked, label }]
  const [dateRange, setDateRange] = useState({ log: {}, edit: {} });
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, date: '', busy: false });
  const [confirmCancel, setConfirmCancel] = useState({ open: false, id: null, date: '', busy: false });

  // ── Load ──
  async function loadSessions() {
    try {
      const [res, calendar] = await Promise.all([
        apiRequest(`SessionsAdmin/${user?.userID}/sessions`, 'GET', null, true),
        apiRequest('CalendarEvents', 'GET', null, true).catch(() => null),
      ]);
      calendarRef.current = Array.isArray(calendar) ? calendar : null;
      setData({ state: 'ok', sessions: res?.sessions || [], calendar: calendarRef.current });
    } catch (e) {
      console.error('Sessions load failed:', e);
      setData(d => ({ ...d, state: d.state === 'ok' ? 'reloadError' : 'error' }));
    }
  }
  useEffect(() => {
    loadSessions();
    (async () => {
      try {
        const [assignments, menteesWithDept, courseCatalog] = await Promise.all([
          apiRequest('Users/assignments', 'GET', null, true),
          apiRequest('Users/mentees-with-dept', 'GET', null, true),
          apiRequest('Users/courses', 'GET', null, true),
        ]);
        const deptMap = {};
        (menteesWithDept || []).forEach(m => { deptMap[m.userID] = m; });
        const seen = new Set(), list = [];
        const normalize = s => String(s || '').replace(/\s+/g, '').toUpperCase();
        (assignments || []).filter(a => a.mentorUserID === user?.userID).forEach(a => {
          const detail = deptMap[a.menteeUserID] || {};
          if (detail.isActive === false || detail.isDropOut === true) return;
          const school = Object.keys(courseCatalog || {}).find(s => s.toLowerCase() === String(detail.school || '').trim().toLowerCase());
          const sec = school && (courseCatalog[school] || []).find(c => normalize(c) === normalize(detail.course));
          if (!sec) return;
          const courseKey = encodeURIComponent(school) + '|' + sec;
          if (!seen.has(courseKey)) { seen.add(courseKey); list.push({ sectionCode: sec, course: sec, courseSchool: school, courseKey }); }
        });
        setSections(list.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode)));
      } catch { /* non-critical */ }
    })();
    apiRequest('Settings', 'GET', null, true).then(d => {
      if (d?.SchoolYear) period.current.schoolYear = d.SchoolYear;
      if (d?.Semester) period.current.semester = d.Semester;
    }).catch(() => {});
    loadScript(QR_LIB).catch(() => {});
  }, []);

  const sessions = data.sessions || [];
  const cal = data.calendar || [];
  const displayStatus = s => sessionDisplayStatus(s, cal);

  // School-year / semester filter options, most recent first (2nd Sem before 1st within a year).
  const periods = [];
  {
    const seen = new Set();
    sessions.forEach(s => {
      if (!s.schoolYear || !s.semester) return;
      const key = `${s.schoolYear}|${s.semester}`;
      if (seen.has(key)) return;
      seen.add(key);
      periods.push({ schoolYear: s.schoolYear, semester: s.semester, key });
    });
    periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));
  }
  // A period that disappeared on reload falls back to "All School Years".
  useEffect(() => { if (periodFilter && !periods.some(p => p.key === periodFilter)) setPeriodFilter(''); }, [data]);

  let filtered = sessions;
  if (statusFilter) filtered = filtered.filter(s => displayStatus(s) === statusFilter);
  if (periodFilter) filtered = filtered.filter(s => `${s.schoolYear}|${s.semester}` === periodFilter);
  const query = q.trim().toLowerCase();
  if (query) filtered = filtered.filter(s => new Date(s.sessionDate).toLocaleDateString('en-PH').toLowerCase().includes(query) || (s.topic || '').toLowerCase().includes(query));

  // ── Slot picker (shared by the log and edit modals) ──
  function regularSessionStatusFor(sectionCode, slotName) {
    const group = sections.find(c => c.courseKey === sectionCode || c.sectionCode === sectionCode);
    const code = group?.sectionCode || sectionCode;
    const { schoolYear, semester } = period.current;
    const matching = sessionsRef.current.filter(s =>
      !s.isMakeup && (s.courseCode || s.sectionCode || null) === code && (!s.courseSchool || !group?.courseSchool || s.courseSchool === group.courseSchool) &&
      s.schoolYear === schoolYear && s.semester === semester && s.slotName === slotName && s.sessionStatus !== 'Cancelled');
    if (matching.some(s => s.sessionStatus === 'Scheduled')) return 'Already scheduled';
    if (matching.some(s => s.sessionStatus === 'Completed')) return 'Completed';
    return matching.length ? 'Already scheduled' : null;
  }
  function buildSlots(sectionCode, preserveValue) {
    const { schoolYear, semester } = period.current;
    return slotsForSemester(semester).map(name => {
      const w = checkpointWindow(calendarRef.current, name, schoolYear, semester);
      const existing = regularSessionStatusFor(sectionCode, name);
      const blocked = (existing !== null && name !== preserveValue) || w.disabled;
      return { name, blocked, label: existing ? ` — ${existing}` : w.disabled ? ' — ' + w.label : '' };
    });
  }
  // The date input is limited to the chosen checkpoint's session window (from today on).
  function rangeFor(slot) {
    const { schoolYear, semester } = period.current;
    const w = checkpointWindow(calendarRef.current, slot, schoolYear, semester);
    return { min: w.start && w.start > checkpointToday() ? w.start : checkpointToday(), max: w.end || '' };
  }

  // ── Log session ──
  function openLogModal() {
    const multi = sections.length > 1;
    const initialSection = multi ? sections[0].courseKey || sections[0].sectionCode : (sections[0]?.sectionCode || null);
    setSlotOptions(o => ({ ...o, log: buildSlots(initialSection) }));
    setDateRange(r => ({ ...r, log: rangeFor('') }));
    setLog(l => ({ ...l, open: true, error: '', section: multi ? initialSection : '', slot: '', date: new Date().toISOString().split('T')[0], time: '', notes: '', busy: false, sectionOptions: multi ? sections : null, wasOpened: true }));
  }
  async function submitLog(e) {
    e.preventDefault();
    const { date, time, slot } = log;
    const notes = log.notes.trim();
    const sectionPick = sections.length > 1 ? log.section : (sections[0]?.sectionCode || '');
    const selected = sections.find(c => c.courseKey === sectionPick || c.sectionCode === sectionPick);
    const validSection = selected?.sectionCode || null;
    const finalNotes = validSection ? `[${validSection}]${notes ? ' ' + notes : ''}` : (notes || null);
    const slotName = slot || null;
    const { schoolYear, semester } = period.current;
    if (!checkpointDateAllowed(checkpointWindow(calendarRef.current, slotName, schoolYear, semester), date)) {
      const msg = 'Choose an available checkpoint and a date within its session window.';
      setLog(l => ({ ...l, error: msg }));
      showToast(msg);
      return;
    }
    setLog(l => ({ ...l, busy: true }));
    try {
      await apiRequest('Sessions', 'POST', {
        MentorID: user.userID, SessionDate: `${date}T${time}:00`, Status: 'Scheduled', Notes: finalNotes, SectionCode: validSection,
        CourseCode: selected?.sectionCode || (sections.length === 1 ? sections[0].sectionCode : null),
        CourseSchool: selected?.courseSchool || (sections.length === 1 ? sections[0].courseSchool : null),
        SlotName: slotName,
      }, true);
      setLog(l => ({ ...l, open: false }));
      showToast('Session logged successfully.', 'success');
      await loadSessions();
    } catch (err) {
      console.error('Log session failed:', err);
      const msg = err.message || 'Failed to log session. Please try again.';
      setLog(l => ({ ...l, error: msg, busy: false }));
      showToast(msg);
    }
  }

  // ── Edit session ──
  function openEditModal(id) {
    const s = sessions.find(x => x.sessionID === id);
    if (!s) return;
    // The session's real section (not a guess from its notes).
    const currentSec = s.isMakeup ? '' : (s.sectionCode || '');
    const showPicker = !s.isMakeup && s.groupingMode === 'Course' && sections.length > 1;
    const pickedKey = showPicker ? (sections.find(sec => sec.sectionCode === currentSec && (!s.courseSchool || sec.courseSchool === s.courseSchool)) || sections[0]).courseKey : '';
    if (!s.isMakeup) setSlotOptions(o => ({ ...o, edit: buildSlots(currentSec, s.slotName) }));
    setDateRange(r => ({ ...r, edit: rangeFor(s.isMakeup ? '' : (s.slotName || '')) }));
    setEdit({
      open: true, id, error: '', busy: false,
      // A completed session or one with attendance can't be cancelled (same rule as Delete).
      showCancel: !(s.sessionStatus === 'Completed' || (s.presentCount ?? 0) > 0),
      sectionOptions: showPicker ? sections : null, section: pickedKey,
      showSlot: !s.isMakeup, slot: s.isMakeup ? '' : (s.slotName || ''),
      date: (s.sessionDate || '').split('T')[0], time: (s.sessionDate || '').split('T')[1]?.slice(0, 5) || '',
      notes: stripSection(s.topic), preserve: s.isMakeup ? null : s.slotName,
      sectionsShownBefore: edit.sectionsShownBefore || showPicker,
    });
  }
  async function submitEdit(e) {
    e.preventDefault();
    const current = sessions.find(s => s.sessionID === edit.id);
    const isMakeup = !!current?.isMakeup;
    const notes = edit.notes.trim();
    const sectionPick = !isMakeup && sections.length > 1 ? edit.section : (!isMakeup ? (sections[0]?.sectionCode || '') : '');
    const selected = sections.find(c => c.courseKey === sectionPick || c.sectionCode === sectionPick);
    const validSection = isMakeup ? null : (current?.groupingMode !== 'Course' ? current?.sectionCode : selected?.sectionCode || current?.sectionCode) || null;
    const finalNotes = validSection ? `[${validSection}]${notes ? ' ' + notes : ''}` : (notes || null);
    const slotName = isMakeup ? null : (edit.slot || null);
    setEdit(x => ({ ...x, busy: true, error: '' }));
    try {
      await apiRequest(`Sessions/${edit.id}`, 'PUT', {
        SessionID: edit.id, MentorID: user.userID, SessionDate: `${edit.date}T${edit.time}:00`, Status: current?.sessionStatus || 'Scheduled', Notes: finalNotes,
        CourseCode: current?.groupingMode === 'Course' && !isMakeup ? selected?.sectionCode : undefined,
        CourseSchool: current?.groupingMode === 'Course' && !isMakeup ? selected?.courseSchool : undefined,
        SlotName: slotName,
      }, true);
      setEdit(x => ({ ...x, open: false }));
      showToast('Session updated successfully.', 'success');
      await loadSessions();
    } catch (err) {
      console.error('Edit session failed:', err);
      const msg = err.message || 'Failed to save changes. Please try again.';
      setEdit(x => ({ ...x, error: msg, busy: false }));
      showToast(msg);
    }
  }

  // ── Cancel / delete ──
  function openCancelConfirm() {
    const s = sessions.find(x => x.sessionID === edit.id);
    if (!s || s.sessionStatus === 'Completed' || (s.presentCount ?? 0) > 0) return;
    setEdit(x => ({ ...x, open: false }));
    setConfirmCancel({ open: true, id: s.sessionID, date: longDate(new Date(s.sessionDate)), busy: false });
  }
  async function doCancelSession() {
    const s = sessions.find(x => x.sessionID === confirmCancel.id);
    if (!confirmCancel.id) return;
    setConfirmCancel(c => ({ ...c, busy: true }));
    if (!s) { setConfirmCancel(c => ({ ...c, open: false })); return; }
    try {
      await apiRequest(`Sessions/${s.sessionID}`, 'PUT', { SessionID: s.sessionID, MentorID: user.userID, SessionDate: s.sessionDate, Status: 'Cancelled', Notes: s.topic || null, TimeEnd: s.timeEnd || null }, true);
      setConfirmCancel(c => ({ ...c, open: false }));
      showToast('Session cancelled.', 'info');
      await loadSessions();
    } catch (err) {
      console.error('Cancel session failed:', err);
      showToast(err.message || 'Failed to cancel session. Please try again.');
      setConfirmCancel(c => ({ ...c, busy: false }));
    }
  }
  async function doDeleteSession() {
    if (!confirmDelete.id) return;
    setConfirmDelete(c => ({ ...c, busy: true }));
    try {
      await apiRequest(`Sessions/${confirmDelete.id}`, 'DELETE', null, true);
      setConfirmDelete(c => ({ ...c, open: false }));
      showToast('Session deleted.', 'success');
      await loadSessions();
    } catch (err) {
      console.error('Delete session failed:', err);
      showToast(err.message || 'Failed to delete session. Please try again.');
      setConfirmDelete(c => ({ ...c, busy: false }));
    }
  }

  // ── QR attendance and proof are their own components (below) ──
  const qrRef = useRef(null);
  const proofRef = useRef(null);
  const [lightbox, setLightbox] = useState(null);           // { title, proof, mode }
  const [lightboxPreviewClass, setLightboxPreviewClass] = useState(false);

  // ── Render ──
  const stat = (id, cls, value, label) => (
    <div className="sstat">
      <div className={'sstat-val' + (cls ? ' ' + cls : '')} id={id}>{value}</div>
      {' '}
      <div className="sstat-lbl">{label}</div>
    </div>
  );
  const loaded = data.state === 'ok' || data.state === 'reloadError';
  const pulse = <span className="stat-pulse">—</span>;
  const count = st => sessions.filter(s => displayStatus(s) === st).length;
  const completedSessions = sessions.filter(s => s.sessionStatus === 'Completed');
  const missingProof = completedSessions.filter(s => !s.proofFilePath).length;

  let list;
  if (data.state === 'loading') list = <div className="sessions-loading"><span className="spinner"></span>{' '}Loading sessions...</div>;
  else if (data.state === 'error' || data.state === 'reloadError') list = <Empty className="empty-state"><i className="ti ti-alert-circle"></i><p>Failed to load sessions. Please refresh.</p></Empty>;
  else if (!filtered.length) {
    list = sessions.length > 0
      ? <Empty key="filtered" className="empty-state"><i className="ti ti-filter-off"></i>{' '}<p>No sessions match your filter.</p></Empty>
      : <Empty key="none" className="empty-state"><i className="ti ti-calendar-off"></i>{' '}<p>No sessions yet. Click <strong>Log Session</strong> to get started.</p></Empty>;
  } else {
    list = [...filtered].sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate)).map(s => (
      <SessionCard key={s.sessionID} s={s} calendar={cal} displayStatus={displayStatus(s)}
        onEdit={() => openEditModal(s.sessionID)}
        onDelete={dStr => setConfirmDelete({ open: true, id: s.sessionID, date: dStr, busy: false })}
        onQr={dStr => qrRef.current.open(s.sessionID, dStr)}
        onProof={dStr => proofRef.current.open(s.sessionID, dStr)}
        onViewProof={dStr => { setLightbox({ title: 'Session Proof - ' + dStr, proof: { filePath: s.proofFilePath, fileType: s.proofFileType || '', sessionId: s.sessionID }, mode: 'list' }); setLightboxPreviewClass(false); }} />
    ));
  }

  const slotSelect = (which, state, setState) => (
    <Select id={which === 'log' ? 'sessionSlotPick' : 'editSlotPick'} className="form-input" required value={state.slot}
      onChange={e => { const v = e.target.value; setState(x => ({ ...x, slot: v })); setDateRange(r => ({ ...r, [which]: rangeFor(v) })); }}>
      {/* The markup's `selected` attribute is kept (on "Choose..." until the picker is filled, then
          on the session's own slot when editing); the select's value does the actual selecting. */}
      {slotOptions[which] === null
        ? <option value="" disabled ref={markSelected}>Choose...</option>
        : <>
          <option value="" disabled>Choose...</option>
          {slotOptions[which].map(o => (
            <option key={o.name} value={o.name} style={o.blocked ? { color: '#9ca3af' } : { fontWeight: 700 }} disabled={o.blocked}
              ref={which === 'edit' && o.name === edit.preserve ? markSelected : undefined}>{o.name}{o.label}</option>
          ))}
        </>}
    </Select>
  );

  return (
    <Page id="MENTOR/sessions">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Sessions</h1>
              {' '}
              <p id="sessionSubtitle">{loaded ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} on record` : 'Your mentoring session log'}</p>
            </div>
            {' '}
            <div className="page-header-right">
              <button id="logSessionBtn" className="btn-log-session" onClick={openLogModal}>
                <i className="ti ti-plus"></i>
                {' '}Log Session
              </button>
            </div>
          </div>
          {' '}
          {/* Stats strip */}
          <div className="session-stats-strip">
            {stat('sTotalSessions', '', loaded ? sessions.length : pulse, 'Total')}
            {' '}
            {stat('sCompleted', 'green', loaded ? count('Completed') : pulse, 'Completed')}
            {' '}
            {stat('sScheduled', 'blue', loaded ? count('Scheduled') : pulse, 'Scheduled')}
            {' '}
            {stat('sCancelled', 'gray', loaded ? sessions.filter(s => s.sessionStatus === 'Cancelled').length : pulse, 'Cancelled')}
            {' '}
            <div className="sstat"><div className="sstat-val blue" id="sInProgress">{loaded ? count('In Progress') : '—'}</div><div className="sstat-lbl">In Progress</div></div>
            {' '}
            <div className="sstat"><div className="sstat-val gray" id="sClosed">{loaded ? count('Closed') : '—'}</div><div className="sstat-lbl">Closed</div></div>
          </div>
          {' '}
          {/* Proof completion indicator: completed sessions still missing their proof photo. */}
          <div className="sc-proof-bar" id="sProofBar" style={{ display: loaded && completedSessions.length ? 'flex' : 'none' }}>
            <span className={'sc-proof-pill-bar' + (loaded && completedSessions.length ? (missingProof > 0 ? ' sc-proof-pill-bar--pending' : ' sc-proof-pill-bar--done') : '')} id="sProofPill">
              {loaded && completedSessions.length > 0 && (missingProof > 0
                ? <><i className="ti ti-photo-off"></i>{` ${missingProof} session${missingProof !== 1 ? 's' : ''} without proof photo`}</>
                : <><i className="ti ti-circle-check-filled"></i> All completed sessions have proof</>)}
            </span>
          </div>
          {' '}
          {/* Toolbar */}
          <div className="toolbar">
            <div className="search-wrap">
              <i className="ti ti-search"></i>
              {' '}
              <input type="text" id="searchInput" placeholder="Search by date or notes..." value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {' '}
            <Select id="statusFilter" className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Closed">Closed</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </Select>
            {' '}
            <Select id="periodFilter" className="filter-select" value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}>
              <option value="">All School Years</option>
              {periods.map(p => <option key={p.key} value={p.key}>{`${p.semester}, SY ${p.schoolYear}`}</option>)}
            </Select>
          </div>
          {' '}
          {/* Sessions Cards */}
          <div id="sessionsList" className="sessions-list">{list}</div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Log Session Modal */}
      <div id="logSessionModal" className={'modal-overlay' + (log.open ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) setLog(l => ({ ...l, open: false })); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setLog(l => ({ ...l, open: false }))}>
            <i className="ti ti-x"></i>
          </button>
          {' '}
          <h2 className="modal-title">Log a Session</h2>
          {' '}
          <p className="modal-subtitle">Record a new mentoring session</p>
          {' '}
          <form id="logSessionForm" onSubmit={submitLog}>
            <div className="form-error" id="logSessionError" style={log.error ? undefined : { display: 'none' }}>{log.error}</div>
            {' '}
            <div className="form-group" id="sectionPickGroup" style={log.sectionOptions ? undefined : { display: 'none' }}>
              <label className="form-label">Course</label>
              {' '}
              <Select id="sessionSectionPick" className="form-input" value={log.section}
                onChange={e => { const v = e.target.value; setLog(l => ({ ...l, section: v, slot: '' })); setSlotOptions(o => ({ ...o, log: buildSlots(v) })); setDateRange(r => ({ ...r, log: rangeFor('') })); }}>
                {(log.sectionOptions || []).map(s => (
                  <option key={s.courseKey || s.sectionCode} value={s.courseKey || s.sectionCode}>{s.sectionCode}{s.courseSchool ? ' — ' + s.courseSchool : ''}</option>
                ))}
              </Select>
            </div>
            {' '}
            <div className="form-group">
              <label className="form-label">Session Slot</label>
              {' '}
              {slotSelect('log', log, setLog)}
            </div>
            {' '}
            <div className="form-group">
              <label className="form-label">Date</label>
              {' '}
              <DateInput type="date" id="sessionDateInput" className="form-input" required min={dateRange.log.min} max={dateRange.log.max}
                value={log.date} onChange={e => { const v = e.target.value; setLog(l => ({ ...l, date: v })); }} />
            </div>
            {' '}
            <div className="form-group">
              <label className="form-label">Start Time</label>
              {' '}
              <TimeInput type="time" id="sessionTimeStart" className="form-input" required value={log.time} onChange={e => { const v = e.target.value; setLog(l => ({ ...l, time: v })); }} />
              {' '}
              <small>End time is recorded when you select Save End after the session.</small>
            </div>
            {' '}
            <div className="form-group">
              <label className="form-label">Notes <span className="form-optional">(optional)</span></label>
              {' '}
              <textarea id="sessionNotesInput" className="form-textarea" rows="3" placeholder="Topic or notes for this session..." value={log.notes}
                onChange={e => { const v = e.target.value; setLog(l => ({ ...l, notes: v })); }}></textarea>
            </div>
            {' '}
            <div className="form-actions">
              <button type="button" className="btn-form-cancel" onClick={() => setLog(l => ({ ...l, open: false }))}>Cancel</button>
              {' '}
              <button type="submit" className="btn-form-submit" id="submitSessionBtn" disabled={log.busy}>
                {log.busy ? 'Logging...' : <><i className="ti ti-calendar-plus"></i> Log Session</>}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Edit Session Modal */}
      <div id="editSessionModal" className={'modal-overlay' + (edit.open ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) setEdit(x => ({ ...x, open: false })); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setEdit(x => ({ ...x, open: false }))}>
            <i className="ti ti-x"></i>
          </button>
          {' '}
          <h2 className="modal-title">Edit Session</h2>
          {' '}
          <p className="modal-subtitle">Update session details or mark as cancelled</p>
          {' '}
          <form id="editSessionForm" onSubmit={submitEdit}>
            <div className="form-error" id="editSessionError" style={edit.error ? undefined : { display: 'none' }}>{edit.error}</div>
            {' '}
            <div className="form-group" id="editSectionPickGroup" style={edit.sectionOptions ? undefined : { display: 'none' }}>
              <label className="form-label">Course</label>
              {' '}
              <Select id="editSectionPick" className="form-input" value={edit.section}
                onChange={e => { const v = e.target.value; setEdit(x => ({ ...x, section: v, slot: '' })); setSlotOptions(o => ({ ...o, edit: buildSlots(v, null) })); setDateRange(r => ({ ...r, edit: rangeFor('') })); }}>
                {(edit.sectionOptions || []).map(sec => <option key={sec.courseKey} value={sec.courseKey}>{`${sec.sectionCode} / ${sec.courseSchool}`}</option>)}
              </Select>
            </div>
            {' '}
            <div className="form-group" id="editSlotPickGroup" style={edit.showSlot ? undefined : { display: 'none' }}>
              <label className="form-label">Session Slot</label>
              {' '}
              {slotSelect('edit', edit, setEdit)}
            </div>
            {' '}
            <div className="form-group">
              <label className="form-label">Date</label>
              {' '}
              <DateInput type="date" id="editDateInput" className="form-input" required min={dateRange.edit.min} max={dateRange.edit.max}
                value={edit.date} onChange={e => { const v = e.target.value; setEdit(x => ({ ...x, date: v })); }} />
            </div>
            {' '}
            <div className="form-group">
              <label className="form-label">Start Time</label>
              {' '}
              <TimeInput type="time" id="editTimeStart" className="form-input" required value={edit.time} onChange={e => { const v = e.target.value; setEdit(x => ({ ...x, time: v })); }} />
              {' '}
              <small>End time is recorded when you select Save End after the session.</small>
            </div>
            {' '}
            <div className="form-group">
              <label className="form-label">Notes <span className="form-optional">(optional)</span></label>
              {' '}
              <textarea id="editNotesInput" className="form-textarea" rows="3" placeholder="Topic or notes..." value={edit.notes}
                onChange={e => { const v = e.target.value; setEdit(x => ({ ...x, notes: v })); }}></textarea>
            </div>
            {' '}
            <div className="form-actions form-actions-split">
              <button type="button" className="btn-cancel-session" style={edit.showCancel ? undefined : { display: 'none' }} onClick={openCancelConfirm}>
                <i className="ti ti-calendar-x"></i>
                {' '}Cancel Session
              </button>
              {' '}
              <div className="form-actions-right">
                <button type="button" className="btn-form-cancel" onClick={() => setEdit(x => ({ ...x, open: false }))}>Close</button>
                {' '}
                <button type="submit" className="btn-form-submit" id="submitEditBtn" disabled={edit.busy}>
                  {edit.busy ? 'Saving...' : <><i className="ti ti-check"></i> Save Changes</>}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Delete Confirm Modal */}
      <ConfirmDialog id="deleteConfirmModal" open={confirmDelete.open} onClose={() => setConfirmDelete(c => ({ ...c, open: false }))} iconClass="confirm-icon-danger" icon="ti-trash"
        title="Delete Session?" body={<><strong id="deleteConfirmDate">{confirmDelete.date}</strong><br />{' '}This will permanently remove the session and cannot be undone.</>}>
        <button className="btn-form-cancel" onClick={() => setConfirmDelete(c => ({ ...c, open: false }))}>Cancel</button>
        {' '}
        <button className="btn-confirm-danger" id="confirmDeleteBtn" disabled={confirmDelete.busy} onClick={doDeleteSession}>
          {confirmDelete.busy ? 'Deleting...' : <><i className="ti ti-trash"></i> Delete</>}
        </button>
      </ConfirmDialog>

      {/* Cancel Session Confirm Modal */}
      <ConfirmDialog id="cancelConfirmModal" open={confirmCancel.open} onClose={() => setConfirmCancel(c => ({ ...c, open: false }))} iconClass="confirm-icon-warn" icon="ti-calendar-x"
        title="Cancel this Session?" body={<><strong id="cancelConfirmDate">{confirmCancel.date}</strong><br />{' '}This will mark the session as Cancelled.</>}>
        <button className="btn-form-cancel" onClick={() => setConfirmCancel(c => ({ ...c, open: false }))}>Keep Session</button>
        {' '}
        <button className="btn-confirm-warn" id="confirmCancelBtn" disabled={confirmCancel.busy} onClick={doCancelSession}>
          {confirmCancel.busy ? 'Cancelling...' : <><i className="ti ti-calendar-x"></i> Yes, Cancel</>}
        </button>
      </ConfirmDialog>

      <QrAttendance ref={qrRef} sessionsRef={sessionsRef} calendarRef={calendarRef} onSaved={loadSessions} />
      <ProofUpload ref={proofRef} sessionsRef={sessionsRef} user={user} onUploaded={loadSessions} />

      {/* Proof Lightbox (view an already-uploaded proof) */}
      <ProofLightbox state={lightbox} previewClass={lightboxPreviewClass}
        onMode={mode => { setLightbox(l => l && { ...l, mode }); setLightboxPreviewClass(mode === 'preview'); }}
        onClose={() => setLightbox(null)}
        onReplace={sessionId => {
          const session = sessions.find(s => s.sessionID === sessionId);
          const reason = proofUnavailableReason(session);
          if (reason) { showToast(reason); return; }
          setLightbox(null);
          proofRef.current.open(sessionId, new Date(session.sessionDate).toLocaleDateString('en-PH'));
        }}
        sessions={sessions} />
    </Page>
  );
}

function SessionCard({ s, calendar, displayStatus, onEdit, onDelete, onQr, onProof, onViewProof }) {
  const date = new Date(s.sessionDate);
  const dStr = longDate(date);
  const tStart = shortTime(date);
  const tEnd = s.timeEnd ? shortTime(new Date(s.timeEnd)) : null;
  const timeStr = tEnd ? `${tStart} – ${tEnd}` : tStart;
  const status = s.sessionStatus || 'Scheduled';
  const statusCls = `status-${(displayStatus === 'In Progress' ? 'Scheduled' : displayStatus === 'Closed' ? 'Cancelled' : displayStatus).toLowerCase()}`;
  // sectionCode/isMakeup come straight from the backend.
  const isMakeup = s.isMakeup;
  const sectionTag = isMakeup ? '' : (s.sectionCode || '');
  const displayTopic = stripSection(s.topic);
  const present = s.presentCount ?? 0;
  const total = s.totalAttendees ?? 0;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  const w = checkpointWindow(calendar, s.slotName, s.schoolYear, s.semester);
  const lateBadge = w.disabled && w.label !== 'Closed' && status !== 'Cancelled' && !(status === 'Completed' && s.timeEnd)
    ? <span className="session-late-tag">{w.label}</span> : null;
  const numBadge = isMakeup
    ? <span className="sc-session-num sc-makeup-label">{s.slotName ? `Make-up Session: ${s.slotName}` : 'Make-up Session'}</span>
    : <span className="sc-session-num">{s.slotName || 'Session'}</span>;
  const badges = extra => (
    <div className="sc-top">
      <div className="sc-badges">
        {numBadge}
        {' '}
        {extra}
        <span className={`session-status ${statusCls}`}>{displayStatus}</span>
        {' '}
        {sectionTag && <span className="sc-section-tag">{sectionTag}</span>}
      </div>
      {' '}
      <div className="sc-datetime">
        <i className="ti ti-calendar"></i>
        {' '}
        <span className="sc-date-str">{dStr}</span>
        {' '}
        <span className="sc-time-str">{timeStr}</span>
      </div>
    </div>
  );
  const editBtn = (
    <button className="sc-action-btn btn-sc-edit" onClick={onEdit} title="Edit session" aria-label="Edit">
      <i className="ti ti-pencil"></i>
    </button>
  );
  const deleteBtn = (
    <button className="sc-action-btn btn-sc-delete" onClick={() => onDelete(dStr)} title="Delete session" aria-label="Delete">
      <i className="ti ti-trash"></i>
    </button>
  );

  if (status === 'Cancelled') return (
    <div className="session-card session-card-cancelled">
      {badges(null)}
      {' '}
      {!isMakeup && displayTopic && <div className="sc-topic sc-topic-cancelled">{`"${displayTopic}"`}</div>}
      {' '}
      <div className="sc-actions sc-actions-cancelled">
        <div className="sc-secondary-actions">
          {editBtn}
          {' '}
          {deleteBtn}
        </div>
      </div>
    </div>
  );

  const reason = proofUnavailableReason(s);
  return (
    <div className="session-card">
      {badges(lateBadge && <>{lateBadge}{' '}</>)}
      {' '}
      {!isMakeup && displayTopic && <div className="sc-topic">{`"${displayTopic}"`}</div>}
      {' '}
      <div className="sc-attendance">
        <div className="sc-att-row">
          <i className="ti ti-users"></i>
          {' '}
          <span className="sc-att-count">{`${present} / ${total} present`}</span>
        </div>
        {' '}
        {total > 0 && <div className="sc-att-bar"><div className="sc-att-fill" style={{ width: `${pct}%` }}></div></div>}
      </div>
      {' '}
      <div className="sc-actions">
        <div className="sc-primary-actions">
          <button className="sc-action-btn btn-sc-qr" onClick={() => onQr(dStr)}>
            <i className="ti ti-qrcode"></i>{' ' + (w.disabled || w.upcoming || s.timeEnd ? 'View Attendance' : 'Scan QR')}
          </button>
          {' '}
          {s.proofFilePath
            ? <button type="button" className="sc-action-btn btn-sc-proof-view" onClick={() => onViewProof(dStr)}>View Photo</button>
            : (
              <button type="button" className="sc-action-btn btn-sc-proof-upload" aria-disabled={String(!!reason)} title={reason || 'Upload a session proof photo'} onClick={() => onProof(dStr)}>
                <i className="ti ti-upload"></i> Upload Proof
              </button>
            )}
        </div>
        {' '}
        <div className="sc-secondary-actions">
          {editBtn}
          {' '}
          {status === 'Completed' || present > 0 ? null : deleteBtn}
        </div>
      </div>
    </div>
  );
}

// ── QR scanner / attendance modal ────────────────────────────────────────────

const QrAttendance = forwardRef(function QrAttendance({ sessionsRef, calendarRef, onSaved }, ref) {
  const [st, setSt] = useState({ open: false, sid: null, dateStr: '—', canScan: false, rows: null, listError: false, saving: false });
  const [status, setStatus] = useState({ text: 'Starting camera...', cls: 'qr-status' });
  const [clock, setClock] = useState('--:-- --');
  const scanner = useRef(null);
  const live = useRef({ sid: null, rows: [], scanned: new Set(), lastScan: 0 });
  const statusTimer = useRef(null);
  const clockTimer = useRef(null);
  const readerRef = useRef(null);

  const sessionById = id => sessionsRef.current.find(s => s.sessionID === id);
  // Finish (Save & Close) is allowed while the checkpoint window is open, or once someone was scanned.
  function canFinish(session, rows) {
    if (!session || session.sessionStatus === 'Cancelled' || session.timeEnd) return false;
    const w = checkpointWindow(calendarRef.current, session.slotName, session.schoolYear, session.semester);
    return (!w.disabled && !w.upcoming) || rows.some(row => row.isPresent && row.scannedAt);
  }

  function showStatus(text, type, persistent = false) {
    setStatus({ text, cls: `qr-status ${type}` });
    clearTimeout(statusTimer.current);
    if (persistent) return;
    statusTimer.current = setTimeout(() => setStatus({ text: 'Point camera at mentee QR code', cls: 'qr-status' }), 2000);
  }
  function flashSuccess(name) {
    setStatus({ text: `✓ ${name} — Saved!`, cls: 'qr-status success' });
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus({ text: 'Ready — point at next QR code', cls: 'qr-status' }), 1500);
  }
  const commitRows = rows => { live.current.rows = rows; setSt(s => ({ ...s, rows })); };

  async function handleScan(decodedText) {
    const now = Date.now();
    if (now - live.current.lastScan < 1500) return;
    live.current.lastScan = now;
    const token = decodedText.trim();
    if (!token) { showStatus('Empty QR code', 'error'); return; }
    try {
      const result = await apiRequest('QRAttendance/scan', 'POST', { token, sessionId: live.current.sid }, true);
      if (!result.success) {
        showStatus(result.message || 'Invalid or expired QR', 'error');
        showToast(result.message || 'Invalid or expired QR code.', 'error', 3000);
        return;
      }
      const { menteeId, sessionId, menteeName } = result;
      if (sessionId !== live.current.sid) { showStatus('QR is for a different session', 'error'); return; }
      if (live.current.scanned.has(menteeId)) {
        showStatus(`${menteeName} already scanned`, 'warn');
        showToast(`${menteeName} was already scanned.`, 'info', 2500);
        return;
      }
      const rows = live.current.rows;
      const idx = rows.findIndex(r => r.menteeID === menteeId);
      if (idx < 0) { showStatus('Mentee not in this session', 'error'); return; }
      live.current.scanned.add(menteeId);
      commitRows(rows.map((r, i) => i === idx ? { ...r, isPresent: true, attendanceUnverified: false, attendanceRecorded: true, scannedAt: localISO() } : r));
      flashSuccess(menteeName);
      showToast(`${menteeName} marked present.`, 'success', 2500);
    } catch (e) {
      console.error('QR scan failed:', e);
      showStatus('Scan failed — try again', 'error');
    }
  }

  async function startScanner() {
    await loadScript(QR_LIB);
    readerRef.current.innerHTML = '';
    scanner.current = new window.Html5Qrcode('qr-reader');
    scanner.current.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, handleScan, () => {})
      .then(() => setStatus({ text: 'Point camera at mentee QR code', cls: 'qr-status' }))
      .catch(err => {
        setStatus({ text: 'Camera unavailable. Allow camera access and reopen the scanner. Attendance requires a QR scan.', cls: 'qr-status warn' });
        console.warn('QR scanner:', err);
      });
  }
  async function stopScanner() {
    if (scanner.current) {
      try { await scanner.current.stop(); } catch (e) {}
      scanner.current = null;
      if (readerRef.current) readerRef.current.innerHTML = '';
    }
  }

  useImperativeHandle(ref, () => ({
    async open(sessionId, dateStr) {
      const session = sessionById(sessionId);
      const w = checkpointWindow(calendarRef.current, session?.slotName, session?.schoolYear, session?.semester);
      const canScan = !!session && session.sessionStatus !== 'Cancelled' && !w.disabled && !w.upcoming && !session.timeEnd;
      live.current = { sid: sessionId, rows: [], scanned: new Set(), lastScan: 0 };
      clearTimeout(statusTimer.current);
      setStatus({ text: canScan ? 'Starting camera...' : 'Attendance closed. Existing records remain available.', cls: 'qr-status' });
      // Display Philippine time; the API records the authoritative finish instant.
      const tick = () => setClock(new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }));
      clearInterval(clockTimer.current);
      if (canScan) { tick(); clockTimer.current = setInterval(tick, 1000); }
      setSt({ open: true, sid: sessionId, dateStr, canScan, rows: null, listError: false, saving: false, finishable: false });
      try {
        const existing = await apiRequest(`SessionsAdmin/session/${sessionId}/mentees`, 'GET', null, true);
        let rows = [];
        if (existing && existing.length > 0) {
          rows = existing.map(m => ({
            attendanceID: m.attendanceID, menteeID: m.menteeID,
            menteeName: `${m.menteeFirstName || ''} ${m.menteeLastName || ''}`.trim() || '—',
            section: m.sectionCode || '',
            attendanceRecorded: Number(m.attendanceID) > 0,
            isPresent: LogsheetData.attendanceState(m) === true,
            attendanceUnverified: m.isPresent === true && LogsheetData.attendanceState(m) !== true,
            scannedAt: m.scannedAt || null, mentorNotes: m.mentorNotes || '',
            // A dropped-out mentee with existing attendance is a historical record; it's marked.
            isDropOut: !!m.isDropOut,
          }));
          rows.filter(r => r.isPresent).forEach(r => live.current.scanned.add(r.menteeID));
        } else if (session?.isMakeup) {
          // Make-up session: all approved requesters for the slot.
          const requesters = await apiRequest(`SessionsAdmin/session/${sessionId}/requester`, 'GET', null, true).catch(() => null);
          rows = (requesters || []).map(r => ({
            attendanceID: null, menteeID: r.menteeID,
            menteeName: `${r.menteeFirstName || ''} ${r.menteeLastName || ''}`.trim() || '—',
            section: r.sectionCode || '', attendanceRecorded: false, isPresent: false, scannedAt: null, mentorNotes: '',
          }));
        }
        // (A regular session's empty roster is an empty historical roster, not rebuilt from today's assignments.)
        commitRows(rows);
        setSt(s => ({ ...s, finishable: canFinish(session, rows) }));
        if (canScan) await startScanner();
        else showStatus('Attendance closed. Existing records remain available.', 'error', true);
      } catch (err) {
        console.error('QR scanner setup failed:', err);
        setSt(s => ({ ...s, listError: true }));
        setStatus(s => ({ ...s, text: 'Could not load attendance.' }));
      }
    },
  }));

  async function close() {
    clearInterval(clockTimer.current);
    await stopScanner();
    setSt(s => ({ ...s, open: false }));
  }
  async function save() {
    const rows = live.current.rows;
    const sid = live.current.sid;
    if (!sid || !rows.length || !canFinish(sessionById(sid), rows)) return;
    setSt(s => ({ ...s, saving: true }));
    try {
      // Ensure an absent row exists for everyone; the API keeps attendance already saved by QR.
      await Promise.all(rows.map(row => apiRequest('Attendance', 'POST', { SessionID: sid, MenteeID: row.menteeID, IsPresent: false }, true)));
      await apiRequest(`Sessions/${sid}/finish`, 'POST', {}, true);
      clearInterval(clockTimer.current);
      await stopScanner();
      setSt(s => ({ ...s, open: false, saving: false }));
      showToast('Attendance saved and session finished.', 'success');
      await onSaved();
    } catch (err) {
      console.error('Save attendance failed:', err);
      showToast(err.message || 'Failed to save attendance. Please try again.');
      setSt(s => ({ ...s, saving: false, finishable: canFinish(sessionById(sid), live.current.rows) }));
    }
  }
  useEffect(() => () => { clearInterval(clockTimer.current); clearTimeout(statusTimer.current); stopScanner(); }, []);

  const rows = st.rows;
  const present = rows ? rows.filter(r => r.isPresent).length : 0;
  let listBody;
  if (st.listError) listBody = <div className="list-skeleton">Could not load attendance data.</div>;
  else if (!rows) listBody = <div className="list-skeleton"><span className="spinner"></span>{' '}Loading...</div>;
  else if (!rows.length) listBody = <div className="list-skeleton">No mentees found for this session.</div>;
  else listBody = rows.map((m, i) => {
    const parts = m.menteeName.split(' ');
    const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
    const unknown = !m.attendanceRecorded || m.attendanceUnverified;
    const cls = unknown ? '' : m.isPresent ? 'is-present' : 'is-absent';
    const icon = unknown ? 'ti-minus' : m.isPresent ? 'ti-check' : 'ti-x';
    const label = m.attendanceUnverified ? 'Unverified' : !m.attendanceRecorded ? 'Not recorded' : m.isPresent ? 'Present' : 'Absent';
    return (
      <div key={i} className={'att-row' + (m.attendanceRecorded && !m.isPresent && !m.attendanceUnverified ? ' att-row-absent' : '')}>
        <div className="att-row-top">
          <div className="att-avatar">{initials}</div>
          {' '}
          <div className="att-name">{m.menteeName}<span className="att-section">{m.section ? ` · ${m.section}` : ''}</span>{m.isDropOut && <span className="att-dropout-chip">Drop Out</span>}</div>
          {' '}
          <span className={`att-presence-status ${cls}`}>
            <i className={`ti ${icon}`}></i>{' ' + label}
          </span>
        </div>
      </div>
    );
  });

  return (
    <div id="qrScanModal" className={'modal-overlay' + (st.open ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      {/* The original confirm-dialog restyle also matched this card (data-ac markers + close X). */}
      <div className="modal-card qr-modal-card" data-astra-confirm="1" onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={close}>
          <i className="ti ti-x"></i>
        </button>
        {' '}
        <h2 className="modal-title" data-ac="title">{st.sid === null || st.canScan ? 'Scan Attendance' : 'View Attendance'}</h2>
        {' '}
        <p className="modal-subtitle" id="qrScanDate" data-ac="body">{st.dateStr}</p>
        {' '}
        {/* Camera viewfinder (html5-qrcode renders into #qr-reader) */}
        <div className="qr-reader-wrap">
          <div id="qr-reader" ref={readerRef} style={st.sid === null || st.canScan ? undefined : { display: 'none' }}></div>
          {' '}
          <div className={status.cls} id="qrStatus">{status.text}</div>
        </div>
        {' '}
        {/* Running count */}
        <div className="qr-att-summary">
          <div className="qr-att-label"><i className="ti ti-users"></i> Attendance</div>
          {' '}
          <div className="qr-att-count" id="qrAttCount">{`${present} / ${rows ? rows.length : 0} present`}</div>
        </div>
        {' '}
        {/* Read-only QR attendance results */}
        <div id="qrAttList" className="attendance-list">{listBody}</div>
        {' '}
        {/* Session End Time */}
        <div className="qr-end-time-row" style={st.sid === null || st.canScan ? undefined : { display: 'none' }}>
          <div className="qr-end-label">
            <i className="ti ti-clock-off"></i>
            {' '}Session End Time
          </div>
          {' '}
          <div className="qr-end-display-wrap">
            <span id="qrEndTimeDisplay" className="qr-end-display">{clock}</span>
          </div>
        </div>
        {' '}
        <div className="modal-footer" data-ac="actions">
          <button className="btn-form-cancel" onClick={close}>Cancel</button>
          {' '}
          <button className="btn-form-submit" id="saveQrAttBtn" disabled={st.sid !== null && (st.saving || !st.finishable)} onClick={save}>
            {st.saving ? 'Saving...' : <><i className="ti ti-check"></i> Save &amp; Close</>}
          </button>
        </div>
        <ConfirmX onClick={close} />
      </div>
    </div>
  );
});

// ── Proof upload modal (with webcam capture) and its "are you sure?" step ────
const ProofUpload = forwardRef(function ProofUpload({ sessionsRef, user, onUploaded }, ref) {
  const [st, setSt] = useState({ open: false, sid: null, dateStr: '—' });
  const [error, setError] = useState(null);
  const [hint, setHint] = useState('');
  const [optionsDisplay, setOptionsDisplay] = useState(null);       // null | 'grid' | 'none'
  const [camera, setCamera] = useState({ panel: false, still: null });
  const [picked, setPicked] = useState(null);                        // { name, image } once a file is chosen
  const [previewDisplay, setPreviewDisplay] = useState('none');
  const [submit, setSubmit] = useState({ disabled: true, busy: false });
  const [inputAttrs, setInputAttrs] = useState({ accept: 'image/*,application/pdf', capture: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inFlight = useRef(false);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const cam = useRef({ stream: null, attempt: 0, file: null, url: null });
  const confirmResolve = useRef(null);
  const sidRef = useRef(null);

  function showError(msg) { setError(msg); showToast(msg); }

  function stopCamera() {
    const c = cam.current;
    c.attempt++;
    if (c.stream) c.stream.getTracks().forEach(t => t.stop());
    c.stream = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    c.file = null;
    if (c.url) URL.revokeObjectURL(c.url);
    c.url = null;
    setCamera({ panel: false, still: null });
    setOptionsDisplay('grid');
  }
  function cameraFailed() {
    stopCamera();
    setHint('Camera unavailable. Use Upload Photo to choose an existing image.');
  }
  function clearFile() {
    stopCamera();
    if (fileRef.current) fileRef.current.value = '';
    setInputAttrs({ accept: 'image/*,application/pdf', capture: null });
    setOptionsDisplay('grid');
    setSubmit(s => ({ ...s, disabled: true }));
    setHint('');
    setPreviewDisplay('none');
    setPicked(p => { if (p?.image?.startsWith('blob:')) URL.revokeObjectURL(p.image); return null; });
  }
  useEffect(() => {
    window.addEventListener('pagehide', stopCamera);
    return () => { window.removeEventListener('pagehide', stopCamera); stopCamera(); };
  }, []);

  useImperativeHandle(ref, () => ({
    open(sessionId, dateStr) {
      if (inFlight.current) { showToast('A proof upload is already in progress. Please wait.'); return; }
      const session = sessionsRef.current.find(s => Number(s.sessionID) === Number(sessionId));
      const reason = proofUnavailableReason(session);
      if (reason) { showToast(reason); return; }
      sidRef.current = session.sessionID;
      clearFile();
      setError(null);
      setSubmit({ disabled: true, busy: false });
      setSt({ open: true, sid: session.sessionID, dateStr });
    },
  }));

  function close() {
    if (inFlight.current) return;
    setSt(s => ({ ...s, open: false }));
    clearFile();
    sidRef.current = null;
  }

  function handleFile(input) {
    stopCamera();
    setInputAttrs(a => ({ ...a, capture: null }));
    const file = input.files[0];
    if (!file) return;
    const err = validateUploadFile(file, 'ProofOfSession/upload');
    if (err) { clearFile(); showError(err); return; }
    setError(null);
    setSubmit(s => ({ ...s, disabled: false }));
    showToast(`${file.name} attached.`, 'info', 2500);
    // Once something's picked, the Upload / Take Photo cards hide; × on the preview brings them back.
    setOptionsDisplay('none');
    setPreviewDisplay('block');
    setPicked({ name: file.name, image: null, isImage: file.type.startsWith('image/') });
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => { if (fileRef.current?.files[0] === file) setPicked(p => p && { ...p, image: e.target.result }); };
      reader.readAsDataURL(file);
    }
  }

  async function openCamera() {
    if (inFlight.current) return;
    stopCamera();
    setError(null);
    if (!usesNativeCamera()) {
      if (!navigator.mediaDevices?.getUserMedia) { cameraFailed(); return; }
      const attempt = cam.current.attempt;
      setHint('Allow camera access, then Capture. Upload confirms submission separately.');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (attempt !== cam.current.attempt) { stream.getTracks().forEach(t => t.stop()); return; }
        cam.current.stream = stream;
        stream.getVideoTracks().forEach(t => { t.onended = () => { if (cam.current.stream === stream) cameraFailed(); }; });
        videoRef.current.srcObject = stream;
        setCamera({ panel: true, still: null });
        setOptionsDisplay('none');
      } catch (e) {
        if (attempt !== cam.current.attempt) return;
        cameraFailed();
        setHint(e.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow access in your browser or use Upload Photo.'
          : 'Camera unavailable or already in use. Use Upload Photo to choose an existing image.');
      }
      return;
    }
    setInputAttrs({ accept: 'image/*', capture: 'environment' });
    setHint('On supported phones, your device camera opens. If this browser opens a file picker instead, choose an existing photo or use Upload Photo. Desktop websites cannot force-open the system Camera application.');
    const input = fileRef.current;
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.click();
  }
  function capture() {
    const video = videoRef.current;
    if (!cam.current.stream || !video.videoWidth || !video.videoHeight) { setHint('Camera is still loading. Try Capture again or use Upload Photo.'); return; }
    const attempt = cam.current.attempt;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    try {
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(blob => {
        if (attempt !== cam.current.attempt) return;
        if (!blob) { cameraFailed(); return; }
        try {
          const file = new File([blob], 'session-proof.jpg', { type: 'image/jpeg' });
          const err = validateUploadFile(file, 'ProofOfSession/upload');
          if (err) { cameraFailed(); showError(err); return; }
          cam.current.stream?.getTracks().forEach(t => t.stop());
          cam.current.stream = null;
          video.srcObject = null;
          cam.current.file = file;
          cam.current.url = URL.createObjectURL(blob);
          setCamera({ panel: true, still: cam.current.url });
        } catch { cameraFailed(); }
      }, 'image/jpeg', 0.9);
    } catch { cameraFailed(); }
  }
  function usePhoto() {
    if (!cam.current.file) return;
    const transfer = new DataTransfer();
    transfer.items.add(cam.current.file);
    fileRef.current.files = transfer.files;
    handleFile(fileRef.current);
  }
  function openPicker() {
    stopCamera();
    setInputAttrs({ accept: 'image/*,application/pdf', capture: null });
    setHint('');
    const input = fileRef.current;
    input.accept = 'image/*,application/pdf';
    input.removeAttribute('capture');
    input.click();
  }

  async function doSubmit() {
    if (inFlight.current) return;
    const sessionId = sidRef.current;
    const file = fileRef.current.files[0];
    if (!file) { showToast('Please upload a file or capture your screen first.'); return; }
    const err = validateUploadFile(file, 'ProofOfSession/upload');
    if (err) { showError(err); return; }
    // Same "are you sure?" step as the logsheet's Submit: uploading marks the session Completed.
    setConfirmOpen(true);
    const confirmed = await new Promise(resolve => { confirmResolve.current = resolve; });
    if (!confirmed || sidRef.current !== sessionId) return;
    inFlight.current = true;
    setSubmit({ disabled: true, busy: true });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sessionId', sessionId);
    fd.append('uploadedByUserId', user.userID);
    try {
      await apiRequest('ProofOfSession/upload', 'POST', fd, true);
      setSt(s => ({ ...s, open: false }));
      showToast('Proof uploaded. Session marked as completed.', 'success');
      inFlight.current = false;
      await onUploaded();
    } catch (e) {
      console.error('Proof upload failed:', e);
      showError(e.message || 'Failed to upload proof. Please try again.');
      setSubmit({ disabled: false, busy: false });
    } finally {
      inFlight.current = false;
    }
  }
  const resolveConfirm = ok => { setConfirmOpen(false); confirmResolve.current?.(ok); confirmResolve.current = null; };

  return (
    <>
      <div id="proofModal" className={'modal-overlay' + (st.open ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) close(); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={close}>
            <i className="ti ti-x"></i>
          </button>
          {' '}
          <h2 className="modal-title">Upload Proof</h2>
          {' '}
          <p className="modal-subtitle" id="proofModalDate">{st.dateStr}</p>
          {' '}
          <details className="proof-tips">
            <summary><i className="ti ti-chevron-right"></i> Accepted Files and iPhone Guidelines</summary>
            {' '}
            <div className="proof-tips-body">
              <p>Please upload a clear photograph of the mentoring session or a PDF document. Accepted formats: JPG, JPEG, PNG, GIF, WEBP, and PDF, with a maximum file size of 20 MB.</p>
              {' '}
              <p>HEIC/HEIF and RAW image formats are not supported. Please export a JPG or PNG copy, or use the Take Photo option below. iPhone users may disable RAW capture under Settings &gt; Camera &gt; Formats &gt; Most Compatible. Files exceeding 20 MB should be resized or compressed while preserving image clarity.</p>
            </div>
          </details>
          {' '}
          <div id="proofErrorMsg" className="proof-error-msg" style={{ display: error ? 'flex' : 'none' }}>
            {error && <><i className="ti ti-alert-circle"></i>{' ' + error}</>}
          </div>
          {' '}
          <div className="proof-options" id="proofOptions" style={optionsDisplay ? { display: optionsDisplay } : undefined}>
            <button type="button" className="proof-option-card" onClick={openPicker}>
              <i className="ti ti-cloud-upload"></i>
              {' '}
              <div className="proof-option-label">Upload Photo</div>
              {' '}
              <div className="proof-option-hint">JPG/JPEG, PNG, GIF, WEBP, PDF · Max 20 MB</div>
            </button>
            {' '}
            <button type="button" className="proof-option-card" onClick={openCamera}>
              <i className="ti ti-camera"></i>
              {' '}
              <div className="proof-option-label">Take Photo</div>
              {' '}
              <div className="proof-option-hint">Phone camera or desktop webcam</div>
            </button>
          </div>
          {' '}
          <p id="proofCameraHint" className="proof-camera-hint" role="status">{hint}</p>
          {' '}
          <div id="proofCameraPanel" hidden={!camera.panel}>
            <video id="proofCameraVideo" ref={el => { videoRef.current = el; if (el) el.setAttribute('muted', ''); }} autoPlay muted playsInline aria-label="Webcam preview" hidden={!!camera.still} onError={cameraFailed}></video>
            {' '}
            <img id="proofCameraStill" alt="Captured photo preview" hidden={!camera.still} src={camera.still || undefined} />
            {' '}
            <div className="proof-camera-actions" id="proofCameraLiveActions" hidden={!!camera.still}>
              <button type="button" className="proof-camera-primary" onClick={capture}>Capture</button>
              {' '}
              <button type="button" onClick={clearFile}>Cancel Camera</button>
            </div>
            {' '}
            <div className="proof-camera-actions" id="proofCameraCapturedActions" hidden={!camera.still}>
              <button type="button" onClick={() => { clearFile(); openCamera(); }}>Retake</button>
              {' '}
              <button type="button" className="proof-camera-primary" onClick={usePhoto}>Use Photo</button>
            </div>
          </div>
          {' '}
          <input type="file" id="proofFileInput" ref={fileRef} accept={inputAttrs.accept} capture={inputAttrs.capture || undefined}
            style={{ display: 'none' }} onChange={e => handleFile(e.target)} />
          {' '}
          <div id="proofPreviewWrap" style={{ display: previewDisplay }}>
            <img id="proofPreviewImg" className="proof-preview-img" alt="" src={picked?.image || undefined}
              style={picked ? { display: picked.isImage && picked.image ? 'block' : picked.isImage ? undefined : 'none' } : undefined} />
            {' '}
            <div className="proof-file-chosen">
              <i className="ti ti-file-check"></i>
              {' '}
              <span id="proofFileName">{picked ? picked.name : '—'}</span>
              {' '}
              <button type="button" className="proof-clear-btn" onClick={clearFile}>
                <i className="ti ti-x"></i>
              </button>
            </div>
          </div>
          {' '}
          <div className="form-actions" id="proofFormActions">
            <button type="button" className="btn-form-cancel" onClick={close}>Cancel</button>
            {' '}
            <button type="button" className="btn-form-submit" id="submitProofBtn" onClick={doSubmit} disabled={submit.disabled}>
              {submit.busy ? 'Uploading...' : <><i className="ti ti-upload"></i> Upload</>}
            </button>
          </div>
        </div>
      </div>

      {/* Upload Confirmation Modal */}
      <ConfirmDialog id="uploadConfirmOverlay" open={confirmOpen} onClose={() => resolveConfirm(false)} iconClass="confirm-icon-primary" icon="ti-upload"
        title="Upload this as Session Proof?" body={<>Once uploaded, this session will be marked <strong>Completed</strong> and visible to Admin and Head Admin.</>}>
        <button className="btn-form-cancel" onClick={() => resolveConfirm(false)}>Cancel</button>
        {' '}
        <button className="btn-confirm-primary" onClick={() => resolveConfirm(true)}>
          <i className="ti ti-upload"></i> Upload
        </button>
      </ConfirmDialog>
    </>
  );
});

// ── Proof lightbox: the attachment row (View / Download / Replace), or the preview ──
function ProofLightbox({ state, previewClass, onMode, onClose, onReplace, sessions }) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [state?.mode, state?.proof?.filePath]);
  const proof = state?.proof;
  let body = null;
  if (proof && state.mode === 'list') {
    const session = sessions.find(s => s.sessionID === proof.sessionId);
    const unavailable = proofUnavailableReason(session);
    body = (
      <div className="proof-attachment-list">
        <div className="proof-attachment-row">
          <i className="ti ti-photo" aria-hidden="true"></i>
          <button type="button" className="proof-attachment-name" onClick={() => onMode('preview')}>{proof.filePath.split('/').pop() || 'Session proof'}</button>
          <div className="proof-attachment-actions">
            <button type="button" onClick={() => onMode('preview')}>View</button>
            <a href={CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(proof.filePath))}>Download</a>
            <button type="button" aria-disabled={String(!!unavailable)} title={unavailable || 'Replace this session proof photo'} onClick={() => onReplace(proof.sessionId)}>Replace</button>
          </div>
        </div>
      </div>
    );
  } else if (proof) {
    const url = CONFIG.getFileUrl(proof.filePath);
    const isImage = /image/i.test(proof.fileType || '') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(proof.filePath);
    body = (
      <>
        <button type="button" className="proof-preview-back" onClick={() => onMode('list')}>Back to attachment</button>
        <div className="proof-preview-content">
          {isImage
            ? (imgFailed ? 'Image preview unavailable. Return to the attachment to download it.' : <img alt="Session proof" src={url} onError={() => setImgFailed(true)} />)
            : <a href={url} target="_blank" rel="noopener">Open File</a>}
        </div>
      </>
    );
  }
  return (
    <div id="lightboxOverlay" className="lightbox-overlay" style={{ display: state ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="lightbox-title" id="lightboxTitle">{state?.title || 'Session Proof'}</span>
          {' '}
          <button className="lightbox-close" onClick={onClose}>&times;</button>
        </div>
        {' '}
        <div className={'lightbox-body' + (previewClass ? ' proof-preview-mode' : '')} id="lightboxBody">{body}</div>
        {' '}
        <div className="lightbox-footer">
          <a className="lightbox-download" id="lightboxDownload" href="#" style={{ display: 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            {' '}Download
          </a>
        </div>
      </div>
    </div>
  );
}
