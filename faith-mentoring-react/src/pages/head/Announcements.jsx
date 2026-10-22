import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { showToast } from '../../components/Notify.jsx';
import { AttachmentList, attachIconBasic } from '../../components/announcements/attachments.jsx';
import { apiRequest } from '../../lib/api.js';
import { sanitizeHtml } from '../../lib/security-utils.js';
import { getSession } from '../../lib/session.js';

const list = value => Array.isArray(value) ? value : value?.data || value?.items || [];
const val = (item, ...keys) => keys.map(key => item?.[key]).find(value => value != null);
const annId = item => val(item, 'announcementID', 'AnnouncementID', 'id', 'ID');
const posted = item => val(item, 'postedAt', 'PostedAt', 'createdAt', 'CreatedAt');

export default function HeadAnnouncements() {
  const [params, setParams] = useSearchParams();
  const [announcements, setAnnouncements] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState('');
  const [post, setPost] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [comments, setComments] = useState({});
  const [openMenu, setOpenMenu] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [deletingComment, setDeletingComment] = useState(null);
  const [deletingAttachment, setDeletingAttachment] = useState(null);
  const contentRef = useRef(null);
  const activeId = params.get('id');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, files] = await Promise.all([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest('AnnouncementAttachments', 'GET', null, true),
      ]);
      setAnnouncements(list(items));
      setAttachments(list(files));
      setError('');
    } catch (err) { setError(err?.message || 'Unable to load announcements.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!activeId || loading) return;
    document.getElementById(`announcement-${activeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeId, loading, announcements]);

  const filtered = useMemo(() => announcements.filter(item => {
    const search = `${val(item, 'title', 'Title') || ''} ${val(item, 'content', 'Content', 'description', 'Description') || ''}`.toLowerCase();
    return search.includes(query.toLowerCase())
      && (!audience || String(val(item, 'targetAudience', 'TargetAudience') || '').toLowerCase() === audience.toLowerCase());
  }).sort((a, b) => Number(!!val(b, 'isPinned', 'IsPinned')) - Number(!!val(a, 'isPinned', 'IsPinned')) || new Date(posted(b) || 0) - new Date(posted(a) || 0)), [announcements, query, audience]);

  const togglePin = async item => {
    try { await apiRequest(`Announcements/${annId(item)}/pin`, 'PATCH', null, true); await load(); }
    catch (err) { showToast(err?.message || 'Could not update announcement.', 'error'); }
  };
  const save = async event => {
    event.preventDefault();
    const contentText = (post?.content || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!post?.title.trim() || !contentText) return;
    setSaving(true);
    try {
      const user = getSession().user;
      const payload = {
        postedByUserID: user?.userID || user?.UserID,
        title: post.title.trim(),
        content: post.content.trim(),
        targetAudience: post.targetRole || 'Both',
        postedAt: new Date().toISOString(),
        isActive: true,
      };
      let result;
      if (post.id) {
        await apiRequest(`Announcements/${post.id}`, 'PUT', payload, true);
        const existing = announcements.find(item => String(annId(item)) === String(post.id));
        payload.announcementID = post.id;
        payload.postedByUserID = val(existing, 'postedByUserID', 'PostedByUserID') || payload.postedByUserID;
        payload.postedAt = posted(existing) || payload.postedAt;
        result = { announcementID: post.id };
      } else result = await apiRequest('Announcements', 'POST', payload, true);
      const id = post.id || val(result, 'announcementID', 'AnnouncementID', 'id', 'ID');
      if (post.files?.length && id) {
        for (const file of post.files) {
          const form = new FormData();
          form.append('announcementId', id);
          form.append('file', file);
          await apiRequest('AnnouncementAttachments/upload', 'POST', form, true);
        }
      }
      setPost(null); await load(); showToast('Announcement saved.', 'success');
    } catch (err) { showToast(err?.message || 'Could not save announcement.', 'error'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    try { await apiRequest(`Announcements/${annId(deleting)}`, 'DELETE', null, true); setDeleting(null); await load(); showToast('Announcement deleted.', 'success'); }
    catch (err) { showToast(err?.message || 'Could not delete announcement.', 'error'); }
  };
  const loadComments = async id => {
    if (comments[id]?.loaded) { setComments(value => ({ ...value, [id]: { ...value[id], open: !value[id].open } })); return; }
    setComments(value => ({ ...value, [id]: { open: true, loaded: false, items: [], text: '' } }));
    try { const result = await apiRequest(`AnnouncementComments/announcement/${id}`, 'GET', null, true); setComments(value => ({ ...value, [id]: { ...value[id], loaded: true, items: list(result) } })); }
    catch (err) { setComments(value => ({ ...value, [id]: { ...value[id], loaded: true, error: err?.message || 'Unable to load comments.' } })); }
  };
  const addComment = async (id, event) => {
    event.preventDefault();
    const text = comments[id]?.text?.trim();
    if (!text) return;
    try {
      const user = getSession().user;
      await apiRequest('AnnouncementComments', 'POST', {
        AnnouncementID: id,
        PostedByUserID: user?.userID || user?.UserID,
        Content: text,
      }, true);
      setComments(value => ({ ...value, [id]: { ...value[id], text: '' } }));
      const result = await apiRequest(`AnnouncementComments/announcement/${id}`, 'GET', null, true);
      setComments(value => ({ ...value, [id]: { ...value[id], loaded: true, items: list(result) } }));
    } catch (err) { showToast(err?.message || 'Could not add comment.', 'error'); }
  };
  const saveComment = async event => {
    event.preventDefault();
    if (!editingComment?.text.trim()) return;
    try {
      await apiRequest(`AnnouncementComments/${editingComment.id}`, 'PUT', { Content: editingComment.text.trim() }, true);
      setComments(value => ({
        ...value,
        [editingComment.announcementId]: {
          ...value[editingComment.announcementId],
          items: value[editingComment.announcementId].items.map(comment =>
            String(val(comment, 'commentID', 'CommentID', 'id', 'ID')) === String(editingComment.id)
              ? { ...comment, content: editingComment.text.trim(), Content: editingComment.text.trim() } : comment),
        },
      }));
      setEditingComment(null);
    } catch (err) { showToast(err?.message || 'Could not update comment.', 'error'); }
  };
  const removeComment = async () => {
    try {
      await apiRequest(`AnnouncementComments/${deletingComment.id}`, 'DELETE', null, true);
      const result = await apiRequest(`AnnouncementComments/announcement/${deletingComment.announcementId}`, 'GET', null, true);
      setComments(value => ({ ...value, [deletingComment.announcementId]: { ...value[deletingComment.announcementId], loaded: true, open: true, items: list(result) } }));
      setDeletingComment(null);
    } catch (err) { showToast(err?.message || 'Could not delete comment.', 'error'); }
  };
  const removeAttachment = async () => {
    try {
      await apiRequest(`AnnouncementAttachments/${val(deletingAttachment, 'attachmentID', 'AttachmentID', 'id', 'ID')}`, 'DELETE', null, true);
      setDeletingAttachment(null);
      await load();
    } catch (err) { showToast(err?.message || 'Could not delete attachment.', 'error'); }
  };
  const openEdit = item => setPost({ id: annId(item), title: val(item, 'title', 'Title') || '', content: val(item, 'content', 'Content', 'description', 'Description') || '', targetRole: val(item, 'targetAudience', 'TargetAudience', 'targetRole', 'TargetRole') || 'Admin', files: [] });
  const formatContent = command => {
    contentRef.current?.focus();
    document.execCommand(command, false);
    if (contentRef.current) setPost(value => ({ ...value, content: contentRef.current.innerHTML }));
  };

  return <Page id="HEAD/announcements"><div className="main-wrapper"><main className="page-content">
    <div className="page-header"><div><h1>Announcements</h1><p>Share important updates with the mentoring community.</p></div><button className="btn-primary" onClick={() => setPost({ id: null, title: '', content: '', targetRole: 'Admin', files: [] })}>＋ New Announcement</button></div>
    <section className="forms-section"><div className="forms-section-header"><h2>All Announcements</h2><span className="forms-section-count">{filtered.length} results</span></div>
      <div className="ann-filter-bar"><div className="ann-search-box"><input aria-label="Search announcements" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search announcements…" /></div>
        <select className="ann-filter-select" aria-label="Filter by audience" value={audience} onChange={event => setAudience(event.target.value)}><option value="">All Audiences</option><option value="Admin">Admin only</option><option value="Mentor">Admin and Mentors</option><option value="Both">Everyone</option><option value="Mentee">Mentees only</option></select>
      </div>
    </section>
    {loading ? <div role="status">Loading announcements…</div> : error ? <div role="alert" className="error-message">{error}<button onClick={load}>Retry</button></div> : filtered.length ? <div className="forms-list">
      {filtered.map((item, index) => {
        const id = annId(item) ?? index;
        const itemFiles = attachments.filter(file => String(val(file, 'announcementID', 'AnnouncementID')) === String(id));
        const commentsState = comments[id] || {};
        const rich = val(item, 'content', 'Content', 'description', 'Description') || '';
        const pinned = !!val(item, 'isPinned', 'IsPinned');
        const me = getSession().user;
        const isMine = String(val(item, 'postedByUserID', 'PostedByUserID')) === String(me?.userID || me?.UserID);
        return <article className={`announce-card${pinned ? ' announce-card--pinned' : ''}`} key={id} id={`announcement-${id}`}>
          {pinned && <div className="ann-pin-banner"><i className="ti ti-pinned" /> Pinned</div>}
          <div className="ann-card-top">
            <div className="ann-avatar ann-avatar-indigo">{String(val(item, 'postedByName', 'PostedByName', 'authorName', 'AuthorName') || 'Head').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</div>
            <div className="ann-card-info"><div className="ann-card-name">{val(item, 'postedByName', 'PostedByName', 'authorName', 'AuthorName') || 'Head'}</div><div className="ann-card-date">{posted(item) ? new Date(posted(item)).toLocaleString() : ''}</div></div>
            {isMine && <div className="ann-kebab-wrap"><button className="ann-kebab-btn" onClick={() => setOpenMenu(openMenu === id ? null : id)} aria-label="Announcement actions">•••</button>
              {openMenu === id && <div className="ann-kebab-menu open"><button onClick={() => { setOpenMenu(null); togglePin(item); }}>{pinned ? 'Unpin' : 'Pin'}</button><button onClick={() => { setOpenMenu(null); openEdit(item); }}>Edit</button><button onClick={() => { setOpenMenu(null); setDeleting(item); }}>Delete</button></div>}</div>}
          </div>
          <div className="announce-title">{val(item, 'title', 'Title') || 'Announcement'}</div>
          <div className="announce-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(rich) }} />
          <AttachmentList items={itemFiles} downloadPath="AnnouncementAttachments" icon={attachIconBasic} />
          {isMine && itemFiles.map(file => <button className="btn-outline" key={`remove-${val(file, 'attachmentID', 'AttachmentID', 'id', 'ID')}`} onClick={() => setDeletingAttachment(file)}>Remove {val(file, 'fileName', 'FileName') || 'attachment'}</button>)}
          <div className="card-comments">
            <button className="class-comments-toggle" onClick={() => loadComments(id)}>{commentsState.items?.length ? `${commentsState.items.length} comment${commentsState.items.length === 1 ? '' : 's'}` : 'View comments'}</button>
            {commentsState.open && <div className="card-comments-list">{commentsState.error ? <p role="alert">{commentsState.error}</p> : commentsState.items?.map((comment, i) => {
              const commentId = val(comment, 'commentID', 'CommentID', 'id', 'ID');
              const me = getSession().user;
              const mine = String(val(comment, 'postedByUserID', 'PostedByUserID', 'userID', 'UserID')) === String(me?.userID || me?.UserID);
              return <div className="comment-row" key={commentId ?? i}><strong>{val(comment, 'userName', 'UserName', 'authorName', 'AuthorName') || 'User'}:</strong>{' '}
                {editingComment?.id === commentId
                  ? <form onSubmit={saveComment}><input autoFocus value={editingComment.text} onChange={event => setEditingComment(value => ({ ...value, text: event.target.value }))} /><button type="submit">Save</button><button type="button" onClick={() => setEditingComment(null)}>Cancel</button></form>
                  : <span>{val(comment, 'content', 'Content') || ''}</span>}
                {mine && editingComment?.id !== commentId && <span className="comment-actions"><button onClick={() => setEditingComment({ id: commentId, announcementId: id, text: val(comment, 'content', 'Content') || '' })}>Edit</button><button onClick={() => setDeletingComment({ id: commentId, announcementId: id })}>Delete</button></span>}
              </div>;
            })}</div>}
            {commentsState.open && <form className="add-comment-bar" onSubmit={event => addComment(id, event)}><input value={commentsState.text || ''} onChange={event => setComments(value => ({ ...value, [id]: { ...value[id], text: event.target.value } }))} placeholder="Add comment…" /><button className="btn-send-comment" type="submit">Send</button></form>}
          </div>
        </article>;
      })}
    </div> : <Empty>No announcements found. Create an announcement to share an update.</Empty>}
    {post && <div className="modal-overlay active" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPost(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="announcement-modal-title">
        <header className="modal-header"><h2 id="announcement-modal-title">{post.id ? 'Edit Announcement' : 'Post Announcement'}</h2><button className="modal-close" aria-label="Close" onClick={() => setPost(null)}>×</button></header>
        <form className="modal-body" onSubmit={save}>
          <label>Title<input required maxLength={200} value={post.title} onChange={event => setPost(value => ({ ...value, title: event.target.value }))} /></label>
          <label>Who can see this?<select value={post.targetRole} onChange={event => setPost(value => ({ ...value, targetRole: event.target.value }))}><option value="Admin">Admin only</option><option value="Mentor">Admin and Mentors</option><option value="Both">Admin, Mentors, and Mentees</option><option value="Mentee">Mentees only</option></select></label>
          <label>Message</label>
          <div className="gc-editor-wrap">
            <div className="gc-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="Announcement message" aria-multiline="true"
              ref={contentRef} onInput={event => setPost(value => ({ ...value, content: event.currentTarget.innerHTML }))}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }} />
            <div className="gc-toolbar" role="toolbar" aria-label="Message formatting">
              <button type="button" className="gc-fmt-btn" aria-label="Bold" onMouseDown={event => event.preventDefault()} onClick={() => formatContent('bold')}><b>B</b></button>
              <button type="button" className="gc-fmt-btn" aria-label="Italic" onMouseDown={event => event.preventDefault()} onClick={() => formatContent('italic')}><i>I</i></button>
              <button type="button" className="gc-fmt-btn" aria-label="Underline" onMouseDown={event => event.preventDefault()} onClick={() => formatContent('underline')}><u>U</u></button>
              <button type="button" className="gc-fmt-btn" aria-label="Strikethrough" onMouseDown={event => event.preventDefault()} onClick={() => formatContent('strikeThrough')}><s>S</s></button>
              <button type="button" className="gc-fmt-btn" aria-label="Bulleted list" onMouseDown={event => event.preventDefault()} onClick={() => formatContent('insertUnorderedList')}><i className="ti ti-list" /></button>
            </div>
          </div>
          <label>Attachments<input type="file" multiple onChange={event => setPost(value => ({ ...value, files: [...event.target.files] }))} /></label>
        </form>
        <footer className="modal-footer"><button className="btn-outline" type="button" onClick={() => setPost(null)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : post.id ? 'Save changes' : 'Post Announcement'}</button></footer>
      </section>
    </div>}
    <ConfirmDialog open={!!deleting} title="Delete announcement?" body="This announcement will be permanently deleted." icon="ti-alert-triangle" onClose={() => setDeleting(null)}>
      <button onClick={() => setDeleting(null)}>Cancel</button><button className="btn-danger" onClick={remove}>Delete</button>
    </ConfirmDialog>
    <ConfirmDialog open={!!deletingComment} title="Delete comment?" body="This comment will be permanently deleted." icon="ti-alert-triangle" onClose={() => setDeletingComment(null)}>
      <button onClick={() => setDeletingComment(null)}>Cancel</button><button className="btn-danger" onClick={removeComment}>Delete</button>
    </ConfirmDialog>
    <ConfirmDialog open={!!deletingAttachment} title="Remove attachment?" body="This attachment will be permanently deleted." icon="ti-alert-triangle" onClose={() => setDeletingAttachment(null)}>
      <button onClick={() => setDeletingAttachment(null)}>Cancel</button><button className="btn-danger" onClick={removeAttachment}>Remove</button>
    </ConfirmDialog>
  </main></div></Page>;
}
