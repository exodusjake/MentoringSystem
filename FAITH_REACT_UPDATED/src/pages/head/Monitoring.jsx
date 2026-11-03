import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import PagedPanel from '../../components/PagedPanel.jsx';
import Empty from '../../components/Empty.jsx';
import { showToast } from '../../components/Notify.jsx';
import OptionGroups from '../../components/OptionGroups.jsx';
import Select from '../../components/Select.jsx';
import Overlay from '../../components/Overlay.jsx';
import { CSS as CONCERN_CSS } from '../../components/RaiseConcern.jsx';
import { useStyle } from '../../lib/injectStyle.js';
import { apiRequest } from '../../lib/api.js';
import { isPastPeriod } from '../../lib/periods.js';
import { MentorSchools } from '../../lib/mentor-schools.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// HEAD/HTML/mentor-performance.html + HEAD/JS/mentor-performance.js

// "Raise a concern": the Head picks mentors (all start selected, circle on each card to unselect) and sends one message
// to them: their notification bell and email.
const CONCERN_MIN = 10, CONCERN_MAX = 500;
const CONCERN_CATEGORIES = ['Low session progress', 'Late logsheet or proof', 'Attendance concern', 'Conduct or professionalism', 'Follow-up or reminder', 'Other'];
const SELECT_CSS = [
  '.mentor-card.mc-selectable{position:relative;cursor:pointer}',
  '.mentor-card.mc-selectable.mc-picked{box-shadow:0 0 0 2px #2563eb,0 6px 18px rgba(37,99,235,.15)}',
  '.mc-pick{position:absolute;top:10px;right:10px;z-index:2;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;background:#fff;border:2px solid #cbd5e1;border-radius:50%;pointer-events:none}',
  '.mc-picked .mc-pick{background:#2563eb;border-color:#2563eb}',
  '.mc-pickbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:0 0 14px;padding:12px 16px;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;font-size:14px;font-weight:600}',
  '.mc-pickbar .mc-pickbar-count{flex:1;min-width:150px}',
  '.mc-pickbar button{font:inherit;font-size:13px;font-weight:700;border-radius:10px;padding:8px 14px;cursor:pointer}',
  '.mc-pickbar .mc-link{color:#1d4ed8;background:transparent;border:none}',
  '.mc-pickbar .mc-cancel{color:#374151;background:#fff;border:1px solid #d1d5db}',
  '.mc-pickbar .mc-send{color:#fff;background:#dc2626;border:none}.mc-pickbar .mc-send:disabled{opacity:.5;cursor:not-allowed}',
].join('');

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

