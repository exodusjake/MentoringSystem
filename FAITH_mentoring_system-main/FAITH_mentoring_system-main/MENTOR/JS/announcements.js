/* ============================================================
   ASTRA MENTOR — announcements.js
   ============================================================ */

let allAnnouncements      = [];
let allAttachments        = [];
let pendingAttachFiles    = [];
const MAX_ATTACHMENTS     = 5;
let currentUser           = null;
let mentorSections        = [];
let editAnnounceId        = null;
let deleteAnnounceId      = null;
let deleteAttachId        = null;
let deleteCommentId       = null;
let deleteCommentAnnouncementId = null;
let activeTab             = 'notifications';
let latestCommentAt       = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentor');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  currentUser = getSession().user;
  await Promise.all([loadAnnouncements(), loadMentorSections()]);

  document.getElementById('searchInput').addEventListener('input', applyFilters);

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

// ── LOAD ──────────────────────────────────────────────────────────────────────
async function loadMentorSections() {
  try {
    const [assignments, menteesWithDept] = await Promise.all([
      apiRequest('Users/assignments', 'GET', null, true),
      apiRequest('Users/mentees-with-dept', 'GET', null, true),
    ]);
    const deptMap = {};
    (menteesWithDept || []).forEach(m => { deptMap[m.userID] = m; });
    const mine = (assignments || []).filter(a => a.mentorUserID === currentUser?.userID);
    const seen = new Set();
    mentorSections = [];
    mine.forEach(a => {
      const detail = deptMap[a.menteeUserID] || {};
      const sec    = detail.sectionCode || detail.section || '—';
      if (!seen.has(sec)) { seen.add(sec); mentorSections.push(sec); }
    });
    mentorSections.sort();
  } catch (e) { /* non-critical */ }
}

async function loadAnnouncements() {
  try {
    const [items, latestComment, attachData] = await Promise.all([
      apiRequest('Announcements', 'GET', null, true),
      apiRequest(`AnnouncementComments/announcer/${currentUser?.userID}/latest`, 'GET', null, true),
      apiRequest('AnnouncementAttachments', 'GET', null, true).catch(() => []),
    ]);
    allAttachments = attachData || [];

    latestCommentAt = latestComment?.latestCommentAt ? new Date(latestComment.latestCommentAt) : null;

    allAnnouncements = (items || [])
      .filter(a => {
        if (a.postedByUserID === currentUser?.userID) return true; // own posts always visible
        if (!a.isActive) return false;
        const ta = (a.targetAudience || '').toLowerCase();
        return ta === 'both' || ta === 'mentor';
      })
      .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

    const adminCount = allAnnouncements.filter(a => a.postedByUserID !== currentUser?.userID).length;
    const mineCount  = allAnnouncements.filter(a => a.postedByUserID === currentUser?.userID).length;
    document.getElementById('announceSubtitle').textContent =
      `${adminCount} from administration · ${mineCount} of your post${mineCount !== 1 ? 's' : ''}`;

    const postBtn = document.querySelector('.btn-post-announce');
    if (postBtn) postBtn.style.display = activeTab === 'mine' ? '' : 'none';

    markTabRead(activeTab);
    updateTabDots();
    applyFilters();
    scrollToDeepLinkedAnnouncement();
  } catch (e) {
    document.getElementById('announcementsList').innerHTML =
      '<div class="list-skeleton">Failed to load announcements. Please refresh.</div>';
  }
}

// ── UNREAD DOT TRACKING ───────────────────────────────────────────────────────
function getLastRead(tab) {
  return localStorage.getItem(`ann_lastRead_${tab}_${currentUser?.userID}`);
}

function markTabRead(tab) {
  localStorage.setItem(`ann_lastRead_${tab}_${currentUser?.userID}`, new Date().toISOString());
}

