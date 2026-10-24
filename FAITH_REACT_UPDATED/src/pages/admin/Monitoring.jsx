import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { showToast } from '../../components/Notify.jsx';
import OptionGroups from '../../components/OptionGroups.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { MentorSchools } from '../../lib/mentor-schools.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// ADMIN_/HTML/sessions.html + ADMIN_/JS/sessions.js

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

const SCHOOL_CHIP_IDS = {
  'School of Technology': 'schoolChip-technology',
  'School of Humanities': 'schoolChip-humanities',
  'School of Management': 'schoolChip-management',
};

function avatarIdx(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
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

export default function AdminMonitoring() {
  useBackGuard();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Deep-link from the Dashboard's Mentor Performance stat cells (set before the first render comes in filtered).
  const STATUS_OPTIONS = ['Not Started', 'Needs Attention', 'On Track', 'Excellent', 'Pending'];
  const [statusFilter, setStatusFilter] = useState(() => STATUS_OPTIONS.includes(params.get('status')) ? params.get('status') : '');
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');
  const [year, setYear] = useState('');
  const [activeSchool, setActiveSchool] = useState(null);

  const [loaded, setLoaded] = useState(false);
  const [allMentors, setAllMentors] = useState([]);                // the roster currently shown (changes with the period filter)
  const [activeOnly, setActiveOnly] = useState([]);                // the default (Active-only) fetch, cached
  const [courseOpts, setCourseOpts] = useState([{ label: null, options: [{ value: '', label: 'All Courses' }] }]);
  const periodMentorsCache = useRef(new Map());                    // lazily fetched per selected past period
  // MentorID -> Set of "SchoolYear|Semester" keys that mentor's account was Active during
  // (see Settings/period-history). The current period is a live check instead.
  const [periodHistoryByUser, setPeriodHistoryByUser] = useState(() => new Map());
  const [periodOptions, setPeriodOptions] = useState(null);        // null until Settings loads: just "Current Semester"

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      try {
        const [data] = await Promise.all([
          apiRequest('MonitorActivities', 'GET', null, true),
          MentorSchools.load(),
        ]);
        const list = data?.mentors || data?.Mentors || [];
        setAllMentors(list);
        setActiveOnly(list);
        setCourseOpts(MentorSchools.courseOptionGroups(null, list));
        const school = params.get('school');
        if (school) {
          setActiveSchool(decodeURIComponent(school));
          setCourse('');
          setCourseOpts(MentorSchools.courseOptionGroups(decodeURIComponent(school), list));
        }
      } catch (e) {
        console.error('Performance load error:', e);
      }
      setLoaded(true);
    })();
    (async () => {
      try {
        const [settings, rows] = await Promise.all([
          apiRequest('Settings', 'GET', null, true),
          apiRequest('Settings/period-history', 'GET', null, true),
        ]);

        const byUser = new Map();
        const periods = [];
        const seen = new Set();
        (rows || []).forEach(r => {
          const key = `${r.schoolYear}|${r.semester}`;
          if (!byUser.has(r.userID)) byUser.set(r.userID, new Set());
          byUser.get(r.userID).add(key);
          if (!seen.has(key)) { seen.add(key); periods.push({ schoolYear: r.schoolYear, semester: r.semester, key }); }
        });
        periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));
        setPeriodHistoryByUser(byUser);

        if (!settings) return;
        const currentKey = `${settings.SchoolYear}|${settings.Semester}`;
        setPeriodOptions([
          { value: '', label: `${settings.Semester}, SY ${settings.SchoolYear} (Current)` },
          ...periods.filter(p => p.key !== currentKey).map(p => ({ value: p.key, label: `${p.semester}, SY ${p.schoolYear}` })),
        ]);
      } catch (e) { console.warn('Could not load period history.'); }
    })();
  }, []);

  // A past-period selection needs the broader (includeInactive) roster — otherwise a mentor who's since gone
  // Inactive/Drop Out can never appear, even though they genuinely had an account during that period.
  // Each past period also needs its OWN API call: passing schoolYear/semester through is what makes the
  // numbers shown actually belong to the selected past period.
  async function getMentorsForPeriodFilter(yearFilter) {
    if (!yearFilter || yearFilter === '__current__') {
      return activeOnly;
    }
    if (periodMentorsCache.current.has(yearFilter)) return periodMentorsCache.current.get(yearFilter);
    const [schoolYear, semester] = yearFilter.split('|');
    try {
      const qs = `includeInactive=true&schoolYear=${encodeURIComponent(schoolYear)}&semester=${encodeURIComponent(semester)}`;
      const data = await apiRequest(`MonitorActivities?${qs}`, 'GET', null, true);
      const mentors = data?.mentors || data?.Mentors || [];
      periodMentorsCache.current.set(yearFilter, mentors);
      return mentors;
    } catch (e) {
      console.warn('Could not load mentors for selected period; showing active-only.');
      return activeOnly;
    }
  }

  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    getMentorsForPeriodFilter(year).then(list => { if (alive) setAllMentors(list); });
    return () => { alive = false; };
  }, [year, loaded]);

  // ── School Cards ──
  // Counted by the mentees' schools, so a mentor with mentees from two schools appears under both.
  const schoolCounts = useMemo(() => {
    const counts = {
      'School of Technology': { mentors: 0, mentees: 0 },
      'School of Humanities': { mentors: 0, mentees: 0 },
      'School of Management': { mentors: 0, mentees: 0 },
    };
    Object.keys(counts).forEach(s => {
      activeOnly.forEach(m => {
        if (!MentorSchools.inSchool(m, s)) return;
        counts[s].mentors++;
        counts[s].mentees += MentorSchools.menteesIn(m, s, m.menteeCount || m.MenteeCount || 0);
      });
    });
    return counts;
  }, [activeOnly]);
  const cnt = v => loaded ? v : <span className="stat-pulse">—</span>;

  // Toggle, not a gate — clicking the already-active school clears back to "All Schools" combined; clicking
  // a different one switches straight over.
  function toggleSchool(school) {
    const next = activeSchool === school ? null : school;
    setActiveSchool(next);
    setCourse('');
    setCourseOpts(MentorSchools.courseOptionGroups(next, allMentors));
  }

  function matchesPeriodFilter(m, yearFilter) {
    if (!yearFilter) return true;
    if (yearFilter === '__current__') return true;
    const periods = periodHistoryByUser.get(m.mentorID ?? m.MentorID);
    return !!periods && periods.has(yearFilter);
  }

  const searchLower = search.toLowerCase();
  const filtered = useMemo(() => allMentors
    .filter(m => {
      const name = `${m.firstName || ''} ${m.lastName || ''}`.toLowerCase();
      const mStatus = m.progressStatus || m.ProgressStatus || '';
      const mDone = m.completedSessions ?? m.CompletedSessions ?? 0;
      return MentorSchools.inSchool(m, activeSchool)
        && (!searchLower || name.includes(searchLower))
        && MentorSchools.inCourse(m, course)
        && (!statusFilter || mentorTierGroup(mStatus, mDone) === statusFilter)
        && matchesPeriodFilter(m, year);
    })
    // Alphabetized by LAST name (matching the Print Report/CSV export's own "LastName, FirstName" convention)
    // even though the card itself still displays "First Last".
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)),
  [allMentors, activeSchool, searchLower, course, statusFilter, year, periodHistoryByUser]);
  const n = filtered.length;

  function viewDetail(id) {
    const school = activeSchool ? `&school=${encodeURIComponent(activeSchool)}` : '';
    navigate(`/admin/monitoring/detail?id=${id}${school}`);
  }

  // ── EXPORT ──
  function exportCSV() {
    if (!filtered.length) { showToast('No mentors to export.'); return; }
    // Same column set as Admin's own mentor export (ADMIN_/JS/sessions.js) — kept in sync on purpose.
    const header = ['Name', 'Department', 'School', 'Sections', 'Mentees',
                    'Completed Sessions', 'Required Sessions', 'Progress %',
                    'Performance Score', 'Timeliness %', 'Completeness %', 'Evaluation Rating %',
                    'Status'];
    const rows = filtered.map(m => [
      `${m.lastName || ''}, ${m.firstName || ''}`,
      m.departmentName    || '',
      m.school         || '',
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
    a.download = `mentor-progress-${(activeSchool || 'all').replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printProgressReport() {
    if (!filtered.length) { showToast('No mentors to print.'); return; }
    const school  = activeSchool || 'All Schools';
    const now     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const logoUrl = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;

    const tableRows = filtered.map((m, i) => {
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
  <div class="rpt-meta">${school} &nbsp;|&nbsp; Generated: ${now} &nbsp;|&nbsp; Total Mentors: ${filtered.length}</div>
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

  // ── Mentor List (row format) ──
  let mentorGrid;
  if (!loaded) {
    mentorGrid = <Empty className="empty-state" plainText="Loading mentors…"><span className="spinner"></span> Loading mentors…</Empty>;
  } else if (!n) {
    mentorGrid = <Empty className="empty-state">No mentors match the current filter.</Empty>;
  } else {
    mentorGrid = filtered.map(m => {
      const first = m.firstName || m.FirstName || '';
      const last = m.lastName || m.LastName || '';
      const inits = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
      const avIdx = avatarIdx(first + last);
      const dept = [m.departmentName, m.school].filter(Boolean).join(' · ') || '—';
      const done = m.completedSessions ?? m.CompletedSessions ?? 0;
      const status = mentorTierGroup(m.progressStatus, m.completedSessions);
      const sc = mcBadgeClass(status);
      const req = m.requiredSessions ?? m.RequiredSessions ?? 0;
      const id = m.mentorID || m.MentorID;
      const secTags = MentorSchools.courseTags(m.sections || m.Sections, activeSchool, course);

      return (
        <div className="mentor-card" key={id}>
          <div className="mrc-top">
            <div className={`mr-avatar av-${avIdx}`}>{inits}</div>
            <div className="mr-info">
              <div className="mr-name">{first} {last}</div>
              <div className="mr-dept">{dept}</div>
            </div>
          </div>
          <div className="mr-sections">{secTags.map((s, i) => <span className="mc-section-tag" key={i}>{s}</span>)}</div>
          <div className="mrc-footer">
            <div className="mr-badges">
              
              <span className={`mc-badge ${sc}`} style={{ fontSize: '12px' }}>{status}</span>
              <span className="mr-stat-badge">{m.completedSessions}/{m.requiredSessions} Sessions</span>
            </div>
            <button className="mr-view-btn" onClick={() => viewDetail(id)}>
              View Details
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      );
    });
  }

  const chipClass = (school, base) => `${base}${activeSchool === school ? ' active' : ''}`;

  return (
    <Page id="ADMIN_/sessions">
      <div className="main-wrapper">
        <main className="page-content">
          {/* Page Header */}
          <div className="page-header">
            <h1>Mentor Monitoring</h1>
            <p>Track mentoring progress and session attendance across all mentors</p>
          </div>
          {/* School filter chips — toggle, not a gate. */}
          <div className="school-landing">
            <div className="sl-grid monitoring-school-strip" role="region" aria-label="School summary cards" tabIndex={0}>
              <div className={chipClass("School of Technology", "sl-card sl-card--blue")} id="schoolChip-technology" onClick={() => toggleSchool("School of Technology")}>
                <div className="sl-icon-wrap sl-blue">
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div className="sl-content">
                  <div className="sl-name">School of Technology</div>
                  <div className="sl-meta">
                    <strong id="sotMentors">{cnt(schoolCounts["School of Technology"].mentors)}</strong>
                    {' '}
                    mentors ·
                    {' '}
                    <strong id="sotMentees">{cnt(schoolCounts["School of Technology"].mentees)}</strong>
                    {' '}
                    mentees
                  </div>
                  <div className="sl-dept-tags">
                    <span className="sl-dept-tag">COE</span>
                    {' '}
                    <span className="sl-dept-tag">CCIT</span>
                  </div>
                </div>
              </div>
              <div className={chipClass("School of Humanities", "sl-card sl-card--green")} id="schoolChip-humanities" onClick={() => toggleSchool("School of Humanities")}>
                <div className="sl-icon-wrap sl-green">
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </div>
                <div className="sl-content">
                  <div className="sl-name">School of Humanities</div>
                  <div className="sl-meta">
                    <strong id="sohMentors">{cnt(schoolCounts["School of Humanities"].mentors)}</strong>
                    {' '}
                    mentors ·
                    {' '}
                    <strong id="sohMentees">{cnt(schoolCounts["School of Humanities"].mentees)}</strong>
                    {' '}
                    mentees
                  </div>
                  <div className="sl-dept-tags">
                    <span className="sl-dept-tag">CASE</span>
                    <span className="sl-dept-tag">CHC</span>
                    <span className="sl-dept-tag">CCJ</span>
                  </div>
                </div>
              </div>
              <div className={chipClass("School of Management", "sl-card sl-card--amber")} id="schoolChip-management" onClick={() => toggleSchool("School of Management")}>
                <div className="sl-icon-wrap sl-amber">
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                </div>
                <div className="sl-content">
                  <div className="sl-name">School of Management</div>
                  <div className="sl-meta">
                    <strong id="somMentors">{cnt(schoolCounts["School of Management"].mentors)}</strong>
                    {' '}
                    mentors ·
                    {' '}
                    <strong id="somMentees">{cnt(schoolCounts["School of Management"].mentees)}</strong>
                    {' '}
                    mentees
                  </div>
                  <div className="sl-dept-tags">
                    <span className="sl-dept-tag">CBMA</span>
                    <span className="sl-dept-tag">CTHM</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Mentor list — combined across all schools by default. */}
          <div id="mentorView">
            {/* Mentors panel */}
            <div className="panel-header">
              <div>
                <span className="panel-title" id="mentorViewTitle">{activeSchool || 'All Schools'}</span>
                {' '}
                <span className="panel-count" id="mentorCount">{loaded ? `(${n})` : ''}</span>
              </div>
              <div className="panel-actions">
                <button className="btn-export" onClick={exportCSV} title="Download as CSV">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {' '}
                  Export CSV
                </button>
                {' '}
                <button className="btn-primary" onClick={printProgressReport} title="Open printable report">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  {' '}
                  Print Report
                </button>
              </div>
            </div>
            {/* Toolbar */}
            <div className="toolbar">
              <div className="search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {' '}
                <input type="text" id="searchInput" placeholder="Search mentors…" autoComplete="off" />
              </div>
              {<Select className="filter-select" id="statusFilter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All Statuses</option><option value="Not Started">Not Started</option><option value="Needs Attention">Needs Attention</option><option value="On Track">On Track</option><option value="Excellent">Excellent</option><option value="Pending">Pending</option></Select>}
              {' '}
              {<Select className="filter-select" id="courseFilter" value={course} onChange={e => setCourse(e.target.value)}><OptionGroups groups={courseOpts} /></Select>}
              {' '}
              {<Select className="filter-select" id="schoolYearFilter" value={year} onChange={e => setYear(e.target.value)}>{periodOptions ? periodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>) : <option value="">Current Semester</option>}</Select>}
            </div>
            {/* Mentor rows */}
            {<div className="mentor-list" id="mentorCardsGrid">{mentorGrid}</div>}
          </div>
          {/* end #mentorView */}
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
    </Page>
  );
}
