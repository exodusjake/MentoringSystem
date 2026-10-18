// ===== POST ANNOUNCEMENTS JS =====

let allAnnouncements   = [];
let allAttachments     = [];
let pendingAttachFiles = [];
const MAX_ATTACHMENTS  = 5;
let currentUser        = null;
let editingId          = null;
let annSearchQuery     = '';
let annStatusFilter    = '';
let annAudienceFilter  = '';
let openCommentKebabId = null;
let openKebabId        = null;

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');
  currentUser = getSession()?.user;

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  loadAnnouncements();

  document.getElementById('createFormBtn').addEventListener('click', openCreate);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', saveAnnouncement);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  document.getElementById('annSearch').addEventListener('input', e => {
    annSearchQuery = e.target.value.trim().toLowerCase();
    renderAnnouncements();
  });
  document.getElementById('annAudienceFilter').addEventListener('change', e => {
    annAudienceFilter = e.target.value;
    renderAnnouncements();
  });

  document.addEventListener('click', () => {
    if (openKebabId) {
      document.getElementById(`kebab-${openKebabId}`)?.classList.remove('open');
      openKebabId = null;
    }
    if (openCommentKebabId) {
      document.getElementById(`ckebab-${openCommentKebabId}`)?.classList.remove('open');
      openCommentKebabId = null;
    }
  });
});

// ── LOAD FROM BACKEND ─────────────────────────────────────────
async function loadAnnouncements() {
  try {
    const [data, mentors, attachData] = await Promise.all([
      apiRequest('Announcements', 'GET', null, true),
      apiRequest('Users/mentors-with-dept', 'GET', null, true),
      apiRequest('AnnouncementAttachments', 'GET', null, true).catch(() => []),
    ]);
    const mentorIds = new Set((mentors || []).map(m => m.userID));
    allAnnouncements = (data || []).filter(a => !mentorIds.has(a.postedByUserID));
    allAttachments   = attachData || [];
    renderAnnouncements();
  } catch (e) {
    console.error('Error loading announcements:', e);
    showErrorModal('Failed to load announcements. Please refresh.');
  }
}

