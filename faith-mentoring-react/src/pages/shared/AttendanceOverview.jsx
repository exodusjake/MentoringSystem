import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import OptionList from '../../components/OptionList.jsx';
import SchoolCards from '../../components/SchoolCards.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { exportAttendanceCsv, printAttendanceReport } from '../../lib/attendanceReport.js';
import { MentorSchools } from '../../lib/mentor-schools.js';
import { useStayOnBack } from '../mentor/useStayOnBack.js';

// Head "Attendance Summary" (HEAD/HTML/attendance-summary.html) and Admin "Attendance Logs"
// (ADMIN_/HTML/attendance-logs.html): checkpoint attendance per mentor, with school cards, course
// filter, CSV export and a printable report. The two portals differ only in the labels below.
const VARIANTS = {
  head: { page: 'HEAD/attendance-summary', title: 'Attendance Summary', loading: 'Loading mentors…', empty: 'No mentors match the current filters.', conducted: ' Conducted', role: 'Head Admin', base: '/head/attendance' },
  admin: { page: 'ADMIN_/attendance-logs', title: 'Attendance Logs', loading: 'Loading…', empty: 'No mentors found.', conducted: '', role: 'Admin', base: '/admin/attendance' },
};

function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 6;
}
const clampPercent = v => !Number.isFinite(v) ? 0 : Math.min(100, Math.max(0, v));
const SCHOOL_NAMES = { sot: 'School of Technology', soh: 'School of Humanities', som: 'School of Management' };

// Inline-styled toolbar buttons with the original's hover colors.
const hover = (rest, over) => ({ onMouseOver: e => Object.assign(e.currentTarget.style, over), onMouseOut: e => Object.assign(e.currentTarget.style, rest) });

