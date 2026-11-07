import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import MentorSectionProgress from '../../components/MentorSectionProgress.jsx';
import { apiRequest, swrRequest } from '../../lib/api.js';
import { loadScript } from '../../lib/loadScript.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';
import { useTour } from '../../app/tour.js';
import { TOUR_SAMPLE } from '../../app/tourSample.js';

// ADMIN_/HTML/dashboard.html + ADMIN_/JS/dashboard.js

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Pending';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}
const mentorsOf = d => (d && Array.isArray(d.mentors || d.Mentors)) ? (d.mentors || d.Mentors) : null;

function computeAlerts(stats, monitorData) {
  const unavailable = { title: 'Unavailable', sub: 'See dashboard warning.', badge: 'Unavailable', badgeClass: 'alert-priority-badge' };
  const out = [{ itemClass: 'alert-item red' }, { itemClass: 'alert-item orange' }, { itemClass: 'alert-item blue' }];
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
      out[i] = { title, sub, badge: count > 0 ? label : 'All Clear', badgeClass: `alert-priority-badge ${count > 0 ? cls : 'all-clear'}`, itemClass: `alert-item ${count > 0 ? color : 'green'}` };
    };
    // The tier uses the overall performance score, not timeliness alone.
    set(0, behind, `${behind} mentor${behind !== 1 ? 's' : ''} need follow-up`,
      behind > 0 ? `(${notStarted} not started, ${needsAttention} need${needsAttention !== 1 ? '' : 's'} attention)` : (pending > 0 ? `${pending} Pending; performance not finalized` : 'No finalized mentors need follow-up'),
      'Urgent', 'urgent', 'red');
    set(1, unassigned, `${unassigned} unassigned mentee${unassigned !== 1 ? 's' : ''}`,
      unassigned > 0 ? 'Needs immediate assignment' : 'All mentees assigned', 'Warning', 'warning', 'orange');
    set(2, sessionsWoProof, `${sessionsWoProof} session${sessionsWoProof !== 1 ? 's' : ''} missing proof`,
      sessionsWoProof > 0 ? 'All-time completed sessions with no proof uploaded' : 'All completed sessions have proof', 'Review', 'review', 'blue');
  }
  // Shown instead of "All Clear" when an alert's data failed to load.
  if (!stats) { out[1] = { ...out[1], ...unavailable }; out[2] = { ...out[2], ...unavailable }; }
  if (!monitorData) out[0] = { ...out[0], ...unavailable, itemClass: 'alert-item red' };
  return out;
}

// Keyed by user ID so different accounts on the same browser don't share "viewed" state.
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
function formatDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  const datePart = d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}
const Unavailable = () => <span style={{ fontSize: '12px', opacity: 0.65 }}>Unavailable</span>;

