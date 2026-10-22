import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import { apiRequest, validateUploadFile } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { dashboardSessionState } from '../../lib/dashboard-sessions.js';
import { evaluationDeadline, evaluationDeadlineLabel } from '../../lib/evaluation-deadline.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { sanitizeHtml } from '../../lib/security-utils.js';
import { getSession, isLoggedIn } from '../../lib/session.js';
import { SAMPLE } from './tour/samples.js';
import { useTour } from './tour/TourContext.js';

// Mentee dashboard (MENTEE/HTML/mentee-dashboard.html + mentee-dashboard.js).
const CAL_OFF = <i className="ti ti-calendar-off"></i>;

// A first QR scan starts attendance; only Save and Close ends the session.
const sessionFinished = s => s.sessionStatus === 'Completed' && !!s.timeEnd;

// Clicked announcements recede next time (per user on this browser).
const viewedKey = () => {
  const u = getSession()?.user;
  return `viewedAnnouncementIds_mentee_${(u?.UserID || u?.userID) ?? 'anon'}`;
};
const getViewed = () => { try { return new Set(JSON.parse(localStorage.getItem(viewedKey()) || '[]')); } catch (e) { return new Set(); } };
const markViewed = id => { const seen = getViewed(); seen.add(id); localStorage.setItem(viewedKey(), JSON.stringify([...seen])); };

