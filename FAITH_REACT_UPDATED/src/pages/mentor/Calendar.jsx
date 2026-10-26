import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import DateInput from '../../components/DateInput.jsx';
import { checkpointToday } from '../../lib/checkpoint-window.js';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { buildCalendarSheetPrintHtml, fetchCalendarSheetData, openCalendarSheetPrintWindow } from '../../lib/calendar-sheet.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// MENTOR/HTML/calendar.html + MENTOR/JS/calendar.js
// One merged calendar: Program (Admin-published, read-only) + My Sessions (this mentor's logged sessions and
// their own notes) + Availability slots.

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const TYPE_CONFIG = {
  'Session Schedule': { cls: 'session',    badgeCls: 'badge-session'    },
  'Deadline':         { cls: 'deadline',   badgeCls: 'badge-deadline'   },
  'Period':           { cls: 'exam',       badgeCls: 'badge-exam'       },
  'Evaluation':       { cls: 'evaluation', badgeCls: 'badge-evaluation' },
};

const PERSONAL_CATEGORY = 'Personal';

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
// A session's topic can carry a legacy "[SECTION] " prefix — sectionCode comes from the backend instead.
function stripSectionPrefix(topic) {
  return (topic || '').replace(/^\[[^\]]+\]\s*/, '');
}
function fmtSlotTime(t) {
  if (!t) return '—';
  const [h, m] = t.toString().split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12  = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}
function availabilityLabel(slot) {
  if (slot.isClosed) return 'Closed';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return String(slot.availableDate || '').slice(0, 10) < today ? 'Past' : 'Open';
}
function barClassFor(e) {
  if (e.source === 'program') return (TYPE_CONFIG[e.kind] || TYPE_CONFIG['Session Schedule']).cls;
  if (e.source === 'availability') return e.raw.isClosed ? 'availability late' : 'availability';
  return e.kind === 'Cancelled' ? 'my-session cancelled' : 'my-session';
}

// fmtPrintDate is this page's own (calendar-sheet reads it as a global in the vanilla script).
const CalIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
const ArrowIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg>;