// ── RENDER LIST ───────────────────────────────────────────────
function renderAnnouncements() {
  const list = document.getElementById('formsList');

  let items = [...allAnnouncements].sort((a, b) => {
    const pinA = a.isPinned ? 1 : 0, pinB = b.isPinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    const dA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const dB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    if (dA !== dB) return dB - dA;
    return (b.announcementID || 0) - (a.announcementID || 0);
  });

  if (annSearchQuery) {
    items = items.filter(a =>
      a.title.toLowerCase().includes(annSearchQuery) ||
      (a.content || '').toLowerCase().includes(annSearchQuery)
    );
  }
  if (annAudienceFilter) {
    items = items.filter(a => a.targetAudience === annAudienceFilter);
  }

  const countEl = document.getElementById('annCount');
  if (countEl) countEl.textContent = `${items.length} result${items.length !== 1 ? 's' : ''}`;

  if (allAnnouncements.length === 0) {
    list.innerHTML = `<div class="ann-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>No announcements yet. Click <strong>Post Announcement</strong> to get started.</p></div>`;
    return;
  }
  if (items.length === 0) {
    list.innerHTML = `<div class="ann-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p>No announcements match your filters.</p></div>`;
    return;
  }

  const adminInitials = ((currentUser?.firstName?.[0]||'') + (currentUser?.lastName?.[0]||'')).toUpperCase() || 'AD';

  list.innerHTML = items.map(a => {
    const date         = a.postedAt ? new Date(a.postedAt).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' }) : '—';
    const posterName   = (a.posterFirstName && a.posterLastName)
      ? `${a.posterFirstName} ${a.posterLastName}`.trim()
      : currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Administration';
    const posterInits  = ((a.posterFirstName?.[0]||'') + (a.posterLastName?.[0]||'')).toUpperCase() || adminInitials;
    const audMap       = { Both: ['aud-both','Mentors & Mentees'], Mentor: ['aud-mentor','Mentors only'], Mentee: ['aud-mentee','Mentees only'] };
    const [audCls, audLbl] = audMap[a.targetAudience] ?? ['aud-both', a.targetAudience];
    const content      = a.content || '';

    // Pin/Edit/Delete are all owner-only server-side (AnnouncementsController.
    // CanModifyAsync) — with multiple Admin/Head accounts posting here, the
    // kebab menu used to render on every card regardless, so clicking Pin on
    // someone else's post silently did nothing (a 403 with no visible error)
    // and Edit/Delete only failed after the user had already typed a change
    // or confirmed a delete. Hide the menu entirely when it's not yours —
    // same principle already used for comments' isMyComment below.
    const isMine       = a.postedByUserID === (currentUser?.userID ?? currentUser?.UserID);

    const commentsSection = `
      <div class="card-comments">
        <button class="class-comments-toggle" id="cctoggle-${a.announcementID}" style="display:none"
          onclick="toggleCommentsList(${a.announcementID})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span id="cccount-${a.announcementID}"></span>
        </button>
        <div class="card-comments-list" id="clist-${a.announcementID}" style="display:none"></div>
        <button class="add-comment-trigger" id="ctrigger-${a.announcementID}"
          onclick="expandCommentBar(${a.announcementID})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Add comment
        </button>
        <div class="add-comment-bar" id="cbar-${a.announcementID}" style="display:none">
          <div class="add-comment-avatar">${adminInitials}</div>
          <div class="rich-comment-wrap" id="cwrap-${a.announcementID}">
            <div class="add-comment-input" id="cinput-${a.announcementID}"
              contenteditable="true" data-placeholder="Add comment…"
              onfocus="onCommentFocus(${a.announcementID})"
              onblur="onCommentBlur(${a.announcementID})"
              onkeydown="handleCommentKey(event,${a.announcementID})"></div>
            <div class="comment-format-toolbar" id="ctoolbar-${a.announcementID}">
              <button type="button" class="cfmt-btn" data-cmd="bold" data-tooltip="Bold" onmousedown="event.preventDefault();formatDoc('bold')"><b>B</b></button>
              <button type="button" class="cfmt-btn" data-cmd="italic" data-tooltip="Italic" onmousedown="event.preventDefault();formatDoc('italic')"><i>I</i></button>
              <button type="button" class="cfmt-btn" data-cmd="underline" data-tooltip="Underline" onmousedown="event.preventDefault();formatDoc('underline')"><u>U</u></button>
              <button type="button" class="cfmt-btn" data-cmd="strikeThrough" data-tooltip="Strikethrough" onmousedown="event.preventDefault();formatDoc('strikeThrough')"><s>S</s></button>
              <span class="cfmt-sep"></span>
              <button type="button" class="cfmt-btn" data-cmd="insertUnorderedList" data-tooltip="Bullet list" onmousedown="event.preventDefault();formatDoc('insertUnorderedList')">&#8226; List</button>
            </div>
          </div>
          <button class="btn-send-comment" id="cbtn-${a.announcementID}"
            onmousedown="event.preventDefault()" onclick="postComment(${a.announcementID})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>`;

    const pinned = !!a.isPinned;
    return `
      <div class="announce-card${pinned ? ' announce-card--pinned' : ''}">
        ${pinned ? `<div class="ann-pin-banner"><i class="ti ti-pinned"></i> Pinned</div>` : ''}
        <div class="ann-card-top">
          <div class="ann-avatar ann-avatar-indigo">${posterInits}</div>
          <div class="ann-card-info">
            <div class="ann-card-name">${escapeHtml(posterName)}</div>
            <div class="ann-card-date">${date}</div>
          </div>
          <div class="ann-card-badges">
            <span class="badge ${audCls}">${audLbl}</span>
          </div>
          <div class="ann-kebab-wrap">
            ${isMine ? `
            <button class="ann-kebab-btn" onclick="toggleKebab(event,${a.announcementID})">
              <i class="ti ti-dots-vertical"></i>
            </button>
            <div class="ann-kebab-menu" id="kebab-${a.announcementID}">
              <button class="kebab-pin${pinned ? ' active' : ''}" onclick="togglePin(${a.announcementID})">
                <i class="ti ${pinned ? 'ti-pinned-off' : 'ti-pin'}"></i> ${pinned ? 'Unpin' : 'Pin to top'}
              </button>
              <button onclick="openEdit(${a.announcementID})">
                <i class="ti ti-pencil"></i> Edit
              </button>
              <button class="kebab-danger" onclick="askDelete(${a.announcementID})">
                <i class="ti ti-trash"></i> Delete
              </button>
            </div>` : ''}
          </div>
        </div>
        <div class="announce-title">${escapeHtml(a.title)}</div>
        <div class="announce-content truncated" id="ann-content-${a.announcementID}">${sanitizeHtml(content)}</div>
        <button type="button" hidden aria-expanded="false" class="btn-see-more" onclick="toggleSeeMore(${a.announcementID},this)">See more</button>
        ${renderAttachmentSection(a.announcementID)}
        ${commentsSection}
      </div>`;
  }).join('');

  items.forEach(a => loadCommentsInline(a.announcementID));
}

