import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { dashboardSessionState } from '../../lib/dashboard-sessions.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { buildMentorNotesForm, buildNonAttendanceForm, buildPrintForm, openLogsheetPrintWindow } from '../../lib/logsheetForms.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// MENTOR/HTML/logsheet.html + MENTOR/JS/logsheet.js

// Mirrors AstraMentoring-Backend/.../Constants/MentoringSlots.cs
const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals'
];
function slotsForSemester(semester) {
  return semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;
}

// Guided-flow order — a mentor must pass through every sheet (Next) before Upload Logsheet appears.
const PREVIEW_TAB_ORDER = ['logsheet', 'notes', 'nonattend'];
const PREVIEW_TAB_LABELS = { logsheet: 'Logsheet', notes: "Mentor's Notes", nonattend: 'Non-Attendance' };

const isMakeupSession = session => !!session.isMakeup;

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}
const fmtDateShort = value => LogsheetData.day(value);
function fmtDayOfWeek(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('en-PH', { weekday: 'long' });
}
function statusBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'completed': return 'completed';
    case 'scheduled': return 'scheduled';
    case 'cancelled': return 'cancelled';
    default:          return 'other';
  }
}
function initials(name) {
  const parts = (name || '').trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}
// Pre-Phase-2 leftover numbering (kept so the card plumbing stays the same).
function buildSectionNumMap(sectionSessions) {
  const numMap = {};
  let ctr = 0, lastKey = null;
  sectionSessions.forEach(s => {
    const key = `${s.schoolYear}|${s.semester}`;
    if (key !== lastKey) { ctr = 0; lastKey = key; }
    numMap[s.sessionID] = s.sessionStatus !== 'Cancelled' ? ++ctr : null;
  });
  return numMap;
}
// Submitted and up to date. A submitted logsheet that gained attendance later needs a resubmit.
function isFinalSubmitted(s) { return s?.logStatus === 'Submitted' && !s?.needsUpdate; }

// ── paper forms shown in the preview modal ──
function Logo() {
  const [failed, setFailed] = useState(false);
  return failed ? null : <img src="/IMAGES/FAITH-Colleges-Logo.png" className="paper-logo-img" onError={() => setFailed(true)} />;
}
function MentorSig({ mentor }) {
  const [failed, setFailed] = useState(false);
  if (!mentor?.signatureFilePath || failed) return null;
  return <img src={CONFIG.getFileUrl(mentor.signatureFilePath)} onError={() => setFailed(true)}
    style={{ maxHeight: '60px', maxWidth: '190px', objectFit: 'contain', display: 'block', margin: '0 auto -10px', mixBlendMode: 'multiply', position: 'relative', zIndex: 1 }} />;
}
function MenteeSig({ src }) {
  const [failed, setFailed] = useState(false);
  if (failed) return '—';
  return <img src={src} onError={() => setFailed(true)} style={{ maxHeight: '44px', maxWidth: '120px', objectFit: 'contain' }} />;
}
const FaithHeader = ({ s }) => (
  <div className="paper-header">
    <Logo />
    <div className="paper-program">MENTORING PROGRAM</div>
    <div className="paper-program">{LogsheetData.periodLabel(s)}</div>
  </div>
);
const SigRow = ({ mentorName, mentor, dateBlock = true }) => (
  <div className="paper-sig-row">
    <div className="paper-sig-block wide">
      <div className="paper-sig-fit"><MentorSig mentor={mentor} /><div className="paper-sig-value">{mentorName}</div></div>
      <div className="paper-sig-line"></div>
      <div className="paper-sig-label">Mentor's Signature over printed name</div>
    </div>
    {dateBlock ? <div className="paper-sig-block paper-date-block"><div className="paper-sig-line"></div><div className="paper-sig-label">DATE</div></div> : null}
  </div>
);

function ModalLogsheet({ s, mentor }) {
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const dateStr = fmtDateShort(s.sessionDate);
  const sessionLabel = isMakeupSession(s) ? (s.slotName ? `Make-Up: ${s.slotName}` : 'Make-Up') : (s.slotName || 'Session');
  const present = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);
  const blankCount = Math.max(0, (s.mentees || []).length - present.length);
  const hasProof = !!s.proofFilePath;
  return (
    <div className="paper-form">
      <FaithHeader s={s} />
      <div className="paper-form-title">MENTORING LOGSHEET</div>
      <div className="paper-session-label"><span className="paper-session-underline">{sessionLabel}</span> Session</div>
      <div className="paper-table-wrap">
        <table className="paper-table">
          <thead>
            <tr>
              <th style={{ width: '70px' }}>DATE</th><th style={{ width: '180px' }}>MENTEE'S NAME</th><th style={{ width: '85px' }}>TIME START</th>
              <th style={{ width: '85px' }}>TIME END</th><th style={{ width: '85px' }}>SIGNATURE</th><th>REMARKS</th>
            </tr>
          </thead>
          <tbody>
            {present.map((m, i) => {
              // A merged mentee carries their own source session's date and proof status.
              const mDateStr = m._attendedDate ? fmtDateShort(m._attendedDate) : dateStr;
              const mHasProof = m._hasProof !== undefined ? m._hasProof : hasProof;
              return (
                <tr key={i}>
                  <td>{mDateStr}</td>
                  <td>{m.menteeName}</td>
                  <td>{LogsheetData.time(m.scannedAt)}</td>
                  <td>{LogsheetData.time(m._attendedEndTime)}</td>
                  <td className="sig-cell">{(mHasProof && m.signatureFilePath) ? <MenteeSig src={CONFIG.getFileUrl(m.signatureFilePath)} /> : null}</td>
                  <td>{m.remarks || ''}</td>
                </tr>
              );
            })}
            {Array.from({ length: blankCount }, (_, i) => <tr key={`b${i}`}><td></td><td></td><td></td><td></td><td className="sig-cell"></td><td></td></tr>)}
          </tbody>
        </table>
      </div>
      <SigRow mentorName={mentorName} mentor={mentor} />
    </div>
  );
}

function ModalNotes({ s, mentor }) {
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const dateStr = fmtDateShort(s.sessionDate);
  const present = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);
  const absent = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === false);
  const entries = present.map((m, i) => {
    const mDateStr = m._attendedDate ? fmtDateShort(m._attendedDate) : dateStr;
    return (
      <div className="note-entry" key={`p${i}`}>
        <div className="note-entry-header">
          <div className="note-field"><strong>Mentee's Name:</strong> <span className="note-field-val">{m.menteeName}</span></div>
          <div className="note-field"><strong>Date of Mentoring:</strong> <span className="note-field-val">{mDateStr}</span></div>
        </div>
        {m.mentorNotes ? <><div className="note-line-pre">{m.mentorNotes}</div><div className="note-line"></div></> : <><div className="note-line"></div><div className="note-line"></div></>}
      </div>
    );
  });
  for (let i = 0; i < absent.length; i++) {
    entries.push(
      <div className="note-entry" key={`a${i}`}>
        <div className="note-entry-header">
          <div className="note-field"><strong>Mentee's Name:</strong> <span className="note-field-blank"></span></div>
          <div className="note-field"><strong>Date of Mentoring:</strong> <span className="note-field-blank"></span></div>
        </div>
        <div className="note-line"></div><div className="note-line"></div>
      </div>
    );
  }
  return (
    <div className="paper-form">
      <div className="guidance-copy-label">GUIDANCE COPY</div>
      <FaithHeader s={s} />
      <div className="paper-form-title">MENTOR'S NOTES</div>
      <div className="note-entries">{entries.length ? entries : <p style={{ textAlign: 'center', color: '#9ca3af', padding: '24px 0' }}>No mentees for this session.</p>}</div>
      <SigRow mentorName={mentorName} mentor={mentor} />
    </div>
  );
}