export default function MenteeDashboard() {
  const navigate = useNavigate();
  const tour = useTour();
  const [user] = useState(() => getSession().user);
  const [semesterBadge, setSemesterBadge] = useState('');
  const [mentor, setMentor] = useState({ state: 'loading' });            // loading | none | error | ok
  const [progress, setProgress] = useState({ state: 'loading' });        // loading | ok | none | error
  const [sessions, setSessions] = useState({ state: 'loading' });        // loading | ok | none | error
  const [announcements, setAnnouncements] = useState({ state: 'loading' });
  const [evaluations, setEvaluations] = useState({ state: 'loading' });
  const [uploading, setUploading] = useState({});                        // linkID -> true
  const [uploadErrors, setUploadErrors] = useState({});                  // linkID -> message

  // Keep the mentee on the dashboard when they press Back (and recheck the session).
  useEffect(() => {
    window.history.pushState(window.history.state, '', window.location.href);
    const onPop = () => {
      if (!isLoggedIn()) window.location.href = '/login';
      else window.history.pushState(window.history.state, '', window.location.href);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const loadAnnouncements = useCallback(async (ctx) => {
    try {
      const [annResult, evalResult, subResult] = await Promise.allSettled([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest('EvaluationLinks', 'GET', null, true),
        apiRequest('EvaluationSubmissions/mine', 'GET', null, true),
      ]);
      if (annResult.status === 'rejected') throw annResult.reason;
      const items = annResult.value;
      const evalLinks = evalResult.status === 'fulfilled' ? evalResult.value : [];
      const statusAvailable = subResult.status === 'fulfilled' && Array.isArray(subResult.value);
      const mySubs = subResult.status === 'fulfilled' ? (subResult.value || []) : [];
      // linkID -> proof screenshot path (so the card can offer "View")
      const proofPaths = new Map(mySubs.map(s => [s.linkID, s.proofFilePath || null]));

      // Active announcements: the assigned mentor's posts + admin/head posts for mentees.
      const filtered = (items || []).filter(a => {
        if (!a.isActive) return false;
        if (a.postedByUserID === ctx.mentorUserId) return true;
        if (ctx.allMentorIds.has(a.postedByUserID)) return false;
        const aud = (a.targetAudience || '').toLowerCase();
        return aud === 'mentee' || aud === 'both';
      });
      const evals = (evalLinks || []).filter(e => {
        if (!e.isActive) return false;
        const role = (e.targetRole || '').toLowerCase();
        return role === 'mentee' || role === 'both';
      });
      setAnnouncements({ state: 'ok', items: [...filtered].sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt)).slice(0, 4), mentorUserId: ctx.mentorUserId });
      setEvaluations({ state: 'ok', items: [...evals].sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt)).slice(0, 4), proofPaths, statusAvailable, ctx });
    } catch (e) {
      console.error('Announcements load failed:', e);
      setAnnouncements({ state: 'error' });
      setEvaluations({ state: 'error' });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const ctx = { mentorUserId: null, allMentorIds: new Set(), menteeSection: null };
    (async () => {
      loadSemesterBadge(setSemesterBadge);
      await loadAssignment(user, ctx, m => alive && setMentor(m));
      if (ctx.mentorUserId) {
        await loadProgress(user, ctx, p => alive && setProgress(p));   // must run first — sets menteeSection
        await Promise.allSettled([
          loadSessionData(user, ctx, s => alive && setSessions(s)),
          loadAnnouncements(ctx),
        ]);
      } else {
        setProgress({ state: 'none' });
        setSessions({ state: 'none' });
        await loadAnnouncements(ctx);   // admin posts and evaluations show regardless of mentor
      }
    })();
    return () => { alive = false; };
  }, []);

  // Uploading the screenshot IS the submit action — no separate confirm step.
  async function uploadEvalProof(linkId, inputEl) {
    if (!evaluations.statusAvailable) return;
    const file = inputEl.files?.[0];
    if (!file) return;
    setUploadErrors(e => ({ ...e, [linkId]: '' }));
    const invalid = validateUploadFile(file, 'EvaluationSubmissions/upload');
    if (invalid) { setUploadErrors(e => ({ ...e, [linkId]: invalid })); inputEl.value = ''; return; }
    if (file.size > 20 * 1024 * 1024) { setUploadErrors(e => ({ ...e, [linkId]: 'File is too large. Maximum size is 20 MB.' })); inputEl.value = ''; return; }
    setUploading(u => ({ ...u, [linkId]: true }));
    try {
      const fd = new FormData();
      fd.append('linkId', linkId);
      fd.append('file', file);
      await apiRequest('EvaluationSubmissions/upload', 'POST', fd, true);
      await loadAnnouncements(evaluations.ctx);
    } catch (e) {
      console.error('Proof upload failed:', e);
      setUploadErrors(er => ({ ...er, [linkId]: e.message || 'Upload failed. Please try again.' }));
      setUploading(u => ({ ...u, [linkId]: false }));
      inputEl.value = '';
    }
  }

  const sample = tour.sample;
  const first = user?.firstName || 'Mentee';
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const skeleton = text => <div className="list-skeleton"><span className="spinner"></span>{' '}{text}</div>;

  const att = sample ? { attended: '3', required: '/6', sub: '3 of 6 checkpoints attended' }
    : progress.state === 'ok' ? { attended: String(progress.attended), required: `/${progress.required}`, sub: progress.sub }
    : progress.state === 'none' ? { attended: '0', required: '/0', sub: 'No mentor assigned yet.' }
    : progress.state === 'error' ? { attended: '—', required: '/—', sub: '—' }
    : null;

  return (
    <Page id="MENTEE/mentee-dashboard">
      <div className="main-wrapper">
        <main className="page-content">
          {/* Page Header */}
          <div className="page-header">
            <div>
              <h1 id="welcomeTitle">{`Welcome, ${first}!`}</h1>
              {' '}
              <p id="dashboardDate">{today}</p>
            </div>
            {' '}
            <span className="semester-badge" id="semesterBadge">{semesterBadge}</span>
          </div>
          {' '}
          <div className="top-row">
            {/* My Mentor Card */}
            <div className="card mentor-preview-card">
              <div className="card-header-row">
                <div>
                  <h2>My Mentor</h2>
                  {' '}
                  <p className="card-desc">Your assigned mentor for this semester.</p>
                </div>
              </div>
              {' '}
              {sample
                ? <div id="mentorPreview" className="mentor-preview" dangerouslySetInnerHTML={{ __html: SAMPLE.dashboard.mentorPreview }} />
                : (
                  <div id="mentorPreview" className="mentor-preview">
                    {mentor.state === 'loading' && skeleton('Loading mentor info...')}
                    {mentor.state === 'none' && <div className="empty-state"><i className="ti ti-user-off"></i>No mentor assigned yet.</div>}
                    {mentor.state === 'error' && <div className="empty-state"><i className="ti ti-user-off"></i>Could not load mentor info.</div>}
                    {mentor.state === 'ok' && <>
                      <div className="mentor-avatar-lg">{mentor.initials}</div>
                      <div className="mentor-info-block">
                        <div className="mentor-info-name">{mentor.name}</div>
                        <div className="mentor-info-dept">{mentor.email}</div>
                        {mentor.tags.length > 0 && <div className="mentor-info-tags">{mentor.tags.map(t => <span key={t} className="mentor-tag">{t}</span>)}</div>}
                      </div>
                    </>}
                  </div>
                )}
            </div>
            {' '}
            {/* Attendance Card */}
            <div className="stat-card att-card">
              <div className="stat-icon-wrap teal">
                <i className="ti ti-chart-bar"></i>
              </div>
              {' '}
              <div className="stat-body">
                <div className="stat-value">
                  <span id="statAttended">{att ? att.attended : <span className="stat-pulse">—</span>}</span>
                  <span className="stat-frac" id="statRequired">{att ? att.required : '/—'}</span>
                </div>
                {' '}
                <div className="stat-label">Semester Completion</div>
                {' '}
                <div className="stat-sub" id="statAttSub">{att ? att.sub : 'Loading...'}</div>
              </div>
            </div>
          </div>
          {' '}
          {/* 4-Quadrant Grid: Upcoming/Recent Sessions, Announcements/Evaluation Announcements */}
          <div className="quad-grid">
            {/* Upcoming Sessions */}
            <div className="card sessions-card">
              <div className="card-header-row">
                <div>
                  <h2>Upcoming Sessions</h2>
                  {' '}
                  <p className="card-desc">Your next mentoring sessions, regular or make-up.</p>
                </div>
              </div>
              {' '}
              <SessionList id="upcomingSessionsList" sample={sample && SAMPLE.dashboard.upcoming} data={sessions} which="upcoming" skeleton={skeleton} />
              {' '}
              <div className="card-view-footer">
                <a href="/mentee/sessions" className="card-view-link">
                  View all sessions{' '}
                  <i className="ti ti-arrow-right"></i>
                </a>
              </div>
            </div>
            {' '}
            {/* Recent Sessions */}
            <div className="card sessions-card">
              <div className="card-header-row">
                <div>
                  <h2>Recent Sessions</h2>
                  {' '}
                  <p className="card-desc">Latest ongoing, past, completed, and cancelled sessions.</p>
                </div>
              </div>
              {' '}
              <SessionList id="recentSessionsList" sample={sample && SAMPLE.dashboard.recent} data={sessions} which="recent" skeleton={skeleton} />
              {' '}
              <div className="card-view-footer">
                <a href="/mentee/sessions" className="card-view-link">
                  View all sessions{' '}
                  <i className="ti ti-arrow-right"></i>
                </a>
              </div>
            </div>
            {' '}
            {/* Announcements */}
            <div className="card announcements-card">
              <div className="card-header-row">
                <div>
                  <h2>Announcements</h2>
                  {' '}
                  <p className="card-desc">Latest from the administration.</p>
                </div>
              </div>
              {' '}
              {sample
                ? <div id="announcementsList" className="announcements-list" dangerouslySetInnerHTML={{ __html: SAMPLE.dashboard.announcements }} />
                : (
                  <div id="announcementsList" className="announcements-list">
                    {announcements.state === 'loading' && skeleton('Loading announcements...')}
                    {announcements.state === 'error' && <div className="empty-state"><i className="ti ti-speakerphone-off"></i>Could not load announcements.</div>}
                    {announcements.state === 'ok' && (announcements.items.length
                      ? <AnnouncementItems items={announcements.items} mentorUserId={announcements.mentorUserId}
                          onOpen={id => { markViewed(id); navigate(`/mentee/announcements?id=${id}`); }} />
                      : <div className="empty-state"><i className="ti ti-speakerphone-off"></i>No announcements yet.</div>)}
                  </div>
                )}
              {' '}
              <div className="card-view-footer">
                <a href="/mentee/announcements" className="card-view-link">
                  View all announcements{' '}
                  <i className="ti ti-arrow-right"></i>
                </a>
              </div>
            </div>
            {' '}
            {/* Evaluation Announcements */}
            <div className="card announcements-card">
              <div className="card-header-row">
                <div>
                  <h2>Evaluation Announcements</h2>
                  {' '}
                  <p className="card-desc">Google Form evaluations posted for you.</p>
                </div>
              </div>
              {' '}
              {sample
                ? <div id="evaluationsList" className="announcements-list" dangerouslySetInnerHTML={{ __html: SAMPLE.dashboard.evaluations }} />
                : (
                  <div id="evaluationsList" className="announcements-list">
                    {evaluations.state === 'loading' && skeleton('Loading evaluations...')}
                    {evaluations.state === 'error' && <div className="empty-state"><i className="ti ti-clipboard-off"></i>Could not load evaluations.</div>}
                    {evaluations.state === 'ok' && (evaluations.items.length
                      ? evaluations.items.map(a => (
                        <EvaluationItem key={a.linkID} a={a} proofPaths={evaluations.proofPaths} statusAvailable={evaluations.statusAvailable}
                          uploading={!!uploading[a.linkID]} error={uploadErrors[a.linkID] || ''}
                          onRetry={() => loadAnnouncements(evaluations.ctx)} onUpload={input => uploadEvalProof(a.linkID, input)}
                          onOpen={() => navigate(`/mentee/announcements?id=eval-${a.linkID}`)} />
                      ))
                      : <div className="empty-state"><i className="ti ti-clipboard-off"></i>No evaluations posted.</div>)}
                  </div>
                )}
              {' '}
              <div className="card-view-footer">
                <a href="/mentee/announcements" className="card-view-link">
                  View all announcements{' '}
                  <i className="ti ti-arrow-right"></i>
                </a>
              </div>
            </div>
          </div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
    </Page>
  );
}

