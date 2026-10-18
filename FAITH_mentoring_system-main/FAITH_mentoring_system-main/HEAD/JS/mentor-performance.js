/* ============================================================
   HEAD ADMIN — mentor-performance.js
   ============================================================ */

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Critical';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

// Matches ADMIN_/JS/sessions.js's statusClass.
function mcBadgeClass(tierGroup) {
  switch (tierGroup) {
    case 'Pending':         return 'pending';
    case 'Excellent':       return 'excellent';
    case 'On Track':        return 'on-track';
    case 'Needs Attention': return 'needsattention';
    case 'Not Started':     return 'notstarted';
    default:                return '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('head');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  // Deep-link from the Dashboard's Mentor Performance stat cells
  // Set before either load below resolves so the first render comes in filtered.
  const params       = new URLSearchParams(window.location.search);
  const statusParam  = params.get('status');
  if (statusParam) {
    const sel = document.getElementById('statusFilter');
    if (sel) sel.value = statusParam;
  }

  loadPerformance().then(() => {
    const school = params.get('school');
    if (school) toggleSchool(decodeURIComponent(school), /*force*/ true);
  });
  // Only render if loadPerformance() already finished — otherwise its own
  // render once data arrives shows the real result.
  loadPeriodFilter().then(() => { if (allMentors.length) renderMentors(); });
});

let allMentors      = [];
let activeSchool    = null;
let currentFiltered = [];
// MentorID -> Set of "SchoolYear|Semester" keys that mentor's account was
// Active during (see Settings/period-history). The current period is a
// live check instead — sp_GetMentorOverview already scopes allMentors to
// IsActive mentors only, so every row here already qualifies as "current".
let periodHistoryByUser = new Map();

const SCHOOL_CHIP_IDS = {
  'School of Technology': 'schoolChip-technology',
  'School of Humanities': 'schoolChip-humanities',
  'School of Management': 'schoolChip-management',
};

// The default (Active-only) fetch, cached — restored whenever the School
// Year filter goes back to "" or "Current".
let allMentorsActiveOnly = [];
// Lazily fetched per selected period and cached by key — a mentor who has
// since gone Inactive/Drop Out never appears in the default Active-only
// fetch, so a PAST School Year filter needs the broader (includeInactive)
// roster to answer "who had an account during period X" for someone no
// longer active. Each past period also needs its OWN API call now:
// sp_GetMentorOverview's stat columns (CompletedSessions, OnTimeCount,
// CompleteCount, dates, and everything derived from them) used to always
// reflect the CURRENT period regardless of which one was selected — passing
// schoolYear/semester through here is what makes the numbers shown
// actually belong to the selected past period instead of just narrowing
// the roster while leaving every stat mislabeled.
let periodMentorsCache = new Map();
async function getMentorsForPeriodFilter(yearFilter) {
  if (!yearFilter || yearFilter === '__current__') {
    if ((document.getElementById('accountStatusFilter')?.value || 'active') === 'active') return allMentorsActiveOnly;
    const data = await apiRequest('MonitorActivities?includeInactive=true', 'GET', null, true);
    return data?.mentors || data?.Mentors || [];
  }
  if (periodMentorsCache.has(yearFilter)) return periodMentorsCache.get(yearFilter);
  const [schoolYear, semester] = yearFilter.split('|');
  try {
    const qs = `includeInactive=true&schoolYear=${encodeURIComponent(schoolYear)}&semester=${encodeURIComponent(semester)}`;
    const data = await apiRequest(`MonitorActivities?${qs}`, 'GET', null, true);
    const mentors = data?.mentors || data?.Mentors || [];
    periodMentorsCache.set(yearFilter, mentors);
    return mentors;
  } catch (e) {
    console.warn('Could not load mentors for selected period; showing active-only.');
    return allMentorsActiveOnly;
  }
}

async function loadPerformance() {
  try {
    const [data] = await Promise.all([
      apiRequest('MonitorActivities', 'GET', null, true),
      MentorSchools.load(),
    ]);
    allMentors = data?.mentors || data?.Mentors || [];
    allMentorsActiveOnly = allMentors;
    populateSchoolCards();
    populateDeptFilter(null);
    renderMentors();
  } catch (e) {
    console.error('Performance load error:', e);
  }
  // always resolves so callers can chain .then()
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = (val !== null && val !== undefined) ? val : '—';
}


// ── School Cards ─────────────────────────────────────────────
function populateSchoolCards() {
  const counts = {
    'School of Technology': { mentors: 0, mentees: 0 },
    'School of Humanities': { mentors: 0, mentees: 0 },
    'School of Management': { mentors: 0, mentees: 0 },
  };
  // Counted by the mentees' schools, so a mentor with mentees from two
  // schools appears under both.
  Object.keys(counts).forEach(s => {
    allMentors.forEach(m => {
      if (!MentorSchools.inSchool(m, s)) return;
      counts[s].mentors++;
      counts[s].mentees += MentorSchools.menteesIn(m, s, m.menteeCount || m.MenteeCount || 0);
    });
  });
  setText('sotMentors', counts['School of Technology'].mentors);
  setText('sotMentees', counts['School of Technology'].mentees);
  setText('sohMentors', counts['School of Humanities'].mentors);
  setText('sohMentees', counts['School of Humanities'].mentees);
  setText('somMentors', counts['School of Management'].mentors);
  setText('somMentees', counts['School of Management'].mentees);
}

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
  populateDeptFilter(activeSchool);
  renderMentors();
}

