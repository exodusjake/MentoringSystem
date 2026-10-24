import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { apiRequest } from '../../lib/api.js';
import { MentorSchools } from '../../lib/mentor-schools.js';
import { getSession } from '../../lib/session.js';

const list = value => Array.isArray(value) ? value : value?.data || value?.items || value?.mentors || value?.Mentors || value?.activities || value?.Activities || [];
const get = (item, ...keys) => keys.map(key => item?.[key]).find(value => value != null);
const tier = item => {
  const status = get(item, 'progressStatus', 'ProgressStatus') || 'Pending';
  const completed = Number(get(item, 'completedSessions', 'CompletedSessions') || 0);
  if ((status === 'Critical' || status === 'Behind') && completed === 0) return 'Not Started';
  if (status === 'Critical' || status === 'Behind') return 'Needs Attention';
  return status;
};
const nameOf = item => get(item, 'mentorName', 'MentorName', 'fullName', 'FullName', 'name', 'Name')
  || `${get(item, 'firstName', 'FirstName') || ''} ${get(item, 'lastName', 'LastName') || ''}`.trim()
  || 'Mentor';
const schoolOf = item => get(item, 'schoolName', 'SchoolName', 'school', 'School') || 'Unassigned';
const idOf = item => get(item, 'userID', 'UserID', 'mentorID', 'MentorID', 'id', 'ID');
const activityTime = item => get(item, 'createdAt', 'CreatedAt', 'date', 'Date', 'timestamp', 'Timestamp', 'sessionDate', 'SessionDate');
const normalizedActivityId = value => value == null ? null : Number.isFinite(Number(value)) ? Number(value) : String(value);