export default function AdminDashboard() {
  useBackGuard();
  const wt = useTour().active;   // walkthrough: show sample data
  const navigate = useNavigate();
  const [data, setData] = useState(null);                 // { users, stats, monitor } once loaded
  const [activities, setActivities] = useState(undefined); // undefined = still loading
  const [period, setPeriod] = useState(null);
  const [viewed, setViewed] = useState(() => getViewedActivityIds());
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const dateStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    // Both the header chip and the Total Mentors chart card's badge read the live Settings period.
    (async () => {
      try {
        const settings = await apiRequest('Settings', 'GET', null, true);
        const sy = settings?.SchoolYear || settings?.schoolYear || '—';
        const sem = settings?.Semester || settings?.semester || '—';
        setPeriod(`${sem} · S.Y. ${sy}`);
        try { localStorage.setItem('astraPeriod', JSON.stringify({ sem, sy })); } catch (e) {}
      } catch (e) {
        // Request failed: show the last known period instead of an endless "Loading…".
        let last = null;
        try { last = JSON.parse(localStorage.getItem('astraPeriod')); } catch (e2) {}
        setPeriod(last ? `${last.sem} · S.Y. ${last.sy}` : '— · S.Y. —');
      }
    })();
    // Each part paints from the saved copy of the last visit straight away, then updates when fresh data arrives.
    // A failed refresh keeps what is shown; with nothing shown it becomes null ("Unavailable").
    const parts = {};
    const part = (key, endpoint) => swrRequest(endpoint, d => {
      parts[key] = d;
      if ('users' in parts && 'stats' in parts && 'monitor' in parts) setData({ users: parts.users, stats: parts.stats, monitor: parts.monitor });
    }).catch(() => {
      if (!(key in parts)) {
        parts[key] = null;
        if ('users' in parts && 'stats' in parts && 'monitor' in parts) setData({ users: parts.users, stats: parts.stats, monitor: parts.monitor });
      }
    });
    part('users', 'Users');
    part('stats', 'Users/stats');
    part('monitor', 'MonitorActivities');
    // Fetch more than the visible ~5 rows so scrolling the card actually reveals more.
    swrRequest('Activities?top=25', setActivities).catch(() => setActivities(prev => prev === undefined ? null : prev));
  }, []);

  const view = wt ? TOUR_SAMPLE.adminData : data;
  const loaded = !!view;
  const { users, stats, monitor } = view || {};
  const pulse = <span className="stat-pulse">—</span>;
  const mentors = mentorsOf(monitor);

  // ── Stat cards ──
  const S = (v, ok) => !loaded ? pulse : (ok ? v : '—');
  const statTitle = loaded && !stats ? 'Data unavailable' : undefined;
  const statMentors = stats ? (stats.totalMentors ?? (users || []).filter(u => (u.role || u.Role) === 'Mentor').length) : null;
  const statMentees = stats ? (stats.totalMentees ?? (users || []).filter(u => (u.role || u.Role) === 'Mentee').length) : null;
  const statMenteesSub = !loaded ? '— unassigned · — dropped out' : !stats ? <Unavailable /> : `${stats.unassigned ?? 0} unassigned · ${stats.droppedOut ?? 0} dropped out`;

  // ── Engagement ──
  let eng = null;
  if (stats) {
    const sd = stats.menteeStatusDistribution || {};
    const activeMentees = stats.activeMentees ?? 0;
    eng = {
      active: activeMentees, inactive: Math.max(0, (stats.assigned ?? 0) - activeMentees), unassigned: stats.unassigned ?? 0, total: stats.totalMentees ?? 0,
      excellent: sd['Excellent'] ?? 0, onTrack: sd['OnTrack'] ?? 0,
      needsAttention: (sd['Behind'] ?? 0) + (sd['AtRisk'] ?? 0) + (sd['Critical'] ?? 0), noSessions: sd['NoSessions'] ?? 0,
      dropped: stats.droppedOut ?? 0,
    };
  }
  const E = v => !loaded ? pulse : (eng ? v : '—');
  const engTitle = loaded && !stats ? 'Data unavailable' : undefined;
  // Each bar's width is scaled against the LARGEST of the four values, not the total.
  const barMax = eng ? Math.max(eng.excellent, eng.onTrack, eng.needsAttention, eng.noSessions, 0) : 0;
  const barStyle = v => ({ width: `${(eng && barMax > 0 && v > 0) ? (v / barMax) * 100 : 0}%` });
  const barCls = (base, v) => `${base}${eng && v > 0 ? ' has-value' : ''}`;

  // ── Mentor performance chart ──
  let counts = null;
  if (mentors) {
    counts = { 'Not Started': 0, 'Needs Attention': 0, 'On Track': 0, Excellent: 0, Pending: 0 };
    mentors.forEach(m => {
      const status = m.progressStatus || m.ProgressStatus || 'Pending';
      const done = m.completedSessions ?? m.CompletedSessions ?? 0;
      const group = mentorTierGroup(status, done);
      counts[Object.hasOwn(counts, group) ? group : 'Pending']++;
    });
  }
  const chartDesc = !loaded ? 'Current-semester performance of active mentor accounts.'
    : !counts ? <Unavailable />
    : `Current-semester overall performance of active mentor accounts. ${counts['Needs Attention']} mentor${counts['Needs Attention'] !== 1 ? 's' : ''} need${counts['Needs Attention'] !== 1 ? '' : 's'} immediate attention. ${counts.Pending} Pending (performance unfinalized).`;

  useEffect(() => {
    if (!loaded) return;
    chartRef.current?.destroy();
    chartRef.current = null;
    if (!counts) return;
    let alive = true;
    loadScript('/ADMIN_/JS/chart.umd.min.js').then(() => {
      if (!alive || !canvasRef.current) return;
      const labels = ['Not Started', 'Needs Attention', 'On Track', 'Excellent', 'Pending'];
      // Read the same --status-* variables the legend uses, instead of a separately hardcoded colour list.
      const rootStyle = getComputedStyle(document.documentElement);
      const statusColor = name => rootStyle.getPropertyValue(`--status-${name}`).trim();
      chartRef.current = new window.Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: [counts['Not Started'], counts['Needs Attention'], counts['On Track'], counts.Excellent, counts.Pending],
            backgroundColor: [statusColor('critical'), statusColor('behind'), statusColor('on-track'), statusColor('excellent'), '#6b7280'],
            borderRadius: 6, borderSkipped: false, barPercentage: 0.55,
          }]
        },
        // Keeps .chart-action-guide's left offset lined up with where the plot area actually starts.
        plugins: [{
          id: 'syncLegendGutter',
          afterLayout(chart) { document.documentElement.style.setProperty('--chart-gutter', `${chart.chartArea.left}px`); }
        }],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick(_event, elements) {
            const index = elements[0]?.index;
            if (index === undefined || index === 4) return;
            navigate(`/admin/monitoring?status=${encodeURIComponent(labels[index])}`);
          },
          onHover(event, elements) {
            if (event.native?.target) event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.raw} mentor${ctx.raw !== 1 ? 's' : ''}` } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#6b7280' } },
            y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { stepSize: 3, font: { size: 11 }, color: '#6b7280' } }
          }
        }
      });
    });
    return () => { alive = false; };
  }, [data, wt]);
  useEffect(() => () => { chartRef.current?.destroy(); }, []);

  // ── Alerts ──
  const alerts = loaded ? computeAlerts(stats, monitor) : null;
  const showWarning = loaded && (!users || !stats || !monitor);
  const alertItem = (i, icon, to) => {
    const a = alerts ? alerts[i] : { itemClass: ['alert-item red', 'alert-item orange', 'alert-item blue'][i] };
    return (
      <div className={a.itemClass}>
        <div className="alert-icon">{icon}</div>
        <div className="alert-body">
          <div className="alert-title-row">
            <span className="alert-title" id={`alertTitle${i + 1}`}>{alerts ? a.title : <><span className="spinner"></span> Loading...</>}</span>
            <span className={a.badgeClass || 'alert-priority-badge'} id={`alertBadge${i + 1}`}>{alerts ? a.badge : ''}</span>
          </div>
          <div className="alert-detail-row">
            <div className="alert-sub" id={`alertSub${i + 1}`}>{alerts ? a.sub : ''}</div>
            <Link to={to} className="alert-link">View Details.</Link>
          </div>
        </div>
      </div>
    );
  };
  const alertsList = (
    <div className="alerts-list" id="alertsList">
      {alertItem(0, <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>, '/admin/monitoring')}
      {alertItem(1, <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /><line x1="18" y1="8" x2="23" y2="13" /><line x1="23" y1="8" x2="18" y2="13" /></svg>, '/admin/users')}
      {alertItem(2, <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /></svg>, '/admin/proofs')}
    </div>
  );

  // ── Top 3 ──
  // Ranked by overallPercent — the same figure Sessions and Mentor Detail use. Mentors at exactly 0% are excluded.
  let top3 = <p style={{ color: '#9ca3af', fontSize: '13px', padding: '16px 24px' }}><span className="spinner"></span> Loading...</p>;
  if (loaded) {
    if (!mentors) top3 = <Unavailable />;
    else {
      const ranked = mentors
        .filter(m => (m.progressStatus || m.ProgressStatus || 'Pending') !== 'Pending' && (m.overallPercent ?? m.OverallPercent ?? 0) > 0)
        .sort((a, b) => {
          const pctA = a.overallPercent ?? a.OverallPercent ?? 0, pctB = b.overallPercent ?? b.OverallPercent ?? 0;
          const doneA = a.completedSessions ?? a.CompletedSessions ?? 0, doneB = b.completedSessions ?? b.CompletedSessions ?? 0;
          const menA = a.menteeCount ?? a.MenteeCount ?? 0, menB = b.menteeCount ?? b.MenteeCount ?? 0;
          return pctB - pctA || doneB - doneA || menB - menA || `${a.lastName || ''}`.localeCompare(b.lastName || '');
        })
        .slice(0, 3);
      if (!ranked.length) {
        top3 = <Empty className="top3-empty">No finalized positive performance scores available. Required reports may still be pending, even when sessions have been completed.</Empty>;
      } else {
        top3 = (
          <>
            {ranked.map((m, i) => {
              const first = m.firstName || m.FirstName || '', last = m.lastName || m.LastName || '';
              const inits = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
              const dept = m.departmentName || m.DepartmentName || '—';
              const school = m.school || m.School || '';
              const pct = m.overallPercent ?? m.OverallPercent ?? 0;
              const id = m.mentorID || m.MentorID;
              return (
                <div className="top3-row" key={id ?? i} onClick={() => navigate(`/admin/monitoring/detail?id=${id}`)}>
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

  // ── Recent activities ──
  let recent = <div className="activity-skeleton"><span className="spinner"></span> Loading activities...</div>;
  const acts = wt ? TOUR_SAMPLE.activities : activities;
  if (acts !== undefined) {
    if (acts && acts.length > 0) {
      const sorted = [...acts].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
      // No slice — the card scrolls instead, so a burst of activity doesn't push earlier items off.
      recent = sorted.map((a, i) => {
        const id = a.sessionID ?? a.SessionID;
        const count = a.menteeCount;
        return (
          <div className={`activity-item${viewed.has(id) ? ' viewed' : ''}`} key={id ?? i} data-session-id={id ?? undefined}
            onClick={id != null ? () => { markActivityViewed(Number(id)); setViewed(getViewedActivityIds()); } : undefined}>
            <div className="activity-header">
              <span className="activity-name">{a.description || a.title || 'Activity'}</span>
              <span className="activity-time">{formatDate(a.createdAt || a.date || a.timestamp)}</span>
            </div>
            {count != null ? (
              <div className="activity-tags">
                <span className="tag-mentees">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  {count} mentee{count !== 1 ? 's' : ''} present
                </span>
              </div>
            ) : null}
          </div>
        );
      });
    } else {
      recent = <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9ca3af', fontSize: '13px' }}>No recent activity to show.</div>;
    }
  }

  const engTip = (
    <>
      <div className="dash-tip-title">Attendance This Semester</div>
      <div className="dash-tip-row"><strong>Attended</strong> — currently assigned, non-dropout mentees with attendance at one or more completed sessions this semester</div>
      <div className="dash-tip-row"><strong>No attendance</strong> — currently assigned, non-dropout mentees with no attendance at completed sessions this semester</div>
      <div className="dash-tip-row"><strong>Total Mentees</strong> — active mentee accounts, including unassigned and dropped-out accounts; those groups are listed separately</div>
      <div className="dash-tip-title">Attendance Tiers</div>
      <div className="dash-tip-row"><strong>Excellent</strong> — attended at least 80% of completed sessions</div>
      <div className="dash-tip-row"><strong>On Track</strong> — attended 60–79% of completed sessions</div>
      <div className="dash-tip-row"><strong>Needs Attention</strong> — attended below 60% of completed sessions (Behind / At Risk / Critical)</div>
      <div className="dash-tip-row"><strong>No Completed Sessions</strong> — no completed sessions this semester</div>
      <div className="dash-tip-row" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #334155', fontSize: '11.5px', color: '#94a3b8' }}>Attendance tiers compare attended sessions with completed sessions this semester. Future sessions are not counted; unassigned and dropped-out mentees are shown separately.</div>
    </>
  );

  return (
    <Page id="ADMIN_/dashboard">
      <div className="main-wrapper">
        <main className="page-content">
          {/* Page Header */}
          <div className="page-header">
            <div className="page-header-top">
              <h1>Administrator Dashboard</h1>
              <span className="period-chip" id="academicPeriod">{period ?? 'Loading…'}</span>
            </div>
            <p id="dashboardDate">{dateStr}</p>
            {/* Phones only (hidden on desktop): the period as a card under the date, like the Head dashboard. */}
            <div className="adm-period-card">
              <div className="adm-period-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
              </div>
              <div>
                <div className="adm-period-label">Academic Period</div>
                <div className="adm-period-value">{period ? period.replace(' · ', ', ') : 'Loading…'}</div>
              </div>
            </div>
          </div>
          {showWarning ? <div id="dashLoadWarning" role="alert" style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px', fontWeight: 500 }}>Some dashboard data couldn't be loaded, so the numbers below may be incomplete. Please refresh the page.</div> : null}
          {/* Stat Cards */}
          <div className="stats-grid mobile-summary-scroll" role="region" aria-label="Dashboard summary cards" tabIndex={0}>
            <Link to="/admin/monitoring" className="stat-card stat-card-link" aria-label="View all mentors in Mentor Monitoring">
              <div className="stat-icon-wrap purple">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="stat-body">
                <div className="stat-value" id="statMentors" title={statTitle}>{S(statMentors, !!stats)}</div>
                <div className="stat-label">Total Mentors</div>
                <div className="stat-sub">Active mentor accounts</div>
              </div>
            </Link>
            <div className="stat-card">
              <div className="stat-icon-wrap orange">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="stat-body">
                <div className="stat-value" id="statMentees" title={statTitle}>{S(statMentees, !!stats)}</div>
                <div className="stat-label">Total Mentees</div>
                <div className="stat-sub" id="statMenteesSub" title={statTitle}>{statMenteesSub}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrap red">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                  <line x1="9" y1="16" x2="13" y2="16" />
                </svg>
              </div>
              <div className="stat-body">
                <div className="stat-value" id="statPending" title={statTitle}>{S(stats?.sessionsWithoutProof ?? 0, !!stats)}</div>
                <div className="stat-label">Sessions w/o Proof</div>
                <div className="stat-sub">All-time completed sessions missing proof</div>
              </div>
            </div>
          </div>
          <div className="dash-grid">
            <div className="dash-row dash-row-2">
              {/* Mentee Engagement Overview */}
              <div className="card engagement-card">
                <div className="card-header">
                  <h2>Mentee Engagement</h2>
                  <div className="dash-tip-wrap">
                    <i className="ti ti-alert-circle dash-tip-icon"></i>
                    <div className="dash-tip-box" id="engTipBox">{engTip}</div>
                  </div>
                </div>
                <div className="eng-grid">
                  <Link to="/admin/users?role=Mentee&engagement=attended" className="eng-cell eng-cell-link green" aria-label="View mentees who attended this semester">
                    <div className="eng-cell-num" id="engAssignedActive" title={engTitle}>{E(eng?.active)}</div>
                    <div className="eng-cell-label">Attended this semester</div>
                  </Link>
                  {' '}
                  <Link to="/admin/users?role=Mentee&engagement=no-attendance" className="eng-cell eng-cell-link gray" aria-label="View assigned mentees with no attendance this semester">
                    <div className="eng-cell-num" id="engAssignedInactive" title={engTitle}>{E(eng?.inactive)}</div>
                    <div className="eng-cell-label">No attendance this semester</div>
                  </Link>
                  {' '}
                  <Link to="/admin/users?role=Mentee&engagement=unassigned" className="eng-cell eng-cell-link orange" aria-label="View unassigned mentees">
                    <div className="eng-cell-num" id="engUnassigned" title={engTitle}>{E(eng?.unassigned)}</div>
                    <div className="eng-cell-label">Unassigned</div>
                  </Link>
                </div>
                <div className="eng-breakdown">
                  <div className="eng-breakdown-title">Attendance This Semester</div>
                  <div className="eng-breakdown-list">
                    <Link to="/admin/users?role=Mentee&engagement=excellent" className="eng-breakdown-row eng-breakdown-link" aria-label="View mentees with excellent attendance">
                      <span className="eng-status-badge excellent">Excellent</span>
                      {' '}
                      <span className="eng-bd-track">
                        <span className={barCls('eng-bd-fill excellent', eng?.excellent)} id="engBarExcellent" style={barStyle(eng?.excellent)}></span>
                      </span>
                      {' '}
                      <span className="eng-bd-val" id="engStatusExcellent" title={engTitle}>{E(eng?.excellent)}</span>
                    </Link>
                    {' '}
                    <Link to="/admin/users?role=Mentee&engagement=on-track" className="eng-breakdown-row eng-breakdown-link" aria-label="View mentees with on-track attendance">
                      <span className="eng-status-badge on-track">On Track</span>
                      {' '}
                      <span className="eng-bd-track">
                        <span className={barCls('eng-bd-fill on-track', eng?.onTrack)} id="engBarOnTrack" style={barStyle(eng?.onTrack)}></span>
                      </span>
                      {' '}
                      <span className="eng-bd-val" id="engStatusOnTrack" title={engTitle}>{E(eng?.onTrack)}</span>
                    </Link>
                    {' '}
                    <Link to="/admin/users?role=Mentee&engagement=needs-attention" className="eng-breakdown-row eng-breakdown-link" aria-label="View mentees needing attendance follow-up">
                      <span className="eng-status-badge needs-attention">Needs Attention</span>
                      {' '}
                      <span className="eng-bd-track">
                        <span className={barCls('eng-bd-fill needs-attention', eng?.needsAttention)} id="engBarNeedsAttention" style={barStyle(eng?.needsAttention)}></span>
                      </span>
                      {' '}
                      <span className="eng-bd-val" id="engStatusNeedsAttention" title={engTitle}>{E(eng?.needsAttention)}</span>
                    </Link>
                    {' '}
                    <Link to="/admin/users?role=Mentee&engagement=no-completed-sessions" className="eng-breakdown-row eng-breakdown-link" aria-label="View assigned mentees with no completed sessions this semester">
                      <span className="eng-status-badge no-sessions">No Completed Sessions</span>
                      {' '}
                      <span className="eng-bd-track">
                        <span className={barCls('eng-bd-fill no-sessions', eng?.noSessions)} id="engBarNoSessions" style={barStyle(eng?.noSessions)}></span>
                      </span>
                      {' '}
                      <span className="eng-bd-val" id="engStatusNoSessions" title={engTitle}>{E(eng?.noSessions)}</span>
                    </Link>
                  </div>
                </div>
                <div className="engagement-total">
                  <span>Total Mentees</span>
                  {' '}
                  <Link to="/admin/users?role=Mentee&engagement=all" className="engagement-link" aria-label="View all active mentee accounts">
                    <span id="engTotal" title={engTitle}>{E(eng?.total)}</span>
                  </Link>
                </div>
                <div className="engagement-dropout">
                  <span>
                    <i className="ti ti-user-x"></i>
                    {' '}
                    Dropped Out
                  </span>
                  {' '}
                  <Link to="/admin/users?role=Mentee&engagement=dropped-out" className="engagement-link" aria-label="View dropped-out mentees">
                    <span id="engDroppedOut" title={engTitle}>{E(eng?.dropped)}</span>
                  </Link>
                </div>
              </div>
              <div className="card chart-card">
                <div className="chart-card-header">
                  <div>
                    <h2>Mentor Performance</h2>
                    <p className="chart-desc" id="chartDesc">{chartDesc}</p>
                  </div>
                  <div className="dash-tip-wrap">
                    <i className="ti ti-alert-circle dash-tip-icon" title="About mentor performance"></i>
                    <div className="dash-tip-box">
                      <div className="dash-tip-title">Overall Performance</div>
                      <div className="dash-tip-row">Timeliness (25%) + Completeness (25%) + Evaluation Rating (50%).</div>
                      <div className="dash-tip-row">
                        The chart groups active mentor accounts by overall-performance tier for the current semester.
                      </div>
                      <div className="dash-tip-row">Select a bar or status below to view matching mentors.</div>
                    </div>
                  </div>
                  <span className="semester-badge" id="semesterBadge">{period ?? 'Loading…'}</span>
                </div>
                <div className="chart-wrap">
                  <canvas id="sessionChart" ref={canvasRef}></canvas>
                </div>
                <div className="chart-action-guide">
                  <Link to="/admin/monitoring?status=Not%20Started" className="chart-action-item" aria-label="View mentors not started">
                    <span className="action-dot notstarted"></span>
                    <div>
                      <div className="action-title">Not Started</div>
                      <div className="action-desc">No completed sessions and overall score below 50%.</div>
                    </div>
                  </Link>
                  {' '}
                  <Link to="/admin/monitoring?status=Needs%20Attention" className="chart-action-item" aria-label="View mentors needing attention">
                    <span className="action-dot needsattention"></span>
                    <div>
                      <div className="action-title">Needs Attention</div>
                      <div className="action-desc">Follow up to understand delays.</div>
                    </div>
                  </Link>
                  {' '}
                  <Link to="/admin/monitoring?status=On%20Track" className="chart-action-item" aria-label="View on-track mentors">
                    <span className="action-dot on-track"></span>
                    <div>
                      <div className="action-title">On Track</div>
                      <div className="action-desc">No action needed, monitor normally.</div>
                    </div>
                  </Link>
                  {' '}
                  <Link to="/admin/monitoring?status=Excellent" className="chart-action-item" aria-label="View excellent mentors">
                    <span className="action-dot excellent"></span>
                    <div>
                      <div className="action-title">Excellent</div>
                      <div className="action-desc">Performing excellently.</div>
                    </div>
                  </Link>
                  <div className="chart-action-item">
                    <span className="action-dot pending"></span>
                    <div>
                      <div className="action-title">Pending</div>
                      <div className="action-desc">No session deadline has passed yet, so no score.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="dash-row dash-row-3">
              {/* System Alerts */}
              <div className="card alerts-card">
                <div className="card-header">
                  <h2>System Alerts</h2>
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
                <div className="card-body">
                  <p className="card-desc-text">
                    Priority-ordered notifications requiring immediate action. Critical issues appear first.
                  </p>
                  {alertsList}
                </div>
              </div>
              {/* Top 3 Mentors */}
              <div className="card top3-card">
                <div className="card-header">
                  <h2>Top 3 Mentors</h2>
                  <div className="dash-tip-wrap">
                    <i className="ti ti-alert-circle dash-tip-icon"></i>
                    <div className="dash-tip-box">
                      <div className="dash-tip-title">Ranked by</div>
                      <div className="dash-tip-row">
                        Ranked by overall performance: Timeliness (25%) + Completeness (25%) + Evaluation Rating (50%). Mentors with 0% score are not ranked yet.
                      </div>
                    </div>
                  </div>
                </div>
                <div id="top3List" className="top3-list">{top3}</div>
                <div className="card-view-footer">
                  <Link to="/admin/report" className="card-view-link">
                    View full ranking
                    {' '}
                    <i className="ti ti-arrow-right"></i>
                  </Link>
                </div>
              </div>
              {/* Third card in this row, alongside System Alerts and Top 3 Mentors. */}
              <div className="card recent-card">
                <div className="card-header">
                  <h2>Recent Activities</h2>
                </div>
                <div className="activity-list" id="recentActivities">{recent}</div>
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
