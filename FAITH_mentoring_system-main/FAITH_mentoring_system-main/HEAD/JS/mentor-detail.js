let statusCalendar = [];
/* ============================================================
   HEAD ADMIN — mentor-detail.js
   ============================================================ */

let allSessions  = [];
let allMentees   = [];
let logsheetMap  = {};   // sessionID → full session data with mentees
let logMentor    = null;
let semLabel     = '—';
let guidanceOfficer = 'the Guidance Office';

// ── Logsheet viewer modal state ────────────────────────────────
let currentTab          = 'logsheet';
let currentLogsheetData = null;

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Critical';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('head');

  const params   = new URLSearchParams(window.location.search);
  const mentorId = parseInt(params.get('id'), 10);
  if (!mentorId) { window.location.href = 'mentor-performance.html'; return; }

  const school = params.get('school');
  const backBtn = document.getElementById('backBtn');
  if (school && backBtn) {
    backBtn.href = `mentor-performance.html?school=${encodeURIComponent(school)}`;
  }

  const attLink = document.getElementById('menteeAttendanceLink');
  if (attLink) attLink.href = `attendance-detail.html?id=${mentorId}`;

  loadDetail(mentorId);
});

async function loadDetail(id) {
  try {
    const [data, sessData, logsheet, settings, calendar] = await Promise.all([
      apiRequest(`MonitorActivities/${id}`, 'GET', null, true),
      // Same richer session list Admin's own Sessions Detail page reads
      // (SectionCode/SlotName/TimeEnd/IsMakeup/ProofFileType/SchoolYear/
      // Semester/LogStatus) — MonitorActivities/{id}'s own "sessions" field
      // is a leaner shape that can't drive the session-row card below.
      apiRequest(`SessionsAdmin/${id}/sessions`, 'GET', null, true).catch(() => null),
      apiRequest(`SessionsAdmin/${id}/logsheet`, 'GET', null, true).catch(() => null),
      apiRequest('Settings', 'GET', null, true).catch(() => null),
      apiRequest('CalendarEvents', 'GET', null, true).catch(() => []),
    ]);

    if (!data) { window.location.href = 'mentor-performance.html'; return; }

    statusCalendar = calendar || [];
    renderHero(data);
    renderStatCards(data);

    allMentees = data.mentees || data.Mentees || [];
    if (!logsheet) throw new Error('Logsheet data could not be loaded.');
    logMentor = logsheet.mentor || null;
    const mergedLogsheet = LogsheetData.merge(logsheet.sessions || []);
    logsheetMap = {};
    mergedLogsheet.forEach(s => { logsheetMap[s.sessionID] = s; });
    allSessions = await LogsheetData.withReportStatuses(LogsheetData.rows(logsheet.sessions || [], sessData?.sessions || []), id);
    populateSessionPeriodFilter(allSessions);

    if (settings) {
      const sy  = settings.SchoolYear || '';
      const sem = settings.Semester   || '';
      if (sy && sem) semLabel = `${sem}, AY ${sy}`;
      if (settings.GuidanceOfficer) guidanceOfficer = settings.GuidanceOfficer;
    }

    renderSessions();
    renderMentees();
  } catch (e) {
    console.error('Detail load error:', e);
    const grid = document.getElementById('sessionCardsGrid');
    if (grid) grid.innerHTML = `<div class="empty-state">Failed to load data. Please refresh the page.</div>`;
  }
}

// ── Hero ──────────────────────────────────────────────────────
function renderHero(d) {
  const first    = d.firstName      || d.FirstName      || '';
  const last     = d.lastName       || d.LastName       || '';
  const school   = d.school         || d.School         || '—';
  const dept     = d.departmentName || d.DepartmentName || '—';
  const email    = d.email          || d.Email          || '';
  const contact  = d.contactNumber  || d.ContactNumber  || '';
  const rawStatus = d.progressStatus    || d.ProgressStatus    || 'Critical';
  const done      = d.completedSessions ?? d.CompletedSessions ?? 0;
  const status    = mentorTierGroup(rawStatus, done);
  const initials  = ((first[0] || '') + (last[0] || '')).toUpperCase() || '—';

  document.title       = `${first} ${last} — Head Admin Portal`;
  document.getElementById('heroAvatar').textContent     = initials;
  document.getElementById('heroName').textContent       = `${first} ${last}`;

  const badgeEl = document.getElementById('heroBadge');
  badgeEl.textContent = status;
  badgeEl.className   = `hero-badge ${status.toLowerCase().replace(/ /g, '-')}`;

  const metaEl = document.getElementById('heroMeta');
  metaEl.innerHTML = [
    school  && `<span class="hero-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>${escapeHtml(school)}</span>`,
    dept    && `<span class="hero-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>${escapeHtml(dept)}</span>`,
    email   && `<span class="hero-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${escapeHtml(email)}</span>`,
    contact && `<span class="hero-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.17 3.58a2 2 0 0 1 1.99-2.18H6a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z"/></svg>${escapeHtml(contact)}</span>`,
  ].filter(Boolean).join('');

  // Section badges — same blue tags the Attendance Detail hero shows,
  // for visual parity between the two "detail" pages.
  const sections = d.sections || d.Sections || '';
  const sectionTags = sections.split(',').map(s => s.trim()).filter(Boolean)
    .map(s => `<span class="hero-section-tag">${escapeHtml(s)}</span>`).join('');
  const heroInfo = document.getElementById('heroInfo');
  const existingTags = heroInfo.querySelector('.hero-tags');
  if (existingTags) existingTags.remove();
  if (sectionTags) {
    heroInfo.insertAdjacentHTML('beforeend', `<div class="hero-tags">${sectionTags}</div>`);
  }
}

// ── Stat Cards ────────────────────────────────────────────────
function renderStatCards(d) {
  const completed = d.completedSessions ?? d.CompletedSessions ?? 0;
  const required  = d.requiredSessions  ?? d.RequiredSessions  ?? 0;
  const pct       = Math.round(d.progressPercent  ?? d.ProgressPercent  ?? 0);
  const active    = d.activeMentees    ?? d.ActiveMentees    ?? 0;
  const inactive  = d.inactiveMentees  ?? d.InactiveMentees  ?? 0;
  const total     = active + inactive;

  document.getElementById('dStatCompleted').textContent    = completed;
  document.getElementById('dStatRequiredNote').textContent = `of ${required} required`;
  document.getElementById('dStatActiveMentees').textContent= active;
  document.getElementById('dStatInactiveNote').textContent = `${inactive} with no completed checkpoints this semester`;
  document.getElementById('dStatTotalMentees').textContent = total;

  setTimeout(() => {
    const fill = document.getElementById('dStatProgressFill');
    if (fill) fill.style.width = `${pct}%`;
  }, 150);
}

