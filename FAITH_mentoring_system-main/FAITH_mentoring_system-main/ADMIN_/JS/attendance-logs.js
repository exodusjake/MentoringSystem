// ===== ATTENDANCE LOGS (overview) =====

let allMentors = [];
// '' = all schools (default — every mentor listed below, matching Proof
// Tracking's own convention of showing everyone up front instead of
// gating the list behind picking a school first). A school card toggles
// this on/off instead of switching to a separate screen.
let activeSchool = '';
let currentFiltered = [];

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  loadOverview();
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('courseFilter').addEventListener('change', applyFilters);
});

// ── LOAD ──────────────────────────────────────────────────────
async function loadOverview() {
  try {
    const [data] = await Promise.all([apiRequest('AttendanceLogs', 'GET', null, true), MentorSchools.load()]);

    allMentors = data.mentors ?? [];
    populateSchoolCards(allMentors);

    // Restore the active school filter when returning from detail page
    const school = new URLSearchParams(window.location.search).get('school');
    if (school) activeSchool = decodeURIComponent(school);
    buildFilterOptions();
    applyActiveSchoolCardHighlight();
    applyFilters();
  } catch (e) {
    console.error('Failed to load attendance logs:', e);
    document.getElementById('mentorCardsGrid').innerHTML =
      `<div class="empty-state">Failed to load data. Please refresh.</div>`;
  }
}

// ── BUILD FILTER DROPDOWNS FROM DATA ─────────────────────────
function buildFilterOptions() {
  MentorSchools.fillCourseSelect(document.getElementById('courseFilter'), activeSchool, allMentors);
}

// The Course filter split into { dept } (e.g. SAS) or { course }.
function selectedCourse() {
  return MentorSchools.courseFilter(document.getElementById('courseFilter').value);
}

// A mentor's records, present and sessions within the selected school, department
// and section (the whole mentor when nothing narrows it).
function scopedStats(m, dept, section) {
  const whole = { records: m.totalAttendees || 0, present: m.presentCount || 0, sessions: m.totalSessions || 0 };
  const ownDept = dept && MentorSchools.noSchoolDept(m) === dept;
  if (!m.sectionStats || (!activeSchool && (!dept || ownDept) && !section)) return whole;
  return m.sectionStats
    .filter(x => MentorSchools.sectionsIn([x.sectionCode], activeSchool, ownDept ? '' : dept).length && (!section || String(x.sectionCode).toUpperCase() === String(section).toUpperCase()))
    .reduce((t, x) => ({ records: t.records + x.records, present: t.present + x.present, sessions: t.sessions + x.sessions }),
      { records: 0, present: 0, sessions: 0 });
}