function updateTabDots() {
  // Notifications tab — unread admin posts
  const notifLastReadStr = getLastRead('notifications');
  const notifItems = allAnnouncements.filter(a => a.postedByUserID !== currentUser?.userID);
  let notifHasNew;
  if (!notifLastReadStr) {
    notifHasNew = notifItems.length > 0;
  } else {
    const lastRead = new Date(notifLastReadStr);
    notifHasNew = notifItems.some(a => new Date(a.postedAt) > lastRead);
  }
  const notifDot = document.getElementById('dot-notifications');
  if (notifDot) notifDot.style.display = (notifHasNew && activeTab !== 'notifications') ? '' : 'none';

  // My Announcements tab — new comments from mentees since last visit
  const mineLastReadStr = getLastRead('mine');
  let mineHasNew = false;
  if (latestCommentAt) {
    if (!mineLastReadStr) {
      mineHasNew = true;
    } else {
      mineHasNew = latestCommentAt > new Date(mineLastReadStr);
    }
  }
  const mineDot = document.getElementById('dot-mine');
  if (mineDot) mineDot.style.display = (mineHasNew && activeTab !== 'mine') ? '' : 'none';

  pushSidebarBadge();
}

function pushSidebarBadge() {
  if (typeof updateSidebarAnnBadge === 'function') {
    updateSidebarAnnBadge(0);
  } else {
    const userId = currentUser?.userID;
    if (userId) localStorage.setItem(`ann_sidebar_badge_${userId}`, '0');
  }
}

// ── DEEP LINK (from Dashboard's "Latest from the administration") ─────────────
// ?id=<announcementID> in the URL scrolls to and briefly highlights that one
// card instead of leaving the mentor to hunt for it in the full list.
function scrollToDeepLinkedAnnouncement() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return;

  const card = document.getElementById(`announce-card-${id}`);
  if (!card) return;

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('deep-link-highlight');
  setTimeout(() => card.classList.remove('deep-link-highlight'), 2200);

  // Don't re-trigger the scroll/highlight on a later re-render (e.g. typing
  // in the search box calls applyFilters() -> renderList() again).
  const url = new URL(window.location.href);
  url.searchParams.delete('id');
  window.history.replaceState(null, '', url);
}

// ── TABS ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.ann-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');

  const postBtn = document.querySelector('.btn-post-announce');
  if (postBtn) postBtn.style.display = tab === 'mine' ? '' : 'none';

  document.getElementById('searchInput').value = '';
  markTabRead(tab);
  updateTabDots();
  applyFilters();
}

// ── RENDER ────────────────────────────────────────────────────────────────────
let openKebabId        = null;
let openCommentKebabId = null;

