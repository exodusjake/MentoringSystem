import { useEffect, useState } from 'react';
import Page from '../../app/Page.jsx';
import DateInput from '../../components/DateInput.jsx';
import PagedPanel from '../../components/PagedPanel.jsx';
import Empty from '../../components/Empty.jsx';
import Overlay from '../../components/Overlay.jsx';
import OptionGroups from '../../components/OptionGroups.jsx';
import ProofLightbox from '../../components/ProofLightbox.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { MentorSchools } from '../../lib/mentor-schools.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// HEAD/HTML/proof-tracking.html + HEAD/JS/proof-tracking.js
// ADMIN_/HTML/session-proofs.html + ADMIN_/JS/session-proofs.js
// Identical read-only page in both portals; only the page id (stylesheets / body class) differs.

const SCHOOLS = ['School of Technology', 'School of Humanities', 'School of Management'];

function isoDate(dt) {
  if (!dt) return '';
  // Session times are stored as Philippine wall time; use that calendar date.
  if (typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dt)) return dt.slice(0, 10);
  return new Date(dt).toISOString().slice(0, 10);
}

const fmtShort = d => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

export default function ProofTracking({ pageId }) {
  useBackGuard();
  const [allRecords, setAllRecords] = useState([]);
  const [availableMentors, setAvailableMentors] = useState([]);   // roster from the API — MentorID/FirstName/LastName/School/Department
  const [loaded, setLoaded] = useState(false);
  // School-scoped view — click a school card to narrow everything below (department + mentor dropdowns, and the
  // cards themselves) to that one school; click it again to go back to every school.
  const [activeSchoolFilter, setActiveSchoolFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [proofStatus, setProofStatus] = useState('');
  const [date, setDate] = useState('');
  const [sessionsModal, setSessionsModal] = useState(null);   // index into the rendered mentor list
  const [lightbox, setLightbox] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [data] = await Promise.all([apiRequest('SessionProofsAdmin', 'GET', null, true), MentorSchools.load()]);
        setAllRecords(data.records || []);
        setAvailableMentors(data.availableMentors || []);
        setLoaded(true);
      } catch (e) {
        console.error('Error loading session proofs:', e);
        setErrorMsg('Failed to load session proofs. Please refresh.');
      }
    })();
  }, []);

  // ── School overview cards ──
  const schoolStats = SCHOOLS.map(school => {
    const rows = allRecords.filter(r => MentorSchools.sessionInSchool(r, school));
    return { sessions: rows.length, missing: rows.filter(r => !r.hasProof).length };
  });
  const pulse = <span className="stat-pulse">—</span>;
  const SS = (i, k) => loaded ? schoolStats[i][k] : pulse;

  function filterBySchool(school) {
    setActiveSchoolFilter(activeSchoolFilter === school ? '' : school);
    setDept('');
  }

  // ── Filter dropdowns ──
  // Both cascade off the active school card; the mentor dropdown also narrows to whichever department is
  // currently selected, so a mentor from a now-hidden school/department can't stay selected silently.
  const courseOpts = MentorSchools.courseOptionGroups(activeSchoolFilter, availableMentors);
  const courseValid = courseOpts.some(g => g.options.some(o => o.value === dept));
  const effDept = courseValid ? dept : '';
  const scopedMentors = availableMentors.filter(m =>
    MentorSchools.inSchool(m, activeSchoolFilter) && MentorSchools.inCourse(m, effDept));
  const effMentorId = scopedMentors.some(m => String(m.mentorID) === mentorId) ? mentorId : '';

  // ── Filters ──
  const q = search.trim().toLowerCase();
  const filtered = allRecords.filter(r => {
    const mentorName = `${r.mentorFirstName} ${r.mentorLastName}`.toLowerCase();

    if (!MentorSchools.sessionInSchool(r, activeSchoolFilter)) return false;
    if (!MentorSchools.sessionInCourse(r, effDept)) return false;
    if (q && !mentorName.includes(q)) return false;
    if (effMentorId && String(r.mentorID) !== effMentorId) return false;
    if (proofStatus === 'submitted' && !r.hasProof) return false;
    if (proofStatus === 'missing' && r.hasProof) return false;
    if (date && isoDate(r.sessionDate) !== date) return false;

    return true;
  });

  function clearFilters() {
    setSearch(''); setProofStatus(''); setDate(''); setDept(''); setMentorId('');
    setActiveSchoolFilter('');
  }

  // ── Stats ── (totals for the sessions currently listed)
  const total = filtered.length;
  const withProof = filtered.filter(r => r.hasProof).length;
  const coverage = total > 0 ? Math.round(withProof / total * 1000) / 10 : 0;

  // ── Mentor cards ──
  // One card per mentor instead of one row per session. Every mentor in scope is listed, even before their first
  // completed session. Proof-status and date filters list only mentors with a match.
  const byMentor = new Map();
  const sessionFilter = proofStatus || date;
  if (!sessionFilter) {
    availableMentors
      .filter(m => MentorSchools.inSchool(m, activeSchoolFilter)
        && MentorSchools.inCourse(m, effDept)
        && (!effMentorId || String(m.mentorID) === effMentorId)
        && (!q || `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)))
      .forEach(m => byMentor.set(m.mentorID, {
        name: `${m.firstName} ${m.lastName}`,
        sortKey: `${m.lastName} ${m.firstName}`,
        dept: m.department || m.school || '—',
        sessions: [],
      }));
  }
  filtered.forEach(r => {
    if (!byMentor.has(r.mentorID)) {
      byMentor.set(r.mentorID, {
        name: `${r.mentorFirstName} ${r.mentorLastName}`,
        sortKey: `${r.mentorLastName} ${r.mentorFirstName}`,
        dept: r.mentorDepartment || r.mentorSchool || '—',
        sessions: [],
      });
    }
    byMentor.get(r.mentorID).sessions.push(r);
  });
  // By last name, same order as the other monitoring pages.
  const mentors = [...byMentor.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const showingCount = !byMentor.size ? '' :
    `${filtered.length} session${filtered.length !== 1 ? 's' : ''} · ${mentors.length} mentor${mentors.length !== 1 ? 's' : ''}`;

  let cards = null, cardsMsg = null;
  if (!loaded) cardsMsg = <Empty as="div" className="table-empty"><span className="spinner"></span> Loading…</Empty>;
  else if (!byMentor.size) cardsMsg = <Empty className="table-empty">No mentors or sessions match the current filters.</Empty>;
  else cards = mentors.map((m, i) => {
    const initials = m.name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '—';
    const uploaded = m.sessions.filter(s => s.hasProof).length;
    const missing = m.sessions.length - uploaded;
    const hasSessions = m.sessions.length > 0;
    const pct = hasSessions ? Math.round((uploaded / m.sessions.length) * 100) : 0;
    const tier = !hasSessions ? '' : pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';
    return (
      <div className="pt-card" key={m.sortKey}>
        <div className="pt-card-top">
          <div className="pt-card-id">
            <div className={`pt-avatar av-${i % 6}`}>{initials}</div>
            <div className="pt-id-text">
              <div className="pt-name">{m.name}</div>
              <div className="pt-dept">{m.dept}</div>
            </div>
          </div>
          <div className="pt-card-stat">
            <div className="pt-stat-val">{m.sessions.length}</div>
            <div className="pt-stat-lbl">Session{m.sessions.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="pt-legend">
            <span className="pt-legend-item"><i className="pt-dot good"></i>{uploaded} uploaded</span>
            <span className="pt-legend-item"><i className="pt-dot bad"></i>{missing} missing</span>
          </div>
          <div className="pt-coverage">
            <div className="pt-coverage-head"><span>Coverage</span><span className={`pt-coverage-pct ${tier}`}>{hasSessions ? `${pct}%` : '—'}</span></div>
            <div className="pt-bar"><div className={`pt-bar-fill ${tier}`} style={{ width: `${pct}%` }}></div></div>
          </div>
        </div>
        {hasSessions ? (
          <button className="pt-toggle-btn" onClick={() => setSessionsModal(i)}>
            View sessions
            <svg className="pt-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
          </button>
        ) : <div className="pt-empty-note">No completed sessions yet</div>}
      </div>
    );
  });

  // Sessions open in a modal so expanding one mentor never reflows the grid.
  const sm = sessionsModal !== null ? mentors[sessionsModal] : null;
  const smUploaded = sm ? sm.sessions.filter(s => s.hasProof).length : 0;
  const smCount = sm ? sm.sessions.length : 0;

  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return;
      if (lightbox) setLightbox(null);
      else if (sessionsModal !== null) setSessionsModal(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox, sessionsModal]);

  const sessionRow = (r, mentorName) => {
    const sessionDate = r.sessionDate ? fmtShort(r.sessionDate) : '—';
    const uploadedAt = r.uploadedAt ? fmtShort(r.uploadedAt) : null;
    const section = r.sectionCode || null;
    // Matches the "proof-chip" style used on Head's Mentor Detail page — same colors, same "Uploaded"/"No Proof"
    // wording, same click-the-chip-to-view behavior for an uploaded proof.
    const proofBadge = r.hasProof && r.filePath
      ? <button className="proof-chip yes" onClick={() => setLightbox({ filePath: r.filePath, fileType: r.fileType || '', title: `Proof — ${mentorName}` })} title="View proof">View</button>
      : r.hasProof
        ? <span className="proof-chip yes">Uploaded</span>
        : <span className="proof-chip no">No Proof</span>;
    return (
      <div className={`pt-session-row ${r.hasProof ? 'status-ok' : 'status-no'}`} key={r.sessionID ?? `${r.sessionDate}-${r.slotName}`}>
        <div className="pt-session-main">
          <div className="pt-session-top">
            <span className="checkpoint-badge">{r.isMakeup ? 'Make-up Session: ' : ''}{r.slotName || 'Session'}</span>
            <span className="pt-session-date">{sessionDate}</span>
          </div>
          <div className="pt-session-sub">
            {section ? <span className="badge-section">{section}</span> : null}
            {uploadedAt ? <span className="pt-session-uploaded">{section ? '· ' : ''}Uploaded {uploadedAt}</span> : null}
          </div>
        </div>
        {proofBadge}
      </div>
    );
  };

  const cardClass = (i, base) => `${base}${activeSchoolFilter === SCHOOLS[i] ? ' active' : ''}`;

  return (
    <Page id={pageId}>
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Proof Tracking</h1>
              <p>
                Proof-of-session photos submitted by mentors, for sessions that have already happened
              </p>
            </div>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-top-row">
                <div className="stat-label">Total Completed Sessions</div>
                <div className="stat-icon blue">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="totalSessionsValue">{total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-top-row">
                <div className="stat-label">With Proof</div>
                <div className="stat-icon green">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="withProofValue">{withProof}</div>
            </div>
            <div className="stat-card">
              <div className="stat-top-row">
                <div className="stat-label">Missing Proof</div>
                <div className="stat-icon red">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="missingProofValue">{total - withProof}</div>
            </div>
            <div className="stat-card">
              <div className="stat-top-row">
                <div className="stat-label">Coverage Rate</div>
                <div className="stat-icon amber">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
              </div>
              <div className="stat-value" id="coverageRateValue">{coverage + '%'}</div>
            </div>
          </div>
          {/* School Overview — filter the table below to one school at a time */}
          <div className="school-overview-grid monitoring-school-strip" role="region" aria-label="School summary cards" tabIndex={0} id="schoolOverviewGrid">
            <div className={cardClass(0, "school-card school-card--sot")} onClick={() => filterBySchool(SCHOOLS[0])}>
              <div className="school-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <div className="school-card-body">
                <div className="school-card-name">School of Technology</div>
                <div className="school-card-sub">COE &amp; CCIT</div>
              </div>
              <div className="school-card-stats">
                <div className="school-stat">
                  <span id="sot-sessions">{SS(0, "sessions")}</span>
                  <small>Sessions</small>
                </div>
                <div className="school-stat">
                  <span id="sot-missing">{SS(0, "missing")}</span>
                  <small>Missing</small>
                </div>
              </div>
            </div>
            <div className={cardClass(1, "school-card school-card--soh")} onClick={() => filterBySchool(SCHOOLS[1])}>
              <div className="school-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <div className="school-card-body">
                <div className="school-card-name">School of Humanities</div>
                <div className="school-card-sub">CASE, CHC &amp; CCJ</div>
              </div>
              <div className="school-card-stats">
                <div className="school-stat">
                  <span id="soh-sessions">{SS(1, "sessions")}</span>
                  <small>Sessions</small>
                </div>
                <div className="school-stat">
                  <span id="soh-missing">{SS(1, "missing")}</span>
                  <small>Missing</small>
                </div>
              </div>
            </div>
            <div className={cardClass(2, "school-card school-card--som")} onClick={() => filterBySchool(SCHOOLS[2])}>
              <div className="school-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                </svg>
              </div>
              <div className="school-card-body">
                <div className="school-card-name">School of Management</div>
                <div className="school-card-sub">CBMA &amp; CTHM</div>
              </div>
              <div className="school-card-stats">
                <div className="school-stat">
                  <span id="som-sessions">{SS(2, "sessions")}</span>
                  <small>Sessions</small>
                </div>
                <div className="school-stat">
                  <span id="som-missing">{SS(2, "missing")}</span>
                  <small>Missing</small>
                </div>
              </div>
            </div>
          </div>
          <div className="pt-section-head">
            <span className="table-card-title">Completed Sessions</span>
            {' '}
            <span className="table-card-count" id="showingCount">{showingCount}</span>
          </div>
          <div className="filter-bar">
            <div className="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {' '}
              <input type="text" id="searchInput" placeholder="Search mentor name…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {<Select className="filter-select" id="courseFilter" value={effDept} onChange={e => setDept(e.target.value)}><OptionGroups groups={courseOpts} /></Select>}
            {' '}
            {<Select className="filter-select" id="mentorFilter" value={effMentorId} onChange={e => setMentorId(e.target.value)}><option value="">All Mentors</option>{scopedMentors.map(m => <option key={m.mentorID} value={m.mentorID}>{`${m.firstName} ${m.lastName}`}</option>)}</Select>}
            {' '}
            {<Select className="filter-select" id="proofStatusFilter" value={proofStatus} onChange={e => setProofStatus(e.target.value)}><option value="">All Proof Status</option><option value="submitted">Uploaded</option><option value="missing">No Proof</option></Select>}
            {' '}
            {<DateInput type="date" className="filter-date" id="dateFilter" title="Filter by session date" value={date} onChange={e => setDate(e.target.value)} />}
            {' '}
            <button className="btn-clear" onClick={clearFilters}>Clear</button>
          </div>
          <PagedPanel items={cards} message={cardsMsg} gridClass="pt-cards-grid" gridId="ptCardsGrid" unit="mentors" storageKey="pp-proofs" />
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      {/* Mentor sessions */}
      {<Overlay open={sm !== null} className="lightbox-overlay pt-sessions-overlay" activeClass={null} display="flex" id="sessionsModal" onClick={e => { if (e.target === e.currentTarget) setSessionsModal(null); }}>
        <div className="lightbox-inner pt-sessions-inner" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sessionsModalTitle">
          <div className="lightbox-header">
            <div>
              <span className="lightbox-title" id="sessionsModalTitle">{sm ? sm.name : 'Sessions'}</span>
              <div className="pt-sessions-sub" id="sessionsModalSub">{sm ? `${sm.dept} · ${smCount} session${smCount !== 1 ? 's' : ''} · ${smUploaded} uploaded · ${smCount - smUploaded} missing` : ''}</div>
            </div>
            <button className="lightbox-close" onClick={() => setSessionsModal(null)} aria-label="Close">&times;</button>
          </div>
          <div className="pt-sessions-body" id="sessionsModalBody">{sm ? sm.sessions.slice().sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate)).map(r => sessionRow(r, sm.name)) : null}</div>
        </div>
      </Overlay>}
      {/* Lightbox */}
      {<ProofLightbox proof={lightbox} onClose={() => setLightbox(null)} />}
      {' '}
      {<Overlay open={errorMsg !== null} className="info-modal-overlay" activeClass={null} display="flex" id="errorModal">
        <div className="info-modal">
          <div className="info-modal-icon danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          </div>
          <h3 className="info-modal-title">Something went wrong</h3>
          <p className="info-modal-message" id="errorMessage">{errorMsg ?? 'An error occurred.'}</p>
          <button className="btn-primary" onClick={() => setErrorMsg(null)} style={{ width: '100%' }}>OK</button>
        </div>
      </Overlay>}
    </Page>
  );
}
