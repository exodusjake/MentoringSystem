import { useEffect, useMemo, useState } from 'react';
import Page from '../../app/Page.jsx';
import DateInput from '../../components/DateInput.jsx';
import Empty from '../../components/Empty.jsx';
import ErrorModal from '../../components/ErrorModal.jsx';
import OptionList from '../../components/OptionList.jsx';
import SchoolCards from '../../components/SchoolCards.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { MentorSchools } from '../../lib/mentor-schools.js';
import { useStayOnBack } from '../mentor/useStayOnBack.js';

// Head "Proof Tracking" (HEAD/HTML/proof-tracking.html) and Admin "Session Proofs"
// (ADMIN_/HTML/session-proofs.html) — the same read-only page: proof-of-session coverage per
// mentor, school cards, filters, each mentor's sessions, and the proof viewer.
const PAGE_IDS = { head: 'HEAD/proof-tracking', admin: 'ADMIN_/session-proofs' };
const SCHOOL_NAMES = { sot: 'School of Technology', soh: 'School of Humanities', som: 'School of Management' };
const fmtDay = d => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
// Session times are stored as Philippine wall time; use that calendar date.
function isoDate(dt) {
  if (!dt) return '';
  if (typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dt)) return dt.slice(0, 10);
  return new Date(dt).toISOString().slice(0, 10);
}

