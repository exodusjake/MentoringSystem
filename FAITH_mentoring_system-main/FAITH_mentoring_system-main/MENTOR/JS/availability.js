// ===== AVAILABILITY JS — MENTOR PORTAL =====

let currentUser   = null;
let allSlots      = [];
let deleteSlotId  = null;

// Mirrors AstraMentoring-Backend/.../Constants/MentoringSlots.cs — same
// list MENTOR/JS/sessions.js's own slot picker uses (Phase 2).
const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals'
];
function slotsForSemester(semester) {
  return semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;
}

let currentSchoolYear = '2026-2027';
let currentSemester   = '1st Semester';
// SlotName -> { startDate, endDate } — this semester's Admin-set Session
// Schedule window per checkpoint, read from CalendarEvents. Used purely to
// constrain/hint the date picker; the real guard is server-side
// (AvailabilityWorkflowService.AddSlotAsync).
let slotWindows = {};

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentor');
  currentUser = getSession()?.user;
  await loadCurrentPeriod();
  await loadSlotWindows();
  await loadAll();
});

async function loadCurrentPeriod() {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    if (data?.SchoolYear) currentSchoolYear = data.SchoolYear;
    if (data?.Semester)   currentSemester   = data.Semester;
  } catch (e) { /* keep defaults */ }
}

async function loadSlotWindows() {
  try {
    const events = await apiRequest('CalendarEvents', 'GET', null, true) || [];
    slotWindows = {};
    events
      .filter(ev => ev.eventType === 'Session Schedule'
        && ev.schoolYear === currentSchoolYear && ev.semester === currentSemester)
      .forEach(ev => { slotWindows[ev.slotName] = { startDate: ev.startDate, endDate: ev.endDate }; });
  } catch (e) { console.error('Failed to load checkpoint windows:', e); }

  const select = document.getElementById('slotName');
  if (!select) return;
  select.innerHTML = '<option value="">Select a checkpoint…</option>' +
    slotsForSemester(currentSemester).map(name => {
      const w=slotWindows[name]; const closed=w && checkpointToday()>String(w.endDate||w.startDate).slice(0,10);
      return `<option value="${name}" ${!w||closed?'disabled':''}>${name}${!w?' (Not scheduled)':closed?' (Closed)':''}</option>`;
    }).join('');
}

// Constrain posting to the Admin session window.
function onSlotNameChange() {
  const name   = document.getElementById('slotName').value;
  const hint   = document.getElementById('slotWindowHint');
  const dateEl = document.getElementById('slotDate');
  const window = slotWindows[name];
  const today = checkpointToday();

  if (!name) {
    dateEl.disabled = true;
    dateEl.value    = '';
    hint.style.display = 'none';
    return;
  }

  dateEl.disabled = false;
  dateEl.min = window && String(window.startDate).slice(0,10)>today?String(window.startDate).slice(0,10):today;
  dateEl.max = window?String(window.endDate||window.startDate).slice(0,10):'';
  dateEl.disabled = !window || today>dateEl.max;

  if (window) {
    const fmt = iso => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    hint.textContent   = `${name}'s window: ${fmt(window.startDate)} – ${fmt(window.endDate)}. Choose a date within this window.`;
  } else {
    hint.textContent = `Admin hasn't scheduled ${name} yet this semester — posting is unavailable until they do.`;
  }
  hint.style.display = 'block';
}

// ── DATA LOADING ──────────────────────────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadSlots(), loadRequests()]);
}

async function loadSlots() {
  const mentorId = currentUser?.userID;
  try {
    const data = await apiRequest(`AvailabilityWorkflow/mentor/${mentorId}/slots`, 'GET', null, true);
    allSlots = Array.isArray(data) ? data : [];
    renderSlots();
  } catch (e) {
    console.error('Failed to load slots:', e);
    document.getElementById('slotsLoading').textContent = 'Failed to load slots.';
  }
}

async function loadRequests() {
  renderRequests();
}

// ── RENDER SLOTS ──────────────────────────────────────────────────────────────
function renderSlots() {
  const loading = document.getElementById('slotsLoading');
  const empty   = document.getElementById('slotsEmpty');
  const grid    = document.getElementById('slotsGrid');

  loading.style.display = 'none';

  if (!allSlots.length) {
    empty.style.display = 'block';
    grid.style.display  = 'none';
    document.getElementById('pastCollapsible').style.display = 'none';
    renderRequests();
    return;
  }

  // Deduplicate — each slot shown once regardless of how many mentees booked it
  const seen        = new Set();
  const uniqueSlots = [];
  allSlots.forEach(s => {
    if (!seen.has(s.availabilityID)) {
      seen.add(s.availabilityID);
      uniqueSlots.push(s);
    }
  });

  // Split active (today/future) vs past
  const today       = new Date(); today.setHours(0, 0, 0, 0);
  const activeSlots = uniqueSlots.filter(s => new Date(s.availableDate) >= today);
  const pastSlots   = uniqueSlots.filter(s => new Date(s.availableDate) < today);

  // Active slots
  if (!activeSlots.length) {
    empty.style.display = 'block';
    grid.style.display  = 'none';
  } else {
    empty.style.display = 'none';
    grid.style.display  = 'flex';
    grid.innerHTML = activeSlots.map(s => renderSlotCard(s, false)).join('');
  }

  // Past slots
  const pastOuter = document.getElementById('pastCollapsible');
  const pastList  = document.getElementById('pastSlotsList');
  if (pastSlots.length) {
    pastOuter.style.display = 'block';
    pastList.innerHTML = pastSlots.map(s => renderSlotCard(s, true)).join('');
  } else {
    pastOuter.style.display = 'none';
  }

  renderRequests();
}

