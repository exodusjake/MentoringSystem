// ===== CALENDAR & EVENTS JS =====

// Event titles are user-entered (this very page creates them) — never
// trust them unescaped into an HTML attribute (aria-label/title).
function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

let allEvents      = [];
let editingId      = null;
let selectedDay    = null;
let calSearchQuery = '';
let calTypeFilter  = '';

let viewYear  = new Date().getFullYear();
let viewMonth = new Date().getMonth();

let sheetSemester   = '1st Semester';
let sheetSchoolYear = '2026-2027';

// Mirrors AstraMentoring-Backend/AstraMentoring-Backend/Constants/MentoringSlots.cs
// — keep both lists in sync if this ever changes. 2nd Semester drops
// Mentoring Assembly; every other slot is common to both semesters.
const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals',
];
function slotsForSemester(semester) {
  return semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;
}
// Mirrors AstraMentoring-Backend/AstraMentoring-Backend/Constants/ExamPeriods.cs
// — same for both semesters, unlike MENTORING_SLOTS.
const EXAM_PERIODS = ['Prelims', 'Midterms', 'Finals'];
// sheetSemester/sheetSchoolYear were previously only ever populated as a
// side effect of opening the Sheet Preview modal — fine for that one
// feature, but the Slot Name dropdown needs the real current period the
// moment the page loads, not only after Admin happens to generate a sheet.
async function loadCurrentPeriod() {
  try {
    const settings = await apiRequest('Settings', 'GET', null, true);
    // GetAllAsync() returns a plain Dictionary<string,string> — keys are the
    // literal SettingKey values (PascalCase), not camelCased like a DTO
    // property would be. Check both defensively (same pattern already used
    // elsewhere, e.g. HEAD/JS/dashboard.js's renderAcademicPeriod).
    const sy = settings?.SchoolYear || settings?.schoolYear;
    const sm = settings?.Semester   || settings?.semester;
    if (sy) sheetSchoolYear = sy;
    if (sm) sheetSemester   = sm;
  } catch (e) {
    console.warn('Could not load current period, using default.', e);
  }
}

// Session Schedule, Deadline, and Period all pick from a fixed list;
// Evaluation alone is free-typed, unrelated to any list.
function usesSlot(eventType) {
  return eventType === 'Session Schedule' || eventType === 'Deadline' || eventType === 'Period';
}

// Prepared/Approved By signatories — read-only here, managed on the
// System Settings page (same SystemSettings row as Semester/SchoolYear).
let sheetPreparedName  = '';
let sheetPreparedTitle = '';
let sheetApprovedName  = '';
let sheetApprovedTitle = '';

// Resolved from calPreparedByEmail/calApprovedByEmail (also on Settings) —
// whatever real signature that account has on file, same image already
// shown on Logsheet. Null/absent just prints the name with a blank line,
// same as before this existed.
let sheetPreparedSig = null;
let sheetApprovedSig = null;

let currentUser = null;

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const TYPE_CONFIG = {
  'Session Schedule': { cls: 'session',    badgeCls: 'badge-session'    },
  'Deadline':         { cls: 'deadline',   badgeCls: 'badge-deadline'   },
  'Period':           { cls: 'exam',       badgeCls: 'badge-exam'       },
  'Evaluation':       { cls: 'evaluation', badgeCls: 'badge-evaluation' },
};

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  currentUser = getSession()?.user;

  loadCurrentPeriod();
  loadEvents();

  document.getElementById('prevMonth').addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    selectedDay = null;
    renderCalendar();
    renderSidebar();
  });

  document.getElementById('nextMonth').addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    selectedDay = null;
    renderCalendar();
    renderSidebar();
  });

  document.getElementById('addEventBtn').addEventListener('click', () => openCreate());
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', saveEvent);
  document.getElementById('fieldType').addEventListener('change', () => updateSlotFieldVisibility());
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  document.getElementById('clearSelection').addEventListener('click', () => {
    selectedDay = null;
    renderCalendar();
    renderSidebar();
  });

  document.getElementById('calSearch').addEventListener('input', e => {
    calSearchQuery = e.target.value.trim().toLowerCase();
    renderCalendar();
    renderSidebar();
  });

  document.getElementById('typeFilter').addEventListener('change', e => {
    calTypeFilter = e.target.value;
    renderCalendar();
    renderSidebar();
  });

  document.getElementById('generateSheetBtn').addEventListener('click', openSheetPreview);
});