export default function HeadMonitoring() {
  useBackGuard();
  const navigate = useNavigate();
  useStyle('raise-concern', CONCERN_CSS);
  useStyle('monitor-select', SELECT_CSS);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [concernOpen, setConcernOpen] = useState(false);
  const [concernCategory, setConcernCategory] = useState('');
  const [concernMsg, setConcernMsg] = useState('');
  const [concernBusy, setConcernBusy] = useState(false);
  const [concernError, setConcernError] = useState('');
  const [params] = useSearchParams();

  // Deep-link from the Dashboard's Mentor Performance stat cells (set before the first render comes in filtered).
  const [statusFilter, setStatusFilter] = useState(() => params.get('status') || '');
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');
  const [accountStatus, setAccountStatus] = useState('active');
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
        setPeriodOptions([
          { value: '', label: `${settings.Semester}, SY ${settings.SchoolYear} (Current)` },
          ...periods.filter(p => isPastPeriod(p, settings)).map(p => ({ value: p.key, label: `${p.semester}, SY ${p.schoolYear}` })),
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
      if (accountStatus === 'active') return activeOnly;
      const data = await apiRequest('MonitorActivities?includeInactive=true', 'GET', null, true);
      return data?.mentors || data?.Mentors || [];
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
  }, [year, accountStatus, loaded]);

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
      return (accountStatus === 'all' || ((m.isActive ?? m.IsActive) !== false) === (accountStatus === 'active'))
        && MentorSchools.inSchool(m, activeSchool)
        && (!searchLower || name.includes(searchLower))
        && MentorSchools.inCourse(m, course)
        && (!statusFilter || mentorTierGroup(mStatus, mDone) === statusFilter)
        && matchesPeriodFilter(m, year);
    })
    // Alphabetized by LAST name (matching the Print Report/CSV export's own "LastName, FirstName" convention)
    // even though the card itself still displays "First Last".
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)),
  [allMentors, accountStatus, activeSchool, searchLower, course, statusFilter, year, periodHistoryByUser]);
  const n = filtered.length;

  function viewDetail(id) {
    const school = activeSchool ? `&school=${encodeURIComponent(activeSchool)}` : '';
    navigate(`/head/monitoring/detail?id=${id}${school}`);
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

  // Same shape as Admin's own printProgressReport (ADMIN_/JS/sessions.js) — same columns, same stat boxes, same
  // teal FAITH branding. Head is read-only, not "less detail", so this stays in sync with Admin's on purpose.
  function printReport() {
    if (!filtered.length) { showToast('No mentors to print.'); return; }
    const school  = activeSchool || 'All Schools';
    const now     = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const logoUrl = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;

    const rows = filtered.map((m, i) => {
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
  <div class="rpt-meta">${school} &nbsp;|&nbsp; Generated by Head Admin: ${now} &nbsp;|&nbsp; Total Mentors: ${filtered.length}</div>
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

  const idOf = m => m.mentorID || m.MentorID;
  const visiblePicked = filtered.filter(m => picked.has(idOf(m)));
  function startSelecting() { setPicked(new Set(filtered.map(idOf))); setSelecting(true); }
  function stopSelecting() { setSelecting(false); setPicked(new Set()); }
  function togglePick(id) { setPicked(p => { const x = new Set(p); x.has(id) ? x.delete(id) : x.add(id); return x; }); }
  const concernTrimmed = concernMsg.trim();
  const concernValid = !!concernCategory && concernTrimmed.length >= CONCERN_MIN && concernTrimmed.length <= CONCERN_MAX;

  async function sendConcern() {
    if (!concernValid || concernBusy || !visiblePicked.length) return;
    setConcernBusy(true); setConcernError('');
    try {
      const res = await apiRequest('HeadConcerns', 'POST', { mentorIds: visiblePicked.map(idOf), category: concernCategory, message: concernTrimmed }, true);
      showToast(res?.message || 'Your concern was sent.', 'success');
      setConcernOpen(false); setConcernMsg(''); setConcernCategory(''); stopSelecting();
    } catch (e) {
      setConcernError(e.message || 'Could not send the concern. Please try again.');
    } finally { setConcernBusy(false); }
  }

  // ── Mentor List (row format) ──
  let mentorGrid = null, mentorMsg = null;
  if (!loaded) {
    mentorMsg = <Empty className="empty-state" plainText="Loading mentors…"><span className="spinner"></span> Loading mentors…</Empty>;
  } else if (!n) {
    mentorMsg = <Empty className="empty-state">No mentors match the current filters.</Empty>;
  } else {
    mentorGrid = filtered.map(m => {
      const first = m.firstName || m.FirstName || '';
      const last = m.lastName || m.LastName || '';
      const inits = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
      const avIdx = avatarIdx(first + last);
      const dept = [m.departmentName || m.DepartmentName, m.school || m.School].filter(Boolean).join(' · ') || '—';
      const done = m.completedSessions ?? m.CompletedSessions ?? 0;
      const status = mentorTierGroup(m.progressStatus || m.ProgressStatus || 'Critical', done);
      const sc = mcBadgeClass(status);
      const req = m.requiredSessions ?? m.RequiredSessions ?? 0;
      const id = m.mentorID || m.MentorID;
      const secTags = MentorSchools.courseTags(m.sections || m.Sections, activeSchool, course);

      return (
        <div className={`mentor-card${selecting ? ' mc-selectable' : ''}${selecting && picked.has(id) ? ' mc-picked' : ''}`} key={id}
          onClick={selecting ? () => togglePick(id) : undefined}>
          {selecting ? <span className="mc-pick" aria-hidden="true"><i className="ti ti-check"></i></span> : null}
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
              {(m.isActive ?? m.IsActive) === false ? <span className="mr-stat-badge" title="Login disabled; records retained">Deactivated</span> : null}
              <span className={`mc-badge ${sc}`} style={{ fontSize: '12px' }}>{status}</span>
              <span className="mr-stat-badge">{done}/{req} Sessions</span>
            </div>
            <button className="mr-view-btn" onClick={e => { if (selecting) { e.stopPropagation(); togglePick(id); return; } viewDetail(id); }}>
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
    <Page id="HEAD/mentor-performance">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>Mentor Monitoring</h1>
            <p>Read-only overview of all mentor session progress across all schools</p>
          </div>
          {/* School filter chips — toggle, not a gate. */}
          <div className="school-landing">
            <div className="sl-grid monitoring-school-strip" role="region" aria-label="School summary cards" tabIndex={0}>
              <div className={chipClass("School of Technology", "sl-card sl-card--blue")} id="schoolChip-technology" onClick={() => toggleSchool("School of Technology")}>
                <div className="sl-icon-wrap sl-blue">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          {/* Mentor List — combined across all schools by default. */}
          <div id="mentorView">
            <div className="panel-header">
              <div>
                <span className="panel-title" id="mentorViewTitle">{activeSchool || 'All Schools'}</span>
                {' '}
                <span className="panel-count" id="mentorCount">{loaded ? `(${n})` : ''}</span>
              </div>
              <div className="panel-actions">
                <button className="btn-export" onClick={selecting ? stopSelecting : startSelecting} title="Pick mentors and raise a concern with them">
                  <i className="ti ti-flag"></i>
                  {' '}
                  {selecting ? 'Cancel selection' : 'Raise Concern'}
                </button>
                {' '}
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
                <button className="btn-primary" onClick={printReport} title="Open printable report">
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
            <div className="toolbar">
              <div className="search-box" style={{ flex: "1", minWidth: "200px" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {' '}
                <input type="text" id="mentorSearch" placeholder="Search mentor name…" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {<Select className="filter-select" id="courseFilter" value={course} onChange={e => setCourse(e.target.value)}><OptionGroups groups={courseOpts} /></Select>}
              {' '}
              {<Select className="filter-select" id="accountStatusFilter" aria-label="Account status" value={accountStatus} onChange={e => setAccountStatus(e.target.value)}><option value="active">Active Accounts</option><option value="inactive">Deactivated Accounts</option><option value="all">All Accounts</option></Select>}
              {' '}
              {<Select className="filter-select" id="statusFilter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All Progress Statuses</option><option value="Excellent">Excellent</option><option value="On Track">On Track</option><option value="Needs Attention">Needs Attention</option><option value="Not Started">Not Started</option><option value="Pending">Pending</option></Select>}
              {' '}
              {<Select className="filter-select" id="schoolYearFilter" value={year} onChange={e => setYear(e.target.value)}>{periodOptions ? periodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>) : <option value="">Current Semester</option>}</Select>}
            </div>
            {selecting ? (
              <div className="mc-pickbar">
                <span className="mc-pickbar-count">{visiblePicked.length} of {n} mentor{n === 1 ? '' : 's'} selected</span>
                <button type="button" className="mc-link" onClick={() => setPicked(new Set(filtered.map(idOf)))}>Select all</button>
                <button type="button" className="mc-link" onClick={() => setPicked(new Set())}>Unselect all</button>
                <button type="button" className="mc-cancel" onClick={stopSelecting}>Cancel</button>
                <button type="button" className="mc-send" disabled={!visiblePicked.length} onClick={() => { setConcernError(''); setConcernOpen(true); }}>
                  <i className="ti ti-flag"></i> Raise concern
                </button>
              </div>
            ) : null}
            {<PagedPanel items={mentorGrid} message={mentorMsg} gridClass="mentor-list" gridId="mentorGrid" unit="mentors" storageKey="pp-monitor" />}
          </div>
        </main>
        <Overlay open={concernOpen} className="rc-overlay" activeClass={null} display="flex" onClick={e => { if (e.target === e.currentTarget && !concernBusy) setConcernOpen(false); }}>
          <div className="rc-modal" role="dialog" aria-modal="true" aria-labelledby="hcTitle">
            <div className="rc-head">
              <div className="rc-head-icon"><i className="ti ti-flag"></i></div>
              <div className="rc-head-text">
                <div className="rc-title" id="hcTitle">Raise a concern</div>
                <div className="rc-sub">To {visiblePicked.length} mentor{visiblePicked.length === 1 ? '' : 's'}, by notification and email</div>
              </div>
              <button type="button" className="rc-close" onClick={() => setConcernOpen(false)} disabled={concernBusy} aria-label="Close">&times;</button>
            </div>
            <div className="rc-body">
              <label className="rc-label" htmlFor="hcCategory">What is this about?</label>
              <div className="rc-gap">
                <Select id="hcCategory" value={concernCategory} onChange={e => setConcernCategory(e.target.value)} disabled={concernBusy}>
                  <option value="" disabled>Choose...</option>
                  {CONCERN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <label className="rc-label" htmlFor="hcMessage">Your message</label>
              <textarea id="hcMessage" className="rc-text" maxLength={CONCERN_MAX} disabled={concernBusy} placeholder="Describe the concern..."
                value={concernMsg} onChange={e => setConcernMsg(e.target.value)} />
              <div className={`rc-count${concernTrimmed.length > 0 && concernTrimmed.length < CONCERN_MIN ? ' short' : ''}`}>
                {concernTrimmed.length < CONCERN_MIN ? `At least ${CONCERN_MIN} characters · ` : ''}{concernMsg.length}/{CONCERN_MAX}
              </div>
              {concernError ? <div className="rc-error" role="alert">{concernError}</div> : null}
            </div>
            <div className="rc-foot">
              <button type="button" className="rc-cancel" onClick={() => setConcernOpen(false)} disabled={concernBusy}>Cancel</button>
              <button type="button" className="rc-send" onClick={sendConcern} disabled={!concernValid || concernBusy}>{concernBusy ? 'Sending...' : 'Send concern'}</button>
            </div>
          </div>
        </Overlay>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
    </Page>
  );
}
