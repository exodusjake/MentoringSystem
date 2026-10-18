/* ============================================================
   HEAD ADMIN — dashboard.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('head');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  document.getElementById('dashDate').textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  loadDashboard();
});

async function loadDashboard() {
  try {
    const [statsRes, settings, activitiesRes, recent] = await Promise.all([
      apiRequest('Users/stats',       'GET', null, true).catch(() => null),
      apiRequest('Settings',          'GET', null, true).catch(() => ({})),
      apiRequest('MonitorActivities', 'GET', null, true).catch(() => null),
      apiRequest('Activities?top=25', 'GET', null, true).catch(() => null),
      MentorSchools.load(),
    ]);
    const stats      = statsRes;
    const activities = activitiesRes;

    renderAcademicPeriod(settings);
    renderMentorPerformanceCard(activities);
    renderMenteeEngagement(stats);
    renderSystemAlerts(stats, activities);
    renderTop3Mentors(activities);
    renderRecentActivities(recent);
    renderSchoolBreakdown(activities);

    if (!statsRes)                   showAlertsUnavailable([2, 3]);
    if (!activitiesRes)              showAlertsUnavailable([1]);
    if (!statsRes || !activitiesRes) showDashboardLoadWarning();
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = (val !== null && val !== undefined) ? val : '—';
}

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Pending';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

// ── Academic Period ───────────────────────────────────────────
function renderAcademicPeriod(settings) {
  const sy  = settings?.SchoolYear || settings?.schoolYear || '—';
  const sem = settings?.Semester   || settings?.semester   || '—';
  setText('academicPeriod', `${sem}, S.Y. ${sy}`);
}


// ── Mentor Performance Breakdown ─────────────────────────────
// Replaces the old Chart.js bar chart (renderProgressChart) and the
// separate stats.sessionDistribution-based renderMentorPerformance —
// those two computed overlapping Excellent/OnTrack/Behind/Critical
// figures from two different endpoints that could in principle drift.
// One pass over MonitorActivities' per-mentor list now drives both the
// segmented bar and the 4 stat numbers, matching exactly what School
// Breakdown and Top 3 Mentors already compute this same way.
function renderMentorPerformanceCard(data) {
  if (!data || !Array.isArray(data.mentors || data.Mentors)) { dashboardUnavailable(['totalMentors','mNotStarted','mNeedsAttention','mOnTrack','mExcellent','progressChartDesc','mPending'], ['mentorSegBar']); return; }
  const mentors = data?.mentors || data?.Mentors || [];
  const counts  = { 'Not Started': 0, 'Needs Attention': 0, 'On Track': 0, Excellent: 0, Pending: 0 };
  mentors.forEach(m => {
    const status = m.progressStatus    || m.ProgressStatus    || 'Pending';
    const done   = m.completedSessions ?? m.CompletedSessions ?? 0;
    const group = mentorTierGroup(status, done);
    counts[Object.hasOwn(counts, group) ? group : 'Pending']++;
  });

  const total  = mentors.length;
  const needsAttention = counts['Needs Attention'];

  setText('progressChartDesc', `${total} active mentor account${total !== 1 ? 's' : ''} · ${needsAttention} need${needsAttention !== 1 ? '' : 's'} follow-up; ${counts.Pending} Pending (performance unfinalized).`);
  setText('totalMentors', total);
  setText('mPending', counts.Pending);
  setText('mNotStarted',     counts['Not Started']);
  setText('mNeedsAttention', counts['Needs Attention']);
  setText('mOnTrack',        counts['On Track']);
  setText('mExcellent',      counts.Excellent);

  renderSegBar('mentorSegBar', total, [
    { count: counts['Not Started'],    color: 'var(--status-critical)' },
    { count: counts['Needs Attention'],color: 'var(--status-behind)' },
    { count: counts['On Track'],       color: 'var(--status-on-track)' },
    { count: counts.Excellent,         color: 'var(--status-excellent)' },
    { count: counts.Pending, color: '#6b7280' },
  ]);
}

// Shared by Mentor Performance and Mentee Engagement — renders count/total
// proportioned colored segments into the target element; segments with 0
// count are skipped entirely rather than left as 0-width divs.
function renderSegBar(id, total, segments) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!total) { el.innerHTML = ''; return; }
  el.innerHTML = segments
    .filter(s => s.count > 0)
    .map(s => `<div style="width:${(s.count / total * 100).toFixed(2)}%;background:${s.color}"></div>`)
    .join('');
}

// ── Mentee Engagement Breakdown ──────────────────────────────
function renderMenteeEngagement(stats) {
  if (!stats) { dashboardUnavailable(['engActive','engInactive','engExcellent','engOnTrack','engNeedsAttn','engNoSessions','totalMentees','totalDropout'], ['menteeSegBar']); return; }
  const active   = stats.activeMentees ?? 0;
  const assigned = stats.assigned      ?? 0;
  const inactive = Math.max(0, assigned - active);
  const total    = stats.totalMentees  ?? 0;
  const dropout  = stats.droppedOut   ?? 0;

  const sd          = stats.menteeStatusDistribution || {};
  const excellent   = sd['Excellent']  ?? 0;
  const onTrack     = sd['OnTrack']    ?? 0;
  const needsAttn   = (sd['Behind'] ?? 0) + (sd['AtRisk'] ?? 0) + (sd['Critical'] ?? 0);
  const noSessions  = sd['NoSessions'] ?? 0;

  setText('engActive',    active);
  setText('engInactive',  inactive);
  setText('engExcellent', excellent);
  setText('engOnTrack',   onTrack);
  setText('engNeedsAttn', needsAttn);
  setText('engNoSessions',noSessions);
  setText('totalMentees', total);
  setText('totalDropout', dropout);

  renderSegBar('menteeSegBar', excellent + onTrack + needsAttn + noSessions, [
    { count: excellent,  color: '#16a34a' },
    { count: onTrack,    color: '#1d4ed8' },
    { count: needsAttn,  color: '#ea580c' },
    { count: noSessions, color: '#dc2626' },
  ]);
}

// ── System Alerts ──────────────────────────────────────────────
// Same 3 alerts and data sources as ADMIN_/JS/dashboard.js's
// renderSystemAlerts — alert 1 links to Mentor Monitoring, alert 3 links
// to Proof Tracking (both Head's own pages). Alert 2 has no link in the
// HTML at all, since Head has no User Management page to send it to.
function renderSystemAlerts(stats, monitorData) {
  if (!stats || !monitorData) {
    if (stats) renderSystemAlerts(stats, { mentors: [] });
    else if (monitorData) renderSystemAlerts({}, monitorData);
    if (!stats) showAlertsUnavailable([2, 3]);
    if (!monitorData) showAlertsUnavailable([1]);
    return;
  }
  const unassigned      = stats.unassigned          ?? 0;
  const sessionsWoProof = stats.sessionsWithoutProof ?? 0;
  // Grouped exactly like the Mentor Performance card (mentorTierGroup).
  const groups          = (monitorData?.mentors || monitorData?.Mentors || []).map(m =>
    mentorTierGroup(m.progressStatus || m.ProgressStatus || 'Pending', m.completedSessions ?? m.CompletedSessions ?? 0));
  const notStarted      = groups.filter(g => g === 'Not Started').length;
  const needsAttention  = groups.filter(g => g === 'Needs Attention').length;
  const behind          = notStarted + needsAttention;
  const pending = groups.filter(g => g === 'Pending').length;

  setText('alertTitle1', `${behind} mentor${behind !== 1 ? 's' : ''} need follow-up`);
  setText('alertSub1',   behind > 0 ? `(${notStarted} not started, ${needsAttention} need${needsAttention !== 1 ? '' : 's'} attention)` : (pending > 0 ? `${pending} Pending; performance not finalized` : 'No finalized mentors need follow-up'));
  setBadge('alertBadge1', behind, 'Urgent', 'urgent', 'red');

  setText('alertTitle2', `${unassigned} unassigned mentee${unassigned !== 1 ? 's' : ''}`);
  setText('alertSub2',   unassigned > 0 ? 'Needs immediate assignment' : 'All mentees assigned');
  setBadge('alertBadge2', unassigned, 'Warning', 'warning', 'orange');

  setText('alertTitle3', `${sessionsWoProof} session${sessionsWoProof !== 1 ? 's' : ''} missing proof`);
  setText('alertSub3',   sessionsWoProof > 0 ? 'Completed sessions with no proof uploaded' : 'All completed sessions have proof');
  setBadge('alertBadge3', sessionsWoProof, 'Review', 'review', 'blue');
}

// Shown instead of "All Clear" when an alert's data failed to load, so an outage doesn't look like good news.
function showAlertsUnavailable(alertNumbers) {
  alertNumbers.forEach(n => {
    setText(`alertTitle${n}`, 'Unavailable');
    setText(`alertSub${n}`,   'See dashboard warning.');
    const badge = document.getElementById(`alertBadge${n}`);
    if (!badge) return;
    badge.textContent = 'Unavailable';
    badge.className   = 'alert-priority-badge';
    const item = badge.closest('.alert-item');
    if (item && n === 1) item.className = 'alert-item red';
  });
}

function showDashboardLoadWarning() {
  if (document.getElementById('dashLoadWarning')) return;
  const header = document.querySelector('.page-header');
  if (!header) return;
  const banner = document.createElement('div');
  banner.id = 'dashLoadWarning';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = 'margin:0 0 16px;padding:10px 14px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:13px;font-weight:500;';
  banner.textContent = "Some dashboard data couldn't be loaded, so the numbers below may be incomplete. Please refresh the page.";
  header.insertAdjacentElement('afterend', banner);
}

// itemColorClass is the card's color when there's something to flag; an all-clear count switches it to green.
function setBadge(id, count, urgentLabel, urgentClass, itemColorClass) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = count > 0 ? urgentLabel : 'All Clear';
  el.className   = `alert-priority-badge ${count > 0 ? urgentClass : 'all-clear'}`;

  const item = el.closest('.alert-item');
  if (item) item.className = `alert-item ${count > 0 ? itemColorClass : 'green'}`;
}

// ── Top 3 Mentors ─────────────────────────────────────────────
// Ranked by overallPercent (Timeliness 25% + Completeness 25% + Evaluation
// Rating 50%) — the same figure that drives the Excellent/On Track/Behind/
// Critical status shown everywhere else, so the leaderboard never
// contradicts those badges. Mentors at exactly 0% are excluded — "winning"
// a spot for doing nothing yet isn't meaningful, especially early in a
// semester.
function renderTop3Mentors(data) {
  if (!data || !Array.isArray(data.mentors || data.Mentors)) { dashboardUnavailable(['top3List']); return; }
  const el = document.getElementById('top3List');
  if (!el) return;

  const mentors = data?.mentors || data?.Mentors || [];
  const ranked = mentors
    .filter(m => (m.progressStatus || m.ProgressStatus || 'Pending') !== 'Pending'
      && (m.overallPercent ?? m.OverallPercent ?? 0) > 0)
    .sort((a, b) => {
      const pctA  = a.overallPercent       ?? a.OverallPercent       ?? 0;
      const pctB  = b.overallPercent       ?? b.OverallPercent       ?? 0;
      const doneA = a.completedSessions    ?? a.CompletedSessions    ?? 0;
      const doneB = b.completedSessions    ?? b.CompletedSessions    ?? 0;
      const menA  = a.menteeCount          ?? a.MenteeCount          ?? 0;
      const menB  = b.menteeCount          ?? b.MenteeCount          ?? 0;
      return pctB - pctA || doneB - doneA || menB - menA
        || `${a.lastName || ''}`.localeCompare(b.lastName || '');
    })
    .slice(0, 3);

  if (!ranked.length) {
    el.innerHTML = '<div class="top3-empty">No finalized positive performance scores available. Checkpoint attendance alone does not finalize a grade; required reports may still be pending.</div>';
    return;
  }

  el.innerHTML = ranked.map((m, i) => {
    const first = m.firstName || m.FirstName || '';
    const last  = m.lastName  || m.LastName  || '';
    const inits = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
    const dept   = m.departmentName || m.DepartmentName || '—';
    const school = m.school         || m.School         || '';
    const pct   = m.overallPercent    ?? m.OverallPercent    ?? 0;
    const id    = m.mentorID || m.MentorID;
    return `
      <div class="top3-row" onclick="window.location.href='mentor-detail.html?id=${id}'">
        <div class="top3-rank rank-${i + 1}">${i + 1}</div>
        <div class="top3-avatar">${escHtml(inits)}</div>
        <div class="top3-info">
          <div class="top3-name">${escHtml(first)} ${escHtml(last)}</div>
          <div class="top3-dept">${escHtml(dept)}${school ? ` · ${escHtml(school)}` : ''}</div>
        </div>
        <div class="top3-progress">
          <span class="top3-pct">${pct}%</span>
          <span class="top3-score-label">Overall performance</span>
        </div>
        ${MentorSectionProgress.render(m, { compact: true })}
      </div>`;
  }).join('');

  if (ranked.length < 3) {
    el.innerHTML += `<div class="top3-note">Fewer than three mentors have finalized positive performance scores.</div>`;
  }
}

// ── Breakdown by School ────────────────────────────────────────
const ALL_SCHOOLS = ['School of Technology', 'School of Humanities', 'School of Management'];
const SCHOOL_SUB   = { 'School of Technology': 'SOT', 'School of Humanities': 'SOH', 'School of Management': 'SOM' };

function renderSchoolBreakdown(data) {
  if (!data || !Array.isArray(data.mentors || data.Mentors)) { dashboardUnavailable(['schoolBreakdown']); return; }
  const el = document.getElementById('schoolBreakdown');
  if (!el) return;

  const mentors = data?.mentors || data?.Mentors || [];

  // Seed all known schools at 0 so they always appear
  const emptyCounts = () => ({ Excellent: 0, 'On Track': 0, 'Needs Attention': 0, 'Not Started': 0, Pending: 0, total: 0 });
  const schools = {};
  ALL_SCHOOLS.forEach(name => { schools[name] = emptyCounts(); });

  // Grouped by the mentees' schools (mentor-schools.js): a mentor with
  // mentees from two schools is counted under both; one with no mentees
  // falls back to their own school. A mentor with no school and no mentees
  // (e.g. a new SAS mentor) gets a row named after their department.
  mentors.forEach(m => {
    const status = m.progressStatus    || m.ProgressStatus    || 'Pending';
    const done   = m.completedSessions ?? m.CompletedSessions ?? 0;
    const group = mentorTierGroup(status, done);
    const mentorSchools = MentorSchools.schoolsOf(m);
    const groups = mentorSchools.length ? mentorSchools : (MentorSchools.noSchoolDept(m) ? [MentorSchools.noSchoolDept(m)] : []);
    groups.forEach(school => {
      if (!schools[school]) schools[school] = emptyCounts();
      schools[school][Object.hasOwn(schools[school], group) ? group : 'Pending']++;
      schools[school].total++;
    });
  });

  const rows = Object.entries(schools)
    .sort((a, b) => {
      // Keep the 3 known schools in order first, then alphabetical for any extras
      const ai = ALL_SCHOOLS.indexOf(a[0]);
      const bi = ALL_SCHOOLS.indexOf(b[0]);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a[0].localeCompare(b[0]);
    })
    .map(([school, c]) => {
      const segments = [
        { count: c['Not Started'],     color: 'var(--status-critical)' },
        { count: c['Needs Attention'], color: 'var(--status-behind)' },
        { count: c['On Track'],        color: 'var(--status-on-track)' },
        { count: c.Excellent,          color: 'var(--status-excellent)' },
        { count: c.Pending, color: '#6b7280' },
      ];
      const barHtml = c.total
        ? segments.filter(s => s.count > 0)
            .map(s => `<div style="width:${(s.count / c.total * 100).toFixed(2)}%;background:${s.color}"></div>`)
            .join('')
        : '';
      // Purely presentational — a 0 gets a quieter, muted treatment
      // (class only) so it doesn't visually compete with schools that
      // actually have mentors in that tier; the underlying count is
      // unchanged either way.
      const dotStat = (count, color) =>
        `<span class="hd-dot-stat${count === 0 ? ' zero' : ''}"><i class="hd-dot" style="background:${color}"></i>${count}</span>`;

      return `
        <div class="hd-school-row">
          <div class="hd-school-info">
            <div class="hd-school-name">${escHtml(school)}</div>
            <div class="hd-school-sub">${SCHOOL_SUB[school] || ''}</div>
          </div>
          <div class="hd-school-bar">${barHtml}</div>
          ${dotStat(c.Excellent,          'var(--status-excellent)')}
          ${dotStat(c['On Track'],        'var(--status-on-track)')}
          ${dotStat(c['Needs Attention'], 'var(--status-behind)')}
          ${dotStat(c['Not Started'],     'var(--status-critical)')}
          ${dotStat(c.Pending,            '#6b7280')}
          <span class="hd-school-total">${c.total}</span>
        </div>`;
    })
    .join('');

  el.innerHTML = `
    <div class="hd-school-head">
      <span>School</span><span>Distribution</span><span>Excellent</span><span>On Track</span><span>Needs Attention</span><span>Not Started</span><span>Pending</span><span>Total</span>
    </div>
    ${rows}`;
}

// ── Recent Activities ─────────────────────────────────────────
// Same localStorage-backed "viewed" tracking as ADMIN_/JS/dashboard.js —
// Keyed by user ID so different accounts on the same browser don't share "viewed" state.
function viewedActivitiesKey() {
  const session = getSession();
  const userId  = session?.user?.UserID || session?.user?.userID;
  return `viewedActivityIds_${userId ?? 'anon'}`;
}

function getViewedActivityIds() {
  try { return new Set(JSON.parse(localStorage.getItem(viewedActivitiesKey()) || '[]')); }
  catch (e) { return new Set(); }
}

function markActivityViewed(sessionId) {
  const seen = getViewedActivityIds();
  seen.add(sessionId);
  localStorage.setItem(viewedActivitiesKey(), JSON.stringify([...seen]));
}

function renderRecentActivities(activities) {
  const el = document.getElementById('recentActivities');
  if (!el) return;

  if (activities && activities.length > 0) {
    const sorted = [...activities]
      .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    const seen = getViewedActivityIds();

    el.innerHTML = sorted.map(a => {
      const dateStr = formatDate(a.createdAt || a.date || a.timestamp);
      const id      = a.sessionID ?? a.SessionID;
      return activityRow(a.description || a.title || 'Activity', dateStr, a.menteeCount, id, seen.has(id));
    }).join('');

    el.querySelectorAll('.activity-item[data-session-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = Number(row.dataset.sessionId);
        markActivityViewed(id);
        row.classList.add('viewed');
      });
    });
    return;
  }

  el.innerHTML = `<div style="text-align:center;padding:32px 16px;color:#9ca3af;font-size:13px;">No recent activity to show.</div>`;
}

// Icon + tint keyed off the activity description text — "uploaded ...
// proof" gets the upload icon, everything else (session completed, etc.)
// gets the calendar-check icon. Purely cosmetic, no new data.
function activityIcon(name) {
  const isProof = /proof/i.test(name);
  const bg  = isProof ? '#ede9fe' : '#dbeafe';
  const fg  = isProof ? '#7c3aed' : '#2563eb';
  const svg = isProof
    ? '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
    : '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/>';
  return `<div class="hd-activity-icon" style="background:${bg};color:${fg}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>
  </div>`;
}

function activityRow(name, date, count, sessionId, isViewed) {
  const countHtml = count != null ? `
    <span class="tag-mentees">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      ${count} mentee${count !== 1 ? 's' : ''} present
    </span>` : '';

  const idAttr = sessionId != null ? ` data-session-id="${sessionId}"` : '';
  return `
    <div class="activity-item${isViewed ? ' viewed' : ''}"${idAttr}>
      ${activityIcon(name)}
      <div class="hd-activity-body">
        <div class="activity-header">
          <span class="activity-name">${escHtml(name)}</span>
          <span class="activity-time">${date}</span>
        </div>
        ${countHtml ? `<div class="activity-tags">${countHtml}</div>` : ''}
      </div>
    </div>`;
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  const datePart = d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

// Unavailable is distinct from a successful zero-data response.
function dashboardUnavailable(ids, bars = []) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.title = 'Data unavailable';
    if (['statMenteesSub', 'chartDesc', 'progressChartDesc', 'top3List', 'schoolBreakdown'].includes(id)) {
      el.innerHTML = '<span style="font-size:12px;opacity:0.65">Unavailable</span>';
    } else {
      el.textContent = '\u2014';
    }
  });
  bars.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
}
