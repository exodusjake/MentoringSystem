import { useEffect, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import DateInput from '../../components/DateInput.jsx';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import TimeInput from '../../components/TimeInput.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { checkpointDateAllowed, checkpointToday, checkpointWindow } from '../../lib/checkpoint-window.js';
import { sessionDisplayStatus } from '../../lib/dashboard-sessions.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';
import { sampleHtml, useTour } from '../../app/tour.js';
import { MENTOR_SAMPLE as SM } from '../../app/tourMentor.js';
import SessionProofModal from './SessionProofModal.jsx';
import SessionQrModal from './SessionQrModal.jsx';

// MENTOR/HTML/sessions.html + MENTOR/JS/sessions.js

// Mirrors AstraMentoring-Backend/.../Constants/MentoringSlots.cs — the fixed checkpoints a regular session must be
// logged against, one per section per semester.
const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals'
];
function slotsForSemester(semester) {
  return semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;
}

const fmtLongDate = iso => new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });

// Phones' proof requirement — the persisted QR-attendance requirement mirrors the API's upload rule.
function proofUnavailableReason(session) {
  if (!session) return 'This session is no longer available. Refresh the session list.';
  if (session.sessionStatus === 'Cancelled') return 'Proof cannot be uploaded for a cancelled session.';
  // New API field uses the same persisted QR-attendance requirement as upload.
  const verified = typeof session.hasVerifiedAttendance === 'boolean'
    ? session.hasVerifiedAttendance : Number(session.presentCount) > 0;
  return verified ? '' : 'Record at least one verified QR attendance before uploading proof.';
}

