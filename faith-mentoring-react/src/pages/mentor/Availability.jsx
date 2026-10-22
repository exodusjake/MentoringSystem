import { useEffect, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import DateInput from '../../components/DateInput.jsx';
import { ConfirmX } from '../../components/ConfirmX.jsx';
import { showToast } from '../../components/Notify.jsx';
import Select from '../../components/Select.jsx';
import TimeInput from '../../components/TimeInput.jsx';
import { apiRequest } from '../../lib/api.js';
import { checkpointToday } from '../../lib/checkpoint-window.js';
import { getSession } from '../../lib/session.js';

// Availability (MENTOR/HTML/availability.html + availability.js).

// Mirrors the backend's Constants/MentoringSlots.cs.
const MENTORING_SLOTS = ['Mentoring Assembly', 'Before Prelims', 'After Prelims', 'Before Midterms', 'After Midterms', 'Before Finals'];
const slotsForSemester = semester => semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.toString().split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}
const initials = name => name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || 'M';
function timeAgo(dt) {
  // SessionRequests.RequestedAt is written by GETDATE() on the UTC SQL server and serialized
  // without an offset; only this field needs UTC qualification.
  const value = String(dt ?? '').trim();
  const timestamp = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z').getTime();
  if (!value || !Number.isFinite(timestamp)) return '';
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

let rowSeq = 0;
const newRow = () => ({ id: ++rowSeq, start: '' });
// The start-time list is empty until the modal is first opened.
const closedPost = { open: false, slotName: '', date: '', dateDisabled: true, min: undefined, max: undefined, hint: null, rows: [], error: '', posting: false };

export default function MentorAvailability() {
  const [user] = useState(() => getSession()?.user);
  const period = useRef({ schoolYear: '2026-2027', semester: '1st Semester' });
  // SlotName -> { startDate, endDate }: this semester's Admin-set Session Schedule window per
  // checkpoint. Only constrains/hints the date picker; the server enforces it.
  const [slotWindows, setSlotWindows] = useState(null);
  const [slots, setSlots] = useState({ state: 'loading' });       // loading | ok | error
  const [open, setOpen] = useState({ reqs: true, past: false });
  const [post, setPost] = useState(closedPost);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function loadSlots() {
    try {
      const data = await apiRequest(`AvailabilityWorkflow/mentor/${user?.userID}/slots`, 'GET', null, true);
      setSlots({ state: 'ok', all: Array.isArray(data) ? data : [] });
    } catch (e) {
      console.error('Failed to load slots:', e);
      setSlots({ state: 'error' });
      showToast('Failed to load your availability slots. Please refresh.');
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest('Settings', 'GET', null, true);
        if (data?.SchoolYear) period.current.schoolYear = data.SchoolYear;
        if (data?.Semester) period.current.semester = data.Semester;
      } catch { /* keep defaults */ }
      const windows = {};
      try {
        const events = await apiRequest('CalendarEvents', 'GET', null, true) || [];
        events
          .filter(ev => ev.eventType === 'Session Schedule' && ev.schoolYear === period.current.schoolYear && ev.semester === period.current.semester)
          .forEach(ev => { windows[ev.slotName] = { startDate: ev.startDate, endDate: ev.endDate }; });
      } catch (e) { console.error('Failed to load checkpoint windows:', e); }
      setSlotWindows(windows);
      await loadSlots();
    })();
  }, []);

  // ── Post slot modal ──
  function openPostModal() {
    setPost({ ...closedPost, rows: [newRow()], open: true });
  }
  const closePostModal = () => setPost(p => ({ ...p, open: false }));

  // Constrain posting to the Admin session window.
  function onSlotNameChange(name) {
    setPost(p => {
      if (!name) return { ...p, slotName: name, dateDisabled: true, date: '', hint: null };
      const w = slotWindows?.[name];
      const today = checkpointToday();
      const min = w && String(w.startDate).slice(0, 10) > today ? String(w.startDate).slice(0, 10) : today;
      const max = w ? String(w.endDate || w.startDate).slice(0, 10) : '';
      const fmt = iso => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
      const hint = w
        ? `${name}'s window: ${fmt(w.startDate)} – ${fmt(w.endDate)}. Choose a date within this window.`
        : `Admin hasn't scheduled ${name} yet this semester — posting is unavailable until they do.`;
      return { ...p, slotName: name, min, max, dateDisabled: !w || today > max, hint };
    });
  }

  function addTimeRange() {
    setPost(p => ({ ...p, rows: [...p.rows, newRow()] }));
    if (post.rows.length + 1 > 1) showToast('Start time added.', 'info', 2000);
  }
  function removeTimeRange(id) {
    if (post.rows.length <= 1) return;
    setPost(p => ({ ...p, rows: p.rows.filter(r => r.id !== id) }));
    showToast('Start time removed.', 'info', 2000);
  }
  const setRowStart = (id, start) => setPost(p => ({ ...p, rows: p.rows.map(r => r.id === id ? { ...r, start } : r) }));
  const showPostError = msg => setPost(p => ({ ...p, error: msg }));

  async function submitSlots() {
    const { slotName, date, rows } = post;
    if (!slotName) { showPostError('Please select which checkpoint this slot is for.'); return; }
    if (!date) { showPostError('Please select a date.'); return; }
    if (!rows.length) { showPostError('Add at least one start time.'); return; }
    const timeRanges = [];
    for (const row of rows) {
      if (!row.start) { showPostError('Please fill in each start time.'); return; }
      timeRanges.push({ start: row.start });
    }
    setPost(p => ({ ...p, posting: true }));
    try {
      for (const range of timeRanges) {
        await apiRequest(`AvailabilityWorkflow/mentor/${user.userID}/slots`, 'POST', { availableDate: date, startTime: range.start, slotName }, true);
      }
      setPost(p => ({ ...p, open: false, posting: false }));
      showToast(`${timeRanges.length} slot${timeRanges.length !== 1 ? 's' : ''} posted successfully.`, 'success');
      await loadSlots();
    } catch (err) {
      setPost(p => ({ ...p, error: err.message || 'Failed to post slot.', posting: false }));
      showToast(err.message || 'Failed to post slot.');
    }
  }

  // ── Delete slot ──
  async function confirmDeleteSlot() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiRequest(`AvailabilityWorkflow/mentor/${user.userID}/slots/${deleteId}`, 'DELETE', null, true);
      setDeleteOpen(false);
      showToast('Availability slot deleted.', 'success');
      await loadSlots();
    } catch (err) {
      showToast(err.message || 'Could not delete slot.');
    } finally {
      setDeleting(false);
    }
  }

  // ── Derived lists ──
  let activeSlots = [], pastSlots = [], bookings = [];
  if (slots.state === 'ok') {
    // Each slot shown once regardless of how many mentees booked it.
    const seen = new Set(), unique = [];
    slots.all.forEach(s => { if (!seen.has(s.availabilityID)) { seen.add(s.availabilityID); unique.push(s); } });
    const today = startOfToday();
    activeSlots = unique.filter(s => new Date(s.availableDate) >= today);
    pastSlots = unique.filter(s => new Date(s.availableDate) < today);
    // Read-only roster: a request books its slot the instant it's submitted.
    bookings = slots.all.filter(s => s.requestID && s.requestStatus === 'Approved' && s.linkedSessionID &&
      s.linkedSessionStatus !== 'Cancelled' && new Date(s.availableDate) >= today);
  }
  const loaded = slots.state === 'ok';
  const hide = { display: 'none' };

  return (
    <Page id="MENTOR/availability">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Availability</h1>
              {' '}
              <p>Post open time slots so your mentees can request a session.</p>
            </div>
            {' '}
            <button className="btn-post-slot" onClick={openPostModal}>
              <i className="ti ti-plus"></i>
              {' '}Post Slot
            </button>
          </div>
          {' '}
          {/* ── MY SLOTS ── */}
          <div className="avail-section-title">
            <i className="ti ti-calendar-event"></i>
            {' '}Open Slots
          </div>
          {' '}
          <div id="slotsLoading" className="avail-loading" style={loaded ? hide : undefined}>
            {slots.state === 'error' ? 'Failed to load slots.' : <><span className="spinner"></span>{' '}Loading slots...</>}
          </div>
          {' '}
          <div id="slotsEmpty" className="avail-empty" style={loaded && !activeSlots.length ? { display: 'block' } : hide}>
            <i className="ti ti-calendar-plus"></i>
            {' '}
            <p>No open slots yet — click <strong>Post Slot</strong> to add one.</p>
          </div>
          {' '}
          <div id="slotsGrid" className="avail-grid" style={loaded && activeSlots.length ? { display: 'flex' } : hide}>
            {activeSlots.map(s => <SlotCard key={s.availabilityID} slot={s} isPast={false} onDelete={id => { setDeleteId(id); setDeleteOpen(true); }} />)}
          </div>
          {' '}
          {/* ── COLLAPSIBLE SECTIONS ── */}
          <div className="avail-collapsibles">
            {/* Recent Bookings — read-only roster of who's attending each posted slot. */}
            <div className={'avail-collapsible' + (open.reqs ? ' is-open' : '')} id="reqsCollapsible">
              <button className="avail-collapse-hdr" onClick={() => setOpen(o => ({ ...o, reqs: !o.reqs }))}>
                <span className="coll-title">
                  <i className="ti ti-inbox"></i>
                  {' '}Recent Bookings
                </span>
                {' '}
                <span className="coll-right">
                  <i className="ti ti-chevron-down coll-chevron"></i>
                </span>
              </button>
              {' '}
              <div className="avail-collapse-body" style={open.reqs ? undefined : hide}>
                <div id="reqsLoading" className="avail-loading" style={loaded ? hide : undefined}>
                  <span className="spinner"></span>
                  {' '}Loading bookings...
                </div>
                {' '}
                <div id="reqsEmpty" className="avail-empty" style={loaded && !bookings.length ? { display: 'block' } : hide}>
                  <i className="ti ti-calendar-check"></i>
                  {' '}
                  <p>No one has booked a slot yet.</p>
                </div>
                {' '}
                <div id="reqsList" className="reqs-list" style={loaded && bookings.length ? { display: 'flex' } : hide}>
                  {bookings.map((slot, i) => <BookingCard key={i} slot={slot} />)}
                </div>
              </div>
            </div>
            {' '}
            {/* Past Slots — starts collapsed, hidden until there are past slots */}
            <div className={'avail-collapsible' + (open.past ? ' is-open' : '')} id="pastCollapsible" style={loaded && pastSlots.length ? { display: 'block' } : hide}>
              <button className="avail-collapse-hdr" onClick={() => setOpen(o => ({ ...o, past: !o.past }))}>
                <span className="coll-title">
                  <i className="ti ti-history"></i>
                  {' '}Past Slots
                </span>
                {' '}
                <i className="ti ti-chevron-down coll-chevron"></i>
              </button>
              {' '}
              <div className="avail-collapse-body" style={open.past ? undefined : hide}>
                <div id="pastSlotsList" className="avail-grid">
                  {pastSlots.map(s => <SlotCard key={s.availabilityID} slot={s} isPast onDelete={id => { setDeleteId(id); setDeleteOpen(true); }} />)}
                </div>
              </div>
            </div>
          </div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* ── POST SLOT MODAL ── */}
      <div id="postModal" className={'modal-overlay' + (post.open ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) closePostModal(); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={closePostModal}><i className="ti ti-x"></i></button>
          {' '}
          <h2 className="modal-title">Post Available Slots</h2>
          {' '}
          <p className="modal-subtitle">Choose a date and start time. The end time is recorded when you finish the session.</p>
          {' '}
          <div id="postError" className="form-error" style={post.error ? { display: 'block' } : hide}>{post.error}</div>
          {' '}
          <div className="modal-form">
            <div className="form-group">
              <label>Checkpoint</label>
              {' '}
              <Select id="slotName" value={post.slotName} onChange={e => onSlotNameChange(e.target.value)}>
                <option value="">Select a checkpoint…</option>
                {slotWindows && slotsForSemester(period.current.semester).map(name => {
                  const w = slotWindows[name];
                  const closed = w && checkpointToday() > String(w.endDate || w.startDate).slice(0, 10);
                  return <option key={name} value={name} disabled={!w || closed}>{name}{!w ? ' (Not scheduled)' : closed ? ' (Closed)' : ''}</option>;
                })}
              </Select>
              {' '}
              <p id="slotWindowHint" className="field-hint" style={post.hint ? { display: 'block' } : hide}>{post.hint}</p>
            </div>
            {' '}
            <div className="form-group">
              <label>Date</label>
              {' '}
              <DateInput type="date" id="slotDate" disabled={post.dateDisabled} min={post.min} max={post.max}
                value={post.date} onChange={e => { const v = e.target.value; setPost(p => ({ ...p, date: v })); }} />
            </div>
            {' '}
            <div id="timeRangesList" className="time-ranges-list">
              {post.rows.map(row => (
                <div key={row.id} className="time-range-row">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Start Time</label>
                      {' '}
                      <TimeInput type="time" className="slot-start" value={row.start} onChange={e => setRowStart(row.id, e.target.value)} />
                    </div>
                  </div>
                  {' '}
                  <button type="button" className="btn-remove-range" title="Remove" onClick={() => removeTimeRange(row.id)}
                    style={{ visibility: post.rows.length <= 1 ? 'hidden' : 'visible' }}>
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
              ))}
            </div>
            {' '}
            <button type="button" className="btn-add-range" onClick={addTimeRange}>
              <i className="ti ti-plus"></i>
              {' '}Add Another Start Time
            </button>
          </div>
          {' '}
          <div className="modal-footer">
            <button className="btn-cancel" onClick={closePostModal}>Cancel</button>
            {' '}
            <button className="btn-save" id="postBtn" onClick={submitSlots} disabled={post.posting}>{post.posting ? 'Posting...' : 'Post Slots'}</button>
          </div>
        </div>
      </div>

      {/* ── DELETE SLOT CONFIRM MODAL ── */}
      <div id="deleteSlotModal" className={'modal-overlay' + (deleteOpen ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) setDeleteOpen(false); }}>
        <div className="modal-card modal-card-sm" data-astra-confirm="1" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-red" data-ac="icon">
            <i className="ti ti-trash"></i>
          </div>
          {' '}
          <h3 className="confirm-title" data-ac="title">Delete Availability Slot?</h3>
          {' '}
          <p className="confirm-body" data-ac="body">Delete this availability slot? This cannot be undone.</p>
          {' '}
          <div className="confirm-actions" data-ac="actions">
            <button className="btn-form-cancel" onClick={() => setDeleteOpen(false)}>Cancel</button>
            {' '}
            <button className="btn-confirm-danger" id="confirmDeleteSlotBtn" onClick={confirmDeleteSlot} disabled={deleting}>
              <i className="ti ti-trash"></i>
              {' '}Delete
            </button>
          </div>
          <ConfirmX onClick={() => setDeleteOpen(false)} />
        </div>
      </div>
    </Page>
  );
}