function renderSlotCard(slot, isPast) {
  const d       = new Date(slot.availableDate);
  const month   = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day     = d.getDate();
  const timeStr = fmtTime(slot.startTime);

  // A slot no longer sits in a "Pending" state — requests are booked the
  // instant they're submitted — so this is just Open (nobody's booked it
  // yet) vs Session Created (approvedMentees is populated) vs Expired.
  let cardCls, statusLabel;
  if (slot.linkedSessionStatus === 'Cancelled') {
    cardCls = 'slot-expired'; statusLabel = 'Cancelled';
  } else if (!slot.linkedSessionID && slot.approvedMentees) {
    cardCls = 'slot-expired'; statusLabel = 'Session Deleted';
  } else if (isPast) {
    cardCls     = slot.approvedMentees ? 'slot-session-created' : 'slot-expired';
    statusLabel = slot.approvedMentees ? 'Session Created' : 'Expired';
  } else if (slot.approvedMentees) {
    cardCls     = 'slot-session-created';
    statusLabel = 'Session Created';
  } else {
    cardCls     = 'slot-open';
    statusLabel = 'Open';
  }

  const approvedNames = slot.approvedMentees
    ? `<div class="slot-approved-names"><i class="ti ti-user-check"></i> ${slot.approvedMentees}</div>`
    : '';

  // Approved requests can outlive sessions deleted by older releases.
  // Only an actual linked session should hide the slot cleanup action.
  const deleteBtn = !slot.linkedSessionID
    ? `<button class="slot-delete-btn" title="Delete slot" onclick="deleteSlot(${slot.availabilityID})"><i class="ti ti-trash"></i></button>`
    : '<a class="slot-delete-btn" href="sessions.html" title="Cancel or delete in Sessions" aria-label="Manage session" style="font-size:12px;color:#0f766e">Manage Session <i class="ti ti-external-link"></i></a>';

  return `
    <div class="slot-card ${cardCls}${isPast ? ' slot-past' : ''}">
      ${deleteBtn}
      <div class="slot-cal-block">
        <span class="slot-cal-month">${month}</span>
        <span class="slot-cal-day">${day}</span>
      </div>
      <div class="slot-body">
        <div class="slot-status-row">
          <span class="slot-status-dot"></span>
          <span class="slot-status-label">${statusLabel}</span>
        </div>
        <div class="slot-time"><i class="ti ti-clock"></i> ${timeStr}</div>
        ${slot.slotName ? `<span class="slot-name-tag">${slot.slotName}</span>` : ''}
        ${slot.isClosed ? `<span class="slot-late-tag" title="Checkpoint session window is closed">Closed</span>` : ''}
        ${approvedNames}
      </div>
    </div>`;
}

// ── RENDER REQUESTS ───────────────────────────────────────────────────────────
// Read-only roster — a request books its slot the instant it's submitted,
// so every row here just IS a booking, no action needed from the mentor.
function renderRequests() {
  const loading = document.getElementById('reqsLoading');
  const empty   = document.getElementById('reqsEmpty');
  const list    = document.getElementById('reqsList');

  loading.style.display = 'none';

  const today2    = new Date(); today2.setHours(0, 0, 0, 0);
  const bookings  = allSlots.filter(s => s.requestID &&
    s.requestStatus === 'Approved' && s.linkedSessionID && s.linkedSessionStatus !== 'Cancelled' &&
    new Date(s.availableDate) >= today2);

  if (!bookings.length) {
    empty.style.display = 'block';
    list.style.display  = 'none';
    return;
  }

  empty.style.display = 'none';
  list.style.display  = 'flex';
  list.innerHTML = bookings.map(slot => {
    const dateStr = fmtDate(slot.availableDate);
    const timeStr = fmtTime(slot.startTime);
    const avatar  = initials(slot.menteeName || '');
    const meta    = [slot.sectionCode, slot.studentNumber].filter(Boolean).join(' · ');
    const ago     = slot.requestedAt ? timeAgo(slot.requestedAt) : '';

    return `
      <div class="req-card req-card-approved">
        <div class="req-avatar">${avatar}</div>
        <div class="req-info">
          <div class="req-name">${slot.menteeName || 'Mentee'}</div>
          ${meta ? `<div class="req-meta">${meta}</div>` : ''}
          <div class="req-slot"><i class="ti ti-calendar-event"></i> ${dateStr}, ${timeStr}</div>
          ${slot.purpose ? `<div class="req-purpose">"${escHtml(slot.purpose)}"</div>` : ''}
          ${ago ? `<div class="req-meta" style="margin-top:4px;">${ago}</div>` : ''}
        </div>
        <div class="req-approved-badge"><i class="ti ti-check"></i> Booked</div>
      </div>`;
  }).join('');
}

