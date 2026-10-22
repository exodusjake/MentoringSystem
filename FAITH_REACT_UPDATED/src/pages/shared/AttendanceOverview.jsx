import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { showToast } from '../../components/Notify.jsx';
import OptionGroups from '../../components/OptionGroups.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { AttendanceMetrics } from '../../lib/attendance-metrics.js';
import { MentorSchools } from '../../lib/mentor-schools.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// HEAD/HTML/attendance-summary.html + HEAD/JS/attendance-summary.js
// ADMIN_/HTML/attendance-logs.html + ADMIN_/JS/attendance-logs.js
// The two pages are the same screen; `cfg` carries the few differences (wording, role, routes).
//   cfg = { pageId, base, heading, loadingText, emptyText, sessionsSuffix, roleLabel }

const SCHOOLS = ['School of Technology', 'School of Humanities', 'School of Management'];

function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 6;
}

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

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export default function AttendanceOverview({ cfg }) {
  useBackGuard();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [allMentors, setAllMentors] = useState([]);
  const [loadState, setLoadState] = useState('loading');   // 'loading' | 'ready' | 'failed'
  // '' = all schools (default — every mentor listed below, matching Proof Tracking's own convention). A school
  // card toggles this on/off instead of switching to a separate screen.
  const [activeSchool, setActiveSchool] = useState('');
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');
  const [courseOpts, setCourseOpts] = useState([{ label: null, options: [{ value: '', label: 'All Courses' }] }]);

  useEffect(() => {
    (async () => {
      try {
        const [data] = await Promise.all([apiRequest('AttendanceLogs', 'GET', null, true), MentorSchools.load()]);
        const mentors = data.mentors ?? [];
        setAllMentors(mentors);

        const school = params.get('school');
        const initial = school ? decodeURIComponent(school) : '';
        if (school) setActiveSchool(initial);
        setCourseOpts(MentorSchools.courseOptionGroups(initial, mentors));
        setLoadState('ready');
      } catch (e) {
        console.error('Failed to load attendance summary:', e);
        setLoadState('failed');
      }
    })();
  }, []);

  // The Course filter split into { dept } (e.g. SAS) or { course }.
  const { dept: deptSel, course: sectionSel } = MentorSchools.courseFilter(course);

  // A mentor's records, present and sessions within the selected school, department and section (the whole
  // mentor when nothing narrows it).
  function scopedStats(m, dept, section) {
    const whole = { records: m.totalAttendees || 0, present: m.presentCount || 0, sessions: m.totalSessions || 0 };
    const ownDept = dept && MentorSchools.noSchoolDept(m) === dept;
    if (!m.sectionStats || (!activeSchool && (!dept || ownDept) && !section)) return whole;
    return m.sectionStats
      .filter(x => MentorSchools.sectionsIn([x.sectionCode], activeSchool, ownDept ? '' : dept).length && (!section || String(x.sectionCode).toUpperCase() === String(section).toUpperCase()))
      .reduce((t, x) => ({ records: t.records + x.records, present: t.present + x.present, sessions: t.sessions + x.sessions }),
        { records: 0, present: 0, sessions: 0 });
  }

  const q = search.trim().toLowerCase();
  const currentFiltered = allMentors.filter(m => {
    if (q) {
      const name = `${m.firstName} ${m.lastName}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    if (!MentorSchools.inCourse(m, course)) return false;
    if (activeSchool && !MentorSchools.inSchool(m, activeSchool)) return false;
    return true;
  });

  // Stat cards
  const statsList = currentFiltered.map(m => scopedStats(m, deptSel, sectionSel));
  const total = statsList.reduce((s, x) => s + x.records, 0);
  const present = statsList.reduce((s, x) => s + x.present, 0);
  const absent = total - present;
  const rate = clampPercent(total > 0 ? Math.round(present / total * 100) : 0);
  const ready = loadState === 'ready';
  const pulse = <span className="stat-pulse">—</span>;

  // School cards
  const schoolStats = SCHOOLS.map(school => {
    const rows = allMentors.filter(m => MentorSchools.inSchool(m, school));
    const sessions = rows.reduce((s, m) => s + (m.sectionStats
      ? m.sectionStats.filter(x => MentorSchools.sectionsIn([x.sectionCode], school, '').length).reduce((t, x) => t + x.sessions, 0)
      : (m.totalSessions || 0)), 0);
    return { mentors: rows.length, sessions };
  });
  const S = (i, k) => ready ? schoolStats[i][k] : pulse;

  // Toggle, not a gate — clicking the already-active school clears back to "all schools" combined;
  // clicking a different one switches straight over.
  function filterBySchool(school) {
    const next = activeSchool === school ? '' : school;
    setActiveSchool(next);
    setSearch('');
    setCourse('');
    setCourseOpts(MentorSchools.courseOptionGroups(next, allMentors));
  }

  function resetFilters() {
    setSearch('');
    setCourse('');
  }

  function openDetail(mentorId) {
    const school = activeSchool ? `&school=${encodeURIComponent(activeSchool)}` : '';
    navigate(`${cfg.base}/attendance/detail?id=${mentorId}${school}`);
  }

  // ── EXPORT ──
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
    const mentors = (data.mentors || []).filter(m => visibleIds.has(m.mentorID));

    function statusLabel(r, t) {
      return AttendanceMetrics.status(r, t).label;
    }

    const header = ['Type', 'Name', 'Student No.', 'Department', 'Section', 'Course',
                    'Completed Sessions (Mentor)', 'Completed Checkpoints (Mentee)', 'Checkpoints attended', 'Checkpoints missed', 'Attendance Rate %', 'Attendance Status'];
    const rows = [];

    mentors.forEach(m => {
      const mTotal = m.mentees.reduce((s, mt) => s + mt.totalSessions, 0);
      const mPresent = m.mentees.reduce((s, mt) => s + mt.presentCount, 0);
      const mRate = mTotal > 0 ? Math.round(mPresent / mTotal * 100) : 0;

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
          const r = mt.totalSessions > 0 ? Math.round(mt.presentCount / mt.totalSessions * 100) : 0;
          const ab = mt.totalSessions - mt.presentCount;
          rows.push([
            'Mentee',
            `${mt.menteeLastName || ''}, ${mt.menteeFirstName || ''}${mt.isDropOut ? ' (Drop Out)' : ''}`,
            mt.studentNumber || '',
            '',
            mt.sectionCode || '',
            [mt.course, mt.yearLevel].filter(Boolean).join(' ') || '',
            '', mt.totalSessions,
            mt.presentCount,
            ab,
            mt.totalSessions > 0 ? r : '',
            statusLabel(AttendanceMetrics.percent(mt.presentCount, mt.totalSessions), mt.totalSessions),
          ]);
        });
    });

    const csv = [header, ...rows].map(r => r.map(escCsv).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-detail-${(activeSchool || 'all').replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function printReport() {
    if (!currentFiltered.length) { showToast('No mentors to print.'); return; }
    const school = activeSchool || null;
    const now = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const logoUrl = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;

    let data;
    try {
      const qs = school ? `?school=${encodeURIComponent(school)}` : '';
      data = await apiRequest(`AttendanceLogs/full-report${qs}`, 'GET', null, true);
    } catch (e) {
      showToast('Failed to load report data. Please try again.');
      return;
    }

    const mentors = data.mentors || [];
    const reqSessions = data.requiredSessions || 6;
    const schoolLabel = school || 'All Schools';

    // Filter to only mentors visible in currentFiltered (respects search/dept/section filters)
    const visibleIds = new Set(currentFiltered.map(m => m.mentorID));
    const filtered = mentors.filter(m => visibleIds.has(m.mentorID))
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));

    if (!filtered.length) { showToast('No data to print.'); return; }

    const mentorBlocks = filtered.map((m, mi) => {
      const menteeRows = [...m.mentees].sort((a, b) =>
        `${a.menteeLastName} ${a.menteeFirstName}`.localeCompare(`${b.menteeLastName} ${b.menteeFirstName}`)
      ).map((mt, mti) => {
        const ab = mt.totalSessions - mt.presentCount;
        const section = mt.sectionCode || '—';
        return `<tr class="mentee-row">
        <td style="text-align:center;padding-left:28px">${mti + 1}</td>
        <td style="padding-left:28px">${escHtml(mt.menteeFirstName)} ${escHtml(mt.menteeLastName)}${mt.isDropOut ? ' (Drop Out)' : ''}</td>
        <td>${escHtml(mt.studentNumber || '—')}</td>
        <td>${escHtml(section)}</td>
        <td style="text-align:center">${mt.totalSessions}</td>
        <td style="text-align:center">${mt.presentCount}</td>
        <td style="text-align:center">${ab}</td>
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
  <div class="rpt-meta">Generated by ${cfg.roleLabel} &nbsp;|&nbsp; ${now}</div>
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
<div class="rpt-footer">AstraMentoring System &nbsp;·&nbsp; ${now} &nbsp;·&nbsp; ${cfg.roleLabel} &nbsp;·&nbsp; ${filtered.length} mentor${filtered.length !== 1 ? 's' : ''}</div>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  }

  // ── Mentor rows ──
  let grid;
  if (loadState === 'loading') {
    grid = <Empty className="empty-state" plainText={cfg.loadingText}><span className="spinner"></span> {cfg.loadingText}</Empty>;
  } else if (loadState === 'failed') {
    grid = <Empty className="empty-state">Failed to load data. Please refresh.</Empty>;
  } else if (!currentFiltered.length) {
    grid = <Empty className="empty-state">{cfg.emptyText}</Empty>;
  } else {
    grid = [...currentFiltered].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
    ).map(m => {
      const initials = ((m.firstName?.[0] || '') + (m.lastName?.[0] || '')).toUpperCase() || 'M';
      const avClass = `av-${avatarIndex(m.firstName + m.lastName)}`;
      // School only shown when browsing all schools combined — once a school card filter narrows the list to
      // one, repeating it on every row is redundant.
      const dept = activeSchool
        ? (m.department || 'No department info')
        : [m.department, m.school].filter(Boolean).join(' · ') || 'No department info';

      const sessions = scopedStats(m, deptSel, sectionSel).sessions;
      const sectionTags = MentorSchools.courseTags(m.sections, activeSchool, course);

      return (
        <div className="att-mentor-card" key={m.mentorID}>
          <div className="amc-top">
            <div className={`amr-avatar ${avClass}`}>{initials}</div>
            <div className="amr-info">
              <div className="amr-name">{m.firstName} {m.lastName}</div>
              <div className="amr-dept">{dept}</div>
            </div>
          </div>
          <div className="amr-sections">{sectionTags.map((s, i) => <span className="mc-section-tag" key={i}>{s}</span>)}</div>
          <div className="amc-footer">
            <span className="amr-sessions-badge">{sessions} Session{sessions !== 1 ? 's' : ''}{cfg.sessionsSuffix}</span>
            <button className="amr-view-btn" onClick={() => openDetail(m.mentorID)}>
              View Mentees
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      );
    });
  }

  const cardClass = (i, base) => `${base}${activeSchool === SCHOOLS[i] ? ' active' : ''}`;

  return (
    <Page id={cfg.pageId}>
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>{(cfg.heading)}</h1>
            <p>
              Checkpoint attendance by mentor. Regular and make-up sessions for the same checkpoint count once per mentee.
            </p>
          </div>
          {/* Stat Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-top-row">
                <div className="stat-label">Checkpoint Records</div>
                <div className="stat-icon blue">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="statTotal">{ready ? total : pulse}</div>
              <div className="stat-note">one per mentee for each completed checkpoint</div>
            </div>
            <div className="stat-card">
              <div className="stat-top-row">
                <div className="stat-label">Attended</div>
                <div className="stat-icon green">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="statPresent">{ready ? present : pulse}</div>
              <div className="stat-note">checkpoints with verified attendance</div>
            </div>
            <div className="stat-card">
              <div className="stat-top-row">
                <div className="stat-label">Missed</div>
                <div className="stat-icon red">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="statAbsent">{ready ? absent : pulse}</div>
              <div className="stat-note">checkpoints without verified attendance</div>
            </div>
            <div className="stat-card">
              <div className="stat-top-row">
                <div className="stat-label">Attendance Rate</div>
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="statRate">{ready ? `${rate}%` : pulse}</div>
              <div className="stat-note">attended out of checkpoint records</div>
            </div>
          </div>
          <div className="school-overview-grid monitoring-school-strip" role="region" aria-label="School summary cards" tabIndex={0}>
            <div className={cardClass(0, "school-card school-card--sot")} onClick={() => filterBySchool(SCHOOLS[0])}>
              <div className="school-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <div className="school-card-body">
                <div className="school-card-name">School of Technology</div>
                <div className="school-card-sub">COE &amp; CCIT</div>
              </div>
              <div className="school-card-stats">
                <div className="school-stat">
                  <span id="sotMentors">{S(0, "mentors")}</span>
                  <small>Mentors</small>
                </div>
                <div className="school-stat">
                  <span id="sotSessions">{S(0, "sessions")}</span>
                  <small>Sessions</small>
                </div>
              </div>
            </div>
            <div className={cardClass(1, "school-card school-card--soh")} onClick={() => filterBySchool(SCHOOLS[1])}>
              <div className="school-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <div className="school-card-body">
                <div className="school-card-name">School of Humanities</div>
                <div className="school-card-sub">CASE, CHC &amp; CCJ</div>
              </div>
              <div className="school-card-stats">
                <div className="school-stat">
                  <span id="sohMentors">{S(1, "mentors")}</span>
                  <small>Mentors</small>
                </div>
                <div className="school-stat">
                  <span id="sohSessions">{S(1, "sessions")}</span>
                  <small>Sessions</small>
                </div>
              </div>
            </div>
            <div className={cardClass(2, "school-card school-card--som")} onClick={() => filterBySchool(SCHOOLS[2])}>
              <div className="school-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                </svg>
              </div>
              <div className="school-card-body">
                <div className="school-card-name">School of Management</div>
                <div className="school-card-sub">CBMA &amp; CTHM</div>
              </div>
              <div className="school-card-stats">
                <div className="school-stat">
                  <span id="somMentors">{S(2, "mentors")}</span>
                  <small>Mentors</small>
                </div>
                <div className="school-stat">
                  <span id="somSessions">{S(2, "sessions")}</span>
                  <small>Sessions</small>
                </div>
              </div>
            </div>
          </div>
          {/* Search & Filters */}
          <div className="att-toolbar att-toolbar--overview att-toolbar--panel">
            <div className="att-filter-group">
              <div className="search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {' '}
                <input type="text" id="searchInput" placeholder="Search mentor name…" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {<Select className="filter-select" id="courseFilter" value={course} onChange={e => setCourse(e.target.value)}><OptionGroups groups={courseOpts} /></Select>}
              {' '}
              <button className="filter-reset" onClick={resetFilters}>Clear</button>
            </div>
            <div className="att-action-group">
              <button onClick={exportCSV} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#fff", color: "#2563eb", border: "1px solid #2563eb", borderRadius: "9px", fontSize: "13px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }} onMouseover={e => { e.currentTarget.style.background='#2563eb'; e.currentTarget.style.color='#fff'; }} onMouseout={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.color='#2563eb'; }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {' '}
                Export CSV
              </button>
              {' '}
              <button onClick={printReport} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#2563eb", color: "#fff", border: "1px solid #2563eb", borderRadius: "9px", fontSize: "13px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }} onMouseover={e => { e.currentTarget.style.background='#1d4ed8'; }} onMouseout={e => { e.currentTarget.style.background='#2563eb'; }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                {' '}
                Print Report
              </button>
            </div>
          </div>
          {/* Mentor rows */}
          <div className="att-mentor-list" id="mentorCardsGrid">{grid}</div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
    </Page>
  );
}