// ── LOAD ──────────────────────────────────────────────────────
async function loadEvents() {
  try {
    allEvents = await apiRequest('CalendarEvents', 'GET', null, true) || [];
    renderCalendar();
    renderSidebar();
    updateGenerateBtn();
  } catch (e) {
    console.error('Failed to load calendar events:', e);
    document.getElementById('calEventsList').innerHTML =
      '<div class="cal-loading">Failed to load events. Please refresh.</div>';
  }
}

function updateGenerateBtn() {
  const btn        = document.getElementById('generateSheetBtn');
  const badge      = document.getElementById('generateBadge');
  const unpublished = allEvents.filter(ev => !ev.isPublished).length;

  if (unpublished > 0) {
    btn.classList.remove('btn-generate--done');
    badge.textContent    = unpublished;
    badge.style.display  = 'inline-flex';
    btn.title            = `${unpublished} activit${unpublished !== 1 ? 'ies' : 'y'} pending publication`;
  } else {
    btn.classList.add('btn-generate--done');
    badge.style.display  = 'none';
    btn.title            = 'All activities are published';
  }
}

// ── DATE HELPERS ──────────────────────────────────────────────
function parseDate(isoStr) {
  if (!isoStr) return null;
  const [y, m, d] = isoStr.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtDateRange(startIso, endIso) {
  const s = parseDate(startIso);
  const e = parseDate(endIso);
  if (!s) return '—';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const sStr = s.toLocaleDateString('en-PH', opts);
  if (!e || toIsoDate(s) === toIsoDate(e)) return sStr;
  const eStr = s.getFullYear() === e.getFullYear()
    ? e.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : e.toLocaleDateString('en-PH', opts);
  return `${sStr} – ${eStr}`;
}

function fmtPrintDate(startIso, endIso) {
  const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON = ['Jan.','Feb.','Mar.','Apr.','May','Jun.','Jul.','Aug.','Sep.','Oct.','Nov.','Dec.'];
  const s = parseDate(startIso);
  const e = parseDate(endIso);
  if (!s) return '—';
  const fmt = d => `${MON[d.getMonth()]} ${d.getDate()} (${DAY[d.getDay()]})`;
  if (!e || toIsoDate(s) === toIsoDate(e)) return `${fmt(s)}, ${s.getFullYear()}`;
  return `${fmt(s)} – ${fmt(e)}, ${e.getFullYear()}`;
}

// Session Schedule, Deadline, and Period are each their own entry (not
// bundled), with Title already set to the exact printed wording server-side
// (see CalendarEventsController.ValidateAndNormalizeAsync) — so this is
// just a plain one-row-per-event table, same as Evaluation always was.
// Kept as its own function since both the Sheet Preview modal below and,
// previously, printSheet() called it — printSheet() now goes through the
// shared calendar-sheet.js instead.
function buildSheetRowsHtml(events, emptyMessage) {
  return events.length
    ? events.map(ev => `
        <tr>
          <td>${ev.title}</td>
          <td>${fmtPrintDate(ev.startDate, ev.endDate)}</td>
        </tr>`).join('')
    : `<tr><td colspan="2" style="text-align:center;color:#9ca3af;padding:16px;font-style:italic;font-size:11px;">${emptyMessage}</td></tr>`;
}

// ── FILTERED EVENTS ───────────────────────────────────────────
function getFilteredEvents() {
  return allEvents.filter(ev => {
    if (calSearchQuery && !ev.title.toLowerCase().includes(calSearchQuery)) return false;
    if (calTypeFilter  && ev.eventType !== calTypeFilter) return false;
    return true;
  });
}

function eventsOnDay(y, m, d) {
  const target = new Date(y, m, d);
  return getFilteredEvents().filter(ev => {
    const start = parseDate(ev.startDate);
    const end   = parseDate(ev.endDate) || start;
    if (!start) return false;
    return target >= start && target <= end;
  });
}

function eventsInViewMonth() {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const lastOfMonth  = new Date(viewYear, viewMonth + 1, 0);
  return getFilteredEvents().filter(ev => {
    const start = parseDate(ev.startDate);
    const end   = parseDate(ev.endDate) || start;
    if (!start) return false;
    return start <= lastOfMonth && end >= firstOfMonth;
  }).sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
}

// ── RENDER CALENDAR GRID ──────────────────────────────────────
function renderCalendar() {
  document.getElementById('calMonthLabel').textContent = `${MONTHS[viewMonth]} ${viewYear}`;

  const today    = new Date();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMo = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevDays = new Date(viewYear, viewMonth, 0).getDate();

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ d: prevDays - i, m: viewMonth - 1, y: viewYear, other: true });
  for (let d = 1; d <= daysInMo; d++)
    cells.push({ d, m: viewMonth, y: viewYear, other: false });
  while (cells.length < 42)
    cells.push({ d: cells.length - firstDay - daysInMo + 1, m: viewMonth + 1, y: viewYear, other: true });

  const grid = document.getElementById('calGrid');
  grid.innerHTML = cells.map(({ d, m, y, other }) => {
    let nm = m, ny = y;
    if (nm < 0)  { nm = 11; ny--; }
    if (nm > 11) { nm = 0;  ny++; }

    const isToday    = !other && d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
    const isSelected = selectedDay && !other && d === selectedDay.day && viewMonth === selectedDay.month && viewYear === selectedDay.year;
    const dayEvents  = other ? [] : eventsOnDay(ny, nm, d);

    const bars = [...new Map(dayEvents.map(e => [e.eventID, e])).values()].slice(0, 3);
    const more = Math.max(0, dayEvents.length - bars.length);

    const barsHtml = bars.map(e => {
      const cfg = TYPE_CONFIG[e.eventType] || TYPE_CONFIG['Session Schedule'];
      return `<div class="cal-day-bar ${cfg.cls}" role="img" aria-label="${escAttr(e.eventType || 'Event')}: ${escAttr(e.title)}" title="${escAttr(e.title)}"></div>`;
    }).join('');
    const moreHtml = more > 0 ? `<div class="cal-more">+${more}</div>` : '';

    const cls = ['cal-day', other ? 'other-month' : '', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
    const onclick = other ? '' : `onclick="selectDay(${ny},${nm},${d})"`;

    return `
      <div class="${cls}" ${onclick}>
        <div class="cal-day-num">${d}</div>
        <div class="cal-day-events">${barsHtml}${moreHtml}</div>
      </div>`;
  }).join('');
}