export default function HeadDashboard() {
  const [data, setData] = useState({ state: 'loading' });
  const activityUser = getSession()?.user;
  const viewedActivitiesKey = `viewedActivityIds_${activityUser?.UserID ?? activityUser?.userID ?? 'anon'}`;
  const [viewedActivities, setViewedActivities] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(viewedActivitiesKey) || '[]');
      return new Set(Array.isArray(stored) ? stored.map(normalizedActivityId) : []);
    } catch { return new Set(); }
  });
  function markActivityViewed(value) {
    const id = normalizedActivityId(value);
    if (id == null) return;
    setViewedActivities(current => {
      const next = new Set(current).add(id);
      localStorage.setItem(viewedActivitiesKey, JSON.stringify([...next]));
      return next;
    });
  }
  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      apiRequest('Users/stats', 'GET', null, true),
      apiRequest('Settings', 'GET', null, true),
      apiRequest('MonitorActivities', 'GET', null, true),
      apiRequest('Activities?top=25', 'GET', null, true),
      MentorSchools.load(),
    ]).then(([statsResult, settingsResult, monitoringResult, activitiesResult, schoolsResult]) => {
      const stats = statsResult.status === 'fulfilled' ? statsResult.value : null;
      const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null;
      const monitoring = monitoringResult.status === 'fulfilled' ? monitoringResult.value : null;
      const activities = activitiesResult.status === 'fulfilled' ? activitiesResult.value : null;
      const errors = [
        ['Statistics', statsResult],
        ['System settings', settingsResult],
        ['Mentor monitoring', monitoringResult],
        ['Recent activity', activitiesResult],
        ['School directory', schoolsResult],
      ].filter(([, result]) => result.status === 'rejected')
        .map(([area, result]) => `${area}: ${result.reason?.message || 'could not be loaded.'}`);
      if (alive) setData({
        state: 'ok',
        stats: stats || {},
        settings: settings || {},
        statsAvailable: stats != null,
        monitorAvailable: monitoring != null,
        activityAvailable: activities != null,
        errors,
        mentors: list(monitoring),
        activities: list(activities),
      });
    });
    return () => { alive = false; };
  }, []);
  const mentors = data.mentors || [];
  const stat = data.stats || {};
  const tierCounts = useMemo(() => mentors.reduce((counts, mentor) => {
    const group = tier(mentor);
    counts[group] = (counts[group] || 0) + 1;
    return counts;
  }, { 'Not Started': 0, 'Needs Attention': 0, 'On Track': 0, Excellent: 0, Pending: 0 }), [mentors]);
  const rankedMentors = useMemo(() => mentors.filter(mentor =>
    (get(mentor, 'progressStatus', 'ProgressStatus') || 'Pending') !== 'Pending'
    && Number(get(mentor, 'overallPercent', 'OverallPercent') || 0) > 0)
    .sort((a, b) => Number(get(b, 'overallPercent', 'OverallPercent') || 0) - Number(get(a, 'overallPercent', 'OverallPercent') || 0)), [mentors]);
  const engagement = stat.menteeStatusDistribution || stat.MenteeStatusDistribution || {};
  const activeMentees = Number(get(stat, 'activeMentees', 'ActiveMentees') || 0);
  const assignedMentees = Number(get(stat, 'assigned', 'Assigned') || 0);
  const menteeDistribution = [
    ['Excellent', Number(get(engagement, 'Excellent', 'excellent') || 0), '#16a34a'],
    ['On Track', Number(get(engagement, 'OnTrack', 'onTrack') || 0), '#1d4ed8'],
    ['Needs Attention', ['Behind', 'AtRisk', 'Critical'].reduce((sum, key) => sum + Number(engagement[key] || 0), 0), '#ea580c'],
    ['No Sessions', Number(get(engagement, 'NoSessions', 'noSessions') || 0), '#dc2626'],
  ];
  const mentorDistribution = [
    ['Not Started', tierCounts['Not Started'], 'var(--status-critical, #dc2626)'],
    ['Needs Attention', tierCounts['Needs Attention'], 'var(--status-behind, #ea580c)'],
    ['On Track', tierCounts['On Track'], 'var(--status-on-track, #1d4ed8)'],
    ['Excellent', tierCounts.Excellent, 'var(--status-excellent, #16a34a)'],
    ['Pending', tierCounts.Pending, '#6b7280'],
  ];
  const progressData = data.monitorAvailable;
  const alertGroups = mentors.map(tier);
  const followUp = alertGroups.filter(group => group === 'Not Started' || group === 'Needs Attention').length;
  const unassigned = Number(get(stat, 'unassigned', 'Unassigned') || 0);
  const noProof = Number(get(stat, 'sessionsWithoutProof', 'SessionsWithoutProof') || 0);
  const schoolNames = ['School of Technology', 'School of Humanities', 'School of Management'];
  const schoolStats = useMemo(() => {
    const counts = Object.fromEntries(schoolNames.map(school => [school, { total: 0, Excellent: 0, 'On Track': 0, 'Needs Attention': 0, 'Not Started': 0, Pending: 0 }]));
    mentors.forEach(mentor => {
      const schools = MentorSchools.schoolsOf(mentor);
      (schools.length ? schools : [schoolOf(mentor)]).forEach(school => {
        if (!school || school === 'Unassigned') return;
        counts[school] ||= { total: 0, Excellent: 0, 'On Track': 0, 'Needs Attention': 0, 'Not Started': 0, Pending: 0 };
        const group = tier(mentor);
        counts[school][group] = (counts[school][group] || 0) + 1;
        counts[school].total++;
      });
    });
    return Object.entries(counts).sort(([a], [b]) => {
      const ai = schoolNames.indexOf(a), bi = schoolNames.indexOf(b);
      return ai < 0 && bi < 0 ? a.localeCompare(b) : ai < 0 ? 1 : bi < 0 ? -1 : ai - bi;
    });
  }, [mentors]);
  const period = `${get(data.settings, 'semester', 'Semester') || '—'}, S.Y. ${get(data.settings, 'schoolYear', 'SchoolYear') || '—'}`;

  return <Page id="HEAD/head-dashboard">
    <div className="main-wrapper"><main className="page-content">
      <div className="page-header"><div><h1>Overview Dashboard</h1><p>Mentoring program activity and performance at a glance.</p></div></div>
      {data.state === 'loading' ? <div className="loading-state" role="status">Loading dashboard…</div> : data.state === 'error' ? <Empty>Dashboard unavailable. Please refresh to try again.</Empty> : <>
        {data.errors?.length > 0 && <div className="error-message" role="alert">
          <strong>Some dashboard information could not be loaded.</strong>
          <ul>{data.errors.map(error => <li key={error}>{error}</li>)}</ul>
        </div>}
        <div className="page-header hd-header-row"><p className="hd-period-label">Academic Period <strong>{period}</strong></p></div>
        <div className="hd-dash-grid">
          <div className="hd-row hd-row-2">
          <section className="card hd-performance-card">
            <div className="card-header"><h2>Mentor Performance</h2><Link className="card-view-link" to="/head/monitoring">View all mentors <i className="ti ti-arrow-right" /></Link></div>
            <div className="hd-card-body">
              {progressData ? <><div className="hd-period-label">{mentors.length} active mentor accounts · {tierCounts['Needs Attention']} need follow-up; {tierCounts.Pending} pending (performance unfinalized).</div>
                <div className="hd-seg-bar" role="img" aria-label={`${mentors.length} mentors by performance status`}>{mentorDistribution.filter(([, count]) => count > 0).map(([label, count, color]) => <span key={label} title={`${label}: ${count}`} style={{ width: `${count / mentors.length * 100}%`, background: color }} />)}</div>
                <div className="hd-stat-row hd-performance-stats">{mentorDistribution.map(([label, count]) => <div className="hd-stat" key={label}><span className="hd-stat-label">{label}</span><strong className={`hd-stat-num ${label.toLowerCase().replaceAll(' ', '')}`}>{count}</strong></div>)}</div>
              </> : <div role="alert">Mentor performance data is unavailable.</div>}
            </div>
          </section>
          <section className="card alerts-card"><div className="card-header"><h2>System Alerts</h2></div><div className="card-body"><div className="alerts-list">
            <article className={`alert-item ${!data.monitorAvailable ? '' : followUp ? 'red' : 'green'}`}><span className="alert-icon ti ti-alert-circle" /><div className="alert-body"><div className="alert-title">{data.monitorAvailable ? `${followUp} mentor${followUp === 1 ? '' : 's'} need follow-up` : 'Mentor status unavailable'}</div><div className="alert-sub">{data.monitorAvailable ? `${tierCounts['Not Started']} not started, ${tierCounts['Needs Attention']} need attention` : 'See dashboard warning.'}</div></div><span className="alert-priority-badge">{!data.monitorAvailable ? 'Unavailable' : followUp ? 'Urgent' : 'All Clear'}</span><Link className="alert-link" to="/head/monitoring">Review</Link></article>
            <article className={`alert-item ${!data.statsAvailable ? '' : unassigned ? 'orange' : 'green'}`}><span className="alert-icon ti ti-user-x" /><div className="alert-body"><div className="alert-title">{data.statsAvailable ? `${unassigned} unassigned mentee${unassigned === 1 ? '' : 's'}` : 'Mentee assignment data unavailable'}</div><div className="alert-sub">{!data.statsAvailable ? 'See dashboard warning.' : unassigned ? 'Needs immediate assignment' : 'All mentees assigned'}</div></div><span className="alert-priority-badge">{!data.statsAvailable ? 'Unavailable' : unassigned ? 'Warning' : 'All Clear'}</span></article>
            <article className={`alert-item ${!data.statsAvailable ? '' : noProof ? 'blue' : 'green'}`}><span className="alert-icon ti ti-file-alert" /><div className="alert-body"><div className="alert-title">{data.statsAvailable ? `${noProof} session${noProof === 1 ? '' : 's'} missing proof` : 'Proof data unavailable'}</div><div className="alert-sub">{!data.statsAvailable ? 'See dashboard warning.' : noProof ? 'Completed sessions with no proof uploaded' : 'All completed sessions have proof'}</div></div><span className="alert-priority-badge">{!data.statsAvailable ? 'Unavailable' : noProof ? 'Review' : 'All Clear'}</span><Link className="alert-link" to="/head/proofs">Review</Link></article>
          </div></div>
          </section>
          </div>
          <div className="hd-row hd-row-3">
          <section className="card hd-eng-card"><div className="card-header"><h2>Mentee Engagement</h2></div>
            <div className="hd-card-body">
              <div className="engagement-total hd-total-split"><strong>{data.statsAvailable ? get(stat, 'totalMentees', 'TotalMentees') ?? 0 : 'Unavailable'}</strong><span>{data.statsAvailable ? `Total mentees · ${activeMentees} active · ${Math.max(0, assignedMentees - activeMentees)} inactive` : 'Mentee engagement data could not be loaded.'}</span></div>
              <div className="hd-seg-bar">{menteeDistribution.filter(([, count]) => count > 0).map(([label, count, color]) => <span key={label} title={`${label}: ${count}`} style={{ width: `${count / Math.max(1, menteeDistribution.reduce((sum, item) => sum + item[1], 0)) * 100}%`, background: color }} />)}</div>
              <div className="eng-breakdown-list">{menteeDistribution.map(([label, count]) => <div className="hd-dot-row" key={label}><span className={`hd-dot ${label.toLowerCase().replaceAll(' ', '-')}`} /><span className="hd-dot-label">{label}</span><strong className="hd-dot-val">{data.statsAvailable ? count : '—'}</strong></div>)}</div>
              <p>{data.statsAvailable ? get(stat, 'droppedOut', 'DroppedOut') ?? 0 : '—'} dropped out</p><Link className="card-view-link" to="/head/attendance">View attendance <i className="ti ti-arrow-right" /></Link>
            </div>
          </section>
          <section className="card hd-eng-card top3-card"><div className="card-header"><h2>Top 3 Mentors</h2></div>
            <div className="top3-list">{rankedMentors.slice(0, 3).map((mentor, i) => <Link className="top3-row" to={`/head/monitoring/${encodeURIComponent(idOf(mentor))}`} key={idOf(mentor) ?? i}>
              <span className={`top3-rank rank-${i + 1}`}>{i + 1}</span><span className="top3-avatar">{nameOf(mentor).split(' ').map(word => word[0]).join('').slice(0, 2)}</span>
              <span className="top3-info"><strong className="top3-name">{nameOf(mentor)}</strong><small className="top3-dept">{get(mentor, 'departmentName', 'DepartmentName') || '—'}{schoolOf(mentor) !== 'Unassigned' ? ` · ${schoolOf(mentor)}` : ''}</small></span>
              <span className="top3-progress"><strong className="top3-pct">{get(mentor, 'overallPercent', 'OverallPercent')}%</strong><small className="top3-score-label">Overall performance</small></span>
            </Link>)}
              {rankedMentors.length === 0 ? <Empty>{data.monitorAvailable ? 'No finalized positive performance scores available. Checkpoint attendance alone does not finalize a grade.' : 'Mentor ranking data is unavailable.'}</Empty> : rankedMentors.length < 3 && <p className="top3-note">Fewer than three mentors have finalized positive performance scores.</p>}
              <div className="card-view-footer"><Link className="card-view-link" to="/head/report">View full ranking <i className="ti ti-arrow-right" /></Link></div>
            </div>
          </section>
          <section className="card recent-card hd-eng-card"><div className="card-header"><h2>Recent Activities</h2></div>
            {!data.activityAvailable ? <Empty>Recent activity data is unavailable.</Empty> : data.activities.length ? <ul className="activity-list" id="recentActivities">{[...data.activities].sort((a, b) => new Date(activityTime(b) || 0) - new Date(activityTime(a) || 0)).slice(0, 25).map((item, i) => {
              const activityId = get(item, 'sessionID', 'SessionID', 'activityID', 'ActivityID', 'id', 'ID');
              const mentor = get(item, 'mentorID', 'MentorID', 'userID', 'UserID');
              const isViewed = viewedActivities.has(normalizedActivityId(activityId));
              const content = <><span className="ti ti-calendar-event academic-icon" /><span><strong>{get(item, 'activityName', 'ActivityName', 'title', 'Title', 'activity', 'Activity', 'description', 'Description') || 'Mentoring activity'}</strong><small>{get(item, 'mentorName', 'MentorName') || nameOf(item)} · {activityTime(item) ? new Date(activityTime(item)).toLocaleDateString() : ''}</small></span><span className="hd-stat-num">{get(item, 'menteeCount', 'MenteeCount', 'presentCount', 'PresentCount') ?? ''}</span></>;
              return <li className={`activity-item${isViewed ? ' viewed' : ''}`} key={activityId ?? i}>{mentor ? <Link to={`/head/monitoring/${encodeURIComponent(mentor)}`} onClick={() => markActivityViewed(activityId)}>{content}</Link> : <div onClick={() => markActivityViewed(activityId)}>{content}</div>}</li>;
            })}</ul> : <Empty>No recent activity to show.</Empty>}
          </section>
          </div>
          <div className="hd-row hd-row-1"><section className="card hd-school-card"><div className="card-header"><h2>Breakdown by School</h2><Link className="card-view-link" to="/head/monitoring">View monitoring <i className="ti ti-arrow-right" /></Link></div>
            <div className="hd-card-body">{!data.monitorAvailable ? <Empty>School performance data is unavailable.</Empty> : schoolStats.map(([school, counts]) => {
              const total = counts.total || 1;
              const segments = [['Excellent', counts.Excellent, '#16a34a'], ['On Track', counts['On Track'], '#1d4ed8'], ['Needs Attention', counts['Needs Attention'], '#ea580c'], ['Not Started', counts['Not Started'], '#dc2626'], ['Pending', counts.Pending, '#6b7280']];
              return <div className="hd-school-row" key={school}><div className="hd-school-info"><strong className="hd-school-name">{school}</strong><small className="hd-school-sub">{school === schoolNames[0] ? 'SOT' : school === schoolNames[1] ? 'SOH' : school === schoolNames[2] ? 'SOM' : ''}</small></div>
                <div className="hd-school-bar">{segments.map(([label, count, color]) => count > 0 && <span key={label} title={`${label}: ${count}`} style={{ width: `${count / total * 100}%`, background: color }} />)}</div>
                <div className="hd-school-counts">{segments.map(([label, count, color]) => <span key={label} title={label} style={{ color }}><b>{count}</b></span>)}</div><strong className="hd-school-total">{counts.total}</strong>
              </div>;
            })}</div>
          </section></div>
        </div>
      </>}
    </main></div>
  </Page>;
}