function toggleSeeMore(id, btn) {
  const el = document.getElementById(`ann-content-${id}`);
  el.classList.toggle('truncated');
  const expanded = !el.classList.contains('truncated');
  btn.textContent = expanded ? 'See less' : 'See more';
  btn.setAttribute('aria-expanded', String(expanded));
}

function toggleKebab(event, id) {
  event.stopPropagation();
  if (openKebabId && openKebabId !== id) {
    document.getElementById(`kebab-${openKebabId}`)?.classList.remove('open');
  }
  const menu = document.getElementById(`kebab-${id}`);
  menu?.classList.toggle('open');
  openKebabId = menu?.classList.contains('open') ? id : null;
}

async function togglePin(id) {
  const wasPinned = !!allAnnouncements.find(x => x.announcementID === id)?.isPinned;
  try {
    await apiRequest(`Announcements/${id}/pin`, 'PATCH', null, true);
    await loadAnnouncements();
    showToast(wasPinned ? 'Announcement unpinned.' : 'Announcement pinned.', 'success');
  } catch (e) {
    // The kebab menu that holds this button is only rendered for your own
    // posts now, so this should be unreachable in normal use — kept as a
    // visible fallback (was a silent console.error) rather than trusting
    // that entirely.
    showErrorModal('Failed to update pin status. Please try again.');
  }
}

// ── COMMENTS ──────────────────────────────────────────────────
async function loadCommentsInline(announcementId) {
  const list = document.getElementById(`clist-${announcementId}`);
  if (!list) return;
  try {
    const comments = await apiRequest(`AnnouncementComments/announcement/${announcementId}`, 'GET', null, true);
    renderCommentsInline(announcementId, comments || []);
  } catch (e) {
    list.innerHTML = '<div class="comments-empty">Failed to load comments.</div>';
  }
}

function renderCommentsInline(announcementId, comments) {
  const list      = document.getElementById(`clist-${announcementId}`);
  const toggleBtn = document.getElementById(`cctoggle-${announcementId}`);
  const countSpan = document.getElementById(`cccount-${announcementId}`);
  if (!list) return;

  const total    = comments.length;
  const showAll  = list.dataset.showAll === 'true';
  const visible  = showAll ? comments : comments.slice(0, 2);
  const remaining = total - visible.length;

  if (toggleBtn) {
    toggleBtn.style.display = total > 0 ? '' : 'none';
    if (countSpan) countSpan.textContent = `${total} comment${total !== 1 ? 's' : ''}`;
  }

  if (!total) { list.innerHTML = ''; return; }

  let html = visible.map(c => renderCommentHtml(c)).join('');
  if (remaining > 0) {
    html += `<button class="btn-view-more-comments" onclick="showAllComments(${announcementId})">View ${remaining} more comment${remaining !== 1 ? 's' : ''}</button>`;
  }
  list.innerHTML = html;
}

