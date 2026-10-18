let logCalendar = null;
let logProgress = null;
let logProgressRequest = 0;
function logDisplayStatus(s) {
  // A logsheet merges rounds; any saved actual end keeps a finished checkpoint completed.
  const state = dashboardSessionState({...s, timeEnd: s.actualEnd ?? s.timeEnd}, logCalendar || []);
  return state === 'Upcoming' || state === 'Past Scheduled' ? 'Scheduled' : state;
}
// ===== LOGSHEET JS — MENTOR PORTAL =====

// Mirrors AstraMentoring-Backend/AstraMentoring-Backend/Constants/MentoringSlots.cs
// (same pattern as MENTOR/JS/sessions.js's own copy) — required-session
// counts now come straight from the fixed slot list instead of the old
// Admin-editable SessionLimit1stSem/2ndSem setting (removed from Settings
// once the slot list became the actual source of truth for the count).
const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals'
];
function slotsForSemester(semester) {
  return semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;
}
let REQUIRED_SESSIONS = 6;

let logData          = null;
let allSessions      = [];
let currentUser      = null;
let sysSettings      = {
  SchoolYear:      '2026-2027',
  Semester:        '1st Semester',
  GuidanceOfficer: 'Guidance Officer'
};

// Merges a checkpoint's 2nd/3rd "round" sessions (logged to catch mentees
// absent from round 1 — see SessionsService.SlotExistsAsync, which now
// allows a same-slot session once the first is Completed) into ONE entry,
// so the Logsheet/Notes/Non-Attendance views show one card and one
// unioned attendance list per checkpoint instead of a separate, partial
// one per round. Client confirmed which round a mentee attended doesn't
// matter — only whether they attended the checkpoint at all.
//
// Makeup sessions (Availability bookings) fold in too, IF the mentor
// posted the slot against a real checkpoint (Availability.SlotName,
// propagated onto the created Session — see
// SQL/add_slotname_to_availability.sql). A makeup session isn't itself
// tied to one section (its own SectionCode is always null — a posted
// slot isn't section-scoped, and IsMakeup = RequestID IS NOT NULL OR
// SectionCode IS NULL depends on exactly that), and it can be attended by
// mentees from different sections, so its present attendees are folded in
// by THEIR OWN sectionCode rather than by the session's own (absent) one —
// one makeup session can therefore contribute to more than one section's
// checkpoint group. A makeup session with no slotName (posted before this
// feature, or without picking a checkpoint) passes through untouched, same
// as before.
//
// Groups of size 1 with no makeup contribution (the common case) pass
// through untouched too.
//
// The earliest REGULAR round is "primary" and supplies everything except
// the mentee list (sessionID, notes, logStatus, submittedAt,
// proofFilePath) — every existing edit/proof/submit/print action keeps
// targeting round 1 unchanged. Each merged mentee entry carries its own
// `_attendedDate` (the round/booking they were marked present in, or their
// own scannedAt) so a mentee who only attended round 2 or a make-up
// booking still prints THAT date, not round 1's — see buildPrintForm's
// DATE column.
function mergeRoundsForLogsheet(sessions) { return LogsheetData.merge(sessions); }

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentor');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  currentUser = getSession()?.user;
  await loadSettings();
  await loadLogsheet();

  document.getElementById('logSearch').addEventListener('input', () => { renderCards(); updateRemarksBar(); });
  document.getElementById('logStatusFilter').addEventListener('change', () => { renderCards(); updateRemarksBar(); });
  document.getElementById('logPeriodFilter').addEventListener('change', () => { renderCards(); updateRemarksBar(); });
  document.addEventListener('click', () => closePrintMenu());

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadSettings().then(loadLogsheet);
  });
});

// ── SETTINGS ──────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    if (data) {
      sysSettings = { ...sysSettings, ...data };
      REQUIRED_SESSIONS = slotsForSemester(sysSettings.Semester).length;
    }
  } catch (e) { /* use defaults */ }
}

// ── LOAD ──────────────────────────────────────────────────────────
async function loadLogsheet() {
  const request = ++logProgressRequest;
  logProgress = null;
  apiRequest(`MonitorActivities/${currentUser.userID}`, 'GET', null, true).catch(() => null).then(progress => {
    if (request !== logProgressRequest) return;
    logProgress = progress;
    updateStats();
  });
  try {
    const [data, calendar] = await Promise.all([apiRequest(`SessionsAdmin/${currentUser.userID}/logsheet`, 'GET', null, true), apiRequest('CalendarEvents', 'GET', null, true).catch(() => null)]);
    logData = data;
    logCalendar = calendar;
    const fresh = await LogsheetData.withReportStatuses(mergeRoundsForLogsheet(logData?.sessions || []), currentUser.userID);
    if (request !== logProgressRequest) return;

    // When the logsheet modal is open (e.g. visibilitychange fired while the mentor was
    // editing), preserve the in-memory text fields for the session being viewed so that
    // unsaved edits are not overwritten by the fresh API data.
    if (previewSessionId) {
      const oldS = allSessions.find(x => x.sessionID === previewSessionId);
      const newS = fresh.find(x => x.sessionID === previewSessionId);
      if (oldS?.mentees && newS?.mentees) {
        for (const newM of newS.mentees) {
          const oldM = oldS.mentees.find(x => x.menteeID === newM.menteeID);
          if (oldM && oldM.attendanceID === newM.attendanceID) {
            newM.remarks       = oldM.remarks;
            newM.mentorNotes   = oldM.mentorNotes;
            newM.absenceReason = oldM.absenceReason;
          }
        }
      }
    }

    allSessions = fresh;
    populatePeriodFilter(allSessions, 'logPeriodFilter');
    updateStats();
    renderCards();
    updateRemarksBar();
    const total = allSessions.length;
    document.getElementById('logsheetSubtitle').textContent =
      `${total} session${total !== 1 ? 's' : ''} on record`;

    // Re-render the open modal so it reflects any changes from the reload
    if (previewSessionId) {
      updateModalSubmitState(allSessions.find(s => s.sessionID === previewSessionId)?.logStatus);
      updateNavButtons();
      renderRemarksForm();
      renderPreviewTab();
    }
  } catch (e) {
    console.error('Logsheet load failed:', e);
    document.getElementById('logCards').innerHTML =
      '<div class="log-loading">Failed to load logsheet. Please refresh.</div>';
  }
}

// ── STATS ─────────────────────────────────────────────────────────
function updateStats() {
  // Use the same current-semester checkpoint totals as Dashboard/Attendance Overview.
  // Do not invent a target from sessions: assigned sections may have no sessions yet.
  const completed = Number(logProgress?.completedSessions ?? logProgress?.CompletedSessions);
  const totalRequired = Number(logProgress?.requiredSessions ?? logProgress?.RequiredSessions);
  const available = Number.isFinite(completed) && Number.isFinite(totalRequired) && totalRequired > 0;
  const pct = available ? Math.min(100, Math.round(completed / totalRequired * 100)) : 0;
  const scheduled = allSessions.filter(s => logDisplayStatus(s) === 'Scheduled' && !isMakeupSession(s)).length;
  const cancelled = allSessions.filter(s => s.sessionStatus === 'Cancelled' && !isMakeupSession(s)).length;
  document.getElementById('lStatCompleted').textContent = available ? completed : '\u2014';
  document.getElementById('lStatRequired').textContent = available ? `of ${totalRequired} required` : 'Progress unavailable';
  document.getElementById('lStatProgressFill').style.width = `${pct}%`;
  document.getElementById('lStatTotal').textContent        = allSessions.length;
  document.getElementById('lStatScheduled').textContent    = scheduled;
  document.getElementById('lStatCancelled').textContent    = cancelled;
  document.getElementById('lStatClosed').textContent = allSessions.filter(s => logDisplayStatus(s) === 'Closed').length;
}

// ── REMARKS BAR ───────────────────────────────────────────────────
function updateRemarksBar() {
  const el   = document.getElementById('logRemarksBar');
  const pill = document.getElementById('logRemarksPill');
  if (!el || !pill) return;

  el.style.display = 'flex';

  const completed = allSessions.filter(s => logDisplayStatus(s) === 'Completed');

  if (!completed.length) {
    pill.className = 'log-remarks-pill log-remarks-pill--pending';
    pill.innerHTML = `<i class="ti ti-notes"></i> No completed sessions yet`;
    return;
  }

  // "Logged" = actually Submitted — matches the Logsheet button's own
  // green/orange color coding. Remarks are optional per mentee (a
  // fully-Submitted session can legitimately have none), so remark
  // presence was never a valid stand-in for "has this been submitted."
  const unlogged = completed.filter(s => s.logStatus !== 'Submitted').length;
  const toUpdate = completed.filter(s => s.logStatus === 'Submitted' && s.needsUpdate).length;
  const logged   = completed.length - unlogged;

  if (unlogged > 0 || toUpdate > 0) {
    const parts = [];
    if (unlogged) parts.push(`${unlogged} session${unlogged !== 1 ? 's' : ''} not yet logged`);
    if (toUpdate) parts.push(`${toUpdate} need${toUpdate !== 1 ? '' : 's'} an update`);
    pill.className = 'log-remarks-pill log-remarks-pill--pending';
    pill.innerHTML = `<i class="ti ti-notes"></i> ${parts.join(' · ')}`;
  } else {
    pill.className = 'log-remarks-pill log-remarks-pill--done';
    pill.innerHTML = `<i class="ti ti-circle-check-filled"></i> All ${logged} session${logged !== 1 ? 's' : ''} logged`;
  }
}

