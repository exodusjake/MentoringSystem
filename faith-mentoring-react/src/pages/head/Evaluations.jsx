import { useEffect, useMemo, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { AttachmentList, attachIconBasic, formatFileSizeBasic } from '../../components/announcements/attachments.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { evaluationDeadline, evaluationDeadlineLabel } from '../../lib/evaluation-deadline.js';
import { ContentBody, useSeeMore } from '../../components/announcements/SeeMore.jsx';

const list = value => Array.isArray(value) ? value : value?.data || value?.items || [];
const val = (item, ...keys) => keys.map(key => item?.[key]).find(value => value != null);
const linkId = item => val(item, 'linkID', 'LinkID', 'evaluationLinkID', 'EvaluationLinkID', 'id', 'ID');

export default function HeadEvaluations() {
  const [state, setState] = useState({ loading: true });
  const [selected, setSelected] = useState(null);
  const [submissions, setSubmissions] = useState({ loading: false, items: [] });
  const [selectedProof, setSelectedProof] = useState(null);
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  const formsListRef = useRef(null);
  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      apiRequest('EvaluationLinks', 'GET', null, true),
      apiRequest('EvaluationAttachments', 'GET', null, true),
      apiRequest('EvaluationSubmissions/summary', 'GET', null, true),
    ]).then(([formsResult, attachmentsResult, summaryResult]) => {
      if (!alive) return;
      if (formsResult.status === 'rejected') { setState({ loading: false, error: formsResult.reason?.message || 'Unable to load evaluation forms.' }); return; }
      const summary = {};
      list(summaryResult.status === 'fulfilled' ? summaryResult.value : []).forEach(item => {
        summary[val(item, 'linkID', 'LinkID')] = item;
      });
      setState({
        loading: false,
        forms: list(formsResult.value),
        attachments: list(attachmentsResult.status === 'fulfilled' ? attachmentsResult.value : []),
        summary,
        warnings: [
          attachmentsResult.status === 'rejected' && `Evaluation attachments: ${attachmentsResult.reason?.message || 'could not be loaded.'}`,
          summaryResult.status === 'rejected' && `Submission counts: ${summaryResult.reason?.message || 'could not be loaded.'}`,
        ].filter(Boolean),
      });
    });
    return () => { alive = false; };
  }, [retry]);
  const forms = useMemo(() => (state.forms || [])
    .filter(form => `${val(form, 'title', 'Title', 'description', 'Description') || ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(!!val(b, 'isPinned', 'IsPinned')) - Number(!!val(a, 'isPinned', 'IsPinned'))
      || new Date(val(b, 'postedAt', 'PostedAt') || 0) - new Date(val(a, 'postedAt', 'PostedAt') || 0)
      || Number(linkId(b) || 0) - Number(linkId(a) || 0)), [state.forms, query]);
  const [seeMore, toggleSeeMore] = useSeeMore(formsListRef, !state.loading && !state.error, [forms], query);
  const showSubmissions = async form => {
    setSelected(form); setSubmissions({ loading: true, items: [] });
    try { const result = await apiRequest(`EvaluationSubmissions/${linkId(form)}`, 'GET', null, true); setSubmissions({ loading: false, items: list(result) }); }
    catch (error) { setSubmissions({ loading: false, items: [], error: error?.message || 'Unable to load submissions.' }); }
  };
  const summaryFor = id => state.summary?.[id] || state.summary?.[String(id)] || {};
  return <Page id="HEAD/evaluation-forms"><div className="main-wrapper"><main className="page-content">
    <div className="page-header"><div><h1>Evaluation Forms</h1><p>View published evaluations and track submission progress.</p></div></div>
    <section className="forms-section"><div className="forms-section-header"><h2>All Evaluation Forms</h2><span className="eval-count">{forms.length} results</span></div>
      <div className="ann-filter-bar"><div className="ann-search-box"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search forms…" aria-label="Search evaluation forms" /></div></div>
    </section>
    {state.warnings?.length > 0 && <div className="error-message" role="status"><strong>Some evaluation information could not be loaded.</strong><ul>{state.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
    {state.loading ? <div className="eval-loading" role="status">Loading evaluation forms…</div> : state.error ? <div role="alert" className="eval-empty">{state.error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></div> : forms.length ?     <div className="forms-list" ref={formsListRef}>
      {forms.map((form, index) => {
        const id = linkId(form); const summary = summaryFor(id);
        const files = (state.attachments || []).filter(file => String(val(file, 'linkID', 'LinkID', 'evaluationLinkID', 'EvaluationLinkID')) === String(id));
        const deadline = val(form, 'deadline', 'Deadline', 'dueDate', 'DueDate');
        const deadlineDate = evaluationDeadline(deadline);
        const now = new Date();
        const isPast = deadlineDate && deadlineDate <= now;
        const isSoon = deadlineDate && !isPast && deadlineDate - now < 3 * 24 * 60 * 60 * 1000;
        const formUrl = val(form, 'googleFormURL', 'GoogleFormURL', 'formURL', 'FormURL');
        return <article className={`announce-card announce-card--eval${val(form, 'isPinned', 'IsPinned') ? ' announce-card--pinned' : ''}`} key={id ?? index}>
          {val(form, 'isPinned', 'IsPinned') && <div className="ann-pin-banner"><i className="ti ti-pinned" /> Pinned</div>}
          <div className="ann-card-top"><div className="ann-avatar ann-avatar-amber"><i className="ti ti-clipboard-check" /></div>
            <div className="ann-card-info"><div className="ann-card-name evaluation-author"><strong>{val(form, 'postedByName', 'PostedByName') || 'Name unavailable'}</strong></div>
              <div className="ann-card-date">{val(form, 'postedAt', 'PostedAt') ? new Date(val(form, 'postedAt', 'PostedAt')).toLocaleDateString() : '—'}</div></div>
            {deadline && <span className={`eval-deadline-badge ${isPast ? 'past' : isSoon ? 'soon' : ''}`}><i className="ti ti-clock" /> Due {evaluationDeadlineLabel(deadline)}{isPast ? ' · Overdue' : ''}</span>}
          </div>
          <div className="announce-title">{val(form, 'title', 'Title', 'name', 'Name') || 'Evaluation form'}</div>
          {val(form, 'description', 'Description') && <ContentBody id={id} html={val(form, 'description', 'Description')} seeMore={seeMore[`ann-content-${id}`]} onToggle={() => toggleSeeMore(`ann-content-${id}`)} />}
          <AttachmentList items={files} downloadPath="EvaluationAttachments" icon={attachIconBasic} size={formatFileSizeBasic} />
          <footer className="eval-form-footer"><button type="button" className="eval-submit-count-btn" onClick={() => showSubmissions(form)}><i className="ti ti-users" /> {val(summary, 'submittedCount', 'SubmittedCount', 'submitted', 'Submitted') ?? 0} / {val(summary, 'totalMentees', 'TotalMentees', 'totalCount', 'TotalCount') ?? 0} submitted</button>
            {formUrl && <a href={formUrl} target="_blank" rel="noopener noreferrer" className="btn-open-form"><i className="ti ti-external-link" /> Open Form</a>}</footer>
        </article>;
      })}
    </div> : <div className="eval-empty">No evaluation forms posted yet.</div>}
    {selected && <div className="modal-overlay active" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="submissions-title"><header className="modal-header"><h2 id="submissions-title">Submissions — {val(selected, 'title', 'Title') || 'Evaluation form'}</h2><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button></header>
        <div className="modal-body">{submissions.loading ? <p role="status">Loading submissions…</p> : submissions.error ? <p role="alert">{submissions.error}</p> : submissions.items.length ? <div className="submit-detail-list">{submissions.items.map((item, index) => {
          const submitted = !!val(item, 'hasSubmitted', 'HasSubmitted');
          const name = `${val(item, 'firstName', 'FirstName') || ''} ${val(item, 'lastName', 'LastName') || ''}`.trim() || val(item, 'menteeName', 'MenteeName', 'fullName', 'FullName') || 'Mentee';
          const submittedAt = val(item, 'submittedAt', 'SubmittedAt');
          const proofPath = val(item, 'proofFilePath', 'ProofFilePath');
          const proofUrl = proofPath ? CONFIG.getFileUrl(proofPath) : '';
          const proofImage = /image|jpg|jpeg|png|gif|webp/i.test(`${val(item, 'proofFileType', 'ProofFileType') || ''} ${proofPath || ''}`);
          return <div className={`submit-detail-row${submitted ? ' is-done' : ''}`} key={val(item, 'submissionID', 'SubmissionID', 'menteeID', 'MenteeID', 'id', 'ID') ?? index}>
            <div><strong>{name}</strong>{submitted && submittedAt && <small>{new Date(submittedAt).toLocaleDateString()}</small>}</div><span>{submitted ? 'Submitted' : 'Not submitted'}{submitted && proofPath && <button type="button" className="btn-outline" onClick={() => setSelectedProof({ name, path: proofPath, url: proofUrl, image: proofImage })}>View proof</button>}</span>
          </div>;
        })}</div> : <div className="eval-empty">No active mentees to show.</div>}</div>
      </section>
    </div>}
    {selectedProof && <div className="proof-modal-overlay active" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedProof(null); }}>
      <section className="proof-modal" role="dialog" aria-modal="true" aria-label={`${selectedProof.name} evaluation proof`}>
        <header className="proof-modal-header"><strong>{selectedProof.name} — Evaluation proof</strong><button type="button" onClick={() => setSelectedProof(null)} aria-label="Close">×</button></header>
        <div className="proof-modal-body">{selectedProof.image ? <img src={selectedProof.url} alt={`${selectedProof.name}'s evaluation proof`} /> : <iframe title={`${selectedProof.name}'s evaluation proof`} src={selectedProof.url} />}</div>
        <footer><a className="proof-modal-download" href={selectedProof.url} target="_blank" rel="noreferrer" download>Download proof</a></footer>
      </section>
    </div>}
  </main></div></Page>;
}
