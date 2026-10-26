import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import DateInput from '../../components/DateInput.jsx';
import { checkpointToday } from '../../lib/checkpoint-window.js';
import { ErrorModal } from '../../components/InfoModal.jsx';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { buildCalendarSheetBodyHtml, buildCalendarSheetPrintHtml, fetchCalendarSheetData, openCalendarSheetPrintWindow } from '../../lib/calendar-sheet.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// ADMIN_/HTML/calendar-events.html + ADMIN_/JS/calendar-events.js

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const TYPE_CONFIG = {
  'Session Schedule': { cls: 'session',    badgeCls: 'badge-session'    },
  'Deadline':         { cls: 'deadline',   badgeCls: 'badge-deadline'   },
  'Period':           { cls: 'exam',       badgeCls: 'badge-exam'       },
  'Evaluation':       { cls: 'evaluation', badgeCls: 'badge-evaluation' },
};

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
const EXAM_PERIODS = ['Prelims', 'Midterms', 'Finals'];

// Session Schedule, Deadline, and Period all pick from a fixed list;
// Evaluation alone is free-typed, unrelated to any list.
function usesSlot(eventType) {
  return eventType === 'Session Schedule' || eventType === 'Deadline' || eventType === 'Period';
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

// "Before Midterms" has to finish before the Midterms period starts, and "After Midterms" has to begin after
// it ends. Only checked once the exam period has been added for that school year + semester.
const SLOT_RULE = /^(Before|After) (Prelims|Midterms|Finals)$/;
const isoDay = v => String(v).slice(0, 10);
function shiftDay(iso, days) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}
function fmtDay(iso) { return fmtDateRange(iso, iso); }

function periodRange(events, exam, schoolYear, semester, ignoreId) {
  const rows = events.filter(e => e.eventType === 'Period' && e.slotName === exam
    && e.schoolYear === schoolYear && e.semester === semester && e.eventID !== ignoreId);
  if (!rows.length) return null;
  return {
    start: rows.map(e => isoDay(e.startDate)).sort()[0],
    end: rows.map(e => isoDay(e.endDate || e.startDate)).sort().reverse()[0],
  };
}

function slotOrderIssue(slot, start, end, period) {
  const m = SLOT_RULE.exec(slot || '');
  if (!m || !period) return null;
  const exam = m[2];
  if (m[1] === 'Before' && end >= period.start) {
    return `"${slot}" must end before ${exam} starts on ${fmtDay(period.start)}. Pick an end date of ${fmtDay(shiftDay(period.start, -1))} or earlier.`;
  }
  if (m[1] === 'After' && start <= period.end) {
    return `"${slot}" must start after ${exam} ends on ${fmtDay(period.end)}. Pick a start date of ${fmtDay(shiftDay(period.end, 1))} or later.`;
  }
  return null;
}

function termOrderError(events, { type, slot, start, end, schoolYear, semester, ignoreId }) {
  if (type === 'Session Schedule') {
    const m = SLOT_RULE.exec(slot || '');
    if (!m) return null;
    return slotOrderIssue(slot, start, end, periodRange(events, m[2], schoolYear, semester, ignoreId));
  }
  if (type === 'Period') {
    for (const ev of events) {
      if (ev.eventType !== 'Session Schedule' || ev.eventID === ignoreId) continue;
      if (ev.schoolYear !== schoolYear || ev.semester !== semester) continue;
      const m = SLOT_RULE.exec(ev.slotName || '');
      if (!m || m[2] !== slot) continue;
      const evStart = isoDay(ev.startDate), evEnd = isoDay(ev.endDate || ev.startDate);
      const issue = slotOrderIssue(ev.slotName, evStart, evEnd, { start, end });
      if (issue) return `This would put the existing "${ev.slotName}" schedule (${fmtDateRange(evStart, evEnd)}) out of order. ${issue}`;
    }
  }
  return null;
}

