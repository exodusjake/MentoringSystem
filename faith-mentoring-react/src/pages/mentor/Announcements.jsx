import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Page, { usePage } from '../../app/Page.jsx';
import { AttachmentList, attachIconBasic, fileUrl, formatFileSizeBasic } from '../../components/announcements/attachments.jsx';
import Comments from '../../components/announcements/Comments.jsx';
import Lightbox from '../../components/announcements/Lightbox.jsx';
import { ContentBody, useActiveFormats, useSeeMore } from '../../components/announcements/SeeMore.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Empty from '../../components/Empty.jsx';
import { showToast } from '../../components/Notify.jsx';
import Select from '../../components/Select.jsx';
import { updateAnnBadge } from '../../lib/announcementBadge.js';
import { apiRequest } from '../../lib/api.js';
import { sanitizeHtml } from '../../lib/security-utils.js';
import { getSession } from '../../lib/session.js';
import { useStayOnBack } from './useStayOnBack.js';

// Mentor Announcements (MENTOR/HTML/announcements.html + announcements.js): the Administration
// tab (admin/head posts for mentors) and My Announcements (the mentor's own posts to mentees,
// optionally tagged "[SECTION]" for one section), with comments, attachments, pin/edit/delete.
const MAX_ATTACHMENTS = 5;
const byPinnedThenDate = (a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.postedAt) - new Date(a.postedAt);
const stripSection = title => (title || '').replace(/^\[[^\]]+\]\s*/, '');

const FMT_BUTTONS = [
  ['bold', 'Bold', <b>B</b>],
  ['italic', 'Italic', <i>I</i>],
  ['underline', 'Underline', <u>U</u>],
  ['strikeThrough', 'Strikethrough', <s>S</s>],
];

export default function MentorAnnouncements() {
  return (
    <Page id="MENTOR/announcements">
      <AnnouncementsBody />
    </Page>
  );
}

