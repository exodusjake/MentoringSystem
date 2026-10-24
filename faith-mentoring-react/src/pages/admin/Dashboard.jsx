import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { showToast } from '../../components/Notify.jsx';
import { apiRequest } from '../../lib/api.js';

const countBy = (rows, predicate) => rows.filter(predicate).length;
const roleOf = user => user.role || user.Role || '';
const activeOf = user => (user.isActive ?? user.IsActive) !== false;
const fullName = user => `${user.firstName || user.FirstName || ''} ${user.lastName || user.LastName || ''}`.trim() || user.email || user.Email || 'User';

export default function AdminDashboard() {
  const [data, setData] = useState({ state: 'loading', users: [], stats: {}, monitoring: {}, activities: [] });
  useEffect(() => {
    let alive = true;
    Promise.all([
      apiRequest('Settings', 'GET', null, true),
      apiRequest('Users', 'GET', null, true),
      apiRequest('Users/stats', 'GET', null, true),
      apiRequest('MonitorActivities', 'GET', null, true),
      apiRequest('Activities?top=25', 'GET', null, true),
    ]).then(([settings, users, stats, monitoring, activities]) => {
      if (alive) setData({ state: 'ready', settings, users: users || [], stats: stats || {}, monitoring: monitoring || {}, activities: activities || [] });
    }).catch(error => {
      if (alive) {
        setData(current => ({ ...current, state: 'error' }));
        showToast(error.message || 'Could not load dashboard data.');
      }
    });
    return () => { alive = false; };
  }, []);

  const users = data.users;
  const stats = data.stats;
  const mentors = stats.totalMentors ?? countBy(users, u => roleOf(u) === 'Mentor' && activeOf(u));
  const mentees = stats.totalMentees ?? countBy(users, u => roleOf(u) === 'Mentee' && activeOf(u));
  const roster = data.monitoring.mentors || data.monitoring.Mentors || [];
  const tier = m => {
    const status = m.progressStatus || m.ProgressStatus || 'Pending';
    if (['Critical', 'Behind'].includes(status)) return Number(m.completedSessions ?? m.CompletedSessions ?? 0) === 0 ? 'Not Started' : 'Needs Attention';
    return status;
  };
  const tierCounts = ['Not Started', 'Needs Attention', 'On Track', 'Excellent', 'Pending']
    .map(label => ({ label, count: countBy(roster, m => tier(m) === label) }));
  const noProof = stats.sessionsWithoutProof ?? stats.pendingProofs ?? stats.sessionsWOP ?? '—';
  const completedOf = mentor => Number(mentor.completedSessions ?? mentor.CompletedSessions ?? 0);
  const topMentors = [...roster].sort((a, b) => completedOf(b) - completedOf(a)).slice(0, 5);
  const mentorIdOf = mentor => mentor.userID ?? mentor.UserID ?? mentor.mentorID ?? mentor.MentorID;
  const needsFollowUp = roster.filter(mentor => ['Not Started', 'Needs Attention'].includes(tier(mentor)));
  const unassigned = Number(stats.unassignedMentees ?? 0);

  return <Page id="ADMIN_/dashboard">
    <main className="main-wrapper">
      <div className="page-content">
        <header className="page-header">
          <div className="page-header-top"><div><h1>Admin Dashboard</h1><p>Mentoring program overview and activity.</p></div>
            <span className="period-chip" id="academicPeriod">{data.settings ? `${data.settings.Semester || ''} · SY ${data.settings.SchoolYear || ''}` : 'Academic period'}</span>
          </div>
          <p className="dashboard-date">{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </header>
        {data.state === 'loading' ? <Empty className="empty-state">Loading dashboard…</Empty> : data.state === 'error' ? <Empty className="empty-state">Dashboard data could not be loaded. Refresh the page to try again.</Empty> : <>
          <section className="stats-grid mobile-summary-scroll">
            <Link className="stat-card stat-card-link" to="/admin/monitoring">
              <span className="stat-icon-wrap purple"><i className="ti ti-users" /></span><span className="stat-body"><b className="stat-value">{mentors}</b><span className="stat-label">Total Mentors</span><span className="stat-sub">Active mentor accounts</span></span>
            </Link>
            <Link className="stat-card stat-card-link" to="/admin/users?role=Mentee">
              <span className="stat-icon-wrap orange"><i className="ti ti-user" /></span><span className="stat-body"><b className="stat-value">{mentees}</b><span className="stat-label">Total Mentees</span><span className="stat-sub">Active mentee accounts</span></span>
            </Link>
            <Link className="stat-card stat-card-link" to="/admin/proofs">
              <span className="stat-icon-wrap red"><i className="ti ti-clipboard" /></span><span className="stat-body"><b className="stat-value">{noProof}</b><span className="stat-label">Sessions w/o Proof</span><span className="stat-sub">Completed sessions missing proof</span></span>
            </Link>
          </section>
          <div className="dash-grid">
            <section className="card engagement-card">
              <div className="card-header"><h2>Mentee Engagement</h2><Link to="/admin/users?role=Mentee">Manage mentees <i className="ti ti-arrow-right" /></Link></div>
              <div className="eng-grid">
                <Link className="eng-cell eng-cell-link green" to="/admin/users?role=Mentee&engagement=attended"><b className="eng-cell-num">{stats.attendedMentees ?? stats.menteesAttended ?? '—'}</b><span className="eng-cell-label">Attended this semester</span></Link>
                <Link className="eng-cell eng-cell-link gray" to="/admin/users?role=Mentee&engagement=no-attendance"><b className="eng-cell-num">{stats.inactiveMentees ?? stats.noAttendance ?? '—'}</b><span className="eng-cell-label">No attendance this semester</span></Link>
                <Link className="eng-cell eng-cell-link orange" to="/admin/users?role=Mentee&engagement=unassigned"><b className="eng-cell-num">{stats.unassignedMentees ?? '—'}</b><span className="eng-cell-label">Unassigned</span></Link>
              </div>
              <div className="eng-breakdown"><div className="eng-breakdown-title">Mentor Performance</div>
                {tierCounts.map(item => <Link key={item.label} className="eng-breakdown-row eng-breakdown-link" to={`/admin/monitoring?status=${encodeURIComponent(item.label)}`}>
                  <span className={`eng-status-badge ${item.label.toLowerCase().replaceAll(' ', '-')}`}>{item.label}</span><span className="eng-bd-track"><span className={`eng-bd-fill ${item.label.toLowerCase().replaceAll(' ', '-')}`} style={{ width: `${roster.length ? item.count / roster.length * 100 : 0}%` }} /></span><b className="eng-bd-val">{item.count}</b>
                </Link>)}
              </div>
              <div className="engagement-total"><span>All active users</span><Link className="engagement-link" to="/admin/users">{users.length}</Link></div>
            </section>
            <section className="card chart-card">
              <div className="chart-card-header"><div><h2>Mentor Monitoring</h2><p className="chart-desc">Current-semester performance of active mentor accounts.</p></div><span className="semester-badge">{data.settings ? `${data.settings.Semester || ''} · ${data.settings.SchoolYear || ''}` : 'Current semester'}</span></div>
              <div className="chart-action-guide">{tierCounts.map(item => <Link key={item.label} className="chart-action-item" to={`/admin/monitoring?status=${encodeURIComponent(item.label)}`}><span className={`action-dot ${item.label.toLowerCase().replaceAll(' ', '')}`} /><div><b className="action-title">{item.label}</b><span className="action-desc">{item.count} mentors</span></div></Link>)}</div>
              <div className="dashboard-chart" role="img" aria-label="Mentor performance distribution">
                {tierCounts.map(item => <Link key={item.label} to={`/admin/monitoring?status=${encodeURIComponent(item.label)}`} className="dashboard-chart-row">
                  <span>{item.label}</span><span className="dashboard-chart-track"><span className={`eng-bd-fill ${item.label.toLowerCase().replaceAll(' ', '-')}`} style={{ width: `${roster.length ? Math.max(item.count ? 2 : 0, item.count / roster.length * 100) : 0}%` }} /></span><b>{item.count}</b>
                </Link>)}
                {!roster.length && <Empty className="empty-state">Mentor performance data is unavailable.</Empty>}
              </div>
              <div className="top-mentors"><h3>Top mentors by completed sessions</h3>{topMentors.length ? topMentors.map((mentor, i) => <Link key={mentorIdOf(mentor) || i} to={mentorIdOf(mentor) ? `/admin/monitoring/${mentorIdOf(mentor)}` : '/admin/monitoring'} className="top-mentor-row">
                <span>{i + 1}</span><b>{mentor.mentorName || mentor.fullName || fullName(mentor)}</b><span>{completedOf(mentor)} completed</span>
              </Link>) : <Empty className="empty-state">No mentor performance records are available.</Empty>}</div>
            </section>
          </div>
          <section className="card dashboard-alerts" aria-label="Program alerts">
            <div className="card-header"><h2>Alerts requiring attention</h2></div>
            <div className="alert-list">
              <Link to="/admin/monitoring?status=Needs%20Attention" className="alert-row"><b>{needsFollowUp.length} mentor{needsFollowUp.length === 1 ? '' : 's'} need follow-up</b><span>{tierCounts.find(item => item.label === 'Not Started')?.count || 0} not started · {tierCounts.find(item => item.label === 'Needs Attention')?.count || 0} need attention</span></Link>
              <Link to="/admin/users?role=Mentee&engagement=unassigned" className="alert-row"><b>{unassigned} unassigned mentee{unassigned === 1 ? '' : 's'}</b><span>Review mentor assignments</span></Link>
              <Link to="/admin/proofs" className="alert-row"><b>{noProof} sessions missing proof</b><span>Completed sessions without supporting proof</span></Link>
            </div>
          </section>
          <section className="card dashboard-activity">
            <div className="card-header"><h2>Recent Activity</h2><Link to="/admin/attendance">View attendance <i className="ti ti-arrow-right" /></Link></div>
            {data.activities.length ? <div className="activity-list">{data.activities.slice(0, 10).map((activity, i) => <div className="activity-row" key={activity.activityID || activity.id || i}>
              <span className="activity-icon"><i className="ti ti-activity" /></span><div><b>{activity.title || activity.description || activity.activity || activity.action || 'Program activity'}</b><span>{activity.userName || activity.name || ''}</span></div><time>{activity.createdAt || activity.date ? new Date(activity.createdAt || activity.date).toLocaleString() : ''}</time>
            </div>)}</div> : <Empty className="empty-state">No recent activity to display.</Empty>}
          </section>
        </>}
      </div>
    </main>
  </Page>;
}
