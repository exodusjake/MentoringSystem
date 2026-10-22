import { useEffect, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import AnnounceContent from '../../components/announcements/AnnounceContent.jsx';
import AttachmentCards from '../../components/announcements/AttachmentCards.jsx';
import AttachmentLightbox from '../../components/announcements/AttachmentLightbox.jsx';
import Comments from '../../components/announcements/Comments.jsx';
import { fmtMouseDown, useToolbarState } from '../../components/announcements/richText.js';
import { ConfirmModal, ErrorModal } from '../../components/InfoModal.jsx';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { attachIcon, fileUrl, formatFileSize } from '../../lib/attachments.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// ADMIN_/HTML/announcements.html + ADMIN_/JS/announcements.js

const AUD_MAP = { Both: ['aud-both', 'Mentors & Mentees'], Mentor: ['aud-mentor', 'Mentors only'], Mentee: ['aud-mentee', 'Mentees only'] };
const MAX_ATTACHMENTS = 5;

const FileIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
const SearchIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;

export default function Announcements() {
  useBackGuard();
  useToolbarState();
  const currentUser = getSession()?.user;

  const [allAnnouncements, setAllAnnouncements] = useState([]);
  const [allAttachments, setAllAttachments] = useState([]);
  const [state, setState] = useState('loading');           // 'loading' | 'ready' | 'failed'
  const [search, setSearch] = useState('');
  const [audience, setAudience] = useState('');
  const [openKebab, setOpenKebab] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [confirmDlg, setConfirmDlg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // create/edit modal
  const [modal, setModal] = useState(null);                // { editingId } or null
  const [fieldTitle, setFieldTitle] = useState('');
  const [fieldAudience, setFieldAudience] = useState('Both');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  async function loadAnnouncements() {
    try {
      const [data, mentors, attachData] = await Promise.all([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest('Users/mentors-with-dept', 'GET', null, true),
        apiRequest('AnnouncementAttachments', 'GET', null, true).catch(() => []),
      ]);
      const mentorIds = new Set((mentors || []).map(m => m.userID));
      setAllAnnouncements((data || []).filter(a => !mentorIds.has(a.postedByUserID)));
      setAllAttachments(attachData || []);
      setState('ready');
    } catch (e) {
      console.error('Error loading announcements:', e);
      setErrorMsg('Failed to load announcements. Please refresh.');
    }
  }
  useEffect(() => { loadAnnouncements(); }, []);

  // a click anywhere closes an open card menu
  useEffect(() => {
    if (openKebab === null) return;
    const close = () => setOpenKebab(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openKebab]);

  // showConfirmModal(title, message, type, onConfirm)
  const showConfirmModal = (title, message, type, onConfirm) => setConfirmDlg({ title, message, type, onConfirm });

  // ── Render ──
  const q = search.trim().toLowerCase();
  let items = [...allAnnouncements].sort((a, b) => {
    const pinA = a.isPinned ? 1 : 0, pinB = b.isPinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    const dA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const dB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    if (dA !== dB) return dB - dA;
    return (b.announcementID || 0) - (a.announcementID || 0);
  });
  if (q) {
    items = items.filter(a =>
      a.title.toLowerCase().includes(q) ||
      (a.content || '').toLowerCase().includes(q)
    );
  }
  if (audience) items = items.filter(a => a.targetAudience === audience);

  const myInits = ((currentUser?.firstName?.[0] || '') + (currentUser?.lastName?.[0] || '')).toUpperCase() || 'AD';

  async function togglePin(id) {
    const wasPinned = !!allAnnouncements.find(x => x.announcementID === id)?.isPinned;
    try {
      await apiRequest(`Announcements/${id}/pin`, 'PATCH', null, true);
      await loadAnnouncements();
      showToast(wasPinned ? 'Announcement unpinned.' : 'Announcement pinned.', 'success');
    } catch (e) {
      setErrorMsg('Failed to update pin status. Please try again.');
    }
  }

  function askDelete(id) {
    showConfirmModal(
      'Delete Announcement',
      'Are you sure you want to delete this announcement? This cannot be undone.',
      'delete',
      async () => {
        try {
          await apiRequest(`Announcements/${id}`, 'DELETE', null, true);
          await loadAnnouncements();
          showToast('Announcement deleted.', 'success');
        } catch (err) {
          setErrorMsg('Failed to delete announcement. Please try again.');
        }
      }
    );
  }

  // ── Create / edit modal ──
  const editingId = modal?.editingId ?? null;
  const existingAtts = editingId ? allAttachments.filter(a => a.announcementID === editingId) : [];

  function openCreate() {
    setPendingFiles([]);
    setFieldTitle('');
    setFieldAudience('Both');
    setModal({ editingId: null, html: '' });
  }
  function openEdit(id) {
    const a = allAnnouncements.find(x => x.announcementID === id);
    if (!a) return;
    setPendingFiles([]);
    setFieldTitle(a.title);
    setFieldAudience(a.targetAudience);
    setModal({ editingId: id, html: a.content || '' });
  }
  function closeModal() { setModal(null); }

  // the content editor starts with the post's HTML (innerHTML = a.content)
  useEffect(() => { if (modal && editorRef.current) editorRef.current.innerHTML = modal.html; }, [modal]);

  function handleAttachFiles(e) {
    const room = MAX_ATTACHMENTS - existingAtts.length - pendingFiles.length;
    const files = Array.from(e.target.files || []);

    if (room <= 0) {
      showToast(`Maximum ${MAX_ATTACHMENTS} attachments per post.`, 'error');
      return;
    }
    if (files.length > room) {
      showToast(`Only ${room} more file${room === 1 ? '' : 's'} added — maximum ${MAX_ATTACHMENTS} attachments per post.`, 'info');
    }
    setPendingFiles(p => [...p, ...files.slice(0, room)]);
  }
  function triggerAttachFile() {
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }
  function deleteExistingAttach(attachmentID) {
    showConfirmModal(
      'Remove Attachment',
      'Remove this attachment? This cannot be undone.',
      'delete',
      async () => {
        try {
          await apiRequest(`AnnouncementAttachments/${attachmentID}`, 'DELETE', null, true);
          setAllAttachments(list => list.filter(a => a.attachmentID !== attachmentID));
        } catch (e) { console.error('Delete attachment failed:', e); }
      }
    );
  }

  function saveAnnouncement() {
    const title = fieldTitle.trim();
    const isEdit = editingId !== null;
    if (!title) { setErrorMsg('Please enter an announcement title.'); return; }
    if (!editorRef.current.innerText.trim()) { setErrorMsg('Please enter the announcement content.'); return; }

    showConfirmModal(
      isEdit ? 'Update Announcement' : 'Post Announcement',
      isEdit ? 'Are you sure you want to update this announcement?' : 'Are you sure you want to post this announcement?',
      isEdit ? 'update' : 'post',
      doSaveAnnouncement
    );
  }

  async function doSaveAnnouncement() {
    const title = fieldTitle.trim();
    const content = editorRef.current.innerHTML.trim();
    const session = getSession();
    const userId = session?.user?.UserID || session?.user?.userID || 0;
    const currentEditingId = editingId;

    setSaving(true);
    try {
      let announcementID = currentEditingId;
      if (currentEditingId) {
        const existing = allAnnouncements.find(x => x.announcementID === currentEditingId);
        await apiRequest(`Announcements/${currentEditingId}`, 'PUT', {
          announcementID: currentEditingId,
          postedByUserID: existing?.postedByUserID || userId,
          title, content,
          targetAudience: fieldAudience,
          postedAt:       existing?.postedAt || new Date().toISOString(),
          isActive:       true,
        }, true);
      } else {
        const res = await apiRequest('Announcements', 'POST', {
          postedByUserID: userId,
          title, content,
          targetAudience: fieldAudience,
          postedAt:       new Date().toISOString(),
          isActive:       true,
        }, true);
        announcementID = res?.announcementID;
      }

      if (pendingFiles.length > 0 && announcementID) {
        for (const file of pendingFiles) {
          const fd = new FormData();
          fd.append('announcementId', announcementID);
          fd.append('file', file);
          await apiRequest('AnnouncementAttachments/upload', 'POST', fd, true);
        }
        setPendingFiles([]);
      }

      closeModal();
      await loadAnnouncements();
      showToast(currentEditingId ? 'Announcement updated.' : 'Announcement posted.', 'success');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── List ──
  let list;
  if (state === 'loading') {
    list = <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}><span className="spinner"></span> Loading...</div>;
  } else if (state === 'failed') {
    list = null;
  } else if (!allAnnouncements.length) {
    list = <div className="ann-empty">{FileIcon}<p>No announcements yet. Click <strong>Post Announcement</strong> to get started.</p></div>;
  } else if (!items.length) {
    list = <div className="ann-empty">{SearchIcon}<p>No announcements match your filters.</p></div>;
  } else {
    list = items.map(a => {
      const date = a.postedAt ? new Date(a.postedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
      const posterName = (a.posterFirstName && a.posterLastName)
        ? `${a.posterFirstName} ${a.posterLastName}`.trim()
        : currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Administration';
      const posterInits = ((a.posterFirstName?.[0] || '') + (a.posterLastName?.[0] || '')).toUpperCase() || myInits;

      const [audCls, audLbl] = AUD_MAP[a.targetAudience] ?? ['aud-both', a.targetAudience];
      const pinned = !!a.isPinned;
      const isMine = a.postedByUserID === (currentUser?.userID ?? currentUser?.UserID);
      const id = a.announcementID;

      return (
        <div className={`announce-card${pinned ? ' announce-card--pinned' : ''}`} key={id}>
          {pinned ? <div className="ann-pin-banner"><i className="ti ti-pinned"></i> Pinned</div> : null}
          <div className="ann-card-top">
            <div className="ann-avatar ann-avatar-indigo">{posterInits}</div>
            <div className="ann-card-info">
              <div className="ann-card-name">{posterName}</div>
              <div className="ann-card-date">{date}</div>
            </div>
            <div className="ann-card-badges">
              <span className={`badge ${audCls}`}>{audLbl}</span>
            </div>
            <div className="ann-kebab-wrap">
              {isMine ? (<>
                <button className="ann-kebab-btn" onClick={e => { e.stopPropagation(); setOpenKebab(openKebab === id ? null : id); }}>
                  <i className="ti ti-dots-vertical"></i>
                </button>
                <div className={`ann-kebab-menu${openKebab === id ? ' open' : ''}`} id={`kebab-${id}`}>
                  <button className={`kebab-pin${pinned ? ' active' : ''}`} onClick={() => togglePin(id)}>
                    <i className={`ti ${pinned ? 'ti-pinned-off' : 'ti-pin'}`}></i> {pinned ? 'Unpin' : 'Pin to top'}
                  </button>
                  <button onClick={() => openEdit(id)}>
                    <i className="ti ti-pencil"></i> Edit
                  </button>
                  <button className="kebab-danger" onClick={() => askDelete(id)}>
                    <i className="ti ti-trash"></i> Delete
                  </button>
                </div>
              </>) : null}
            </div>
          </div>
          <div className="announce-title">{a.title}</div>
          <AnnounceContent html={a.content || ''} id={`ann-content-${id}`} />
          <AttachmentCards attachments={allAttachments.filter(x => x.announcementID === id)} onView={setLightbox} />
          <Comments announcementId={id} currentUser={currentUser} myInits={myInits} confirm={showConfirmModal} />
        </div>
      );
    });
  }

  return (
    <Page id="ADMIN_/announcements">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Announcements</h1>
              <p>Create and manage announcements for mentors and mentees</p>
            </div>
            <button className="btn-primary" id="createFormBtn" onClick={openCreate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Post Announcement
            </button>
          </div>

          <div className="forms-section">
            <div className="forms-section-header">
              <h2>All Announcements</h2>
              <span className="forms-section-count" id="annCount">{state === 'ready' ? `${items.length} result${items.length !== 1 ? 's' : ''}` : ''}</span>
            </div>
            <div className="ann-filter-bar">
              <div className="ann-search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input type="text" id="annSearch" placeholder="Search by title or content…" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select className="ann-filter-select" id="annAudienceFilter" value={audience} onChange={e => setAudience(e.target.value)}>
                <option value="">All Audiences</option>
                <option value="Both">Mentors &amp; Mentees</option>
                <option value="Mentor">Mentors only</option>
                <option value="Mentee">Mentees only</option>
              </Select>
            </div>
            <div className="forms-list" id="formsList">{list}</div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Create / Edit Modal */}
      <Overlay open={!!modal} className="modal-overlay" activeClass="active" id="modalOverlay"
        onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal">
          <div className="modal-header">
            <h3 id="modalTitle">{editingId !== null ? 'Edit Announcement' : 'Post Announcement'}</h3>
            <button className="modal-close" id="modalClose" onClick={closeModal}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label>Title <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" id="fieldTitle" placeholder="e.g. Mentoring Session Schedule Update" autoComplete="off" value={fieldTitle} onChange={e => setFieldTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Content <span style={{ color: '#ef4444' }}>*</span></label>
              <div className="gc-editor-wrap">
                <div id="fieldDesc" className="gc-editor" contentEditable suppressContentEditableWarning ref={editorRef}
                  data-placeholder="Write a message for your audience..."></div>
                <div className="gc-toolbar">
                  <button type="button" className="gc-fmt-btn" data-cmd="bold" data-tooltip="Bold" onMouseDown={fmtMouseDown('bold')}><b>B</b></button>
                  <button type="button" className="gc-fmt-btn" data-cmd="italic" data-tooltip="Italic" onMouseDown={fmtMouseDown('italic')}><i>I</i></button>
                  <button type="button" className="gc-fmt-btn" data-cmd="underline" data-tooltip="Underline" onMouseDown={fmtMouseDown('underline')}><u>U</u></button>
                  <button type="button" className="gc-fmt-btn" data-cmd="strikeThrough" data-tooltip="Strikethrough" onMouseDown={fmtMouseDown('strikeThrough')}><s>S</s></button>
                  <span className="gc-fmt-sep"></span>
                  <button type="button" className="gc-fmt-btn" data-cmd="insertUnorderedList" data-tooltip="Bullet list" onMouseDown={fmtMouseDown('insertUnorderedList')}><i className="ti ti-list"></i></button>
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
                    <button className="attach-remove" onClick={() => deleteExistingAttach(att.attachmentID)}>×</button>
                  </div>
                ))}
                {pendingFiles.map((f, i) => (
                  <div className="attach-item" key={`p${i}`}>
                    <i className={`ti ${attachIcon(f.name)} attach-icon`}></i>
                    <span className="attach-name">{f.name}</span>
                    <span className="attach-size">{formatFileSize(f.size)}</span>
                    <button className="attach-remove" onClick={() => setPendingFiles(p => p.filter((_, k) => k !== i))}>×</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Who can see this?</label>
              <Select id="fieldAudience" value={fieldAudience} onChange={e => setFieldAudience(e.target.value)}>
                <option value="Both">Both (Mentors &amp; Mentees)</option>
                <option value="Mentor">Mentors only</option>
                <option value="Mentee">Mentees only</option>
              </Select>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-outline" id="modalCancel" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" id="modalSave" onClick={saveAnnouncement} disabled={saving}>
              {saving ? 'Saving...' : (editingId !== null ? 'Update Announcement' : 'Post Announcement')}
            </button>
          </div>
        </div>
      </Overlay>

      <ConfirmModal confirm={confirmDlg} onClose={() => setConfirmDlg(null)} />
      <ErrorModal message={errorMsg} onClose={() => setErrorMsg(null)} />
      <AttachmentLightbox attachment={lightbox} onClose={() => setLightbox(null)} />
    </Page>
  );
}
