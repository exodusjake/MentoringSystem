// ===== DASHBOARD JS =====

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  // Date
  const dateEl = document.getElementById('dashboardDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  loadDashboard();
  loadAcademicPeriod();
});

// Both the header chip and the Total Mentors chart card's small badge had
// a static "...2026-2027" hardcoded straight into the HTML — neither ever
// reflected an actual Settings change (unlike Head/Mentor/Mentee's own
// dashboards, which already fetch this live). Wiring both up here.
async function loadAcademicPeriod() {
  const chipEl  = document.getElementById('academicPeriod');
  const badgeEl = document.getElementById('semesterBadge');
  if (!chipEl && !badgeEl) return;
  const paint = (sem, sy) => {
    if (chipEl)  chipEl.textContent  = `${sem} · S.Y. ${sy}`;
    if (badgeEl) badgeEl.textContent = `${sem} · S.Y. ${sy}`;
  };
  try {
    const settings = await apiRequest('Settings', 'GET', null, true);
    const sy  = settings?.SchoolYear || settings?.schoolYear || '—';
    const sem = settings?.Semester   || settings?.semester   || '—';
    paint(sem, sy);
    try { localStorage.setItem('astraPeriod', JSON.stringify({ sem, sy })); } catch (e) {}
  } catch (e) {
    // Request failed: show the last known period instead of an endless "Loading…".
    let last = null;
    try { last = JSON.parse(localStorage.getItem('astraPeriod')); } catch (e2) {}
    if (last) paint(last.sem, last.sy);
    else paint('—', '—');
  }
}

