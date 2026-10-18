/* ============================================================
   ASTRA MENTOR — sessions.js
   ============================================================ */

let allSessions     = [];
let sessionCalendar = null;
let currentUser     = null;
let mentorSections  = [];
let attendanceRows  = [];
let currentAttSid   = null;
let proofSessionId  = null;
let proofUploadInFlight = false;
let editSessionId   = null;
let deleteSessionId = null;
let cancelSessionId = null;
let html5QrCode    = null;
let scannedIds     = new Set();
let lastScanTime   = 0;
let qrClockInterval  = null;
let currentSchoolYear = '2026-2027';
let currentSemester   = '1st Semester';

// Mirrors AstraMentoring-Backend/AstraMentoring-Backend/Constants/MentoringSlots.cs
// — the fixed checkpoints a regular session must be logged against, one per
// section per semester. Replaces the old free-typed topic + generic
// per-section session-count cap (see ADMIN_/JS/calendar-events.js for the
// same mirrored pattern used by the Calendar's own Slot picker).
const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals'
];
function slotsForSemester(semester) {
  return semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;
}

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentor');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  currentUser = getSession().user;
  await Promise.all([loadSessions(), loadMentorSections(), loadCurrentPeriod()]);

  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
  document.getElementById('periodFilter').addEventListener('change', applyFilters);
});

// ── PERIOD FILTER (School Year / Semester) ─────────────────────────────────
// Sessions already carry their own SchoolYear/Semester from the moment
// they're created (set from whatever System Settings said back then), so
// past periods stay intact even after Admin rolls Settings forward to a
// new year/semester — this just surfaces that existing per-session data
// as a filter instead of always mixing every period into one list.
function populatePeriodFilter(sessions) {
  const sel = document.getElementById('periodFilter');
  const seen = new Set();
  const periods = [];
  sessions.forEach(s => {
    if (!s.schoolYear || !s.semester) return;
    const key = `${s.schoolYear}|${s.semester}`;
    if (seen.has(key)) return;
    seen.add(key);
    periods.push({ schoolYear: s.schoolYear, semester: s.semester, key });
  });
  // Most recent school year first, then 2nd Sem before 1st Sem within it.
  periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));

  const prevValue = sel.value;
  sel.innerHTML = '<option value="">All School Years</option>' +
    periods.map(p => `<option value="${p.key}">${p.semester}, SY ${p.schoolYear}</option>`).join('');
  if (periods.some(p => p.key === prevValue)) sel.value = prevValue;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function localISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function localTimeStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── LOAD ──────────────────────────────────────────────────────────────────────
async function loadSessions() {
  const mentorId = currentUser?.userID;
  try {
    const [data, calendar] = await Promise.all([
      apiRequest(`SessionsAdmin/${mentorId}/sessions`, 'GET', null, true),
      apiRequest('CalendarEvents', 'GET', null, true).catch(() => null)
    ]);
    sessionCalendar = Array.isArray(calendar) ? calendar : null;
    allSessions         = data?.sessions || [];
    populatePeriodFilter(allSessions);
    updateStats(allSessions);
    updateProofBar(allSessions);
    renderCards(allSessions);
    document.getElementById('sessionSubtitle').textContent =
      `${allSessions.length} session${allSessions.length !== 1 ? 's' : ''} on record`;
  } catch (e) {
    console.error('Sessions load failed:', e);
    document.getElementById('sessionsList').innerHTML =
      '<div class="empty-state"><i class="ti ti-alert-circle"></i><p>Failed to load sessions. Please refresh.</p></div>';
  }
}

function updateStats(sessions) {
  const completed = sessions.filter(s => sessionDisplayStatus(s, sessionCalendar || []) === 'Completed').length;
  const scheduled = sessions.filter(s => sessionDisplayStatus(s, sessionCalendar || []) === 'Scheduled').length;
  const cancelled = sessions.filter(s => s.sessionStatus === 'Cancelled').length;
  document.getElementById('sTotalSessions').textContent = sessions.length;
  document.getElementById('sCompleted').textContent     = completed;
  document.getElementById('sScheduled').textContent     = scheduled;
  document.getElementById('sCancelled').textContent     = cancelled;
  document.getElementById('sClosed').textContent = sessions.filter(s => sessionDisplayStatus(s, sessionCalendar || []) === 'Closed').length;
  document.getElementById('sInProgress').textContent = sessions.filter(s => sessionDisplayStatus(s, sessionCalendar || []) === 'In Progress').length;
}

// Mirrors the Logsheet page's "not yet logged" pill — a Completed session
// (attendance taken via QR or already marked Completed) can still be
// missing its proof photo, which is required separately for Completeness
// scoring and for mentee signatures to appear on the logsheet.
function updateProofBar(sessions) {
  const bar  = document.getElementById('sProofBar');
  const pill = document.getElementById('sProofPill');
  if (!bar || !pill) return;

  const completed = sessions.filter(s => s.sessionStatus === 'Completed');
  if (!completed.length) { bar.style.display = 'none'; return; }

  const missing = completed.filter(s => !s.proofFilePath).length;
  bar.style.display = 'flex';

  if (missing > 0) {
    pill.className = 'sc-proof-pill-bar sc-proof-pill-bar--pending';
    pill.innerHTML  = `<i class="ti ti-photo-off"></i> ${missing} session${missing !== 1 ? 's' : ''} without proof photo`;
  } else {
    pill.className = 'sc-proof-pill-bar sc-proof-pill-bar--done';
    pill.innerHTML  = `<i class="ti ti-circle-check-filled"></i> All completed sessions have proof`;
  }
}

async function loadCurrentPeriod() {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    if (data?.SchoolYear) currentSchoolYear = data.SchoolYear;
    if (data?.Semester)   currentSemester   = data.Semester;
  } catch (e) { /* keep defaults */ }
}