export default function ProofTracking({ variant }) {
  useStayOnBack();
  const [data, setData] = useState({ state: 'loading', records: [], mentors: [] });
  const [school, setSchool] = useState('');
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [proofStatus, setProofStatus] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState({ shown: false, text: 'An error occurred.' });
  const [sessionsOf, setSessionsOf] = useState(null);         // mentor whose sessions are open
  const [proof, setProof] = useState(null);                   // { filePath, fileType, mentorName, failed }
  const [download, setDownload] = useState(null);             // the viewer's download link (kept after closing)

  useEffect(() => {
    (async () => {
      try {
        const [res] = await Promise.all([apiRequest('SessionProofsAdmin', 'GET', null, true), MentorSchools.load()]);
        setData({ state: 'ok', records: res.records || [], mentors: res.availableMentors || [] });
      } catch (e) {
        console.error('Error loading session proofs:', e);
        setError({ shown: true, text: 'Failed to load session proofs. Please refresh.' });
      }
    })();
  }, []);

  // Escape closes the proof viewer first, then the sessions list.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return;
      if (proof) setProof(null);
      else if (sessionsOf) setSessionsOf(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [proof, sessionsOf]);

  const { records, mentors: available } = data;
  const loaded = data.state === 'ok';
  // Course options follow the school; the mentor list follows school and course.
  const courseOptions = useMemo(() => loaded ? MentorSchools.courseOptions(school, available) : [{ value: '', label: 'All Courses' }], [data, school]);
  const courseValue = MentorSchools.optionListed(courseOptions, course) ? course : '';
  const scopedMentors = available.filter(m => MentorSchools.inSchool(m, school) && MentorSchools.inCourse(m, courseValue));
  const mentorValue = scopedMentors.some(m => String(m.mentorID) === mentorId) ? mentorId : '';

  const query = q.trim().toLowerCase();
  const filtered = records.filter(r => {
    if (!MentorSchools.sessionInSchool(r, school)) return false;
    if (!MentorSchools.sessionInCourse(r, courseValue)) return false;
    if (query && !`${r.mentorFirstName} ${r.mentorLastName}`.toLowerCase().includes(query)) return false;
    if (mentorValue && String(r.mentorID) !== mentorValue) return false;
    if (proofStatus === 'submitted' && !r.hasProof) return false;
    if (proofStatus === 'missing' && r.hasProof) return false;
    if (date && isoDate(r.sessionDate) !== date) return false;
    return true;
  });

  // One card per mentor. Every mentor in scope is listed (even before their first completed
  // session) unless a proof-status or date filter is on.
  const byMentor = new Map();
  if (loaded && !(proofStatus || date)) {
    available.filter(m => MentorSchools.inSchool(m, school) && MentorSchools.inCourse(m, courseValue)
      && (!mentorValue || String(m.mentorID) === mentorValue)
      && (!query || `${m.firstName} ${m.lastName}`.toLowerCase().includes(query)))
      .forEach(m => byMentor.set(m.mentorID, { name: `${m.firstName} ${m.lastName}`, sortKey: `${m.lastName} ${m.firstName}`, dept: m.department || m.school || '—', sessions: [] }));
  }
  filtered.forEach(r => {
    if (!byMentor.has(r.mentorID)) byMentor.set(r.mentorID, { name: `${r.mentorFirstName} ${r.mentorLastName}`, sortKey: `${r.mentorLastName} ${r.mentorFirstName}`, dept: r.mentorDepartment || r.mentorSchool || '—', sessions: [] });
    byMentor.get(r.mentorID).sessions.push(r);
  });
  const cardMentors = [...byMentor.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const withProof = filtered.filter(r => r.hasProof).length;
  const schoolStats = { sessions: {}, missing: {} };
  for (const [k, name] of Object.entries(SCHOOL_NAMES)) {
    const rows = records.filter(r => MentorSchools.sessionInSchool(r, name));
    schoolStats.sessions[k] = rows.length;
    schoolStats.missing[k] = rows.filter(r => !r.hasProof).length;
  }

  function filterBySchool(name) {
    setSchool(s => s === name ? '' : name);
    setCourse('');
  }
  function clearFilters() {
    setQ(''); setProofStatus(''); setDate(''); setCourse(''); setMentorId(''); setSchool('');
  }
  function viewProof(r, mentorName) {
    setDownload(CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(r.filePath)));
    setProof({ filePath: r.filePath, fileType: r.fileType || '', mentorName, failed: false });
  }

  let grid;
  if (data.state === 'loading') grid = <Empty className="table-empty"><span className="spinner"></span>{' '}Loading…</Empty>;
  else if (!cardMentors.length) grid = <Empty key={`none-${school}-${q}-${courseValue}-${mentorValue}-${proofStatus}-${date}`} className="table-empty">No mentors or sessions match the current filters.</Empty>;
  else grid = cardMentors.map((m, i) => {
    const initials = m.name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '—';
    const uploaded = m.sessions.filter(s => s.hasProof).length;
    const missing = m.sessions.length - uploaded;
    const has = m.sessions.length > 0;
    const pct = has ? Math.round(uploaded / m.sessions.length * 100) : 0;
    const tier = !has ? '' : pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';
    return (
      <div key={m.sortKey + i} className="pt-card">
        <div className="pt-card-top">
          <div className="pt-card-id">
            <div className={`pt-avatar av-${i % 6}`}>{initials}</div>
            {' '}
            <div className="pt-id-text">
              <div className="pt-name">{m.name}</div>
              {' '}
              <div className="pt-dept">{m.dept}</div>
            </div>
          </div>
          {' '}
          <div className="pt-card-stat">
            <div className="pt-stat-val">{m.sessions.length}</div>
            {' '}
            <div className="pt-stat-lbl">{`Session${m.sessions.length !== 1 ? 's' : ''}`}</div>
          </div>
          {' '}
          <div className="pt-legend">
            <span className="pt-legend-item"><i className="pt-dot good"></i>{`${uploaded} uploaded`}</span>
            {' '}
            <span className="pt-legend-item"><i className="pt-dot bad"></i>{`${missing} missing`}</span>
          </div>
          {' '}
          <div className="pt-coverage">
            <div className="pt-coverage-head"><span>Coverage</span><span className={`pt-coverage-pct ${tier}`}>{has ? `${pct}%` : '—'}</span></div>
            {' '}
            <div className="pt-bar"><div className={`pt-bar-fill ${tier}`} style={{ width: `${pct}%` }}></div></div>
          </div>
        </div>
        {' '}
        {has
          ? <button className="pt-toggle-btn" onClick={() => setSessionsOf(m)}>
            {'View sessions '}
            <svg className="pt-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
          </button>
          : <div className="pt-empty-note">No completed sessions yet</div>}
      </div>
    );
  });

  const stat = (label, iconCls, icon, id, value) => (
    <div className="stat-card">
      <div className="stat-top-row">
        <div className="stat-label">{label}</div>
        {' '}
        <div className={'stat-icon ' + iconCls}>{icon}</div>
      </div>
      {' '}
      <div className="stat-value" id={id}>{value}</div>
    </div>
  );
  const coverage = filtered.length > 0 ? Math.round(withProof / filtered.length * 1000) / 10 : 0;
  const sm = sessionsOf;
  const smUploaded = sm ? sm.sessions.filter(s => s.hasProof).length : 0;
  const isImage = proof && (/image/i.test(proof.fileType) || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(proof.filePath));
  const fullUrl = proof ? CONFIG.getFileUrl(proof.filePath) : '';

  return (
    <Page id={PAGE_IDS[variant]}>
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Proof Tracking</h1>
              {' '}
              <p>Proof-of-session photos submitted by mentors, for sessions that have already happened</p>
            </div>
          </div>
          {' '}
          <div className="stats-grid">
            {stat('Completed Sessions', 'blue', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, 'totalSessionsValue', loaded ? filtered.length : 0)}
            {' '}
            {stat('With Proof', 'green', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>, 'withProofValue', loaded ? withProof : 0)}
            {' '}
            {stat('Missing Proof', 'red', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>, 'missingProofValue', loaded ? filtered.length - withProof : 0)}
            {' '}
            {stat('Coverage Rate', 'amber', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>, 'coverageRateValue', (loaded ? coverage : 0) + '%')}
          </div>
          {' '}
          {/* School Overview — filter everything below to one school at a time */}
          <div className="school-overview-grid monitoring-school-strip" role="region" aria-label="School summary cards" tabIndex="0" id="schoolOverviewGrid">
            <SchoolCards active={school} onSelect={filterBySchool} stats={[
              { id: k => `${k}-sessions`, label: 'Sessions', values: loaded ? schoolStats.sessions : null },
              { id: k => `${k}-missing`, label: 'Missing', values: loaded ? schoolStats.missing : null },
            ]} />
          </div>
          {' '}
          <div className="pt-section-head">
            <span className="table-card-title">Completed Sessions</span>
            {' '}
            <span className="table-card-count" id="showingCount">{loaded && cardMentors.length ? `${filtered.length} session${filtered.length !== 1 ? 's' : ''} · ${cardMentors.length} mentor${cardMentors.length !== 1 ? 's' : ''}` : ''}</span>
          </div>
          {' '}
          <div className="filter-bar">
            <div className="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              {' '}
              <input type="text" id="searchInput" placeholder="Search mentor name…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {' '}
            <Select className="filter-select" id="courseFilter" value={courseValue} onChange={e => setCourse(e.target.value)}>
              <OptionList options={courseOptions} />
            </Select>
            {' '}
            <Select className="filter-select" id="mentorFilter" value={mentorValue} onChange={e => setMentorId(e.target.value)}>
              <option value="">All Mentors</option>
              {loaded && scopedMentors.map(m => <option key={m.mentorID} value={m.mentorID}>{`${m.firstName} ${m.lastName}`}</option>)}
            </Select>
            {' '}
            <Select className="filter-select" id="proofStatusFilter" value={proofStatus} onChange={e => setProofStatus(e.target.value)}>
              <option value="">All Proof Status</option>
              <option value="submitted">Uploaded</option>
              <option value="missing">No Proof</option>
            </Select>
            {' '}
            <DateInput type="date" className="filter-date" id="dateFilter" title="Filter by session date" value={date} onChange={e => setDate(e.target.value)} />
            {' '}
            <button className="btn-clear" onClick={clearFilters}>Clear</button>
          </div>
          {' '}
          <div className="pt-cards-grid" id="ptCardsGrid">{grid}</div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Mentor sessions (a modal, so opening one never reflows the grid) */}
      <div id="sessionsModal" className="lightbox-overlay pt-sessions-overlay" style={{ display: sm ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) setSessionsOf(null); }}>
        <div className="lightbox-inner pt-sessions-inner" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sessionsModalTitle">
          <div className="lightbox-header">
            <div>
              <span className="lightbox-title" id="sessionsModalTitle">{sm ? sm.name : 'Sessions'}</span>
              {' '}
              <div className="pt-sessions-sub" id="sessionsModalSub">{sm ? `${sm.dept} · ${sm.sessions.length} session${sm.sessions.length !== 1 ? 's' : ''} · ${smUploaded} uploaded · ${sm.sessions.length - smUploaded} missing` : ''}</div>
            </div>
            {' '}
            <button className="lightbox-close" onClick={() => setSessionsOf(null)} aria-label="Close">&times;</button>
          </div>
          {' '}
          <div className="pt-sessions-body" id="sessionsModalBody">
            {sm && sm.sessions.slice().sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate)).map(r => {
              const section = r.sectionCode || null;
              const uploadedAt = r.uploadedAt ? fmtDay(r.uploadedAt) : null;
              return (
                <div key={r.sessionID} className={`pt-session-row ${r.hasProof ? 'status-ok' : 'status-no'}`}>
                  <div className="pt-session-main">
                    <div className="pt-session-top">
                      <span className="checkpoint-badge">{`${r.isMakeup ? 'Make-up Session: ' : ''}${r.slotName || 'Session'}`}</span>
                      {' '}
                      <span className="pt-session-date">{r.sessionDate ? fmtDay(r.sessionDate) : '—'}</span>
                    </div>
                    {' '}
                    <div className="pt-session-sub">
                      {section && <span className="badge-section">{section}</span>}
                      {' '}
                      {uploadedAt && <span className="pt-session-uploaded">{`${section ? '· ' : ''}Uploaded ${uploadedAt}`}</span>}
                    </div>
                  </div>
                  {' '}
                  {r.hasProof && r.filePath
                    ? <button className="proof-chip yes" onClick={() => viewProof(r, sm.name)} title="View proof">View</button>
                    : r.hasProof ? <span className="proof-chip yes">Uploaded</span> : <span className="proof-chip no">No Proof</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      <div id="lightboxOverlay" className="lightbox-overlay" style={{ display: proof ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) setProof(null); }}>
        <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
          <div className="lightbox-header">
            <span className="lightbox-title" id="lightboxTitle">{proof ? `Proof — ${proof.mentorName}` : 'Proof of Session'}</span>
            {' '}
            <button className="lightbox-close" onClick={() => setProof(null)}>&times;</button>
          </div>
          {' '}
          <div className="lightbox-body" id="lightboxBody">
            {proof && (isImage && !proof.failed
              ? <img src={fullUrl} alt="Proof of session" onError={() => setProof(p => p && { ...p, failed: true })} />
              : (
                <div className="lightbox-no-preview">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  {' '}
                  <p>Preview not available for this file type.</p>
                  {' '}
                  <a href={fullUrl} target="_blank" rel="noopener" className="lightbox-open-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                    {' '}Open File
                  </a>
                </div>
              ))}
          </div>
          {' '}
          <div className="lightbox-footer">
            <a className="lightbox-download" id="lightboxDownload" href={download || '#'} style={{ display: download ? 'inline-flex' : 'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              {' '}Download
            </a>
          </div>
        </div>
      </div>

      <ErrorModal open={error.shown} message={error.text} onClose={() => setError(x => ({ ...x, shown: false }))} buttonStyle={{ width: '100%' }} />
    </Page>
  );
}