async function loadDashboard() {
  try {
    const [users, statsRes, monitorRes] = await Promise.all([
      apiRequest('Users', 'GET', null, true).catch(() => null),
      apiRequest('Users/stats', 'GET', null, true).catch(() => null),
      apiRequest('MonitorActivities', 'GET', null, true).catch(() => null)
    ]);
    const stats       = statsRes;
    const monitorData = monitorRes;

    renderStatCards(users, stats);
    renderEngagement(stats);
    renderSystemAlerts(stats, monitorData);
    renderChart(stats, monitorData);
    renderTop3Mentors(monitorData);

    if (!statsRes)                showAlertsUnavailable([2, 3]);
    if (!monitorRes)              showAlertsUnavailable([1]);
    if (!users || !statsRes || !monitorRes) showDashboardLoadWarning();

    // Try to load recent activities; fall back to placeholder. Fetch more
    // than the visible ~5 rows so scrolling the card actually reveals more
    // instead of silently dropping anything past the 5th.
    const activities = await apiRequest('Activities?top=25', 'GET', null, true).catch(() => null);
    renderRecentActivities(activities);

  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Pending';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

// ── STAT CARDS ────────────────────────────────────────────────
function renderStatCards(users, stats) {
  if (!stats) { dashboardUnavailable(['statMentors','statMentees','statMenteesSub','statPending']); return; }
  const mentors           = stats.totalMentors        ?? (users || []).filter(u => (u.role || u.Role) === 'Mentor').length;
  const mentees           = stats.totalMentees        ?? (users || []).filter(u => (u.role || u.Role) === 'Mentee').length;
  const unassigned        = stats.unassigned          ?? 0;
  const sessionsWoProof   = stats.sessionsWithoutProof ?? 0;

  setText('statMentors',    mentors);
  setText('statMentees',    mentees);
  setText('statMenteesSub', `${unassigned} unassigned · ${stats.droppedOut ?? 0} dropped out`);
  setText('statPending',    sessionsWoProof);
}

// ── MENTEE ENGAGEMENT ─────────────────────────────────────────
function renderEngagement(stats) {
  if (!stats) { dashboardUnavailable(['engAssignedActive','engAssignedInactive','engUnassigned','engTotal','engStatusExcellent','engStatusOnTrack','engStatusNeedsAttention','engStatusNoSessions','engDroppedOut']); renderAttendanceBars({excellent:0,onTrack:0,needsAttention:0,noSessions:0}); return; }
  const activeMentees = stats.activeMentees ?? 0;
  const total         = stats.totalMentees  ?? 0;
  const inactive      = Math.max(0, (stats.assigned ?? 0) - activeMentees);

  setText('engAssignedActive',   activeMentees);
  setText('engAssignedInactive', inactive);
  // Mentees with no current mentor -- normal right after a School Year
  // change (every assignment ends at once, see SettingsService), not an
  // error state. Already computed server-side; just wasn't shown here.
  setText('engUnassigned',       stats.unassigned ?? 0);
  setText('engTotal',            total);

  const sd             = stats.menteeStatusDistribution || {};
  const needsAttention = (sd['Behind'] ?? 0) + (sd['AtRisk'] ?? 0) + (sd['Critical'] ?? 0);
  const excellent      = sd['Excellent']  ?? 0;
  const onTrack        = sd['OnTrack']    ?? 0;
  const noSessions     = sd['NoSessions'] ?? 0;

  setText('engStatusExcellent',      excellent);
  setText('engStatusOnTrack',        onTrack);
  setText('engStatusNeedsAttention', needsAttention);
  setText('engStatusNoSessions',     noSessions);
  setText('engDroppedOut',           stats.droppedOut ?? 0);

  renderAttendanceBars({ excellent, onTrack, needsAttention, noSessions });

  updateEngagementTooltip();
}

// Each bar's width is scaled against the LARGEST of the four values, not
// the total — the group is "how does each status compare to the busiest
// one", not "what share of all mentees is this" (that's a pie-chart
// question, not what this list is answering). A 0 gets no width and no
// .has-value class at all, so only the empty gray track shows — visually
// distinct from a bar that's merely thin. Every other bar gets
// .has-value, which is what CSS's min-width: 4px keys off of, so a
// value of 1 sitting next to a value of 15 doesn't round down to an
// invisible sliver.
function renderAttendanceBars({ excellent, onTrack, needsAttention, noSessions }) {
  const groups = [
    ['engBarExcellent',      excellent],
    ['engBarOnTrack',        onTrack],
    ['engBarNeedsAttention', needsAttention],
    ['engBarNoSessions',     noSessions],
  ];
  const max = Math.max(excellent, onTrack, needsAttention, noSessions, 0);

  groups.forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const pct = (max > 0 && value > 0) ? (value / max) * 100 : 0;
    el.style.width = `${pct}%`;
    el.classList.toggle('has-value', value > 0);
  });
}

function updateEngagementTooltip() {
  const box = document.getElementById('engTipBox');
  if (!box) return;

  box.innerHTML = `
    <div class="dash-tip-title">Attendance This Semester</div>
    <div class="dash-tip-row"><strong>Attended</strong> — currently assigned, non-dropout mentees with attendance at one or more completed checkpoints this semester</div>
    <div class="dash-tip-row"><strong>No attendance</strong> — currently assigned, non-dropout mentees with no attendance at completed checkpoints this semester</div>
    <div class="dash-tip-row"><strong>Total Mentees</strong> — active mentee accounts, including unassigned and dropped-out accounts; those groups are listed separately</div>
    <div class="dash-tip-title">Attendance Tiers</div>
    <div class="dash-tip-row"><strong>Excellent</strong> &mdash; attended at least 80% of completed checkpoints</div>
    <div class="dash-tip-row"><strong>On Track</strong> &mdash; attended 60&ndash;79% of completed checkpoints</div>
    <div class="dash-tip-row"><strong>Needs Attention</strong> &mdash; attended below 60% of completed checkpoints (Behind / At Risk / Critical)</div>
    <div class="dash-tip-row"><strong>No Completed Sessions</strong> &mdash; no completed checkpoints this semester</div>
    <div class="dash-tip-row" style="margin-top:8px;padding-top:8px;border-top:1px solid #334155;font-size:11.5px;color:#94a3b8;">Attendance tiers compare attended checkpoints with completed checkpoints this semester. Future checkpoints are not counted; unassigned and dropped-out mentees are shown separately.</div>`;
}