// ── Dept Filter ───────────────────────────────────────────────
// `school` null lists every school's departments. Keeps the previous
// choice only if it is still listed.
function populateDeptFilter(school) {
  MentorSchools.fillCourseSelect(document.getElementById('courseFilter'), school, allMentors);
}

// ── Mentor List (row format) ──────────────────────────────────
function avatarIdx(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 6;
}

async function loadPeriodFilter() {
  try {
    const [settings, rows] = await Promise.all([
      apiRequest('Settings', 'GET', null, true),
      apiRequest('Settings/period-history', 'GET', null, true),
    ]);

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
    const currentKey = `${settings.SchoolYear}|${settings.Semester}`;
    sel.innerHTML = `<option value="">${settings.Semester}, SY ${settings.SchoolYear} (Current)</option>` +
      periods.filter(p => p.key !== currentKey)
        .map(p => `<option value="${p.key}">${p.semester}, SY ${p.schoolYear}</option>`).join('');
  } catch (e) { console.warn('Could not load period history.'); }
}

function matchesPeriodFilter(m, yearFilter) {
  if (!yearFilter) return true;
  if (yearFilter === '__current__') return true;
  const periods = periodHistoryByUser.get(m.mentorID ?? m.MentorID);
  return !!periods && periods.has(yearFilter);
}