function SlotCard({ slot, isPast, onDelete }) {
  const d = new Date(slot.availableDate);
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  // Open (nobody's booked it yet) vs Session Created (approvedMentees is populated) vs Expired.
  let cardCls, statusLabel;
  if (slot.linkedSessionStatus === 'Cancelled') {
    cardCls = 'slot-expired'; statusLabel = 'Cancelled';
  } else if (!slot.linkedSessionID && slot.approvedMentees) {
    cardCls = 'slot-expired'; statusLabel = 'Session Deleted';
  } else if (isPast) {
    cardCls = slot.approvedMentees ? 'slot-session-created' : 'slot-expired';
    statusLabel = slot.approvedMentees ? 'Session Created' : 'Expired';
  } else if (slot.approvedMentees) {
    cardCls = 'slot-session-created'; statusLabel = 'Session Created';
  } else {
    cardCls = 'slot-open'; statusLabel = 'Open';
  }
  return (
    <div className={`slot-card ${cardCls}${isPast ? ' slot-past' : ''}`}>
      {/* Only an actual linked session hides the slot cleanup action. */}
      {!slot.linkedSessionID
        ? <button className="slot-delete-btn" title="Delete slot" onClick={() => onDelete(slot.availabilityID)}><i className="ti ti-trash"></i></button>
        : <a className="slot-delete-btn" href="/mentor/sessions" title="Cancel or delete in Sessions" aria-label="Manage session" style={{ fontSize: '12px', color: '#0f766e' }}>Manage Session{' '}<i className="ti ti-external-link"></i></a>}
      {' '}
      <div className="slot-cal-block">
        <span className="slot-cal-month">{month}</span>
        {' '}
        <span className="slot-cal-day">{d.getDate()}</span>
      </div>
      {' '}
      <div className="slot-body">
        <div className="slot-status-row">
          <span className="slot-status-dot"></span>
          {' '}
          <span className="slot-status-label">{statusLabel}</span>
        </div>
        {' '}
        <div className="slot-time"><i className="ti ti-clock"></i>{' ' + fmtTime(slot.startTime)}</div>
        {' '}
        {slot.slotName && <span className="slot-name-tag">{slot.slotName}</span>}
        {' '}
        {slot.isClosed && <span className="slot-late-tag" title="Checkpoint session window is closed">Closed</span>}
        {' '}
        {slot.approvedMentees && <div className="slot-approved-names"><i className="ti ti-user-check"></i>{' ' + slot.approvedMentees}</div>}
      </div>
    </div>
  );
}

function BookingCard({ slot }) {
  const meta = [slot.sectionCode, slot.studentNumber].filter(Boolean).join(' · ');
  const ago = slot.requestedAt ? timeAgo(slot.requestedAt) : '';
  return (
    <div className="req-card req-card-approved">
      <div className="req-avatar">{initials(slot.menteeName || '')}</div>
      {' '}
      <div className="req-info">
        <div className="req-name">{slot.menteeName || 'Mentee'}</div>
        {' '}
        {meta && <div className="req-meta">{meta}</div>}
        {' '}
        <div className="req-slot"><i className="ti ti-calendar-event"></i>{` ${fmtDate(slot.availableDate)}, ${fmtTime(slot.startTime)}`}</div>
        {' '}
        {slot.purpose && <div className="req-purpose">{`"${slot.purpose}"`}</div>}
        {' '}
        {ago && <div className="req-meta" style={{ marginTop: '4px' }}>{ago}</div>}
      </div>
      {' '}
      <div className="req-approved-badge"><i className="ti ti-check"></i>{' '}Booked</div>
    </div>
  );
}
