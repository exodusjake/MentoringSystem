import { useEffect, useMemo, useState } from 'react';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { buildCalendarSheetPrintHtml, fetchCalendarSheetData, openCalendarSheetPrintWindow } from '../../lib/calendar-sheet.js';
import { sanitizeHtml } from '../../lib/security-utils.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EVENT_TYPES = ['Session Schedule', 'Deadline', 'Period', 'Evaluation'];
const TYPE_CONFIG = {
  'Session Schedule': { cls: 'session', bg: '#eff6ff', fg: '#1d4ed8' },
  Deadline: { cls: 'deadline', bg: '#fffbeb', fg: '#92400e' },
  Period: { cls: 'exam', bg: '#fef2f2', fg: '#991b1b' },
  Evaluation: { cls: 'evaluation', bg: '#f0fdf4', fg: '#065f46' },
};

function eventValue(event, lower, upper) {
  return event[lower] ?? event[upper];
}

function parseDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateRange(startValue, endValue) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start) return '—';
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  const startText = start.toLocaleDateString('en-PH', options);
  if (!end || toIsoDate(start) === toIsoDate(end)) return startText;
  const endText = start.getFullYear() === end.getFullYear()
    ? end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : end.toLocaleDateString('en-PH', options);
  return `${startText} – ${endText}`;
}

function dateIsWithin(event, date) {
  const start = parseDate(eventValue(event, 'startDate', 'StartDate'));
  const end = parseDate(eventValue(event, 'endDate', 'EndDate'));
  return start && end && date >= start && date <= end;
}

