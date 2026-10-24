import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import DateInput from '../../components/DateInput.jsx';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import TimeInput from '../../components/TimeInput.jsx';
import { apiRequest } from '../../lib/api.js';
import { checkpointToday } from '../../lib/checkpoint-window.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';
import { sampleHtml, useTour } from '../../app/tour.js';
import { MENTOR_SAMPLE as SM } from '../../app/tourMentor.js';

// MENTOR/HTML/availability.html + MENTOR/JS/availability.js

// Mirrors AstraMentoring-Backend/.../Constants/MentoringSlots.cs.
const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals'
];
function slotsForSemester(semester) {
  return semester === '2nd Semester' ? MENTORING_SLOTS.slice(1) : MENTORING_SLOTS;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.toString().split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12  = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}
function initials(name) {
  return name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || 'M';
}
function timeAgo(dt) {
  // SessionRequests.RequestedAt is written by GETDATE() on the verified UTC SQL server.
  // SQL DATETIME is serialized without an offset; only this field needs UTC qualification.
  const value = String(dt ?? '').trim();
  const timestamp = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + 'Z').getTime();
  if (!value || !Number.isFinite(timestamp)) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SlotCard({ slot, isPast, onDelete }) {
  const d = new Date(slot.availableDate);
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = d.getDate();
  const timeStr = fmtTime(slot.startTime);

  // A slot is Open (nobody's booked it yet) vs Session Created (approvedMentees is populated) vs Expired.
  let cardCls, statusLabel;
  if (slot.linkedSessionStatus === 'Cancelled') {
    cardCls = 'slot-expired'; statusLabel = 'Cancelled';
  } else if (!slot.linkedSessionID && slot.approvedMentees) {
    cardCls = 'slot-expired'; statusLabel = 'Session Deleted';
  } else if (isPast) {
    cardCls     = slot.approvedMentees ? 'slot-session-created' : 'slot-expired';
    statusLabel = slot.approvedMentees ? 'Session Created' : 'Expired';
  } else if (slot.approvedMentees) {
    cardCls     = 'slot-session-created';
    statusLabel = 'Session Created';
  } else {
    cardCls     = 'slot-open';
    statusLabel = 'Open';
  }

  return (
    <div className={`slot-card ${cardCls}${isPast ? ' slot-past' : ''}`}>
      {!slot.linkedSessionID
        ? <button className="slot-delete-btn" title="Delete slot" onClick={() => onDelete(slot.availabilityID)}><i className="ti ti-trash"></i></button>
        : <Link className="slot-manage-btn" to="/mentor/sessions" title="Cancel or delete in Sessions" aria-label="Manage session"><i className="ti ti-settings-2"></i> Manage Session <i className="ti ti-arrow-right slot-manage-arrow"></i></Link>}
      <div className="slot-cal-block">
        <span className="slot-cal-month">{month}</span>
        <span className="slot-cal-day">{day}</span>
      </div>
      <div className="slot-body">
        <div className="slot-status-row">
          <span className="slot-status-dot"></span>
          <span className="slot-status-label">{statusLabel}</span>
        </div>
        <div className="slot-time"><i className="ti ti-clock"></i> {timeStr}</div>
        {slot.slotName ? <span className="slot-name-tag">{slot.slotName}</span> : null}
        {slot.isClosed ? <span className="slot-late-tag" title="Checkpoint session window is closed">Closed</span> : null}
        {slot.approvedMentees ? <div className="slot-approved-names"><i className="ti ti-user-check"></i> {slot.approvedMentees}</div> : null}
      </div>
    </div>
  );
}

let rangeSeq = 0;

