let statusCalendar = [];
// ===== SESSIONS DETAIL JS =====

let mentorId = null;
let currentMentorName = '';
let currentMentorSig  = '';
let currentTab = 'logsheet';
let currentLogsheetData = null;
let allSessions = [];
let sysSettings = {
  SchoolYear:       '2026-2027',
  Semester:         '1st Semester',
  GuidanceOfficer:  'Guidance Officer'
};

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Critical';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  const params = new URLSearchParams(window.location.search);
  mentorId = parseInt(params.get('id'), 10);
  if (!mentorId) { window.location.href = 'sessions.html'; return; }

  loadSettings().then(() => loadDetail());

  document.getElementById('topicSearch').addEventListener('input', applyDetailFilters);
  document.getElementById('sectionFilter').addEventListener('change', applyDetailFilters);
  document.getElementById('statusFilter').addEventListener('change', applyDetailFilters);
  document.getElementById('periodFilter').addEventListener('change', applyDetailFilters);

  // Close the "Print All" dropdown on any click outside it (the button
  // group itself stops propagation, so this only fires for real outside clicks).
  document.addEventListener('click', closePrintAllMenu);
});

// ── SETTINGS ──────────────────────────────────────────────────
async function loadSettings() {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    if (data) sysSettings = { ...sysSettings, ...data };
  } catch (e) { /* use defaults */ }
}

// ── LOAD ──────────────────────────────────────────────────────
async function loadDetail() {
  try {
    const [sessData, monData, calendar] = await Promise.all([
      apiRequest(`SessionsAdmin/${mentorId}/sessions`, 'GET', null, true),
      apiRequest(`MonitorActivities/${mentorId}`, 'GET', null, true).catch(() => null),
      apiRequest('CalendarEvents', 'GET', null, true).catch(() => []),
    ]);

    statusCalendar = calendar || [];
    renderHero(sessData.mentor, monData);

    const logsheet = await apiRequest(`SessionsAdmin/${mentorId}/logsheet`, 'GET', null, true);
    allSessions = await LogsheetData.withReportStatuses(LogsheetData.rows(logsheet.sessions || [], sessData.sessions || []), mentorId);
    buildSectionFilter();
    populatePeriodFilter();
    renderSessions(allSessions);

  } catch (e) {
    console.error('Error loading sessions detail:', e);
    showErrorModal('Failed to load session data. Please refresh.');
  }
}

// ── SECTION DROPDOWN ─────────────────────────────────────────
function buildSectionFilter() {
  const sections = [...new Set(
    allSessions.flatMap(s => (s.sections || '').split(',').map(x => x.trim()).filter(Boolean))
  )].sort();

  const sel = document.getElementById('sectionFilter');
  sections.forEach(sec => {
    const opt = document.createElement('option');
    opt.value = sec; opt.textContent = sec;
    sel.appendChild(opt);
  });
}

// ── DETAIL FILTERS ────────────────────────────────────────────
// Sessions already carry their own SchoolYear/Semester from the moment
// they're created, so past periods stay intact even after Admin rolls
// System Settings forward — this surfaces that as a filter instead of
// always mixing every school year/semester into one list.
function populatePeriodFilter() {
  const sel = document.getElementById('periodFilter');
  const seen = new Set();
  const periods = [];
  allSessions.forEach(s => {
    if (!s.schoolYear || !s.semester) return;
    const key = `${s.schoolYear}|${s.semester}`;
    if (seen.has(key)) return;
    seen.add(key);
    periods.push({ schoolYear: s.schoolYear, semester: s.semester, key });
  });
  periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));

  const prevValue = sel.value;
  sel.innerHTML = '<option value="">All School Years</option>' +
    periods.map(p => `<option value="${p.key}">${p.semester}, SY ${p.schoolYear}</option>`).join('');
  if (periods.some(p => p.key === prevValue)) sel.value = prevValue;
}

function applyDetailFilters() {
  const q       = document.getElementById('topicSearch').value.trim().toLowerCase();
  const section = document.getElementById('sectionFilter').value;
  const status  = document.getElementById('statusFilter').value;
  const period  = document.getElementById('periodFilter').value;

  const filtered = allSessions.filter(s => {
    if (q && !(s.topic || '').toLowerCase().includes(q)) return false;
    if (status && sessionDisplayStatus(s, statusCalendar) !== status) return false;
    if (period && `${s.schoolYear}|${s.semester}` !== period) return false;
    if (section) {
      const sessionSections = (s.sections || '').split(',').map(x => x.trim());
      if (!sessionSections.includes(section)) return false;
    }
    return true;
  });

  renderSessions(filtered);
}

function resetDetailFilters() {
  document.getElementById('topicSearch').value   = '';
  document.getElementById('sectionFilter').value = '';
  document.getElementById('statusFilter').value  = '';
  document.getElementById('periodFilter').value  = '';
  renderSessions(allSessions);
}