function AnnouncementsBody() {
  useStayOnBack();
  const navigate = useNavigate();
  const location = useLocation();
  const { ready } = usePage();
  const [user] = useState(() => getSession().user);
  const me = user?.userID;
  const [data, setData] = useState({ state: 'loading' });       // loading | ok | error
  const [sections, setSections] = useState([]);                 // this mentor's sections
  const [tab, setTab] = useState('notifications');
  const [query, setQuery] = useState('');
  const [dots, setDots] = useState({ notifications: false, mine: false });
  const [comments, setComments] = useState({});                 // annId -> { state, list, showAll }
  const [openKebab, setOpenKebab] = useState(null);             // announcement kebab
  const [openCommentKebab, setOpenCommentKebab] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  // Every list re-render in the original rebuilt the cards (collapsing comment lists, bars and
  // "See more"); `gen` remounts them the same way.
  const [gen, setGen] = useState(0);
  const activeFormats = useActiveFormats();
  const listRef = useRef(null);
  const deepLink = useRef(new URLSearchParams(location.search).get('id'));

  // Post / edit modal
  const [post, setPost] = useState({ open: false, editId: null, title: '', section: 'Mentee', button: 'post', error: '', pending: [] });
  const [postConfirm, setPostConfirm] = useState(false);
  // The "Post to" section picker is filled (and shown, for a mentor with several sections) when
  // the modal opens, and stays that way after it closes.
  const [picker, setPicker] = useState({ shown: false, options: [] });
  const fillPicker = () => setPicker(sections.length > 1 ? { shown: true, options: sections.filter(s => s !== '—') } : { shown: false, options: [] });
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const [deleteAnn, setDeleteAnn] = useState(null);             // { id, title, open, busy }
  const [deleteAttachId, setDeleteAttachId] = useState(null);
  const [deleteAttachOpen, setDeleteAttachOpen] = useState(false);
  const [deleteComment, setDeleteComment] = useState(null);     // { commentId, annId, open }

  // ── Unread dots ──
  const lastReadKey = t => `ann_lastRead_${t}_${me}`;
  const markTabRead = t => localStorage.setItem(lastReadKey(t), new Date().toISOString());
  const computeDots = (d, active) => {
    const notifLast = localStorage.getItem(lastReadKey('notifications'));
    const notifItems = d.announcements.filter(a => a.postedByUserID !== me);
    const notifHasNew = !notifLast ? notifItems.length > 0 : notifItems.some(a => new Date(a.postedAt) > new Date(notifLast));
    // My Announcements: new comments from mentees since the last visit.
    const mineLast = localStorage.getItem(lastReadKey('mine'));
    const mineHasNew = d.latestCommentAt ? (!mineLast || d.latestCommentAt > new Date(mineLast)) : false;
    setDots({ notifications: notifHasNew && active !== 'notifications', mine: mineHasNew && active !== 'mine' });
    updateAnnBadge(0);
  };

  // ── Load ──
  const loadComments = useCallback(async (annId, showAll) => {
    try {
      const list = await apiRequest(`AnnouncementComments/announcement/${annId}`, 'GET', null, true);
      setComments(c => ({ ...c, [annId]: { state: 'ok', list: list || [], showAll: showAll ?? c[annId]?.showAll ?? false } }));
    } catch {
      setComments(c => ({ ...c, [annId]: { state: 'error', list: [], showAll: c[annId]?.showAll } }));
    }
  }, []);

  const tabRef = useRef(tab);
  tabRef.current = tab;
  const load = useCallback(async () => {
    try {
      const [items, latestComment, attachData] = await Promise.all([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest(`AnnouncementComments/announcer/${me}/latest`, 'GET', null, true),
        apiRequest('AnnouncementAttachments', 'GET', null, true).catch(() => []),
      ]);
      const announcements = (items || []).filter(a => {
        if (a.postedByUserID === me) return true;   // own posts always visible
        if (!a.isActive) return false;
        const ta = (a.targetAudience || '').toLowerCase();
        return ta === 'both' || ta === 'mentor';
      }).sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
      const d = {
        state: 'ok', announcements, attachments: attachData || [],
        latestCommentAt: latestComment?.latestCommentAt ? new Date(latestComment.latestCommentAt) : null,
      };
      markTabRead(tabRef.current);
      computeDots(d, tabRef.current);
      setComments({});
      setData(d);
      setGen(g => g + 1);
    } catch {
      setData(d => d.state === 'ok' ? d : { state: 'error' });
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      try {
        const [assignments, menteesWithDept] = await Promise.all([
          apiRequest('Users/assignments', 'GET', null, true),
          apiRequest('Users/mentees-with-dept', 'GET', null, true),
        ]);
        const deptMap = {};
        (menteesWithDept || []).forEach(m => { deptMap[m.userID] = m; });
        const seen = new Set(), list = [];
        (assignments || []).filter(a => a.mentorUserID === me).forEach(a => {
          const detail = deptMap[a.menteeUserID] || {};
          const sec = detail.sectionCode || detail.section || '—';
          if (!seen.has(sec)) { seen.add(sec); list.push(sec); }
        });
        setSections(list.sort());
      } catch { /* non-critical */ }
    })();
  }, []);

  const visible = data.state === 'ok'
    ? (() => {
      const q = query.trim().toLowerCase();
      let list = data.announcements.filter(a => tab === 'notifications' ? a.postedByUserID !== me : a.postedByUserID === me);
      if (q) list = list.filter(a => (a.title || '').toLowerCase().includes(q) || (a.content || '').toLowerCase().includes(q));
      return [...list].sort(byPinnedThenDate);
    })()
    : [];

  // Comments load for every rendered card, each time the list is rebuilt.
  useEffect(() => {
    if (data.state !== 'ok') return;
    setComments({});
    visible.forEach(a => loadComments(a.announcementID));
  }, [gen]);

  // ?id=<announcementID> (from the dashboard): scroll to and briefly highlight that card, once.
  // Runs right after the cards are inserted, before "See more" is measured, like the original.
  useLayoutEffect(() => {
    if (data.state !== 'ok' || !deepLink.current) return;
    const id = deepLink.current;
    deepLink.current = null;
    const card = document.getElementById(`announce-card-${id}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('deep-link-highlight');
    setTimeout(() => card.classList.remove('deep-link-highlight'), 2200);
    const params = new URLSearchParams(location.search);
    params.delete('id');
    navigate({ pathname: location.pathname, search: params.toString() ? '?' + params : '' }, { replace: true });
  }, [data.state]);

  const [seeMore, toggleSeeMore] = useSeeMore(listRef, ready, [data, visible.length], gen);

  // Any click closes open kebab menus; Escape closes the lightbox.
  useEffect(() => {
    const onClick = () => { setOpenKebab(null); setOpenCommentKebab(null); };
    const onKey = e => { if (e.key === 'Escape') setLightbox(null); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  function switchTab(next) {
    setTab(next);
    setQuery('');
    markTabRead(next);
    if (data.state === 'ok') computeDots(data, next);
    setGen(g => g + 1);
  }

  async function togglePin(id) {
    const wasPinned = !!data.announcements.find(a => a.announcementID === id)?.isPinned;
    try {
      await apiRequest(`Announcements/${id}/pin`, 'PATCH', null, true);
      showToast(wasPinned ? 'Announcement unpinned.' : 'Announcement pinned to top.', 'success');
      await load();
    } catch (e) {
      console.error('Toggle pin failed:', e);
      showToast(e.message || 'Could not update pin. Please try again.');
    }
  }

  // ── Post / edit ──
  const existingAttachments = post.editId && data.state === 'ok' ? data.attachments.filter(att => att.announcementID === post.editId) : [];

  function openPostModal() {
    if (editorRef.current) editorRef.current.innerHTML = '';
    fillPicker();
    setPost(p => ({ ...p, open: true, editId: null, title: '', section: 'Mentee', button: 'post', pending: [] }));
  }
  function openEditModal(id) {
    const a = data.announcements.find(x => x.announcementID === id);
    if (!a) return;
    // A "[SECTION] " title prefix is the section the post is for.
    const secMatch = (a.title || '').match(/^\[([^\]]+)\]/);
    if (editorRef.current) editorRef.current.innerHTML = sanitizeHtml(a.content || '');
    fillPicker();
    setPost(p => ({ ...p, open: true, editId: id, title: stripSection(a.title), section: secMatch ? secMatch[1] : 'Mentee', button: 'save', pending: [] }));
  }
  const closePostModal = () => setPost(p => ({ ...p, open: false }));

  function submitPost(e) {
    e.preventDefault();
    const rawTitle = post.title.trim();
    const content = editorRef.current.innerHTML.trim();
    if (!rawTitle) { setPost(p => ({ ...p, error: 'Please enter a title.' })); return; }
    if (!content || content === '<br>') { setPost(p => ({ ...p, error: 'Please enter the announcement content.' })); return; }
    setPost(p => ({ ...p, error: '' }));
    setPostConfirm(true);
  }

  async function doSubmit() {
    setPostConfirm(false);
    const { editId, pending } = post;
    const rawTitle = post.title.trim();
    const content = editorRef.current.innerHTML.trim();
    const section = sections.length > 1 ? post.section : 'Mentee';
    const finalTitle = section && section !== 'Mentee' ? `[${section}] ${rawTitle}` : rawTitle;
    setPost(p => ({ ...p, button: editId ? 'saving' : 'posting' }));
    try {
      let announcementID = editId;
      if (editId) {
        const existing = data.announcements.find(a => a.announcementID === editId);
        await apiRequest(`Announcements/${editId}`, 'PUT', {
          AnnouncementID: editId, PostedByUserID: me, Title: finalTitle, Content: content,
          TargetAudience: 'Mentee', PostedAt: existing?.postedAt || new Date().toISOString(), IsActive: true,
        }, true);
      } else {
        const res = await apiRequest('Announcements', 'POST', {
          PostedByUserID: me, Title: finalTitle, Content: content,
          TargetAudience: 'Mentee', PostedAt: new Date().toISOString(), IsActive: true,
        }, true);
        announcementID = res?.announcementID;
      }
      if (pending.length > 0 && announcementID) {
        for (const file of pending) {
          const fd = new FormData();
          fd.append('announcementId', announcementID);
          fd.append('file', file);
          await apiRequest('AnnouncementAttachments/upload', 'POST', fd, true);
        }
      }
      // The button keeps its "Posting..." state until the modal is opened again (as before).
      setPost(p => ({ ...p, open: false, pending: [] }));
      showToast(editId ? 'Announcement updated successfully.' : 'Announcement posted successfully.', 'success');
      await load();
    } catch (err) {
      console.error('Post announcement failed:', err);
      const msg = err.message || 'Something went wrong. Please try again.';
      showToast(msg);
      setPost(p => ({ ...p, error: msg, button: editId ? 'save' : 'post' }));
    }
  }

  function triggerAttachFile() {
    fileRef.current.value = '';
    fileRef.current.click();
  }
  function handleAttachFiles(e) {
    const room = MAX_ATTACHMENTS - existingAttachments.length - post.pending.length;
    const files = Array.from(e.target.files || []);
    if (room <= 0) { showToast(`Maximum ${MAX_ATTACHMENTS} attachments per post.`); return; }
    if (files.length > room) showToast(`Only ${room} more file${room === 1 ? '' : 's'} added — maximum ${MAX_ATTACHMENTS} attachments per post.`);
    setPost(p => ({ ...p, pending: [...p.pending, ...files.slice(0, room)] }));
    const added = Math.min(files.length, room);
    if (added) showToast(`${added} file${added === 1 ? '' : 's'} attached.`, 'info', 2500);
  }
  function removeAttach(index) {
    setPost(p => ({ ...p, pending: p.pending.filter((_, i) => i !== index) }));
    showToast('Attachment removed.', 'info', 2000);
  }
  async function confirmDeleteAttach() {
    if (!deleteAttachId) return;
    setDeleteAttachOpen(false);
    const id = deleteAttachId;
    try {
      await apiRequest(`AnnouncementAttachments/${id}`, 'DELETE', null, true);
      setData(d => ({ ...d, attachments: d.attachments.filter(a => a.attachmentID !== id) }));
      showToast('Attachment removed.', 'success');
    } catch (e) {
      console.error('Delete attachment failed', e);
      showToast(e.message || 'Failed to remove attachment.');
    }
    setDeleteAttachId(null);
  }

  // ── Delete announcement ──
  async function confirmDeleteAnnounce() {
    if (!deleteAnn?.id) return;
    setDeleteAnn(d => ({ ...d, busy: true }));
    try {
      await apiRequest(`Announcements/${deleteAnn.id}`, 'DELETE', null, true);
      setDeleteAnn(d => ({ ...d, open: false }));
      showToast('Announcement deleted.', 'success');
      await load();
    } catch (err) {
      console.error('Delete announcement failed:', err);
      showToast(err.message || 'Failed to delete announcement.');
      setDeleteAnn(d => ({ ...d, busy: false }));
    }
  }

  // ── Comments ──
  async function postComment(annId, content) {
    try {
      await apiRequest('AnnouncementComments', 'POST', { AnnouncementID: annId, PostedByUserID: me, Content: content }, true);
      showToast('Comment posted.', 'success');
      await loadComments(annId, true);
      return true;
    } catch (e) {
      console.error('Post comment failed:', e);
      showToast(e.message || 'Failed to post comment.');
      return false;
    }
  }
  async function saveEditComment(commentId, annId, content) {
    try {
      await apiRequest(`AnnouncementComments/${commentId}`, 'PUT', { Content: content }, true);
      showToast('Comment updated.', 'success');
      await loadComments(annId);
      return true;
    } catch (e) {
      console.error('Edit comment failed:', e);
      showToast(e.message || 'Failed to update comment.');
    }
  }
  async function confirmDeleteComment() {
    const target = deleteComment;
    if (!target?.commentId) return;
    setDeleteComment(d => ({ ...d, open: false }));
    try {
      await apiRequest(`AnnouncementComments/${target.commentId}`, 'DELETE', null, true);
      showToast('Comment deleted.', 'success');
      await loadComments(target.annId);
    } catch (e) {
      console.error('Delete comment failed:', e);
      showToast(e.message || 'Failed to delete comment.');
    }
    setDeleteComment(d => ({ ...d, commentId: null, annId: null }));
  }

  // ── Render ──
  const initials = (((user?.firstName || '')[0] || '') + ((user?.lastName || '')[0] || '')).toUpperCase() || 'ME';
  let subtitle = 'Loading...';
  if (data.state === 'ok') {
    const adminCount = data.announcements.filter(a => a.postedByUserID !== me).length;
    const mineCount = data.announcements.filter(a => a.postedByUserID === me).length;
    subtitle = `${adminCount} from administration · ${mineCount} of your post${mineCount !== 1 ? 's' : ''}`;
  }
  // The Post button only belongs to My Announcements (it shows until the first load finishes).
  const postBtnShown = data.state === 'ok' || gen > 0 ? tab === 'mine' : true;
  const isEdit = !!post.editId;
  const submitLabel = { post: <><i className="ti ti-send"></i> Post</>, save: <><i className="ti ti-check"></i> Save Changes</>, posting: 'Posting...', saving: 'Saving...' }[post.button];

  return (
    <>
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Announcements</h1>
              {' '}
              <p id="announceSubtitle">{subtitle}</p>
            </div>
            {' '}
            <button className="btn-post-announce" style={postBtnShown ? undefined : { display: 'none' }} onClick={openPostModal}>
              <i className="ti ti-plus"></i>
              {' '}Post Announcement
            </button>
          </div>
          {' '}
          {/* Tabs */}
          <div className="ann-tabs">
            <button className={'ann-tab' + (tab === 'notifications' ? ' active' : '')} id="tab-notifications" onClick={() => switchTab('notifications')}>
              <i className="ti ti-building"></i>
              {' '}Administration{' '}
              <span className="ann-unread-dot" id="dot-notifications" style={dots.notifications ? undefined : { display: 'none' }}></span>
            </button>
            {' '}
            <button className={'ann-tab' + (tab === 'mine' ? ' active' : '')} id="tab-mine" onClick={() => switchTab('mine')}>
              <i className="ti ti-speakerphone"></i>
              {' '}My Announcements{' '}
              <span className="ann-unread-dot" id="dot-mine" style={dots.mine ? undefined : { display: 'none' }}></span>
            </button>
          </div>
          {' '}
          {/* Toolbar */}
          <div className="toolbar">
            <div className="search-wrap">
              <i className="ti ti-search"></i>
              {' '}
              <input type="text" id="searchInput" placeholder="Search announcements..." value={query}
                onChange={e => { setQuery(e.target.value); if (data.state === 'ok') setGen(g => g + 1); }} />
            </div>
          </div>
          {' '}
          {/* List */}
          <div id="announcementsList" className="announcements-list" ref={listRef}>
            {data.state === 'loading' && <div className="list-skeleton"><span className="spinner"></span>{' '}Loading announcements...</div>}
            {data.state === 'error' && <div className="list-skeleton">Failed to load announcements. Please refresh.</div>}
            {data.state === 'ok' && (visible.length === 0
              ? (
                <Empty key={`empty-${gen}`} className="empty-state">
                  <i className="ti ti-speakerphone-off"></i>
                  {' '}
                  <p>{tab === 'mine' ? <>No announcements yet. Click <strong>Post Announcement</strong> to add one.</> : 'No announcements from administration yet.'}</p>
                </Empty>
              )
              : visible.map(a => (
                <AnnouncementCard key={`${gen}-${a.announcementID}`} a={a} me={me} user={user} initials={initials}
                  kebabOpen={openKebab === a.announcementID}
                  onKebab={e => { e.stopPropagation(); setOpenCommentKebab(null); setOpenKebab(k => k === a.announcementID ? null : a.announcementID); }}
                  onPin={() => togglePin(a.announcementID)}
                  onEdit={() => openEditModal(a.announcementID)}
                  onDelete={() => setDeleteAnn({ id: a.announcementID, title: stripSection(a.title || 'Announcement'), open: true, busy: false })}
                  attachments={data.attachments.filter(x => x.announcementID === a.announcementID)}
                  onViewAttachment={att => setLightbox({ attachment: att, failed: false })}
                  seeMore={seeMore[`ann-content-${a.announcementID}`]} onToggleSeeMore={() => toggleSeeMore(`ann-content-${a.announcementID}`)}
                  comments={<Comments annId={a.announcementID} data={comments[a.announcementID]} me={me} initials={initials}
                    openKebab={openCommentKebab} setOpenKebab={k => { setOpenKebab(null); setOpenCommentKebab(k); }} activeFormats={activeFormats}
                    onPost={content => postComment(a.announcementID, content)}
                    onSaveEdit={(commentId, html) => saveEditComment(commentId, a.announcementID, html)}
                    onDelete={commentId => setDeleteComment({ commentId, annId: a.announcementID, open: true })}
                    onShowAll={() => loadComments(a.announcementID, true)} />} />
              )))}
          </div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Post / Edit Announcement Modal */}
      <div id="postModal" className={'modal-overlay' + (post.open ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) closePostModal(); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={closePostModal}>
            <i className="ti ti-x"></i>
          </button>
          {' '}
          <h2 className="modal-title" id="postModalTitle">{isEdit ? 'Edit Announcement' : 'Post Announcement'}</h2>
          {' '}
          <form id="postForm" onSubmit={submitPost}>
            <div className="form-group" id="postSectionGroup" style={picker.shown ? undefined : { display: 'none' }}>
              <label className="form-label">Post to</label>
              {' '}
              <Select id="postSectionPick" className="form-input" value={post.section} onChange={e => { const v = e.target.value; setPost(p => ({ ...p, section: v })); }}>
                <option value="Mentee">All My Mentees</option>
                {picker.options.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            {' '}
            <input type="text" id="postTitleInput" className="gc-title-input" placeholder="Title" required value={post.title}
              onChange={e => { const v = e.target.value; setPost(p => ({ ...p, title: v })); }} />
            {' '}
            <div className="gc-editor-wrap">
              <div id="postContentInput" className="gc-editor" contentEditable="true" suppressContentEditableWarning ref={editorRef}
                data-placeholder="Share something with your class..."></div>
              {' '}
              <div className="gc-toolbar">
                {FMT_BUTTONS.map(([cmd, label, inner]) => <FmtButton key={cmd} cmd={cmd} label={label} active={activeFormats}>{inner}</FmtButton>)}
                {' '}
                <span className="gc-fmt-sep"></span>
                {' '}
                <FmtButton cmd="insertUnorderedList" label="Bullet list" active={activeFormats}><i className="ti ti-list"></i></FmtButton>
                {' '}
                <span className="gc-fmt-sep"></span>
                {' '}
                <button type="button" className="gc-fmt-btn" title="Attach file" onClick={triggerAttachFile}><i className="ti ti-paperclip"></i></button>
                {' '}
                <input type="file" id="attachFileInput" ref={fileRef} multiple accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" style={{ display: 'none' }} onChange={handleAttachFiles} />
              </div>
            </div>
            {' '}
            <div id="attachList" className="attach-list">
              {existingAttachments.map(att => (
                <div key={'e' + att.attachmentID} className="attach-item">
                  <i className={`ti ${attachIconBasic(att.fileName)} attach-icon`}></i>
                  {' '}
                  <a className="attach-name" href={fileUrl(att.filePath)} target="_blank" rel="noopener">{att.fileName}</a>
                  {' '}
                  <span className="attach-size">{formatFileSizeBasic(att.fileSize)}</span>
                  {' '}
                  <button className="attach-remove" title="Remove" type="button" onClick={() => { setDeleteAttachId(att.attachmentID); setDeleteAttachOpen(true); }}>×</button>
                </div>
              ))}
              {post.pending.map((f, i) => (
                <div key={'p' + i} className="attach-item">
                  <i className={`ti ${attachIconBasic(f.name)} attach-icon`}></i>
                  {' '}
                  <span className="attach-name">{f.name}</span>
                  {' '}
                  <span className="attach-size">{formatFileSizeBasic(f.size)}</span>
                  {' '}
                  <button className="attach-remove" title="Remove" type="button" onClick={() => removeAttach(i)}>×</button>
                </div>
              ))}
            </div>
            {' '}
            <div id="postFormError" className="form-error" style={post.error ? { display: 'block' } : { display: 'none' }}>{post.error}</div>
            {' '}
            <div className="form-actions">
              <button type="button" className="btn-form-cancel" onClick={closePostModal}>Cancel</button>
              {' '}
              <button type="submit" className="btn-form-submit" id="submitPostBtn" disabled={post.button === 'posting' || post.button === 'saving'}>{submitLabel}</button>
            </div>
          </form>
        </div>
      </div>

      {/* Post / Update Confirm Modal */}
      <ConfirmDialog id="postConfirmModal" open={postConfirm} onClose={() => setPostConfirm(false)} iconClass="confirm-icon-primary"
        icon={isEdit ? 'ti-check' : 'ti-send'} iconId="postConfirmIcon" titleId="postConfirmTitle" bodyId="postConfirmBody"
        title={isEdit ? 'Update Announcement' : 'Post Announcement'}
        body={isEdit ? 'Are you sure you want to update this announcement?' : 'Are you sure you want to post this announcement?'}>
        <button className="btn-form-cancel" onClick={() => setPostConfirm(false)}>Cancel</button>
        {' '}
        <button className="btn-confirm-primary" id="confirmPostBtn" onClick={doSubmit}>
          <i className={'ti ' + (isEdit ? 'ti-check' : 'ti-send')} id="postConfirmBtnIcon"></i>
          {' '}
          <span id="postConfirmBtnText">{isEdit ? 'Update' : 'Post'}</span>
        </button>
      </ConfirmDialog>

      {/* Delete Confirm Modal */}
      <ConfirmDialog id="deleteAnnounceModal" open={!!deleteAnn?.open} onClose={() => setDeleteAnn(d => ({ ...d, open: false }))} iconClass="confirm-icon-danger" icon="ti-trash"
        title="Delete Announcement?" body={<><strong id="deleteAnnounceTitle">{deleteAnn?.title || ''}</strong><br />{' '}This will permanently remove the announcement.</>}>
        <button className="btn-form-cancel" onClick={() => setDeleteAnn(d => ({ ...d, open: false }))}>Cancel</button>
        {' '}
        <button className="btn-confirm-danger" id="confirmDeleteAnnounceBtn" disabled={!!deleteAnn?.busy} onClick={confirmDeleteAnnounce}>
          {deleteAnn?.busy ? 'Deleting...' : <><i className="ti ti-trash"></i> Delete</>}
        </button>
      </ConfirmDialog>

      {/* Delete Attachment Confirm Modal */}
      <ConfirmDialog id="deleteAttachModal" open={deleteAttachOpen} onClose={() => setDeleteAttachOpen(false)} iconClass="confirm-icon-danger" icon="ti-trash"
        title="Remove Attachment?" body="Remove this attachment? This cannot be undone.">
        <button className="btn-form-cancel" onClick={() => setDeleteAttachOpen(false)}>Cancel</button>
        {' '}
        <button className="btn-confirm-danger" onClick={confirmDeleteAttach}>
          <i className="ti ti-trash"></i> Delete
        </button>
      </ConfirmDialog>

      {/* Delete Comment Confirm Modal */}
      <ConfirmDialog id="deleteCommentModal" open={!!deleteComment?.open} onClose={() => setDeleteComment(d => ({ ...d, open: false }))} iconClass="confirm-icon-danger" icon="ti-trash"
        title="Delete Comment?" body="Are you sure you want to delete this comment? This cannot be undone.">
        <button className="btn-form-cancel" onClick={() => setDeleteComment(d => ({ ...d, open: false }))}>Cancel</button>
        {' '}
        <button className="btn-confirm-danger" onClick={confirmDeleteComment}>
          <i className="ti ti-trash"></i> Delete
        </button>
      </ConfirmDialog>

      {/* Attachment lightbox */}
      <Lightbox state={lightbox} onClose={() => setLightbox(null)} onFail={() => setLightbox(l => l && { ...l, failed: true })} />
    </>
  );
}

function FmtButton({ cmd, label, active, children }) {
  return (
    <button type="button" className={'gc-fmt-btn' + (active.has(cmd) ? ' fmt-active' : '')} data-cmd={cmd} data-tooltip={label} aria-label={label}
      onMouseDown={e => { e.preventDefault(); document.execCommand(cmd, false, null); document.dispatchEvent(new Event('selectionchange')); }}>{children}</button>
  );
}

function AnnouncementCard({ a, me, user, initials, kebabOpen, onKebab, onPin, onEdit, onDelete, attachments, onViewAttachment, seeMore, onToggleSeeMore, comments }) {
  const isMine = a.postedByUserID === me;
  const rawTitle = a.title || 'Announcement';
  const secMatch = isMine ? rawTitle.match(/^\[([^\]]+)\]/) : null;
  const date = new Date(a.postedAt || Date.now()).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  const fromName = isMine
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'You'
    : `${a.posterFirstName || ''} ${a.posterLastName || ''}`.trim() || 'Administration';
  const fromInitials = isMine ? initials : ((a.posterFirstName?.[0] || '') + (a.posterLastName?.[0] || '')).toUpperCase() || 'AD';
  const pinned = !!a.isPinned;
  return (
    <div className={`announce-card ${isMine ? 'announce-card-mine' : 'announce-card-admin'}${pinned ? ' announce-card--pinned' : ''}`} id={`announce-card-${a.announcementID}`}>
      {pinned && <><div className="ann-pin-banner"><i className="ti ti-pinned"></i> Pinned</div>{' '}</>}
      <div className="ann-card-top">
        <div className={'ann-avatar ' + (isMine ? 'ann-avatar-teal' : 'ann-avatar-indigo')}>{fromInitials}</div>
        {' '}
        <div className="ann-card-info">
          <div className="ann-card-name">{fromName}{' '}{secMatch && <span className="ann-badge ann-badge-section">{secMatch[1]}</span>}</div>
          {' '}
          <div className="ann-card-date">{date}</div>
        </div>
        {isMine && <>{' '}
          <div className="ann-kebab-wrap">
            <button className="ann-kebab-btn" onClick={onKebab}>
              <i className="ti ti-dots-vertical"></i>
            </button>
            {' '}
            <div className={'ann-kebab-menu' + (kebabOpen ? ' open' : '')} id={`kebab-${a.announcementID}`}>
              <button onClick={onPin}>
                <i className={'ti ' + (pinned ? 'ti-pinned-off' : 'ti-pin')}></i>{' ' + (pinned ? 'Unpin' : 'Pin to top')}
              </button>
              {' '}
              <button onClick={onEdit}>
                <i className="ti ti-pencil"></i> Edit
              </button>
              {' '}
              {/* (The original's inline handler broke on titles with an apostrophe — Delete did nothing.) */}
              <button className="kebab-danger" onClick={onDelete}>
                <i className="ti ti-trash"></i> Delete
              </button>
            </div>
          </div></>}
      </div>
      {' '}
      <div className="announce-title">{stripSection(rawTitle)}</div>
      {' '}
      <ContentBody id={a.announcementID} html={a.content || ''} seeMore={seeMore} onToggle={onToggleSeeMore} />
      {' '}
      <AttachmentList items={attachments} onView={onViewAttachment} downloadPath="AnnouncementAttachments" icon={attachIconBasic} size={formatFileSizeBasic} />
      {' '}
      {comments}
    </div>
  );
}