export default function MentorCalendar() {
  useBackGuard();
  const currentUser = getSession()?.user;
  const now0 = new Date();

  const [allEvents, setAllEvents] = useState([]);       // CalendarEvents (Program)
  const [mySessions, setMySessions] = useState([]);
  const [personalEvents, setPersonalEvents] = useState([]);
  const [mySlots, setMySlots] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [viewYear, setViewYear] = useState(now0.getFullYear());
  const [viewMonth, setViewMonth] = useState(now0.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceVisible, setSourceVisible] = useState({ program: true, sessions: true, availability: true });
  const [errorMsg, setErrorMsg] = useState(null);
  const [editing, setEditing] = useState(null);          // personal note being edited
  const [pTitle, setPTitle] = useState('');
  const [pDate, setPDate] = useState('');
  const [pEnd, setPEnd] = useState('');
  const [pNotes, setPNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteFn, setDeleteFn] = useState(null);

  const showCalError = msg => setErrorMsg(msg);

  async function loadPersonalEvents() {
    if (!currentUser?.userID) return;
    try {
      setPersonalEvents(await apiRequest(`MentorSchedule?mentorId=${currentUser.userID}`, 'GET', null, true) || []);
    } catch (e) {
      console.error('Failed to load My Sessions notes:', e);
      showCalError('Failed to load your saved notes. Please refresh.');
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([
        (async () => {
          try {
            const allFetched = await apiRequest('CalendarEvents', 'GET', null, true) || [];
            setAllEvents(allFetched.filter(ev => ev.isPublished == null || !!ev.isPublished));
          } catch (e) {
            console.error('Failed to load program events:', e);
            showCalError('Failed to load the program calendar. Please refresh.');
          }
        })(),
        (async () => {
          if (!currentUser?.userID) return;
          try {
            const data = await apiRequest(`SessionsAdmin/${currentUser.userID}/sessions`, 'GET', null, true);
            setMySessions(data?.sessions || []);
          } catch (e) {
            console.error('Failed to load logged sessions:', e);
            showCalError('Failed to load your logged sessions. Please refresh.');
          }
        })(),
        loadPersonalEvents(),
        (async () => {
          if (!currentUser?.userID) return;
          // Every future-dated slot is shown regardless of booking status.
          try {
            const data = await apiRequest(`AvailabilityWorkflow/mentor/${currentUser.userID}/slots`, 'GET', null, true);
            const raw = Array.isArray(data) ? data : [];
            const seen = new Set();
            setMySlots(raw.filter(s => s.linkedSessionStatus !== 'Cancelled' && (s.linkedSessionID || !s.approvedMentees) && !seen.has(s.availabilityID) && seen.add(s.availabilityID)));
          } catch (e) {
            console.error('Failed to load availability slots:', e);
            showCalError('Failed to load your availability slots. Please refresh.');
          }
        })(),
      ]);
      setLoaded(true);
    })();
  }, []);

  // ── normalize: all sources into one shape ──
  const q = search.trim().toLowerCase();
  function normalizedEvents() {
    const out = [];
    if (sourceVisible.program) {
      allEvents.forEach(ev => {
        if (q && !(ev.title || '').toLowerCase().includes(q)) return;
        if (typeFilter && ev.eventType !== typeFilter) return;
        const start = parseDate(ev.startDate);
        const end = parseDate(ev.endDate) || start;
        if (!start) return;
        out.push({ source: 'program', kind: ev.eventType, title: ev.title, start, end, raw: ev });
      });
    }
    if (sourceVisible.sessions) {
      mySessions.forEach(s => {
        const title = stripSectionPrefix(s.topic) || s.slotName || 'Mentoring Session';
        if (q && !title.toLowerCase().includes(q)) return;
        const start = parseDate(s.sessionDate);
        if (!start) return;
        out.push({ source: 'session', origin: 'logged', kind: s.sessionStatus, title, start, end: start, raw: s });
      });
      personalEvents.forEach(ev => {
        if (q && !(ev.title || '').toLowerCase().includes(q)) return;
        const start = parseDate(ev.eventDate);
        const end = parseDate(ev.endDate) || start;
        if (!start) return;
        out.push({ source: 'session', origin: 'personal', kind: 'Personal', title: ev.title, start, end, raw: ev });
      });
    }
    if (sourceVisible.availability) {
      mySlots.forEach(slot => {
        const start = parseDate(slot.availableDate);
        if (!start) return;
        const title = slot.slotName || fmtSlotTime(slot.startTime);
        if (q && !title.toLowerCase().includes(q)) return;
        out.push({ source: 'availability', kind: availabilityLabel(slot), title, start, end: start, raw: slot });
      });
    }
    return out;
  }
  const normalized = normalizedEvents();
  const eventsOnDay = (y, m, d) => {
    const target = new Date(y, m, d);
    return normalized.filter(e => target >= e.start && target <= e.end);
  };
  function eventsInViewMonth() {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const lastOfMonth = new Date(viewYear, viewMonth + 1, 0);
    // Most recent/latest date first, like a feed.
    return normalized.filter(e => e.start <= lastOfMonth && e.end >= firstOfMonth).sort((a, b) => b.start - a.start);
  }

  function prevMonth() {
    let m = viewMonth - 1, y = viewYear;
    if (m < 0) { m = 11; y--; }
    setViewMonth(m); setViewYear(y); setSelectedDay(null);
  }
  function nextMonth() {
    let m = viewMonth + 1, y = viewYear;
    if (m > 11) { m = 0; y++; }
    setViewMonth(m); setViewYear(y); setSelectedDay(null);
  }
  function selectDay(y, m, d) {
    if (selectedDay && selectedDay.year === y && selectedDay.month === m && selectedDay.day === d) setSelectedDay(null);
    else setSelectedDay({ year: y, month: m, day: d });
  }
  const toggleSource = source => setSourceVisible(v => ({ ...v, [source]: !v[source] }));

  // ── export ──
  async function exportCalendar() {
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) { showCalError('Pop-up blocked. Please allow pop-ups for this page.'); return; }
    const data = await fetchCalendarSheetData();
    const html = buildCalendarSheetPrintHtml({ ...data, events: allEvents });
    if (!openCalendarSheetPrintWindow(html, popup)) {
      showCalError('Pop-up blocked. Please allow pop-ups for this page.');
    }
  }

  // ── edit a My Sessions note (the calendar creates no manual sessions; retained notes can still be edited) ──
  function openPersonalModal(id) {
    const ev = personalEvents.find(e => e.eventID === id);
    if (!ev) return;
    const sIso = ev.eventDate?.split('T')[0] || '';
    const eIso = ev.endDate?.split('T')[0] || '';
    setEditing(id);
    setPTitle(ev.title);
    setPDate(sIso);
    setPEnd((eIso && eIso !== sIso) ? eIso : '');
    setPNotes(ev.notes || '');
  }
  const closePersonalModal = () => setEditing(null);

  // Dates before today cannot be picked; a note that already sits in the past keeps its own date while it is edited.
  const todayIso = checkpointToday();
  const editedNote = editing ? personalEvents.find(e => e.eventID === editing) : null;
  const editedStart = editedNote?.eventDate?.split('T')[0] || '';
  const editedEnd = editedNote?.endDate?.split('T')[0] || editedStart;
  const dateMin = editedStart && editedStart < todayIso ? editedStart : todayIso;

  async function savePersonalEvent() {
    if (!editing) return;
    const title = pTitle.trim();
    const date = pDate;
    const end = pEnd || date;
    const notes = pNotes.trim();

    if (!title) { showCalError('Please enter a title.'); return; }
    if (!date) { showCalError('Please select a start date.'); return; }
    if (end < date) { showCalError('End date cannot be before the start date.'); return; }
    if (date < todayIso && date !== editedStart) { showCalError('The start date cannot be in the past.'); return; }
    if (end < todayIso && end !== editedEnd) { showCalError('The end date cannot be in the past.'); return; }

    setSaving(true);
    const payload = {
      mentorID:  currentUser.userID,
      title,
      eventDate: date + 'T00:00:00',
      endDate:   end + 'T00:00:00',
      category:  PERSONAL_CATEGORY,
      notes: notes || null,
    };
    try {
      await apiRequest(`MentorSchedule/${editing}`, 'PUT', { ...payload, eventID: editing }, true);
      closePersonalModal();
      await loadPersonalEvents();
    } catch (err) {
      showCalError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function askDeletePersonal(id) {
    setDeleteFn(() => async () => {
      try {
        await apiRequest(`MentorSchedule/${id}`, 'DELETE', null, true);
        await loadPersonalEvents();
      } catch (err) {
        showCalError('Failed to delete. Please try again.');
      }
    });
  }

  // ── calendar grid ──
  const today = new Date();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMo = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevDays = new Date(viewYear, viewMonth, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ d: prevDays - i, m: viewMonth - 1, y: viewYear, other: true });
  for (let d = 1; d <= daysInMo; d++) cells.push({ d, m: viewMonth, y: viewYear, other: false });
  while (cells.length < 42) cells.push({ d: cells.length - firstDay - daysInMo + 1, m: viewMonth + 1, y: viewYear, other: true });

  const grid = loaded ? cells.map(({ d, m, y, other }, idx) => {
    let nm = m, ny = y;
    if (nm < 0) { nm = 11; ny--; }
    if (nm > 11) { nm = 0; ny++; }
    const isToday = !other && d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
    const isSelected = selectedDay && !other && d === selectedDay.day && viewMonth === selectedDay.month && viewYear === selectedDay.year;
    const dayEvents = other ? [] : eventsOnDay(ny, nm, d);
    const bars = [...new Map(dayEvents.map(e => [`${e.source}:${e.kind}`, e])).values()].slice(0, 3);
    const more = Math.max(0, dayEvents.length - bars.length);
    const cls = ['cal-day', other ? 'other-month' : '', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
    return (
      <div className={cls} key={idx} onClick={other ? undefined : () => selectDay(ny, nm, d)}>
        <div className="cal-day-num">{d}</div>
        <div className="cal-day-events">
          {bars.map(e => {
            const label = e.source === 'program' ? (e.kind || 'Event')
              : e.source === 'availability' ? `Availability - ${availabilityLabel(e.raw)}`
              : e.origin === 'personal' ? 'My Sessions — Note' : `Session — ${e.kind || 'Scheduled'}`;
            return <div className={`cal-day-bar ${barClassFor(e)}`} role="img" aria-label={`${label}: ${e.title || ''}`} title={e.title || ''} key={`${e.source}:${e.kind}`}></div>;
          })}
          {more > 0 ? <div className="cal-more">+{more}</div> : null}
        </div>
      </div>
    );
  }) : null;

  // ── sidebar ──
  let events = [], sidebarTitle = 'Events', sidebarSub = '';
  if (loaded) {
    if (selectedDay) {
      const { year, month, day } = selectedDay;
      events = eventsOnDay(year, month, day);
      sidebarTitle = new Date(year, month, day).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
    } else {
      events = eventsInViewMonth();
      sidebarTitle = `${MONTHS[viewMonth]} ${viewYear}`;
    }
    sidebarSub = `${events.length} event${events.length !== 1 ? 's' : ''}`;
  }

  const renderProgramCard = (ev, key) => {
    const cfg = TYPE_CONFIG[ev.eventType] || TYPE_CONFIG['Session Schedule'];
    return (
      <div className={`cal-event-card ${cfg.cls}`} key={key}>
        <div className="cal-event-top"><div className="cal-event-title">{ev.title}</div></div>
        <div className="cal-event-dates">{CalIcon}{fmtDateRange(ev.startDate, ev.endDate)}</div>
        <span className={`cal-event-badge ${cfg.badgeCls}`}>{ev.eventType}</span>
        {ev.venue ? (
          <div className="cal-event-venue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            {ev.venue.replace(/\|/g, ' · ')}
          </div>
        ) : null}
        {ev.description ? <div className="cal-event-desc">{ev.description}</div> : null}
      </div>
    );
  };
  const renderLoggedSessionCard = (s, key) => {
    const title = stripSectionPrefix(s.topic) || s.slotName || 'Mentoring Session';
    const status = s.sessionStatus || 'Scheduled';
    const cancelled = status === 'Cancelled';
    return (
      <div className={`cal-event-card my-session${cancelled ? ' cancelled' : ''}`} key={key}>
        <div className="cal-event-top">
          <div className="cal-event-title">{title}</div>
          <div className="cal-event-actions" style={{ opacity: 1 }}>
            <Link className="cal-action-btn" title="View in Sessions" to="/mentor/sessions" style={{ display: 'inline-flex' }}>{ArrowIcon}</Link>
          </div>
        </div>
        <div className="cal-event-dates">{CalIcon}{fmtDate(s.sessionDate)}</div>
        <span className={`cal-event-badge badge-my-session ${['Cancelled', 'Completed', 'Scheduled', 'Pending'].includes(status) ? 'session-status-' + status.toLowerCase() : ''}`}>{status}</span>
        {s.sectionCode ? <span className="cal-event-badge badge-section">{s.sectionCode}</span> : null}
      </div>
    );
  };
  const renderPersonalCard = (ev, key) => (
    <div className="cal-event-card my-session" key={key}>
      <div className="cal-event-top">
        <div className="cal-event-title">{ev.title}</div>
        <div className="cal-event-actions">
          <button className="cal-action-btn" title="Edit" onClick={() => openPersonalModal(ev.eventID)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </button>
          <button className="cal-action-btn delete" title="Delete" onClick={() => askDeletePersonal(ev.eventID)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
          </button>
        </div>
      </div>
      <div className="cal-event-dates">{CalIcon}{fmtDateRange(ev.eventDate, ev.endDate)}</div>
      <span className="cal-event-badge badge-my-session">Note</span>
      {ev.notes ? <div className="cal-event-desc">{ev.notes}</div> : null}
    </div>
  );
  // Read-only: managing (posting, deleting) a slot stays on the Availability page.
  const renderAvailabilityCard = (slot, key) => (
    <div className="cal-event-card availability" key={key}>
      <div className="cal-event-top">
        <div className="cal-event-title">{slot.slotName || 'Availability Slot'}</div>
        <div className="cal-event-actions" style={{ opacity: 1 }}>
          <Link className="cal-action-btn" title="Manage in Availability" to="/mentor/availability" style={{ display: 'inline-flex' }}>{ArrowIcon}</Link>
        </div>
      </div>
      <div className="cal-event-dates">{CalIcon}{fmtDateRange(slot.availableDate, slot.availableDate)} &middot; {fmtSlotTime(slot.startTime)}</div>
      {!slot.isClosed ? <span className="cal-event-badge badge-availability">{availabilityLabel(slot)}</span> : null}
      {slot.isClosed ? <span className="cal-event-badge badge-late" title="Session window is closed">Closed</span> : null}
      {slot.approvedMentees ? <div className="cal-event-desc"><i className="ti ti-user-check"></i> {slot.approvedMentees}</div> : null}
    </div>
  );

  let sidebarList;
  if (!loaded) sidebarList = <div className="cal-loading"><span className="spinner"></span> Loading…</div>;
  else if (!events.length) {
    sidebarList = (
      <div className="cal-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <p>{selectedDay ? 'No events on this day.' : 'No events this month.'}</p>
      </div>
    );
  } else {
    sidebarList = events.map((e, i) => {
      const key = `${e.source}-${e.origin || ''}-${e.raw.eventID ?? e.raw.sessionID ?? e.raw.availabilityID ?? i}`;
      if (e.source === 'program') return renderProgramCard(e.raw, key);
      if (e.source === 'availability') return renderAvailabilityCard(e.raw, key);
      return e.origin === 'personal' ? renderPersonalCard(e.raw, key) : renderLoggedSessionCard(e.raw, key);
    });
  }

  return (
    <Page id="MENTOR/calendar">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Calendar</h1>
              <p>Program schedule and your logged mentoring sessions — all in one view</p>
            </div>
          </div>

          <div className="cal-toolbar">
            <div className="cal-toolbar-left">
              <div className="ev-legend">
                <button type="button" className={`ev-legend-group${sourceVisible.program ? ' active' : ''}`} id="srcToggle-program" onClick={() => toggleSource('program')}>
                  <span className="ev-legend-group-title">Program</span>
                  <span className="ev-legend-dots">
                    <span className="ev-dot session"></span><span className="ev-dot deadline"></span>
                    <span className="ev-dot exam"></span><span className="ev-dot evaluation"></span>
                  </span>
                </button>
                <button type="button" className={`ev-legend-group${sourceVisible.sessions ? ' active' : ''}`} id="srcToggle-sessions" onClick={() => toggleSource('sessions')}>
                  <span className="ev-legend-group-title">My Sessions</span>
                  <span className="ev-legend-dots"><span className="ev-dot my-session"></span></span>
                </button>
                <button type="button" className={`ev-legend-group${sourceVisible.availability ? ' active' : ''}`} id="srcToggle-availability" onClick={() => toggleSource('availability')}>
                  <span className="ev-legend-group-title">Availability</span>
                  <span className="ev-legend-dots"><span className="ev-dot availability"></span></span>
                </button>
              </div>
            </div>
            <div className="cal-toolbar-right">
              <div className="cal-search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input type="text" id="calSearch" placeholder="Search…" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {/* Applies to Program events only */}
              <Select className="cal-type-filter" id="typeFilter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">All Types</option>
                <option value="Session Schedule">Session Schedule</option>
                <option value="Deadline">Deadline</option>
                <option value="Period">Period</option>
                <option value="Evaluation">Evaluation</option>
              </Select>
              <button className="btn-export-cal" id="exportBtn" onClick={exportCalendar}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                Print / Export
              </button>
            </div>
          </div>

          <div className="cal-layout">
            <div className="cal-panel">
              <div className="cal-header">
                <button className="cal-nav-btn" id="prevMonth" onClick={prevMonth}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span className="cal-month-label" id="calMonthLabel">{loaded ? `${MONTHS[viewMonth]} ${viewYear}` : ''}</span>
                <button className="cal-nav-btn" id="nextMonth" onClick={nextMonth}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
              <div className="cal-dow-row">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div className="cal-dow" key={d}>{d}</div>)}
              </div>
              <div className="cal-grid" id="calGrid">{grid}</div>
            </div>

            <div className="cal-right-panel">
              <div className="cal-sidebar-header">
                <div>
                  <div className="cal-sidebar-title" id="sidebarTitle">{sidebarTitle}</div>
                  <div className="cal-sidebar-sub" id="sidebarSub">{sidebarSub}</div>
                </div>
                <button className="cal-sidebar-clear" id="clearSelection" style={{ display: selectedDay && loaded ? 'inline-block' : 'none' }} onClick={() => setSelectedDay(null)}>Show all</button>
              </div>
              <div className="cal-events-list" id="calEventsList">{sidebarList}</div>
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Add / Edit My Sessions */}
      <Overlay open={editing !== null} className="cal-modal-overlay" activeClass="active" id="personalModalOverlay"
        onClick={e => { if (e.target === e.currentTarget) closePersonalModal(); }}>
        <div className="cal-modal">
          <div className="cal-modal-header">
            <h3 id="personalModalTitle">Edit My Sessions Note</h3>
            <button className="cal-modal-close" id="personalModalClose" onClick={closePersonalModal}>&times;</button>
          </div>
          <div className="cal-modal-body">
            <div className="form-group">
              <label>Title <span className="req">*</span></label>
              <input type="text" id="pFieldTitle" placeholder="e.g. Prep notes for Before Midterms" autoComplete="off" autoFocus value={pTitle} onChange={e => setPTitle(e.target.value)} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Start Date <span className="req">*</span></label>
                <DateInput type="date" id="pFieldDate" min={dateMin} value={pDate} onChange={e => setPDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>End Date <span className="optional">(leave blank if one day)</span></label>
                <DateInput type="date" id="pFieldEndDate" min={pDate || dateMin} value={pEnd} onChange={e => setPEnd(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Description <span className="optional">(optional)</span></label>
              <textarea id="pFieldNotes" rows="3" placeholder="Additional details…" value={pNotes} onChange={e => setPNotes(e.target.value)}></textarea>
            </div>
          </div>
          <div className="cal-modal-footer">
            <button className="btn-cal-outline" id="personalModalCancel" onClick={closePersonalModal}>Cancel</button>
            <button className="btn-cal-primary" id="personalModalSave" onClick={savePersonalEvent} disabled={saving}>{saving ? 'Saving…' : 'Update'}</button>
          </div>
        </div>
      </Overlay>

      {/* Error Modal */}
      <Overlay open={errorMsg !== null} className="modal-overlay" activeClass="open" id="calErrorModal"
        onClick={e => { if (e.target === e.currentTarget) setErrorMsg(null); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-danger"><i className="ti ti-alert-circle"></i></div>
          <h3 className="confirm-title">Something went wrong</h3>
          <p className="confirm-body" id="calErrorMessage">{errorMsg ?? 'An error occurred.'}</p>
          <div className="confirm-actions">
            <button className="btn-confirm-primary" onClick={() => setErrorMsg(null)}>OK</button>
          </div>
        </div>
      </Overlay>

      {/* Confirm Delete Modal */}
      <Overlay open={!!deleteFn} className="modal-overlay" activeClass="open" id="calConfirmModal"
        onClick={e => { if (e.target === e.currentTarget) setDeleteFn(null); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-danger"><i className="ti ti-trash"></i></div>
          <h3 className="confirm-title">Delete Entry</h3>
          <p className="confirm-body">Are you sure you want to delete this? This cannot be undone.</p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => setDeleteFn(null)}>Cancel</button>
            <button className="btn-confirm-danger" id="calConfirmDeleteBtn" onClick={() => { const fn = deleteFn; setDeleteFn(null); fn(); }}><i className="ti ti-trash"></i> Delete</button>
          </div>
        </div>
      </Overlay>
    </Page>
  );
}
