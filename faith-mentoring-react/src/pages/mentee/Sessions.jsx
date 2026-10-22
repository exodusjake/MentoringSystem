import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { AttendanceMetrics } from '../../lib/attendance-metrics.js';
import { checkpointWindow } from '../../lib/checkpoint-window.js';
import { loadScript } from '../../lib/loadScript.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { getSession, isLoggedIn } from '../../lib/session.js';
import { SAMPLE } from './tour/samples.js';
import { useTour } from './tour/TourContext.js';

// Mentee sessions (MENTEE/HTML/sessions.html + sessions.js): the session log, semester record,
// session details and the attendance QR code.
const QR_LIB = '/MENTEE/JS/qrcode.min.js';
const CHECKPOINTS = ['Mentoring Assembly', 'Before Prelims', 'After Prelims', 'Before Midterms', 'After Midterms', 'Before Finals'];

function menteeSessionStatus(s) {
  if (s.sessionStatus === 'Cancelled') return 'Cancelled';
  if (s.sessionStatus === 'Completed' && s.timeEnd) return 'Completed';
  if (s.sessionStatus === 'Completed' || Number(s.presentCount) > 0) return 'In Progress';
  return s.sessionStatus || 'Scheduled';
}

// Position of a checkpoint in the semester (2nd semester has no Mentoring Assembly).
const checkpointNumber = (slot, semester) => {
  const list = semester === '2nd Semester' ? CHECKPOINTS.slice(1) : CHECKPOINTS;
  const i = list.indexOf(slot);
  return i < 0 ? null : i + 1;
};

