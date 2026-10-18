let dashboardCalendar = [];
/* ============================================================
   ASTRA MENTOR — mentor-dashboard.js
   ============================================================ */

let currentUser = null;

// Mirrors AstraMentoring-Backend/AstraMentoring-Backend/Constants/MentoringSlots.cs
// (same pattern already duplicated in sessions.js/logsheet.js) — used here
// only to compute the "X of Y required" total for the Sessions Completed card.
const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals'
];
function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
function slotsForSemester(semester) {
  return semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;
}

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentor');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  const session = getSession();
  currentUser = session.user;

  const first = currentUser?.firstName || 'Mentor';
  document.getElementById('welcomeTitle').textContent = `Welcome, ${first}!`;
  document.getElementById('dashboardDate').textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const mentorId = currentUser?.userID;

  await Promise.allSettled([
    loadSessionStats(mentorId),
    loadMentees(mentorId),
    loadAnnouncements(),
    loadCalendarOverview(),
    loadSemesterBadge(),
  ]);

});

// ── SESSION STATS ─────────────────────────────────────────────
// "Completed" and "Attendance Rate" are progress toward THIS semester's
// required session count — they're meant to start over at 0 the moment
// the semester (or school year) changes, same as a mentee's own required-
// sessions tracking does. Nothing here deletes or hides older sessions —
// the Recent Sessions list below stays unfiltered so past semesters are
// still there to look back on; only these two "current progress" numbers
// are scoped to the semester that's active right now.
// A session stays "upcoming" until it is completed, cancelled, or its
// checkpoint window closes, including one whose start time has passed but
// still needs attendance.
function isOpenSession(s, now) {
  const state = dashboardSessionState(s, dashboardCalendar, now);
  return state === 'Upcoming' || state === 'Past Scheduled' || state === 'In Progress';
}

async function loadSessionStats(mentorId) {
  try {
    const [data, progress, calendar] = await Promise.all([
      apiRequest(`SessionsAdmin/${mentorId}/sessions`, 'GET', null, true),
      apiRequest(`MonitorActivities/${mentorId}`, 'GET', null, true).catch(() => null),
      apiRequest('CalendarEvents', 'GET', null, true).catch(() => []),
    ]);
    dashboardCalendar = Array.isArray(calendar) ? calendar : [];
    const sessions   = data?.sessions || [];
    // Upcoming sessions remain independent of progress availability.
    const upcoming  = sessions.filter(s => isOpenSession(s)).length;

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

    document.getElementById('statCompleted').textContent = hasSharedProgress ? `${completed}/${requiredSessions}` : '\u2014';
    document.getElementById('statCompleted').title = hasSharedProgress ? '' : 'Progress unavailable. Please refresh to try again.';
    document.getElementById('statUpcoming').textContent  = upcoming;
    document.getElementById('statAttRate').textContent = hasSharedProgress ? `${mentorAttendance}%` : '\u2014';
    document.getElementById('statAttRate').title = hasSharedProgress ? '' : 'Progress unavailable. Please refresh to try again.';

    renderSessionCards(sessions);
  } catch (e) {
    console.error('Sessions load failed:', e);
    document.getElementById('statCompleted').textContent = '\u2014';
    document.getElementById('statUpcoming').textContent = '\u2014';
    document.getElementById('statAttRate').textContent   = '—';
    document.getElementById('upcomingSessionsList').innerHTML =
      '<div class="empty-state"><i class="ti ti-calendar-off"></i>Unable to load sessions. Please refresh.</div>';
    document.getElementById('recentSessionsList').innerHTML =
      '<div class="empty-state"><i class="ti ti-calendar-off"></i>Unable to load sessions. Please refresh.</div>';
  }
}