async function showAllComments(announcementId) {
  const list = document.getElementById(`clist-${announcementId}`);
  if (list) list.dataset.showAll = 'true';
  await loadCommentsInline(announcementId);
}

function renderCommentHtml(c) {
  const isMyComment = c.postedByUserID === currentUser?.userID;
  const initials    = (((c.firstName||'')[0]||'') + ((c.lastName||'')[0]||'')).toUpperCase() || '?';
  const name        = `${c.firstName||''} ${c.lastName||''}`.trim() || 'User';
  const time        = new Date(c.postedAt).toLocaleString('en-PH', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });

  const kebab = isMyComment ? `
    <div class="comment-kebab-wrap">
      <button class="comment-kebab-btn" onclick="toggleCommentKebab(event,${c.commentID})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>
      <div class="comment-kebab-menu" id="ckebab-${c.commentID}">
        <button onclick="startEditComment(${c.commentID},${c.announcementID})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit
        </button>
        <button class="ckebab-danger" onclick="openCommentDeleteConfirm(${c.commentID})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg> Delete
        </button>
      </div>
    </div>` : '';

  const editAndConfirm = isMyComment ? `
    <div class="comment-edit-row" id="cedit-${c.commentID}" style="display:none">
      <div class="comment-edit-input" id="cedit-input-${c.commentID}" contenteditable="true">${sanitizeHtml(c.content)}</div>
      <div class="comment-edit-actions">
        <button class="btn-cedit-cancel" onclick="cancelEditComment(${c.commentID})">Cancel</button>
        <button class="btn-cedit-save" onclick="saveEditComment(${c.commentID},${c.announcementID})">Save</button>
      </div>
    </div>` : '';

  const safeName = name.replace(/'/g, "&#39;");
  const replyBtn = `
    <button class="comment-reply-btn" title="Reply to ${safeName}" onclick="replyToComment('${safeName}', ${c.announcementID})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
    </button>`;

  return `
    <div class="comment-item" id="citem-${c.commentID}" data-announcement-id="${c.announcementID}">
      <div class="comment-avatar">${initials}</div>
      <div class="comment-bubble">
        <div class="comment-meta">
          <span class="comment-author">${escapeHtml(name)}</span>
          <span class="comment-time">${time}</span>
          ${kebab}
        </div>
        <div class="comment-text" id="ctext-${c.commentID}">${sanitizeHtml(c.content)}</div>
        ${editAndConfirm}
      </div>
      <div class="comment-reply-wrap">${replyBtn}</div>
    </div>`;
}

function toggleCommentKebab(event, commentId) {
  event.stopPropagation();
  if (openCommentKebabId && openCommentKebabId !== commentId) {
    document.getElementById(`ckebab-${openCommentKebabId}`)?.classList.remove('open');
  }
  const menu = document.getElementById(`ckebab-${commentId}`);
  menu?.classList.toggle('open');
  openCommentKebabId = menu?.classList.contains('open') ? commentId : null;
}

function startEditComment(commentId, announcementId) {
  document.getElementById(`ckebab-${commentId}`)?.classList.remove('open');
  openCommentKebabId = null;
  document.getElementById(`ctext-${commentId}`).style.display = 'none';
  document.getElementById(`cedit-${commentId}`).style.display = '';
  document.getElementById(`cedit-input-${commentId}`).focus();
}

function cancelEditComment(commentId) {
  document.getElementById(`ctext-${commentId}`).style.display = '';
  document.getElementById(`cedit-${commentId}`).style.display = 'none';
}

async function saveEditComment(commentId, announcementId) {
  const content = document.getElementById(`cedit-input-${commentId}`)?.innerHTML?.trim();
  if (!content || content === '<br>') return;
  try {
    await apiRequest(`AnnouncementComments/${commentId}`, 'PUT', { Content: content }, true);
    await loadCommentsInline(announcementId);
  } catch (e) { console.error('Edit comment failed:', e); }
}

