import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { AttendanceMetrics } from '../../lib/attendance-metrics.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// HEAD/HTML/attendance-detail.html + HEAD/JS/attendance-detail.js
// ADMIN_/HTML/attendance-detail.html + ADMIN_/JS/attendance-detail.js
// Same screen in both portals (mentor → sections → mentees → attendance history). `cfg` carries the differences:
//   cfg = { pageId, base, admin: bool }   admin: breadcrumbs, "Groups" wording, group-heading fallback, tab-loading rows

function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 6;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

// Presentation fallback only; existing grouping keys and membership stay intact. (Admin)
function attendanceGroupHeading(group) {
  if (group.sectionCode && group.sectionCode !== '—') return group.sectionCode;
  const courses = [...new Set(group.mentees.map(m => (m.course || '').trim()))];
  return courses.length === 1 && courses[0] && courses[0] !== '—' ? courses[0] : 'Unspecified group';
}

const ChevronRight = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;

export default function AttendanceDetail({ cfg }) {
  useBackGuard();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mentorId = parseInt(params.get('id'), 10);
  const school = params.get('school');
  const listPath = `${cfg.base}/attendance`;
  const unit = cfg.admin ? 'group' : 'section';

  const [mentor, setMentor] = useState(null);
  const [allMentees, setAllMentees] = useState(null);       // null while loading
  const [semesterRequired, setSemesterRequired] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilterValue] = useState('');
  const [openSecs, setOpenSecs] = useState(() => new Set());
  const [history, setHistory] = useState(null);             // { open, name, sub, state: 'loading' | 'error' | records[] }
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!mentorId) return;
    (async () => {
      try {
        const data = await apiRequest(`AttendanceLogs/${mentorId}/mentees`, 'GET', null, true);
        setMentor(data.mentor || null);
        setAllMentees(data.mentees || []);
        setSemesterRequired(data.requiredSessions ?? 0);
      } catch (e) {
        console.error('Error loading attendance detail:', e);
        setErrorMsg('Failed to load data. Please refresh.');
      }
    })();
  }, []);

  useEffect(() => {
    if (mentor) document.title = `${mentor.firstName} ${mentor.lastName} — Attendance`;
  }, [mentor]);

  if (!mentorId) return <Navigate to={listPath} replace />;

  // ── Filters ──
  const q = search.trim().toLowerCase();
  let filtered = allMentees ? [...allMentees] : [];
  if (q) {
    filtered = filtered.filter(m =>
      (m.sectionCode || '').toLowerCase().includes(q) ||
      (m.course      || '').toLowerCase().includes(q)
    );
  }
  const activeStatusFilter = statusFilter || null;
  if (activeStatusFilter) {
    filtered = filtered.filter(m => AttendanceMetrics.completion(m.presentCount, semesterRequired) === activeStatusFilter);
  }
  const onSearch = v => { setSearch(v); setOpenSecs(new Set()); };
  const setStatusFilter = v => { setStatusFilterValue(v); setOpenSecs(new Set()); };
  const resetAllFilters = () => { setSearch(''); setStatusFilterValue(''); setOpenSecs(new Set()); };

  function toggleSection(idx) {
    setOpenSecs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  // ── Mentor hero ──
  const heroInitials = mentor ? ((mentor.firstName?.[0] || '') + (mentor.lastName?.[0] || '')).toUpperCase() : '—';
  const heroAv = mentor ? avatarIndex(mentor.firstName + mentor.lastName) : 0;
  const heroMetaItems = mentor ? [
    mentor.school && <span className="hero-meta-item" key="s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>{mentor.school}</span>,
    mentor.department && <span className="hero-meta-item" key="d"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>{mentor.department}</span>,
    mentor.email && <span className="hero-meta-item" key="e"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>{mentor.email}</span>,
  ].filter(Boolean) : [];
  // Only the section codes (e.g. "BS CS 1A") — the plain course codes were redundant.
  const sectionTags = mentor ? (mentor.sections || '').split(',').map(s => s.trim()).filter(Boolean) : [];

  // Attendance Logs › School › Mentor — the school level links back to the list pre-filtered to that school.
  const crumbSchool = school || mentor?.school || '';

  // ── Sections ──
  function secStats(sec) {
    return { courseStr: [sec.course, sec.yearLevel].filter(Boolean).join(' · ') };
  }
  function renderMenteeCard(m) {
    const initials = ((m.menteeFirstName?.[0] || '') + (m.menteeLastName?.[0] || '')).toUpperCase();
    const avClass = `av-${avatarIndex(m.menteeFirstName + m.menteeLastName)}`;
    const total = semesterRequired;
    const present = m.presentCount;
    const rate = total > 0 ? Math.round(present / total * 100) : 0;
    const rateCls = 'completion-rate';
    const barCls = 'attendance-neutral';
    const bottomRow = (
      <div className="mnc-bottom-row">
        <span className="mnc-cta">View History {ChevronRight}</span>
      </div>
    );
    return (
      <div className={`mentee-card${m.isDropOut ? ' att-dropout' : ''}`} key={m.menteeID}
        onClick={e => openHistory(e, m.menteeID, m.menteeFirstName, m.menteeLastName, m.studentNumber || '')}>
        <div className={`mnc-avatar ${avClass}`}>{initials}</div>
        <div className="mnc-main">
          <div className="mnc-top-row">
            <div className="mnc-info">
              <div className="mnc-name">{m.menteeFirstName} {m.menteeLastName}{m.isDropOut ? <> <span className="mnc-dropout-chip">Drop Out</span></> : null}</div>
              <div className="mnc-sub">{m.studentNumber || '—'}</div>
            </div>
          </div>
          {cfg.admin ? bottomRow : null}
          <div className="mnc-rate-label">Semester Completion <span>{present}/{total} attended</span></div>
          <div className="mnc-bar-row">
            <div className="mnc-bar-bg">
              <div className={`mnc-bar-fill ${barCls}`} style={{ width: `${rate}%` }}></div>
            </div>
            <span className={`mnc-rate-txt ${rateCls}`}>{total === 0 ? '—' : rate + '%'}</span>
          </div>
          {cfg.admin ? null : bottomRow}
        </div>
      </div>
    );
  }
  const sortedMentees = list => [...list].sort((a, b) => `${a.menteeLastName} ${a.menteeFirstName}`.localeCompare(`${b.menteeLastName} ${b.menteeFirstName}`));

  let sectionCount = '';
  let grid;
  if (allMentees === null) {
    grid = <Empty className="empty-state"><span className="spinner"></span> Loading…</Empty>;
  } else if (!filtered.length) {
    sectionCount = `0 ${unit}s`;
    grid = <Empty className="empty-state" style={{ gridColumn: '1/-1' }}>No mentees assigned to this mentor.</Empty>;
  } else {
    const sectionMap = {};
    filtered.forEach(m => {
      const key = m.sectionCode || '—';
      if (!sectionMap[key]) {
        sectionMap[key] = { sectionCode: key, course: m.course || '—', yearLevel: m.yearLevel || '', mentees: [] };
      }
      sectionMap[key].mentees.push(m);
    });
    const sections = Object.values(sectionMap).sort((a, b) =>
      a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true, sensitivity: 'base' }));
    sectionCount = `${sections.length} ${unit}${sections.length !== 1 ? 's' : ''}`;
    const heading = sec => cfg.admin ? attendanceGroupHeading(sec) : sec.sectionCode;

    if (sections.length === 1) {
      // Single section — show cards directly, no accordion toggle
      const sec = sections[0];
      const { courseStr } = secStats(sec);
      const mCount = sec.mentees.length;
      grid = (
        <div className="section-card open">
          <div className="sec-header sec-header-static">
            <div className="sec-left">
              <div className="sec-code">{heading(sec)}</div>
              <div className="sec-course">{courseStr}</div>
            </div>
            <div className="sec-right">
              <div className="sec-meta">{mCount} mentee{mCount !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <div className="sec-body" style={{ display: 'block' }}>
            <div className="sec-mentee-grid">
              {sortedMentees(sec.mentees).map(renderMenteeCard)}
            </div>
          </div>
        </div>
      );
    } else {
      // Multiple sections — accordion
      grid = sections.map((sec, idx) => {
        const { courseStr } = secStats(sec);
        const mCount = sec.mentees.length;
        const isOpen = openSecs.has(idx);
        return (
          <div className={`section-card${isOpen ? ' open' : ''}`} id={`sec-${idx}`} key={sec.sectionCode}>
            <div className="sec-header" onClick={() => toggleSection(idx)}>
              <div className="sec-left">
                <div className="sec-code">{heading(sec)}</div>
                <div className="sec-course">{courseStr}</div>
              </div>
              <div className="sec-right">
                <div className="sec-meta">{mCount} mentee{mCount !== 1 ? 's' : ''}</div>
                <svg className={`sec-chevron${isOpen ? ' rotated' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
            <div className="sec-body" id={`sec-body-${idx}`} style={isOpen ? { display: 'block' } : undefined}>
              <div className="sec-mentee-grid">
                {sortedMentees(sec.mentees).map(renderMenteeCard)}
              </div>
            </div>
          </div>
        );
      });
    }
  }

  // ── Attendance history modal ──
  async function openHistory(e, menteeId, firstName, lastName, studentNumber) {
    e.stopPropagation(); // prevent section toggle when clicking mentee card
    setHistory({ open: true, name: `${firstName} ${lastName}`, sub: studentNumber || 'Mentee', state: 'loading' });

    try {
      const records = await apiRequest(`AttendanceLogs/mentee/${menteeId}?mentorId=${mentorId}`, 'GET', null, true);
      setHistory(h => ({ ...h, state: records }));
    } catch (err) {
      setHistory(h => ({ ...h, state: 'error' }));
    }
  }
  const closeHistory = () => setHistory(h => h && { ...h, open: false });

  const note = text => cfg.admin ? <div className="tab-loading">{text}</div> : <Empty className="empty-state">{text}</Empty>;
  let historyContent = null;
  if (history) {
    const st = history.state;
    if (st === 'loading') historyContent = cfg.admin ? <div className="tab-loading"><span className="spinner"></span> Loading…</div> : <Empty className="empty-state"><span className="spinner"></span> Loading…</Empty>;
    else if (st === 'error') historyContent = note('Failed to load history.');
    else if (!st.length) historyContent = note('No sessions found for this mentee.');
    else {
      // Exclude future scheduled sessions — attendance hasn't been recorded yet
      const relevant = st.filter(r => r.sessionStatus !== 'Scheduled');
      if (!relevant.length) historyContent = note('No completed sessions for this mentee yet.');
      else {
        historyContent = (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr><th>Session</th><th>Date</th><th>Status</th><th>Attendance</th></tr>
              </thead>
              <tbody>
                {relevant.map((r, i) => {
                  const date = r.sessionDate
                    ? new Date(r.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—';
                  const attendance = LogsheetData.attendanceState({ ...r, attendanceRecorded: r.isRecorded });
                  const badge = !r.isRecorded
                    ? <span className="badge-unrecorded">Not recorded</span>
                    : attendance === true
                      ? <span className="badge-present">Present</span>
                      : attendance === false
                        ? <span className="badge-absent">Absent</span>
                        : <span className="badge-unrecorded">Unverified</span>;
                  const statusCls = (r.sessionStatus || '').toLowerCase();
                  // A makeup row carries its own real checkpoint (Sessions.SlotName) when one was picked at
                  // posting time — shown alongside the "Make-up" tag.
                  const sessionNumCell = r.isMakeup
                    ? <span className="session-num session-num-makeup">Make-up{r.slotName ? `: ${r.slotName}` : ''}</span>
                    : <span className="session-num">{r.slotName || 'Session'}</span>;
                  return (
                    <tr key={i}>
                      <td>{sessionNumCell}</td>
                      <td className="td-primary td-nowrap">{date}</td>
                      <td><span className={`badge-status ${statusCls}`}>{r.sessionStatus}</span></td>
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
  }

  const backTo = school ? `${listPath}?school=${encodeURIComponent(school)}` : listPath;

  return (
    <Page id={cfg.pageId}>
      <div className="main-wrapper">
        <main className="page-content">
          {cfg.admin ? (
            <nav className="att-crumbs" id="attCrumbs" aria-label="Breadcrumb">
              {mentor ? (
                <>
                  <Link to={listPath}>Attendance Logs</Link>
                  {crumbSchool ? <><span className="att-crumb-sep" aria-hidden="true">&rsaquo;</span><Link to={`${listPath}?school=${encodeURIComponent(crumbSchool)}`}>{crumbSchool}</Link></> : null}
                  <span className="att-crumb-sep" aria-hidden="true">&rsaquo;</span><span className="att-crumb-current" aria-current="page">{`${mentor.firstName} ${mentor.lastName}`}</span>
                </>
              ) : (
                <>
                  <Link to={listPath}>Attendance Logs</Link>
                  <span className="att-crumb-sep" aria-hidden="true">&rsaquo;</span>
                  <span className="att-crumb-current" id="crumbMentor" aria-current="page">Mentor</span>
                </>
              )}
            </nav>
          ) : null}
          {cfg.admin ? (
            <a href={listPath} className="btn-back" onClick={e => { e.preventDefault(); navigate(backTo); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Back to Attendance Logs
            </a>
          ) : (
            <Link to={backTo} className="btn-back" id="backBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Back to Attendance Summary
            </Link>
          )}

          {/* Mentor hero */}
          <div className="mentor-hero" id="mentorHero">
            <div className={`hero-avatar av-${heroAv}`} id="heroAvatar">{heroInitials}</div>
            <div className="hero-info">
              <div className="hero-name" id="heroName">{mentor ? `${mentor.firstName} ${mentor.lastName}` : 'Loading…'}</div>
              <div className="hero-meta" id="heroMeta">{mentor ? (heroMetaItems.length ? heroMetaItems : 'Mentor') : null}</div>
              {sectionTags.length ? <div className="hero-tags">{sectionTags.map((s, i) => <span className="hero-section-tag" key={i}>{s}</span>)}</div> : null}
            </div>
          </div>

          {/* Sections accordion */}
          <div className="sections-wrapper">
            <div className="sections-head">
              <span className="sections-title">{cfg.admin ? 'Groups' : 'Sections'}</span>
              <span id="sectionCount" className="sections-count">{sectionCount}</span>
            </div>
            <div className="att-toolbar" style={{ marginBottom: '14px' }}>
              <div className="search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input type="text" id="sectionSearch" placeholder={`Filter by ${unit} or course…`} autoComplete="off" value={search} onChange={e => onSearch(e.target.value)} />
              </div>
              <Select id="statusFilter" className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Completion Statuses</option>
                <option value="not-started">Not Started</option>
                <option value="in-progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="not-configured">No Requirement Set</option>
              </Select>
              <div className="att-tip-wrap">
                <i className="ti ti-alert-circle att-tip-icon"></i>
                <div className="att-tip-box" id="attTipBox">
                  {allMentees !== null ? <><div className="att-tip-title">Semester Completion</div><div className="att-tip-row">Sessions attended out of {semesterRequired} required this semester. Regular and make-up sessions for the same slot count once. Present/Absent records are available in View History.</div></> : null}
                </div>
              </div>
              <button className="filter-reset" onClick={resetAllFilters}>Clear</button>
            </div>
            <div className="section-cards-list" id="sectionCardsGrid">
              {grid}
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Attendance History Modal */}
      <Overlay open={!!history?.open} className="modal-overlay" activeClass={null} display="flex" id="historyOverlay"
        onClick={e => { if (e.target === e.currentTarget) closeHistory(); }}>
        <div className="history-modal" onClick={e => e.stopPropagation()}>
          <div className="hm-header">
            <div>
              <div className="hm-title" id="hmTitle">{history?.name ?? 'Attendance History'}</div>
              <div className="hm-sub" id="hmSub">{history?.sub ?? ''}</div>
            </div>
            <button className="hm-close" onClick={closeHistory}>&times;</button>
          </div>
          <div className="hm-body">
            <div id="historyContent">{historyContent}</div>
          </div>
          <div className="hm-footer">
            <button className="btn-outline" onClick={closeHistory}>Close</button>
          </div>
        </div>
      </Overlay>

      {/* Error Modal */}
      <Overlay open={errorMsg !== null} className="info-modal-overlay" activeClass={null} display="flex" id="errorModal">
        <div className="info-modal">
          <div className="info-modal-icon danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <h3 className="info-modal-title">Something went wrong</h3>
          <p className="info-modal-message" id="errorMessage">{errorMsg ?? 'An error occurred.'}</p>
          <button className="btn-primary" onClick={() => setErrorMsg(null)} style={{ width: '100%', justifyContent: 'center' }}>OK</button>
        </div>
      </Overlay>
    </Page>
  );
}