// ── Sessions Table ────────────────────────────────────────────
// Sessions now carry their own SchoolYear/Semester from the moment
// they're created (sp_GetMentorDetail's RS3 used to hard-filter to only
// the CURRENT System Settings period, silently hiding every past
// semester's sessions the instant Settings rolled forward — fixed in
// fix_mentor_detail_session_history.sql). This surfaces that history
// as a filter instead of it staying invisible.
function populateSessionPeriodFilter(sessions) {
  const sel = document.getElementById('sessionPeriodFilter');
  if (!sel) return;
  const seen = new Set();
  const periods = [];
  sessions.forEach(s => {
    const sy = s.schoolYear || s.SchoolYear, sem = s.semester || s.Semester;
    if (!sy || !sem) return;
    const key = `${sy}|${sem}`;
    if (seen.has(key)) return;
    seen.add(key);
    periods.push({ schoolYear: sy, semester: sem, key });
  });
  periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));

  const prevValue = sel.value;
  sel.innerHTML = '<option value="">All School Years</option>' +
    periods.map(p => `<option value="${p.key}">${p.semester}, SY ${p.schoolYear}</option>`).join('');
  if (periods.some(p => p.key === prevValue)) sel.value = prevValue;
}

function applySessionFilter() { renderSessions(); }

function isMakeupSession(s) { return s.isMakeup === true; }

// ── MERGE 2ND-ROUND SESSIONS INTO ONE LOGSHEET ENTRY PER CHECKPOINT ─────
// A checkpoint may now have more than one "round" session (round 2+ logged
// to catch mentees absent from round 1 — see SessionsService.SlotExistsAsync,
// which allows a same-slot session once round 1 is Completed). Which round
// a mentee attended doesn't matter for grading — only whether they
// attended the checkpoint at all — so the Logsheet viewer/print here shows
// ONE entry per checkpoint with a unioned attendance list, mirroring
// MENTOR/JS/logsheet.js's mergeRoundsForLogsheet (same shape, since both
// read SessionsAdmin/{id}/logsheet). Groups of size 1 (the common case)
// pass through untouched.
// Makeup sessions (Availability bookings) fold in too, IF the mentor
// posted the slot against a real checkpoint (Availability.SlotName,
// propagated onto the created Session). A makeup session isn't itself
// tied to one section (its own SectionCode is always null), and it can be
// attended by mentees from different sections, so its present attendees
// are folded in by THEIR OWN sectionCode rather than the session's own
// (absent) one — one makeup session can contribute to more than one
// section's checkpoint group. A makeup session with no slotName, or whose
// attendees' section has no regular session on file, passes through
// untouched, same as before this feature.
function mergeRoundsForLogsheet(sessions) { return LogsheetData.merge(sessions); }