function openCommentDeleteConfirm(commentId) {
  document.getElementById(`ckebab-${commentId}`)?.classList.remove('open');
  openCommentKebabId = null;
  const announcementId = document.getElementById(`citem-${commentId}`)?.dataset.announcementId;
  showConfirmModal(
    'Delete Comment',
    'Are you sure you want to delete this comment? This cannot be undone.',
    'delete',
    () => doDeleteComment(commentId, announcementId)
  );
}

async function doDeleteComment(commentId, announcementId) {
  try {
    await apiRequest(`AnnouncementComments/${commentId}`, 'DELETE', null, true);
    await loadCommentsInline(announcementId);
  } catch (e) { console.error('Delete comment failed:', e); }
}

function toggleCommentsList(announcementId) {
  const list = document.getElementById(`clist-${announcementId}`);
  if (list) list.style.display = list.style.display === 'none' ? '' : 'none';
}

function replyToComment(name, announcementId) {
  const bar     = document.getElementById(`cbar-${announcementId}`);
  const trigger = document.getElementById(`ctrigger-${announcementId}`);
  if (bar && bar.style.display === 'none') {
    if (trigger) trigger.style.display = 'none';
    bar.style.display = 'flex';
  }
  const input = document.getElementById(`cinput-${announcementId}`);
  if (!input) return;
  input.innerHTML = `<b>@${escapeHtml(name)}</b>&nbsp;`;
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const list = document.getElementById(`clist-${announcementId}`);
  if (list) list.style.display = '';
}

function expandCommentBar(annId) {
  document.getElementById(`ctrigger-${annId}`).style.display = 'none';
  document.getElementById(`cbar-${annId}`).style.display     = 'flex';
  document.getElementById(`cinput-${annId}`)?.focus();
}

function formatDoc(command) {
  document.execCommand(command, false, null);
  const focused = document.activeElement;
  if (focused?.hasAttribute('contenteditable')) {
    updateFormatButtons(focused.closest('.gc-editor-wrap, .rich-comment-wrap'));
  }
}

function updateFormatButtons(wrap) {
  if (!wrap) return;
  wrap.querySelectorAll('[data-cmd]').forEach(btn => {
    try { btn.classList.toggle('fmt-active', document.queryCommandState(btn.dataset.cmd)); } catch (e) {}
  });
}

document.addEventListener('selectionchange', () => {
  const focused = document.activeElement;
  if (!focused?.hasAttribute('contenteditable')) return;
  updateFormatButtons(focused.closest('.gc-editor-wrap, .rich-comment-wrap'));
});

function onCommentFocus(annId) {
  document.getElementById(`cwrap-${annId}`)?.classList.add('toolbar-visible');
}

function onCommentBlur(annId) {
  setTimeout(() => {
    const wrap    = document.getElementById(`cwrap-${annId}`);
    const input   = document.getElementById(`cinput-${annId}`);
    const bar     = document.getElementById(`cbar-${annId}`);
    const trigger = document.getElementById(`ctrigger-${annId}`);
    if (!wrap || wrap.contains(document.activeElement)) return;
    const content = input?.innerHTML?.trim();
    if (!content || content === '<br>') {
      if (bar)     bar.style.display = 'none';
      if (trigger) trigger.style.display = '';
    }
  }, 150);
}

async function postComment(announcementId) {
  const input   = document.getElementById(`cinput-${announcementId}`);
  const content = input?.innerHTML?.trim();
  if (!content || content === '<br>') return;

  const btn = document.getElementById(`cbtn-${announcementId}`);
  if (btn) btn.disabled = true;

  try {
    await apiRequest('AnnouncementComments', 'POST', {
      AnnouncementID: announcementId,
      PostedByUserID: currentUser?.userID,
      Content:        content,
    }, true);
    input.innerHTML = '';
    document.getElementById(`cbar-${announcementId}`).style.display    = 'none';
    document.getElementById(`ctrigger-${announcementId}`).style.display = '';
    const list = document.getElementById(`clist-${announcementId}`);
    if (list) list.dataset.showAll = 'true';
    await loadCommentsInline(announcementId);
  } catch (e) {
    console.error('Post comment failed:', e);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function handleCommentKey(event, announcementId) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    postComment(announcementId);
  }
}


