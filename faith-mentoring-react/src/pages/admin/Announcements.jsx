import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { AttachmentList, attachIconBasic, formatFileSizeBasic } from '../../components/announcements/attachments.jsx';
import { apiRequest } from '../../lib/api.js';
import { sanitizeHtml } from '../../lib/security-utils.js';
import { getSession } from '../../lib/session.js';
import { showConfirm, showToast } from '../../components/Notify.jsx';

const idOf = item => item.announcementID ?? item.AnnouncementID;
const commentIdOf = comment => comment.commentID ?? comment.CommentID;
const commentAnnouncementIdOf = comment => comment.announcementID ?? comment.AnnouncementID;
const dateOf = value => value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '';

export default function AdminAnnouncements() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = getSession()?.user;
  const userId = currentUser?.userID ?? currentUser?.UserID;
  const [items, setItems] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [comments, setComments] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentEdits, setCommentEdits] = useState({});
  const [savingCommentId, setSavingCommentId] = useState(null);
  const [state, setState] = useState('loading');
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState('');
  const [active, setActive] = useState('all');
  const [form, setForm] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deepLink, setDeepLink] = useState(new URLSearchParams(location.search).get('id'));

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [announcements, files] = await Promise.all([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest('AnnouncementAttachments', 'GET', null, true),
      ]);
      setItems((announcements || []).sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned) || new Date(b.postedAt) - new Date(a.postedAt)));
      setAttachments(files || []); setComments({}); setState('ready');
    } catch (e) { setState('error'); showToast(e.message || 'Could not load announcements.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setDeepLink(new URLSearchParams(location.search).get('id')); }, [location.search]);

  const filtered = useMemo(() => items.filter(a => {
    if (active === 'active' && a.isActive === false) return false;
    if (active === 'inactive' && a.isActive !== false) return false;
    if (audience && String(a.targetAudience || '').toLowerCase() !== audience.toLowerCase()) return false;
    const q = query.trim().toLowerCase();
    return !q || `${a.title || ''} ${a.content || ''} ${a.postedByName || ''}`.toLowerCase().includes(q);
  }), [items, active, audience, query]);

  async function loadComments(id, refresh = false) {
    if (comments[id]?.loaded && !refresh) { setComments(c => ({ ...c, [id]: { ...c[id], open: !c[id].open } })); return; }
    setComments(c => ({ ...c, [id]: { ...(c[id] || {}), loading: true, open: true } }));
    try {
      const rows = await apiRequest(`AnnouncementComments/announcement/${id}`, 'GET', null, true);
      setComments(c => ({ ...c, [id]: { loaded: true, open: true, rows: rows || [] } }));
    } catch { setComments(c => ({ ...c, [id]: { loaded: true, open: true, rows: [], error: true } })); }
  }

  async function postComment(id) {
    const content = (commentDrafts[id] || '').trim();
    if (!content) return;
    try {
      await apiRequest('AnnouncementComments', 'POST', { AnnouncementID: id, PostedByUserID: userId, Content: content }, true);
      setCommentDrafts(c => ({ ...c, [id]: '' }));
      const rows = await apiRequest(`AnnouncementComments/announcement/${id}`, 'GET', null, true);
      setComments(c => ({ ...c, [id]: { loaded: true, open: true, rows: rows || [] } }));
    } catch (e) { showToast(e.message || 'Could not add your comment.'); }
  }

  function edit(item) {
    setForm({ id: item ? idOf(item) : null, title: item?.title || '', content: item?.content || '', targetAudience: item?.targetAudience || 'Both', isActive: item?.isActive !== false });
    setPendingFiles([]);
  }
  async function save(event) {
    event.preventDefault();
    if (!form?.title.trim()) { showToast('Enter an announcement title.'); return; }
    setSaving(true);
    try {
      const existing = items.find(a => String(idOf(a)) === String(form.id));
      const payload = {
        ...(form.id ? { announcementID: form.id } : {}),
        postedByUserID: existing?.postedByUserID || userId,
        title: form.title.trim(), content: form.content,
        targetAudience: form.targetAudience, postedAt: existing?.postedAt || new Date().toISOString(),
        isActive: form.isActive, isPinned: existing?.isPinned || false,
      };
      const response = form.id
        ? await apiRequest(`Announcements/${form.id}`, 'PUT', payload, true)
        : await apiRequest('Announcements', 'POST', payload, true);
      const newId = form.id || response?.announcementID || response?.AnnouncementID;
      for (const file of pendingFiles) {
        if (!newId) break;
        const fd = new FormData(); fd.append('announcementId', newId); fd.append('file', file);
        await apiRequest('AnnouncementAttachments/upload', 'POST', fd, true);
      }
      setForm(null); showToast(form.id ? 'Announcement updated.' : 'Announcement posted.', 'success'); await load();
    } catch (e) { showToast(e.message || 'Could not save announcement.'); }
    finally { setSaving(false); }
  }
  async function pin(item) {
    try { await apiRequest(`Announcements/${idOf(item)}/pin`, 'PATCH', null, true); await load(); }
    catch (e) { showToast(e.message || 'Could not update pin.'); }
  }
  async function remove(item) {
    if (!await showConfirm(`Delete “${item.title}”? This cannot be undone.`, { confirmText: 'Delete' })) return;
    try { await apiRequest(`Announcements/${idOf(item)}`, 'DELETE', null, true); showToast('Announcement deleted.', 'success'); if (String(deepLink) === String(idOf(item))) navigate('/admin/announcements'); await load(); }
    catch (e) { showToast(e.message || 'Could not delete announcement.'); }
  }
  async function removeComment(comment) {
    if (!await showConfirm('Delete this comment?', { confirmText: 'Delete' })) return;
    try { await apiRequest(`AnnouncementComments/${commentIdOf(comment)}`, 'DELETE', null, true); await loadComments(commentAnnouncementIdOf(comment), true); }
    catch (e) { showToast(e.message || 'Could not delete comment.'); }
  }
  async function saveComment(comment) {
    const commentId = commentIdOf(comment);
    const announcementId = commentAnnouncementIdOf(comment);
    const content = (commentEdits[commentId] ?? comment.content ?? comment.Content ?? '').trim();
    if (!content) { showToast('A comment cannot be empty.'); return; }
    setSavingCommentId(commentId);
    try {
      await apiRequest(`AnnouncementComments/${commentId}`, 'PUT', { Content: content }, true);
      setCommentEdits(edits => { const next = { ...edits }; delete next[commentId]; return next; });
      await loadComments(announcementId, true);
    } catch (e) { showToast(e.message || 'Could not update comment.'); }
    finally { setSavingCommentId(null); }
  }
  const openDeep = items.find(a => String(idOf(a)) === String(deepLink));

  return <Page id="ADMIN_/announcements"><main className="main-wrapper"><div className="page-content">
    <header className="page-header"><div className="page-header-top"><div><h1>Announcements</h1><p>Publish program updates and communicate with mentors and mentees.</p></div><button className="btn-primary" onClick={() => edit(null)}><i className="ti ti-plus" /> Post Announcement</button></div></header>
    {openDeep && <div className="announcement-deep-link"><b>Linked announcement:</b> {openDeep.title}<button onClick={() => { navigate('/admin/announcements'); setDeepLink(null); }}>Show all</button></div>}
    <div className="ann-toolbar toolbar"><label className="search-box"><i className="ti ti-search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search announcements…" /></label>
      <Select className="filter-select" value={active} onChange={e => setActive(e.target.value)}><option value="all">All Announcements</option><option value="active">Published</option><option value="inactive">Inactive</option></Select>
      <Select className="filter-select" value={audience} onChange={e => setAudience(e.target.value)}><option value="">All Audiences</option><option value="Both">Everyone</option><option value="Mentor">Mentors</option><option value="Mentee">Mentees</option></Select>
      <button className="filter-reset" onClick={load}>Refresh</button>
    </div>
    <div className="announcement-list">
      {state === 'loading' ? <Empty className="empty-state">Loading announcements…</Empty> : state === 'error' ? <Empty className="empty-state">Announcements could not be loaded.</Empty> : filtered.map(item => {
        const id = idOf(item);
        const files = attachments.filter(a => String(a.announcementID) === String(id));
        const isMine = String(item.postedByUserID) === String(userId);
        return <article className={`announcement-card ${item.isPinned ? 'pinned' : ''} ${item.isActive === false ? 'inactive' : ''}`} key={id} id={`announcement-${id}`}>
          <div className="announce-card-header"><div><h2>{item.title}</h2><div className="announce-meta"><span>{item.postedByName || item.authorName || 'Administration'}</span><time>{dateOf(item.postedAt)}</time><span className="audience-badge">{item.targetAudience || 'Both'}</span>{item.isPinned && <span className="pin-badge"><i className="ti ti-pin" /> Pinned</span>}{item.isActive === false && <span className="inactive-badge">Inactive</span>}</div></div>
            <div className="announce-actions"><button className="btn-outline" onClick={() => pin(item)} title="Pin / unpin"><i className="ti ti-pin" /></button>{isMine && <><button className="btn-outline" onClick={() => edit(item)}>Edit</button><button className="btn-outline danger" onClick={() => remove(item)}>Delete</button></>}</div>
          </div>
          <div className="announce-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.content || '') }} />
          <AttachmentList items={files} downloadPath="AnnouncementAttachments" icon={attachIconBasic} size={formatFileSizeBasic} />
          <div className="announce-footer"><button className="comment-toggle" onClick={() => loadComments(id)}><i className="ti ti-message-circle" /> Comments</button></div>
          {comments[id]?.open && <div className="comment-section">
            {comments[id].loading ? <Empty className="empty-state">Loading comments…</Empty> : (comments[id].rows || []).map(comment => {
              const commentId = commentIdOf(comment);
              const commentOwner = comment.postedByUserID ?? comment.PostedByUserID;
              const originalContent = comment.content ?? comment.Content ?? '';
              const isEditing = Object.hasOwn(commentEdits, commentId);
              return <div className="comment-row" key={commentId}><div><b>{comment.postedByName || comment.PostedByName || comment.userName || comment.authorName || 'User'}</b><time>{dateOf(comment.postedAt || comment.PostedAt)}</time>
                {isEditing ? <textarea aria-label="Edit comment" value={commentEdits[commentId]} onChange={event => setCommentEdits(edits => ({ ...edits, [commentId]: event.target.value }))} /> : <p>{originalContent}</p>}
              </div>{commentOwner != null && userId != null && String(commentOwner) === String(userId) && <div className="row-actions">
                {isEditing ? <><button className="btn-outline" onClick={() => setCommentEdits(edits => { const next = { ...edits }; delete next[commentId]; return next; })}>Cancel</button><button className="btn-outline" disabled={savingCommentId === commentId} onClick={() => saveComment(comment)}>{savingCommentId === commentId ? 'Saving…' : 'Save'}</button></> : <button className="btn-outline" onClick={() => setCommentEdits(edits => ({ ...edits, [commentId]: originalContent }))}>Edit</button>}
                <button className="btn-outline" onClick={() => removeComment(comment)}>Delete</button>
              </div>}</div>;
            })}
            {!comments[id].rows?.length && !comments[id].loading && <Empty className="empty-state">No comments yet.</Empty>}
            <div className="comment-compose"><input value={commentDrafts[id] || ''} onChange={e => setCommentDrafts(c => ({ ...c, [id]: e.target.value }))} placeholder="Write a comment…" /><button className="btn-primary" onClick={() => postComment(id)}>Post</button></div>
          </div>}
        </article>;
      })}
      {state === 'ready' && !filtered.length && <Empty className="empty-state">No announcements match your filters.</Empty>}
    </div>
  </div></main>
  {form && <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setForm(null)}><section className="modal-card announcement-modal">
    <header className="modal-header"><h2>{form.id ? 'Edit Announcement' : 'Post Announcement'}</h2><button onClick={() => setForm(null)} aria-label="Close">×</button></header>
    <form onSubmit={save}><label>Title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required maxLength="200" /></label>
      <label>Post to<Select value={form.targetAudience} onChange={e => setForm({ ...form, targetAudience: e.target.value })}><option value="Both">Mentors and Mentees</option><option value="Mentor">Mentors</option><option value="Mentee">Mentees</option></Select></label>
      <label>Message<textarea rows="9" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Write your announcement…" /></label>
      <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Publish now</label>
      <label>Attachments<input type="file" multiple onChange={e => setPendingFiles(Array.from(e.target.files || []).slice(0, 5))} /></label>
      {pendingFiles.length > 0 && <ul className="pending-files">{pendingFiles.map((f, i) => <li key={`${f.name}-${i}`}>{f.name}</li>)}</ul>}
      <div className="modal-actions"><button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save Changes' : 'Post Announcement'}</button></div>
    </form>
  </section></div>}
  </Page>;
}
