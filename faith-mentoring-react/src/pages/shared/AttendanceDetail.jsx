import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import ErrorModal from '../../components/ErrorModal.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { AttendanceMetrics } from '../../lib/attendance-metrics.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { useStayOnBack } from '../mentor/useStayOnBack.js';

// One mentor's mentees by section, with each mentee's attendance history (Head:
// HEAD/HTML/attendance-detail.html; Admin: ADMIN_/HTML/attendance-detail.html, which calls them
// "groups", adds breadcrumbs and orders the mentee card slightly differently).
const VARIANTS = {
  head: { page: 'HEAD/attendance-detail', list: '/head/attendance', listName: 'Attendance Summary', unit: 'section', unitTitle: 'Sections', placeholder: 'Filter by section or course…', loadingCls: 'empty-state', ctaFirst: false },
  admin: { page: 'ADMIN_/attendance-detail', list: '/admin/attendance', listName: 'Attendance Logs', unit: 'group', unitTitle: 'Groups', placeholder: 'Filter by group or course…', loadingCls: 'tab-loading', ctaFirst: true, crumbs: true },
};

function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 6;
}
// Admin's heading fallback for a group without a section: its single course, else "Unspecified group".
function groupHeading(group) {
  if (group.sectionCode && group.sectionCode !== '—') return group.sectionCode;
  const courses = [...new Set(group.mentees.map(m => (m.course || '').trim()))];
  return courses.length === 1 && courses[0] && courses[0] !== '—' ? courses[0] : 'Unspecified group';
}
const byMenteeName = (a, b) => `${a.menteeLastName} ${a.menteeFirstName}`.localeCompare(`${b.menteeLastName} ${b.menteeFirstName}`);