// ── ATTACHMENT HELPERS ────────────────────────────────────────
function triggerAttachFile() {
  document.getElementById('attachFileInput').value = '';
  document.getElementById('attachFileInput').click();
}

function handleAttachFiles(e) {
  const existing = editingId ? allAttachments.filter(a => a.announcementID === editingId) : [];
  const room     = MAX_ATTACHMENTS - existing.length - pendingAttachFiles.length;
  const files    = Array.from(e.target.files || []);

  if (room <= 0) {
    showToast(`Maximum ${MAX_ATTACHMENTS} attachments per post.`, 'error');
    return;
  }
  if (files.length > room) {
    showToast(`Only ${room} more file${room === 1 ? '' : 's'} added — maximum ${MAX_ATTACHMENTS} attachments per post.`, 'info');
  }
  pendingAttachFiles.push(...files.slice(0, room));
  renderAttachList(existing);
}

function removeAttach(index) {
  pendingAttachFiles.splice(index, 1);
  renderAttachList(editingId ? allAttachments.filter(a => a.announcementID === editingId) : []);
}

function deleteExistingAttach(attachmentID) {
  showConfirmModal(
    'Remove Attachment',
    'Remove this attachment? This cannot be undone.',
    'delete',
    () => doDeleteExistingAttach(attachmentID)
  );
}

async function doDeleteExistingAttach(attachmentID) {
  try {
    await apiRequest(`AnnouncementAttachments/${attachmentID}`, 'DELETE', null, true);
    allAttachments = allAttachments.filter(a => a.attachmentID !== attachmentID);
    const existing = editingId ? allAttachments.filter(a => a.announcementID === editingId) : [];
    renderAttachList(existing);
  } catch (e) { console.error('Delete attachment failed', e); }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function attachIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'ti-photo';
  if (ext === 'pdf') return 'ti-file-type-pdf';
  if (['doc','docx'].includes(ext)) return 'ti-file-type-doc';
  if (['xls','xlsx'].includes(ext)) return 'ti-file-spreadsheet';
  if (['ppt','pptx'].includes(ext)) return 'ti-presentation';
  return 'ti-file';
}

function renderAttachList(existingAttachments = []) {
  const list = document.getElementById('attachList');
  if (!list) return;
  const existingHtml = existingAttachments.map(att => `
    <div class="attach-item">
      <i class="ti ${attachIcon(att.fileName)} attach-icon"></i>
      <a class="attach-name" href="${fileUrl(att.filePath)}" target="_blank" rel="noopener">${escapeHtml(att.fileName)}</a>
      <span class="attach-size">${formatFileSize(att.fileSize)}</span>
      <button class="attach-remove" title="Remove" onclick="deleteExistingAttach(${att.attachmentID})">×</button>
    </div>`).join('');
  const pendingHtml = pendingAttachFiles.map((f, i) => `
    <div class="attach-item">
      <i class="ti ${attachIcon(f.name)} attach-icon"></i>
      <span class="attach-name">${escapeHtml(f.name)}</span>
      <span class="attach-size">${formatFileSize(f.size)}</span>
      <button class="attach-remove" title="Remove" onclick="removeAttach(${i})">×</button>
    </div>`).join('');
  list.innerHTML = existingHtml + pendingHtml;
}

function fileUrl(path) {
  return CONFIG.API_BASE_URL.replace('/api', '') + path;
}

function renderAttachmentSection(announcementID) {
  const atts = allAttachments.filter(a => a.announcementID === announcementID);
  if (!atts.length) return '';
  const items = atts.map(a => `
    <div class="attach-item--card">
      <a class="attach-item--card-link" href="${fileUrl(a.filePath)}" onclick="event.preventDefault(); viewAttachment(${a.attachmentID})">
        <i class="ti ${attachIcon(a.fileName)} attach-icon"></i>
        <span class="attach-name">${escapeHtml(a.fileName)}</span>
        <span class="attach-size">${formatFileSize(a.fileSize)}</span>
      </a>
      <button class="attach-download" title="Download" onclick="downloadAttach(${a.attachmentID})">
        <i class="ti ti-download"></i>
      </button>
    </div>`).join('');
  return `<div class="attach-list attach-list--card">${items}</div>`;
}