// Same grouping, applied to the leaner SessionsAdmin/{id}/sessions row
// shape (SessionRowDto — no per-mentee mentees array, just precomputed
// PresentCount/TotalAttendees, and its section field is `sectionCode` not
// `sessionSectionCode`). Drops non-primary round rows from the card grid
// so a checkpoint with 2+ rounds shows one row; loadDetail() below
// refreshes the primary row's presentCount/totalAttendees from the
// already-merged logsheetMap entry once that's built, since summing
// per-round counts here could double-count a mentee present in more than
// one round.
function mergeSessionRows(sessions) {
  const groups      = new Map();
  const passthrough = [];

  for (const s of sessions) {
    if (isMakeupSession(s) || !s.slotName || !s.sectionCode) {
      passthrough.push(s);
      continue;
    }
    const key = `${s.slotName}|${s.sectionCode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const merged = [];
  for (const rounds of groups.values()) {
    if (rounds.length === 1) { merged.push(rounds[0]); continue; }
    rounds.sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));
    merged.push({ ...rounds[0], roundDates: rounds.map(r => r.sessionDate) });
  }

  return [...merged, ...passthrough];
}

// Card-row layout — same session-row/sr-* markup as Admin's own Sessions
// Detail page (ADMIN_/JS/sessions-detail.js renderSessions), reading the
// same SessionsAdmin/{id}/sessions data. Kept in sync on purpose; if one
// changes, so should the other.
function renderSessions() {
  const statusFilter = document.getElementById('sessionStatusFilter')?.value || '';
  const periodFilter = document.getElementById('sessionPeriodFilter')?.value || '';
  const grid    = document.getElementById('sessionCardsGrid');
  const countEl = document.getElementById('sessionCount');

  const rows = allSessions
    .filter(s => !statusFilter || sessionDisplayStatus(s, statusCalendar) === statusFilter)
    .filter(s => !periodFilter || `${s.schoolYear}|${s.semester}` === periodFilter)
    .sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));

  if (countEl) countEl.textContent = `${rows.length} session${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    grid.innerHTML = `<div class="empty-state">No sessions found.</div>`;
    return;
  }

  grid.innerHTML = rows.map(s => {
    const date      = s.sessionDate
      ? new Date(s.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const timeStart = LogsheetData.time(s.actualStart);
    const timeEnd   = LogsheetData.time(s.actualEnd);
    const displayStatus = sessionDisplayStatus(s, statusCalendar);
    const statusCls = (displayStatus === 'In Progress' ? 'Scheduled' : displayStatus === 'Closed' ? 'Cancelled' : displayStatus).toLowerCase();
    const isMakeup  = isMakeupSession(s);
    const title     = isMakeup ? (s.slotName ? `Make-Up Session: ${s.slotName}` : 'Make-up Session') : (s.slotName || 'Session');
    // SectionCode (not the derived Sections list) — present the moment a
    // session is created, so it's the reliable "course" tag to show right
    // beside the title/status, same row.
    const courseTag = s.sectionCode ? `<span class="ses-course">${escapeHtml(s.sectionCode)}</span>` : '';

    // Whatever the mentor actually typed for this session — blank unless
    // they wrote something (no "Mentoring Session" placeholder text here).
    const DESC_LIMIT = 70;
    const desc       = (s.topic || '').replace(/^\[[^\]]+\]\s*/, '').trim();
    const descLong   = desc.length > DESC_LIMIT;
    const descTrunc  = descLong ? desc.slice(0, DESC_LIMIT).trim() + '…' : desc;
    const descHtml   = desc
      ? `<div class="ses-desc">
           <span class="ses-desc-text">${escapeHtml(descTrunc)}</span>
           ${descLong ? `<button type="button" class="ses-desc-more" onclick="event.stopPropagation(); toggleSesDesc(this, ${jsonAttr(descTrunc)}, ${jsonAttr(desc)})">See more</button>` : ''}
         </div>`
      : '';

    // Attendance
    const attVal = s.totalAttendees > 0 ? `${s.presentCount}/${s.totalAttendees} Attendance` : '— Attendance';
    const attCls = s.totalAttendees === 0 ? 'empty'
                 : s.presentCount === s.totalAttendees ? 'full' : 'partial';

    // Proof — a merged checkpoint row can have proof from more than one
    // round/booking (_proofSources, set once logsheetMap is built above);
    // falls back to just this row's own proofFilePath for the common,
    // unmerged case.
    const proofSources = s._proofSources || (s.proofFilePath ? [{ filePath: s.proofFilePath, fileType: s.proofFileType }] : []);
    // One source keeps the original single pill (view + direct download).
    // 2+ collapse into one "Proof (N)" pill that opens a thumbnail gallery
    // instead of a pill per round lined up across the row card.
    const proofHtml = proofSources.length === 0
      ? `<span class="sr-metric empty sr-metric--no-proof">No Proof</span>`
      : proofSources.length === 1
      ? `<span class="sr-metric proof sr-proof-pill">
           <button type="button" class="sr-proof-view" onclick="event.stopPropagation(); openProofModal(${jsonAttr(proofSources[0].filePath)})">Proof</button>
           <span class="sr-proof-sep">|</span>
           <a class="sr-proof-dl" href="${CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(proofSources[0].filePath))}" onclick="event.stopPropagation()" title="Download proof"><i class="ti ti-download"></i></a>
         </span>`
      : `<span class="sr-metric proof sr-proof-pill">
           <button type="button" class="sr-proof-view sr-proof-view--gallery" onclick="event.stopPropagation(); openProofGallery(${jsonAttr(proofSources)})">Proof (${proofSources.length})</button>
         </span>`;

    // Logsheet status — Draft is treated as not submitted (invisible here, same as Admin)
    const logStatus = s.logStatus === 'Submitted' ? 'Submitted' : null;
    const canOpen   = logStatus === 'Submitted';
    const footerHtml = canOpen
      ? `<button class="ses-view-link" onclick="event.stopPropagation(); openLogsheet(${s.sessionID})">
           View Logsheet
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
         </button>`
      : `<button class="ses-view-link" disabled title="Awaiting mentor submission">${escapeHtml(LogsheetData.reportStatus(s,statusCalendar))}</button>`;

    return `
      <div class="ses-card ${canOpen ? '' : 'ses-card--pending'}" onclick="${canOpen ? `openLogsheet(${s.sessionID})` : ''}">
        <div class="ses-top">
          <div class="ses-title-row">
            <span class="ses-title">${escapeHtml(title)}</span>
            ${courseTag}
            ${s.slotName && s.status !== 'Cancelled' ? `<span class="ses-status">${escapeHtml(LogsheetData.reportStatus(s,statusCalendar))}</span>` : ''}
          </div>
          <span class="badge-status ${statusCls}">${displayStatus}</span>
        </div>
        <div class="ses-when">
          <span class="ses-when-line">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${date}
          </span>
          <span class="ses-when-line">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${timeStart} – ${timeEnd}
          </span>
          ${s.roundDates?.length > 1
            ? `<span class="ses-when-line" title="${s.roundDates.map(d => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })).join(', ')}">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                 ${s.roundDates.length} sessions conducted
               </span>`
            : ''}
        </div>
        ${descHtml}
        <div class="ses-divider"></div>
        <div class="ses-stats">
          <span class="sr-metric ${attCls}" onclick="event.stopPropagation()" style="cursor:default;">${attVal}</span>
          ${proofHtml}
        </div>
        <div class="ses-divider"></div>
        <div class="ses-footer" onclick="event.stopPropagation()">${footerHtml}</div>
      </div>`;
  }).join('');
}

function jsonAttr(value) {
  return JSON.stringify(value).replace(/"/g, '&quot;');
}

function toggleSesDesc(btn, truncText, fullText) {
  const span     = btn.previousElementSibling;
  const expanded = btn.dataset.expanded === '1';
  span.textContent    = expanded ? truncText : fullText;
  btn.textContent      = expanded ? 'See more' : 'See less';
  btn.dataset.expanded = expanded ? '0' : '1';
}

function fmtTime(value) { return LogsheetData.time(value); }

// ── LOGSHEET VIEWER MODAL ───────────────────────────────────────
// Same in-page modal shape as Admin's Sessions Detail page (same
// .lm-*/.paper-* CSS, already loaded on this page via
// ADMIN_/CSS/sessions.css) -- Head used to jump straight to a print
// window with no preview step at all, the only portal that didn't
// give the reader a chance to look before printing.
function openLogsheet(sessionId) {
  const s = logsheetMap[sessionId];
  if (!s) return;
  const logStatus  = s.logStatus === 'Submitted' ? 'Submitted' : null;
  const date       = s.sessionDate
    ? new Date(s.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  // Distinct from `date` above — blank if never submitted, not the session date.
  const submittedDate = s.submittedAt
    ? new Date(s.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const timeStart  = LogsheetData.time(s.actualStart) || '—';
  const timeEnd    = LogsheetData.time(s.actualEnd) || '—';
  const topic      = (s.topic || 'Mentoring Session').replace(/^\[[^\]]+\]\s*/, '');
  const isMakeup   = !!s.isMakeup;
  const sessionNum = s.slotName || 'Session';
  const sessionLabel = isMakeup ? (s.slotName ? `Make-Up Session: ${s.slotName}` : 'Make-up Session') : sessionNum;

  currentTab = 'logsheet';
  currentLogsheetData = { sessionId, sessionNum, date, timeStart, timeEnd, mentees: s.mentees || [], proofFilePath: s.proofFilePath || null, proofFileType: s.proofFileType || '', logStatus, isMakeup };

  document.getElementById('lmSessionLabel').textContent    = sessionLabel;
  document.getElementById('lmSubtitle').textContent        = `${date} · ${timeStart} – ${timeEnd} · ${topic}`;
  document.getElementById('logsheetOverlay').style.display = 'flex';

  const badge = document.getElementById('lmLogStatusBadge');
  if (badge) {
    if (logStatus === 'Submitted') {
      badge.textContent   = '✓ Submitted';
      badge.className     = 'lm-logstatus-badge lm-logstatus--submitted';
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  const printBtn = document.querySelector('#logsheetOverlay .lm-footer .btn-primary');
  if (printBtn) printBtn.disabled = logStatus !== 'Submitted';

  setActiveTab('logsheet');

  if (logStatus !== 'Submitted') {
    document.getElementById('tabContent').innerHTML = `
      <div class="lm-not-submitted">
        <div class="lm-ns-icon"><i class="ti ti-clock-pause"></i></div>
        <div class="lm-ns-title">Logsheet Not Submitted</div>
        <div class="lm-ns-body">The mentor has not submitted this logsheet yet.</div>
      </div>`;
    return;
  }

  renderCurrentTab();
}

function closeLogsheet(e) {
  if (e && e.target !== document.getElementById('logsheetOverlay')) return;
  document.getElementById('logsheetOverlay').style.display = 'none';
}

function switchTab(tab) {
  currentTab = tab;
  setActiveTab(tab);
  renderCurrentTab();
}

function setActiveTab(tab) {
  document.querySelectorAll('#logsheetOverlay .lm-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
}

function renderCurrentTab() {
  if (!currentLogsheetData) return;
  const { mentees, sessionNum, date, timeStart, timeEnd, isMakeup } = currentLogsheetData;
  if      (currentTab === 'logsheet')  renderLogsheetTabModal(mentees, sessionNum, date, timeStart, timeEnd, isMakeup);
  else if (currentTab === 'notes')     renderNotesTabModal(mentees, date, isMakeup);
  else if (currentTab === 'nonattend') renderNonAttendanceTabModal(mentees, sessionNum, date, isMakeup);
}

function faithHeaderModal() {
  return `
    <div class="paper-header">
      <img src="/IMAGES/FAITH-Colleges-Logo.png" class="paper-logo-img" onerror="this.style.display='none'"/>
      <div class="paper-program">MENTORING PROGRAM</div>
      <div class="paper-program">${LogsheetData.periodLabel(allSessions.find(s => s.sessionID === currentLogsheetData?.sessionId) || {})}</div>
    </div>`;
}

// ── FORM 1: MENTORING LOGSHEET ─────────────────────────────────
function renderLogsheetTabModal(mentees, sessionNum, date, timeStart, timeEnd, isMakeup) {
  const sessionLabel = isMakeup ? (sessionNum && sessionNum !== 'Session' ? `Make-Up: ${sessionNum}` : 'Make-Up') : sessionNum;
  const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);

  const hasProof = !!currentLogsheetData.proofFilePath;
  const mentorSigHtml = logMentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(logMentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const mentorName = logMentor ? `${logMentor.firstName} ${logMentor.lastName}` : '—';

  const dataRows = present.map(m => {
    // A merged mentee carries their own source session's date
    // (_attendedDate) and proof status (_hasProof), falling back to this
    // card's own for the normal, unmerged case.
    const mDateStr  = m._attendedDate ? lsFmtDateShort(m._attendedDate) : date;
    const mHasProof = m._hasProof !== undefined ? m._hasProof : hasProof;
    const sigHtml = (mHasProof && m.signatureFilePath)
      ? `<img src="${CONFIG.getFileUrl(m.signatureFilePath)}" style="max-height:44px;max-width:120px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode('—'))">`
      : '';
    return `
    <tr>
      <td>${mDateStr}</td>
      <td>${lsEsc(m.menteeName)}</td>
      <td>${LogsheetData.time(m.scannedAt)}</td>
      <td>${LogsheetData.time(m._attendedEndTime)}</td>
      <td class="sig-cell">${sigHtml}</td>
      <td>${lsEsc(m.remarks || '')}</td>
    </tr>`;
  }).join('');

  const blankCount = Math.max(0, mentees.length - present.length);
  const blankRows  = Array(blankCount).fill(
    '<tr><td></td><td></td><td></td><td></td><td class="sig-cell"></td><td></td></tr>'
  ).join('');

  document.getElementById('tabContent').innerHTML = `
    <div class="paper-form">
      ${faithHeaderModal()}
      <div class="paper-form-title">MENTORING LOGSHEET</div>
      <div class="paper-session-label">
        <span class="paper-session-underline">${sessionLabel}</span> Session
      </div>
      <div class="paper-table-wrap">
        <table class="paper-table">
          <thead>
            <tr>
              <th style="width:70px">DATE</th>
              <th style="width:180px">MENTEE'S NAME</th>
              <th style="width:85px">TIME START</th>
              <th style="width:85px">TIME END</th>
              <th style="width:85px">SIGNATURE</th>
              <th>REMARKS</th>
            </tr>
          </thead>
          <tbody>${dataRows}${blankRows}</tbody>
        </table>
      </div>
      <div class="paper-sig-row">
        <div class="paper-sig-block wide">
          <div class="paper-sig-fit">${mentorSigHtml}<div class="paper-sig-value">${lsEsc(mentorName)}</div></div>
          <div class="paper-sig-line"></div>
          <div class="paper-sig-label">Mentor's Signature over printed name</div>
        </div>
        <div class="paper-sig-block paper-date-block">
          <div class="paper-sig-line"></div>
          <div class="paper-sig-label">DATE</div>
        </div>
      </div>
    </div>`;
}

// ── FORM 2: MENTOR'S NOTES ─────────────────────────────────────
function renderNotesTabModal(mentees, date, isMakeup) {
  const mentorSigHtml = logMentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(logMentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const mentorName = logMentor ? `${logMentor.firstName} ${logMentor.lastName}` : '—';
  const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);
  const absent  = mentees.filter(m => LogsheetData.attendanceState(m) === false);

  const presentEntries = present.map(m => {
    const mDateStr  = m._attendedDate ? lsFmtDateShort(m._attendedDate) : date;
    const noteContent = m.mentorNotes
      ? `<div class="note-line note-line-pre">${lsEsc(m.mentorNotes)}</div><div class="note-line"></div>`
      : `<div class="note-line"></div><div class="note-line"></div>`;
    return `
      <div class="note-entry">
        <div class="note-entry-header">
          <div class="note-field"><strong>Mentee's Name:</strong> <span class="note-field-val">${lsEsc(m.menteeName)}</span></div>
          <div class="note-field"><strong>Date of Mentoring:</strong> <span class="note-field-val">${mDateStr}</span></div>
        </div>
        ${noteContent}
      </div>`;
  });

  for (let i = 0; i < absent.length; i++) {
    presentEntries.push(`
      <div class="note-entry">
        <div class="note-entry-header">
          <div class="note-field"><strong>Mentee's Name:</strong> <span class="note-field-blank"></span></div>
          <div class="note-field"><strong>Date of Mentoring:</strong> <span class="note-field-blank"></span></div>
        </div>
        <div class="note-line"></div><div class="note-line"></div>
      </div>`);
  }

  const entries = presentEntries.length
    ? presentEntries.join('')
    : `<div style="text-align:center;padding:24px;color:#9ca3af;">No mentees for this session.</div>`;

  document.getElementById('tabContent').innerHTML = `
    <div class="paper-form">
      <div class="guidance-copy-label">GUIDANCE COPY</div>
      <div class="paper-header">
        <img src="/IMAGES/FAITH-Colleges-Logo.png" class="paper-logo-img" onerror="this.style.display='none'"/>
      </div>
      <div class="paper-form-title" style="text-decoration:none">MENTOR'S NOTES</div>
      <div class="note-entries">${entries}</div>
      <div class="paper-sig-row">
        <div class="paper-sig-block wide">
          <div class="paper-sig-fit">${mentorSigHtml}<div class="paper-sig-value">${lsEsc(mentorName)}</div></div>
          <div class="paper-sig-line"></div>
          <div class="paper-sig-label">Mentor's Signature over printed name</div>
        </div>
        <div class="paper-sig-block paper-date-block">
          <div class="paper-sig-line"></div>
          <div class="paper-sig-label">DATE</div>
        </div>
      </div>
    </div>`;
}

// ── FORM 3: NON-ATTENDANCE REPORT ──────────────────────────────
function renderNonAttendanceTabModal(mentees, sessionNum, date, isMakeup) {
  const sessionRef    = isMakeup ? (sessionNum && sessionNum !== 'Session' ? `Make-Up Session: ${sessionNum}` : 'Make-Up Session') : sessionNum;
  const mentorSigHtml = logMentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(logMentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const mentorName = logMentor ? `${logMentor.firstName} ${logMentor.lastName}` : '—';
  const absent = mentees.filter(m => LogsheetData.attendanceState(m) === false);

  const dataRows = absent.map(m => `
    <tr><td>${lsEsc(m.menteeName)}</td><td>${lsEsc(m.sectionCode || '')}</td><td>${lsEsc(m.absenceReason || '')}</td></tr>`).join('');
  const blankCount = Math.max(0, 15 - absent.length);
  const blankRows  = Array(blankCount).fill('<tr><td></td><td></td><td></td></tr>').join('');

  const tableSection = absent.length || blankCount
    ? `<div class="paper-table-wrap">
        <table class="paper-table">
          <thead><tr><th style="width:40%">NAME</th><th style="width:25%">COURSE</th><th>REASON</th></tr></thead>
          <tbody>${dataRows}${blankRows}</tbody>
        </table>
      </div>
      <p class="na-note">Please use another separate sheet if the space provided is not enough.</p>
      <p class="na-note">Thank you.</p>`
    : `<div class="na-all-present">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        No recorded absences for this session.
      </div>`;

  document.getElementById('tabContent').innerHTML = `
    <div class="paper-form">
      <div class="paper-header">
        <img src="/IMAGES/FAITH-Colleges-Logo.png" class="paper-logo-img" onerror="this.style.display='none'"/>
        <div class="paper-program" style="font-weight:700">MENTORING PROGRAM</div>
      </div>
      <div class="paper-form-title" style="text-decoration:none">NON-ATTENDANCE OF MENTEES</div>
      <div class="paper-program-sub">${LogsheetData.periodLabel(allSessions.find(s => s.sessionID === currentLogsheetData?.sessionId) || {})}</div>
      <div class="na-instruction">
        <p><strong>Dear Mentors,</strong></p>
        <p style="margin-top:6px;">Kindly list down the name/s of those who did not attend your scheduled mentoring session.
        Please submit this form to ${lsEsc(guidanceOfficer)} at the Guidance Office. Thank you!</p>
      </div>
      <div class="paper-sig-row">
        <div class="paper-sig-block wide">
          <div class="paper-sig-fit">${mentorSigHtml}<div class="paper-sig-value">${lsEsc(mentorName)}</div></div>
          <div class="paper-sig-line"></div>
          <div class="paper-sig-label">Mentor's Signature over printed name</div>
        </div>
      </div>
      ${tableSection}
      <div class="na-ack">
        <div class="na-ack-title">ACKNOWLEDGEMENT RECEIPT</div>
        <div class="na-ack-sub">MENTOR'S REPORT</div>
        <div class="na-ack-fields">
          <div class="na-ack-field"><span class="na-field-label">NAME OF MENTOR:</span><span class="ack-val">${lsEsc(mentorName)}</span></div>
          <div class="na-ack-field"><span class="na-field-label">MENTORING SESSION:</span><span class="ack-val">${sessionRef} — ${date}</span></div>
          <div class="na-ack-field"><span class="na-field-label">DATE SUBMITTED:</span><span class="ack-val">${submittedDate}</span></div>
          <div class="na-ack-field"><span class="na-field-label">RECEIVED BY:</span><span class="ack-val ack-blank"></span></div>
          <div class="na-ack-field"><span class="na-field-label">DATE RECEIVED:</span><span class="ack-val ack-blank"></span></div>
        </div>
      </div>
    </div>`;
}

// Prints whichever tab is currently active in the modal, reusing the
// existing print-window builders (buildPrintForm/buildMentorNotesForm/
// buildNonAttendanceForm) -- same "Print / Export PDF" button Admin's
// modal has.
function printCurrentTab() {
  if (!currentLogsheetData) return;
  headExportOne(currentLogsheetData.sessionId, currentTab === 'nonattend' ? 'nonattend' : currentTab === 'notes' ? 'notes' : 'logsheet');
}

// ── Proof Preview Modal ───────────────────────────────────────
// Entry point for a checkpoint row's Proof pill — a single source opens
// straight into the normal single-photo modal (openProofModal, unchanged),
// but 2+ sources (a checkpoint with proof from more than one round/
// booking) show a thumbnail grid first instead of a photo pill per source
// lined up across the row card. Clicking a thumbnail drills into that one
// photo via the same openProofModal used everywhere else.
function openProofGallery(sources) {
  if (!sources || !sources.length) return;
  if (sources.length === 1) { openProofModal(sources[0].filePath); return; }

  const body    = document.getElementById('proofModalBody');
  const download = document.getElementById('proofModalDownload');
  const overlay = document.getElementById('proofModalOverlay');
  if (!body || !overlay) return;
  if (download) download.style.display = 'none';

  body.innerHTML = `
    <div class="proof-gallery-grid">
      ${sources.map(p => {
        const url = CONFIG.getFileUrl(p.filePath);
        const ext = (p.filePath.split('.').pop() || '').toLowerCase();
        return `
          <button type="button" class="proof-gallery-item" onclick="openProofModal(${jsonAttr(p.filePath)})">
            ${ext === 'pdf'
              ? `<div class="proof-gallery-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>`
              : `<img src="${url}" alt="${escapeHtml(p.label || 'Proof')}"/>`}
            ${p.label ? `<span class="proof-gallery-item-label">${escapeHtml(p.label)}</span>` : ''}
          </button>`;
      }).join('')}
    </div>`;

  overlay.classList.add('open');
}

function openProofModal(proofPath) {
  const body     = document.getElementById('proofModalBody');
  const download = document.getElementById('proofModalDownload');
  const overlay  = document.getElementById('proofModalOverlay');
  if (!body || !download || !overlay) return;

  const ext = (proofPath.split('.').pop() || '').toLowerCase();
  const url = CONFIG.getFileUrl(proofPath);
  body.innerHTML = ext === 'pdf'
    ? `<iframe src="${url}"></iframe>`
    : `<img src="${url}" alt="Session proof"/>`;

  download.href = CONFIG.getUrl(`ProofOfSession/download?path=${encodeURIComponent(proofPath)}`);
  overlay.classList.add('open');
}

function closeProofModal() {
  const overlay = document.getElementById('proofModalOverlay');
  if (overlay) overlay.classList.remove('open');
  const body = document.getElementById('proofModalBody');
  if (body) body.innerHTML = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProofModal(); });

// ── Logsheet print helpers ────────────────────────────────────
function lsFmtDateShort(value) { return LogsheetData.day(value); }
function lsFmtTimeSpan(ts) {
  if (!ts) return null;
  const parts = ts.split(':');
  if (parts.length < 2) return null;
  let h = parseInt(parts[0]), m = parseInt(parts[1]);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}
function lsFmtTime(value) { return LogsheetData.time(value); }
function lsEsc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function lsIsMakeup(session) {
  return session.isMakeup === true || session.IsMakeup === true;
}

function buildPrintForm(session, mentor, label) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const timeStart    = LogsheetData.time(session.actualStart) || '—';
  const timeEnd      = LogsheetData.time(session.actualEnd) || '—';
  const dateStr      = lsFmtDateShort(session.sessionDate);
  const logoUrl      = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const sessionLabel = lsIsMakeup(session)
    ? (session.slotName ? `Make-Up: ${session.slotName}` : 'Make-Up')
    : (session.slotName || 'Session');

  // Matches Mentor's and Admin's own print forms: a mentee's signature only
  // ever appears once the mentor has uploaded a proof photo for this
  // session — this table was hard-coding an empty sig-cell regardless,
  // so a mentee's signature never printed here even with proof on file.
  const hasProof = !!session.proofFilePath;

  const presentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);
  const rows = presentMentees.map(m => {
    // A merged mentee (see mergeRoundsForLogsheet) carries the date of the
    // round they actually attended, which may differ from round 1's date
    // shown at the top of the form.
    const mDateStr  = m._attendedDate ? lsFmtDateShort(m._attendedDate) : dateStr;
    const mHasProof = m._hasProof !== undefined ? m._hasProof : hasProof;
    const sigHtml = (mHasProof && m.signatureFilePath)
      ? `<img src="${CONFIG.getFileUrl(m.signatureFilePath)}" style="max-height:44px;max-width:120px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode('—'))">`
      : '';
    return `
    <tr>
      <td>${mDateStr}</td>
      <td>${lsEsc(m.menteeName)}</td>
      <td>${LogsheetData.time(m.scannedAt)}</td>
      <td>${LogsheetData.time(m._attendedEndTime)}</td>
      <td class="sig-cell">${sigHtml}</td>
      <td>${lsEsc(m.remarks || '')}</td>
    </tr>`;
  }).join('');

  const blankCount = Math.max(0, (session.mentees || []).length - presentMentees.length);
  const blankRows  = Array(blankCount).fill('<tr><td></td><td></td><td></td><td></td><td class="sig-cell"></td><td></td></tr>').join('');

  return `
    <div class="form-page">
      <div class="header">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
        <div class="sub">MENTORING PROGRAM</div>
        <div class="sub">${label}</div>
        <div class="doc-title">MENTORING LOGSHEET</div>
      </div>
      <div class="session-label">
        <span class="session-underline">${sessionLabel}</span> Session
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:80px">DATE</th>
            <th style="width:200px">MENTEE'S NAME</th>
            <th style="width:90px">TIME START</th>
            <th style="width:90px">TIME END</th>
            <th style="width:90px">SIGNATURE</th>
            <th>REMARKS</th>
          </tr>
        </thead>
        <tbody>${rows}${blankRows}</tbody>
      </table>
      <div class="form-footer">
        <div class="sig-block">
          <div class="sig-fit">${mentorSigHtml}<div class="sig-name">${lsEsc(mentorName)}</div></div>
          <div class="sig-line"></div>
          <div class="sig-role">Mentor's Signature over printed name</div>
        </div>
        <div class="sig-block date-block">
          <div class="sig-line"></div>
          <div class="sig-role">DATE</div>
        </div>
      </div>
    </div>`;
}

function buildMentorNotesForm(session, mentor, label) {
  const mentorName     = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml  = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const dateStr        = lsFmtDateShort(session.sessionDate);
  const logoUrl        = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const presentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);

  const entries = presentMentees.map(m => {
    const mDateStr  = m._attendedDate ? lsFmtDateShort(m._attendedDate) : dateStr;
    const notesLine = m.mentorNotes
      ? `<div class="note-line-pre">${lsEsc(m.mentorNotes)}</div><div class="note-line"></div>`
      : `<div class="note-line"></div><div class="note-line"></div>`;
    return `
      <div class="note-entry">
        <div class="note-entry-header">
          <div class="note-field"><strong>Mentee's Name:</strong> <span class="note-field-val">${lsEsc(m.menteeName)}</span></div>
          <div class="note-field"><strong>Date of Mentoring:</strong> <span class="note-field-val">${mDateStr}</span></div>
        </div>
        ${notesLine}
      </div>`;
  });

  const blankCount = Math.max(0, (session.mentees || []).length - presentMentees.length);
  for (let i = 0; i < blankCount; i++) {
    entries.push(`
      <div class="note-entry">
        <div class="note-entry-header">
          <div class="note-field"><strong>Mentee's Name:</strong> <span class="note-field-blank"></span></div>
          <div class="note-field"><strong>Date of Mentoring:</strong> <span class="note-field-blank"></span></div>
        </div>
        <div class="note-line"></div><div class="note-line"></div>
      </div>`);
  }

  return `
    <div class="notes-page">
      <div class="guidance-copy">GUIDANCE COPY</div>
      <div class="header">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
        <div class="doc-title" style="text-decoration:none;margin-top:2px;font-size:13px;">MENTOR'S NOTES</div>
        <div class="sub">${label}</div>
      </div>
      <div class="note-entries">${entries.join('')}</div>
      <div class="notes-footer">
        <div class="notes-sig-block">
          <div class="sig-fit">${mentorSigHtml}<div class="notes-sig-name">${lsEsc(mentorName)}</div></div>
          <div class="notes-sig-line"></div>
          <div class="notes-sig-role">Mentor's Signature over printed name</div>
        </div>
        <div class="notes-sig-block notes-date-block">
          <div class="notes-sig-line"></div>
          <div class="notes-sig-role">DATE</div>
        </div>
      </div>
    </div>`;
}

function buildNonAttendanceForm(session, mentor, label) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const dateStr       = lsFmtDateShort(session.sessionDate);
  // Distinct from dateStr (the session's own date) — this is when it was submitted.
  const submittedDateStr = session.submittedAt ? lsFmtDateShort(session.submittedAt) : '—';
  const logoUrl       = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const absentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === false);
  const sessionRef    = lsIsMakeup(session)
    ? (session.slotName ? `Make-Up Session: ${session.slotName}` : 'Make-Up Session')
    : (session.slotName || 'Session');

  const dataRows = absentMentees.map(m => `
    <tr>
      <td>${lsEsc(m.menteeName)}</td>
      <td>${lsEsc(m.sectionCode || '')}</td>
      <td>${lsEsc(m.absenceReason || '')}</td>
    </tr>`).join('');

  const blankRows = Array(Math.max(0, 15 - absentMentees.length))
    .fill('<tr><td></td><td></td><td></td></tr>').join('');

  return `
    <div class="na-page">
      <div class="header">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
        <div class="sub">MENTORING PROGRAM</div>
        <div class="doc-title">NON-ATTENDANCE OF MENTEES</div>
        <div class="sub">${label}</div>
      </div>
      <div class="na-letter">
        <p><strong>Dear Mentors,</strong></p>
        <p>Kindly list down the name/s of those who did not attend your scheduled mentoring session.
        Please submit this form to ${lsEsc(guidanceOfficer)} at the Guidance Office. Thank you!</p>
      </div>
      <div class="sig-block" style="max-width:240px;margin:10px 0 16px;">
        <div class="sig-fit">${mentorSigHtml}<div class="sig-name">${lsEsc(mentorName)}</div></div>
        <div class="sig-line"></div>
        <div class="sig-role">Mentor's Signature over printed name</div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:40%">NAME</th>
            <th style="width:25%">COURSE</th>
            <th>REASON</th>
          </tr>
        </thead>
        <tbody>${dataRows}${blankRows}</tbody>
      </table>
      <p class="na-note">Please use another separate sheet if the space provided is not enough.</p>
      <div class="na-ack">
        <div class="na-ack-title">ACKNOWLEDGEMENT RECEIPT</div>
        <div class="na-ack-sub">MENTOR'S REPORT</div>
        <div class="na-ack-fields">
          <div class="na-ack-field"><span class="na-field-label">NAME OF MENTOR:</span><span class="ack-val">${lsEsc(mentorName)}</span></div>
          <div class="na-ack-field"><span class="na-field-label">MENTORING SESSION:</span><span class="ack-val">${sessionRef} — ${dateStr}</span></div>
          <div class="na-ack-field"><span class="na-field-label">DATE SUBMITTED:</span><span class="ack-val">${submittedDateStr}</span></div>
          <div class="na-ack-field"><span class="na-field-label">RECEIVED BY:</span><span class="ack-val ack-blank"></span></div>
          <div class="na-ack-field"><span class="na-field-label">DATE RECEIVED:</span><span class="ack-val ack-blank"></span></div>
        </div>
      </div>
    </div>`;
}

// Delegates to the shared print stylesheet (print-logsheet-styles.js,
// loaded via <script> on this page) so Mentor, Admin, and Head all print
// from the exact same CSS source instead of three hand-copied versions
// that could quietly drift apart.
function getPrintStyles() {
  return getLogsheetPrintStyles('#0f766e', '#0d6560');
}

function headOpenPrintWindow(title, body) {
  const w = window.open('', '_blank', 'width=960,height=760');
  if (!w) { showToast('Pop-up blocked. Please allow pop-ups and try again.'); return; }
  w.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>${escapeHtml(title)}</title>
<style>${getPrintStyles()}</style></head>
<body>
  <div class="action-bar">
    <span class="action-bar-title">${escapeHtml(title)}</span>
    <div style="display:flex;gap:8px;">
      <button class="ab-btn ab-btn-print" onclick="window.print()">&#128438; Print / Save as PDF</button>
      <button class="ab-btn ab-btn-close" onclick="window.close()">&#10005; Close</button>
    </div>
  </div>
  <div class="print-wrap">${body}</div>
</body></html>`);
  w.document.close();
}

function headTogglePrintMenu(sid) {
  const menu = document.getElementById(`headPrintMenu-${sid}`);
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  headClosePrintMenu();
  if (!isOpen) menu.classList.add('open');
}

function headClosePrintMenu() {
  document.querySelectorAll('.print-dropdown.open').forEach(m => m.classList.remove('open'));
}

function headExportOne(sessionId, formType) {
  const session = logsheetMap[sessionId];
  if (!session) return;
  const mentor     = logMentor;
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '';
  const displayNum = lsIsMakeup(session)
    ? (session.slotName ? `Make-Up: ${session.slotName}` : 'Make-Up')
    : (session.slotName || 'Session');

  let body, title;
  if (formType === 'notes') {
    body  = buildMentorNotesForm(session, mentor, LogsheetData.periodLabel(session));
    title = `Mentor's Notes — ${displayNum} Session${mentorName ? ` (${mentorName})` : ''}`;
  } else if (formType === 'nonattend') {
    body  = buildNonAttendanceForm(session, mentor, LogsheetData.periodLabel(session));
    title = `Non-Attendance — ${displayNum} Session${mentorName ? ` (${mentorName})` : ''}`;
  } else {
    body  = buildPrintForm(session, mentor, LogsheetData.periodLabel(session));
    title = `Logsheet — ${displayNum} Session${mentorName ? ` (${mentorName})` : ''}`;
  }
  headOpenPrintWindow(title, body);
}

