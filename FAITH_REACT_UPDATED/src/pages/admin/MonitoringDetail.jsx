import { useEffect, useState } from 'react';
import { printDateLabel } from '../../lib/printDate.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Overlay from '../../components/Overlay.jsx';
import ProofLightbox from '../../components/ProofLightbox.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { sessionDisplayStatus } from '../../lib/dashboard-sessions.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { getLogsheetPrintStyles } from '../../lib/print-logsheet-styles.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// ADMIN_/HTML/sessions-detail.html + ADMIN_/JS/sessions-detail.js

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Critical';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

// Trust the backend's IsMakeup bit alone.
function isMakeupSession(s) { return s.isMakeup === true || s.IsMakeup === true; }

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 6;
}
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Fetches a session's mentee/attendance list — unioned by menteeID across every round in its checkpoint group
// (`s._rounds`) when it has more than one. A single-round session with no makeup contribution is just the one
// fetch. (Rows built by LogsheetData.rows already carry `_mergedMentees`, which short-circuits this.)
async function fetchMergedMentees(s) {
  if (s._mergedMentees) return s._mergedMentees;
  const isMakeup = isMakeupSession(s);
  const rounds = s._rounds?.length > 1 ? s._rounds : [s];
  const extras = s._makeupExtras || [];

  const fetched = await Promise.all(rounds.map(async round => {
    const endpoint = isMakeup
      ? `SessionsAdmin/session/${round.sessionID}/requester`
      : `SessionsAdmin/session/${round.sessionID}/mentees`;
    const mentees = await apiRequest(endpoint, 'GET', null, true);
    return { sessionDate: round.sessionDate, timeEnd: round.timeEnd, proofFilePath: round.proofFilePath, mentees: mentees || [] };
  }));

  const allRounds = [...fetched, ...extras.map(e => ({ sessionDate: e.sessionDate, timeEnd: e.timeEnd, proofFilePath: e.proofFilePath, mentees: e.mentees }))];
  if (allRounds.length === 1) return allRounds[0].mentees;

  // Each mentee also carries which of their own source round/booking had proof uploaded (_hasProof) and that
  // round's own end time (_attendedEndTime).
  const byMentee = new Map();
  for (const round of allRounds) {
    for (const m of round.mentees) {
      const existing = byMentee.get(m.menteeID);
      if (!existing || (LogsheetData.attendanceState(m) === true && LogsheetData.attendanceState(existing) !== true)) {
        byMentee.set(m.menteeID, {
          ...m,
          _attendedDate: LogsheetData.scanISO(m.scannedAt),
          _attendedEndTime: round.timeEnd ? fmtTime(round.timeEnd) : null,
          _hasProof: !!round.proofFilePath,
        });
      }
    }
  }
  return [...byMentee.values()];
}

// ── The paper forms (shown in the viewer modal and serialised for the print windows) ──
function SigImg({ src, style, dash }) {
  const [failed, setFailed] = useState(false);
  if (failed) return dash ? '—' : null;
  return <img src={src} style={style} onError={() => setFailed(true)} />;
}
const MENTOR_SIG = { maxHeight: '60px', maxWidth: '190px', objectFit: 'contain', display: 'block', margin: '0 auto -10px', mixBlendMode: 'multiply', position: 'relative', zIndex: 1 };

function SigRow({ ctx, withDate = true }) {
  return (
    <div className="paper-sig-row">
      <div className="paper-sig-block wide">
        <div className="paper-sig-fit">{ctx.mentorSig ? <img src={CONFIG.getFileUrl(ctx.mentorSig)} style={MENTOR_SIG} /> : null}<div className="paper-sig-value">{ctx.mentorName}</div></div>
        <div className="paper-sig-line"></div>
        <div className="paper-sig-label">Mentor's Signature over printed name</div>
      </div>
      {withDate ? <div className="paper-sig-block paper-date-block"><div style={{ textAlign: 'center' }}><div className="paper-sig-value">{printDateLabel()}</div></div><div className="paper-sig-line"></div><div className="paper-sig-label">DATE</div></div> : null}
    </div>
  );
}