function downloadAttach(attachmentId) {
  window.open(`${CONFIG.API_BASE_URL}/AnnouncementAttachments/${attachmentId}/download`, '_blank');
}

// Attachment lightbox
function viewAttachment(attachmentId) {
  const a = allAttachments.find(x => x.attachmentID === attachmentId);
  if (!a) return;
  const overlay = document.getElementById('lightboxOverlay');
  const body    = document.getElementById('lightboxBody');
  const dlBtn   = document.getElementById('lightboxDownload');
  document.getElementById('lightboxTitle').textContent = a.fileName || 'Attachment';

  const downloadUrl = `${CONFIG.API_BASE_URL}/AnnouncementAttachments/${a.attachmentID}/download`;
  dlBtn.href = downloadUrl;
  dlBtn.style.display = 'inline-flex';

  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.fileName || '');
  const fullUrl = fileUrl(a.filePath);
  if (isImage) {
    body.innerHTML = `<img src="${fullUrl}" alt="${escapeHtml(a.fileName || 'Attachment')}" onerror="this.parentElement.innerHTML=lightboxNoPreviewHtml('${downloadUrl}')"/>`;
  } else {
    body.innerHTML = lightboxNoPreviewHtml(downloadUrl);
  }
  overlay.style.display = 'flex';
}

function lightboxNoPreviewHtml(url) {
  return `
    <div class="lightbox-no-preview">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>Preview not available for this file type.</p>
      <a href="${url}" target="_blank" rel="noopener" class="lightbox-open-btn">Open File</a>
    </div>`;
}

function closeLightbox(e) {
  if (e && e.target !== document.getElementById('lightboxOverlay')) return;
  const overlay = document.getElementById('lightboxOverlay');
  if (overlay) overlay.style.display = 'none';
  const body = document.getElementById('lightboxBody');
  if (body) body.innerHTML = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});

// ── OPEN CREATE MODAL ─────────────────────────────────────────
function openCreate() {
  editingId = null;
  pendingAttachFiles = [];
  document.getElementById('modalTitle').textContent = 'Post Announcement';
  document.getElementById('fieldTitle').value       = '';
  document.getElementById('fieldDesc').innerHTML    = '';
  document.getElementById('fieldAudience').value    = 'Both';
  document.getElementById('modalSave').textContent  = 'Post Announcement';
  renderAttachList();
  document.getElementById('modalOverlay').classList.add('active');
}

// ── OPEN EDIT MODAL ───────────────────────────────────────────
function openEdit(id) {
  const a = allAnnouncements.find(x => x.announcementID === id);
  if (!a) return;
  editingId = id;
  pendingAttachFiles = [];
  document.getElementById('modalTitle').textContent = 'Edit Announcement';
  document.getElementById('fieldTitle').value       = a.title;
  document.getElementById('fieldDesc').innerHTML    = a.content || '';
  document.getElementById('fieldAudience').value    = a.targetAudience;
  document.getElementById('modalSave').textContent  = 'Update Announcement';
  // Show existing attachments in the list
  const existing = allAttachments.filter(att => att.announcementID === id);
  renderAttachList(existing);
  document.getElementById('modalOverlay').classList.add('active');
}

// ── CLOSE MODAL ───────────────────────────────────────────────
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  editingId = null;
}

// ── SAVE — shows confirm first ────────────────────────────────
function saveAnnouncement() {
  const title   = document.getElementById('fieldTitle').value.trim();
  const content = document.getElementById('fieldDesc').innerHTML.trim();
  const isEdit  = editingId !== null;

  if (!title)                                        { showErrorModal('Please enter an announcement title.'); return; }
  if (!document.getElementById('fieldDesc').innerText.trim()) { showErrorModal('Please enter the announcement content.'); return; }

  showConfirmModal(
    isEdit ? 'Update Announcement' : 'Post Announcement',
    isEdit ? 'Are you sure you want to update this announcement?' : 'Are you sure you want to post this announcement?',
    isEdit ? 'update' : 'post',
    doSaveAnnouncement
  );
}