function renderList(items) {
  const container = document.getElementById('announcementsList');

  if (!items.length) {
    const emptyMsg = activeTab === 'mine'
      ? 'No announcements yet. Click <strong>Post Announcement</strong> to add one.'
      : 'No announcements from administration yet.';
    container.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-speakerphone-off"></i>
        <p>${emptyMsg}</p>
      </div>`;
    return;
  }

  const mentorInitials = (
    ((currentUser?.firstName||'')[0]||'') +
    ((currentUser?.lastName||'')[0]||'')
  ).toUpperCase() || 'ME';

  container.innerHTML = items.map(a => {
    const isMine     = a.postedByUserID === currentUser?.userID;
    const rawTitle   = a.title || 'Announcement';
    const secMatch   = isMine ? rawTitle.match(/^\[([^\]]+)\]/) : null;
    const sectionTag = secMatch ? secMatch[1] : null;
    const title      = rawTitle.replace(/^\[[^\]]+\]\s*/, '');
    const content    = a.content || '';


    const date       = new Date(a.postedAt || Date.now())
      .toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

    const fromName     = isMine
      ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 'You'
      : `${a.posterFirstName || ''} ${a.posterLastName || ''}`.trim() || 'Administration';
    const fromInitials = isMine
      ? mentorInitials
      : ((a.posterFirstName?.[0] || '') + (a.posterLastName?.[0] || '')).toUpperCase() || 'AD';

    const sectionBadge = sectionTag
      ? `<span class="ann-badge ann-badge-section">${sectionTag}</span>`
      : '';

    const pinned = !!a.isPinned;
    const kebab = isMine ? `
      <div class="ann-kebab-wrap">
        <button class="ann-kebab-btn" onclick="toggleKebab(event, ${a.announcementID})">
          <i class="ti ti-dots-vertical"></i>
        </button>
        <div class="ann-kebab-menu" id="kebab-${a.announcementID}">
          <button onclick="togglePin(${a.announcementID})">
            <i class="ti ${pinned ? 'ti-pinned-off' : 'ti-pin'}"></i> ${pinned ? 'Unpin' : 'Pin to top'}
          </button>
          <button onclick="openEditModal(${a.announcementID})">
            <i class="ti ti-pencil"></i> Edit
          </button>
          <button class="kebab-danger" onclick="openDeleteAnnounce(${a.announcementID}, '${title.replace(/'/g, "&#39;")}')">
            <i class="ti ti-trash"></i> Delete
          </button>
        </div>
      </div>` : '';

    const commentsSection = `
      <div class="card-comments">
        <button class="class-comments-toggle" id="cctoggle-${a.announcementID}"
          style="display:none" onclick="toggleCommentsList(${a.announcementID})">
          <i class="ti ti-messages"></i>
          <span id="cccount-${a.announcementID}"></span>
        </button>
        <div class="card-comments-list" id="clist-${a.announcementID}" style="display:none"></div>
        <button class="add-comment-trigger" id="ctrigger-${a.announcementID}"
          onclick="expandCommentBar(${a.announcementID})">
          <i class="ti ti-message"></i> Add comment
        </button>
        <div class="add-comment-bar" id="cbar-${a.announcementID}" style="display:none">
          <div class="add-comment-avatar">${mentorInitials}</div>
          <div class="rich-comment-wrap" id="cwrap-${a.announcementID}">
            <div class="add-comment-input" id="cinput-${a.announcementID}"
              contenteditable="true" data-placeholder="Add comment…"
              onfocus="onCommentFocus(${a.announcementID})"
              onblur="onCommentBlur(${a.announcementID})"
              onkeydown="handleCommentKey(event, ${a.announcementID})"></div>
            <div class="comment-format-toolbar" id="ctoolbar-${a.announcementID}">
              <button type="button" class="cfmt-btn" data-cmd="bold" data-tooltip="Bold" aria-label="Bold" onmousedown="event.preventDefault();formatDoc('bold')"><b>B</b></button>
              <button type="button" class="cfmt-btn" data-cmd="italic" data-tooltip="Italic" aria-label="Italic" onmousedown="event.preventDefault();formatDoc('italic')"><i>I</i></button>
              <button type="button" class="cfmt-btn" data-cmd="underline" data-tooltip="Underline" aria-label="Underline" onmousedown="event.preventDefault();formatDoc('underline')"><u>U</u></button>
              <button type="button" class="cfmt-btn" data-cmd="strikeThrough" data-tooltip="Strikethrough" aria-label="Strikethrough" onmousedown="event.preventDefault();formatDoc('strikeThrough')"><s>S</s></button>
              <span class="cfmt-sep"></span>
              <button type="button" class="cfmt-btn" data-cmd="insertUnorderedList" data-tooltip="Bullet list" aria-label="Bullet list" onmousedown="event.preventDefault();formatDoc('insertUnorderedList')"><i class="ti ti-list"></i></button>
            </div>
          </div>
          <button class="btn-send-comment" id="cbtn-${a.announcementID}"
            onmousedown="event.preventDefault()" onclick="postComment(${a.announcementID})">
            <i class="ti ti-send"></i>
          </button>
        </div>
      </div>`;

    return `
      <div class="announce-card ${isMine ? 'announce-card-mine' : 'announce-card-admin'}${pinned ? ' announce-card--pinned' : ''}" id="announce-card-${a.announcementID}">
        ${pinned ? `<div class="ann-pin-banner"><i class="ti ti-pinned"></i> Pinned</div>` : ''}
        <div class="ann-card-top">
          <div class="ann-avatar ${isMine ? 'ann-avatar-teal' : 'ann-avatar-indigo'}">${fromInitials}</div>
          <div class="ann-card-info">
            <div class="ann-card-name">${escapeHtml(fromName)} ${sectionBadge}</div>
            <div class="ann-card-date">${date}</div>
          </div>
          ${kebab}
        </div>
        <div class="announce-title">${escapeHtml(title)}</div>
        <div class="announce-content truncated" id="ann-content-${a.announcementID}">${sanitizeHtml(content)}</div>
        <button type="button" hidden aria-expanded="false" class="btn-see-more" onclick="toggleSeeMore(${a.announcementID}, this)">See more</button>
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

// ── FILTERS ───────────────────────────────────────────────────────────────────
function applyFilters() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();

  let filtered = allAnnouncements;

  if (activeTab === 'notifications') {
    filtered = filtered.filter(a => a.postedByUserID !== currentUser?.userID);
  } else {
    filtered = filtered.filter(a => a.postedByUserID === currentUser?.userID);
  }

  if (q) {
    filtered = filtered.filter(a =>
      (a.title   || '').toLowerCase().includes(q) ||
      (a.content || '').toLowerCase().includes(q)
    );
  }

  filtered = [...filtered].sort((a, b) =>
    (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.postedAt) - new Date(a.postedAt)
  );

  renderList(filtered);
}

async function togglePin(id) {
  try {
    await apiRequest(`Announcements/${id}/pin`, 'PATCH', null, true);
    await loadAnnouncements();
  } catch (e) { console.error('Toggle pin failed:', e); }
}

// ── POST MODAL ────────────────────────────────────────────────────────────────
function populateSectionPicker(selectedValue) {
  const group  = document.getElementById('postSectionGroup');
  const picker = document.getElementById('postSectionPick');

  if (mentorSections.length > 1) {
    picker.innerHTML =
      `<option value="Mentee">All My Mentees</option>` +
      mentorSections
        .filter(s => s !== '—')
        .map(s => `<option value="${s}" ${s === selectedValue ? 'selected' : ''}>${s}</option>`)
        .join('');
    group.style.display = '';
  } else {
    group.style.display = 'none';
  }
}

function openPostModal() {
  editAnnounceId = null;
  pendingAttachFiles = [];
  document.getElementById('postModalTitle').textContent = 'Post Announcement';
  document.getElementById('postTitleInput').value       = '';
  document.getElementById('postContentInput').innerHTML = '';
  populateSectionPicker('Mentee');
  renderAttachList();

  const btn = document.getElementById('submitPostBtn');
  btn.disabled  = false;
  btn.innerHTML = '<i class="ti ti-send"></i> Post';
  document.getElementById('postModal').classList.add('open');
}

function openEditModal(announceId) {
  const a = allAnnouncements.find(x => x.announcementID === announceId);
  if (!a) return;
  editAnnounceId = announceId;
  pendingAttachFiles = [];

  // Parse [SECTION] prefix from title if present
  const secMatch    = (a.title || '').match(/^\[([^\]]+)\]/);
  const storedSec   = secMatch ? secMatch[1] : 'Mentee';
  const displayTitle = (a.title || '').replace(/^\[[^\]]+\]\s*/, '');

  document.getElementById('postModalTitle').textContent = 'Edit Announcement';
  document.getElementById('postTitleInput').value       = displayTitle;
  document.getElementById('postContentInput').innerHTML = a.content || '';
  populateSectionPicker(storedSec);

  const existing = allAttachments.filter(att => att.announcementID === announceId);
  renderAttachList(existing);

  const btn = document.getElementById('submitPostBtn');
  btn.disabled  = false;
  btn.innerHTML = '<i class="ti ti-check"></i> Save Changes';
  document.getElementById('postModal').classList.add('open');
}