export default function AttendanceDetail({ variant }) {
  const v = VARIANTS[variant];
  useStayOnBack();
  const navigate = useNavigate();
  const location = useLocation();
  const mentorId = parseInt(useParams().id, 10);
  const school = new URLSearchParams(location.search).get('school');
  const listHref = v.list + (school ? `?school=${encodeURIComponent(school)}` : '');
  const [data, setData] = useState({ state: 'loading' });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  // Sections toggled since the last re-render: sectionCode -> open (a closed one keeps display:none).
  const [toggled, setToggled] = useState(() => new Map());
  const [history, setHistory] = useState(null);       // { title, sub, state, records }
  const [error, setError] = useState({ shown: false, text: 'An error occurred.' });

  useEffect(() => {
    if (!mentorId) { navigate(v.list, { replace: true }); return; }
    apiRequest(`AttendanceLogs/${mentorId}/mentees`, 'GET', null, true)
      .then(d => {
        setData({ state: 'ok', mentor: d.mentor, mentees: d.mentees || [], required: d.requiredSessions ?? 0 });
        if (d.mentor) document.title = `${d.mentor.firstName} ${d.mentor.lastName} — Attendance`;
      })
      .catch(e => { console.error('Error loading attendance detail:', e); setError({ shown: true, text: 'Failed to load data. Please refresh.' }); });
  }, []);

  // Filters re-render the sections, which closes any opened ones (as before).
  useEffect(() => setToggled(new Map()), [q, status]);

  async function openHistory(m) {
    setHistory({ title: `${m.menteeFirstName} ${m.menteeLastName}`, sub: m.studentNumber || 'Mentee', state: 'loading' });
    try {
      const records = await apiRequest(`AttendanceLogs/mentee/${m.menteeID}?mentorId=${mentorId}`, 'GET', null, true);
      setHistory(h => h && { ...h, state: 'ok', records });
    } catch {
      setHistory(h => h && { ...h, state: 'error' });
    }
  }

  const mentor = data.mentor;
  const required = data.required ?? 0;
  let filtered = data.mentees || [];
  const query = q.trim().toLowerCase();
  if (query) filtered = filtered.filter(m => (m.sectionCode || '').toLowerCase().includes(query) || (m.course || '').toLowerCase().includes(query));
  if (status) filtered = filtered.filter(m => AttendanceMetrics.completion(m.presentCount, required) === status);

  const sectionMap = {};
  filtered.forEach(m => {
    const key = m.sectionCode || '—';
    if (!sectionMap[key]) sectionMap[key] = { sectionCode: key, course: m.course || '—', yearLevel: m.yearLevel || '', mentees: [] };
    sectionMap[key].mentees.push(m);
  });
  const sections = Object.values(sectionMap).sort((a, b) => a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true, sensitivity: 'base' }));
  const heading = sec => variant === 'admin' ? groupHeading(sec) : sec.sectionCode;

  const menteeCard = m => {
    const initials = ((m.menteeFirstName?.[0] || '') + (m.menteeLastName?.[0] || '')).toUpperCase();
    const rate = required > 0 ? Math.round(m.presentCount / required * 100) : 0;
    const cta = (
      <div className="mnc-bottom-row">
        <span className="mnc-cta">{'View History '}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></span>
      </div>
    );
    return (
      <div key={m.menteeID} className={'mentee-card' + (m.isDropOut ? ' att-dropout' : '')} onClick={e => { e.stopPropagation(); openHistory(m); }}>
        <div className={`mnc-avatar av-${avatarIndex(m.menteeFirstName + m.menteeLastName)}`}>{initials}</div>
        {' '}
        <div className="mnc-main">
          <div className="mnc-top-row">
            <div className="mnc-info">
              <div className="mnc-name">{`${m.menteeFirstName} ${m.menteeLastName}`}{m.isDropOut && <>{' '}<span className="mnc-dropout-chip">Drop Out</span></>}</div>
              {' '}
              <div className="mnc-sub">{m.studentNumber || '—'}</div>
            </div>
          </div>
          {' '}
          {v.ctaFirst && <>{cta}{' '}</>}
          <div className="mnc-rate-label">Semester Completion <span>{`${m.presentCount}/${required} attended`}</span></div>
          {' '}
          <div className="mnc-bar-row">
            <div className="mnc-bar-bg">
              <div className="mnc-bar-fill attendance-neutral" style={{ width: `${rate}%` }}></div>
            </div>
            {' '}
            <span className="mnc-rate-txt completion-rate">{required === 0 ? '—' : rate + '%'}</span>
          </div>
          {!v.ctaFirst && <>{' '}{cta}</>}
        </div>
      </div>
    );
  };
  const secHeader = (sec, toggle) => {
    const courseStr = [sec.course, sec.yearLevel].filter(Boolean).join(' · ');
    const n = sec.mentees.length;
    return (
      <div className={'sec-header' + (toggle ? '' : ' sec-header-static')} onClick={toggle}>
        <div className="sec-left">
          <div className="sec-code">{heading(sec)}</div>
          {' '}
          <div className="sec-course">{courseStr}</div>
        </div>
        {' '}
        <div className="sec-right">
          <div className="sec-meta">{`${n} mentee${n !== 1 ? 's' : ''}`}</div>
          {toggle && <>{' '}<svg className={'sec-chevron' + (toggled.get(sec.sectionCode) ? ' rotated' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg></>}
        </div>
      </div>
    );
  };

  let grid, count = '';
  if (data.state === 'loading') grid = <Empty className="empty-state"><span className="spinner"></span>{' '}Loading…</Empty>;
  else if (!filtered.length) {
    count = `0 ${v.unit}s`;
    grid = <Empty key={`none-${q}-${status}`} className="empty-state" style={{ gridColumn: '1/-1' }}>No mentees assigned to this mentor.</Empty>;
  } else {
    count = `${sections.length} ${v.unit}${sections.length !== 1 ? 's' : ''}`;
    grid = sections.length === 1
      ? (
        <div className="section-card open">
          {secHeader(sections[0], null)}
          {' '}
          <div className="sec-body" style={{ display: 'block' }}>
            <div className="sec-mentee-grid">{[...sections[0].mentees].sort(byMenteeName).map(menteeCard)}</div>
          </div>
        </div>
      )
      : sections.map((sec, idx) => {
        const isOpen = !!toggled.get(sec.sectionCode);
        return (
          <div key={sec.sectionCode} className={'section-card' + (isOpen ? ' open' : '')} id={`sec-${idx}`}>
            {secHeader(sec, () => setToggled(t => new Map(t).set(sec.sectionCode, !t.get(sec.sectionCode))))}
            {' '}
            <div className="sec-body" id={`sec-body-${idx}`} style={toggled.has(sec.sectionCode) ? { display: isOpen ? 'block' : 'none' } : undefined}>
              <div className="sec-mentee-grid">{[...sec.mentees].sort(byMenteeName).map(menteeCard)}</div>
            </div>
          </div>
        );
      });
  }

  let historyBody = null;
  if (history) {
    const box = text => variant === 'admin'
      ? <div className="tab-loading">{text}</div>
      : <Empty key={text} className="empty-state">{text}</Empty>;
    if (history.state === 'loading') historyBody = variant === 'admin' ? <div className="tab-loading"><span className="spinner"></span>{' '}Loading…</div> : <Empty key="l" className="empty-state"><span className="spinner"></span>{' '}Loading…</Empty>;
    else if (history.state === 'error') historyBody = box('Failed to load history.');
    else if (!history.records.length) historyBody = box('No sessions found for this mentee.');
    else {
      // Future scheduled sessions have no attendance yet.
      const relevant = history.records.filter(r => r.sessionStatus !== 'Scheduled');
      historyBody = !relevant.length ? box('No completed sessions for this mentee yet.') : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr><th>Session</th><th>Date</th><th>Status</th><th>Attendance</th></tr>
            </thead>
            <tbody>
              {relevant.map((r, i) => {
                const date = r.sessionDate ? new Date(r.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                const att = LogsheetData.attendanceState({ ...r, attendanceRecorded: r.isRecorded });
                const badge = !r.isRecorded ? <span className="badge-unrecorded">Not recorded</span>
                  : att === true ? <span className="badge-present">Present</span>
                    : att === false ? <span className="badge-absent">Absent</span>
                      : <span className="badge-unrecorded">Unverified</span>;
                return (
                  <tr key={i}>
                    {/* A make-up shows the checkpoint it caught up on, when one was picked. */}
                    <td>{r.isMakeup
                      ? <span className="session-num session-num-makeup">{`Make-up${r.slotName ? `: ${r.slotName}` : ''}`}</span>
                      : <span className="session-num">{r.slotName || 'Session'}</span>}</td>
                    <td className="td-primary td-nowrap">{date}</td>
                    <td><span className={`badge-status ${(r.sessionStatus || '').toLowerCase()}`}>{r.sessionStatus}</span></td>
                    <td>{badge}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
  }

  const heroMeta = mentor ? [
    mentor.school && ['school', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>, mentor.school],
    mentor.department && ['dept', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>, mentor.department],
    mentor.email && ['email', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>, mentor.email],
  ].filter(Boolean) : [];
  const sectionTags = mentor ? (mentor.sections || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  const crumbSchool = school || mentor?.school || '';

  return (
    <Page id={v.page}>
      <div className="main-wrapper">
        <main className="page-content">
          {v.crumbs && <>
            <nav className="att-crumbs" id="attCrumbs" aria-label="Breadcrumb">
              <a href={v.list}>{v.listName}</a>
              {mentor
                ? <>
                  {crumbSchool && <><span className="att-crumb-sep" aria-hidden="true">&rsaquo;</span><a href={`${v.list}?school=${encodeURIComponent(crumbSchool)}`}>{crumbSchool}</a></>}
                  <span className="att-crumb-sep" aria-hidden="true">&rsaquo;</span><span className="att-crumb-current" aria-current="page">{`${mentor.firstName} ${mentor.lastName}`}</span>
                </>
                : <>{' '}<span className="att-crumb-sep" aria-hidden="true">&rsaquo;</span>{' '}<span className="att-crumb-current" id="crumbMentor" aria-current="page">Mentor</span></>}
            </nav>
            {' '}
          </>}
          <a href={listHref} className="btn-back" id={variant === 'head' ? 'backBtn' : undefined} onClick={e => { e.preventDefault(); navigate(listHref); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            {` Back to ${v.listName}`}
          </a>
          {' '}
          {/* Mentor hero */}
          <div className="mentor-hero" id="mentorHero">
            <div className={mentor ? `hero-avatar av-${avatarIndex(mentor.firstName + mentor.lastName)}` : 'hero-avatar av-0'} id="heroAvatar">{mentor ? ((mentor.firstName?.[0] || '') + (mentor.lastName?.[0] || '')).toUpperCase() : '—'}</div>
            {' '}
            <div className="hero-info">
              <div className="hero-name" id="heroName">{mentor ? `${mentor.firstName} ${mentor.lastName}` : 'Loading…'}</div>
              {' '}
              <div className="hero-meta" id="heroMeta">{mentor && (heroMeta.length ? heroMeta.map(([k, icon, text]) => <span key={k} className="hero-meta-item">{icon}{text}</span>) : 'Mentor')}</div>
              {sectionTags.length > 0 && <div className="hero-tags">{sectionTags.map(s => <span key={s} className="hero-section-tag">{s}</span>)}</div>}
            </div>
          </div>
          {' '}
          {/* Sections accordion */}
          <div className="sections-wrapper">
            <div className="sections-head">
              <span className="sections-title">{v.unitTitle}</span>
              {' '}
              <span id="sectionCount" className="sections-count">{count}</span>
            </div>
            {' '}
            <div className="att-toolbar" style={{ marginBottom: '14px' }}>
              <div className="search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                {' '}
                <input type="text" id="sectionSearch" placeholder={v.placeholder} autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
              </div>
              {' '}
              <Select id="statusFilter" className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">All Completion Statuses</option>
                <option value="not-started">Not Started</option>
                <option value="in-progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="not-configured">No Requirement Set</option>
              </Select>
              {' '}
              <div className="att-tip-wrap">
                <i className="ti ti-alert-circle att-tip-icon"></i>
                {' '}
                <div className="att-tip-box" id="attTipBox">{data.state === 'ok' && <><div className="att-tip-title">Semester Completion</div><div className="att-tip-row">{`Checkpoints attended out of ${required} required this semester. Regular and make-up sessions for the same checkpoint count once. Present/Absent records are available in View History.`}</div></>}</div>
              </div>
              {' '}
              <button className="filter-reset" onClick={() => { setQ(''); setStatus(''); }}>Clear</button>
            </div>
            {' '}
            <div className="section-cards-list" id="sectionCardsGrid">{grid}</div>
          </div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Attendance History Modal */}
      <div className="modal-overlay" id="historyOverlay" style={{ display: history ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) setHistory(null); }}>
        <div className="history-modal" onClick={e => e.stopPropagation()}>
          <div className="hm-header">
            <div>
              <div className="hm-title" id="hmTitle">{history ? history.title : 'Attendance History'}</div>
              {' '}
              <div className="hm-sub" id="hmSub">{history ? history.sub : ''}</div>
            </div>
            {' '}
            <button className="hm-close" onClick={() => setHistory(null)}>&times;</button>
          </div>
          {' '}
          <div className="hm-body">
            <div id="historyContent">{historyBody || (variant === 'admin'
              ? <div className="tab-loading"><span className="spinner"></span>{' '}Loading…</div>
              : <Empty className="empty-state"><span className="spinner"></span>{' '}Loading…</Empty>)}</div>
          </div>
          {' '}
          <div className="hm-footer">
            <button className="btn-outline" onClick={() => setHistory(null)}>Close</button>
          </div>
        </div>
      </div>

      {/* Error Modal */}
      <ErrorModal open={error.shown} message={error.text} onClose={() => setError(x => ({ ...x, shown: false }))} />
    </Page>
  );
}