function escCsv(v) {
  if (v == null) return '';
  let s = String(v);
  // Stops spreadsheet apps from running a cell as a formula; numbers/phones pass through.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

const DeleteIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>;
const CalIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;

export default function AdminCalendar() {
  useBackGuard();
  const now0 = new Date();
  const [allEvents, setAllEvents] = useState([]);
  const [state, setState] = useState('loading');
  const [viewYear, setViewYear] = useState(now0.getFullYear());
  const [viewMonth, setViewMonth] = useState(now0.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sem, setSem] = useState({ semester: '1st Semester', schoolYear: '2026-2027' });
  const [errorMsg, setErrorMsg] = useState(null);

  // add / edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [fType, setFType] = useState('Session Schedule');
  const [fSlot, setFSlot] = useState('');
  const [fTitle, setFTitle] = useState('');
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fNote, setFNote] = useState('');
  const [saving, setSaving] = useState(false);

  // confirm / publish / sheet
  const [confirmDlg, setConfirmDlg] = useState(null);       // { mode: 'update' | 'delete', onConfirm }
  const [publishConfirm, setPublishConfirm] = useState(null);   // message or null
  const [sheet, setSheet] = useState(null);                 // fetched sheet data or null (closed)
  const [publishing, setPublishing] = useState(false);

  async function loadEvents() {
    try {
      setAllEvents(await apiRequest('CalendarEvents', 'GET', null, true) || []);
      setState('ready');
    } catch (e) {
      console.error('Failed to load calendar events:', e);
      setState('failed');
    }
  }

  useEffect(() => {
    loadEvents();
    // The Slot Name dropdown needs the real current period the moment the page loads.
    (async () => {
      try {
        const settings = await apiRequest('Settings', 'GET', null, true);
        const sy = settings?.SchoolYear || settings?.schoolYear;
        const sm = settings?.Semester   || settings?.semester;
        setSem(s => ({ schoolYear: sy || s.schoolYear, semester: sm || s.semester }));
      } catch (e) {
        console.warn('Could not load current period, using default.', e);
      }
    })();
  }, []);

  // ── Filtered events ──
  const q = search.trim().toLowerCase();
  const filtered = allEvents.filter(ev => {
    if (q && !ev.title.toLowerCase().includes(q)) return false;
    if (typeFilter && ev.eventType !== typeFilter) return false;
    return true;
  });

  function eventsOnDay(y, m, d) {
    const target = new Date(y, m, d);
    return filtered.filter(ev => {
      const start = parseDate(ev.startDate);
      const end   = parseDate(ev.endDate) || start;
      if (!start) return false;
      return target >= start && target <= end;
    });
  }

  function eventsInViewMonth() {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const lastOfMonth  = new Date(viewYear, viewMonth + 1, 0);
    return filtered.filter(ev => {
      const start = parseDate(ev.startDate);
      const end   = parseDate(ev.endDate) || start;
      if (!start) return false;
      return start <= lastOfMonth && end >= firstOfMonth;
    }).sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
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

  // ── Generate-sheet button state ──
  const unpublished = allEvents.filter(ev => !ev.isPublished).length;
  const genDone = state === 'ready' && unpublished === 0;

  // ── Add / edit ──
  // Dates before today cannot be picked. An event that already starts in the past keeps its own date selectable while it is edited.
  const todayIso = checkpointToday();
  const editedEvent = editingId ? allEvents.find(e => e.eventID === editingId) : null;
  const editedStart = editedEvent?.startDate?.slice(0, 10) || '';
  const editedEnd = (editedEvent?.endDate || editedEvent?.startDate || '').slice(0, 10);
  const startMin = editedStart && editedStart < todayIso ? editedStart : todayIso;
  function openCreate() {
    const defaultDate = selectedDay
      ? toIsoDate(new Date(selectedDay.year, selectedDay.month, selectedDay.day))
      : toIsoDate(new Date(viewYear, viewMonth, 1));
    setEditingId(null);
    setFTitle(''); setFType('Session Schedule'); setFSlot('');
    setFStart(defaultDate < todayIso ? todayIso : defaultDate); setFEnd(''); setFNote('');
    setModalOpen(true);
  }
  function openEdit(id) {
    const ev = allEvents.find(e => e.eventID === id);
    if (!ev) return;
    const type = ev.eventType || 'Session Schedule';
    const opts = type === 'Period' ? EXAM_PERIODS : slotsForSemester(sem.semester);
    const sIso = ev.startDate?.split('T')[0];
    const eIso = ev.endDate?.split('T')[0];
    setEditingId(id);
    setFTitle(ev.title);
    setFType(type);
    setFSlot(usesSlot(type) && opts.includes(ev.slotName) ? ev.slotName : '');
    setFStart(sIso || '');
    setFEnd((eIso && eIso !== sIso) ? eIso : '');
    setFNote(ev.description || '');
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditingId(null); }

  function changeType(type) { setFType(type); setFSlot(''); }

  async function saveEvent() {
    const type = fType;
    const slotted = usesSlot(type);
    const slot = fSlot || null;
    const title = slotted ? slot : fTitle.trim();
    const start = fStart;
    const end = type === 'Deadline' ? start : (fEnd || start);
    const note = fNote.trim();

    if (slotted && !slot) { setErrorMsg(type === 'Period' ? 'Please choose a Period.' : 'Please choose a Slot.'); return; }
    if (!slotted && !title) { setErrorMsg('Please enter an activity title.'); return; }
    if (!start) { setErrorMsg('Please select a start date.'); return; }
    if (end < start) { setErrorMsg('End date cannot be before the start date.'); return; }
    if (start < todayIso && start !== editedStart) { setErrorMsg('The start date cannot be in the past.'); return; }
    if (end < todayIso && end !== editedEnd) { setErrorMsg('The end date cannot be in the past.'); return; }

    const current = editingId ? allEvents.find(e => e.eventID === editingId) : null;
    const orderError = termOrderError(allEvents, {
      type, slot, start, end,
      schoolYear: current?.schoolYear || sem.schoolYear,
      semester: current?.semester || sem.semester,
      ignoreId: editingId,
    });
    if (orderError) { setErrorMsg(orderError); return; }

    if (editingId) {
      setConfirmDlg({ mode: 'update', onConfirm: () => doSaveEvent(type, slotted, slot, title, start, end, note) });
      return;
    }
    await doSaveEvent(type, slotted, slot, title, start, end, note);
  }

  async function doSaveEvent(type, slotted, slot, title, start, end, note) {
    setSaving(true);
    const wasEditing = editingId;
    const existing = wasEditing ? allEvents.find(e => e.eventID === wasEditing) : null;

    const payload = {
      title,
      startDate:   start + 'T00:00:00',
      endDate:     end   + 'T00:00:00',
      eventType:   type,
      description: note || null,
      venue:       null,
      slotName:    slotted ? slot : null,
      schoolYear:  existing?.schoolYear || sem.schoolYear,
      semester:    existing?.semester   || sem.semester,
      createdAt:   existing?.createdAt || existing?.CreatedAt,
      CreatedAt:   existing?.CreatedAt || existing?.createdAt,
      // Editing an already-published activity must clear this back to false —
      // its old published sheet no longer reflects the new content, so it
      // needs to show up as pending again until Generate Sheet is re-run.
      isPublished: false,
    };

    try {
      if (wasEditing) {
        await apiRequest(`CalendarEvents/${wasEditing}`, 'PUT', { ...payload, eventID: wasEditing }, true);
      } else {
        await apiRequest('CalendarEvents', 'POST', payload, true);
      }
      closeModal();
      await loadEvents();
      showToast(wasEditing ? 'Activity updated.' : 'Activity added.', 'success');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save activity. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function askDelete(id) {
    setConfirmDlg({
      mode: 'delete',
      onConfirm: async () => {
        try {
          await apiRequest(`CalendarEvents/${id}`, 'DELETE', null, true);
          await loadEvents();
          showToast('Activity deleted.', 'success');
        } catch (err) {
          setErrorMsg('Failed to delete activity. Please try again.');
        }
      },
    });
  }

  // ── Sheet preview ──
  async function openSheetPreview() {
    const data = await fetchCalendarSheetData();
    setSem({ semester: data.semester, schoolYear: data.schoolYear });
    setSheet(data);
  }
  const closeSheetPreview = () => setSheet(null);

  function publishCalendar() {
    const toPublish = allEvents.filter(ev => !ev.isPublished);
    if (!toPublish.length) {
      showToast('All activities are already published.', 'info');
      return;
    }
    const count = toPublish.length;
    setPublishConfirm(`${count} new activit${count !== 1 ? 'ies' : 'y'} will become visible to mentors. Continue?`);
  }

  async function doPublishCalendar() {
    setPublishConfirm(null);
    const toPublish = allEvents.filter(ev => !ev.isPublished);
    if (!toPublish.length) return;

    setPublishing(true);
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

      // loadEvents() then read allEvents.length — the count hasn't changed by publishing.
      const fresh = await apiRequest('CalendarEvents', 'GET', null, true) || [];
      setAllEvents(fresh);
      setState('ready');
      closeSheetPreview();
      showToast(`Published — ${fresh.length} activit${fresh.length !== 1 ? 'ies are' : 'y is'} now visible to mentors.`, 'success');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to publish. Please try again.');
    } finally {
      setPublishing(false);
    }
  }

  function sheetData(extra) {
    return {
      semester: sheet.semester, schoolYear: sheet.schoolYear, events: allEvents,
      prepName: sheet.prepName, prepTitle: sheet.prepTitle, prepSig: sheet.prepSig,
      appName: sheet.appName, appTitle: sheet.appTitle, appSig: sheet.appSig,
      ...extra,
    };
  }
  function printSheet() {
    if (!openCalendarSheetPrintWindow(buildCalendarSheetPrintHtml(sheetData()))) {
      setErrorMsg('Pop-up blocked. Please allow pop-ups for this page and try again.');
    }
  }

  // ── Export / print (respects the current search + type filter) ──
  function exportCSV() {
    const events = filtered.slice().sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
    if (!events.length) { showToast('No activities to export.', 'info'); return; }

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
    showToast(`Exported ${events.length} activit${events.length !== 1 ? 'ies' : 'y'} to CSV.`, 'success');
  }

  async function printReport() {
    const events = filtered;
    if (!events.length) { showToast('No activities to print.', 'info'); return; }
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) { setErrorMsg('Pop-up blocked. Please allow pop-ups for this page.'); return; }
    const data = await fetchCalendarSheetData();
    openCalendarSheetPrintWindow(buildCalendarSheetPrintHtml({ ...data, events }), popup);
  }

  // ── Calendar grid ──
  const today = new Date();
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
    const isSelected = selectedDay && !other && d === selectedDay.day && viewMonth === selectedDay.month && viewYear === selectedDay.year;
    const dayEvents  = other ? [] : eventsOnDay(ny, nm, d);

    const bars = [...new Map(dayEvents.map(e => [e.eventID, e])).values()].slice(0, 3);
    const more = Math.max(0, dayEvents.length - bars.length);

    const cls = ['cal-day', other ? 'other-month' : '', isToday ? 'today' : '', isSelected ? 'selected' : ''].filter(Boolean).join(' ');
    return (
      <div className={cls} key={idx} onClick={other ? undefined : () => selectDay(ny, nm, d)}>
        <div className="cal-day-num">{d}</div>
        <div className="cal-day-events">
          {bars.map(e => {
            const cfg = TYPE_CONFIG[e.eventType] || TYPE_CONFIG['Session Schedule'];
            return <div className={`cal-day-bar ${cfg.cls}`} role="img" aria-label={`${e.eventType || 'Event'}: ${e.title || ''}`} title={e.title || ''} key={e.eventID}></div>;
          })}
          {more > 0 ? <div className="cal-more">+{more}</div> : null}
        </div>
      </div>
    );
  });

  // ── Sidebar ──
  let events, sidebarTitle, sidebarSub;
  if (selectedDay) {
    const { year, month, day } = selectedDay;
    events = eventsOnDay(year, month, day);
    sidebarTitle = new Date(year, month, day).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
  } else {
    events = eventsInViewMonth();
    sidebarTitle = `${MONTHS[viewMonth]} ${viewYear}`;
  }
  sidebarSub = `${events.length} activit${events.length !== 1 ? 'ies' : 'y'}`;

  let sidebarList;
  if (state === 'loading') sidebarList = <div className="cal-loading"><span className="spinner"></span> Loading…</div>;
  else if (state === 'failed') sidebarList = <div className="cal-loading">Failed to load events. Please refresh.</div>;
  else if (!events.length) {
    sidebarList = (
      <div className="cal-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <p>{selectedDay ? 'No activities on this day.' : 'No activities this month.'}</p>
        <p style={{ fontSize: '11px' }}>Click <strong>Add Activity</strong> to post one.</p>
      </div>
    );
  } else {
    sidebarList = events.map(ev => {
      const cfg = TYPE_CONFIG[ev.eventType] || TYPE_CONFIG['Session Schedule'];
      return (
        <div className={`cal-event-card ${cfg.cls}`} key={ev.eventID}>
          <div className="cal-event-top">
            <div className="cal-event-title">{ev.title}</div>
            <div className="cal-event-actions">
              <button className="cal-action-btn" title="Edit" onClick={() => openEdit(ev.eventID)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
              <button className="cal-action-btn delete" title="Delete" onClick={() => askDelete(ev.eventID)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
              </button>
            </div>
          </div>
          <div className="cal-event-dates">
            {CalIcon}
            {fmtDateRange(ev.startDate, ev.endDate)}
          </div>
          <span className={`cal-event-badge ${cfg.badgeCls}`}>{ev.eventType}</span>
          {ev.description ? <div className="cal-event-note">{ev.description}</div> : null}
        </div>
      );
    });
  }

  // ── Modal field variations by type ──
  const slotted = usesSlot(fType);
  const slotOpts = fType === 'Period' ? EXAM_PERIODS : slotsForSemester(sem.semester);

  // ── Sheet publish note ──
  let publishNote = { text: '', cls: 'sheet-publish-note' };
  if (sheet) {
    const total = allEvents.length;
    if (!total) publishNote = { text: 'No activities added yet.', cls: 'sheet-publish-note warn' };
    else if (unpublished === 0) publishNote = { text: `All ${total} activit${total !== 1 ? 'ies are' : 'y is'} currently published to mentors.`, cls: 'sheet-publish-note ok' };
    else publishNote = { text: `${unpublished} new activit${unpublished !== 1 ? 'ies' : 'y'} will become visible to mentors after publishing.`, cls: 'sheet-publish-note pending' };
  }
  const sigDisp = val => ({ text: val || '—', cls: val ? '' : ' sheet-signatory-empty' });

  const hover = (bg, fg) => e => { e.currentTarget.style.background = bg; if (fg) e.currentTarget.style.color = fg; };

  return (
    <Page id="ADMIN_/calendar-events">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Calendar &amp; Events</h1>
              <p>Add and manage activities, then generate and publish the calendar sheet for mentors</p>
            </div>
            <div className="page-header-actions">
              <button className="btn-primary" id="addEventBtn" onClick={openCreate}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add Activity
              </button>
              <div className="btn-generate-wrap">
                <button className={`btn-generate${genDone ? ' btn-generate--done' : ''}`} id="generateSheetBtn" onClick={openSheetPreview}
                  title={state === 'ready' ? (unpublished > 0 ? `${unpublished} activit${unpublished !== 1 ? 'ies' : 'y'} pending publication` : 'All activities are published') : undefined}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                  Generate Sheet
                  <span className="generate-badge" id="generateBadge" style={{ display: state === 'ready' && unpublished > 0 ? 'inline-flex' : 'none' }}>{state === 'ready' && unpublished > 0 ? unpublished : ''}</span>
                </button>
                <div className="generate-info-wrap">
                  <span className="generate-info-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                  </span>
                  <div className="generate-tooltip">
                    <strong>How publishing works</strong><br />
                    Add or edit activities freely — mentors won't see them until you publish.<br /><br />
                    When ready, click <em>Generate Sheet</em> to preview the calendar, fill in document details, then click <em>Publish to Mentors</em>.<br /><br />
                    The orange badge shows how many activities are pending publication.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Activities (academic calendar management) */}
          <div id="pane-program" className="cal-pane">
            <div className="cal-toolbar">
              <div className="cal-toolbar-left">
                <div className="cal-legend ev-legend">
                  <div className="cal-legend-item"><span className="cal-legend-dot session"></span>Session Schedule</div>
                  <div className="cal-legend-item"><span className="cal-legend-dot deadline"></span>Deadline</div>
                  <div className="cal-legend-item"><span className="cal-legend-dot exam"></span>Period</div>
                  <div className="cal-legend-item"><span className="cal-legend-dot evaluation"></span>Evaluation</div>
                </div>
              </div>
              <div className="cal-toolbar-right">
                <div className="cal-search-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <input type="text" id="calSearch" placeholder="Search activities…" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select className="cal-type-filter" id="typeFilter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                  <option value="">All Types</option>
                  <option value="Session Schedule">Session Schedule</option>
                  <option value="Deadline">Deadline</option>
                  <option value="Period">Period</option>
                  <option value="Evaluation">Evaluation</option>
                </Select>
                <button className="cal-act-btn" onClick={exportCSV}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fff', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onMouseOver={hover('#2563eb', '#fff')} onMouseOut={hover('#fff', '#2563eb')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  Export CSV
                </button>
                <button className="cal-act-btn" onClick={printReport}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#2563eb', color: '#fff', border: '1px solid #2563eb', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onMouseOver={hover('#1d4ed8')} onMouseOut={hover('#2563eb')}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                  Print / Save as PDF
                </button>
              </div>
            </div>

            <div className="cal-layout">
              <div className="cal-panel">
                <div className="cal-header">
                  <button className="cal-nav-btn" id="prevMonth" onClick={prevMonth}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <span className="cal-month-label" id="calMonthLabel">{MONTHS[viewMonth]} {viewYear}</span>
                  <button className="cal-nav-btn" id="nextMonth" onClick={nextMonth}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
                <div className="cal-dow-row">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div className="cal-dow" key={d}>{d}</div>)}
                </div>
                <div className="cal-grid" id="calGrid">{grid}</div>
              </div>

              <div className="cal-sidebar">
                <div className="cal-sidebar-header">
                  <div>
                    <div className="cal-sidebar-title" id="sidebarTitle">{state === 'loading' ? 'Activities' : sidebarTitle}</div>
                    <div className="cal-sidebar-sub" id="sidebarSub">{state === 'loading' ? '' : sidebarSub}</div>
                  </div>
                  <button className="cal-sidebar-clear" id="clearSelection" style={{ display: selectedDay && state !== 'loading' ? 'inline-block' : 'none' }} onClick={() => setSelectedDay(null)}>Show all</button>
                </div>
                <div className="cal-events-list" id="calEventsList">{sidebarList}</div>
              </div>
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Add / Edit Activity Modal */}
      <Overlay open={modalOpen} className="modal-overlay" activeClass="active" id="modalOverlay"
        onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal">
          <div className="modal-header">
            <h3 id="modalTitle">{editingId ? 'Edit Activity' : 'Add Activity'}</h3>
            <button className="modal-close" id="modalClose" onClick={closeModal}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label>Activity Type <span className="req">*</span></label>
              <Select id="fieldType" value={fType} onChange={e => changeType(e.target.value)}>
                <option value="Session Schedule">Session Schedule</option>
                <option value="Deadline">Deadline</option>
                <option value="Period">Period</option>
                <option value="Evaluation">Evaluation</option>
              </Select>
            </div>
            {/* Hidden for Evaluation, which uses a free-typed title instead. */}
            <div className="form-group" id="slotNameGroup" style={{ display: slotted ? '' : 'none' }}>
              <label id="slotLabel">{fType === 'Period' ? 'Period' : 'Slot'} <span className="req">*</span></label>
              <Select id="fieldSlotName" value={fSlot} onChange={e => setFSlot(e.target.value)}>
                <option value="" disabled>Choose...</option>
                {slotted ? slotOpts.map(s => <option key={s} value={s}>{s}</option>) : null}
              </Select>
            </div>
            <div className="form-group" id="titleGroup" style={{ display: slotted ? 'none' : '' }}>
              <label>Activity <span className="req">*</span></label>
              <input type="text" id="fieldTitle" placeholder="e.g. Mentoring Evaluation" autoComplete="off" value={fTitle} onChange={e => setFTitle(e.target.value)} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label id="startLabel">
                  {fType === 'Session Schedule' ? 'Session Window Start' : fType === 'Deadline' ? 'Deadline Date' : 'Start Date'} <span className="req">*</span>
                </label>
                <DateInput type="date" id="fieldStart" min={startMin} value={fStart} onChange={e => setFStart(e.target.value)} />
              </div>
              <div className="form-group" id="endDateGroup" style={{ display: fType === 'Deadline' ? 'none' : '' }}>
                <label id="endLabel">
                  {fType === 'Session Schedule'
                    ? <>Session Window End <span className="req">*</span></>
                    : <>End Date <span className="optional">(leave blank if single day)</span></>}
                </label>
                <DateInput type="date" id="fieldEnd" min={fStart || startMin} value={fEnd} onChange={e => setFEnd(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Note <span className="optional">(optional — admin view only, not printed)</span></label>
              <textarea id="fieldNote" rows="2" placeholder="e.g. Attendance required for all sections" style={{ resize: 'vertical' }} value={fNote} onChange={e => setFNote(e.target.value)}></textarea>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-outline" id="modalCancel" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" id="modalSave" onClick={saveEvent} disabled={saving}>
              {saving ? 'Saving…' : (editingId ? 'Update Activity' : 'Save Activity')}
            </button>
          </div>
        </div>
      </Overlay>

      {/* Delete / Update confirm */}
      <Overlay open={!!confirmDlg} className="info-modal-overlay" activeClass={null} display="flex" id="confirmModal">
        <div className="info-modal">
          <div className="info-modal-icon danger">{DeleteIcon}</div>
          <h3 className="info-modal-title">{confirmDlg?.mode === 'update' ? 'Update Activity' : 'Delete Activity'}</h3>
          <p className="info-modal-message">{confirmDlg?.mode === 'update' ? 'Update this activity?' : 'Are you sure you want to delete this activity? This cannot be undone.'}</p>
          <div className="info-modal-actions">
            <button className="btn-outline" onClick={() => setConfirmDlg(null)}>Cancel</button>
            <button className={confirmDlg?.mode === 'update' ? 'btn-primary' : 'btn-danger'} id="confirmDeleteBtn"
              onClick={() => { const fn = confirmDlg.onConfirm; setConfirmDlg(null); fn(); }}>
              {confirmDlg?.mode === 'update' ? 'Update' : 'Delete'}
            </button>
          </div>
        </div>
      </Overlay>

      <ErrorModal message={errorMsg} onClose={() => setErrorMsg(null)} />

      {/* Publish Confirm Modal */}
      <Overlay open={publishConfirm !== null} className="info-modal-overlay" activeClass={null} display="flex" id="publishConfirmModal">
        <div className="info-modal">
          <div className="info-modal-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" /></svg>
          </div>
          <h3 className="info-modal-title">Publish to Mentors</h3>
          <p className="info-modal-message" id="publishConfirmMsg">{publishConfirm ?? 'These activities will become visible to mentors.'}</p>
          <div className="info-modal-actions">
            <button className="btn-outline" onClick={() => setPublishConfirm(null)}>Cancel</button>
            <button className="btn-publish" onClick={doPublishCalendar}>Publish</button>
          </div>
        </div>
      </Overlay>

      {/* Sheet preview modal */}
      <Overlay open={!!sheet} className="sheet-overlay" activeClass={null} display="flex" id="sheetModal">
        <div className="sheet-container">
          <div className="sheet-modal-header">
            <div className="sheet-modal-title-block">
              <div className="sheet-modal-title">Calendar Sheet</div>
              <div className="sheet-modal-sub">Fill in the document details, preview the sheet, then publish to mentors</div>
            </div>
            <div className="sheet-modal-btns">
              <button className="btn-outline sheet-btn" onClick={printSheet}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                Print / Save as PDF
              </button>
              <button className="btn-publish" id="publishBtn" onClick={publishCalendar} disabled={publishing}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" /></svg>
                {publishing ? 'Publishing…' : 'Publish to Mentors'}
              </button>
              <button className="sheet-close-btn" onClick={closeSheetPreview}>&times;</button>
            </div>
          </div>
          <div className="sheet-body">
            <div className="sheet-form-panel">
              <div className="sheet-section-label">Prepared By</div>
              <div className="sheet-signatory-view">
                <div className={`sheet-signatory-name${sigDisp(sheet?.prepName).cls}`} id="sheetPreparedNameDisp">{sigDisp(sheet?.prepName).text}</div>
                <div className={`sheet-signatory-title${sigDisp(sheet?.prepTitle).cls}`} id="sheetPreparedTitleDisp">{sigDisp(sheet?.prepTitle).text}</div>
              </div>
              <div className="sheet-section-label">Approved By</div>
              <div className="sheet-signatory-view">
                <div className={`sheet-signatory-name${sigDisp(sheet?.appName).cls}`} id="sheetApprovedNameDisp">{sigDisp(sheet?.appName).text}</div>
                <div className={`sheet-signatory-title${sigDisp(sheet?.appTitle).cls}`} id="sheetApprovedTitleDisp">{sigDisp(sheet?.appTitle).text}</div>
              </div>
              <div className="sheet-settings-note">
                Prepared/Approved By names are managed in <Link to="/admin/settings">System Settings</Link>.
              </div>
              <div className={publishNote.cls} id="sheetPublishNote">{publishNote.text}</div>
            </div>
            <div className="sheet-preview-panel">
              <div className="sheet-paper" id="sheetPreviewBody"
                dangerouslySetInnerHTML={{ __html: sheet ? buildCalendarSheetBodyHtml(sheetData()) : '' }}></div>
            </div>
          </div>
        </div>
      </Overlay>
    </Page>
  );
}
