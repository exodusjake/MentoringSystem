// ===== CALENDAR JS — MENTOR PORTAL =====
// One merged calendar: Program (Admin-published, read-only) + My Sessions.
// "My Sessions" itself has two origins sharing one color/toggle: this
// mentor's own logged sessions (read-only, links to the Sessions page)
// and notes the mentor adds themselves (editable, single fixed category —
// no Meeting/Reminder/Event/Personal picker like Admin's Calendar has).
// The self-added notes reuse the existing MentorSchedule endpoint/table,
// the same one Head's own "My Schedule" tab uses.

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

let currentUser = null;

// Event/session titles come from Admin's Calendar Events or this mentor's
// own logged sessions — never trust them unescaped into an HTML attribute
// (aria-label/title).
function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

function fmtDate(isoStr) {
  const d = parseDate(isoStr);
  if (!d) return '—';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
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

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentor');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  currentUser = getSession()?.user;

  await Promise.all([loadProgramEvents(), loadMySessions(), loadPersonalEvents(), loadMySlots()]);
  renderCalendar();
  renderSidebar();

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
  document.getElementById('exportBtn').addEventListener('click', exportCalendar);

  document.getElementById('personalModalClose').addEventListener('click', closePersonalModal);
  document.getElementById('personalModalCancel').addEventListener('click', closePersonalModal);
  document.getElementById('personalModalSave').addEventListener('click', savePersonalEvent);
  document.getElementById('personalModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('personalModalOverlay')) closePersonalModal();
  });
});

// ══════════════════════════════════════════════════════════════════
// ── DATA SOURCES ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

let allEvents       = [];  // CalendarEvents (Program) — name kept as-is, exportCalendar() reads it
let mySessions      = [];  // this mentor's own logged sessions (SessionsAdmin/{id}/sessions)
let personalEvents  = [];  // this mentor's own "My Sessions" notes (MentorSchedule)
let mySlots         = [];  // this mentor's own Availability slots (AvailabilityWorkflow)
let editingPersonalId = null;
let viewYear        = new Date().getFullYear();
let viewMonth       = new Date().getMonth();
let selectedDay     = null;
let calSearchQuery  = '';
let calTypeFilter   = '';
let sourceVisible   = { program: true, sessions: true, availability: true };

const TYPE_CONFIG = {
  'Session Schedule': { cls: 'session',    badgeCls: 'badge-session'    },
  'Deadline':         { cls: 'deadline',   badgeCls: 'badge-deadline'   },
  'Period':           { cls: 'exam',       badgeCls: 'badge-exam'       },
  'Evaluation':       { cls: 'evaluation', badgeCls: 'badge-evaluation' },
};

async function loadProgramEvents() {
  try {
    const allFetched = await apiRequest('CalendarEvents', 'GET', null, true) || [];
    allEvents = allFetched.filter(ev => ev.isPublished == null || !!ev.isPublished);
  } catch (e) {
    console.error('Failed to load program events:', e);
    showCalError('Failed to load the program calendar. Please refresh.');
  }
}

async function loadMySessions() {
  if (!currentUser?.userID) return;
  try {
    const data = await apiRequest(`SessionsAdmin/${currentUser.userID}/sessions`, 'GET', null, true);
    mySessions = data?.sessions || [];
  } catch (e) {
    console.error('Failed to load logged sessions:', e);
    showCalError('Failed to load your logged sessions. Please refresh.');
  }
}

// Every future-dated slot is shown regardless of booking status — a slot
// isn't used up by one booking (multiple mentees can attend the same one,
// see sp_SubmitSessionRequest), so it stays a genuinely open invitation
// until its date passes or the mentor deletes it. The resulting Session
// (once someone's booked) shows separately under "My Sessions" — that's a
// different fact (the confirmed roster), not a duplicate of this one.
async function loadMySlots() {
  if (!currentUser?.userID) return;
  try {
    const data = await apiRequest(`AvailabilityWorkflow/mentor/${currentUser.userID}/slots`, 'GET', null, true);
    const raw  = Array.isArray(data) ? data : [];
    const seen = new Set();
    mySlots = raw.filter(s => s.linkedSessionStatus !== 'Cancelled' && (s.linkedSessionID || !s.approvedMentees) && !seen.has(s.availabilityID) && seen.add(s.availabilityID));
  } catch (e) {
    console.error('Failed to load availability slots:', e);
    showCalError('Failed to load your availability slots. Please refresh.');
  }
}