// ── FILTERS ───────────────────────────────────────────────────────
// Sessions already carry their own SchoolYear/Semester from the moment
// they're created, so past periods stay intact even after Admin rolls
// Settings forward — this surfaces that as a filter instead of always
// mixing every school year/semester into one list.
function populatePeriodFilter(sessions, selectId) {
  const sel = document.getElementById(selectId);
  const seen = new Set();
  const periods = [];
  sessions.forEach(s => {
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

function getFiltered() {
  const q      = document.getElementById('logSearch').value.trim().toLowerCase();
  const status = document.getElementById('logStatusFilter').value;
  const period = document.getElementById('logPeriodFilter').value;
  return allSessions.filter(s => {
    if (period && `${s.schoolYear}|${s.semester}` !== period) return false;
    if (status === 'Makeup') {
      if (!isMakeupSession(s)) return false;
    } else if (status && logDisplayStatus(s) !== status) {
      return false;
    }
    if (q) {
      const dateStr = fmtDate(s.sessionDate).toLowerCase();
      const mentees = (s.mentees || []).map(m => m.menteeName.toLowerCase()).join(' ');
      if (!dateStr.includes(q) && !mentees.includes(q) &&
          !(s.slotName || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

// ── HELPERS ───────────────────────────────────────────────────────
function fmtDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(value) { return LogsheetData.day(value); }

function fmtDayOfWeek(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('en-PH', { weekday: 'long' });
}

function fmtTimeSpan(tsStr) {
  if (!tsStr) return null;
  const parts = tsStr.split(':');
  if (parts.length < 2) return null;
  let h = parseInt(parts[0]), m = parseInt(parts[1]);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDateTime(value) { return LogsheetData.time(value); }

function statusBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'completed': return 'completed';
    case 'scheduled': return 'scheduled';
    case 'cancelled': return 'cancelled';
    default:          return 'other';
  }
}

function initials(name) {
  const parts = (name || '').trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

// Pre-Phase-2 leftover: numbered sessions sequentially within one section
// before every session carried its own SlotName. The resulting numOverride/
// _displayNum values are no longer read for display (renderCard and every
// print form now show s.slotName directly) — kept only because it's still
// threaded through renderCard/openPreviewModal/exportOneSession's call
// sites, and removing that plumbing isn't needed for this change.
function buildSectionNumMap(sectionSessions) {
  const numMap = {};
  let ctr = 0, lastKey = null;
  sectionSessions.forEach(s => {
    const key = `${s.schoolYear}|${s.semester}`;
    if (key !== lastKey) { ctr = 0; lastKey = key; }
    numMap[s.sessionID] = s.sessionStatus !== 'Cancelled' ? ++ctr : null;
  });
  return numMap;
}

// ── RENDER CARDS ──────────────────────────────────────────────────
function renderCards() {
  const container = document.getElementById('logCards');
  const sessions  = getFiltered();
  const status    = document.getElementById('logStatusFilter').value;

  // Makeup Sessions filter: show only the makeup section (placeholder if empty)
  if (status === 'Makeup') {
    if (!sessions.length) {
      container.innerHTML = `
        <div class="log-section-group log-makeup-empty-group">
          <div class="log-section-group-header">
            <div class="log-section-group-label">
              <i class="ti ti-calendar-clock"></i>
              Makeup Sessions
            </div>
          </div>
          <div class="log-makeup-placeholder">
            <i class="ti ti-calendar-plus"></i>
            <p>Make-up attendance appears under its checkpoint. Only sessions without a checkpoint or section appear here.</p>
          </div>
        </div>`;
    } else {
      let ctr = 0;
      const makeupFilterNumMap = {};
      sessions.forEach(s => { makeupFilterNumMap[s.sessionID] = s.sessionStatus !== 'Cancelled' ? ++ctr : null; });
      const completed = sessions.filter(s => logDisplayStatus(s) === 'Completed').length;
      container.innerHTML = `
        <div class="log-section-group">
          <div class="log-section-group-header">
            <div class="log-section-group-label">
              <i class="ti ti-calendar-clock"></i>
              Makeup Sessions
            </div>
            <div class="log-section-group-progress">
              <span class="log-section-progress-text">${completed} completed</span>
            </div>
          </div>
          <div class="log-section-cards">
            ${sessions.map(s => renderCard(s, true, makeupFilterNumMap[s.sessionID])).join('')}
          </div>
        </div>`;
    }
    return;
  }

  if (!sessions.length) {
    if (allSessions.length === 0) {
      container.innerHTML = `
        <div class="log-empty">
          <i class="ti ti-clipboard-off"></i>
          <p>No sessions on record yet.</p>
          <a href="sessions.html">Go to Sessions to log one →</a>
        </div>`;
    } else {
      const statusLabel = status === 'Completed' ? 'Completed'
                        : status === 'Scheduled'  ? 'Scheduled'
                        : status === 'Cancelled'  ? 'Cancelled'
                        : '';
      container.innerHTML = `
        <div class="log-section-group log-makeup-empty-group">
          <div class="log-section-group-header">
            <div class="log-section-group-label">
              <i class="ti ti-filter"></i>
              ${statusLabel} Sessions
            </div>
          </div>
          <div class="log-makeup-placeholder">
            <i class="ti ti-filter-off"></i>
            <p>No ${statusLabel.toLowerCase()} sessions found.</p>
          </div>
        </div>`;
    }
    return;
  }

  // Group by section; '' key = makeup/individual sessions.
  // Multi-section sessions (e.g. "BS CPE 1B, BS MULTIMEDIA 1A") are added
  // to EACH section group individually so they reflect in every group's progress.
  const groups       = {};
  const sectionOrder = [];
  for (const s of sessions) {
    // Makeup sessions always stay in the '' (makeup) group — never mix with regular sections.
    // Check isMakeupSession() first so the isMakeup flag from the backend takes precedence
    // over topic/section text (which can misfire if a purpose starts with "[…]").
    if (isMakeupSession(s)) {
      if (!groups['']) { groups[''] = []; sectionOrder.push(''); }
      groups[''].push(s);
      continue;
    }
    // Same fallback as updateStats() above: s.sections is attendance-derived
    // (empty pre-attendance), so fall back to the reliable sessionSectionCode
    // instead of regex-guessing one out of the topic text.
    const secStr = s.sections || s.sessionSectionCode || '';
    if (!secStr) {
      if (!groups['']) { groups[''] = []; sectionOrder.push(''); }
      groups[''].push(s);
    } else {
      const secs = secStr.split(',').map(x => x.trim()).filter(Boolean);
      for (const sec of secs) {
        if (!groups[sec]) { groups[sec] = []; sectionOrder.push(sec); }
        groups[sec].push(s);
      }
    }
  }

  // Separate real sections from makeup; ensure '' is always last
  const realSections   = sectionOrder.filter(s => s !== '');
  const makeupSessions = groups[''] || [];
  // Always show section headers when a status filter is active
  const multiSection   = realSections.length > 1 || !!status;

  let html = '';

  if (realSections.length === 0) {
    // All sessions are makeup — nothing in real section bands
  } else if (!multiSection) {
    // Single real section, no filter — render without section header
    const onlySessions = groups[realSections[0]];
    const numMap = buildSectionNumMap(onlySessions);
    html += `<div class="log-section-cards log-section-cards--ungrouped">${onlySessions.map(s => renderCard(s, false, numMap[s.sessionID])).join('')}</div>`;
  } else {
    // Multiple real sections OR a filter is active — render each with a header
    html += realSections.map(sec => {
      const secSessions = groups[sec];
      const numMap = buildSectionNumMap(secSessions);
      const completed = secSessions.filter(s => logDisplayStatus(s) === 'Completed').length;
      return `
        <div class="log-section-group">
          <div class="log-section-group-header">
            <div class="log-section-group-label">
              <i class="ti ti-users-group"></i>
              ${sec}
            </div>
            <div class="log-section-group-progress">
              <span class="log-section-progress-text">${completed} checkpoints completed</span>
            </div>
          </div>
          <div class="log-section-cards">
            ${secSessions.map(s => renderCard(s, true, numMap[s.sessionID])).join('')}
          </div>
        </div>`;
    }).join('');
  }

  // Makeup Sessions section only shown when viewing All (no status filter
  // active) AND there's an actual standalone makeup session to show. A
  // checkpoint-tagged makeup session (the normal case — see
  // mergeRoundsForLogsheet) is folded into its checkpoint's own card and
  // never lands in groups[''], so this section used to always fall back to
  // an empty "No makeup sessions yet" placeholder even when a makeup
  // session genuinely existed — just merged into the card above, making
  // the placeholder read as a contradiction. Only a makeup session with no
  // slotName (posted before that feature, or without picking a checkpoint)
  // still lands here as its own standalone card; when there isn't one,
  // this section simply doesn't render, same as the "no real sections"
  // case above.
  if (!status && makeupSessions.length > 0) {
    let ctr = 0;
    const makeupNumMap = {};
    makeupSessions.forEach(s => { makeupNumMap[s.sessionID] = s.sessionStatus !== 'Cancelled' ? ++ctr : null; });
    const completed = makeupSessions.filter(s => logDisplayStatus(s) === 'Completed').length;
    html += `
      <div class="log-section-group">
        <div class="log-section-group-header">
          <div class="log-section-group-label">
            <i class="ti ti-calendar-clock"></i>
            Makeup Sessions
          </div>
          <div class="log-section-group-progress">
            <span class="log-section-progress-text">${completed} completed</span>
          </div>
        </div>
        <div class="log-section-cards">
          ${makeupSessions.map(s => renderCard(s, true, makeupNumMap[s.sessionID])).join('')}
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

// Submitted and up to date. A submitted logsheet that gained attendance
// later (e.g. a make-up) needs a resubmit and is treated like a draft.
function isFinalSubmitted(s) {
  return s?.logStatus === 'Submitted' && !s?.needsUpdate;
}

function renderCard(s, hideSection, numOverride) {
  const timeStart  = LogsheetData.time(s.actualStart);
  const timeEnd    = LogsheetData.time(s.actualEnd);
  const timeStr    = (timeStart && timeEnd) ? `${timeStart} – ${timeEnd}`
                   : timeStart              ? `from ${timeStart}`
                   : timeEnd                ? `ended ${timeEnd}`
                   :                          '—';

  const presentList = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);
  const present     = presentList.length;
  const total       = (s.mentees || []).length;
  const attStr      = total > 0 ? `${present}/${total} present` : 'No attendance yet';
  const displayStatus = logDisplayStatus(s);
  const reportStatus = s.slotName ? LogsheetData.reportStatus(s, logCalendar) : '';
  const reportBadgeCls = reportStatus === 'Pending' ? 'report-pending'
    : reportStatus === 'Submitted Late' ? 'report-late' : '';
  const badgeCls = displayStatus === 'Closed' ? 'badge-closed' : statusBadgeClass(displayStatus === 'In Progress' ? 'Scheduled' : displayStatus);
  const cardCls = `status-${(displayStatus === 'In Progress' ? 'Scheduled' : displayStatus || '').toLowerCase()}`;
  const isCancelled = s.sessionStatus === 'Cancelled';
  const logBtnCls = s.needsUpdate
    ? 'btn-view-logsheet btn-view--pending'
    : s.logStatus === 'Submitted'
    ? 'btn-view-logsheet btn-view--done'
    : (isCancelled || s.sessionStatus === 'Scheduled')
    ? 'btn-view-logsheet btn-view--gray'
    // Completed but not yet submitted — same orange language as the
    // "sessions not yet logged" pill above, so it's spottable at a glance
    // without a separate badge.
    : s.sessionStatus === 'Completed'
    ? 'btn-view-logsheet btn-view--pending'
    : 'btn-view-logsheet';
  const isMakeup    = isMakeupSession(s);
  const numDisplay  = s.slotName || 'Session';
  const slotList    = slotsForSemester(s.semester || sysSettings.Semester);
  const slotIndex   = slotList.indexOf(s.slotName);
  const numTotal    = slotIndex >= 0 ? `<div class="log-card-num-total">${slotIndex + 1} of ${slotList.length}</div>` : '';
  const sections  = (() => {
    if (s.sections) return s.sections.split(',').map(x => x.trim()).filter(Boolean);
    // s.sections is attendance-derived (empty pre-attendance) — fall back to
    // the reliable sessionSectionCode instead of regex-guessing from topic.
    if (s.sessionSectionCode) return [s.sessionSectionCode];
    return [...new Set((s.mentees || []).map(m => m.sectionCode).filter(Boolean))].sort();
  })();

  return `
    <div class="log-session-card ${cardCls}">
      <div class="log-card-header${isCancelled ? ' no-interact' : ''}">
        ${isMakeup
          ? `<div class="log-card-num log-card-num-makeup">
               <div class="log-card-num-label">Make-up</div>
               <div class="log-card-num-val-sm">${s.slotName || 'Session'}</div>
               ${numTotal}
             </div>`
          : `<div class="log-card-num">
               <div class="log-card-num-label">Session</div>
               <div class="log-card-num-val log-card-num-val--slot">${numDisplay}</div>
               ${numTotal}
             </div>`}
        <div class="log-card-info">
          <div class="log-card-date">${fmtDate(s.sessionDate)}</div>
          <div class="log-card-meta">
            <span class="log-card-meta-item"><i class="ti ti-calendar-week"></i>${fmtDayOfWeek(s.sessionDate)}</span>
            <span class="log-card-meta-item"><i class="ti ti-clock"></i>${timeStr}</span>
            <span class="log-card-meta-item"><i class="ti ti-users"></i>${attStr}</span>
            ${s.roundDates?.length > 1
              ? `<span class="log-card-meta-item" title="${s.roundDates.map(d => fmtDateShort(d)).join(', ')}"><i class="ti ti-repeat"></i>${s.roundDates.length} sessions conducted</span>`
              : ''}
          </div>
          ${!hideSection && sections.length ? `<div class="log-section-tags">${sections.map(sec => `<span class="log-section-tag">${sec}</span>`).join('')}</div>` : ''}
          <div class="log-card-statuses">
          ${s.slotName ? `<span class="status-badge ${reportBadgeCls}">${reportStatus}</span>` : ''}
          <span class="status-badge ${badgeCls}">${logDisplayStatus(s)}</span>
          ${s.sessionStatus === 'Completed' && !(s._anyProof !== undefined ? s._anyProof : s.proofFilePath)
            ? `<span class="log-proof-flag" title="No proof photo uploaded yet"><i class="ti ti-photo-off"></i></span>`
            : ''}
          </div>
        </div>
        <div class="log-card-actions">
          <button class="${logBtnCls}" onclick="event.stopPropagation(); openPreviewModal(${s.sessionID}, ${numOverride != null ? numOverride : 'null'})">
            <i class="ti ti-notes"></i> Logsheet
          </button>
          <div class="print-btn-group" onclick="event.stopPropagation()">
            <button class="btn-print-main" onclick="exportOneSession(${s.sessionID},'logsheet',${numOverride != null ? numOverride : 'null'})">
              <i class="ti ti-printer"></i> Print
            </button>
            <button class="btn-print-caret" onclick="togglePrintMenu(${s.sessionID})">
              <i class="ti ti-chevron-down"></i>
            </button>
            <div class="print-dropdown" id="printMenu-${s.sessionID}">
              <button class="print-drop-item" onclick="exportOneSession(${s.sessionID},'logsheet',${numOverride != null ? numOverride : 'null'});closePrintMenu()"><i class="ti ti-clipboard-list"></i> Logsheet</button>
              <button class="print-drop-item" onclick="exportOneSession(${s.sessionID},'notes',${numOverride != null ? numOverride : 'null'});closePrintMenu()"><i class="ti ti-notes"></i> Mentor's Notes</button>
              <button class="print-drop-item" onclick="exportOneSession(${s.sessionID},'nonattend',${numOverride != null ? numOverride : 'null'});closePrintMenu()"><i class="ti ti-user-x"></i> Non-Attendance</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

// ── PRINT DROPDOWN ────────────────────────────────────────────────────
function togglePrintMenu(id) {
  const menu = document.getElementById(`printMenu-${id}`);
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  closePrintMenu();
  if (!isOpen) menu.classList.add('open');
}

function closePrintMenu() {
  document.querySelectorAll('.print-dropdown.open').forEach(m => m.classList.remove('open'));
}

function escStr(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── LOGSHEET PREVIEW MODAL ────────────────────────────────────────
let previewSessionId  = null;
let previewTab        = 'logsheet';
let previewNumOverride = null;
// True once a remark textarea has changed since the modal opened or was
// last saved — gates the "unsaved changes" prompt on close.
let remarksDirty      = false;

// Guided-flow order — a mentor must pass through every sheet (Next) before
// Upload Logsheet appears, so absence reasons / mentor notes on the later
// sheets don't get silently skipped by uploading straight from the first tab.
const PREVIEW_TAB_ORDER  = ['logsheet', 'notes', 'nonattend'];
const PREVIEW_TAB_LABELS = { logsheet: 'Logsheet', notes: "Mentor's Notes", nonattend: 'Non-Attendance' };
let maxPreviewTabReached = 0;
// Snapshot of this session's mentee remarks/notes/absence-reasons taken at
// modal-open (and refreshed after every successful save) — Discard restores
// from this instead of just skipping the server call, since typed edits are
// written into allSessions in memory immediately (debouncedPreviewRefresh),
// not only on save.
let previewSnapshot = null;

function snapshotPreviewMentees(s) {
  previewSnapshot = JSON.parse(JSON.stringify(s?.mentees || []));
}

function openPreviewModal(sessionId, numOverride) {
  const s = allSessions.find(x => x.sessionID === sessionId);
  if (!s) return;
  previewSessionId   = sessionId;
  previewTab         = 'logsheet';
  previewNumOverride = numOverride;
  remarksDirty       = false;
  snapshotPreviewMentees(s);

  const isMakeup  = isMakeupSession(s);
  const title     = isMakeup ? (s.slotName ? `Make-up Session: ${s.slotName}` : 'Make-up Session') : (s.slotName || 'Session');
  const dateStr   = fmtDateShort(s.sessionDate);
  const timeStart = LogsheetData.time(s.actualStart) || '—';
  const timeEnd   = LogsheetData.time(s.actualEnd)   || '—';
  const topic     = (s.topic || '').replace(/^\[[^\]]+\]\s*/, '') || 'Mentoring Session';

  document.getElementById('lpmTitle').textContent = title;
  document.getElementById('lpmSub').textContent   = `${dateStr} · ${timeStart} – ${timeEnd} · ${topic}`;

  document.querySelectorAll('.lpm-ptab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === 'logsheet'));

  document.getElementById('lpmSaveStatus').textContent = '';
  document.getElementById('lpmSaveStatus').className   = 'lpm-save-status';

  // Already-submitted logsheets are read-only from here on, so free
  // tab-browsing is fine; a fresh/draft one starts locked to sheet 1.
  maxPreviewTabReached = isFinalSubmitted(s) ? PREVIEW_TAB_ORDER.length - 1 : 0;

  updateModalSubmitState(s.logStatus);
  renderRemarksForm();
  renderPreviewTab();
  updateNavButtons();
  document.getElementById('logsheetPreviewOverlay').style.display = 'flex';
}

function updateModalSubmitState(logStatus) {
  const badge     = document.getElementById('lpmLogStatusBadge');
  const draftBtn  = document.getElementById('lpmDraftBtn');
  const uploadBtn = document.getElementById('lpmUploadBtn');
  if (!badge || !draftBtn || !uploadBtn) return;

  const needsUpdate = !!allSessions.find(s => s.sessionID === previewSessionId)?.needsUpdate;
  if (logStatus === 'Submitted' && needsUpdate) {
    badge.textContent = 'Needs Update — review new attendance and resubmit';
    badge.className = 'lpm-log-status-badge';
    draftBtn.style.display  = '';
    draftBtn.disabled       = false;
    draftBtn.innerHTML      = 'Save Draft';
    uploadBtn.disabled      = false;
    uploadBtn.className     = 'lpm-btn-upload';
    uploadBtn.innerHTML     = 'Resubmit Logsheet';
  } else if (logStatus === 'Submitted') {
    badge.textContent = '';
    badge.className = 'lpm-log-status-badge';
    const saveStatus = document.getElementById('lpmSaveStatus');
    if (saveStatus) { saveStatus.textContent = ''; saveStatus.className = 'lpm-save-status'; }
    draftBtn.style.display  = 'none';
    // Same button now doubles as Unsubmit once Submitted — handleLogsheetSubmitToggle()
    // reads logStatus at click-time to decide which action to run, so only
    // the label/style need to change here.
    uploadBtn.innerHTML     = '<i class="ti ti-arrow-back-up"></i> Unsubmit';
    uploadBtn.disabled      = false;
    uploadBtn.className     = 'lpm-btn-upload lpm-btn-upload-unsubmit';
  } else if (logStatus === 'Draft') {
    badge.textContent  = '';
    badge.className    = 'lpm-log-status-badge';
    draftBtn.style.display  = '';
    draftBtn.disabled       = false;
    draftBtn.innerHTML      = 'Save Draft';
    uploadBtn.disabled      = false;
    uploadBtn.className     = 'lpm-btn-upload';
    uploadBtn.innerHTML     = 'Upload Logsheet';
  } else {
    badge.textContent  = '';
    badge.className    = 'lpm-log-status-badge';
    draftBtn.style.display  = '';
    draftBtn.disabled       = false;
    draftBtn.innerHTML      = 'Save Draft';
    uploadBtn.disabled      = false;
    uploadBtn.className     = 'lpm-btn-upload';
    uploadBtn.innerHTML     = 'Upload Logsheet';
  }
}

function switchPreviewTab(tab) {
  // Ignore clicks on a sheet the mentor hasn't reached yet via Next —
  // only already-visited (or the current) sheets are jumpable directly.
  if (PREVIEW_TAB_ORDER.indexOf(tab) > maxPreviewTabReached) return;

  // Sync every visible textarea to memory before tearing down the DOM
  document.querySelectorAll('#lpmRemarksForm .lrm-textarea').forEach(ta => {
    const attId    = ta.dataset.attId;
    const menteeId = parseInt(ta.dataset.menteeId);
    const sessionId = parseInt(ta.dataset.sessionId);
    const field    = ta.dataset.field;
    if (!field) return;
    for (const s of allSessions) {
      if (s.sessionID === sessionId) {
        const m = attId
          ? s.mentees?.find(x => String(x.attendanceID) === attId)
          : s.mentees?.find(x => x.menteeID === menteeId);
        if (m) m[field] = ta.value.trim() || null;
        break;
      }
    }
  });
  previewTab = tab;
  document.querySelectorAll('.lpm-ptab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  renderRemarksForm();
  renderPreviewTab();
  updateNavButtons();
}

function goToNextPreviewTab() {
  const nextIdx = PREVIEW_TAB_ORDER.indexOf(previewTab) + 1;
  if (nextIdx >= PREVIEW_TAB_ORDER.length) return;
  maxPreviewTabReached = Math.max(maxPreviewTabReached, nextIdx);
  switchPreviewTab(PREVIEW_TAB_ORDER[nextIdx]);
}

// Shows "Next: <sheet>" until the mentor reaches the last sheet, then swaps
// to Upload Logsheet — so uploading is only possible after passing through
// every sheet at least once (or immediately, if already Submitted/read-only).
function updateNavButtons() {
  const nextBtn   = document.getElementById('lpmNextBtn');
  const uploadBtn = document.getElementById('lpmUploadBtn');
  if (!nextBtn || !uploadBtn) return;

  const s               = allSessions.find(x => x.sessionID === previewSessionId);
  const alreadySubmitted = isFinalSubmitted(s);
  const isLastTab        = previewTab === PREVIEW_TAB_ORDER[PREVIEW_TAB_ORDER.length - 1];

  nextBtn.style.display   = (!alreadySubmitted && !isLastTab) ? '' : 'none';
  uploadBtn.style.display = (alreadySubmitted || isLastTab)   ? '' : 'none';

  if (!alreadySubmitted && !isLastTab) {
    const nextTab = PREVIEW_TAB_ORDER[PREVIEW_TAB_ORDER.indexOf(previewTab) + 1];
    nextBtn.innerHTML = `Next: ${PREVIEW_TAB_LABELS[nextTab]} <i class="ti ti-arrow-right"></i>`;
  }

  document.querySelectorAll('.lpm-ptab').forEach(t => {
    t.classList.toggle('lpm-ptab-locked', PREVIEW_TAB_ORDER.indexOf(t.dataset.tab) > maxPreviewTabReached);
  });
}

// ── REMARKS FORM (left panel) ─────────────────────────────────────
function renderRemarksForm() {
  const s         = allSessions.find(x => x.sessionID === previewSessionId);
  const container = document.getElementById('lpmRemarksForm');
  const heading   = document.getElementById('lpmPanelHeading');
  if (!s || !container) return;

  const mentees = s.mentees || [];
  const present = mentees.filter(m => LogsheetData.attendanceState(m) === true);
  const absent  = mentees.filter(m => LogsheetData.attendanceState(m) === false);
  const pending = mentees.filter(m => !m.attendanceRecorded || m.attendanceUnverified);

  let html        = '';
  let headingText = 'Attendance & Remarks';

  if (previewTab === 'logsheet') {
    headingText = 'Logsheet Remarks';
    if (present.length) {
      html += `<div class="lrm-section-label">Present (${present.length})</div>`;
      html += present.map(m => `
        <div class="lrm-mentee-row">
          <div class="lrm-mentee-info">
            <div class="lrm-avatar present">${initials(m.menteeName)}</div>
            <div class="lrm-mentee-text">
              <div class="lrm-mentee-name">${escHtml(m.menteeName)}</div>
              <div class="lrm-mentee-sec">${m.sectionCode || '—'}${m.isDropOut ? '<span class="lrm-dropout-chip">Drop Out</span>' : ''}</div>
            </div>
            <span class="lrm-status-dot present">Present</span>
          </div>
          <textarea class="lrm-textarea"
            data-att-id="${m.attendanceID || ''}"
            data-mentee-id="${m.menteeID}"
            data-session-id="${s.sessionID}"
            data-field="remarks"
            placeholder="Remarks…"
            oninput="debouncedPreviewRefresh()">${escHtml(m.remarks || '')}</textarea>
        </div>`).join('');
    } else {
      html = '<div class="lrm-no-att">No present mentees for this session.</div>';
    }

  } else if (previewTab === 'notes') {
    headingText = "Mentor's Notes";
    if (present.length) {
      html += `<div class="lrm-section-label">Present (${present.length})</div>`;
      html += present.map(m => `
        <div class="lrm-mentee-row">
          <div class="lrm-mentee-info">
            <div class="lrm-avatar present">${initials(m.menteeName)}</div>
            <div class="lrm-mentee-text">
              <div class="lrm-mentee-name">${escHtml(m.menteeName)}</div>
              <div class="lrm-mentee-sec">${m.sectionCode || '—'}${m.isDropOut ? '<span class="lrm-dropout-chip">Drop Out</span>' : ''}</div>
            </div>
            <span class="lrm-status-dot present">Present</span>
          </div>
          <textarea class="lrm-textarea"
            data-att-id="${m.attendanceID || ''}"
            data-mentee-id="${m.menteeID}"
            data-session-id="${s.sessionID}"
            data-field="mentorNotes"
            placeholder="Notes…"
            oninput="debouncedPreviewRefresh()">${escHtml(m.mentorNotes || '')}</textarea>
        </div>`).join('');
    } else {
      html = '<div class="lrm-no-att">No present mentees for this session.</div>';
    }

  } else {
    headingText = 'Absence Reasons';
    if (absent.length || pending.length) {
      html += `<div class="lrm-section-label lrm-absent-label">Absent (${absent.length})</div>`;
      html += absent.map(m => `
        <div class="lrm-mentee-row">
          <div class="lrm-mentee-info">
            <div class="lrm-avatar absent">${initials(m.menteeName)}</div>
            <div class="lrm-mentee-text">
              <div class="lrm-mentee-name">${escHtml(m.menteeName)}</div>
              <div class="lrm-mentee-sec">${m.sectionCode || '—'}${m.isDropOut ? '<span class="lrm-dropout-chip">Drop Out</span>' : ''}</div>
            </div>
            <span class="lrm-status-dot absent">Absent</span>
          </div>
          <textarea class="lrm-textarea"
            data-att-id="${m.attendanceID || ''}"
            data-mentee-id="${m.menteeID}"
            data-session-id="${s.sessionID}"
            data-field="absenceReason"
            placeholder="Reason for absence…"
            oninput="debouncedPreviewRefresh()">${escHtml(m.absenceReason || '')}</textarea>
        </div>`).join('');
      if (pending.length) {
        html += `<div class="lrm-section-label">Unverified / not recorded (${pending.length})</div>`;
        html += pending.map(m => `
          <div class="lrm-mentee-row">
            <div class="lrm-mentee-info">
              <div class="lrm-avatar">${initials(m.menteeName)}</div>
              <div class="lrm-mentee-text">
                <div class="lrm-mentee-name">${escHtml(m.menteeName)}</div>
                <div class="lrm-mentee-sec">${m.sectionCode || '—'}</div>
              </div>
              <span class="lrm-status-dot">${m.attendanceUnverified ? 'Unverified' : 'Not recorded'}</span>
            </div>
          </div>`).join('');
      }
    } else {
      html = '<div class="lrm-no-att">No recorded absences for this session.</div>';
    }
  }

  // Keep historical notes editable without including unsupported presence in forms.
  if (previewTab === 'logsheet' || previewTab === 'notes') {
    const field = previewTab === 'logsheet' ? 'remarks' : 'mentorNotes';
    html += mentees.filter(m => m.attendanceUnverified).map(m => `
      <div class="lrm-mentee-row">
        <div class="lrm-mentee-name">${escHtml(m.menteeName)} — Unverified</div>
        <textarea class="lrm-textarea" data-att-id="${m.attendanceID || ''}"
          data-mentee-id="${m.menteeID}" data-session-id="${s.sessionID}" data-field="${field}"
          oninput="debouncedPreviewRefresh()">${escHtml(m[field] || '')}</textarea>
      </div>`).join('');
  }
  container.innerHTML = html;
  if (heading) heading.textContent = headingText;
}

// ── LIVE PREVIEW REFRESH (debounced while typing) ─────────────────
let previewRefreshTimer = null;

function debouncedPreviewRefresh() {
  remarksDirty = true;
  const textareas = document.querySelectorAll('#lpmRemarksForm .lrm-textarea');
  for (const ta of textareas) {
    const attId    = ta.dataset.attId;
    const menteeId = parseInt(ta.dataset.menteeId);
    const sessionId = parseInt(ta.dataset.sessionId);
    const field    = ta.dataset.field;
    if (!field) continue;
    for (const s of allSessions) {
      if (s.sessionID === sessionId) {
        const m = attId
          ? s.mentees?.find(x => String(x.attendanceID) === attId)
          : s.mentees?.find(x => x.menteeID === menteeId);
        if (m) m[field] = ta.value.trim() || null;
        break;
      }
    }
  }
  clearTimeout(previewRefreshTimer);
  previewRefreshTimer = setTimeout(() => renderPreviewTab(), 300);
}

// ── SAVE REMARKS (internal) ───────────────────────────────────────
async function _performSaveRemarks() {
  // Sync current tab DOM values into memory.
  // Uses data-att-id when present, falls back to data-mentee-id for mentees without Attendance records.
  document.querySelectorAll('#lpmRemarksForm .lrm-textarea').forEach(ta => {
    const attId    = ta.dataset.attId;
    const menteeId = parseInt(ta.dataset.menteeId);
    const sessionId = parseInt(ta.dataset.sessionId);
    const field    = ta.dataset.field;
    if (!field) return;
    for (const s of allSessions) {
      if (s.sessionID === sessionId) {
        let m;
        if (attId) {
          m = s.mentees?.find(x => String(x.attendanceID) === attId);
        } else if (menteeId) {
          m = s.mentees?.find(x => x.menteeID === menteeId);
        }
        if (m) m[field] = ta.value.trim() || null;
        break;
      }
    }
  });

  const session = allSessions.find(x => x.sessionID === previewSessionId);
  if (!session) return;

  // Phase 1: For mentees who have data but no Attendance record yet, create one.
  // This ensures we have an AttendanceID for the subsequent PATCH calls.
  const form = document.getElementById('lpmRemarksForm');
  for (const m of (session.mentees || [])) {
    if (m.attendanceID) continue;
    if (!m.remarks && !m.mentorNotes && !m.absenceReason) continue;
    try {
      const created = await apiRequest('Attendance', 'POST', {
        SessionID:     m._sourceSessionID || session._sourceSessionID || previewSessionId,
        MenteeID:      m.menteeID,
        // Notes never establish presence, including for makeup sessions.
        IsPresent:     false,
        ScannedAt:     null,
        Remarks:       null,
        MentorNotes:   null,
        AbsenceReason: null,
      }, true);
      if (created?.attendanceID) {
        m.attendanceID = created.attendanceID;
        // Update DOM so subsequent saves use the real attId
        if (form) {
          form.querySelectorAll(`.lrm-textarea[data-mentee-id="${m.menteeID}"]`).forEach(ta => {
            ta.dataset.attId = m.attendanceID;
          });
        }
      }
    } catch (e) {
      console.warn(`Could not create attendance record for mentee ${m.menteeID}:`, e);
    }
  }

  // Phase 2: one atomic PATCH per mentee — updates all three text columns in a single SQL statement.
  // Using a single endpoint avoids the race condition that occurred when three concurrent
  // GET+UPDATE-all PATCH calls overwrote each other's values.
  const saves = [];
  for (const m of (session.mentees || [])) {
    if (!m.attendanceID) continue;
    saves.push(
      apiRequest(`Attendance/${m.attendanceID}/text-fields`, 'PATCH', {
        remarks:       m.remarks       || null,
        mentorNotes:   m.mentorNotes   || null,
        absenceReason: m.absenceReason || null,
      }, true)
    );
  }
  await Promise.all(saves);
}

// ── SAVE DRAFT ────────────────────────────────────────────────────
async function saveDraft() {
  const draftBtn = document.getElementById('lpmDraftBtn');
  const status   = document.getElementById('lpmSaveStatus');
  if (draftBtn) { draftBtn.disabled = true; draftBtn.innerHTML = 'Saving…'; }
  status.textContent = '';
  status.className   = 'lpm-save-status';
  try {
    await _performSaveRemarks();
    const s = allSessions.find(x => x.sessionID === previewSessionId);
    await apiRequest(`Sessions/${s._sourceSessionID || previewSessionId}/log-status`, 'PATCH', { logStatus: 'Draft', sectionCode: s.sessionSectionCode, courseSchool:s.courseSchool }, true);
    if (s) s.logStatus = 'Draft';
    remarksDirty = false;
    snapshotPreviewMentees(s);
    updateModalSubmitState('Draft');
    updateNavButtons();
    status.textContent = 'Draft saved';
    status.className   = 'lpm-save-status ok';
    renderCards();
    updateRemarksBar();
    setTimeout(() => { if (status) status.textContent = ''; }, 3000);
  } catch (e) {
    console.error('Save draft failed:', e);
    status.textContent = 'Failed to save draft';
    status.className   = 'lpm-save-status error';
    if (draftBtn) { draftBtn.disabled = false; draftBtn.innerHTML = 'Save Draft'; }
  }
}

// ── UNSUBMIT CONFIRM MODAL ────────────────────────────────────────
let _ucmUnsubmitResolve = null;

function showUnsubmitConfirmModal() {
  document.getElementById('unsubmitConfirmOverlay').classList.add('open');
  return new Promise(resolve => { _ucmUnsubmitResolve = resolve; });
}

function ucmUnsubmitResolve(confirmed) {
  document.getElementById('unsubmitConfirmOverlay').classList.remove('open');
  if (_ucmUnsubmitResolve) { _ucmUnsubmitResolve(confirmed); _ucmUnsubmitResolve = null; }
}

function ucmUnsubmitBackdropClick(e) {
  if (e.target === document.getElementById('unsubmitConfirmOverlay')) ucmUnsubmitResolve(false);
}

// One button, two actions — Upload Logsheet becomes Unsubmit once a
// session is already Submitted (see updateModalSubmitState), so the click
// handler just checks the current status and runs the matching action.
function handleLogsheetSubmitToggle() {
  const s = allSessions.find(x => x.sessionID === previewSessionId);
  if (!s) return;
  if (isFinalSubmitted(s)) unsubmitLogsheet();
  else uploadLogsheet();
}

// ── UNSUBMIT LOGSHEET ─────────────────────────────────────────────
// Reverts LogStatus back to Draft so a mentor can correct a mistake and
// resubmit later. SubmittedAt is deliberately left as-is until the next
// real Submit — that's what re-stamps it to "now" (SessionsService.
// UpdateLogStatusAsync), so a resubmit made after the checkpoint's
// deadline correctly counts as late rather than keeping credit for the
// original on-time submission. Safe to allow at any time, including after
// Admin has already viewed it, now that OnTimeCount also requires
// LogStatus = 'Submitted' (fix_ontime_count_logstatus_check.sql) instead
// of just a historical SubmittedAt timestamp.
async function unsubmitLogsheet() {
  const s = allSessions.find(x => x.sessionID === previewSessionId);
  if (!s) return;
  const confirmed = await showUnsubmitConfirmModal();
  if (!confirmed) return;

  const uploadBtn = document.getElementById('lpmUploadBtn');
  const status     = document.getElementById('lpmSaveStatus');
  if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.innerHTML = 'Unsubmitting…'; }
  status.textContent = '';
  status.className   = 'lpm-save-status';
  try {
    await apiRequest(`Sessions/${s._sourceSessionID || previewSessionId}/log-status`, 'PATCH', { logStatus: 'Draft', sectionCode: s.sessionSectionCode, courseSchool:s.courseSchool }, true);
    s.logStatus = 'Draft';
    maxPreviewTabReached = 0;
    updateModalSubmitState('Draft');
    switchPreviewTab('logsheet');
    renderCards();
    updateRemarksBar();
  } catch (e) {
    console.error('Unsubmit failed:', e);
    status.textContent = 'Failed to unsubmit';
    status.className   = 'lpm-save-status error';
    if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '<i class="ti ti-arrow-back-up"></i> Unsubmit'; }
  }
}

// ── UPLOAD CONFIRM MODAL ─────────────────────────────────────────
let _ucmResolve = null;

function showUploadConfirmModal() {
  document.getElementById('uploadConfirmOverlay').classList.add('open');
  return new Promise(resolve => { _ucmResolve = resolve; });
}

function ucmResolve(confirmed) {
  document.getElementById('uploadConfirmOverlay').classList.remove('open');
  if (_ucmResolve) { _ucmResolve(confirmed); _ucmResolve = null; }
}

function ucmBackdropClick(e) {
  if (e.target === document.getElementById('uploadConfirmOverlay')) ucmResolve(false);
}

// ── UPLOAD LOGSHEET ───────────────────────────────────────────────
async function uploadLogsheet() {
  const s = allSessions.find(x => x.sessionID === previewSessionId);
  if (!s) return;
  const confirmed = await showUploadConfirmModal();
  if (!confirmed) return;
  const uploadBtn = document.getElementById('lpmUploadBtn');
  const status    = document.getElementById('lpmSaveStatus');
  if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.innerHTML = 'Uploading…'; }
  status.textContent = '';
  status.className   = 'lpm-save-status';
  try {
    await _performSaveRemarks();
    await apiRequest(`Sessions/${s._sourceSessionID || previewSessionId}/log-status`, 'PATCH', { logStatus: 'Submitted', sectionCode: s.sessionSectionCode, courseSchool:s.courseSchool }, true);
    s.logStatus = 'Submitted';
    s.needsUpdate = false;
    delete s.reportStatus;
    remarksDirty = false;
    snapshotPreviewMentees(s);
    maxPreviewTabReached = PREVIEW_TAB_ORDER.length - 1;
    updateModalSubmitState('Submitted');
    updateNavButtons();
    renderCards();
    updateRemarksBar();
    await loadLogsheet();
  } catch (e) {
    console.error('Upload failed:', e);
    status.textContent = e.message || 'Upload failed';
    status.className   = 'lpm-save-status error';
    if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = 'Upload Logsheet'; }
  }
}

// Closing (X button or backdrop click) is gated behind an unsaved-changes
// check — typed remarks are synced into memory on every keystroke
// (debouncedPreviewRefresh) but only reach the server via Save Draft or
// Upload Logsheet, so closing straight away would silently drop anything
// typed since the last save.
function closePreviewModal(e) {
  if (e && e.target !== document.getElementById('logsheetPreviewOverlay')) return;
  requestClosePreviewModal();
}

function requestClosePreviewModal() {
  if (remarksDirty) {
    document.getElementById('unsavedChangesOverlay').classList.add('open');
  } else {
    document.getElementById('logsheetPreviewOverlay').style.display = 'none';
  }
}

function ucmUnsavedBackdropClick(e) {
  if (e.target === document.getElementById('unsavedChangesOverlay')) {
    document.getElementById('unsavedChangesOverlay').classList.remove('open');
  }
}

function discardAndClosePreview() {
  const s = allSessions.find(x => x.sessionID === previewSessionId);
  if (s && previewSnapshot) s.mentees = JSON.parse(JSON.stringify(previewSnapshot));
  remarksDirty = false;
  document.getElementById('unsavedChangesOverlay').classList.remove('open');
  document.getElementById('logsheetPreviewOverlay').style.display = 'none';
}

async function saveDraftAndClosePreview() {
  document.getElementById('unsavedChangesOverlay').classList.remove('open');
  await saveDraft();
  // saveDraft() clears remarksDirty only on success, so a failed save
  // leaves the logsheet modal open (with its own "Failed to save draft"
  // status message) instead of silently closing and losing the input.
  if (!remarksDirty) {
    document.getElementById('logsheetPreviewOverlay').style.display = 'none';
  }
}

function renderPreviewTab() {
  const s = allSessions.find(x => x.sessionID === previewSessionId);
  if (!s) return;
  const mentor   = logData?.mentor;
  const semLabel = LogsheetData.periodLabel(s);
  let content;
  if      (previewTab === 'logsheet')  content = buildModalLogsheet(s, mentor, semLabel);
  else if (previewTab === 'notes')     content = buildModalNotes(s, mentor, semLabel);
  else                                 content = buildModalNonAttendance(s, mentor, semLabel);
  document.getElementById('lpmContent').innerHTML = content;
}

function printCurrentPreview() {
  if (!previewSessionId) return;
  exportOneSession(
    previewSessionId,
    previewTab === 'nonattend' ? 'nonattend' : previewTab === 'notes' ? 'notes' : 'logsheet',
    previewNumOverride
  );
}

function faithHeaderHtml(s) {
  return `
    <div class="paper-header">
      <img src="/IMAGES/FAITH-Colleges-Logo.png" class="paper-logo-img" onerror="this.style.display='none'"/>
      <div class="paper-program">MENTORING PROGRAM</div>
      <div class="paper-program">${LogsheetData.periodLabel(s)}</div>
    </div>`;
}

function buildModalLogsheet(s, mentor, semLabel) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const timeStart    = LogsheetData.time(s.actualStart) || '—';
  const timeEnd      = LogsheetData.time(s.actualEnd)   || '—';
  const dateStr      = fmtDateShort(s.sessionDate);
  const sessionLabel = isMakeupSession(s)
    ? (s.slotName ? `Make-Up: ${s.slotName}` : 'Make-Up')
    : (s.slotName || 'Session');
  const present      = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);
  const blankCount   = Math.max(0, (s.mentees || []).length - present.length);

  const hasProof = !!s.proofFilePath;

  const rows = present.map(m => {
    // Same merged-mentee awareness as buildPrintForm — a merged mentee
    // carries their own source session's date (_attendedDate) and proof
    // status (_hasProof), falling back to this card's own when unmerged.
    const mDateStr  = m._attendedDate ? fmtDateShort(m._attendedDate) : dateStr;
    const mHasProof = m._hasProof !== undefined ? m._hasProof : hasProof;
    const sigHtml = (mHasProof && m.signatureFilePath)
      ? `<img src="${CONFIG.getFileUrl(m.signatureFilePath)}" style="max-height:44px;max-width:120px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode('—'))">`
      : '';
    return `
    <tr>
      <td>${mDateStr}</td>
      <td>${m.menteeName}</td>
      <td>${LogsheetData.time(m.scannedAt)}</td>
      <td>${LogsheetData.time(m._attendedEndTime)}</td>
      <td class="sig-cell">${sigHtml}</td>
      <td>${escHtml(m.remarks || '')}</td>
    </tr>`;
  }).join('');
  const blanks = Array(blankCount).fill('<tr><td></td><td></td><td></td><td></td><td class="sig-cell"></td><td></td></tr>').join('');

  return `
    <div class="paper-form">
      ${faithHeaderHtml(s)}
      <div class="paper-form-title">MENTORING LOGSHEET</div>
      <div class="paper-session-label"><span class="paper-session-underline">${sessionLabel}</span> Session</div>
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
          <tbody>${rows}${blanks}</tbody>
        </table>
      </div>
      <div class="paper-sig-row">
        <div class="paper-sig-block wide">
          <div class="paper-sig-fit">${mentorSigHtml}<div class="paper-sig-value">${mentorName}</div></div>
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

function buildModalNotes(s, mentor, semLabel) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const dateStr    = fmtDateShort(s.sessionDate);
  const present    = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);
  const absent     = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === false);

  const entries = present.map(m => {
    const mDateStr  = m._attendedDate ? fmtDateShort(m._attendedDate) : dateStr;
    const notesHtml = m.mentorNotes
      ? `<div class="note-line-pre">${escHtml(m.mentorNotes)}</div><div class="note-line"></div>`
      : `<div class="note-line"></div><div class="note-line"></div>`;
    return `
      <div class="note-entry">
        <div class="note-entry-header">
          <div class="note-field"><strong>Mentee's Name:</strong> <span class="note-field-val">${escHtml(m.menteeName)}</span></div>
          <div class="note-field"><strong>Date of Mentoring:</strong> <span class="note-field-val">${mDateStr}</span></div>
        </div>
        ${notesHtml}
      </div>`;
  });

  for (let i = 0; i < absent.length; i++) {
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
    <div class="paper-form">
      <div class="guidance-copy-label">GUIDANCE COPY</div>
      ${faithHeaderHtml(s)}
      <div class="paper-form-title">MENTOR'S NOTES</div>
      <div class="note-entries">${entries.join('') || '<p style="text-align:center;color:#9ca3af;padding:24px 0;">No mentees for this session.</p>'}</div>
      <div class="paper-sig-row">
        <div class="paper-sig-block wide">
          <div class="paper-sig-fit">${mentorSigHtml}<div class="paper-sig-value">${mentorName}</div></div>
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

function buildModalNonAttendance(s, mentor, semLabel) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const dateStr      = fmtDateShort(s.sessionDate);
  // Distinct from dateStr (the session's own date) — this is when it was submitted.
  const submittedDateStr = s.submittedAt ? fmtDateShort(s.submittedAt) : '—';
  const absent       = (s.mentees || []).filter(m => LogsheetData.attendanceState(m) === false);
  const sessionLabel = isMakeupSession(s)
    ? (s.slotName ? `Make-Up Session: ${s.slotName}` : 'Make-Up Session')
    : (s.slotName || 'Session');

  const dataRows  = absent.map(m => `
    <tr><td>${escHtml(m.menteeName)}</td><td>${escHtml(m.sectionCode || '')}</td><td>${escHtml(m.absenceReason || '')}</td></tr>`).join('');
  const blankRows = Array(Math.max(0, 15 - absent.length)).fill('<tr><td></td><td></td><td></td></tr>').join('');

  const tableSection = `
    <div class="paper-table-wrap">
      <table class="paper-table">
        <thead><tr><th style="width:40%">NAME</th><th style="width:25%">COURSE</th><th>REASON</th></tr></thead>
        <tbody>${dataRows}${blankRows}</tbody>
      </table>
    </div>
    <p class="na-note">Please use another separate sheet if the space provided is not enough.</p>
    <p class="na-note">Thank you.</p>`;

  return `
    <div class="paper-form">
      <div class="paper-header">
        <img src="/IMAGES/FAITH-Colleges-Logo.png" class="paper-logo-img" onerror="this.style.display='none'"/>
        <div class="paper-program" style="font-weight:700">MENTORING PROGRAM</div>
      </div>
      <div class="paper-form-title" style="text-decoration:none">NON-ATTENDANCE OF MENTEES</div>
      <div class="paper-program-sub">${semLabel}</div>
      <div class="na-instruction">
        <p><strong>Dear Mentors,</strong></p>
        <p style="margin-top:6px;">Kindly list down the name/s of those who did not attend your scheduled mentoring session.
        Please submit this form to ${escHtml(sysSettings.GuidanceOfficer)} at the Guidance Office. Thank you!</p>
      </div>
      <div class="paper-sig-row">
        <div class="paper-sig-block wide">
          <div class="paper-sig-fit">${mentorSigHtml}<div class="paper-sig-value">${escHtml(mentorName)}</div></div>
          <div class="paper-sig-line"></div>
          <div class="paper-sig-label">Mentor's Signature over printed name</div>
        </div>
      </div>
      ${tableSection}
      <div class="na-ack">
        <div class="na-ack-title">ACKNOWLEDGEMENT RECEIPT</div>
        <div class="na-ack-sub">MENTOR'S REPORT</div>
        <div class="na-ack-fields">
          <div class="na-ack-field"><span class="na-field-label">NAME OF MENTOR:</span><span class="ack-val">${escHtml(mentorName)}</span></div>
          <div class="na-ack-field"><span class="na-field-label">MENTORING SESSION:</span><span class="ack-val">${sessionLabel} — ${dateStr}</span></div>
          <div class="na-ack-field"><span class="na-field-label">DATE SUBMITTED:</span><span class="ack-val">${submittedDateStr}</span></div>
          <div class="na-ack-field"><span class="na-field-label">RECEIVED BY:</span><span class="ack-val ack-blank"></span></div>
          <div class="na-ack-field"><span class="na-field-label">DATE RECEIVED:</span><span class="ack-val ack-blank"></span></div>
        </div>
      </div>
    </div>`;
}

// ── BUILD PRINT FORM (matches paper form) ─────────────────────────
// IsMakeup comes straight from the backend (GetLogsheetAsync ->
// LogsheetSessionDto.IsMakeup, same RequestID/SectionCode-based formula
// used everywhere else in the system) instead of being guessed from
// whether the topic happens to start with a "[SECTION]" bracket — that
// guess silently mislabeled any session whose topic didn't follow the
// convention, including a genuinely regular session with blank notes.
function isMakeupSession(session) {
  return !!session.isMakeup;
}

function buildPrintForm(session, mentor, semesterLabel) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const timeStart     = LogsheetData.time(session.actualStart) || '—';
  const timeEnd       = LogsheetData.time(session.actualEnd)   || '—';
  const dateStr       = fmtDateShort(session.sessionDate);
  const logoUrl       = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const sessionLabel  = isMakeupSession(session)
    ? (session.slotName ? `Make-Up: ${session.slotName}` : 'Make-Up')
    : (session.slotName || 'Session');

  // Only present mentees appear on the form (matching paper form usage)
  const presentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);

  const hasProof = !!session.proofFilePath;

  const rows = presentMentees.map(m => {
    const mTimeStart = LogsheetData.time(m.scannedAt);
    // A merged mentee (see mergeRoundsForLogsheet) carries the date of the
    // round they actually attended, which may differ from round 1's date
    // shown at the top of the form — fall back to it for the normal,
    // unmerged case.
    const mDateStr   = m._attendedDate ? fmtDateShort(m._attendedDate) : dateStr;
    // A merged mentee also carries which of their own source session had
    // proof uploaded (_hasProof) — falls back to the card's own session-
    // level proof for the normal, unmerged case where that's the only proof
    // there is.
    const mHasProof  = m._hasProof !== undefined ? m._hasProof : hasProof;
    const sigHtml    = (mHasProof && m.signatureFilePath)
      ? `<img src="${CONFIG.getFileUrl(m.signatureFilePath)}" style="max-height:44px;max-width:120px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode('—'))">`
      : '';
    return `
        <tr>
          <td>${mDateStr}</td>
          <td>${m.menteeName}</td>
          <td>${mTimeStart}</td>
          <td>${LogsheetData.time(m._attendedEndTime)}</td>
          <td class="sig-cell">${sigHtml}</td>
          <td>${m.remarks || ''}</td>
        </tr>`;
  }).join('');

  // Blank rows to fill out the form (minimum 15 rows total like paper)
  const blankCount = Math.max(0, (session.mentees || []).length - presentMentees.length);
  const blankRows  = Array(blankCount).fill('<tr><td></td><td></td><td></td><td></td><td class="sig-cell"></td><td></td></tr>').join('');

  return `
    <div class="form-page">
      <div class="header">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
        <div class="sub">MENTORING PROGRAM</div>
        <div class="sub">${semesterLabel}</div>
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
        <tbody>
          ${rows}
          ${blankRows}
        </tbody>
      </table>

      <div class="form-footer">
        <div class="sig-block">
          <div class="sig-fit">${mentorSigHtml}<div class="sig-name">${mentorName}</div></div>
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

// ── MENTOR'S NOTES PRINT FORM ─────────────────────────────────────────
function buildMentorNotesForm(session, mentor, semLabel) {
  const mentorName     = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml  = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const dateStr        = fmtDateShort(session.sessionDate);
  const logoUrl        = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const presentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);

  const entries = presentMentees.map(m => {
    const notesLine = m.mentorNotes
      ? `<div class="note-line-pre">${escHtml(m.mentorNotes)}</div><div class="note-line"></div>`
      : `<div class="note-line"></div><div class="note-line"></div>`;
    const mDateStr = m._attendedDate ? fmtDateShort(m._attendedDate) : dateStr;
    return `
      <div class="note-entry">
        <div class="note-entry-header">
          <div class="note-field"><strong>Mentee's Name:</strong> <span class="note-field-val">${escHtml(m.menteeName)}</span></div>
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
        <div class="sub">${semLabel}</div>
      </div>
      <div class="note-entries">${entries.join('')}</div>
      <div class="notes-footer">
        <div class="notes-sig-block">
          <div class="sig-fit">${mentorSigHtml}<div class="notes-sig-name">${escHtml(mentorName)}</div></div>
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

// ── NON-ATTENDANCE PRINT FORM ─────────────────────────────────────────
function buildNonAttendanceForm(session, mentor, semLabel) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const dateStr       = fmtDateShort(session.sessionDate);
  // Distinct from dateStr (the session's own date) — this is when it was submitted.
  const submittedDateStr = session.submittedAt ? fmtDateShort(session.submittedAt) : '—';
  const logoUrl       = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const absentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === false);

  const dataRows = absentMentees.map(m => `
    <tr>
      <td>${escHtml(m.menteeName)}</td>
      <td>${escHtml(m.sectionCode || '')}</td>
      <td>${escHtml(m.absenceReason || '')}</td>
    </tr>`).join('');

  const blankCount = Math.max(0, 15 - absentMentees.length);
  const blankRows  = Array(blankCount).fill('<tr><td></td><td></td><td></td></tr>').join('');

  return `
    <div class="na-page">
      <div class="header">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
        <div class="sub" style="font-weight:700">MENTORING PROGRAM</div>
        <div class="doc-title" style="text-decoration:none">NON-ATTENDANCE OF MENTEES</div>
        <div class="sub">${semLabel}</div>
      </div>
      <div class="na-letter">
        <p><strong>Dear Mentors,</strong></p>
        <p>Kindly list down the name/s of those who did not attend your scheduled mentoring session.
        Please submit this form to ${escHtml(sysSettings.GuidanceOfficer)} at the Guidance Office. Thank you!</p>
      </div>
      <div class="sig-block" style="max-width:240px;margin:10px 0 16px;">
        <div class="sig-fit">${mentorSigHtml}<div class="sig-name">${escHtml(mentorName)}</div></div>
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
        <tbody>
          ${dataRows}
          ${blankRows}
        </tbody>
      </table>
      <p class="na-note">Please use another separate sheet if the space provided is not enough.</p>
      <p class="na-note">Thank you.</p>
      <div class="na-ack">
        <div class="na-ack-title">ACKNOWLEDGEMENT RECEIPT</div>
        <div class="na-ack-sub">MENTOR'S REPORT</div>
        <div class="na-ack-fields">
          <div class="na-ack-field"><span class="ack-label">NAME OF MENTOR:</span><span class="ack-val">${escHtml(mentorName)}</span></div>
          <div class="na-ack-field"><span class="ack-label">MENTORING SESSION:</span><span class="ack-val">${isMakeupSession(session) ? (session.slotName ? `Make-Up Session: ${session.slotName}` : 'Make-Up Session') : (session.slotName || 'Session')} — ${dateStr}</span></div>
          <div class="na-ack-field"><span class="ack-label">DATE SUBMITTED:</span><span class="ack-val">${submittedDateStr}</span></div>
          <div class="na-ack-field"><span class="ack-label">RECEIVED BY:</span><span class="ack-val ack-blank"></span></div>
          <div class="na-ack-field"><span class="ack-label">DATE RECEIVED:</span><span class="ack-val ack-blank"></span></div>
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

function openPrintWindow(title, body) {
  const mentor     = logData?.mentor;
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '';
  const w = window.open('', '_blank', 'width=960,height=760');
  if (!w) { showToast('Pop-up blocked. Please allow pop-ups and try again.'); return; }
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>${getPrintStyles()}</style>
</head>
<body>
  <div class="action-bar">
    <span class="action-bar-title">${title}</span>
    <div style="display:flex;gap:8px;">
      <button class="ab-btn ab-btn-print" onclick="window.print()">&#128438; Print / Save as PDF</button>
      <button class="ab-btn ab-btn-close" onclick="window.close()">&#10005; Close</button>
    </div>
  </div>
  <div class="print-wrap">${body}</div>
</body>
</html>`);
  w.document.close();
}

// ── EXPORT ONE SESSION ────────────────────────────────────────────
function exportOneSession(sessionId, formType = 'logsheet', numOverride = null) {
  const session = allSessions.find(s => s.sessionID === sessionId);
  if (!session) return;
  if (numOverride != null) session._displayNum = numOverride;
  const mentor     = logData?.mentor;
  const semLabel   = LogsheetData.periodLabel(session);
  const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}` : '';

  let body, title;
  const displayNum  = isMakeupSession(session)
    ? (session.slotName ? `Make-Up: ${session.slotName}` : 'Make-Up')
    : (session.slotName || 'Session');
  if (formType === 'notes') {
    body  = buildMentorNotesForm(session, mentor, semLabel);
    title = `Mentor's Notes — ${displayNum} Session${mentorName ? ` (${mentorName})` : ''}`;
  } else if (formType === 'nonattend') {
    body  = buildNonAttendanceForm(session, mentor, semLabel);
    title = `Non-Attendance — ${displayNum} Session${mentorName ? ` (${mentorName})` : ''}`;
  } else {
    body  = buildPrintForm(session, mentor, semLabel);
    title = `Logsheet — ${displayNum} Session${mentorName ? ` (${mentorName})` : ''}`;
  }
  openPrintWindow(title, body);
}

// ── EXPORT ALL SESSIONS ───────────────────────────────────────────
function exportAllSessions(formType = 'logsheet') {
  const sessions = getFiltered();
  if (!sessions.length) { showToast('No sessions to print.'); return; }
  const mentor     = logData?.mentor;
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
  openPrintWindow(title, body);
}
