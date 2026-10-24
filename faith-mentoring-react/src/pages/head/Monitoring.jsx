import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { MentorSchools } from '../../lib/mentor-schools.js';

const rows = data => Array.isArray(data) ? data : data?.data || data?.items || data?.mentors || data?.Mentors || [];
const val = (row, ...keys) => keys.map(key => row?.[key]).find(value => value != null);
const mentorName = row => val(row, 'mentorName', 'MentorName', 'fullName', 'FullName', 'name', 'Name')
  || `${val(row, 'firstName', 'FirstName') || ''} ${val(row, 'lastName', 'LastName') || ''}`.trim()
  || 'Mentor';
const schoolName = row => val(row, 'schoolName', 'SchoolName', 'school', 'School', 'departmentName', 'DepartmentName') || '—';
const mentorId = row => val(row, 'userID', 'UserID', 'mentorID', 'MentorID', 'id', 'ID');
const progressStatus = row => {
  const status = val(row, 'progressStatus', 'ProgressStatus') || 'Critical';
  const completed = Number(val(row, 'completedSessions', 'CompletedSessions') || 0);
  if (status === 'Critical' || status === 'Behind') return completed === 0 ? 'Not Started' : 'Needs Attention';
  return status;
};
const escCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
const escHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export default function HeadMonitoring() {
  const [params, setParams] = useSearchParams();
  const [mentors, setMentors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const school = params.get('school') || '';
  const status = params.get('status') || '';
  const [accountStatus, setAccountStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState({});
  const [periodHistory, setPeriodHistory] = useState([]);
  const [period, setPeriod] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [department, setDepartment] = useState('');
  const [course, setCourse] = useState('');
  useEffect(() => {
    let alive = true;
    const query = period ? (() => {
      const [schoolYear, semester] = period.split('|');
      return `MonitorActivities?includeInactive=true&schoolYear=${encodeURIComponent(schoolYear)}&semester=${encodeURIComponent(semester)}`;
    })() : 'MonitorActivities?includeInactive=true';
    setLoading(true);
    Promise.all([
      apiRequest(query, 'GET', null, true),
      apiRequest('Settings', 'GET', null, true),
      apiRequest('Settings/period-history', 'GET', null, true),
      MentorSchools.load(),
    ]).then(([data, settingsData, history]) => {
      if (!alive) return;
      setMentors(rows(data));
      setSettings(settingsData || {});
      setPeriodHistory(rows(history));
      setError('');
    }).catch(err => { if (alive) setError(err?.message || 'Unable to load mentor monitoring.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period]);
  const currentPeriod = `${val(settings, 'schoolYear', 'SchoolYear') || ''}|${val(settings, 'semester', 'Semester') || ''}`;
  const periods = useMemo(() => {
    const unique = new Map();
    periodHistory.forEach(item => {
      const schoolYear = val(item, 'schoolYear', 'SchoolYear');
      const semester = val(item, 'semester', 'Semester');
      if (schoolYear && semester) unique.set(`${schoolYear}|${semester}`, { schoolYear, semester });
    });
    return [...unique].map(([key, value]) => ({ key, ...value }))
      .filter(item => item.key !== currentPeriod)
      .sort((a, b) => String(b.schoolYear).localeCompare(String(a.schoolYear)) || String(b.semester).localeCompare(String(a.semester)));
  }, [periodHistory, currentPeriod]);
  const schools = useMemo(() => [...new Set(mentors.flatMap(row => MentorSchools.schoolsOf(row)))], [mentors]);
  const departments = MentorSchools.deptOptions(school, mentors);
  const courses = MentorSchools.courseOptions(school, mentors);
  const filtered = useMemo(() => mentors.filter(row => {
    const matchesSearch = `${mentorName(row)} ${schoolName(row)} ${val(row, 'departmentName', 'DepartmentName', 'department', 'Department') || ''} ${val(row, 'sections', 'Sections') || ''}`.toLowerCase().includes(search.toLowerCase());
    const active = val(row, 'isActive', 'IsActive', 'active', 'Active');
    const rowStatus = progressStatus(row);
    const matchesSchool = MentorSchools.inSchool(row, school);
    const matchesDepartment = MentorSchools.inDept(row, department);
    const matchesCourse = MentorSchools.inCourse(row, course);
    const matchesStatus = !status || rowStatus.toLowerCase() === status.toLowerCase();
    const matchesAccount = accountStatus === 'all' || ((active !== false) === (accountStatus === 'active'));
    return matchesSearch && matchesSchool && matchesDepartment && matchesCourse && matchesStatus && matchesAccount;
  }), [mentors, search, school, department, course, status, accountStatus]);
  const updateFilter = (key, value) => setParams(previous => { const next = new URLSearchParams(previous); value ? next.set(key, value) : next.delete(key); return next; }, { replace: true });
  const exportCsv = () => {
    if (!filtered.length) return;
    const header = ['Name', 'Department', 'School', 'Sections', 'Mentees', 'Completed Sessions', 'Required Sessions', 'Progress %', 'Performance Score', 'Timeliness %', 'Completeness %', 'Evaluation Rating %', 'Status'];
    const values = filtered.map(row => [
      `${val(row, 'lastName', 'LastName') || ''}, ${val(row, 'firstName', 'FirstName') || ''}`,
      val(row, 'departmentName', 'DepartmentName') || '', schoolName(row),
      val(row, 'sectionCount', 'SectionCount') ?? 0, val(row, 'menteeCount', 'MenteeCount') ?? 0,
      val(row, 'completedSessions', 'CompletedSessions') ?? 0, val(row, 'requiredSessions', 'RequiredSessions') ?? 0,
      val(row, 'progressPercent', 'ProgressPercent') ?? 0, val(row, 'overallPercent', 'OverallPercent') ?? 'Pending',
      val(row, 'timelinessPercent', 'TimelinessPercent') ?? 'Pending',
      val(row, 'completenessPercent', 'CompletenessPercent') ?? 0,
      val(row, 'evaluationRatingPercent', 'EvaluationRatingPercent') ?? '',
      progressStatus(row),
    ]);
    const blob = new Blob(['\ufeff' + [header, ...values].map(row => row.map(escCsv).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mentor-monitoring-${(school || 'all').replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const printReport = () => {
    if (!filtered.length || reportBusy) return;
    setReportBusy(true);
    const reportRows = filtered.map((row, index) => `<tr><td>${index + 1}</td><td>${escHtml(mentorName(row))}</td><td>${escHtml(val(row, 'departmentName', 'DepartmentName') || '—')}</td><td>${val(row, 'sectionCount', 'SectionCount') ?? 0}</td><td>${val(row, 'menteeCount', 'MenteeCount') ?? 0}</td><td>${val(row, 'completedSessions', 'CompletedSessions') ?? 0} / ${val(row, 'requiredSessions', 'RequiredSessions') ?? 0}</td><td>${val(row, 'progressPercent', 'ProgressPercent') ?? 0}%</td><td>${val(row, 'overallPercent', 'OverallPercent') ?? 'Pending'}${val(row, 'overallPercent', 'OverallPercent') != null ? '%' : ''}</td><td>${escHtml(progressStatus(row))}</td></tr>`).join('');
    const win = window.open('', '_blank', 'width=1150,height=820');
    setReportBusy(false);
    if (!win) return;
    const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    win.document.write(`<!doctype html><html><head><title>Mentor Progress Report</title><style>body{font:12px Arial;margin:24px;color:#111}header{text-align:center;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}img{height:50px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}tr:nth-child(even){background:#f8fafc}@media print{button{display:none}}</style></head><body><header><img src="/IMAGES/FAITH-Colleges-Logo.png"><h2>Mentoring Program — Mentor Progress Report</h2><p>${escHtml(school || 'All Schools')} · Generated ${date} · ${filtered.length} mentors</p></header><table><thead><tr><th>#</th><th>Mentor</th><th>Department</th><th>Sections</th><th>Mentees</th><th>Sessions</th><th>Progress</th><th>Score</th><th>Status</th></tr></thead><tbody>${reportRows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  return <Page id="HEAD/mentor-performance"><div className="main-wrapper"><main className="page-content">
    <div className="page-header"><div><h1>Mentor Monitoring</h1><p>Monitor mentor activity and progress across schools.</p></div></div>
    <div className="school-landing"><div className="sl-grid monitoring-school-strip" role="region" aria-label="School filters">
      <button type="button" className={!school ? 'active' : ''} onClick={() => updateFilter('school', '')}>All Schools <strong>{mentors.length}</strong></button>
      {schools.map(item => <button type="button" className={school === item ? 'active' : ''} key={item} onClick={() => updateFilter('school', school === item ? '' : item)}>{item}<strong>{mentors.filter(mentor => MentorSchools.inSchool(mentor, item)).length}</strong></button>)}
    </div></div>
    <section className="filter-bar" aria-label="Monitoring filters">
      <label>School <Select value={school} onChange={e => updateFilter('school', e.target.value)}><option value="">All Schools</option>{schools.map(item => <option key={item} value={item}>{item}</option>)}</Select></label>
      <label>Department <select value={department} onChange={e => { setDepartment(e.target.value); setCourse(''); }}><option value="">All Departments</option>{departments.filter(item => !item.group).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}{departments.filter(item => item.group).map(group => <optgroup key={group.group} label={group.group}>{group.options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>)}</select></label>
      <label>Course <select value={course} onChange={e => setCourse(e.target.value)}><option value="">All Courses</option>{courses.filter(item => !item.group).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}{courses.filter(item => item.group).map(group => <optgroup key={group.group} label={group.group}>{group.options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>)}</select></label>
      <label>Progress <Select value={status} onChange={e => updateFilter('status', e.target.value)}><option value="">All Progress Statuses</option><option value="Excellent">Excellent</option><option value="On Track">On Track</option><option value="Needs Attention">Needs Attention</option><option value="Not Started">Not Started</option><option value="Pending">Pending</option></Select></label>
      <label>Account <Select value={accountStatus} onChange={e => setAccountStatus(e.target.value)}><option value="active">Active Accounts</option><option value="inactive">Deactivated Accounts</option><option value="all">All Accounts</option></Select></label>
      <label>Period <Select value={period} onChange={e => setPeriod(e.target.value)}><option value="">Current Semester</option>{periods.map(item => <option key={item.key} value={item.key}>{item.semester}, SY {item.schoolYear}</option>)}</Select></label>
      <label>Search <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mentors or schools" /></label>
      <div className="report-actions"><button type="button" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button><button type="button" onClick={printReport} disabled={!filtered.length || reportBusy}>Print Report</button></div>
    </section>
    {loading ? <div role="status">Loading mentor monitoring…</div> : error ? <div role="alert" className="error-message">{error}</div> : filtered.length ? <div className="table-responsive"><table>
      <thead><tr><th>Mentor</th><th>School</th><th>Sessions</th><th>Progress</th><th>Status</th><th /></tr></thead>
      <tbody>{filtered.map((row, index) => {
        const id = mentorId(row);
        const completed = val(row, 'completedSessions', 'CompletedSessions') ?? 0;
        const progress = val(row, 'overallPercent', 'OverallPercent', 'completionRate', 'CompletionRate', 'overallProgress', 'OverallProgress') ?? 0;
        const rawStatus = val(row, 'progressStatus', 'ProgressStatus') || 'Critical';
        const progressStatus = rawStatus === 'Critical' || rawStatus === 'Behind' ? (Number(completed) ? 'Needs Attention' : 'Not Started') : rawStatus;
        return <tr key={id ?? index}><td>{mentorName(row)}</td><td>{schoolName(row)}</td>
          <td>{val(row, 'completedSessions', 'CompletedSessions') ?? 0} / {val(row, 'requiredSessions', 'RequiredSessions') ?? '—'}</td>
          <td>{progress}%</td><td>{(val(row, 'isActive', 'IsActive') ?? true) === false ? 'Deactivated' : progressStatus}</td>
          <td>{id && <Link className="btn-view" to={`/head/monitoring/${encodeURIComponent(id)}${school ? `?school=${encodeURIComponent(school)}` : ''}`}>View details</Link>}</td></tr>;
      })}</tbody>
    </table></div> : <Empty>{mentors.length ? 'No mentor records found. Try changing your filters.' : 'No mentor records found. Mentor activity will appear here.'}</Empty>}
  </main></div></Page>;
}
