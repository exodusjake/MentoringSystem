import { useEffect, useState } from 'react';
import { printDateLabel } from '../../lib/printDate.js';
import { Navigate, useNavigate, useSearchParams, Link } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { sessionDisplayStatus } from '../../lib/dashboard-sessions.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { buildMentorNotesForm, buildNonAttendanceForm, buildPrintForm, lsEsc, openLogsheetPrintWindow } from '../../lib/logsheetForms.js';

// HEAD/HTML/mentor-detail.html + HEAD/JS/mentor-detail.js

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Critical';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

const isMakeupSession = s => s.isMakeup === true;
const lsFmtDateShort = value => LogsheetData.day(value);

const MetaIcon = ({ children }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;

// One truncated session description with a See more / See less toggle (toggleSesDesc).
function SesDesc({ trunc, full }) {
  const [expanded, setExpanded] = useState(false);
  const long = trunc !== full;
  return (
    <div className="ses-desc">
      <span className="ses-desc-text">{expanded ? full : trunc}</span>
      {long ? <button type="button" className="ses-desc-more" onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}>{expanded ? 'See less' : 'See more'}</button> : null}
    </div>
  );
}

// A signature image that turns into an em dash (or hides) when it fails to load, as the inline onerror did.
function SigImg({ src, style, mode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return mode === 'dash' ? '—' : null;
  return <img src={src} style={style} onError={() => setFailed(true)} />;
}
const MENTOR_SIG_STYLE = { maxHeight: '60px', maxWidth: '190px', objectFit: 'contain', display: 'block', margin: '0 auto -10px', mixBlendMode: 'multiply', position: 'relative', zIndex: 1 };

function MentorSig({ mentor }) {
  return mentor?.signatureFilePath ? <SigImg src={CONFIG.getFileUrl(mentor.signatureFilePath)} style={MENTOR_SIG_STYLE} /> : null;
}

// ── The paper forms shown in the logsheet viewer modal ──
function PaperHeader({ periodLabel, program = true, bold = false }) {
  return (
    <div className="paper-header">
      <img src="/IMAGES/FAITH-Colleges-Logo.png" className="paper-logo-img" onError={e => { e.target.style.display = 'none'; }} />
      {program ? <div className="paper-program" style={bold ? { fontWeight: 700 } : undefined}>MENTORING PROGRAM</div> : null}
      {periodLabel !== undefined ? <div className="paper-program">{periodLabel}</div> : null}
    </div>
  );
}

function SigRow({ mentor, withDate = true }) {
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  return (
    <div className="paper-sig-row">
      <div className="paper-sig-block wide">
        <div className="paper-sig-fit"><MentorSig mentor={mentor} /><div className="paper-sig-value">{mentorName}</div></div>
        <div className="paper-sig-line"></div>
        <div className="paper-sig-label">Mentor's Signature over printed name</div>
      </div>
      {withDate ? (
        <div className="paper-sig-block paper-date-block">
          <div style={{ textAlign: 'center' }}><div className="paper-sig-value">{printDateLabel()}</div></div>
          <div className="paper-sig-line"></div>
          <div className="paper-sig-label">DATE</div>
        </div>
      ) : null}
    </div>
  );
}

function LogsheetTab({ d, mentor, periodLabel }) {
  const { mentees, sessionNum, date, isMakeup } = d;
  const sessionLabel = isMakeup ? (sessionNum && sessionNum !== 'Session' ? `Make-Up: ${sessionNum}` : 'Make-Up') : sessionNum;
  const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);
  const hasProof = !!d.proofFilePath;
  const blankCount = Math.max(0, mentees.length - present.length);
  return (
    <div className="paper-form">
      <div className="paper-header">
        <img src="/IMAGES/FAITH-Colleges-Logo.png" className="paper-logo-img" onError={e => { e.target.style.display = 'none'; }} />
        <div className="paper-program">MENTORING PROGRAM</div>
        <div className="paper-program">{periodLabel}</div>
      </div>
      <div className="paper-form-title">MENTORING LOGSHEET</div>
      <div className="paper-session-label">
        <span className="paper-session-underline">{sessionLabel}</span> Session
      </div>
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
            {present.map((m, i) => {
              // A merged mentee carries their own source session's date (_attendedDate) and proof status (_hasProof).
              const mDateStr = m._attendedDate ? lsFmtDateShort(m._attendedDate) : date;
              const mHasProof = m._hasProof !== undefined ? m._hasProof : hasProof;
              return (
                <tr key={i}>
                  <td>{mDateStr}</td>
                  <td>{m.menteeName}</td>
                  <td>{LogsheetData.time(m.scannedAt)}</td>
                  <td>{LogsheetData.time(m._attendedEndTime)}</td>
                  <td className="sig-cell">{(mHasProof && m.signatureFilePath) ? <SigImg mode="dash" src={CONFIG.getFileUrl(m.signatureFilePath)} style={{ maxHeight: '44px', maxWidth: '120px', objectFit: 'contain' }} /> : null}</td>
                  <td>{m.remarks || ''}</td>
                </tr>
              );
            })}
            {Array.from({ length: blankCount }, (_, i) => <tr key={`b${i}`}><td></td><td></td><td></td><td></td><td className="sig-cell"></td><td></td></tr>)}
          </tbody>
        </table>
      </div>
      <SigRow mentor={mentor} />
    </div>
  );
}

