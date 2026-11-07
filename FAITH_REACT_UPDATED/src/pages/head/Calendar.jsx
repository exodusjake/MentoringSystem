import { useEffect, useState } from 'react';
import Page from '../../app/Page.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { buildCalendarSheetPrintHtml, fetchCalendarSheetData, openCalendarSheetPrintWindow } from '../../lib/calendar-sheet.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// HEAD/HTML/calendar.html + HEAD/JS/calendar.js
// Published academic events only (read-only) — no personal planner.

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const TYPE_CONFIG = {
  'Session Schedule': { cls: 'session'    },
  'Deadline':         { cls: 'deadline'   },
  'Period':           { cls: 'exam'       },
  'Evaluation':       { cls: 'evaluation' },
};

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

function typeBg(cls) {
  return { orientation:'#f5f3ff', session:'#eff6ff', exam:'#fef2f2', deadline:'#fffbeb', evaluation:'#f0fdf4' }[cls] || '#eff6ff';
}
function typeFg(cls) {
  return { orientation:'#6d28d9', session:'#1d4ed8', exam:'#991b1b', deadline:'#92400e', evaluation:'#065f46' }[cls] || '#1d4ed8';
}

export default function HeadCalendar() {
  useBackGuard();
  const [allEvents, setAllEvents] = useState([]);
  const [state, setState] = useState('loading');
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [calError, setCalError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest('CalendarEvents', 'GET', null, true) || [];
        // Show only published events
        setAllEvents((Array.isArray(data) ? data : []).filter(ev => ev.isPublished || ev.IsPublished));
        setState('ready');
      } catch (e) {
        console.error('Calendar load error:', e);
        setState('failed');
      }
    })();
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const filtered = allEvents.filter(ev => {
    const title = (ev.title || ev.Title || '').toLowerCase();
    const etype = ev.eventType || ev.EventType || '';
    return (!q || title.includes(q)) && (!typeFilter || etype === typeFilter);
  });

  function eventsOnDay(y, m, d) {
    const target = new Date(y, m, d);
    return filtered.filter(ev => {
      const s = parseDate(ev.startDate || ev.StartDate);
      const e = parseDate(ev.endDate   || ev.EndDate);
      return s && e && target >= s && target <= e;
    });
  }

  function eventsInViewMonth() {
    const first = new Date(viewYear, viewMonth, 1);
    const last  = new Date(viewYear, viewMonth + 1, 0);
    return filtered.filter(ev => {
      const s = parseDate(ev.startDate || ev.StartDate);
      const e = parseDate(ev.endDate   || ev.EndDate);
      return s && e && s <= last && e >= first;
    }).sort((a, b) => parseDate(a.startDate || a.StartDate) - parseDate(b.startDate || b.StartDate));
  }

  function prevMonth() {
    let m = viewMonth - 1, y = viewYear;
    if (m < 0) { m = 11; y--; }
    setViewMonth(m); setViewYear(y);
    setSelectedDay(null);
  }
  function nextMonth() {
    let m = viewMonth + 1, y = viewYear;
    if (m > 11) { m = 0; y++; }
    setViewMonth(m); setViewYear(y);
    setSelectedDay(null);
  }

  function selectDay(y, m, d) {
    if (selectedDay && selectedDay.y === y && selectedDay.m === m && selectedDay.d === d) setSelectedDay(null);
    else setSelectedDay({ y, m, d });
  }
  const clearDay = () => setSelectedDay(null);

  // ── Grid ──
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

  const grid = cells.map(({ d, m, y, other }, idx) => {
    let nm = m, ny = y;
    if (nm < 0)  { nm = 11; ny--; }
    if (nm > 11) { nm = 0;  ny++; }

    const isToday    = !other && d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
    const isSelected = selectedDay && !other && d === selectedDay.d && viewMonth === selectedDay.m && viewYear === selectedDay.y;
    const dayEvs     = other ? [] : eventsOnDay(ny, nm, d);
    const bars       = [...new Map(dayEvs.map(e => [e.eventType || e.EventType, e])).values()].slice(0, 3);
    const more       = Math.max(0, dayEvs.length - bars.length);

    const cls = ['cal-day', other ? 'other-month' : '', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
    return (
      <div className={cls} key={idx} onClick={other ? undefined : () => selectDay(ny, nm, d)}>
        <div className="cal-day-num">{d}</div>
        <div className="cal-day-events">
          {bars.map((e, i) => {
            const cfg = TYPE_CONFIG[e.eventType || e.EventType] || TYPE_CONFIG['Session Schedule'];
            const eventType = e.eventType || e.EventType || 'Event';
            const eventTitle = e.title || e.Title || '';
            // Color alone can't carry the event type — role="img" + aria-label makes this bar readable by
            // assistive tech, not just visible-on-hover via title.
            return <div key={i} className={`cal-day-bar ${cfg.cls}`} role="img" aria-label={`${eventType}: ${eventTitle}`} title={eventTitle}></div>;
          })}
          {more > 0 ? <div className="cal-more">+{more}</div> : null}
        </div>
      </div>
    );
  });

  // ── Event list panel ──
  let events, sidebarTitle, sidebarSub;
  if (selectedDay) {
    const { y, m, d } = selectedDay;
    events = eventsOnDay(y, m, d);
    sidebarTitle = new Date(y, m, d).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
  } else {
    events = eventsInViewMonth();
    sidebarTitle = `${MONTHS[viewMonth]} ${viewYear}`;
  }
  sidebarSub = `${events.length} event${events.length !== 1 ? 's' : ''}`;

  let eventsList;
  if (state === 'loading') {
    eventsList = <div className="cal-loading"><i className="ti ti-loader-2"></i> Loading events…</div>;
  } else if (state === 'failed') {
    eventsList = <div className="cal-empty"><p>Failed to load events. Please refresh.</p></div>;
  } else if (!events.length) {
    eventsList = (
      <div className="cal-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <p>No published events{selectedDay ? ' on this day' : ' this month'}.</p>
      </div>
    );
  } else {
    eventsList = events.map((ev, i) => {
      const title  = ev.title     || ev.Title     || 'Untitled';
      const etype  = ev.eventType || ev.EventType || 'Session Schedule';
      const desc   = ev.description || ev.Description || '';
      const venue  = ev.venue    || ev.Venue    || '';
      const start  = ev.startDate || ev.StartDate;
      const end    = ev.endDate   || ev.EndDate;
      const cfg    = TYPE_CONFIG[etype] || TYPE_CONFIG['Session Schedule'];
      return (
        <div className={`cal-event-card ${cfg.cls}`} key={ev.eventID ?? ev.EventID ?? i}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{title}</div>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0, background: typeBg(cfg.cls), color: typeFg(cfg.cls) }}>{etype}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7280', marginBottom: venue || desc ? '6px' : '0' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            {fmtDateRange(start, end)}
          </div>
          {venue ? <div className="cal-event-venue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>{venue}</div> : null}
          {desc ? <div style={{ fontSize: '13px', color: '#4b5563', marginTop: '6px', lineHeight: 1.5 }}>{desc}</div> : null}
        </div>
      );
    });
  }

  // ── Export / Print ──
  // Fetch + document-building both live in the shared calendar-sheet.js (also used by Administrator's own copy of this
  // same sheet) — this just supplies Head's own (published-only) event list.
  async function exportCalendar() {
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) { setCalError('Pop-up blocked. Please allow pop-ups for this page.'); return; }
    const data = await fetchCalendarSheetData();
    // buildCalendarSheetPrintHtml sorts internally — pass the raw list.
    const html = buildCalendarSheetPrintHtml({ ...data, events: allEvents });

    if (!openCalendarSheetPrintWindow(html, popup)) {
      setCalError('Pop-up blocked. Please allow pop-ups for this page.');
    }
  }

  return (
    <Page id="HEAD/calendar">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Calendar</h1>
              <p>Academic schedule — published by Administrator, view-only</p>
            </div>
          </div>
          {/* Academic Calendar (published schedule, read-only) */}
          <div id="pane-program" className="cal-pane">
            {/* Toolbar */}
            <div className="cal-toolbar">
              <div className="cal-toolbar-left">
                <div className="ev-legend">
                  <div className="ev-legend-item">
                    <span className="ev-dot session"></span>
                    Session Schedule
                  </div>
                  <div className="ev-legend-item">
                    <span className="ev-dot deadline"></span>
                    Deadline
                  </div>
                  <div className="ev-legend-item">
                    <span className="ev-dot exam"></span>
                    Period
                  </div>
                  <div className="ev-legend-item">
                    <span className="ev-dot evaluation"></span>
                    Evaluation
                  </div>
                </div>
              </div>
              <div className="cal-toolbar-right">
                <div className="cal-search-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  {' '}
                  <input type="text" id="calSearch" placeholder="Search events…" autoComplete="off" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                {<Select className="cal-type-filter" id="typeFilter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="">All Types</option><option value="Session Schedule">Session Schedule</option><option value="Deadline">Deadline</option><option value="Period">Period</option><option value="Evaluation">Evaluation</option></Select>}
                {' '}
                <button className="btn-export-cal" id="exportBtn" onClick={exportCalendar}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  {' '}
                  Print / Export
                </button>
              </div>
            </div>
            {/* Calendar Layout */}
            <div className="cal-layout">
              {/* Monthly Grid */}
              <div className="cal-panel">
                <div className="cal-header">
                  <button className="cal-nav-btn" id="prevMonth" onClick={prevMonth}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  {' '}
                  <span className="cal-month-label" id="calMonthLabel">{`${MONTHS[viewMonth]} ${viewYear}`}</span>
                  {' '}
                  <button className="cal-nav-btn" id="nextMonth" onClick={nextMonth}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
                <div className="cal-dow-row">
                  <div className="cal-dow">Sun</div>
                  <div className="cal-dow">Mon</div>
                  <div className="cal-dow">Tue</div>
                  <div className="cal-dow">Wed</div>
                  <div className="cal-dow">Thu</div>
                  <div className="cal-dow">Fri</div>
                  <div className="cal-dow">Sat</div>
                </div>
                <div className="cal-grid" id="calGrid">{grid}</div>
              </div>
              {/* Event List Panel */}
              <div className="cal-right-panel">
                <div className="cal-sidebar-header">
                  <div>
                    <div className="cal-sidebar-title" id="sidebarTitle">{state === 'loading' ? 'Loading…' : sidebarTitle}</div>
                    <div className="cal-sidebar-sub" id="sidebarSub">{state === 'loading' ? '' : sidebarSub}</div>
                  </div>
                  <button className="cal-sidebar-clear" id="clearSelection" style={{ display: selectedDay ? 'inline-block' : 'none' }} onClick={clearDay}>Show all</button>
                </div>
                <div className="cal-events-list" id="calEventsList">{eventsList}</div>
              </div>
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      {/* Error Modal */}
      {<Overlay open={calError !== null} className="cal-info-modal-overlay" activeClass={null} display="flex" id="calErrorModal"><div className="cal-info-modal"><div className="cal-info-modal-icon danger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg></div><h3 className="cal-info-modal-title">Something went wrong</h3><p className="cal-info-modal-message" id="calErrorMessage">{calError ?? 'An error occurred.'}</p><button className="btn-cal-primary" onClick={() => setCalError(null)} style={{ width: '100%' }}>OK</button></div></Overlay>}
    </Page>
  );
}
