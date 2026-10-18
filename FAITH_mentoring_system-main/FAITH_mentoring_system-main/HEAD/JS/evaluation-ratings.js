// Keep the handled-course workload visible beside each mentor's score.
function mentorCourseProgress(m) {
 return (m.sectionProgress || []).map(p => String(p.sectionCode || 'Unspecified') + ' ' + (p.completedSessions || 0) + '/' + (p.requiredSessions || 0));
}
function mentorCourseLabels(m) {
 const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return '<div class="mentor-course-progress">' + mentorCourseProgress(m).map(label => '<span class="mentor-course-chip" title="Completed checkpoints / required checkpoints">'+escape(label)+'</span>').join('') + '</div>';
}
// With 2+ courses, Done shows how many of them finished the checkpoint.
function checkpointDone(m, slot) {
 if (!(m.completedSlots || []).includes(slot)) return null;
 const courses = (m.sectionProgress || []).filter(p => p.sectionCode);
 if (courses.length < 2 || courses.some(p => !Array.isArray(p.completedSlots))) return { text: 'Done', done: [], pending: [] };
 const done = courses.filter(p => p.completedSlots.includes(slot)).map(p => p.sectionCode);
 const pending = courses.filter(p => !p.completedSlots.includes(slot)).map(p => p.sectionCode);
 return { text: pending.length ? `Done ${done.length}/${courses.length}` : 'Done', done, pending };
}
function checkpointDoneHtml(m, slot, empty) {
 const d = checkpointDone(m, slot);
 if (!d) return empty;
 if (!d.pending.length) return 'Done';
 const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return '<span class="slot-partial" data-done="' + escape(d.done.join(', ') || 'None') + '" data-pending="' + escape(d.pending.join(', ')) + '">' + escape(d.text) + '</span>';
}
// Shows which courses finished the checkpoint as soon as Done x/y is hovered.
document.addEventListener('mouseover', e => {
 const cell = e.target.closest?.('.slot-partial');
 let tip = document.getElementById('slotPartialTip');
 if (!cell) { if (tip) tip.style.display = 'none'; return; }
 if (!tip) { tip = document.createElement('div'); tip.id = 'slotPartialTip'; tip.className = 'slot-partial-tip'; document.body.appendChild(tip); }
 tip.innerHTML = '<div class="slot-tip-row"><span class="slot-tip-dot done"></span><span>Done: <b></b></span></div><div class="slot-tip-row"><span class="slot-tip-dot"></span><span>Not yet: <b></b></span></div>';
 const [doneEl, pendingEl] = tip.querySelectorAll('b');
 doneEl.textContent = cell.dataset.done; pendingEl.textContent = cell.dataset.pending;
 tip.style.display = 'block';
 const r = cell.getBoundingClientRect();
 const left = Math.max(8, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, innerWidth - tip.offsetWidth - 8));
 const top = r.bottom + 8 + tip.offsetHeight > innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8;
 tip.style.left = left + 'px'; tip.style.top = top + 'px';
});
window.addEventListener('scroll', () => { const tip = document.getElementById('slotPartialTip'); if (tip) tip.style.display = 'none'; }, true);
function checkpointDoneText(m, slot) {
 const d = checkpointDone(m, slot);
 if (!d) return '';
 return d.pending.length ? d.text + ' (' + (d.done.join(', ') || 'none') + ')' : 'Done';
}

// ===== EVALUATION RATINGS JS (HEAD — read-only) =====
// Same page as ADMIN_/JS/evaluation-ratings.js, minus everything editable —
// Head can view every mentor's ranking numbers for the current School Year
// + Semester (Mentors | checkpoint columns | Timeliness (25%) |
// Completeness (25%) | Evaluation Rating | Performance Score | Rank) but the
// Evaluation Rating column is a read-only chip, not an input — only Admin
// can PUT EvaluationRatings (EvaluationRatingsController.Upsert is
// [Authorize(Roles="Admin")] only, while Get is "Admin,Head").
//
// Rankings show each completed checkpoint once; Program Report keeps unique mentee counts.

