import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import { ConfirmX } from '../../components/ConfirmX.jsx';
import DateInput from '../../components/DateInput.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { buildCalendarSheetPrintHtml, fetchCalendarSheetData, openCalendarSheetPrintWindow } from '../../lib/calendar-sheet.js';
import { sanitizeHtml } from '../../lib/security-utils.js';
import { getSession } from '../../lib/session.js';
import { useStayOnBack } from './useStayOnBack.js';

// Calendar (MENTOR/HTML/calendar.html + calendar.js): one merged calendar of the Admin-published
// Program events, this mentor's logged sessions and saved notes ("My Sessions"), and their
// Availability slots.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseDate(isoStr) {
  if (!isoStr) return null;
  const [y, m, d] = isoStr.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function fmtDate(isoStr) {
  const d = parseDate(isoStr);
  if (!d) return '—';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateRange(startIso, endIso) {
  const s = parseDate(startIso), e = parseDate(endIso);
  if (!s) return '—';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const sStr = s.toLocaleDateString('en-PH', opts);
  if (!e || toIsoDate(s) === toIsoDate(e)) return sStr;
  const eStr = s.getFullYear() === e.getFullYear() ? e.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : e.toLocaleDateString('en-PH', opts);
  return `${sStr} – ${eStr}`;
}
function fmtSlotTime(t) {
  if (!t) return '—';
  const [h, m] = t.toString().split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}
// A session's topic can carry a legacy "[SECTION] " prefix; the section is shown as its own badge.
const stripSectionPrefix = topic => (topic || '').replace(/^\[[^\]]+\]\s*/, '');
function availabilityLabel(slot) {
  if (slot.isClosed) return 'Closed';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return String(slot.availableDate || '').slice(0, 10) < today ? 'Past' : 'Open';
}

const TYPE_CONFIG = {
  'Session Schedule': { cls: 'session', badgeCls: 'badge-session' },
  'Deadline': { cls: 'deadline', badgeCls: 'badge-deadline' },
  'Period': { cls: 'exam', badgeCls: 'badge-exam' },
  'Evaluation': { cls: 'evaluation', badgeCls: 'badge-evaluation' },
};
function barClassFor(e) {
  if (e.source === 'program') return (TYPE_CONFIG[e.kind] || TYPE_CONFIG['Session Schedule']).cls;
  if (e.source === 'availability') return e.raw.isClosed ? 'availability late' : 'availability';
  return e.kind === 'Cancelled' ? 'my-session cancelled' : 'my-session';
}

const CAL_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
const ARROW_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg>;

