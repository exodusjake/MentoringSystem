import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import MentorSectionProgress from '../../components/MentorSectionProgress.jsx';
import { apiRequest } from '../../lib/api.js';
import { MentorSchools } from '../../lib/mentor-schools.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';
import { useTour } from '../../app/tour.js';
import { TOUR_SAMPLE } from '../../app/tourSample.js';

// HEAD/HTML/head-dashboard.html + HEAD/JS/dashboard.js

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Pending';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

const mentorsOf = data => (data && Array.isArray(data.mentors || data.Mentors)) ? (data.mentors || data.Mentors) : null;

const ALL_SCHOOLS = ['School of Technology', 'School of Humanities', 'School of Management'];
const SCHOOL_SUB = { 'School of Technology': 'SOT', 'School of Humanities': 'SOH', 'School of Management': 'SOM' };

// Shared by Mentor Performance and Mentee Engagement — proportioned colored segments; segments with 0
// count are skipped entirely rather than left as 0-width divs.
function segBar(total, segments) {
  if (!total) return null;
  return segments.filter(s => s.count > 0)
    .map((s, i) => <div key={i} style={{ width: `${(s.count / total * 100).toFixed(2)}%`, background: s.color }}></div>);
}

// Same 3 alerts and data sources as ADMIN_/JS/dashboard.js's renderSystemAlerts — alert 1 links to Mentor
// Monitoring, alert 3 links to Proof Tracking. Alert 2 has no link, since Head has no User Management page.
function computeAlerts(stats, monitorData) {
  const unavailable = { title: 'Unavailable', sub: 'See dashboard warning.', badge: 'Unavailable', badgeClass: 'alert-priority-badge' };
  const out = [
    { itemClass: 'alert-item red' },
    { itemClass: 'alert-item orange' },
    { itemClass: 'alert-item blue' },
  ];
  const s = stats || (monitorData ? {} : null);
  const m = monitorData || (stats ? { mentors: [] } : null);
  if (s && m) {
    const unassigned = s.unassigned ?? 0;
    const sessionsWoProof = s.sessionsWithoutProof ?? 0;
    // Grouped exactly like the Mentor Performance card (mentorTierGroup).
    const groups = (m?.mentors || m?.Mentors || []).map(x =>
      mentorTierGroup(x.progressStatus || x.ProgressStatus || 'Pending', x.completedSessions ?? x.CompletedSessions ?? 0));
    const notStarted = groups.filter(g => g === 'Not Started').length;
    const needsAttention = groups.filter(g => g === 'Needs Attention').length;
    const behind = notStarted + needsAttention;
    const pending = groups.filter(g => g === 'Pending').length;
    const set = (i, count, title, sub, label, cls, color) => {
      out[i] = {
        title, sub,
        badge: count > 0 ? label : 'All Clear',
        badgeClass: `alert-priority-badge ${count > 0 ? cls : 'all-clear'}`,
        itemClass: `alert-item ${count > 0 ? color : 'green'}`,
      };
    };
    set(0, behind, `${behind} mentor${behind !== 1 ? 's' : ''} need follow-up`,
      behind > 0 ? `(${notStarted} not started, ${needsAttention} need${needsAttention !== 1 ? '' : 's'} attention)` : (pending > 0 ? `${pending} Pending; performance not finalized` : 'No finalized mentors need follow-up'),
      'Urgent', 'urgent', 'red');
    set(1, unassigned, `${unassigned} unassigned mentee${unassigned !== 1 ? 's' : ''}`,
      unassigned > 0 ? 'Needs immediate assignment' : 'All mentees assigned', 'Warning', 'warning', 'orange');
    set(2, sessionsWoProof, `${sessionsWoProof} session${sessionsWoProof !== 1 ? 's' : ''} missing proof`,
      sessionsWoProof > 0 ? 'Completed sessions with no proof uploaded' : 'All completed sessions have proof', 'Review', 'review', 'blue');
  }
  // Shown instead of "All Clear" when an alert's data failed to load, so an outage doesn't look like good news.
  if (!stats) { out[1] = { ...out[1], ...unavailable }; out[2] = { ...out[2], ...unavailable }; }
  if (!monitorData) out[0] = { ...out[0], ...unavailable, itemClass: 'alert-item red' };
  return out;
}