function LogsheetTab({ d, ctx }) {
  const { mentees, sessionNum, date, isMakeup } = d;
  const sessionLabel = isMakeup ? (sessionNum && sessionNum !== 'Session' ? `Make-Up: ${sessionNum}` : 'Make-Up') : sessionNum;
  // Regular and makeup sessions require persisted scan evidence for presence.
  const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);
  const hasProof = !!d.proofFilePath;
  const blankCount = Math.max(0, mentees.length - present.length);
  return (
    <div className="paper-form">
      <div className="paper-header">
        <img src="/IMAGES/FAITH-Colleges-Logo.png" className="paper-logo-img" onError={e => { e.target.style.display = 'none'; }} />
        <div className="paper-program">MENTORING PROGRAM</div>
        <div className="paper-program">{ctx.periodLabel}</div>
      </div>
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
              // A merged mentee carries the date of the round they actually attended.
              const mDate = m._attendedDate ? LogsheetData.day(m._attendedDate) : date;
              const mHasProof = m._hasProof !== undefined ? m._hasProof : hasProof;
              return (
                <tr key={i}>
                  <td>{mDate}</td>
                  <td>{m.menteeFirstName} {m.menteeLastName}</td>
                  <td>{LogsheetData.time(m.scannedAt)}</td>
                  <td>{LogsheetData.time(m._attendedEndTime)}</td>
                  <td className="sig-cell">{(mHasProof && m.signatureFilePath) ? <SigImg dash src={CONFIG.getFileUrl(m.signatureFilePath)} style={{ maxHeight: '44px', maxWidth: '120px', objectFit: 'contain' }} /> : null}</td>
                  <td>{m.remarks || ''}</td>
                </tr>
              );
            })}
            {Array.from({ length: blankCount }, (_, i) => <tr key={`b${i}`}><td></td><td></td><td></td><td></td><td className="sig-cell"></td><td></td></tr>)}
          </tbody>
        </table>
      </div>
      <SigRow ctx={ctx} />
    </div>
  );
}

function NotesTab({ d, ctx }) {
  const { mentees, date } = d;
  // For makeup sessions all approved requesters get notes entries; no blank rows.
  const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);
  const absent = mentees.filter(m => LogsheetData.attendanceState(m) === false);
  const entries = present.map((m, i) => {
    const name = `${m.menteeFirstName} ${m.menteeLastName}`;
    const mDate = m._attendedDate ? fmtDateShort(m._attendedDate) : date;
    return (
      <div className="note-entry" key={`p${i}`}>
        <div className="note-entry-header">
          <div className="note-field"><strong>Mentee's Name:</strong> <span className="note-field-val">{name}</span></div>
          <div className="note-field"><strong>Date of Mentoring:</strong> <span className="note-field-val">{mDate}</span></div>
        </div>
        {m.mentorNotes ? <><div className="note-line note-line-pre">{m.mentorNotes}</div><div className="note-line"></div></> : <><div className="note-line"></div><div className="note-line"></div></>}
      </div>
    );
  });
  // Blank entries for absent mentees
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
      <div className="paper-header"><img src="/IMAGES/FAITH-Colleges-Logo.png" className="paper-logo-img" onError={e => { e.target.style.display = 'none'; }} /></div>
      <div className="paper-form-title" style={{ textDecoration: 'none' }}>MENTOR'S NOTES</div>
      <div className="note-entries">{entries.length ? entries : <div style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>No mentees for this session.</div>}</div>
      <SigRow ctx={ctx} />
    </div>
  );
}

