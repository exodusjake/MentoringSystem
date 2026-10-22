import { Fragment, useEffect, useReducer, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Empty from '../../components/Empty.jsx';
import { showToast } from '../../components/Notify.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { dashboardSessionState } from '../../lib/dashboard-sessions.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { buildMentorNotesForm, buildNonAttendanceForm, buildPrintForm, openPrintWindow } from '../../lib/mentorLogsheetPrint.js';
import { getSession } from '../../lib/session.js';
import { useStayOnBack } from './useStayOnBack.js';

// Mentoring Logsheet (MENTOR/HTML/logsheet.html + logsheet.js): one card per checkpoint (rounds and
// checkpoint-tagged make-ups merged), the remarks/notes/absence-reasons editor with live paper
// previews, Draft / Upload / Unsubmit, and printing.

// Mirrors the backend's Constants/MentoringSlots.cs.
const MENTORING_SLOTS = ['Mentoring Assembly', 'Before Prelims', 'After Prelims', 'Before Midterms', 'After Midterms', 'Before Finals'];
const slotsForSemester = semester => semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;
const TAB_ORDER = ['logsheet', 'notes', 'nonattend'];
const TAB_LABELS = { logsheet: 'Logsheet', notes: "Mentor's Notes", nonattend: 'Non-Attendance' };

const isMakeupSession = s => !!s.isMakeup;
// Submitted and up to date (a submitted logsheet that gained attendance later needs a resubmit).
const isFinalSubmitted = s => s?.logStatus === 'Submitted' && !s?.needsUpdate;
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}
const fmtDayOfWeek = iso => iso ? new Date(iso).toLocaleDateString('en-PH', { weekday: 'long' }) : '';
function statusBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'completed': return 'completed';
    case 'scheduled': return 'scheduled';
    case 'cancelled': return 'cancelled';
    default: return 'other';
  }
}
function initials(name) {
  const parts = (name || '').trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}
const sessionLabelOf = (s, long) => isMakeupSession(s)
  ? (s.slotName ? `Make-Up${long ? ' Session' : ''}: ${s.slotName}` : `Make-Up${long ? ' Session' : ''}`)
  : (s.slotName || 'Session');

