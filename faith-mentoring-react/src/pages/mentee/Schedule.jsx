import { useEffect, useState } from 'react';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { apiRequest } from '../../lib/api.js';
import { getSession } from '../../lib/session.js';
import { SAMPLE } from './tour/samples.js';
import { useTour } from './tour/TourContext.js';

// Schedule a session (MENTEE/HTML/schedule-session.html + schedule-session.js): request one of
// the mentor's open slots (booked right away), plus the request history.
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '—');
const fmtDay = d => (d ? new Date(d).toLocaleDateString('en-PH', { weekday: 'long' }) : '');
function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.toString().split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export default function MenteeSchedule() {
  const tour = useTour();
  const [user] = useState(() => getSession()?.user);
  const [slots, setSlots] = useState({ state: 'loading' });       // loading | ok | error
  const [history, setHistory] = useState(null);                   // null until loaded (stays hidden on failure)
  const [request, setRequest] = useState(null);                   // { slot, desc } while the modal is open
  const [purpose, setPurpose] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function loadSlots() {
    setSlots(s => ({ ...s, state: 'loading' }));
    try {
      const data = await apiRequest(`AvailabilityWorkflow/mentee/${user.userID}/slots`, 'GET', null, true);
      setSlots({ state: 'ok', items: Array.isArray(data) ? data : [] });
    } catch (e) {
      setSlots({ state: 'error' });
    }
  }

  useEffect(() => {
    loadSlots();
    apiRequest(`AvailabilityWorkflow/mentee/${user.userID}/request-history`, 'GET', null, true)
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => {});   // non-critical — fail silently
  }, []);

  function openRequestModal(slot) {
    const dateStr = fmtDate(slot.availableDate), timeStr = fmtTime(slot.startTime);
    setRequest({ slot, desc: `${slot.mentorName || 'Your Mentor'} · ${dateStr}, ${timeStr}` });
    setPurpose('');
    setError('');
    setSending(false);
  }

  async function submitRequest() {
    if (!request) return;
    setSending(true);
    try {
      await apiRequest(`AvailabilityWorkflow/mentee/${user.userID}/request`, 'POST',
        { availabilityID: request.slot.availabilityID, purpose: purpose.trim() || null }, true);
      setRequest(null);
      await loadSlots();
    } catch (err) {
      setError(err.message || 'Failed to send request. Please try again.');
      setSending(false);
    }
  }

  // While the walkthrough runs, the slot list shows its sample card and the modal its sample slot.
  const sample = tour.sample;
  const modalOpen = sample ? tour.scheduleModal : !!request;
  const modalDesc = sample ? (tour.scheduleModal ? 'Maria Santos · November 12, 2026, 9:00 AM' : '—') : request ? request.desc : '—';
  const show = st => (st ? undefined : { display: 'none' });
  const loading = !sample && slots.state === 'loading';
  const failed = !sample && slots.state === 'error';
  const empty = !sample && slots.state === 'ok' && !slots.items.length;
  const grid = sample || (slots.state === 'ok' && slots.items.length > 0);

  return (
    <Page id="MENTEE/schedule-session">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Schedule a Session</h1>
              {' '}
              <p>Pick an available time slot your mentor has opened and submit a request.</p>
            </div>
          </div>
          {' '}
          {/* Info banner */}
          <div className="info-banner">
            <i className="ti ti-info-circle"></i>
            {' '}
            <span>
              Submitting a request books that slot right away — the session will appear in your Sessions page immediately.
            </span>
          </div>
          {' '}
          {/* Slots */}
          <div id="slotsLoading" className="sch-loading" style={{ display: loading || failed ? 'block' : 'none' }}>
            {failed ? 'Failed to load available slots. Please try again later.' : <><span className="spinner"></span>{' '}Loading available slots...</>}
          </div>
          {' '}
          <div id="slotsEmpty" className="sch-empty" style={{ display: empty ? 'block' : 'none' }}>
            <i className="ti ti-calendar-off"></i>
            {' '}
            <p>
              Your mentor has no open slots right now.
              <br />
              Check back later or reach out to your mentor directly.
            </p>
          </div>
          {' '}
          {sample
            ? <div id="slotsGrid" className="sch-grid" dangerouslySetInnerHTML={{ __html: tour.scheduleApproved ? SAMPLE.schedule.approved : SAMPLE.schedule.open }} />
            : (
              <div id="slotsGrid" className="sch-grid" style={{ display: grid ? 'grid' : 'none' }}>
                {grid && slots.items.map(slot => <SlotCard key={slot.availabilityID} slot={slot} onRequest={() => openRequestModal(slot)} />)}
              </div>
            )}
          {' '}
          {/* Request History */}
          <div id="historySection" className="hist-section" style={{ display: history ? 'block' : 'none' }}>
            <div className="hist-header">
              <div>
                <h2>Request History</h2>
                {' '}
                <p>Your past scheduling requests and their outcomes.</p>
              </div>
            </div>
            {' '}
            <div id="historyList" className="hist-list">
              {history && (history.length
                ? history.map(r => <HistoryItem key={r.requestID ?? `${r.availableDate}|${r.startTime}|${r.requestedAt}`} r={r} />)
                : <Empty className="hist-empty">No scheduling requests yet.</Empty>)}
            </div>
          </div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      {/* ── REQUEST MODAL ── */}
      <div id="requestModal" className={'modal-overlay' + (modalOpen ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) setRequest(null); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setRequest(null)}>
            <i className="ti ti-x"></i>
          </button>
          {' '}
          <h2 className="modal-title">Request Session</h2>
          {' '}
          <p className="modal-subtitle" id="requestSlotDesc">{modalDesc}</p>
          {' '}
          <div id="requestError" className="form-error" style={show(error)}>{error}</div>
          {' '}
          <div className="modal-form">
            <div className="form-group">
              <label>
                Purpose / Topic{' '}
                <span className="optional">(optional)</span>
              </label>
              {' '}
              <textarea id="requestPurpose" rows="3" placeholder="What do you want to discuss in this session?" value={purpose} onChange={e => setPurpose(e.target.value)} />
            </div>
          </div>
          {' '}
          <div className="modal-footer">
            <button className="btn-cancel" onClick={() => setRequest(null)}>Cancel</button>
            {' '}
            <button className="btn-save" id="requestBtn" disabled={sending} onClick={submitRequest}>{sending ? 'Sending...' : 'Send Request'}</button>
          </div>
        </div>
      </div>
    </Page>
  );
}

