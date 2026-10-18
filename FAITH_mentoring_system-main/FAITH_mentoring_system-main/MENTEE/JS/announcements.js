let submissionStatusAvailable = false;
/* ============================================================
   ASTRA MENTEE — announcements.js
   ============================================================ */

let allAnnouncements   = [];
let allEvaluations     = [];
let allAttachments     = [];
let adminNameMap       = {};
let currentUser        = null;
let menteeSection      = null;
let mentorUserId       = null;
let mentorName         = 'My Mentor';
let allMentorIds       = new Set();
let activeTab          = 'admin';
let openCommentKebabId = null;
// linkID -> proof screenshot path (the mentee's own upload) — a Map instead
// of a plain Set of submitted IDs so the card can offer "View" on what was
// actually uploaded, not just a Submitted badge.
let myProofPaths       = new Map();
let pendingUnmarkLinkId = null;
let deleteCommentId = null;
let deleteCommentAnnouncementId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentee');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  currentUser = getSession().user;

  // Sequential — announcements must know mentorUserId before filtering
  await loadMenteeInfo();
  await loadAnnouncements();

  document.getElementById('searchInput').addEventListener('input', applyFilters);

  document.addEventListener('click', () => {
    if (openCommentKebabId) {
      document.getElementById(`ckebab-${openCommentKebabId}`)?.classList.remove('open');
      openCommentKebabId = null;
    }
  });
});

// ── LOAD ──────────────────────────────────────────────────────────────────────
async function loadMenteeInfo() {
  try {
    const [assignments, menteesWithDept, mentorsWithDept] = await Promise.all([
      apiRequest('Users/assignments',     'GET', null, true),
      apiRequest('Users/mentees-with-dept','GET', null, true),
      apiRequest('Users/mentors-with-dept','GET', null, true),
    ]);

    const myInfo = (menteesWithDept || []).find(m => m.userID === currentUser?.userID);
    menteeSection = myInfo?.sectionCode || myInfo?.section || null;

    allMentorIds = new Set((mentorsWithDept || []).map(m => m.userID).filter(Boolean));

    const myAssignment = (assignments || []).find(a => a.menteeUserID === currentUser?.userID);
    mentorUserId = myAssignment?.mentorUserID || null;

    if (mentorUserId) {
      const mentor = (mentorsWithDept || []).find(m => m.userID === mentorUserId);
      if (mentor) {
        mentorName = `${mentor.firstName || ''} ${mentor.lastName || ''}`.trim() || 'My Mentor';
      }
    }
  } catch (e) { /* non-critical */ }
}