async function loadPersonalEvents() {
  if (!currentUser?.userID) return;
  try {
    personalEvents = await apiRequest(`MentorSchedule?mentorId=${currentUser.userID}`, 'GET', null, true) || [];
  } catch (e) {
    console.error('Failed to load My Sessions notes:', e);
    showCalError('Failed to load your saved notes. Please refresh.');
  }
}

function toggleSource(source) {
  sourceVisible[source] = !sourceVisible[source];
  document.getElementById(`srcToggle-${source}`).classList.toggle('active', sourceVisible[source]);
  // Adding to a hidden layer wouldn't make sense — the button only
  // applies to "My Sessions".
  if (source === 'sessions') {
  }
  renderCalendar();
  renderSidebar();
}

// A session's topic can carry a legacy "[SECTION] " prefix (Sessions.
// Notes convention) — sectionCode comes straight from the backend
// instead (Sessions.SectionCode) and is shown as its own line/badge, so
// showing the bracket too would just repeat the same section twice, and
// less formally. Same strip MENTOR/JS/sessions.js already does.
function stripSectionPrefix(topic) {
  return (topic || '').replace(/^\[[^\]]+\]\s*/, '');
}

// ── NORMALIZE: both sources into one shape for rendering ───────────
// { source, kind, title, start, end, raw } — CalendarEvents is a date
// range (startDate/endDate); a logged session is a single point in time
// (sessionDate only), so start === end for those.
function normalizedEvents() {
  const out = [];

  if (sourceVisible.program) {
    allEvents.forEach(ev => {
      if (calSearchQuery && !(ev.title || '').toLowerCase().includes(calSearchQuery)) return;
      if (calTypeFilter  && ev.eventType !== calTypeFilter) return;
      const start = parseDate(ev.startDate);
      const end   = parseDate(ev.endDate) || start;
      if (!start) return;
      out.push({ source: 'program', kind: ev.eventType, title: ev.title, start, end, raw: ev });
    });
  }

  if (sourceVisible.sessions) {
    mySessions.forEach(s => {
      const title = stripSectionPrefix(s.topic) || s.slotName || 'Mentoring Session';
      if (calSearchQuery && !title.toLowerCase().includes(calSearchQuery)) return;
      const start = parseDate(s.sessionDate);
      if (!start) return;
      out.push({ source: 'session', origin: 'logged', kind: s.sessionStatus, title, start, end: start, raw: s });
    });
    personalEvents.forEach(ev => {
      if (calSearchQuery && !(ev.title || '').toLowerCase().includes(calSearchQuery)) return;
      const start = parseDate(ev.eventDate);
      const end   = parseDate(ev.endDate) || start;
      if (!start) return;
      out.push({ source: 'session', origin: 'personal', kind: 'Personal', title: ev.title, start, end, raw: ev });
    });
  }

  if (sourceVisible.availability) {
    mySlots.forEach(slot => {
      const start = parseDate(slot.availableDate);
      if (!start) return;
      const title = slot.slotName || fmtSlotTime(slot.startTime);
      if (calSearchQuery && !title.toLowerCase().includes(calSearchQuery)) return;
      out.push({ source: 'availability', kind: availabilityLabel(slot), title, start, end: start, raw: slot });
    });
  }

  return out;
}

