import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { showToast } from '../../components/Notify.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { sessionDisplayStatus } from '../../lib/dashboard-sessions.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import {
  buildMentorNotesForm, buildNonAttendanceForm, buildPrintForm, openPrintWindow,
} from '../../lib/mentorLogsheetPrint.js';
import './MonitoringDetail.css';

const records = value => Array.isArray(value) ? value
  : value?.data || value?.items || value?.sessions || value?.Sessions || [];
const valueOf = (item, ...keys) => keys.map(key => item?.[key]).find(value => value != null);
const labelDate = value => value ? new Date(value).toLocaleDateString('en-PH', {
  month: 'short', day: 'numeric', year: 'numeric',
}) : '—';
const sessionTitle = item => (valueOf(item, 'topic', 'Topic', 'sessionTopic', 'SessionTopic', 'title', 'Title', 'slotName', 'SlotName') || 'Mentoring Session')
  .replace(/^\[[^\]]+\]\s*/, '');
const menteeName = mentee => `${valueOf(mentee, 'menteeFirstName', 'MenteeFirstName', 'firstName', 'FirstName') || valueOf(mentee, 'menteeName', 'MenteeName') || ''} ${valueOf(mentee, 'menteeLastName', 'MenteeLastName', 'lastName', 'LastName') || ''}`.trim() || 'Mentee';
const periodKey = session => `${valueOf(session, 'schoolYear', 'SchoolYear') || ''}|${valueOf(session, 'semester', 'Semester') || ''}`;
const sectionList = session => String(valueOf(session, 'sections', 'Sections', 'sectionCode', 'SectionCode') || '')
  .split(',').map(section => section.trim()).filter(Boolean);
const isSubmitted = session => valueOf(session, 'logStatus', 'LogStatus') === 'Submitted';