async function loadAnnouncements() {
  try {
    const [annResult, evalResult, attachResult, evalAttachResult, mySubsResult] = await Promise.allSettled([
      apiRequest('Announcements',           'GET', null, true),
      apiRequest('EvaluationLinks',         'GET', null, true),
      apiRequest('AnnouncementAttachments', 'GET', null, true),
      apiRequest('EvaluationAttachments',   'GET', null, true),
      apiRequest('EvaluationSubmissions/mine', 'GET', null, true),
    ]);
    if (annResult.status === 'rejected') throw annResult.reason;
    const items      = annResult.value;
    const evalLinks  = evalResult.status === 'fulfilled'      ? evalResult.value      : [];
    const annAtts    = attachResult.status === 'fulfilled'    ? attachResult.value    : [];
    const evalAtts   = evalAttachResult.status === 'fulfilled' ? evalAttachResult.value : [];
    allAttachments   = [...annAtts, ...evalAtts];
    submissionStatusAvailable = mySubsResult.status === 'fulfilled' && Array.isArray(mySubsResult.value);
    const mySubs     = mySubsResult.status === 'fulfilled' ? (mySubsResult.value || []) : [];
    myProofPaths     = new Map(mySubs.map(s => [s.linkID, s.proofFilePath || null]));

    allAnnouncements = (items || [])
      .filter(a => {
        if (!a.isActive) return false;
        if (a.postedByUserID === mentorUserId) {
          const secMatch = (a.title || '').match(/^\[([^\]]+)\]/);
          if (!secMatch) return true;
          return menteeSection && secMatch[1] === menteeSection;
        }
        // Exclude posts from other mentors
        if (allMentorIds.has(a.postedByUserID)) return false;
        const ta = (a.targetAudience || '').toLowerCase();
        return ta === 'both' || ta === 'mentee';
      })
      .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

    allEvaluations = (evalLinks || [])
      .filter(e => {
        if (!e.isActive) return false;
        const role = (e.targetRole || '').toLowerCase();
        return role === 'mentee' || role === 'both';
      })
      .map(e => ({ ...e, _type: 'evaluation', content: e.description || '' }))
      .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

    const adminCount  = allAnnouncements.filter(a => a.postedByUserID !== mentorUserId).length;
    const mentorCount = allAnnouncements.filter(a => a.postedByUserID === mentorUserId).length;
    const evalCount   = allEvaluations.length;
    document.getElementById('announceSubtitle').textContent = evalCount > 0
      ? `${adminCount} from admin · ${evalCount} evaluation${evalCount !== 1 ? 's' : ''} · ${mentorCount} from your mentor`
      : `${adminCount} from admin · ${mentorCount} from your mentor`;

    // Fetch real names for admin posters (includes evaluation posters)
    const annAdminIds  = allAnnouncements
      .filter(a => a.postedByUserID !== mentorUserId)
      .map(a => a.postedByUserID)
      .filter(Boolean);
    const evalAdminIds = allEvaluations.map(e => e.postedByUserID).filter(Boolean);
    const adminIds = [...new Set([...annAdminIds, ...evalAdminIds])];
    adminNameMap = {};
    if (adminIds.length) {
      const results = await Promise.allSettled(
        adminIds.map(id => apiRequest(`Users/${id}`, 'GET', null, true))
      );
      adminIds.forEach((id, i) => {
        if (results[i].status === 'fulfilled') {
          const u = results[i].value;
          adminNameMap[id] = `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || 'Administrator';
        }
      });
    }

    markTabRead(activeTab);
    updateTabDots();
    applyFilters();
    scrollToDeepLinkedAnnouncement();
  } catch (e) {
    document.getElementById('announcementsList').innerHTML =
      '<div class="list-skeleton">Failed to load announcements. Please refresh.</div>';
  }
}

// ── DEEP LINK (from Dashboard's Announcements widget) ─────────────────────────
// ?id=<announcementID> in the URL scrolls to and briefly highlights that one
// card instead of leaving the mentee to hunt for it — switching tabs first
// if the post is the mentor's own (Dashboard mixes both sources together,
// but this page splits them into "Admin"/"Mentor" tabs).
function scrollToDeepLinkedAnnouncement() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return;

  const idNum      = Number(id);
  const isFromMine = allAnnouncements.some(a => a.announcementID === idNum && a.postedByUserID === mentorUserId);
  if (isFromMine && activeTab !== 'mentor') switchTab('mentor');

  const card = document.getElementById(`announce-card-${id}`);
  if (!card) return;

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('deep-link-highlight');
  setTimeout(() => card.classList.remove('deep-link-highlight'), 2200);

  const url = new URL(window.location.href);
  url.searchParams.delete('id');
  window.history.replaceState(null, '', url);
}

// ── TABS ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.ann-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById('searchInput').value = '';
  markTabRead(tab);
  updateTabDots();
  applyFilters();
}

// ── UNREAD DOT TRACKING ───────────────────────────────────────────────────────
const nowLocalIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, -1); };

function getLastRead(tab) {
  return localStorage.getItem(`ann_lastRead_${tab}_${currentUser?.userID}`);
}

function markTabRead(tab) {
  localStorage.setItem(`ann_lastRead_${tab}_${currentUser?.userID}`, nowLocalIso());
}

function updateTabDots() {
  ['admin', 'mentor'].forEach(tab => {
    const lastReadStr = getLastRead(tab);
    const items = tab === 'admin'
      ? [...allAnnouncements.filter(a => a.postedByUserID !== mentorUserId), ...allEvaluations]
      : allAnnouncements.filter(a => a.postedByUserID === mentorUserId);

    let hasNew;
    if (!lastReadStr) {
      hasNew = items.length > 0;
    } else {
      const lastRead = new Date(lastReadStr);
      hasNew = items.some(a => a.postedAt && new Date(a.postedAt) > lastRead);
    }

    const dot = document.getElementById(`dot-${tab}`);
    if (dot) dot.style.display = (hasNew && tab !== activeTab) ? '' : 'none';
  });

  pushSidebarBadge();
}

function pushSidebarBadge() {
  // User is on the announcements page — suppress the badge
  if (typeof updateSidebarAnnBadge === 'function') {
    updateSidebarAnnBadge(0);
  } else {
    const userId = currentUser?.userID;
    if (userId) localStorage.setItem(`ann_sidebar_badge_${userId}`, '0');
  }
}

// ── FILTERS ───────────────────────────────────────────────────────────────────
function applyFilters() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();

  let filtered;
  if (activeTab === 'admin') {
    let adminAnns = allAnnouncements.filter(a => a.postedByUserID !== mentorUserId);
    let evals     = allEvaluations.slice();
    if (q) {
      adminAnns = adminAnns.filter(a =>
        (a.title   || '').toLowerCase().includes(q) ||
        (a.content || '').toLowerCase().includes(q)
      );
      evals = evals.filter(e =>
        (e.title   || '').toLowerCase().includes(q) ||
        (e.content || '').toLowerCase().includes(q)
      );
    }
    filtered = [...adminAnns, ...evals].sort((a, b) =>
      (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.postedAt) - new Date(a.postedAt)
    );
  } else {
    filtered = allAnnouncements.filter(a => a.postedByUserID === mentorUserId);
    if (q) {
      filtered = filtered.filter(a =>
        (a.title   || '').toLowerCase().includes(q) ||
        (a.content || '').toLowerCase().includes(q)
      );
    }
    filtered = [...filtered].sort((a, b) =>
      (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.postedAt) - new Date(a.postedAt)
    );
  }

  renderList(filtered);
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderList(items) {
  const container = document.getElementById('announcementsList');

  if (!items.length) {
    const msg = activeTab === 'admin'
      ? 'No administration announcements yet.'
      : 'No announcements from your mentor yet.';
    container.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-speakerphone-off"></i>
        <p>${msg}</p>
      </div>`;
    return;
  }

  const menteeInitials = (
    ((currentUser?.firstName||'')[0]||'') +
    ((currentUser?.lastName||'')[0]||'')
  ).toUpperCase() || 'ME';

  container.innerHTML = items.map(a => {
    if (a._type === 'evaluation') return renderEvaluationCard(a);
    const isMentor   = a.postedByUserID === mentorUserId;
    // Not "everyone but the mentor is Administrator" — Head Admin's
    // posts get their own label instead of being folded into Admin's.
    const isHead     = !isMentor && (a.posterRole || '').toLowerCase() === 'head';
    const rawTitle   = a.title || 'Announcement';
    const secMatch   = isMentor ? rawTitle.match(/^\[([^\]]+)\]/) : null;
    const sectionTag = secMatch ? secMatch[1] : null;
    const title      = rawTitle.replace(/^\[[^\]]+\]\s*/, '');
    const content    = a.content || '';


    const date       = new Date(a.postedAt || Date.now())
      .toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

    const fromName     = isMentor ? mentorName : (adminNameMap[a.postedByUserID] || 'Administrator');
    const fromInitials = fromName
      .split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || (isMentor ? 'MT' : 'AD');

    const sectionBadge = sectionTag
      ? `<span class="ann-badge ann-badge-section">${sectionTag}</span>`
      : '';

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
          <div class="add-comment-avatar">${menteeInitials}</div>
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

    const pinned = !!a.isPinned;
    const roleClass = isMentor ? 'role-mentor' : isHead ? 'role-head' : 'role-admin';
    const roleLabel = isMentor ? 'Mentor' : isHead ? 'Head Admin' : 'Administrator';
    return `
      <div class="announce-card ${isMentor ? 'announce-card-mentor' : 'announce-card-admin'}${pinned ? ' announce-card--pinned' : ''}" id="announce-card-${a.announcementID}">
        ${pinned ? `<div class="ann-pin-banner"><i class="ti ti-pinned"></i> Pinned</div>` : ''}
        <div class="ann-card-top">
          <div class="ann-avatar ${isMentor ? 'ann-avatar-teal' : 'ann-avatar-indigo'}">${fromInitials}</div>
          <div class="ann-card-info">
            <div class="ann-card-name">
              ${escapeHtml(fromName)}
              <span class="ann-role-badge ${roleClass}">${roleLabel}</span>
              ${sectionBadge}
            </div>
            <div class="ann-card-date">${date}</div>
          </div>
        </div>
        <div class="announce-title">${escapeHtml(title)}</div>
        <div class="announce-content truncated" id="ann-content-${a.announcementID}">${sanitizeHtml(content)}</div>
        <button type="button" hidden aria-expanded="false" class="btn-see-more" onclick="toggleSeeMore(${a.announcementID}, this)">See more</button>
        ${renderAttachmentSection(a.announcementID)}
        ${commentsSection}
      </div>`;
  }).join('');

  items.filter(a => a._type !== 'evaluation').forEach(a => loadCommentsInline(a.announcementID));
}

// ── EVALUATION SUBMISSION (proof screenshot) ─────────────────────────────────
// Uploading the screenshot IS the submit action — no separate confirm step.
async function uploadEvalProofFull(linkId, inputEl) {
  if (!submissionStatusAvailable) return;
  const file = inputEl.files?.[0];
  if (!file) return;
  const errEl = document.getElementById(`eval-upload-err-${linkId}`);
  if (errEl) errEl.textContent = '';

  if (validateUploadFile(file, 'EvaluationSubmissions/upload')) {
    if (errEl) errEl.textContent = validateUploadFile(file, 'EvaluationSubmissions/upload');
    inputEl.value = '';
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    if (errEl) errEl.textContent = 'File is too large. Maximum size is 20 MB.';
    inputEl.value = '';
    return;
  }

  const label = inputEl.closest('.eval-upload-label');
  label?.classList.add('is-uploading');
  try {
    const fd = new FormData();
    fd.append('linkId', linkId);
    fd.append('file', file);
    const res = await apiRequest('EvaluationSubmissions/upload', 'POST', fd, true);
    myProofPaths.set(linkId, res?.proofFilePath || null);
    applyFilters();
  } catch (e) {
    console.error('Proof upload failed:', e);
    if (errEl) errEl.textContent = e.message || 'Upload failed. Please try again.';
    label?.classList.remove('is-uploading');
    inputEl.value = '';
  }
}

function unmarkEvalSubmitted(linkId) {
  pendingUnmarkLinkId = linkId;
  document.getElementById('undoEvalModal').classList.add('open');
}

function closeUndoEvalModal(e) {
  if (!e || e.target === document.getElementById('undoEvalModal')) {
    document.getElementById('undoEvalModal').classList.remove('open');
    pendingUnmarkLinkId = null;
  }
}

async function doUnmarkEvalSubmitted(linkId) {
  document.getElementById('undoEvalModal').classList.remove('open');
  pendingUnmarkLinkId = null;

  const prevProof = myProofPaths.get(linkId);
  myProofPaths.delete(linkId);
  applyFilters();
  try {
    await apiRequest(`EvaluationSubmissions/${linkId}`, 'DELETE', null, true);
  } catch (e) {
    console.error('Unmark submitted failed:', e);
    myProofPaths.set(linkId, prevProof);
    applyFilters();
  }
}

function toggleSeeMore(id, btn) {
  const el = document.getElementById(`ann-content-${id}`);
  el.classList.toggle('truncated');
  const expanded = !el.classList.contains('truncated');
  btn.textContent = expanded ? 'See less' : 'See more';
  btn.setAttribute('aria-expanded', String(expanded));
}

function renderEvaluationCard(e) {
  const fromName     = e.postedByName || adminNameMap[e.postedByUserID] || 'Name unavailable';
  const fromInitials = fromName
    .split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'AD';
  const title        = e.title || 'Evaluation';
  const description  = e.description || '';
  const date         = new Date(e.postedAt || Date.now())
    .toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  const uniqueId     = `eval-${e.linkID}`;



  const now    = new Date();
  const dlEOD = evaluationDeadline(e.deadline);
  const isPast = dlEOD ? dlEOD <= now : false;
  let deadlineHtml = '';
  if (e.deadline) {
    const isSoon = !isPast && (dlEOD - now) < 3 * 24 * 60 * 60 * 1000;
    const dlStr = evaluationDeadlineLabel(e.deadline);
    const cls    = isPast ? 'eval-deadline eval-deadline-past'
                 : isSoon ? 'eval-deadline eval-deadline-soon'
                 : 'eval-deadline';
    deadlineHtml = `<span class="${cls}"><i class="ti ti-clock"></i> Due ${dlStr}${isPast ? ' · Overdue' : ''}</span>`;
  }

  const attachSection = renderEvalAttachSection(e.linkID);
  const pinned = !!e.isPinned;

  // The real answers live entirely on Google Forms (this system has no API
  // access to them) — a proof screenshot is the best verification available,
  // uploading it IS the submit action, no separate confirm step.
  const submitted   = myProofPaths.has(e.linkID);
  const proofPath   = myProofPaths.get(e.linkID);
  const submitHtml  = !submissionStatusAvailable
    ? '<span role="status">Submission status unavailable.</span><button type="button" class="eval-mark-btn" onclick="loadAnnouncements()">Retry</button>'
    : submitted
    ? `<span class="eval-submitted-badge"><i class="ti ti-check"></i> Submitted</span>
       ${proofPath ? `<a class="eval-view-proof-link" href="${CONFIG.getFileUrl(proofPath)}" target="_blank" rel="noopener">View</a>` : ''}
       <button type="button" class="eval-unmark-btn" onclick="unmarkEvalSubmitted(${e.linkID})">Undo</button>`
    : `<label class="eval-mark-btn eval-upload-label">
         <i class="ti ti-upload"></i> Upload proof screenshot
         <input type="file" accept="image/*" hidden onchange="uploadEvalProofFull(${e.linkID}, this)">
       </label>
       <div class="eval-upload-error" id="eval-upload-err-${e.linkID}"></div>`;

  return `
    <div class="announce-card announce-card-evaluation${pinned ? ' announce-card--pinned' : ''}" id="announce-card-${uniqueId}">
      ${pinned ? `<div class="ann-pin-banner"><i class="ti ti-pinned"></i> Pinned</div>` : ''}
      <div class="ann-card-top">
        <div class="ann-avatar ann-avatar-amber">${fromInitials}</div>
        <div class="ann-card-info">
          <div class="ann-card-name">
            <span class="evaluation-author"><strong>${escapeHtml(fromName)}</strong></span>
            <span class="ann-role-badge role-admin">Administrator</span>
            <span class="ann-badge ann-badge-evaluation"><i class="ti ti-clipboard-check"></i> Evaluation</span>
          </div>
          <div class="ann-card-date">${date}</div>
        </div>
      </div>
      <div class="announce-title">${escapeHtml(title)}</div>
      ${description ? `
        <div class="announce-content truncated" id="ann-content-${uniqueId}">${sanitizeHtml(description)}</div>
        <button type="button" hidden aria-expanded="false" class="btn-see-more" onclick="toggleSeeMore('${uniqueId}', this)">See more</button>
      ` : ''}
      ${attachSection}
      <div class="eval-footer">
        ${deadlineHtml}
        ${isPast ? '<span class="eval-deadline-note">You can still upload proof after the deadline.</span>' : ''}
        <div class="eval-footer-actions">
          ${submitHtml}
          ${isPast
            ? `<span class="btn-open-form btn-open-form-closed">Open Form</span>`
            : `<a href="${escapeHtml(e.googleFormURL)}" target="_blank" rel="noopener noreferrer" class="btn-open-form"><i class="ti ti-external-link"></i> Open Form</a>`
          }
        </div>
      </div>
    </div>`;
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

  const total     = comments.length;
  const showAll   = list.dataset.showAll === 'true';
  const MAX       = 2;
  const visible   = showAll ? comments : comments.slice(0, MAX);
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
  const name     = `${c.firstName||''} ${c.lastName||''}`.trim() || 'User';
  const safeName = name.replace(/'/g, '&#39;');
  const time     = new Date(c.postedAt).toLocaleString('en-PH', {
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
    <button class="comment-reply-btn" data-tooltip="Reply to ${safeName}" aria-label="Reply to ${safeName}"
      onclick="replyToComment('${safeName}', ${c.announcementID})">
      <i class="ti ti-corner-up-left"></i>
    </button>`;

  const editAndConfirm = isMyComment ? `
    <div class="comment-edit-row" id="cedit-${c.commentID}" style="display:none">
      <div class="comment-edit-input" id="cedit-input-${c.commentID}" contenteditable="true">${sanitizeHtml(c.content)}</div>
      <div class="comment-edit-actions">
        <button class="btn-cedit-cancel" onclick="cancelEditComment(${c.commentID})">Cancel</button>
        <button class="btn-cedit-save"   onclick="saveEditComment(${c.commentID}, ${c.announcementID})">Save</button>
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

function toggleCommentsList(announcementId) {
  const list = document.getElementById(`clist-${announcementId}`);
  if (!list) return;
  list.style.display = list.style.display === 'none' ? '' : 'none';
}

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
    document.getElementById(`cbar-${announcementId}`).style.display     = 'none';
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
  if (!e || e.target === document.getElementById('deleteCommentModal')) {
    document.getElementById('deleteCommentModal').classList.remove('open');
    deleteCommentId = null;
    deleteCommentAnnouncementId = null;
  }
}

async function confirmDeleteComment() {
  const commentId      = deleteCommentId;
  const announcementId = deleteCommentAnnouncementId;
  document.getElementById('deleteCommentModal').classList.remove('open');
  deleteCommentId = null;
  deleteCommentAnnouncementId = null;
  if (!commentId) return;

  try {
    await apiRequest(`AnnouncementComments/${commentId}`, 'DELETE', null, true);
    await loadCommentsInline(announcementId);
  } catch (e) {
    console.error('Delete comment failed:', e);
  }
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────
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
    updateFormatButtons(focused.closest('.rich-comment-wrap'));
  }
}

document.addEventListener('selectionchange', () => {
  const focused = document.activeElement;
  if (!focused?.hasAttribute('contenteditable')) return;
  updateFormatButtons(focused.closest('.rich-comment-wrap'));
});

// ── ATTACHMENTS ───────────────────────────────────────────────────────────────
function fileUrl(path) {
  return CONFIG.API_BASE_URL.replace('/api', '') + path;
}

function renderEvalAttachSection(linkID) {
  const atts = allAttachments.filter(a => a.linkID === linkID);
  if (!atts.length) return '';
  const items = atts.map(a => `
    <div class="attach-item--card">
      <a class="attach-item--card-link" href="${fileUrl(a.filePath)}" target="_blank" rel="noopener">
        <i class="ti ${attachIcon(a.fileName)} attach-icon"></i>
        <span class="attach-name">${escapeHtml(a.fileName)}</span>
        <span class="attach-size">${formatFileSize(a.fileSize)}</span>
      </a>
      <button class="attach-download" title="Download" onclick="downloadEvalAttach(${a.attachmentID})">
        <i class="ti ti-download"></i>
      </button>
    </div>`).join('');
  return `<div class="attach-list attach-list--card">${items}</div>`;
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

function downloadEvalAttach(attachmentId) {
  window.open(`${CONFIG.API_BASE_URL}/EvaluationAttachments/${attachmentId}/download`, '_blank');
}

function attachIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return 'ti-photo';
  if (['pdf'].includes(ext)) return 'ti-file-type-pdf';
  if (['doc','docx'].includes(ext)) return 'ti-file-type-doc';
  if (['xls','xlsx'].includes(ext)) return 'ti-file-spreadsheet';
  if (['ppt','pptx'].includes(ext)) return 'ti-presentation';
  if (['zip','rar','7z'].includes(ext)) return 'ti-file-zip';
  return 'ti-paperclip';
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