function EventCard({ event }) {
  const title = eventValue(event, 'title', 'Title') || 'Untitled';
  const type = eventValue(event, 'eventType', 'EventType') || 'Session Schedule';
  const description = eventValue(event, 'description', 'Description') || '';
  const venue = eventValue(event, 'venue', 'Venue') || '';
  const config = TYPE_CONFIG[type] || TYPE_CONFIG['Session Schedule'];

  return (
    <div className={`cal-event-card ${config.cls}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{title}</div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0, background: config.bg, color: config.fg }}>{type}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', marginBottom: venue || description ? 6 : 0 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {formatDateRange(eventValue(event, 'startDate', 'StartDate'), eventValue(event, 'endDate', 'EndDate'))}
      </div>
      {venue && (
        <div className="cal-event-venue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
          {venue}
        </div>
      )}
      {description && <div style={{ fontSize: 13, color: '#4b5563', marginTop: 6, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }} />}
    </div>
  );
}

function ErrorDialog({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(15, 23, 42, .55)' }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="cal-error-title" aria-describedby="cal-error-message"
        style={{ width: 'min(100%, 420px)', padding: 24, borderRadius: 16, background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div className="cal-info-modal-icon danger" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </div>
        <h3 className="cal-info-modal-title" id="cal-error-title">Something went wrong</h3>
        <p className="cal-info-modal-message" id="cal-error-message">{message}</p>
        <button className="btn-cal-primary" onClick={onClose} style={{ width: '100%' }}>OK</button>
      </div>
    </div>
  );
}

export default function HeadCalendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [selectedDay, setSelectedDay] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    apiRequest('CalendarEvents', 'GET', null, true)
      .then(data => {
        if (alive) setEvents((Array.isArray(data) ? data : []).filter(event => event.isPublished || event.IsPublished));
      })
      .catch(err => {
        console.error('Calendar load error:', err);
        if (alive) {
          setLoadFailed(true);
          setError('Failed to load events. Please refresh.');
        }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter(event => {
      const title = String(eventValue(event, 'title', 'Title') || '').toLowerCase();
      const type = eventValue(event, 'eventType', 'EventType') || '';
      return (!normalizedQuery || title.includes(normalizedQuery)) && (!typeFilter || type === typeFilter);
    });
  }, [events, query, typeFilter]);

  const monthEvents = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const last = new Date(view.year, view.month + 1, 0);
    return filteredEvents
      .filter(event => {
        const start = parseDate(eventValue(event, 'startDate', 'StartDate'));
        const end = parseDate(eventValue(event, 'endDate', 'EndDate'));
        return start && end && start <= last && end >= first;
      })
      .sort((a, b) => parseDate(eventValue(a, 'startDate', 'StartDate')) - parseDate(eventValue(b, 'startDate', 'StartDate')));
  }, [filteredEvents, view]);

  const selectedEvents = selectedDay
    ? filteredEvents.filter(event => dateIsWithin(event, new Date(selectedDay.year, selectedDay.month, selectedDay.day)))
    : monthEvents;
  const sidebarTitle = selectedDay
    ? new Date(selectedDay.year, selectedDay.month, selectedDay.day).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
    : `${MONTHS[view.month]} ${view.year}`;

  const cells = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const gridStart = new Date(view.year, view.month, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      return { date, otherMonth: date.getMonth() !== view.month };
    });
  }, [view]);

  function changeMonth(offset) {
    setView(current => {
      const date = new Date(current.year, current.month + offset, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
    setSelectedDay(null);
  }

  async function exportCalendar() {
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) {
      setError('Pop-up blocked. Please allow pop-ups for this page.');
      return;
    }
    try {
      const data = await fetchCalendarSheetData();
      const html = buildCalendarSheetPrintHtml({ ...data, events });
      if (!openCalendarSheetPrintWindow(html, popup)) setError('Pop-up blocked. Please allow pop-ups for this page.');
    } catch (err) {
      console.error('Calendar export error:', err);
      popup.close();
      setError('Failed to prepare the calendar for printing. Please try again.');
    }
  }

  return (
    <Page id="HEAD/calendar">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Calendar</h1>
              <p>Academic schedule — published by Admin, view-only</p>
            </div>
          </div>

          <div id="pane-program" className="cal-pane">
            <div className="cal-toolbar">
              <div className="cal-toolbar-left">
                <div className="ev-legend">
                  <div className="ev-legend-item"><span className="ev-dot session" />Session Schedule</div>
                  <div className="ev-legend-item"><span className="ev-dot deadline" />Deadline</div>
                  <div className="ev-legend-item"><span className="ev-dot exam" />Period</div>
                  <div className="ev-legend-item"><span className="ev-dot evaluation" />Evaluation</div>
                </div>
              </div>
              <div className="cal-toolbar-right">
                <div className="cal-search-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input type="text" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search events…" autoComplete="off" aria-label="Search events" />
                </div>
                <Select className="cal-type-filter" value={typeFilter} onChange={event => setTypeFilter(event.target.value)} aria-label="Filter event type">
                  <option value="">All Types</option>
                  {EVENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </Select>
                <button className="btn-export-cal" onClick={exportCalendar}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print / Export
                </button>
              </div>
            </div>

            <div className="cal-layout">
              <div className="cal-panel">
                <div className="cal-header">
                  <button className="cal-nav-btn" onClick={() => changeMonth(-1)} aria-label="Previous month">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <span className="cal-month-label">{MONTHS[view.month]} {view.year}</span>
                  <button className="cal-nav-btn" onClick={() => changeMonth(1)} aria-label="Next month">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
                <div className="cal-dow-row">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div className="cal-dow" key={day}>{day}</div>)}
                </div>
                <div className="cal-grid">
                  {cells.map(({ date, otherMonth }) => {
                    const isToday = !otherMonth && toIsoDate(date) === toIsoDate(new Date());
                    const isSelected = selectedDay && !otherMonth && selectedDay.day === date.getDate() && selectedDay.month === date.getMonth() && selectedDay.year === date.getFullYear();
                    const dayEvents = otherMonth ? [] : filteredEvents.filter(event => dateIsWithin(event, date));
                    const bars = [...new Map(dayEvents.map(event => [eventValue(event, 'eventType', 'EventType'), event])).values()].slice(0, 3);
                    const more = Math.max(0, dayEvents.length - bars.length);
                    const className = ['cal-day', otherMonth ? 'other-month' : '', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
                    return (
                      <div key={toIsoDate(date)} className={className}
                        onClick={otherMonth ? undefined : () => setSelectedDay(current => isSelected ? null : { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() })}
                        onKeyDown={otherMonth ? undefined : event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedDay(current => isSelected ? null : { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() }); } }}
                        role={otherMonth ? undefined : 'button'} tabIndex={otherMonth ? undefined : 0}>
                        <div className="cal-day-num">{date.getDate()}</div>
                        <div className="cal-day-events">
                          {bars.map((event, index) => {
                            const type = eventValue(event, 'eventType', 'EventType') || 'Event';
                            const title = eventValue(event, 'title', 'Title') || '';
                            const config = TYPE_CONFIG[type] || TYPE_CONFIG['Session Schedule'];
                            return <div key={`${type}-${index}`} className={`cal-day-bar ${config.cls}`} role="img" aria-label={`${type}: ${title}`} title={title} />;
                          })}
                          {more > 0 && <div className="cal-more">+{more}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="cal-right-panel">
                <div className="cal-sidebar-header">
                  <div>
                    <div className="cal-sidebar-title">{loading ? 'Loading…' : sidebarTitle}</div>
                    <div className="cal-sidebar-sub">{loading ? '' : `${selectedEvents.length} event${selectedEvents.length !== 1 ? 's' : ''}`}</div>
                  </div>
                  {selectedDay && <button className="cal-sidebar-clear" onClick={() => setSelectedDay(null)}>Show all</button>}
                </div>
                <div className="cal-events-list">
                  {loading
                    ? <div className="cal-loading"><i className="ti ti-loader-2" /> Loading events…</div>
                    : loadFailed
                      ? <Empty className="cal-empty"><p>Failed to load events. Please refresh.</p></Empty>
                      : selectedEvents.length
                        ? selectedEvents.map((event, index) => <EventCard key={`${eventValue(event, 'eventID', 'EventID') ?? index}`} event={event} />)
                        : <Empty className="cal-empty"><p>No published events{selectedDay ? ' on this day' : ' this month'}.</p></Empty>}
                </div>
              </div>
            </div>
          </div>
        </main>
        <footer><p>&copy; 2026 AstraMentoring. All rights reserved.</p></footer>
      </div>
      <ErrorDialog message={error} onClose={() => setError('')} />
    </Page>
  );
}