// ── SELECT A DAY ──────────────────────────────────────────────
function selectDay(y, m, d) {
  if (selectedDay && selectedDay.year === y && selectedDay.month === m && selectedDay.day === d) {
    selectedDay = null;
  } else {
    selectedDay = { year: y, month: m, day: d };
  }
  renderCalendar();
  renderSidebar();
}

// ── RENDER SIDEBAR ────────────────────────────────────────────
function renderSidebar() {
  const titleEl  = document.getElementById('sidebarTitle');
  const subEl    = document.getElementById('sidebarSub');
  const clearBtn = document.getElementById('clearSelection');
  const list     = document.getElementById('calEventsList');

  let events;
  if (selectedDay) {
    const { year, month, day } = selectedDay;
    events = eventsOnDay(year, month, day);
    const d = new Date(year, month, day);
    titleEl.textContent = d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
    subEl.textContent   = `${events.length} activit${events.length !== 1 ? 'ies' : 'y'}`;
    clearBtn.style.display = 'inline-block';
  } else {
    events = eventsInViewMonth();
    titleEl.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    subEl.textContent   = `${events.length} activit${events.length !== 1 ? 'ies' : 'y'}`;
    clearBtn.style.display = 'none';
  }

  if (!events.length) {
    list.innerHTML = `
      <div class="cal-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>${selectedDay ? 'No activities on this day.' : 'No activities this month.'}</p>
        <p style="font-size:11px;">Click <strong>Add Activity</strong> to post one.</p>
      </div>`;
    return;
  }

  list.innerHTML = events.map(ev => {
    const cfg       = TYPE_CONFIG[ev.eventType] || TYPE_CONFIG['Session Schedule'];
    const dateRange = fmtDateRange(ev.startDate, ev.endDate);
    return `
      <div class="cal-event-card ${cfg.cls}">
        <div class="cal-event-top">
          <div class="cal-event-title">${ev.title}</div>
          <div class="cal-event-actions">
            <button class="cal-action-btn" title="Edit" onclick="openEdit(${ev.eventID})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="cal-action-btn delete" title="Delete" onclick="askDelete(${ev.eventID})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
        <div class="cal-event-dates">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${dateRange}
        </div>
        <span class="cal-event-badge ${cfg.badgeCls}">${ev.eventType}</span>
        ${ev.description ? `<div class="cal-event-note">${ev.description}</div>` : ''}
      </div>`;
  }).join('');
}

