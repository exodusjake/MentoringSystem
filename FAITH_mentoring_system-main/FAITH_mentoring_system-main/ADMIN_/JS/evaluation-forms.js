// ===== EVALUATION FORMS JS =====

let allForms         = [];
let allEvalAttach    = [];
let pendingAttachFiles = [];
const MAX_ATTACHMENTS  = 5;
let editingId        = null;
let openKebabId      = null;
let submissionSummary = {}; // { [linkID]: { submittedCount, totalMentees } }

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  loadForms();

  document.getElementById('createFormBtn').addEventListener('click', openCreate);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', saveForm);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  document.addEventListener('click', () => {
    if (openKebabId) {
      document.getElementById(`kebab-${openKebabId}`)?.classList.remove('open');
      openKebabId = null;
    }
  });
});

// ── LOAD ──────────────────────────────────────────────────────
async function loadForms() {
  try {
    const [formsData, attachData, summaryData] = await Promise.allSettled([
      apiRequest('EvaluationLinks',            'GET', null, true),
      apiRequest('EvaluationAttachments',      'GET', null, true),
      apiRequest('EvaluationSubmissions/summary', 'GET', null, true),
    ]);
    allForms      = formsData.status === 'fulfilled'  ? (formsData.value  || []) : [];
    allEvalAttach = attachData.status === 'fulfilled' ? (attachData.value || []) : [];
    submissionSummary = {};
    if (summaryData.status === 'fulfilled') {
      (summaryData.value || []).forEach(s => { submissionSummary[s.linkID] = s; });
    }
    renderForms();
  } catch (e) {
    console.error('Error loading evaluation forms:', e);
    showErrorModal('Failed to load evaluation forms. Please refresh.');
  }
}

// ── RENDER ────────────────────────────────────────────────────
function renderForms() {
  const list    = document.getElementById('formsList');
  const countEl = document.getElementById('evalCount');

  const sorted = [...allForms].sort((a, b) => {
    const pinA = a.isPinned ? 1 : 0;
    const pinB = b.isPinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    const dA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const dB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    if (dA !== dB) return dB - dA;
    return (b.linkID || 0) - (a.linkID || 0);
  });

  if (countEl) countEl.textContent = `${sorted.length} result${sorted.length !== 1 ? 's' : ''}`;

  if (!sorted.length) {
    list.innerHTML = `
      <div class="eval-empty">
        <i class="ti ti-clipboard-off"></i>
        <p>No evaluation forms yet. Click <strong>Add Evaluation Form</strong> to get started.</p>
      </div>`;
    return;
  }

  const now   = new Date();
  const myId  = getSession()?.user?.UserID || getSession()?.user?.userID || 0;

  list.innerHTML = sorted.map(f => {
    const pinned      = !!f.isPinned;
    // Pin/Edit/Delete are owner-only server-side (EvaluationLinksController.
    // CanModifyAsync) — with multiple Admin accounts able to post here, hide
    // the kebab menu entirely for a link you didn't post, same principle
    // already used on the Announcements page.
    const isMine       = f.postedByUserID === myId;
    const postedDate  = f.postedAt
      ? new Date(f.postedAt).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })
      : '—';
    const deadlineDate = evaluationDeadline(f.deadline);
    const isPast = deadlineDate && deadlineDate <= now;
    const isSoon = deadlineDate && !isPast && (deadlineDate - now) < 3 * 24 * 60 * 60 * 1000;
    const deadlineStr = evaluationDeadlineLabel(f.deadline);

    const description = f.description || '';

    const deadlineTag = deadlineStr ? `
      <span class="eval-deadline-badge ${isPast ? 'past' : isSoon ? 'soon' : ''}">
        <i class="ti ti-clock"></i> Due ${deadlineStr}${isPast ? ' · Overdue' : ''}
      </span>` : '';

    // Count of mentees who've uploaded a proof screenshot (this system has
    // no API access to actual Google Form responses, so a screenshot is the
    // best verification available — not machine-checked, but no longer a
    // bare unverified click either).
    const sub = submissionSummary[f.linkID] || { submittedCount: 0, totalMentees: 0 };
    const submitBadge = `
      <button type="button" class="eval-submit-count-btn" onclick="openSubmissionDetail(${f.linkID})" title="View who has marked this as submitted">
        <i class="ti ti-users"></i> ${sub.submittedCount} / ${sub.totalMentees} submitted
      </button>`;

    return `
      <div class="announce-card announce-card--eval${pinned ? ' announce-card--pinned' : ''}">
        ${pinned ? `<div class="ann-pin-banner"><i class="ti ti-pinned"></i> Pinned</div>` : ''}
        <div class="ann-card-top">
          <div class="ann-avatar ann-avatar-amber"><i class="ti ti-clipboard-check"></i></div>
          <div class="ann-card-info">
            <div class="ann-card-name evaluation-author"><strong>${escapeHtml(f.postedByName || 'Name unavailable')}</strong></div>
            <div class="ann-card-date">${postedDate}</div>
          </div>
          ${deadlineTag}
          <div class="ann-kebab-wrap">
            ${isMine ? `
            <button class="ann-kebab-btn" onclick="toggleKebab(event,${f.linkID})">
              <i class="ti ti-dots-vertical"></i>
            </button>
            <div class="ann-kebab-menu" id="kebab-${f.linkID}">
              <button class="kebab-pin${pinned ? ' active' : ''}" onclick="togglePin(${f.linkID})">
                <i class="ti ${pinned ? 'ti-pinned-off' : 'ti-pin'}"></i> ${pinned ? 'Unpin' : 'Pin to top'}
              </button>
              <button onclick="openEdit(${f.linkID})">
                <i class="ti ti-pencil"></i> Edit
              </button>
              <button class="kebab-danger" onclick="askDelete(${f.linkID})">
                <i class="ti ti-trash"></i> Delete
              </button>
            </div>` : ''}
          </div>
        </div>
        <div class="announce-title">${escapeHtml(f.title)}</div>
        ${description ? `
          <div class="announce-content truncated" id="eval-content-${f.linkID}">${sanitizeHtml(description)}</div>
          <button type="button" class="btn-see-more" hidden aria-expanded="false" aria-controls="eval-content-${f.linkID}" onclick="toggleSeeMore(${f.linkID},this)">See more</button>
        ` : ''}
        ${renderEvalAttachSection(f.linkID)}
        <div class="eval-form-footer">
          ${submitBadge}
          <a href="${escapeHtml(f.googleFormURL)}" target="_blank" rel="noopener" class="btn-open-form">
            <i class="ti ti-external-link"></i> Open Form
          </a>
        </div>
      </div>`;
  }).join('');
}