function ModalNonAttendance({ s, mentor, semLabel, guidanceOfficer }) {
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const dateStr = fmtDateShort(s.sessionDate);
  // Distinct from dateStr (the session's own date) — this is when it was submitted.
  const submittedDateStr = s.submittedAt ? fmtDateShort(s.submittedAt) : '—';
  const absent = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === false);
  const sessionLabel = isMakeupSession(s) ? (s.slotName ? `Make-Up Session: ${s.slotName}` : 'Make-Up Session') : (s.slotName || 'Session');
  return (
    <div className="paper-form">
      <div className="paper-header">
        <Logo />
        <div className="paper-program" style={{ fontWeight: 700 }}>MENTORING PROGRAM</div>
      </div>
      <div className="paper-form-title" style={{ textDecoration: 'none' }}>NON-ATTENDANCE OF MENTEES</div>
      <div className="paper-program-sub">{semLabel}</div>
      <div className="na-instruction">
        <p><strong>Dear Mentors,</strong></p>
        <p style={{ marginTop: '6px' }}>Kindly list down the name/s of those who did not attend your scheduled mentoring session.
        Please submit this form to {guidanceOfficer} at the Guidance Office. Thank you!</p>
      </div>
      <SigRow mentorName={mentorName} mentor={mentor} dateBlock={false} />
      <div className="paper-table-wrap">
        <table className="paper-table">
          <thead><tr><th style={{ width: '40%' }}>NAME</th><th style={{ width: '25%' }}>COURSE</th><th>REASON</th></tr></thead>
          <tbody>
            {absent.map((m, i) => <tr key={i}><td>{m.menteeName}</td><td>{m.sectionCode || ''}</td><td>{m.absenceReason || ''}</td></tr>)}
            {Array.from({ length: Math.max(0, 15 - absent.length) }, (_, i) => <tr key={`b${i}`}><td></td><td></td><td></td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="na-note">Please use another separate sheet if the space provided is not enough.</p>
      <p className="na-note">Thank you.</p>
      <div className="na-ack">
        <div className="na-ack-title">ACKNOWLEDGEMENT RECEIPT</div>
        <div className="na-ack-sub">MENTOR'S REPORT</div>
        <div className="na-ack-fields">
          <div className="na-ack-field"><span className="na-field-label">NAME OF MENTOR:</span><span className="ack-val">{mentorName}</span></div>
          <div className="na-ack-field"><span className="na-field-label">MENTORING SESSION:</span><span className="ack-val">{sessionLabel} — {dateStr}</span></div>
          <div className="na-ack-field"><span className="na-field-label">DATE SUBMITTED:</span><span className="ack-val">{submittedDateStr}</span></div>
          <div className="na-ack-field"><span className="na-field-label">RECEIVED BY:</span><span className="ack-val ack-blank"></span></div>
          <div className="na-ack-field"><span className="na-field-label">DATE RECEIVED:</span><span className="ack-val ack-blank"></span></div>
        </div>
      </div>
    </div>
  );
}

const clone = v => JSON.parse(JSON.stringify(v));

export default function MentorLogsheet() {
  useBackGuard();
  const currentUser = getSession()?.user;

  const [sysSettings, setSysSettings] = useState({ SchoolYear: '2026-2027', Semester: '1st Semester', GuidanceOfficer: 'Guidance Officer' });
  const [logData, setLogData] = useState(null);
  const [allSessions, setAllSessions] = useState(null);       // null loading, false failed
  const [calendar, setCalendar] = useState(null);
  const [progress, setProgress] = useState(null);
  const [progressSettled, setProgressSettled] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [printMenu, setPrintMenu] = useState(null);

  // preview modal
  const [previewId, setPreviewId] = useState(null);
  const [previewTab, setPreviewTab] = useState('logsheet');
  const [maxReached, setMaxReached] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [edits, setEdits] = useState({});                      // raw textarea text keyed by row+field
  const [saveStatus, setSaveStatus] = useState({ text: '', cls: '' });
  const [busy, setBusy] = useState(null);                      // 'draft' | 'upload' | 'unsubmit'
  const [uploadConfirm, setUploadConfirm] = useState(false);
  const [unsubmitConfirm, setUnsubmitConfirm] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);

  const sessionsRef = useRef(null);
  const previewIdRef = useRef(null);
  const snapshotRef = useRef(null);
  const requestRef = useRef(0);
  const settingsRef = useRef(sysSettings);
  const confirmResolve = useRef(null);
  const unsubmitResolve = useRef(null);
  const saveStatusTimer = useRef(null);
  sessionsRef.current = allSessions;
  previewIdRef.current = previewId;

  const sessions = Array.isArray(allSessions) ? allSessions : [];
  const sessionsLoaded = Array.isArray(allSessions);
  const logDisplayStatus = s => {
    // A logsheet merges rounds; any saved actual end keeps a finished checkpoint completed.
    const state = dashboardSessionState({ ...s, timeEnd: s.actualEnd ?? s.timeEnd }, calendar || []);
    return state === 'Upcoming' || state === 'Past Scheduled' ? 'Scheduled' : state;
  };

  // ── load ──
  async function loadSettings() {
    try {
      const data = await apiRequest('Settings', 'GET', null, true);
      if (data) { const next = { ...settingsRef.current, ...data }; settingsRef.current = next; setSysSettings(next); }
    } catch (e) { /* use defaults */ }
  }

  async function loadLogsheet() {
    const request = ++requestRef.current;
    apiRequest(`MonitorActivities/${currentUser.userID}`, 'GET', null, true).catch(() => null).then(p => {
      if (request !== requestRef.current) return;
      setProgress(p);
      setProgressSettled(true);
    });
    try {
      const [data, cal] = await Promise.all([
        apiRequest(`SessionsAdmin/${currentUser.userID}/logsheet`, 'GET', null, true),
        apiRequest('CalendarEvents', 'GET', null, true).catch(() => null),
      ]);
      setLogData(data);
      setCalendar(cal);
      const fresh = await LogsheetData.withReportStatuses(LogsheetData.merge(data?.sessions || []), currentUser.userID);
      if (request !== requestRef.current) return;

      // When the logsheet modal is open (e.g. the tab regained focus while the mentor was editing), preserve the
      // in-memory text fields for the session being viewed so unsaved edits are not overwritten.
      const pid = previewIdRef.current;
      if (pid) {
        const oldS = sessionsRef.current?.find(x => x.sessionID === pid);
        const newS = fresh.find(x => x.sessionID === pid);
        if (oldS?.mentees && newS?.mentees) {
          for (const newM of newS.mentees) {
            const oldM = oldS.mentees.find(x => x.menteeID === newM.menteeID);
            if (oldM && oldM.attendanceID === newM.attendanceID) {
              newM.remarks = oldM.remarks;
              newM.mentorNotes = oldM.mentorNotes;
              newM.absenceReason = oldM.absenceReason;
            }
          }
        }
      }
      sessionsRef.current = fresh;
      setAllSessions(fresh);
    } catch (e) {
      console.error('Logsheet load failed:', e);
      setAllSessions(false);
    }
  }

  useEffect(() => {
    (async () => { await loadSettings(); await loadLogsheet(); })();
    const onVis = () => { if (document.visibilityState === 'visible') loadSettings().then(loadLogsheet); };
    const onClick = () => setPrintMenu(null);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('visibilitychange', onVis); document.removeEventListener('click', onClick); };
  }, []);

  // ── stats ──
  const statsOn = progressSettled || sessionsLoaded;
  const completedP = Number(progress?.completedSessions ?? progress?.CompletedSessions);
  const totalRequired = Number(progress?.requiredSessions ?? progress?.RequiredSessions);
  const available = Number.isFinite(completedP) && Number.isFinite(totalRequired) && totalRequired > 0;
  const pct = available ? Math.min(100, Math.round(completedP / totalRequired * 100)) : 0;
  const scheduledN = sessions.filter(s => logDisplayStatus(s) === 'Scheduled' && !isMakeupSession(s)).length;
  const cancelledN = sessions.filter(s => s.sessionStatus === 'Cancelled' && !isMakeupSession(s)).length;
  const closedN = sessions.filter(s => logDisplayStatus(s) === 'Closed').length;
  const pulse = <span className="stat-pulse">—</span>;

  // ── remarks bar ──
  let remarksPill = null;
  if (sessionsLoaded) {
    const completed = sessions.filter(s => logDisplayStatus(s) === 'Completed');
    if (!completed.length) {
      remarksPill = <span className="log-remarks-pill log-remarks-pill--pending" id="logRemarksPill"><i className="ti ti-notes"></i> No completed sessions yet</span>;
    } else {
      // "Logged" = actually Submitted — matches the Logsheet button's own green/orange colour coding.
      const unlogged = completed.filter(s => s.logStatus !== 'Submitted').length;
      const toUpdate = completed.filter(s => s.logStatus === 'Submitted' && s.needsUpdate).length;
      const logged = completed.length - unlogged;
      if (unlogged > 0 || toUpdate > 0) {
        const parts = [];
        if (unlogged) parts.push(`${unlogged} session${unlogged !== 1 ? 's' : ''} not yet logged`);
        if (toUpdate) parts.push(`${toUpdate} need${toUpdate !== 1 ? '' : 's'} an update`);
        remarksPill = <span className="log-remarks-pill log-remarks-pill--pending" id="logRemarksPill"><i className="ti ti-notes"></i> {parts.join(' · ')}</span>;
      } else {
        remarksPill = <span className="log-remarks-pill log-remarks-pill--done" id="logRemarksPill"><i className="ti ti-circle-check-filled"></i> All {logged} session{logged !== 1 ? 's' : ''} logged</span>;
      }
    }
  }

  // ── filters ──
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
  const effPeriod = periods.some(p => p.key === periodFilter) ? periodFilter : '';

  function getFiltered() {
    const q = search.trim().toLowerCase();
    return sessions.filter(s => {
      if (effPeriod && `${s.schoolYear}|${s.semester}` !== effPeriod) return false;
      if (statusFilter === 'Makeup') {
        if (!isMakeupSession(s)) return false;
      } else if (statusFilter && logDisplayStatus(s) !== statusFilter) {
        return false;
      }
      if (q) {
        const dateStr = fmtDate(s.sessionDate).toLowerCase();
        const mentees = (s.mentees || []).map(m => m.menteeName.toLowerCase()).join(' ');
        if (!dateStr.includes(q) && !mentees.includes(q) && !(s.slotName || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  // ── print ──
  const mentor = logData?.mentor;
  const mentorNameStr = mentor ? `${mentor.firstName} ${mentor.lastName}` : '';
  const openPrint = (title, body) => openLogsheetPrintWindow(title, body, () => showToast('Pop-up blocked. Please allow pop-ups and try again.'));
  function exportOneSession(sessionId, formType = 'logsheet') {
    const session = sessions.find(s => s.sessionID === sessionId);
    if (!session) return;
    const semLabel = LogsheetData.periodLabel(session);
    const displayNum = isMakeupSession(session) ? (session.slotName ? `Make-Up: ${session.slotName}` : 'Make-Up') : (session.slotName || 'Session');
    const suffix = mentorNameStr ? ` (${mentorNameStr})` : '';
    if (formType === 'notes') openPrint(`Mentor's Notes — ${displayNum} Session${suffix}`, buildMentorNotesForm(session, mentor, semLabel));
    else if (formType === 'nonattend') openPrint(`Non-Attendance — ${displayNum} Session${suffix}`, buildNonAttendanceForm(session, mentor, semLabel, sysSettings.GuidanceOfficer));
    else openPrint(`Logsheet — ${displayNum} Session${suffix}`, buildPrintForm(session, mentor, semLabel));
  }
  function exportAllSessions(formType = 'logsheet') {
    const list = getFiltered();
    if (!list.length) { showToast('No sessions to print.'); return; }
    const suffix = mentorNameStr ? ` (${mentorNameStr})` : '';
    const L = s => LogsheetData.periodLabel(s);
    if (formType === 'all') {
      openPrint(`All Forms — All Sessions${suffix}`, list.map(s => buildPrintForm(s, mentor, L(s)) + buildMentorNotesForm(s, mentor, L(s)) + buildNonAttendanceForm(s, mentor, L(s), sysSettings.GuidanceOfficer)).join(''));
    } else if (formType === 'notes') {
      openPrint(`Mentor's Notes — All Sessions${suffix}`, list.map(s => buildMentorNotesForm(s, mentor, L(s))).join(''));
    } else if (formType === 'nonattend') {
      openPrint(`Non-Attendance — All Sessions${suffix}`, list.map(s => buildNonAttendanceForm(s, mentor, L(s), sysSettings.GuidanceOfficer)).join(''));
    } else {
      openPrint(`Mentoring Logsheet — All Sessions${suffix}`, list.map(s => buildPrintForm(s, mentor, L(s))).join(''));
    }
  }

  // ── preview modal ──
  const previewSession = previewId !== null ? sessions.find(s => s.sessionID === previewId) : null;

  function setSessionsBoth(next) { sessionsRef.current = next; setAllSessions(next); }
  function updateSession(sessionId, fn) {
    setSessionsBoth(sessionsRef.current.map(s => s.sessionID === sessionId ? fn(s) : s));
  }

  function openPreviewModal(sessionId) {
    const s = sessions.find(x => x.sessionID === sessionId);
    if (!s) return;
    snapshotRef.current = clone(s.mentees || []);
    setPreviewId(sessionId);
    setPreviewTab('logsheet');
    setDirty(false);
    setEdits({});
    setSaveStatus({ text: '', cls: '' });
    setBusy(null);
    // Already-submitted logsheets are read-only from here on, so free tab-browsing is fine; a fresh/draft one
    // starts locked to sheet 1.
    setMaxReached(isFinalSubmitted(s) ? PREVIEW_TAB_ORDER.length - 1 : 0);
  }

  function switchPreviewTab(tab, reached = maxReached) {
    // Ignore clicks on a sheet the mentor hasn't reached yet via Next.
    if (PREVIEW_TAB_ORDER.indexOf(tab) > reached) return;
    setEdits({});
    setPreviewTab(tab);
  }
  function goToNextPreviewTab() {
    const nextIdx = PREVIEW_TAB_ORDER.indexOf(previewTab) + 1;
    if (nextIdx >= PREVIEW_TAB_ORDER.length) return;
    const reached = Math.max(maxReached, nextIdx);
    setMaxReached(reached);
    switchPreviewTab(PREVIEW_TAB_ORDER[nextIdx], reached);
  }

  // A textarea edit: the mentee record keeps the trimmed text (or null), the box keeps what was typed.
  function editField(m, field, value) {
    const sid = previewId;
    const rowKey = m.attendanceID ? `a${m.attendanceID}` : `m${m.menteeID}`;
    setEdits(e => ({ ...e, [`${rowKey}:${field}`]: value }));
    setDirty(true);
    updateSession(sid, s => ({
      ...s,
      mentees: (s.mentees || []).map(x => (m.attendanceID ? String(x.attendanceID) === String(m.attendanceID) : x.menteeID === m.menteeID) ? { ...x, [field]: value.trim() || null } : x),
    }));
  }

  // ── save remarks (internal) ──
  async function performSaveRemarks() {
    const sid = previewIdRef.current;
    const session = sessionsRef.current.find(x => x.sessionID === sid);
    if (!session) return;
    const mentees = clone(session.mentees || []);
    const sourceFor = m => m._sourceSessionID || session._sourceSessionID || sid;

    // Phase 1: For mentees who have data but no Attendance record yet, create one.
    for (const m of mentees) {
      if (m.attendanceID) continue;
      if (!m.remarks && !m.mentorNotes && !m.absenceReason) continue;
      try {
        const created = await apiRequest('Attendance', 'POST', {
          SessionID:     sourceFor(m),
          MenteeID:      m.menteeID,
          // Notes never establish presence, including for makeup sessions.
          IsPresent:     false,
          ScannedAt:     null,
          Remarks:       null,
          MentorNotes:   null,
          AbsenceReason: null,
        }, true);
        if (created?.attendanceID) m.attendanceID = created.attendanceID;
      } catch (e) {
        console.warn(`Could not create attendance record for mentee ${m.menteeID}:`, e);
      }
    }
    // Phase 2: one atomic PATCH per mentee — updates all three text columns in a single SQL statement.
    const saves = [];
    for (const m of mentees) {
      if (!m.attendanceID) continue;
      saves.push(apiRequest(`Attendance/${m.attendanceID}/text-fields`, 'PATCH', {
        remarks:       m.remarks       || null,
        mentorNotes:   m.mentorNotes   || null,
        absenceReason: m.absenceReason || null,
      }, true));
    }
    await Promise.all(saves);
    updateSession(sid, s => ({ ...s, mentees }));
  }

  function flashStatus(text, cls, clearAfter) {
    clearTimeout(saveStatusTimer.current);
    setSaveStatus({ text, cls });
    if (clearAfter) saveStatusTimer.current = setTimeout(() => setSaveStatus({ text: '', cls: '' }), clearAfter);
  }

  async function saveDraft() {
    setBusy('draft');
    setSaveStatus({ text: '', cls: '' });
    try {
      await performSaveRemarks();
      const s = sessionsRef.current.find(x => x.sessionID === previewIdRef.current);
      await apiRequest(`Sessions/${s._sourceSessionID || previewIdRef.current}/log-status`, 'PATCH', { logStatus: 'Draft', sectionCode: s.sessionSectionCode, courseSchool: s.courseSchool }, true);
      updateSession(previewIdRef.current, x => ({ ...x, logStatus: 'Draft' }));
      setDirty(false);
      snapshotRef.current = clone(sessionsRef.current.find(x => x.sessionID === previewIdRef.current)?.mentees || []);
      flashStatus('Draft saved', 'ok', 3000);
      setBusy(null);
      return true;
    } catch (e) {
      console.error('Save draft failed:', e);
      flashStatus('Failed to save draft', 'error');
      setBusy(null);
      return false;
    }
  }

  const showUnsubmitConfirmModal = () => { setUnsubmitConfirm(true); return new Promise(r => { unsubmitResolve.current = r; }); };
  const ucmUnsubmitResolve = ok => { setUnsubmitConfirm(false); unsubmitResolve.current?.(ok); unsubmitResolve.current = null; };
  const showUploadConfirmModal = () => { setUploadConfirm(true); return new Promise(r => { confirmResolve.current = r; }); };
  const ucmResolve = ok => { setUploadConfirm(false); confirmResolve.current?.(ok); confirmResolve.current = null; };

  // One button, two actions — Upload Logsheet becomes Unsubmit once a session is already Submitted.
  function handleLogsheetSubmitToggle() {
    const s = previewSession;
    if (!s) return;
    if (isFinalSubmitted(s)) unsubmitLogsheet();
    else uploadLogsheet();
  }

  // Reverts LogStatus back to Draft so a mentor can correct a mistake and resubmit later.
  async function unsubmitLogsheet() {
    const s = previewSession;
    if (!s) return;
    const confirmed = await showUnsubmitConfirmModal();
    if (!confirmed) return;
    setBusy('unsubmit');
    setSaveStatus({ text: '', cls: '' });
    try {
      await apiRequest(`Sessions/${s._sourceSessionID || previewId}/log-status`, 'PATCH', { logStatus: 'Draft', sectionCode: s.sessionSectionCode, courseSchool: s.courseSchool }, true);
      updateSession(previewId, x => ({ ...x, logStatus: 'Draft' }));
      setMaxReached(0);
      switchPreviewTab('logsheet', 0);
    } catch (e) {
      console.error('Unsubmit failed:', e);
      flashStatus('Failed to unsubmit', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function uploadLogsheet() {
    const s = previewSession;
    if (!s) return;
    const confirmed = await showUploadConfirmModal();
    if (!confirmed) return;
    setBusy('upload');
    setSaveStatus({ text: '', cls: '' });
    try {
      await performSaveRemarks();
      await apiRequest(`Sessions/${s._sourceSessionID || previewId}/log-status`, 'PATCH', { logStatus: 'Submitted', sectionCode: s.sessionSectionCode, courseSchool: s.courseSchool }, true);
      updateSession(previewId, x => { const n = { ...x, logStatus: 'Submitted', needsUpdate: false }; delete n.reportStatus; return n; });
      setDirty(false);
      snapshotRef.current = clone(sessionsRef.current.find(x => x.sessionID === previewIdRef.current)?.mentees || []);
      setMaxReached(PREVIEW_TAB_ORDER.length - 1);
      await loadLogsheet();
      setBusy(null);
    } catch (e) {
      console.error('Upload failed:', e);
      flashStatus(e.message || 'Upload failed', 'error');
      setBusy(null);
    }
  }

  // Closing (X button or backdrop click) is gated behind an unsaved-changes check.
  function requestClosePreviewModal() {
    if (dirty) setUnsavedOpen(true);
    else setPreviewId(null);
  }
  function discardAndClosePreview() {
    const sid = previewId;
    if (snapshotRef.current) updateSession(sid, s => ({ ...s, mentees: clone(snapshotRef.current) }));
    setDirty(false);
    setUnsavedOpen(false);
    setPreviewId(null);
  }
  async function saveDraftAndClosePreview() {
    setUnsavedOpen(false);
    // a failed save leaves the modal open (with its own "Failed to save draft" message)
    if (await saveDraft()) setPreviewId(null);
  }

  // ── remarks form (left panel) ──
  function remarksForm() {
    const s = previewSession;
    if (!s) return { heading: 'Attendance & Remarks', body: null };
    const mentees = s.mentees || [];
    const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);
    const absent = mentees.filter(m => LogsheetData.attendanceState(m) === false);
    const pending = mentees.filter(m => !m.attendanceRecorded || m.attendanceUnverified);
    const areaFor = (m, field, placeholder) => {
      const rowKey = m.attendanceID ? `a${m.attendanceID}` : `m${m.menteeID}`;
      const k = `${rowKey}:${field}`;
      return <textarea className="lrm-textarea" placeholder={placeholder} value={edits[k] ?? (m[field] || '')} onChange={e => editField(m, field, e.target.value)}></textarea>;
    };
    const row = (m, cls, label, field, placeholder, i) => (
      <div className="lrm-mentee-row" key={`${cls}${i}`}>
        <div className="lrm-mentee-info">
          <div className={`lrm-avatar ${cls}`}>{initials(m.menteeName)}</div>
          <div className="lrm-mentee-text">
            <div className="lrm-mentee-name">{m.menteeName}</div>
            <div className="lrm-mentee-sec">{m.sectionCode || '—'}{m.isDropOut ? <span className="lrm-dropout-chip">Drop Out</span> : null}</div>
          </div>
          <span className={`lrm-status-dot ${cls}`}>{label}</span>
        </div>
        {areaFor(m, field, placeholder)}
      </div>
    );
    let body = [];
    let heading = 'Attendance & Remarks';
    if (previewTab === 'logsheet' || previewTab === 'notes') {
      const field = previewTab === 'logsheet' ? 'remarks' : 'mentorNotes';
      heading = previewTab === 'logsheet' ? 'Logsheet Remarks' : "Mentor's Notes";
      if (present.length) {
        body.push(<div className="lrm-section-label" key="lbl">Present ({present.length})</div>);
        present.forEach((m, i) => body.push(row(m, 'present', 'Present', field, previewTab === 'logsheet' ? 'Remarks…' : 'Notes…', i)));
      } else body = [<div className="lrm-no-att" key="none">No present mentees for this session.</div>];
      // Keep historical notes editable without including unsupported presence in forms.
      mentees.filter(m => m.attendanceUnverified).forEach((m, i) => body.push(
        <div className="lrm-mentee-row" key={`u${i}`}>
          <div className="lrm-mentee-name">{m.menteeName} — Unverified</div>
          {areaFor(m, field, undefined)}
        </div>
      ));
    } else {
      heading = 'Absence Reasons';
      if (absent.length || pending.length) {
        body.push(<div className="lrm-section-label lrm-absent-label" key="lbl">Absent ({absent.length})</div>);
        absent.forEach((m, i) => body.push(row(m, 'absent', 'Absent', 'absenceReason', 'Reason for absence…', i)));
        if (pending.length) {
          body.push(<div className="lrm-section-label" key="plbl">Unverified / not recorded ({pending.length})</div>);
          pending.forEach((m, i) => body.push(
            <div className="lrm-mentee-row" key={`p${i}`}>
              <div className="lrm-mentee-info">
                <div className="lrm-avatar">{initials(m.menteeName)}</div>
                <div className="lrm-mentee-text">
                  <div className="lrm-mentee-name">{m.menteeName}</div>
                  <div className="lrm-mentee-sec">{m.sectionCode || '—'}</div>
                </div>
                <span className="lrm-status-dot">{m.attendanceUnverified ? 'Unverified' : 'Not recorded'}</span>
              </div>
            </div>
          ));
        }
      } else body = [<div className="lrm-no-att" key="none">No recorded absences for this session.</div>];
    }
    return { heading, body };
  }

  // ── cards ──
  function renderCard(s, hideSection) {
    const timeStart = LogsheetData.time(s.actualStart);
    const timeEnd = LogsheetData.time(s.actualEnd);
    const timeStr = (timeStart && timeEnd) ? `${timeStart} – ${timeEnd}` : timeStart ? `from ${timeStart}` : timeEnd ? `ended ${timeEnd}` : '—';
    const presentList = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);
    const present = presentList.length;
    const total = (s.mentees || []).length;
    const attStr = total > 0 ? `${present}/${total} present` : 'No attendance yet';
    const displayStatus = logDisplayStatus(s);
    const reportStatus = s.slotName ? LogsheetData.reportStatus(s, calendar) : '';
    const reportBadgeCls = reportStatus === 'Pending' ? 'report-pending' : reportStatus === 'Submitted Late' ? 'report-late' : '';
    const badgeCls = displayStatus === 'Closed' ? 'badge-closed' : statusBadgeClass(displayStatus === 'In Progress' ? 'Scheduled' : displayStatus);
    const cardCls = `status-${(displayStatus === 'In Progress' ? 'Scheduled' : displayStatus || '').toLowerCase()}`;
    const isCancelled = s.sessionStatus === 'Cancelled';
    const logBtnCls = s.needsUpdate
      ? 'btn-view-logsheet btn-view--pending'
      : s.logStatus === 'Submitted'
        ? 'btn-view-logsheet btn-view--done'
        : (isCancelled || s.sessionStatus === 'Scheduled')
          ? 'btn-view-logsheet btn-view--gray'
          // Completed but not yet submitted — same orange language as the "not yet logged" pill.
          : s.sessionStatus === 'Completed' ? 'btn-view-logsheet btn-view--pending' : 'btn-view-logsheet';
    const isMakeup = isMakeupSession(s);
    const slotList = slotsForSemester(s.semester || sysSettings.Semester);
    const slotIndex = slotList.indexOf(s.slotName);
    const numTotal = slotIndex >= 0 ? <div className="log-card-num-total">{slotIndex + 1} of {slotList.length}</div> : null;
    const sections = (() => {
      if (s.sections) return s.sections.split(',').map(x => x.trim()).filter(Boolean);
      if (s.sessionSectionCode) return [s.sessionSectionCode];
      return [...new Set((s.mentees || []).map(m => m.sectionCode).filter(Boolean))].sort();
    })();
    const sid = s.sessionID;
    const menuOpen = printMenu === sid;

    return (
      <div className={`log-session-card ${cardCls}`} key={sid}>
        <div className={`log-card-header${isCancelled ? ' no-interact' : ''}`}>
          {isMakeup
            ? <div className="log-card-num log-card-num-makeup">
                <div className="log-card-num-label">Make-up</div>
                <div className="log-card-num-val-sm">{s.slotName || 'Session'}</div>
                {numTotal}
              </div>
            : <div className="log-card-num">
                <div className="log-card-num-label">Session</div>
                <div className="log-card-num-val log-card-num-val--slot">{s.slotName || 'Session'}</div>
                {numTotal}
              </div>}
          <div className="log-card-info">
            <div className="log-card-date">{fmtDate(s.sessionDate)}</div>
            <div className="log-card-meta">
              <span className="log-card-meta-item"><i className="ti ti-calendar-week"></i>{fmtDayOfWeek(s.sessionDate)}</span>
              <span className="log-card-meta-item"><i className="ti ti-clock"></i>{timeStr}</span>
              <span className="log-card-meta-item"><i className="ti ti-users"></i>{attStr}</span>
              {s.roundDates?.length > 1
                ? <span className="log-card-meta-item" title={s.roundDates.map(d => fmtDateShort(d)).join(', ')}><i className="ti ti-repeat"></i>{s.roundDates.length} sessions conducted</span>
                : null}
            </div>
            {!hideSection && sections.length ? <div className="log-section-tags">{sections.map(sec => <span className="log-section-tag" key={sec}>{sec}</span>)}</div> : null}
            <div className="log-card-statuses">
              {s.slotName ? <span className={`status-badge ${reportBadgeCls}`}>{reportStatus}</span> : null}
              <span className={`status-badge ${badgeCls}`}>{displayStatus}</span>
              {s.sessionStatus === 'Completed' && !(s._anyProof !== undefined ? s._anyProof : s.proofFilePath)
                ? <span className="log-proof-flag" title="No proof photo uploaded yet"><i className="ti ti-photo-off"></i></span>
                : null}
            </div>
          </div>
          <div className="log-card-actions">
            <button className={logBtnCls} onClick={e => { e.stopPropagation(); openPreviewModal(sid); }}>
              <i className="ti ti-notes"></i> Logsheet
            </button>
            <div className="print-btn-group" onClick={e => e.stopPropagation()}>
              <button className="btn-print-main" onClick={() => exportOneSession(sid, 'logsheet')}>
                <i className="ti ti-printer"></i> Print
              </button>
              <button className="btn-print-caret" onClick={() => setPrintMenu(menuOpen ? null : sid)}>
                <i className="ti ti-chevron-down"></i>
              </button>
              <div className={`print-dropdown${menuOpen ? ' open' : ''}`} id={`printMenu-${sid}`}>
                <button className="print-drop-item" onClick={() => { exportOneSession(sid, 'logsheet'); setPrintMenu(null); }}><i className="ti ti-clipboard-list"></i> Logsheet</button>
                <button className="print-drop-item" onClick={() => { exportOneSession(sid, 'notes'); setPrintMenu(null); }}><i className="ti ti-notes"></i> Mentor's Notes</button>
                <button className="print-drop-item" onClick={() => { exportOneSession(sid, 'nonattend'); setPrintMenu(null); }}><i className="ti ti-user-x"></i> Non-Attendance</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderCards() {
    if (allSessions === null) return <div className="log-loading"><i className="ti ti-loader"></i> Loading sessions…</div>;
    if (allSessions === false) return <div className="log-loading">Failed to load logsheet. Please refresh.</div>;
    const list = getFiltered();
    const status = statusFilter;

    // Makeup Sessions filter: show only the makeup section (placeholder if empty)
    if (status === 'Makeup') {
      if (!list.length) {
        return (
          <div className="log-section-group log-makeup-empty-group">
            <div className="log-section-group-header">
              <div className="log-section-group-label"><i className="ti ti-calendar-clock"></i> Makeup Sessions</div>
            </div>
            <div className="log-makeup-placeholder">
              <i className="ti ti-calendar-plus"></i>
              <p>Make-up attendance appears under its checkpoint. Only sessions without a checkpoint or section appear here.</p>
            </div>
          </div>
        );
      }
      const completed = list.filter(s => logDisplayStatus(s) === 'Completed').length;
      return (
        <div className="log-section-group">
          <div className="log-section-group-header">
            <div className="log-section-group-label"><i className="ti ti-calendar-clock"></i> Makeup Sessions</div>
            <div className="log-section-group-progress"><span className="log-section-progress-text">{completed} completed</span></div>
          </div>
          <div className="log-section-cards">{list.map(s => renderCard(s, true))}</div>
        </div>
      );
    }

    if (!list.length) {
      if (sessions.length === 0) {
        return (
          <div className="log-empty">
            <i className="ti ti-clipboard-off"></i>
            <p>No sessions on record yet.</p>
            <Link to="/mentor/sessions">Go to Sessions to log one →</Link>
          </div>
        );
      }
      const statusLabel = status === 'Completed' ? 'Completed' : status === 'Scheduled' ? 'Scheduled' : status === 'Cancelled' ? 'Cancelled' : '';
      return (
        <div className="log-section-group log-makeup-empty-group">
          <div className="log-section-group-header">
            <div className="log-section-group-label"><i className="ti ti-filter"></i> {statusLabel} Sessions</div>
          </div>
          <div className="log-makeup-placeholder">
            <i className="ti ti-filter-off"></i>
            <p>No {statusLabel.toLowerCase()} sessions found.</p>
          </div>
        </div>
      );
    }

    // Group by section; '' key = makeup/individual sessions. Multi-section sessions are added to EACH section group.
    const groups = {};
    const sectionOrder = [];
    for (const s of list) {
      // Makeup sessions always stay in the '' (makeup) group — never mix with regular sections.
      if (isMakeupSession(s)) {
        if (!groups['']) { groups[''] = []; sectionOrder.push(''); }
        groups[''].push(s);
        continue;
      }
      const secStr = s.sections || s.sessionSectionCode || '';
      if (!secStr) {
        if (!groups['']) { groups[''] = []; sectionOrder.push(''); }
        groups[''].push(s);
      } else {
        const secs = secStr.split(',').map(x => x.trim()).filter(Boolean);
        for (const sec of secs) {
          if (!groups[sec]) { groups[sec] = []; sectionOrder.push(sec); }
          groups[sec].push(s);
        }
      }
    }
    const realSections = sectionOrder.filter(s => s !== '');
    const makeupSessions = groups[''] || [];
    // Always show section headers when a status filter is active
    const multiSection = realSections.length > 1 || !!status;

    const out = [];
    if (realSections.length === 0) {
      // All sessions are makeup — nothing in real section bands
    } else if (!multiSection) {
      out.push(<div className="log-section-cards log-section-cards--ungrouped" key="only">{groups[realSections[0]].map(s => renderCard(s, false))}</div>);
    } else {
      realSections.forEach(sec => {
        const secSessions = groups[sec];
        const completed = secSessions.filter(s => logDisplayStatus(s) === 'Completed').length;
        out.push(
          <div className="log-section-group" key={sec}>
            <div className="log-section-group-header">
              <div className="log-section-group-label"><i className="ti ti-users-group"></i> {sec}</div>
              <div className="log-section-group-progress"><span className="log-section-progress-text">{completed} checkpoints completed</span></div>
            </div>
            <div className="log-section-cards">{secSessions.map(s => renderCard(s, true))}</div>
          </div>
        );
      });
    }
    // Makeup Sessions section only shown when viewing All AND there's a standalone makeup session to show.
    if (!status && makeupSessions.length > 0) {
      const completed = makeupSessions.filter(s => logDisplayStatus(s) === 'Completed').length;
      out.push(
        <div className="log-section-group" key="makeup">
          <div className="log-section-group-header">
            <div className="log-section-group-label"><i className="ti ti-calendar-clock"></i> Makeup Sessions</div>
            <div className="log-section-group-progress"><span className="log-section-progress-text">{completed} completed</span></div>
          </div>
          <div className="log-section-cards">{makeupSessions.map(s => renderCard(s, true))}</div>
        </div>
      );
    }
    return out;
  }

  // ── modal header / buttons ──
  let lpmTitle = '', lpmSub = '';
  if (previewSession) {
    const s = previewSession;
    lpmTitle = isMakeupSession(s) ? (s.slotName ? `Make-up Session: ${s.slotName}` : 'Make-up Session') : (s.slotName || 'Session');
    const topic = (s.topic || '').replace(/^\[[^\]]+\]\s*/, '') || 'Mentoring Session';
    lpmSub = `${fmtDateShort(s.sessionDate)} · ${LogsheetData.time(s.actualStart) || '—'} – ${LogsheetData.time(s.actualEnd) || '—'} · ${topic}`;
  }
  const submitted = previewSession?.logStatus === 'Submitted';
  const needsUpdate = !!previewSession?.needsUpdate;
  const finalSubmitted = isFinalSubmitted(previewSession);
  const isLastTab = previewTab === PREVIEW_TAB_ORDER[PREVIEW_TAB_ORDER.length - 1];
  const nextTab = PREVIEW_TAB_ORDER[PREVIEW_TAB_ORDER.indexOf(previewTab) + 1];
  const badgeText = submitted && needsUpdate ? 'Needs Update — review new attendance and resubmit' : '';
  const draftHidden = submitted && !needsUpdate;
  let uploadContent, uploadCls = 'lpm-btn-upload';
  if (busy === 'upload') uploadContent = 'Uploading…';
  else if (busy === 'unsubmit') uploadContent = 'Unsubmitting…';
  else if (submitted && needsUpdate) uploadContent = 'Resubmit Logsheet';
  else if (submitted) { uploadContent = <><i className="ti ti-arrow-back-up"></i> Unsubmit</>; uploadCls = 'lpm-btn-upload lpm-btn-upload-unsubmit'; }
  else uploadContent = 'Upload Logsheet';

  const form = remarksForm();
  const semLabel = previewSession ? LogsheetData.periodLabel(previewSession) : '';

  return (
    <Page id="MENTOR/logsheet">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Mentoring Logsheet</h1>
              <p id="logsheetSubtitle">{sessionsLoaded ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} on record` : 'Loading…'}</p>
            </div>
            <div className="print-btn-group" onClick={e => e.stopPropagation()}>
              <button className="btn-export-main" onClick={() => exportAllSessions('all')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                Print All
              </button>
              <button className="btn-export-caret" onClick={() => setPrintMenu(printMenu === 'all' ? null : 'all')}>
                <i className="ti ti-chevron-down"></i>
              </button>
              <div className={`print-dropdown${printMenu === 'all' ? ' open' : ''}`} id="printMenu-all">
                <button className="print-drop-item" onClick={() => { exportAllSessions('all'); setPrintMenu(null); }}><i className="ti ti-files"></i> All Forms</button>
                <button className="print-drop-item" onClick={() => { exportAllSessions('logsheet'); setPrintMenu(null); }}><i className="ti ti-clipboard-list"></i> Logsheet</button>
                <button className="print-drop-item" onClick={() => { exportAllSessions('notes'); setPrintMenu(null); }}><i className="ti ti-notes"></i> Mentor's Notes</button>
                <button className="print-drop-item" onClick={() => { exportAllSessions('nonattend'); setPrintMenu(null); }}><i className="ti ti-user-x"></i> Non-Attendance</button>
              </div>
            </div>
          </div>

          <div className="log-info-banner">
            <i className="ti ti-info-circle"></i>
            <span>This logsheet is auto-generated from your <strong>Sessions</strong> records — attendance, time, and mentees are pulled automatically. To log a new session, go to <Link to="/mentor/sessions">Sessions</Link>.</span>
          </div>

          <div className="log-stats-strip">
            <div className="lstat lstat-progress">
              <div className="lstat-progress-top">
                <div className="lstat-val green" id="lStatCompleted">{statsOn ? (available ? completedP : '—') : pulse}</div>
                <div className="lstat-progress-req" id="lStatRequired">{statsOn ? (available ? `of ${totalRequired} required` : 'Progress unavailable') : 'Loading target...'}</div>
              </div>
              <div className="lstat-progress-bar">
                <div className="lstat-progress-fill" id="lStatProgressFill" style={{ width: `${statsOn ? pct : 0}%` }}></div>
              </div>
              <div className="lstat-lbl">Checkpoints Completed This Semester <details className="lstat-help"><summary aria-label="About checkpoints completed this semester"><i className="ti ti-info-circle" aria-hidden="true"></i></summary><div className="lstat-help-text"><div className="lstat-help-title">Semester Progress</div>Checkpoint progress is for the current semester.</div></details></div>
            </div>
            <div className="lstat">
              <div className="lstat-val" id="lStatTotal">{statsOn ? sessions.length : pulse}</div>
              <div className="lstat-lbl">Total Sessions on Record <details className="lstat-help"><summary aria-label="About total sessions on record"><i className="ti ti-info-circle" aria-hidden="true"></i></summary><div className="lstat-help-text"><div className="lstat-help-title">Session Records</div>Session totals include all records across school years and semesters.</div></details></div>
            </div>
            <div className="lstat">
              <div className="lstat-val blue" id="lStatScheduled">{statsOn ? scheduledN : pulse}</div>
              <div className="lstat-lbl">Scheduled</div>
            </div>
            <div className="lstat"><div className="lstat-val gray" id="lStatClosed">{statsOn ? closedN : '—'}</div><div className="lstat-lbl">Closed (not conducted) <details className="lstat-help"><summary aria-label="About closed (not conducted)"><i className="ti ti-info-circle" aria-hidden="true"></i></summary><div className="lstat-help-text"><div className="lstat-help-title">Closed Sessions</div>Closed means the session was not conducted before its calendar deadline.</div></details></div></div>
            <div className="lstat">
              <div className="lstat-val gray" id="lStatCancelled">{statsOn ? cancelledN : pulse}</div>
              <div className="lstat-lbl">Cancelled</div>
            </div>
          </div>

          {/* Remarks completion indicator */}
          <div className="log-remarks-bar" id="logRemarksBar" style={{ display: sessionsLoaded ? 'flex' : 'none' }}>
            {remarksPill}
            <div className="log-remarks-info-wrap">
              <span className="log-remarks-info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              </span>
              <div className="log-remarks-tooltip">
                <strong>Logsheet status</strong><br />
                A session counts as <em>not yet logged</em> until you click <em>Upload Logsheet</em> inside it — that's when it's marked Submitted and visible to Admin.<br /><br />
                The <em>Logsheet</em> button turns green once submitted, orange while a Completed session is still waiting to be submitted.
              </div>
            </div>
          </div>

          <div className="log-toolbar">
            <div className="search-wrap">
              <i className="ti ti-search"></i>
              <input type="text" id="logSearch" placeholder="Search sessions…" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select className="log-filter" id="logStatusFilter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Closed">Closed (not conducted)</option>
            </Select>
            <Select className="log-filter" id="logPeriodFilter" value={effPeriod} onChange={e => setPeriodFilter(e.target.value)}>
              <option value="">All School Years</option>
              {periods.map(p => <option key={p.key} value={p.key}>{p.semester}, SY {p.schoolYear}</option>)}
            </Select>
          </div>

          <div id="logCards" className="log-cards">{renderCards()}</div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Logsheet Preview Modal */}
      <Overlay open={previewId !== null && !!previewSession} className="lpm-overlay" activeClass={null} display="flex" id="logsheetPreviewOverlay"
        onClick={e => { if (e.target === e.currentTarget) requestClosePreviewModal(); }}>
        <div className="lpm-modal lpm-modal-wide">
          <div className="lpm-header">
            <div>
              <div className="lpm-title" id="lpmTitle">{lpmTitle}</div>
              <div className="lpm-sub" id="lpmSub">{lpmSub}</div>
            </div>
            <div className="lpm-header-right">
              <button className="lpm-close-btn" onClick={requestClosePreviewModal}>×</button>
            </div>
          </div>
          <div className="lpm-split-body">
            <div className="lpm-left-panel">
              <div className="lpm-panel-heading" id="lpmPanelHeading">{form.heading}</div>
              <div className="lpm-remarks-list" id="lpmRemarksForm">{form.body}</div>
              <div className="lpm-left-footer">
                <div className="lpm-footer-top">
                  <span className="lpm-log-status-badge" id="lpmLogStatusBadge">{badgeText}</span>
                  <span className={`lpm-save-status${saveStatus.cls ? ' ' + saveStatus.cls : ''}`} id="lpmSaveStatus">{saveStatus.text}</span>
                </div>
                <div className="lpm-footer-btns">
                  <button className="lpm-btn-draft" id="lpmDraftBtn" onClick={saveDraft} disabled={busy === 'draft'} style={{ display: draftHidden ? 'none' : '' }}>
                    {busy === 'draft' ? 'Saving…' : 'Save Draft'}
                  </button>
                  <button className="lpm-btn-next" id="lpmNextBtn" onClick={goToNextPreviewTab} style={{ display: (!finalSubmitted && !isLastTab) ? '' : 'none' }}>
                    Next: {nextTab ? PREVIEW_TAB_LABELS[nextTab] : ''} <i className="ti ti-arrow-right"></i>
                  </button>
                  <button className={uploadCls} id="lpmUploadBtn" onClick={handleLogsheetSubmitToggle} disabled={!!busy && busy !== 'draft'} style={{ display: (finalSubmitted || isLastTab) ? '' : 'none' }}>
                    {uploadContent}
                  </button>
                </div>
              </div>
            </div>
            <div className="lpm-right-panel">
              <div className="lpm-preview-tabs">
                {PREVIEW_TAB_ORDER.map(t => (
                  <button key={t} className={`lpm-ptab${previewTab === t ? ' active' : ''}${PREVIEW_TAB_ORDER.indexOf(t) > maxReached ? ' lpm-ptab-locked' : ''}`}
                    data-tab={t} onClick={() => switchPreviewTab(t)}>{PREVIEW_TAB_LABELS[t]}</button>
                ))}
              </div>
              <div className="lpm-preview-scroll">
                <div className="lpm-body" id="lpmContent">
                  {previewSession ? (
                    previewTab === 'logsheet' ? <ModalLogsheet s={previewSession} mentor={mentor} />
                    : previewTab === 'notes' ? <ModalNotes s={previewSession} mentor={mentor} />
                    : <ModalNonAttendance s={previewSession} mentor={mentor} semLabel={semLabel} guidanceOfficer={sysSettings.GuidanceOfficer} />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Overlay>

      {/* Upload Confirmation Modal */}
      <Overlay open={uploadConfirm} className="modal-overlay" activeClass="open" id="uploadConfirmOverlay"
        onClick={e => { if (e.target === e.currentTarget) ucmResolve(false); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-primary"><i className="ti ti-upload"></i></div>
          <h3 className="confirm-title">Upload Logsheet for Review?</h3>
          <p className="confirm-body">This marks it <strong>Submitted</strong> and visible to the Admin.</p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => ucmResolve(false)}>Cancel</button>
            <button className="btn-confirm-primary" id="confirmUploadBtn" onClick={() => ucmResolve(true)}><i className="ti ti-upload"></i> Upload Logsheet</button>
          </div>
        </div>
      </Overlay>

      {/* Unsubmit Confirmation Modal */}
      <Overlay open={unsubmitConfirm} className="modal-overlay" activeClass="open" id="unsubmitConfirmOverlay"
        onClick={e => { if (e.target === e.currentTarget) ucmUnsubmitResolve(false); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-warn"><i className="ti ti-arrow-back-up"></i></div>
          <h3 className="confirm-title">Unsubmit this Logsheet?</h3>
          <p className="confirm-body">This will revert the logsheet to <strong>Draft</strong> and hide it from Admin until you resubmit.</p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => ucmUnsubmitResolve(false)}>Cancel</button>
            <button className="btn-confirm-warn" id="confirmUnsubmitBtn" onClick={() => ucmUnsubmitResolve(true)}><i className="ti ti-arrow-back-up"></i> Unsubmit</button>
          </div>
        </div>
      </Overlay>

      {/* Unsaved Changes Confirmation Modal */}
      <Overlay open={unsavedOpen} className="modal-overlay" activeClass="open" id="unsavedChangesOverlay"
        onClick={e => { if (e.target === e.currentTarget) setUnsavedOpen(false); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-warn"><i className="ti ti-alert-triangle"></i></div>
          <h3 className="confirm-title">Unsaved Changes</h3>
          <p className="confirm-body">You have unsaved remarks — save them as a draft or discard them.</p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={discardAndClosePreview}>Discard &amp; Close</button>
            <button className="btn-confirm-primary" id="confirmSaveDraftBtn" onClick={saveDraftAndClosePreview}><i className="ti ti-device-floppy"></i> Save Draft</button>
          </div>
        </div>
      </Overlay>
    </Page>
  );
}