// ── HERO ──────────────────────────────────────────────────────
function renderHero(mentor, monData) {
  if (!mentor) return;
  const initials = ((mentor.firstName?.[0] || '') + (mentor.lastName?.[0] || '')).toUpperCase();
  const avIdx    = avatarIndex(mentor.firstName + mentor.lastName);
  currentMentorName = `${mentor.firstName} ${mentor.lastName}`;
  currentMentorSig  = mentor.signatureFilePath || '';

  document.getElementById('heroAvatar').textContent = initials;
  document.getElementById('heroAvatar').className   = `hero-avatar av-${avIdx}`;
  document.getElementById('heroName').textContent   = currentMentorName;

  // Same icon-per-item layout as the Mentor Monitoring detail hero
  // (School, Department, Email), for visual consistency across every
  // "mentor detail" page in the system.
  document.getElementById('heroMeta').innerHTML = [
    mentor.school     && `<span class="hero-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>${escapeHtml(mentor.school)}</span>`,
    mentor.department && `<span class="hero-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>${escapeHtml(mentor.department)}</span>`,
    mentor.email      && `<span class="hero-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${escapeHtml(mentor.email)}</span>`,
  ].filter(Boolean).join('') || 'Mentor';

  // Only the section codes (e.g. "BS EE 1A") — the plain course codes
  // ("BS EE") were redundant, just a substring of the section right next
  // to them.
  const sectionTags = (mentor.sections || '').split(',').map(s => s.trim()).filter(Boolean)
    .map(s => `<span class="hero-section-tag">${escapeHtml(s)}</span>`).join('');

  const tagsHtml = sectionTags ? `<div class="hero-tags">${sectionTags}</div>` : '';

  const heroInfo = document.querySelector('.hero-info');
  const existing = heroInfo.querySelector('.hero-tags');
  if (existing) existing.remove();
  if (tagsHtml) heroInfo.insertAdjacentHTML('beforeend', tagsHtml);

  // Progress badge from monitoring data
  const heroBadge = document.getElementById('heroBadge');
  if (heroBadge && monData?.progressStatus) {
    const cls  = { Excellent:'excellent', 'On Track':'on-track', 'Needs Attention':'needs-attention', 'Not Started':'not-started' };
    const done = monData.completedSessions ?? monData.CompletedSessions ?? 0;
    const tier = mentorTierGroup(monData.progressStatus, done);
    heroBadge.textContent = tier;
    heroBadge.className   = `hero-badge ${cls[tier] || ''}`;
    heroBadge.style.display = '';
    buildSessionProgressTooltip();
    const tipWrap = document.getElementById('sdTipWrap');
    if (tipWrap) tipWrap.style.display = '';
  }

  document.title = `${currentMentorName} — Admin Portal`;
}

// ── SESSION PROGRESS TOOLTIP ─────────────────────────────────
// Describes the mentor's real overall score: Timeliness 25% + Completeness 25% + Evaluation Rating 50%.
function buildSessionProgressTooltip() {
  const box = document.getElementById('sdTipBox');
  if (!box) return;

  box.innerHTML = `
    <div class="sd-tip-title">Overall Performance Guide</div>
    <div class="sd-tip-row">Timeliness (25%) + Completeness (25%) + Evaluation Rating (50%).</div>
    <div class="sd-tip-row"><span class="sd-dot excellent"></span><span><strong>Excellent</strong> &mdash; ≥80%</span></div>
    <div class="sd-tip-row"><span class="sd-dot on-track"></span><span><strong>On Track</strong> &mdash; 50&ndash;79%</span></div>
    <div class="sd-tip-row"><span class="sd-dot needsattention"></span><span><strong>Needs Attention</strong> &mdash; below 50%, with at least one completed session</span></div>
    <div class="sd-tip-row"><span class="sd-dot notstarted"></span><span><strong>Not Started</strong> &mdash; no completed sessions this semester</span></div>`;
}


// Trust the backend's IsMakeup bit alone (SessionRowDto.IsMakeup, from
// sp_GetMentorSessions) — matches HEAD's mentor-detail.js lsIsMakeup(),
// already fixed in an earlier audit for exactly this reason. The old
// "topic starts with a bracket" fallback here was never removed when
// this page was written: a regular session's Topic defaults to plain
// text (Notes, or literally "Mentoring Session") whenever its notes
// don't happen to start with "[SECTION]" — which is the normal case,
// not an edge case — so this silently mislabeled genuine regular
// sessions as "Make-up Session" any time that happened.
function isMakeupSession(s) {
  return s.isMakeup === true || s.IsMakeup === true;
}