function toggleSeeMore(id, btn) {
  const el = document.getElementById(`eval-content-${id}`);
  el.classList.toggle('truncated');
  btn.textContent = el.classList.contains('truncated') ? 'See more' : 'See less';
  btn.setAttribute('aria-expanded', String(!el.classList.contains('truncated')));
}

// ── KEBAB ─────────────────────────────────────────────────────
function toggleKebab(event, id) {
  event.stopPropagation();
  if (openKebabId && openKebabId !== id) {
    document.getElementById(`kebab-${openKebabId}`)?.classList.remove('open');
  }
  const menu = document.getElementById(`kebab-${id}`);
  menu?.classList.toggle('open');
  openKebabId = menu?.classList.contains('open') ? id : null;
}

// ── PIN ───────────────────────────────────────────────────────
async function togglePin(id) {
  document.getElementById(`kebab-${id}`)?.classList.remove('open');
  openKebabId = null;
  try {
    await apiRequest(`EvaluationLinks/${id}/pin`, 'PATCH', null, true);
    await loadForms();
  } catch (e) {
    // The kebab menu that holds this button only renders for links you
    // posted yourself now, so this should be unreachable in normal use —
    // kept as a visible fallback (was a silent console.error) rather than
    // trusting that entirely.
    showErrorModal('Failed to update pin status. Please try again.');
  }
}

// ── OPEN CREATE ───────────────────────────────────────────────
function openCreate() {
  editingId = null;
  pendingAttachFiles = [];
  document.getElementById('modalTitle').textContent = 'Add Evaluation Form';
  document.getElementById('fieldTitle').value       = '';
  document.getElementById('fieldDesc').innerHTML    = '';
  document.getElementById('fieldUrl').value         = '';
  document.getElementById('fieldDeadline').value    = '';
  document.getElementById('modalSave').textContent  = 'Add Evaluation Form';
  renderEvalAttachList();
  document.getElementById('modalOverlay').classList.add('active');
}