function closePostModal(e) {
  if (!e || e.target === document.getElementById('postModal'))
    document.getElementById('postModal').classList.remove('open');
}

function submitPostAnnouncement(e) {
  e.preventDefault();
  const rawTitle = document.getElementById('postTitleInput').value.trim();
  const content  = document.getElementById('postContentInput').innerHTML.trim();
  const errorEl  = document.getElementById('postFormError');

  errorEl.style.display = 'none';
  errorEl.textContent   = '';

  if (!rawTitle) {
    errorEl.textContent = 'Please enter a title.';
    errorEl.style.display = 'block';
    return;
  }
  if (!content || content === '<br>') {
    errorEl.textContent = 'Please enter the announcement content.';
    errorEl.style.display = 'block';
    return;
  }

  const isEdit = !!editAnnounceId;
  document.getElementById('postConfirmTitle').textContent    = isEdit ? 'Update Announcement'   : 'Post Announcement';
  document.getElementById('postConfirmBody').textContent     = isEdit ? 'Are you sure you want to update this announcement?' : 'Are you sure you want to post this announcement?';
  document.getElementById('postConfirmIcon').className       = isEdit ? 'ti ti-check' : 'ti ti-send';
  document.getElementById('postConfirmBtnIcon').className    = isEdit ? 'ti ti-check' : 'ti ti-send';
  document.getElementById('postConfirmBtnText').textContent  = isEdit ? 'Update' : 'Post';
  document.getElementById('postConfirmModal').classList.add('open');
}