// A checkpoint can have two completed rounds (regular + make-up); show one card per checkpoint.
// Present wins over Absent; among present rounds the most recent shows. Scheduled rounds stay separate.
function mergeSessionsByCheckpoint(sessions, attMap) {
  const groups = new Map();
  const passthrough = [];
  for (const s of sessions) {
    if (!s.slotName || s.sessionStatus !== 'Completed' || !s.timeEnd) { passthrough.push(s); continue; }
    const key = JSON.stringify([s.schoolYear ?? null, s.semester ?? null, s.slotName]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const merged = [];
  for (const group of groups.values()) {
    if (group.length === 1) { merged.push(group[0]); continue; }
    merged.push([...group].sort((a, b) => {
      const ap = attMap[a.sessionID] === true, bp = attMap[b.sessionID] === true;
      if (ap !== bp) return ap ? -1 : 1;
      return new Date(b.sessionDate) - new Date(a.sessionDate);
    })[0]);
  }
  return [...merged, ...passthrough];
}

export default function MenteeSessions() {
  const navigate = useNavigate();
  const location = useLocation();
  const tour = useTour();
  const [user] = useState(() => getSession().user);
  const [data, setData] = useState({ state: 'loading' });   // loading | ok | nomentor | assignError | error
  const [progress, setProgress] = useState(null);           // { attended, required, pct, sub }
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState(null);                 // session details { session, dateStr }
  const [qr, setQr] = useState(null);                       // { sessionId, dateStr }
  const [qrText, setQrText] = useState('Generating...');
  const canvasRef = useRef(null);
  const qrTimers = useRef({ refresh: null, countdown: null, sessionId: null });
  const deepLinkId = useRef(new URLSearchParams(location.search).get('id'));

  useEffect(() => { loadScript(QR_LIB).catch(() => {}); }, []);

  // Keep the mentee on this page when they press Back (and recheck the session).
  useEffect(() => {
    window.history.pushState(window.history.state, '', window.location.href);
    const onPop = () => {
      if (!isLoggedIn()) window.location.href = '/login';
      else window.history.pushState(window.history.state, '', window.location.href);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ctx = { mentorUserId: null, menteeSection: null, required: 0 };
      const loaded = await loadMentorId(user, ctx);
      if (!alive) return;
      if (!ctx.mentorUserId) { setData({ state: loaded ? 'nomentor' : 'assignError' }); return; }
      const p = await loadAttendanceProgress(user, ctx);
      if (!alive) return;
      if (p) setProgress(p);
      const result = await loadSessions(user, ctx);
      if (alive) setData(result);
    })();
    return () => { alive = false; };
  }, []);

  // ?id=<sessionID> (from a "Session Logged" email): scroll to and briefly highlight that card.
  useEffect(() => {
    if (data.state !== 'ok' || !deepLinkId.current) return;
    const id = deepLinkId.current;
    deepLinkId.current = null;
    const card = document.getElementById(`session-card-${id}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('deep-link-highlight');
    setTimeout(() => card.classList.remove('deep-link-highlight'), 2200);
    const params = new URLSearchParams(location.search);
    params.delete('id');
    navigate({ pathname: location.pathname, search: params.toString() ? '?' + params : '' }, { replace: true });
  }, [data.state]);

  // ── QR code ──
  const stopQr = () => { clearTimeout(qrTimers.current.refresh); clearInterval(qrTimers.current.countdown); };
  useEffect(() => stopQr, []);
  const clearCanvas = () => { const c = canvasRef.current; const ctx = c?.getContext('2d'); if (ctx) ctx.clearRect(0, 0, c.width, c.height); };
  const inactive = message => { stopQr(); clearCanvas(); setQrText(message); };

  async function refreshQrToken() {
    stopQr();
    const sessionId = qrTimers.current.sessionId;
    const session = data.sessions?.find(s => s.sessionID === sessionId);
    if (session) {
      const endTime = session.timeEnd ? new Date(session.timeEnd) : null;
      if (endTime && new Date() > endTime) {
        inactive(`Session ended at ${endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`);
        return;
      }
    }
    clearCanvas();
    setQrText('Generating...');
    try {
      const result = await apiRequest('QRAttendance/generate', 'POST', { sessionId, menteeId: user.userID }, true);
      const expiry = new Date(result.expiresAt);
      await loadScript(QR_LIB);
      window.QRCode.toCanvas(canvasRef.current, result.token, { width: 260, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } },
        err => { if (err) console.error('QR gen error:', err); });
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
        setQrText(remaining > 0 ? `Refreshes in ${remaining}s` : 'Refreshing...');
        if (remaining <= 0) clearInterval(qrTimers.current.countdown);
      };
      tick();
      qrTimers.current.countdown = setInterval(tick, 1000);
      qrTimers.current.refresh = setTimeout(refreshQrToken, Math.max(0, expiry - Date.now()));
    } catch (e) {
      console.error('QR token fetch failed:', e);
      setQrText('Failed to generate — tap to retry.');
    }
  }

  function openQrModal(sessionId, dateStr) {
    qrTimers.current.sessionId = sessionId;
    setQr({ sessionId, dateStr });
    const session = data.sessions.find(s => s.sessionID === sessionId);
    const now = new Date();
    const startTime = session ? new Date(session.sessionDate) : null;
    const endTime = session?.timeEnd ? new Date(session.timeEnd) : null;
    const isToday = startTime ? startTime.toDateString() === now.toDateString() : false;
    const hm = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (!isToday) {
      const label = startTime ? startTime.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : dateStr;
      inactive(startTime && startTime < now ? `This session was on ${label}` : `Scheduled on ${label}`);
      return;
    }
    if (startTime && now < startTime) { inactive(`Session starts at ${hm(startTime)}`); return; }
    if (endTime && now > endTime) { inactive(`Session ended at ${hm(endTime)}`); return; }
    setQrText('Generating...');
    refreshQrToken();
  }

  function closeQrModal(e) {
    if (e && e.target !== e.currentTarget) return;
    setQr(null);
    stopQr();
    qrTimers.current = { refresh: null, countdown: null, sessionId: null };
  }

  // ── Render ──
  const sample = tour.sample;
  const sessions = data.state === 'ok' ? data.sessions : [];
  let shown = sessions;
  if (statusFilter) shown = shown.filter(s => menteeSessionStatus(s) === statusFilter);
  const q = search.trim().toLowerCase();
  if (q) shown = shown.filter(s => new Date(s.sessionDate).toLocaleDateString('en-PH').toLowerCase().includes(q) || (s.topic || '').toLowerCase().includes(q));

  const stats = sample ? { total: '4', completed: '3', scheduled: '1', cancelled: '0' }
    : data.state === 'ok' ? {
      total: String(sessions.length),
      completed: String(sessions.filter(s => s.sessionStatus === 'Completed' && !!s.timeEnd).length),
      scheduled: String(sessions.filter(s => s.sessionStatus !== 'Cancelled' && !s.timeEnd).length),
      cancelled: String(sessions.filter(s => s.sessionStatus === 'Cancelled').length),
    }
    : data.state === 'nomentor' ? { total: '0', completed: '0', scheduled: '0', cancelled: '0' } : null;
  const pulse = <span className="stat-pulse">—</span>;
  const banner = sample ? { attended: '3', required: 6, pct: 50, sub: '50% complete — 3 checkpoints remaining' } : progress;
  const subtitle = sample ? '4 sessions on record'
    : data.state === 'ok' ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} on record` : 'Your mentoring session log';

  return (
    <Page id="MENTEE/sessions">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>Sessions</h1>
            {' '}
            <p id="sessionSubtitle">{subtitle}</p>
          </div>
          {' '}
          {/* Attendance Progress Banner */}
          <div id="attendanceBanner" className="att-progress-banner" style={banner ? undefined : { display: 'none' }}>
            <div className="att-progress-top">
              <div className="att-progress-left">
                <div className="att-progress-title">Semester Completion</div>
                {' '}
                <div className="att-progress-sub" id="attProgressSub">{banner ? banner.sub : 'Loading...'}</div>
              </div>
              {' '}
              <div className="att-progress-nums">
                <span className="att-num" id="attNum">{banner ? String(banner.attended) : pulse}</span>
                {' '}
                <span className="att-denom" id="attDenom">{banner ? `/ ${banner.required} checkpoints` : '/ — sessions'}</span>
              </div>
            </div>
            {' '}
            <div className="att-bar-track">
              <div className="att-bar-fill" id="attBarFill" style={{ width: banner ? `${banner.pct}%` : '0%' }}></div>
            </div>
          </div>
          {' '}
          {/* Stats strip */}
          <div className="session-stats-strip">
            <div className="sstat">
              <div className="sstat-val" id="sTotalSessions">{stats ? stats.total : pulse}</div>
              {' '}
              <div className="sstat-lbl">Total</div>
            </div>
            {' '}
            <div className="sstat">
              <div className="sstat-val green" id="sCompleted">{stats ? stats.completed : pulse}</div>
              {' '}
              <div className="sstat-lbl">Completed</div>
            </div>
            {' '}
            <div className="sstat">
              <div className="sstat-val blue" id="sScheduled">{stats ? stats.scheduled : pulse}</div>
              {' '}
              <div className="sstat-lbl">Scheduled / In Progress</div>
            </div>
            {' '}
            <div className="sstat">
              <div className="sstat-val gray" id="sCancelled">{stats ? stats.cancelled : pulse}</div>
              {' '}
              <div className="sstat-lbl">Cancelled</div>
            </div>
          </div>
          {' '}
          {/* Toolbar */}
          <div className="toolbar">
            <div className="search-wrap">
              <i className="ti ti-search"></i>
              {' '}
              <input type="text" id="searchInput" placeholder="Search by date or topic..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {' '}
            <Select id="statusFilter" className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </Select>
          </div>
          {' '}
          {/* Sessions List */}
          {sample
            ? <div id="sessionsBody" className="sessions-cards-list" dangerouslySetInnerHTML={{ __html: SAMPLE.sessions.body }} />
            : (
              <div id="sessionsBody" className="sessions-cards-list">
                {data.state === 'loading' && <div className="loading-cell"><span className="spinner"></span>{' '}Loading...</div>}
                {data.state === 'assignError' && <Empty className="empty-cell">Couldn't load your sessions. Please refresh the page.</Empty>}
                {data.state === 'nomentor' && <Empty className="empty-cell">No mentor assigned yet.</Empty>}
                {data.state === 'error' && <Empty className="empty-cell">Failed to load sessions. Please refresh.</Empty>}
                {data.state === 'ok' && (shown.length
                  ? [...shown].sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate)).map(s => (
                    <SessionCard key={s.sessionID} s={s} att={data.attMap[s.sessionID]} calendar={data.calendar} total={data.required}
                      onDetails={dateStr => setModal({ session: s, dateStr })} onQr={dateStr => openQrModal(s.sessionID, dateStr)} />
                  ))
                  : <Empty key={`${statusFilter}|${q}`} className="empty-cell">No sessions found.</Empty>)}
              </div>
            )}
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      {/* Session Detail Modal */}
      <div id="sessionModal" className={'modal-overlay' + (modal ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setModal(null)}>
            <i className="ti ti-x"></i>
          </button>
          {' '}
          <h2 className="modal-title" id="sessionModalTitle">{modal ? (modal.session.slotName || 'Session Details') : 'Session Details'}</h2>
          {' '}
          <p className="modal-subtitle" id="sessionModalDate">{modal ? modal.dateStr : '—'}</p>
          {' '}
          <div id="sessionModalBody" className="session-modal-body">
            {modal
              ? <SessionDetails session={modal.session} att={data.attMap?.[modal.session.sessionID]} />
              : <div className="list-skeleton"><span className="spinner"></span>{' '}Loading...</div>}
          </div>
        </div>
      </div>
      {/* QR Code Modal */}
      <div id="qrModal" className={'qr-modal-overlay' + (qr ? ' open' : '')} onClick={closeQrModal}>
        <div className="qr-modal-card" onClick={e => e.stopPropagation()}>
          <button className="qr-close-btn" onClick={() => closeQrModal()}>
            <i className="ti ti-x"></i>
          </button>
          {' '}
          <div className="qr-label">Show this QR to your mentor</div>
          {' '}
          <div className="qr-session-info" id="qrSessionInfo">{qr ? qr.dateStr : '—'}</div>
          {' '}
          <div className="qr-canvas-wrap">
            <canvas id="qrCanvas" ref={canvasRef}></canvas>
          </div>
          {' '}
          <div className="qr-countdown" id="qrCountdown">{qrText}</div>
          {' '}
          <p className="qr-hint">Your mentor will scan this to mark your attendance.</p>
        </div>
      </div>
    </Page>
  );
}

// ── Data loading (same requests and rules as the original) ─────────────────
async function loadMentorId(user, ctx) {
  try {
    const [assignments, menteesWithDept] = await Promise.all([
      apiRequest('Users/assignments', 'GET', null, true),
      apiRequest('Users/mentees-with-dept', 'GET', null, true),
    ]);
    const mine = (assignments || []).find(a => a.menteeUserID === user?.userID);
    ctx.mentorUserId = mine?.mentorUserID || null;
    const myInfo = (menteesWithDept || []).find(m => m.userID === user?.userID);
    const sec = (myInfo?.sectionCode || myInfo?.section || '').trim();
    if (sec && sec !== '—') ctx.menteeSection = sec;
    return true;
  } catch (e) {
    console.error('Assignment load failed:', e);
    return false;
  }
}

async function loadAttendanceProgress(user, ctx) {
  try {
    const data = await apiRequest(`MonitorActivities/${ctx.mentorUserId}`, 'GET', null, true);
    const myEntry = (data?.mentees || []).find(m => m.menteeID === user?.userID || m.menteeUserID === user?.userID);
    if (myEntry?.sectionCode && myEntry.sectionCode !== '—') ctx.menteeSection = myEntry.sectionCode;
    if (!myEntry) return null;
    // The mentee's own requirement (the mentor-wide figure spans every section they handle).
    const required = myEntry.totalSessions ?? 0;
    ctx.required = required;
    const attended = myEntry.sessionsAttended ?? 0;
    const pct = required > 0 ? Math.round(AttendanceMetrics.percent(attended, required)) : 0;
    return {
      attended, required, pct,
      sub: pct >= 100 ? 'Semester requirement met!'
        : `${pct}% complete — ${Math.max(0, required - attended)} checkpoint${required - attended !== 1 ? 's' : ''} remaining`,
    };
  } catch (e) {
    console.error('Attendance progress load failed:', e);
    return null;
  }
}

async function loadSessions(user, ctx) {
  try {
    // Both requests start together; the calendar is only used once the sessions load succeeds.
    const calendarRequest = apiRequest('CalendarEvents', 'GET', null, true).catch(() => null);
    const data = await apiRequest(`SessionsAdmin/${ctx.mentorUserId}/sessions`, 'GET', null, true);
    const calendar = await calendarRequest;
    const raw = data?.sessions || [];
    const now = new Date();
    const isMakeupOf = s => s.isMakeup === true;   // trust the backend flag alone

    // Not-yet-completed make-ups have no Attendance rows yet; /requester is the only source
    // that knows "this mentee booked this slot" before the session happens.
    const upcomingMakeup = raw.filter(s => !s.timeEnd && s.sessionStatus !== 'Cancelled' && isMakeupOf(s));
    const [menteeFetches, requesterFetches] = await Promise.all([
      Promise.allSettled(raw.map(s => apiRequest(`SessionsAdmin/session/${s.sessionID}/mentees`, 'GET', null, true))),
      Promise.allSettled(upcomingMakeup.map(s => apiRequest(`SessionsAdmin/session/${s.sessionID}/requester`, 'GET', null, true))),
    ]);
    const mineOf = list => (list || []).find(m => m.menteeID === user?.userID || m.menteeUserID === user?.userID);

    const attMap = {};
    const enrolledIds = new Set();
    raw.forEach((s, i) => {
      if (menteeFetches[i].status !== 'fulfilled') return;
      const mine = mineOf(menteeFetches[i].value);
      if (!mine) return;
      // For make-ups, MentorMentee membership alone doesn't qualify — only a real record does.
      if (!isMakeupOf(s) || mine.attendanceID > 0) enrolledIds.add(s.sessionID);
      const isPast = new Date(s.sessionDate) < now;
      if (mine.attendanceID > 0 || ((isPast || s.sessionStatus === 'Completed') && s.sessionStatus !== 'Cancelled')) {
        attMap[s.sessionID] = LogsheetData.attendanceState(mine);
      }
    });
    upcomingMakeup.forEach((s, i) => {
      if (requesterFetches[i].status === 'fulfilled' && mineOf(requesterFetches[i].value)) enrolledIds.add(s.sessionID);
    });

    // Enrolled sessions; make-ups are private; regular sessions fall back to section matching.
    const forMySection = topic => {
      const m = (topic || '').match(/^\[([^\]]+)\]/);
      if (!m || !ctx.menteeSection) return true;
      return m[1].split(',').map(s => s.trim()).includes(ctx.menteeSection);
    };
    const enrolled = raw.filter(s => enrolledIds.has(s.sessionID) || (!isMakeupOf(s) && forMySection(s.topic)));
    return { state: 'ok', sessions: mergeSessionsByCheckpoint(enrolled, attMap), attMap, calendar, required: ctx.required };
  } catch (e) {
    console.error('Sessions load failed:', e);
    return { state: 'error' };
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────
function SessionCard({ s, att, calendar, total, onDetails, onQr }) {
  const date = new Date(s.sessionDate);
  const dStr = date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const tStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const status = menteeSessionStatus(s);
  const isCancelled = status === 'Cancelled';
  const sectionMatch = (s.topic || '').match(/^\[(.+?)\]\s*(.*)/);
  const sectionLabel = s.sectionCode || (sectionMatch ? sectionMatch[1] : null);
  const cls = `status-${status.toLowerCase().replaceAll(' ', '-')}`;
  const now = new Date();
  const isPast = date < now;
  const isToday = date.toDateString() === now.toDateString();
  // Regular and make-up sessions both show their checkpoint name in the SESSION block.
  const sessionNum = s.slotName || (s.isMakeup ? null : 'Session');
  const windowState = checkpointWindow(calendar, s.slotName, s.schoolYear, s.semester);
  const showQR = !isCancelled && !s.timeEnd && !windowState.disabled && !windowState.upcoming;

  let attBadge = null;
  if (!isCancelled && (isPast || status === 'Completed' || status === 'In Progress')) {
    attBadge = att === true ? <span className="att-badge att-present"><i className="ti ti-check"></i> Present</span>
      : att === false ? <span className="att-badge att-absent"><i className="ti ti-x"></i> Absent</span>
      : <span className="att-badge att-pending">Not recorded</span>;
  }

  let cardCls = 'scm-card';
  if (isCancelled) cardCls += ' scm-cancelled';
  else if (status === 'Completed') cardCls += ' scm-completed';
  else if (isToday) cardCls += ' scm-today';

  return (
    <div className={cardCls} id={`session-card-${s.sessionID}`}>
      {sessionNum
        ? <div className="scm-num-block">
            <div className="scm-num-label">SESSION</div>
            <div className="scm-num-value">{sessionNum}</div>
            <div className="scm-num-total">{checkpointNumber(s.slotName, s.semester) ?? ''} of {total || 0}</div>
          </div>
        : <div className="scm-num-block scm-num-cancelled">
            <div className="scm-num-label">SESSION</div>
            <div className="scm-num-value">—</div>
          </div>}
      <div className="scm-body">
        <div className="scm-date-row">
          <span className="scm-date">{dStr}</span>
        </div>
        <div className="scm-meta">
          <span><i className="ti ti-calendar-week"></i> {dayName}</span>
          {' '}
          <span><i className="ti ti-clock"></i> {tStr}</span>
        </div>
        <div className="scm-tags">
          {sectionLabel
            ? <span className={'topic-section-tag' + (isCancelled ? ' tag-cancelled' : '')}>Scheduled Session</span>
            : <span className={'topic-section-tag topic-makeup' + (isCancelled ? ' tag-cancelled' : '')}>Make-up Session</span>}
        </div>
        <div className="scm-status-stack"><span className={'session-status ' + cls}>{status}</span>{attBadge}</div>
        <div className="scm-actions">
          {isCancelled
            ? <span className="btn-detail btn-detail-disabled"><i className="ti ti-info-circle"></i> Details</span>
            : <>
              {showQR && <button className="btn-qr" onClick={() => onQr(dStr)}><i className="ti ti-qrcode"></i> Show QR</button>}
              <button className="btn-detail" onClick={() => onDetails(dStr)}><i className="ti ti-info-circle"></i> Details</button>
            </>}
        </div>
      </div>
    </div>
  );
}

function SessionDetails({ session, att }) {
  const rawTopic = session.topic || '';
  const sectionMatch = rawTopic.match(/^\[(.+?)\]\s*(.*)/);
  const isMakeup = session.isMakeup === true;
  const cleanTopic = sectionMatch ? (sectionMatch[2].trim() || 'Mentoring Session') : (rawTopic.trim() || '');
  const status = menteeSessionStatus(session);
  const date = new Date(session.sessionDate);
  const isSessionPast = date < new Date();
  const attBadge = status === 'Cancelled'
    ? <span className="att-badge att-pending">Session cancelled</span>
    : (isSessionPast || status === 'Completed')
      ? att === true ? <span className="att-badge att-present">Present</span>
        : att === false ? <span className="att-badge att-absent">Absent</span>
        : <span className="att-badge att-pending">Not recorded</span>
      : null;
  const fullDate = date.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return (
    <>
      <div className="modal-detail-row">
        <span className="modal-detail-label">Date</span>
        {' '}
        <span className="modal-detail-value">{fullDate}</span>
      </div>
      {' '}
      <div className="modal-detail-row">
        <span className="modal-detail-label">Time</span>
        {' '}
        <span className="modal-detail-value">{time}</span>
      </div>
      {' '}
      {!isMakeup && cleanTopic ? <><div className="modal-detail-row">
        <span className="modal-detail-label">Topic / Notes</span>
        {' '}
        <span className="modal-detail-value">{cleanTopic}</span>
      </div>{' '}</> : null}
      <div className="modal-detail-row">
        <span className="modal-detail-label">Status</span>
        {' '}
        <span className="modal-detail-value">
          {/* The original builds this class from the raw status (e.g. "status-in progress"). */}
          <span className={`session-status status-${status.toLowerCase()}`}>{status}</span>
        </span>
      </div>
      {' '}
      {attBadge ? <div className="modal-detail-row">
        <span className="modal-detail-label">My Attendance</span>
        {' '}
        <span className="modal-detail-value">{attBadge}</span>
      </div> : null}
    </>
  );
}