// ── OPEN EDIT ─────────────────────────────────────────────────
function openEdit(id) {
  document.getElementById(`kebab-${id}`)?.classList.remove('open');
  openKebabId = null;
  const f = allForms.find(x => x.linkID === id);
  if (!f) return;
  editingId = id;
  pendingAttachFiles = [];
  document.getElementById('modalTitle').textContent = 'Edit Evaluation Form';
  document.getElementById('fieldTitle').value       = f.title;
  document.getElementById('fieldDesc').innerHTML    = sanitizeHtml(f.description || '');
  document.getElementById('fieldUrl').value         = f.googleFormURL;
  document.getElementById('fieldDeadline').value    = evaluationDeadlineInput(f.deadline);
  document.getElementById('modalSave').textContent  = 'Save Changes';
  const existing = allEvalAttach.filter(a => a.linkID === id);
  renderEvalAttachList(existing);
  document.getElementById('modalOverlay').classList.add('active');
}

// ── CLOSE MODAL ───────────────────────────────────────────────
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  editingId = null;
}

// ── SUBMISSION DETAIL (who has self-reported as submitted) ─────────────
async function openSubmissionDetail(linkId) {
  document.getElementById(`kebab-${linkId}`)?.classList.remove('open');
  openKebabId = null;

  const form = allForms.find(f => f.linkID === linkId);
  document.getElementById('submitDetailTitle').textContent = form ? form.title : 'Submissions';
  document.getElementById('submitDetailBody').innerHTML = `<div class="eval-empty"><i class="ti ti-loader-2"></i> Loading…</div>`;
  document.getElementById('submitDetailOverlay').classList.add('active');

  try {
    const rows = await apiRequest(`EvaluationSubmissions/${linkId}`, 'GET', null, true);
    renderSubmissionDetail(rows || []);
  } catch (e) {
    document.getElementById('submitDetailBody').innerHTML =
      `<div class="eval-empty"><i class="ti ti-alert-circle"></i> Failed to load. Please try again.</div>`;
  }
}