// ── FILTER ────────────────────────────────────────────────────
function applyFilters() {
  const q       = document.getElementById('searchInput').value.trim().toLowerCase();
  const filtered = allMentors.filter(m => {
    if (q) {
      const name = `${m.firstName} ${m.lastName}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    if (!MentorSchools.inCourse(m, document.getElementById('courseFilter').value)) return false;
    if (activeSchool && !MentorSchools.inSchool(m, activeSchool)) return false;
    return true;
  });

  updateStatCards(filtered);
  renderMentorCards(filtered);
}

function resetFilters() {
  document.getElementById('searchInput').value   = '';
  document.getElementById('courseFilter').value  = '';
  const base = activeSchool ? allMentors.filter(m => MentorSchools.inSchool(m, activeSchool)) : allMentors;
  updateStatCards(base);
  renderMentorCards(base);
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function updateStatCards(mentors) {
  const { dept, course: section } = selectedCourse();
  const stats   = mentors.map(m => scopedStats(m, dept, section));
  const total   = stats.reduce((s, x) => s + x.records, 0);
  const present = stats.reduce((s, x) => s + x.present, 0);
  const absent  = total - present;
  const rate    = clampPercent(total > 0 ? Math.round(present / total * 100) : 0);
  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statPresent').textContent = present;
  document.getElementById('statAbsent').textContent  = absent;
  document.getElementById('statRate').textContent    = `${rate}%`;
}

function populateSchoolCards(mentors) {
  const schools = ['School of Technology', 'School of Humanities', 'School of Management'];
  const keys    = ['sot', 'soh', 'som'];
  schools.forEach((school, i) => {
    const rows     = mentors.filter(m => MentorSchools.inSchool(m, school));
    const sessions = rows.reduce((s, m) => s + (m.sectionStats
      ? m.sectionStats.filter(x => MentorSchools.sectionsIn([x.sectionCode], school, '').length).reduce((t, x) => t + x.sessions, 0)
      : (m.totalSessions || 0)), 0);
    const k = keys[i];
    document.getElementById(`${k}Mentors`).textContent  = rows.length;
    document.getElementById(`${k}Sessions`).textContent = sessions;
  });
}

// Toggle, not a gate — clicking the already-active school clears back to
// "all schools" combined; clicking a different one switches straight over.
// Same convention as ADMIN_/JS/session-proofs.js's filterBySchool.
function filterBySchool(school) {
  activeSchool = activeSchool === school ? '' : school;
  applyActiveSchoolCardHighlight();
  document.getElementById('searchInput').value   = '';
  document.getElementById('courseFilter').value  = '';
  buildFilterOptions();
  applyFilters();
}

function applyActiveSchoolCardHighlight() {
  const schools = ['School of Technology', 'School of Humanities', 'School of Management'];
  document.querySelectorAll('.school-card').forEach((card, i) => {
    card.classList.toggle('active', activeSchool === schools[i]);
  });
}

// ── RENDER MENTOR ROWS ────────────────────────────────────────
function renderMentorCards(mentors) {
  currentFiltered = mentors;
  const grid = document.getElementById('mentorCardsGrid');

  if (!mentors.length) {
    grid.innerHTML = `<div class="empty-state">No mentors found.</div>`;
    return;
  }

  grid.innerHTML = [...mentors].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
  ).map(m => {
    const initials = ((m.firstName?.[0] || '') + (m.lastName?.[0] || '')).toUpperCase() || 'M';
    const avClass  = `av-${avatarIndex(m.firstName + m.lastName)}`;
    // School only shown when browsing all schools combined — once a
    // school card filter narrows the list to one, repeating it on every
    // row is redundant (matches how the row read when this page still
    // had a separate per-school screen).
    const dept = activeSchool
      ? (m.department || 'No department info')
      : [m.department, m.school].filter(Boolean).join(' · ') || 'No department info';

    const { dept: deptSel, course: sectionSel } = selectedCourse();
    const sessions    = scopedStats(m, deptSel, sectionSel).sessions;
    const sectionTags = MentorSchools.courseTags(m.sections, activeSchool, document.getElementById('courseFilter').value)
      .map(s => `<span class="mc-section-tag">${escHtml(s)}</span>`).join('');

    return `
      <div class="att-mentor-card">
        <div class="amc-top">
          <div class="amr-avatar ${avClass}">${escHtml(initials)}</div>
          <div class="amr-info">
            <div class="amr-name">${escHtml(m.firstName)} ${escHtml(m.lastName)}</div>
            <div class="amr-dept">${escHtml(dept)}</div>
          </div>
        </div>
        <div class="amr-sections">${sectionTags}</div>
        <div class="amc-footer">
          <span class="amr-sessions-badge">${sessions} Session${sessions !== 1 ? 's' : ''}</span>
          <button class="amr-view-btn" onclick="openDetail(${m.mentorID})">
            View Mentees
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

// ── NAVIGATE TO DETAIL ────────────────────────────────────────
function openDetail(mentorId) {
  const school = activeSchool ? `&school=${encodeURIComponent(activeSchool)}` : '';
  window.location.href = `attendance-detail.html?id=${mentorId}${school}`;
}

// ── HELPERS ───────────────────────────────────────────────────
function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 6;
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── EXPORT ────────────────────────────────────────────────────
// Same shape as Head's own Attendance Summary export/print
// (HEAD/JS/attendance-summary.js) — Head had these, Admin didn't, even
// though both read the same AttendanceLogs/full-report endpoint. Kept in
// sync on purpose; if one changes, so should the other.
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

async function exportCSV() {
  if (!currentFiltered.length) { showToast('No mentors to export.'); return; }

  let data;
  try {
    const qs = activeSchool ? `?school=${encodeURIComponent(activeSchool)}` : '';
    data = await apiRequest(`AttendanceLogs/full-report${qs}`, 'GET', null, true);
  } catch (e) {
    showToast('Failed to load export data. Please try again.');
    return;
  }

  const visibleIds = new Set(currentFiltered.map(m => m.mentorID));
  const mentors    = (data.mentors || []).filter(m => visibleIds.has(m.mentorID));

  function statusLabel(rate, total) {
    return AttendanceMetrics.status(rate, total).label;
  }

  const header = ['Type', 'Name', 'Student No.', 'Department', 'Section', 'Course',
                  'Completed Sessions (Mentor)', 'Completed Checkpoints (Mentee)', 'Checkpoints attended', 'Checkpoints missed', 'Attendance Rate %', 'Attendance Status'];
  const rows   = [];

  mentors.forEach(m => {
    const mTotal   = m.mentees.reduce((s, mt) => s + mt.totalSessions, 0);
    const mPresent = m.mentees.reduce((s, mt) => s + mt.presentCount,  0);
    const mRate    = mTotal > 0 ? Math.round(mPresent / mTotal * 100) : 0;

    rows.push([
      'Mentor',
      `${m.lastName || ''}, ${m.firstName || ''}`,
      '',
      m.department || '',
      '',
      '',
      m.totalSessions ?? 0,
      '',
      mPresent,
      mTotal - mPresent,
      mTotal > 0 ? mRate : '',
      '',
    ]);

    [...m.mentees]
      .sort((a, b) => `${a.menteeLastName} ${a.menteeFirstName}`.localeCompare(`${b.menteeLastName} ${b.menteeFirstName}`))
      .forEach(mt => {
        const rate   = mt.totalSessions > 0 ? Math.round(mt.presentCount / mt.totalSessions * 100) : 0;
        const absent = mt.totalSessions - mt.presentCount;
        rows.push([
          'Mentee',
          `${mt.menteeLastName || ''}, ${mt.menteeFirstName || ''}${mt.isDropOut ? ' (Drop Out)' : ''}`,
          mt.studentNumber || '',
          '',
          mt.sectionCode   || '',
          [mt.course, mt.yearLevel].filter(Boolean).join(' ') || '',
          '', mt.totalSessions,
          mt.presentCount,
          absent,
          mt.totalSessions > 0 ? rate : '',
          statusLabel(AttendanceMetrics.percent(mt.presentCount, mt.totalSessions), mt.totalSessions),
        ]);
      });
  });

  const csv  = [header, ...rows].map(r => r.map(escCsv).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `attendance-detail-${(activeSchool || 'all').replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function printReport() {
  if (!currentFiltered.length) { showToast('No mentors to print.'); return; }
  const school  = activeSchool || null;
  const now     = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const logoUrl = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;

  let data;
  try {
    const qs = school ? `?school=${encodeURIComponent(school)}` : '';
    data = await apiRequest(`AttendanceLogs/full-report${qs}`, 'GET', null, true);
  } catch (e) {
    showToast('Failed to load report data. Please try again.');
    return;
  }

  const mentors      = data.mentors || [];
  const reqSessions  = data.requiredSessions || 6;
  const schoolLabel  = school || 'All Schools';

  // Filter to only mentors visible in currentFiltered (respects search/dept/section filters)
  const visibleIds = new Set(currentFiltered.map(m => m.mentorID));
  const filtered   = mentors.filter(m => visibleIds.has(m.mentorID))
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));

  if (!filtered.length) { showToast('No data to print.'); return; }

  // Overall totals across all visible mentees
  const totals = { records: 0, present: 0 };
  filtered.forEach(m => m.mentees.forEach(mt => {
    totals.records  += mt.totalSessions;
    totals.present  += mt.presentCount;
  }));
  const overallRate = totals.records > 0 ? Math.round(totals.present / totals.records * 100) : 0;

  const mentorBlocks = filtered.map((m, mi) => {
    const menteeRows = [...m.mentees].sort((a, b) =>
      `${a.menteeLastName} ${a.menteeFirstName}`.localeCompare(`${b.menteeLastName} ${b.menteeFirstName}`)
    ).map((mt, mti) => {
      const absent  = mt.totalSessions - mt.presentCount;
      const section = mt.sectionCode || '—';
      return `<tr class="mentee-row">
        <td style="text-align:center;padding-left:28px">${mti + 1}</td>
        <td style="padding-left:28px">${escHtml(mt.menteeFirstName)} ${escHtml(mt.menteeLastName)}${mt.isDropOut ? ' (Drop Out)' : ''}</td>
        <td>${escHtml(mt.studentNumber || '—')}</td>
        <td>${escHtml(section)}</td>
        <td style="text-align:center">${mt.totalSessions}</td>
        <td style="text-align:center">${mt.presentCount}</td>
        <td style="text-align:center">${absent}</td>
      </tr>`;
    }).join('');

    return `
      <tr class="mentor-header-row">
        <td colspan="7">
          ${mi + 1}. ${escHtml(m.firstName)} ${escHtml(m.lastName)}
          <span class="mentor-dept">${escHtml(m.department)}</span>
        </td>
      </tr>
      ${menteeRows || `<tr><td colspan="7" style="text-align:center;padding:6px;font-size:10px;color:#4b5563">No mentees assigned</td></tr>`}`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>Attendance Report — ${schoolLabel}</title>
<style>
@page{margin:15mm 14mm;size:A4 portrait}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111827;background:#fff}
.rpt-header{text-align:center;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #111827}
.rpt-logo{height:46px;margin-bottom:4px}
.rpt-inst{font-size:16px;font-weight:900;letter-spacing:.08em;color:#111827;text-transform:uppercase}
.rpt-title{font-size:12px;font-weight:700;color:#111827;margin:3px 0 2px}
.rpt-meta{font-size:10px;color:#4b5563}
.rpt-summary{margin-bottom:14px;padding:8px 0;border-bottom:1px solid #9ca3af}
.rpt-summary p{font-size:11px;color:#111827;margin-bottom:3px}
.rpt-summary p span{font-weight:700}
.rpt-req{font-size:10px;color:#4b5563;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:10px;border:1px solid #111827}
thead th{background:#e5e7eb;color:#111827;padding:7px 8px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;border:1px solid #9ca3af}
tbody td{padding:5px 8px;vertical-align:middle;border:1px solid #d1d5db}
tr.mentor-header-row td{font-weight:700;font-size:11px;background:#f3f4f6;border-top:1.5px solid #111827;border-bottom:1px solid #111827;padding:6px 8px}
.mentor-dept{font-weight:400;color:#4b5563;margin-left:8px}
tr.mentee-row:nth-child(even){background:#f9fafb}
.rpt-footer{margin-top:14px;padding-top:6px;border-top:1px solid #9ca3af;font-size:9px;color:#4b5563;text-align:center}
</style></head><body>
<div class="rpt-header">
  <img src="${logoUrl}" class="rpt-logo" onerror="this.style.display='none'"/>
  <div class="rpt-title">Mentoring Attendance Report — ${schoolLabel}</div>
  <div class="rpt-meta">Generated by Admin &nbsp;|&nbsp; ${now}</div>
</div>
<div class="rpt-summary">
  <p class="rpt-req">Required checkpoints this semester: ${reqSessions}. Regular and make-up sessions for the same checkpoint count once per mentee.</p>
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Name</th>
      <th>Student No.</th>
      <th>Section</th>
      <th style="text-align:center">Completed Checkpoints</th>
      <th style="text-align:center">Attended</th>
      <th style="text-align:center">Missed</th>
    </tr>
  </thead>
  <tbody>${mentorBlocks}</tbody>
</table>
<div class="rpt-footer">AstraMentoring System &nbsp;·&nbsp; ${now} &nbsp;·&nbsp; Admin &nbsp;·&nbsp; ${filtered.length} mentor${filtered.length !== 1 ? 's' : ''}</div>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}
