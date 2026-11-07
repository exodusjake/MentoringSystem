import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { apiRequest } from '../../lib/api.js';
import { dashboardSessionState } from '../../lib/dashboard-sessions.js';
import { sanitizeHtml } from '../../lib/security-utils.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';
import { sampleHtml, useTour } from '../../app/tour.js';
import { MENTOR_SAMPLE as SM } from '../../app/tourMentor.js';

// MENTOR/HTML/mentor-dashboard.html + MENTOR/JS/mentor-dashboard.js

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

// ── SESSION STATS ──
// "Completed" and "Attendance Rate" are progress toward THIS semester's required session count. A session
// stays "upcoming" until it is completed, cancelled, or its checkpoint window closes, including one whose
// start time has passed but still needs attendance.
function isOpenSession(s, calendar, now) {
  const state = dashboardSessionState(s, calendar, now);
  return state === 'Upcoming' || state === 'Past Scheduled' || state === 'In Progress';
}

// Keyed by user ID so different accounts on the same browser don't share "viewed" state.
function viewedAnnouncementsKey() {
  const session = getSession();
  const userId  = session?.user?.UserID || session?.user?.userID;
  return `viewedAnnouncementIds_mentor_${userId ?? 'anon'}`;
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

// Calendar dates are academic calendar days, independent of the browser time zone.
function upcomingCalendarItems(events, now = new Date()) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return events.filter(event => {
    const start = String(event.startDate || '').slice(0, 10);
    const end = String(event.endDate || event.startDate || '').slice(0, 10);
    return event.isPublished === true && /^\d{4}-\d{2}-\d{2}$/.test(start) && end >= today;
  }).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))).slice(0, 4);
}
const formatDay = value => {
  const day = String(value || '').slice(0, 10);
  return new Date(day + 'T00:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
};

const Skeleton = ({ text }) => <div className="list-skeleton"><span className="spinner"></span> {text}</div>;
const pulse = <span className="stat-pulse">—</span>;

export default function MentorDashboard() {
  const wt = useTour().active;   // walkthrough: show sample data
  useBackGuard();
  const navigate = useNavigate();
  const currentUser = getSession()?.user;
  const mentorId = currentUser?.userID;

  const [stats, setStats] = useState({ mentees: pulse, completed: pulse, upcoming: pulse, attRate: pulse, completedTitle: undefined, attTitle: undefined });
  const [calendar, setCalendar] = useState([]);
  const [sessions, setSessions] = useState(null);          // null = loading, false = failed, [] = loaded
  const [announcements, setAnnouncements] = useState(null); // null = loading, false = failed, [] = loaded
  const [overview, setOverview] = useState(null);           // null = loading, false = failed
  const [badge, setBadge] = useState('');

  const patch = p => setStats(s => ({ ...s, ...p }));

  async function loadSessionStats() {
    try {
      const [data, progress, cal] = await Promise.all([
        apiRequest(`SessionsAdmin/${mentorId}/sessions`, 'GET', null, true),
        apiRequest(`MonitorActivities/${mentorId}`, 'GET', null, true).catch(() => null),
        apiRequest('CalendarEvents', 'GET', null, true).catch(() => []),
      ]);
      const calArr = Array.isArray(cal) ? cal : [];
      setCalendar(calArr);
      const list = data?.sessions || [];
      // Upcoming sessions remain independent of progress availability.
      const upcoming = list.filter(s => isOpenSession(s, calArr)).length;

      // Use authoritative checkpoint totals; history cannot reconstruct missing sections.
      const progressCompleted = Number(progress?.completedSessions ?? progress?.CompletedSessions);
      const progressRequired = Number(progress?.requiredSessions ?? progress?.RequiredSessions);
      const progressPercent = Number(progress?.progressPercent ?? progress?.ProgressPercent);
      const hasSharedProgress = Number.isFinite(progressCompleted)
        && Number.isFinite(progressRequired) && progressRequired > 0;
      const completed = progressCompleted;
      const requiredSessions = progressRequired;
      const mentorAttendance = Number.isFinite(progressPercent) && hasSharedProgress
        ? clampPercent(Math.round(progressPercent))
        : requiredSessions > 0
          ? clampPercent(Math.round(completed / requiredSessions * 100))
          : 0;
      const unavailable = 'Progress unavailable. Please refresh to try again.';
      patch({
        completed: hasSharedProgress ? `${completed}/${requiredSessions}` : '—',
        completedTitle: hasSharedProgress ? '' : unavailable,
        upcoming,
        attRate: hasSharedProgress ? `${mentorAttendance}%` : '—',
        attTitle: hasSharedProgress ? '' : unavailable,
      });
      setSessions(list);
    } catch (e) {
      console.error('Sessions load failed:', e);
      patch({ completed: '—', upcoming: '—', attRate: '—' });
      setSessions(false);
    }
  }

  async function loadMentees() {
    try {
      const assignments = await apiRequest('Users/assignments', 'GET', null, true);
      const mine = (assignments || []).filter(a => a.mentorUserID === mentorId);
      patch({ mentees: mine.length });
    } catch (e) {
      console.error('Mentees load failed:', e);
      patch({ mentees: '0' });
    }
  }

  async function loadSemesterBadge() {
    try {
      const data = await apiRequest('Settings', 'GET', null, true);
      const semester  = data?.Semester  || data?.semester  || '1st Semester';
      const schoolYear = data?.SchoolYear || data?.schoolYear || '2026-2027';
      setBadge(`${semester} · SY ${schoolYear}`);
    } catch (e) {
      setBadge('');
    }
  }

  // "Latest from the administration" — Admin/Head posts only; a mentor's own posts have a home on the
  // full Announcements page.
  async function loadAnnouncements() {
    try {
      const items = await apiRequest('Announcements', 'GET', null, true);
      const filtered = (items || []).filter(a => {
        if (a.postedByUserID === mentorId) return false;
        const aud = (a.targetAudience || '').toLowerCase();
        return aud === 'mentor' || aud === 'both';
      });
      setAnnouncements(filtered.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt)).slice(0, 5));
    } catch (e) {
      console.error('Announcements load failed:', e);
      setAnnouncements(false);
    }
  }

  async function loadCalendarOverview() {
    try {
      const events = await apiRequest('CalendarEvents', 'GET', null, true);
      setOverview(upcomingCalendarItems(Array.isArray(events) ? events : []));
    } catch (error) {
      setOverview(false);
    }
  }

  useEffect(() => {
    Promise.allSettled([loadSessionStats(), loadMentees(), loadAnnouncements(), loadCalendarOverview(), loadSemesterBadge()]);
  }, []);

  // ── Session cards ──
  const now = new Date();
  const renderItem = s => {
    const date = new Date(s.sessionDate);
    const isPast = date < now;
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    // isMakeup/sectionCode come straight from the backend.
    const courseTag = s.isMakeup ? null : (s.sectionCode || null);
    const typeLabel = s.isMakeup ? (s.slotName ? `Make-up Session: ${s.slotName}` : 'Make-up Session') : (s.slotName || 'Scheduled Session');
    const status = dashboardSessionState(s, calendar, now);

    let cls = '', tag = null;
    if (status === 'Completed') {
      cls = ' session-item-completed';
      tag = <span className="session-status-tag tag-completed">Completed</span>;
    } else if (status === 'Cancelled') {
      cls = ' session-item-cancelled';
      tag = <span className="session-status-tag tag-cancelled">Cancelled</span>;
    } else if (status === 'Closed' || status === 'In Progress') {
      tag = <span className="session-status-tag tag-pending">{status}</span>;
    } else if (isPast) {
      cls = ' session-item-pending';
      tag = <span className="session-status-tag tag-pending">Needs Attendance</span>;
    }

    let att = null;
    if (status === 'Completed' && s.totalAttendees > 0) {
      att = <span className="sess-att-pill"><i className="ti ti-users"></i> {s.presentCount}/{s.totalAttendees} attended</span>;
    } else if (status !== 'Cancelled' && s.totalAttendees > 0) {
      att = <span className="sess-att-pill expected"><i className="ti ti-users"></i> {s.totalAttendees} expected</span>;
    }

    return (
      <div className={`session-item${cls}`} key={s.sessionID ?? `${s.sessionDate}-${typeLabel}`}>
        <div className="session-date-block">
          <div className="session-month">{month}</div>
          <div className="session-day">{day}</div>
        </div>
        <div className="session-info">
          <div className="session-title">{typeLabel}{courseTag ? <> <span className="session-course-tag">{courseTag}</span></> : null}</div>
          <div className="session-footer">
            <div className="session-time">{time} {tag}</div>
            {att}
          </div>
        </div>
      </div>
    );
  };

  const unableSessions = <div className="empty-state"><i className="ti ti-calendar-off"></i>Unable to load sessions. Please refresh.</div>;
  let upcomingList, recentList;
  if (sessions === null) { upcomingList = <Skeleton text="Loading..." />; recentList = <Skeleton text="Loading..." />; }
  else if (sessions === false) { upcomingList = unableSessions; recentList = unableSessions; }
  else {
    const upcoming = sessions.filter(s => isOpenSession(s, calendar, now)).sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate)).slice(0, 3);
    const recent = sessions.filter(s => !isOpenSession(s, calendar, now)).sort((a, b) => new Date(b.cancelledAt || b.sessionDate) - new Date(a.cancelledAt || a.sessionDate)).slice(0, 3);
    upcomingList = upcoming.length ? upcoming.map(renderItem) : <div className="empty-state"><i className="ti ti-calendar-off"></i>No upcoming sessions.</div>;
    recentList = recent.length ? recent.map(renderItem) : <div className="empty-state"><i className="ti ti-history"></i>No recent sessions.</div>;
  }

  // ── Announcements ──
  let announceList;
  if (announcements === null) announceList = <Skeleton text="Loading announcements..." />;
  else if (announcements === false) announceList = <div className="empty-state"><i className="ti ti-speakerphone-off"></i>Could not load announcements.</div>;
  else if (!announcements.length) announceList = <div className="empty-state"><i className="ti ti-speakerphone-off"></i>No announcements yet.</div>;
  else {
    const seen = getViewedAnnouncementIds();
    announceList = announcements.map(a => {
      const title = a.title || 'Announcement';
      const content = a.content || '';
      const date = new Date(a.postedAt || Date.now()).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
      const posterName = `${a.posterFirstName || ''} ${a.posterLastName || ''}`.trim() || 'Administrator';
      const isHead = (a.posterRole || '').toLowerCase() === 'head';
      const isViewed = seen.has(a.announcementID);
      // Clicking a card marks it read and takes the mentor to that post on the full Announcements page.
      return (
        <div className={`announce-item from-admin${isViewed ? ' viewed' : ''}`} data-announcement-id={a.announcementID} key={a.announcementID}
          onClick={() => { markAnnouncementViewed(Number(a.announcementID)); navigate(`/mentor/announcements?id=${Number(a.announcementID)}`); }}>
          <div className="announce-author-row"><span className="announce-source-wrap">
            <span className="announce-poster-name">{posterName}</span>
            <span className={`announce-source ${isHead ? 'head' : 'admin'}`}>{isHead ? 'Super Administrator' : 'Administrator'}</span>
          </span></div>
          <div className="announce-title">{title}</div>
          <div className="announce-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}></div>
          <div className="announce-footer">
            <span className="announce-date">{date}</span>
          </div>
        </div>
      );
    });
  }

  // ── Calendar overview ──
  let overviewList;
  if (overview === null) overviewList = <Skeleton text="Loading calendar..." />;
  else if (overview === false) overviewList = <Empty className="empty-state">Unable to load the calendar. Please try again later.</Empty>;
  else if (!overview.length) overviewList = <div className="empty-state"><i className="ti ti-calendar-event"></i>No ongoing or upcoming published activities.</div>;
  else {
    overviewList = overview.map(event => {
      const label = event.eventType === 'Deadline' ? 'Submission Deadline' : event.eventType || 'Activity';
      const start = formatDay(event.startDate);
      const dates = event.endDate && event.endDate.slice(0, 10) !== event.startDate.slice(0, 10) ? start + ' – ' + formatDay(event.endDate) : start;
      return (
        <Link className="calendar-overview-item" to="/mentor/calendar" key={event.eventID ?? `${event.title}-${event.startDate}`}>
          <span className={`calendar-overview-type${event.eventType === 'Deadline' ? ' deadline' : ''}`}>{label}</span>
          <strong>{event.title || event.slotName || 'Calendar activity'}</strong>
          <span className="calendar-overview-date"><i className="ti ti-calendar" aria-hidden="true"></i> {dates}</span>
        </Link>
      );
    });
  }

  const first = currentUser?.firstName || 'Mentor';
  const dateStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Page id="MENTOR/mentor-dashboard">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1 id="welcomeTitle">Welcome, {first}!</h1>
              <p id="dashboardDate">{dateStr}</p>
            </div>
            <span className="semester-badge" id="semesterBadge">{badge}</span>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon-wrap teal"><i className="ti ti-users"></i></div>
              <div className="stat-body">
                <div className="stat-value" id="statMentees">{wt ? SM.dashboard.mentees : stats.mentees}</div>
                <div className="stat-label">My Mentees</div>
                <div className="stat-sub">Assigned this semester</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrap green"><i className="ti ti-circle-check"></i></div>
              <div className="stat-body">
                <div className="stat-value" id="statCompleted" title={stats.completedTitle}>{wt ? SM.dashboard.completed : stats.completed}</div>
                <div className="stat-label">Course Sessions Completed</div>
                <div className="stat-sub">This semester</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrap blue"><i className="ti ti-calendar-event"></i></div>
              <div className="stat-body">
                <div className="stat-value" id="statUpcoming">{wt ? SM.dashboard.upcoming : stats.upcoming}</div>
                <div className="stat-label">Upcoming Sessions</div>
                <div className="stat-sub">Scheduled or awaiting attendance</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrap"><i className="ti ti-chart-bar"></i></div>
              <div className="stat-body">
                <div className="stat-value" id="statAttRate" title={stats.attTitle}>{wt ? SM.dashboard.attRate : stats.attRate}</div>
                <div className="stat-label">Semester Completion</div>
                <div className="stat-sub">Completed course sessions / required course sessions</div>
              </div>
            </div>
          </div>

          <div className="sessions-row">
            <div className="card">
              <div className="card-header-row">
                <div>
                  <h2>Upcoming Sessions</h2>
                  <p className="card-desc">Scheduled sessions ahead.</p>
                </div>
              </div>
              <div id="upcomingSessionsList" className="sessions-list" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, SM.dashboard.upcomingList)}>{wt ? undefined : upcomingList}</div>
              <div className="card-view-footer">
                <Link to="/mentor/sessions" className="card-view-link">View all sessions <i className="ti ti-arrow-right"></i></Link>
              </div>
            </div>
            <div className="card">
              <div className="card-header-row">
                <div>
                  <h2>Recent Sessions</h2>
                  <p className="card-desc">Latest completed, cancelled, and past scheduled sessions.</p>
                </div>
              </div>
              <div id="recentSessionsList" className="sessions-list" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, SM.dashboard.recentList)}>{wt ? undefined : recentList}</div>
              <div className="card-view-footer">
                <Link to="/mentor/sessions" className="card-view-link">View all sessions <i className="ti ti-arrow-right"></i></Link>
              </div>
            </div>
          </div>

          <div className="dashboard-updates-row">
            <div className="card announcements-card">
              <div className="card-header-row">
                <div>
                  <h2>Announcements</h2>
                  <p className="card-desc">Latest from the administration.</p>
                </div>
              </div>
              <div id="announcementsList" className="announcements-list" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, SM.dashboard.announcements)}>{wt ? undefined : announceList}</div>
              <div className="card-view-footer">
                <Link to="/mentor/announcements" className="card-view-link">View all announcements <i className="ti ti-arrow-right"></i></Link>
              </div>
            </div>
            <div className="card calendar-overview-card">
              <div className="card-header-row"><div><h2>Upcoming Activities &amp; Deadlines</h2><p className="card-desc">Ongoing and upcoming items from the published calendar.</p></div></div>
              <div id="calendarOverviewList" className="calendar-overview-list" aria-live="polite" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, SM.dashboard.calendar)}>{wt ? undefined : overviewList}</div>
              <div className="card-view-footer"><Link to="/mentor/calendar" className="card-view-link">View Calendar <i className="ti ti-arrow-right"></i></Link></div>
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