// ── SYSTEM ALERTS ─────────────────────────────────────────────
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

  // The tier uses the overall performance score, not timeliness alone.
  setText('alertTitle1', `${behind} mentor${behind !== 1 ? 's' : ''} need follow-up`);
  setText('alertSub1',   behind > 0 ? `(${notStarted} not started, ${needsAttention} need${needsAttention !== 1 ? '' : 's'} attention)` : (pending > 0 ? `${pending} Pending; performance not finalized` : 'No finalized mentors need follow-up'));
  setBadge('alertBadge1', behind, 'Urgent', 'urgent', 'red');

  // Alert 2: unassigned mentees
  setText('alertTitle2', `${unassigned} unassigned mentee${unassigned !== 1 ? 's' : ''}`);
  setText('alertSub2',   unassigned > 0 ? 'Needs immediate assignment' : 'All mentees assigned');
  setBadge('alertBadge2', unassigned, 'Warning', 'warning', 'orange');

  // Alert 3: completed sessions missing a proof upload
  setText('alertTitle3', `${sessionsWoProof} session${sessionsWoProof !== 1 ? 's' : ''} missing proof`);
  setText('alertSub3',   sessionsWoProof > 0 ? 'All-time completed sessions with no proof uploaded' : 'All completed sessions have proof');
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

// ── BAR CHART ────────────────────────────────────────────────
// Buckets come from each mentor's own progressStatus + completedSessions via
// mentorTierGroup, not the old stats.sessionDistribution aggregate.
function renderChart(stats, monitorData) {
  const chartCanvas = document.getElementById('sessionChart');
  const previousChart = chartCanvas && Chart.getChart?.(chartCanvas);
  if (previousChart) previousChart.destroy();
  if (!monitorData || !Array.isArray(monitorData.mentors || monitorData.Mentors)) { dashboardUnavailable(['chartDesc']); return; }
  const canvas = document.getElementById('sessionChart');
  if (!canvas) return;

  const mentors = monitorData?.mentors || monitorData?.Mentors || [];
  const counts  = { 'Not Started': 0, 'Needs Attention': 0, 'On Track': 0, Excellent: 0, Pending: 0 };
  mentors.forEach(m => {
    const status = m.progressStatus    || m.ProgressStatus    || 'Pending';
    const done   = m.completedSessions ?? m.CompletedSessions ?? 0;
    const group = mentorTierGroup(status, done);
    counts[Object.hasOwn(counts, group) ? group : 'Pending']++;
  });
  const dNotStarted     = counts['Not Started'];
  const dNeedsAttention = counts['Needs Attention'];
  const dOnTrack        = counts['On Track'];
  const dExcellent      = counts.Excellent;

  const notStartedLabel     = 'Not Started';
  const needsAttentionLabel = 'Needs Attention';
  const onTrackLabel        = 'On Track';
  const excellentLabel      = 'Excellent';

  const chartDescEl = document.getElementById('chartDesc');
  if (chartDescEl) {
    chartDescEl.textContent = `Current-semester overall performance of active mentor accounts. ${dNeedsAttention} mentor${dNeedsAttention !== 1 ? 's' : ''} need${dNeedsAttention !== 1 ? '' : 's'} immediate attention. ${counts.Pending} Pending (performance unfinalized).`;
  }

  // Read the same --status-* variables the legend below (and Mentee
  // Engagement's Attendance Breakdown) use, instead of a third,
  // separately-hardcoded color list that could drift out of sync with
  // either of them — one definition in dashboard.css, everything on
  // this page reads it.
  const rootStyle = getComputedStyle(document.documentElement);
  const statusColor = name => rootStyle.getPropertyValue(`--status-${name}`).trim();

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: [notStartedLabel, needsAttentionLabel, onTrackLabel, excellentLabel, 'Pending'],
      datasets: [{
        data: [dNotStarted, dNeedsAttention, dOnTrack, dExcellent, counts.Pending],
        backgroundColor: [
          statusColor('critical'),
          statusColor('behind'),
          statusColor('on-track'),
          statusColor('excellent'),
          '#6b7280',
        ],
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.55,
      }]
    },
    // Keeps .chart-action-guide's left offset (dashboard.css) lined up
    // with where the plot area actually starts — chart.chartArea.left is
    // Chart.js's own computed y-axis gutter width (label text width +
    // its padding/tick margins), read fresh after every layout pass
    // rather than assumed once, so it stays correct if the y-axis labels
    // themselves ever get wider (more digits) or the card gets resized.
    plugins: [{
      id: 'syncLegendGutter',
      afterLayout(chart) {
        document.documentElement.style.setProperty('--chart-gutter', `${chart.chartArea.left}px`);
      }
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick(_event, elements) {
        const index = elements[0]?.index;
        if (index === undefined || index === 4) return;
        const status = [notStartedLabel, needsAttentionLabel, onTrackLabel, excellentLabel, 'Pending'][index];
        window.location.href = `sessions.html?status=${encodeURIComponent(status)}`;
      },
      onHover(event, elements) {
        if (event.native?.target) event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.raw} mentor${ctx.raw !== 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#6b7280' }
        },
        y: {
          beginAtZero: true,
          grid: { color: '#f3f4f6' },
          ticks: {
            stepSize: 3,
            font: { size: 11 },
            color: '#6b7280'
          }
        }
      }
    }
  });
}

