import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import { apiRequest, validateUploadFile } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { dashboardSessionState } from '../../lib/dashboard-sessions.js';
import { evaluationDeadline, evaluationDeadlineLabel } from '../../lib/evaluation-deadline.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { sanitizeHtml } from '../../lib/security-utils.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';
import { SAMPLE, sampleHtml, useTour } from '../../app/tour.js';
import RaiseConcernModal, { RaiseConcernButton } from '../../components/RaiseConcern.jsx';

// MENTEE/HTML/mentee-dashboard.html + MENTEE/JS/mentee-dashboard.js

// A first QR scan starts attendance; only Save and Close ends the session.
const dashboardSessionFinished = s => s.sessionStatus === 'Completed' && !!s.timeEnd;

// Keyed by user ID so different accounts on the same browser don't share "viewed" state.
function viewedAnnouncementsKey() {
  const session = getSession();
  const userId  = session?.user?.UserID || session?.user?.userID;
  return `viewedAnnouncementIds_mentee_${userId ?? 'anon'}`;
}
function getViewedAnnouncementIds() {
  try { return new Set(JSON.parse(localStorage.getItem(viewedAnnouncementsKey()) || '[]')); }
  catch (e) { return new Set(); }
}
function markAnnouncementViewed(id) {
  const seen = getViewedAnnouncementIds();
  seen.add(id);
  localStorage.setItem(viewedAnnouncementsKey(), JSON.stringify([...seen]));
}

const Skeleton = ({ text }) => <div className="list-skeleton"><span className="spinner"></span> {text}</div>;
const pulse = <span className="stat-pulse">—</span>;
const norm = v => String(v || '').replace(/\s+/g, '').toUpperCase();