export default function Availability() {
  useBackGuard();
  const wt = useTour().active;   // walkthrough: show sample data
  const currentUser = getSession()?.user;
  const [period, setPeriod] = useState({ schoolYear: '2026-2027', semester: '1st Semester' });
  const [slotWindows, setSlotWindows] = useState({});        // SlotName -> { startDate, endDate }
  const [windowsLoaded, setWindowsLoaded] = useState(false);
  const [allSlots, setAllSlots] = useState(null);            // null loading, false failed
  const [reqsReady, setReqsReady] = useState(false);
  const [reqsOpen, setReqsOpen] = useState(true);
  const [pastOpen, setPastOpen] = useState(false);

  const [postOpen, setPostOpen] = useState(false);
  const [slotName, setSlotName] = useState('');
  const [slotDate, setSlotDate] = useState('');
  const [ranges, setRanges] = useState([{ id: ++rangeSeq, start: '' }]);
  const [postError, setPostError] = useState('');
  const [posting, setPosting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const periodRef = useRef(period);

  async function loadSlots() {
    try {
      const data = await apiRequest(`AvailabilityWorkflow/mentor/${currentUser?.userID}/slots`, 'GET', null, true);
      setAllSlots(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load slots:', e);
      setAllSlots(false);
      showToast('Failed to load your availability slots. Please refresh.');
    }
  }

  useEffect(() => {
    (async () => {
      let p = period;
      try {
        const data = await apiRequest('Settings', 'GET', null, true);
        p = { schoolYear: data?.SchoolYear || p.schoolYear, semester: data?.Semester || p.semester };
        setPeriod(p);
        periodRef.current = p;
      } catch (e) { /* keep defaults */ }
      try {
        const events = await apiRequest('CalendarEvents', 'GET', null, true) || [];
        const w = {};
        events
          .filter(ev => ev.eventType === 'Session Schedule' && ev.schoolYear === p.schoolYear && ev.semester === p.semester)
          .forEach(ev => { w[ev.slotName] = { startDate: ev.startDate, endDate: ev.endDate }; });
        setSlotWindows(w);
      } catch (e) { console.error('Failed to load checkpoint windows:', e); }
      setWindowsLoaded(true);
      setReqsReady(true);
      await loadSlots();
    })();
  }, []);

  // ── slots ──
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  let uniqueSlots = [];
  if (Array.isArray(allSlots)) {
    // Deduplicate — each slot shown once regardless of how many mentees booked it
    const seen = new Set();
    allSlots.forEach(s => { if (!seen.has(s.availabilityID)) { seen.add(s.availabilityID); uniqueSlots.push(s); } });
  }
  const activeSlots = uniqueSlots.filter(s => new Date(s.availableDate) >= today0);
  const pastSlots = uniqueSlots.filter(s => new Date(s.availableDate) < today0);
  const slotsLoaded = Array.isArray(allSlots);

  // Read-only roster — a request books its slot the instant it's submitted.
  const bookings = slotsLoaded ? allSlots.filter(s => s.requestID &&
    s.requestStatus === 'Approved' && s.linkedSessionID && s.linkedSessionStatus !== 'Cancelled' &&
    new Date(s.availableDate) >= today0) : [];

  // ── post modal ──
  function openPostModal() {
    setPostError('');
    setSlotName('');
    setSlotDate('');
    setRanges([{ id: ++rangeSeq, start: '' }]);
    setPostOpen(true);
  }
  function changeSlotName(name) {
    setSlotName(name);
    if (!name) setSlotDate('');
  }
  const win = slotWindows[slotName];
  const todayIso = checkpointToday();
  let dateMin, dateMax, dateDisabled = true, hint = null;
  if (slotName) {
    dateMin = win && String(win.startDate).slice(0, 10) > todayIso ? String(win.startDate).slice(0, 10) : todayIso;
    dateMax = win ? String(win.endDate || win.startDate).slice(0, 10) : '';
    dateDisabled = !win || todayIso > dateMax;
    if (win) {
      const fmt = iso => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
      hint = `${slotName}'s window: ${fmt(win.startDate)} – ${fmt(win.endDate)}. Choose a date within this window.`;
    } else {
      hint = `Admin hasn't scheduled ${slotName} yet this semester — posting is unavailable until they do.`;
    }
  }

  function addTimeRange() {
    setRanges(r => [...r, { id: ++rangeSeq, start: '' }]);
    showToast('Start time added.', 'info', 2000);
  }
  function removeTimeRange(id) {
    if (ranges.length <= 1) return;
    setRanges(r => r.filter(x => x.id !== id));
    showToast('Start time removed.', 'info', 2000);
  }

  async function submitSlots() {
    if (!slotName) { setPostError('Please select which checkpoint this slot is for.'); return; }
    if (!slotDate) { setPostError('Please select a date.'); return; }
    if (!ranges.length) { setPostError('Add at least one start time.'); return; }
    for (const r of ranges) {
      if (!r.start) { setPostError('Please fill in each start time.'); return; }
    }
    setPosting(true);
    try {
      for (const r of ranges) {
        await apiRequest(`AvailabilityWorkflow/mentor/${currentUser.userID}/slots`, 'POST',
          { availableDate: slotDate, startTime: r.start, slotName }, true);
      }
      setPostOpen(false);
      showToast(`${ranges.length} slot${ranges.length !== 1 ? 's' : ''} posted successfully.`, 'success');
      await loadSlots();
    } catch (err) {
      setPostError(err.message || 'Failed to post slot.');
      showToast(err.message || 'Failed to post slot.');
    } finally {
      setPosting(false);
    }
  }

  async function confirmDeleteSlot() {
    if (!deleteId) return;
    setDeleteBusy(true);
    try {
      await apiRequest(`AvailabilityWorkflow/mentor/${currentUser.userID}/slots/${deleteId}`, 'DELETE', null, true);
      setDeleteId(null);
      showToast('Availability slot deleted.', 'success');
      await loadSlots();
    } catch (err) {
      showToast(err.message || 'Could not delete slot.');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <Page id="MENTOR/availability">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Availability</h1>
              <p>Post open time slots so your mentees can request a session.</p>
            </div>
            <button className="btn-post-slot" onClick={openPostModal}>
              <i className="ti ti-plus"></i> Post Slot
            </button>
          </div>

          <div className="avail-section-title">
            <i className="ti ti-calendar-event"></i>
            Open Slots
          </div>
          <div id="slotsLoading" className="avail-loading" style={{ display: wt || slotsLoaded ? 'none' : undefined }}>
            {allSlots === false ? 'Failed to load slots.' : <><span className="spinner"></span> Loading slots...</>}
          </div>
          <div id="slotsEmpty" className="avail-empty" style={{ display: !wt && slotsLoaded && !activeSlots.length ? 'block' : 'none' }}>
            <i className="ti ti-calendar-plus"></i>
            <p>No open slots yet — click <strong>Post Slot</strong> to add one.</p>
          </div>
          <div id="slotsGrid" className="avail-grid" style={{ display: wt || (slotsLoaded && activeSlots.length) ? 'flex' : 'none' }} key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, SM.availability.slots)}>
            {wt ? undefined : activeSlots.map(s => <SlotCard slot={s} isPast={false} onDelete={setDeleteId} key={s.availabilityID} />)}
          </div>

          <div className="avail-collapsibles">
            {/* Recent Bookings — read-only roster of who's attending each posted slot. */}
            <div className={`avail-collapsible${reqsOpen ? ' is-open' : ''}`} id="reqsCollapsible">
              <button className="avail-collapse-hdr" onClick={() => setReqsOpen(o => !o)}>
                <span className="coll-title">
                  <i className="ti ti-inbox"></i>
                  Recent Bookings
                </span>
                <span className="coll-right">
                  <i className="ti ti-chevron-down coll-chevron"></i>
                </span>
              </button>
              <div className="avail-collapse-body" style={{ display: reqsOpen ? '' : 'none' }}>
                <div id="reqsLoading" className="avail-loading" style={{ display: reqsReady ? 'none' : undefined }}><span className="spinner"></span> Loading bookings...</div>
                <div id="reqsEmpty" className="avail-empty" style={{ display: reqsReady && !bookings.length ? 'block' : 'none' }}>
                  <i className="ti ti-calendar-check"></i>
                  <p>No one has booked a slot yet.</p>
                </div>
                <div id="reqsList" className="reqs-list" style={{ display: reqsReady && bookings.length ? 'flex' : 'none' }}>
                  {bookings.map(slot => {
                    const meta = [slot.sectionCode, slot.studentNumber].filter(Boolean).join(' · ');
                    const ago = slot.requestedAt ? timeAgo(slot.requestedAt) : '';
                    return (
                      <div className="req-card req-card-approved" key={`${slot.availabilityID}-${slot.requestID}`}>
                        <div className="req-avatar">{initials(slot.menteeName || '')}</div>
                        <div className="req-info">
                          <div className="req-name">{slot.menteeName || 'Mentee'}</div>
                          {meta ? <div className="req-meta">{meta}</div> : null}
                          <div className="req-slot"><i className="ti ti-calendar-event"></i> {fmtDate(slot.availableDate)}, {fmtTime(slot.startTime)}</div>
                          {slot.purpose ? <div className="req-purpose">"{slot.purpose}"</div> : null}
                          {ago ? <div className="req-meta" style={{ marginTop: '4px' }}>{ago}</div> : null}
                        </div>
                        <div className="req-approved-badge"><i className="ti ti-check"></i> Booked</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Past Slots — starts collapsed, hidden until there are past slots */}
            <div className={`avail-collapsible${pastOpen ? ' is-open' : ''}`} id="pastCollapsible" style={{ display: pastSlots.length ? 'block' : 'none' }}>
              <button className="avail-collapse-hdr" onClick={() => setPastOpen(o => !o)}>
                <span className="coll-title">
                  <i className="ti ti-history"></i>
                  Past Slots
                </span>
                <i className="ti ti-chevron-down coll-chevron"></i>
              </button>
              <div className="avail-collapse-body" style={{ display: pastOpen ? '' : 'none' }}>
                <div id="pastSlotsList" className="avail-grid">
                  {pastSlots.map(s => <SlotCard slot={s} isPast={true} onDelete={setDeleteId} key={s.availabilityID} />)}
                </div>
              </div>
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Post Slot Modal */}
      <Overlay open={postOpen} className="modal-overlay" activeClass="open" id="postModal"
        onClick={e => { if (e.target === e.currentTarget) setPostOpen(false); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setPostOpen(false)}><i className="ti ti-x"></i></button>
          <h2 className="modal-title">Post Available Slots</h2>
          <p className="modal-subtitle">Choose a date and start time. The end time is recorded when you finish the session.</p>
          <div id="postError" className="form-error" style={{ display: postError ? 'block' : 'none' }}>{postError}</div>
          <div className="modal-form">
            <div className="form-group">
              <label>Checkpoint</label>
              <Select id="slotName" value={slotName} onChange={e => changeSlotName(e.target.value)}>
                <option value="">Select a checkpoint…</option>
                {windowsLoaded ? slotsForSemester(period.semester).map(name => {
                  const w = slotWindows[name];
                  const closed = w && todayIso > String(w.endDate || w.startDate).slice(0, 10);
                  return <option value={name} key={name} disabled={!w || !!closed}>{name}{!w ? ' (Not scheduled)' : closed ? ' (Closed)' : ''}</option>;
                }) : null}
              </Select>
              <p id="slotWindowHint" className="field-hint" style={{ display: hint ? 'block' : 'none' }}>{hint}</p>
            </div>
            <div className="form-group">
              <label>Date</label>
              <DateInput type="date" id="slotDate" disabled={dateDisabled} min={dateMin} max={dateMax || undefined}
                value={slotDate} onChange={e => setSlotDate(e.target.value)} />
            </div>
            <div id="timeRangesList" className="time-ranges-list">
              {ranges.map(r => (
                <div className="time-range-row" key={r.id}>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Start Time</label>
                      <TimeInput className="slot-start" value={r.start} onChange={e => setRanges(rs => rs.map(x => x.id === r.id ? { ...x, start: e.target.value } : x))} />
                    </div>
                  </div>
                  <button type="button" className="btn-remove-range" onClick={() => removeTimeRange(r.id)} title="Remove"
                    style={{ visibility: ranges.length <= 1 ? 'hidden' : 'visible' }}>
                    <i className="ti ti-trash"></i>
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-add-range" onClick={addTimeRange}>
              <i className="ti ti-plus"></i> Add Another Start Time
            </button>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={() => setPostOpen(false)}>Cancel</button>
            <button className="btn-save" id="postBtn" onClick={submitSlots} disabled={posting}>{posting ? 'Posting...' : 'Post Slots'}</button>
          </div>
        </div>
      </Overlay>

      {/* Delete Slot Confirm Modal */}
      <Overlay open={deleteId !== null} className="modal-overlay" activeClass="open" id="deleteSlotModal"
        onClick={e => { if (e.target === e.currentTarget) setDeleteId(null); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-red">
            <i className="ti ti-trash"></i>
          </div>
          <h3 className="confirm-title">Delete Availability Slot?</h3>
          <p className="confirm-body">Delete this availability slot? This cannot be undone.</p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => setDeleteId(null)}>Cancel</button>
            <button className="btn-confirm-danger" id="confirmDeleteSlotBtn" onClick={confirmDeleteSlot} disabled={deleteBusy}>
              <i className="ti ti-trash"></i> Delete
            </button>
          </div>
        </div>
      </Overlay>
    </Page>
  );
}
