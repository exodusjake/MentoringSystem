// ===== SESSIONS — Mentor Progress Overview =====
// Merged from the former Monitor Activities page (which was orphaned from
// the sidebar nav) — same mentor-cards overview, ranked by progressPercent,
// now living under Sessions since that's what's actually in the nav.

let allMentors = [];
let currentFiltered = [];
let activeSchool   = null;
// MentorID (== UserID) -> Set of "SchoolYear|Semester" keys that mentor's
// account was Active during (see Settings/period-history). Lets the
// School Year filter answer "who had an account during period X" for any
// past period — the current period is a live check instead (below).
let periodHistoryByUser = new Map();
let currentPeriodKey = '';

const AVATAR_COLORS = 6;

function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % AVATAR_COLORS;
}

function initials(first, last) {
  return escHtml(((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || '?');
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Critical';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

function applyInitialStatusFilter(search = window.location.search) {
  const statusSelect = document.getElementById('statusFilter');
  if (!statusSelect) return '';
  const requestedStatus = new URLSearchParams(search).get('status');
  if (requestedStatus && [...statusSelect.options].some(option => option.value === requestedStatus)) {
    statusSelect.value = requestedStatus;
  }
  return statusSelect.value;
}

function statusClass(tierGroup) {
  switch (tierGroup) {
    case 'Pending':         return 'pending';
    case 'Excellent':       return 'excellent';
    case 'On Track':        return 'on-track';
    case 'Needs Attention': return 'needsattention';
    case 'Not Started':     return 'notstarted';
    default:                return '';
  }
}

// Compact row list — same convention as HEAD's own Mentor Monitoring page
// (.mentor-row/.mr-*, sessions.css), not the card-grid layout Monitor
// Activities used to render. Progress/status still carry over; the card's
// own stats-row/progress-bar/dates block was cut for space, same trade-off
// HEAD's row already makes. Rank isn't shown here — Evaluation Ratings is
// the one page with an actual Rank column.
function renderCards(mentors) {
  const grid    = document.getElementById('mentorCardsGrid');
  const countEl = document.getElementById('mentorCount');

  currentFiltered = [...mentors].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
  );
  countEl.textContent = `(${currentFiltered.length})`;

  if (!currentFiltered.length) {
    grid.innerHTML = '<div class="empty-state">No mentors match the current filter.</div>';
    return;
  }

  grid.innerHTML = currentFiltered.map(m => {
    const tier = mentorTierGroup(m.progressStatus, m.completedSessions);
    const sc  = statusClass(tier);
    const idx = avatarIndex(m.firstName + m.lastName);
    const dept    = escHtml([m.departmentName, m.school].filter(Boolean).join(' · ') || '—');
    const secTag  = MentorSchools.courseTags(m.sections, activeSchool, document.getElementById('courseFilter').value)
      .map(s => `<span class="mc-section-tag">${escHtml(s)}</span>`).join('');

    return `
      <div class="mentor-card">
        <div class="mrc-top">
          <div class="mr-avatar av-${idx}">${initials(m.firstName, m.lastName)}</div>
          <div class="mr-info">
            <div class="mr-name">${escHtml(m.firstName)} ${escHtml(m.lastName)}</div>
            <div class="mr-dept">${dept}</div>
          </div>
        </div>
        <div class="mr-sections">${secTag}</div>
        <div class="mrc-footer">
          <div class="mr-badges">
            <span class="mc-badge ${sc}" style="font-size:12px;">${tier}</span>
            <span class="mr-stat-badge">${m.completedSessions}/${m.requiredSessions} Sessions</span>
          </div>
          <button class="mr-view-btn" onclick="openDetail(${m.mentorID})">
            View Details
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

async function applyFilters() {
  const q      = document.getElementById('searchInput').value.trim().toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const course = document.getElementById('courseFilter').value;
  const year   = document.getElementById('schoolYearFilter')?.value || '';

  // A past-period selection needs the broader (includeInactive) roster --
  // otherwise a mentor who's since gone Inactive/Drop Out can never
  // appear, even though they genuinely had an account during that period.
  allMentors = await getMentorsForPeriodFilter(year);

  const filtered = allMentors.filter(m => {
    const name = `${m.firstName} ${m.lastName}`.toLowerCase();
    if (q && !name.includes(q)) return false;
    if (status && mentorTierGroup(m.progressStatus, m.completedSessions) !== status) return false;
    if (!MentorSchools.inCourse(m, course)) return false;
    if (activeSchool && !MentorSchools.inSchool(m, activeSchool)) return false;
    if (!matchesPeriodFilter(m, year)) return false;
    return true;
  });

  renderCards(filtered);
}

function populateSchoolCards(mentors) {
  const schools = {
    'School of Technology': { mentors: 0, mentees: 0 },
    'School of Humanities':  { mentors: 0, mentees: 0 },
    'School of Management':  { mentors: 0, mentees: 0 },
  };
  // Counted by the mentees' schools, so a mentor with mentees from two
  // schools appears under both.
  Object.keys(schools).forEach(s => {
    mentors.forEach(m => {
      if (!MentorSchools.inSchool(m, s)) return;
      schools[s].mentors++;
      schools[s].mentees += MentorSchools.menteesIn(m, s, m.menteeCount ?? 0);
    });
  });
  document.getElementById('sotMentors').textContent = schools['School of Technology'].mentors;
  document.getElementById('sotMentees').textContent = schools['School of Technology'].mentees;
  document.getElementById('sohMentors').textContent = schools['School of Humanities'].mentors;
  document.getElementById('sohMentees').textContent = schools['School of Humanities'].mentees;
  document.getElementById('somMentors').textContent = schools['School of Management'].mentors;
  document.getElementById('somMentees').textContent = schools['School of Management'].mentees;
}

const SCHOOL_CHIP_IDS = {
  'School of Technology': 'schoolChip-technology',
  'School of Humanities': 'schoolChip-humanities',
  'School of Management': 'schoolChip-management',
};

// Toggle, not a gate — clicking the already-active school clears back to
// "All Schools" combined; clicking a different one switches straight over.
// `force: true` (used only from the ?school= deep-link on load) always
// selects that school instead of toggling it off.
function toggleSchool(school, force) {
  activeSchool = (!force && activeSchool === school) ? null : school;

  Object.entries(SCHOOL_CHIP_IDS).forEach(([name, id]) => {
    document.getElementById(id)?.classList.toggle('active', activeSchool === name);
  });

  document.getElementById('mentorViewTitle').textContent = activeSchool || 'All Schools';
  document.getElementById('courseFilter').value = '';
  populateDeptFilter(allMentors);
  applyFilters();
}

function populateDeptFilter(mentors) {
  MentorSchools.fillCourseSelect(document.getElementById('courseFilter'), activeSchool, mentors);
}


// The default (Active-only) fetch, cached — restored whenever the School
// Year filter goes back to "" or "Current" so the stat cards keep their
// normal meaning (see loadAllMentorsIncludingInactive below for the other
// half of this).
let allMentorsActiveOnly = [];

async function loadOverview() {
  try {
    const [data] = await Promise.all([
      apiRequest('MonitorActivities', 'GET', null, true),
      MentorSchools.load(),
    ]);

    allMentors = data.mentors ?? [];
    allMentorsActiveOnly = allMentors;
    populateDeptFilter(allMentors);
    populateSchoolCards(allMentors);
    applyFilters();
  } catch (e) {
    console.error('Failed to load monitor activities:', e);
    document.getElementById('mentorCardsGrid').innerHTML =
      '<div class="empty-state">Failed to load data. Please try again.</div>';
  }
}

// Lazily fetched per selected period and cached by key — a mentor who has
// since gone Inactive/Drop Out never appears in the default Active-only
// fetch above, so a PAST School Year filter needs the broader
// (includeInactive) roster to answer "who had an account during period X"
// for someone no longer active. Each past period also needs its OWN API
// call now: sp_GetMentorOverview's stat columns (CompletedSessions,
// OnTimeCount, CompleteCount, dates, and everything derived from them)
// used to always reflect the CURRENT period regardless of which one was
// selected — passing schoolYear/semester through here is what makes the
// numbers shown actually belong to the selected past period instead of
// just narrowing the roster while leaving every stat mislabeled.
let periodMentorsCache = new Map();
async function getMentorsForPeriodFilter(yearFilter) {
  if (!yearFilter || yearFilter === '__current__') return allMentorsActiveOnly;
  if (periodMentorsCache.has(yearFilter)) return periodMentorsCache.get(yearFilter);
  const [schoolYear, semester] = yearFilter.split('|');
  try {
    const qs = `includeInactive=true&schoolYear=${encodeURIComponent(schoolYear)}&semester=${encodeURIComponent(semester)}`;
    const data = await apiRequest(`MonitorActivities?${qs}`, 'GET', null, true);
    const mentors = data.mentors ?? [];
    periodMentorsCache.set(yearFilter, mentors);
    return mentors;
  } catch (e) {
    console.warn('Could not load mentors for selected period; showing active-only.');
    return allMentorsActiveOnly;
  }
}

async function loadPeriodFilter() {
  try {
    const [settings, rows] = await Promise.all([
      apiRequest('Settings', 'GET', null, true),
      apiRequest('Settings/period-history', 'GET', null, true),
    ]);
    currentPeriodKey = settings ? `${settings.SchoolYear}|${settings.Semester}` : '';

    periodHistoryByUser = new Map();
    const periods = [];
    const seen = new Set();
    (rows || []).forEach(r => {
      const key = `${r.schoolYear}|${r.semester}`;
      if (!periodHistoryByUser.has(r.userID)) periodHistoryByUser.set(r.userID, new Set());
      periodHistoryByUser.get(r.userID).add(key);
      if (!seen.has(key)) { seen.add(key); periods.push({ schoolYear: r.schoolYear, semester: r.semester, key }); }
    });
    periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));

    const sel = document.getElementById('schoolYearFilter');
    if (!sel || !settings) return;
    sel.innerHTML = `<option value="">${settings.Semester}, SY ${settings.SchoolYear} (Current)</option>` +
      periods.filter(p => p.key !== currentPeriodKey)
        .map(p => `<option value="${p.key}">${p.semester}, SY ${p.schoolYear}</option>`).join('');
  } catch (e) { console.warn('Could not load period history.'); }
}

function matchesPeriodFilter(m, yearFilter) {
  // "" and "__current__" both resolve to the Active-only roster in
  // getMentorsForPeriodFilter before this ever runs, so every row here
  // already qualifies -- only a genuine past-period key needs the actual
  // history lookup, against the broader (possibly Inactive) roster.
  if (!yearFilter || yearFilter === '__current__') return true;
  const periods = periodHistoryByUser.get(m.mentorID);
  return !!periods && periods.has(yearFilter);
}

// Sessions' own detail view (same mentor identity + progress status +
// section tags in its hero) is the one shared destination for both the
// stat/status-filtered overview above and any other mentor list in Admin.
function openDetail(mentorId) {
  const school = activeSchool ? `&school=${encodeURIComponent(activeSchool)}` : '';
  window.location.href = `sessions-detail.html?id=${mentorId}${school}`;
}

// ── EXPORT / REPORT ─────────────────────────────────────────────────────────

function escCsv(v) {
  if (v == null) return '';
  let s = String(v);
  // Stops spreadsheet apps from running a cell as a formula; numbers/phones pass through.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV() {
  if (!currentFiltered.length) { showToast('No mentors to export.'); return; }
  const header = ['Name', 'Department', 'School', 'Sections', 'Mentees',
                  'Completed Sessions', 'Required Sessions', 'Progress %',
                  'Performance Score', 'Timeliness %', 'Completeness %', 'Evaluation Rating %',
                  'Status'];
  const rows = currentFiltered.map(m => [
    `${m.lastName}, ${m.firstName}`,
    m.departmentName || '',
    m.school         || '',
    m.sectionCount   ?? 0,
    m.menteeCount    ?? 0,
    m.completedSessions ?? 0,
    m.requiredSessions  ?? 0,
    m.progressPercent   ?? 0,
    m.overallPercent ?? 'Pending',
    m.timelinessPercent ?? 'Pending',
    m.completenessPercent ?? 0,
    m.evaluationRatingPercent ?? '',
    mentorTierGroup(m.progressStatus, m.completedSessions),
  ]);
  const csv = [header, ...rows].map(r => r.map(escCsv).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mentor-progress-${(activeSchool || 'all').replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printProgressReport() {
  if (!currentFiltered.length) { showToast('No mentors to print.'); return; }
  const school  = activeSchool || 'All Schools';
  const now     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const logoUrl = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;

  const tableRows = currentFiltered.map((m, i) => {
    const pct = m.progressPercent ?? 0;
    return `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td><strong>${escHtml(m.firstName)} ${escHtml(m.lastName)}</strong></td>
      <td>${escHtml(m.departmentName || '—')}</td>
      <td style="text-align:center">${m.sectionCount ?? 0}</td>
      <td style="text-align:center">${m.menteeCount ?? 0}</td>
      <td style="text-align:center;white-space:nowrap">${m.completedSessions ?? 0} / ${m.requiredSessions ?? 0}</td>
      <td>
        <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
          <div style="width:70px;height:7px;background:#e5e7eb;border-radius:99px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:#374151;border-radius:99px;"></div>
          </div>
          <span style="font-weight:700;min-width:34px;text-align:left">${pct}%</span>
        </div>
      </td>
      <td style="text-align:center;font-weight:700">${m.overallPercent == null ? 'Pending' : m.overallPercent + '%'}</td>
      <td style="text-align:center;font-weight:600">${mentorTierGroup(m.progressStatus, m.completedSessions)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Mentor Progress Report — ${school}</title>
<style>
@page { margin: 18mm 16mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111827; background: #fff; }
.rpt-header { text-align: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #111827; }
.rpt-logo  { height: 50px; margin-bottom: 6px; }
.rpt-inst  { font-size: 17px; font-weight: 900; letter-spacing: 0.08em; color: #111827; text-transform: uppercase; }
.rpt-title { font-size: 13px; font-weight: 700; color: #111827; margin: 4px 0 2px; }
.rpt-meta  { font-size: 11px; color: #4b5563; }
table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; border: 1px solid #111827; }
thead th { background: #e5e7eb; color: #111827; padding: 8px 9px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; border: 1px solid #9ca3af; }
tbody td { padding: 7px 9px; vertical-align: middle; border: 1px solid #d1d5db; }
tbody tr:nth-child(even) { background: #f9fafb; }
tbody tr:last-child { border-bottom: 1.5px solid #111827; }
.rpt-footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #9ca3af; font-size: 10px; color: #4b5563; text-align: center; }
@media print { button { display: none !important; } }
</style>
</head>
<body>
<div class="rpt-header">
  <img src="${logoUrl}" class="rpt-logo" onerror="this.style.display='none'"/>
  <div class="rpt-title">Mentoring Program — Mentor Progress Report</div>
  <div class="rpt-meta">${school} &nbsp;|&nbsp; Generated: ${now} &nbsp;|&nbsp; Total Mentors: ${currentFiltered.length}</div>
</div>
<table>
  <thead>
    <tr>
      <th style="width:11.11%;text-align:center">#</th>
      <th style="width:11.11%">Mentor Name</th>
      <th style="width:11.11%">Department</th>
      <th style="width:11.11%;text-align:center">Sections</th>
      <th style="width:11.11%;text-align:center">Mentees</th>
      <th style="width:11.11%;text-align:center">Sessions (Done/Req)</th>
      <th style="width:11.11%;text-align:center">Progress</th>
      <th style="width:11.11%;text-align:center;white-space:nowrap">Score</th>
      <th style="width:11.11%;text-align:center">Status</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="rpt-footer">FAITH Colleges Mentoring System &mdash; Admin Portal &mdash; ${now}</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1150,height=820');
  if (!w) { showToast('Please allow pop-ups for this page to open the print report.'); return; }
  w.document.write(html);
  w.document.close();
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  // Deep-link from Sessions' own detail page's back button, which carries
  // ?school= so returning here re-enters the same school instead of
  // dropping back to "All Schools."
  const initSchool = new URLSearchParams(window.location.search).get('school');
  applyInitialStatusFilter();
  loadOverview().then(() => { if (initSchool) toggleSchool(decodeURIComponent(initSchool), /*force*/ true); });
  // Only re-apply if loadOverview() already finished — otherwise its own
  // trailing applyFilters() call renders the result once allMentors is ready.
  loadPeriodFilter().then(() => { if (allMentors.length) applyFilters(); });

  // Dropdown filters
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
  document.getElementById('courseFilter').addEventListener('change', applyFilters);
  document.getElementById('schoolYearFilter')?.addEventListener('change', applyFilters);
});