// ── Data loading (same requests and rules as the original) ─────────────────
async function loadSemesterBadge(set) {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    const semester = data?.Semester || data?.semester || '1st Semester';
    const schoolYear = data?.SchoolYear || data?.schoolYear || '2026-2027';
    set(`${semester} · SY ${schoolYear}`);
  } catch (e) {
    set('');
  }
}

async function loadAssignment(user, ctx, set) {
  const menteeId = user?.userID;
  try {
    const [assignments, mentorProfiles] = await Promise.all([
      apiRequest('Users/assignments', 'GET', null, true),
      apiRequest('MentorProfiles', 'GET', null, true),
    ]);
    ctx.allMentorIds = new Set((assignments || []).map(a => a.mentorUserID).filter(Boolean));
    const mine = (assignments || []).find(a => a.menteeUserID === menteeId);
    if (!mine) { set({ state: 'none' }); return; }
    ctx.mentorUserId = mine.mentorUserID;

    const mentorUser = await apiRequest(`Users/${ctx.mentorUserId}`, 'GET', null, true);
    const profile = (mentorProfiles || []).find(p => p.userID === ctx.mentorUserId) || {};
    const firstName = mentorUser?.firstName || '';
    const last = mentorUser?.lastName || '';
    const dept = profile.department || mine.departmentName || '—';
    const school = profile.school || mine.menteeSchool || '—';
    set({
      state: 'ok',
      name: `${firstName} ${last}`.trim() || 'Mentor',
      initials: ((firstName[0] || '') + (last[0] || '')).toUpperCase() || 'M',
      email: mentorUser?.email || '',
      tags: [dept !== '—' ? dept : null, school !== '—' ? school : null].filter(Boolean),
    });
  } catch (e) {
    console.error('Assignment load failed:', e);
    set({ state: 'error' });
  }
}