function renderSubmissionDetail(rows) {
  const body = document.getElementById('submitDetailBody');
  if (!rows.length) {
    body.innerHTML = `<div class="eval-empty"><i class="ti ti-users"></i> No active mentees to show.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="submit-detail-list">
      ${rows.map(r => {
        const name = `${r.firstName} ${r.lastName}`;
        const when = r.submittedAt
          ? new Date(r.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
          : null;
        return `
          <div class="submit-detail-row ${r.hasSubmitted ? 'is-done' : ''}">
            <div class="submit-detail-status">
              <i class="ti ${r.hasSubmitted ? 'ti-circle-check-filled' : 'ti-circle-dashed'}"></i>
            </div>
            <div class="submit-detail-name">
              <div>${escapeHtml(name)}</div>
              ${r.studentNumber ? `<div class="submit-detail-sub">${escapeHtml(r.studentNumber)}</div>` : ''}
            </div>
            <div class="submit-detail-meta">
              <div class="submit-detail-when">${r.hasSubmitted ? `Marked ${when}` : '—'}</div>
              ${r.hasSubmitted && r.proofFilePath
                ? `<button type="button" class="submit-detail-proof-view" onclick="viewProof(${jsonAttr(r.proofFilePath)}, ${jsonAttr(name)})"><i class="ti ti-photo"></i> View</button>`
                : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function closeSubmissionDetail() {
  document.getElementById('submitDetailOverlay').classList.remove('active');
}

// ── PROOF LIGHTBOX — same pattern as Sessions' proof viewer ────────────
function viewProof(filePath, menteeName) {
  const overlay = document.getElementById('lightboxOverlay');
  const body    = document.getElementById('lightboxBody');
  const dlBtn   = document.getElementById('lightboxDownload');
  document.getElementById('lightboxTitle').textContent = `Proof — ${menteeName}`;

  const fullUrl = CONFIG.getFileUrl(filePath);
  if (dlBtn) { dlBtn.href = fullUrl; dlBtn.style.display = 'inline-flex'; }

  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filePath);
  body.innerHTML = isImage
    ? `<img src="${fullUrl}" alt="Proof of submission" onerror="this.parentElement.innerHTML=noPreviewHtml('${fullUrl}')"/>`
    : noPreviewHtml(fullUrl);

  overlay.style.display = 'flex';
}

function noPreviewHtml(filePath) {
  return `
    <div class="lightbox-no-preview">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>Preview not available for this file type.</p>
      <a href="${filePath}" target="_blank" rel="noopener" class="lightbox-open-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Open File
      </a>
    </div>`;
}

function closeLightbox(e) {
  if (e && e.target !== document.getElementById('lightboxOverlay')) return;
  document.getElementById('lightboxOverlay').style.display = 'none';
  document.getElementById('lightboxBody').innerHTML = '';
}

// ── SAVE ──────────────────────────────────────────────────────
function saveForm() {
  const title = document.getElementById('fieldTitle').value.trim();
  const url   = document.getElementById('fieldUrl').value.trim();
  if (!title) { showErrorModal('Please enter an evaluation title.'); return; }
  if (!url)   { showErrorModal('Please enter the Google Form link.'); return; }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    showErrorModal('Please enter a valid http:// or https:// form link.'); return;
  }
  const deadlineField = document.getElementById('fieldDeadline');
  if (deadlineField.validity?.badInput || (deadlineField.value && !evaluationDeadline(deadlineField.value))) {
    showErrorModal('Please enter a valid deadline date and time.'); return;
  }

  const isEdit = editingId !== null;
  showConfirmModal(
    isEdit ? 'Update Evaluation Form' : 'Add Evaluation Form',
    isEdit ? 'Save changes to this evaluation form?' : 'Make this evaluation form available to mentees?',
    'save',
    doSaveForm
  );
}

async function doSaveForm() {
  const title    = document.getElementById('fieldTitle').value.trim();
  const desc     = document.getElementById('fieldDesc').innerHTML.trim();
  const url      = document.getElementById('fieldUrl').value.trim();
  const deadline = document.getElementById('fieldDeadline').value || null;

  const session = getSession();
  const userId  = session?.user?.UserID || session?.user?.userID || 0;

  const saveBtn = document.getElementById('modalSave');
  const origText = saveBtn.textContent;
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving...';

  const currentEditingId = editingId;

  try {
    let linkID = currentEditingId;

    if (currentEditingId) {
      const existing = allForms.find(x => x.linkID === currentEditingId);
      await apiRequest(`EvaluationLinks/${currentEditingId}`, 'PUT', {
        linkID:         currentEditingId,
        postedByUserID: existing?.postedByUserID || userId,
        title,
        description:    desc || null,
        googleFormURL:  url,
        targetRole:     'Mentee',
        deadline,
        postedAt:       existing?.postedAt || new Date().toISOString(),
        isActive:       true,
        isPinned:       existing?.isPinned || false,
      }, true);
    } else {
      const res = await apiRequest('EvaluationLinks', 'POST', {
        postedByUserID: userId,
        title,
        description:    desc || null,
        googleFormURL:  url,
        targetRole:     'Mentee',
        deadline,
        isActive:       true,
        isPinned:       false,
      }, true);
      linkID = res?.linkID;
      // If an attachment fails, retry updates this form instead of creating a duplicate.
      if (linkID) {
        editingId = linkID;
        allForms.push({ linkID, postedByUserID: userId, title, description: desc || null,
          googleFormURL: url, deadline, postedAt: new Date().toISOString(), isPinned: false });
      }
    }

    // Upload pending file attachments
    if (pendingAttachFiles.length > 0 && linkID) {
      while (pendingAttachFiles.length) {
        const file = pendingAttachFiles[0];
        const fd = new FormData();
        fd.append('linkId', linkID);
        fd.append('file', file);
        await apiRequest('EvaluationAttachments/upload', 'POST', fd, true);
        pendingAttachFiles.shift();
      }
      pendingAttachFiles = [];
    }

    closeModal();
    await loadForms();
    showToast(currentEditingId ? '✓ Form link updated' : '✓ Form link added');

  } catch (err) {
    showErrorModal(err.message || 'Failed to save form. Please try again.');
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = origText;
  }
}

// ── DELETE ────────────────────────────────────────────────────
function askDelete(id) {
  document.getElementById(`kebab-${id}`)?.classList.remove('open');
  openKebabId = null;
  showConfirmModal(
    'Delete Form Link',
    'Delete this evaluation form? This cannot be undone.',
    'delete',
    async () => {
      try {
        await apiRequest(`EvaluationLinks/${id}`, 'DELETE', null, true);
        await loadForms();
        showToast('✓ Form link deleted');
      } catch (err) {
        showErrorModal('Failed to delete form link. Please try again.');
      }
    }
  );
}

// ── ATTACHMENTS ───────────────────────────────────────────────
function fileUrl(path) {
  return CONFIG.API_BASE_URL.replace('/api', '') + path;
}

function triggerEvalAttachFile() {
  document.getElementById('evalAttachFileInput').value = '';
  document.getElementById('evalAttachFileInput').click();
}

function handleEvalAttachFiles(e) {
  const existing = editingId ? allEvalAttach.filter(a => a.linkID === editingId) : [];
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
  renderEvalAttachList(existing);
}

function removeEvalAttach(index) {
  pendingAttachFiles.splice(index, 1);
  const existing = editingId ? allEvalAttach.filter(a => a.linkID === editingId) : [];
  renderEvalAttachList(existing);
}

function deleteExistingEvalAttach(attachmentID) {
  showConfirmModal(
    'Remove Attachment',
    'Remove this attachment? This cannot be undone.',
    'delete',
    () => doDeleteExistingEvalAttach(attachmentID)
  );
}

async function doDeleteExistingEvalAttach(attachmentID) {
  try {
    await apiRequest(`EvaluationAttachments/${attachmentID}`, 'DELETE', null, true);
    allEvalAttach = allEvalAttach.filter(a => a.attachmentID !== attachmentID);
    const existing = editingId ? allEvalAttach.filter(a => a.linkID === editingId) : [];
    renderEvalAttachList(existing);
  } catch (e) { console.error('Delete attachment failed', e); }
}

function renderEvalAttachList(existingAttachments = []) {
  const list = document.getElementById('evalAttachList');
  if (!list) return;
  const existingHtml = existingAttachments.map(att => `
    <div class="attach-item">
      <i class="ti ${attachIcon(att.fileName)} attach-icon"></i>
      <a class="attach-name" href="${fileUrl(att.filePath)}" target="_blank" rel="noopener">${escapeHtml(att.fileName)}</a>
      <span class="attach-size">${formatFileSize(att.fileSize)}</span>
      <button class="attach-remove" title="Remove" onclick="deleteExistingEvalAttach(${att.attachmentID})">×</button>
    </div>`).join('');
  const pendingHtml = pendingAttachFiles.map((f, i) => `
    <div class="attach-item">
      <i class="ti ${attachIcon(f.name)} attach-icon"></i>
      <span class="attach-name">${escapeHtml(f.name)}</span>
      <span class="attach-size">${formatFileSize(f.size)}</span>
      <button class="attach-remove" title="Remove" onclick="removeEvalAttach(${i})">×</button>
    </div>`).join('');
  list.innerHTML = existingHtml + pendingHtml;
}

function renderEvalAttachSection(linkID) {
  const atts = allEvalAttach.filter(a => a.linkID === linkID);
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

function downloadEvalAttach(attachmentId) {
  window.open(`${CONFIG.API_BASE_URL}/EvaluationAttachments/${attachmentId}/download`, '_blank');
}

function attachIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'ti-photo';
  if (ext === 'pdf') return 'ti-file-type-pdf';
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

// ── RICH TEXT ─────────────────────────────────────────────────
function updateEvalFormatButtons() {
  const wrap = document.querySelector('.rich-editor-wrap');
  if (!wrap) return;
  wrap.querySelectorAll('.rfmt-btn[data-cmd]').forEach(btn => {
    try { btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd)); } catch (e) {}
  });
}