export default function MentorCalendar() {
  useStayOnBack();
  const navigate = useNavigate();
  const [user] = useState(() => getSession()?.user);
  const [data, setData] = useState(null);     // { events, sessions, notes, slots } once loaded
  const [view, setView] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [selectedDay, setSelectedDay] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [visible, setVisible] = useState({ program: true, sessions: true, availability: true });
  const [error, setError] = useState({ open: false, message: 'An error occurred.' });
  const [confirmDelete, setConfirmDelete] = useState(null);   // { open, id }
  // My Sessions note editor. The calendar creates no new notes; existing ones can be edited.
  const [note, setNote] = useState({ open: false, id: null, title: '', date: '', endDate: '', notes: '', heading: 'Edit My Sessions Note', saveText: 'Save', saving: false });
  const titleRef = useRef(null);

  const showCalError = message => setError({ open: true, message });

  async function loadNotes() {
    if (!user?.userID) return [];
    try {
      return await apiRequest(`MentorSchedule?mentorId=${user.userID}`, 'GET', null, true) || [];
    } catch (e) {
      console.error('Failed to load My Sessions notes:', e);
      showCalError('Failed to load your saved notes. Please refresh.');
      return null;
    }
  }

  useEffect(() => {
    const id = user?.userID;
    const program = apiRequest('CalendarEvents', 'GET', null, true)
      .then(all => (all || []).filter(ev => ev.isPublished == null || !!ev.isPublished))
      .catch(e => { console.error('Failed to load program events:', e); showCalError('Failed to load the program calendar. Please refresh.'); return []; });
    const sessions = !id ? Promise.resolve([]) : apiRequest(`SessionsAdmin/${id}/sessions`, 'GET', null, true)
      .then(d => d?.sessions || [])
      .catch(e => { console.error('Failed to load logged sessions:', e); showCalError('Failed to load your logged sessions. Please refresh.'); return []; });
    // Every slot not tied to a cancelled or deleted session; once someone books, the resulting
    // session shows separately under "My Sessions".
    const slots = !id ? Promise.resolve([]) : apiRequest(`AvailabilityWorkflow/mentor/${id}/slots`, 'GET', null, true)
      .then(d => {
        const seen = new Set();
        return (Array.isArray(d) ? d : []).filter(s => s.linkedSessionStatus !== 'Cancelled' && (s.linkedSessionID || !s.approvedMentees) && !seen.has(s.availabilityID) && seen.add(s.availabilityID));
      })
      .catch(e => { console.error('Failed to load availability slots:', e); showCalError('Failed to load your availability slots. Please refresh.'); return []; });
    Promise.all([program, sessions, loadNotes(), slots]).then(([events, sess, notes, sl]) =>
      setData({ events, sessions: sess, notes: notes || [], slots: sl }));
  }, []);

  // Both sources in one shape: { source, kind, title, start, end, raw }.
  function normalizedEvents() {
    const out = [];
    const q = query.trim().toLowerCase();
    if (visible.program) {
      data.events.forEach(ev => {
        if (q && !(ev.title || '').toLowerCase().includes(q)) return;
        if (typeFilter && ev.eventType !== typeFilter) return;
        const start = parseDate(ev.startDate);
        const end = parseDate(ev.endDate) || start;
        if (!start) return;
        out.push({ source: 'program', kind: ev.eventType, title: ev.title, start, end, raw: ev });
      });
    }
    if (visible.sessions) {
      data.sessions.forEach(s => {
        const title = stripSectionPrefix(s.topic) || s.slotName || 'Mentoring Session';
        if (q && !title.toLowerCase().includes(q)) return;
        const start = parseDate(s.sessionDate);
        if (!start) return;
        out.push({ source: 'session', origin: 'logged', kind: s.sessionStatus, title, start, end: start, raw: s });
      });
      data.notes.forEach(ev => {
        if (q && !(ev.title || '').toLowerCase().includes(q)) return;
        const start = parseDate(ev.eventDate);
        const end = parseDate(ev.endDate) || start;
        if (!start) return;
        out.push({ source: 'session', origin: 'personal', kind: 'Personal', title: ev.title, start, end, raw: ev });
      });
    }
    if (visible.availability) {
      data.slots.forEach(slot => {
        const start = parseDate(slot.availableDate);
        if (!start) return;
        const title = slot.slotName || fmtSlotTime(slot.startTime);
        if (q && !title.toLowerCase().includes(q)) return;
        out.push({ source: 'availability', kind: availabilityLabel(slot), title, start, end: start, raw: slot });
      });
    }
    return out;
  }

  const all = data ? normalizedEvents() : [];
  const eventsOnDay = (y, m, d) => { const t = new Date(y, m, d); return all.filter(e => t >= e.start && t <= e.end); };

  function selectDay(y, m, d) {
    setSelectedDay(s => s && s.year === y && s.month === m && s.day === d ? null : { year: y, month: m, day: d });
  }
  function shiftMonth(dir) {
    setView(v => {
      let m = v.m + dir, y = v.y;
      if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
      return { y, m };
    });
    setSelectedDay(null);
  }

  async function exportCalendar() {
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) { showCalError('Pop-up blocked. Please allow pop-ups for this page.'); return; }
    const sheet = await fetchCalendarSheetData();
    // Prints only the official Program Calendar.
    const html = buildCalendarSheetPrintHtml({ ...sheet, events: data?.events || [] });
    if (!openCalendarSheetPrintWindow(html, popup)) showCalError('Pop-up blocked. Please allow pop-ups for this page.');
  }

  function openNote(id) {
    const ev = data.notes.find(e => e.eventID === id);
    if (!ev) return;
    const sIso = ev.eventDate?.split('T')[0] || '';
    const eIso = ev.endDate?.split('T')[0] || '';
    setNote({ open: true, id, title: ev.title, date: sIso, endDate: eIso && eIso !== sIso ? eIso : '', notes: ev.notes || '', heading: 'Edit My Sessions Note', saveText: 'Update', saving: false });
  }
  useEffect(() => { if (note.open) titleRef.current?.focus(); }, [note.open, note.id]);
  const closeNote = () => setNote(n => ({ ...n, open: false, id: null }));

  async function saveNote() {
    if (!note.id) return;
    const title = note.title.trim();
    const date = note.date;
    const end = note.endDate || date;
    if (!title) { showCalError('Please enter a title.'); return; }
    if (!date) { showCalError('Please select a start date.'); return; }
    if (end < date) { showCalError('End date cannot be before the start date.'); return; }
    setNote(n => ({ ...n, saving: true }));
    const payload = { mentorID: user.userID, title, eventDate: date + 'T00:00:00', endDate: end + 'T00:00:00', category: 'Personal', notes: note.notes.trim() || null };
    try {
      await apiRequest(`MentorSchedule/${note.id}`, 'PUT', { ...payload, eventID: note.id }, true);
      // Closing clears the note being edited, so the button reads "Save" afterwards (as before).
      setNote(n => ({ ...n, open: false, id: null, saving: false, saveText: 'Save' }));
      const notes = await loadNotes();
      if (notes) setData(d => ({ ...d, notes }));
    } catch (err) {
      showCalError(err.message || 'Failed to save. Please try again.');
      setNote(n => ({ ...n, saving: false }));
    }
  }

  async function deleteNote(id) {
    try {
      await apiRequest(`MentorSchedule/${id}`, 'DELETE', null, true);
      const notes = await loadNotes();
      if (notes) setData(d => ({ ...d, notes }));
    } catch {
      showCalError('Failed to delete. Please try again.');
    }
  }

  // ── Grid ──
  let grid = null, sidebar = null;
  if (data) {
    const today = new Date();
    const { y: viewYear, m: viewMonth } = view;
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMo = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();
    const cells = [];
    for (let i = firstDay - 1; i >= 0; i--) cells.push({ d: prevDays - i, m: viewMonth - 1, y: viewYear, other: true });
    for (let d = 1; d <= daysInMo; d++) cells.push({ d, m: viewMonth, y: viewYear, other: false });
    while (cells.length < 42) cells.push({ d: cells.length - firstDay - daysInMo + 1, m: viewMonth + 1, y: viewYear, other: true });

    grid = cells.map(({ d, m, y, other }, i) => {
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
        <div key={i} className={cls} onClick={other ? undefined : () => selectDay(ny, nm, d)}>
          <div className="cal-day-num">{d}</div>
          <div className="cal-day-events">
            {bars.map((e, j) => {
              const label = e.source === 'program' ? (e.kind || 'Event')
                : e.source === 'availability' ? `Availability - ${availabilityLabel(e.raw)}`
                  : e.origin === 'personal' ? 'My Sessions — Note' : `Session — ${e.kind || 'Scheduled'}`;
              return <div key={j} className={`cal-day-bar ${barClassFor(e)}`} role="img" aria-label={`${label}: ${e.title || ''}`} title={e.title || ''}></div>;
            })}
            {more > 0 && <div className="cal-more">+{more}</div>}
          </div>
        </div>
      );
    });

    let events;
    if (selectedDay) {
      events = eventsOnDay(selectedDay.year, selectedDay.month, selectedDay.day);
    } else {
      const first = new Date(viewYear, viewMonth, 1), last = new Date(viewYear, viewMonth + 1, 0);
      // Most recent first, like a feed.
      events = all.filter(e => e.start <= last && e.end >= first).sort((a, b) => b.start - a.start);
    }
    sidebar = {
      title: selectedDay
        ? new Date(selectedDay.year, selectedDay.month, selectedDay.day).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
        : `${MONTHS[viewMonth]} ${viewYear}`,
      sub: `${events.length} event${events.length !== 1 ? 's' : ''}`,
      list: events.length
        ? events.map((e, i) => e.source === 'program' ? <ProgramCard key={i} ev={e.raw} />
          : e.source === 'availability' ? <AvailabilityCard key={i} slot={e.raw} onOpen={() => navigate('/mentor/availability')} />
            : e.origin === 'personal' ? <NoteCard key={i} ev={e.raw} onEdit={() => openNote(e.raw.eventID)} onDelete={() => setConfirmDelete({ open: true, id: e.raw.eventID })} />
              : <LoggedSessionCard key={i} s={e.raw} onOpen={() => navigate('/mentor/sessions')} />)
        : (
          <Empty key={selectedDay ? 'day' : 'month'} className="cal-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {' '}
            <p>{selectedDay ? 'No events on this day.' : 'No events this month.'}</p>
          </Empty>
        ),
    };
  }

  const toggle = source => setVisible(v => ({ ...v, [source]: !v[source] }));
  const legendBtn = (source, title, dots) => (
    <button type="button" className={'ev-legend-group' + (visible[source] ? ' active' : '')} id={`srcToggle-${source}`} onClick={() => data && toggle(source)}>
      <span className="ev-legend-group-title">{title}</span>
      {' '}
      <span className="ev-legend-dots">{dots}</span>
    </button>
  );

  return (
    <Page id="MENTOR/calendar">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Calendar</h1>
              {' '}
              <p>Program schedule and your logged mentoring sessions — all in one view</p>
            </div>
          </div>
          {' '}
          <div className="cal-toolbar">
            <div className="cal-toolbar-left">
              <div className="ev-legend">
                {legendBtn('program', 'Program', <>
                  <span className="ev-dot session"></span><span className="ev-dot deadline"></span>
                  {' '}
                  <span className="ev-dot exam"></span><span className="ev-dot evaluation"></span>
                </>)}
                {' '}
                {legendBtn('sessions', 'My Sessions', <span className="ev-dot my-session"></span>)}
                {' '}
                {legendBtn('availability', 'Availability', <span className="ev-dot availability"></span>)}
              </div>
            </div>
            {' '}
            <div className="cal-toolbar-right">
              <div className="cal-search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                {' '}
                <input type="text" id="calSearch" placeholder="Search…" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              {' '}
              {/* Applies to Program events only */}
              <Select className="cal-type-filter" id="typeFilter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">All Types</option>
                <option value="Session Schedule">Session Schedule</option>
                <option value="Deadline">Deadline</option>
                <option value="Period">Period</option>
                <option value="Evaluation">Evaluation</option>
              </Select>
              {' '}
              <button className="btn-export-cal" id="exportBtn" onClick={() => data && exportCalendar()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                {' '}Print / Export
              </button>
            </div>
          </div>
          {' '}
          <div className="cal-layout">
            <div className="cal-panel">
              <div className="cal-header">
                <button className="cal-nav-btn" id="prevMonth" onClick={() => data && shiftMonth(-1)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                {' '}
                <span className="cal-month-label" id="calMonthLabel">{data ? `${MONTHS[view.m]} ${view.y}` : ''}</span>
                {' '}
                <button className="cal-nav-btn" id="nextMonth" onClick={() => data && shiftMonth(1)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
              {' '}
              <div className="cal-dow-row">
                <div className="cal-dow">Sun</div><div className="cal-dow">Mon</div>
                {' '}
                <div className="cal-dow">Tue</div><div className="cal-dow">Wed</div>
                {' '}
                <div className="cal-dow">Thu</div><div className="cal-dow">Fri</div>
                {' '}
                <div className="cal-dow">Sat</div>
              </div>
              {' '}
              <div className="cal-grid" id="calGrid">{grid}</div>
            </div>
            {' '}
            <div className="cal-right-panel">
              <div className="cal-sidebar-header">
                <div>
                  <div className="cal-sidebar-title" id="sidebarTitle">{sidebar ? sidebar.title : 'Events'}</div>
                  {' '}
                  <div className="cal-sidebar-sub" id="sidebarSub">{sidebar ? sidebar.sub : ''}</div>
                </div>
                {' '}
                <button className="cal-sidebar-clear" id="clearSelection" style={{ display: selectedDay ? 'inline-block' : 'none' }} onClick={() => setSelectedDay(null)}>Show all</button>
              </div>
              {' '}
              <div className="cal-events-list" id="calEventsList">
                {sidebar ? sidebar.list : <div className="cal-loading"><span className="spinner"></span>{' '}Loading…</div>}
              </div>
            </div>
          </div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Edit My Sessions note */}
      <div className={'cal-modal-overlay' + (note.open ? ' active' : '')} id="personalModalOverlay" onClick={e => { if (e.target === e.currentTarget) closeNote(); }}>
        <div className="cal-modal">
          <div className="cal-modal-header">
            <h3 id="personalModalTitle">{note.heading}</h3>
            {' '}
            <button className="cal-modal-close" id="personalModalClose" onClick={closeNote}>&times;</button>
          </div>
          {' '}
          <div className="cal-modal-body">
            <div className="form-group">
              <label>Title <span className="req">*</span></label>
              {' '}
              <input type="text" id="pFieldTitle" ref={titleRef} placeholder="e.g. Prep notes for Before Midterms" autoComplete="off" value={note.title} onChange={e => setNote(n => ({ ...n, title: e.target.value }))} />
            </div>
            {' '}
            <div className="form-row">
              <div className="form-group">
                <label>Start Date <span className="req">*</span></label>
                {' '}
                <DateInput type="date" id="pFieldDate" value={note.date} onChange={e => { const v = e.target.value; setNote(n => ({ ...n, date: v })); }} />
              </div>
              {' '}
              <div className="form-group">
                <label>End Date <span className="optional">(leave blank if one day)</span></label>
                {' '}
                <DateInput type="date" id="pFieldEndDate" value={note.endDate} onChange={e => { const v = e.target.value; setNote(n => ({ ...n, endDate: v })); }} />
              </div>
            </div>
            {' '}
            <div className="form-group">
              <label>Description <span className="optional">(optional)</span></label>
              {' '}
              <textarea id="pFieldNotes" rows="3" placeholder="Additional details…" value={note.notes} onChange={e => setNote(n => ({ ...n, notes: e.target.value }))}></textarea>
            </div>
          </div>
          {' '}
          <div className="cal-modal-footer">
            <button className="btn-cal-outline" id="personalModalCancel" onClick={closeNote}>Cancel</button>
            {' '}
            <button className="btn-cal-primary" id="personalModalSave" onClick={saveNote} disabled={note.saving}>{note.saving ? 'Saving…' : note.saveText}</button>
          </div>
        </div>
      </div>

      {/* Error Modal */}
      <div id="calErrorModal" className={'modal-overlay' + (error.open ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) setError(x => ({ ...x, open: false })); }}>
        <div className="modal-card modal-card-sm" data-astra-confirm="1" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-danger" data-ac="icon">
            <i className="ti ti-alert-circle"></i>
          </div>
          {' '}
          <h3 className="confirm-title" data-ac="title">Something went wrong</h3>
          {' '}
          <p className="confirm-body" id="calErrorMessage" data-ac="body">{error.message}</p>
          {' '}
          <div className="confirm-actions astra-single" data-ac="actions">
            <button className="btn-confirm-primary" onClick={() => setError(x => ({ ...x, open: false }))}>OK</button>
          </div>
          <ConfirmX onClick={() => setError(x => ({ ...x, open: false }))} />
        </div>
      </div>

      {/* Confirm Delete Modal */}
      <div id="calConfirmModal" className={'modal-overlay' + (confirmDelete?.open ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(c => ({ ...c, open: false })); }}>
        <div className="modal-card modal-card-sm" data-astra-confirm="1" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-danger" data-ac="icon">
            <i className="ti ti-trash"></i>
          </div>
          {' '}
          <h3 className="confirm-title" data-ac="title">Delete Entry</h3>
          {' '}
          <p className="confirm-body" data-ac="body">Are you sure you want to delete this? This cannot be undone.</p>
          {' '}
          <div className="confirm-actions" data-ac="actions">
            <button className="btn-form-cancel" onClick={() => setConfirmDelete(c => ({ ...c, open: false }))}>Cancel</button>
            {' '}
            <button className="btn-confirm-danger" id="calConfirmDeleteBtn" onClick={() => {
              if (!confirmDelete) return;
              setConfirmDelete(c => ({ ...c, open: false }));
              deleteNote(confirmDelete.id);
            }}><i className="ti ti-trash"></i>{' '}Delete</button>
          </div>
          <ConfirmX onClick={() => setConfirmDelete(c => ({ ...c, open: false }))} />
        </div>
      </div>
    </Page>
  );
}

