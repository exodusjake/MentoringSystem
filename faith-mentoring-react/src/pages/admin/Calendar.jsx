import { useEffect, useMemo, useState } from 'react';
import Page from '../../app/Page.jsx';
import DateInput from '../../components/DateInput.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { buildCalendarSheetPrintHtml, fetchCalendarSheetData } from '../../lib/calendar-sheet.js';
import { showConfirm, showToast } from '../../components/Notify.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TYPES = ['Session Schedule', 'Deadline', 'Period', 'Evaluation'];
const MENTORING_SLOTS = ['Mentoring Assembly', 'Before Prelims', 'After Prelims', 'Before Midterms', 'After Midterms', 'Before Finals'];
const EXAM_PERIODS = ['Prelims', 'Midterms', 'Finals'];
const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localDate = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`) : null;
const fmtDate = (start, end) => {
  const a = localDate(start), b = localDate(end);
  if (!a) return '—';
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  const first = a.toLocaleDateString('en-PH', options);
  if (!b || iso(a) === iso(b)) return first;
  return `${first} – ${b.toLocaleDateString('en-PH', options)}`;
};
const BLANK = { title: '', eventType: 'Session Schedule', startDate: '', endDate: '', description: '', slotName: '' };
const eventId = e => e.eventID ?? e.EventID;

export default function AdminCalendar() {
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(null);
  const [state, setState] = useState('loading');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [showUnpublished, setShowUnpublished] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [sheetHtml, setSheetHtml] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setState('loading');
    try {
      const [rows, current] = await Promise.all([
        apiRequest('CalendarEvents', 'GET', null, true),
        apiRequest('Settings', 'GET', null, true),
      ]);
      setEvents(rows || []); setSettings(current); setState('ready');
    } catch (e) { setState('error'); showToast(e.message || 'Could not load calendar events.'); }
  }
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => events.filter(e => {
    if (type && e.eventType !== type) return false;
    if (showUnpublished && e.isPublished) return false;
    const q = query.trim().toLowerCase();
    return !q || `${e.title || ''} ${e.description || ''} ${e.slotName || ''}`.toLowerCase().includes(q);
  }).sort((a, b) => localDate(a.startDate) - localDate(b.startDate)), [events, type, showUnpublished, query]);
  const monthEvents = filtered.filter(e => {
    const from = localDate(e.startDate), to = localDate(e.endDate) || from;
    if (!from) return false;
    const first = new Date(view.year, view.month, 1), last = new Date(view.year, view.month + 1, 0, 23, 59, 59);
    return from <= last && to >= first;
  });
  const selectedDate = selectedDay ? localDate(selectedDay) : null;
  const sidebarEvents = selectedDate
    ? monthEvents.filter(e => {
      const from = localDate(e.startDate), to = localDate(e.endDate) || from;
      return from && selectedDate >= from && selectedDate <= to;
    })
    : monthEvents;
  const gridStart = new Date(view.year, view.month, 1);
  const firstDay = new Date(view.year, view.month, 1 - gridStart.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + i));

  function openEditor(event = null) {
    setForm(event ? {
      id: eventId(event), title: event.title || '', eventType: event.eventType || 'Session Schedule',
      startDate: String(event.startDate || '').slice(0, 10), endDate: String(event.endDate || event.startDate || '').slice(0, 10),
      description: event.description || '', slotName: event.slotName || '',
    } : { ...BLANK });
  }
  async function save(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.startDate || !form.endDate) { showToast('Title, start date and end date are required.'); return; }
    if (form.endDate < form.startDate) { showToast('End date must be on or after the start date.'); return; }
    setSaving(true);
    const current = events.find(e => String(eventId(e)) === String(form.id));
    const payload = {
      title: form.title.trim(), startDate: `${form.startDate}T00:00:00`, endDate: `${form.endDate}T00:00:00`,
      eventType: form.eventType, description: form.description.trim() || null, venue: current?.venue || null,
      slotName: ['Session Schedule', 'Deadline', 'Period'].includes(form.eventType) ? form.slotName || null : null,
      schoolYear: current?.schoolYear || settings?.SchoolYear || null, semester: current?.semester || settings?.Semester || null,
      createdAt: current?.createdAt || current?.CreatedAt, CreatedAt: current?.CreatedAt || current?.createdAt,
      isPublished: false,
    };
    try {
      if (form.id) await apiRequest(`CalendarEvents/${form.id}`, 'PUT', { ...payload, eventID: form.id }, true);
      else await apiRequest('CalendarEvents', 'POST', payload, true);
      setForm(null); setSheetHtml(''); showToast(form.id ? 'Activity updated.' : 'Activity added.', 'success'); await load();
    } catch (e) { showToast(e.message || 'Could not save activity.'); }
    finally { setSaving(false); }
  }
  async function remove(event) {
    if (!await showConfirm(`Delete “${event.title}”?`, { confirmText: 'Delete' })) return;
    try { await apiRequest(`CalendarEvents/${eventId(event)}`, 'DELETE', null, true); showToast('Activity deleted.', 'success'); await load(); }
    catch (e) { showToast(e.message || 'Could not delete activity.'); }
  }
  async function publishAll() {
    const pending = events.filter(e => !e.isPublished);
    if (!pending.length) { showToast('All calendar activities are already published.', 'info'); return; }
    if (!await showConfirm(`Publish ${pending.length} calendar activities? They will become visible across the portals.`, { confirmText: 'Publish', variant: 'primary' })) return;
    try {
      await Promise.all(pending.map(e => apiRequest(`CalendarEvents/${eventId(e)}`, 'PUT', {
        eventID: eventId(e), title: e.title, startDate: e.startDate, endDate: e.endDate,
        eventType: e.eventType || 'Session Schedule', description: e.description || null,
        venue: e.venue || null, slotName: e.slotName || null, schoolYear: e.schoolYear || null,
        semester: e.semester || null, createdAt: e.createdAt || e.CreatedAt, CreatedAt: e.CreatedAt || e.createdAt,
        isPublished: true,
      }, true)));
      showToast(`${pending.length} activities published.`, 'success'); setSheetHtml(''); await load();
      return true;
    } catch (e) { showToast(e.message || 'Could not publish the calendar.'); }
  }
  async function previewSheet() {
    try {
      const sheet = await fetchCalendarSheetData();
      setSheetHtml(buildCalendarSheetPrintHtml({ ...sheet, events }));
    } catch (e) { showToast(e.message || 'Could not generate the calendar sheet.'); }
  }
  function exportCsv() {
    if (!filtered.length) { showToast('No activities to export.', 'info'); return; }
    const rows = [['Type', 'Activity', 'Start Date', 'End Date', 'Status', 'Venue', 'Note'], ...filtered.map(e => [
      e.eventType || '', e.title || '', String(e.startDate || '').slice(0, 10), String(e.endDate || '').slice(0, 10),
      e.isPublished ? 'Published' : 'Not Published', e.venue || '', e.description || '',
    ])];
    const escapeCsv = value => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d\s().-]+$/.test(text)) text = `'${text}`;
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const csv = rows.map(row => row.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `calendar-activities-${iso(new Date())}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  const goMonth = offset => { setSelectedDay(''); setView(v => { const d = new Date(v.year, v.month + offset, 1); return { year: d.getFullYear(), month: d.getMonth() }; }); };

  return <Page id="ADMIN_/calendar-events"><main className="main-wrapper"><div className="page-content">
    <header className="page-header"><div className="page-header-top"><div><h1>Calendar &amp; Events</h1><p>Plan program activities and publish the calendar to portal users.</p></div>
      <div className="header-actions"><button className="btn-outline" onClick={previewSheet}><i className="ti ti-printer" /> Generate Sheet</button><button className="btn-outline" onClick={exportCsv}><i className="ti ti-download" /> Export CSV</button><button className="btn-primary" onClick={() => openEditor()}><i className="ti ti-plus" /> Add Activity</button></div></div></header>
    <div className="calendar-actions"><span>{settings ? `${settings.Semester || ''}, SY ${settings.SchoolYear || ''}` : ''}</span><button className="btn-primary" onClick={() => sheetHtml ? publishAll() : previewSheet()}><i className="ti ti-world-upload" /> {sheetHtml ? 'Publish to Mentors' : 'Generate Sheet to Publish'}</button></div>
    <div className="cal-toolbar toolbar"><label className="search-box"><i className="ti ti-search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search activities…" /></label>
      <Select className="filter-select" value={type} onChange={e => setType(e.target.value)}><option value="">All Activity Types</option>{TYPES.map(t => <option key={t}>{t}</option>)}</Select>
      <label className="checkbox-row"><input type="checkbox" checked={showUnpublished} onChange={e => setShowUnpublished(e.target.checked)} /> Unpublished only</label>
    </div>
    <section className="calendar-layout">
      <div className="calendar-panel">
        <div className="calendar-month-head"><button className="cal-nav" onClick={() => goMonth(-1)} aria-label="Previous month"><i className="ti ti-chevron-left" /></button><h2>{MONTHS[view.month]} {view.year}</h2><button className="cal-nav" onClick={() => goMonth(1)} aria-label="Next month"><i className="ti ti-chevron-right" /></button><button className="btn-outline" onClick={() => setView({ year: today.getFullYear(), month: today.getMonth() })}>Today</button></div>
        <div className="calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div className="cal-weekday" key={d}>{d}</div>)}
          {days.map((day, i) => {
            const dayIso = iso(day);
            const matched = monthEvents.filter(e => { const start = localDate(e.startDate), end = localDate(e.endDate) || start; return start && day >= start && day <= end; });
            const selected = selectedDay === dayIso;
            return <div className={`cal-day ${day.getMonth() !== view.month ? 'other-month' : ''} ${dayIso === iso(today) ? 'today' : ''} ${selected ? 'selected' : ''}`} key={`${dayIso}-${i}`}
              onClick={() => day.getMonth() === view.month && setSelectedDay(current => current === dayIso ? '' : dayIso)}>
              <span className="cal-day-number">{day.getDate()}</span>
              {matched.slice(0, 3).map(e => <button key={eventId(e)} type="button" className={`cal-day-bar ${(e.eventType || '').toLowerCase().replaceAll(' ', '-')}`} title={`${e.eventType}: ${e.title}`} onClick={event => { event.stopPropagation(); openEditor(e); }}>{e.title}</button>)}
              {matched.length > 3 && <small>+{matched.length - 3} more</small>}
            </div>;
          })}
        </div>
      </div>
      <aside className="calendar-event-panel"><div className="calendar-event-panel-head"><h2>{selectedDate ? selectedDate.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }) : `${MONTHS[view.month]} ${view.year}`}</h2><span>{sidebarEvents.length}</span>{selectedDay && <button className="filter-reset" onClick={() => setSelectedDay('')}>Clear</button>}</div>
        <div className="calendar-event-list">{state === 'loading' ? <Empty className="cal-empty">Loading activities…</Empty> : state === 'error' ? <Empty className="cal-empty">Could not load activities.</Empty> : sidebarEvents.map(e => <article className="cal-event-card" key={eventId(e)}>
          <div className={`cal-event-mark ${(e.eventType || '').toLowerCase().replaceAll(' ', '-')}`} />
          <div className="cal-event-info"><div className="cal-event-top"><span className="cal-event-badge">{e.eventType || 'Activity'}</span><span className={`cal-published-badge ${e.isPublished ? 'published' : 'pending'}`}>{e.isPublished ? 'Published' : 'Draft'}</span></div>
            <h3>{e.title}</h3><time>{fmtDate(e.startDate, e.endDate)}</time>{e.slotName && <span>{e.slotName}</span>}{e.description && <p>{e.description}</p>}
          </div><div className="cal-event-actions"><button className="cal-action-btn" onClick={() => openEditor(e)} aria-label="Edit activity"><i className="ti ti-edit" /></button><button className="cal-action-btn delete" onClick={() => remove(e)} aria-label="Delete activity"><i className="ti ti-trash" /></button></div>
        </article>)}{state === 'ready' && !sidebarEvents.length && <Empty className="cal-empty">{selectedDate ? 'No activities on this day.' : 'No activities this month.'}</Empty>}</div>
      </aside>
    </section>
  </div></main>
  {form && <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setForm(null)}><section className="modal-card calendar-event-modal">
    <header className="modal-header"><h2>{form.id ? 'Edit Activity' : 'Add Activity'}</h2><button onClick={() => setForm(null)} aria-label="Close">×</button></header>
    <form onSubmit={save}><label>Activity Title<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required maxLength="200" /></label>
      <label>Activity Type<Select value={form.eventType} onChange={e => setForm({ ...form, eventType: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</Select></label>
      <div className="form-row"><label>Start Date<DateInput type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required /></label><label>End Date<DateInput type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} required /></label></div>
      {['Session Schedule', 'Deadline', 'Period'].includes(form.eventType) && <label>{form.eventType === 'Period' ? 'Exam Period' : 'Mentoring Slot'}<Select value={form.slotName} onChange={e => setForm({ ...form, slotName: e.target.value })}><option value="">Choose slot</option>{(form.eventType === 'Period' ? EXAM_PERIODS : settings?.Semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS).map(x => <option key={x}>{x}</option>)}</Select></label>}
      <label>Description<textarea rows="4" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <div className="modal-actions"><button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Update Activity' : 'Save Activity'}</button></div>
    </form>
  </section></div>}
  {sheetHtml && <div className="modal-overlay open" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSheetHtml(''); }}>
    <section className="modal-card calendar-event-modal" role="dialog" aria-modal="true" aria-label="Calendar sheet preview">
      <header className="modal-header"><h2>Calendar Sheet Preview</h2><button type="button" onClick={() => setSheetHtml('')} aria-label="Close">×</button></header>
      <iframe title="Printable calendar sheet" srcDoc={sheetHtml} style={{ width: '100%', height: '65vh', border: 0 }} />
      <div className="modal-actions"><button type="button" className="btn-outline" onClick={() => setSheetHtml('')}>Close</button><button type="button" className="btn-primary" onClick={publishAll}><i className="ti ti-world-upload" /> Publish to Mentors</button></div>
    </section>
  </div>}
  </Page>;
}