function fmtSlotTime(t) {
  if (!t) return '—';
  const [h, m] = t.toString().split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12  = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function eventsOnDay(y, m, d) {
  const target = new Date(y, m, d);
  return normalizedEvents().filter(e => target >= e.start && target <= e.end);
}

function eventsInViewMonth() {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const lastOfMonth  = new Date(viewYear, viewMonth + 1, 0);
  // Most recent/latest date first, not earliest — same convention as a
  // feed/inbox rather than reading the month strictly forward.
  return normalizedEvents()
    .filter(e => e.start <= lastOfMonth && e.end >= firstOfMonth)
    .sort((a, b) => b.start - a.start);
}

function barClassFor(e) {
  if (e.source === 'program') return (TYPE_CONFIG[e.kind] || TYPE_CONFIG['Session Schedule']).cls;
  if (e.source === 'availability') return e.raw.isClosed ? 'availability late' : 'availability';
  return e.kind === 'Cancelled' ? 'my-session cancelled' : 'my-session';
}

// ── CALENDAR GRID ────────────────────────────────────────────────
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

  document.getElementById('calGrid').innerHTML = cells.map(({ d, m, y, other }) => {
    let nm = m, ny = y;
    if (nm < 0)  { nm = 11; ny--; }
    if (nm > 11) { nm = 0;  ny++; }

    const isToday    = !other && d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
    const isSelected = selectedDay && !other && d === selectedDay.day && viewMonth === selectedDay.month && viewYear === selectedDay.year;
    const dayEvents  = other ? [] : eventsOnDay(ny, nm, d);
    const bars       = [...new Map(dayEvents.map(e => [`${e.source}:${e.kind}`, e])).values()].slice(0, 3);
    const more       = Math.max(0, dayEvents.length - bars.length);

    const barsHtml = bars.map(e => {
      const label = e.source === 'program' ? (e.kind || 'Event')
        : e.source === 'availability' ? `Availability - ${availabilityLabel(e.raw)}`
        : e.origin === 'personal' ? 'My Sessions — Note' : `Session — ${e.kind || 'Scheduled'}`;
      return `<div class="cal-day-bar ${barClassFor(e)}" role="img" aria-label="${escAttr(label)}: ${escAttr(e.title)}" title="${escAttr(e.title)}"></div>`;
    }).join('');
    const moreHtml = more > 0 ? `<div class="cal-more">+${more}</div>` : '';

    const cls = ['cal-day', other ? 'other-month' : '', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
    const onclick = other ? '' : `onclick="selectDay(${ny},${nm},${d})"`;

    return `<div class="${cls}" ${onclick}><div class="cal-day-num">${d}</div><div class="cal-day-events">${barsHtml}${moreHtml}</div></div>`;
  }).join('');
}

function selectDay(y, m, d) {
  if (selectedDay && selectedDay.year === y && selectedDay.month === m && selectedDay.day === d) {
    selectedDay = null;
  } else {
    selectedDay = { year: y, month: m, day: d };
  }
  renderCalendar();
  renderSidebar();
}

// ── SIDEBAR ──────────────────────────────────────────────────────
function renderSidebar() {
  const titleEl  = document.getElementById('sidebarTitle');
  const subEl    = document.getElementById('sidebarSub');
  const clearBtn = document.getElementById('clearSelection');
  const list     = document.getElementById('calEventsList');

  let events;
  if (selectedDay) {
    const { year, month, day } = selectedDay;
    events = eventsOnDay(year, month, day);
    titleEl.textContent    = new Date(year, month, day).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
    subEl.textContent      = `${events.length} event${events.length !== 1 ? 's' : ''}`;
    clearBtn.style.display = 'inline-block';
  } else {
    events = eventsInViewMonth();
    titleEl.textContent    = `${MONTHS[viewMonth]} ${viewYear}`;
    subEl.textContent      = `${events.length} event${events.length !== 1 ? 's' : ''}`;
    clearBtn.style.display = 'none';
  }

  if (!events.length) {
    list.innerHTML = `<div class="cal-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <p>${selectedDay ? 'No events on this day.' : 'No events this month.'}</p>
    </div>`;
    return;
  }

  list.innerHTML = events.map(e => {
    if (e.source === 'program') return renderProgramCard(e.raw);
    if (e.source === 'availability') return renderAvailabilityCard(e.raw);
    return renderSessionCard(e);
  }).join('');
}

function renderProgramCard(ev) {
  const cfg       = TYPE_CONFIG[ev.eventType] || TYPE_CONFIG['Session Schedule'];
  const dateRange = fmtDateRange(ev.startDate, ev.endDate);
  const descHtml  = ev.description ? `<div class="cal-event-desc">${ev.description}</div>` : '';
  return `
    <div class="cal-event-card ${cfg.cls}">
      <div class="cal-event-top">
        <div class="cal-event-title">${ev.title}</div>
      </div>
      <div class="cal-event-dates">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${dateRange}
      </div>
      <span class="cal-event-badge ${cfg.badgeCls}">${ev.eventType}</span>
      ${ev.venue ? `<div class="cal-event-venue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${ev.venue.replace(/\|/g, ' · ')}</div>` : ''}
      ${descHtml}
    </div>`;
}

// "My Sessions" cards branch on origin: a logged session is read-only
// (clicking through goes to the Sessions page, where logging/editing a
// session already lives — no second editing UI built here); a
// mentor-added note is fully editable (Edit/Delete), same as before this
// merge, just with a single fixed category instead of a picker.
function renderSessionCard(e) {
  return e.origin === 'personal' ? renderPersonalCard(e.raw) : renderLoggedSessionCard(e.raw);
}

function renderLoggedSessionCard(s) {
  const title    = stripSectionPrefix(s.topic) || s.slotName || 'Mentoring Session';
  const status   = s.sessionStatus || 'Scheduled';
  const cancelled = status === 'Cancelled';
  return `
    <div class="cal-event-card my-session${cancelled ? ' cancelled' : ''}">
      <div class="cal-event-top">
        <div class="cal-event-title">${title}</div>
        <div class="cal-event-actions" style="opacity:1;">
          <button class="cal-action-btn" title="View in Sessions" onclick="location.href='sessions.html'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
      <div class="cal-event-dates">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${fmtDate(s.sessionDate)}
      </div>
      <span class="cal-event-badge badge-my-session ${['Cancelled','Completed','Scheduled','Pending'].includes(status) ? 'session-status-' + status.toLowerCase() : ''}">${status}</span>
      ${s.sectionCode ? `<span class="cal-event-badge badge-section">${s.sectionCode}</span>` : ''}
    </div>`;
}

function renderPersonalCard(ev) {
  const dateStr   = fmtDateRange(ev.eventDate, ev.endDate);
  const notesHtml = ev.notes ? `<div class="cal-event-desc">${ev.notes}</div>` : '';
  return `
    <div class="cal-event-card my-session">
      <div class="cal-event-top">
        <div class="cal-event-title">${ev.title}</div>
        <div class="cal-event-actions">
          <button class="cal-action-btn" title="Edit" onclick="openPersonalModal(${ev.eventID})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="cal-action-btn delete" title="Delete" onclick="askDeletePersonal(${ev.eventID})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
      <div class="cal-event-dates">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${dateStr}
      </div>
      <span class="cal-event-badge badge-my-session">Note</span>
      ${notesHtml}
    </div>`;
}

// Read-only, same principle as the Sessions card — managing (posting,
// deleting) a slot stays on the Availability page, not a second editing UI
// here. Shows how many mentees have joined so far, since the slot itself
// stays open to more (see loadMySlots()'s comment).
function availabilityLabel(slot) {
  if (slot.isClosed) return 'Closed';
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return String(slot.availableDate || '').slice(0,10) < today ? 'Past' : 'Open';
}

function renderAvailabilityCard(slot) {
  const title = slot.slotName || 'Availability Slot';
  const timeStr = fmtSlotTime(slot.startTime);
  const dateStr = fmtDateRange(slot.availableDate, slot.availableDate);
  const joined = slot.approvedMentees
    ? `<div class="cal-event-desc"><i class="ti ti-user-check"></i> ${slot.approvedMentees}</div>`
    : '';
  return `
    <div class="cal-event-card availability">
      <div class="cal-event-top">
        <div class="cal-event-title">${title}</div>
        <div class="cal-event-actions" style="opacity:1;">
          <button class="cal-action-btn" title="Manage in Availability" onclick="location.href='availability.html'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
      <div class="cal-event-dates">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${dateStr} &middot; ${timeStr}
      </div>
      ${!slot.isClosed ? `<span class="cal-event-badge badge-availability">${availabilityLabel(slot)}</span>` : ''}
      ${slot.isClosed ? `<span class="cal-event-badge badge-late" title="Checkpoint session window is closed">Closed</span>` : ''}
      ${joined}
    </div>`;
}

// ── EXPORT / PRINT ────────────────────────────────────────────────
// Prints only the official Program Calendar — a mentor's logged sessions
// never appear on the printed sheet, same as before this merge.
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

// Uses the shared calendar-sheet.js (loaded in calendar.html) instead of
// its own copy of this document. fmtPrintDate() above is still this
// page's own (calendar-sheet.js calls it as a global).
async function exportCalendar() {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) { showCalError('Pop-up blocked. Please allow pop-ups for this page.'); return; }
  const data = await fetchCalendarSheetData();
  const html = buildCalendarSheetPrintHtml({ ...data, events: allEvents });
  if (!openCalendarSheetPrintWindow(html, popup)) {
    showCalError('Pop-up blocked. Please allow pop-ups for this page.');
  }
}

// ── ADD/EDIT MY SESSIONS NOTE ───────────────────────────────────────
function openPersonalModal(id) {
  // Calendar creates no manual sessions; retained notes can still be edited.
  if (!id) return;
  const defaultDate = selectedDay
    ? toIsoDate(new Date(selectedDay.year, selectedDay.month, selectedDay.day))
    : toIsoDate(new Date());

  if (id) {
    const ev = personalEvents.find(e => e.eventID === id);
    if (!ev) return;
    editingPersonalId = id;
    document.getElementById('personalModalTitle').textContent = 'Edit My Sessions Note';
    document.getElementById('personalModalSave').textContent  = 'Update';
    const sIso = ev.eventDate?.split('T')[0] || '';
    const eIso = ev.endDate?.split('T')[0]   || '';
    document.getElementById('pFieldTitle').value    = ev.title;
    document.getElementById('pFieldDate').value     = sIso;
    document.getElementById('pFieldEndDate').value  = (eIso && eIso !== sIso) ? eIso : '';
    document.getElementById('pFieldNotes').value    = ev.notes || '';
  } else {
    editingPersonalId = null;
    document.getElementById('personalModalTitle').textContent = 'Add to My Sessions';
    document.getElementById('personalModalSave').textContent  = 'Save';
    document.getElementById('pFieldTitle').value    = '';
    document.getElementById('pFieldDate').value     = defaultDate;
    document.getElementById('pFieldEndDate').value  = '';
    document.getElementById('pFieldNotes').value    = '';
  }

  document.getElementById('personalModalOverlay').classList.add('active');
  document.getElementById('pFieldTitle').focus();
}

function closePersonalModal() {
  document.getElementById('personalModalOverlay').classList.remove('active');
  editingPersonalId = null;
}

// Single fixed category under the hood — no picker shown to the mentor,
// unlike Admin's Calendar (Meeting/Reminder/Event/Personal).
const PERSONAL_CATEGORY = 'Personal';

async function savePersonalEvent() {
  if (!editingPersonalId) return;
  const title  = document.getElementById('pFieldTitle').value.trim();
  const date   = document.getElementById('pFieldDate').value;
  const endRaw = document.getElementById('pFieldEndDate').value;
  const end    = endRaw || date;
  const notes  = document.getElementById('pFieldNotes').value.trim();

  if (!title) { showCalError('Please enter a title.'); return; }
  if (!date)  { showCalError('Please select a start date.'); return; }
  if (end < date) { showCalError('End date cannot be before the start date.'); return; }

  const btn = document.getElementById('personalModalSave');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const payload = {
    mentorID:  currentUser.userID,
    title,
    eventDate: date + 'T00:00:00',
    endDate:   end  + 'T00:00:00',
    category:  PERSONAL_CATEGORY,
    notes: notes || null,
  };

  try {
    if (editingPersonalId) {
      await apiRequest(`MentorSchedule/${editingPersonalId}`, 'PUT', { ...payload, eventID: editingPersonalId }, true);
    } else {
      await apiRequest('MentorSchedule', 'POST', payload, true);
    }
    closePersonalModal();
    await loadPersonalEvents();
    renderCalendar();
    renderSidebar();
  } catch (err) {
    showCalError(err.message || 'Failed to save. Please try again.');
  } finally {
    btn.disabled    = false;
    btn.textContent = editingPersonalId ? 'Update' : 'Save';
  }
}

function askDeletePersonal(id) {
  document.getElementById('calConfirmDeleteBtn').onclick = () => {
    hideCalConfirm();
    doDeletePersonal(id);
  };
  document.getElementById('calConfirmModal').classList.add('open');
}

async function doDeletePersonal(id) {
  try {
    await apiRequest(`MentorSchedule/${id}`, 'DELETE', null, true);
    await loadPersonalEvents();
    renderCalendar();
    renderSidebar();
  } catch (err) {
    showCalError('Failed to delete. Please try again.');
  }
}

function hideCalConfirm(e) {
  if (!e || e.target === document.getElementById('calConfirmModal'))
    document.getElementById('calConfirmModal').classList.remove('open');
}

// ── MODALS ────────────────────────────────────────────────────────
function showCalError(msg) {
  document.getElementById('calErrorMessage').textContent = msg;
  document.getElementById('calErrorModal').classList.add('open');
}

function hideCalError(e) {
  if (!e || e.target === document.getElementById('calErrorModal'))
    document.getElementById('calErrorModal').classList.remove('open');
}
