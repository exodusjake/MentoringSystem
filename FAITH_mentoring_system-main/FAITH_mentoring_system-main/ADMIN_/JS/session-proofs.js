// ===== SESSION PROOFS JS =====

let allRecords      = [];
let availableMentors = []; // roster from the API — MentorID/FirstName/LastName/School/Department
let currentFiltered  = []; // last-applied filtered set

// School-scoped view — click a school card to narrow everything below
// (department + mentor dropdowns, and the table itself) to that one
// school; click it again to go back to every school. No default — the
// page opens showing every school until one is picked.
let activeSchoolFilter = '';

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  loadData();

  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('courseFilter').addEventListener('change', () => { populateMentorFilter(); applyFilters(); });
  document.getElementById('mentorFilter').addEventListener('change', applyFilters);
  document.getElementById('proofStatusFilter').addEventListener('change', applyFilters);
  document.getElementById('dateFilter').addEventListener('change', applyFilters);
});

// ── LOAD ──────────────────────────────────────────────────────
async function loadData() {
  try {
    const [data] = await Promise.all([apiRequest('SessionProofsAdmin', 'GET', null, true), MentorSchools.load()]);
    allRecords       = data.records          || [];
    availableMentors = data.availableMentors || [];

    populateSchoolCards();
    applyActiveSchoolCardHighlight();
    populateCourseFilter();
    populateMentorFilter();
    applyFilters();
  } catch (e) {
    console.error('Error loading session proofs:', e);
    showErrorModal('Failed to load session proofs. Please refresh.');
  }
}

// ── SCHOOL OVERVIEW CARDS ────────────────────────────────────────
function populateSchoolCards() {
  const schools = ['School of Technology', 'School of Humanities', 'School of Management'];
  const keys    = ['sot', 'soh', 'som'];
  schools.forEach((school, i) => {
    const rows    = allRecords.filter(r => MentorSchools.sessionInSchool(r, school));
    const missing = rows.filter(r => !r.hasProof).length;
    const k = keys[i];
    const sEl = document.getElementById(`${k}-sessions`);
    const mEl = document.getElementById(`${k}-missing`);
    if (sEl) sEl.textContent = rows.length;
    if (mEl) mEl.textContent = missing;
  });
}

function applyActiveSchoolCardHighlight() {
  const schools = ['School of Technology', 'School of Humanities', 'School of Management'];
  document.querySelectorAll('.school-card').forEach((card, i) => {
    card.classList.toggle('active', activeSchoolFilter === schools[i]);
  });
}

function filterBySchool(school) {
  activeSchoolFilter = activeSchoolFilter === school ? '' : school;
  applyActiveSchoolCardHighlight();
  document.getElementById('courseFilter').value = '';
  populateCourseFilter();
  populateMentorFilter();
  applyFilters();
}

// ── STATS ─────────────────────────────────────────────────────
// Totals for the sessions currently listed (all sessions when nothing is filtered).
function renderStats(records) {
  const total     = records.length;
  const withProof = records.filter(r => r.hasProof).length;
  const coverage  = total > 0 ? Math.round(withProof / total * 1000) / 10 : 0;
  document.getElementById('totalSessionsValue').textContent = total;
  document.getElementById('withProofValue').textContent     = withProof;
  document.getElementById('missingProofValue').textContent  = total - withProof;
  document.getElementById('coverageRateValue').textContent  = coverage + '%';
}

// ── FILTER DROPDOWNS ──────────────────────────────────────────
// Both cascade off the active school card; the mentor dropdown also
// narrows to whichever department is currently selected. Re-run after
// either changes so a mentor from a now-hidden school/department can't
// stay selected silently.
function populateCourseFilter() {
  const sel = document.getElementById('courseFilter');
  if (!sel) return;
  MentorSchools.fillCourseSelect(sel, activeSchoolFilter, availableMentors);
}

function populateMentorFilter() {
  const sel = document.getElementById('mentorFilter');
  if (!sel) return;
  const current  = sel.value;
  const course = document.getElementById('courseFilter')?.value || '';

  const scoped = availableMentors.filter(m =>
    (MentorSchools.inSchool(m, activeSchoolFilter)) &&
    MentorSchools.inCourse(m, course)
  );

  sel.innerHTML = '<option value="">All Mentors</option>';
  scoped.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.mentorID;
    opt.textContent = `${m.firstName} ${m.lastName}`;
    sel.appendChild(opt);
  });
  sel.value = scoped.some(m => String(m.mentorID) === current) ? current : '';
}