export default function MenteeDashboard() {
  useBackGuard();
  const tour = useTour();
  const wt = tour.active;   // walkthrough: show sample data
  const S = SAMPLE.dashboard;
  const navigate = useNavigate();
  const currentUser = getSession()?.user;
  const menteeId = currentUser?.userID;

  const [badge, setBadge] = useState('');
  const [concernOpen, setConcernOpen] = useState(false);
  const [mentor, setMentor] = useState(null);     // null = loading; { error } | { none } | { name, ... }
  const [att, setAtt] = useState({ attended: pulse, required: '/—', sub: 'Loading...' });
  const [sessions, setSessions] = useState(null); // null = loading, string = message, { list, attMap, calendar }
  const [ann, setAnn] = useState(null);           // null = loading, false = failed, { items, mentorId }
  const [evals, setEvals] = useState(null);       // null = loading, false = failed, { items, proofs, available }
  const [uploading, setUploading] = useState({});
  const [uploadErr, setUploadErr] = useState({});
  const ctx = useRef({ mentorUserId: null, menteeSection: null, allMentorIds: new Set(), submissionStatusAvailable: false });

  async function loadSemesterBadge() {
    try {
      const data = await apiRequest('Settings', 'GET', null, true);
      const semester = data?.Semester || data?.semester || '1st Semester';
      const schoolYear = data?.SchoolYear || data?.schoolYear || '2026-2027';
      setBadge(`${semester} · SY ${schoolYear}`);
    } catch (e) { setBadge(''); }
  }

  async function loadAssignment() {
    try {
      const [assignments, mentorProfiles] = await Promise.all([
        apiRequest('Users/assignments', 'GET', null, true),
        apiRequest('MentorProfiles', 'GET', null, true),
      ]);
      ctx.current.allMentorIds = new Set((assignments || []).map(a => a.mentorUserID).filter(Boolean));
      const mine = (assignments || []).find(a => a.menteeUserID === menteeId);
      if (!mine) { setMentor({ none: true }); return; }
      ctx.current.mentorUserId = mine.mentorUserID;
      const mentorUser = await apiRequest(`Users/${mine.mentorUserID}`, 'GET', null, true);
      const profile = (mentorProfiles || []).find(p => p.userID === mine.mentorUserID) || {};
      const first = mentorUser?.firstName || '';
      const last = mentorUser?.lastName || '';
      const dept = profile.department || mine.departmentName || '—';
      const school = profile.school || mine.menteeSchool || '—';
      setMentor({
        name: `${first} ${last}`.trim() || 'Mentor',
        initials: ((first[0] || '') + (last[0] || '')).toUpperCase() || 'M',
        email: mentorUser?.email || '',
        tags: [dept !== '—' ? dept : null, school !== '—' ? school : null].filter(Boolean),
      });
    } catch (e) {
      console.error('Assignment load failed:', e);
      setMentor({ error: true });
    }
  }

  async function loadAttendanceProgress() {
    try {
      const data = await apiRequest(`MonitorActivities/${ctx.current.mentorUserId}`, 'GET', null, true);
      const myEntry = (data?.mentees || []).find(m => m.menteeID === menteeId || m.menteeUserID === menteeId);
      // A mentee belongs to one section, so use their own per-mentee requirement.
      const required = myEntry?.totalSessions ?? 0;
      const attended = myEntry?.sessionsAttended ?? 0;
      if (myEntry?.sectionCode && myEntry.sectionCode !== '—') ctx.current.menteeSection = myEntry.sectionCode;
      setAtt({
        attended, required: `/${required}`,
        sub: required === 0 ? 'No requirement set'
          : attended >= required ? 'Semester requirement met!'
          : `${Math.max(0, required - attended)} session${required - attended !== 1 ? 's' : ''} remaining`,
      });
    } catch (e) {
      console.error('Attendance progress load failed:', e);
      setAtt({ attended: '—', required: '/—', sub: '—' });
    }
  }

  async function loadSessionData() {
    const mentorUserId = ctx.current.mentorUserId;
    try {
      const [data, calendar] = await Promise.all([
        apiRequest(`SessionsAdmin/${mentorUserId}/sessions`, 'GET', null, true),
        apiRequest('CalendarEvents', 'GET', null, true).catch(() => []),
      ]);
      const cal = Array.isArray(calendar) ? calendar : [];
      const list = data?.sessions || [];
      const attMap = {};
      const mineOf = mentees => (mentees || []).find(m => m.menteeID === menteeId || m.menteeUserID === menteeId);

      // Completed sessions — real attendance for the Present/Absent badges and the make-up gate.
      const completedIds = list.filter(s => s.sessionStatus === 'Completed' || Number(s.presentCount) > 0).map(s => s.sessionID);
      if (completedIds.length) {
        const results = await Promise.allSettled(completedIds.map(id => apiRequest(`SessionsAdmin/session/${id}/mentees`, 'GET', null, true)));
        completedIds.forEach((id, i) => {
          if (results[i].status === 'fulfilled') {
            const mine = mineOf(results[i].value);
            // MentorMentee-based rows have attendanceID = 0 and must not count for make-up sessions.
            if (mine && mine.attendanceID > 0) attMap[id] = LogsheetData.attendanceState(mine);
          }
        });
      }
      // Not-yet-completed make-up sessions: only the approved-requesters endpoint knows the booking.
      const upcomingMakeupIds = list.filter(s => s.isMakeup === true && (!s.timeEnd || s.sessionStatus === 'Cancelled')).map(s => s.sessionID);
      if (upcomingMakeupIds.length) {
        const results = await Promise.allSettled(upcomingMakeupIds.map(id => apiRequest(`SessionsAdmin/session/${id}/requester`, 'GET', null, true)));
        upcomingMakeupIds.forEach((id, i) => {
          if (results[i].status === 'fulfilled') {
            const mine = mineOf(results[i].value);
            if (mine && !Object.prototype.hasOwnProperty.call(attMap, id)) attMap[id] = null;
          }
        });
      }
      setSessions({ list, attMap, calendar: cal });
    } catch (e) {
      console.error('Sessions load failed:', e);
      setSessions('Unable to load sessions. Please refresh.');
    }
  }

  async function loadAnnouncements() {
    const mentorUserId = ctx.current.mentorUserId;
    try {
      const [annResult, evalResult, subResult] = await Promise.allSettled([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest('EvaluationLinks', 'GET', null, true),
        apiRequest('EvaluationSubmissions/mine', 'GET', null, true),
      ]);
      if (annResult.status === 'rejected') throw annResult.reason;
      const evalLinks = evalResult.status === 'fulfilled' ? evalResult.value : [];
      const available = subResult.status === 'fulfilled' && Array.isArray(subResult.value);
      ctx.current.submissionStatusAvailable = available;
      const mySubs = subResult.status === 'fulfilled' ? (subResult.value || []) : [];
      const proofs = new Map(mySubs.map(s => [s.linkID, s.proofFilePath || null]));

      // Active announcements: the assigned mentor's posts plus admin posts (non-mentor posters).
      const items = (annResult.value || []).filter(a => {
        if (!a.isActive) return false;
        if (a.postedByUserID === mentorUserId) return true;
        if (ctx.current.allMentorIds.has(a.postedByUserID)) return false;
        const aud = (a.targetAudience || '').toLowerCase();
        return aud === 'mentee' || aud === 'both';
      });
      const evalItems = (evalLinks || []).filter(e => {
        if (!e.isActive) return false;
        const role = (e.targetRole || '').toLowerCase();
        return role === 'mentee' || role === 'both';
      });
      setAnn({ items, mentorId: mentorUserId });
      setEvals({ items: evalItems, proofs, available });
    } catch (e) {
      console.error('Announcements load failed:', e);
      setAnn(false);
      setEvals(false);
    }
  }

  useEffect(() => {
    (async () => {
      loadSemesterBadge();
      await loadAssignment();
      if (ctx.current.mentorUserId) {
        await loadAttendanceProgress(); // must run first — sets menteeSection
        await Promise.allSettled([loadSessionData(), loadAnnouncements()]);
      } else {
        setAtt({ attended: '0', required: '/0', sub: 'No mentor assigned yet.' });
        setSessions('No mentor assigned yet.');
        await loadAnnouncements(); // admin posts and evaluations show regardless of mentor
      }
    })();
  }, []);

  async function uploadEvalProof(linkId, input) {
    if (!ctx.current.submissionStatusAvailable) return;
    const file = input.files?.[0];
    if (!file) return;
    const setErr = msg => setUploadErr(e => ({ ...e, [linkId]: msg }));
    setErr('');
    const invalid = validateUploadFile(file, 'EvaluationSubmissions/upload');
    if (invalid) { setErr(invalid); input.value = ''; return; }
    if (file.size > 20 * 1024 * 1024) { setErr('File is too large. Maximum size is 20 MB.'); input.value = ''; return; }
    setUploading(u => ({ ...u, [linkId]: true }));
    try {
      const fd = new FormData();
      fd.append('linkId', linkId);
      fd.append('file', file);
      await apiRequest('EvaluationSubmissions/upload', 'POST', fd, true);
      await loadAnnouncements();
      setUploading(u => ({ ...u, [linkId]: false }));
    } catch (e) {
      console.error('Proof upload failed:', e);
      setErr(e.message || 'Upload failed. Please try again.');
      setUploading(u => ({ ...u, [linkId]: false }));
      input.value = '';
    }
  }

  // ── Mentor card ──
  let mentorPreview;
  if (mentor === null) mentorPreview = <Skeleton text="Loading mentor info..." />;
  else if (mentor.none) mentorPreview = <div className="empty-state"><i className="ti ti-user-off"></i>No mentor assigned yet.</div>;
  else if (mentor.error) mentorPreview = <div className="empty-state"><i className="ti ti-user-off"></i>Could not load mentor info.</div>;
  else mentorPreview = (
    <>
      <div className="mentor-avatar-lg">{mentor.initials}</div>
      <div className="mentor-info-block">
        <div className="mentor-info-name">{mentor.name}</div>
        <div className="mentor-info-dept">{mentor.email}</div>
        {mentor.tags.length ? <div className="mentor-info-tags">{mentor.tags.map(t => <span className="mentor-tag" key={t}>{t}</span>)}</div> : null}
      </div>
    </>
  );

  // ── Session cards ──
  const sessionItem = (s, attMap, calendar) => {
    const date = new Date(s.sessionDate);
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const checkpoint = s.slotName || '';
    const displayTopic = s.isMakeup ? (checkpoint ? `Make-up Session: ${checkpoint}` : 'Make-up Session') : (checkpoint || 'Scheduled Session');
    const isActualCompleted = dashboardSessionFinished(s);
    const inProgress = (s.sessionStatus === 'Completed' && !s.timeEnd) || Number(s.presentCount) > 0;
    const isCancelled = s.sessionStatus === 'Cancelled';
    const cls = isActualCompleted ? ' session-item-completed' : isCancelled ? ' session-item-cancelled' : '';
    const now = new Date();
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const session0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const isToday = !isActualCompleted && !isCancelled && session0.getTime() === today0.getTime();
    const isOverdue = !isActualCompleted && !isCancelled && session0.getTime() < today0.getTime();

    let tag = null;
    if (isActualCompleted) tag = <span className="session-completed-tag">Completed</span>;
    else if (isCancelled) tag = <span className="session-completed-tag" style={{ background: '#fee2e2', color: '#dc2626', borderColor: '#fecaca' }}>Cancelled</span>;
    else if (dashboardSessionState(s, calendar) === 'Closed') tag = <span className="session-completed-tag">Closed</span>;
    else if (inProgress) tag = <span className="session-completed-tag">In Progress</span>;
    else if (isToday) tag = <span className="session-completed-tag" style={{ background: '#ede9fe', color: '#6d28d9', borderColor: '#ddd6fe' }}>Today</span>;
    else if (isOverdue) tag = <span className="session-completed-tag" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>Overdue</span>;

    let attBadge = null;
    if (isActualCompleted || inProgress) {
      const a = attMap[s.sessionID];
      if (a === true) attBadge = <span className="session-att-tag att-present">Present</span>;
      else if (a === false && isActualCompleted) attBadge = <span className="session-att-tag att-absent">Absent</span>;
    }
    return (
      <div className={`session-item${cls}`} key={s.sessionID ?? `${s.sessionDate}-${displayTopic}`}>
        <div className="session-date-block">
          <div className="session-month">{month}</div>
          <div className="session-day">{day}</div>
        </div>
        <div className="session-info">
          <div className="session-title">{displayTopic}{!s.isMakeup && s.sectionCode ? <> <span className="session-course-tag">{s.sectionCode}</span></> : null}</div>
          <div className="session-time">{time} {tag} {attBadge}</div>
        </div>
      </div>
    );
  };

  let upcomingList, recentList;
  if (sessions === null) { upcomingList = <Skeleton text="Loading sessions..." />; recentList = <Skeleton text="Loading sessions..." />; }
  else if (typeof sessions === 'string') {
    const msg = <div className="empty-state"><i className="ti ti-calendar-off"></i>{sessions}</div>;
    upcomingList = msg; recentList = msg;
  } else {
    const { list, attMap, calendar } = sessions;
    const open = s => { const st = dashboardSessionState(s, calendar); return st === 'Upcoming' || st === 'Past Scheduled' || st === 'In Progress'; };
    const filtered = list.filter(s => {
      // Make-up sessions are private — only with a real attendance record / approved booking.
      if (s.isMakeup === true) return Object.prototype.hasOwnProperty.call(attMap, s.sessionID);
      if (!ctx.current.menteeSection) return true;
      return norm(s.sectionCode) === norm(ctx.current.menteeSection);
    });
    const upcoming = filtered.filter(open).sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate)).slice(0, 3);
    const recent = filtered.filter(s => !open(s)).sort((a, b) => new Date(b.cancelledAt || b.sessionDate) - new Date(a.cancelledAt || a.sessionDate)).slice(0, 3);
    upcomingList = upcoming.length ? upcoming.map(s => sessionItem(s, attMap, calendar)) : <div className="empty-state"><i className="ti ti-calendar-off"></i>No upcoming sessions.</div>;
    recentList = recent.length ? recent.map(s => sessionItem(s, attMap, calendar)) : <div className="empty-state"><i className="ti ti-calendar-off"></i>No recent sessions.</div>;
  }

  // ── Announcements ──
  let announceList;
  if (ann === null) announceList = <Skeleton text="Loading announcements..." />;
  else if (ann === false) announceList = <div className="empty-state"><i className="ti ti-speakerphone-off"></i>Could not load announcements.</div>;
  else {
    const recent = [...ann.items].sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt)).slice(0, 4);
    if (!recent.length) announceList = <div className="empty-state"><i className="ti ti-speakerphone-off"></i>No announcements yet.</div>;
    else {
      const seen = getViewedAnnouncementIds();
      announceList = recent.map(a => {
        const date = new Date(a.postedAt || Date.now()).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
        const isFromMentor = a.postedByUserID === ann.mentorId;
        const isHead = !isFromMentor && (a.posterRole || '').toLowerCase() === 'head';
        const sourceClass = isFromMentor ? 'mentor' : isHead ? 'head' : 'admin';
        const sourceLabel = isFromMentor ? 'Mentor' : isHead ? 'Super Administrator' : 'Administrator';
        const posterName = `${a.posterFirstName || ''} ${a.posterLastName || ''}`.trim();
        return (
          <div className={`announce-item${isFromMentor ? ' from-mentor' : ''}${seen.has(a.announcementID) ? ' viewed' : ''}`}
            data-announcement-id={a.announcementID} key={a.announcementID}
            onClick={() => { const id = Number(a.announcementID); markAnnouncementViewed(id); navigate(`/mentee/announcements?id=${id}`); }}>
            <div className="announce-author-row"><span className="announce-source-wrap">
              {posterName ? <span className="announce-poster-name">{posterName}</span> : null}
              <span className={`announce-source ${sourceClass}`}>{sourceLabel}</span>
            </span></div>
            <div className="announce-title">{a.title || 'Announcement'}</div>
            <div className="announce-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.content || '') }}></div>
            <div className="announce-footer">
              <span className="announce-date">{date}</span>
            </div>
          </div>
        );
      });
    }
  }

  // ── Evaluations ──
  let evalList;
  if (evals === null) evalList = <Skeleton text="Loading evaluations..." />;
  else if (evals === false) evalList = <div className="empty-state"><i className="ti ti-clipboard-off"></i>Could not load evaluations.</div>;
  else {
    const recent = [...evals.items].sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt)).slice(0, 4);
    if (!recent.length) evalList = <div className="empty-state"><i className="ti ti-clipboard-off"></i>No evaluations posted.</div>;
    else evalList = recent.map(a => {
      const date = new Date(a.postedAt || Date.now()).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
      const now = new Date();
      const dl = evaluationDeadline(a.deadline);
      const isPast = dl && dl <= now;
      const isSoon = dl && !isPast && (dl - now) < 3 * 24 * 60 * 60 * 1000;
      const deadline = a.deadline ? (
        <span className={isPast ? 'dash-eval-deadline past' : isSoon ? 'dash-eval-deadline soon' : 'dash-eval-deadline'}>
          <i className="ti ti-clock"></i> Due {evaluationDeadlineLabel(a.deadline)}{isPast ? ' · Overdue' : ''}
        </span>
      ) : null;
      const submitted = evals.proofs.has(a.linkID);
      const proofPath = evals.proofs.get(a.linkID);
      const action = isPast
        ? <span className="dash-eval-closed">Open Form</span>
        : submitted
          ? <a href={a.googleFormURL} target="_blank" rel="noopener noreferrer" className="dash-eval-link-muted">Open Form</a>
          : <a href={a.googleFormURL} target="_blank" rel="noopener noreferrer" className="dash-eval-btn"><i className="ti ti-external-link"></i> Open Form</a>;
      let mark;
      if (!evals.available) mark = <><span role="status">Submission status unavailable.</span><button type="button" className="dash-eval-mark-btn" onClick={loadAnnouncements}>Retry</button></>;
      else if (submitted) mark = (
        <>
          <span className="dash-eval-submitted-badge"><i className="ti ti-check"></i> Submitted</span>
          {proofPath ? <a className="eval-view-proof-link" href={CONFIG.getFileUrl(proofPath)} target="_blank" rel="noopener">View</a> : null}
        </>
      );
      else mark = (
        <>
          <label className={`dash-eval-mark-btn dash-eval-upload-label${uploading[a.linkID] ? ' is-uploading' : ''}`}>
            <i className="ti ti-upload"></i> Upload proof
            <input type="file" accept="image/*" hidden onChange={e => uploadEvalProof(a.linkID, e.target)} />
          </label>
          <details className="eval-upload-instructions">
            <summary>Upload instructions: images up to 20 MB</summary>
            Upload a clear screenshot of the evaluation form's submission confirmation. Accepted: JPG/JPEG, PNG, GIF, WEBP; maximum 20 MB per file. HEIC/HEIF and RAW are not supported: export a JPG/PNG copy first. For iPhone screenshots, use Settings &gt; General &gt; Screen Capture &gt; SDR, if available, to save PNG. If too large, resize or compress the image while keeping the text readable.
          </details>
          <span className="eval-upload-error" id={`dash-eval-upload-err-${a.linkID}`}>{uploadErr[a.linkID] || ''}</span>
        </>
      );
      return (
        <div className={`announce-item announce-item-eval${submitted ? ' eval-submitted' : ''}`} data-eval-link-id={a.linkID} key={a.linkID}
          onClick={event => {
            // Clicks on the card's own action buttons keep working in place.
            if (event.target.closest('details, summary, a, button, input, label, .dash-eval-btn, .dash-eval-link-muted, .dash-eval-closed, .dash-eval-mark-btn, .eval-unmark-btn, .eval-view-proof-link')) return;
            navigate(`/mentee/announcements?id=eval-${a.linkID}`);
          }}>
          <div className="announce-title">{a.title || 'Evaluation'}</div>
          <div className="evaluation-author"><strong>{a.postedByName || 'Name unavailable'}</strong></div>
          {a.description ? <div className="announce-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.description) }}></div> : null}
          <div className="announce-footer">
            <span className="announce-date">{date}</span>
            <span className="announce-source-wrap">
              {deadline}
              {isPast ? <span>You can still upload proof after the deadline.</span> : null}
              <span className="announce-source evaluation">Evaluation</span>
              {mark}
              {action}
            </span>
          </div>
        </div>
      );
    });
  }

  const first = currentUser?.firstName || 'Mentee';
  const dateStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Page id="MENTEE/mentee-dashboard">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1 id="welcomeTitle">Welcome, {first}!</h1>
              <p id="dashboardDate">{dateStr}</p>
            </div>
            <span className="semester-badge" id="semesterBadge">{badge}</span>
          </div>

          <RaiseConcernModal open={concernOpen} onClose={() => setConcernOpen(false)} />
          <div className="top-row">
            <div className="card mentor-preview-card">
              <div className="card-header-row">
                <div>
                  <h2>My Mentor</h2>
                  <p className="card-desc">Your assigned mentor for this semester.</p>
                </div>
                {mentor && !mentor.none && !mentor.error ? <RaiseConcernButton onClick={() => setConcernOpen(true)} /> : null}
              </div>
              <div id="mentorPreview" className="mentor-preview" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, S.mentorPreview)}>{wt ? undefined : mentorPreview}</div>
            </div>

            <div className="stat-card att-card">
              <div className="stat-icon-wrap teal"><i className="ti ti-chart-bar"></i></div>
              <div className="stat-body">
                <div className="stat-value">
                  <span id="statAttended">{wt ? S.attended : att.attended}</span><span className="stat-frac" id="statRequired">{wt ? S.required : att.required}</span>
                </div>
                <div className="stat-label">Semester Completion</div>
                <div className="stat-sub" id="statAttSub">{wt ? S.attSub : att.sub}</div>
              </div>
            </div>
          </div>

          <div className="quad-grid">
            <div className="card sessions-card">
              <div className="card-header-row">
                <div>
                  <h2>Upcoming Sessions</h2>
                  <p className="card-desc">Your next mentoring sessions, regular or make-up.</p>
                </div>
              </div>
              <div id="upcomingSessionsList" className="sessions-list" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, S.upcoming)}>{wt ? undefined : upcomingList}</div>
              <div className="card-view-footer">
                <Link to="/mentee/sessions" className="card-view-link">View all sessions <i className="ti ti-arrow-right"></i></Link>
              </div>
            </div>

            <div className="card sessions-card">
              <div className="card-header-row">
                <div>
                  <h2>Recent Sessions</h2>
                  <p className="card-desc">Latest ongoing, past, completed, and cancelled sessions.</p>
                </div>
              </div>
              <div id="recentSessionsList" className="sessions-list" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, S.recent)}>{wt ? undefined : recentList}</div>
              <div className="card-view-footer">
                <Link to="/mentee/sessions" className="card-view-link">View all sessions <i className="ti ti-arrow-right"></i></Link>
              </div>
            </div>

            <div className="card announcements-card">
              <div className="card-header-row">
                <div>
                  <h2>Announcements</h2>
                  <p className="card-desc">Latest from the administration.</p>
                </div>
              </div>
              <div id="announcementsList" className="announcements-list" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, S.announcements)}>{wt ? undefined : announceList}</div>
              <div className="card-view-footer">
                <Link to="/mentee/announcements" className="card-view-link">View all announcements <i className="ti ti-arrow-right"></i></Link>
              </div>
            </div>

            <div className="card announcements-card">
              <div className="card-header-row">
                <div>
                  <h2>Evaluation Announcements</h2>
                  <p className="card-desc">Google Form evaluations posted for you.</p>
                </div>
              </div>
              <div id="evaluationsList" className="announcements-list" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, S.evaluations)}>{wt ? undefined : evalList}</div>
              <div className="card-view-footer">
                <Link to="/mentee/announcements" className="card-view-link">View all announcements <i className="ti ti-arrow-right"></i></Link>
              </div>
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
    </Page>
  );
}