// Same localStorage-backed "viewed" tracking as ADMIN_/JS/dashboard.js — keyed by user ID so different
// accounts on the same browser don't share "viewed" state.
function viewedActivitiesKey() {
  const session = getSession();
  const userId = session?.user?.UserID || session?.user?.userID;
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

// Icon + tint keyed off the activity description text — "uploaded ... proof" gets the upload icon,
// everything else (session completed, etc.) gets the calendar-check icon.
function ActivityIcon({ name }) {
  const isProof = /proof/i.test(name);
  const bg = isProof ? '#ede9fe' : '#dbeafe';
  const fg = isProof ? '#7c3aed' : '#2563eb';
  return (
    <div className="hd-activity-icon" style={{ background: bg, color: fg }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isProof
          ? <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>
          : <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></>}
      </svg>
    </div>
  );
}

function formatDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  const datePart = d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

const Unavailable = () => <span style={{ fontSize: '12px', opacity: 0.65 }}>Unavailable</span>;

export default function HeadDashboard() {
  useBackGuard();
  const wt = useTour().active;   // walkthrough: show sample data
  const navigate = useNavigate();
  const [data, setData] = useState(null);       // { stats, settings, activities, recent } once loaded
  const [viewed, setViewed] = useState(() => getViewedActivityIds());

  const dateStr = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  useEffect(() => {
    (async () => {
      try {
        const [stats, settings, activities, recent] = await Promise.all([
          apiRequest('Users/stats',       'GET', null, true).catch(() => null),
          apiRequest('Settings',          'GET', null, true).catch(() => ({})),
          apiRequest('MonitorActivities', 'GET', null, true).catch(() => null),
          apiRequest('Activities?top=25', 'GET', null, true).catch(() => null),
          MentorSchools.load(),
        ]);
        setData({ stats, settings, activities, recent });
      } catch (e) {
        console.error('Dashboard load error:', e);
      }
    })();
  }, []);

  const view = wt ? { stats: TOUR_SAMPLE.stats, settings: data?.settings || {}, activities: TOUR_SAMPLE.monitor, recent: TOUR_SAMPLE.activities } : data;
  const loaded = !!view;
  const { stats, settings, activities, recent } = view || {};
  const pulse = <span className="stat-pulse">—</span>;
  // setText(): a missing value shows an em dash
  const S = v => !loaded ? pulse : (v !== null && v !== undefined ? v : '—');

  // ── Academic Period ──
  const sy = settings?.SchoolYear || settings?.schoolYear || '—';
  const sem = settings?.Semester || settings?.semester || '—';
  const periodText = loaded ? `${sem}, S.Y. ${sy}` : 'Loading...';

  // ── Mentor Performance Breakdown ──
  // One pass over MonitorActivities' per-mentor list drives both the segmented bar and the 4 stat numbers.
  const mentors = mentorsOf(activities);
  let perf = null;
  if (mentors) {
    const counts = { 'Not Started': 0, 'Needs Attention': 0, 'On Track': 0, Excellent: 0, Pending: 0 };
    mentors.forEach(m => {
      const status = m.progressStatus || m.ProgressStatus || 'Pending';
      const done = m.completedSessions ?? m.CompletedSessions ?? 0;
      const group = mentorTierGroup(status, done);
      counts[Object.hasOwn(counts, group) ? group : 'Pending']++;
    });
    perf = { counts, total: mentors.length };
  }
  const perfDesc = !loaded ? 'Loading...' : !perf ? <Unavailable /> : (() => {
    const needsAttention = perf.counts['Needs Attention'];
    return `${perf.total} active mentor account${perf.total !== 1 ? 's' : ''} · ${needsAttention} need${needsAttention !== 1 ? '' : 's'} follow-up; ${perf.counts.Pending} Pending (performance unfinalized).`;
  })();
  const P = v => !loaded ? pulse : (perf ? v : '—');
  // Tier rows (share of mentors per tier) and the mentors most in need of follow-up — fills the card's lower half.
  const tierRows = perf ? [
    ['Not Started', 'var(--status-critical)'], ['Needs Attention', 'var(--status-behind)'], ['On Track', 'var(--status-on-track)'],
    ['Excellent', 'var(--status-excellent)'], ['Pending', '#6b7280'],
  ].map(([label, color]) => ({ label, color, count: perf.counts[label], pct: perf.total ? Math.round(perf.counts[label] / perf.total * 100) : 0 })) : [];
  const followUp = mentors ? mentors
    .map(m => ({ m, group: mentorTierGroup(m.progressStatus || m.ProgressStatus || 'Pending', m.completedSessions ?? m.CompletedSessions ?? 0) }))
    .filter(x => x.group === 'Not Started' || x.group === 'Needs Attention')
    .sort((a, b) => (a.m.overallPercent ?? a.m.OverallPercent ?? 0) - (b.m.overallPercent ?? b.m.OverallPercent ?? 0))
    .slice(0, 3) : [];
  const perfTitle = loaded && !perf ? 'Data unavailable' : undefined;

  // ── Mentee Engagement Breakdown ──
  let eng = null;
  if (stats) {
    const active = stats.activeMentees ?? 0;
    const assigned = stats.assigned ?? 0;
    const sd = stats.menteeStatusDistribution || {};
    eng = {
      active,
      inactive: Math.max(0, assigned - active),
      total: stats.totalMentees ?? 0,
      dropout: stats.droppedOut ?? 0,
      excellent: sd['Excellent'] ?? 0,
      onTrack: sd['OnTrack'] ?? 0,
      needsAttn: (sd['Behind'] ?? 0) + (sd['AtRisk'] ?? 0) + (sd['Critical'] ?? 0),
      noSessions: sd['NoSessions'] ?? 0,
    };
  }
  const E = v => !loaded ? pulse : (eng ? v : '—');
  const engTitle = loaded && !eng ? 'Data unavailable' : undefined;

  // ── System Alerts ──
  const alerts = loaded ? computeAlerts(stats, activities) : null;
  const showWarning = loaded && (!stats || !activities);
  const alertItem = (i, icon, link) => {
    const a = alerts ? alerts[i] : { itemClass: ['alert-item red', 'alert-item orange', 'alert-item blue'][i] };
    return (
      <div className={a.itemClass}>
        <div className="alert-icon">{icon}</div>
        <div className="alert-body">
          <div className="alert-title-row">
            <span className="alert-title" id={`alertTitle${i + 1}`}>{alerts ? a.title : <><span className="spinner"></span> Loading...</>}</span>{' '}
            <span className={a.badgeClass || 'alert-priority-badge'} id={`alertBadge${i + 1}`}>{alerts ? a.badge : ''}</span>
          </div>
          <div className="alert-sub" id={`alertSub${i + 1}`}>{alerts ? a.sub : ''}</div>
        </div>
        {link}
      </div>
    );
  };
  const alertsList = (
    <div className="alerts-list" id="alertsList">
      {alertItem(0,
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
        <Link to="/head/monitoring" className="alert-link">View Details</Link>)}
      {alertItem(1,
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>,
        null)}
      {alertItem(2,
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>,
        <Link to="/head/proofs" className="alert-link">View Details</Link>)}
    </div>
  );

  // ── Top 3 Mentors ──
  // Ranked by overallPercent (Timeliness 25% + Completeness 25% + Evaluation Rating 50%) — the same figure
  // that drives the status shown everywhere else. Mentors at exactly 0% are excluded.
  let top3 = <p style={{ color: '#9ca3af', fontSize: '13px', padding: '16px 24px' }}><span className="spinner"></span> Loading...</p>;
  if (loaded) {
    if (!mentors) top3 = <Unavailable />;
    else {
      const ranked = mentors
        .filter(m => (m.progressStatus || m.ProgressStatus || 'Pending') !== 'Pending'
          && (m.overallPercent ?? m.OverallPercent ?? 0) > 0)
        .sort((a, b) => {
          const pctA = a.overallPercent ?? a.OverallPercent ?? 0;
          const pctB = b.overallPercent ?? b.OverallPercent ?? 0;
          const doneA = a.completedSessions ?? a.CompletedSessions ?? 0;
          const doneB = b.completedSessions ?? b.CompletedSessions ?? 0;
          const menA = a.menteeCount ?? a.MenteeCount ?? 0;
          const menB = b.menteeCount ?? b.MenteeCount ?? 0;
          return pctB - pctA || doneB - doneA || menB - menA
            || `${a.lastName || ''}`.localeCompare(b.lastName || '');
        })
        .slice(0, 3);
      if (!ranked.length) {
        top3 = <Empty className="top3-empty">No finalized positive performance scores available. Session attendance alone does not finalize a grade; required reports may still be pending.</Empty>;
      } else {
        top3 = (
          <>
            {ranked.map((m, i) => {
              const first = m.firstName || m.FirstName || '';
              const last = m.lastName || m.LastName || '';
              const inits = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
              const dept = m.departmentName || m.DepartmentName || '—';
              const school = m.school || m.School || '';
              const pct = m.overallPercent ?? m.OverallPercent ?? 0;
              const id = m.mentorID || m.MentorID;
              return (
                <div className="top3-row" key={id ?? i} onClick={() => navigate(`/head/monitoring/detail?id=${id}`)}>
                  <div className={`top3-rank rank-${i + 1}`}>{i + 1}</div>
                  <div className="top3-avatar">{inits}</div>
                  <div className="top3-info">
                    <div className="top3-name">{first} {last}</div>
                    <div className="top3-dept">{dept}{school ? ` · ${school}` : ''}</div>
                  </div>
                  <div className="top3-progress">
                    <span className="top3-pct">{pct}%</span>
                    <span className="top3-score-label">Overall performance</span>
                  </div>
                  <MentorSectionProgress mentor={m} compact />
                </div>
              );
            })}
            {ranked.length < 3 ? <div className="top3-note">Fewer than three mentors have finalized positive performance scores.</div> : null}
          </>
        );
      }
    }
  }

  // ── Breakdown by School ──
  let schoolBreakdown = <p style={{ color: '#9ca3af', fontSize: '13px', padding: '16px 24px' }}><span className="spinner"></span> Loading...</p>;
  if (loaded) {
    if (!mentors) schoolBreakdown = <Unavailable />;
    else {
      // Seed all known schools at 0 so they always appear
      const emptyCounts = () => ({ Excellent: 0, 'On Track': 0, 'Needs Attention': 0, 'Not Started': 0, Pending: 0, total: 0 });
      const schools = {};
      ALL_SCHOOLS.forEach(name => { schools[name] = emptyCounts(); });

      // Grouped by the mentees' schools (mentor-schools.js): a mentor with mentees from two schools is
      // counted under both; one with no mentees falls back to their own school. A mentor with no school and
      // no mentees (e.g. a new SAS mentor) gets a row named after their department.
      mentors.forEach(m => {
        const status = m.progressStatus || m.ProgressStatus || 'Pending';
        const done = m.completedSessions ?? m.CompletedSessions ?? 0;
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
        });
      // Purely presentational — a 0 gets a quieter, muted treatment (class only).
      const dotStat = (count, color) =>
        <span className={`hd-dot-stat${count === 0 ? ' zero' : ''}`}><i className="hd-dot" style={{ background: color }}></i>{count}</span>;

      schoolBreakdown = (
        <>
          <div className="hd-school-head">
            <span>School</span><span>Distribution</span><span>Excellent</span><span>On Track</span><span>Needs Attention</span><span>Not Started</span><span>Pending</span><span>Total</span>
          </div>
          {rows.map(([school, c]) => (
            <div className="hd-school-row" key={school}>
              <div className="hd-school-info">
                <div className="hd-school-name">{school}</div>
                <div className="hd-school-sub">{SCHOOL_SUB[school] || ''}</div>
              </div>
              <div className="hd-school-bar">{c.total ? segBar(c.total, [
                { count: c['Not Started'], color: 'var(--status-critical)' },
                { count: c['Needs Attention'], color: 'var(--status-behind)' },
                { count: c['On Track'], color: 'var(--status-on-track)' },
                { count: c.Excellent, color: 'var(--status-excellent)' },
                { count: c.Pending, color: '#6b7280' },
              ]) : null}</div>
              {dotStat(c.Excellent, 'var(--status-excellent)')}
              {dotStat(c['On Track'], 'var(--status-on-track)')}
              {dotStat(c['Needs Attention'], 'var(--status-behind)')}
              {dotStat(c['Not Started'], 'var(--status-critical)')}
              {dotStat(c.Pending, '#6b7280')}
              <span className="hd-school-total">{c.total}</span>
            </div>
          ))}
        </>
      );
    }
  }

  // ── Recent Activities ──
  let recentList = <div className="activity-skeleton"><span className="spinner"></span> Loading activities...</div>;
  if (loaded) {
    if (recent && recent.length > 0) {
      const sorted = [...recent].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
      recentList = sorted.map((a, i) => {
        const dateStr2 = formatDate(a.createdAt || a.date || a.timestamp);
        const id = a.sessionID ?? a.SessionID;
        const name = a.description || a.title || 'Activity';
        const count = a.menteeCount;
        return (
          <div className={`activity-item${viewed.has(id) ? ' viewed' : ''}`} key={id ?? i} data-session-id={id ?? undefined}
            onClick={id != null ? () => { markActivityViewed(Number(id)); setViewed(getViewedActivityIds()); } : undefined}>
            <ActivityIcon name={name} />
            <div className="hd-activity-body">
              <div className="activity-header">
                <span className="activity-name">{name}</span>
                <span className="activity-time">{dateStr2}</span>
              </div>
              {count != null ? (
                <div className="activity-tags">
                  <span className="tag-mentees">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    {count} mentee{count !== 1 ? 's' : ''} present
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        );
      });
    } else {
      recentList = <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9ca3af', fontSize: '13px' }}>No recent activity to show.</div>;
    }
  }

  return (
    <Page id="HEAD/head-dashboard">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header hd-header-row">
            <div>
              <h1>Overview Dashboard</h1>
              <p id="dashDate">{dateStr}</p>
            </div>
            <div className="hd-period-pill">
              <div className="academic-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
              </div>
              <div>
                <div className="hd-period-label">Academic Period</div>
                <div className="hd-period-value" id="academicPeriod">{periodText}</div>
              </div>
            </div>
          </div>
          <div className="hd-dash-grid">
            <div className="hd-row hd-row-2">
              {/* Mentor Performance */}
              <div className="card hd-performance-card">
                <div className="card-header">
                  <div>
                    <h2>Mentor Performance</h2>
                    <p className="hd-card-sub" id="progressChartDesc">{perfDesc}</p>
                  </div>
                  <div className="dash-tip-wrap">
                    <i className="ti ti-alert-circle dash-tip-icon"></i>
                    <div className="dash-tip-box">
                      <div className="dash-tip-title">Overall Performance Levels</div>
                      <div className="dash-tip-row">Overall score: Timeliness (25%) + Completeness (25%) + Evaluation Rating (50%).</div>
                      <div className="dash-tip-row">
                        <strong style={{ color: "#22c55e" }}>■</strong>
                        {' '}
                        <strong>Excellent</strong>
                        {' '}
                        — ≥80%
                      </div>
                      <div className="dash-tip-row">
                        <strong style={{ color: "#3b82f6" }}>■</strong>
                        {' '}
                        <strong>On Track</strong>
                        {' '}
                        — 50–79%
                      </div>
                      <div className="dash-tip-row">
                        <strong style={{ color: "#f97316" }}>■</strong>
                        {' '}
                        <strong>Needs Attention</strong>
                        {' '}
                        — overall score below 50%, with at least one completed session
                      </div>
                      <div className="dash-tip-row">
                        <strong style={{ color: "#dc2626" }}>■</strong>
                        {' '}
                        <strong>Not Started</strong>
                        {' '}
                        — no completed sessions and overall score below 50%
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hd-card-body">
                  <div className="hd-seg-bar" id="mentorSegBar">
                    {perf ? segBar(perf.total, [{ count: perf.counts["Not Started"], color: "var(--status-critical)" }, { count: perf.counts["Needs Attention"], color: "var(--status-behind)" }, { count: perf.counts["On Track"], color: "var(--status-on-track)" }, { count: perf.counts.Excellent, color: "var(--status-excellent)" }, { count: perf.counts.Pending, color: "#6b7280" }]) : null}
                  </div>
                  <div className="hd-stat-row hd-performance-stats">
                    <Link to="/head/monitoring?status=Not%20Started" className="hd-stat" title="View Not Started mentors">
                      <span className="hd-stat-num notstarted" id="mNotStarted" title={perfTitle}>{P(perf?.counts["Not Started"])}</span>
                      <span className="hd-stat-label">Not Started</span>
                    </Link>
                    {' '}
                    <Link to="/head/monitoring?status=Needs%20Attention" className="hd-stat" title="View mentors needing attention">
                      <span className="hd-stat-num needsattention" id="mNeedsAttention" title={perfTitle}>{P(perf?.counts["Needs Attention"])}</span>
                      <span className="hd-stat-label">Needs Attention</span>
                    </Link>
                    {' '}
                    <Link to="/head/monitoring?status=On%20Track" className="hd-stat" title="View On Track mentors">
                      <span className="hd-stat-num ontrack" id="mOnTrack" title={perfTitle}>{P(perf?.counts["On Track"])}</span>
                      <span className="hd-stat-label">On Track</span>
                    </Link>
                    {' '}
                    <Link to="/head/monitoring?status=Excellent" className="hd-stat" title="View Excellent mentors">
                      <span className="hd-stat-num excellent" id="mExcellent" title={perfTitle}>{P(perf?.counts.Excellent)}</span>
                      <span className="hd-stat-label">Excellent</span>
                    </Link>
                    <div className="hd-stat" title="No session deadline has passed yet, so no score">
                      <span className="hd-stat-num pending" id="mPending" title={perfTitle}>{P(perf?.counts.Pending)}</span>
                      <span className="hd-stat-label">Pending</span>
                    </div>
                  </div>
                  {perf ? (
                    <div className="hd-tier-list">
                      {tierRows.map(t => (
                        <div className="hd-tier-row" key={t.label}>
                          <i className="hd-dot" style={{ background: t.color }}></i>
                          <span className="hd-tier-label">{t.label}</span>
                          <div className="hd-tier-track"><div style={{ width: `${t.pct}%`, background: t.color }}></div></div>
                          <span className="hd-tier-pct">{t.pct}%</span>
                          <span className="hd-tier-count">{t.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {perf ? (
                    <div className="hd-followup">
                      <div className="hd-followup-title">Needs follow-up</div>
                      {followUp.length ? followUp.map(({ m, group }, i) => {
                        const first = m.firstName || m.FirstName || '';
                        const last = m.lastName || m.LastName || '';
                        const id = m.mentorID || m.MentorID;
                        const pct = m.overallPercent ?? m.OverallPercent ?? 0;
                        return (
                          <Link className="hd-followup-row" key={id ?? i} to={`/head/monitoring/detail?id=${id}`}>
                            <span className="top3-avatar">{((first[0] || '') + (last[0] || '')).toUpperCase() || '?'}</span>
                            <span className="hd-followup-name">{first} {last}</span>
                            <span className="hd-followup-tag">{group}</span>
                            <span className="hd-followup-pct">{pct}%</span>
                          </Link>
                        );
                      }) : <div className="hd-followup-empty">No mentors need follow-up right now.</div>}
                    </div>
                  ) : null}
                </div>
                <div className="engagement-total">
                  <span>Total Mentors</span>
                  {' '}
                  <span id="totalMentors" title={perfTitle}>{P(perf?.total)}</span>
                </div>
              </div>
              {/* System Alerts */}
              <div className="card alerts-card">
                <div className="card-header">
                  <div>
                    <h2>System Alerts</h2>
                    <p className="hd-card-sub">Priority-ordered notifications requiring action.</p>
                  </div>
                  <div className="dash-tip-wrap">
                    <i className="ti ti-alert-circle dash-tip-icon"></i>
                    <div className="dash-tip-box">
                      <div className="dash-tip-title">Priority Levels</div>
                      <div className="dash-tip-row">
                        <strong>Urgent</strong>
                        {' '}
                        — requires immediate action
                      </div>
                      <div className="dash-tip-row">
                        <strong>Warning</strong>
                        {' '}
                        — follow up soon
                      </div>
                      <div className="dash-tip-row">
                        <strong>Review</strong>
                        {' '}
                        — audit recommended
                      </div>
                      <div className="dash-tip-row">
                        <strong>All Clear</strong>
                        {' '}
                        — no action needed
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card-body">{alertsList}</div>
              </div>
            </div>
            <div className="hd-row hd-row-3">
              {/* Mentee Engagement */}
              <div className="card hd-eng-card">
                <div className="card-header">
                  <h2>Mentee Engagement</h2>
                  <div className="dash-tip-wrap">
                    <i className="ti ti-alert-circle dash-tip-icon"></i>
                    <div className="dash-tip-box">
                      <div className="dash-tip-title">Attendance This Semester</div>
                      <div className="dash-tip-row">
                        <strong>Attended</strong>
                        {' '}
                        — currently assigned, non-dropout mentees with attendance at one or more completed sessions this semester
                      </div>
                      <div className="dash-tip-row">
                        <strong>No attendance</strong>
                        {' '}
                        — currently assigned, non-dropout mentees with no attendance at completed sessions this semester
                      </div>
                      <div className="dash-tip-title">Attendance Levels</div>
                      <div className="dash-tip-row">
                        <strong>Excellent</strong>
                        {' '}
                        — ≥80% of completed sessions attended
                      </div>
                      <div className="dash-tip-row">
                        <strong>On Track</strong>
                        {' '}
                        — 60–79% of completed sessions attended
                      </div>
                      <div className="dash-tip-row">
                        <strong>Needs Attention</strong>
                        {' '}
                        — below 60% of completed sessions attended
                      </div>
                      <div className="dash-tip-row">
                        <strong>No Completed Sessions</strong>
                        {' '}
                        — no completed sessions this semester
                      </div>
                      <div className="dash-tip-row" style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #334155", fontSize: "11.5px", color: "#94a3b8" }}>Unassigned and dropped-out mentees are not included in these attendance counts.</div>
                    </div>
                  </div>
                </div>
                <div className="hd-card-body">
                  <div className="hd-stat-row hd-stat-row-2">
                    <div className="hd-stat hd-stat--green">
                      <span className="hd-stat-num active" id="engActive" title={engTitle}>{E(eng?.active)}</span>
                      <span className="hd-stat-label">Attended this semester</span>
                    </div>
                    <div className="hd-stat hd-stat--gray">
                      <span className="hd-stat-num inactive" id="engInactive" title={engTitle}>{E(eng?.inactive)}</span>
                      <span className="hd-stat-label">No attendance this semester</span>
                    </div>
                  </div>
                  <div className="hd-seg-bar" id="menteeSegBar">
                    {eng ? segBar(eng.excellent + eng.onTrack + eng.needsAttn + eng.noSessions, [{ count: eng.excellent, color: "#16a34a" }, { count: eng.onTrack, color: "#1d4ed8" }, { count: eng.needsAttn, color: "#ea580c" }, { count: eng.noSessions, color: "#dc2626" }]) : null}
                  </div>
                </div>
                <div className="eng-breakdown hd-dot-breakdown">
                  <div className="eng-breakdown-list">
                    <div className="hd-dot-row">
                      <i className="hd-dot excellent"></i>
                      <span className="hd-dot-label">Excellent</span>
                      <span className="hd-dot-val" id="engExcellent" title={engTitle}>{E(eng?.excellent)}</span>
                    </div>
                    <div className="hd-dot-row">
                      <i className="hd-dot on-track"></i>
                      <span className="hd-dot-label">On Track</span>
                      <span className="hd-dot-val" id="engOnTrack" title={engTitle}>{E(eng?.onTrack)}</span>
                    </div>
                    <div className="hd-dot-row">
                      <i className="hd-dot needs-attention"></i>
                      <span className="hd-dot-label">Needs Attention</span>
                      <span className="hd-dot-val" id="engNeedsAttn" title={engTitle}>{E(eng?.needsAttn)}</span>
                    </div>
                    <div className="hd-dot-row">
                      <i className="hd-dot no-sessions"></i>
                      <span className="hd-dot-label">No Completed Sessions</span>
                      <span className="hd-dot-val" id="engNoSessions" title={engTitle}>{E(eng?.noSessions)}</span>
                    </div>
                  </div>
                </div>
                <div className="engagement-total hd-total-split">
                  <span>
                    <span>Total</span>
                    {' '}
                    <strong id="totalMentees" title={engTitle}>{E(eng?.total)}</strong>
                  </span>
                  {' '}
                  <span className="hd-dropped-pill">
                    <i className="ti ti-user-x"></i>
                    {' '}
                    Dropped
                    {' '}
                    <strong id="totalDropout" title={engTitle}>{E(eng?.dropout)}</strong>
                  </span>
                </div>
              </div>
              {/* Top 3 Mentors */}
              <div className="card hd-eng-card top3-card">
                <div className="card-header">
                  <div>
                    <h2>Top 3 Mentors</h2>
                    <p className="hd-card-sub">Current period performance</p>
                  </div>
                  <div className="dash-tip-wrap">
                    <i className="ti ti-alert-circle dash-tip-icon"></i>
                    <div className="dash-tip-box">
                      <div className="dash-tip-title">Ranked by</div>
                      <div className="dash-tip-row">
                        Timeliness (25%) + Completeness (25%) + Evaluation Rating (50%) — the same weighted score behind the Excellent/On Track/Behind/Critical status shown elsewhere on this page. Mentors with 0% score aren't ranked yet.
                      </div>
                    </div>
                  </div>
                </div>
                <div id="top3List" className="top3-list">{top3}</div>
                <div className="card-view-footer">
                  <Link to="/head/report" className="card-view-link">
                    View full ranking
                    {' '}
                    <i className="ti ti-arrow-right"></i>
                  </Link>
                </div>
              </div>
              {/* Recent Activities */}
              <div className="card recent-card hd-eng-card">
                <div className="card-header">
                  <h2>Recent Activities</h2>
                </div>
                <div className="activity-list" id="recentActivities">{recentList}</div>
              </div>
            </div>
            <div className="hd-row hd-row-1">
              {/* Breakdown by School */}
              <div className="card card--tip-overflow">
                <div className="card-header">
                  <div>
                    <h2>Breakdown by School</h2>
                    <p className="hd-card-sub">Mentor overall-performance distribution by school</p>
                  </div>
                  <div className="dash-tip-wrap dash-tip-wrap--up">
                    <i className="ti ti-alert-circle dash-tip-icon"></i>
                    <div className="dash-tip-box">
                      <div className="dash-tip-title">About this table</div>
                      <div className="dash-tip-row">
                        Groups active mentors by assigned school and shows their overall-performance tier. Schools with no active mentors show 0 across all columns.
                      </div>
                      <div className="dash-tip-title">Use this to</div>
                      <div className="dash-tip-row">
                        Quickly identify which school has the most mentors in the Needs Attention tier and needs follow-up.
                      </div>
                    </div>
                  </div>
                </div>
                <div id="schoolBreakdown">{schoolBreakdown}</div>
              </div>
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
    </Page>
  );
}