// ── SECTION TOGGLE ────────────────────────────────────────────────────────────
function toggleSection(id) {
  const container = document.getElementById(id);
  const body      = container.querySelector('.avail-collapse-body');
  const isOpen    = container.classList.contains('is-open');
  container.classList.toggle('is-open', !isOpen);
  body.style.display = isOpen ? 'none' : '';
}

// ── POST SLOT (multi-time-range) ──────────────────────────────────────────────
function openPostModal() {
  document.getElementById('postError').style.display = 'none';
  document.getElementById('slotName').value = '';
  document.getElementById('slotDate').value = '';
  document.getElementById('slotDate').disabled = true;
  document.getElementById('slotWindowHint').style.display = 'none';

  // Reset to one blank time range row
  const list = document.getElementById('timeRangesList');
  list.innerHTML = '';
  addTimeRange();

  document.getElementById('postModal').classList.add('open');
}

function closePostModal(e) {
  if (!e || e.target === document.getElementById('postModal'))
    document.getElementById('postModal').classList.remove('open');
}

function addTimeRange() {
  const list = document.getElementById('timeRangesList');
  const row  = document.createElement('div');
  row.className = 'time-range-row';
  row.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label>Start Time</label>
        <input type="time" class="slot-start" />
      </div>
    </div>
    <button type="button" class="btn-remove-range" onclick="removeTimeRange(this)" title="Remove">
      <i class="ti ti-trash"></i>
    </button>`;
  list.appendChild(row);
  updateRemoveBtns();
}

function removeTimeRange(btn) {
  const list = document.getElementById('timeRangesList');
  if (list.children.length <= 1) return;
  btn.closest('.time-range-row').remove();
  updateRemoveBtns();
}

function updateRemoveBtns() {
  const rows = document.querySelectorAll('#timeRangesList .time-range-row');
  rows.forEach(row => {
    const btn = row.querySelector('.btn-remove-range');
    if (btn) btn.style.visibility = rows.length <= 1 ? 'hidden' : 'visible';
  });
}

async function submitSlots() {
  const slotName = document.getElementById('slotName').value;
  const date     = document.getElementById('slotDate').value;
  const btn      = document.getElementById('postBtn');

  if (!slotName) { showPostError('Please select which checkpoint this slot is for.'); return; }
  if (!date) { showPostError('Please select a date.'); return; }

  const rows = document.querySelectorAll('#timeRangesList .time-range-row');
  if (!rows.length) { showPostError('Add at least one start time.'); return; }

  const timeRanges = [];
  for (const row of rows) {
    const start = row.querySelector('.slot-start').value;
    if (!start) { showPostError('Please fill in each start time.'); return; }
    timeRanges.push({ start });
  }

  btn.textContent = 'Posting...';
  btn.disabled    = true;

  try {
    for (const range of timeRanges) {
      await apiRequest(`AvailabilityWorkflow/mentor/${currentUser.userID}/slots`, 'POST',
        { availableDate: date, startTime: range.start, slotName }, true);
    }
    document.getElementById('postModal').classList.remove('open');
    await loadSlots();
  } catch (err) {
    showPostError(err.message || 'Failed to post slot.');
  } finally {
    btn.textContent = 'Post Slots';
    btn.disabled    = false;
  }
}

function showPostError(msg) {
  const el = document.getElementById('postError');
  el.textContent   = msg;
  el.style.display = 'block';
}

// ── DELETE SLOT ───────────────────────────────────────────────────────────────
function deleteSlot(slotId) {
  deleteSlotId = slotId;
  document.getElementById('deleteSlotModal').classList.add('open');
}

function closeDeleteSlotModal(e) {
  if (!e || e.target === document.getElementById('deleteSlotModal'))
    document.getElementById('deleteSlotModal').classList.remove('open');
}

async function confirmDeleteSlot() {
  if (!deleteSlotId) return;
  const btn = document.getElementById('confirmDeleteSlotBtn');
  btn.disabled = true;
  try {
    await apiRequest(`AvailabilityWorkflow/mentor/${currentUser.userID}/slots/${deleteSlotId}`, 'DELETE', null, true);
    document.getElementById('deleteSlotModal').classList.remove('open');
    await loadSlots();
  } catch (err) {
    showToast(err.message || 'Could not delete slot.');
  } finally {
    btn.disabled = false;
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.toString().split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12  = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function initials(name) {
  return name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || 'M';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(dt) {
  // SessionRequests.RequestedAt is written by GETDATE() on the verified UTC SQL server.
  // SQL DATETIME is serialized without an offset; only this field needs UTC qualification.
  const value = String(dt ?? '').trim();
  const timestamp = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z').getTime();
  if (!value || !Number.isFinite(timestamp)) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
