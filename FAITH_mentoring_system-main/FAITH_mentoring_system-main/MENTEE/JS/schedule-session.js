/* ============================================================
   ASTRA MENTEE — schedule-session.js
   ============================================================ */

let currentUser      = null;
let selectedSlot     = null;   // { availabilityID, dateStr, timeStr }

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('mentee');
  currentUser = getSession()?.user;
  loadSlots();
  loadHistory();
});

// ── DATA ──────────────────────────────────────────────────────────────────────
async function loadSlots() {
  const loading = document.getElementById('slotsLoading');
  const empty   = document.getElementById('slotsEmpty');
  const grid    = document.getElementById('slotsGrid');

  loading.style.display = 'block';
  empty.style.display   = 'none';
  grid.style.display    = 'none';

  try {
    const data = await apiRequest(
      `AvailabilityWorkflow/mentee/${currentUser.userID}/slots`, 'GET', null, true
    );
    const slots = Array.isArray(data) ? data : [];

    loading.style.display = 'none';

    if (!slots.length) {
      empty.style.display = 'block';
      return;
    }

    grid.style.display  = 'grid';
    grid.innerHTML = slots.map(slot => renderSlotCard(slot)).join('');
  } catch (e) {
    loading.textContent = 'Failed to load available slots. Please try again later.';
  }
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderSlotCard(slot) {
  const dateStr     = fmtDate(slot.availableDate);
  const dayStr      = fmtDay(slot.availableDate);
  const timeStr     = fmtTime(slot.startTime);
  const mentorName  = slot.mentorName || 'Your Mentor';
  const requested = !!slot.alreadyRequested;
  const approved  = !!slot.alreadyApproved;
  const checkpointCompleted = !!slot.checkpointCompleted;

  const badge = checkpointCompleted
    ? `<span class="sch-approved-badge"><i class="ti ti-check"></i> Checkpoint Completed</span>`
    : approved
    ? `<span class="sch-approved-badge"><i class="ti ti-check"></i> Session Approved</span>`
    : requested
      ? `<span class="sch-requested-badge">Requested</span>`
      : `<span class="sch-available-badge">Available</span>`;

  const btn = checkpointCompleted
    ? `<button class="btn-request" disabled>Attendance Completed</button>`
    : approved
    ? `<button class="btn-request btn-request-approved" disabled><i class="ti ti-calendar-check"></i> Session Scheduled</button>`
    : requested
      ? `<button class="btn-request" disabled>Already Requested</button>`
      : `<button class="btn-request"
           onclick="openRequestModal(${slot.availabilityID}, '${escStr(dateStr)}', '${escStr(timeStr)}', '${escStr(mentorName)}')">
           Request This Slot
         </button>`;

  return `
    <div class="sch-slot-card${checkpointCompleted ? ' already-approved' : approved ? ' already-approved' : requested ? ' already-requested' : ''}">
      <div class="sch-slot-header">
        <span class="sch-slot-mentor">${escHtml(mentorName)}</span>
        ${badge}
      </div>
      <div>
        <div class="sch-slot-date">${escHtml(dateStr)}</div>
        <div class="sch-slot-day">${escHtml(dayStr)}</div>
        ${slot.slotName ? `<span class="sch-slot-name-tag">${escHtml(slot.slotName)}</span>` : ''}
      </div>
      <div class="sch-slot-time">
        <i class="ti ti-clock"></i>
        ${escHtml(timeStr)}
      </div>
      ${checkpointCompleted ? '<p class="sch-checkpoint-completed">You have already completed attendance for this mentoring checkpoint.</p>' : ''}
      ${btn}
    </div>`;
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function openRequestModal(availabilityID, dateStr, timeStr, mentorName) {
  selectedSlot = { availabilityID, dateStr, timeStr };

  document.getElementById('requestSlotDesc').textContent =
    `${mentorName} · ${dateStr}, ${timeStr}`;
  document.getElementById('requestPurpose').value = '';
  document.getElementById('requestError').style.display = 'none';

  const btn = document.getElementById('requestBtn');
  btn.textContent = 'Send Request';
  btn.disabled    = false;

  document.getElementById('requestModal').classList.add('open');
}

function closeRequestModal(e) {
  if (!e || e.target === document.getElementById('requestModal'))
    document.getElementById('requestModal').classList.remove('open');
}

async function submitRequest() {
  if (!selectedSlot) return;

  const btn     = document.getElementById('requestBtn');
  const purpose = document.getElementById('requestPurpose').value.trim();

  btn.textContent = 'Sending...';
  btn.disabled    = true;

  try {
    await apiRequest(
      `AvailabilityWorkflow/mentee/${currentUser.userID}/request`, 'POST',
      { availabilityID: selectedSlot.availabilityID, purpose: purpose || null },
      true
    );
    document.getElementById('requestModal').classList.remove('open');
    await loadSlots();
  } catch (err) {
    const errEl = document.getElementById('requestError');
    errEl.textContent   = err.message || 'Failed to send request. Please try again.';
    errEl.style.display = 'block';
    btn.textContent = 'Send Request';
    btn.disabled    = false;
  }
}

// ── HISTORY ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const data = await apiRequest(
      `AvailabilityWorkflow/mentee/${currentUser.userID}/request-history`, 'GET', null, true
    );
    const requests = Array.isArray(data) ? data : [];

    const section = document.getElementById('historySection');
    const list    = document.getElementById('historyList');
    section.style.display = 'block';

    if (!requests.length) {
      list.innerHTML = '<div class="hist-empty">No scheduling requests yet.</div>';
      return;
    }

    list.innerHTML = requests.map(r => renderHistoryItem(r)).join('');
  } catch (e) { /* non-critical — fail silently */ }
}

function renderHistoryItem(r) {
  const dateStr = fmtDate(r.availableDate);
  const timeStr = fmtTime(r.startTime);
  const reqDate = new Date(r.requestedAt).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric'
  });

  const statusMap = {
    'Pending':  { cls: 'hist-badge-pending',   label: 'Pending'   },
    'Approved': { cls: 'hist-badge-confirmed',  label: 'Confirmed' },
    'Declined': { cls: 'hist-badge-declined',   label: 'Declined'  },
  };
  const { cls, label } = statusMap[r.status] || { cls: 'hist-badge-pending', label: r.status };

  const purposeHtml = r.purpose
    ? `<div class="hist-purpose">"${escHtml(r.purpose)}"</div>`
    : '';

  const slotNameHtml = r.slotName
    ? `<span class="sch-slot-name-tag">${escHtml(r.slotName)}</span>`
    : '';

  return `
    <div class="hist-item">
      <div class="hist-item-left">
        <div class="hist-slot-date">${escHtml(dateStr)}</div>
        ${slotNameHtml}
        <div class="hist-slot-time"><i class="ti ti-clock"></i> ${escHtml(timeStr)}</div>
        ${purposeHtml}
      </div>
      <div class="hist-item-right">
        <span class="hist-badge ${cls}">${label}</span>
        <div class="hist-meta">Requested ${reqDate}</div>
      </div>
    </div>`;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtDay(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-PH', { weekday: 'long' });
}

function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.toString().split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12  = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escStr(s) {
  return String(s).replace(/'/g, "\\'");
}