export default function AdminMonitoringDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [data, setData] = useState({ state: 'loading', sessions: [], warnings: [] });
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('');
  const [activeTab, setActiveTab] = useState('sessions');
  const [selected, setSelected] = useState(null);
  const [formTab, setFormTab] = useState('logsheet');
  const [proof, setProof] = useState(null);

  useEffect(() => {
    let alive = true;
    const optional = async (endpoint, label) => {
      try { return { value: await apiRequest(endpoint, 'GET', null, true) }; }
      catch (error) {
        console.warn(`Could not load ${label}:`, error);
        return { value: null, warning: `${label}: ${error.message || 'request failed'}` };
      }
    };
    (async () => {
      try {
        const [sessionResponse, monitorResult, settingsResult, eventResult, logsheetResponse] = await Promise.all([
          apiRequest(`SessionsAdmin/${encodeURIComponent(id)}/sessions`, 'GET', null, true),
          optional(`MonitorActivities/${encodeURIComponent(id)}`, 'Mentor monitoring'),
          optional('Settings', 'Academic settings'),
          optional('CalendarEvents', 'Calendar events'),
          apiRequest(`SessionsAdmin/${encodeURIComponent(id)}/logsheet`, 'GET', null, true),
        ]);
        const sessionData = sessionResponse?.data || sessionResponse;
        const logsheetData = logsheetResponse?.data || logsheetResponse;
        if (!Array.isArray(sessionData?.sessions)) {
          throw new Error('The mentor sessions endpoint returned an unexpected response.');
        }
        const overview = monitorResult.value?.data || monitorResult.value;
        const sheetRows = Array.isArray(logsheetData?.sessions) ? logsheetData.sessions : [];
        const mergedRows = LogsheetData.rows(sheetRows, sessionData.sessions);
        const sessions = await LogsheetData.withReportStatuses(mergedRows, id);
        if (!alive) return;
        const mentor = sessionData.mentor || overview?.mentor || null;
        setData({
          state: 'ready',
          sessions,
          mentor,
          logsheetMentor: logsheetData?.mentor || mentor,
          monitor: overview || null,
          settings: settingsResult.value?.data || settingsResult.value || {
            SchoolYear: '2026-2027', Semester: '1st Semester', GuidanceOfficer: 'Guidance Officer',
          },
          events: records(eventResult.value),
          warnings: [monitorResult.warning, settingsResult.warning, eventResult.warning].filter(Boolean),
        });
        if (mentor) document.title = `${mentor.firstName || ''} ${mentor.lastName || ''} — Mentor Detail`;
      } catch (error) {
        console.error('Error loading sessions detail:', error);
        if (alive) {
          setData(current => ({ ...current, state: 'error' }));
          showToast(error.message || 'Failed to load session data. Please refresh.');
        }
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const sessions = data.sessions || [];
  const displayStatus = session => sessionDisplayStatus({
    ...session,
    sessionStatus: valueOf(session, 'sessionStatus', 'SessionStatus', 'status', 'Status'),
    timeEnd: valueOf(session, 'actualEnd', 'ActualEnd', 'timeEnd', 'TimeEnd'),
    presentCount: valueOf(session, 'presentCount', 'PresentCount'),
  }, data.events || []);
  const periods = [...new Set(sessions.map(periodKey).filter(key => key !== '|'))]
    .sort((a, b) => b.localeCompare(a));
  const sections = [...new Set(sessions.flatMap(sectionList))].sort();
  const statuses = [...new Set(sessions.map(displayStatus).filter(Boolean))].sort();
  const filtered = useMemo(() => sessions.filter(session => {
    if (status && displayStatus(session) !== status) return false;
    if (period && periodKey(session) !== period) return false;
    if (section && !sectionList(session).includes(section)) return false;
    const searchText = `${sessionTitle(session)} ${sectionList(session).join(' ')} ${(session.mentees || []).map(menteeName).join(' ')}`.toLowerCase();
    return !query || searchText.includes(query.trim().toLowerCase());
  }), [sessions, status, period, section, query, data.events]);
  const mentor = data.mentor || {};
  const monitor = data.monitor || {};
  const completed = sessions.filter(session => displayStatus(session) === 'Completed').length;
  const totalMentees = valueOf(mentor, 'menteeCount', 'MenteeCount')
    ?? new Set(sessions.flatMap(session => (session.mentees || []).map(mentee => valueOf(mentee, 'menteeID', 'MenteeID'))).filter(Boolean)).size;
  const submittedSessions = sessions.filter(isSubmitted);
  const back = `/admin/monitoring${location.search || ''}`;
  const selectedProof = proof?.sources?.[proof.index] || null;
  const proofUrl = selectedProof ? CONFIG.getFileUrl(selectedProof.filePath) : '';
  const proofIsImage = /image|jpe?g|png|gif|webp/i.test(`${selectedProof?.fileType || ''} ${selectedProof?.filePath || ''}`);

  const proofSources = session => {
    if (session._proofSources?.length) return session._proofSources;
    const path = valueOf(session, 'proofFilePath', 'ProofFilePath');
    return path ? [{ filePath: path, fileType: valueOf(session, 'proofFileType', 'ProofFileType'), label: sessionTitle(session) }] : [];
  };
  const formHtml = (session, form) => {
    const mentorRecord = data.logsheetMentor || mentor;
    const semester = LogsheetData.periodLabel(session);
    if (form === 'all') {
      return buildPrintForm(session, mentorRecord, semester)
        + buildMentorNotesForm(session, mentorRecord, semester)
        + buildNonAttendanceForm(session, mentorRecord, semester, data.settings?.GuidanceOfficer || 'Guidance Officer');
    }
    if (form === 'notes') return buildMentorNotesForm(session, mentorRecord, semester);
    if (form === 'nonattend') {
      return buildNonAttendanceForm(session, mentorRecord, semester, data.settings?.GuidanceOfficer || 'Guidance Officer');
    }
    return buildPrintForm(session, mentorRecord, semester);
  };
  const printForms = form => {
    if (!submittedSessions.length) {
      showToast('No submitted logsheets are available to print.', 'info');
      return;
    }
    const body = submittedSessions.map(session => formHtml(session, form)).join('');
    const titles = {
      all: 'All Forms — All Sessions',
      logsheet: 'Mentoring Logsheet — All Sessions',
      notes: "Mentor's Notes — All Sessions",
      nonattend: 'Non-Attendance — All Sessions',
    };
    if (!openPrintWindow(titles[form], body)) showToast('Please allow pop-ups to preview and print the forms.');
  };
  const printSelectedForm = () => {
    if (!selected || !isSubmitted(selected)) return;
    const titles = { logsheet: 'Mentoring Logsheet', notes: "Mentor's Notes", nonattend: 'Non-Attendance Report' };
    if (!openPrintWindow(titles[formTab], formHtml(selected, formTab))) {
      showToast('Please allow pop-ups to preview and print the form.');
    }
  };
  const openSession = session => {
    setSelected(session);
    setFormTab('logsheet');
  };
  const countPresent = session => valueOf(session, 'presentCount', 'PresentCount')
    ?? (session.mentees || []).filter(mentee => LogsheetData.attendanceState(mentee) === true).length;
  const countAttendees = session => valueOf(session, 'totalAttendees', 'TotalAttendees') ?? (session.mentees || []).length;

  let selectedFormBody = null;
  if (selected) {
    const mentees = selected.mentees || [];
    const matching = formTab === 'logsheet'
      ? mentees.filter(mentee => LogsheetData.attendanceState(mentee) === true)
      : formTab === 'notes'
        ? mentees.filter(mentee => LogsheetData.attendanceState(mentee) === true)
        : mentees.filter(mentee => LogsheetData.attendanceState(mentee) === false);
    selectedFormBody = !isSubmitted(selected)
      ? <div className="lm-not-submitted"><strong>Logsheet Not Submitted</strong><p>The mentor has not submitted this logsheet yet.</p></div>
      : formTab === 'logsheet'
        ? matching.length
          ? <div className="table-responsive"><table className="data-table"><thead><tr><th>Date</th><th>Mentee</th><th>Time Start</th><th>Time End</th><th>Remarks</th></tr></thead><tbody>{matching.map((mentee, index) => <tr key={valueOf(mentee, 'menteeID', 'MenteeID') || index}><td>{LogsheetData.day(mentee._attendedDate || selected.sessionDate)}</td><td>{menteeName(mentee)}</td><td>{LogsheetData.time(mentee.scannedAt)}</td><td>{LogsheetData.time(mentee._attendedEndTime)}</td><td>{mentee.remarks || '—'}</td></tr>)}</tbody></table></div>
          : <Empty>No present mentees are recorded for this session.</Empty>
        : formTab === 'notes'
          ? matching.length
            ? <div className="table-responsive"><table className="data-table"><thead><tr><th>Mentee</th><th>Date of Mentoring</th><th>Mentor's Notes</th></tr></thead><tbody>{matching.map((mentee, index) => <tr key={valueOf(mentee, 'menteeID', 'MenteeID') || index}><td>{menteeName(mentee)}</td><td>{LogsheetData.day(mentee._attendedDate || selected.sessionDate)}</td><td>{mentee.mentorNotes || '—'}</td></tr>)}</tbody></table></div>
            : <Empty>No mentee notes are available for this session.</Empty>
          : matching.length
            ? <div className="table-responsive"><table className="data-table"><thead><tr><th>Mentee</th><th>Section</th><th>Reason</th></tr></thead><tbody>{matching.map((mentee, index) => <tr key={valueOf(mentee, 'menteeID', 'MenteeID') || index}><td>{menteeName(mentee)}</td><td>{valueOf(mentee, 'sectionCode', 'SectionCode', 'section', 'Section') || '—'}</td><td>{mentee.absenceReason || '—'}</td></tr>)}</tbody></table></div>
            : <Empty>No recorded absences for this session.</Empty>;
  }

  return <Page id="ADMIN_/sessions-detail"><main className="main-wrapper"><div className="page-content">
    <nav className="mm-crumbs" aria-label="Breadcrumb"><Link to={back}>Mentor Monitoring</Link><span className="mm-crumb-sep" aria-hidden="true">›</span><span className="mm-crumb-current" aria-current="page">{mentor.firstName ? `${mentor.firstName} ${mentor.lastName || ''}`.trim() : 'Mentor'}</span></nav>
    <div className="detail-back-bar"><Link className="btn-back" to={back}><i className="ti ti-arrow-left" /> Back to Mentor Monitoring</Link></div>
    <section className="mentor-hero" id="mentorHero">
      <div className="hero-avatar">{`${mentor.firstName?.[0] || ''}${mentor.lastName?.[0] || ''}`.toUpperCase() || '—'}</div>
      <div className="hero-info"><div className="hero-name-row"><h1 className="hero-name">{mentor.firstName ? `${mentor.firstName} ${mentor.lastName || ''}`.trim() : 'Loading…'}</h1><span className="hero-badge">{monitor.progressStatus || monitor.ProgressStatus || ''}</span></div>
        <div className="hero-meta">{[mentor.school, mentor.department || mentor.departmentName, mentor.email].filter(Boolean).join(' · ')}</div>
      </div>
    </section>
    {data.warnings?.length > 0 && <div className="admin-detail-warning" role="status">Some optional detail could not be loaded: {data.warnings.join(' · ')}</div>}
    <div className="detail-stat-grid">
      <div className="detail-stat"><b>{totalMentees}</b><span>Assigned Mentees</span></div>
      <div className="detail-stat"><b>{monitor.completedSessions ?? monitor.CompletedSessions ?? completed}</b><span>Completed Sessions</span></div>
      <div className="detail-stat"><b>{monitor.requiredSessions ?? monitor.RequiredSessions ?? data.settings?.RequiredSessions ?? '—'}</b><span>Required Sessions</span></div>
      <div className="detail-stat"><b>{monitor.progressPercent != null ? `${monitor.progressPercent}%` : '—'}</b><span>Progress</span></div>
    </div>
    <div className="admin-monitor-tabs" role="tablist" aria-label="Mentor detail sections">
      <button type="button" role="tab" aria-selected={activeTab === 'sessions'} className={activeTab === 'sessions' ? 'active' : ''} onClick={() => setActiveTab('sessions')}>Sessions ({sessions.length})</button>
      <button type="button" role="tab" aria-selected={activeTab === 'logsheet'} className={activeTab === 'logsheet' ? 'active' : ''} onClick={() => setActiveTab('logsheet')}>Logsheets ({submittedSessions.length})</button>
      <button type="button" role="tab" aria-selected={activeTab === 'summary'} className={activeTab === 'summary' ? 'active' : ''} onClick={() => setActiveTab('summary')}>Print Summary</button>
    </div>
    {activeTab === 'sessions' && <section className="sessions-section">
      <div className="sessions-section-head"><div><h2 className="sessions-section-title">Mentoring Sessions</h2><span className="sessions-section-count"> ({filtered.length})</span></div>
        <div className="print-btn-group" aria-label="Print submitted session forms">
          <button className="btn-print-main" type="button" onClick={() => printForms('all')} disabled={!submittedSessions.length}><i className="ti ti-printer" /> Print All</button>
          <button className="btn-print-caret" type="button" onClick={() => printForms('logsheet')} disabled={!submittedSessions.length} title="Print logsheets"><i className="ti ti-clipboard-list" /></button>
          <button className="btn-print-caret" type="button" onClick={() => printForms('notes')} disabled={!submittedSessions.length} title="Print mentor's notes"><i className="ti ti-notes" /></button>
          <button className="btn-print-caret" type="button" onClick={() => printForms('nonattend')} disabled={!submittedSessions.length} title="Print non-attendance reports"><i className="ti ti-user-x" /></button>
        </div>
      </div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label className="search-box"><i className="ti ti-search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by topic…" /></label>
        <Select className="filter-select" value={section} onChange={event => setSection(event.target.value)}><option value="">All Sections</option>{sections.map(item => <option key={item}>{item}</option>)}</Select>
        <Select className="filter-select" value={status} onChange={event => setStatus(event.target.value)}><option value="">All Statuses</option>{statuses.map(item => <option key={item}>{item}</option>)}</Select>
        <Select className="filter-select" value={period} onChange={event => setPeriod(event.target.value)}><option value="">All School Years</option>{periods.map(item => <option key={item} value={item}>{item.split('|')[1]}, SY {item.split('|')[0]}</option>)}</Select>
        {(query || section || status || period) && <button className="filter-reset" type="button" onClick={() => { setQuery(''); setSection(''); setStatus(''); setPeriod(''); }}>Clear</button>}
      </div>
      {data.state === 'loading' ? <Empty className="empty-state"><span className="spinner" /> Loading sessions…</Empty>
        : data.state === 'error' ? <Empty className="empty-state">Could not load mentor sessions.</Empty>
          : filtered.length ? <div className="session-list" id="sessionCardsGrid">{filtered.map((session, index) => {
            const sources = proofSources(session);
            const rowStatus = displayStatus(session);
            const present = countPresent(session);
            const total = countAttendees(session);
            const sectionText = sectionList(session).join(' · ') || sessionTitle(session);
            const hasRounds = session.roundDates?.length > 1;
            return <article className={`session-row ${isSubmitted(session) ? '' : 'sr-row--no-logsheet'}`} key={valueOf(session, 'sessionID', 'SessionID') ?? index}>
              <div className="sr-label"><div className="sr-title-group"><span className="sr-num">{session.isMakeup ? `Make-Up Session${session.slotName ? `: ${session.slotName}` : ''}` : valueOf(session, 'slotName', 'SlotName') || 'Session'}</span>
                {session.reportStatus && <span className={`sr-deadline-badge ${session.reportStatus.includes('Overdue') ? 'overdue' : session.reportStatus === 'Submitted Late' ? 'late' : session.reportStatus === 'Submitted On Time' ? 'on-time' : 'pending'}`}>{session.reportStatus}</span>}</div>
                <span className={`badge-status ${(rowStatus === 'In Progress' ? 'scheduled' : rowStatus === 'Closed' ? 'cancelled' : rowStatus).toLowerCase().replaceAll(' ', '-')}`}>{rowStatus}</span>
              </div>
              <div className="sr-info"><div className="sr-section" title={sessionTitle(session)}>{sectionText}</div>
                <div className="sr-when"><i className="ti ti-calendar" /><span>{labelDate(session.sessionDate)}</span><span className="sr-when-sep">·</span><i className="ti ti-clock" /><span>{LogsheetData.time(session.actualStart)} – {LogsheetData.time(session.actualEnd)}</span></div>
                {hasRounds && <span className="sr-conducted-note" title={session.roundDates.map(LogsheetData.day).join(', ')}><i className="ti ti-repeat" /> {session.roundDates.length} sessions conducted</span>}
              </div>
              <div className="sr-right"><div className="sr-metrics"><span className={`sr-metric ${total === 0 ? 'empty' : present === total ? 'full' : 'partial'}`}>{total ? `${present}/${total} Attendance` : '— Attendance'}</span>
                  {sources.length ? <span className="sr-metric proof sr-proof-pill"><button type="button" className="sr-proof-view" onClick={() => setProof({ sources, index: 0 })}>Proof{sources.length > 1 ? ` (${sources.length})` : ''}</button></span> : <span className="sr-metric empty sr-metric--no-proof">No Proof</span>}
                </div>
                <button type="button" className={`sr-view-btn${isSubmitted(session) ? '' : ' sr-view-btn--pending'}`} disabled={!isSubmitted(session)} onClick={() => openSession(session)}>View Logsheet</button>
              </div>
            </article>;
          })}</div> : <Empty className="empty-state">No sessions match these filters.</Empty>}
    </section>}
    {activeTab === 'logsheet' && <section className="sessions-section">
      <div className="sessions-section-head"><div><h2 className="sessions-section-title">Submitted Logsheets</h2><span className="sessions-section-count"> ({submittedSessions.length})</span></div><button className="btn-primary" type="button" onClick={() => printForms('all')} disabled={!submittedSessions.length}><i className="ti ti-printer" /> Print All Forms</button></div>
      {submittedSessions.length ? <div className="session-list">{submittedSessions.map((session, index) => <article className="session-row" key={valueOf(session, 'sessionID', 'SessionID') ?? index}>
        <div className="sr-label"><span className="sr-num">{valueOf(session, 'slotName', 'SlotName') || 'Session'}</span><span className="badge-status completed">Submitted</span></div>
        <div className="sr-info"><div className="sr-section">{sectionList(session).join(' · ') || sessionTitle(session)}</div><div className="sr-when">{labelDate(session.submittedAt || session.sessionDate)}</div></div>
        <div className="sr-right"><button type="button" className="sr-view-btn" onClick={() => openSession(session)}>View Forms</button></div>
      </article>)}</div> : <Empty>No submitted logsheets are available.</Empty>}
    </section>}
    {activeTab === 'summary' && <section className="sessions-section">
      <div className="sessions-section-head"><div><h2 className="sessions-section-title">Mentor Monitoring Summary</h2><p>{`${mentor.firstName || ''} ${mentor.lastName || ''}`.trim()} · {[mentor.departmentName, mentor.school].filter(Boolean).join(' · ') || '—'}</p></div><button className="btn-primary" type="button" onClick={() => window.print()}><i className="ti ti-printer" /> Print Summary</button></div>
      <div className="detail-stat-grid"><div className="detail-stat"><b>{totalMentees}</b><span>Assigned Mentees</span></div><div className="detail-stat"><b>{monitor.completedSessions ?? monitor.CompletedSessions ?? completed}</b><span>Completed Sessions</span></div><div className="detail-stat"><b>{monitor.requiredSessions ?? monitor.RequiredSessions ?? data.settings?.RequiredSessions ?? '—'}</b><span>Required Sessions</span></div><div className="detail-stat"><b>{monitor.progressPercent != null ? `${monitor.progressPercent}%` : '—'}</b><span>Progress</span></div></div>
      <div className="table-responsive"><table className="data-table"><thead><tr><th>Date</th><th>Checkpoint / Section</th><th>Attendance</th><th>Status</th><th>Proof</th></tr></thead><tbody>{filtered.map((session, index) => <tr key={valueOf(session, 'sessionID', 'SessionID') ?? index}><td>{labelDate(session.sessionDate)}</td><td>{valueOf(session, 'slotName', 'SlotName') || 'Session'}{sectionList(session).length ? ` · ${sectionList(session).join(', ')}` : ''}</td><td>{countPresent(session)} / {countAttendees(session)}</td><td>{displayStatus(session)}</td><td>{proofSources(session).length ? 'Submitted' : 'Missing'}</td></tr>)}</tbody></table></div>
      <div className="print-signoff"><span>Reviewed by: __________________________</span><span>Date: ______________</span></div>
    </section>}
  </div></main>
  {selected && <div className="modal-overlay open" onClick={event => event.target === event.currentTarget && setSelected(null)}><section className="modal-card logsheet-modal" role="dialog" aria-modal="true" aria-label="Session forms">
    <header className="lm-header"><div><div className="lm-title-row"><h2 className="lm-title">{selected.isMakeup ? `Make-Up Session${selected.slotName ? `: ${selected.slotName}` : ''}` : selected.slotName || 'Mentoring Logsheet'}</h2>{isSubmitted(selected) && <span className="lm-logstatus-badge lm-logstatus--submitted">✓ Submitted</span>}</div><div className="lm-sub">{labelDate(selected.sessionDate)} · {LogsheetData.time(selected.actualStart)} – {LogsheetData.time(selected.actualEnd)} · {sessionTitle(selected)}</div></div><button className="lm-close" type="button" onClick={() => setSelected(null)} aria-label="Close">×</button></header>
    <nav className="lm-tabs" role="tablist" aria-label="Session forms">{[['logsheet', 'Mentoring Logsheet'], ['notes', "Mentor's Notes"], ['nonattend', 'Non-Attendance Report']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={formTab === key} className={`lm-tab${formTab === key ? ' active' : ''}`} onClick={() => setFormTab(key)}>{label}</button>)}</nav>
    <div className="lm-body">{selectedFormBody}</div>
    <footer className="lm-footer"><button className="btn-outline" type="button" onClick={() => setSelected(null)}>Close</button><button className="btn-primary" type="button" onClick={printSelectedForm} disabled={!isSubmitted(selected)}><i className="ti ti-printer" /> Print / Export PDF</button></footer>
  </section></div>}
  {proof && selectedProof && <div className="lightbox-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setProof(null); }}>
    <section className="lightbox-inner" role="dialog" aria-modal="true" aria-label="Session proof"><header className="lightbox-header"><span className="lightbox-title">{selectedProof.label || 'Session Proof'}</span><button className="lightbox-close" type="button" onClick={() => setProof(null)} aria-label="Close">×</button></header>
      <div className="lightbox-body">{proofIsImage ? <img src={proofUrl} alt={selectedProof.label || 'Session proof'} /> : <iframe title={selectedProof.label || 'Session proof'} src={proofUrl} />}</div>
      <footer className="lightbox-footer">{proof.sources.length > 1 && <div><button type="button" onClick={() => setProof(current => ({ ...current, index: (current.index + current.sources.length - 1) % current.sources.length }))}>Previous</button> {proof.index + 1} / {proof.sources.length} <button type="button" onClick={() => setProof(current => ({ ...current, index: (current.index + 1) % current.sources.length }))}>Next</button></div>}
        <a className="lightbox-download" href={CONFIG.getUrl(`ProofOfSession/download?path=${encodeURIComponent(selectedProof.filePath)}`)} target="_blank" rel="noreferrer">Download proof</a></footer>
    </section>
  </div>}
  </Page>;
}