export default function AttendanceOverview({ variant }) {
  const v = VARIANTS[variant];
  useStayOnBack();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState({ state: 'loading' });
  const [activeSchool, setActiveSchool] = useState('');
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [res] = await Promise.all([apiRequest('AttendanceLogs', 'GET', null, true), MentorSchools.load()]);
        // Returning from a mentor's detail page keeps the school filter (?school=).
        const school = new URLSearchParams(location.search).get('school');
        if (school) setActiveSchool(decodeURIComponent(school));
        setData({ state: 'ok', mentors: res.mentors ?? [] });
      } catch (e) {
        console.error(`Failed to load ${variant === 'head' ? 'attendance summary' : 'attendance logs'}:`, e);
        setData({ state: 'error' });
      }
    })();
  }, []);

  const mentors = data.mentors || [];
  const courseOptions = useMemo(() => data.state === 'ok' ? MentorSchools.courseOptions(activeSchool, mentors) : [{ value: '', label: 'All Courses' }], [data, activeSchool]);
  // A course choice is kept only while it's still listed (the list follows the school).
  const courseValue = MentorSchools.optionListed(courseOptions, course) ? course : '';

  // A mentor's records, present and sessions within the selected school / department / course.
  const { dept: deptSel, course: sectionSel } = MentorSchools.courseFilter(courseValue);
  function scopedStats(m) {
    const whole = { records: m.totalAttendees || 0, present: m.presentCount || 0, sessions: m.totalSessions || 0 };
    const ownDept = deptSel && MentorSchools.noSchoolDept(m) === deptSel;
    if (!m.sectionStats || (!activeSchool && (!deptSel || ownDept) && !sectionSel)) return whole;
    return m.sectionStats
      .filter(x => MentorSchools.sectionsIn([x.sectionCode], activeSchool, ownDept ? '' : deptSel).length && (!sectionSel || String(x.sectionCode).toUpperCase() === String(sectionSel).toUpperCase()))
      .reduce((t, x) => ({ records: t.records + x.records, present: t.present + x.present, sessions: t.sessions + x.sessions }), { records: 0, present: 0, sessions: 0 });
  }

  const query = q.trim().toLowerCase();
  const filtered = mentors.filter(m => {
    if (query && !`${m.firstName} ${m.lastName}`.toLowerCase().includes(query)) return false;
    if (!MentorSchools.inCourse(m, courseValue)) return false;
    if (activeSchool && !MentorSchools.inSchool(m, activeSchool)) return false;
    return true;
  });

  let stats = null, cards = null;
  if (data.state === 'ok') {
    const scoped = filtered.map(scopedStats);
    const total = scoped.reduce((s, x) => s + x.records, 0);
    const present = scoped.reduce((s, x) => s + x.present, 0);
    stats = { total, present, absent: total - present, rate: `${clampPercent(total > 0 ? Math.round(present / total * 100) : 0)}%` };
    const mentorsIn = {}, sessionsIn = {};
    for (const [k, school] of Object.entries(SCHOOL_NAMES)) {
      const rows = mentors.filter(m => MentorSchools.inSchool(m, school));
      mentorsIn[k] = rows.length;
      sessionsIn[k] = rows.reduce((s, m) => s + (m.sectionStats
        ? m.sectionStats.filter(x => MentorSchools.sectionsIn([x.sectionCode], school, '').length).reduce((t, x) => t + x.sessions, 0)
        : (m.totalSessions || 0)), 0);
    }
    cards = { mentors: mentorsIn, sessions: sessionsIn };
  }

  function filterBySchool(school) {
    // A toggle: the active school again clears back to all schools.
    setActiveSchool(a => a === school ? '' : school);
    setQ('');
    setCourse('');
  }
  const openDetail = id => navigate(`${v.base}/${id}${activeSchool ? `?school=${encodeURIComponent(activeSchool)}` : ''}`);

  let list;
  if (data.state === 'loading') list = <Empty className="empty-state"><span className="spinner"></span>{' '}{v.loading}</Empty>;
  else if (data.state === 'error') list = <Empty className="empty-state">Failed to load data. Please refresh.</Empty>;
  else if (!filtered.length) list = <Empty key={`none-${activeSchool}-${q}-${courseValue}`} className="empty-state">{v.empty}</Empty>;
  else list = [...filtered].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)).map(m => {
    const initials = ((m.firstName?.[0] || '') + (m.lastName?.[0] || '')).toUpperCase() || 'M';
    // The school is shown only while all schools are listed.
    const dept = activeSchool ? (m.department || 'No department info') : [m.department, m.school].filter(Boolean).join(' · ') || 'No department info';
    const sessions = scopedStats(m).sessions;
    return (
      <div key={m.mentorID} className="att-mentor-card">
        <div className="amc-top">
          <div className={`amr-avatar av-${avatarIndex(m.firstName + m.lastName)}`}>{initials}</div>
          {' '}
          <div className="amr-info">
            <div className="amr-name">{`${m.firstName} ${m.lastName}`}</div>
            {' '}
            <div className="amr-dept">{dept}</div>
          </div>
        </div>
        {' '}
        <div className="amr-sections">{MentorSchools.courseTags(m.sections, activeSchool, courseValue).map(s => <span key={s} className="mc-section-tag">{s}</span>)}</div>
        {' '}
        <div className="amc-footer">
          <span className="amr-sessions-badge">{`${sessions} Session${sessions !== 1 ? 's' : ''}${v.conducted}`}</span>
          {' '}
          <button className="amr-view-btn" onClick={() => openDetail(m.mentorID)}>
            {'View Mentees '}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>
    );
  });

  const stat = (label, icon, id, value, note, iconCls) => (
    <div className="stat-card">
      <div className="stat-top-row">
        <div className="stat-label">{label}</div>
        {' '}
        <div className={'stat-icon' + (iconCls ? ' ' + iconCls : '')}>{icon}</div>
      </div>
      {' '}
      <div className="stat-value" id={id}>{value ?? <span className="stat-pulse">—</span>}</div>
      {' '}
      <div className="stat-note">{note}</div>
    </div>
  );
  const csvStyle = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fff', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
  const printStyle = { ...csvStyle, background: '#2563eb', color: '#fff' };

  return (
    <Page id={v.page}>
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>{v.title}</h1>
            {' '}
            <p>Checkpoint attendance by mentor. Regular and make-up sessions for the same checkpoint count once per mentee.</p>
          </div>
          {' '}
          {/* Stat Cards */}
          <div className="stats-grid">
            {stat('Checkpoint Records', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
              'statTotal', stats?.total, 'one per mentee for each completed checkpoint', 'blue')}
            {' '}
            {stat('Attended', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
              'statPresent', stats?.present, 'checkpoints with verified attendance', 'green')}
            {' '}
            {stat('Missed', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>,
              'statAbsent', stats?.absent, 'checkpoints without verified attendance', 'red')}
            {' '}
            {stat('Attendance Rate', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
              'statRate', stats?.rate, 'attended out of checkpoint records')}
          </div>
          {' '}
          {/* School Overview — click a card to filter the list below; click again to clear. */}
          <div className="school-overview-grid monitoring-school-strip" role="region" aria-label="School summary cards" tabIndex="0">
            <SchoolCards active={activeSchool} onSelect={filterBySchool} stats={[
              { id: k => `${k}Mentors`, label: 'Mentors', values: cards?.mentors },
              { id: k => `${k}Sessions`, label: 'Sessions', values: cards?.sessions },
            ]} />
          </div>
          {' '}
          {/* Search & Filters */}
          <div className="att-toolbar att-toolbar--overview att-toolbar--panel"><div className="att-filter-group">
            <div className="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              {' '}
              <input type="text" id="searchInput" placeholder="Search mentor name…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {' '}
            <Select className="filter-select" id="courseFilter" value={courseValue} onChange={e => setCourse(e.target.value)}>
              <OptionList options={courseOptions} />
            </Select>
            {' '}
            <button className="filter-reset" onClick={() => { setQ(''); setCourse(''); }}>Clear</button>
          </div><div className="att-action-group"><button style={csvStyle} onClick={() => exportAttendanceCsv(filtered, activeSchool)}
            {...hover({ background: '#fff', color: '#2563eb' }, { background: '#2563eb', color: '#fff' })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {' '}Export CSV
          </button>
            {' '}
            <button style={printStyle} onClick={() => printAttendanceReport(filtered, activeSchool, v.role)}
              {...hover({ background: '#2563eb' }, { background: '#1d4ed8' })}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
              {' '}Print Report
            </button></div>
          </div>
          {' '}
          {/* Mentor rows */}
          <div className="att-mentor-list" id="mentorCardsGrid">{list}</div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
    </Page>
  );
}