function NonAttendTab({ d, ctx }) {
  const { mentees, sessionNum, date, submittedDate, isMakeup } = d;
  const sessionRef = isMakeup ? (sessionNum && sessionNum !== 'Session' ? `Make-Up Session: ${sessionNum}` : 'Make-Up Session') : sessionNum;
  // A booking, note or unverified Present record does not establish absence.
  const absent = mentees.filter(m => LogsheetData.attendanceState(m) === false);
  const blankCount = Math.max(0, 15 - absent.length);
  return (
    <div className="paper-form">
      <div className="paper-header">
        <img src="/IMAGES/FAITH-Colleges-Logo.png" className="paper-logo-img" onError={e => { e.target.style.display = 'none'; }} />
        <div className="paper-program" style={{ fontWeight: 700 }}>MENTORING PROGRAM</div>
      </div>
      <div className="paper-form-title" style={{ textDecoration: 'none' }}>NON-ATTENDANCE OF MENTEES</div>
      <div className="paper-program-sub">{ctx.periodLabel}</div>
      <div className="na-instruction">
        <p><strong>Dear Mentors,</strong></p>
        <p style={{ marginTop: '6px' }}>Kindly list down the name/s of those who did not attend your scheduled mentoring session.
        Please submit this form to {ctx.guidanceOfficer} at the Guidance Office. Thank you!</p>
      </div>
      <SigRow ctx={ctx} withDate={false} />
      {absent.length || blankCount ? (
        <>
          <div className="paper-table-wrap">
            <table className="paper-table">
              <thead><tr><th style={{ width: '40%' }}>NAME</th><th style={{ width: '25%' }}>COURSE</th><th>REASON</th></tr></thead>
              <tbody>
                {absent.map((m, i) => {
                  // Makeup sessions return only the section fragment; reconstruct the full code from course + fragment
                  const secDisplay = isMakeup && m.course ? `${m.course} ${m.sectionCode || ''}`.trim() : (m.sectionCode || '');
                  return <tr key={i}><td>{m.menteeFirstName} {m.menteeLastName}</td><td>{secDisplay}</td><td>{m.absenceReason || ''}</td></tr>;
                })}
                {Array.from({ length: blankCount }, (_, i) => <tr key={`b${i}`}><td></td><td></td><td></td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="na-note">Please use another separate sheet if the space provided is not enough.</p>
          <p className="na-note">Thank you.</p>
        </>
      ) : (
        <div className="na-all-present">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
          No recorded absences for this session.
        </div>
      )}
      <div className="na-ack">
        <div className="na-ack-title">ACKNOWLEDGEMENT RECEIPT</div>
        <div className="na-ack-sub">MENTOR'S REPORT</div>
        <div className="na-ack-fields">
          <div className="na-ack-field"><span className="na-field-label">NAME OF MENTOR:</span><span className="ack-val">{ctx.mentorName}</span></div>
          <div className="na-ack-field"><span className="na-field-label">MENTORING SESSION:</span><span className="ack-val">{sessionRef} — {date}</span></div>
          <div className="na-ack-field"><span className="na-field-label">DATE SUBMITTED:</span><span className="ack-val">{submittedDate}</span></div>
          <div className="na-ack-field"><span className="na-field-label">RECEIVED BY:</span><span className="ack-val ack-blank"></span></div>
          <div className="na-ack-field"><span className="na-field-label">DATE RECEIVED:</span><span className="ack-val ack-blank"></span></div>
        </div>
      </div>
    </div>
  );
}

const FORM = { logsheet: LogsheetTab, notes: NotesTab, nonattend: NonAttendTab };

export default function AdminMentorDetail() {
  useBackGuard();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mentorId = parseInt(params.get('id'), 10);
  const school = params.get('school');

  const [sysSettings, setSysSettings] = useState({ SchoolYear: '2026-2027', Semester: '1st Semester', GuidanceOfficer: 'Guidance Officer' });
  const [mentor, setMentor] = useState(null);
  const [monData, setMonData] = useState(null);
  const [statusCalendar, setStatusCalendar] = useState([]);
  const [allSessions, setAllSessions] = useState(null);     // null while loading
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [period, setPeriod] = useState('');
  const [printMenu, setPrintMenu] = useState(false);
  const [viewer, setViewer] = useState(null);               // { data, tab, state: 'loading' | 'error' | 'ready' }
  const [proof, setProof] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!mentorId) return;
    (async () => {
      let settings = sysSettings;
      try {
        const data = await apiRequest('Settings', 'GET', null, true);
        if (data) { settings = { ...sysSettings, ...data }; setSysSettings(settings); }
      } catch (e) { /* use defaults */ }
      try {
        const [sessData, mon, calendar] = await Promise.all([
          apiRequest(`SessionsAdmin/${mentorId}/sessions`, 'GET', null, true),
          apiRequest(`MonitorActivities/${mentorId}`, 'GET', null, true).catch(() => null),
          apiRequest('CalendarEvents', 'GET', null, true).catch(() => []),
        ]);
        setStatusCalendar(calendar || []);
        setMentor(sessData.mentor || null);
        setMonData(mon);
        const logsheet = await apiRequest(`SessionsAdmin/${mentorId}/logsheet`, 'GET', null, true);
        setAllSessions(await LogsheetData.withReportStatuses(LogsheetData.rows(logsheet.sessions || [], sessData.sessions || []), mentorId));
      } catch (e) {
        console.error('Error loading sessions detail:', e);
        setErrorMsg('Failed to load session data. Please refresh.');
      }
    })();
  }, []);

  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '';
  useEffect(() => { if (mentor) document.title = `${mentorName} — Admin Portal`; }, [mentor]);

  // a click anywhere closes the Print All menu
  useEffect(() => {
    if (!printMenu) return;
    const close = () => setPrintMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [printMenu]);

  if (!mentorId) return <Navigate to="/admin/monitoring" replace />;

  const sessions = allSessions || [];
  const sections = [...new Set(sessions.flatMap(s => (s.sections || '').split(',').map(x => x.trim()).filter(Boolean)))].sort();
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
  const effPeriod = periods.some(p => p.key === period) ? period : '';

  const q = search.trim().toLowerCase();
  const filtered = sessions.filter(s => {
    if (q && !(s.topic || '').toLowerCase().includes(q)) return false;
    if (statusFilter && sessionDisplayStatus(s, statusCalendar) !== statusFilter) return false;
    if (effPeriod && `${s.schoolYear}|${s.semester}` !== effPeriod) return false;
    if (section) {
      const sessionSections = (s.sections || '').split(',').map(x => x.trim());
      if (!sessionSections.includes(section)) return false;
    }
    return true;
  });
  const resetDetailFilters = () => { setSearch(''); setSection(''); setStatusFilter(''); setPeriod(''); };

  // ── Hero ──
  const initials = mentor ? ((mentor.firstName?.[0] || '') + (mentor.lastName?.[0] || '')).toUpperCase() : '—';
  const avIdx = mentor ? avatarIndex(mentor.firstName + mentor.lastName) : 0;
  const heroMetaItems = mentor ? [
    mentor.school && <span className="hero-meta-item" key="s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>{mentor.school}</span>,
    mentor.department && <span className="hero-meta-item" key="d"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>{mentor.department}</span>,
    mentor.email && <span className="hero-meta-item" key="e"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>{mentor.email}</span>,
  ].filter(Boolean) : [];
  const sectionTags = mentor ? (mentor.sections || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  const crumbSchool = school || mentor?.school || '';
  const tierCls = { Excellent: 'excellent', 'On Track': 'on-track', 'Needs Attention': 'needs-attention', 'Not Started': 'not-started' };
  const hasTier = !!(mentor && monData?.progressStatus);
  const tier = hasTier ? mentorTierGroup(monData.progressStatus, monData.completedSessions ?? monData.CompletedSessions ?? 0) : '';
  const backTo = school ? `/admin/monitoring?school=${encodeURIComponent(school)}` : '/admin/monitoring';

  // ── Logsheet viewer ──
  const ctxFor = d => ({
    mentorName, mentorSig: mentor?.signatureFilePath || '',
    periodLabel: LogsheetData.periodLabel(sessions.find(s => s.sessionID === d?.sessionId) || {}),
    guidanceOfficer: sysSettings.GuidanceOfficer,
  });
  function dataFor(s) {
    const date = s.sessionDate ? new Date(s.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    // Distinct from `date` above — blank if never submitted, not the session date.
    const submittedDate = s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    return {
      sessionId: s.sessionID, sessionNum: s.slotName || 'Session', date, submittedDate, topic: s.topic || 'Mentoring Session',
      timeStart: LogsheetData.time(s.actualStart), timeEnd: LogsheetData.time(s.actualEnd),
      mentees: [], proofFilePath: s.proofFilePath || null, logStatus: s.logStatus === 'Submitted' ? 'Submitted' : null, isMakeup: isMakeupSession(s),
    };
  }
  async function openLogsheet(sessionId) {
    const s = allSessions.find(x => x.sessionID === sessionId);
    if (!s) return;
    const d = dataFor(s);
    const sessionLabel = d.isMakeup ? (s.slotName ? `Make-Up Session: ${s.slotName}` : 'Make-up Session') : d.sessionNum;
    setViewer({ data: d, tab: 'logsheet', label: sessionLabel, state: d.logStatus === 'Submitted' ? 'loading' : 'ready' });
    if (d.logStatus !== 'Submitted') return;
    try {
      // fetchMergedMentees unions every round in this checkpoint's group when it has more than one.
      const mentees = await fetchMergedMentees(s);
      setViewer(v => v && v.data.sessionId === sessionId ? { ...v, data: { ...v.data, mentees }, state: 'ready' } : v);
    } catch (e) {
      setViewer(v => v && v.data.sessionId === sessionId ? { ...v, state: 'error' } : v);
    }
  }
  const closeLogsheet = () => setViewer(null);

  let tabContent = null;
  if (viewer) {
    if (viewer.data.logStatus !== 'Submitted') {
      tabContent = (
        <div className="lm-not-submitted">
          <div className="lm-ns-icon"><i className="ti ti-clock-pause"></i></div>
          <div className="lm-ns-title">Logsheet Not Submitted</div>
          <div className="lm-ns-body">The mentor has not submitted this logsheet yet.</div>
        </div>
      );
    } else if (viewer.state === 'loading') tabContent = <div className="tab-loading"><span className="spinner"></span> Loading…</div>;
    else if (viewer.state === 'error') tabContent = <div className="tab-loading">Failed to load logsheet data.</div>;
    else { const Form = FORM[viewer.tab]; tabContent = <Form d={viewer.data} ctx={ctxFor(viewer.data)} />; }
  }

  const TAB_TITLES = { all: 'All Forms', logsheet: 'Mentoring Logsheet', notes: "Mentor's Notes", nonattend: 'Non-Attendance Report' };
  function openPrintWindow(title, previewLabel, body) {
    const w = window.open('', '_blank', 'width=900,height=750');
    if (!w) { setErrorMsg('Pop-up blocked. Please allow pop-ups for this page and try again.'); return; }
    w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>${getLogsheetPrintStyles('#2563eb', '#1d4ed8')}</style>
</head>
<body>
  <div class="action-bar">
    <span class="action-bar-title">Preview — ${previewLabel} &nbsp;·&nbsp; ${escHtml(mentorName)}</span>
    <div class="action-bar-btns">
      <button class="ab-btn ab-btn-print" onclick="window.print()">&#128438; Print / Save as PDF</button>
      <button class="ab-btn ab-btn-close" onclick="window.close()">&#10005; Close</button>
    </div>
  </div>
  <div class="print-body">${body}</div>
</body>
</html>`);
    w.document.close();
    w.focus();
  }
  function printCurrentTab() {
    if (!viewer || viewer.state !== 'ready') return;
    const tabLabel = TAB_TITLES[viewer.tab] || 'Logsheet';
    const Form = FORM[viewer.tab];
    openPrintWindow(`FAITH Colleges — ${tabLabel} — ${escHtml(mentorName)}`, tabLabel, renderToStaticMarkup(<Form d={viewer.data} ctx={ctxFor(viewer.data)} />));
  }

  // PRINT ALL SESSIONS — builds every Submitted session's form the same way the viewer does, then combines them into
  // one print window with a page break between each session.
  async function printAllSessions(formType = 'logsheet') {
    setPrintMenu(false);
    const submitted = sessions.filter(s => s.logStatus === 'Submitted');
    if (!submitted.length) { setErrorMsg('No submitted logsheets to print yet.'); return; }

    const blocks = [];
    for (const s of submitted) {
      const d = dataFor(s);
      d.logStatus = 'Submitted';
      try {
        d.mentees = await fetchMergedMentees(s);
        const ctx = ctxFor(d);
        // 'all' = each session's full set: Logsheet, Mentor's Notes, Non-Attendance.
        const forms = formType === 'all' ? ['logsheet', 'notes', 'nonattend'] : [formType];
        for (const form of forms) {
          const Form = FORM[form] || LogsheetTab;
          blocks.push(renderToStaticMarkup(<Form d={d} ctx={ctx} />));
        }
      } catch (e) {
        console.error(`Failed to load session ${s.sessionID} for print-all:`, e);
      }
    }
    if (!blocks.length) { setErrorMsg('Failed to load logsheet data. Please try again.'); return; }

    const tabLabel = TAB_TITLES[formType] || 'Logsheet';
    const pages = blocks.map(b => `<div class="print-all-page">${b}</div>`).join('');
    openPrintWindow(`FAITH Colleges — ${tabLabel} — All Sessions — ${escHtml(mentorName)}`, `${tabLabel} — All Sessions`, pages);
  }

  // ── Session rows ──
  let sessionList;
  if (allSessions === null) sessionList = <Empty className="empty-state"><span className="spinner"></span> Loading…</Empty>;
  else if (!filtered.length) sessionList = <Empty className="empty-state">No sessions recorded yet.</Empty>;
  else {
    sessionList = filtered.map((s, idx) => {
      const date = s.sessionDate ? new Date(s.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
      const timeStart = LogsheetData.time(s.actualStart);
      const timeEnd = LogsheetData.time(s.actualEnd);
      const sectionDisplay = (s.sections || '').split(',').map(x => x.trim()).filter(Boolean).join(' · ')
        || (s.topic || 'Mentoring Session').replace(/^\[[^\]]+\]\s*/, '');
      const topic = s.topic || 'Mentoring Session';
      const displayStatus = sessionDisplayStatus(s, statusCalendar);
      const statusCls = (displayStatus === 'In Progress' ? 'Scheduled' : displayStatus === 'Closed' ? 'Cancelled' : displayStatus).toLowerCase();
      const isMakeup = isMakeupSession(s);

      const attVal = s.totalAttendees > 0 ? `${s.presentCount}/${s.totalAttendees} Attendance` : '— Attendance';
      const attCls = s.totalAttendees === 0 ? 'empty' : s.presentCount === s.totalAttendees ? 'full' : 'partial';

      // A merged checkpoint card can have proof from more than one round/booking; list every one that uploaded a photo.
      const proofSources = [...(s._proofSources || [])];
      if (!s._proofSources && s.proofFilePath) proofSources.push({ filePath: s.proofFilePath, fileType: s.proofFileType, label: 'Round 1' });
      (s._rounds || []).slice(1).forEach((r, i) => {
        if (r.proofFilePath) proofSources.push({ filePath: r.proofFilePath, fileType: r.proofFileType, label: `Round ${i + 2}` });
      });
      (s._makeupExtras || []).forEach((e, i) => {
        if (e.proofFilePath) proofSources.push({ filePath: e.proofFilePath, fileType: e.proofFileType, label: (s._makeupExtras.length > 1 ? `Make-up ${i + 1}` : 'Make-up') });
      });
      const proofTitle = 'Session Proof — ' + date;
      const proofHtml = proofSources.length === 0
        ? <span className="sr-metric empty sr-metric--no-proof">No Proof</span>
        : proofSources.length === 1
          ? <span className="sr-metric proof sr-proof-pill">
              <button type="button" className="sr-proof-view" onClick={e => { e.stopPropagation(); viewProof(proofSources[0].filePath, proofSources[0].fileType || '', proofTitle); }}>Proof</button>
              <span className="sr-proof-sep">|</span>
              <a className="sr-proof-dl" href={CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(proofSources[0].filePath))} onClick={e => e.stopPropagation()} title="Download proof"><i className="ti ti-download"></i></a>
            </span>
          : <span className="sr-metric proof sr-proof-pill">
              <button type="button" className="sr-proof-view sr-proof-view--gallery" onClick={e => { e.stopPropagation(); openProofGallery(proofSources, proofTitle); }}>Proof ({proofSources.length})</button>
            </span>;

      // Logsheet status — Draft is treated as not submitted (invisible to admin)
      const logStatus = s.logStatus === 'Submitted' ? 'Submitted' : null;
      const deadlineLabel = s.slotName && s.status !== 'Cancelled' ? LogsheetData.reportStatus(s, statusCalendar) : '';
      const deadlineClass = deadlineLabel.includes('Overdue') ? 'overdue'
        : deadlineLabel === 'Submitted Late' ? 'late'
        : deadlineLabel === 'Submitted On Time' ? 'on-time' : 'pending';

      return (
        <div className={`session-row ${logStatus === 'Submitted' ? '' : 'sr-row--no-logsheet'}`} key={s.sessionID ?? idx}
          onClick={logStatus === 'Submitted' ? () => openLogsheet(s.sessionID) : undefined}>
          <div className="sr-label">
            <div className="sr-title-group">
              <span className="sr-num">{isMakeup ? (s.slotName ? `Make-Up Session: ${s.slotName}` : 'Make-up Session') : (s.slotName || 'Session')}</span>
              {deadlineLabel ? <span className={`sr-deadline-badge ${deadlineClass}`}>{deadlineLabel}</span> : null}
            </div>
            <span className={`badge-status ${statusCls}`}>{displayStatus}</span>
          </div>
          <div className="sr-info">
            <div className="sr-section" title={topic}>{sectionDisplay}</div>
            <div className="sr-when">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              <span>{date}</span>
              <span className="sr-when-sep">·</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <span>{timeStart} – {timeEnd}</span>
            </div>
            {s.roundDates?.length > 1
              ? <span className="sr-conducted-note" onClick={e => e.stopPropagation()} style={{ cursor: 'default' }} title={s.roundDates.map(rd => fmtDateShort(rd)).join(', ')}><i className="ti ti-repeat" aria-hidden="true"></i>{s.roundDates.length} sessions conducted</span>
              : null}
          </div>
          <div className="sr-right">
            <div className="sr-metrics">
              <span className={`sr-metric ${attCls}`} onClick={e => e.stopPropagation()} style={{ cursor: 'default' }}>{attVal}</span>
              {proofHtml}
            </div>
            {logStatus === 'Submitted'
              ? <button className="sr-view-btn" onClick={e => { e.stopPropagation(); openLogsheet(s.sessionID); }}>View Logsheet</button>
              : <button className="sr-view-btn sr-view-btn--pending" disabled onClick={e => e.stopPropagation()}>View Logsheet</button>}
          </div>
        </div>
      );
    });
  }

  // ── Proof lightbox ──
  // A single source opens straight into the single-photo lightbox; 2+ sources show a thumbnail grid first.
  function openProofGallery(sources, title) {
    if (!sources || !sources.length) return;
    if (sources.length === 1) { viewProof(sources[0].filePath, sources[0].fileType, title || 'Session Proof'); return; }
    setProof({ sources, title: title || 'Session Proof' });
  }
  function viewProof(filePath, fileType, title) { setProof({ filePath, fileType, title: title || 'Session Proof' }); }

  const logsheetModal = (
    <Overlay open={!!viewer} className="modal-overlay" activeClass={null} display="flex" id="logsheetOverlay"
      onClick={e => { if (e.target === e.currentTarget) closeLogsheet(); }}>
      <div className="logsheet-modal" onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div>
            <div className="lm-title-row">
              <div className="lm-title" id="lmSessionLabel">{viewer ? viewer.label : 'Mentoring Logsheet'}</div>
              <span className={viewer?.data.logStatus === 'Submitted' ? 'lm-logstatus-badge lm-logstatus--submitted' : 'lm-logstatus-badge'} id="lmLogStatusBadge"
                style={{ display: viewer?.data.logStatus === 'Submitted' ? '' : 'none' }}>{viewer?.data.logStatus === 'Submitted' ? '✓ Submitted' : ''}</span>
            </div>
            <div className="lm-sub" id="lmSubtitle">{viewer ? `${viewer.data.date} · ${viewer.data.timeStart} – ${viewer.data.timeEnd} · ${viewer.data.topic.replace(/^\[[^\]]+\]\s*/, '')}` : ''}</div>
          </div>
          <button className="lm-close" onClick={() => closeLogsheet()}>&times;</button>
        </div>
        <div className="lm-tabs">
          {[['logsheet', 'Mentoring Logsheet'], ['notes', "Mentor's Notes"], ['nonattend', 'Non-Attendance Report']].map(([t, label]) => (
            <button key={t} className={`lm-tab${viewer?.tab === t ? ' active' : ''}`} data-tab={t}
              onClick={() => setViewer(v => ({ ...v, tab: t }))}>{label}</button>
          ))}
        </div>
        <div className="lm-body"><div id="tabContent">{tabContent}</div></div>
        <div className="lm-footer">
          <button className="btn-outline" onClick={() => closeLogsheet()}>Close</button>
          <button className="btn-primary" onClick={printCurrentTab} disabled={viewer?.data.logStatus !== 'Submitted'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print / Export PDF
          </button>
        </div>
      </div>
    </Overlay>
  );

  const errorModal = (
    <Overlay open={errorMsg !== null} className="info-modal-overlay" activeClass={null} display="flex" id="errorModal">
      <div className="info-modal">
        <div className="info-modal-icon danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <h3 className="info-modal-title">Something went wrong</h3>
        <p className="info-modal-message" id="errorMessage">{errorMsg ?? 'An error occurred.'}</p>
        <button className="btn-primary" onClick={() => setErrorMsg(null)} style={{ width: '100%', justifyContent: 'center' }}>OK</button>
      </div>
    </Overlay>
  );

  return (
    <Page id="ADMIN_/sessions-detail">
      <div className="main-wrapper">
        <main className="page-content">
          {<nav className="mm-crumbs" id="mmCrumbs" aria-label="Breadcrumb">
        <Link to="/admin/monitoring">Mentor Monitoring</Link>
        {mentor ? <>
          {crumbSchool ? <><span className="mm-crumb-sep" aria-hidden="true">&rsaquo;</span><Link to={`/admin/monitoring?school=${encodeURIComponent(crumbSchool)}`}>{crumbSchool}</Link></> : null}
          <span className="mm-crumb-sep" aria-hidden="true">&rsaquo;</span><span className="mm-crumb-current" aria-current="page">{mentorName}</span>
        </> : <><span className="mm-crumb-sep" aria-hidden="true">&rsaquo;</span><span className="mm-crumb-current" aria-current="page">Mentor</span></>}
      </nav>}
          <div className="detail-back-bar">
            <Link to="/admin/monitoring" className="btn-back" onClick={e => { e.preventDefault(); navigate(backTo); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {' '}
              Back to Mentor Monitoring
            </Link>
          </div>
          {/* Mentor hero */}
          <div className="mentor-hero" id="mentorHero">
            <div className={`hero-avatar av-${avIdx}`} id="heroAvatar">{initials}</div>
            <div className="hero-info">
              {null}
              <div className="hero-name-row">
                <div className="hero-name" id="heroName">{mentor ? mentorName : 'Loading…'}</div>
                <div className="sd-badge-wrap">
                  <span className={hasTier ? `hero-badge ${tierCls[tier] || ''}` : 'hero-badge'} id="heroBadge" style={{ display: hasTier ? '' : 'none' }}>{tier}</span>
                  <div className="sd-tip-wrap" id="sdTipWrap" style={{ display: hasTier ? '' : 'none' }}>
                    <i className="ti ti-alert-circle sd-tip-icon"></i>
                    <div className="sd-tip-box" id="sdTipBox">
                      {hasTier ? <>
        <div className="sd-tip-title">Overall Performance Guide</div>
        <div className="sd-tip-row">Timeliness (25%) + Completeness (25%) + Evaluation Rating (50%).</div>
        <div className="sd-tip-row"><span className="sd-dot excellent"></span><span><strong>Excellent</strong> — ≥80%</span></div>
        <div className="sd-tip-row"><span className="sd-dot on-track"></span><span><strong>On Track</strong> — 50–79%</span></div>
        <div className="sd-tip-row"><span className="sd-dot needsattention"></span><span><strong>Needs Attention</strong> — below 50%, with at least one completed session</span></div>
        <div className="sd-tip-row"><span className="sd-dot notstarted"></span><span><strong>Not Started</strong> — no completed sessions this semester</span></div>
      </> : null}
                    </div>
                  </div>
                </div>
              </div>
              {null}
              <div className="hero-meta" id="heroMeta">{mentor ? (heroMetaItems.length ? heroMetaItems : 'Mentor') : null}</div>
            </div>
            {null}
          </div>
          {/* Session cards */}
          <div className="sessions-section">
            <div className="sessions-section-head">
              <div>
                <span className="sessions-section-title">Mentoring Sessions</span>
                {' '}
                <span id="sessionCount" className="sessions-section-count">
                  {allSessions !== null ? `${filtered.length} session${filtered.length !== 1 ? 's' : ''}` : ''}
                </span>
              </div>
              <div className="print-btn-group" onClick={e => e.stopPropagation()}>
                <button className="btn-print-main" onClick={() => printAllSessions('all')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  {' '}
                  Print All
                </button>
                {' '}
                <button className="btn-print-caret" onClick={() => setPrintMenu(o => !o)}>
                  <i className="ti ti-chevron-down"></i>
                </button>
                <div className={printMenu ? 'print-dropdown open' : 'print-dropdown'} id="printMenu-all">
                  <button className="print-drop-item" onClick={() => printAllSessions('all')}>
                    <i className="ti ti-files"></i>
                    {' '}
                    All Forms
                  </button>
                  {' '}
                  <button className="print-drop-item" onClick={() => printAllSessions('logsheet')}>
                    <i className="ti ti-clipboard-list"></i>
                    {' '}
                    Logsheet
                  </button>
                  {' '}
                  <button className="print-drop-item" onClick={() => printAllSessions('notes')}>
                    <i className="ti ti-notes"></i>
                    {' '}
                    Mentor's Notes
                  </button>
                  {' '}
                  <button className="print-drop-item" onClick={() => printAllSessions('nonattend')}>
                    <i className="ti ti-user-x"></i>
                    {' '}
                    Non-Attendance
                  </button>
                </div>
              </div>
            </div>
            <div className="toolbar" style={{ marginBottom: "16px" }}>
              <div className="search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {' '}
                <input type="text" id="topicSearch" placeholder="Search by topic…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {<Select className="filter-select" id="sectionFilter" value={section} onChange={e => setSection(e.target.value)}><option value="">All Sections</option>{sections.map(sec => <option key={sec} value={sec}>{sec}</option>)}</Select>}
              {' '}
              {<Select className="filter-select" id="statusFilter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All Statuses</option><option value="Scheduled">Scheduled</option><option value="In Progress">In Progress</option><option value="Closed">Closed</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option></Select>}
              {' '}
              {<Select className="filter-select" id="periodFilter" value={effPeriod} onChange={e => setPeriod(e.target.value)}><option value="">All School Years</option>{periods.map(p => <option key={p.key} value={p.key}>{`${p.semester}, SY ${p.schoolYear}`}</option>)}</Select>}
              {' '}
              <button className="filter-reset" onClick={resetDetailFilters}>Clear</button>
            </div>
            <div className="session-list" id="sessionCardsGrid">{sessionList}</div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      {/* ── Logsheet Modal ──────────────────────────────────────── */}
      {logsheetModal}
      {/* ── Proof Lightbox ──────────────────────────────────────── */}
      {<ProofLightbox proof={proof} onClose={() => setProof(null)} onSelect={setProof} />}
      {/* ── Error Modal ─────────────────────────────────────────── */}
      {errorModal}
    </Page>
  );
}
