import { useEffect, useState } from 'react';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Overlay from '../../components/Overlay.jsx';
import { apiRequest } from '../../lib/api.js';
import { getSession } from '../../lib/session.js';
import { SAMPLE, sampleHtml, useTour } from '../../app/tour.js';

// MENTEE/HTML/schedule-session.html + MENTEE/JS/schedule-session.js

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtDay(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-PH', { weekday: 'long' });
}
function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.toString().split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

const HIST_STATUS = {
  Pending:  { cls: 'hist-badge-pending',   label: 'Pending' },
  Approved: { cls: 'hist-badge-confirmed', label: 'Confirmed' },
  Declined: { cls: 'hist-badge-declined',  label: 'Declined' },
};

export default function MenteeSchedule() {
  const tour = useTour();
  const wt = tour.active;   // walkthrough: show sample data
  const userId = getSession()?.user?.userID;
  const [slots, setSlots] = useState(null);       // null = loading, string = failure message, array = loaded
  const [history, setHistory] = useState(null);   // null = hidden, array = shown
  const [selected, setSelected] = useState(null); // { availabilityID, desc }
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function loadSlots() {
    try {
      const data = await apiRequest(`AvailabilityWorkflow/mentee/${userId}/slots`, 'GET', null, true);
      setSlots(Array.isArray(data) ? data : []);
    } catch (e) {
      setSlots('Failed to load available slots. Please try again later.');
    }
  }
  async function loadHistory() {
    try {
      const data = await apiRequest(`AvailabilityWorkflow/mentee/${userId}/request-history`, 'GET', null, true);
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) { /* non-critical — fail silently */ }
  }
  useEffect(() => { loadSlots(); loadHistory(); }, []);

  function openRequestModal(slot, dateStr, timeStr, mentorName) {
    setSelected({ availabilityID: slot.availabilityID, desc: `${mentorName} · ${dateStr}, ${timeStr}` });
    setPurpose('');
    setError('');
    setSending(false);
  }
  const closeRequestModal = () => setSelected(null);

  async function submitRequest() {
    if (!selected) return;
    setSending(true);
    try {
      await apiRequest(`AvailabilityWorkflow/mentee/${userId}/request`, 'POST',
        { availabilityID: selected.availabilityID, purpose: purpose.trim() || null }, true);
      setSelected(null);
      await loadSlots();
    } catch (err) {
      setError(err.message || 'Failed to send request. Please try again.');
      setSending(false);
    }
  }

  const slotCard = slot => {
    const dateStr = fmtDate(slot.availableDate);
    const dayStr = fmtDay(slot.availableDate);
    const timeStr = fmtTime(slot.startTime);
    const mentorName = slot.mentorName || 'Your Mentor';
    const requested = !!slot.alreadyRequested;
    const approved = !!slot.alreadyApproved;
    const done = !!slot.checkpointCompleted;

    const badge = done || approved
      ? <span className="sch-approved-badge"><i className="ti ti-check"></i> {done ? 'Checkpoint Completed' : 'Session Approved'}</span>
      : requested
        ? <span className="sch-requested-badge">Requested</span>
        : <span className="sch-available-badge">Available</span>;

    const btn = done
      ? <button className="btn-request" disabled>Attendance Completed</button>
      : approved
        ? <button className="btn-request btn-request-approved" disabled><i className="ti ti-calendar-check"></i> Session Scheduled</button>
        : requested
          ? <button className="btn-request" disabled>Already Requested</button>
          : <button className="btn-request" onClick={() => openRequestModal(slot, dateStr, timeStr, mentorName)}>Request This Slot</button>;

    return (
      <div className={`sch-slot-card${done || approved ? ' already-approved' : requested ? ' already-requested' : ''}`} key={slot.availabilityID}>
        <div className="sch-slot-header">
          <span className="sch-slot-mentor">{mentorName}</span>
          {badge}
        </div>
        <div>
          <div className="sch-slot-date">{dateStr}</div>
          <div className="sch-slot-day">{dayStr}</div>
          {slot.slotName ? <span className="sch-slot-name-tag">{slot.slotName}</span> : null}
        </div>
        <div className="sch-slot-time">
          <i className="ti ti-clock"></i>
          {timeStr}
        </div>
        {done ? <p className="sch-checkpoint-completed">You have already completed attendance for this mentoring checkpoint.</p> : null}
        {btn}
      </div>
    );
  };

  const historyItem = (r, i) => {
    const reqDate = new Date(r.requestedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const { cls, label } = HIST_STATUS[r.status] || { cls: 'hist-badge-pending', label: r.status };
    return (
      <div className="hist-item" key={r.requestID ?? i}>
        <div className="hist-item-left">
          <div className="hist-slot-date">{fmtDate(r.availableDate)}</div>
          {r.slotName ? <span className="sch-slot-name-tag">{r.slotName}</span> : null}
          <div className="hist-slot-time"><i className="ti ti-clock"></i> {fmtTime(r.startTime)}</div>
          {r.purpose ? <div className="hist-purpose">"{r.purpose}"</div> : null}
        </div>
        <div className="hist-item-right">
          <span className={`hist-badge ${cls}`}>{label}</span>
          <div className="hist-meta">Requested {reqDate}</div>
        </div>
      </div>
    );
  };

  const loaded = Array.isArray(slots);
  const real = !wt;
  return (
    <Page id="MENTEE/schedule-session">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Schedule a Session</h1>
              <p>Pick an available time slot your mentor has opened and submit a request.</p>
            </div>
          </div>

          <div className="info-banner">
            <i className="ti ti-info-circle"></i>
            <span>Submitting a request books that slot right away — the session will appear in your Sessions page immediately.</span>
          </div>

          {real && !loaded ? (
            <div id="slotsLoading" className="sch-loading" style={{ display: 'block' }}>
              {typeof slots === 'string' ? slots : <><span className="spinner"></span> Loading available slots...</>}
            </div>
          ) : null}

          {real && loaded && !slots.length ? (
            <div id="slotsEmpty" className="sch-empty" style={{ display: 'block' }}>
              <i className="ti ti-calendar-off"></i>
              <p>Your mentor has no open slots right now.<br />Check back later or reach out to your mentor directly.</p>
            </div>
          ) : null}

          {real && loaded && slots.length ? <div id="slotsGrid" className="sch-grid" style={{ display: 'grid' }}>{slots.map(slotCard)}</div> : null}
          {wt ? <div id="slotsGrid" className="sch-grid" key={tour.scheduleApproved ? 'approved' : 'open'} dangerouslySetInnerHTML={sampleHtml(true, SAMPLE.schedule(tour.scheduleApproved))}></div> : null}

          {history ? (
            <div id="historySection" className="hist-section" style={{ display: 'block' }}>
              <div className="hist-header">
                <div>
                  <h2>Request History</h2>
                  <p>Your past scheduling requests and their outcomes.</p>
                </div>
              </div>
              <div id="historyList" className="hist-list">
                {history.length ? history.map(historyItem) : <Empty className="hist-empty">No scheduling requests yet.</Empty>}
              </div>
            </div>
          ) : null}
        </main>

        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      <Overlay open={!!selected || (wt && tour.modalOpen)} className="modal-overlay" activeClass="open" id="requestModal" onClick={e => { if (e.target === e.currentTarget) closeRequestModal(); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => closeRequestModal()}><i className="ti ti-x"></i></button>
          <h2 className="modal-title">Request Session</h2>
          <p className="modal-subtitle" id="requestSlotDesc">{wt && tour.modalOpen ? 'Maria Santos · November 12, 2026, 9:00 AM' : selected?.desc ?? '—'}</p>

          <div id="requestError" className="form-error" style={{ display: error ? 'block' : 'none' }}>{error}</div>

          <div className="modal-form">
            <div className="form-group">
              <label>Purpose / Topic <span className="optional">(optional)</span></label>
              <textarea id="requestPurpose" rows="3" value={purpose} onChange={e => setPurpose(e.target.value)}
                placeholder="What do you want to discuss in this session?"></textarea>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn-cancel" onClick={() => closeRequestModal()}>Cancel</button>
            <button className="btn-save" id="requestBtn" disabled={sending} onClick={submitRequest}>{sending ? 'Sending...' : 'Send Request'}</button>
          </div>
        </div>
      </Overlay>
    </Page>
  );
}