// ── ACTUAL SAVE ───────────────────────────────────────────────
async function doSaveAnnouncement() {
  const title    = document.getElementById('fieldTitle').value.trim();
  const content  = document.getElementById('fieldDesc').innerHTML.trim();
  const audience = document.getElementById('fieldAudience').value;
  const isActive = true;

  const session = getSession();
  const userId  = session?.user?.UserID || session?.user?.userID || 0;

  const saveBtn = document.getElementById('modalSave');
  const origText = saveBtn.textContent;
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving...';

  const currentEditingId = editingId;

  try {
    let announcementID = currentEditingId;
    if (currentEditingId) {
      const existing = allAnnouncements.find(x => x.announcementID === currentEditingId);
      await apiRequest(`Announcements/${currentEditingId}`, 'PUT', {
        announcementID: currentEditingId,
        postedByUserID: existing?.postedByUserID || userId,
        title,
        content,
        targetAudience: audience,
        postedAt:       existing?.postedAt || new Date().toISOString(),
        isActive
      }, true);
    } else {
      const res = await apiRequest('Announcements', 'POST', {
        postedByUserID: userId,
        title,
        content,
        targetAudience: audience,
        postedAt:       new Date().toISOString(),
        isActive
      }, true);
      announcementID = res?.announcementID;
    }

    // Upload any pending file attachments
    if (pendingAttachFiles.length > 0 && announcementID) {
      for (const file of pendingAttachFiles) {
        const fd = new FormData();
        fd.append('announcementId', announcementID);
        fd.append('file', file);
        await apiRequest('AnnouncementAttachments/upload', 'POST', fd, true);
      }
      pendingAttachFiles = [];
    }

    closeModal();
    await loadAnnouncements();

    const toastMsg = currentEditingId
      ? 'Announcement updated.'
      : isActive
        ? 'Announcement posted.'
        : 'Saved as draft.';
    showToast(toastMsg, 'success');

  } catch (err) {
    showErrorModal(err.message || 'Failed to save announcement. Please try again.');
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = origText;
  }
}

// ── DELETE — shows confirm first ──────────────────────────────
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
        showErrorModal('Failed to delete announcement. Please try again.');
      }
    }
  );
}

// ── CONFIRM MODAL ─────────────────────────────────────────────
function showConfirmModal(title, message, type, onConfirm) {
  document.getElementById('confirmTitle').textContent   = title;
  document.getElementById('confirmMessage').textContent = message;

  const okBtn = document.getElementById('confirmOkBtn');
  const icon  = document.getElementById('confirmIcon');

  if (type === 'delete') {
    okBtn.className   = 'btn-danger';
    okBtn.textContent = 'Delete';
    icon.className    = 'info-modal-icon danger';
    icon.innerHTML    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  } else if (type === 'draft') {
    okBtn.className   = 'btn-primary';
    okBtn.textContent = 'Save as Draft';
    icon.className    = 'info-modal-icon confirm';
    icon.style.background = '';
    icon.innerHTML    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  } else {
    okBtn.className   = 'btn-primary';
    okBtn.textContent = type === 'update' ? 'Update' : 'Post';
    icon.className    = 'info-modal-icon confirm';
    icon.style.background = '';
    icon.innerHTML    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9 11 12 14 22 4"/></svg>`;
  }

  okBtn.onclick = () => {
    hideConfirmModal();
    onConfirm();
  };

  document.getElementById('confirmModal').style.display = 'flex';
}

function hideConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
}

// Toasts come from the shared /notify.js (showToast(message, type)).

// ── ERROR MODAL ───────────────────────────────────────────────
function showErrorModal(msg) {
  document.getElementById('errorMessage').textContent = msg;
  document.getElementById('errorModal').style.display = 'flex';
}

function hideErrorModal() {
  document.getElementById('errorModal').style.display = 'none';
}