// ── PRINT ALL SESSIONS ────────────────────────────────────────
// Same idea as Admin's Sessions Detail and Mentor's own Logsheet page —
// only here it's simpler: logsheetMap already holds every session's
// mentee data upfront (loaded once in loadDetail()), so there's no need
// to fetch anything per session, just concatenate each Submitted
// session's already-built form (buildPrintForm() etc. already emit
// page-break-after CSS per page, via getPrintStyles()).
function headExportAll(formType) {
  const sessions = allSessions
    .map(s => logsheetMap[s.sessionID || s.SessionID])
    .filter(s => s && s.logStatus === 'Submitted');
  if (!sessions.length) { showToast('No submitted logsheets to print yet.'); return; }

  const mentor     = logMentor;
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '';

  let body, title;
  if (formType === 'all') {
    // Each session's full set: Logsheet, Mentor's Notes, Non-Attendance.
    body  = sessions.map(s => buildPrintForm(s, mentor, LogsheetData.periodLabel(s))
      + buildMentorNotesForm(s, mentor, LogsheetData.periodLabel(s))
      + buildNonAttendanceForm(s, mentor, LogsheetData.periodLabel(s))).join('');
    title = `All Forms — All Sessions${mentorName ? ` (${mentorName})` : ''}`;
  } else if (formType === 'notes') {
    body  = sessions.map(s => buildMentorNotesForm(s, mentor, LogsheetData.periodLabel(s))).join('');
    title = `Mentor's Notes — All Sessions${mentorName ? ` (${mentorName})` : ''}`;
  } else if (formType === 'nonattend') {
    body  = sessions.map(s => buildNonAttendanceForm(s, mentor, LogsheetData.periodLabel(s))).join('');
    title = `Non-Attendance — All Sessions${mentorName ? ` (${mentorName})` : ''}`;
  } else {
    body  = sessions.map(s => buildPrintForm(s, mentor, LogsheetData.periodLabel(s))).join('');
    title = `Mentoring Logsheet — All Sessions${mentorName ? ` (${mentorName})` : ''}`;
  }
  headOpenPrintWindow(title, body);
}