function closePostConfirmModal(e) {
  if (!e || e.target === document.getElementById('postConfirmModal'))
    document.getElementById('postConfirmModal').classList.remove('open');
}

async function doSubmitAnnouncement() {
  document.getElementById('postConfirmModal').classList.remove('open');

  const rawTitle  = document.getElementById('postTitleInput').value.trim();
  const content   = document.getElementById('postContentInput').innerHTML.trim();
  const section   = mentorSections.length > 1
    ? document.getElementById('postSectionPick').value
    : 'Mentee';
  const submitBtn = document.getElementById('submitPostBtn');
  const errorEl   = document.getElementById('postFormError');

  const finalTitle = (section && section !== 'Mentee')
    ? `[${section}] ${rawTitle}`
    : rawTitle;

  submitBtn.disabled    = true;
  submitBtn.textContent = editAnnounceId ? 'Saving...' : 'Posting...';

  try {
    let announcementID = editAnnounceId;
    if (editAnnounceId) {
      const existing = allAnnouncements.find(a => a.announcementID === editAnnounceId);
      await apiRequest(`Announcements/${editAnnounceId}`, 'PUT', {
        AnnouncementID: editAnnounceId,
        PostedByUserID: currentUser.userID,
        Title:          finalTitle,
        Content:        content,
        TargetAudience: 'Mentee',
        PostedAt:       existing?.postedAt || new Date().toISOString(),
        IsActive:       true,
      }, true);
    } else {
      const res = await apiRequest('Announcements', 'POST', {
        PostedByUserID: currentUser.userID,
        Title:          finalTitle,
        Content:        content,
        TargetAudience: 'Mentee',
        PostedAt:       new Date().toISOString(),
        IsActive:       true,
      }, true);
      announcementID = res?.announcementID;
    }

    if (pendingAttachFiles.length > 0 && announcementID) {
      for (const file of pendingAttachFiles) {
        const fd = new FormData();
        fd.append('announcementId', announcementID);
        fd.append('file', file);
        await apiRequest('AnnouncementAttachments/upload', 'POST', fd, true);
      }
      pendingAttachFiles = [];
    }

    document.getElementById('postModal').classList.remove('open');
    await loadAnnouncements();
  } catch (err) {
    console.error('Post announcement failed:', err);
    errorEl.textContent   = err.message || 'Something went wrong. Please try again.';
    errorEl.style.display = 'block';
    submitBtn.disabled  = false;
    submitBtn.innerHTML = editAnnounceId
      ? '<i class="ti ti-check"></i> Save Changes'
      : '<i class="ti ti-send"></i> Post';
  }
}