function evalFormatDoc(command) {
  document.execCommand(command, false, null);
  updateEvalFormatButtons();
}

document.addEventListener('selectionchange', () => {
  const focused = document.activeElement;
  if (focused?.id === 'fieldDesc') updateEvalFormatButtons();
});

// ── MODALS & TOAST ────────────────────────────────────────────
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
  } else {
    okBtn.className   = 'btn-primary';
    okBtn.textContent = 'Confirm';
    icon.className    = 'info-modal-icon confirm';
    icon.innerHTML    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9 11 12 14 22 4"/></svg>`;
  }

  okBtn.onclick = () => { hideConfirmModal(); onConfirm(); };
  document.getElementById('confirmModal').style.display = 'flex';
}

function hideConfirmModal() { document.getElementById('confirmModal').style.display = 'none'; }

function showErrorModal(msg) {
  document.getElementById('errorMessage').textContent = msg;
  document.getElementById('errorModal').style.display = 'flex';
}
function hideErrorModal() { document.getElementById('errorModal').style.display = 'none'; }
function hideSuccessModal() { document.getElementById('successModal').style.display = 'none'; }

function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;z-index:99999;opacity:0;transition:opacity 0.3s;box-shadow:0 4px 12px rgba(0,0,0,0.2);white-space:nowrap;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.style.opacity = '1', 10);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
}

// ── UTILITIES ─────────────────────────────────────────────────
function jsonAttr(value) {
  return JSON.stringify(value).replace(/"/g, '&quot;');
}