// Mirrors AstraMentoring-Backend/.../Constants/MentoringSlots.cs.
const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals'
];
function slotsForSemester(semester) {
  return MENTORING_SLOTS; // Keep the fixed report columns; inapplicable Assembly displays N/A.
}

// Parses "SlotName:Count, SlotName:Count" into a Map<string, number> — a
// slot absent from the map has no logged session at all (cell shows "—"),
// distinct from a logged session with 0 attendees (cell shows "0").
function parseSlotAttendance(raw) {
  const map = new Map();
  (raw || '').split(',').forEach(pair => {
    const idx = pair.lastIndexOf(':');
    if (idx === -1) return;
    const name  = pair.slice(0, idx).trim();
    const count = parseInt(pair.slice(idx + 1).trim(), 10);
    if (name && !Number.isNaN(count)) map.set(name, count);
  });
  return map;
}

let allMentors  = [];
let sysSettings = { SchoolYear: '2026-2027', Semester: '1st Semester' };
let ratingsChart = null;
let rankMap = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('head');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  await loadSettings();
  await loadMentors();

  document.getElementById('searchInput').addEventListener('input', renderTable);
  document.getElementById('ratedFilter').addEventListener('change', renderTable);
  document.getElementById('prSearchInput').addEventListener('input', renderProgramReportTable);
});

async function loadSettings() {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    if (data) sysSettings = { ...sysSettings, ...data };
  } catch (e) { /* use defaults */ }
  document.getElementById('periodSub').textContent =
    `Mentor performance rankings for ${sysSettings.Semester}, SY ${sysSettings.SchoolYear}`;
}

async function loadMentors() {
  try {
    const data = await apiRequest('MonitorActivities', 'GET', null, true);
    allMentors = data?.mentors || data?.Mentors || [];
  } catch (e) {
    console.error('Failed to load mentors:', e);
    allMentors = [];
  }
  buildRankMap();
  renderStats();
  renderChart();
  renderTop3();
  renderTableHead();
  renderTable();
  renderProgramReportTable();
}

// Same comparator as ADMIN_/JS/evaluation-ratings.js's buildRankMap —
// computed once from EVERY mentor (not the filtered/visible rows) so a
// mentor's rank here always matches Admin's Sessions, both Dashboards' Top
// 3, and this same mentor's own detail page.
function buildRankMap() {
  rankMap = new Map();
  [...allMentors]
    .filter(m => (m.overallPercent ?? 0) > 0)
    .sort((a, b) => {
      const pctA  = a.overallPercent    ?? 0, pctB  = b.overallPercent    ?? 0;
      const doneA = a.completedSessions ?? 0, doneB = b.completedSessions ?? 0;
      const menA  = a.menteeCount       ?? 0, menB  = b.menteeCount       ?? 0;
      return pctB - pctA || doneB - doneA || menB - menA
        || `${a.lastName || ''}`.localeCompare(b.lastName || '');
    })
    .forEach((m, i) => rankMap.set(m.mentorID, i + 1));
}

// Ranked mentors first (by rank, ascending), unranked (0% overall) last.
// Shared by renderTable, exportCSV, and printRatings so all three list
// mentors in the same order.
function byRank(a, b) {
  const rankA = rankMap.get(a.mentorID), rankB = rankMap.get(b.mentorID);
  if (rankA != null && rankB != null) return rankA - rankB;
  if (rankA != null) return -1;
  if (rankB != null) return 1;
  return `${a.lastName || ''}`.localeCompare(b.lastName || '');
}

function renderStats() {
  const total  = allMentors.length;
  const rated  = allMentors.filter(m => m.evaluationRatingPercent != null).length;
  document.getElementById('ratedValue').textContent   = `${rated} / ${total}`;
  document.getElementById('unratedValue').textContent = total - rated;
}