// ── FILTERS ───────────────────────────────────────────────────
function applyFilters() {
  const q           = document.getElementById('searchInput').value.trim().toLowerCase();
  const dept        = document.getElementById('courseFilter').value;
  const mentorId    = document.getElementById('mentorFilter').value;
  const proofStatus = document.getElementById('proofStatusFilter').value;
  const date        = document.getElementById('dateFilter').value;

  const filtered = allRecords.filter(r => {
    const mentorName = `${r.mentorFirstName} ${r.mentorLastName}`.toLowerCase();

    if (!MentorSchools.sessionInSchool(r, activeSchoolFilter)) return false;
    if (!MentorSchools.sessionInCourse(r, dept)) return false;
    if (q && !mentorName.includes(q)) return false;
    if (mentorId && String(r.mentorID) !== mentorId) return false;
    if (proofStatus === 'submitted' && !r.hasProof) return false;
    if (proofStatus === 'missing'   &&  r.hasProof) return false;
    if (date && isoDate(r.sessionDate) !== date) return false;

    return true;
  });

  renderMentorCards(filtered);
}

function clearFilters() {
  document.getElementById('searchInput').value       = '';
  document.getElementById('proofStatusFilter').value = '';
  document.getElementById('dateFilter').value        = '';
  document.getElementById('courseFilter').value        = '';
  document.getElementById('mentorFilter').value      = '';
  activeSchoolFilter = '';
  applyActiveSchoolCardHighlight();
  populateCourseFilter();
  populateMentorFilter();
  renderMentorCards(allRecords);
}

function isoDate(dt) {
  if (!dt) return '';
  // Session times are stored as Philippine wall time; use that calendar date.
  if (typeof dt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dt)) return dt.slice(0, 10);
  return new Date(dt).toISOString().slice(0, 10);
}

