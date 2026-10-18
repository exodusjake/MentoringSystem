/* ============================================================
   HEAD ADMIN — calendar.js
   Published academic events only (read-only) — no personal planner.
   ============================================================ */

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// Event titles come from Admin's Calendar Events page — never trust them
// unescaped into an HTML attribute (aria-label/title), same reasoning as
// escaping any other posted content.
function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TYPE_CONFIG = {
  'Session Schedule': { cls: 'session'    },
  'Deadline':         { cls: 'deadline'   },
  'Period':           { cls: 'exam'       },
  'Evaluation':       { cls: 'evaluation' },
};

let allEvents     = [];
let viewYear      = new Date().getFullYear();
let viewMonth     = new Date().getMonth();
let selectedDay   = null;
let searchQuery   = '';
let typeFilter    = '';

function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
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

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('head');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  await loadEvents();

  document.getElementById('prevMonth').addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    selectedDay = null;
    render();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    selectedDay = null;
    render();
  });
  document.getElementById('calSearch').addEventListener('input', e => {
    searchQuery = e.target.value.trim().toLowerCase();
    render();
  });
  document.getElementById('typeFilter').addEventListener('change', e => {
    typeFilter = e.target.value;
    render();
  });
  document.getElementById('exportBtn').addEventListener('click', exportCalendar);
});

async function loadEvents() {
  try {
    const data = await apiRequest('CalendarEvents', 'GET', null, true) || [];
    // Show only published events
    allEvents = (Array.isArray(data) ? data : []).filter(ev => ev.isPublished || ev.IsPublished);
    render();
  } catch (e) {
    console.error('Calendar load error:', e);
    document.getElementById('calEventsList').innerHTML =
      '<div class="cal-empty"><p>Failed to load events. Please refresh.</p></div>';
  }
}

// ── Filtering helpers ─────────────────────────────────────────
function getFiltered() {
  return allEvents.filter(ev => {
    const title = (ev.title || ev.Title || '').toLowerCase();
    const etype = ev.eventType || ev.EventType || '';
    return (!searchQuery || title.includes(searchQuery))
        && (!typeFilter  || etype === typeFilter);
  });
}

function eventsOnDay(y, m, d) {
  const target = new Date(y, m, d);
  return getFiltered().filter(ev => {
    const s = parseDate(ev.startDate || ev.StartDate);
    const e = parseDate(ev.endDate   || ev.EndDate);
    return s && e && target >= s && target <= e;
  });
}

function eventsInViewMonth() {
  const first = new Date(viewYear, viewMonth, 1);
  const last  = new Date(viewYear, viewMonth + 1, 0);
  return getFiltered().filter(ev => {
    const s = parseDate(ev.startDate || ev.StartDate);
    const e = parseDate(ev.endDate   || ev.EndDate);
    return s && e && s <= last && e >= first;
  }).sort((a, b) => parseDate(a.startDate || a.StartDate) - parseDate(b.startDate || b.StartDate));
}

// ── Render ────────────────────────────────────────────────────
function render() {
  renderCalendar();
  renderSidebar();
}

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
    const isSelected = selectedDay && !other && d === selectedDay.d && viewMonth === selectedDay.m && viewYear === selectedDay.y;
    const dayEvs     = other ? [] : eventsOnDay(ny, nm, d);
    const bars       = [...new Map(dayEvs.map(e => [e.eventType || e.EventType, e])).values()].slice(0, 3);
    const more       = Math.max(0, dayEvs.length - bars.length);

    const barsHtml = bars.map(e => {
      const cfg = TYPE_CONFIG[e.eventType || e.EventType] || TYPE_CONFIG['Session Schedule'];
      const eventType = e.eventType || e.EventType || 'Event';
      const eventTitle = e.title || e.Title || '';
      // Color alone can't carry the event type — role="img" + aria-label
      // makes this bar readable by assistive tech, not just visible-on-
      // hover via title.
      return `<div class="cal-day-bar ${cfg.cls}" role="img" aria-label="${escAttr(eventType)}: ${escAttr(eventTitle)}" title="${escAttr(eventTitle)}"></div>`;
    }).join('');

    const cls = ['cal-day', other ? 'other-month' : '', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
    const onclick = other ? '' : `onclick="selectDay(${ny},${nm},${d})"`;

    return `<div class="${cls}" ${onclick}>
      <div class="cal-day-num">${d}</div>
      <div class="cal-day-events">${barsHtml}${more > 0 ? `<div class="cal-more">+${more}</div>` : ''}</div>
    </div>`;
  }).join('');
}