async function renderMentors() {
  const accountStatus = document.getElementById('accountStatusFilter')?.value || 'active';
  const search = (document.getElementById('mentorSearch')?.value || '').toLowerCase();
  const course = document.getElementById('courseFilter')?.value  || '';
  const status = document.getElementById('statusFilter')?.value  || '';
  const year   = document.getElementById('schoolYearFilter')?.value || '';

  // A past-period selection needs the broader (includeInactive) roster —
  // otherwise a mentor who's since gone Inactive/Drop Out can never
  // appear, even though they genuinely had an account during that period.
  allMentors = await getMentorsForPeriodFilter(year);

  const filtered = allMentors
    .filter(m => {
      const name    = `${m.firstName || ''} ${m.lastName || ''}`.toLowerCase();
      const mStatus = m.progressStatus || m.ProgressStatus || '';
      const mDone   = m.completedSessions ?? m.CompletedSessions ?? 0;
      return (accountStatus === 'all' || ((m.isActive ?? m.IsActive) !== false) === (accountStatus === 'active'))
          && MentorSchools.inSchool(m, activeSchool)
          && (!search || name.includes(search))
          && MentorSchools.inCourse(m, course)
          && (!status || mentorTierGroup(mStatus, mDone) === status)
          && matchesPeriodFilter(m, year);
    })
    // Alphabetized by LAST name (matching the Print Report/CSV export's own
    // "LastName, FirstName" convention) even though the card itself still
    // displays "First Last" — only the sort basis changes, not the display.
    // Rank isn't shown here — Evaluation Ratings is the one page with an
    // actual Rank column.
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));

  currentFiltered = filtered;

  const el = document.getElementById('mentorGrid');
  const n  = filtered.length;
  setText('mentorCount', `(${n})`);

  if (!n) {
    el.innerHTML = '<div class="empty-state">No mentors match the current filters.</div>';
    return;
  }

  el.innerHTML = filtered.map(m => {
    const first   = m.firstName       || m.FirstName       || '';
    const last    = m.lastName        || m.LastName        || '';
    const inits   = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
    const avIdx   = avatarIdx(first + last);
    const dept    = [m.departmentName || m.DepartmentName, m.school || m.School].filter(Boolean).join(' · ') || '—';
    const done    = m.completedSessions ?? m.CompletedSessions ?? 0;
    const status  = mentorTierGroup(m.progressStatus || m.ProgressStatus || 'Critical', done);
    const sc      = mcBadgeClass(status);
    const req     = m.requiredSessions  ?? m.RequiredSessions  ?? 0;
    const id      = m.mentorID || m.MentorID;
    const secTag  = MentorSchools.courseTags(m.sections || m.Sections, activeSchool, document.getElementById('courseFilter')?.value || '')
      .map(s => `<span class="mc-section-tag">${escHtml(s)}</span>`).join('');

    return `
      <div class="mentor-card">
        <div class="mrc-top">
          <div class="mr-avatar av-${avIdx}">${escHtml(inits)}</div>
          <div class="mr-info">
            <div class="mr-name">${escHtml(first)} ${escHtml(last)}</div>
            <div class="mr-dept">${escHtml(dept)}</div>
          </div>
        </div>
        <div class="mr-sections">${secTag}</div>
        <div class="mrc-footer">
          <div class="mr-badges">
            ${(m.isActive ?? m.IsActive) === false ? '<span class="mr-stat-badge" title="Login disabled; records retained">Deactivated</span>' : ''}
            <span class="mc-badge ${sc}" style="font-size:12px;">${status}</span>
            <span class="mr-stat-badge">${done}/${req} Sessions</span>
          </div>
          <button class="mr-view-btn" onclick="viewDetail(${id})">
            View Details
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

function viewDetail(id) {
  const school = activeSchool ? `&school=${encodeURIComponent(activeSchool)}` : '';
  window.location.href = `mentor-detail.html?id=${id}${school}`;
}

// ── EXPORT ────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escCsv(v) {
  if (v == null) return '';
  let s = String(v);
  // Stops spreadsheet apps from running a cell as a formula; numbers/phones pass through.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function exportCSV() {
  if (!currentFiltered.length) { showToast('No mentors to export.'); return; }
  // Same column set as Admin's own mentor export (ADMIN_/JS/sessions.js) —
  // both read the same MonitorActivities response, Head's version just
  // wasn't using all of it. Kept in sync on purpose; if one changes, so
  // should the other.
  const header = ['Name', 'Department', 'School', 'Sections', 'Mentees',
                  'Completed Sessions', 'Required Sessions', 'Progress %',
                  'Performance Score', 'Timeliness %', 'Completeness %', 'Evaluation Rating %',
                  'Status'];
  const rows = currentFiltered.map(m => [
    `${m.lastName || ''}, ${m.firstName || ''}`,
    m.departmentName    || '',
    m.school             || m.School             || '',
    m.sectionCount       ?? m.SectionCount        ?? 0,
    m.menteeCount        ?? 0,
    m.completedSessions  ?? 0,
    m.requiredSessions   ?? 0,
    m.progressPercent    ?? m.ProgressPercent     ?? 0,
    m.overallPercent ?? 'Pending',
    m.timelinessPercent ?? 'Pending',
    m.completenessPercent ?? m.CompletenessPercent ?? 0,
    m.evaluationRatingPercent ?? m.EvaluationRatingPercent ?? '',
    mentorTierGroup(m.progressStatus || m.ProgressStatus, m.completedSessions ?? m.CompletedSessions),
  ]);
  const csv  = [header, ...rows].map(r => r.map(escCsv).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mentor-monitoring-${(activeSchool || 'all').replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Same shape as Admin's own printProgressReport (ADMIN_/JS/sessions.js) —
// same columns, same stat boxes, same teal FAITH branding. Head's used to
// be a much thinner, independently-written version (fewer columns, plain
// text summary, navy instead of teal) — Head is read-only, not "less
// detail," so this stays in sync with Admin's on purpose.
function printReport() {
  if (!currentFiltered.length) { showToast('No mentors to print.'); return; }
  const school  = activeSchool || 'All Schools';
  const now     = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const logoUrl = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;

  const rows = currentFiltered.map((m, i) => {
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
<html lang="en"><head><meta charset="UTF-8"/>
<title>Mentor Progress Report — ${school}</title>
<style>
@page{margin:18mm 16mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111827;background:#fff}
.rpt-header{text-align:center;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #111827}
.rpt-logo{height:50px;margin-bottom:6px}
.rpt-title{font-size:13px;font-weight:700;color:#111827;margin:4px 0 2px}
.rpt-meta{font-size:11px;color:#4b5563}
table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;border:1px solid #111827}
thead th{background:#e5e7eb;color:#111827;padding:8px 9px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border:1px solid #9ca3af}
tbody td{padding:7px 9px;vertical-align:middle;border:1px solid #d1d5db}
tbody tr:nth-child(even){background:#f9fafb}
tbody tr:last-child{border-bottom:1.5px solid #111827}
.rpt-footer{margin-top:18px;padding-top:8px;border-top:1px solid #9ca3af;font-size:10px;color:#4b5563;text-align:center}
@media print{button{display:none!important}}
</style></head><body>
<div class="rpt-header">
  <img src="${logoUrl}" class="rpt-logo" onerror="this.style.display='none'"/>
  <div class="rpt-title">Mentoring Program — Mentor Progress Report</div>
  <div class="rpt-meta">${school} &nbsp;|&nbsp; Generated by Head Admin: ${now} &nbsp;|&nbsp; Total Mentors: ${currentFiltered.length}</div>
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
  <tbody>${rows}</tbody>
</table>
<div class="rpt-footer">FAITH Colleges Mentoring System &mdash; Head Admin Portal &mdash; ${now}</div>
</body></html>`;

  const w = window.open('', '_blank', 'width=1150,height=820');
  if (!w) { showToast('Please allow pop-ups for this page to open the print report.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