export default function MentorSessions() {
  useBackGuard();
  const wt = useTour().active;   // walkthrough: show sample data
  const currentUser = getSession()?.user;

  const [allSessions, setAllSessions] = useState(null);        // null loading, false failed
  const [calendar, setCalendar] = useState(null);
  const [mentorSections, setMentorSections] = useState([]);
  const [period, setPeriod] = useState({ schoolYear: '2026-2027', semester: '1st Semester' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');

  // log / edit modals
  const [logOpen, setLogOpen] = useState(false);
  const [logSection, setLogSection] = useState('');
  const [logSlot, setLogSlot] = useState('');
  const [logDate, setLogDate] = useState('');
  const [logTime, setLogTime] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [logError, setLogError] = useState('');
  const [logBusy, setLogBusy] = useState(false);

  const [editId, setEditId] = useState(null);
  const [editSection, setEditSection] = useState('');
  const [editSlot, setEditSlot] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);      // { id, dStr }
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);      // { id, dStr }
  const [cancelBusy, setCancelBusy] = useState(false);

  const [qr, setQr] = useState(null);                          // { id, dStr }
  const [proof, setProof] = useState(null);                    // { id, dStr }
  const proofInFlight = useRef(false);
  const [viewed, setViewed] = useState(null);                  // { filePath, fileType, sessionId, title, preview }

  async function loadSessions() {
    const mentorId = currentUser?.userID;
    try {
      const [data, cal] = await Promise.all([
        apiRequest(`SessionsAdmin/${mentorId}/sessions`, 'GET', null, true),
        apiRequest('CalendarEvents', 'GET', null, true).catch(() => null),
      ]);
      setCalendar(Array.isArray(cal) ? cal : null);
      setAllSessions(data?.sessions || []);
    } catch (e) {
      console.error('Sessions load failed:', e);
      setAllSessions(false);
    }
  }

  async function loadMentorSections() {
    try {
      const [assignments, menteesWithDept, courseCatalog] = await Promise.all([
        apiRequest('Users/assignments', 'GET', null, true),
        apiRequest('Users/mentees-with-dept', 'GET', null, true),
        apiRequest('Users/courses', 'GET', null, true),
      ]);
      const deptMap = {};
      (menteesWithDept || []).forEach(m => { deptMap[m.userID] = m; });
      const mine = (assignments || []).filter(a => a.mentorUserID === currentUser?.userID);
      const seen = new Set();
      const out = [];
      mine.forEach(a => {
        const detail = deptMap[a.menteeUserID] || {};
        if (detail.isActive === false || detail.isDropOut === true) return;
        const school = Object.keys(courseCatalog || {}).find(s => s.toLowerCase() === String(detail.school || '').trim().toLowerCase());
        const normalize = s => String(s || '').replace(/\s+/g, '').toUpperCase();
        const sec = school && (courseCatalog[school] || []).find(c => normalize(c) === normalize(detail.course));
        if (!sec) return;
        const courseKey = encodeURIComponent(school) + '|' + sec;
        if (!seen.has(courseKey)) {
          seen.add(courseKey);
          out.push({ sectionCode: sec, course: sec, courseSchool: school, courseKey });
        }
      });
      out.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
      setMentorSections(out);
    } catch (e) { /* non-critical */ }
  }

  async function loadCurrentPeriod() {
    try {
      const data = await apiRequest('Settings', 'GET', null, true);
      setPeriod(p => ({ schoolYear: data?.SchoolYear || p.schoolYear, semester: data?.Semester || p.semester }));
    } catch (e) { /* keep defaults */ }
  }

  useEffect(() => { Promise.all([loadSessions(), loadMentorSections(), loadCurrentPeriod()]); }, []);

  const sessionsLoaded = Array.isArray(allSessions);
  const sessions = sessionsLoaded ? allSessions : [];
  const cal = calendar || [];
  const dispStatus = s => sessionDisplayStatus(s, cal);

  // ── period filter options (School Year / Semester) ──
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
    // Most recent school year first, then 2nd Sem before 1st Sem within it.
    periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));
  }
  const effPeriod = periods.some(p => p.key === periodFilter) ? periodFilter : '';

  // ── stats ──
  const completedCount = sessions.filter(s => dispStatus(s) === 'Completed').length;
  const scheduledCount = sessions.filter(s => dispStatus(s) === 'Scheduled').length;
  const cancelledCount = sessions.filter(s => s.sessionStatus === 'Cancelled').length;
  const closedCount = sessions.filter(s => dispStatus(s) === 'Closed').length;
  const inProgressCount = sessions.filter(s => dispStatus(s) === 'In Progress').length;
  const completedSess = sessions.filter(s => s.sessionStatus === 'Completed');
  const missingProof = completedSess.filter(s => !s.proofFilePath).length;
  const pulse = <span className="stat-pulse">—</span>;

  // ── filters ──
  const q = search.trim().toLowerCase();
  let filtered = sessions;
  if (statusFilter) filtered = filtered.filter(s => dispStatus(s) === statusFilter);
  if (effPeriod) filtered = filtered.filter(s => `${s.schoolYear}|${s.semester}` === effPeriod);
  if (q) {
    filtered = filtered.filter(s => {
      const date = new Date(s.sessionDate).toLocaleDateString('en-PH').toLowerCase();
      const topic = (s.topic || '').toLowerCase();
      return date.includes(q) || topic.includes(q);
    });
  }

  // ── session slot picker ──
  function regularSessionStatusFor(sectionCode, slotName) {
    const group = mentorSections.find(c => c.courseKey === sectionCode || c.sectionCode === sectionCode);
    const code = group?.sectionCode || sectionCode;
    const matching = sessions.filter(s =>
      !s.isMakeup && (s.courseCode || s.sectionCode || null) === code && (!s.courseSchool || !group?.courseSchool || s.courseSchool === group.courseSchool) &&
      s.schoolYear === period.schoolYear && s.semester === period.semester &&
      s.slotName === slotName && s.sessionStatus !== 'Cancelled'
    );
    if (matching.some(s => s.sessionStatus === 'Scheduled')) return 'Already scheduled';
    if (matching.some(s => s.sessionStatus === 'Completed')) return 'Completed';
    return matching.length ? 'Already scheduled' : null;
  }

  function slotOptions(sectionCode, preserveValue) {
    return slotsForSemester(period.semester).map(name => {
      const windowState = checkpointWindow(calendar, name, period.schoolYear, period.semester);
      const existingStatus = regularSessionStatusFor(sectionCode, name);
      const isBlocked = (existingStatus !== null && name !== preserveValue) || windowState.disabled;
      const label = existingStatus ? ` — ${existingStatus}` : windowState.disabled ? ' — ' + windowState.label : '';
      return <option value={name} key={name} style={isBlocked ? { color: '#9ca3af' } : { fontWeight: 700 }} disabled={isBlocked}>{name}{label}</option>;
    });
  }
  // The date picker is constrained to the chosen checkpoint's window.
  function dateBounds(slot) {
    const w = checkpointWindow(calendar, slot, period.schoolYear, period.semester);
    return { min: w.start && w.start > checkpointToday() ? w.start : checkpointToday(), max: w.end || undefined };
  }

  // ── log session ──
  const multiSections = mentorSections.length > 1;
  function openLogSessionModal() {
    setLogDate(new Date().toISOString().split('T')[0]);
    setLogTime('');
    setLogNotes('');
    setLogSection(multiSections ? (mentorSections[0].courseKey || mentorSections[0].sectionCode) : '');
    setLogSlot('');
    setLogError('');
    setLogBusy(false);
    setLogOpen(true);
  }
  const logSectionKey = multiSections ? logSection : (mentorSections[0]?.sectionCode || null);

  async function submitLogSession(e) {
    e.preventDefault();
    const sectionPick = multiSections ? logSection : (mentorSections[0]?.sectionCode || '');
    const selectedCourse = mentorSections.find(c => c.courseKey === sectionPick || c.sectionCode === sectionPick);
    const validSection = selectedCourse?.sectionCode || null;
    const notes = logNotes.trim();
    const finalNotes = validSection ? `[${validSection}]${notes ? ' ' + notes : ''}` : (notes || null);
    const slotName = logSlot || null;
    if (!checkpointDateAllowed(checkpointWindow(calendar, slotName, period.schoolYear, period.semester), logDate)) {
      const msg = 'Choose an available checkpoint and a date within its session window.';
      setLogError(msg);
      showToast(msg); return;
    }

    setLogBusy(true);
    try {
      await apiRequest('Sessions', 'POST', {
        MentorID:    currentUser.userID,
        SessionDate: `${logDate}T${logTime}:00`,
        Status:      'Scheduled',
        Notes:       finalNotes,
        SectionCode: validSection,
        CourseCode: selectedCourse?.sectionCode || (mentorSections.length === 1 ? mentorSections[0].sectionCode : null),
        CourseSchool: selectedCourse?.courseSchool || (mentorSections.length === 1 ? mentorSections[0].courseSchool : null),
        SlotName:    slotName,
      }, true);
      setLogOpen(false);
      showToast('Session logged successfully.', 'success');
      await loadSessions();
    } catch (err) {
      console.error('Log session failed:', err);
      setLogError(err.message || 'Failed to log session. Please try again.');
      showToast(err.message || 'Failed to log session. Please try again.');
    } finally {
      setLogBusy(false);
    }
  }

  // ── edit session ──
  const editSession = editId !== null ? sessions.find(s => s.sessionID === editId) : null;
  function openEditModal(sessionId) {
    const s = sessions.find(x => x.sessionID === sessionId);
    if (!s) return;
    const currentSec = s.isMakeup ? '' : (s.sectionCode || '');
    // Hidden for a makeup session too, not just a single-section mentor.
    const pickOn = !s.isMakeup && s.groupingMode === 'Course' && mentorSections.length > 1;
    if (pickOn) {
      const match = mentorSections.find(sec => sec.sectionCode === currentSec && (!s.courseSchool || sec.courseSchool === s.courseSchool));
      setEditSection((match || mentorSections[0]).courseKey);
    } else setEditSection('');
    setEditSlot(s.isMakeup ? '' : (s.slotName || ''));
    setEditDate((s.sessionDate || '').split('T')[0]);
    setEditTime((s.sessionDate || '').split('T')[1]?.slice(0, 5) || '');
    setEditNotes((s.topic || '').replace(/^\[[^\]]+\]\s*/, ''));
    setEditError('');
    setEditBusy(false);
    setEditId(sessionId);
  }
  const closeEditModal = () => setEditId(null);

  async function submitEditSession(e) {
    e.preventDefault();
    const currentSession = editSession;
    const currentStatus = currentSession?.sessionStatus || 'Scheduled';
    const isMakeup = !!currentSession?.isMakeup;
    // A makeup session has no section of its own.
    const sectionPick = (!isMakeup && mentorSections.length > 1) ? editSection : (!isMakeup ? (mentorSections[0]?.sectionCode || '') : '');
    const selectedCourse = mentorSections.find(c => c.courseKey === sectionPick || c.sectionCode === sectionPick);
    const validSection = isMakeup ? null : (currentSession?.groupingMode !== 'Course' ? currentSession?.sectionCode : selectedCourse?.sectionCode || currentSession?.sectionCode) || null;
    const notes = editNotes.trim();
    const finalNotes = validSection ? `[${validSection}]${notes ? ' ' + notes : ''}` : (notes || null);
    const slotName = isMakeup ? null : (editSlot || null);

    setEditBusy(true);
    setEditError('');
    try {
      await apiRequest(`Sessions/${editId}`, 'PUT', {
        SessionID:   editId,
        MentorID:    currentUser.userID,
        SessionDate: `${editDate}T${editTime}:00`,
        Status:      currentStatus,
        Notes:       finalNotes,
        CourseCode: currentSession?.groupingMode === 'Course' && !isMakeup ? selectedCourse?.sectionCode : undefined,
        CourseSchool: currentSession?.groupingMode === 'Course' && !isMakeup ? selectedCourse?.courseSchool : undefined,
        SlotName:    slotName,
      }, true);
      setEditId(null);
      showToast('Session updated successfully.', 'success');
      await loadSessions();
    } catch (err) {
      console.error('Edit session failed:', err);
      setEditError(err.message || 'Failed to save changes. Please try again.');
      showToast(err.message || 'Failed to save changes. Please try again.');
    } finally {
      setEditBusy(false);
    }
  }

  // ── cancel session ──
  function openCancelSessionConfirm() {
    const s = editSession;
    if (!s || s.sessionStatus === 'Completed' || (s.presentCount ?? 0) > 0) return;
    setCancelBusy(false);
    setCancelTarget({ id: editId, dStr: fmtLongDate(s.sessionDate) });
    setEditId(null);
  }
  async function confirmCancelSession() {
    if (!cancelTarget) return;
    const s = sessions.find(x => x.sessionID === cancelTarget.id);
    setCancelBusy(true);
    if (!s) { setCancelTarget(null); setCancelBusy(false); return; }
    try {
      await apiRequest(`Sessions/${cancelTarget.id}`, 'PUT', {
        SessionID:   cancelTarget.id,
        MentorID:    currentUser.userID,
        SessionDate: s.sessionDate,
        Status:      'Cancelled',
        Notes:       s.topic || null,
        TimeEnd:     s.timeEnd || null,
      }, true);
      setCancelTarget(null);
      showToast('Session cancelled.', 'info');
      await loadSessions();
    } catch (err) {
      console.error('Cancel session failed:', err);
      showToast(err.message || 'Failed to cancel session. Please try again.');
    } finally {
      setCancelBusy(false);
    }
  }

  // ── delete session ──
  async function confirmDeleteSession() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await apiRequest(`Sessions/${deleteTarget.id}`, 'DELETE', null, true);
      setDeleteTarget(null);
      showToast('Session deleted.', 'success');
      await loadSessions();
    } catch (err) {
      console.error('Delete session failed:', err);
      showToast(err.message || 'Failed to delete session. Please try again.');
    } finally {
      setDeleteBusy(false);
    }
  }

  // ── proof ──
  function openProofModal(sessionId, dateStr) {
    if (proofInFlight.current) { showToast('A proof upload is already in progress. Please wait.'); return; }
    const session = sessions.find(s => Number(s.sessionID) === Number(sessionId));
    const reason = proofUnavailableReason(session);
    if (reason) { showToast(reason); return; }
    setProof({ id: session.sessionID, dStr: dateStr });
  }

  // Proof lightbox (view an already-uploaded proof): an attachment row first, then an in-page preview.
  const viewedSession = viewed ? sessions.find(s => s.sessionID === viewed.sessionId) : null;
  const viewedUnavailable = viewed ? proofUnavailableReason(viewedSession) : '';
  const closeLightbox = () => setViewed(null);
  const previewProof = () => setViewed(v => ({ ...v, preview: true, previewFailed: false }));
  const isImageProof = viewed && (/image/i.test(viewed.fileType || '') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(viewed.filePath));

  // ── session cards ──
  let cards;
  if (allSessions === null) cards = <div className="sessions-loading"><span className="spinner"></span> Loading sessions...</div>;
  else if (allSessions === false) cards = <div className="empty-state"><i className="ti ti-alert-circle"></i><p>Failed to load sessions. Please refresh.</p></div>;
  else if (!filtered.length) {
    cards = sessions.length > 0
      ? <div className="empty-state"><i className="ti ti-filter-off"></i><p>No sessions match your filter.</p></div>
      : <div className="empty-state"><i className="ti ti-calendar-off"></i><p>No sessions yet. Click <strong>Log Session</strong> to get started.</p></div>;
  } else {
    const sorted = [...filtered].sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));
    cards = sorted.map(s => {
      const date = new Date(s.sessionDate);
      const dStr = date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
      const tStart = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const tEnd = s.timeEnd ? new Date(s.timeEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null;
      const timeStr = tEnd ? `${tStart} – ${tEnd}` : tStart;
      const status = s.sessionStatus || 'Scheduled';
      const displayStatus = dispStatus(s);
      const statusCls = `status-${(displayStatus === 'In Progress' ? 'Scheduled' : displayStatus === 'Closed' ? 'Cancelled' : displayStatus).toLowerCase()}`;
      const rawTopic = s.topic || '';
      // sectionCode/isMakeup come straight from the backend.
      const isMakeup = s.isMakeup;
      const sectionTag = isMakeup ? '' : (s.sectionCode || '');
      const displayTopic = rawTopic.replace(/^\[[^\]]+\]\s*/, '');
      const present = s.presentCount ?? 0;
      const total = s.totalAttendees ?? 0;
      const pct = total > 0 ? Math.round((present / total) * 100) : 0;
      const hasProof = !!s.proofFilePath;
      const sid = s.sessionID;

      const isCancelled = status === 'Cancelled';
      const w = checkpointWindow(calendar, s.slotName, s.schoolYear, s.semester);
      const lateBadge = w.disabled && w.label !== 'Closed' && status !== 'Cancelled' && !(status === 'Completed' && s.timeEnd) ? <span className="session-late-tag">{w.label}</span> : null;
      const sessionNumBadge = isMakeup
        ? <span className="sc-session-num sc-makeup-label">{s.slotName ? `Make-up Session: ${s.slotName}` : 'Make-up Session'}</span>
        : s.slotName
          ? <span className="sc-session-num">{s.slotName}</span>
          : <span className="sc-session-num">Session</span>;

      const reason = proofUnavailableReason(s);
      const proofBtn = hasProof
        ? <button type="button" className="sc-action-btn btn-sc-proof-view" onClick={() => setViewed({ filePath: s.proofFilePath, fileType: s.proofFileType || '', title: 'Session Proof - ' + dStr, sessionId: sid, preview: false })}>View Photo</button>
        : <button type="button" className="sc-action-btn btn-sc-proof-upload" aria-disabled={!!reason} title={reason || 'Upload a session proof photo'} onClick={() => openProofModal(sid, dStr)}>
            <i className="ti ti-upload"></i> Upload Proof
          </button>;

      if (isCancelled) {
        return (
          <div className="session-card session-card-cancelled" key={sid}>
            <div className="sc-top">
              <div className="sc-badges">
                {sessionNumBadge}
                <span className={`session-status ${statusCls}`}>{displayStatus}</span>
                {sectionTag ? <span className="sc-section-tag">{sectionTag}</span> : null}
              </div>
              <div className="sc-datetime">
                <i className="ti ti-calendar"></i>
                <span className="sc-date-str">{dStr}</span>
                <span className="sc-time-str">{timeStr}</span>
              </div>
            </div>
            {!isMakeup && displayTopic ? <div className="sc-topic sc-topic-cancelled">"{displayTopic}"</div> : null}
            <div className="sc-actions sc-actions-cancelled">
              <div className="sc-secondary-actions">
                <button className="sc-action-btn btn-sc-edit" onClick={() => openEditModal(sid)} title="Edit session" aria-label="Edit"><i className="ti ti-pencil"></i></button>
                <button className="sc-action-btn btn-sc-delete" onClick={() => { setDeleteBusy(false); setDeleteTarget({ id: sid, dStr }); }} title="Delete session" aria-label="Delete"><i className="ti ti-trash"></i></button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="session-card" key={sid}>
          <div className="sc-top">
            <div className="sc-badges">
              {sessionNumBadge}
              {lateBadge}
              <span className={`session-status ${statusCls}`}>{displayStatus}</span>
              {sectionTag ? <span className="sc-section-tag">{sectionTag}</span> : null}
            </div>
            <div className="sc-datetime">
              <i className="ti ti-calendar"></i>
              <span className="sc-date-str">{dStr}</span>
              <span className="sc-time-str">{timeStr}</span>
            </div>
          </div>

          {!isMakeup && displayTopic ? <div className="sc-topic">"{displayTopic}"</div> : null}

          <div className="sc-attendance">
            <div className="sc-att-row">
              <i className="ti ti-users"></i>
              <span className="sc-att-count">{present} / {total} present</span>
            </div>
            {total > 0 ? <div className="sc-att-bar"><div className="sc-att-fill" style={{ width: `${pct}%` }}></div></div> : null}
          </div>

          <div className="sc-actions">
            <div className="sc-primary-actions">
              <button className="sc-action-btn btn-sc-qr" onClick={() => setQr({ id: sid, dStr })}>
                <i className="ti ti-qrcode"></i> {w.disabled || w.upcoming || s.timeEnd ? 'View Attendance' : 'Scan QR'}
              </button>
              {proofBtn}
            </div>
            <div className="sc-secondary-actions">
              <button className="sc-action-btn btn-sc-edit" onClick={() => openEditModal(sid)} title="Edit session" aria-label="Edit"><i className="ti ti-pencil"></i></button>
              {status === 'Completed' || present > 0 ? null : (
                <button className="sc-action-btn btn-sc-delete" onClick={() => { setDeleteBusy(false); setDeleteTarget({ id: sid, dStr }); }} title="Delete session" aria-label="Delete"><i className="ti ti-trash"></i></button>
              )}
            </div>
          </div>
        </div>
      );
    });
  }

  const qrSession = qr ? sessions.find(s => s.sessionID === qr.id) : null;
  const editPickOn = editSession && !editSession.isMakeup && editSession.groupingMode === 'Course' && mentorSections.length > 1;
  const editSecCode = editSession ? (editSession.isMakeup ? '' : (editSession.sectionCode || '')) : '';
  const editSectionForSlots = editPickOn ? editSection : editSecCode;
  const logBounds = dateBounds(logSlot);
  const editBounds = dateBounds(editSlot);
  const cancelHidden = editSession && (editSession.sessionStatus === 'Completed' || (editSession.presentCount ?? 0) > 0);

  return (
    <Page id="MENTOR/sessions">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Sessions</h1>
              <p id="sessionSubtitle">{wt ? SM.sessions.subtitle : sessionsLoaded ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} on record` : 'Your mentoring session log'}</p>
            </div>
            <div className="page-header-right">
              <button id="logSessionBtn" className="btn-log-session" onClick={openLogSessionModal}>
                <i className="ti ti-plus"></i> Log Session
              </button>
            </div>
          </div>

          <div className="session-stats-strip">
            <div className="sstat"><div className="sstat-val" id="sTotalSessions">{wt ? SM.sessions.counts.total : sessionsLoaded ? sessions.length : pulse}</div><div className="sstat-lbl">Total</div></div>
            <div className="sstat"><div className="sstat-val green" id="sCompleted">{wt ? SM.sessions.counts.completed : sessionsLoaded ? completedCount : pulse}</div><div className="sstat-lbl">Completed</div></div>
            <div className="sstat"><div className="sstat-val blue" id="sScheduled">{wt ? SM.sessions.counts.scheduled : sessionsLoaded ? scheduledCount : pulse}</div><div className="sstat-lbl">Scheduled</div></div>
            <div className="sstat"><div className="sstat-val gray" id="sCancelled">{wt ? SM.sessions.counts.cancelled : sessionsLoaded ? cancelledCount : pulse}</div><div className="sstat-lbl">Cancelled</div></div>
            <div className="sstat"><div className="sstat-val blue" id="sInProgress">{wt ? SM.sessions.counts.inProgress : sessionsLoaded ? inProgressCount : '—'}</div><div className="sstat-lbl">In Progress</div></div>
            <div className="sstat"><div className="sstat-val gray" id="sClosed">{wt ? SM.sessions.counts.closed : sessionsLoaded ? closedCount : '—'}</div><div className="sstat-lbl">Closed</div></div>
          </div>

          {/* Proof completion indicator */}
          <div className="sc-proof-bar" id="sProofBar" style={{ display: sessionsLoaded && completedSess.length ? 'flex' : 'none' }}>
            {missingProof > 0
              ? <span className="sc-proof-pill-bar sc-proof-pill-bar--pending" id="sProofPill"><i className="ti ti-photo-off"></i> {missingProof} session{missingProof !== 1 ? 's' : ''} without proof photo</span>
              : <span className="sc-proof-pill-bar sc-proof-pill-bar--done" id="sProofPill"><i className="ti ti-circle-check-filled"></i> All completed sessions have proof</span>}
          </div>

          <div className="toolbar">
            <div className="search-wrap">
              <i className="ti ti-search"></i>
              <input type="text" id="searchInput" placeholder="Search by date or notes..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select id="statusFilter" className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Closed">Closed</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </Select>
            <Select id="periodFilter" className="filter-select" value={effPeriod} onChange={e => setPeriodFilter(e.target.value)}>
              <option value="">All School Years</option>
              {periods.map(p => <option key={p.key} value={p.key}>{p.semester}, SY {p.schoolYear}</option>)}
            </Select>
          </div>

          <div id="sessionsList" className="sessions-list" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, SM.sessions.list)}>{wt ? undefined : cards}</div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Log Session Modal */}
      <Overlay open={logOpen} className="modal-overlay" activeClass="open" id="logSessionModal"
        onClick={e => { if (e.target === e.currentTarget) setLogOpen(false); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setLogOpen(false)}><i className="ti ti-x"></i></button>
          <h2 className="modal-title">Log a Session</h2>
          <p className="modal-subtitle">Record a new mentoring session</p>
          <form id="logSessionForm" onSubmit={submitLogSession}>
            <div className="form-error" id="logSessionError" style={{ display: logError ? '' : 'none' }}>{logError}</div>
            <div className="form-group" id="sectionPickGroup" style={{ display: multiSections ? '' : 'none' }}>
              <label className="form-label">Course</label>
              <Select id="sessionSectionPick" className="form-input" value={logSection} onChange={e => { setLogSection(e.target.value); setLogSlot(''); }}>
                {mentorSections.map(s => <option key={s.courseKey || s.sectionCode} value={s.courseKey || s.sectionCode}>{s.sectionCode}{s.courseSchool ? ' — ' + s.courseSchool : ''}</option>)}
              </Select>
            </div>
            <div className="form-group">
              <label className="form-label">Session Slot</label>
              <Select id="sessionSlotPick" className="form-input" required value={logSlot} onChange={e => setLogSlot(e.target.value)}>
                <option value="" disabled>Choose...</option>
                {slotOptions(logSectionKey, undefined)}
              </Select>
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <DateInput type="date" id="sessionDateInput" className="form-input" required min={logBounds.min} max={logBounds.max} value={logDate} onChange={e => setLogDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <TimeInput id="sessionTimeStart" className="form-input" required value={logTime} onChange={e => setLogTime(e.target.value)} />
              <small>End time is recorded when you select Save End after the session.</small>
            </div>
            <div className="form-group">
              <label className="form-label">Notes <span className="form-optional">(optional)</span></label>
              <textarea id="sessionNotesInput" className="form-textarea" rows="3" placeholder="Topic or notes for this session..." value={logNotes} onChange={e => setLogNotes(e.target.value)}></textarea>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-form-cancel" onClick={() => setLogOpen(false)}>Cancel</button>
              <button type="submit" className="btn-form-submit" id="submitSessionBtn" disabled={logBusy}>
                {logBusy ? 'Logging...' : <><i className="ti ti-calendar-plus"></i> Log Session</>}
              </button>
            </div>
          </form>
        </div>
      </Overlay>

      {/* Edit Session Modal */}
      <Overlay open={editId !== null} className="modal-overlay" activeClass="open" id="editSessionModal"
        onClick={e => { if (e.target === e.currentTarget) closeEditModal(); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={closeEditModal}><i className="ti ti-x"></i></button>
          <h2 className="modal-title">Edit Session</h2>
          <p className="modal-subtitle">Update session details or mark as cancelled</p>
          <form id="editSessionForm" onSubmit={submitEditSession}>
            <div className="form-error" id="editSessionError" style={{ display: editError ? '' : 'none' }}>{editError}</div>
            <div className="form-group" id="editSectionPickGroup" style={{ display: editPickOn ? '' : 'none' }}>
              <label className="form-label">Course</label>
              <Select id="editSectionPick" className="form-input" value={editSection} onChange={e => { setEditSection(e.target.value); setEditSlot(''); }}>
                {mentorSections.map(sec => <option key={sec.courseKey} value={sec.courseKey}>{sec.sectionCode} / {sec.courseSchool}</option>)}
              </Select>
            </div>
            <div className="form-group" id="editSlotPickGroup" style={{ display: editSession?.isMakeup ? 'none' : '' }}>
              <label className="form-label">Session Slot</label>
              <Select id="editSlotPick" className="form-input" required={!editSession?.isMakeup} value={editSlot} onChange={e => setEditSlot(e.target.value)}>
                <option value="" disabled>Choose...</option>
                {!editSession?.isMakeup ? slotOptions(editSectionForSlots, editSession?.slotName) : null}
              </Select>
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <DateInput type="date" id="editDateInput" className="form-input" required min={editBounds.min} max={editBounds.max} value={editDate} onChange={e => setEditDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <TimeInput id="editTimeStart" className="form-input" required value={editTime} onChange={e => setEditTime(e.target.value)} />
              <small>End time is recorded when you select Save End after the session.</small>
            </div>
            <div className="form-group">
              <label className="form-label">Notes <span className="form-optional">(optional)</span></label>
              <textarea id="editNotesInput" className="form-textarea" rows="3" placeholder="Topic or notes..." value={editNotes} onChange={e => setEditNotes(e.target.value)}></textarea>
            </div>
            <div className="form-actions form-actions-split">
              <button type="button" className="btn-cancel-session" onClick={openCancelSessionConfirm} style={{ display: cancelHidden ? 'none' : '' }}>
                <i className="ti ti-calendar-x"></i> Cancel Session
              </button>
              <div className="form-actions-right">
                <button type="button" className="btn-form-cancel" onClick={closeEditModal}>Close</button>
                <button type="submit" className="btn-form-submit" id="submitEditBtn" disabled={editBusy}>
                  {editBusy ? 'Saving...' : <><i className="ti ti-check"></i> Save Changes</>}
                </button>
              </div>
            </div>
          </form>
        </div>
      </Overlay>

      {/* Delete Confirm Modal */}
      <Overlay open={!!deleteTarget} className="modal-overlay" activeClass="open" id="deleteConfirmModal"
        onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-danger"><i className="ti ti-trash"></i></div>
          <h3 className="confirm-title">Delete Session?</h3>
          <p className="confirm-body">
            <strong id="deleteConfirmDate">{deleteTarget?.dStr}</strong><br />
            This will permanently remove the session and cannot be undone.
          </p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn-confirm-danger" id="confirmDeleteBtn" onClick={confirmDeleteSession} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting...' : <><i className="ti ti-trash"></i> Delete</>}
            </button>
          </div>
        </div>
      </Overlay>

      {/* Cancel Session Confirm Modal */}
      <Overlay open={!!cancelTarget} className="modal-overlay" activeClass="open" id="cancelConfirmModal"
        onClick={e => { if (e.target === e.currentTarget) setCancelTarget(null); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-warn"><i className="ti ti-calendar-x"></i></div>
          <h3 className="confirm-title">Cancel this Session?</h3>
          <p className="confirm-body">
            <strong id="cancelConfirmDate">{cancelTarget?.dStr}</strong><br />
            This will mark the session as Cancelled.
          </p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => setCancelTarget(null)}>Keep Session</button>
            <button className="btn-confirm-warn" id="confirmCancelBtn" onClick={confirmCancelSession} disabled={cancelBusy}>
              {cancelBusy ? 'Cancelling...' : <><i className="ti ti-calendar-x"></i> Yes, Cancel</>}
            </button>
          </div>
        </div>
      </Overlay>

      <SessionQrModal open={!!qr && !!qrSession} session={qrSession} dateStr={qr?.dStr} calendar={calendar}
        onClose={() => setQr(null)} onSaved={loadSessions} />

      <SessionProofModal open={!!proof} sessionId={proof?.id} dateStr={proof?.dStr} inFlightRef={proofInFlight}
        onClose={() => setProof(null)} onUploaded={loadSessions} />

      {/* Proof Lightbox (view an already-uploaded proof) */}
      <Overlay open={!!viewed} className="lightbox-overlay" activeClass={null} display="flex" id="lightboxOverlay"
        onClick={e => { if (e.target === e.currentTarget) closeLightbox(); }}>
        <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
          <div className="lightbox-header">
            <span className="lightbox-title" id="lightboxTitle">{viewed?.title || 'Session Proof'}</span>
            <button className="lightbox-close" onClick={closeLightbox}>&times;</button>
          </div>
          <div className={`lightbox-body${viewed?.preview ? ' proof-preview-mode' : ''}`} id="lightboxBody">
            {viewed && !viewed.preview ? (
              <div className="proof-attachment-list">
                <div className="proof-attachment-row">
                  <i className="ti ti-photo" aria-hidden="true"></i>
                  <button type="button" className="proof-attachment-name" onClick={previewProof}>{viewed.filePath.split('/').pop() || 'Session proof'}</button>
                  <div className="proof-attachment-actions">
                    <button type="button" onClick={previewProof}>View</button>
                    <a href={CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(viewed.filePath))}>Download</a>
                    <button type="button" aria-disabled={String(!!viewedUnavailable)} title={viewedUnavailable || 'Replace this session proof photo'}
                      onClick={() => {
                        if (viewedUnavailable) { showToast(viewedUnavailable); return; }
                        const id = viewed.sessionId;
                        closeLightbox(); openProofModal(id, new Date(viewedSession.sessionDate).toLocaleDateString('en-PH'));
                      }}>Replace</button>
                  </div>
                </div>
              </div>
            ) : null}
            {viewed && viewed.preview ? (
              <>
                <button type="button" className="proof-preview-back" onClick={() => setViewed(v => ({ ...v, preview: false }))}>Back to attachment</button>
                <div className="proof-preview-content">
                  {isImageProof
                    ? (viewed.previewFailed
                      ? 'Image preview unavailable. Return to the attachment to download it.'
                      : <img alt="Session proof" src={CONFIG.getFileUrl(viewed.filePath)} onError={() => setViewed(v => ({ ...v, previewFailed: true }))} />)
                    : <a href={CONFIG.getFileUrl(viewed.filePath)} target="_blank" rel="noopener">Open File</a>}
                </div>
              </>
            ) : null}
          </div>
          <div className="lightbox-footer">
            <a className="lightbox-download" id="lightboxDownload" href="#" style={{ display: 'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Download
            </a>
          </div>
        </div>
      </Overlay>
    </Page>
  );
}