// ── MERGE 2ND-ROUND SESSIONS INTO ONE ROW PER CHECKPOINT ────────
// A checkpoint may now have more than one "round" session (round 2+
// logged to catch mentees absent from round 1 — see
// SessionsService.SlotExistsAsync, which allows a same-slot session once
// round 1 is Completed). Which round a mentee attended doesn't matter for
// grading — only whether they attended the checkpoint at all — so this
// page shows ONE row per checkpoint. Mirrors HEAD/JS/mentor-detail.js's
// mergeSessionRows (same SessionRowDto shape, same endpoint). Attaches
// `_rounds` (the full raw round rows) to a merged primary so
// fetchMergedMentees() below knows which sessions to union.
// `makeupBySection` (built in loadDetail, see comment there) carries each
// checkpoint-tagged makeup session's attendees, pre-attributed to their
// own section — folded into the matching group here as `_makeupExtras`
// (kept separate from `_rounds`, which are raw SessionRowDto rows; extras
// are already-fetched {sessionDate, mentees, sourceSessionID} objects, see
// fetchMergedMentees below for how the two get unioned together).
function mergeSessionRows(sessions, makeupBySection = new Map()) {
  const groups      = new Map();
  const passthrough = [];

  for (const s of sessions) {
    if (isMakeupSession(s)) {
      if (!s.slotName) passthrough.push(s); // resolved separately below
      continue;
    }
    if (!s.slotName || !s.sectionCode) { passthrough.push(s); continue; }
    const key = `${s.slotName}|${s.sectionCode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const merged      = [];
  const absorbedIds = new Set();
  for (const [key, rounds] of groups.entries()) {
    const extras = makeupBySection.get(key) || [];
    if (extras.length) extras.forEach(e => absorbedIds.add(e.sourceSessionID));
    if (rounds.length === 1 && extras.length === 0) { merged.push(rounds[0]); continue; }
    const sortedRounds = [...rounds].sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));
    merged.push({
      ...sortedRounds[0],
      roundDates:    [...sortedRounds.map(r => r.sessionDate), ...extras.map(e => e.sessionDate)],
      _rounds:       sortedRounds,
      _makeupExtras: extras,
    });
  }

  // A checkpoint-tagged makeup session whose attendees' section never
  // matched a regular group's key has nothing to fold into — surface it
  // on its own, same as before this feature.
  for (const s of sessions) {
    if (isMakeupSession(s) && s.slotName && !absorbedIds.has(s.sessionID)) {
      passthrough.push(s);
    }
  }

  return [...merged, ...passthrough];
}

// Fetches a session's mentee/attendance list — unioned by menteeID across
// every round in its checkpoint group (`s._rounds`, set by
// mergeSessionRows above) when it has more than one, present in ANY round
// counting as present for the checkpoint, PLUS any checkpoint-tagged
// makeup session already resolved into `s._makeupExtras` (already-fetched
// in loadDetail, reused here rather than fetched twice). A single-round
// session with no makeup contribution (the common case) is just the one
// fetch, unchanged. Each merged mentee entry carries `_attendedDate` (the
// round/booking they were found present in, or their own scannedAt) so a
// mentee who only attended round 2 or a make-up booking prints THAT date,
// not round 1's.
async function fetchMergedMentees(s) {
  if (s._mergedMentees) return s._mergedMentees;
  const isMakeup = isMakeupSession(s);
  const rounds   = s._rounds?.length > 1 ? s._rounds : [s];
  const extras   = s._makeupExtras || [];

  const fetched = await Promise.all(rounds.map(async round => {
    const endpoint = isMakeup
      ? `SessionsAdmin/session/${round.sessionID}/requester`
      : `SessionsAdmin/session/${round.sessionID}/mentees`;
    const mentees = await apiRequest(endpoint, 'GET', null, true);
    return { sessionDate: round.sessionDate, timeEnd: round.timeEnd, proofFilePath: round.proofFilePath, mentees: mentees || [] };
  }));

  const allRounds = [...fetched, ...extras.map(e => ({ sessionDate: e.sessionDate, timeEnd: e.timeEnd, proofFilePath: e.proofFilePath, mentees: e.mentees }))];

  if (allRounds.length === 1) return allRounds[0].mentees;

  // Each mentee also carries which of their own source round/booking had
  // proof uploaded (_hasProof) — a mentee who only attended a makeup round
  // without its own proof shouldn't wrongly get a signature printed just
  // because another round in the group has one. Same for _attendedEndTime:
  // a mentee who attended round 2 or a make-up booking must print THAT
  // round's own end time, not round 1's (they're different sessions with
  // different start/end times, even though they share a checkpoint).
  const byMentee = new Map();
  for (const round of allRounds) {
    for (const m of round.mentees) {
      const existing = byMentee.get(m.menteeID);
      if (!existing || (LogsheetData.attendanceState(m) === true && LogsheetData.attendanceState(existing) !== true)) {
        byMentee.set(m.menteeID, {
          ...m,
          _attendedDate: LogsheetData.scanISO(m.scannedAt),
          _attendedEndTime: round.timeEnd ? fmtTime(round.timeEnd) : null,
          _hasProof: !!round.proofFilePath,
        });
      }
    }
  }
  return [...byMentee.values()];
}

// ── SESSION ROWS ──────────────────────────────────────────────
function renderSessions(sessions) {
  const grid    = document.getElementById('sessionCardsGrid');
  const countEl = document.getElementById('sessionCount');

  countEl.textContent = `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`;

  if (!sessions.length) {
    grid.innerHTML = `<div class="empty-state">No sessions recorded yet.</div>`;
    return;
  }

  grid.innerHTML = sessions.map(s => {
    const date      = s.sessionDate
      ? new Date(s.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const timeStart = LogsheetData.time(s.actualStart);
    const timeEnd   = LogsheetData.time(s.actualEnd);
    const sectionDisplay = (s.sections || '').split(',').map(x => x.trim()).filter(Boolean).join(' · ')
      || (s.topic || 'Mentoring Session').replace(/^\[[^\]]+\]\s*/, '');
    const topic     = s.topic || 'Mentoring Session';
    const displayStatus = sessionDisplayStatus(s, statusCalendar);
    const statusCls = (displayStatus === 'In Progress' ? 'Scheduled' : displayStatus === 'Closed' ? 'Cancelled' : displayStatus).toLowerCase();
    const isMakeup  = isMakeupSession(s);

    // Attendance
    const attVal = s.totalAttendees > 0 ? `${s.presentCount}/${s.totalAttendees} Attendance` : '— Attendance';
    const attCls = s.totalAttendees === 0 ? 'empty'
                 : s.presentCount === s.totalAttendees ? 'full' : 'partial';

    // Proof — a merged checkpoint card can have proof from more than one
    // round/booking (s.proofFilePath is only the primary's own); list every
    // one that actually uploaded a photo instead of just round 1's, so a
    // makeup round's own proof isn't hidden once it folds into this row.
    const proofSources = [...(s._proofSources || [])];
    if (!s._proofSources && s.proofFilePath) proofSources.push({ filePath: s.proofFilePath, fileType: s.proofFileType, label: 'Round 1' });
    (s._rounds || []).slice(1).forEach((r, i) => {
      if (r.proofFilePath) proofSources.push({ filePath: r.proofFilePath, fileType: r.proofFileType, label: `Round ${i + 2}` });
    });
    (s._makeupExtras || []).forEach((e, i) => {
      if (e.proofFilePath) proofSources.push({
        filePath: e.proofFilePath, fileType: e.proofFileType,
        label: (s._makeupExtras.length > 1 ? `Make-up ${i + 1}` : 'Make-up'),
      });
    });
    // One source keeps the original single pill (view + direct download).
    // 2+ sources collapse into one "Proof (N)" pill that opens a thumbnail
    // gallery instead of a pill per round lined up across the row card —
    // download then happens per-photo inside that gallery/lightbox.
    const proofHtml = proofSources.length === 0
      ? `<span class="sr-metric empty sr-metric--no-proof">No Proof</span>`
      : proofSources.length === 1
      ? `<span class="sr-metric proof sr-proof-pill">
           <button type="button" class="sr-proof-view" onclick="event.stopPropagation(); viewProof(${jsonAttr(proofSources[0].filePath)}, ${jsonAttr(proofSources[0].fileType || '')}, ${jsonAttr('Session Proof — ' + date)})">Proof</button>
           <span class="sr-proof-sep">|</span>
           <a class="sr-proof-dl" href="${CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(proofSources[0].filePath))}" onclick="event.stopPropagation()" title="Download proof"><i class="ti ti-download"></i></a>
         </span>`
      : `<span class="sr-metric proof sr-proof-pill">
           <button type="button" class="sr-proof-view sr-proof-view--gallery" onclick="event.stopPropagation(); openProofGallery(${jsonAttr(proofSources)}, ${jsonAttr('Session Proof — ' + date)})">Proof (${proofSources.length})</button>
         </span>`;

    // Logsheet status — Draft is treated as not submitted (invisible to admin)
    const logStatus     = s.logStatus === 'Submitted' ? 'Submitted' : null;
    const deadlineLabel = s.slotName && s.status !== 'Cancelled' ? LogsheetData.reportStatus(s,statusCalendar) : '';
    const deadlineClass = deadlineLabel.includes('Overdue') ? 'overdue'
      : deadlineLabel === 'Submitted Late' ? 'late'
      : deadlineLabel === 'Submitted On Time' ? 'on-time' : 'pending';
    const deadlineBadgeHtml = deadlineLabel ? `<span class="sr-deadline-badge ${deadlineClass}">${escapeHtml(deadlineLabel)}</span>` : '';

    const viewBtnHtml = logStatus === 'Submitted'
      ? `<button class="sr-view-btn" onclick="event.stopPropagation(); openLogsheet(${s.sessionID})">View Logsheet</button>`
      : `<button class="sr-view-btn sr-view-btn--pending" disabled onclick="event.stopPropagation()">View Logsheet</button>`;

    return `
      <div class="session-row ${logStatus === 'Submitted' ? '' : 'sr-row--no-logsheet'}" onclick="${logStatus === 'Submitted' ? `openLogsheet(${s.sessionID})` : ''}">
        <div class="sr-label">
          <div class="sr-title-group">
            <span class="sr-num">${isMakeup ? (s.slotName ? `Make-Up Session: ${s.slotName}` : 'Make-up Session') : (s.slotName || 'Session')}</span>
            ${deadlineBadgeHtml}
          </div>
          <span class="badge-status ${statusCls}">${displayStatus}</span>
        </div>
        <div class="sr-info">
          <div class="sr-section" title="${escapeAttr(topic)}">${escapeHtml(sectionDisplay)}</div>
          <div class="sr-when">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>${date}</span>
            <span class="sr-when-sep">·</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>${timeStart} – ${timeEnd}</span>
          </div>
            ${s.roundDates?.length > 1
              ? `<span class="sr-conducted-note" onclick="event.stopPropagation()" style="cursor:default;" title="${s.roundDates.map(d => fmtDateShort(d)).join(', ')}"><i class="ti ti-repeat" aria-hidden="true"></i>${s.roundDates.length} sessions conducted</span>`
              : ''}
        </div>
        <div class="sr-right">
          <div class="sr-metrics">
            <span class="sr-metric ${attCls}" onclick="event.stopPropagation()" style="cursor:default;">${attVal}</span>
            ${proofHtml}

          </div>
          ${viewBtnHtml}
        </div>
      </div>`;
  }).join('');
}

// ── OPEN LOGSHEET MODAL ───────────────────────────────────────
async function openLogsheet(sessionId) {
  const s          = allSessions.find(x => x.sessionID === sessionId);
  if (!s) return;
  const logStatus  = s.logStatus === 'Submitted' ? 'Submitted' : null;
  const date       = s.sessionDate
    ? new Date(s.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  // Distinct from `date` above — blank if never submitted, not the session date.
  const submittedDate = s.submittedAt
    ? new Date(s.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const timeStart  = LogsheetData.time(s.actualStart);
  const timeEnd    = LogsheetData.time(s.actualEnd);
  const topic      = s.topic || 'Mentoring Session';
  const isMakeup   = isMakeupSession(s);
  const sessionNum = s.slotName || 'Session';
  const sessionLabel = isMakeup ? (s.slotName ? `Make-Up Session: ${s.slotName}` : 'Make-up Session') : sessionNum;

  currentTab = 'logsheet';
  currentLogsheetData = { sessionId, sessionNum, date, submittedDate, topic, timeStart, timeEnd, mentees: [], proofFilePath: s.proofFilePath || null, logStatus, isMakeup };

  document.getElementById('lmSessionLabel').textContent    = sessionLabel;
  document.getElementById('lmSubtitle').textContent        = `${date} · ${timeStart} – ${timeEnd} · ${topic.replace(/^\[[^\]]+\]\s*/, '')}`;
  document.getElementById('logsheetOverlay').style.display = 'flex';

  // Log status badge
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

  // Print button availability
  const printBtn = document.querySelector('.lm-footer .btn-primary');
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

  document.getElementById('tabContent').innerHTML = `<div class="tab-loading"><span class="spinner"></span> Loading…</div>`;

  try {
    // fetchMergedMentees unions every round in this checkpoint's group
    // (s._rounds, set by mergeSessionRows) when it has more than one —
    // just the one fetch, unchanged, for the common single-round case.
    currentLogsheetData.mentees = await fetchMergedMentees(s);
    renderCurrentTab();
  } catch (e) {
    document.getElementById('tabContent').innerHTML =
      `<div class="tab-loading">Failed to load logsheet data.</div>`;
  }
}

// ── TAB SWITCHING ─────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  setActiveTab(tab);
  renderCurrentTab();
}

function setActiveTab(tab) {
  document.querySelectorAll('.lm-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
}

function renderCurrentTab() {
  if (!currentLogsheetData) return;
  const { mentees, sessionNum, date, submittedDate, topic, timeStart, timeEnd, isMakeup } = currentLogsheetData;
  if      (currentTab === 'logsheet')   renderLogsheetTab(mentees, sessionNum, date, topic, timeStart, timeEnd, isMakeup);
  else if (currentTab === 'notes')      renderNotesTab(mentees, sessionNum, date, topic, isMakeup);
  else if (currentTab === 'nonattend')  renderNonAttendanceTab(mentees, sessionNum, date, submittedDate, topic, isMakeup);
}

// ── FORM 1: MENTORING LOGSHEET ────────────────────────────────
function renderLogsheetTab(mentees, sessionNum, date, topic, timeStart, timeEnd, isMakeup) {
  const sessionLabel = isMakeup ? (sessionNum && sessionNum !== 'Session' ? `Make-Up: ${sessionNum}` : 'Make-Up') : sessionNum;
  // Regular and makeup sessions require persisted scan evidence for presence.
  const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);

  const hasProof = !!currentLogsheetData.proofFilePath;
  const mentorSigHtml = currentMentorSig
    ? `<img src="${CONFIG.getFileUrl(currentMentorSig)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;">`
    : '';

  const dataRows = present.map(m => {
    // A merged mentee (see fetchMergedMentees) carries the date of the
    // round they actually attended, which may differ from round 1's date
    // shown at the top of the form.
    const mDate     = m._attendedDate ? LogsheetData.day(m._attendedDate) : date;
    const mHasProof = m._hasProof !== undefined ? m._hasProof : hasProof;
    const sigHtml = (mHasProof && m.signatureFilePath)
      ? `<img src="${CONFIG.getFileUrl(m.signatureFilePath)}" style="max-height:44px;max-width:120px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode('—'))">`
      : '';
    return `
    <tr>
      <td>${mDate}</td>
      <td>${escapeHtml(m.menteeFirstName)} ${escapeHtml(m.menteeLastName)}</td>
      <td>${LogsheetData.time(m.scannedAt)}</td>
      <td>${LogsheetData.time(m._attendedEndTime)}</td>
      <td class="sig-cell">${sigHtml}</td>
      <td>${escapeHtml(m.remarks || '')}</td>
    </tr>`;
  }).join('');

  const blankCount = Math.max(0, mentees.length - present.length);
  const blankRows  = Array(blankCount).fill(
    '<tr><td></td><td></td><td></td><td></td><td class="sig-cell"></td><td></td></tr>'
  ).join('');

  document.getElementById('tabContent').innerHTML = `
    <div class="paper-form">
      ${faithHeader()}
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
          <div class="paper-sig-fit">${mentorSigHtml}<div class="paper-sig-value">${escapeHtml(currentMentorName)}</div></div>
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

// ── FORM 2: MENTOR'S NOTES ────────────────────────────────────
function renderNotesTab(mentees, sessionNum, date, topic, isMakeup) {
  const mentorSigHtml = currentMentorSig
    ? `<img src="${CONFIG.getFileUrl(currentMentorSig)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;">`
    : '';
  // For makeup sessions all approved requesters get notes entries; no blank rows.
  const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);
  const absent  = mentees.filter(m => LogsheetData.attendanceState(m) === false);

  const presentEntries = present.map(m => {
    const name   = `${escapeHtml(m.menteeFirstName)} ${escapeHtml(m.menteeLastName)}`;
    const mDate  = m._attendedDate ? fmtDateShort(m._attendedDate) : date;
    const noteContent = m.mentorNotes
      ? `<div class="note-line note-line-pre">${escapeHtml(m.mentorNotes)}</div><div class="note-line"></div>`
      : `<div class="note-line"></div><div class="note-line"></div>`;
    return `
      <div class="note-entry">
        <div class="note-entry-header">
          <div class="note-field"><strong>Mentee's Name:</strong> <span class="note-field-val">${escapeHtml(name)}</span></div>
          <div class="note-field"><strong>Date of Mentoring:</strong> <span class="note-field-val">${mDate}</span></div>
        </div>
        ${noteContent}
      </div>`;
  });

  // Blank entries for absent mentees
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
          <div class="paper-sig-fit">${mentorSigHtml}<div class="paper-sig-value">${escapeHtml(currentMentorName)}</div></div>
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

// ── FORM 3: NON-ATTENDANCE REPORT ─────────────────────────────
function renderNonAttendanceTab(mentees, sessionNum, date, submittedDate, topic, isMakeup) {
  const sessionRef    = isMakeup ? (sessionNum && sessionNum !== 'Session' ? `Make-Up Session: ${sessionNum}` : 'Make-Up Session') : sessionNum;
  const mentorSigHtml = currentMentorSig
    ? `<img src="${CONFIG.getFileUrl(currentMentorSig)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;">`
    : '';
  // A booking, note or unverified Present record does not establish absence.
  const absent = mentees.filter(m => LogsheetData.attendanceState(m) === false);

  const dataRows   = absent.map(m => {
    // Makeup sessions return only the section fragment (mp.Section); reconstruct full code from course + fragment
    const secDisplay = isMakeup && m.course
      ? `${m.course} ${m.sectionCode || ''}`.trim()
      : (m.sectionCode || '');
    return `
    <tr>
      <td>${escapeHtml(m.menteeFirstName)} ${escapeHtml(m.menteeLastName)}</td>
      <td>${escapeHtml(secDisplay)}</td>
      <td>${escapeHtml(m.absenceReason || '')}</td>
    </tr>`;
  }).join('');
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
        Please submit this form to ${sysSettings.GuidanceOfficer} at the Guidance Office. Thank you!</p>
      </div>
      <div class="paper-sig-row">
        <div class="paper-sig-block wide">
          <div class="paper-sig-fit">${mentorSigHtml}<div class="paper-sig-value">${escapeHtml(currentMentorName)}</div></div>
          <div class="paper-sig-line"></div>
          <div class="paper-sig-label">Mentor's Signature over printed name</div>
        </div>
      </div>
      ${tableSection}
      <div class="na-ack">
        <div class="na-ack-title">ACKNOWLEDGEMENT RECEIPT</div>
        <div class="na-ack-sub">MENTOR'S REPORT</div>
        <div class="na-ack-fields">
          <div class="na-ack-field"><span class="na-field-label">NAME OF MENTOR:</span><span class="ack-val">${escapeHtml(currentMentorName)}</span></div>
          <div class="na-ack-field"><span class="na-field-label">MENTORING SESSION:</span><span class="ack-val">${sessionRef} — ${date}</span></div>
          <div class="na-ack-field"><span class="na-field-label">DATE SUBMITTED:</span><span class="ack-val">${submittedDate}</span></div>
          <div class="na-ack-field"><span class="na-field-label">RECEIVED BY:</span><span class="ack-val ack-blank"></span></div>
          <div class="na-ack-field"><span class="na-field-label">DATE RECEIVED:</span><span class="ack-val ack-blank"></span></div>
        </div>
      </div>
    </div>`;
}

// ── SHARED FAITH HEADER ───────────────────────────────────────
function faithHeader() {
  return `
    <div class="paper-header">
      <img src="/IMAGES/FAITH-Colleges-Logo.png" class="paper-logo-img" onerror="this.style.display='none'"/>
      <div class="paper-program">MENTORING PROGRAM</div>
      <div class="paper-program">${LogsheetData.periodLabel(allSessions.find(s => s.sessionID === currentLogsheetData?.sessionId) || {})}</div>
    </div>`;
}

// ── PRINT / EXPORT ────────────────────────────────────────────
function printCurrentTab() {
  if (!currentLogsheetData) return;
  const tabTitles = { all: 'All Forms', logsheet: 'Mentoring Logsheet', notes: "Mentor's Notes", nonattend: 'Non-Attendance Report' };
  const tabLabel  = tabTitles[currentTab] || 'Logsheet';
  const content   = document.getElementById('tabContent').innerHTML;
  const title     = `FAITH Colleges — ${tabLabel} — ${escapeHtml(currentMentorName)}`;

  const w = window.open('', '_blank', 'width=900,height=750');
  if (!w) { showErrorModal('Pop-up blocked. Please allow pop-ups for this page and try again.'); return; }

  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>${getLogsheetPrintStyles('#2563eb', '#1d4ed8')}</style>
</head>
<body>
  <div class="action-bar">
    <span class="action-bar-title">Preview — ${tabLabel} &nbsp;·&nbsp; ${escapeHtml(currentMentorName)}</span>
    <div class="action-bar-btns">
      <button class="ab-btn ab-btn-print" onclick="window.print()">&#128438; Print / Save as PDF</button>
      <button class="ab-btn ab-btn-close" onclick="window.close()">&#10005; Close</button>
    </div>
  </div>
  <div class="print-body">${content}</div>
</body>
</html>`);
  w.document.close();
  w.focus();
}