export default function MentorLogsheet() {
  useStayOnBack();
  const [user] = useState(() => getSession()?.user);
  const [, rerender] = useReducer(n => n + 1, 0);
  // The working data is mutable, as in the original: typed remarks go straight into the session
  // objects, and Discard restores them from a snapshot.
  const store = useRef({ settings: { SchoolYear: '2026-2027', Semester: '1st Semester', GuidanceOfficer: 'Guidance Officer' }, logData: null, calendar: null, sessions: [], progress: null, request: 0 });
  const [loadState, setLoadState] = useState('loading');      // loading | ok | error
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [printMenu, setPrintMenu] = useState(null);           // 'all' or a sessionID

  // Preview modal
  const [preview, setPreview] = useState({ shown: false, sessionId: null, tab: 'logsheet', maxTab: 0, formGen: 0 });
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const dirty = useRef(false);
  const snapshot = useRef(null);
  const [saveStatus, setSaveStatus] = useState({ text: '', cls: 'lpm-save-status' });
  const [busy, setBusy] = useState({ draft: false, upload: false, unsubmit: false });
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);               // 'upload' | 'unsubmit'
  const confirmResolve = useRef(null);
  const refreshTimer = useRef(null);
  const statusTimer = useRef(null);
  const [, refreshPreview] = useReducer(n => n + 1, 0);

  const logDisplayStatus = s => {
    // A logsheet merges rounds; any saved actual end keeps a finished checkpoint completed.
    const state = dashboardSessionState({ ...s, timeEnd: s.actualEnd ?? s.timeEnd }, store.current.calendar || []);
    return state === 'Upcoming' || state === 'Past Scheduled' ? 'Scheduled' : state;
  };
  const findSession = id => store.current.sessions.find(x => x.sessionID === id);

  async function loadSettings() {
    try {
      const data = await apiRequest('Settings', 'GET', null, true);
      if (data) store.current.settings = { ...store.current.settings, ...data };
    } catch { /* defaults */ }
  }
  async function loadLogsheet() {
    const st = store.current;
    const request = ++st.request;
    st.progress = null;
    apiRequest(`MonitorActivities/${user.userID}`, 'GET', null, true).catch(() => null).then(progress => {
      if (request !== st.request) return;
      st.progress = progress;
      rerender();
    });
    try {
      const [data, calendar] = await Promise.all([
        apiRequest(`SessionsAdmin/${user.userID}/logsheet`, 'GET', null, true),
        apiRequest('CalendarEvents', 'GET', null, true).catch(() => null),
      ]);
      st.logData = data;
      st.calendar = calendar;
      const fresh = await LogsheetData.withReportStatuses(LogsheetData.merge(data?.sessions || []), user.userID);
      if (request !== st.request) return;
      // Keep unsaved text in the session being viewed in the editor.
      const pid = previewRef.current.sessionId;
      if (pid) {
        const oldS = st.sessions.find(x => x.sessionID === pid);
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
        setPreview(p => ({ ...p, formGen: p.formGen + 1 }));
      }
      st.sessions = fresh;
      setLoadState('ok');
      rerender();
    } catch (e) {
      console.error('Logsheet load failed:', e);
      setLoadState(s => s === 'ok' ? 'reloadError' : 'error');
    }
  }

  useEffect(() => {
    loadSettings().then(loadLogsheet);
    const onVisible = () => { if (document.visibilityState === 'visible') loadSettings().then(loadLogsheet); };
    const onClick = () => setPrintMenu(null);
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('click', onClick);
      clearTimeout(refreshTimer.current);
      clearTimeout(statusTimer.current);
    };
  }, []);

  const st = store.current;
  const sessions = st.sessions;
  const loaded = loadState !== 'loading';

  // School-year / semester filter options, most recent first.
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
  useEffect(() => { if (periodFilter && !periods.some(p => p.key === periodFilter)) setPeriodFilter(''); }, [sessions]);

  function getFiltered() {
    const query = q.trim().toLowerCase();
    return sessions.filter(s => {
      if (periodFilter && `${s.schoolYear}|${s.semester}` !== periodFilter) return false;
      if (statusFilter === 'Makeup') { if (!isMakeupSession(s)) return false; }
      else if (statusFilter && logDisplayStatus(s) !== statusFilter) return false;
      if (query) {
        const dateStr = fmtDate(s.sessionDate).toLowerCase();
        const mentees = (s.mentees || []).map(m => m.menteeName.toLowerCase()).join(' ');
        if (!dateStr.includes(query) && !mentees.includes(query) && !(s.slotName || '').toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }

  // ── Stats (current-semester checkpoint totals, as on the Dashboard) ──
  const completedN = Number(st.progress?.completedSessions ?? st.progress?.CompletedSessions);
  const requiredN = Number(st.progress?.requiredSessions ?? st.progress?.RequiredSessions);
  const progressAvailable = Number.isFinite(completedN) && Number.isFinite(requiredN) && requiredN > 0;
  const pct = progressAvailable ? Math.min(100, Math.round(completedN / requiredN * 100)) : 0;

  // ── Remarks bar: completed checkpoints not yet submitted / needing an update ──
  let remarksPill = null;
  if (loaded && loadState !== 'error') {
    const completed = sessions.filter(s => logDisplayStatus(s) === 'Completed');
    if (!completed.length) remarksPill = { cls: 'log-remarks-pill log-remarks-pill--pending', icon: 'ti-notes', text: 'No completed sessions yet' };
    else {
      const unlogged = completed.filter(s => s.logStatus !== 'Submitted').length;
      const toUpdate = completed.filter(s => s.logStatus === 'Submitted' && s.needsUpdate).length;
      const logged = completed.length - unlogged;
      if (unlogged > 0 || toUpdate > 0) {
        const parts = [];
        if (unlogged) parts.push(`${unlogged} session${unlogged !== 1 ? 's' : ''} not yet logged`);
        if (toUpdate) parts.push(`${toUpdate} need${toUpdate !== 1 ? '' : 's'} an update`);
        remarksPill = { cls: 'log-remarks-pill log-remarks-pill--pending', icon: 'ti-notes', text: parts.join(' · ') };
      } else {
        remarksPill = { cls: 'log-remarks-pill log-remarks-pill--done', icon: 'ti-circle-check-filled', text: `All ${logged} session${logged !== 1 ? 's' : ''} logged` };
      }
    }
  }

  // ── Printing ──
  const mentor = st.logData?.mentor;
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '';
  const guidance = st.settings.GuidanceOfficer;
  function print(title, body) {
    if (!openPrintWindow(title, body)) showToast('Pop-up blocked. Please allow pop-ups and try again.');
  }
  function exportOne(sessionId, formType) {
    const s = findSession(sessionId);
    if (!s) return;
    const semLabel = LogsheetData.periodLabel(s);
    const label = sessionLabelOf(s, false);
    const who = mentorName ? ` (${mentorName})` : '';
    if (formType === 'notes') print(`Mentor's Notes — ${label} Session${who}`, buildMentorNotesForm(s, mentor, semLabel));
    else if (formType === 'nonattend') print(`Non-Attendance — ${label} Session${who}`, buildNonAttendanceForm(s, mentor, semLabel, guidance));
    else print(`Logsheet — ${label} Session${who}`, buildPrintForm(s, mentor, semLabel));
  }
  function exportAll(formType) {
    const list = getFiltered();
    if (!list.length) { showToast('No sessions to print.'); return; }
    const who = mentorName ? ` (${mentorName})` : '';
    const label = s => LogsheetData.periodLabel(s);
    if (formType === 'all') print(`All Forms — All Sessions${who}`, list.map(s => buildPrintForm(s, mentor, label(s)) + buildMentorNotesForm(s, mentor, label(s)) + buildNonAttendanceForm(s, mentor, label(s), guidance)).join(''));
    else if (formType === 'notes') print(`Mentor's Notes — All Sessions${who}`, list.map(s => buildMentorNotesForm(s, mentor, label(s))).join(''));
    else if (formType === 'nonattend') print(`Non-Attendance — All Sessions${who}`, list.map(s => buildNonAttendanceForm(s, mentor, label(s), guidance)).join(''));
    else print(`Mentoring Logsheet — All Sessions${who}`, list.map(s => buildPrintForm(s, mentor, label(s))).join(''));
  }
  const toggleMenu = id => setPrintMenu(m => m === id ? null : id);

  // ── Preview modal ──
  function openPreview(sessionId) {
    const s = findSession(sessionId);
    if (!s) return;
    dirty.current = false;
    snapshot.current = JSON.parse(JSON.stringify(s.mentees || []));
    setSaveStatus({ text: '', cls: 'lpm-save-status' });
    setBusy({ draft: false, upload: false, unsubmit: false });
    // Already-submitted logsheets are read-only, so every sheet is open; a draft starts on sheet 1.
    setPreview(p => ({ shown: true, sessionId, tab: 'logsheet', maxTab: isFinalSubmitted(s) ? TAB_ORDER.length - 1 : 0, formGen: p.formGen + 1 }));
  }
  function switchTab(tab, maxTab = previewRef.current.maxTab) {
    // Only already-visited (or the current) sheets can be opened directly.
    if (TAB_ORDER.indexOf(tab) > maxTab) return;
    setPreview(p => ({ ...p, tab, maxTab, formGen: p.formGen + 1 }));
  }
  function nextTab() {
    const nextIdx = TAB_ORDER.indexOf(preview.tab) + 1;
    if (nextIdx >= TAB_ORDER.length) return;
    switchTab(TAB_ORDER[nextIdx], Math.max(preview.maxTab, nextIdx));
  }
  function onTextInput(m, field, value) {
    dirty.current = true;
    m[field] = value.trim() || null;
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refreshPreview, 300);
  }

  async function performSaveRemarks() {
    const pid = previewRef.current.sessionId;
    const session = findSession(pid);
    if (!session) return;
    // Mentees with text but no Attendance record yet get one (absent) so their text can be saved.
    for (const m of session.mentees || []) {
      if (m.attendanceID) continue;
      if (!m.remarks && !m.mentorNotes && !m.absenceReason) continue;
      try {
        const created = await apiRequest('Attendance', 'POST', {
          SessionID: m._sourceSessionID || session._sourceSessionID || pid, MenteeID: m.menteeID,
          // Notes never establish presence, including for makeup sessions.
          IsPresent: false, ScannedAt: null, Remarks: null, MentorNotes: null, AbsenceReason: null,
        }, true);
        if (created?.attendanceID) m.attendanceID = created.attendanceID;
      } catch (e) {
        console.warn(`Could not create attendance record for mentee ${m.menteeID}:`, e);
      }
    }
    // One atomic PATCH per mentee for all three text columns.
    await Promise.all((session.mentees || []).filter(m => m.attendanceID).map(m =>
      apiRequest(`Attendance/${m.attendanceID}/text-fields`, 'PATCH', { remarks: m.remarks || null, mentorNotes: m.mentorNotes || null, absenceReason: m.absenceReason || null }, true)));
  }
  const patchLogStatus = (s, logStatus) => apiRequest(`Sessions/${s._sourceSessionID || s.sessionID}/log-status`, 'PATCH', { logStatus, sectionCode: s.sessionSectionCode, courseSchool: s.courseSchool }, true);

  async function saveDraft() {
    setBusy(b => ({ ...b, draft: true }));
    setSaveStatus({ text: '', cls: 'lpm-save-status' });
    try {
      await performSaveRemarks();
      const s = findSession(previewRef.current.sessionId);
      await patchLogStatus(s, 'Draft');
      if (s) s.logStatus = 'Draft';
      dirty.current = false;
      snapshot.current = JSON.parse(JSON.stringify(s?.mentees || []));
      setBusy(b => ({ ...b, draft: false }));
      setSaveStatus({ text: 'Draft saved', cls: 'lpm-save-status ok' });
      rerender();
      clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setSaveStatus(x => ({ ...x, text: '' })), 3000);
    } catch (e) {
      console.error('Save draft failed:', e);
      setSaveStatus({ text: 'Failed to save draft', cls: 'lpm-save-status error' });
      setBusy(b => ({ ...b, draft: false }));
    }
  }
  const askConfirm = kind => { setConfirm(kind); return new Promise(resolve => { confirmResolve.current = resolve; }); };
  const resolveConfirm = ok => { setConfirm(null); confirmResolve.current?.(ok); confirmResolve.current = null; };

  // One button, two actions: Upload Logsheet, or Unsubmit once it's submitted.
  async function submitToggle() {
    const s = findSession(previewRef.current.sessionId);
    if (!s) return;
    if (isFinalSubmitted(s)) {
      // Reverts to Draft; the next real submit re-stamps SubmittedAt (so a late resubmit counts as late).
      if (!(await askConfirm('unsubmit'))) return;
      setBusy(b => ({ ...b, unsubmit: true }));
      setSaveStatus({ text: '', cls: 'lpm-save-status' });
      try {
        await patchLogStatus(s, 'Draft');
        s.logStatus = 'Draft';
        setBusy(b => ({ ...b, unsubmit: false }));
        setPreview(p => ({ ...p, tab: 'logsheet', maxTab: 0, formGen: p.formGen + 1 }));
        rerender();
      } catch (e) {
        console.error('Unsubmit failed:', e);
        setSaveStatus({ text: 'Failed to unsubmit', cls: 'lpm-save-status error' });
        setBusy(b => ({ ...b, unsubmit: false }));
      }
      return;
    }
    if (!(await askConfirm('upload'))) return;
    setBusy(b => ({ ...b, upload: true }));
    setSaveStatus({ text: '', cls: 'lpm-save-status' });
    try {
      await performSaveRemarks();
      await patchLogStatus(s, 'Submitted');
      s.logStatus = 'Submitted';
      s.needsUpdate = false;
      delete s.reportStatus;
      dirty.current = false;
      snapshot.current = JSON.parse(JSON.stringify(s.mentees || []));
      setBusy(b => ({ ...b, upload: false }));
      setPreview(p => ({ ...p, maxTab: TAB_ORDER.length - 1 }));
      rerender();
      await loadLogsheet();
    } catch (e) {
      console.error('Upload failed:', e);
      setSaveStatus({ text: e.message || 'Upload failed', cls: 'lpm-save-status error' });
      setBusy(b => ({ ...b, upload: false }));
    }
  }

  // Closing asks first when there are unsaved remarks (they only reach the server via Draft/Upload).
  function requestClose() {
    if (dirty.current) setUnsavedOpen(true);
    else setPreview(p => ({ ...p, shown: false }));
  }
  function discardAndClose() {
    const s = findSession(previewRef.current.sessionId);
    if (s && snapshot.current) s.mentees = JSON.parse(JSON.stringify(snapshot.current));
    dirty.current = false;
    setUnsavedOpen(false);
    setPreview(p => ({ ...p, shown: false }));
  }
  async function saveDraftAndClose() {
    setUnsavedOpen(false);
    await saveDraft();
    // A failed save keeps the editor open (with its own error message).
    if (!dirty.current) setPreview(p => ({ ...p, shown: false }));
  }

  // ── Render ──
  const filtered = loaded ? getFiltered() : [];
  let cards;
  if (loadState === 'loading') cards = <div className="log-loading"><i className="ti ti-loader"></i>{' '}Loading sessions…</div>;
  else if (loadState === 'error' || loadState === 'reloadError') cards = <div className="log-loading">Failed to load logsheet. Please refresh.</div>;
  else cards = <CardList sessions={filtered} all={sessions} status={statusFilter} logDisplayStatus={logDisplayStatus} calendar={st.calendar}
    semester={st.settings.Semester} printMenu={printMenu}
    onOpen={openPreview} onPrint={exportOne} onToggleMenu={toggleMenu} onCloseMenu={() => setPrintMenu(null)} />;

  const ps = preview.sessionId ? findSession(preview.sessionId) : null;

  return (
    <Page id="MENTOR/logsheet">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Mentoring Logsheet</h1>
              {' '}
              <p id="logsheetSubtitle">{loadState === 'ok' || loadState === 'reloadError' ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} on record` : 'Loading…'}</p>
            </div>
            {' '}
            <div className="print-btn-group" onClick={e => e.stopPropagation()}>
              <button className="btn-export-main" onClick={() => exportAll('all')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                {' '}Print All
              </button>
              {' '}
              <button className="btn-export-caret" onClick={() => toggleMenu('all')}>
                <i className="ti ti-chevron-down"></i>
              </button>
              {' '}
              <div className={'print-dropdown' + (printMenu === 'all' ? ' open' : '')} id="printMenu-all">
                {[['all', 'ti-files', 'All Forms'], ['logsheet', 'ti-clipboard-list', 'Logsheet'], ['notes', 'ti-notes', "Mentor's Notes"], ['nonattend', 'ti-user-x', 'Non-Attendance']].map(([type, icon, label], i) => (
                  <Fragment key={type}>{i > 0 && ' '}<button className="print-drop-item" onClick={() => { exportAll(type); setPrintMenu(null); }}><i className={'ti ' + icon}></i> {label}</button></Fragment>
                ))}
              </div>
            </div>
          </div>
          {' '}
          {/* How this works */}
          <div className="log-info-banner">
            <i className="ti ti-info-circle"></i>
            {' '}
            <span>This logsheet is auto-generated from your <strong>Sessions</strong> records — attendance, time, and mentees are pulled automatically. To log a new session, go to <a href="/mentor/sessions">Sessions</a>.</span>
          </div>
          {' '}
          {/* Stats strip */}
          <div className="log-stats-strip">
            <div className="lstat lstat-progress">
              <div className="lstat-progress-top">
                <div className="lstat-val green" id="lStatCompleted">{loaded && (st.progress !== null || loadState === 'ok') ? (progressAvailable ? completedN : '—') : <span className="stat-pulse">—</span>}</div>
                {' '}
                <div className="lstat-progress-req" id="lStatRequired">{loaded && (st.progress !== null || loadState === 'ok') ? (progressAvailable ? `of ${requiredN} required` : 'Progress unavailable') : 'Loading target...'}</div>
              </div>
              {' '}
              <div className="lstat-progress-bar">
                <div className="lstat-progress-fill" id="lStatProgressFill" style={{ width: `${pct}%` }}></div>
              </div>
              {' '}
              <div className="lstat-lbl">Checkpoints Completed This Semester <Help label="About checkpoints completed this semester" title="Semester Progress">Checkpoint progress is for the current semester.</Help></div>
            </div>
            {' '}
            <div className="lstat">
              <div className="lstat-val" id="lStatTotal">{loaded ? sessions.length : <span className="stat-pulse">—</span>}</div>
              {' '}
              <div className="lstat-lbl">Total Sessions on Record <Help label="About total sessions on record" title="Session Records">Session totals include all records across school years and semesters.</Help></div>
            </div>
            {' '}
            <div className="lstat">
              <div className="lstat-val blue" id="lStatScheduled">{loaded ? sessions.filter(s => logDisplayStatus(s) === 'Scheduled' && !isMakeupSession(s)).length : <span className="stat-pulse">—</span>}</div>
              {' '}
              <div className="lstat-lbl">Scheduled</div>
            </div>
            {' '}
            <div className="lstat"><div className="lstat-val gray" id="lStatClosed">{loaded ? sessions.filter(s => logDisplayStatus(s) === 'Closed').length : '—'}</div><div className="lstat-lbl">Closed (not conducted) <Help label="About closed (not conducted)" title="Closed Sessions">Closed means the session was not conducted before its calendar deadline.</Help></div></div>
            {' '}
            <div className="lstat">
              <div className="lstat-val gray" id="lStatCancelled">{loaded ? sessions.filter(s => s.sessionStatus === 'Cancelled' && !isMakeupSession(s)).length : <span className="stat-pulse">—</span>}</div>
              {' '}
              <div className="lstat-lbl">Cancelled</div>
            </div>
          </div>
          {/* Remarks completion indicator */}
          <div className="log-remarks-bar" id="logRemarksBar" style={{ display: remarksPill ? 'flex' : 'none' }}>
            <span className={remarksPill ? remarksPill.cls : 'log-remarks-pill'} id="logRemarksPill">
              {remarksPill && <><i className={'ti ' + remarksPill.icon}></i>{' ' + remarksPill.text}</>}
            </span>
            {' '}
            <div className="log-remarks-info-wrap">
              <span className="log-remarks-info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              </span>
              {' '}
              <div className="log-remarks-tooltip">
                <strong>Logsheet status</strong><br />
                {' '}A session counts as <em>not yet logged</em> until you click <em>Upload Logsheet</em> inside it — that's when it's marked Submitted and visible to Admin.<br /><br />
                {' '}The <em>Logsheet</em> button turns green once submitted, orange while a Completed session is still waiting to be submitted.
              </div>
            </div>
          </div>
          {' '}
          {/* Toolbar */}
          <div className="log-toolbar">
            <div className="search-wrap">
              <i className="ti ti-search"></i>
              {' '}
              <input type="text" id="logSearch" placeholder="Search sessions…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {' '}
            <Select className="log-filter" id="logStatusFilter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Closed">Closed (not conducted)</option>
            </Select>
            {' '}
            <Select className="log-filter" id="logPeriodFilter" value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}>
              <option value="">All School Years</option>
              {periods.map(p => <option key={p.key} value={p.key}>{`${p.semester}, SY ${p.schoolYear}`}</option>)}
            </Select>
          </div>
          {' '}
          {/* Session Cards */}
          <div id="logCards" className="log-cards">{cards}</div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Logsheet Preview Modal */}
      <div id="logsheetPreviewOverlay" className="lpm-overlay" style={{ display: preview.shown ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) requestClose(); }}>
        <div className="lpm-modal lpm-modal-wide">
          <PreviewModal s={ps} tab={preview.tab} maxTab={preview.maxTab} formGen={preview.formGen} mentor={mentor} guidance={guidance}
            saveStatus={saveStatus} busy={busy}
            onClose={requestClose} onTab={tab => switchTab(tab)} onNext={nextTab} onDraft={saveDraft} onSubmit={submitToggle} onInput={onTextInput} />
        </div>
      </div>

      {/* Upload Confirmation Modal */}
      <ConfirmDialog id="uploadConfirmOverlay" open={confirm === 'upload'} onClose={() => resolveConfirm(false)} iconClass="confirm-icon-primary" icon="ti-upload"
        title="Upload Logsheet for Review?" body={<>This marks it <strong>Submitted</strong> and visible to the Admin.</>}>
        <button className="btn-form-cancel" onClick={() => resolveConfirm(false)}>Cancel</button>
        {' '}
        <button className="btn-confirm-primary" id="confirmUploadBtn" onClick={() => resolveConfirm(true)}>
          <i className="ti ti-upload"></i> Upload Logsheet
        </button>
      </ConfirmDialog>

      {/* Unsubmit Confirmation Modal */}
      <ConfirmDialog id="unsubmitConfirmOverlay" open={confirm === 'unsubmit'} onClose={() => resolveConfirm(false)} iconClass="confirm-icon-warn" icon="ti-arrow-back-up"
        title="Unsubmit this Logsheet?" body={<>This will revert the logsheet to <strong>Draft</strong> and hide it from Admin until you resubmit.</>}>
        <button className="btn-form-cancel" onClick={() => resolveConfirm(false)}>Cancel</button>
        {' '}
        <button className="btn-confirm-warn" id="confirmUnsubmitBtn" onClick={() => resolveConfirm(true)}>
          <i className="ti ti-arrow-back-up"></i> Unsubmit
        </button>
      </ConfirmDialog>

      {/* Unsaved Changes Confirmation Modal */}
      <ConfirmDialog id="unsavedChangesOverlay" open={unsavedOpen} onClose={() => setUnsavedOpen(false)} closeX={discardAndClose} iconClass="confirm-icon-warn" icon="ti-alert-triangle"
        title="Unsaved Changes" body="You have unsaved remarks — save them as a draft or discard them.">
        <button className="btn-form-cancel" onClick={discardAndClose}>Discard &amp; Close</button>
        {' '}
        <button className="btn-confirm-primary" id="confirmSaveDraftBtn" onClick={saveDraftAndClose}>
          <i className="ti ti-device-floppy"></i> Save Draft
        </button>
      </ConfirmDialog>
    </Page>
  );
}

function Help({ label, title, children }) {
  return (
    <details className="lstat-help"><summary aria-label={label}><i className="ti ti-info-circle" aria-hidden="true"></i></summary><div className="lstat-help-text"><div className="lstat-help-title">{title}</div>{children}</div></details>
  );
}

// ── Session cards, grouped by section (make-ups without a checkpoint last) ──
function CardList({ sessions, all, status, logDisplayStatus, calendar, semester, printMenu, onOpen, onPrint, onToggleMenu, onCloseMenu }) {
  const card = (s, hideSection) => <LogCard key={s.sessionID} s={s} hideSection={hideSection} logDisplayStatus={logDisplayStatus} calendar={calendar} semester={semester}
    menuOpen={printMenu === s.sessionID} onOpen={onOpen} onPrint={onPrint} onToggleMenu={onToggleMenu} onCloseMenu={onCloseMenu} />;
  const group = (key, icon, label, progress, list) => (
    <div key={key} className="log-section-group">
      <div className="log-section-group-header">
        <div className="log-section-group-label">
          <i className={'ti ' + icon}></i>
          {' '}{label}
        </div>
        {' '}
        <div className="log-section-group-progress">
          <span className="log-section-progress-text">{progress}</span>
        </div>
      </div>
      {' '}
      <div className="log-section-cards">{list.map(s => card(s, true))}</div>
    </div>
  );
  const placeholder = (icon, label, icon2, text) => (
    <div className="log-section-group log-makeup-empty-group">
      <div className="log-section-group-header">
        <div className="log-section-group-label">
          <i className={'ti ' + icon}></i>
          {' '}{label}
        </div>
      </div>
      {' '}
      <div className="log-makeup-placeholder">
        <i className={'ti ' + icon2}></i>
        {' '}
        <p>{text}</p>
      </div>
    </div>
  );

  if (status === 'Makeup') {
    if (!sessions.length) return placeholder('ti-calendar-clock', 'Makeup Sessions', 'ti-calendar-plus', 'Make-up attendance appears under its checkpoint. Only sessions without a checkpoint or section appear here.');
    return group('makeup', 'ti-calendar-clock', 'Makeup Sessions', `${sessions.filter(s => logDisplayStatus(s) === 'Completed').length} completed`, sessions);
  }
  if (!sessions.length) {
    if (all.length === 0) return (
      <Empty className="log-empty">
        <i className="ti ti-clipboard-off"></i>
        {' '}
        <p>No sessions on record yet.</p>
        {' '}
        <a href="/mentor/sessions">Go to Sessions to log one →</a>
      </Empty>
    );
    const label = status === 'Completed' ? 'Completed' : status === 'Scheduled' ? 'Scheduled' : status === 'Cancelled' ? 'Cancelled' : '';
    return placeholder('ti-filter', `${label} Sessions`, 'ti-filter-off', `No ${label.toLowerCase()} sessions found.`);
  }

  // Group by section; '' = make-ups (and sessions without a section). A multi-section session is
  // listed under each of its sections.
  const groups = {}, order = [];
  const add = (key, s) => { if (!groups[key]) { groups[key] = []; order.push(key); } groups[key].push(s); };
  for (const s of sessions) {
    if (isMakeupSession(s)) { add('', s); continue; }
    const secStr = s.sections || s.sessionSectionCode || '';
    if (!secStr) add('', s);
    else secStr.split(',').map(x => x.trim()).filter(Boolean).forEach(sec => add(sec, s));
  }
  const real = order.filter(x => x !== '');
  const makeups = groups[''] || [];
  // Section headers show with several sections, or whenever a status filter is active.
  const multi = real.length > 1 || !!status;
  return (
    <>
      {real.length > 0 && !multi && <div className="log-section-cards log-section-cards--ungrouped">{groups[real[0]].map(s => card(s, false))}</div>}
      {real.length > 0 && multi && real.map(sec => group(sec, 'ti-users-group', sec, `${groups[sec].filter(s => logDisplayStatus(s) === 'Completed').length} checkpoints completed`, groups[sec]))}
      {!status && makeups.length > 0 && group('', 'ti-calendar-clock', 'Makeup Sessions', `${makeups.filter(s => logDisplayStatus(s) === 'Completed').length} completed`, makeups)}
    </>
  );
}

function LogCard({ s, hideSection, logDisplayStatus, calendar, semester, menuOpen, onOpen, onPrint, onToggleMenu, onCloseMenu }) {
  const timeStart = LogsheetData.time(s.actualStart);
  const timeEnd = LogsheetData.time(s.actualEnd);
  const timeStr = timeStart && timeEnd ? `${timeStart} – ${timeEnd}` : timeStart ? `from ${timeStart}` : timeEnd ? `ended ${timeEnd}` : '—';
  const present = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === true).length;
  const total = (s.mentees || []).length;
  const display = logDisplayStatus(s);
  const reportStatus = s.slotName ? LogsheetData.reportStatus(s, calendar) : '';
  const reportCls = reportStatus === 'Pending' ? 'report-pending' : reportStatus === 'Submitted Late' ? 'report-late' : '';
  const badgeCls = display === 'Closed' ? 'badge-closed' : statusBadgeClass(display === 'In Progress' ? 'Scheduled' : display);
  const cardCls = `status-${(display === 'In Progress' ? 'Scheduled' : display || '').toLowerCase()}`;
  const isCancelled = s.sessionStatus === 'Cancelled';
  // Orange while a Completed checkpoint still waits to be submitted (or needs a resubmit), green once submitted.
  const logBtnCls = s.needsUpdate ? 'btn-view-logsheet btn-view--pending'
    : s.logStatus === 'Submitted' ? 'btn-view-logsheet btn-view--done'
      : (isCancelled || s.sessionStatus === 'Scheduled') ? 'btn-view-logsheet btn-view--gray'
        : s.sessionStatus === 'Completed' ? 'btn-view-logsheet btn-view--pending' : 'btn-view-logsheet';
  const slotList = slotsForSemester(s.semester || semester);
  const slotIndex = slotList.indexOf(s.slotName);
  const numTotal = slotIndex >= 0 ? <div className="log-card-num-total">{`${slotIndex + 1} of ${slotList.length}`}</div> : null;
  const sections = s.sections ? s.sections.split(',').map(x => x.trim()).filter(Boolean)
    : s.sessionSectionCode ? [s.sessionSectionCode]
      : [...new Set((s.mentees || []).map(m => m.sectionCode).filter(Boolean))].sort();
  const noProof = s.sessionStatus === 'Completed' && !(s._anyProof !== undefined ? s._anyProof : s.proofFilePath);
  const item = (icon, text, title) => <span className="log-card-meta-item" title={title}><i className={'ti ' + icon}></i>{text}</span>;

  return (
    <div className={`log-session-card ${cardCls}`}>
      <div className={'log-card-header' + (isCancelled ? ' no-interact' : '')}>
        {isMakeupSession(s)
          ? <div className="log-card-num log-card-num-makeup">
            <div className="log-card-num-label">Make-up</div>
            {' '}
            <div className="log-card-num-val-sm">{s.slotName || 'Session'}</div>
            {' '}
            {numTotal}
          </div>
          : <div className="log-card-num">
            <div className="log-card-num-label">Session</div>
            {' '}
            <div className="log-card-num-val log-card-num-val--slot">{s.slotName || 'Session'}</div>
            {' '}
            {numTotal}
          </div>}
        {' '}
        <div className="log-card-info">
          <div className="log-card-date">{fmtDate(s.sessionDate)}</div>
          {' '}
          <div className="log-card-meta">
            {item('ti-calendar-week', fmtDayOfWeek(s.sessionDate))}
            {' '}
            {item('ti-clock', timeStr)}
            {' '}
            {item('ti-users', total > 0 ? `${present}/${total} present` : 'No attendance yet')}
            {' '}
            {s.roundDates?.length > 1 && item('ti-repeat', `${s.roundDates.length} sessions conducted`, s.roundDates.map(d => LogsheetData.day(d)).join(', '))}
          </div>
          {' '}
          {!hideSection && sections.length > 0 && <div className="log-section-tags">{sections.map(sec => <span key={sec} className="log-section-tag">{sec}</span>)}</div>}
          {' '}
          <div className="log-card-statuses">
            {s.slotName && <><span className={`status-badge ${reportCls}`}>{reportStatus}</span>{' '}</>}
            <span className={`status-badge ${badgeCls}`}>{display}</span>
            {' '}
            {noProof && <span className="log-proof-flag" title="No proof photo uploaded yet"><i className="ti ti-photo-off"></i></span>}
          </div>
        </div>
        {' '}
        <div className="log-card-actions">
          <button className={logBtnCls} onClick={e => { e.stopPropagation(); onOpen(s.sessionID); }}>
            <i className="ti ti-notes"></i> Logsheet
          </button>
          {' '}
          <div className="print-btn-group" onClick={e => e.stopPropagation()}>
            <button className="btn-print-main" onClick={() => onPrint(s.sessionID, 'logsheet')}>
              <i className="ti ti-printer"></i> Print
            </button>
            {' '}
            <button className="btn-print-caret" onClick={() => onToggleMenu(s.sessionID)}>
              <i className="ti ti-chevron-down"></i>
            </button>
            {' '}
            <div className={'print-dropdown' + (menuOpen ? ' open' : '')} id={`printMenu-${s.sessionID}`}>
              <button className="print-drop-item" onClick={() => { onPrint(s.sessionID, 'logsheet'); onCloseMenu(); }}><i className="ti ti-clipboard-list"></i> Logsheet</button>
              {' '}
              <button className="print-drop-item" onClick={() => { onPrint(s.sessionID, 'notes'); onCloseMenu(); }}><i className="ti ti-notes"></i> Mentor's Notes</button>
              {' '}
              <button className="print-drop-item" onClick={() => { onPrint(s.sessionID, 'nonattend'); onCloseMenu(); }}><i className="ti ti-user-x"></i> Non-Attendance</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Preview modal content: remarks editor (left) and the paper form (right) ──
function PreviewModal({ s, tab, maxTab, formGen, mentor, guidance, saveStatus, busy, onClose, onTab, onNext, onDraft, onSubmit, onInput }) {
  const submitted = isFinalSubmitted(s);
  const isLast = tab === TAB_ORDER[TAB_ORDER.length - 1];
  const needsUpdate = !!s?.needsUpdate;
  const logStatus = s?.logStatus;

  // Footer buttons follow the log status: Draft/new → Save Draft + Upload; Submitted → Unsubmit only;
  // Submitted but needing an update → Save Draft + Resubmit.
  let uploadLabel = 'Upload Logsheet', uploadCls = 'lpm-btn-upload', badge = '', showDraft = true;
  if (logStatus === 'Submitted' && needsUpdate) {
    badge = 'Needs Update — review new attendance and resubmit';
    uploadLabel = 'Resubmit Logsheet';
  } else if (logStatus === 'Submitted') {
    showDraft = false;
    uploadLabel = <><i className="ti ti-arrow-back-up"></i> Unsubmit</>;
    uploadCls = 'lpm-btn-upload lpm-btn-upload-unsubmit';
  }
  if (busy.upload) uploadLabel = 'Uploading…';
  if (busy.unsubmit) uploadLabel = 'Unsubmitting…';
  const nextTab = TAB_ORDER[TAB_ORDER.indexOf(tab) + 1];

  let title = '', sub = '';
  if (s) {
    title = isMakeupSession(s) ? (s.slotName ? `Make-up Session: ${s.slotName}` : 'Make-up Session') : (s.slotName || 'Session');
    const topic = (s.topic || '').replace(/^\[[^\]]+\]\s*/, '') || 'Mentoring Session';
    sub = `${LogsheetData.day(s.sessionDate)} · ${LogsheetData.time(s.actualStart) || '—'} – ${LogsheetData.time(s.actualEnd) || '—'} · ${topic}`;
  }

  return (
    <>
      {/* Header */}
      <div className="lpm-header">
        <div>
          <div className="lpm-title" id="lpmTitle">{title}</div>
          {' '}
          <div className="lpm-sub" id="lpmSub">{sub}</div>
        </div>
        {' '}
        <div className="lpm-header-right">
          <button className="lpm-close-btn" onClick={onClose}>×</button>
        </div>
      </div>
      {' '}
      {/* Split Body */}
      <div className="lpm-split-body">
        {/* Left: editable remarks */}
        <div className="lpm-left-panel">
          <div className="lpm-panel-heading" id="lpmPanelHeading">{s ? { logsheet: 'Logsheet Remarks', notes: "Mentor's Notes", nonattend: 'Absence Reasons' }[tab] : 'Attendance & Remarks'}</div>
          {' '}
          <div className="lpm-remarks-list" id="lpmRemarksForm">{s && <RemarksForm key={formGen} s={s} tab={tab} onInput={onInput} />}</div>
          {' '}
          <div className="lpm-left-footer">
            <div className="lpm-footer-top">
              <span className="lpm-log-status-badge" id="lpmLogStatusBadge">{s ? badge : ''}</span>
              {' '}
              <span className={saveStatus.cls} id="lpmSaveStatus">{saveStatus.text}</span>
            </div>
            {' '}
            <div className="lpm-footer-btns">
              <button className="lpm-btn-draft" id="lpmDraftBtn" style={s && !showDraft ? { display: 'none' } : undefined} disabled={busy.draft} onClick={onDraft}>
                {busy.draft ? 'Saving…' : 'Save Draft'}
              </button>
              {' '}
              <button className="lpm-btn-next" id="lpmNextBtn" style={s && (submitted || isLast) ? { display: 'none' } : undefined} onClick={onNext}>
                {s && !submitted && !isLast ? <>{`Next: ${TAB_LABELS[nextTab]} `}<i className="ti ti-arrow-right"></i></> : <>Next <i className="ti ti-arrow-right"></i></>}
              </button>
              {' '}
              <button className={s ? uploadCls : 'lpm-btn-upload'} id="lpmUploadBtn" style={s && !(submitted || isLast) ? { display: 'none' } : undefined} disabled={busy.upload || busy.unsubmit} onClick={onSubmit}>
                {s ? uploadLabel : 'Upload Logsheet'}
              </button>
            </div>
          </div>
        </div>
        {' '}
        {/* Right: document preview */}
        <div className="lpm-right-panel">
          <div className="lpm-preview-tabs">
            {TAB_ORDER.map((t, i) => (
              <Fragment key={t}>{i > 0 && ' '}
                <button className={'lpm-ptab' + (tab === t ? ' active' : '') + (s && i > maxTab ? ' lpm-ptab-locked' : '')} data-tab={t} onClick={() => onTab(t)}>{TAB_LABELS[t]}</button>
              </Fragment>
            ))}
          </div>
          {' '}
          <div className="lpm-preview-scroll">
            <div className="lpm-body" id="lpmContent">
              {s && (tab === 'logsheet' ? <PaperLogsheet s={s} mentor={mentor} />
                : tab === 'notes' ? <PaperNotes s={s} mentor={mentor} />
                  : <PaperNonAttendance s={s} mentor={mentor} guidance={guidance} />)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function RemarksForm({ s, tab, onInput }) {
  const mentees = s.mentees || [];
  const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);
  const absent = mentees.filter(m => LogsheetData.attendanceState(m) === false);
  const pending = mentees.filter(m => !m.attendanceRecorded || m.attendanceUnverified);
  const area = (m, field, placeholder) => (
    <textarea className="lrm-textarea" data-att-id={m.attendanceID || ''} data-mentee-id={m.menteeID} data-session-id={s.sessionID} data-field={field}
      placeholder={placeholder} defaultValue={m[field] || ''} onInput={e => onInput(m, field, e.target.value)}></textarea>
  );
  const row = (m, kind, field, placeholder) => (
    <div key={m.menteeID} className="lrm-mentee-row">
      <div className="lrm-mentee-info">
        <div className={'lrm-avatar' + (kind ? ' ' + kind : '')}>{initials(m.menteeName)}</div>
        {' '}
        <div className="lrm-mentee-text">
          <div className="lrm-mentee-name">{m.menteeName}</div>
          {' '}
          <div className="lrm-mentee-sec">{m.sectionCode || '—'}{kind && m.isDropOut && <span className="lrm-dropout-chip">Drop Out</span>}</div>
        </div>
        {' '}
        <span className={'lrm-status-dot' + (kind ? ' ' + kind : '')}>{kind === 'present' ? 'Present' : kind === 'absent' ? 'Absent' : m.attendanceUnverified ? 'Unverified' : 'Not recorded'}</span>
      </div>
      {' '}
      {field && area(m, field, placeholder)}
    </div>
  );

  let body;
  if (tab === 'logsheet' || tab === 'notes') {
    const [field, ph] = tab === 'logsheet' ? ['remarks', 'Remarks…'] : ['mentorNotes', 'Notes…'];
    body = present.length
      ? <><div className="lrm-section-label">{`Present (${present.length})`}</div>{present.map(m => row(m, 'present', field, ph))}</>
      : <div className="lrm-no-att">No present mentees for this session.</div>;
    // Historical notes stay editable without counting unverified presence in the forms.
    body = <>{body}{mentees.filter(m => m.attendanceUnverified).map(m => (
      <div key={'u' + m.menteeID} className="lrm-mentee-row">
        <div className="lrm-mentee-name">{`${m.menteeName} — Unverified`}</div>
        {' '}
        {area(m, field)}
      </div>
    ))}</>;
  } else if (absent.length || pending.length) {
    body = <>
      <div className="lrm-section-label lrm-absent-label">{`Absent (${absent.length})`}</div>
      {absent.map(m => row(m, 'absent', 'absenceReason', 'Reason for absence…'))}
      {pending.length > 0 && <>
        <div className="lrm-section-label">{`Unverified / not recorded (${pending.length})`}</div>
        {pending.map(m => row(m, '', null))}
      </>}
    </>;
  } else {
    body = <div className="lrm-no-att">No recorded absences for this session.</div>;
  }
  return body;
}

// ── Paper previews (same layout as the printed forms) ──
const MENTOR_SIG_STYLE = { maxHeight: '60px', maxWidth: '190px', objectFit: 'contain', display: 'block', margin: '0 auto -10px', mixBlendMode: 'multiply', position: 'relative', zIndex: 1 };
const hideOnError = e => { e.currentTarget.style.display = 'none'; };

function MentorSig({ mentor }) {
  return mentor?.signatureFilePath ? <img src={CONFIG.getFileUrl(mentor.signatureFilePath)} style={MENTOR_SIG_STYLE} onError={hideOnError} /> : null;
}
// A mentee signature that fails to load shows "—" instead.
function MenteeSig({ path }) {
  const [failed, setFailed] = useState(false);
  if (failed) return '—';
  return <img src={CONFIG.getFileUrl(path)} style={{ maxHeight: '44px', maxWidth: '120px', objectFit: 'contain' }} onError={() => setFailed(true)} />;
}
function SigRow({ mentor, nameClass = 'paper-sig-value', withDate = true }) {
  const name = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  return (
    <div className="paper-sig-row">
      <div className="paper-sig-block wide">
        <div className="paper-sig-fit"><MentorSig mentor={mentor} /><div className={nameClass}>{name}</div></div>
        {' '}
        <div className="paper-sig-line"></div>
        {' '}
        <div className="paper-sig-label">Mentor's Signature over printed name</div>
      </div>
      {withDate && <>{' '}
        <div className="paper-sig-block paper-date-block">
          <div className="paper-sig-line"></div>
          {' '}
          <div className="paper-sig-label">DATE</div>
        </div></>}
    </div>
  );
}
function PaperHeader({ s }) {
  return (
    <div className="paper-header">
      <img src="/IMAGES/FAITH-Colleges-Logo.png" className="paper-logo-img" onError={hideOnError} />
      {' '}
      <div className="paper-program">MENTORING PROGRAM</div>
      {' '}
      <div className="paper-program">{LogsheetData.periodLabel(s)}</div>
    </div>
  );
}

function PaperLogsheet({ s, mentor }) {
  const dateStr = LogsheetData.day(s.sessionDate);
  const present = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);
  const blankCount = Math.max(0, (s.mentees || []).length - present.length);
  const hasProof = !!s.proofFilePath;
  return (
    <div className="paper-form">
      <PaperHeader s={s} />
      {' '}
      <div className="paper-form-title">MENTORING LOGSHEET</div>
      {' '}
      <div className="paper-session-label"><span className="paper-session-underline">{sessionLabelOf(s, false)}</span> Session</div>
      {' '}
      <div className="paper-table-wrap">
        <table className="paper-table">
          <thead>
            <tr>
              <th style={{ width: '70px' }}>DATE</th>
              <th style={{ width: '180px' }}>MENTEE'S NAME</th>
              <th style={{ width: '85px' }}>TIME START</th>
              <th style={{ width: '85px' }}>TIME END</th>
              <th style={{ width: '85px' }}>SIGNATURE</th>
              <th>REMARKS</th>
            </tr>
          </thead>
          <tbody>
            {present.map(m => {
              // A merged mentee carries the date (and proof) of the round they actually attended.
              const mHasProof = m._hasProof !== undefined ? m._hasProof : hasProof;
              return (
                <tr key={m.menteeID}>
                  <td>{m._attendedDate ? LogsheetData.day(m._attendedDate) : dateStr}</td>
                  <td>{m.menteeName}</td>
                  <td>{LogsheetData.time(m.scannedAt)}</td>
                  <td>{LogsheetData.time(m._attendedEndTime)}</td>
                  <td className="sig-cell">{mHasProof && m.signatureFilePath ? <MenteeSig path={m.signatureFilePath} /> : null}</td>
                  <td>{m.remarks || ''}</td>
                </tr>
              );
            })}
            {Array.from({ length: blankCount }, (_, i) => <tr key={'b' + i}><td></td><td></td><td></td><td></td><td className="sig-cell"></td><td></td></tr>)}
          </tbody>
        </table>
      </div>
      {' '}
      <SigRow mentor={mentor} />
    </div>
  );
}

function PaperNotes({ s, mentor }) {
  const dateStr = LogsheetData.day(s.sessionDate);
  const present = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);
  const absent = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === false);
  const entries = [
    ...present.map(m => (
      <div key={m.menteeID} className="note-entry">
        <div className="note-entry-header">
          <div className="note-field"><strong>Mentee's Name:</strong> <span className="note-field-val">{m.menteeName}</span></div>
          {' '}
          <div className="note-field"><strong>Date of Mentoring:</strong> <span className="note-field-val">{m._attendedDate ? LogsheetData.day(m._attendedDate) : dateStr}</span></div>
        </div>
        {' '}
        {m.mentorNotes ? <><div className="note-line-pre">{m.mentorNotes}</div><div className="note-line"></div></> : <><div className="note-line"></div><div className="note-line"></div></>}
      </div>
    )),
    ...absent.map((_, i) => (
      <div key={'b' + i} className="note-entry">
        <div className="note-entry-header">
          <div className="note-field"><strong>Mentee's Name:</strong> <span className="note-field-blank"></span></div>
          {' '}
          <div className="note-field"><strong>Date of Mentoring:</strong> <span className="note-field-blank"></span></div>
        </div>
        {' '}
        <div className="note-line"></div><div className="note-line"></div>
      </div>
    )),
  ];
  return (
    <div className="paper-form">
      <div className="guidance-copy-label">GUIDANCE COPY</div>
      {' '}
      <PaperHeader s={s} />
      {' '}
      <div className="paper-form-title">MENTOR'S NOTES</div>
      {' '}
      <div className="note-entries">{entries.length ? entries : <p style={{ textAlign: 'center', color: '#9ca3af', padding: '24px 0' }}>No mentees for this session.</p>}</div>
      {' '}
      <SigRow mentor={mentor} />
    </div>
  );
}

function PaperNonAttendance({ s, mentor, guidance }) {
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const absent = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === false);
  return (
    <div className="paper-form">
      <div className="paper-header">
        <img src="/IMAGES/FAITH-Colleges-Logo.png" className="paper-logo-img" onError={hideOnError} />
        {' '}
        <div className="paper-program" style={{ fontWeight: 700 }}>MENTORING PROGRAM</div>
      </div>
      {' '}
      <div className="paper-form-title" style={{ textDecoration: 'none' }}>NON-ATTENDANCE OF MENTEES</div>
      {' '}
      <div className="paper-program-sub">{LogsheetData.periodLabel(s)}</div>
      {' '}
      <div className="na-instruction">
        <p><strong>Dear Mentors,</strong></p>
        {' '}
        <p style={{ marginTop: '6px' }}>{`Kindly list down the name/s of those who did not attend your scheduled mentoring session. Please submit this form to ${guidance} at the Guidance Office. Thank you!`}</p>
      </div>
      {' '}
      <SigRow mentor={mentor} withDate={false} />
      {' '}
      <div className="paper-table-wrap">
        <table className="paper-table">
          <thead><tr><th style={{ width: '40%' }}>NAME</th><th style={{ width: '25%' }}>COURSE</th><th>REASON</th></tr></thead>
          <tbody>
            {absent.map(m => <tr key={m.menteeID}><td>{m.menteeName}</td><td>{m.sectionCode || ''}</td><td>{m.absenceReason || ''}</td></tr>)}
            {Array.from({ length: Math.max(0, 15 - absent.length) }, (_, i) => <tr key={'b' + i}><td></td><td></td><td></td></tr>)}
          </tbody>
        </table>
      </div>
      {' '}
      <p className="na-note">Please use another separate sheet if the space provided is not enough.</p>
      {' '}
      <p className="na-note">Thank you.</p>
      {' '}
      <div className="na-ack">
        <div className="na-ack-title">ACKNOWLEDGEMENT RECEIPT</div>
        {' '}
        <div className="na-ack-sub">MENTOR'S REPORT</div>
        {' '}
        <div className="na-ack-fields">
          <div className="na-ack-field"><span className="na-field-label">NAME OF MENTOR:</span><span className="ack-val">{mentorName}</span></div>
          {' '}
          <div className="na-ack-field"><span className="na-field-label">MENTORING SESSION:</span><span className="ack-val">{`${sessionLabelOf(s, true)} — ${LogsheetData.day(s.sessionDate)}`}</span></div>
          {' '}
          <div className="na-ack-field"><span className="na-field-label">DATE SUBMITTED:</span><span className="ack-val">{s.submittedAt ? LogsheetData.day(s.submittedAt) : '—'}</span></div>
          {' '}
          <div className="na-ack-field"><span className="na-field-label">RECEIVED BY:</span><span className="ack-val ack-blank"></span></div>
          {' '}
          <div className="na-ack-field"><span className="na-field-label">DATE RECEIVED:</span><span className="ack-val ack-blank"></span></div>
        </div>
      </div>
    </div>
  );
}