// ── COMMENTS ──────────────────────────────────────────────────────────────────
async function loadCommentsInline(announcementId) {
  const list = document.getElementById(`clist-${announcementId}`);
  if (!list) return;
  try {
    const comments = await apiRequest(
      `AnnouncementComments/announcement/${announcementId}`, 'GET', null, true);
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

  const total   = comments.length;
  const showAll = list.dataset.showAll === 'true';
  const MAX     = 2;
  const visible = showAll ? comments : comments.slice(0, MAX);
  const remaining = total - visible.length;

  if (toggleBtn) {
    toggleBtn.style.display = total > 0 ? '' : 'none';
    if (countSpan) countSpan.textContent = `${total} class comment${total !== 1 ? 's' : ''}`;
  }

  if (!total) { list.innerHTML = ''; return; }

  let html = visible.map(c => renderCommentHtml(c)).join('');
  if (remaining > 0) {
    html += `<button class="btn-view-more-comments" onclick="showAllComments(${announcementId})">
      View ${remaining} more comment${remaining !== 1 ? 's' : ''}
    </button>`;
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
  const initials = (((c.firstName||'')[0]||'') + ((c.lastName||'')[0]||'')).toUpperCase() || '?';
  const name = `${c.firstName||''} ${c.lastName||''}`.trim() || 'User';
  const safeName = name.replace(/'/g, '&#39;');
  const time = new Date(c.postedAt).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  const commentKebab = isMyComment ? `
    <div class="comment-kebab-wrap">
      <button class="comment-kebab-btn" onclick="toggleCommentKebab(event, ${c.commentID})">
        <i class="ti ti-dots-vertical"></i>
      </button>
      <div class="comment-kebab-menu" id="ckebab-${c.commentID}">
        <button onclick="startEditComment(${c.commentID}, ${c.announcementID})">
          <i class="ti ti-pencil"></i> Edit
        </button>
        <button class="ckebab-danger" onclick="openDeleteComment(${c.commentID}, ${c.announcementID})">
          <i class="ti ti-trash"></i> Delete
        </button>
      </div>
    </div>` : '';

  const replyBtn = `
    <button class="comment-reply-btn" data-tooltip="Reply to ${safeName}" aria-label="Reply to ${safeName}" onclick="replyToComment('${safeName}', ${c.announcementID})">
      <i class="ti ti-corner-up-left"></i>
    </button>`;

  const editAndConfirm = isMyComment ? `
    <div class="comment-edit-row" id="cedit-${c.commentID}" style="display:none">
      <div class="comment-edit-input" id="cedit-input-${c.commentID}" contenteditable="true">${sanitizeHtml(c.content)}</div>
      <div class="comment-edit-actions">
        <button class="btn-cedit-cancel" onclick="cancelEditComment(${c.commentID})">Cancel</button>
        <button class="btn-cedit-save" onclick="saveEditComment(${c.commentID}, ${c.announcementID})">Save</button>
      </div>
    </div>` : '';

  return `
    <div class="comment-item" id="citem-${c.commentID}">
      <div class="comment-avatar">${initials}</div>
      <div class="comment-bubble">
        <div class="comment-meta">
          <span class="comment-author">${name}</span>
          <span class="comment-time">${time}</span>
          ${commentKebab}
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
  const editRow = document.getElementById(`cedit-${commentId}`);
  editRow.style.display = '';
  document.getElementById(`cedit-input-${commentId}`).focus();
}

function cancelEditComment(commentId) {
  document.getElementById(`ctext-${commentId}`).style.display = '';
  document.getElementById(`cedit-${commentId}`).style.display = 'none';
}

async function saveEditComment(commentId, announcementId) {
  const input   = document.getElementById(`cedit-input-${commentId}`);
  const content = input?.innerHTML?.trim();
  if (!content || content === '<br>') return;
  try {
    await apiRequest(`AnnouncementComments/${commentId}`, 'PUT', { Content: content }, true);
    await loadCommentsInline(announcementId);
  } catch (e) {
    console.error('Edit comment failed:', e);
  }
}

function openDeleteComment(commentId, announcementId) {
  document.getElementById(`ckebab-${commentId}`)?.classList.remove('open');
  openCommentKebabId = null;
  deleteCommentId = commentId;
  deleteCommentAnnouncementId = announcementId;
  document.getElementById('deleteCommentModal').classList.add('open');
}

function closeDeleteCommentModal(e) {
  if (!e || e.target === document.getElementById('deleteCommentModal'))
    document.getElementById('deleteCommentModal').classList.remove('open');
}

async function confirmDeleteComment() {
  if (!deleteCommentId) return;
  document.getElementById('deleteCommentModal').classList.remove('open');
  try {
    await apiRequest(`AnnouncementComments/${deleteCommentId}`, 'DELETE', null, true);
    await loadCommentsInline(deleteCommentAnnouncementId);
  } catch (e) {
    console.error('Delete comment failed:', e);
  }
  deleteCommentId = null;
  deleteCommentAnnouncementId = null;
}

// ── ATTACHMENT HELPERS ────────────────────────────────────────
function triggerAttachFile() {
  document.getElementById('attachFileInput').value = '';
  document.getElementById('attachFileInput').click();
}

function handleAttachFiles(e) {
  const existing = editAnnounceId ? allAttachments.filter(a => a.announcementID === editAnnounceId) : [];
  const room     = MAX_ATTACHMENTS - existing.length - pendingAttachFiles.length;
  const files    = Array.from(e.target.files || []);

  if (room <= 0) {
    showToast(`Maximum ${MAX_ATTACHMENTS} attachments per post.`);
    return;
  }
  if (files.length > room) {
    showToast(`Only ${room} more file${room === 1 ? '' : 's'} added — maximum ${MAX_ATTACHMENTS} attachments per post.`);
  }
  pendingAttachFiles.push(...files.slice(0, room));
  renderAttachList(existing);
}

function removeAttach(index) {
  pendingAttachFiles.splice(index, 1);
  renderAttachList(editAnnounceId ? allAttachments.filter(a => a.announcementID === editAnnounceId) : []);
}

function deleteExistingAttach(attachmentID) {
  deleteAttachId = attachmentID;
  document.getElementById('deleteAttachModal').classList.add('open');
}

function closeDeleteAttachModal(e) {
  if (!e || e.target === document.getElementById('deleteAttachModal'))
    document.getElementById('deleteAttachModal').classList.remove('open');
}

async function confirmDeleteAttach() {
  if (!deleteAttachId) return;
  document.getElementById('deleteAttachModal').classList.remove('open');
  await doDeleteExistingAttach(deleteAttachId);
  deleteAttachId = null;
}

async function doDeleteExistingAttach(attachmentID) {
  try {
    await apiRequest(`AnnouncementAttachments/${attachmentID}`, 'DELETE', null, true);
    allAttachments = allAttachments.filter(a => a.attachmentID !== attachmentID);
    const existing = editAnnounceId ? allAttachments.filter(a => a.announcementID === editAnnounceId) : [];
    renderAttachList(existing);
  } catch (e) { console.error('Delete attachment failed', e); }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
    background: #111827; color: #fff; padding: 12px 24px;
    border-radius: 8px; font-size: 14px; font-weight: 500;
    z-index: 99999; opacity: 0; transition: opacity 0.3s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2); white-space: nowrap;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.style.opacity = '1', 10);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
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

function updateFormatButtons(wrap) {
  if (!wrap) return;
  wrap.querySelectorAll('[data-cmd]').forEach(btn => {
    try {
      btn.classList.toggle('fmt-active', document.queryCommandState(btn.dataset.cmd));
    } catch (e) {}
  });
}

function formatDoc(command) {
  document.execCommand(command, false, null);
  const focused = document.activeElement;
  if (focused?.hasAttribute('contenteditable')) {
    updateFormatButtons(focused.closest('.gc-editor-wrap, .rich-comment-wrap'));
  }
}

document.addEventListener('selectionchange', () => {
  const focused = document.activeElement;
  if (!focused?.hasAttribute('contenteditable')) return;
  updateFormatButtons(focused.closest('.gc-editor-wrap, .rich-comment-wrap'));
});

function expandCommentBar(annId) {
  const trigger = document.getElementById(`ctrigger-${annId}`);
  const bar     = document.getElementById(`cbar-${annId}`);
  if (trigger) trigger.style.display = 'none';
  if (bar)     bar.style.display = 'flex';
  document.getElementById(`cinput-${annId}`)?.focus();
}

function onCommentFocus(annId) {
  document.getElementById(`cwrap-${annId}`)?.classList.add('toolbar-visible');
}

function onCommentBlur(annId) {
  setTimeout(() => {
    const wrap    = document.getElementById(`cwrap-${annId}`);
    const input   = document.getElementById(`cinput-${annId}`);
    const bar     = document.getElementById(`cbar-${annId}`);
    const trigger = document.getElementById(`ctrigger-${annId}`);
    if (!wrap) return;
    if (wrap.contains(document.activeElement)) return;
    wrap.classList.remove('toolbar-visible');
    const content = input?.innerHTML?.trim();
    if (!content || content === '<br>') {
      if (bar)     bar.style.display = 'none';
      if (trigger) trigger.style.display = '';
    }
  }, 150);
}

function toggleCommentsList(announcementId) {
  const list = document.getElementById(`clist-${announcementId}`);
  if (!list) return;
  list.style.display = list.style.display === 'none' ? '' : 'none';
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
  // Auto-open comment list so they can see context
  const list = document.getElementById(`clist-${announcementId}`);
  if (list) list.style.display = '';
}

async function postComment(announcementId) {
  const input   = document.getElementById(`cinput-${announcementId}`);
  const raw     = input?.innerHTML || '';
  const content = raw.trim();
  if (!content || content === '<br>') return;

  const btn = document.getElementById(`cbtn-${announcementId}`);
  if (btn) btn.disabled = true;

  try {
    await apiRequest('AnnouncementComments', 'POST', {
      AnnouncementID: announcementId,
      PostedByUserID: currentUser.userID,
      Content:        content,
    }, true);
    input.innerHTML = '';
    document.getElementById(`cwrap-${announcementId}`)?.classList.remove('toolbar-visible');
    document.getElementById(`cbar-${announcementId}`).style.display = 'none';
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

// ── DELETE ────────────────────────────────────────────────────────────────────
function openDeleteAnnounce(announceId, title) {
  deleteAnnounceId = announceId;
  document.getElementById('deleteAnnounceTitle').textContent = title;
  const btn = document.getElementById('confirmDeleteAnnounceBtn');
  btn.disabled  = false;
  btn.innerHTML = '<i class="ti ti-trash"></i> Delete';
  document.getElementById('deleteAnnounceModal').classList.add('open');
}

function closeDeleteAnnounce(e) {
  if (!e || e.target === document.getElementById('deleteAnnounceModal'))
    document.getElementById('deleteAnnounceModal').classList.remove('open');
}

async function confirmDeleteAnnounce() {
  if (!deleteAnnounceId) return;
  const btn = document.getElementById('confirmDeleteAnnounceBtn');
  btn.disabled    = true;
  btn.textContent = 'Deleting...';

  try {
    await apiRequest(`Announcements/${deleteAnnounceId}`, 'DELETE', null, true);
    document.getElementById('deleteAnnounceModal').classList.remove('open');
    await loadAnnouncements();
  } catch (err) {
    console.error('Delete announcement failed:', err);
    btn.disabled  = false;
    btn.innerHTML = '<i class="ti ti-trash"></i> Delete';
  }
}