document.addEventListener('click', () => headClosePrintMenu());

// ── Mentees Accordion ─────────────────────────────────────────
function applyMenteeFilter() { renderMentees(); }

function renderMentees() {
  const search  = (document.getElementById('menteeSearch')?.value || '').toLowerCase();
  const el      = document.getElementById('menteeAccordion');

  let filtered = allMentees.filter(m => {
    const name = `${m.firstName || ''} ${m.lastName || ''}`.toLowerCase();
    return !search || name.includes(search) || (m.studentNumber || '').toLowerCase().includes(search);
  });

  const n = filtered.length;
  document.getElementById('menteeCount').textContent = `${n} mentee${n !== 1 ? 's' : ''}`;

  if (!n) {
    el.innerHTML = '<div class="mentee-card-empty">No mentees match the current filters.</div>';
    return;
  }

  // Group by section
  const sections = {};
  filtered.forEach(m => {
    const sec = m.sectionCode || m.SectionCode || 'Unassigned';
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(m);
  });

  el.innerHTML = Object.entries(sections).map(([sec, mentees]) => `
    <div class="sec-group open">
      <button class="sec-group-header" onclick="this.parentElement.classList.toggle('open')">
        <div class="sec-group-left">
          <span class="sec-group-name">${escapeHtml(sec)}</span>
          <span class="sec-group-count">${mentees.length} mentee${mentees.length !== 1 ? 's' : ''}</span>
        </div>
        <svg class="sec-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
      <div class="sec-group-body">
        <div class="mentee-cards-grid">
          ${mentees.map((m, i) => renderMenteeCard(m, i)).join('')}
        </div>
      </div>
    </div>`).join('');
}