// ── ACTIVITY TYPE field toggling ────────────────────────────────────
// Session Schedule / Deadline / Period all show a picker (Title is derived
// server-side from the picked value, not typed) — each from its own fixed
// list. Evaluation alone shows a free-typed Activity title + date range.
function updateSlotFieldVisibility(preserveSlot) {
  const type       = document.getElementById('fieldType').value;
  const slotted    = usesSlot(type);
  const slotGroup  = document.getElementById('slotNameGroup');
  const slotLabel  = document.getElementById('slotLabel');
  const titleGroup = document.getElementById('titleGroup');
  const endGroup   = document.getElementById('endDateGroup');
  const slotSel    = document.getElementById('fieldSlotName');
  const startLabel = document.getElementById('startLabel');
  const endLabel   = document.getElementById('endLabel');

  slotGroup.style.display  = slotted ? '' : 'none';
  titleGroup.style.display = slotted ? 'none' : '';
  // Deadline is a single date — hide End Date entirely rather than
  // leaving a confusing second date field for a one-day marker.
  endGroup.style.display = type === 'Deadline' ? 'none' : '';
  slotLabel.innerHTML = type === 'Period'
    ? 'Period <span class="req">*</span>'
    : 'Slot <span class="req">*</span>';
  startLabel.innerHTML = type === 'Session Schedule' ? 'Session Window Start <span class="req">*</span>'
    : type === 'Deadline' ? 'Deadline Date <span class="req">*</span>'
    : 'Start Date <span class="req">*</span>';
  endLabel.innerHTML = type === 'Session Schedule'
    ? 'Session Window End <span class="req">*</span>'
    : 'End Date <span class="optional">(leave blank if single day)</span>';

  if (slotted) {
    const opts = type === 'Period' ? EXAM_PERIODS : slotsForSemester(sheetSemester);
    slotSel.innerHTML = '<option value="" disabled selected>Choose...</option>' +
      opts.map(s => `<option value="${escAttr(s)}">${s}</option>`).join('');
    if (preserveSlot && opts.includes(preserveSlot)) slotSel.value = preserveSlot;
  }
}

// ── OPEN CREATE ───────────────────────────────────────────────
function openCreate() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Activity';
  document.getElementById('modalSave').textContent  = 'Save Activity';
  document.getElementById('fieldTitle').value = '';

  const defaultDate = selectedDay
    ? toIsoDate(new Date(selectedDay.year, selectedDay.month, selectedDay.day))
    : toIsoDate(new Date(viewYear, viewMonth, 1));

  document.getElementById('fieldType').value  = 'Session Schedule';
  document.getElementById('fieldStart').value = defaultDate;
  document.getElementById('fieldEnd').value   = '';
  document.getElementById('fieldNote').value  = '';
  updateSlotFieldVisibility();
  document.getElementById('modalOverlay').classList.add('active');
}

