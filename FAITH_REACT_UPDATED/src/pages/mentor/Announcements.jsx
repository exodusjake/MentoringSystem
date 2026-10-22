import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import AnnounceContent from '../../components/announcements/AnnounceContent.jsx';
import AttachmentCards from '../../components/announcements/AttachmentCards.jsx';
import AttachmentLightbox from '../../components/announcements/AttachmentLightbox.jsx';
import Comments from '../../components/announcements/Comments.jsx';
import { fmtMouseDown, useToolbarState } from '../../components/announcements/richText.js';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { update as updateSidebarAnnBadge } from '../../lib/announcementBadge.js';
import { attachIcon, fileUrl, formatFileSize } from '../../lib/attachments.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// MENTOR/HTML/announcements.html + MENTOR/JS/announcements.js

const MAX_ATTACHMENTS = 5;

export default function MentorAnnouncements() {
  useBackGuard();
  useToolbarState();
  const currentUser = getSession()?.user;
  const myId = currentUser?.userID;

  const [allAnnouncements, setAllAnnouncements] = useState([]);
  const [allAttachments, setAllAttachments] = useState([]);
  const [state, setState] = useState('loading');             // 'loading' | 'ready' | 'failed'
  const [mentorSections, setMentorSections] = useState([]);
  const [latestCommentAt, setLatestCommentAt] = useState(null);
  const [activeTab, setActiveTab] = useState('notifications');
  const [btnTouched, setBtnTouched] = useState(false);       // the Post button is shown until the first load / tab switch
  const [search, setSearch] = useState('');
  const [subtitle, setSubtitle] = useState('Loading...');
  const [dots, setDots] = useState({ notifications: false, mine: false });
  const [openKebab, setOpenKebab] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Sliding highlight behind the two tabs, and a direction for the list change (Administration -> My = forward).
  const tabsRef = useRef(null);
  const pillRef = useRef(null);
  const pillFirst = useRef(true);
  const prevTab = useRef(activeTab);
  const dirRef = useRef('');
  if (prevTab.current !== activeTab) { dirRef.current = activeTab === 'mine' ? 'ann-fwd' : 'ann-back'; prevTab.current = activeTab; }
  const tabDir = dirRef.current;
  function placePill(animate) {
    const bar = tabsRef.current, pill = pillRef.current;
    const btn = bar && bar.querySelector('.ann-tab.active');
    if (!btn || !pill) return;
    pill.style.transition = animate ? '' : 'none';
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
    if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
  }
  useLayoutEffect(() => { placePill(!pillFirst.current); pillFirst.current = false; }, [activeTab]);
  useEffect(() => {
    const onResize = () => placePill(false);
    window.addEventListener('resize', onResize);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && tabsRef.current) {
      ro = new ResizeObserver(() => placePill(true));   // the bold active label resizes tabs mid-slide
      tabsRef.current.querySelectorAll('.ann-tab').forEach(b => ro.observe(b));
    }
    if (document.fonts) document.fonts.ready.then(() => placePill(false));
    return () => { window.removeEventListener('resize', onResize); ro?.disconnect(); };
  }, []);

  // post / edit modal
  const [postOpen, setPostOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [postTitle, setPostTitle] = useState('');
  const [postSection, setPostSection] = useState('Mentee');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [postError, setPostError] = useState('');
  const [postBusy, setPostBusy] = useState(false);
  const [confirmPostOpen, setConfirmPostOpen] = useState(false);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  // delete modals
  const [deleteAnn, setDeleteAnn] = useState(null);            // { id, title }
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteAttachId, setDeleteAttachId] = useState(null);
  const [deleteComment, setDeleteComment] = useState(null);    // onConfirm fn

  const editIdRef = useRef(null);
  editIdRef.current = editId;
  const pendingRef = useRef([]);
  pendingRef.current = pendingFiles;
  const sectionsRef = useRef([]);
  sectionsRef.current = mentorSections;

  // ── unread dot tracking ──
  const getLastRead = tab => localStorage.getItem(`ann_lastRead_${tab}_${myId}`);
  const markTabRead = tab => localStorage.setItem(`ann_lastRead_${tab}_${myId}`, new Date().toISOString());

  function updateTabDots(list, latest, tab) {
    // Notifications tab — unread admin posts
    const notifLastReadStr = getLastRead('notifications');
    const notifItems = list.filter(a => a.postedByUserID !== myId);
    let notifHasNew;
    if (!notifLastReadStr) notifHasNew = notifItems.length > 0;
    else notifHasNew = notifItems.some(a => new Date(a.postedAt) > new Date(notifLastReadStr));

    // My Announcements tab — new comments from mentees since last visit
    const mineLastReadStr = getLastRead('mine');
    let mineHasNew = false;
    if (latest) mineHasNew = !mineLastReadStr ? true : latest > new Date(mineLastReadStr);

    setDots({ notifications: notifHasNew && tab !== 'notifications', mine: mineHasNew && tab !== 'mine' });
    updateSidebarAnnBadge(0);
  }

  // ── load ──
  async function loadMentorSections() {
    try {
      const [assignments, menteesWithDept] = await Promise.all([
        apiRequest('Users/assignments', 'GET', null, true),
        apiRequest('Users/mentees-with-dept', 'GET', null, true),
      ]);
      const deptMap = {};
      (menteesWithDept || []).forEach(m => { deptMap[m.userID] = m; });
      const mine = (assignments || []).filter(a => a.mentorUserID === myId);
      const seen = new Set();
      const secs = [];
      mine.forEach(a => {
        const detail = deptMap[a.menteeUserID] || {};
        const sec = detail.sectionCode || detail.section || '—';
        if (!seen.has(sec)) { seen.add(sec); secs.push(sec); }
      });
      secs.sort();
      setMentorSections(secs);
    } catch (e) { /* non-critical */ }
  }

  async function loadAnnouncements() {
    try {
      const [items, latestComment, attachData] = await Promise.all([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest(`AnnouncementComments/announcer/${myId}/latest`, 'GET', null, true),
        apiRequest('AnnouncementAttachments', 'GET', null, true).catch(() => []),
      ]);
      setAllAttachments(attachData || []);

      const latest = latestComment?.latestCommentAt ? new Date(latestComment.latestCommentAt) : null;
      setLatestCommentAt(latest);

      const list = (items || [])
        .filter(a => {
          if (a.postedByUserID === myId) return true; // own posts always visible
          if (!a.isActive) return false;
          const ta = (a.targetAudience || '').toLowerCase();
          return ta === 'both' || ta === 'mentor';
        })
        .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
      setAllAnnouncements(list);

      const adminCount = list.filter(a => a.postedByUserID !== myId).length;
      const mineCount = list.filter(a => a.postedByUserID === myId).length;
      setSubtitle(`${adminCount} from administration · ${mineCount} of your post${mineCount !== 1 ? 's' : ''}`);
      setBtnTouched(true);

      markTabRead(activeTabRef.current);
      updateTabDots(list, latest, activeTabRef.current);
      setState('ready');
    } catch (e) {
      setState('failed');
    }
  }

  useEffect(() => {
    Promise.all([loadAnnouncements(), loadMentorSections()]);
  }, []);

  // a click anywhere closes an open card menu
  useEffect(() => {
    if (openKebab === null) return;
    const close = () => setOpenKebab(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openKebab]);

  // ── deep link (from the Dashboard's "Latest from the administration") ──
  // ?id=<announcementID> scrolls to and briefly highlights that one card.
  useEffect(() => {
    if (state !== 'ready') return;
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    const card = document.getElementById(`announce-card-${id}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('deep-link-highlight');
    setTimeout(() => card.classList.remove('deep-link-highlight'), 2200);
    // Don't re-trigger the scroll/highlight on a later re-render.
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    window.history.replaceState(null, '', url);
  }, [state, allAnnouncements]);

  function switchTab(tab) {
    setActiveTab(tab);
    activeTabRef.current = tab;
    setBtnTouched(true);
    setSearch('');
    markTabRead(tab);
    updateTabDots(allAnnouncements, latestCommentAt, tab);
  }

  async function togglePin(id) {
    const wasPinned = !!allAnnouncements.find(a => a.announcementID === id)?.isPinned;
    try {
      await apiRequest(`Announcements/${id}/pin`, 'PATCH', null, true);
      showToast(wasPinned ? 'Announcement unpinned.' : 'Announcement pinned to top.', 'success');
      await loadAnnouncements();
    } catch (e) {
      console.error('Toggle pin failed:', e);
      showToast(e.message || 'Could not update pin. Please try again.');
    }
  }

  // ── post / edit modal ──
  const sectionPickerOn = mentorSections.length > 1;
  const existingAtts = editId ? allAttachments.filter(a => a.announcementID === editId) : [];

  function openPostModal() {
    setEditId(null);
    setPendingFiles([]);
    setPostTitle('');
    setPostSection('Mentee');
    setPostError('');
    setPostBusy(false);
    setPostOpen(true);
    setEditorInit('');
  }
  function openEditModal(announceId) {
    const a = allAnnouncements.find(x => x.announcementID === announceId);
    if (!a) return;
    // Parse [SECTION] prefix from title if present
    const secMatch = (a.title || '').match(/^\[([^\]]+)\]/);
    setEditId(announceId);
    setPendingFiles([]);
    setPostTitle((a.title || '').replace(/^\[[^\]]+\]\s*/, ''));
    setPostSection(secMatch ? secMatch[1] : 'Mentee');
    setPostError('');
    setPostBusy(false);
    setPostOpen(true);
    setEditorInit(a.content || '');
  }
  const [editorInit, setEditorInit] = useState('');
  useEffect(() => { if (postOpen && editorRef.current) editorRef.current.innerHTML = editorInit; }, [postOpen]);

  function closePostModal() { setPostOpen(false); }

  function submitPostAnnouncement(e) {
    e.preventDefault();
    const rawTitle = postTitle.trim();
    const content = editorRef.current.innerHTML.trim();
    setPostError('');

    if (!rawTitle) { setPostError('Please enter a title.'); return; }
    if (!content || content === '<br>') { setPostError('Please enter the announcement content.'); return; }
    setConfirmPostOpen(true);
  }

  async function doSubmitAnnouncement() {
    setConfirmPostOpen(false);

    const rawTitle = postTitle.trim();
    const content = editorRef.current.innerHTML.trim();
    const section = sectionsRef.current.length > 1 ? postSection : 'Mentee';
    const finalTitle = (section && section !== 'Mentee') ? `[${section}] ${rawTitle}` : rawTitle;
    const editing = editIdRef.current;

    setPostBusy(true);
    try {
      let announcementID = editing;
      if (editing) {
        const existing = allAnnouncements.find(a => a.announcementID === editing);
        await apiRequest(`Announcements/${editing}`, 'PUT', {
          AnnouncementID: editing,
          PostedByUserID: myId,
          Title:          finalTitle,
          Content:        content,
          TargetAudience: 'Mentee',
          PostedAt:       existing?.postedAt || new Date().toISOString(),
          IsActive:       true,
        }, true);
      } else {
        const res = await apiRequest('Announcements', 'POST', {
          PostedByUserID: myId,
          Title:          finalTitle,
          Content:        content,
          TargetAudience: 'Mentee',
          PostedAt:       new Date().toISOString(),
          IsActive:       true,
        }, true);
        announcementID = res?.announcementID;
      }

      if (pendingRef.current.length > 0 && announcementID) {
        for (const file of pendingRef.current) {
          const fd = new FormData();
          fd.append('announcementId', announcementID);
          fd.append('file', file);
          await apiRequest('AnnouncementAttachments/upload', 'POST', fd, true);
        }
        setPendingFiles([]);
      }

      setPostOpen(false);
      showToast(editing ? 'Announcement updated successfully.' : 'Announcement posted successfully.', 'success');
      await loadAnnouncements();
    } catch (err) {
      console.error('Post announcement failed:', err);
      showToast(err.message || 'Something went wrong. Please try again.');
      setPostError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setPostBusy(false);
    }
  }

  // ── attachments (post modal) ──
  function triggerAttachFile() {
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }
  function handleAttachFiles(e) {
    const room = MAX_ATTACHMENTS - existingAtts.length - pendingFiles.length;
    const files = Array.from(e.target.files || []);
    if (room <= 0) {
      showToast(`Maximum ${MAX_ATTACHMENTS} attachments per post.`);
      return;
    }
    if (files.length > room) {
      showToast(`Only ${room} more file${room === 1 ? '' : 's'} added — maximum ${MAX_ATTACHMENTS} attachments per post.`);
    }
    setPendingFiles(p => [...p, ...files.slice(0, room)]);
    const added = Math.min(files.length, room);
    if (added) showToast(`${added} file${added === 1 ? '' : 's'} attached.`, 'info', 2500);
  }
  function removeAttach(index) {
    setPendingFiles(p => p.filter((_, k) => k !== index));
    showToast('Attachment removed.', 'info', 2000);
  }
  async function confirmDeleteAttach() {
    if (!deleteAttachId) return;
    const attachmentID = deleteAttachId;
    setDeleteAttachId(null);
    try {
      await apiRequest(`AnnouncementAttachments/${attachmentID}`, 'DELETE', null, true);
      setAllAttachments(list => list.filter(a => a.attachmentID !== attachmentID));
      showToast('Attachment removed.', 'success');
    } catch (e) {
      console.error('Delete attachment failed', e);
      showToast(e.message || 'Failed to remove attachment.');
    }
  }

  // ── delete announcement ──
  async function confirmDeleteAnnounce() {
    if (!deleteAnn) return;
    setDeleteBusy(true);
    try {
      await apiRequest(`Announcements/${deleteAnn.id}`, 'DELETE', null, true);
      setDeleteAnn(null);
      showToast('Announcement deleted.', 'success');
      await loadAnnouncements();
    } catch (err) {
      console.error('Delete announcement failed:', err);
      showToast(err.message || 'Failed to delete announcement.');
    } finally {
      setDeleteBusy(false);
    }
  }

  // ── list ──
  const q = search.trim().toLowerCase();
  let items = allAnnouncements.filter(a => activeTab === 'notifications' ? a.postedByUserID !== myId : a.postedByUserID === myId);
  if (q) {
    items = items.filter(a =>
      (a.title   || '').toLowerCase().includes(q) ||
      (a.content || '').toLowerCase().includes(q)
    );
  }
  items = [...items].sort((a, b) =>
    (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.postedAt) - new Date(a.postedAt)
  );

  const mentorInitials = (((currentUser?.firstName || '')[0] || '') + ((currentUser?.lastName || '')[0] || '')).toUpperCase() || 'ME';

  let list;
  if (state === 'loading') list = <div className="list-skeleton"><span className="spinner"></span> Loading announcements...</div>;
  else if (state === 'failed') list = <div className="list-skeleton">Failed to load announcements. Please refresh.</div>;
  else if (!items.length) {
    list = (
      <div className="empty-state">
        <i className="ti ti-speakerphone-off"></i>
        <p>{activeTab === 'mine' ? <>No announcements yet. Click <strong>Post Announcement</strong> to add one.</> : 'No announcements from administration yet.'}</p>
      </div>
    );
  } else {
    list = items.map(a => {
      const id = a.announcementID;
      const isMine = a.postedByUserID === myId;
      const rawTitle = a.title || 'Announcement';
      const secMatch = isMine ? rawTitle.match(/^\[([^\]]+)\]/) : null;
      const sectionTag = secMatch ? secMatch[1] : null;
      const title = rawTitle.replace(/^\[[^\]]+\]\s*/, '');
      const date = new Date(a.postedAt || Date.now()).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
      const fromName = isMine
        ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 'You'
        : `${a.posterFirstName || ''} ${a.posterLastName || ''}`.trim() || 'Administration';
      const fromInitials = isMine
        ? mentorInitials
        : ((a.posterFirstName?.[0] || '') + (a.posterLastName?.[0] || '')).toUpperCase() || 'AD';
      const pinned = !!a.isPinned;

      return (
        <div className={`announce-card ${isMine ? 'announce-card-mine' : 'announce-card-admin'}${pinned ? ' announce-card--pinned' : ''}`} id={`announce-card-${id}`} key={id}>
          {pinned ? <div className="ann-pin-banner"><i className="ti ti-pinned"></i> Pinned</div> : null}
          <div className="ann-card-top">
            <div className={`ann-avatar ${isMine ? 'ann-avatar-teal' : 'ann-avatar-indigo'}`}>{fromInitials}</div>
            <div className="ann-card-info">
              <div className="ann-card-name">{fromName} {sectionTag ? <span className="ann-badge ann-badge-section">{sectionTag}</span> : null}</div>
              <div className="ann-card-date">{date}</div>
            </div>
            {isMine ? (
              <div className="ann-kebab-wrap">
                <button className="ann-kebab-btn" onClick={e => { e.stopPropagation(); setOpenKebab(openKebab === id ? null : id); }}>
                  <i className="ti ti-dots-vertical"></i>
                </button>
                <div className={`ann-kebab-menu${openKebab === id ? ' open' : ''}`} id={`kebab-${id}`}>
                  <button onClick={() => togglePin(id)}>
                    <i className={`ti ${pinned ? 'ti-pinned-off' : 'ti-pin'}`}></i> {pinned ? 'Unpin' : 'Pin to top'}
                  </button>
                  <button onClick={() => openEditModal(id)}>
                    <i className="ti ti-pencil"></i> Edit
                  </button>
                  <button className="kebab-danger" onClick={() => { setDeleteBusy(false); setDeleteAnn({ id, title }); }}>
                    <i className="ti ti-trash"></i> Delete
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="announce-title">{title}</div>
          <AnnounceContent html={a.content || ''} id={`ann-content-${id}`} />
          <AttachmentCards attachments={allAttachments.filter(x => x.announcementID === id)} onView={setLightbox} />
          <Comments announcementId={id} currentUser={currentUser} myInits={mentorInitials} variant="class"
            confirm={(t, m, type, onConfirm) => setDeleteComment(() => onConfirm)} />
        </div>
      );
    });
  }

  const postBtnShown = !btnTouched || activeTab === 'mine';
  const isEdit = !!editId;
  const confirmIsEdit = isEdit;

  return (
    <Page id="MENTOR/announcements">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Announcements</h1>
              <p id="announceSubtitle">{subtitle}</p>
            </div>
            <button className="btn-post-announce" onClick={openPostModal} style={{ display: postBtnShown ? '' : 'none' }}>
              <i className="ti ti-plus"></i> Post Announcement
            </button>
          </div>

          <div className="ann-tabs has-pill" ref={tabsRef}>
            <span className="ann-tab-pill" ref={pillRef} aria-hidden="true"></span>
            <button className={`ann-tab${activeTab === 'notifications' ? ' active' : ''}`} id="tab-notifications" onClick={() => switchTab('notifications')}>
              <i className="ti ti-building"></i> Administration
              <span className="ann-unread-dot" id="dot-notifications" style={{ display: dots.notifications ? '' : 'none' }}></span>
            </button>
            <button className={`ann-tab${activeTab === 'mine' ? ' active' : ''}`} id="tab-mine" onClick={() => switchTab('mine')}>
              <i className="ti ti-speakerphone"></i> My Announcements
              <span className="ann-unread-dot" id="dot-mine" style={{ display: dots.mine ? '' : 'none' }}></span>
            </button>
          </div>

          <div className="toolbar">
            <div className="search-wrap">
              <i className="ti ti-search"></i>
              <input type="text" id="searchInput" placeholder="Search announcements..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div id="announcementsList" key={activeTab} className={`announcements-list ann-swap ${tabDir}`}>{list}</div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Post / Edit Announcement Modal */}
      <Overlay open={postOpen} className="modal-overlay" activeClass="open" id="postModal"
        onClick={e => { if (e.target === e.currentTarget) closePostModal(); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={closePostModal}>
            <i className="ti ti-x"></i>
          </button>
          <h2 className="modal-title" id="postModalTitle">{isEdit ? 'Edit Announcement' : 'Post Announcement'}</h2>
          <form id="postForm" onSubmit={submitPostAnnouncement}>
            <div className="form-group" id="postSectionGroup" style={{ display: sectionPickerOn ? '' : 'none' }}>
              <label className="form-label">Post to</label>
              <Select id="postSectionPick" className="form-input" value={postSection} onChange={e => setPostSection(e.target.value)}>
                <option value="Mentee">All My Mentees</option>
                {sectionPickerOn ? mentorSections.filter(s => s !== '—').map(s => <option key={s} value={s}>{s}</option>) : null}
              </Select>
            </div>
            <input type="text" id="postTitleInput" className="gc-title-input" placeholder="Title" required value={postTitle} onChange={e => setPostTitle(e.target.value)} />
            <div className="gc-editor-wrap">
              <div id="postContentInput" className="gc-editor" contentEditable suppressContentEditableWarning ref={editorRef}
                data-placeholder="Share something with your class..."></div>
              <div className="gc-toolbar">
                <button type="button" className="gc-fmt-btn" data-cmd="bold" data-tooltip="Bold" aria-label="Bold" onMouseDown={fmtMouseDown('bold')}><b>B</b></button>
                <button type="button" className="gc-fmt-btn" data-cmd="italic" data-tooltip="Italic" aria-label="Italic" onMouseDown={fmtMouseDown('italic')}><i>I</i></button>
                <button type="button" className="gc-fmt-btn" data-cmd="underline" data-tooltip="Underline" aria-label="Underline" onMouseDown={fmtMouseDown('underline')}><u>U</u></button>
                <button type="button" className="gc-fmt-btn" data-cmd="strikeThrough" data-tooltip="Strikethrough" aria-label="Strikethrough" onMouseDown={fmtMouseDown('strikeThrough')}><s>S</s></button>
                <span className="gc-fmt-sep"></span>
                <button type="button" className="gc-fmt-btn" data-cmd="insertUnorderedList" data-tooltip="Bullet list" aria-label="Bullet list" onMouseDown={fmtMouseDown('insertUnorderedList')}><i className="ti ti-list"></i></button>
                <span className="gc-fmt-sep"></span>
                <button type="button" className="gc-fmt-btn" title="Attach file" onClick={triggerAttachFile}><i className="ti ti-paperclip"></i></button>
                <input type="file" id="attachFileInput" multiple ref={fileInputRef}
                  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                  style={{ display: 'none' }} onChange={handleAttachFiles} />
              </div>
            </div>
            <div id="attachList" className="attach-list">
              {existingAtts.map(att => (
                <div className="attach-item" key={att.attachmentID}>
                  <i className={`ti ${attachIcon(att.fileName)} attach-icon`}></i>
                  <a className="attach-name" href={fileUrl(att.filePath)} target="_blank" rel="noopener">{att.fileName}</a>
                  <span className="attach-size">{formatFileSize(att.fileSize)}</span>
                  <button className="attach-remove" title="Remove" onClick={() => setDeleteAttachId(att.attachmentID)}>×</button>
                </div>
              ))}
              {pendingFiles.map((f, i) => (
                <div className="attach-item" key={`p${i}`}>
                  <i className={`ti ${attachIcon(f.name)} attach-icon`}></i>
                  <span className="attach-name">{f.name}</span>
                  <span className="attach-size">{formatFileSize(f.size)}</span>
                  <button className="attach-remove" title="Remove" onClick={() => removeAttach(i)}>×</button>
                </div>
              ))}
            </div>
            <div id="postFormError" className="form-error" style={{ display: postError ? 'block' : 'none' }}>{postError}</div>
            <div className="form-actions">
              <button type="button" className="btn-form-cancel" onClick={closePostModal}>Cancel</button>
              <button type="submit" className="btn-form-submit" id="submitPostBtn" disabled={postBusy}>
                {postBusy ? (isEdit ? 'Saving...' : 'Posting...') : (isEdit ? <><i className="ti ti-check"></i> Save Changes</> : <><i className="ti ti-send"></i> Post</>)}
              </button>
            </div>
          </form>
        </div>
      </Overlay>

      {/* Post / Update Confirm Modal */}
      <Overlay open={confirmPostOpen} className="modal-overlay" activeClass="open" id="postConfirmModal"
        onClick={e => { if (e.target === e.currentTarget) setConfirmPostOpen(false); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-primary">
            <i className={`ti ${confirmIsEdit ? 'ti-check' : 'ti-send'}`} id="postConfirmIcon"></i>
          </div>
          <h3 className="confirm-title" id="postConfirmTitle">{confirmIsEdit ? 'Update Announcement' : 'Post Announcement'}</h3>
          <p className="confirm-body" id="postConfirmBody">{confirmIsEdit ? 'Are you sure you want to update this announcement?' : 'Are you sure you want to post this announcement?'}</p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => setConfirmPostOpen(false)}>Cancel</button>
            <button className="btn-confirm-primary" id="confirmPostBtn" onClick={doSubmitAnnouncement}>
              <i className={`ti ${confirmIsEdit ? 'ti-check' : 'ti-send'}`} id="postConfirmBtnIcon"></i>
              <span id="postConfirmBtnText">{confirmIsEdit ? 'Update' : 'Post'}</span>
            </button>
          </div>
        </div>
      </Overlay>

      {/* Delete Confirm Modal */}
      <Overlay open={!!deleteAnn} className="modal-overlay" activeClass="open" id="deleteAnnounceModal"
        onClick={e => { if (e.target === e.currentTarget) setDeleteAnn(null); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-danger">
            <i className="ti ti-trash"></i>
          </div>
          <h3 className="confirm-title">Delete Announcement?</h3>
          <p className="confirm-body">
            <strong id="deleteAnnounceTitle">{deleteAnn?.title}</strong><br />
            This will permanently remove the announcement.
          </p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => setDeleteAnn(null)}>Cancel</button>
            <button className="btn-confirm-danger" id="confirmDeleteAnnounceBtn" onClick={confirmDeleteAnnounce} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting...' : <><i className="ti ti-trash"></i> Delete</>}
            </button>
          </div>
        </div>
      </Overlay>

      {/* Delete Attachment Confirm Modal */}
      <Overlay open={deleteAttachId !== null} className="modal-overlay" activeClass="open" id="deleteAttachModal"
        onClick={e => { if (e.target === e.currentTarget) setDeleteAttachId(null); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-danger">
            <i className="ti ti-trash"></i>
          </div>
          <h3 className="confirm-title">Remove Attachment?</h3>
          <p className="confirm-body">Remove this attachment? This cannot be undone.</p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => setDeleteAttachId(null)}>Cancel</button>
            <button className="btn-confirm-danger" onClick={confirmDeleteAttach}>
              <i className="ti ti-trash"></i> Delete
            </button>
          </div>
        </div>
      </Overlay>

      {/* Delete Comment Confirm Modal */}
      <Overlay open={!!deleteComment} className="modal-overlay" activeClass="open" id="deleteCommentModal"
        onClick={e => { if (e.target === e.currentTarget) setDeleteComment(null); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-danger">
            <i className="ti ti-trash"></i>
          </div>
          <h3 className="confirm-title">Delete Comment?</h3>
          <p className="confirm-body">Are you sure you want to delete this comment? This cannot be undone.</p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => setDeleteComment(null)}>Cancel</button>
            <button className="btn-confirm-danger" onClick={() => { const fn = deleteComment; setDeleteComment(null); fn(); }}>
              <i className="ti ti-trash"></i> Delete
            </button>
          </div>
        </div>
      </Overlay>

      <AttachmentLightbox attachment={lightbox} onClose={() => setLightbox(null)} />
    </Page>
  );
}