function NotesTab({ d, mentor }) {
  const { mentees, date } = d;
  const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);
  const absent = mentees.filter(m => LogsheetData.attendanceState(m) === false);
  const entries = present.map((m, i) => {
    const mDateStr = m._attendedDate ? lsFmtDateShort(m._attendedDate) : date;
    return (
      <div className="note-entry" key={`p${i}`}>
        <div className="note-entry-header">
          <div className="note-field"><strong>Mentee's Name:</strong> <span className="note-field-val">{m.menteeName}</span></div>
          <div className="note-field"><strong>Date of Mentoring:</strong> <span className="note-field-val">{mDateStr}</span></div>
        </div>
        {m.mentorNotes
          ? <><div className="note-line note-line-pre">{m.mentorNotes}</div><div className="note-line"></div></>
          : <><div className="note-line"></div><div className="note-line"></div></>}
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
      <div className="paper-header">
        <img src="/IMAGES/FAITH-Colleges-Logo.png" className="paper-logo-img" onError={e => { e.target.style.display = 'none'; }} />
      </div>
      <div className="paper-form-title" style={{ textDecoration: 'none' }}>MENTOR'S NOTES</div>
      <div className="note-entries">{entries.length ? entries : <div style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>No mentees for this session.</div>}</div>
      <SigRow mentor={mentor} />
    </div>
  );
}

function NonAttendTab({ d, mentor, periodLabel, guidanceOfficer, submittedDate }) {
  const { mentees, sessionNum, date, isMakeup } = d;
  const sessionRef = isMakeup ? (sessionNum && sessionNum !== 'Session' ? `Make-Up Session: ${sessionNum}` : 'Make-Up Session') : sessionNum;
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const absent = mentees.filter(m => LogsheetData.attendanceState(m) === false);
  const blankCount = Math.max(0, 15 - absent.length);
  return (
    <div className="paper-form">
      <div className="paper-header">
        <img src="/IMAGES/FAITH-Colleges-Logo.png" className="paper-logo-img" onError={e => { e.target.style.display = 'none'; }} />
        <div className="paper-program" style={{ fontWeight: 700 }}>MENTORING PROGRAM</div>
      </div>
      <div className="paper-form-title" style={{ textDecoration: 'none' }}>NON-ATTENDANCE OF MENTEES</div>
      <div className="paper-program-sub">{periodLabel}</div>
      <div className="na-instruction">
        <p><strong>Dear Mentors,</strong></p>
        <p style={{ marginTop: '6px' }}>Kindly list down the name/s of those who did not attend your scheduled mentoring session.
        Please submit this form to {guidanceOfficer} at the Guidance Office. Thank you!</p>
      </div>
      <SigRow mentor={mentor} withDate={false} />
      {absent.length || blankCount ? (
        <>
          <div className="paper-table-wrap">
            <table className="paper-table">
              <thead><tr><th style={{ width: '40%' }}>NAME</th><th style={{ width: '25%' }}>COURSE</th><th>REASON</th></tr></thead>
              <tbody>
                {absent.map((m, i) => <tr key={i}><td>{m.menteeName}</td><td>{m.sectionCode || ''}</td><td>{m.absenceReason || ''}</td></tr>)}
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
          <div className="na-ack-field"><span className="na-field-label">NAME OF MENTOR:</span><span className="ack-val">{mentorName}</span></div>
          <div className="na-ack-field"><span className="na-field-label">MENTORING SESSION:</span><span className="ack-val">{sessionRef} — {date}</span></div>
          <div className="na-ack-field"><span className="na-field-label">DATE SUBMITTED:</span><span className="ack-val">{submittedDate}</span></div>
          <div className="na-ack-field"><span className="na-field-label">RECEIVED BY:</span><span className="ack-val ack-blank"></span></div>
          <div className="na-ack-field"><span className="na-field-label">DATE RECEIVED:</span><span className="ack-val ack-blank"></span></div>
        </div>
      </div>
    </div>
  );
}

export default function HeadMentorDetail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mentorId = parseInt(params.get('id'), 10);
  const school = params.get('school');

  const [hero, setHero] = useState(null);
  const [fillPct, setFillPct] = useState(0);
  const [loadState, setLoadState] = useState('loading');
  const [allSessions, setAllSessions] = useState([]);
  const [allMentees, setAllMentees] = useState([]);
  const [logsheetMap, setLogsheetMap] = useState({});     // sessionID → full session data with mentees
  const [logMentor, setLogMentor] = useState(null);
  const [statusCalendar, setStatusCalendar] = useState([]);
  const [guidanceOfficer, setGuidanceOfficer] = useState('the Guidance Office');
  const [statusFilter, setStatusFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [menteeSearch, setMenteeSearch] = useState('');
  const [closedGroups, setClosedGroups] = useState(() => new Set());
  const [printMenu, setPrintMenu] = useState(false);
  const [viewer, setViewer] = useState(null);             // { data, tab }
  const [proof, setProof] = useState({ open: false, mode: null, path: null, sources: null });
  const [dlHidden, setDlHidden] = useState(false);

  useEffect(() => {
    if (!mentorId) return;
    (async () => {
      try {
        const [data, sessData, logsheet, settings, calendar] = await Promise.all([
          apiRequest(`MonitorActivities/${mentorId}`, 'GET', null, true),
          // Same richer session list Admin's own Sessions Detail page reads (SectionCode/SlotName/TimeEnd/IsMakeup/
          // ProofFileType/SchoolYear/Semester/LogStatus) — MonitorActivities/{id}'s own "sessions" field is a leaner
          // shape that can't drive the session-row card below.
          apiRequest(`SessionsAdmin/${mentorId}/sessions`, 'GET', null, true).catch(() => null),
          apiRequest(`SessionsAdmin/${mentorId}/logsheet`, 'GET', null, true).catch(() => null),
          apiRequest('Settings', 'GET', null, true).catch(() => null),
          apiRequest('CalendarEvents', 'GET', null, true).catch(() => []),
        ]);

        if (!data) { navigate('/head/monitoring', { replace: true }); return; }

        setStatusCalendar(calendar || []);
        setHero(data);
        setTimeout(() => setFillPct(Math.round(data.progressPercent ?? data.ProgressPercent ?? 0)), 150);

        setAllMentees(data.mentees || data.Mentees || []);
        if (!logsheet) throw new Error('Logsheet data could not be loaded.');
        setLogMentor(logsheet.mentor || null);
        const mergedLogsheet = LogsheetData.merge(logsheet.sessions || []);
        const map = {};
        mergedLogsheet.forEach(s => { map[s.sessionID] = s; });
        setLogsheetMap(map);
        const rows = await LogsheetData.withReportStatuses(LogsheetData.rows(logsheet.sessions || [], sessData?.sessions || []), mentorId);
        setAllSessions(rows);

        if (settings) {
          if (settings.GuidanceOfficer) setGuidanceOfficer(settings.GuidanceOfficer);
        }
        setLoadState('ready');
      } catch (e) {
        console.error('Detail load error:', e);
        setLoadState('failed');
      }
    })();
  }, []);

  useEffect(() => {
    if (hero) {
      const first = hero.firstName || hero.FirstName || '', last = hero.lastName || hero.LastName || '';
      document.title = `${first} ${last} — Super Administrator Portal`;
    }
  }, [hero]);

  // a click anywhere closes the print menu
  useEffect(() => {
    if (!printMenu) return;
    const close = () => setPrintMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [printMenu]);

  // Esc closes the proof preview
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') closeProofModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!mentorId) return <Navigate to="/head/monitoring" replace />;

  // ── Hero / stat cards ──
  const d = hero;
  const first = d ? (d.firstName || d.FirstName || '') : '';
  const last = d ? (d.lastName || d.LastName || '') : '';
  const heroSchool = d ? (d.school || d.School || '—') : '';
  const dept = d ? (d.departmentName || d.DepartmentName || '—') : '';
  const email = d ? (d.email || d.Email || '') : '';
  const contact = d ? (d.contactNumber || d.ContactNumber || '') : '';
  const rawStatus = d ? (d.progressStatus || d.ProgressStatus || 'Critical') : '';
  const done = d ? (d.completedSessions ?? d.CompletedSessions ?? 0) : 0;
  const tier = d ? mentorTierGroup(rawStatus, done) : '';
  const initials = d ? (((first[0] || '') + (last[0] || '')).toUpperCase() || '—') : '—';
  const heroMeta = d ? [
    heroSchool && <span className="hero-meta-item" key="s"><MetaIcon><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></MetaIcon>{heroSchool}</span>,
    dept && <span className="hero-meta-item" key="d"><MetaIcon><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></MetaIcon>{dept}</span>,
    email && <span className="hero-meta-item" key="e"><MetaIcon><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></MetaIcon>{email}</span>,
    contact && <span className="hero-meta-item" key="c"><MetaIcon><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.17 3.58a2 2 0 0 1 1.99-2.18H6a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z" /></MetaIcon>{contact}</span>,
  ].filter(Boolean) : null;
  // Section badges — same blue tags the Attendance Detail hero shows.
  const sectionTags = d ? String(d.sections || d.Sections || '').split(',').map(s => s.trim()).filter(Boolean) : [];

  const completed = d ? (d.completedSessions ?? d.CompletedSessions ?? 0) : 0;
  const required = d ? (d.requiredSessions ?? d.RequiredSessions ?? 0) : 0;
  const active = d ? (d.activeMentees ?? d.ActiveMentees ?? 0) : 0;
  const inactive = d ? (d.inactiveMentees ?? d.InactiveMentees ?? 0) : 0;
  const pulse = <span className="stat-pulse">—</span>;

  // ── Sessions ──
  // Sessions carry their own SchoolYear/Semester, so past semesters surface as a filter instead of staying invisible.
  const periods = [];
  {
    const seen = new Set();
    allSessions.forEach(s => {
      const sy = s.schoolYear || s.SchoolYear, sem = s.semester || s.Semester;
      if (!sy || !sem) return;
      const key = `${sy}|${sem}`;
      if (seen.has(key)) return;
      seen.add(key);
      periods.push({ schoolYear: sy, semester: sem, key });
    });
    periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));
  }
  const effPeriodFilter = periods.some(p => p.key === periodFilter) ? periodFilter : '';

  const rows = allSessions
    .filter(s => !statusFilter || sessionDisplayStatus(s, statusCalendar) === statusFilter)
    .filter(s => !effPeriodFilter || `${s.schoolYear}|${s.semester}` === effPeriodFilter)
    .sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));

  // ── Logsheet viewer ──
  function openLogsheet(sessionId) {
    const s = logsheetMap[sessionId];
    if (!s) return;
    const logStatus = s.logStatus === 'Submitted' ? 'Submitted' : null;
    const date = s.sessionDate
      ? new Date(s.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    // Distinct from `date` above — blank if never submitted, not the session date.
    const submittedDate = s.submittedAt
      ? new Date(s.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const timeStart = LogsheetData.time(s.actualStart) || '—';
    const timeEnd = LogsheetData.time(s.actualEnd) || '—';
    const topic = (s.topic || 'Mentoring Session').replace(/^\[[^\]]+\]\s*/, '');
    const isMakeup = !!s.isMakeup;
    const sessionNum = s.slotName || 'Session';
    const sessionLabel = isMakeup ? (s.slotName ? `Make-Up Session: ${s.slotName}` : 'Make-up Session') : sessionNum;
    setViewer({
      tab: 'logsheet',
      data: { sessionId, sessionNum, date, submittedDate, timeStart, timeEnd, topic, sessionLabel, mentees: s.mentees || [], proofFilePath: s.proofFilePath || null, proofFileType: s.proofFileType || '', logStatus, isMakeup },
    });
  }
  const closeLogsheet = () => setViewer(null);

  const viewerSession = viewer ? allSessions.find(s => s.sessionID === viewer.data.sessionId) : null;
  const viewerPeriod = LogsheetData.periodLabel(viewerSession || {});
  let tabContent = null;
  if (viewer) {
    const vd = viewer.data;
    if (vd.logStatus !== 'Submitted') {
      tabContent = (
        <div className="lm-not-submitted">
          <div className="lm-ns-icon"><i className="ti ti-clock-pause"></i></div>
          <div className="lm-ns-title">Logsheet Not Submitted</div>
          <div className="lm-ns-body">The mentor has not submitted this logsheet yet.</div>
        </div>
      );
    } else if (viewer.tab === 'logsheet') tabContent = <LogsheetTab d={vd} mentor={logMentor} periodLabel={viewerPeriod} />;
    else if (viewer.tab === 'notes') tabContent = <NotesTab d={vd} mentor={logMentor} />;
    else tabContent = <NonAttendTab d={vd} mentor={logMentor} periodLabel={viewerPeriod} guidanceOfficer={guidanceOfficer} submittedDate={vd.submittedDate} />;
  }

  const blocked = () => showToast('Pop-up blocked. Please allow pop-ups and try again.');

  // Prints whichever tab is currently active in the modal.
  function printCurrentTab() {
    if (!viewer) return;
    headExportOne(viewer.data.sessionId, viewer.tab === 'nonattend' ? 'nonattend' : viewer.tab === 'notes' ? 'notes' : 'logsheet');
  }

  function headExportOne(sessionId, formType) {
    const session = logsheetMap[sessionId];
    if (!session) return;
    const mentor = logMentor;
    const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '';
    const displayNum = (session.isMakeup === true || session.IsMakeup === true)
      ? (session.slotName ? `Make-Up: ${session.slotName}` : 'Make-Up')
      : (session.slotName || 'Session');

    let body, title;
    if (formType === 'notes') {
      body  = buildMentorNotesForm(session, mentor, LogsheetData.periodLabel(session));
      title = `Mentor's Notes — ${displayNum} Session${mentorName ? ` (${mentorName})` : ''}`;
    } else if (formType === 'nonattend') {
      body  = buildNonAttendanceForm(session, mentor, LogsheetData.periodLabel(session), guidanceOfficer);
      title = `Non-Attendance — ${displayNum} Session${mentorName ? ` (${mentorName})` : ''}`;
    } else {
      body  = buildPrintForm(session, mentor, LogsheetData.periodLabel(session));
      title = `Logsheet — ${displayNum} Session${mentorName ? ` (${mentorName})` : ''}`;
    }
    openLogsheetPrintWindow(title, body, blocked);
  }

  // PRINT ALL SESSIONS — logsheetMap already holds every session's mentee data upfront, so just concatenate each
  // Submitted session's already-built form.
  function headExportAll(formType) {
    const sessions = allSessions
      .map(s => logsheetMap[s.sessionID || s.SessionID])
      .filter(s => s && s.logStatus === 'Submitted');
    if (!sessions.length) { showToast('No submitted logsheets to print yet.'); return; }

    const mentor = logMentor;
    const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '';

    let body, title;
    if (formType === 'all') {
      // Each session's full set: Logsheet, Mentor's Notes, Non-Attendance.
      body  = sessions.map(s => buildPrintForm(s, mentor, LogsheetData.periodLabel(s))
        + buildMentorNotesForm(s, mentor, LogsheetData.periodLabel(s))
        + buildNonAttendanceForm(s, mentor, LogsheetData.periodLabel(s), guidanceOfficer)).join('');
      title = `All Forms — All Sessions${mentorName ? ` (${mentorName})` : ''}`;
    } else if (formType === 'notes') {
      body  = sessions.map(s => buildMentorNotesForm(s, mentor, LogsheetData.periodLabel(s))).join('');
      title = `Mentor's Notes — All Sessions${mentorName ? ` (${mentorName})` : ''}`;
    } else if (formType === 'nonattend') {
      body  = sessions.map(s => buildNonAttendanceForm(s, mentor, LogsheetData.periodLabel(s), guidanceOfficer)).join('');
      title = `Non-Attendance — All Sessions${mentorName ? ` (${mentorName})` : ''}`;
    } else {
      body  = sessions.map(s => buildPrintForm(s, mentor, LogsheetData.periodLabel(s))).join('');
      title = `Mentoring Logsheet — All Sessions${mentorName ? ` (${mentorName})` : ''}`;
    }
    openLogsheetPrintWindow(title, body, blocked);
  }

  // ── Proof preview ──
  // A single source opens straight into the normal single-photo modal; 2+ sources (proof from more than one
  // round/booking) show a thumbnail grid first. Clicking a thumbnail drills into that one photo.
  function openProofGallery(sources) {
    if (!sources || !sources.length) return;
    if (sources.length === 1) { openProofModal(sources[0].filePath); return; }
    setDlHidden(true);
    setProof({ open: true, mode: 'gallery', path: null, sources });
  }
  function openProofModal(proofPath) {
    setProof({ open: true, mode: 'single', path: proofPath, sources: null });
  }
  function closeProofModal() {
    setProof({ open: false, mode: null, path: null, sources: null });
  }

  // ── Session cards ──
  let sessionCards;
  if (loadState === 'loading') sessionCards = <Empty className="empty-state"><span className="spinner"></span> Loading…</Empty>;
  else if (loadState === 'failed') sessionCards = <Empty className="empty-state">Failed to load data. Please refresh the page.</Empty>;
  else if (!rows.length) sessionCards = <Empty className="empty-state">No sessions found.</Empty>;
  else {
    sessionCards = rows.map((s, idx) => {
      const date = s.sessionDate
        ? new Date(s.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';
      const timeStart = LogsheetData.time(s.actualStart);
      const timeEnd = LogsheetData.time(s.actualEnd);
      const displayStatus = sessionDisplayStatus(s, statusCalendar);
      const statusCls = (displayStatus === 'In Progress' ? 'Scheduled' : displayStatus === 'Closed' ? 'Cancelled' : displayStatus).toLowerCase();
      const isMakeup = isMakeupSession(s);
      const title = isMakeup ? (s.slotName ? `Make-Up Session: ${s.slotName}` : 'Make-up Session') : (s.slotName || 'Session');

      // Whatever the mentor actually typed for this session — blank unless they wrote something.
      const DESC_LIMIT = 70;
      const desc = (s.topic || '').replace(/^\[[^\]]+\]\s*/, '').trim();
      const descLong = desc.length > DESC_LIMIT;
      const descTrunc = descLong ? desc.slice(0, DESC_LIMIT).trim() + '…' : desc;

      // Attendance
      const attVal = s.totalAttendees > 0 ? `${s.presentCount}/${s.totalAttendees} Attendance` : '— Attendance';
      const attCls = s.totalAttendees === 0 ? 'empty' : s.presentCount === s.totalAttendees ? 'full' : 'partial';

      // Proof — a merged checkpoint row can have proof from more than one round/booking (_proofSources).
      const proofSources = s._proofSources || (s.proofFilePath ? [{ filePath: s.proofFilePath, fileType: s.proofFileType }] : []);
      const proofHtml = proofSources.length === 0
        ? <span className="sr-metric empty sr-metric--no-proof">No Proof</span>
        : proofSources.length === 1
          ? <span className="sr-metric proof sr-proof-pill">
              <button type="button" className="sr-proof-view" onClick={e => { e.stopPropagation(); openProofModal(proofSources[0].filePath); }}>Proof</button>
              <span className="sr-proof-sep">|</span>
              <a className="sr-proof-dl" href={CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(proofSources[0].filePath))} onClick={e => e.stopPropagation()} title="Download proof"><i className="ti ti-download"></i></a>
            </span>
          : <span className="sr-metric proof sr-proof-pill">
              <button type="button" className="sr-proof-view sr-proof-view--gallery" onClick={e => { e.stopPropagation(); openProofGallery(proofSources); }}>Proof ({proofSources.length})</button>
            </span>;

      // Logsheet status — Draft is treated as not submitted (invisible here, same as Admin)
      const logStatus = s.logStatus === 'Submitted' ? 'Submitted' : null;
      const canOpen = logStatus === 'Submitted';

      return (
        <div className={`ses-card ${canOpen ? '' : 'ses-card--pending'}`} key={s.sessionID ?? idx} onClick={canOpen ? () => openLogsheet(s.sessionID) : undefined}>
          <div className="ses-top">
            <div className="ses-title-row">
              <span className="ses-title">{title}</span>
              {/* SectionCode (not the derived Sections list) — present the moment a session is created. */}
              {s.sectionCode ? <span className="ses-course">{s.sectionCode}</span> : null}
              {s.slotName && s.status !== 'Cancelled' ? <span className="ses-status">{LogsheetData.reportStatus(s, statusCalendar)}</span> : null}
            </div>
            <span className={`badge-status ${statusCls}`}>{displayStatus}</span>
          </div>
          <div className="ses-when">
            <span className="ses-when-line">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              {date}
            </span>
            <span className="ses-when-line">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              {timeStart} – {timeEnd}
            </span>
            {s.roundDates?.length > 1 ? (
              <span className="ses-when-line" title={s.roundDates.map(rd => new Date(rd).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })).join(', ')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                {s.roundDates.length} sessions conducted
              </span>
            ) : null}
          </div>
          {desc ? <SesDesc trunc={descTrunc} full={desc} /> : null}
          <div className="ses-divider"></div>
          <div className="ses-stats">
            <span className={`sr-metric ${attCls}`} onClick={e => e.stopPropagation()} style={{ cursor: 'default' }}>{attVal}</span>
            {proofHtml}
          </div>
          <div className="ses-divider"></div>
          <div className="ses-footer" onClick={e => e.stopPropagation()}>
            {canOpen ? (
              <button className="ses-view-link" onClick={e => { e.stopPropagation(); openLogsheet(s.sessionID); }}>
                View Logsheet
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            ) : <button className="ses-view-link" disabled title="Awaiting mentor submission">{LogsheetData.reportStatus(s, statusCalendar)}</button>}
          </div>
        </div>
      );
    });
  }

  // ── Mentees accordion ──
  const msearch = menteeSearch.toLowerCase();
  const filteredMentees = allMentees.filter(m => {
    const name = `${m.firstName || ''} ${m.lastName || ''}`.toLowerCase();
    return !msearch || name.includes(msearch) || (m.studentNumber || '').toLowerCase().includes(msearch);
  });
  const mn = filteredMentees.length;
  const sections = {};
  filteredMentees.forEach(m => {
    const sec = m.sectionCode || m.SectionCode || 'Unassigned';
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(m);
  });
  const toggleGroup = sec => setClosedGroups(prev => {
    const next = new Set(prev);
    if (next.has(sec)) next.delete(sec); else next.add(sec);
    return next;
  });
  let accordion;
  if (!mn) accordion = <div className="mentee-card-empty">No mentees match the current filters.</div>;
  else {
    accordion = Object.entries(sections).map(([sec, mentees]) => (
      <div className={`sec-group${closedGroups.has(sec) ? '' : ' open'}`} key={sec}>
        <button className="sec-group-header" onClick={() => toggleGroup(sec)}>
          <div className="sec-group-left">
            <span className="sec-group-name">{sec}</span>
            <span className="sec-group-count">{mentees.length} mentee{mentees.length !== 1 ? 's' : ''}</span>
          </div>
          <svg className="sec-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
        </button>
        <div className="sec-group-body">
          <div className="mentee-cards-grid">
            {mentees.map((m, i) => {
              // Small boxes, several per row — just identity (who's assigned), not attendance data.
              const mfirst = m.firstName || m.FirstName || '';
              const mlast = m.lastName || m.LastName || '';
              const minit = ((mfirst[0] || '') + (mlast[0] || '')).toUpperCase() || '—';
              const stuNum = m.studentNumber || m.StudentNumber || '—';
              const isDropOut = m.isDropOut ?? m.IsDropOut ?? false;
              const memail = m.email || m.Email || '';
              const course = m.course || m.Course || '';
              const yearLvl = m.yearLevel || m.YearLevel || '';
              const courseYear = [course, yearLvl].filter(Boolean).join(' · ');
              return (
                <div className="mentee-card" key={i}>
                  <div className="mcard-top">
                    <div className={`mcard-avatar av-${i % 6}`}>{minit}</div>
                    <div className="mcard-info">
                      <div className="mcard-name">{mfirst} {mlast}</div>
                      <div className="mcard-sub">{stuNum}</div>
                      {courseYear ? <div className="mcard-meta">{courseYear}</div> : null}
                      {memail ? <div className="mcard-email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>{memail}</div> : null}
                    </div>
                  </div>
                  {isDropOut ? <span style={{ alignSelf: 'flex-start', background: '#fee2e2', color: '#dc2626', fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '99px' }}>Dropped Out</span> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ));
  }

  const backTo = school ? `/head/monitoring?school=${encodeURIComponent(school)}` : '/head/monitoring';

  const logsheetModal = (
    <Overlay open={!!viewer} className="modal-overlay" activeClass={null} display="flex" id="logsheetOverlay"
      onClick={e => { if (e.target === e.currentTarget) closeLogsheet(); }}>
      <div className="logsheet-modal" onClick={e => e.stopPropagation()}>
        <div className="lm-header">
          <div>
            <div className="lm-title-row">
              <div className="lm-title" id="lmSessionLabel">{viewer ? viewer.data.sessionLabel : 'Mentoring Logsheet'}</div>
              <span className={viewer?.data.logStatus === 'Submitted' ? 'lm-logstatus-badge lm-logstatus--submitted' : 'lm-logstatus-badge'} id="lmLogStatusBadge"
                style={{ display: viewer?.data.logStatus === 'Submitted' ? '' : 'none' }}>{viewer?.data.logStatus === 'Submitted' ? '✓ Submitted' : ''}</span>
            </div>
            <div className="lm-sub" id="lmSubtitle">{viewer ? `${viewer.data.date} · ${viewer.data.timeStart} – ${viewer.data.timeEnd} · ${viewer.data.topic}` : ''}</div>
          </div>
          <button className="lm-close" onClick={() => closeLogsheet()}>&times;</button>
        </div>
        <div className="lm-tabs">
          <button className={`lm-tab${viewer?.tab === 'logsheet' ? ' active' : ''}`} data-tab="logsheet" onClick={() => setViewer(v => ({ ...v, tab: 'logsheet' }))}>Mentoring Logsheet</button>
          <button className={`lm-tab${viewer?.tab === 'notes' ? ' active' : ''}`} data-tab="notes" onClick={() => setViewer(v => ({ ...v, tab: 'notes' }))}>Mentor's Notes</button>
          <button className={`lm-tab${viewer?.tab === 'nonattend' ? ' active' : ''}`} data-tab="nonattend" onClick={() => setViewer(v => ({ ...v, tab: 'nonattend' }))}>Non-Attendance Report</button>
        </div>
        <div className="lm-body">
          <div id="tabContent">{tabContent}</div>
        </div>
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

  const proofModal = (
    <div className={`proof-modal-overlay${proof.open ? ' open' : ''}`} id="proofModalOverlay" onClick={e => { if (e.target === e.currentTarget) closeProofModal(); }}>
      <div className="proof-modal">
        <div className="proof-modal-header">
          <span>Session Proof</span>
          <button className="proof-modal-close" onClick={closeProofModal} aria-label="Close">&times;</button>
        </div>
        <div className="proof-modal-body" id="proofModalBody">
          {proof.open && proof.mode === 'single'
            ? (/\.pdf$/i.test(proof.path) ? <iframe src={CONFIG.getFileUrl(proof.path)}></iframe> : <img src={CONFIG.getFileUrl(proof.path)} alt="Session proof" />)
            : null}
          {proof.open && proof.mode === 'gallery' ? (
            <div className="proof-gallery-grid">
              {proof.sources.map((p, i) => {
                const url = CONFIG.getFileUrl(p.filePath);
                const ext = (p.filePath.split('.').pop() || '').toLowerCase();
                return (
                  <button type="button" className="proof-gallery-item" key={i} onClick={() => openProofModal(p.filePath)}>
                    {ext === 'pdf'
                      ? <div className="proof-gallery-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></div>
                      : <img src={url} alt={p.label || 'Proof'} />}
                    {p.label ? <span className="proof-gallery-item-label">{p.label}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="proof-modal-footer">
          <a className="proof-modal-download" id="proofModalDownload"
            href={proof.mode === 'single' ? CONFIG.getUrl(`ProofOfSession/download?path=${encodeURIComponent(proof.path)}`) : '#'}
            style={dlHidden ? { display: 'none' } : undefined}>
            <i className="ti ti-download"></i> Download
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <Page id="HEAD/mentor-detail">
      <div className="main-wrapper">
        <main className="page-content">
          {/* Back */}
          <div className="detail-back-bar">
            <Link to={backTo} className="btn-back" id="backBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {' '}
              Back to Mentor Monitoring
            </Link>
          </div>
          {/* Hero */}
          <div className="mentor-hero" id="mentorHero">
            <div className="hero-avatar av-0" id="heroAvatar">{initials}</div>
            <div className="hero-info" id="heroInfo">
              <div className="hero-name-row">
                <div className="hero-name" id="heroName">{d ? `${first} ${last}` : 'Loading…'}</div>
                <span className={d ? `hero-badge ${tier.toLowerCase().replace(/ /g, '-')}` : 'hero-badge'} id="heroBadge">{tier}</span>
              </div>
              <div className="hero-meta" id="heroMeta">{heroMeta}</div>
              {sectionTags.length ? <div className="hero-tags">{sectionTags.map((s, i) => <span className="hero-section-tag" key={i}>{s}</span>)}</div> : null}
            </div>
          </div>
          {/* Stat Cards */}
          <div className="detail-stats-grid">
            <div className="stat-card sc-blue">
              <div className="stat-top-row">
                <div className="stat-label">Sessions Done</div>
                <div className="stat-icon blue">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="dStatCompleted">{d ? completed : pulse}</div>
              <div className="stat-note" id="dStatRequiredNote">{d ? `of ${required} required` : 'of — required'}</div>
              <div className="stat-progress-wrap">
                <div className="stat-progress-bar">
                  <div className="stat-progress-fill" id="dStatProgressFill" style={{ width: `${fillPct}%` }}></div>
                </div>
              </div>
            </div>
            <div className="stat-card sc-purple">
              <div className="stat-top-row">
                <div className="stat-label">Mentees with Completed Sessions</div>
                <div className="stat-icon purple">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 11.08 22 12 12 22 2 12 2 11.08" />
                    <path d="M12 22V12" />
                    <path d="M2 11.08l5-5 5 5 5-5 5 5" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="dStatActiveMentees">{d ? active : pulse}</div>
              <div className="stat-note" id="dStatInactiveNote">{d ? `${inactive} with no completed sessions this semester` : '— inactive'}</div>
            </div>
            <div className="stat-card sc-orange">
              <div className="stat-top-row">
                <div className="stat-label">Total Mentees</div>
                <div className="stat-icon orange">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="dStatTotalMentees">{d ? active + inactive : pulse}</div>
              <div className="stat-note">assigned mentees</div>
            </div>
          </div>
          {/* Mentoring Logsheet */}
          <div className="ses-section-head">
            <div>
              <span className="section-card-title">Mentoring Logsheet</span>
              {' '}
              <span id="sessionCount" className="sessions-section-count">
                {loadState === 'ready' ? `${rows.length} session${rows.length !== 1 ? 's' : ''}` : ''}
              </span>
            </div>
            <div className="print-btn-group" onClick={e => e.stopPropagation()}>
              <button className="btn-print-main" onClick={() => headExportAll('all')}>
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
              <div className={printMenu ? 'print-dropdown open' : 'print-dropdown'} id="headPrintMenu-all">
                <button className="print-drop-item" onClick={() => { headExportAll('all'); setPrintMenu(false); }}>
                  <i className="ti ti-files"></i>
                  {' '}
                  All Forms
                </button>
                {' '}
                <button className="print-drop-item" onClick={() => { headExportAll('logsheet'); setPrintMenu(false); }}>
                  <i className="ti ti-clipboard-list"></i>
                  {' '}
                  Logsheet
                </button>
                {' '}
                <button className="print-drop-item" onClick={() => { headExportAll('notes'); setPrintMenu(false); }}>
                  <i className="ti ti-notes"></i>
                  {' '}
                  Mentor's Notes
                </button>
                {' '}
                <button className="print-drop-item" onClick={() => { headExportAll('nonattend'); setPrintMenu(false); }}>
                  <i className="ti ti-user-x"></i>
                  {' '}
                  Non-Attendance
                </button>
              </div>
            </div>
          </div>
          <div className="ses-filter-bar">
            {<Select className="filter-select filter-select-sm" id="sessionStatusFilter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All Statuses</option><option value="Completed">Completed</option><option value="Scheduled">Scheduled</option><option value="In Progress">In Progress</option><option value="Closed">Closed</option><option value="Cancelled">Cancelled</option></Select>}
            {' '}
            {<Select className="filter-select filter-select-sm" id="sessionPeriodFilter" value={effPeriodFilter} onChange={e => setPeriodFilter(e.target.value)}><option value="">All School Years</option>{periods.map(p => <option key={p.key} value={p.key}>{`${p.semester}, SY ${p.schoolYear}`}</option>)}</Select>}
          </div>
          <div className="ses-card-grid" id="sessionCardsGrid">{sessionCards}</div>
          {/* Assigned Mentees */}
          <div className="section-card">
            <div className="section-card-head">
              <span className="section-card-title">Assigned Mentees</span>
              {' '}
              <span id="menteeCount" style={{ fontSize: "13px", color: "#6b7280" }}>{loadState === 'ready' ? `${mn} mentee${mn !== 1 ? 's' : ''}` : ''}</span>
            </div>
            <div className="section-filter-bar">
              <div className="search-box search-box-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {' '}
                <input type="text" id="menteeSearch" placeholder="Search mentee…" autoComplete="off" value={menteeSearch} onChange={e => setMenteeSearch(e.target.value)} />
              </div>
              <Link to={`/head/attendance/detail?id=${mentorId}`} id="menteeAttendanceLink" className="btn-primary">
                <i className="ti ti-calendar-stats"></i>
                {' '}
                View Attendance Details
              </Link>
            </div>
            <div id="menteeAccordion" className="section-accordion">{accordion}</div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      {/* Logsheet Viewer Modal (same shape as Admin's Sessions Detail page) */}
      {logsheetModal}
      {/* Proof Preview Modal */}
      {proofModal}
    </Page>
  );
}
