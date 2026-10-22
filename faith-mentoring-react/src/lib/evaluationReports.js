import { escapeHtml } from './security-utils.js';

// Mentoring Program Report (Head and Admin "evaluation-ratings"): rankings, checkpoint cells,
// Program Report honorarium rows, and the CSV/print outputs. Verbatim from the original
// (HEAD/JS/evaluation-ratings.js, kept in sync with ADMIN_/JS/evaluation-ratings.js). The page
// sets the current data with configureReports() before rendering or exporting.
let allMentors = [];
let sysSettings = { SchoolYear: '2026-2027', Semester: '1st Semester' };
let rankMap = new Map();
let prQuery = '';
let portalLabel = 'Head Admin';
let toast = () => {};

function configureReports(ctx) {
  if ('mentors' in ctx) { allMentors = ctx.mentors; buildRankMap(); }
  if ('settings' in ctx) sysSettings = ctx.settings;
  if ('prQuery' in ctx) prQuery = ctx.prQuery;
  if ('portalLabel' in ctx) portalLabel = ctx.portalLabel;
  if ('toast' in ctx) toast = ctx.toast;
  return rankMap;
}

const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals'
];

function mentorCourseProgress(m) {
 return (m.sectionProgress || []).map(p => String(p.sectionCode || 'Unspecified') + ' ' + (p.completedSessions || 0) + '/' + (p.requiredSessions || 0));
}

function mentorCourseLabels(m) {
 const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return '<div class="mentor-course-progress">' + mentorCourseProgress(m).map(label => '<span class="mentor-course-chip" title="Completed checkpoints / required checkpoints">'+escape(label)+'</span>').join('') + '</div>';
}

function checkpointDone(m, slot) {
 if (!(m.completedSlots || []).includes(slot)) return null;
 const courses = (m.sectionProgress || []).filter(p => p.sectionCode);
 if (courses.length < 2 || courses.some(p => !Array.isArray(p.completedSlots))) return { text: 'Done', done: [], pending: [] };
 const done = courses.filter(p => p.completedSlots.includes(slot)).map(p => p.sectionCode);
 const pending = courses.filter(p => !p.completedSlots.includes(slot)).map(p => p.sectionCode);
 return { text: pending.length ? `Done ${done.length}/${courses.length}` : 'Done', done, pending };
}

function checkpointDoneText(m, slot) {
 const d = checkpointDone(m, slot);
 if (!d) return '';
 return d.pending.length ? d.text + ' (' + (d.done.join(', ') || 'none') + ')' : 'Done';
}

function slotsForSemester(semester) {
  return MENTORING_SLOTS; // Keep the fixed report columns; inapplicable Assembly displays N/A.
}

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

function byRank(a, b) {
  const rankA = rankMap.get(a.mentorID), rankB = rankMap.get(b.mentorID);
  if (rankA != null && rankB != null) return rankA - rankB;
  if (rankA != null) return -1;
  if (rankB != null) return 1;
  return `${a.lastName || ''}`.localeCompare(b.lastName || '');
}

function escCsv(val) {
  let s = String(val ?? '');
  // Stops spreadsheet apps from running a cell as a formula; numbers/phones pass through.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportRatingsCsv() {
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

function printRatingsReport() {
  if (!allMentors.length) { toast('No mentors to print.'); return; }
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
<div class="rpt-footer">FAITH Colleges Mentoring System &mdash; ${portalLabel} Portal &mdash; ${now}</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1200,height=820');
  if (!w) { toast('Please allow pop-ups for this page to open the print report.'); return; }
  w.document.write(html);
  w.document.close();
}

function formatPeso(n) {
  return '₱' + (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildProgramReportGroups() {
  const q     = prQuery.trim().toLowerCase();
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

function programReportRow(m, slots) {
  const slotAttendance = parseSlotAttendance(m.slotAttendance);
  const counts = slots.map(s => !(s === 'Mentoring Assembly' && sysSettings.Semester === '2nd Semester') ? slotAttendance.get(s) || 0 : null);
  const sum    = counts.reduce((a, b) => a + b, 0);
  return { counts, sum, amount: sum * 50 };
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
  if (!allMentors.length) { toast('No mentors to print.'); return; }
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
<div class="rpt-footer">FAITH Colleges Mentoring System &mdash; ${portalLabel} Portal &mdash; ${now}</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1200,height=820');
  if (!w) { toast('Please allow pop-ups for this page to open the print report.'); return; }
  w.document.write(html);
  w.document.close();
}

export { configureReports, MENTORING_SLOTS, slotsForSemester, mentorCourseProgress, checkpointDone, parseSlotAttendance, byRank, formatPeso,
  buildProgramReportGroups, programReportRow, exportRatingsCsv, printRatingsReport, exportProgramReportCSV, printProgramReport };