// ── OPEN EDIT ─────────────────────────────────────────────────
function openEdit(id) {
  const ev = allEvents.find(e => e.eventID === id);
  if (!ev) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Activity';
  document.getElementById('modalSave').textContent  = 'Update Activity';
  document.getElementById('fieldTitle').value = ev.title;
  document.getElementById('fieldType').value  = ev.eventType || 'Session Schedule';
  document.getElementById('fieldStart').value = ev.startDate?.split('T')[0] || '';
  const sIso = ev.startDate?.split('T')[0];
  const eIso = ev.endDate?.split('T')[0];
  document.getElementById('fieldEnd').value  = (eIso && eIso !== sIso) ? eIso : '';
  document.getElementById('fieldNote').value = ev.description || '';
  updateSlotFieldVisibility(ev.slotName);
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  editingId = null;
}

// ── SAVE EVENT ────────────────────────────────────────────────
async function saveEvent() {
  const type     = document.getElementById('fieldType').value;
  const slotted  = usesSlot(type);
  const slot     = document.getElementById('fieldSlotName').value || null;
  const title    = slotted ? slot : document.getElementById('fieldTitle').value.trim();
  const start    = document.getElementById('fieldStart').value;
  const endRaw   = document.getElementById('fieldEnd').value;
  const end      = type === 'Deadline' ? start : (endRaw || start);
  const note     = document.getElementById('fieldNote').value.trim();

  if (slotted && !slot) { showErrorModal(type === 'Period' ? 'Please choose a Period.' : 'Please choose a Slot.'); return; }
  if (!slotted && !title) { showErrorModal('Please enter an activity title.'); return; }
  if (!start) { showErrorModal('Please select a start date.'); return; }
  if (end < start) { showErrorModal('End date cannot be before the start date.'); return; }

  if (editingId) {
    askUpdateEvent(() => doSaveEvent(type, slotted, slot, title, start, end, note));
    return;
  }
  await doSaveEvent(type, slotted, slot, title, start, end, note);
}

async function doSaveEvent(type, slotted, slot, title, start, end, note) {
  const btn = document.getElementById('modalSave');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const existing = editingId ? allEvents.find(e => e.eventID === editingId) : null;

  const payload = {
    title,
    startDate:   start + 'T00:00:00',
    endDate:     end   + 'T00:00:00',
    eventType:   type,
    description: note || null,
    venue:       null,
    slotName:    slotted ? slot : null,
    schoolYear:  existing?.schoolYear || sheetSchoolYear,
    semester:    existing?.semester   || sheetSemester,
    createdAt:   existing?.createdAt || existing?.CreatedAt,
    CreatedAt:   existing?.CreatedAt || existing?.createdAt,
    // Editing an already-published activity must clear this back to false —
    // its old published sheet no longer reflects the new content, so it
    // needs to show up as pending again until Generate Sheet is re-run.
    isPublished: false,
  };

  try {
    if (editingId) {
      await apiRequest(`CalendarEvents/${editingId}`, 'PUT', { ...payload, eventID: editingId }, true);
    } else {
      await apiRequest('CalendarEvents', 'POST', payload, true);
    }
    closeModal();
    await loadEvents();
    showToast(editingId ? '✓ Activity updated' : '✓ Activity added');
  } catch (err) {
    showErrorModal(err.message || 'Failed to save activity. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? 'Update Activity' : 'Save Activity';
  }
}

// ── UPDATE CONFIRM ───────────────────────────────────────────
function askUpdateEvent(onConfirm) {
  document.querySelector('#confirmModal .info-modal-title').textContent   = 'Update Activity';
  document.querySelector('#confirmModal .info-modal-message').textContent = 'Update this activity?';
  const btn = document.getElementById('confirmDeleteBtn');
  btn.textContent = 'Update';
  btn.className   = 'btn-primary';
  btn.onclick = () => {
    hideConfirmModal();
    onConfirm();
  };
  document.getElementById('confirmModal').style.display = 'flex';
}

// ── DELETE ────────────────────────────────────────────────────
function askDelete(id) {
  document.querySelector('#confirmModal .info-modal-title').textContent   = 'Delete Activity';
  document.querySelector('#confirmModal .info-modal-message').textContent = 'Are you sure you want to delete this activity? This cannot be undone.';
  const btn = document.getElementById('confirmDeleteBtn');
  btn.textContent = 'Delete';
  btn.className   = 'btn-danger';
  btn.onclick = () => {
    hideConfirmModal();
    doDelete(id);
  };
  document.getElementById('confirmModal').style.display = 'flex';
}

async function doDelete(id) {
  try {
    await apiRequest(`CalendarEvents/${id}`, 'DELETE', null, true);
    await loadEvents();
    showToast('✓ Activity deleted');
  } catch (err) {
    showErrorModal('Failed to delete activity. Please try again.');
  }
}

function hideConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
}