function SlotCard({ slot, onRequest }) {
  const mentorName = slot.mentorName || 'Your Mentor';
  const requested = !!slot.alreadyRequested;
  const approved = !!slot.alreadyApproved;
  const done = !!slot.checkpointCompleted;
  const badge = done ? <span className="sch-approved-badge"><i className="ti ti-check"></i> Checkpoint Completed</span>
    : approved ? <span className="sch-approved-badge"><i className="ti ti-check"></i> Session Approved</span>
    : requested ? <span className="sch-requested-badge">Requested</span>
    : <span className="sch-available-badge">Available</span>;
  const btn = done ? <button className="btn-request" disabled>Attendance Completed</button>
    : approved ? <button className="btn-request btn-request-approved" disabled><i className="ti ti-calendar-check"></i> Session Scheduled</button>
    : requested ? <button className="btn-request" disabled>Already Requested</button>
    : <button className="btn-request" onClick={onRequest}>{' '}Request This Slot{' '}</button>;
  return (
    <div className={'sch-slot-card' + (done || approved ? ' already-approved' : requested ? ' already-requested' : '')}>
      <div className="sch-slot-header">
        <span className="sch-slot-mentor">{mentorName}</span>
        {' '}{badge}
      </div>
      {' '}
      <div>
        <div className="sch-slot-date">{fmtDate(slot.availableDate)}</div>
        {' '}
        <div className="sch-slot-day">{fmtDay(slot.availableDate)}</div>
        {' '}
        {slot.slotName ? <span className="sch-slot-name-tag">{slot.slotName}</span> : null}
      </div>
      {' '}
      <div className="sch-slot-time">
        <i className="ti ti-clock"></i>
        {' '}{fmtTime(slot.startTime)}
      </div>
      {' '}
      {done ? <><p className="sch-checkpoint-completed">You have already completed attendance for this mentoring checkpoint.</p>{' '}</> : null}
      {btn}
    </div>
  );
}

const HIST_STATUS = {
  Pending: { cls: 'hist-badge-pending', label: 'Pending' },
  Approved: { cls: 'hist-badge-confirmed', label: 'Confirmed' },
  Declined: { cls: 'hist-badge-declined', label: 'Declined' },
};

function HistoryItem({ r }) {
  const reqDate = new Date(r.requestedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const { cls, label } = HIST_STATUS[r.status] || { cls: 'hist-badge-pending', label: r.status };
  return (
    <div className="hist-item">
      <div className="hist-item-left">
        <div className="hist-slot-date">{fmtDate(r.availableDate)}</div>
        {' '}
        {r.slotName ? <><span className="sch-slot-name-tag">{r.slotName}</span>{' '}</> : null}
        <div className="hist-slot-time"><i className="ti ti-clock"></i> {fmtTime(r.startTime)}</div>
        {' '}
        {r.purpose ? <div className="hist-purpose">"{r.purpose}"</div> : null}
      </div>
      {' '}
      <div className="hist-item-right">
        <span className={'hist-badge ' + cls}>{label}</span>
        {' '}
        <div className="hist-meta">Requested {reqDate}</div>
      </div>
    </div>
  );
}
