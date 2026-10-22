import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { buildMentorNotesForm, buildNonAttendanceForm, buildPrintForm, openPrintWindow } from '../../lib/mentorLogsheetPrint.js';

const rows = value => Array.isArray(value) ? value : value?.data || value?.items || value?.sessions || value?.Sessions || value?.logsheets || value?.Logsheets || [];
const val = (item, ...keys) => keys.map(key => item?.[key]).find(value => value != null);
const displayDate = value => value ? new Date(value).toLocaleDateString() : '—';

export default function HeadMonitoringDetail() {
  const { id: routeId } = useParams();
  const [params] = useSearchParams();
  const id = routeId || params.get('id');
  const school = params.get('school') || '';
  const [state, setState] = useState({ loading: true });
  const [tab, setTab] = useState('sessions');
  const [sessionStatus, setSessionStatus] = useState('');
  const [sessionPeriod, setSessionPeriod] = useState('');
  const [menteeSearch, setMenteeSearch] = useState('');
  const [proof, setProof] = useState(null);
  const [printSession, setPrintSession] = useState(null);
  const [printTab, setPrintTab] = useState('logsheet');
  useEffect(() => {
    if (!id) { setState({ loading: false, error: 'A mentor ID is required.' }); return undefined; }
    let alive = true;
    Promise.all([
      apiRequest(`MonitorActivities/${encodeURIComponent(id)}`, 'GET', null, true),
      apiRequest(`SessionsAdmin/${encodeURIComponent(id)}/sessions`, 'GET', null, true),
      apiRequest(`SessionsAdmin/${encodeURIComponent(id)}/logsheet`, 'GET', null, true),
      apiRequest('Settings', 'GET', null, true),
      apiRequest('CalendarEvents', 'GET', null, true),
    ]).then(([mentor, sessions, logsheets, settings, events]) => {
      if (alive) {
        const sheet = logsheets?.data || logsheets || {};
        setState({
          loading: false,
          mentor: mentor?.data || mentor,
          sessions: rows(sessions?.data || sessions),
          logsheets: rows(sheet?.sessions || sheet),
          logsheetMentor: sheet?.mentor || mentor?.data || mentor,
          settings: settings || {},
          events: rows(events),
          loadWarning: !logsheets,
        });
      }
    }).catch(error => { if (alive) setState({ loading: false, error: error?.message || 'Unable to load mentor details.' }); });
    return () => { alive = false; };
  }, [id]);
  const mentor = state.mentor || {};
  const sessions = state.sessions || [];
  const events = state.events || [];
  const name = val(mentor, 'mentorName', 'MentorName', 'fullName', 'FullName', 'name', 'Name')
    || `${val(mentor, 'firstName', 'FirstName') || ''} ${val(mentor, 'lastName', 'LastName') || ''}`.trim()
    || 'Mentor details';
  const mentees = rows(mentor.mentees || mentor.Mentees);
  const periods = [...new Set(sessions.map(session => {
    const year = val(session, 'schoolYear', 'SchoolYear');
    const semester = val(session, 'semester', 'Semester');
    return year && semester ? `${year}|${semester}` : '';
  }).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const sessionRows = sessions.filter(session => {
    const rowStatus = val(session, 'sessionStatus', 'SessionStatus', 'status', 'Status') || 'Scheduled';
    const period = `${val(session, 'schoolYear', 'SchoolYear') || ''}|${val(session, 'semester', 'Semester') || ''}`;
    return (!sessionStatus || rowStatus.toLowerCase() === sessionStatus.toLowerCase())
      && (!sessionPeriod || period === sessionPeriod);
  }).sort((a, b) => new Date(val(a, 'sessionDate', 'SessionDate') || 0) - new Date(val(b, 'sessionDate', 'SessionDate') || 0));
  const rawLogsheets = state.logsheets || [];
  const mergedLogsheets = useMemo(() => LogsheetData.merge(rawLogsheets), [rawLogsheets]);
  const logsheetFor = session => {
    const sessionId = val(session, 'sessionID', 'SessionID', 'id', 'ID');
    return mergedLogsheets.find(item => String(item.sessionID) === String(sessionId)
      || item._sources?.some(source => String(val(source, 'sessionID', 'SessionID')) === String(sessionId)))
      || rawLogsheets.find(item => String(val(item, 'sessionID', 'SessionID')) === String(sessionId))
      || session;
  };
  const submittedSheets = sessions.map(logsheetFor)
    .filter(sheet => val(sheet, 'logStatus', 'LogStatus') === 'Submitted');
  const printAll = formType => {
    if (!submittedSheets.length) return;
    const body = submittedSheets.map(sheet => {
      const semester = LogsheetData.periodLabel(sheet);
      if (formType === 'all') {
        return buildPrintForm(sheet, state.logsheetMentor, semester)
          + buildMentorNotesForm(sheet, state.logsheetMentor, semester)
          + buildNonAttendanceForm(sheet, state.logsheetMentor, semester);
      }
      if (formType === 'notes') return buildMentorNotesForm(sheet, state.logsheetMentor, semester);
      if (formType === 'nonattend') return buildNonAttendanceForm(sheet, state.logsheetMentor, semester);
      return buildPrintForm(sheet, state.logsheetMentor, semester);
    }).join('');
    const title = {
      all: 'All Forms — All Sessions',
      logsheet: 'Mentoring Logsheet — All Sessions',
      notes: "Mentor's Notes — All Sessions",
      nonattend: 'Non-Attendance — All Sessions',
    }[formType];
    if (!openPrintWindow(title, body)) window.alert('Please allow pop-ups to preview and print the forms.');
  };
  const openPrint = () => {
    if (!printSession) return;
    const target = logsheetFor(printSession);
    const semester = `${val(target, 'semester', 'Semester') || val(state.settings, 'semester', 'Semester') || 'Period unavailable'}, AY ${val(target, 'schoolYear', 'SchoolYear') || val(state.settings, 'schoolYear', 'SchoolYear') || 'unavailable'}`;
    const body = printTab === 'notes'
      ? buildMentorNotesForm(target, state.logsheetMentor, semester)
      : printTab === 'nonattend'
        ? buildNonAttendanceForm(target, state.logsheetMentor, semester)
        : buildPrintForm(target, state.logsheetMentor, semester);
    if (!openPrintWindow(printTab === 'notes' ? "Mentor's Notes" : printTab === 'nonattend' ? 'Non-Attendance Report' : 'Mentoring Logsheet', body)) {
      window.alert('Please allow pop-ups to preview and print the form.');
    }
  };
  const menteeRows = mentees.filter(mentee => `${val(mentee, 'firstName', 'FirstName') || ''} ${val(mentee, 'lastName', 'LastName') || ''} ${val(mentee, 'section', 'Section', 'sectionName', 'SectionName') || ''}`.toLowerCase().includes(menteeSearch.toLowerCase()));
  const selectedProof = proof?.sources?.[proof.index] || null;
  const proofUrl = selectedProof ? CONFIG.getFileUrl(selectedProof.filePath) : '';
  const isImage = /image|jpg|jpeg|png|gif|webp/i.test(`${selectedProof?.fileType || ''} ${selectedProof?.filePath || ''}`);
  return <Page id="HEAD/mentor-detail"><div className="main-wrapper"><main className="page-content">
    <div className="page-header"><div><Link to={`/head/monitoring${school ? `?school=${encodeURIComponent(school)}` : ''}`}>← Back to monitoring</Link><h1>{name}</h1><p>{val(mentor, 'schoolName', 'SchoolName', 'school', 'School') || school || '—'}</p></div></div>
    {state.loading ? <div role="status">Loading mentor details…</div> : state.error ? <div role="alert" className="error-message">{state.error}</div> : <>
      <section className="dashboard-stats">
        {[['Sessions', val(mentor, 'totalSessions', 'TotalSessions', 'sessionsCompleted', 'SessionsCompleted') ?? sessions.length],
          ['Mentees', val(mentor, 'menteeCount', 'MenteeCount', 'totalMentees', 'TotalMentees') ?? '—'],
          ['Progress', `${val(mentor, 'completionRate', 'CompletionRate', 'overallProgress', 'OverallProgress') ?? 0}%`],
          ['Status', val(mentor, 'status', 'Status', 'engagementStatus', 'EngagementStatus') || 'Active']].map(([label, value]) => <article className="stat-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}
      </section>
      <section className="content-card"><h2>Mentor Information</h2><dl>
        <dt>Email</dt><dd>{val(mentor, 'email', 'Email') || '—'}</dd><dt>Department</dt><dd>{val(mentor, 'department', 'Department') || '—'}</dd>
        <dt>Evaluation period</dt><dd>{val(state.settings, 'currentPeriod', 'CurrentPeriod', 'evaluationPeriod', 'EvaluationPeriod') || '—'}</dd>
      </dl><Link to={`/head/attendance/${encodeURIComponent(id)}`}>View mentor attendance</Link></section>
      <section className="content-card">
        <div className="detail-tabs" role="tablist" aria-label="Mentor detail views">
          <button role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>Sessions &amp; Logsheets</button>
          <button role="tab" aria-selected={tab === 'mentees'} className={tab === 'mentees' ? 'active' : ''} onClick={() => setTab('mentees')}>Mentees ({mentees.length})</button>
        </div>
        {tab === 'sessions' ? <>
          <div className="section-header"><h2>Session Activity</h2><div className="report-actions" aria-label="Export submitted session forms">
            <button type="button" onClick={() => printAll('all')} disabled={!submittedSheets.length}>Print all forms</button>
            <button type="button" onClick={() => printAll('logsheet')} disabled={!submittedSheets.length}>Logsheets</button>
            <button type="button" onClick={() => printAll('notes')} disabled={!submittedSheets.length}>Mentor’s notes</button>
            <button type="button" onClick={() => printAll('nonattend')} disabled={!submittedSheets.length}>Non-attendance</button>
          </div></div>
          {state.loadWarning && <p role="alert">Logsheet data could not be loaded; session proof and print details may be incomplete.</p>}
          <div className="filter-bar">
            <label>Status <select value={sessionStatus} onChange={event => setSessionStatus(event.target.value)}><option value="">All statuses</option><option>Completed</option><option>Scheduled</option><option>Cancelled</option></select></label>
            <label>Period <select value={sessionPeriod} onChange={event => setSessionPeriod(event.target.value)}><option value="">All school years</option>{periods.map(value => <option key={value} value={value}>{value.split('|')[1]}, SY {value.split('|')[0]}</option>)}</select></label>
          </div>
          <p>{sessionRows.length} session{sessionRows.length === 1 ? '' : 's'}</p>
          {sessionRows.length ? <div className="table-responsive"><table><thead><tr><th>Date</th><th>Checkpoint / Section</th><th>Attendance</th><th>Logsheet</th><th>Proof</th><th>Status</th></tr></thead><tbody>
            {sessionRows.map((session, index) => {
              const sessionSheet = logsheetFor(session);
              const proofSources = sessionSheet._proofSources?.length
                ? sessionSheet._proofSources
                : val(session, 'proofFilePath', 'ProofFilePath')
                  ? [{ filePath: val(session, 'proofFilePath', 'ProofFilePath'), fileType: val(session, 'proofFileType', 'ProofFileType'), label: val(session, 'slotName', 'SlotName') || 'Session proof' }]
                  : [];
              const status = val(session, 'sessionStatus', 'SessionStatus', 'status', 'Status') || '—';
              return <tr key={val(session, 'sessionID', 'SessionID', 'id', 'ID') ?? index}>
                <td>{displayDate(val(session, 'sessionDate', 'SessionDate'))}</td>
                <td>{val(session, 'slotName', 'SlotName', 'title', 'Title', 'subject', 'Subject') || 'Session'}{val(session, 'sectionCode', 'SectionCode') ? ` · ${val(session, 'sectionCode', 'SectionCode')}` : ''}</td>
                <td>{val(session, 'presentCount', 'PresentCount') ?? '—'} / {val(session, 'totalAttendees', 'TotalAttendees') ?? '—'}</td>
                <td><button type="button" onClick={() => { setPrintSession(session); setPrintTab('logsheet'); }}>Preview forms</button></td>
                <td>{proofSources.length ? <button type="button" onClick={() => setProof({ sources: proofSources, index: 0 })}>View proof{proofSources.length > 1 ? ` (${proofSources.length})` : ''}</button> : '—'}</td>
                <td>{status}</td>
              </tr>;
            })}
          </tbody></table></div> : <Empty>No sessions found.</Empty>}
        </> : <>
          <div className="section-header"><h2>Mentees</h2><input value={menteeSearch} onChange={event => setMenteeSearch(event.target.value)} placeholder="Search mentees…" aria-label="Search mentees" /></div>
          <p>{menteeRows.length} mentee{menteeRows.length === 1 ? '' : 's'}</p>
          {menteeRows.length ? <div className="table-responsive"><table><thead><tr><th>Mentee</th><th>Section</th><th>School</th><th>Status</th></tr></thead><tbody>{menteeRows.map((mentee, index) => <tr key={val(mentee, 'menteeID', 'MenteeID', 'userID', 'UserID', 'id', 'ID') ?? index}>
            <td>{`${val(mentee, 'firstName', 'FirstName') || ''} ${val(mentee, 'lastName', 'LastName') || ''}`.trim() || val(mentee, 'fullName', 'FullName', 'name', 'Name') || 'Mentee'}</td>
            <td>{val(mentee, 'section', 'Section', 'sectionName', 'SectionName') || '—'}</td><td>{val(mentee, 'school', 'School') || '—'}</td><td>{val(mentee, 'status', 'Status') || 'Active'}</td>
          </tr>)}</tbody></table></div> : <Empty>No mentees assigned.</Empty>}
        </>}
      </section>
      <section className="content-card"><h2>Program Events</h2>{events.length ? events.slice(0, 8).map((event, i) => <p key={val(event, 'eventID', 'EventID', 'id', 'ID') ?? i}>{val(event, 'title', 'Title') || 'Event'} · {displayDate(val(event, 'startDate', 'StartDate'))}</p>) : <Empty>No upcoming events.</Empty>}</section>
    </>}
      {proof && <div className="proof-modal-overlay active" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setProof(null); }}>
        <section className="proof-modal" role="dialog" aria-modal="true" aria-label={proof.label}>
          <header className="proof-modal-header"><strong>{selectedProof?.label || 'Session proof'}</strong><button type="button" onClick={() => setProof(null)} aria-label="Close">×</button></header>
          <div className="proof-modal-body">{isImage ? <img src={proofUrl} alt={selectedProof?.label || 'Session proof'} /> : <iframe title={selectedProof?.label || 'Session proof'} src={proofUrl} />}</div>
          <footer>{proof.sources.length > 1 && <div><button type="button" onClick={() => setProof(value => ({ ...value, index: (value.index + value.sources.length - 1) % value.sources.length }))}>Previous</button> {proof.index + 1} / {proof.sources.length} <button type="button" onClick={() => setProof(value => ({ ...value, index: (value.index + 1) % value.sources.length }))}>Next</button></div>}
            <a className="proof-modal-download" href={CONFIG.getUrl(`ProofOfSession/download?path=${encodeURIComponent(selectedProof.filePath)}`)} target="_blank" rel="noreferrer">Download proof</a></footer>
        </section>
      </div>}
      {printSession && <div className="modal-overlay active" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPrintSession(null); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="print-forms-title">
          <header className="modal-header"><h2 id="print-forms-title">Preview &amp; Print Forms</h2><button className="modal-close" onClick={() => setPrintSession(null)} aria-label="Close">×</button></header>
          <div className="modal-body">
            <div className="detail-tabs" role="tablist" aria-label="Printable forms">
              <button role="tab" aria-selected={printTab === 'logsheet'} className={printTab === 'logsheet' ? 'active' : ''} onClick={() => setPrintTab('logsheet')}>Mentoring Logsheet</button>
              <button role="tab" aria-selected={printTab === 'notes'} className={printTab === 'notes' ? 'active' : ''} onClick={() => setPrintTab('notes')}>Mentor’s Notes</button>
              <button role="tab" aria-selected={printTab === 'nonattend'} className={printTab === 'nonattend' ? 'active' : ''} onClick={() => setPrintTab('nonattend')}>Non-Attendance Report</button>
            </div>
            <h3>{val(printSession, 'slotName', 'SlotName', 'title', 'Title') || 'Mentoring session'} · {displayDate(val(printSession, 'sessionDate', 'SessionDate'))}</h3>
            <p>Selected form will open in a printable preview window.</p>
          </div>
          <footer className="modal-footer"><button type="button" className="btn-outline" onClick={() => setPrintSession(null)}>Close</button><button type="button" className="btn-primary" onClick={openPrint}>Open Print Preview</button></footer>
        </section>
      </div>}
  </main></div></Page>;
}
