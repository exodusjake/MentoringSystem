import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { apiRequest } from '../../lib/api.js';
import { dashboardSessionState } from '../../lib/dashboard-sessions.js';
import { sanitizeHtml } from '../../lib/security-utils.js';
import { getSession } from '../../lib/session.js';
import { useStayOnBack } from './useStayOnBack.js';

// Mentor dashboard (MENTOR/HTML/mentor-dashboard.html + mentor-dashboard.js).
function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

// A session stays "upcoming" until it is completed, cancelled, or its checkpoint window closes,
// including one whose start time has passed but still needs attendance.
function isOpenSession(s, calendar, now) {
  const state = dashboardSessionState(s, calendar, now);
  return state === 'Upcoming' || state === 'Past Scheduled' || state === 'In Progress';
}

// "Viewed" announcements, keyed by user ID so accounts on the same browser don't share it.
function viewedAnnouncementsKey() {
  const session = getSession();
  const userId = session?.user?.UserID || session?.user?.userID;
  return `viewedAnnouncementIds_mentor_${userId ?? 'anon'}`;
}
function getViewedAnnouncementIds() {
  try { return new Set(JSON.parse(localStorage.getItem(viewedAnnouncementsKey()) || '[]')); }
  catch { return new Set(); }
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

const pulse = <span className="stat-pulse">—</span>;
const skeleton = text => <div className="list-skeleton"><span className="spinner"></span>{' '}{text}</div>;

export default function MentorDashboard() {
  useStayOnBack();
  const navigate = useNavigate();
  const [user] = useState(() => getSession().user);
  const [stats, setStats] = useState(null);           // { completed, completedTitle, upcoming, rate, rateTitle }
  const [sessions, setSessions] = useState({ state: 'loading' });
  const [mentees, setMentees] = useState(null);
  const [announcements, setAnnouncements] = useState({ state: 'loading' });
  const [calendar, setCalendar] = useState({ state: 'loading' });
  const [semesterBadge, setSemesterBadge] = useState('');

  useEffect(() => {
    const mentorId = user?.userID;

    (async () => {
      try {
        const [data, progress, cal] = await Promise.all([
          apiRequest(`SessionsAdmin/${mentorId}/sessions`, 'GET', null, true),
          apiRequest(`MonitorActivities/${mentorId}`, 'GET', null, true).catch(() => null),
          apiRequest('CalendarEvents', 'GET', null, true).catch(() => []),
        ]);
        const calendarEvents = Array.isArray(cal) ? cal : [];
        const list = data?.sessions || [];
        // Upcoming sessions remain independent of progress availability.
        const upcoming = list.filter(s => isOpenSession(s, calendarEvents)).length;
        // Use authoritative checkpoint totals; history cannot reconstruct missing sections.
        const completed = Number(progress?.completedSessions ?? progress?.CompletedSessions);
        const required = Number(progress?.requiredSessions ?? progress?.RequiredSessions);
        const percent = Number(progress?.progressPercent ?? progress?.ProgressPercent);
        const hasShared = Number.isFinite(completed) && Number.isFinite(required) && required > 0;
        const rate = Number.isFinite(percent) && hasShared
          ? clampPercent(Math.round(percent))
          : required > 0 ? clampPercent(Math.round(completed / required * 100)) : 0;
        const unavailable = 'Progress unavailable. Please refresh to try again.';
        setStats({
          completed: hasShared ? `${completed}/${required}` : '—',
          completedTitle: hasShared ? '' : unavailable,
          upcoming,
          rate: hasShared ? `${rate}%` : '—',
          rateTitle: hasShared ? '' : unavailable,
        });
        setSessions({ state: 'ok', list, calendar: calendarEvents });
      } catch (e) {
        console.error('Sessions load failed:', e);
        setStats({ completed: '—', upcoming: '—', rate: '—' });
        setSessions({ state: 'error' });
      }
    })();

    apiRequest('Users/assignments', 'GET', null, true)
      .then(assignments => setMentees((assignments || []).filter(a => a.mentorUserID === mentorId).length))
      .catch(e => { console.error('Mentees load failed:', e); setMentees('0'); });

    // "Latest from the administration": Admin/Head posts only (the mentor's own posts live on
    // the Announcements page).
    apiRequest('Announcements', 'GET', null, true)
      .then(items => {
        const recent = (items || []).filter(a => {
          if (a.postedByUserID === mentorId) return false;
          const aud = (a.targetAudience || '').toLowerCase();
          return aud === 'mentor' || aud === 'both';
        }).sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt)).slice(0, 5);
        setAnnouncements({ state: 'ok', items: recent, seen: getViewedAnnouncementIds() });
      })
      .catch(e => { console.error('Announcements load failed:', e); setAnnouncements({ state: 'error' }); });

    apiRequest('CalendarEvents', 'GET', null, true)
      .then(events => setCalendar({ state: 'ok', items: upcomingCalendarItems(Array.isArray(events) ? events : []) }))
      .catch(() => setCalendar({ state: 'error' }));

    apiRequest('Settings', 'GET', null, true)
      .then(data => {
        const semester = data?.Semester || data?.semester || '1st Semester';
        const schoolYear = data?.SchoolYear || data?.schoolYear || '2026-2027';
        setSemesterBadge(`${semester} · SY ${schoolYear}`);
      })
      .catch(() => setSemesterBadge(''));
  }, []);

  const first = user?.firstName || 'Mentor';
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let upcomingList = skeleton('Loading...'), recentList = skeleton('Loading...');
  if (sessions.state === 'error') {
    upcomingList = <Empty className="empty-state"><i className="ti ti-calendar-off"></i>Unable to load sessions. Please refresh.</Empty>;
    recentList = <Empty className="empty-state"><i className="ti ti-calendar-off"></i>Unable to load sessions. Please refresh.</Empty>;
  } else if (sessions.state === 'ok') {
    const now = new Date();
    const open = s => isOpenSession(s, sessions.calendar, now);
    const upcoming = sessions.list.filter(open).sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate)).slice(0, 3);
    const recent = sessions.list.filter(s => !open(s)).sort((a, b) => new Date(b.cancelledAt || b.sessionDate) - new Date(a.cancelledAt || a.sessionDate)).slice(0, 3);
    upcomingList = upcoming.length
      ? upcoming.map(s => <SessionItem key={s.sessionID} s={s} calendar={sessions.calendar} now={now} />)
      : <Empty className="empty-state"><i className="ti ti-calendar-off"></i>No upcoming sessions.</Empty>;
    recentList = recent.length
      ? recent.map(s => <SessionItem key={s.sessionID} s={s} calendar={sessions.calendar} now={now} />)
      : <Empty className="empty-state"><i className="ti ti-history"></i>No recent sessions.</Empty>;
  }

  let announcementList = skeleton('Loading announcements...');
  if (announcements.state === 'error') {
    announcementList = <Empty className="empty-state"><i className="ti ti-speakerphone-off"></i>Could not load announcements.</Empty>;
  } else if (announcements.state === 'ok') {
    announcementList = announcements.items.length
      ? announcements.items.map(a => <AnnouncementItem key={a.announcementID} a={a} viewed={announcements.seen.has(a.announcementID)}
        onOpen={() => { const id = Number(a.announcementID); markAnnouncementViewed(id); navigate(`/mentor/announcements?id=${id}`); }} />)
      : <Empty className="empty-state"><i className="ti ti-speakerphone-off"></i>No announcements yet.</Empty>;
  }

  let calendarList = skeleton('Loading calendar...');
  if (calendar.state === 'error') {
    calendarList = <Empty className="empty-state">Unable to load the calendar. Please try again later.</Empty>;
  } else if (calendar.state === 'ok') {
    calendarList = calendar.items.length
      ? calendar.items.map((event, i) => {
        const label = event.eventType === 'Deadline' ? 'Submission Deadline' : event.eventType || 'Activity';
        const start = formatDay(event.startDate);
        const dates = event.endDate && event.endDate.slice(0, 10) !== event.startDate.slice(0, 10) ? start + ' – ' + formatDay(event.endDate) : start;
        return (
          <a key={i} className="calendar-overview-item" href="/mentor/calendar">
            <span className={'calendar-overview-type' + (event.eventType === 'Deadline' ? ' deadline' : '')}>{label}</span>
            <strong>{event.title || event.slotName || 'Calendar activity'}</strong>
            <span className="calendar-overview-date"><i className="ti ti-calendar" aria-hidden="true"></i>{' ' + dates}</span>
          </a>
        );
      })
      : <Empty className="empty-state"><i className="ti ti-calendar-event"></i>No ongoing or upcoming published activities.</Empty>;
  }

  const stat = (id, value, title) => (
    <div className="stat-value" id={id} title={title}>{value ?? pulse}</div>
  );

  return (
    <Page id="MENTOR/mentor-dashboard">
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
          {/* Stats Row */}
          <div className="stats-grid">
            <StatCard color="teal" icon="ti-users" label="My Mentees" sub="Assigned this semester">{stat('statMentees', mentees)}</StatCard>
            {' '}
            <StatCard color="green" icon="ti-circle-check" label="Course Checkpoints Completed" sub="This semester">{stat('statCompleted', stats?.completed, stats?.completedTitle)}</StatCard>
            {' '}
            <StatCard color="blue" icon="ti-calendar-event" label="Upcoming Sessions" sub="Scheduled or awaiting attendance">{stat('statUpcoming', stats?.upcoming)}</StatCard>
            {' '}
            <StatCard icon="ti-chart-bar" label="Semester Completion" sub="Completed course checkpoints / required course checkpoints">{stat('statAttRate', stats?.rate, stats?.rateTitle)}</StatCard>
          </div>
          {' '}
          {/* Sessions Row (two side-by-side cards) */}
          <div className="sessions-row">
            <ListCard title="Upcoming Sessions" desc="Scheduled sessions ahead." listId="upcomingSessionsList" listClass="sessions-list"
              href="/mentor/sessions" link="View all sessions">{upcomingList}</ListCard>
            {' '}
            <ListCard title="Recent Sessions" desc="Latest completed, cancelled, and past scheduled sessions." listId="recentSessionsList" listClass="sessions-list"
              href="/mentor/sessions" link="View all sessions">{recentList}</ListCard>
          </div>
          {' '}
          {/* Announcements and published calendar overview */}
          <div className="dashboard-updates-row">
            <ListCard cardClass="announcements-card" title="Announcements" desc="Latest from the administration." listId="announcementsList" listClass="announcements-list"
              href="/mentor/announcements" link="View all announcements">{announcementList}</ListCard>
            {' '}
            <ListCard cardClass="calendar-overview-card" title={<>Upcoming Activities &amp; Deadlines</>} desc="Ongoing and upcoming items from the published calendar."
              listId="calendarOverviewList" listClass="calendar-overview-list" live href="/mentor/calendar" link="View Calendar">{calendarList}</ListCard>
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

function StatCard({ color, icon, label, sub, children }) {
  return (
    <div className="stat-card">
      <div className={'stat-icon-wrap' + (color ? ' ' + color : '')}>
        <i className={'ti ' + icon}></i>
      </div>
      {' '}
      <div className="stat-body">
        {children}
        {' '}
        <div className="stat-label">{label}</div>
        {' '}
        <div className="stat-sub">{sub}</div>
      </div>
    </div>
  );
}

function ListCard({ cardClass, title, desc, listId, listClass, live, href, link, children }) {
  return (
    <div className={'card' + (cardClass ? ' ' + cardClass : '')}>
      <div className="card-header-row">
        <div>
          <h2>{title}</h2>
          {' '}
          <p className="card-desc">{desc}</p>
        </div>
      </div>
      {' '}
      <div id={listId} className={listClass} aria-live={live ? 'polite' : undefined}>{children}</div>
      {' '}
      <div className="card-view-footer">
        <a href={href} className="card-view-link">
          {link}{' '}
          <i className="ti ti-arrow-right"></i>
        </a>
      </div>
    </div>
  );
}

function SessionItem({ s, calendar, now }) {
  const date = new Date(s.sessionDate);
  const isPast = date < now;
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
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
    att = <span className="sess-att-pill"><i className="ti ti-users"></i>{` ${s.presentCount}/${s.totalAttendees} attended`}</span>;
  } else if (status !== 'Cancelled' && s.totalAttendees > 0) {
    att = <span className="sess-att-pill expected"><i className="ti ti-users"></i>{` ${s.totalAttendees} expected`}</span>;
  }

  return (
    <div className={'session-item' + cls}>
      <div className="session-date-block">
        <div className="session-month">{month}</div>
        {' '}
        <div className="session-day">{date.getDate()}</div>
      </div>
      {' '}
      <div className="session-info">
        <div className="session-title">{typeLabel}{courseTag && <>{' '}<span className="session-course-tag">{courseTag}</span></>}</div>
        {' '}
        <div className="session-footer">
          <div className="session-time">{time + ' '}{tag}</div>
          {' '}
          {att}
        </div>
      </div>
    </div>
  );
}

function AnnouncementItem({ a, viewed, onOpen }) {
  const date = new Date(a.postedAt || Date.now()).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const posterName = `${a.posterFirstName || ''} ${a.posterLastName || ''}`.trim() || 'Administrator';
  const isHead = (a.posterRole || '').toLowerCase() === 'head';
  return (
    <div className={'announce-item from-admin' + (viewed ? ' viewed' : '')} data-announcement-id={a.announcementID} onClick={onOpen}>
      <div className="announce-author-row"><span className="announce-source-wrap">
        <span className="announce-poster-name">{posterName}</span>
        {' '}
        <span className={'announce-source ' + (isHead ? 'head' : 'admin')}>{isHead ? 'Head Admin' : 'Admin'}</span>
      </span></div>
      {' '}
      <div className="announce-title">{a.title || 'Announcement'}</div>
      {' '}
      <div className="announce-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.content || '') }} />
      {' '}
      <div className="announce-footer">
        <span className="announce-date">{date}</span>
      </div>
    </div>
  );
}