function selectDay(y, m, d) {
  if (selectedDay && selectedDay.y === y && selectedDay.m === m && selectedDay.d === d) {
    selectedDay = null;
  } else {
    selectedDay = { y, m, d };
  }
  render();
}

function clearDay() {
  selectedDay = null;
  render();
}

function renderSidebar() {
  const titleEl  = document.getElementById('sidebarTitle');
  const subEl    = document.getElementById('sidebarSub');
  const clearBtn = document.getElementById('clearSelection');
  const list     = document.getElementById('calEventsList');

  let events;
  if (selectedDay) {
    const { y, m, d } = selectedDay;
    events = eventsOnDay(y, m, d);
    titleEl.textContent = new Date(y, m, d).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
    subEl.textContent   = `${events.length} event${events.length !== 1 ? 's' : ''}`;
    clearBtn.style.display = 'inline-block';
  } else {
    events = eventsInViewMonth();
    titleEl.textContent    = `${MONTHS[viewMonth]} ${viewYear}`;
    subEl.textContent      = `${events.length} event${events.length !== 1 ? 's' : ''}`;
    clearBtn.style.display = 'none';
  }

  if (!events.length) {
    list.innerHTML = `
      <div class="cal-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>No published events${selectedDay ? ' on this day' : ' this month'}.</p>
      </div>`;
    return;
  }

  list.innerHTML = events.map(ev => renderEventCard(ev)).join('');
}

function renderEventCard(ev) {
  const title  = ev.title     || ev.Title     || 'Untitled';
  const etype  = ev.eventType || ev.EventType || 'Session Schedule';
  const desc   = ev.description || ev.Description || '';
  const venue  = ev.venue    || ev.Venue    || '';
  const start  = ev.startDate || ev.StartDate;
  const end    = ev.endDate   || ev.EndDate;
  const cfg    = TYPE_CONFIG[etype] || TYPE_CONFIG['Session Schedule'];

  return `
    <div class="cal-event-card ${cfg.cls}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <div style="font-size:15px;font-weight:700;color:#111827;line-height:1.3;">${title}</div>
        <span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;flex-shrink:0;
          background:${typeBg(cfg.cls)};color:${typeFg(cfg.cls)};">${etype}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#6b7280;margin-bottom:${venue || desc ? '6px' : '0'};">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${fmtDateRange(start, end)}
      </div>
      ${venue ? `<div class="cal-event-venue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${venue}</div>` : ''}
      ${desc ? `<div style="font-size:13px;color:#4b5563;margin-top:6px;line-height:1.5;">${desc}</div>` : ''}
    </div>`;
}

function typeBg(cls) {
  return { orientation:'#f5f3ff', session:'#eff6ff', exam:'#fef2f2', deadline:'#fffbeb', evaluation:'#f0fdf4' }[cls] || '#eff6ff';
}
function typeFg(cls) {
  return { orientation:'#6d28d9', session:'#1d4ed8', exam:'#991b1b', deadline:'#92400e', evaluation:'#065f46' }[cls] || '#1d4ed8';
}

// ── Export / Print ────────────────────────────────────────────
// Fetch + document-building both live in the shared calendar-sheet.js
// (also used by ADMIN_'s own copy of this same sheet) — this just
// supplies Head's own (published-only) event list.
async function exportCalendar() {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) { showCalError('Pop-up blocked. Please allow pop-ups for this page.'); return; }
  const data = await fetchCalendarSheetData();
  // buildCalendarSheetPrintHtml sorts internally — pass the raw list.
  const html = buildCalendarSheetPrintHtml({ ...data, events: allEvents });

  if (!openCalendarSheetPrintWindow(html, popup)) {
    showCalError('Pop-up blocked. Please allow pop-ups for this page.');
  }
}

// ── Modals ────────────────────────────────────────────────────────
function showCalError(msg) {
  document.getElementById('calErrorMessage').textContent = msg;
  document.getElementById('calErrorModal').style.display = 'flex';
}

function hideCalError() {
  document.getElementById('calErrorModal').style.display = 'none';
}
