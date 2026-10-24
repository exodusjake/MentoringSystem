import { useCallback, useEffect, useState } from 'react';
import Page from '../../app/Page.jsx';
import DateInput from '../../components/DateInput.jsx';
import Empty from '../../components/Empty.jsx';
import { AttachmentList, attachIconBasic, formatFileSizeBasic } from '../../components/announcements/attachments.jsx';
import { apiRequest } from '../../lib/api.js';
import { evaluationDeadline, evaluationDeadlineInput, evaluationDeadlineLabel } from '../../lib/evaluation-deadline.js';
import { sanitizeHtml } from '../../lib/security-utils.js';
import { getSession } from '../../lib/session.js';
import { showConfirm, showToast } from '../../components/Notify.jsx';

const linkId = form => form.linkID ?? form.LinkID;
const BLANK = { title: '', googleFormURL: '', description: '', deadline: '' };

export default function AdminEvaluations() {
  const [forms, setForms] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [summary, setSummary] = useState([]);
  const [state, setState] = useState('loading');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [responses, setResponses] = useState(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [items, files, counts] = await Promise.all([
        apiRequest('EvaluationLinks', 'GET', null, true),
        apiRequest('EvaluationAttachments', 'GET', null, true),
        apiRequest('EvaluationSubmissions/summary', 'GET', null, true),
      ]);
      setForms((items || []).sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned) || new Date(b.postedAt) - new Date(a.postedAt)));
      setAttachments(files || []); setSummary(counts || []); setState('ready');
    } catch (e) { setState('error'); showToast(e.message || 'Could not load evaluation forms.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const filtered = forms.filter(f => !query.trim() || `${f.title || ''} ${f.description || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const submissionCount = id => {
    const row = summary.find(s => String(s.linkID ?? s.evaluationLinkID) === String(id));
    return row?.submissionCount ?? row?.totalSubmissions ?? row?.count ?? 0;
  };
  const filesFor = id => attachments.filter(a => String(a.linkID ?? a.evaluationLinkID) === String(id));

  function edit(item = null) {
    setForm(item ? { id: linkId(item), title: item.title || '', googleFormURL: item.googleFormURL || '', description: item.description || '', deadline: evaluationDeadlineInput(item.deadline) } : { ...BLANK });
    setPendingFiles([]);
  }
  async function save(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.googleFormURL.trim()) { showToast('Enter the form title and Google Form URL.'); return; }
    try { if (!new URL(form.googleFormURL).protocol.startsWith('http')) throw new Error(); }
    catch { showToast('Enter a valid full URL, including https://.'); return; }
    const deadline = form.deadline || null;
    if (deadline && !evaluationDeadline(deadline)) { showToast('Enter a valid deadline date and time.'); return; }
    setSaving(true);
    const current = forms.find(f => String(linkId(f)) === String(form.id));
    const payload = { title: form.title.trim(), googleFormURL: form.googleFormURL.trim(), description: form.description.trim() || null, deadline, postedByUserID: current?.postedByUserID || getSession()?.user?.userID };
    try {
      const response = form.id
        ? await apiRequest(`EvaluationLinks/${form.id}`, 'PUT', { ...payload, linkID: form.id, isPinned: current?.isPinned || false, postedAt: current?.postedAt }, true)
        : await apiRequest('EvaluationLinks', 'POST', { ...payload, isPinned: false, postedAt: new Date().toISOString() }, true);
      const newId = form.id || response?.linkID || response?.LinkID;
      for (const file of pendingFiles) {
        if (!newId) break;
        const fd = new FormData(); fd.append('evaluationLinkId', newId); fd.append('file', file);
        await apiRequest('EvaluationAttachments/upload', 'POST', fd, true);
      }
      setForm(null); showToast(form.id ? 'Evaluation updated.' : 'Evaluation form posted.', 'success'); await load();
    } catch (e) { showToast(e.message || 'Could not save evaluation form.'); }
    finally { setSaving(false); }
  }
  async function togglePin(item) {
    try { await apiRequest(`EvaluationLinks/${linkId(item)}/pin`, 'PATCH', null, true); await load(); }
    catch (e) { showToast(e.message || 'Could not update pin.'); }
  }
  async function remove(item) {
    if (!await showConfirm(`Delete “${item.title}”?`, { confirmText: 'Delete' })) return;
    try { await apiRequest(`EvaluationLinks/${linkId(item)}`, 'DELETE', null, true); showToast('Evaluation form deleted.', 'success'); await load(); }
    catch (e) { showToast(e.message || 'Could not delete form.'); }
  }
  async function viewResponses(item) {
    setResponses({ title: item.title, state: 'loading', rows: [] });
    try {
      const rows = await apiRequest(`EvaluationSubmissions/${linkId(item)}`, 'GET', null, true);
      setResponses({ title: item.title, state: 'ready', rows: rows || [] });
    } catch (e) { setResponses({ title: item.title, state: 'error', rows: [], message: e.message }); }
  }

  return <Page id="ADMIN_/evaluation-forms"><main className="main-wrapper"><div className="page-content">
    <header className="page-header"><div className="page-header-top"><div><h1>Evaluation Forms</h1><p>Share evaluation links, manage deadlines and review submissions.</p></div><button className="btn-primary" onClick={() => edit()}><i className="ti ti-plus" /> Add Evaluation</button></div></header>
    <div className="eval-toolbar toolbar"><label className="search-box"><i className="ti ti-search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search evaluation forms…" /></label><button className="filter-reset" onClick={load}>Refresh</button></div>
    <div className="eval-list">
      {state === 'loading' ? <Empty className="eval-empty">Loading evaluation forms…</Empty> : state === 'error' ? <Empty className="eval-empty">Could not load evaluation forms.</Empty> : filtered.map(item => {
        const id = linkId(item), deadline = evaluationDeadline(item.deadline);
        const past = deadline && deadline <= Date.now();
        const soon = deadline && !past && deadline - Date.now() < 3 * 86400000;
        return <article className={`evaluation-card ${item.isPinned ? 'pinned' : ''}`} key={id}>
          <div className="evaluation-card-top"><div><h2>{item.title}</h2><div className="eval-meta"><span>{item.postedByName || 'Administration'}</span><time>{item.postedAt ? new Date(item.postedAt).toLocaleDateString() : ''}</time>{item.isPinned && <span className="eval-pin-badge"><i className="ti ti-pin" /> Pinned</span>}</div></div>
            <div className="eval-actions"><button className="btn-outline" onClick={() => togglePin(item)} title="Pin / unpin"><i className="ti ti-pin" /></button><button className="btn-outline" onClick={() => edit(item)}>Edit</button><button className="btn-outline danger" onClick={() => remove(item)}>Delete</button></div></div>
          {item.deadline && <div className={`eval-deadline-badge ${past ? 'past' : soon ? 'soon' : ''}`}><i className="ti ti-clock" /> Due {evaluationDeadlineLabel(item.deadline)}{past ? ' · Overdue' : ''}</div>}
          {!!item.description && <div className="announce-content eval-description" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.description) }} />}
          <AttachmentList items={filesFor(id)} downloadPath="EvaluationAttachments" icon={attachIconBasic} size={formatFileSizeBasic} />
          <div className="evaluation-card-footer"><a className="btn-primary" href={item.googleFormURL} target="_blank" rel="noreferrer"><i className="ti ti-external-link" /> Open Evaluation Form</a><button className="btn-outline" onClick={() => viewResponses(item)}><i className="ti ti-list-check" /> View Submissions ({submissionCount(id)})</button></div>
        </article>;
      })}
      {state === 'ready' && !filtered.length && <Empty className="eval-empty">No evaluation forms found.</Empty>}
    </div>
  </div></main>
  {form && <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setForm(null)}><section className="modal-card evaluation-modal">
    <header className="modal-header"><h2>{form.id ? 'Edit Evaluation Form' : 'Create Evaluation Form'}</h2><button onClick={() => setForm(null)} aria-label="Close">×</button></header>
    <form onSubmit={save}><label>Title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required maxLength="200" /></label>
      <label>Google Form URL<input type="url" value={form.googleFormURL} onChange={e => setForm({ ...form, googleFormURL: e.target.value })} placeholder="https://forms.google.com/…" required /></label>
      <label>Description<textarea rows="5" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <label>Deadline<DateInput type="datetime-local" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></label>
      <label>Attachments<input type="file" multiple onChange={e => setPendingFiles(Array.from(e.target.files || []))} /></label>
      {pendingFiles.length > 0 && <ul>{pendingFiles.map((f, i) => <li key={`${f.name}-${i}`}>{f.name}</li>)}</ul>}
      <div className="modal-actions"><button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save Changes' : 'Post Form'}</button></div>
    </form>
  </section></div>}
  {responses && <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setResponses(null)}><section className="modal-card eval-responses-modal">
    <header className="modal-header"><h2>Submissions: {responses.title}</h2><button onClick={() => setResponses(null)} aria-label="Close">×</button></header>
    {responses.state === 'loading' ? <Empty className="eval-empty">Loading submissions…</Empty> : responses.state === 'error' ? <Empty className="eval-empty">{responses.message || 'Could not load submissions.'}</Empty> : <div className="table-responsive"><table className="data-table"><thead><tr><th>Submitted By</th><th>Submitted</th><th>Rating</th><th>Comments</th></tr></thead><tbody>{responses.rows.map((r, i) => <tr key={r.submissionID || i}><td>{r.menteeName || r.userName || r.submittedBy || r.email || 'Mentee'}</td><td>{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}</td><td>{r.rating ?? r.overallRating ?? '—'}</td><td>{r.comments || r.feedback || '—'}</td></tr>)}{!responses.rows.length && <tr><td colSpan="4"><Empty className="eval-empty">No submissions yet.</Empty></td></tr>}</tbody></table></div>}
    <div className="modal-actions"><button className="btn-outline" onClick={() => setResponses(null)}>Close</button></div>
  </section></div>}
  </Page>;
}
