// ===== EVALUATION FORMS JS (HEAD ADMIN — VIEW ONLY) =====
// Head can see every posted evaluation form and who has self-reported
// submitting it, same data as Admin's page, but with no create/edit/
// delete/pin controls — Admin is the only one who posts these.

let allForms         = [];
let allEvalAttach    = [];
let submissionSummary = {}; // { [linkID]: { submittedCount, totalMentees } }

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('head');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  loadForms();
});

// ── LOAD ──────────────────────────────────────────────────────
async function loadForms() {
  try {
    const [formsData, attachData, summaryData] = await Promise.allSettled([
      apiRequest('EvaluationLinks',               'GET', null, true),
      apiRequest('EvaluationAttachments',         'GET', null, true),
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
    document.getElementById('formsList').innerHTML = `
      <div class="eval-empty">
        <i class="ti ti-alert-circle"></i>
        <p>Failed to load evaluation forms. Please refresh.</p>
      </div>`;
  }
}

// ── RENDER (view-only) ───────────────────────────────────────
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
        <p>No evaluation forms posted yet.</p>
      </div>`;
    return;
  }

  const now = new Date();

  list.innerHTML = sorted.map(f => {
    const pinned      = !!f.isPinned;
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

    // Self-reported count — mentees mark themselves as submitted (this
    // system has no access to actual Google Form responses), so treat
    // this as a rough tally, not a verified one.
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

// ── SUBMISSION DETAIL (who has self-reported as submitted) ─────
async function openSubmissionDetail(linkId) {
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

// ── ATTACHMENTS (view/download only) ────────────────────────────
function fileUrl(path) {
  return CONFIG.API_BASE_URL.replace('/api', '') + path;
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

// ── UTILITIES ─────────────────────────────────────────────────
function jsonAttr(value) {
  return JSON.stringify(value).replace(/"/g, '&quot;');
}