// ── TOP 3 ─────────────────────────────────────────────────────
function renderTop3() {
  const el = document.getElementById('top3List');
  if (!el) return;

  const top3 = [...allMentors]
    .filter(m => rankMap.has(m.mentorID))
    .sort((a, b) => rankMap.get(a.mentorID) - rankMap.get(b.mentorID))
    .slice(0, 3);

  if (!top3.length) {
    el.innerHTML = '<div class="top3-empty">No mentors ranked yet this period.</div>';
    return;
  }

  el.innerHTML = top3.map(m => {
    const rank = rankMap.get(m.mentorID);
    const inits = ((m.firstName?.[0] || '') + (m.lastName?.[0] || '')).toUpperCase() || '?';
    const dept = [m.departmentName, m.school].filter(Boolean).join(' · ') || '—';
    return `
      <div class="top3-row" onclick="window.location.href='mentor-detail.html?id=${m.mentorID}'">
        <div class="top3-rank rank-${rank}">${rank}</div>
        <div class="top3-avatar">${inits}</div>
        <div class="top3-info">
          <div class="top3-name">${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</div>
          <div class="top3-dept">${escapeHtml(dept)}</div>
        </div>
        <div class="top3-pct">${m.overallPercent == null ? 'Pending' : m.overallPercent + '%'}</div>
      </div>`;
  }).join('');
}

// ── BAR CHART ─────────────────────────────────────────────────
const PX_PER_BAR = 26;

function renderChart() {
  const canvas = document.getElementById('ratingsChart');
  if (!canvas) return;

  const sorted = [...allMentors].sort(byRank);

  const labels = sorted.map(m => `${m.firstName} ${m.lastName}`);
  const values = sorted.map(m => m.overallPercent ?? null);
  const colors = sorted.map(m => m.evaluationRatingPercent != null ? '#2563eb' : '#d1d5db');

  const inner = document.getElementById('chartScrollInner');
  if (inner) inner.style.height = `${Math.max(220, sorted.length * PX_PER_BAR)}px`;

  if (ratingsChart) ratingsChart.destroy();
  ratingsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Overall performance score',
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.5,
        categoryPercentage: 0.8,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { min: 0, max: 100, ticks: { callback: v => `${v}%` } },
        y: { ticks: { autoSkip: false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const m = sorted[ctx.dataIndex];
              return `Overall performance: ${m.overallPercent == null ? 'Pending' : m.overallPercent + '%'}${m.evaluationRatingPercent == null ? ' ? Evaluation pending' : ''}`;
            }
          }
        }
      }
    }
  });
}

// ── TABLE HEAD (dynamic — Mentoring Assembly drops out in 2nd Semester) ──
// table-layout:auto (evaluation-ratings.css) sizes each column to its own
// content instead of a fixed % share, so no inline widths are needed here
// regardless of how many checkpoint columns the current semester has.
function renderTableHead() {
  const row = document.getElementById('tableHeadRow');
  const slots = slotsForSemester(sysSettings.Semester);
  row.innerHTML = [
    '<th>Mentors</th>',
    ...slots.map(s => `<th class="td-center">${s}</th>`),
    '<th class="td-center">Timeliness of Submission (25%)</th>',
    '<th class="td-center">Completeness of the Required Documents (25%)</th>',
    '<th class="td-center">Evaluation Rating (50%)</th>',
    '<th class="td-center">Performance Score</th>',
    '<th class="td-center">Rank</th>',
  ].join('');
}