// ── SHEET PREVIEW ─────────────────────────────────────────────
// Fetch itself lives in the shared calendar-sheet.js (also used by
// HEAD's copy of this sheet) — this just unpacks the result into this
// page's own module-level state, which the rest of the file already
// reads from (renderSheetPreview, printSheet, the sidebar display).
async function openSheetPreview() {
  const data = await fetchCalendarSheetData();
  sheetSemester       = data.semester;
  sheetSchoolYear     = data.schoolYear;
  sheetPreparedName   = data.prepName;
  sheetPreparedTitle  = data.prepTitle;
  sheetPreparedSig    = data.prepSig;
  sheetApprovedName   = data.appName;
  sheetApprovedTitle  = data.appTitle;
  sheetApprovedSig    = data.appSig;
  renderSheetSignatoryDisplay();
  renderSheetPreview();
  updatePublishNote();
  document.getElementById('sheetModal').style.display = 'flex';
}

function closeSheetPreview() {
  document.getElementById('sheetModal').style.display = 'none';
}

function renderSheetSignatoryDisplay() {
  const setDisp = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val || '—';
    el.classList.toggle('sheet-signatory-empty', !val);
  };
  setDisp('sheetPreparedNameDisp',  sheetPreparedName);
  setDisp('sheetPreparedTitleDisp', sheetPreparedTitle);
  setDisp('sheetApprovedNameDisp',  sheetApprovedName);
  setDisp('sheetApprovedTitleDisp', sheetApprovedTitle);
}

function updatePublishNote() {
  const unpublished = allEvents.filter(ev => !ev.isPublished).length;
  const total = allEvents.length;
  const note = document.getElementById('sheetPublishNote');
  if (!total) {
    note.textContent = 'No activities added yet.';
    note.className = 'sheet-publish-note warn';
    return;
  }
  if (unpublished === 0) {
    note.textContent = `All ${total} activit${total !== 1 ? 'ies are' : 'y is'} currently published to mentors.`;
    note.className = 'sheet-publish-note ok';
  } else {
    note.textContent = `${unpublished} new activit${unpublished !== 1 ? 'ies' : 'y'} will become visible to mentors after publishing.`;
    note.className = 'sheet-publish-note pending';
  }
}

function renderSheetPreview() {
 document.getElementById('sheetPreviewBody').innerHTML = buildCalendarSheetBodyHtml({
 semester:sheetSemester, schoolYear:sheetSchoolYear, events:allEvents,
 prepName:sheetPreparedName, prepTitle:sheetPreparedTitle, prepSig:sheetPreparedSig,
 appName:sheetApprovedName, appTitle:sheetApprovedTitle, appSig:sheetApprovedSig
 });
}

// ── PUBLISH ALL ───────────────────────────────────────────────
function publishCalendar() {
  const toPublish = allEvents.filter(ev => !ev.isPublished);
  if (!toPublish.length) {
    showToast('All activities are already published.');
    return;
  }
  const count = toPublish.length;
  document.getElementById('publishConfirmMsg').textContent =
    `${count} new activit${count !== 1 ? 'ies' : 'y'} will become visible to mentors. Continue?`;
  document.getElementById('publishConfirmModal').style.display = 'flex';
}

function hidePublishConfirm() {
  document.getElementById('publishConfirmModal').style.display = 'none';
}