function ProgramCard({ ev }) {
  const cfg = TYPE_CONFIG[ev.eventType] || TYPE_CONFIG['Session Schedule'];
  return (
    <div className={`cal-event-card ${cfg.cls}`}>
      <div className="cal-event-top">
        <div className="cal-event-title">{ev.title}</div>
      </div>
      {' '}
      <div className="cal-event-dates">
        {CAL_ICON}
        {' ' + fmtDateRange(ev.startDate, ev.endDate)}
      </div>
      {' '}
      <span className={`cal-event-badge ${cfg.badgeCls}`}>{ev.eventType}</span>
      {' '}
      {ev.venue && <div className="cal-event-venue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>{ev.venue.replace(/\|/g, ' · ')}</div>}
      {' '}
      {ev.description && <div className="cal-event-desc" dangerouslySetInnerHTML={{ __html: sanitizeHtml(ev.description) }} />}
    </div>
  );
}

// A logged session is read-only here; it links to the Sessions page.
function LoggedSessionCard({ s, onOpen }) {
  const title = stripSectionPrefix(s.topic) || s.slotName || 'Mentoring Session';
  const status = s.sessionStatus || 'Scheduled';
  const statusCls = ['Cancelled', 'Completed', 'Scheduled', 'Pending'].includes(status) ? 'session-status-' + status.toLowerCase() : '';
  return (
    <div className={'cal-event-card my-session' + (status === 'Cancelled' ? ' cancelled' : '')}>
      <div className="cal-event-top">
        <div className="cal-event-title">{title}</div>
        {' '}
        <div className="cal-event-actions" style={{ opacity: 1 }}>
          <button className="cal-action-btn" title="View in Sessions" onClick={onOpen}>{ARROW_ICON}</button>
        </div>
      </div>
      {' '}
      <div className="cal-event-dates">
        {CAL_ICON}
        {' ' + fmtDate(s.sessionDate)}
      </div>
      {' '}
      <span className={`cal-event-badge badge-my-session ${statusCls}`}>{status}</span>
      {' '}
      {s.sectionCode && <span className="cal-event-badge badge-section">{s.sectionCode}</span>}
    </div>
  );
}

// A mentor's own note: editable (Edit/Delete).
function NoteCard({ ev, onEdit, onDelete }) {
  return (
    <div className="cal-event-card my-session">
      <div className="cal-event-top">
        <div className="cal-event-title">{ev.title}</div>
        {' '}
        <div className="cal-event-actions">
          <button className="cal-action-btn" title="Edit" onClick={onEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </button>
          {' '}
          <button className="cal-action-btn delete" title="Delete" onClick={onDelete}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
          </button>
        </div>
      </div>
      {' '}
      <div className="cal-event-dates">
        {CAL_ICON}
        {' ' + fmtDateRange(ev.eventDate, ev.endDate)}
      </div>
      {' '}
      <span className="cal-event-badge badge-my-session">Note</span>
      {' '}
      {ev.notes && <div className="cal-event-desc" dangerouslySetInnerHTML={{ __html: sanitizeHtml(ev.notes) }} />}
    </div>
  );
}

// Read-only; managing a slot stays on the Availability page.
function AvailabilityCard({ slot, onOpen }) {
  return (
    <div className="cal-event-card availability">
      <div className="cal-event-top">
        <div className="cal-event-title">{slot.slotName || 'Availability Slot'}</div>
        {' '}
        <div className="cal-event-actions" style={{ opacity: 1 }}>
          <button className="cal-action-btn" title="Manage in Availability" onClick={onOpen}>{ARROW_ICON}</button>
        </div>
      </div>
      {' '}
      <div className="cal-event-dates">
        {CAL_ICON}
        {` ${fmtDateRange(slot.availableDate, slot.availableDate)} · ${fmtSlotTime(slot.startTime)}`}
      </div>
      {' '}
      {!slot.isClosed && <span className="cal-event-badge badge-availability">{availabilityLabel(slot)}</span>}
      {' '}
      {slot.isClosed && <span className="cal-event-badge badge-late" title="Checkpoint session window is closed">Closed</span>}
      {' '}
      {slot.approvedMentees && <div className="cal-event-desc"><i className="ti ti-user-check"></i>{' ' + slot.approvedMentees}</div>}
    </div>
  );
}