// ── TOP 3 MENTORS ────────────────────────────────────────────
// Ranked by overallPercent (Timeliness 25% + Completeness 25% + Evaluation
// Rating 50% — see MonitorActivitiesService.ComputeOverallPercent), the
// same figure Sessions (sessions.html) and Mentor Detail use for their own
// ranking, so this never contradicts what those pages show. Mentors at
// exactly 0% are excluded — "winning" a spot for doing nothing yet isn't
// meaningful, especially early in a semester.
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
    el.innerHTML = '<div class="top3-empty">No finalized positive performance scores available. Required reports may still be pending, even when checkpoints have been completed.</div>';
    return;
  }

  el.innerHTML = ranked.map((m, i) => {
    const first  = m.firstName || m.FirstName || '';
    const last   = m.lastName  || m.LastName  || '';
    const inits  = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
    const dept   = m.departmentName || m.DepartmentName || '—';
    const school = m.school         || m.School         || '';
    const pct    = m.overallPercent    ?? m.OverallPercent    ?? 0;
    const id     = m.mentorID || m.MentorID;
    return `
      <div class="top3-row" onclick="window.location.href='sessions-detail.html?id=${id}'">
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

// ── RECENT ACTIVITIES ─────────────────────────────────────────
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

    // No slice(0, 5) here anymore — the card scrolls instead (see CSS),
    // so a burst of activity doesn't just push earlier items off with no
    // way back to them.
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

// No status badge here anymore — "Pending Review"/"New"/"Upcoming" etc.
// read as categories without a legend, and a cancelled session had no
// matching case at all and silently fell back to "New" (wrong). Date +
// time posted and the description itself ("X scheduled a session") say
// what happened and when without needing a label to interpret.
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
      <div class="activity-header">
        <span class="activity-name">${escHtml(name)}</span>
        <span class="activity-time">${date}</span>
      </div>
      ${countHtml ? `<div class="activity-tags">${countHtml}</div>` : ''}
    </div>`;
}

function formatDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  const datePart = d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) { el.textContent = val; el.title = ''; }
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