async function doPublishCalendar() {
  hidePublishConfirm();

  const toPublish = allEvents.filter(ev => !ev.isPublished);
  if (!toPublish.length) return;

  const btn = document.getElementById('publishBtn');
  btn.disabled = true;
  btn.textContent = 'Publishing…';

  try {
    await Promise.all(toPublish.map(ev =>
      apiRequest(`CalendarEvents/${ev.eventID}`, 'PUT', {
        eventID:     ev.eventID,
        title:       ev.title,
        startDate:   ev.startDate,
        endDate:     ev.endDate,
        eventType:   ev.eventType || 'Session Schedule',
        description: ev.description || null,
        venue:       ev.venue || null,
        slotName:    ev.slotName || null,
        schoolYear:  ev.schoolYear || null,
        semester:    ev.semester || null,
        createdAt:   ev.createdAt   || ev.CreatedAt,
        CreatedAt:   ev.CreatedAt   || ev.createdAt,
        isPublished: true,
      }, true)
    ));

    await loadEvents();
    closeSheetPreview();
    showToast(`✓ Published — ${allEvents.length} activit${allEvents.length !== 1 ? 'ies are' : 'y is'} now visible to mentors`);
  } catch (err) {
    showErrorModal(err.message || 'Failed to publish. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish to Mentors';
  }
}

// ── PRINT SHEET ───────────────────────────────────────────────
// Document-building itself lives in the shared calendar-sheet.js (also
// used by HEAD's read-only copy of this same sheet) — this just supplies
// this page's own event list and already-loaded signatory data.
function printSheet() {
  const html = buildCalendarSheetPrintHtml({
    semester:   sheetSemester,
    schoolYear: sheetSchoolYear,
    events:     allEvents,
    prepName:   sheetPreparedName,
    prepTitle:  sheetPreparedTitle,
    prepSig:    sheetPreparedSig,
    appName:    sheetApprovedName,
    appTitle:   sheetApprovedTitle,
    appSig:     sheetApprovedSig,
  });

  if (!openCalendarSheetPrintWindow(html)) {
    showErrorModal('Pop-up blocked. Please allow pop-ups for this page and try again.');
  }
}

// ── EXPORT / PRINT (respects the current search + type filter) ────────
function escCsv(v) {
  if (v == null) return '';
  let s = String(v);
  // Stops spreadsheet apps from running a cell as a formula; numbers/phones pass through.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV() {
  const events = getFilteredEvents().slice().sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
  if (!events.length) { showToast('No activities to export.'); return; }

  const header = ['Type', 'Activity', 'Start Date', 'End Date', 'Status', 'Venue', 'Note'];
  const rows   = events.map(ev => [
    ev.eventType || '',
    ev.title || '',
    ev.startDate ? toIsoDate(parseDate(ev.startDate)) : '',
    ev.endDate   ? toIsoDate(parseDate(ev.endDate))   : '',
    ev.isPublished ? 'Published' : 'Not Published',
    ev.venue       || '',
    ev.description || '',
  ]);

  const csv  = [header, ...rows].map(r => r.map(escCsv).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `calendar-activities-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function printReport() {
 const events=getFilteredEvents();
 if(!events.length) { showToast('No activities to print.'); return; }
 const popup=window.open('', '_blank', 'width=900,height=700');
 if(!popup) { showErrorModal('Pop-up blocked. Please allow pop-ups for this page.'); return; }
 const data=await fetchCalendarSheetData();
 openCalendarSheetPrintWindow(buildCalendarSheetPrintHtml({...data,events}),popup);
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
    background:#111827;color:#fff;padding:12px 24px;
    border-radius:8px;font-size:14px;font-weight:500;
    z-index:99999;opacity:0;transition:opacity 0.3s;
    box-shadow:0 4px 12px rgba(0,0,0,0.2);white-space:nowrap;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.style.opacity = '1', 10);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
}

// ── ERROR MODAL ───────────────────────────────────────────────
function showErrorModal(msg) {
  document.getElementById('errorMessage').textContent = msg;
  document.getElementById('errorModal').style.display = 'flex';
}
function hideErrorModal() {
  document.getElementById('errorModal').style.display = 'none';
}