// ── TABLE (read-only — rating shown as a chip, not an input) ──
function renderTable() {
  const q     = document.getElementById('searchInput').value.trim().toLowerCase();
  const rated = document.getElementById('ratedFilter').value;
  const slots = slotsForSemester(sysSettings.Semester);

  let filtered = allMentors.filter(m => {
    const name = `${m.firstName} ${m.lastName}`.toLowerCase();
    if (q && !name.includes(q)) return false;
    const isRated = m.evaluationRatingPercent != null;
    if (rated === 'rated'   && !isRated) return false;
    if (rated === 'unrated' &&  isRated) return false;
    return true;
  });
  filtered = [...filtered].sort(byRank);

  document.getElementById('showingCount').textContent = `(${filtered.length})`;

  const tbody = document.getElementById('tableBody');
  const colCount = 6 + slots.length;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No mentors match the current filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(m => {
    const slotCells = slots.map(s =>
      `<td class="td-center">${!(s === 'Mentoring Assembly' && sysSettings.Semester === '2nd Semester') ? checkpointDoneHtml(m, s, '<span class="slot-empty">—</span>') : '<span style="color:#6b7280;background:#f3f4f6">N/A</span>'}</td>`
    ).join('');

    const rank = rankMap.get(m.mentorID);
    const isRated = m.evaluationRatingPercent != null;

    return `
      <tr>
        <td class="td-primary">${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}${mentorCourseLabels(m)}</td>
        ${slotCells}
        <td class="td-center">${m.timelinessPercent == null ? 'Pending' : m.timelinessPercent + '%'}</td>
        <td class="td-center">${m.completenessPercent ?? 0}%</td>
        <td class="td-center">
          <span class="rating-chip ${isRated ? 'rated' : 'unrated'}">${isRated ? m.evaluationRatingPercent + '%' : 'Not yet rated'}</span>
        </td>
        <td class="td-primary td-center">${m.overallPercent == null ? 'Pending' : m.overallPercent + '%'}</td>
        <td class="td-center">${rank ? `#${rank}` : '—'}</td>
      </tr>`;
  }).join('');
}

// ── EXPORT ────────────────────────────────────────────────────
function escCsv(val) {
  let s = String(val ?? '');
  // Stops spreadsheet apps from running a cell as a formula; numbers/phones pass through.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV() {
  if (!allMentors.length) { return; }
  const slots  = slotsForSemester(sysSettings.Semester);
  const header = ['Mentors', 'Course progress (completed/required)', ...slots, 'Timeliness of Submission (25%)',
                  'Completeness of the Required Documents (25%)', 'Evaluation Rating (50%)',
                  'Performance Score', 'Rank'];

  const sorted = [...allMentors].sort(byRank);

  const rows = sorted.map(m => {
    const rank = rankMap.get(m.mentorID);
    return [
      `${m.lastName}, ${m.firstName}`,
      mentorCourseProgress(m).join('; '),
      ...slots.map(s => !(s === 'Mentoring Assembly' && sysSettings.Semester === '2nd Semester') ? checkpointDoneText(m, s) : 'N/A'),
      m.timelinessPercent ?? 'Pending',
      m.completenessPercent ?? 0,
      m.evaluationRatingPercent ?? '',
      m.overallPercent ?? 'Pending',
      rank ? rank : '',
    ];
  });

  const csv  = [header, ...rows].map(r => r.map(escCsv).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `evaluation-ratings-${sysSettings.SchoolYear}-${sysSettings.Semester}-${new Date().toISOString().slice(0, 10)}.csv`.replace(/\s+/g, '-');
  a.click();
  URL.revokeObjectURL(url);
}

// ── PRINT ─────────────────────────────────────────────────────
// Same report-window pattern as HEAD/JS/attendance-summary.js's printReport
// — builds a standalone printable HTML document and opens it in a new tab.
function printRatings() {
  if (!allMentors.length) { showToast('No mentors to print.'); return; }
  const slots   = slotsForSemester(sysSettings.Semester);
  const now     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const logoUrl = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const sorted  = [...allMentors].sort(byRank);

  const slotHeaders = slots.map(s => `<th>${s}</th>`).join('');
  const tableRows = sorted.map(m => {
    const rank = rankMap.get(m.mentorID);
    const slotCells = slots.map(s =>
      `<td style="text-align:center">${!(s === 'Mentoring Assembly' && sysSettings.Semester === '2nd Semester') ? checkpointDoneText(m, s) || '&mdash;' : '<span style="color:#6b7280;background:#f3f4f6">N/A</span>'}</td>`
    ).join('');
    return `<tr>
      <td><strong>${escapeHtml(m.lastName)}, ${escapeHtml(m.firstName)}</strong><div style="font-size:10px;font-weight:normal">${mentorCourseLabels(m)}</div></td>
      ${slotCells}
      <td style="text-align:center">${m.timelinessPercent == null ? 'Pending' : m.timelinessPercent + '%'}</td>
      <td style="text-align:center">${m.completenessPercent ?? 0}%</td>
      <td style="text-align:center">${m.evaluationRatingPercent != null ? m.evaluationRatingPercent + '%' : '&mdash;'}</td>
      <td style="text-align:center;font-weight:700">${m.overallPercent == null ? 'Pending' : m.overallPercent + '%'}</td>
      <td style="text-align:center">${rank ? '#' + rank : '&mdash;'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Evaluation Ratings — ${sysSettings.Semester}, SY ${sysSettings.SchoolYear}</title>
<style>
@page { margin: 14mm 12mm; size: landscape; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
/* Black borders, #f3f4f6 header fill, no colored blocks — matches the paper form. */
.rpt-header { text-align: center; margin-bottom: 14px; }
.rpt-logo  { height: 50px; margin-bottom: 6px; }
.rpt-dept  { font-size: 11px; font-weight: 600; color: #111; margin-top: 1px; }
.rpt-title { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #111; margin: 8px 0 4px; }
.rpt-meta  { font-size: 11px; color: #555; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
th { border: 1px solid #111; padding: 6px 8px; font-size: 9px; font-weight: 700; text-align: center; background: #f3f4f6; text-transform: uppercase; letter-spacing: 0.02em; }
td { border: 1px solid #111; padding: 5px 8px; vertical-align: middle; }
.rpt-footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 10px; color: #555; text-align: center; }
@media print { button { display: none !important; } }
</style>
</head>
<body>
<div class="rpt-header">
  <img src="${logoUrl}" class="rpt-logo" onerror="this.style.display='none'"/>
  <div class="rpt-dept">Student and Alumni Services</div>
  <div class="rpt-dept">Guidance and Counseling Office</div>
  <div class="rpt-title">Mentor Monitoring Program</div>
  <div class="rpt-dept">${sysSettings.Semester}, AY ${sysSettings.SchoolYear}</div>
  <div class="rpt-meta">Generated: ${now} &nbsp;|&nbsp; Total Mentors: ${allMentors.length}</div>
</div>
<table>
  <thead>
    <tr>
      <th>Mentors</th>
      ${slotHeaders}
      <th>Timeliness of Submission (25%)</th>
      <th>Completeness of the Required Documents (25%)</th>
      <th>Evaluation Rating (50%)</th>
      <th>Performance Score</th>
      <th>Rank</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="rpt-footer">FAITH Colleges Mentoring System &mdash; Head Admin Portal &mdash; ${now}</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1200,height=820');
  if (!w) { showToast('Please allow pop-ups for this page to open the print report.'); return; }
  w.document.write(html);
  w.document.close();
}

// ── PROGRAM REPORT TAB ───────────────────────────────────────────
// Digitizes the paper "Mentoring Program Report" Guidance & Counseling
// fills out by hand to compute each mentor's honorarium. Reuses the exact
// mentor list Tab 1 already fetched (no separate API call) — everything
// needed (departmentName, menteeCount, slotAttendance) is already on each
// row from sp_GetMentorOverview. Same as Admin's copy — read-only either
// way, this tab has no editable cells for Admin's copy either.
// Sliding highlight behind the active tab. Positioned from the active tab's
// own box, so it follows any label/width change; the first placement skips
// the transition so it doesn't fly in from the left.
function moveRptPill(instant) {
  const bar = document.querySelector('.rpt-tabs');
  const active = bar && bar.querySelector('.rpt-tab.active');
  if (!bar || !active || !active.offsetWidth) return;
  let pill = bar.querySelector('.rpt-tab-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.className = 'rpt-tab-pill';
    pill.setAttribute('aria-hidden', 'true');
    bar.insertBefore(pill, bar.firstChild);
    bar.classList.add('has-pill');
    instant = true;
  }
  if (instant) pill.style.transition = 'none';
  pill.style.width = active.offsetWidth + 'px';
  pill.style.transform = `translateX(${active.offsetLeft}px)`;
  if (instant) { void pill.offsetWidth; pill.style.transition = ''; }
}
document.addEventListener('DOMContentLoaded', () => moveRptPill(true));
window.addEventListener('load', () => moveRptPill(true));
window.addEventListener('resize', () => moveRptPill(true));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveRptPill(true));

function switchRptTab(tab) {
  const rankingsPanel = document.getElementById('tabPanel-rankings');
  const prPanel       = document.getElementById('tabPanel-programreport');
  const rankingsBtn   = document.getElementById('tabBtn-rankings');
  const prBtn         = document.getElementById('tabBtn-programreport');
  const isRankings    = tab === 'rankings';

  // Cross-fade: the visible panel fades out, then the other eases in. The
  // pill under the tabs slides to the new tab straight away.
  const shown  = isRankings ? rankingsPanel : prPanel;
  const hidden = isRankings ? prPanel : rankingsPanel;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const token  = (switchRptTab._t = (switchRptTab._t || 0) + 1);
  const reveal = () => {
    if (token !== switchRptTab._t) return;
    hidden.style.display = 'none';
    hidden.classList.remove('rpt-panel-out');
    shown.style.display = '';
    shown.classList.remove('rpt-panel-in');
    void shown.offsetWidth;
    shown.classList.add('rpt-panel-in');
  };
  if (reduce || hidden.style.display === 'none') reveal();
  else { hidden.classList.add('rpt-panel-out'); setTimeout(reveal, 130); }
  rankingsBtn.classList.toggle('active', isRankings);
  moveRptPill();
  prBtn.classList.toggle('active', !isRankings);
  rankingsBtn.setAttribute('aria-selected', String(isRankings));
  prBtn.setAttribute('aria-selected', String(!isRankings));

  document.getElementById('periodSub').textContent = isRankings
    ? `Mentor performance rankings for ${sysSettings.Semester}, SY ${sysSettings.SchoolYear}`
    : `Per-checkpoint mentee attendance and honorarium computation for ${sysSettings.Semester}, SY ${sysSettings.SchoolYear}`;
}

function formatPeso(n) {
  return '₱' + (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Groups allMentors by DepartmentName (blank/null -> "Unassigned", sorted
// last), applying the Program Report search box's own filter (name or
// department). A separate grouping pass from Tab 1's flat/ranked list —
// this tab has its own shape (department blocks, matching the paper form).
function buildProgramReportGroups() {
  const q     = (document.getElementById('prSearchInput')?.value || '').trim().toLowerCase();
  const slots = slotsForSemester(sysSettings.Semester);

  const filtered = allMentors.filter(m => {
    if (!q) return true;
    const name = `${m.firstName} ${m.lastName}`.toLowerCase();
    const dept = (m.departmentName || '').toLowerCase();
    return name.includes(q) || dept.includes(q);
  });

  const groups = new Map(); // deptName -> mentor[]
  filtered.forEach(m => {
    const dept = (m.departmentName || '').trim() || 'Unassigned';
    if (!groups.has(dept)) groups.set(dept, []);
    groups.get(dept).push(m);
  });

  const deptNames = [...groups.keys()].sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  return { slots, deptNames, groups, filtered };
}

// The client's own confirmed formula: "kung ilan ang namentoring nila
// i-multiply lang yon sa 50" — sum the attendee count across every
// checkpoint this semester, then multiply by ₱50. A checkpoint with no
// logged session at all counts as 0 here (unlike Tab 1's "—", which just
// distinguishes "unlogged" from "logged with 0 attendees" for review
// purposes) — either way it contributes nothing to the honorarium.
function programReportRow(m, slots) {
  const slotAttendance = parseSlotAttendance(m.slotAttendance);
  const counts = slots.map(s => !(s === 'Mentoring Assembly' && sysSettings.Semester === '2nd Semester') ? slotAttendance.get(s) || 0 : null);
  const sum    = counts.reduce((a, b) => a + b, 0);
  return { counts, sum, amount: sum * 50 };
}

// No inline widths — #prTable uses table-layout:auto (see CSS) so every
// column hugs its own content (mostly single digits and short names) and
// stops leaving wide dead gaps between columns the way a percentage-based
// fixed layout does when most cells only hold a "0".
function renderProgramReportHead() {
  const row = document.getElementById('prTableHeadRow');
  if (!row) return;
  const slots = slotsForSemester(sysSettings.Semester);
  row.innerHTML = [
    '<th>College Department</th>',
    '<th class="pr-center">#</th>',
    '<th>Mentors</th>',
    '<th class="pr-center">Number of Mentees</th>',
    ...slots.map(s => `<th class="pr-center">${s}</th>`),
    `<th class="pr-center">No. of Mentees for ${sysSettings.Semester === '2nd Semester' ? 5 : 6} sessions</th>`,
    `<th class="pr-center">Total Amount for ${sysSettings.Semester === '2nd Semester' ? 5 : 6} sessions (×₱50)</th>`,
  ].join('');
}

// Flat list, not grouped rows — department shows as its own column per
// mentor instead of a shaded divider row repeating it (that read as
// redundant once the column existed). Still sorted by department then
// last name for a sensible reading order; numbering stays continuous.
function renderProgramReportTable() {
  renderProgramReportHead();
  const { slots, deptNames, groups, filtered } = buildProgramReportGroups();
  const tbody = document.getElementById('prTableBody');
  if (!tbody) return;
  const colCount   = 6 + slots.length;
  const totalShown = deptNames.reduce((n, d) => n + groups.get(d).length, 0);
  document.getElementById('prShowingCount').textContent = `(${totalShown})`;

  const summary = filtered.reduce((totals, mentor) => {
    const { sum, amount } = programReportRow(mentor, slots);
    totals.attendance += sum;
    totals.mentors += amount > 0 ? 1 : 0;
    totals.amount += amount;
    return totals;
  }, { attendance: 0, mentors: 0, amount: 0 });
  document.getElementById('prSummaryAttendance').textContent = summary.attendance.toLocaleString('en-PH');
  document.getElementById('prSummaryMentors').textContent = summary.mentors.toLocaleString('en-PH');
  document.getElementById('prSummaryAmount').textContent = formatPeso(summary.amount);

  if (!totalShown) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">No mentors match the current filter.</td></tr>`;
    return;
  }

  let n = 0;
  tbody.innerHTML = deptNames.map(dept => {
    const rows = [...groups.get(dept)].sort((a, b) => `${a.lastName || ''}`.localeCompare(b.lastName || ''));
    return rows.map(m => {
      n++;
      const { counts, sum, amount } = programReportRow(m, slots);
      const countCells = counts.map(c => `<td class="pr-center"${c === null ? ' style="color:#6b7280;background:#f3f4f6"' : ''}>${c === null ? 'N/A' : c}</td>`).join('');
      return `<tr>
        <td>${escapeHtml(dept)}</td>
        <td class="pr-center">${n}</td>
        <td class="td-primary">${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</td>
        <td class="pr-center">${m.menteeCount ?? 0}</td>
        ${countCells}
        <td class="pr-center td-primary">${sum}</td>
        <td class="pr-center pr-amount">${formatPeso(amount)}</td>
      </tr>`;
    }).join('');
  }).join('');
}

function exportProgramReportCSV() {
  if (!allMentors.length) { return; }
  const { slots, deptNames, groups } = buildProgramReportGroups();
  const header = ['College Department', '#', 'Mentors', 'Number of Mentees', ...slots,
                  `No. of Mentees for ${sysSettings.Semester === '2nd Semester' ? 5 : 6} sessions`, `Total Amount for ${sysSettings.Semester === '2nd Semester' ? 5 : 6} sessions`];
  const rows = [];
  let n = 0;
  deptNames.forEach(dept => {
    const list = [...groups.get(dept)].sort((a, b) => `${a.lastName || ''}`.localeCompare(b.lastName || ''));
    list.forEach(m => {
      n++;
      const { counts, sum, amount } = programReportRow(m, slots);
      rows.push([dept, n, `${m.lastName}, ${m.firstName}`, m.menteeCount ?? 0, ...counts.map(c => c === null ? 'N/A' : c), sum, amount.toFixed(2)]);
    });
  });

  const csv  = [header, ...rows].map(r => r.map(escCsv).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mentoring-program-report-${sysSettings.SchoolYear}-${sysSettings.Semester}-${new Date().toISOString().slice(0, 10)}.csv`.replace(/\s+/g, '-');
  a.click();
  URL.revokeObjectURL(url);
}

function printProgramReport() {
  if (!allMentors.length) { showToast('No mentors to print.'); return; }
  const { slots, deptNames, groups } = buildProgramReportGroups();
  const now     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const logoUrl = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const slotHeaders = slots.map(s => `<th>${s}</th>`).join('');

  let n = 0;
  let grandTotal = 0;
  const bodyRows = deptNames.map(dept => {
    const list = [...groups.get(dept)].sort((a, b) => `${a.lastName || ''}`.localeCompare(b.lastName || ''));
    return list.map(m => {
      n++;
      const { counts, sum, amount } = programReportRow(m, slots);
      grandTotal += amount;
      const countCells = counts.map(c => `<td style="text-align:center;${c === null ? 'color:#6b7280;background:#f3f4f6' : ''}">${c === null ? 'N/A' : c}</td>`).join('');
      return `<tr>
        <td>${escapeHtml(dept)}</td>
        <td style="text-align:center">${n}</td>
        <td><strong>${escapeHtml(m.lastName)}, ${escapeHtml(m.firstName)}</strong></td>
        <td style="text-align:center">${m.menteeCount ?? 0}</td>
        ${countCells}
        <td style="text-align:center;font-weight:700">${sum}</td>
        <td style="text-align:center;font-weight:700">${formatPeso(amount)}</td>
      </tr>`;
    }).join('');
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Mentoring Program Report — ${sysSettings.Semester}, SY ${sysSettings.SchoolYear}</title>
<style>
@page { margin: 14mm 12mm; size: landscape; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
/* Black borders, #f3f4f6 header fill, no colored blocks — matches the paper form. */
.rpt-header { text-align: center; margin-bottom: 14px; }
.rpt-logo  { height: 50px; margin-bottom: 6px; }
.rpt-dept  { font-size: 11px; font-weight: 600; color: #111; margin-top: 1px; }
.rpt-title { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #111; margin: 8px 0 4px; }
.rpt-meta  { font-size: 11px; color: #555; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
th { border: 1px solid #111; padding: 6px 8px; font-size: 9px; font-weight: 700; text-align: center; background: #f3f4f6; text-transform: uppercase; letter-spacing: 0.02em; }
td { border: 1px solid #111; padding: 5px 8px; vertical-align: middle; }
.rpt-grand { text-align: right; font-size: 12px; font-weight: 700; color: #111; margin-top: 10px; }
.rpt-footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 10px; color: #555; text-align: center; }
@media print { button { display: none !important; } }
</style>
</head>
<body>
<div class="rpt-header">
  <img src="${logoUrl}" class="rpt-logo" onerror="this.style.display='none'"/>
  <div class="rpt-dept">Student and Alumni Services</div>
  <div class="rpt-dept">Guidance and Counseling Office</div>
  <div class="rpt-title">Mentoring Program Report</div>
  <div class="rpt-dept">${sysSettings.Semester}, AY ${sysSettings.SchoolYear}</div>
  <div class="rpt-meta">Generated: ${now} &nbsp;|&nbsp; Total Mentors: ${allMentors.length}</div>
</div>
<table>
  <thead>
    <tr>
      <th>College Department</th>
      <th>#</th>
      <th>Mentors</th>
      <th>Number of Mentees</th>
      ${slotHeaders}
      <th>No. of Mentees for ${sysSettings.Semester === '2nd Semester' ? 5 : 6} sessions</th>
      <th>Total Amount for ${sysSettings.Semester === '2nd Semester' ? 5 : 6} sessions</th>
    </tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>
<div class="rpt-grand">Grand Total: ${formatPeso(grandTotal)}</div>
<div class="rpt-footer">FAITH Colleges Mentoring System &mdash; Head Admin Portal &mdash; ${now}</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1200,height=820');
  if (!w) { showToast('Please allow pop-ups for this page to open the print report.'); return; }
  w.document.write(html);
  w.document.close();
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
    background:#111827;color:#fff;padding:12px 24px;
    border-radius:8px;font-size:14px;font-weight:500;
    z-index:99999;opacity:0;transition:opacity 0.3s;
    box-shadow:0 4px 12px rgba(0,0,0,0.2);white-space:nowrap;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.style.opacity = '1', 10);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
}