function renderSessionCards(sessions) {
  const now   = new Date();
  const upcoming = sessions.filter(s => isOpenSession(s, now)).sort((a,b) => new Date(a.sessionDate)-new Date(b.sessionDate)).slice(0,3);
  const recent = sessions.filter(s => !isOpenSession(s, now)).sort((a,b) => new Date(b.cancelledAt || b.sessionDate)-new Date(a.cancelledAt || a.sessionDate)).slice(0,3);

  const renderItem = (s) => {
    const date       = new Date(s.sessionDate);
    const isPast     = date < now;
    const month      = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day        = date.getDate();
    const time       = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    // isMakeup/sectionCode come straight from the backend (Sessions.
    // SectionCode, present from the moment a session is created) instead
    // of being guessed from whether the free-text topic happens to start
    // with a "[SECTION]" bracket — that guess silently broke for any
    // session whose notes didn't follow the convention, and for mentors
    // handling more than one section it had no way to tell which one a
    // given session actually belonged to.
    const courseTag  = s.isMakeup ? null : (s.sectionCode || null);
    const typeLabel  = s.isMakeup ? (s.slotName ? `Make-up Session: ${s.slotName}` : 'Make-up Session') : (s.slotName || 'Scheduled Session');
    const status     = dashboardSessionState(s, dashboardCalendar, now);

    let cls = '', tag = '';
    if (status === 'Completed') {
      cls = ' session-item-completed';
      tag = '<span class="session-status-tag tag-completed">Completed</span>';
    } else if (status === 'Cancelled') {
      cls = ' session-item-cancelled';
      tag = '<span class="session-status-tag tag-cancelled">Cancelled</span>';
    } else if (status === 'Closed' || status === 'In Progress') {
      tag = '<span class="session-status-tag tag-pending">' + status + '</span>';
    } else if (isPast) {
      cls = ' session-item-pending';
      tag = '<span class="session-status-tag tag-pending">Needs Attendance</span>';
    }

    let attHtml = '';
    if (status === 'Completed' && s.totalAttendees > 0) {
      attHtml = `<span class="sess-att-pill"><i class="ti ti-users"></i> ${s.presentCount}/${s.totalAttendees} attended</span>`;
    } else if (status !== 'Cancelled' && s.totalAttendees > 0) {
      attHtml = `<span class="sess-att-pill expected"><i class="ti ti-users"></i> ${s.totalAttendees} expected</span>`;
    }

    return `
      <div class="session-item${cls}">
        <div class="session-date-block">
          <div class="session-month">${month}</div>
          <div class="session-day">${day}</div>
        </div>
        <div class="session-info">
          <div class="session-title">${typeLabel}${courseTag ? ` <span class="session-course-tag">${courseTag}</span>` : ''}</div>
          <div class="session-footer">
            <div class="session-time">${time} ${tag}</div>
            ${attHtml}
          </div>
        </div>
      </div>`;
  };

  document.getElementById('upcomingSessionsList').innerHTML = upcoming.length
    ? upcoming.map(s => renderItem(s)).join('')
    : '<div class="empty-state"><i class="ti ti-calendar-off"></i>No upcoming sessions.</div>';

  document.getElementById('recentSessionsList').innerHTML = recent.length
    ? recent.map(s => renderItem(s)).join('')
    : '<div class="empty-state"><i class="ti ti-history"></i>No recent sessions.</div>';
}

// ── MENTEES ───────────────────────────────────────────────────
async function loadMentees(mentorId) {
  try {
    const assignments = await apiRequest('Users/assignments', 'GET', null, true);
    const mine = (assignments || []).filter(a => a.mentorUserID === mentorId);
    document.getElementById('statMentees').textContent = mine.length;
  } catch (e) {
    console.error('Mentees load failed:', e);
    document.getElementById('statMentees').textContent = '0';
  }
}

// ── SEMESTER BADGE ────────────────────────────────────────────
async function loadSemesterBadge() {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    const semester  = data?.Semester  || data?.semester  || '1st Semester';
    const schoolYear = data?.SchoolYear || data?.schoolYear || '2026-2027';
    document.getElementById('semesterBadge').textContent = `${semester} · SY ${schoolYear}`;
  } catch (e) {
    document.getElementById('semesterBadge').textContent = '';
  }
}

// ── ANNOUNCEMENTS ─────────────────────────────────────────────
// "Latest from the administration" — this widget is Admin/Head posts
// only. A mentor's own posts used to sneak in here too (tagged with a
// "Mentor" badge, as if the widget were a general feed), which didn't
// match what the heading actually says; the mentor's own posts already
// have a home on the full Announcements page. Also: every non-mentor
// post used to show a flat "Admin" badge regardless of who actually
// posted it — Head Admin's posts now get their own label instead of
// being folded into Admin's.
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