// Small boxes, several per row — just identity (who's assigned), not
// attendance data (that duplicated Attendance Detail; see the "View
// Attendance Details" link above instead). Reuses the .mentee-card/.mcard-*
// grid already defined in monitor-activities.css, just without its
// attendance-bar section (.mcard-att), which this page has no use for.
function renderMenteeCard(m, i) {
  const first    = m.firstName     || m.FirstName     || '';
  const last     = m.lastName      || m.LastName      || '';
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || '—';
  const stuNum   = m.studentNumber || m.StudentNumber || '—';
  const isDropOut= m.isDropOut     ?? m.IsDropOut      ?? false;
  const email    = m.email         || m.Email          || '';
  const course   = m.course        || m.Course         || '';
  const yearLvl  = m.yearLevel     || m.YearLevel      || '';
  const courseYear = [course, yearLvl].filter(Boolean).join(' · ');

  return `
    <div class="mentee-card">
      <div class="mcard-top">
        <div class="mcard-avatar av-${i % 6}">${escapeHtml(initials)}</div>
        <div class="mcard-info">
          <div class="mcard-name">${escapeHtml(first)} ${escapeHtml(last)}</div>
          <div class="mcard-sub">${escapeHtml(stuNum)}</div>
          ${courseYear ? `<div class="mcard-meta">${escapeHtml(courseYear)}</div>` : ''}
          ${email ? `<div class="mcard-email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>${escapeHtml(email)}</div>` : ''}
        </div>
      </div>
      ${isDropOut ? '<span style="align-self:flex-start;background:#fee2e2;color:#dc2626;font-size:10px;font-weight:600;padding:2px 7px;border-radius:99px;">Dropped Out</span>' : ''}
    </div>`;
}