// JSON.stringify wraps its output in double quotes — embedding that
// directly inside a double-quoted HTML attribute (onclick="...") closes
// the attribute early at that first quote, truncating everything after
// it. This was silently breaking the "View" button entirely (its onclick
// ended up as the literal, inert string 'viewProof('). Escape the quotes
// for the attribute context instead.
function jsonAttr(value) {
  return JSON.stringify(value).replace(/"/g, '&quot;');
}

// ── RENDER MENTOR CARDS ─────────────────────────────────────────
// One card per mentor instead of one row per session — a mentor with
// several sessions used to repeat their name on every row. Each card's
// session list is an independent expand/collapse (same interaction as
// Mentor Detail's section accordion), and scrolls internally instead of
// growing the page when a mentor has many sessions.
let renderedMentors = [];

function renderMentorCards(records) {
  currentFiltered = records;
  renderStats(records);

  const grid    = document.getElementById('ptCardsGrid');
  const countEl = document.getElementById('showingCount');

  // Every mentor in scope is listed, even before their first completed
  // session. Proof-status and date filters list only mentors with a match.
  const byMentor = new Map();
  const sessionFilter = document.getElementById('proofStatusFilter').value || document.getElementById('dateFilter').value;
  if (!sessionFilter) {
    const q        = document.getElementById('searchInput').value.trim().toLowerCase();
    const dept     = document.getElementById('courseFilter').value;
    const mentorId = document.getElementById('mentorFilter').value;
    availableMentors
      .filter(m => MentorSchools.inSchool(m, activeSchoolFilter)
        && MentorSchools.inCourse(m, dept)
        && (!mentorId || String(m.mentorID) === mentorId)
        && (!q || `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)))
      .forEach(m => byMentor.set(m.mentorID, {
        name: `${m.firstName} ${m.lastName}`,
        sortKey: `${m.lastName} ${m.firstName}`,
        dept: m.department || m.school || '—',
        sessions: [],
      }));
  }

  records.forEach(r => {
    if (!byMentor.has(r.mentorID)) {
      byMentor.set(r.mentorID, {
        name: `${r.mentorFirstName} ${r.mentorLastName}`,
        sortKey: `${r.mentorLastName} ${r.mentorFirstName}`,
        dept: r.mentorDepartment || r.mentorSchool || '—',
        sessions: [],
      });
    }
    byMentor.get(r.mentorID).sessions.push(r);
  });

  if (!byMentor.size) {
    grid.innerHTML = `<div class="table-empty">No mentors or sessions match the current filters.</div>`;
    countEl.textContent = '';
    return;
  }

  // By last name, same order as the other monitoring pages.
  const mentors = [...byMentor.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  countEl.textContent =
    `${records.length} session${records.length !== 1 ? 's' : ''} · ${mentors.length} mentor${mentors.length !== 1 ? 's' : ''}`;

  renderedMentors = mentors;
  grid.innerHTML = mentors.map((m, i) => renderMentorProofCard(m, i)).join('');
}

function renderMentorProofCard(m, i) {
  const initials = m.name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '—';
  const uploaded = m.sessions.filter(s => s.hasProof).length;
  const missing  = m.sessions.length - uploaded;
  const hasSessions = m.sessions.length > 0;
  const pct      = hasSessions ? Math.round((uploaded / m.sessions.length) * 100) : 0;
  const tier     = !hasSessions ? '' : pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';

  return `
    <div class="pt-card">
      <div class="pt-card-top">
        <div class="pt-card-id">
          <div class="pt-avatar av-${i % 6}">${initials}</div>
          <div class="pt-id-text">
            <div class="pt-name">${escapeHtml(m.name)}</div>
            <div class="pt-dept">${escapeHtml(m.dept)}</div>
          </div>
        </div>
        <div class="pt-card-stat">
          <div class="pt-stat-val">${m.sessions.length}</div>
          <div class="pt-stat-lbl">Session${m.sessions.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="pt-legend">
          <span class="pt-legend-item"><i class="pt-dot good"></i>${uploaded} uploaded</span>
          <span class="pt-legend-item"><i class="pt-dot bad"></i>${missing} missing</span>
        </div>
        <div class="pt-coverage">
          <div class="pt-coverage-head"><span>Coverage</span><span class="pt-coverage-pct ${tier}">${hasSessions ? `${pct}%` : '—'}</span></div>
          <div class="pt-bar"><div class="pt-bar-fill ${tier}" style="width:${pct}%"></div></div>
        </div>
      </div>
      ${hasSessions ? `
        <button class="pt-toggle-btn" onclick="openSessionsModal(${i})">
          View sessions
          <svg class="pt-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
        </button>
      ` : '<div class="pt-empty-note">No completed sessions yet</div>'}
    </div>`;
}

// Sessions open in a modal so expanding one mentor never reflows the grid.
function openSessionsModal(index) {
  const m = renderedMentors[index];
  if (!m) return;
  const uploaded = m.sessions.filter(s => s.hasProof).length;
  const count    = m.sessions.length;
  document.getElementById('sessionsModalTitle').textContent = m.name;
  document.getElementById('sessionsModalSub').textContent =
    `${m.dept} · ${count} session${count !== 1 ? 's' : ''} · ${uploaded} uploaded · ${count - uploaded} missing`;
  document.getElementById('sessionsModalBody').innerHTML = m.sessions
    .slice()
    .sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate))
    .map(r => renderMentorProofSessionRow(r, m.name))
    .join('');
  document.getElementById('sessionsModal').style.display = 'flex';
}

function closeSessionsModal(e) {
  if (e && e.target !== document.getElementById('sessionsModal')) return;
  document.getElementById('sessionsModal').style.display = 'none';
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('lightboxOverlay')?.style.display === 'flex') closeLightbox();
  else if (document.getElementById('sessionsModal')?.style.display === 'flex') closeSessionsModal();
});

function renderMentorProofSessionRow(r, mentorName) {
  const sessionDate = r.sessionDate
    ? new Date(r.sessionDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
  const uploadedAt = r.uploadedAt
    ? new Date(r.uploadedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;
  const section = r.sectionCode || null;

  // Matches the "proof-chip" style used on Head's Mentor Monitoring
  // detail page — same colors, same "Uploaded"/"No Proof" wording, same
  // click-the-chip-to-view behavior for an uploaded proof.
  const proofBadge = r.hasProof && r.filePath
    ? `<button class="proof-chip yes" onclick="viewProof(${jsonAttr(r.filePath)}, ${jsonAttr(r.fileType || '')}, ${jsonAttr(mentorName)})" title="View proof">View</button>`
    : r.hasProof
      ? `<span class="proof-chip yes">Uploaded</span>`
      : `<span class="proof-chip no">No Proof</span>`;

  return `
    <div class="pt-session-row ${r.hasProof ? 'status-ok' : 'status-no'}">
      <div class="pt-session-main">
        <div class="pt-session-top">
          <span class="checkpoint-badge">${r.isMakeup ? 'Make-up Session: ' : ''}${r.slotName || 'Session'}</span>
          <span class="pt-session-date">${sessionDate}</span>
        </div>
        <div class="pt-session-sub">
          ${section ? `<span class="badge-section">${section}</span>` : ''}
          ${uploadedAt ? `<span class="pt-session-uploaded">${section ? '· ' : ''}Uploaded ${uploadedAt}</span>` : ''}
        </div>
      </div>
      ${proofBadge}
    </div>`;
}

// ── LIGHTBOX ──────────────────────────────────────────────────
function viewProof(filePath, fileType, mentorName) {
  const overlay  = document.getElementById('lightboxOverlay');
  const body     = document.getElementById('lightboxBody');
  const dlBtn    = document.getElementById('lightboxDownload');
  document.getElementById('lightboxTitle').textContent = `Proof — ${mentorName}`;

  const downloadUrl = CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(filePath));
  if (dlBtn) { dlBtn.href = downloadUrl; dlBtn.style.display = 'inline-flex'; }

  const isImage = /image/i.test(fileType) || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filePath);
  const fullUrl = CONFIG.getFileUrl(filePath);
  if (isImage) {
    body.innerHTML = `<img src="${fullUrl}" alt="Proof of session" onerror="this.parentElement.innerHTML=noPreviewHtml('${fullUrl}')"/>`;
  } else {
    body.innerHTML = noPreviewHtml(fullUrl);
  }

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

// ── ERROR MODAL ───────────────────────────────────────────────
function showErrorModal(msg) {
  document.getElementById('errorMessage').textContent = msg;
  document.getElementById('errorModal').style.display = 'flex';
}
function hideErrorModal() { document.getElementById('errorModal').style.display = 'none'; }
