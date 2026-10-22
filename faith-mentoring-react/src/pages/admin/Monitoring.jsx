import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { showToast } from '../../components/Notify.jsx';

const GROUPS = ['Not Started', 'Needs Attention', 'On Track', 'Excellent', 'Pending'];
const statusOf = m => {
  const status = m.progressStatus || 'Pending';
  if (['Critical', 'Behind'].includes(status)) return Number(m.completedSessions || 0) === 0 ? 'Not Started' : 'Needs Attention';
  return status;
};
const displayName = m => `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.mentorName || `Mentor ${m.mentorID}`;
const schools = ['School of Technology', 'School of Humanities', 'School of Management'];

export default function AdminMonitoring() {
  const [params, setParams] = useSearchParams();
  const statusFilter = params.get('status') || '';
  const schoolFilter = params.get('school') || '';
  const [data, setData] = useState({ mentors: [], settings: null, periods: [], state: 'loading' });
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('');
  const [period, setPeriod] = useState('');
  const [periodRows, setPeriodRows] = useState(null);
  const [periodError, setPeriodError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiRequest('MonitorActivities', 'GET', null, true),
      apiRequest('Settings', 'GET', null, true),
      apiRequest('Settings/period-history', 'GET', null, true),
    ]).then(([monitoring, settings, periods]) => {
      if (alive) setData({ mentors: monitoring?.mentors || monitoring?.Mentors || [], settings, periods: periods || [], state: 'ready' });
    }).catch(e => { if (alive) { setData(d => ({ ...d, state: 'error' })); showToast(e.message || 'Could not load mentor monitoring.'); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setPeriodError('');
    if (!period || !period.includes('|')) { setPeriodRows(null); return; }
    const [schoolYear, semester] = period.split('|');
    let alive = true;
    apiRequest(`MonitorActivities?includeInactive=true&schoolYear=${encodeURIComponent(schoolYear)}&semester=${encodeURIComponent(semester)}`, 'GET', null, true)
      .then(result => { if (alive) setPeriodRows(result?.mentors || []); })
      .catch(error => {
        if (alive) {
          setPeriodRows([]);
          setPeriodError(error.message || 'Could not load mentor monitoring for the selected historical period.');
        }
      });
    return () => { alive = false; };
  }, [period]);
  const mentors = periodRows || data.mentors;
  const courses = [...new Set(mentors.flatMap(m => (m.sections || []).map(s => typeof s === 'string' ? s : s.course || s.sectionCode).filter(Boolean)))].sort();
  const visible = useMemo(() => mentors.filter(m => {
    const status = statusOf(m);
    if (statusFilter && status !== statusFilter) return false;
    const name = `${displayName(m)} ${m.departmentName || ''} ${m.school || ''}`.toLowerCase();
    if (query && !name.includes(query.toLowerCase())) return false;
    if (schoolFilter && !(m.school === schoolFilter || (m.mentees || []).some(x => x.school === schoolFilter))) return false;
    if (course && !(m.sections || []).some(s => (typeof s === 'string' ? s : s.course || s.sectionCode) === course)) return false;
    return true;
  }).sort((a, b) => displayName(a).localeCompare(displayName(b))), [mentors, statusFilter, schoolFilter, course, query]);
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };
  function exportCsv() {
    if (!visible.length) { showToast('No mentors to export.', 'info'); return; }
    const quote = value => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d\s().-]+$/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = [
      ['Name', 'Department', 'School', 'Mentees', 'Completed Sessions', 'Required Sessions', 'Progress %', 'Status'],
      ...visible.map(m => [displayName(m), m.departmentName, m.school, m.menteeCount, m.completedSessions, m.requiredSessions, m.progressPercent, statusOf(m)]),
    ];
    const blob = new Blob([`\ufeff${rows.map(row => row.map(quote).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'mentor-monitoring.csv'; anchor.click(); URL.revokeObjectURL(url);
  }

  return <Page id="ADMIN_/sessions"><main className="main-wrapper"><div className="page-content">
    <header className="page-header"><div className="page-header-top"><div><h1>Mentor Monitoring</h1><p>Review mentor progress, performance and assigned sections.</p></div>
      <span className="semester-badge">{data.settings ? `${data.settings.Semester || ''}, SY ${data.settings.SchoolYear || ''}` : 'Current semester'}</span></div></header>
    <div className="school-cards-grid">
      {schools.map(school => {
        const group = mentors.filter(m => m.school === school || (m.mentees || []).some(me => me.school === school));
        const active = schoolFilter === school;
        return <button type="button" key={school} className={`sl-card ${active ? 'active' : ''}`} onClick={() => { setFilter('school', active ? '' : school); setCourse(''); }}>
          <div className="sl-content"><b className="sl-name">{school}</b><span className="sl-meta">{group.length} mentor{group.length !== 1 ? 's' : ''} · {group.reduce((n, m) => n + (m.menteeCount || 0), 0)} mentees</span></div>
        </button>;
      })}
    </div>
    <div className="panel-header"><div><span className="panel-title">{schoolFilter || 'All Schools'}</span><span className="panel-count"> ({visible.length})</span></div><div className="panel-actions"><button className="btn-export" onClick={exportCsv}><i className="ti ti-download" /> Export CSV</button><button className="btn-primary" onClick={() => window.print()}><i className="ti ti-printer" /> Print Report</button></div></div>
    <div className="toolbar">
      <label className="search-box"><i className="ti ti-search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search mentors…" /></label>
      <Select className="filter-select" value={statusFilter} onChange={e => setFilter('status', e.target.value)}><option value="">All Statuses</option>{GROUPS.map(s => <option key={s}>{s}</option>)}</Select>
      <Select className="filter-select" value={course} onChange={e => setCourse(e.target.value)}><option value="">All Courses</option>{courses.map(s => <option key={s}>{s}</option>)}</Select>
      <Select className="filter-select" value={period} onChange={e => setPeriod(e.target.value)}><option value="">Current Semester</option>{[...new Map(data.periods.map(p => [`${p.schoolYear}|${p.semester}`, p])).values()].map(p => <option key={`${p.schoolYear}|${p.semester}`} value={`${p.schoolYear}|${p.semester}`}>{p.semester}, SY {p.schoolYear}</option>)}</Select>
      {(statusFilter || schoolFilter || course || period || query) && <button className="filter-reset" onClick={() => { setParams({}); setCourse(''); setPeriod(''); setQuery(''); }}>Clear</button>}
    </div>
    {periodError && <div className="error-message" role="alert">{periodError}</div>}
    <div className="mentor-list" id="mentorCardsGrid">
      {data.state === 'loading' ? <Empty className="empty-state">Loading mentors…</Empty> : data.state === 'error' ? <Empty className="empty-state">Failed to load data. Please refresh.</Empty> : visible.map(m => {
        const status = statusOf(m);
        const id = m.mentorID ?? m.userID;
        const sections = (m.sections || []).map(s => typeof s === 'string' ? s : s.sectionCode || s.course).filter(Boolean);
        return <article className="mentor-card" key={id}>
          <div className="mrc-top"><div className="mr-avatar">{`${m.firstName?.[0] || ''}${m.lastName?.[0] || ''}`.toUpperCase() || '?'}</div><div className="mr-info"><b className="mr-name">{displayName(m)}</b><span className="mr-dept">{[m.departmentName, m.school].filter(Boolean).join(' · ') || '—'}</span></div></div>
          <div className="mr-sections">{sections.map(s => <span className="mc-section-tag" key={s}>{s}</span>)}</div>
          <div className="mentor-progress"><span>{m.completedSessions || 0} / {m.requiredSessions || 0} completed</span><span>{m.progressPercent ?? 0}%</span><div className="progress-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(m.progressPercent) || 0))}%` }} /></div></div>
          <div className="mrc-footer"><span className={`mc-badge ${status.toLowerCase().replaceAll(' ', '')}`}>{status}</span><Link className="mr-view-btn" to={`/admin/monitoring/${id}${schoolFilter ? `?school=${encodeURIComponent(schoolFilter)}` : ''}`}>View Details <i className="ti ti-chevron-right" /></Link></div>
        </article>;
      })}
      {data.state === 'ready' && !visible.length && <Empty className="empty-state">No mentors match the selected filters.</Empty>}
    </div>
  </div></main></Page>;
}