function escapeCourseLabel(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadMentorSections() {
  try {
    const [assignments, menteesWithDept, courseCatalog] = await Promise.all([
      apiRequest('Users/assignments', 'GET', null, true),
      apiRequest('Users/mentees-with-dept', 'GET', null, true),
      apiRequest('Users/courses', 'GET', null, true),
    ]);
    const deptMap = {};
    (menteesWithDept || []).forEach(m => { deptMap[m.userID] = m; });

    const mine = (assignments || []).filter(a => a.mentorUserID === currentUser?.userID);
    const seen = new Set();
    mentorSections = [];
    mine.forEach(a => {
      const detail = deptMap[a.menteeUserID] || {};
      if(detail.isActive===false || detail.isDropOut===true)return;
      const school=Object.keys(courseCatalog||{}).find(s=>s.toLowerCase()===String(detail.school||'').trim().toLowerCase());
      const normalize=s=>String(s||'').replace(/\s+/g,'').toUpperCase();
      const sec=school&&(courseCatalog[school]||[]).find(c=>normalize(c)===normalize(detail.course));
      if(!sec)return;
      const courseKey=encodeURIComponent(school)+'|'+sec;
      if (!seen.has(courseKey)) {
        seen.add(courseKey);
        mentorSections.push({ sectionCode: sec, course:sec,courseSchool:school,courseKey });
      }
    });
    mentorSections.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
  } catch (e) { /* non-critical */ }
}

// ── RENDER CARDS ──────────────────────────────────────────────────────────────
function renderCards(sessions) {
  const list = document.getElementById('sessionsList');

  if (!sessions.length) {
    const isFiltered = allSessions.length > 0;
    list.innerHTML = isFiltered ? `
      <div class="empty-state">
        <i class="ti ti-filter-off"></i>
        <p>No sessions match your filter.</p>
      </div>` : `
      <div class="empty-state">
        <i class="ti ti-calendar-off"></i>
        <p>No sessions yet. Click <strong>Log Session</strong> to get started.</p>
      </div>`;
    return;
  }

  const sorted = [...sessions].sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));

  list.innerHTML = sorted.map(s => {
    const date      = new Date(s.sessionDate);
    const dStr      = date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
    const tStart    = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const tEnd      = s.timeEnd
      ? new Date(s.timeEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      : null;
    const timeStr   = tEnd ? `${tStart} – ${tEnd}` : tStart;
    const status    = s.sessionStatus || 'Scheduled';
    const displayStatus = sessionDisplayStatus(s, sessionCalendar || []);
    const statusCls = `status-${(displayStatus === 'In Progress' ? 'Scheduled' : displayStatus === 'Closed' ? 'Cancelled' : displayStatus).toLowerCase()}`;
    const rawTopic  = s.topic || '';
    // sectionCode/isMakeup come straight from the backend (Sessions.
    // SectionCode) rather than being guessed from a "[SECTION]" prefix in
    // the free-text topic — that guess broke silently for any session
    // whose notes didn't follow the convention, and couldn't reliably
    // tell apart which section a session belonged to for a mentor
    // handling more than one.
    const isMakeup     = s.isMakeup;
    const sectionTag   = isMakeup ? '' : (s.sectionCode || '');
    const displayTopic = rawTopic.replace(/^\[[^\]]+\]\s*/, '');
    const present   = s.presentCount   ?? 0;
    const total     = s.totalAttendees ?? 0;
    const pct       = total > 0 ? Math.round((present / total) * 100) : 0;
    const hasProof  = !!s.proofFilePath;
    const sid       = s.sessionID;

    const isCancelled  = status === 'Cancelled';
    const w=checkpointWindow(sessionCalendar,s.slotName,s.schoolYear,s.semester);
    const lateBadge = w.disabled && w.label !== 'Closed' && status !== 'Cancelled' && !(status === 'Completed' && s.timeEnd) ? '<span class="session-late-tag">'+w.label+'</span>' : '';
    const sessionNumBadge = isMakeup
      ? `<span class="sc-session-num sc-makeup-label">${s.slotName ? `Make-up Session: ${s.slotName}` : 'Make-up Session'}</span>`
      : s.slotName
        ? `<span class="sc-session-num">${s.slotName}</span>`
        : `<span class="sc-session-num">Session</span>`;

    const proofBtn = hasProof
      ? `<button type="button" class="sc-action-btn btn-sc-proof-view" onclick="viewProof(${jsonAttr(s.proofFilePath)}, ${jsonAttr(s.proofFileType || '')}, ${jsonAttr('Session Proof - ' + dStr)}, ${sid})">View Photo</button>`
      : `<button type="button" class="sc-action-btn btn-sc-proof-upload" aria-disabled="${!!proofUnavailableReason(s)}" title="${proofUnavailableReason(s) || 'Upload a session proof photo'}" onclick="openProofModal(${sid}, ${jsonAttr(dStr)})">
           <i class="ti ti-upload"></i> Upload Proof
         </button>`;

    const attBar = total > 0
      ? `<div class="sc-att-bar"><div class="sc-att-fill" style="width:${pct}%"></div></div>`
      : '';

    if (isCancelled) return `
      <div class="session-card session-card-cancelled">
        <div class="sc-top">
          <div class="sc-badges">
            ${sessionNumBadge}
            <span class="session-status ${statusCls}">${displayStatus}</span>
            ${sectionTag ? `<span class="sc-section-tag">${sectionTag}</span>` : ''}
          </div>
          <div class="sc-datetime">
            <i class="ti ti-calendar"></i>
            <span class="sc-date-str">${dStr}</span>
            <span class="sc-time-str">${timeStr}</span>
          </div>
        </div>
        ${!isMakeup && displayTopic ? `<div class="sc-topic sc-topic-cancelled">"${displayTopic}"</div>` : ''}
        <div class="sc-actions sc-actions-cancelled">
          <div class="sc-secondary-actions">
            <button class="sc-action-btn btn-sc-edit" onclick="openEditModal(${sid})" title="Edit session" aria-label="Edit">
              <i class="ti ti-pencil"></i>
            </button>
            <button class="sc-action-btn btn-sc-delete" onclick="openDeleteConfirm(${sid}, '${dStr}')" title="Delete session" aria-label="Delete">
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </div>
      </div>`;

    return `
      <div class="session-card">
        <div class="sc-top">
          <div class="sc-badges">
            ${sessionNumBadge}
            ${lateBadge}
            <span class="session-status ${statusCls}">${displayStatus}</span>
            ${sectionTag ? `<span class="sc-section-tag">${sectionTag}</span>` : ''}
          </div>
          <div class="sc-datetime">
            <i class="ti ti-calendar"></i>
            <span class="sc-date-str">${dStr}</span>
            <span class="sc-time-str">${timeStr}</span>
          </div>
        </div>

        ${!isMakeup && displayTopic ? `<div class="sc-topic">"${displayTopic}"</div>` : ''}

        <div class="sc-attendance">
          <div class="sc-att-row">
            <i class="ti ti-users"></i>
            <span class="sc-att-count">${present} / ${total} present</span>
          </div>
          ${attBar}
        </div>

        <div class="sc-actions">
          <div class="sc-primary-actions">
            <button class="sc-action-btn btn-sc-qr" onclick="openQrScanner(${sid}, '${dStr}')">
              <i class="ti ti-qrcode"></i> ${w.disabled || w.upcoming || s.timeEnd ? 'View Attendance' : 'Scan QR'}
            </button>
            ${proofBtn}
          </div>
          <div class="sc-secondary-actions">
            <button class="sc-action-btn btn-sc-edit" onclick="openEditModal(${sid})" title="Edit session" aria-label="Edit">
              <i class="ti ti-pencil"></i>
            </button>
            ${status === 'Completed' || present > 0 ? '' : `<button class="sc-action-btn btn-sc-delete" onclick="openDeleteConfirm(${sid}, '${dStr}')" title="Delete session" aria-label="Delete">
              <i class="ti ti-trash"></i>
            </button>`}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── FILTERS ───────────────────────────────────────────────────────────────────
function applyFilters() {
  const q      = document.getElementById('searchInput').value.trim().toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const period = document.getElementById('periodFilter').value;
  let filtered = allSessions;
  if (status) filtered = filtered.filter(s => sessionDisplayStatus(s, sessionCalendar || []) === status);
  if (period) filtered = filtered.filter(s => `${s.schoolYear}|${s.semester}` === period);
  if (q) {
    filtered = filtered.filter(s => {
      const date  = new Date(s.sessionDate).toLocaleDateString('en-PH').toLowerCase();
      const topic = (s.topic || '').toLowerCase();
      return date.includes(q) || topic.includes(q);
    });
  }
  renderCards(filtered);
}

// ── SESSION SLOT PICKER ──────────────────────────────────────────────────────
function regularSessionStatusFor(sectionCode, slotName) {
  const group=mentorSections.find(c=>c.courseKey===sectionCode||c.sectionCode===sectionCode);
  const code=group?.sectionCode||sectionCode;
  const matching = allSessions.filter(s =>
    !s.isMakeup && (s.courseCode || s.sectionCode || null) === code && (!s.courseSchool||!group?.courseSchool||s.courseSchool===group.courseSchool) &&
    s.schoolYear === currentSchoolYear && s.semester === currentSemester &&
    s.slotName === slotName && s.sessionStatus !== 'Cancelled'
  );
  if (matching.some(s => s.sessionStatus === 'Scheduled')) return 'Already scheduled';
  if (matching.some(s => s.sessionStatus === 'Completed')) return 'Completed';
  return matching.length ? 'Already scheduled' : null;
}

function populateSlotPicker(selectId, sectionCode, preserveValue) {
  const sel  = document.getElementById(selectId);
  sel.innerHTML = '<option value="" disabled>Choose...</option>' +
    slotsForSemester(currentSemester).map(name => {
      const windowState=checkpointWindow(sessionCalendar,name,currentSchoolYear,currentSemester);
      const existingStatus = regularSessionStatusFor(sectionCode, name);
      const isBlocked = (existingStatus !== null && name !== preserveValue) || windowState.disabled;
      const style = isBlocked ? 'color:#9ca3af' : 'font-weight:700';
      const label = existingStatus ? ` — ${existingStatus}` : windowState.disabled ? ' — '+windowState.label : '';
      return `<option value="${name}" style="${style}" ${isBlocked ? 'disabled' : ''} ${name === preserveValue ? 'selected' : ''}>${name}${label}</option>`;
    }).join('');
  if (!preserveValue) sel.value = '';
  const dateEl=document.getElementById(selectId==='sessionSlotPick'?'sessionDateInput':'editDateInput');
  const constrainDate=()=>{
    const w=checkpointWindow(sessionCalendar,sel.value,currentSchoolYear,currentSemester);
    dateEl.min=w.start && w.start>checkpointToday()?w.start:checkpointToday();
    dateEl.max=w.end||'';
  };
  sel.addEventListener('change',constrainDate);
  constrainDate();
}

// ── LOG SESSION MODAL ─────────────────────────────────────────────────────────
function openLogSessionModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('sessionDateInput').value  = today;
  document.getElementById('sessionTimeStart').value  = '';
  document.getElementById('sessionNotesInput').value = '';

  const group  = document.getElementById('sectionPickGroup');
  const picker = document.getElementById('sessionSectionPick');
  if (mentorSections.length > 1) {
    picker.innerHTML = mentorSections.map(s =>
      `<option value="${escapeCourseLabel(s.courseKey||s.sectionCode)}">${escapeCourseLabel(s.sectionCode)}${s.courseSchool?' — '+s.courseSchool:''}</option>`
    ).join('');
    group.style.display = '';
  } else {
    group.style.display = 'none';
  }

  const initialSection = mentorSections.length > 1 ? picker.value : (mentorSections[0]?.sectionCode || null);
  populateSlotPicker('sessionSlotPick', initialSection);
  picker.onchange = () => populateSlotPicker('sessionSlotPick', picker.value);

  const btn = document.getElementById('submitSessionBtn');
  btn.disabled  = false;
  btn.innerHTML = '<i class="ti ti-calendar-plus"></i> Log Session';
  const errEl = document.getElementById('logSessionError');
  if (errEl) errEl.style.display = 'none';
  document.getElementById('logSessionModal').classList.add('open');
}

function closeLogSessionModal(e) {
  if (!e || e.target === document.getElementById('logSessionModal'))
    document.getElementById('logSessionModal').classList.remove('open');
}

async function submitLogSession(e) {
  e.preventDefault();
  const date      = document.getElementById('sessionDateInput').value;
  const timeStart = document.getElementById('sessionTimeStart').value;
  const notes     = document.getElementById('sessionNotesInput').value.trim();
  const btn       = document.getElementById('submitSessionBtn');

  const sectionPick = mentorSections.length > 1
    ? document.getElementById('sessionSectionPick').value
    : (mentorSections[0]?.sectionCode || '');
  const selectedCourse=mentorSections.find(c=>c.courseKey===sectionPick||c.sectionCode===sectionPick);
  const validSection = selectedCourse?.sectionCode || null;
  const finalNotes   = validSection
    ? `[${validSection}]${notes ? ' ' + notes : ''}`
    : (notes || null);
  const slotName = document.getElementById('sessionSlotPick').value || null;
  if(!checkpointDateAllowed(checkpointWindow(sessionCalendar,slotName,currentSchoolYear,currentSemester),date)) {
    const error=document.getElementById('logSessionError');
    error.textContent='Choose an available checkpoint and a date within its session window.';
    error.style.display='';
    showToast(error.textContent); return;
  }

  btn.disabled    = true;
  btn.textContent = 'Logging...';

  try {
    await apiRequest('Sessions', 'POST', {
      MentorID:    currentUser.userID,
      SessionDate: `${date}T${timeStart}:00`,
      Status:      'Scheduled',
      Notes:       finalNotes,
      SectionCode: validSection,
      CourseCode: selectedCourse?.sectionCode || (mentorSections.length===1?mentorSections[0].sectionCode:null),
      CourseSchool: selectedCourse?.courseSchool || (mentorSections.length===1?mentorSections[0].courseSchool:null),
      SlotName:    slotName,
    }, true);
    document.getElementById('logSessionModal').classList.remove('open');
    showToast('Session logged successfully.', 'success');
    await loadSessions();
  } catch (err) {
    console.error('Log session failed:', err);
    const errEl = document.getElementById('logSessionError');
    if (errEl) {
      errEl.textContent  = err.message || 'Failed to log session. Please try again.';
      errEl.style.display = '';
    }
    showToast(err.message || 'Failed to log session. Please try again.');
    btn.disabled  = false;
    btn.innerHTML = '<i class="ti ti-calendar-plus"></i> Log Session';
  }
}

// ── EDIT SESSION MODAL ───────────────────────────────────────────────────────
function openEditModal(sessionId) {
  editSessionId = sessionId;
  const s = allSessions.find(s => s.sessionID === sessionId);
  if (!s) return;

  // Same rule as Delete: a completed session or one with attendance can't be cancelled.
  const cancelBtn = document.querySelector('#editSessionModal .btn-cancel-session');
  if (cancelBtn) cancelBtn.style.display = (s.sessionStatus === 'Completed' || (s.presentCount ?? 0) > 0) ? 'none' : '';

  const rawTopic    = s.topic || '';
  // The session's real section, not a guess from its notes text — matters
  // most right here, since picking the wrong option in a multi-section
  // mentor's dropdown below would silently reassign the session.
  const currentSec  = s.isMakeup ? '' : (s.sectionCode || '');
  const displayTopic = rawTopic.replace(/^\[[^\]]+\]\s*/, '');

  const group  = document.getElementById('editSectionPickGroup');
  const picker = document.getElementById('editSectionPick');
  // Hidden for a makeup session too, not just a single-section mentor — a
  // makeup session has no section of its own (submitEditSession never sends
  // one for it), so showing a dropdown here would just default to whichever
  // option sorts first and look like that's the session's section when it
  // isn't and won't be saved as one.
  if (!s.isMakeup && s.groupingMode === 'Course' && mentorSections.length > 1) {
    picker.innerHTML = mentorSections.map(sec =>
      `<option value="${escapeCourseLabel(sec.courseKey)}" ${sec.sectionCode === currentSec && (!s.courseSchool || sec.courseSchool === s.courseSchool) ? 'selected' : ''}>${escapeCourseLabel(sec.sectionCode)} / ${escapeCourseLabel(sec.courseSchool)}</option>`
    ).join('');
    group.style.display = '';
  } else {
    group.style.display = 'none';
  }

  // A makeup session never has a slot of its own — hide the picker rather
  // than showing one that can't be saved (submitEditSession never sends
  // SlotName for a makeup session).
  const slotGroup = document.getElementById('editSlotPickGroup');
  if (s.isMakeup) {
    slotGroup.style.display = 'none';
  } else {
    slotGroup.style.display = '';
    populateSlotPicker('editSlotPick', currentSec, s.slotName);
    picker.onchange = () => populateSlotPicker('editSlotPick', picker.value, null);
  }

  const dateStr    = (s.sessionDate || '').split('T')[0];
  const timeStr    = (s.sessionDate || '').split('T')[1]?.slice(0, 5) || '';

  document.getElementById('editDateInput').value  = dateStr;
  document.getElementById('editTimeStart').value  = timeStr;
  document.getElementById('editNotesInput').value = displayTopic;

  const btn = document.getElementById('submitEditBtn');
  btn.disabled  = false;
  btn.innerHTML = '<i class="ti ti-check"></i> Save Changes';
  document.getElementById('editSessionModal').classList.add('open');
}

function closeEditModal(e) {
  if (!e || e.target === document.getElementById('editSessionModal'))
    document.getElementById('editSessionModal').classList.remove('open');
}

async function submitEditSession(e) {
  e.preventDefault();
  const date      = document.getElementById('editDateInput').value;
  const timeStart = document.getElementById('editTimeStart').value;
  const notes     = document.getElementById('editNotesInput').value.trim();
  const btn       = document.getElementById('submitEditBtn');

  const currentSession = allSessions.find(s => s.sessionID === editSessionId);
  const currentStatus  = currentSession?.sessionStatus || 'Scheduled';
  const isMakeup        = !!currentSession?.isMakeup;

  // A makeup session has no section of its own (see renderCards above) — the
  // picker only ever shows for a regular session, but a single-section
  // mentor's dropdown is hidden either way, so without this check a makeup
  // session's Notes would silently get that mentor's section bracket
  // stitched on, making it look like — and, once saved, become — a regular
  // session for that section.
  const sectionPick  = (!isMakeup && mentorSections.length > 1)
    ? document.getElementById('editSectionPick').value
    : (!isMakeup ? (mentorSections[0]?.sectionCode || '') : '');
  const selectedCourse=mentorSections.find(c=>c.courseKey===sectionPick||c.sectionCode===sectionPick);
  const validSection = isMakeup ? null : (currentSession?.groupingMode !== 'Course' ? currentSession?.sectionCode : selectedCourse?.sectionCode || currentSession?.sectionCode) || null;
  const finalNotes   = validSection
    ? `[${validSection}]${notes ? ' ' + notes : ''}`
    : (notes || null);
  const slotName = isMakeup ? null : (document.getElementById('editSlotPick').value || null);

  btn.disabled    = true;
  btn.textContent = 'Saving...';
  const errEl = document.getElementById('editSessionError');
  if (errEl) errEl.style.display = 'none';

  try {
    await apiRequest(`Sessions/${editSessionId}`, 'PUT', {
      SessionID:   editSessionId,
      MentorID:    currentUser.userID,
      SessionDate: `${date}T${timeStart}:00`,
      Status:      currentStatus,
      Notes:       finalNotes,
      CourseCode: currentSession?.groupingMode === 'Course' && !isMakeup ? selectedCourse?.sectionCode : undefined,
      CourseSchool: currentSession?.groupingMode === 'Course' && !isMakeup ? selectedCourse?.courseSchool : undefined,
      SlotName:    slotName,
    }, true);
    document.getElementById('editSessionModal').classList.remove('open');
    showToast('Session updated successfully.', 'success');
    await loadSessions();
  } catch (err) {
    console.error('Edit session failed:', err);
    if (errEl) {
      errEl.textContent  = err.message || 'Failed to save changes. Please try again.';
      errEl.style.display = '';
    }
    showToast(err.message || 'Failed to save changes. Please try again.');
    btn.disabled  = false;
    btn.innerHTML = '<i class="ti ti-check"></i> Save Changes';
  }
}

// ── CANCEL SESSION ────────────────────────────────────────────────────────────
function openCancelSessionConfirm() {
  const s = allSessions.find(s => s.sessionID === editSessionId);
  if (!s || s.sessionStatus === 'Completed' || (s.presentCount ?? 0) > 0) return;
  cancelSessionId = editSessionId;

  const date = new Date(s.sessionDate);
  const dStr = date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  document.getElementById('cancelConfirmDate').textContent = dStr;

  const btn = document.getElementById('confirmCancelBtn');
  btn.disabled  = false;
  btn.innerHTML = '<i class="ti ti-calendar-x"></i> Yes, Cancel';

  document.getElementById('editSessionModal').classList.remove('open');
  document.getElementById('cancelConfirmModal').classList.add('open');
}

function closeCancelConfirm(e) {
  if (!e || e.target === document.getElementById('cancelConfirmModal'))
    document.getElementById('cancelConfirmModal').classList.remove('open');
}

async function confirmCancelSession() {
  if (!cancelSessionId) return;
  const btn = document.getElementById('confirmCancelBtn');
  btn.disabled    = true;
  btn.textContent = 'Cancelling...';

  const s = allSessions.find(s => s.sessionID === cancelSessionId);
  if (!s) { closeCancelConfirm(); return; }

  try {
    await apiRequest(`Sessions/${cancelSessionId}`, 'PUT', {
      SessionID:   cancelSessionId,
      MentorID:    currentUser.userID,
      SessionDate: s.sessionDate,
      Status:      'Cancelled',
      Notes:       s.topic || null,
      TimeEnd:     s.timeEnd || null,
    }, true);
    document.getElementById('cancelConfirmModal').classList.remove('open');
    showToast('Session cancelled.', 'info');
    await loadSessions();
  } catch (err) {
    console.error('Cancel session failed:', err);
    showToast(err.message || 'Failed to cancel session. Please try again.');
    btn.disabled  = false;
    btn.innerHTML = '<i class="ti ti-calendar-x"></i> Yes, Cancel';
  }
}

// ── DELETE SESSION ────────────────────────────────────────────────────────────
function openDeleteConfirm(sessionId, dateStr) {
  deleteSessionId = sessionId;
  document.getElementById('deleteConfirmDate').textContent = dateStr;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled  = false;
  btn.innerHTML = '<i class="ti ti-trash"></i> Delete';
  document.getElementById('deleteConfirmModal').classList.add('open');
}

function closeDeleteConfirm(e) {
  if (!e || e.target === document.getElementById('deleteConfirmModal'))
    document.getElementById('deleteConfirmModal').classList.remove('open');
}

async function confirmDeleteSession() {
  if (!deleteSessionId) return;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled    = true;
  btn.textContent = 'Deleting...';

  try {
    await apiRequest(`Sessions/${deleteSessionId}`, 'DELETE', null, true);
    document.getElementById('deleteConfirmModal').classList.remove('open');
    showToast('Session deleted.', 'success');
    await loadSessions();
  } catch (err) {
    console.error('Delete session failed:', err);
    showToast(err.message || 'Failed to delete session. Please try again.');
    btn.disabled  = false;
    btn.innerHTML = '<i class="ti ti-trash"></i> Delete';
  }
}

// ── QR SCANNER / ATTENDANCE MODAL ─────────────────────────────────────────────
function canFinishAttendance(session) {
  if (!session || session.sessionStatus === 'Cancelled' || session.timeEnd) return false;
  const w = checkpointWindow(sessionCalendar, session.slotName, session.schoolYear, session.semester);
  return (!w.disabled && !w.upcoming) || attendanceRows.some(row => row.isPresent && row.scannedAt);
}

async function openQrScanner(sessionId, dateStr) {
  const session=allSessions.find(s=>s.sessionID===sessionId);
  const w=checkpointWindow(sessionCalendar,session?.slotName,session?.schoolYear,session?.semester);
  const canScan=!!session && session.sessionStatus !== 'Cancelled' && !w.disabled && !w.upcoming && !session.timeEnd;
  currentAttSid  = sessionId;
  attendanceRows = [];
  scannedIds     = new Set();
  lastScanTime   = 0;

  document.getElementById('qrScanDate').textContent    = dateStr;
  document.getElementById('qrAttList').innerHTML        = '<div class="list-skeleton"><span class="spinner"></span> Loading...</div>';
  document.getElementById('qrAttCount').textContent     = '0 / 0 present';
  clearTimeout(document.getElementById('qrStatus')._resetTimer);
  document.querySelector('#qrScanModal .modal-title').textContent = canScan ? 'Scan Attendance' : 'View Attendance';
  document.getElementById('qr-reader').style.display = canScan ? '' : 'none';
  document.getElementById('qrStatus').textContent = canScan ? 'Starting camera...' : 'Attendance closed. Existing records remain available.';
  document.getElementById('qrStatus').className         = 'qr-status';

  // Display Philippine time; the API records the authoritative finish instant.
  function updateQrClock() {
    document.getElementById('qrEndTimeDisplay').textContent = new Date().toLocaleTimeString('en-PH', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true
    });
  }
  clearInterval(qrClockInterval);
  document.querySelector('#qrScanModal .qr-end-time-row').style.display = canScan ? '' : 'none';
  if (canScan) { updateQrClock(); qrClockInterval = setInterval(updateQrClock, 1000); }

  const btn = document.getElementById('saveQrAttBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-check"></i> Save & Close';
  document.getElementById('qrScanModal').classList.add('open');

  try {
    const existing = await apiRequest(`SessionsAdmin/session/${sessionId}/mentees`, 'GET', null, true);

    if (existing && existing.length > 0) {
      attendanceRows = existing.map(m => ({
        attendanceID: m.attendanceID,
        menteeID:     m.menteeID,
        menteeName:   `${m.menteeFirstName || ''} ${m.menteeLastName || ''}`.trim() || '—',
        section:      m.sectionCode || '',
        attendanceRecorded: Number(m.attendanceID) > 0,
        isPresent:    LogsheetData.attendanceState(m) === true,
        attendanceUnverified: m.isPresent === true && LogsheetData.attendanceState(m) !== true,
        scannedAt:    m.scannedAt || null,
        mentorNotes:  m.mentorNotes || '',
        // Dropped-out mentees are excluded from FRESH rosters (see the
        // filter below), but one with existing Attendance here is a
        // legitimate historical record — flag it so the row can be
        // marked instead of looking like an ordinary active mentee.
        isDropOut:    !!m.isDropOut,
      }));
      attendanceRows.filter(r => r.isPresent).forEach(r => scannedIds.add(r.menteeID));
    } else {
      const session    = allSessions.find(s => s.sessionID === sessionId);
      // The session's real section/makeup status, not a guess from its
      // notes text — this decides which pool of mentees gets loaded below,
      // so guessing wrong here means attendance gets taken against the
      // wrong roster entirely, not just a mislabeled card.
      const isMakeup   = !!session?.isMakeup;
      if (isMakeup) {
        // Makeup session — load all approved requesters for this slot
        const requesters = await apiRequest(
          `SessionsAdmin/session/${sessionId}/requester`, 'GET', null, true
        ).catch(() => null);

        if (requesters && requesters.length > 0) {
          attendanceRows = requesters.map(r => ({
            attendanceID: null,
            menteeID:     r.menteeID,
            menteeName:   `${r.menteeFirstName || ''} ${r.menteeLastName || ''}`.trim() || '—',
            section:      r.sectionCode || '',
            attendanceRecorded: false,
            isPresent:    false,
            scannedAt:    null,
            mentorNotes:  '',
          }));
        } else {
          attendanceRows = [];
        }
      } else {
        // The backend roster applies the assignment effective-date cutoff.
        // An empty response is an empty historical roster, not a reason to
        // rebuild it from today's assignments.
        attendanceRows = [];
      }
    }

    renderQrAttList();
    btn.disabled = !canFinishAttendance(session);
    if(canScan) startQrScanner();
    else showQrStatus('Attendance closed. Existing records remain available.', 'error', true);
  } catch (err) {
    console.error('QR scanner setup failed:', err);
    document.getElementById('qrAttList').innerHTML =
      '<div class="list-skeleton">Could not load attendance data.</div>';
    document.getElementById('qrStatus').textContent = 'Could not load attendance.';
  }
}

function renderQrAttList() {
  const container = document.getElementById('qrAttList');
  const present   = attendanceRows.filter(r => r.isPresent).length;
  const total     = attendanceRows.length;
  document.getElementById('qrAttCount').textContent = `${present} / ${total} present`;

  if (!total) {
    container.innerHTML = '<div class="list-skeleton">No mentees found for this session.</div>';
    return;
  }

  container.innerHTML = attendanceRows.map((m, idx) => {
    const parts    = m.menteeName.split(' ');
    const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
    const section  = m.section ? ` · ${m.section}` : '';
    const cls      = !m.attendanceRecorded || m.attendanceUnverified ? '' : m.isPresent ? 'is-present' : 'is-absent';
    const icon     = !m.attendanceRecorded || m.attendanceUnverified ? 'ti-minus' : m.isPresent ? 'ti-check' : 'ti-x';
    const label    = m.attendanceUnverified ? 'Unverified' : !m.attendanceRecorded ? 'Not recorded' : m.isPresent ? 'Present' : 'Absent';
    const dropout  = m.isDropOut ? '<span class="att-dropout-chip">Drop Out</span>' : '';
    return `
      <div class="att-row${m.attendanceRecorded && !m.isPresent && !m.attendanceUnverified ? ' att-row-absent' : ''}">
        <div class="att-row-top">
          <div class="att-avatar">${initials}</div>
          <div class="att-name">${m.menteeName}<span class="att-section">${section}</span>${dropout}</div>
          <span class="att-presence-status ${cls}">
            <i class="ti ${icon}"></i> ${label}
          </span>
        </div>
      </div>`;
  }).join('');
}

function startQrScanner() {
  const readerEl = document.getElementById('qr-reader');
  if (!readerEl) return;
  readerEl.innerHTML = '';

  html5QrCode = new Html5Qrcode('qr-reader');
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    handleQrScan,
    () => {}
  ).then(() => {
    document.getElementById('qrStatus').textContent = 'Point camera at mentee QR code';
    document.getElementById('qrStatus').className   = 'qr-status';
  }).catch(err => {
    document.getElementById('qrStatus').textContent = 'Camera unavailable. Allow camera access and reopen the scanner. Attendance requires a QR scan.';
    document.getElementById('qrStatus').className   = 'qr-status warn';
    console.warn('QR scanner:', err);
  });
}

async function handleQrScan(decodedText) {
  const now = Date.now();
  if (now - lastScanTime < 1500) return;
  lastScanTime = now;

  const token = decodedText.trim();
  if (!token) {
    showQrStatus('Empty QR code', 'error');
    return;
  }

  try {
    const result = await apiRequest('QRAttendance/scan', 'POST', { token, sessionId: currentAttSid }, true);

    if (!result.success) {
      showQrStatus(result.message || 'Invalid or expired QR', 'error');
      showToast(result.message || 'Invalid or expired QR code.', 'error', 3000);
      return;
    }

    const { menteeId, sessionId, menteeName } = result;

    if (sessionId !== currentAttSid) {
      showQrStatus('QR is for a different session', 'error');
      return;
    }

    if (scannedIds.has(menteeId)) {
      showQrStatus(`${menteeName} already scanned`, 'warn');
      showToast(`${menteeName} was already scanned.`, 'info', 2500);
      return;
    }

    const row = attendanceRows.find(r => r.menteeID === menteeId);
    if (!row) {
      showQrStatus('Mentee not in this session', 'error');
      return;
    }

    scannedIds.add(menteeId);
    row.isPresent = true;
    row.attendanceUnverified = false;
    row.attendanceRecorded = true;
    row.scannedAt = localISO();
    renderQrAttList();
    flashScanSuccess(menteeName);
    showToast(`${menteeName} marked present.`, 'success', 2500);
  } catch (e) {
    console.error('QR scan failed:', e);
    showQrStatus('Scan failed — try again', 'error');
  }
}

function flashScanSuccess(name) {
  const el = document.getElementById('qrStatus');
  el.textContent = `✓ ${name} — Saved!`;
  el.className   = 'qr-status success';
  clearTimeout(el._resetTimer);
  el._resetTimer = setTimeout(() => {
    el.textContent = 'Ready — point at next QR code';
    el.className   = 'qr-status';
  }, 1500);
}


function showQrStatus(msg, type, persistent = false) {
  const el = document.getElementById('qrStatus');
  el.textContent = msg;
  el.className   = `qr-status ${type}`;
  clearTimeout(el._resetTimer);
  if (persistent) return;
  el._resetTimer = setTimeout(() => {
    el.textContent = 'Point camera at mentee QR code';
    el.className   = 'qr-status';
  }, 2000);
}

async function saveQrAttendance() {
  if (!currentAttSid || !attendanceRows.length || !canFinishAttendance(allSessions.find(s => s.sessionID === currentAttSid))) return;
  const btn = document.getElementById('saveQrAttBtn');
  btn.disabled    = true;
  btn.textContent = 'Saving...';

  try {
    const requests = attendanceRows.map(row => {
      const payload = {
        SessionID:     currentAttSid,
        MenteeID:      row.menteeID,
        IsPresent:     false,
      };
      // Ensure an absent row exists; the API preserves attendance already saved by QR.
      return apiRequest('Attendance', 'POST', payload, true);
    });

    await Promise.all(requests);
    await apiRequest(`Sessions/${currentAttSid}/finish`, 'POST', {}, true);

    clearInterval(qrClockInterval);
    await stopQrScanner();
    document.getElementById('qrScanModal').classList.remove('open');
    showToast('Attendance saved and session finished.', 'success');
    await loadSessions();
  } catch (err) {
    console.error('Save attendance failed:', err);
    showToast(err.message || 'Failed to save attendance. Please try again.');
    btn.disabled = !canFinishAttendance(allSessions.find(s => s.sessionID === currentAttSid));
    btn.innerHTML = '<i class="ti ti-check"></i> Save & Close';
  }
}

async function stopQrScanner() {
  if (html5QrCode) {
    try { await html5QrCode.stop(); } catch (e) {}
    html5QrCode = null;
    const reader = document.getElementById('qr-reader');
    if (reader) reader.innerHTML = '';
  }
}

function closeQrScannerOverlay(e) {
  if (e.target === document.getElementById('qrScanModal')) closeQrScanner();
}

async function closeQrScanner() {
  clearInterval(qrClockInterval);
  await stopQrScanner();
  document.getElementById('qrScanModal').classList.remove('open');
}

// ── PROOF MODAL ───────────────────────────────────────────────────────────────
function proofUnavailableReason(session) {
  if (!session) return 'This session is no longer available. Refresh the session list.';
  if (session.sessionStatus === 'Cancelled') return 'Proof cannot be uploaded for a cancelled session.';
  // New API field uses the same persisted QR-attendance requirement as upload.
  // Keep older API responses compatible during a backend-first rollout.
  const verified = typeof session.hasVerifiedAttendance === 'boolean'
    ? session.hasVerifiedAttendance : Number(session.presentCount) > 0;
  return verified ? '' : 'Record at least one verified QR attendance before uploading proof.';
}

function openProofModal(sessionId, dateStr) {
  if (proofUploadInFlight) { showToast('A proof upload is already in progress. Please wait.'); return; }
  const session = allSessions.find(s => Number(s.sessionID) === Number(sessionId));
  const reason = proofUnavailableReason(session);
  if (reason) { showToast(reason); return; }
  proofSessionId = session.sessionID;
  document.getElementById('proofModalDate').textContent = dateStr;
  clearProofFile();
  clearProofError();
  const btn = document.getElementById('submitProofBtn');
  btn.disabled  = true;
  btn.innerHTML = '<i class="ti ti-upload"></i> Upload';
  document.getElementById('proofModal').classList.add('open');
}

function closeProofModal(e) {
  if (proofUploadInFlight) return;
  if (!e || e.target === document.getElementById('proofModal')) {
    document.getElementById('proofModal').classList.remove('open');
    clearProofFile();
    proofSessionId = null;
  }
}

function handleProofFileSelect(event) {
  stopProofCamera();
  event.target.removeAttribute('capture');
  const file = event.target.files[0];
  if (!file) return;
  const error = validateUploadFile(file, 'ProofOfSession/upload');
  if (error) { clearProofFile(); showProofError(error); return; }
  clearProofError();
  document.getElementById('submitProofBtn').disabled = false;
  document.getElementById('proofFileName').textContent = file.name;
  showToast(`${file.name} attached.`, 'info', 2500);
  // Once something's picked, the Upload File / Take Photo cards would just
  // sit there doing nothing above the preview -- hide them instead of
  // leaving both visible at once; clearProofFile() (the × on the preview)
  // brings them back for picking something else.
  document.getElementById('proofOptions').style.display     = 'none';
  document.getElementById('proofPreviewWrap').style.display = 'block';
  const img = document.getElementById('proofPreviewImg');
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      if (document.getElementById('proofFileInput').files[0] !== file) return;
      img.src = e.target.result; img.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    img.style.display = 'none';
  }
}

function showProofError(msg) {
  const el = document.getElementById('proofErrorMsg');
  el.innerHTML = `<i class="ti ti-alert-circle"></i> ${msg}`;
  el.style.display = 'flex';
  showToast(msg);
}

function clearProofError() {
  const el = document.getElementById('proofErrorMsg');
  if (el) el.style.display = 'none';
}

// Phones keep native capture; desktop browsers use a small webcam preview.
let proofCameraStream = null;
let proofCameraAttempt = 0;
let capturedProofFile = null;
let capturedProofUrl = null;
function usesProofNativeCamera() {
  return navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function stopProofCamera() {
  proofCameraAttempt++;
  if (proofCameraStream) proofCameraStream.getTracks().forEach(track => track.stop());
  proofCameraStream = null;
  document.getElementById('proofCameraVideo').srcObject = null;
  document.getElementById('proofCameraPanel').hidden = true;
  capturedProofFile = null;
  if (capturedProofUrl) URL.revokeObjectURL(capturedProofUrl);
  capturedProofUrl = null;
  document.getElementById('proofCameraStill').removeAttribute('src');
  document.getElementById('proofCameraStill').hidden = true;
  document.getElementById('proofCameraVideo').hidden = false;
  document.getElementById('proofCameraLiveActions').hidden = false;
  document.getElementById('proofCameraCapturedActions').hidden = true;
  document.getElementById('proofOptions').style.display = 'grid';
}
function proofCameraFailed() {
  stopProofCamera();
  document.getElementById('proofCameraHint').textContent = 'Camera unavailable. Use Upload Photo to choose an existing image.';
}
async function openCamera() {
  if (proofUploadInFlight) return;
  stopProofCamera();
  clearProofError();
  if (!usesProofNativeCamera()) {
    if (!navigator.mediaDevices?.getUserMedia) { proofCameraFailed(); return; }
    const attempt = proofCameraAttempt;
    document.getElementById('proofCameraHint').textContent = 'Allow camera access, then Capture. Upload confirms submission separately.';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      if (attempt !== proofCameraAttempt) { stream.getTracks().forEach(track => track.stop()); return; }
      proofCameraStream = stream;
      stream.getVideoTracks().forEach(track => { track.onended = () => { if (proofCameraStream === stream) proofCameraFailed(); }; });
      document.getElementById('proofCameraVideo').srcObject = stream;
      document.getElementById('proofCameraPanel').hidden = false;
      document.getElementById('proofOptions').style.display = 'none';
    } catch (error) {
      if (attempt !== proofCameraAttempt) return;
      proofCameraFailed();
      document.getElementById('proofCameraHint').textContent = error.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow access in your browser or use Upload Photo.'
        : 'Camera unavailable or already in use. Use Upload Photo to choose an existing image.';
    }
    return;
  }
  const input = document.getElementById('proofFileInput');
  input.accept = 'image/*';
  input.setAttribute('capture', 'environment');
  document.getElementById('proofCameraHint').textContent = 'On supported phones, your device camera opens. If this browser opens a file picker instead, choose an existing photo or use Upload Photo. Desktop websites cannot force-open the system Camera application.';
  input.click();
}
function captureProofPhoto() {
  const video = document.getElementById('proofCameraVideo');
  if (!proofCameraStream || !video.videoWidth || !video.videoHeight) {
    document.getElementById('proofCameraHint').textContent = 'Camera is still loading. Try Capture again or use Upload Photo.'; return;
  }
  const attempt = proofCameraAttempt;
  const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  try {
    canvas.getContext('2d').drawImage(video,0,0);
    canvas.toBlob(blob => {
      if (attempt !== proofCameraAttempt) return;
      if (!blob) { proofCameraFailed(); return; }
      try {
        capturedProofFile = new File([blob],'session-proof.jpg',{type:'image/jpeg'});
        const error = validateUploadFile(capturedProofFile, 'ProofOfSession/upload');
        if (error) { proofCameraFailed(); showProofError(error); return; }
        if (proofCameraStream) proofCameraStream.getTracks().forEach(track => track.stop());
        proofCameraStream = null; video.srcObject = null; video.hidden = true;
        capturedProofUrl = URL.createObjectURL(blob);
        document.getElementById('proofCameraStill').src = capturedProofUrl;
        document.getElementById('proofCameraStill').hidden = false;
        document.getElementById('proofCameraLiveActions').hidden = true;
        document.getElementById('proofCameraCapturedActions').hidden = false;
      } catch (error) { proofCameraFailed(); }
    },'image/jpeg',0.9);
  } catch (error) { proofCameraFailed(); }
}
window.addEventListener('pagehide',stopProofCamera);
function useProofPhoto() {
  if (!capturedProofFile) return;
  const transfer = new DataTransfer(); transfer.items.add(capturedProofFile);
  const input = document.getElementById('proofFileInput'); input.files = transfer.files;
  handleProofFileSelect({target:input});
}
function openProofPicker() {
  stopProofCamera();
  const input = document.getElementById('proofFileInput');
  input.accept = 'image/*,application/pdf';
  input.removeAttribute('capture');
  document.getElementById('proofCameraHint').textContent = '';
  input.click();
}

function clearProofFile() {
  stopProofCamera();
  document.getElementById('proofFileInput').value = '';
  document.getElementById('proofFileInput').removeAttribute('capture');
  document.getElementById('proofFileInput').accept = 'image/*,application/pdf';
  document.getElementById('proofOptions').style.display = 'grid';
  document.getElementById('submitProofBtn').disabled = true;
  document.getElementById('proofCameraHint').textContent = '';
  document.getElementById('proofPreviewWrap').style.display = 'none';
  const img = document.getElementById('proofPreviewImg');
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = '';
  document.getElementById('proofFileName').textContent = '—';
}

// ── UPLOAD CONFIRMATION MODAL ─────────────────────────────────────────────────
// Same "are you sure?" step Logsheet's own Submit button already has —
// Upload Proof used to go straight from clicking "Upload" to actually
// uploading, no chance to back out even though it's just as consequential
// (marks the session Completed, visible to Admin/Head right after).
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

async function submitProof() {
  if (proofUploadInFlight) return;
  const sessionId = proofSessionId;
  const input = document.getElementById('proofFileInput');
  const file  = input.files[0];
  if (!file) { showToast('Please upload a file or capture your screen first.'); return; }

  const error = validateUploadFile(file, 'ProofOfSession/upload');
  if (error) { showProofError(error); return; }
  const confirmed = await showUploadConfirmModal();
  if (!confirmed) return;
  if (proofSessionId !== sessionId) return;
  proofUploadInFlight = true;

  const btn = document.getElementById('submitProofBtn');
  btn.disabled    = true;
  btn.textContent = 'Uploading...';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('sessionId', sessionId);
  formData.append('uploadedByUserId', currentUser.userID);

  try {
    await apiRequest('ProofOfSession/upload', 'POST', formData, true);

    document.getElementById('proofModal').classList.remove('open');
    showToast('Proof uploaded. Session marked as completed.', 'success');
    await loadSessions();
  } catch (err) {
    console.error('Proof upload failed:', err);
    showProofError(err.message || 'Failed to upload proof. Please try again.');
    btn.disabled  = false;
    btn.innerHTML = '<i class="ti ti-upload"></i> Upload';
  } finally {
    proofUploadInFlight = false;
  }
}

// ── PROOF LIGHTBOX (view an already-uploaded proof) ─────────────────────────
// Same in-page modal used everywhere else in the system a proof photo can be
// opened — "View Proof" used to just open the raw file in a new browser tab.
let viewedProof = null;
function viewProof(filePath, fileType, title, sessionId) {
  viewedProof = {filePath, fileType, sessionId};
  document.getElementById('lightboxTitle').textContent = title || 'Session Proof';
  document.getElementById('lightboxDownload').style.display = 'none';
  showProofAttachments();
  document.getElementById('lightboxOverlay').style.display = 'flex';
}

function showProofAttachments() {
  if (!viewedProof) return;
  const body = document.getElementById('lightboxBody');
  body.classList.remove('proof-preview-mode');
  body.replaceChildren();
  const list = document.createElement('div');list.className = 'proof-attachment-list';
  const row = document.createElement('div');row.className = 'proof-attachment-row';
  const icon = document.createElement('i');icon.className = 'ti ti-photo';icon.setAttribute('aria-hidden','true');
  const name = document.createElement('button');name.type = 'button';name.className = 'proof-attachment-name';
  name.textContent = viewedProof.filePath.split('/').pop() || 'Session proof';name.onclick = previewProofAttachment;
  const actions = document.createElement('div');actions.className = 'proof-attachment-actions';
  const view = document.createElement('button');view.type = 'button';view.textContent = 'View';view.onclick = previewProofAttachment;
  const download = document.createElement('a');download.textContent = 'Download';
  download.href = CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(viewedProof.filePath));
  const replace = document.createElement('button');replace.type = 'button';replace.textContent = 'Replace';
  const session = allSessions.find(s => s.sessionID === viewedProof.sessionId);
  const unavailable = proofUnavailableReason(session);
  replace.setAttribute('aria-disabled', String(!!unavailable));
  replace.title = unavailable || 'Replace this session proof photo';
  replace.onclick = () => {
    if (unavailable) { showToast(unavailable); return; }
    const id = viewedProof.sessionId;
    closeLightbox(); openProofModal(id, new Date(session.sessionDate).toLocaleDateString('en-PH'));
  };
  actions.append(view,download,replace);row.append(icon,name,actions);list.append(row);body.append(list);
}

function previewProofAttachment() {
  if (!viewedProof) return;
  const body = document.getElementById('lightboxBody');body.replaceChildren();body.classList.add('proof-preview-mode');
  const back = document.createElement('button');back.type = 'button';back.className = 'proof-preview-back';back.textContent = 'Back to attachment';back.onclick = showProofAttachments;
  const content = document.createElement('div');content.className = 'proof-preview-content';
  const url = CONFIG.getFileUrl(viewedProof.filePath);
  if (/image/i.test(viewedProof.fileType || '') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(viewedProof.filePath)) {
    const image = document.createElement('img');image.alt = 'Session proof';image.src = url;
    image.onerror = () => { content.textContent = 'Image preview unavailable. Return to the attachment to download it.'; };
    content.append(image);
  } else {
    const link = document.createElement('a');link.href = url;link.target = '_blank';link.rel = 'noopener';link.textContent = 'Open File';content.append(link);
  }
  body.append(back,content);
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
  viewedProof = null;
}

// JSON.stringify wraps its output in double quotes — embedding that
// directly inside a double-quoted HTML attribute (onclick="...") closes
// the attribute early at that first quote. Escape for the attribute
// context instead.
function jsonAttr(value) {
  return JSON.stringify(value).replace(/"/g, '&quot;');
}