async function loadAnnouncements() {
  try {
    const items = await apiRequest('Announcements', 'GET', null, true);
    const myId  = currentUser?.userID;

    const filtered = (items || []).filter(a => {
      if (a.postedByUserID === myId) return false;
      const aud = (a.targetAudience || '').toLowerCase();
      return aud === 'mentor' || aud === 'both';
    });

    const recent = filtered
      .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
      .slice(0, 5);

    const container = document.getElementById('announcementsList');

    if (!recent.length) {
      container.innerHTML = '<div class="empty-state"><i class="ti ti-speakerphone-off"></i>No announcements yet.</div>';
      return;
    }

    const seen = getViewedAnnouncementIds();

    container.innerHTML = recent.map(a => {
      const title   = a.title   || 'Announcement';
      const content = a.content || '';
      const date    = new Date(a.postedAt || Date.now())
        .toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

      const posterFirst = a.posterFirstName || '';
      const posterLast  = a.posterLastName  || '';
      const posterName  = `${posterFirst} ${posterLast}`.trim() || 'Administrator';
      const isHead       = (a.posterRole || '').toLowerCase() === 'head';
      const roleClass    = isHead ? 'head' : 'admin';
      const roleLabel    = isHead ? 'Head Admin' : 'Admin';
      const isViewed     = seen.has(a.announcementID);

      return `
        <div class="announce-item from-admin${isViewed ? ' viewed' : ''}" data-announcement-id="${a.announcementID}">
          <div class="announce-author-row"><span class="announce-source-wrap">
              <span class="announce-poster-name">${escapeHtml(posterName)}</span>
              <span class="announce-source ${roleClass}">${roleLabel}</span>
            </span></div>
          <div class="announce-title">${escapeHtml(title)}</div>
          <div class="announce-body">${sanitizeHtml(content)}</div>
          <div class="announce-footer">
            <span class="announce-date">${date}</span>

          </div>
        </div>`;
    }).join('');

    // Clicking a card marks it read (so it's already faded next visit)
    // and takes the mentor straight to that post on the full Announcements
    // page — this widget is a preview, not the place to read the whole
    // thing, so the click goes to where the real content (and any
    // attachments/comments) actually lives.
    container.querySelectorAll('.announce-item[data-announcement-id]').forEach(item => {
      item.addEventListener('click', () => {
        const id = Number(item.dataset.announcementId);
        markAnnouncementViewed(id);
        window.location.href = `announcements.html?id=${id}`;
      });
    });
  } catch (e) {
    console.error('Announcements load failed:', e);
    document.getElementById('announcementsList').innerHTML =
      '<div class="empty-state"><i class="ti ti-speakerphone-off"></i>Could not load announcements.</div>';
  }
}

// Calendar dates are academic calendar days, independent of the browser time zone.
function upcomingCalendarItems(events, now = new Date()) {
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
  return events.filter(event => {
    const start = String(event.startDate || '').slice(0, 10);
    const end = String(event.endDate || event.startDate || '').slice(0, 10);
    return event.isPublished === true && /^\d{4}-\d{2}-\d{2}$/.test(start) && end >= today;
  }).sort((a,b) => String(a.startDate).localeCompare(String(b.startDate))).slice(0,4);
}
async function loadCalendarOverview() {
  const container = document.getElementById('calendarOverviewList');
  try {
    const events = await apiRequest('CalendarEvents', 'GET', null, true);
    const items = upcomingCalendarItems(Array.isArray(events) ? events : []);
    const formatDay = value => {
      const day = String(value || '').slice(0,10);
      return new Date(day + 'T00:00:00+08:00').toLocaleDateString('en-PH', {timeZone:'Asia/Manila', month:'short', day:'numeric', year:'numeric'});
    };
    container.innerHTML = items.length ? items.map(event => {
      const label = event.eventType === 'Deadline' ? 'Submission Deadline' : event.eventType || 'Activity';
      const start = formatDay(event.startDate);
      const dates = event.endDate && event.endDate.slice(0,10) !== event.startDate.slice(0,10) ? start + ' \u2013 ' + formatDay(event.endDate) : start;
      return `<a class="calendar-overview-item" href="calendar.html"><span class="calendar-overview-type${event.eventType === 'Deadline' ? ' deadline' : ''}">${escapeHtml(label)}</span><strong>${escapeHtml(event.title || event.slotName || 'Calendar activity')}</strong><span class="calendar-overview-date"><i class="ti ti-calendar" aria-hidden="true"></i> ${escapeHtml(dates)}</span></a>`;
    }).join('') : '<div class="empty-state"><i class="ti ti-calendar-event"></i>No ongoing or upcoming published activities.</div>';
  } catch (error) {
    container.innerHTML = '<div class="empty-state">Unable to load the calendar. Please try again later.</div>';
  }
}