// ── PRINT ALL SESSIONS ────────────────────────────────────────
// Builds every Submitted session's form the same way openLogsheet() does
// (fetch mentee data, render into the — currently hidden — logsheet
// modal's #tabContent, capture the resulting HTML), then combines them
// into one print window with a page break between each session. Only
// Submitted sessions have real logsheet data to show, matching the
// per-row "View Logsheet" button, which is disabled otherwise.
async function printAllSessions(formType = 'logsheet') {
  closePrintAllMenu();
  const submitted = allSessions.filter(s => s.logStatus === 'Submitted');
  if (!submitted.length) { showErrorModal('No submitted logsheets to print yet.'); return; }

  const blocks = [];
  for (const s of submitted) {
    const isMakeup   = isMakeupSession(s);
    const date       = s.sessionDate
      ? new Date(s.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const submittedDate = s.submittedAt
      ? new Date(s.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const timeStart  = LogsheetData.time(s.actualStart);
    const timeEnd    = LogsheetData.time(s.actualEnd);
    const topic      = s.topic || 'Mentoring Session';
    const sessionNum = s.slotName || 'Session';

    currentLogsheetData = {
      sessionId: s.sessionID, sessionNum, date, submittedDate, topic, timeStart, timeEnd,
      mentees: [], proofFilePath: s.proofFilePath || null, logStatus: 'Submitted', isMakeup,
    };

    try {
      const mentees = await fetchMergedMentees(s);
      currentLogsheetData.mentees = mentees;

      // 'all' = each session's full set: Logsheet, Mentor's Notes, Non-Attendance.
      const forms = formType === 'all' ? ['logsheet', 'notes', 'nonattend'] : [formType];
      for (const form of forms) {
        if      (form === 'notes')     renderNotesTab(mentees, sessionNum, date, topic, isMakeup);
        else if (form === 'nonattend') renderNonAttendanceTab(mentees, sessionNum, date, submittedDate, topic, isMakeup);
        else                           renderLogsheetTab(mentees, sessionNum, date, topic, timeStart, timeEnd, isMakeup);
        blocks.push(document.getElementById('tabContent').innerHTML);
      }
    } catch (e) {
      console.error(`Failed to load session ${s.sessionID} for print-all:`, e);
    }
  }

  if (!blocks.length) { showErrorModal('Failed to load logsheet data. Please try again.'); return; }

  const tabTitles = { all: 'All Forms', logsheet: 'Mentoring Logsheet', notes: "Mentor's Notes", nonattend: 'Non-Attendance Report' };
  const tabLabel  = tabTitles[formType] || 'Logsheet';
  openPrintAllWindow(tabLabel, blocks);
}

function openPrintAllWindow(tabLabel, blocks) {
  const title   = `FAITH Colleges — ${tabLabel} — All Sessions — ${escapeHtml(currentMentorName)}`;
  const pages   = blocks.map(b => `<div class="print-all-page">${b}</div>`).join('');

  const w = window.open('', '_blank', 'width=900,height=750');
  if (!w) { showErrorModal('Pop-up blocked. Please allow pop-ups for this page and try again.'); return; }

  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>${getLogsheetPrintStyles('#2563eb', '#1d4ed8')}</style>
</head>
<body>
  <div class="action-bar">
    <span class="action-bar-title">Preview — ${tabLabel} — All Sessions &nbsp;·&nbsp; ${escapeHtml(currentMentorName)}</span>
    <div class="action-bar-btns">
      <button class="ab-btn ab-btn-print" onclick="window.print()">&#128438; Print / Save as PDF</button>
      <button class="ab-btn ab-btn-close" onclick="window.close()">&#10005; Close</button>
    </div>
  </div>
  <div class="print-body">${pages}</div>
</body>
</html>`);
  w.document.close();
  w.focus();
}

function togglePrintAllMenu() {
  const menu = document.getElementById('printMenu-all');
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  closePrintAllMenu();
  if (!isOpen) menu.classList.add('open');
}

function closePrintAllMenu() {
  document.querySelectorAll('.print-dropdown.open').forEach(m => m.classList.remove('open'));
}

// ── CLOSE MODAL ───────────────────────────────────────────────
function closeLogsheet(e) {
  if (e && e.target !== document.getElementById('logsheetOverlay')) return;
  document.getElementById('logsheetOverlay').style.display = 'none';
}

// ── PROOF LIGHTBOX ──────────────────────────────────────────────
// Same in-page modal used on Head's Mentor Detail page and Admin's Proof
// Tracking page — every "view this proof photo" action on this page opens
// this instead of the raw file in a new browser tab.
// Entry point for a checkpoint row's Proof pill — a single source just
// opens straight into the normal single-photo lightbox (viewProof,
// unchanged), but 2+ sources (a checkpoint with proof from more than one
// round/booking) show a thumbnail grid first instead of a photo pill per
// source lined up across the row, which got unreadable once a checkpoint
// had several rounds. Clicking a thumbnail drills into that one photo via
// the same viewProof used everywhere else.
function openProofGallery(sources, title) {
  if (!sources || !sources.length) return;
  if (sources.length === 1) {
    viewProof(sources[0].filePath, sources[0].fileType, title || 'Session Proof');
    return;
  }

  const overlay = document.getElementById('lightboxOverlay');
  const body    = document.getElementById('lightboxBody');
  const dlBtn   = document.getElementById('lightboxDownload');
  document.getElementById('lightboxTitle').textContent = title || 'Session Proof';
  if (dlBtn) dlBtn.style.display = 'none';

  body.innerHTML = `
    <div class="proof-gallery-grid">
      ${sources.map(p => {
        const fullUrl = CONFIG.getFileUrl(p.filePath);
        const isImage = /image/i.test(p.fileType || '') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(p.filePath);
        return `
          <button type="button" class="proof-gallery-item" onclick="viewProof(${jsonAttr(p.filePath)}, ${jsonAttr(p.fileType || '')}, ${jsonAttr((title || 'Session Proof') + (p.label ? ' — ' + p.label : ''))})">
            ${isImage
              ? `<img src="${fullUrl}" alt="${escapeAttr(p.label || 'Proof')}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>`
              : ''}
            <div class="proof-gallery-item-icon" style="${isImage ? 'display:none;' : ''}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            ${p.label ? `<span class="proof-gallery-item-label">${escapeHtml(p.label)}</span>` : ''}
          </button>`;
      }).join('')}
    </div>`;

  overlay.style.display = 'flex';
}

function viewProof(filePath, fileType, title) {
  const overlay = document.getElementById('lightboxOverlay');
  const body    = document.getElementById('lightboxBody');
  const dlBtn   = document.getElementById('lightboxDownload');
  document.getElementById('lightboxTitle').textContent = title || 'Session Proof';

  const downloadUrl = CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(filePath));
  if (dlBtn) { dlBtn.href = downloadUrl; dlBtn.style.display = 'inline-flex'; }

  const isImage = /image/i.test(fileType || '') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filePath);
  const fullUrl = CONFIG.getFileUrl(filePath);
  if (isImage) {
    body.innerHTML = `<img src="${fullUrl}" alt="Session proof" onerror="this.parentElement.innerHTML=noPreviewHtml('${fullUrl}')"/>`;
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
      <a href="${filePath}" target="_blank" rel="noopener" class="lightbox-open-btn">Open File</a>
    </div>`;
}

function closeLightbox(e) {
  if (e && e.target !== document.getElementById('lightboxOverlay')) return;
  document.getElementById('lightboxOverlay').style.display = 'none';
  document.getElementById('lightboxBody').innerHTML = '';
}

// JSON.stringify wraps its output in double quotes — embedding that
// directly inside a double-quoted HTML attribute (onclick="...") closes
// the attribute early at that first quote. Escape for the attribute
// context instead (same fix applied to session-proofs.js).
function jsonAttr(value) {
  return JSON.stringify(value).replace(/"/g, '&quot;');
}

// ── HELPERS ───────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Matches the `date` string built at each openLogsheet()/printAllSessions()
// call site — used for a merged mentee's own _attendedDate (see
// fetchMergedMentees) so their row shows the round they actually attended.
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 6;
}

function escapeAttr(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function showErrorModal(msg) {
  document.getElementById('errorMessage').textContent = msg;
  document.getElementById('errorModal').style.display = 'flex';
}
function hideErrorModal() { document.getElementById('errorModal').style.display = 'none'; }