async function loadProgress(user, ctx, set) {
  try {
    const data = await apiRequest(`MonitorActivities/${ctx.mentorUserId}`, 'GET', null, true);
    const myEntry = (data?.mentees || []).find(m => m.menteeID === user?.userID || m.menteeUserID === user?.userID);
    // Each mentee's own requirement (the mentor's total spans every section they handle).
    const required = myEntry?.totalSessions ?? 0;
    const attended = myEntry?.sessionsAttended ?? 0;
    if (myEntry?.sectionCode && myEntry.sectionCode !== '—') ctx.menteeSection = myEntry.sectionCode;
    set({
      state: 'ok', attended, required,
      sub: required === 0 ? 'No requirement set'
        : attended >= required ? 'Semester requirement met!'
        : `${Math.max(0, required - attended)} checkpoint${required - attended !== 1 ? 's' : ''} remaining`,
    });
  } catch (e) {
    console.error('Attendance progress load failed:', e);
    set({ state: 'error' });
  }
}

async function loadSessionData(user, ctx, set) {
  try {
    const [data, calendar] = await Promise.all([
      apiRequest(`SessionsAdmin/${ctx.mentorUserId}/sessions`, 'GET', null, true),
      apiRequest('CalendarEvents', 'GET', null, true).catch(() => []),
    ]);
    const events = Array.isArray(calendar) ? calendar : [];
    const sessions = data?.sessions || [];
    const attMap = {};

    // Completed sessions: real attendance (Present/Absent badges, make-up visibility gate).
    // Upcoming make-ups: the approved-requesters list is the only place that knows "this mentee
    // booked this slot" before anyone has been scanned in. Both are requested together and
    // applied in this order.
    const completedIds = sessions.filter(s => s.sessionStatus === 'Completed' || Number(s.presentCount) > 0).map(s => s.sessionID);
    const upcomingMakeupIds = sessions.filter(s => s.isMakeup === true && (!s.timeEnd || s.sessionStatus === 'Cancelled')).map(s => s.sessionID);
    const [completedResults, upcomingResults] = await Promise.all([
      completedIds.length ? Promise.allSettled(completedIds.map(id => apiRequest(`SessionsAdmin/session/${id}/mentees`, 'GET', null, true))) : null,
      upcomingMakeupIds.length ? Promise.allSettled(upcomingMakeupIds.map(id => apiRequest(`SessionsAdmin/session/${id}/requester`, 'GET', null, true))) : null,
    ]);
    const mineOf = list => (list || []).find(m => m.menteeID === user?.userID || m.menteeUserID === user?.userID);
    completedIds.forEach((id, i) => {
      if (completedResults[i].status !== 'fulfilled') return;
      const mine = mineOf(completedResults[i].value);
      // Only a real attendance record counts (attendanceID > 0); MentorMentee rows are 0.
      if (mine && mine.attendanceID > 0) attMap[id] = LogsheetData.attendanceState(mine);
    });
    upcomingMakeupIds.forEach((id, i) => {
      if (upcomingResults[i].status !== 'fulfilled') return;
      if (mineOf(upcomingResults[i].value) && !Object.prototype.hasOwnProperty.call(attMap, id)) attMap[id] = null;
    });

    // Make-up sessions are private: only those this mentee booked/attended. Regular sessions
    // are filtered to the mentee's section (course code vs section code compared loosely).
    const norm = v => String(v || '').replace(/\s+/g, '').toUpperCase();
    const filtered = sessions.filter(s => {
      if (s.isMakeup === true) return Object.prototype.hasOwnProperty.call(attMap, s.sessionID);
      if (!ctx.menteeSection) return true;
      return norm(s.sectionCode) === norm(ctx.menteeSection);
    });
    // A session stays "upcoming" until completed, cancelled, or its checkpoint window closes.
    const isOpen = s => { const st = dashboardSessionState(s, events); return st === 'Upcoming' || st === 'Past Scheduled' || st === 'In Progress'; };
    set({
      state: 'ok', events, attMap,
      upcoming: filtered.filter(isOpen).sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate)).slice(0, 3),
      recent: filtered.filter(s => !isOpen(s)).sort((a, b) => new Date(b.cancelledAt || b.sessionDate) - new Date(a.cancelledAt || a.sessionDate)).slice(0, 3),
    });
  } catch (e) {
    console.error('Sessions load failed:', e);
    set({ state: 'error' });
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────
function SessionList({ id, sample, data, which, skeleton }) {
  if (sample) return <div id={id} className="sessions-list" dangerouslySetInnerHTML={{ __html: sample }} />;
  const empty = which === 'upcoming' ? 'No upcoming sessions.' : 'No recent sessions.';
  return (
    <div id={id} className="sessions-list">
      {data.state === 'loading' && skeleton('Loading sessions...')}
      {data.state === 'none' && <div className="empty-state">{CAL_OFF}No mentor assigned yet.</div>}
      {data.state === 'error' && <div className="empty-state">{CAL_OFF}Unable to load sessions. Please refresh.</div>}
      {data.state === 'ok' && (data[which].length
        ? data[which].map(s => <SessionItem key={s.sessionID} s={s} attMap={data.attMap} events={data.events} />)
        : <div className="empty-state">{CAL_OFF}{empty}</div>)}
    </div>
  );
}

const TAG_STYLES = {
  cancelled: { background: '#fee2e2', color: '#dc2626', borderColor: '#fecaca' },
  today: { background: '#ede9fe', color: '#6d28d9', borderColor: '#ddd6fe' },
  overdue: { background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' },
};

function SessionItem({ s, attMap, events }) {
  const date = new Date(s.sessionDate);
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = date.getDate();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const checkpoint = s.slotName || '';
  const displayTopic = s.isMakeup ? (checkpoint ? `Make-up Session: ${checkpoint}` : 'Make-up Session') : (checkpoint || 'Scheduled Session');
  const finished = sessionFinished(s);
  const inProgress = (s.sessionStatus === 'Completed' && !s.timeEnd) || Number(s.presentCount) > 0;
  const isCancelled = s.sessionStatus === 'Cancelled';
  const cls = finished ? ' session-item-completed' : isCancelled ? ' session-item-cancelled' : '';

  // Past-dated sessions that were never completed/cancelled still get a plain label.
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const session0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const isToday = !finished && !isCancelled && session0.getTime() === today0.getTime();
  const isOverdue = !finished && !isCancelled && session0.getTime() < today0.getTime();

  const tag = finished ? <span className="session-completed-tag">Completed</span>
    : isCancelled ? <span className="session-completed-tag" style={TAG_STYLES.cancelled}>Cancelled</span>
    : dashboardSessionState(s, events) === 'Closed' ? <span className="session-completed-tag">Closed</span>
    : inProgress ? <span className="session-completed-tag">In Progress</span>
    : isToday ? <span className="session-completed-tag" style={TAG_STYLES.today}>Today</span>
    : isOverdue ? <span className="session-completed-tag" style={TAG_STYLES.overdue}>Overdue</span>
    : '';

  let attBadge = '';
  if (finished || inProgress) {
    const att = attMap[s.sessionID];
    if (att === true) attBadge = <span className="session-att-tag att-present">Present</span>;
    else if (att === false && finished) attBadge = <span className="session-att-tag att-absent">Absent</span>;
  }

  return (
    <div className={'session-item' + cls}>
      <div className="session-date-block">
        <div className="session-month">{month}</div>
        <div className="session-day">{day}</div>
      </div>
      <div className="session-info">
        <div className="session-title">{displayTopic}{!s.isMakeup && s.sectionCode ? <>{' '}<span className="session-course-tag">{s.sectionCode}</span></> : null}</div>
        <div className="session-time">{time} {tag} {attBadge}</div>
      </div>
    </div>
  );
}

function AnnouncementItems({ items, mentorUserId, onOpen }) {
  const viewed = getViewed();
  return items.map(a => {
    const date = new Date(a.postedAt || Date.now()).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const isFromMentor = a.postedByUserID === mentorUserId;
    // Head Admin posts get their own label instead of being folded into Admin's.
    const isHead = !isFromMentor && (a.posterRole || '').toLowerCase() === 'head';
    const sourceClass = isFromMentor ? 'mentor' : isHead ? 'head' : 'admin';
    const sourceLabel = isFromMentor ? 'Mentor' : isHead ? 'Head Admin' : 'Admin';
    const posterName = `${a.posterFirstName || ''} ${a.posterLastName || ''}`.trim();
    return (
      <div key={a.announcementID}
        className={'announce-item' + (isFromMentor ? ' from-mentor' : '') + (viewed.has(a.announcementID) ? ' viewed' : '')}
        data-announcement-id={a.announcementID} onClick={() => onOpen(Number(a.announcementID))}>
        <div className="announce-author-row"><span className="announce-source-wrap">
          {posterName ? <><span className="announce-poster-name">{posterName}</span>{' '}</> : null}
          <span className={'announce-source ' + sourceClass}>{sourceLabel}</span>
        </span></div>
        <div className="announce-title">{a.title || 'Announcement'}</div>
        <div className="announce-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.content || '') }} />
        <div className="announce-footer">
          <span className="announce-date">{date}</span>
        </div>
      </div>
    );
  });
}

function EvaluationItem({ a, proofPaths, statusAvailable, uploading, error, onRetry, onUpload, onOpen }) {
  const date = new Date(a.postedAt || Date.now()).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const now = new Date();
  const dl = evaluationDeadline(a.deadline);
  const past = dl && dl <= now;
  const soon = dl && !past && (dl - now) < 3 * 24 * 60 * 60 * 1000;
  const submitted = proofPaths.has(a.linkID);
  const proofPath = proofPaths.get(a.linkID);

  const deadline = a.deadline
    ? <span className={past ? 'dash-eval-deadline past' : soon ? 'dash-eval-deadline soon' : 'dash-eval-deadline'}><i className="ti ti-clock"></i> Due {evaluationDeadlineLabel(a.deadline)}{past ? ' · Overdue' : ''}</span>
    : null;
  const action = past
    ? <span className="dash-eval-closed">Open Form</span>
    : submitted
      ? <a href={a.googleFormURL} target="_blank" rel="noopener noreferrer" className="dash-eval-link-muted">Open Form</a>
      : <a href={a.googleFormURL} target="_blank" rel="noopener noreferrer" className="dash-eval-btn"><i className="ti ti-external-link"></i> Open Form</a>;
  const mark = !statusAvailable
    ? <><span role="status">Submission status unavailable.</span><button type="button" className="dash-eval-mark-btn" onClick={onRetry}>Retry</button></>
    : submitted
      ? <><span className="dash-eval-submitted-badge"><i className="ti ti-check"></i> Submitted</span>
        {proofPath ? <>{' '}<a className="eval-view-proof-link" href={CONFIG.getFileUrl(proofPath)} target="_blank" rel="noopener">View</a></> : null}</>
      : <><label className={'dash-eval-mark-btn dash-eval-upload-label' + (uploading ? ' is-uploading' : '')}>
          <i className="ti ti-upload"></i> Upload proof{' '}
          <input type="file" accept="image/*" hidden onChange={e => onUpload(e.target)} />
        </label>{' '}
        <details className="eval-upload-instructions">
          <summary>Upload instructions: images up to 20 MB</summary>
          {' '}Upload a clear screenshot of the evaluation form's submission confirmation. Accepted: JPG/JPEG, PNG, GIF, WEBP; maximum 20 MB per file. HEIC/HEIF and RAW are not supported: export a JPG/PNG copy first. For iPhone screenshots, use Settings &gt; General &gt; Screen Capture &gt; SDR, if available, to save PNG. If too large, resize or compress the image while keeping the text readable.
        </details>{' '}
        <span className="eval-upload-error" id={`dash-eval-upload-err-${a.linkID}`}>{error}</span></>;

  // The card opens the full Announcements page, except from its own controls.
  const onClick = e => {
    if (e.target.closest('details, summary, a, button, input, label, .dash-eval-btn, .dash-eval-link-muted, .dash-eval-closed, .dash-eval-mark-btn, .eval-unmark-btn, .eval-view-proof-link')) return;
    onOpen();
  };
  return (
    <div className={'announce-item announce-item-eval' + (submitted ? ' eval-submitted' : '')} data-eval-link-id={a.linkID} onClick={onClick}>
      <div className="announce-title">{a.title || 'Evaluation'}</div>
      <div className="evaluation-author"><strong>{a.postedByName || 'Name unavailable'}</strong></div>
      {a.description ? <div className="announce-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.description) }} /> : null}
      <div className="announce-footer">
        <span className="announce-date">{date}</span>
        {' '}
        <span className="announce-source-wrap">
          {deadline}{deadline ? ' ' : null}
          {past ? <><span>You can still upload proof after the deadline.</span>{' '}</> : null}
          <span className="announce-source evaluation">Evaluation</span>
          {' '}{mark}{' '}
          {action}
        </span>
      </div>
    </div>
  );
}
