import { useEffect, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { AttendanceMetrics } from '../../lib/attendance-metrics.js';
import { checkpointWindow } from '../../lib/checkpoint-window.js';
import { LogsheetData } from '../../lib/logsheet-data.js';
import { loadScript } from '../../lib/loadScript.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';
import { SAMPLE, sampleHtml, useTour } from '../../app/tour.js';

// MENTEE/HTML/sessions.html + MENTEE/JS/sessions.js

function menteeSessionStatus(s) {
  if (s.sessionStatus === 'Cancelled') return 'Cancelled';
  if (s.sessionStatus === 'Completed' && s.timeEnd) return 'Completed';
  if (s.sessionStatus === 'Completed' || Number(s.presentCount) > 0) return 'In Progress';
  return s.sessionStatus || 'Scheduled';
}

// A checkpoint (regular session + a make-up catch-up round) can show as two cards for the same SlotName.
// Only COMPLETED sessions merge; present wins over absent, then the most recent shows.
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
    const sorted = [...group].sort((a, b) => {
      const aPresent = attMap[a.sessionID] === true;
      const bPresent = attMap[b.sessionID] === true;
      if (aPresent !== bPresent) return aPresent ? -1 : 1;
      return new Date(b.sessionDate) - new Date(a.sessionDate);
    });
    merged.push(sorted[0]);
  }
  return [...merged, ...passthrough];
}

// Position of a checkpoint in the semester (2nd semester has no Mentoring Assembly).
const CHECKPOINTS = ['Mentoring Assembly', 'Before Prelims', 'After Prelims', 'Before Midterms', 'After Midterms', 'Before Finals'];
const checkpointNumber = (slot, semester) => {
  const list = semester === '2nd Semester' ? CHECKPOINTS.slice(1) : CHECKPOINTS;
  const i = list.indexOf(slot);
  return i < 0 ? null : i + 1;
};

const pulse = <span className="stat-pulse">—</span>;
const timeOf = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

export default function MenteeSessions() {
  useBackGuard();
  const tour = useTour();
  const wt = tour.active;   // walkthrough: show sample data
  const S = SAMPLE.sessions;
  const currentUser = getSession()?.user;
  const userId = currentUser?.userID;

  const [subtitle, setSubtitle] = useState('Your mentoring session log');
  const [banner, setBanner] = useState(null);       // { attended, required, pct }
  const [stats, setStats] = useState({ total: pulse, completed: pulse, scheduled: pulse, cancelled: pulse });
  const [body, setBody] = useState(null);           // null = loading, string = message, array = sessions
  const [all, setAll] = useState([]);
  const [attMap, setAttMap] = useState({});
  const [required, setRequired] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detail, setDetail] = useState(null);       // { sid, dateStr }
  const [qr, setQr] = useState(null);               // { sid, dateStr }
  const [qrText, setQrText] = useState('—');
  const [calendar, setCalendar] = useState(null);
  const [highlight, setHighlight] = useState(null);

  const ctx = useRef({ mentorUserId: null, menteeSection: null, sessions: [], qrSid: null, qrRefresh: null, qrCountdown: null });
  const canvasRef = useRef(null);

  async function loadMentorId() {
    try {
      const [assignments, menteesWithDept] = await Promise.all([
        apiRequest('Users/assignments', 'GET', null, true),
        apiRequest('Users/mentees-with-dept', 'GET', null, true),
      ]);
      const mine = (assignments || []).find(a => a.menteeUserID === userId);
      ctx.current.mentorUserId = mine?.mentorUserID || null;
      const myInfo = (menteesWithDept || []).find(m => m.userID === userId);
      const sec = (myInfo?.sectionCode || myInfo?.section || '').trim();
      if (sec && sec !== '—') ctx.current.menteeSection = sec;
      return true;
    } catch (e) {
      console.error('Assignment load failed:', e);
      return false;
    }
  }

  async function loadAttendanceProgress() {
    try {
      const data = await apiRequest(`MonitorActivities/${ctx.current.mentorUserId}`, 'GET', null, true);
      const myEntry = (data?.mentees || []).find(m => m.menteeID === userId || m.menteeUserID === userId);
      if (myEntry?.sectionCode && myEntry.sectionCode !== '—') ctx.current.menteeSection = myEntry.sectionCode;
      if (!myEntry) return;
      // A mentee belongs to one section, so their own requirement is myEntry.totalSessions.
      const req = myEntry.totalSessions ?? 0;
      const attended = myEntry.sessionsAttended ?? 0;
      const pct = req > 0 ? Math.round(AttendanceMetrics.percent(attended, req)) : 0;
      setRequired(req);
      setBanner({ attended, required: req, pct });
    } catch (e) {
      console.error('Attendance progress load failed:', e);
    }
  }

  function isSessionForMySection(topic) {
    const prefixMatch = (topic || '').match(/^\[([^\]]+)\]/);
    if (!prefixMatch) return true;                  // no section prefix → general session
    if (!ctx.current.menteeSection) return true;    // section unknown → show all
    return prefixMatch[1].split(',').map(s => s.trim()).includes(ctx.current.menteeSection);
  }

  async function loadSessions() {
    try {
      const data = await apiRequest(`SessionsAdmin/${ctx.current.mentorUserId}/sessions`, 'GET', null, true);
      const cal = await apiRequest('CalendarEvents', 'GET', null, true).catch(() => null);
      const raw = data?.sessions || [];
      const now = new Date();
      const isMakeupOf = s => s.isMakeup === true;

      // Not-yet-completed make-up sessions have no attendance rows: /requester is the only source.
      const upcomingMakeup = raw.filter(s => !s.timeEnd && s.sessionStatus !== 'Cancelled' && isMakeupOf(s));
      const menteeFetches = await Promise.allSettled(raw.map(s => apiRequest(`SessionsAdmin/session/${s.sessionID}/mentees`, 'GET', null, true)));
      const requesterFetches = await Promise.allSettled(upcomingMakeup.map(s => apiRequest(`SessionsAdmin/session/${s.sessionID}/requester`, 'GET', null, true)));

      const map = {};
      const enrolledIds = new Set();
      const mineOf = list => (list || []).find(m => m.menteeID === userId || m.menteeUserID === userId);
      raw.forEach((s, i) => {
        if (menteeFetches[i].status !== 'fulfilled') return;
        const mine = mineOf(menteeFetches[i].value);
        if (!mine) return;
        // For make-up sessions MentorMentee membership alone doesn't qualify — only a real attendance record.
        if (!isMakeupOf(s) || mine.attendanceID > 0) enrolledIds.add(s.sessionID);
        const isPast = new Date(s.sessionDate) < now;
        if (mine.attendanceID > 0 || ((isPast || s.sessionStatus === 'Completed') && s.sessionStatus !== 'Cancelled')) {
          map[s.sessionID] = LogsheetData.attendanceState(mine);
        }
      });
      upcomingMakeup.forEach((s, i) => {
        if (requesterFetches[i].status === 'fulfilled' && mineOf(requesterFetches[i].value)) enrolledIds.add(s.sessionID);
      });

      // Enrolled sessions, otherwise section matching (make-up sessions are private).
      const enrolled = raw.filter(s => {
        if (enrolledIds.has(s.sessionID)) return true;
        if (isMakeupOf(s)) return false;
        return isSessionForMySection(s.topic);
      });
      const list = mergeSessionsByCheckpoint(enrolled, map);
      ctx.current.sessions = list;

      setCalendar(cal);
      setAttMap(map);
      setAll(list);
      setStats({
        total: list.length,
        completed: list.filter(s => s.sessionStatus === 'Completed' && !!s.timeEnd).length,
        scheduled: list.filter(s => s.sessionStatus !== 'Cancelled' && !s.timeEnd).length,
        cancelled: list.filter(s => s.sessionStatus === 'Cancelled').length,
      });
      setSubtitle(`${list.length} session${list.length !== 1 ? 's' : ''} on record`);
      setBody(list);
    } catch (e) {
      console.error('Sessions load failed:', e);
      setBody('Failed to load sessions. Please refresh.');
    }
  }

  useEffect(() => {
    (async () => {
      const mentorLoaded = await loadMentorId();
      if (ctx.current.mentorUserId) {
        await loadAttendanceProgress();
        await loadSessions();
      } else if (!mentorLoaded) {
        setBody("Couldn't load your sessions. Please refresh the page.");
      } else {
        setBody('No mentor assigned yet.');
        setStats({ total: '0', completed: '0', scheduled: '0', cancelled: '0' });
      }
    })();
    return () => { clearTimeout(ctx.current.qrRefresh); clearInterval(ctx.current.qrCountdown); };
  }, []);

  // ── Deep link (from a "Session Logged" email): ?id=<sessionID> scrolls to and highlights one card ──
  useEffect(() => {
    if (!Array.isArray(body)) return;
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    const card = document.getElementById(`session-card-${id}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight(id);
    setTimeout(() => setHighlight(null), 2200);
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    window.history.replaceState(null, '', url);
  }, [body === null || typeof body === 'string' ? body : 'list']);

  // ── QR ──
  function clearQrCanvas() {
    const canvas = canvasRef.current;
    const c = canvas?.getContext('2d');
    if (c) c.clearRect(0, 0, canvas.width, canvas.height);
  }
  function showQrInactive(message) {
    clearTimeout(ctx.current.qrRefresh);
    clearInterval(ctx.current.qrCountdown);
    clearQrCanvas();
    setQrText(message);
  }
  async function refreshQrToken() {
    const c = ctx.current;
    clearTimeout(c.qrRefresh);
    clearInterval(c.qrCountdown);
    // Stop refreshing if the session window has closed.
    const session = c.sessions.find(s => s.sessionID === c.qrSid);
    if (session) {
      const endTime = session.timeEnd ? new Date(session.timeEnd) : null;
      if (endTime && new Date() > endTime) { showQrInactive(`Session ended at ${timeOf(endTime)}`); return; }
    }
    clearQrCanvas();
    setQrText('Generating...');
    try {
      const result = await apiRequest('QRAttendance/generate', 'POST', { sessionId: c.qrSid, menteeId: userId }, true);
      const expiry = new Date(result.expiresAt);
      await loadScript('/MENTEE/JS/qrcode.min.js');
      if (c.qrSid === null) return;   // closed while the token was loading
      window.QRCode.toCanvas(canvasRef.current, result.token, { width: 260, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } },
        err => { if (err) console.error('QR gen error:', err); });
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
        setQrText(remaining > 0 ? `Refreshes in ${remaining}s` : 'Refreshing...');
        if (remaining <= 0) clearInterval(c.qrCountdown);
      };
      tick();
      c.qrCountdown = setInterval(tick, 1000);
      c.qrRefresh = setTimeout(refreshQrToken, Math.max(0, expiry - Date.now()));
    } catch (e) {
      console.error('QR token fetch failed:', e);
      setQrText('Failed to generate — tap to retry.');
    }
  }
  function openQrModal(sid, dateStr) {
    const c = ctx.current;
    c.qrSid = sid;
    setQrText('—');
    setQr({ sid, dateStr });
  }
  // Runs once the QR overlay (and its canvas) is mounted.
  useEffect(() => {
    if (!qr) return;
    const session = ctx.current.sessions.find(s => s.sessionID === qr.sid);
    const now = new Date();
    const startTime = session ? new Date(session.sessionDate) : null;
    const endTime = session?.timeEnd ? new Date(session.timeEnd) : null;
    const isToday = startTime ? startTime.toDateString() === now.toDateString() : false;
    if (!isToday) {
      const label = startTime ? startTime.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : qr.dateStr;
      const isPast = startTime ? startTime < now : false;
      showQrInactive(isPast ? `This session was on ${label}` : `Scheduled on ${label}`);
      return;
    }
    if (startTime && now < startTime) { showQrInactive(`Session starts at ${timeOf(startTime)}`); return; }
    if (endTime && now > endTime) { showQrInactive(`Session ended at ${timeOf(endTime)}`); return; }
    setQrText('Generating...');
    refreshQrToken();
  }, [qr]);
  function closeQrModal() {
    const c = ctx.current;
    setQr(null);
    clearTimeout(c.qrRefresh);
    clearInterval(c.qrCountdown);
    c.qrRefresh = null; c.qrCountdown = null; c.qrSid = null;
  }

  // ── Session cards ──
  function sessionCard(s) {
    const sid = s.sessionID;
    const date = new Date(s.sessionDate);
    const dStr = date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const tStr = timeOf(date);
    const status = menteeSessionStatus(s);
    const isCancelled = status === 'Cancelled';
    const sectionMatch = (s.topic || '').match(/^\[(.+?)\]\s*(.*)/);
    const sectionLabel = s.sectionCode || (sectionMatch ? sectionMatch[1] : null);
    const cls = `status-${status.toLowerCase().replaceAll(' ', '-')}`;
    const now = new Date();
    const isPast = date < now;
    const isToday = date.toDateString() === now.toDateString();
    const att = attMap[sid];
    const sessionNum = s.slotName || (s.isMakeup ? null : 'Session');

    const windowState = checkpointWindow(calendar, s.slotName, s.schoolYear, s.semester);
    const showQR = !isCancelled && !s.timeEnd && !windowState.disabled && !windowState.upcoming;

    let attBadge = null;
    if (!isCancelled && (isPast || status === 'Completed' || status === 'In Progress')) {
      attBadge = att === true
        ? <span className="att-badge att-present"><i className="ti ti-check"></i> Present</span>
        : att === false
          ? <span className="att-badge att-absent"><i className="ti ti-x"></i> Absent</span>
          : <span className="att-badge att-pending">Not recorded</span>;
    }

    const actions = isCancelled
      ? <span className="btn-detail btn-detail-disabled"><i className="ti ti-info-circle"></i> Details</span>
      : <>
          {showQR ? <button className="btn-qr" onClick={() => openQrModal(sid, dStr)}><i className="ti ti-qrcode"></i> Show QR</button> : null}
          <button className="btn-detail" onClick={() => setDetail({ sid, dateStr: dStr })}><i className="ti ti-info-circle"></i> Details</button>
        </>;

    const typeBadge = sectionLabel
      ? <span className={`topic-section-tag${isCancelled ? ' tag-cancelled' : ''}`}>Scheduled Session</span>
      : <span className={`topic-section-tag topic-makeup${isCancelled ? ' tag-cancelled' : ''}`}>Make-up Session</span>;

    let cardCls = 'scm-card';
    if (isCancelled) cardCls += ' scm-cancelled';
    else if (status === 'Completed') cardCls += ' scm-completed';
    else if (isToday) cardCls += ' scm-today';
    if (highlight === String(sid)) cardCls += ' deep-link-highlight';

    const numBlock = sessionNum
      ? <div className="scm-num-block">
          <div className="scm-num-label">SESSION</div>
          <div className="scm-num-value">{sessionNum}</div>
          <div className="scm-num-total">{checkpointNumber(s.slotName, s.semester) ?? ''} of {required || 0}</div>
        </div>
      : <div className="scm-num-block scm-num-cancelled">
          <div className="scm-num-label">SESSION</div>
          <div className="scm-num-value">—</div>
        </div>;

    return (
      <div className={cardCls} id={`session-card-${sid}`} key={sid}>
        {numBlock}
        <div className="scm-body">
          <div className="scm-date-row"><span className="scm-date">{dStr}</span></div>
          <div className="scm-meta">
            <span><i className="ti ti-calendar-week"></i> {dayName}</span>
            <span><i className="ti ti-clock"></i> {tStr}</span>
          </div>
          <div className="scm-tags">{typeBadge}</div>
          <div className="scm-status-stack"><span className={`session-status ${cls}`}>{status}</span>{attBadge}</div>
          <div className="scm-actions">{actions}</div>
        </div>
      </div>
    );
  }

  let list = null;
  if (body === null) list = <div className="loading-cell"><span className="spinner"></span> Loading...</div>;
  else if (typeof body === 'string') list = <Empty className="empty-cell">{body}</Empty>;
  else {
    const q = search.trim().toLowerCase();
    let filtered = body;
    if (statusFilter) filtered = filtered.filter(s => menteeSessionStatus(s) === statusFilter);
    if (q) filtered = filtered.filter(s => {
      const d = new Date(s.sessionDate).toLocaleDateString('en-PH').toLowerCase();
      return d.includes(q) || (s.topic || '').toLowerCase().includes(q);
    });
    list = !filtered.length
      ? <Empty className="empty-cell">No sessions found.</Empty>
      : [...filtered].sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate)).map(sessionCard);
  }

  // ── Detail modal ──
  let detailBody = null, detailTitle = 'Session Details';
  if (detail) {
    const session = all.find(s => s.sessionID === detail.sid) || {};
    const rawTopic = session.topic || '';
    const sectionMatch = rawTopic.match(/^\[(.+?)\]\s*(.*)/);
    const isMakeup = session.isMakeup === true;
    const cleanTopic = sectionMatch ? (sectionMatch[2].trim() || 'Mentoring Session') : rawTopic.trim();
    const status = menteeSessionStatus(session);
    detailTitle = session.slotName || 'Session Details';
    const date = new Date(session.sessionDate);
    const isSessionPast = date < new Date();
    const att = attMap[detail.sid];
    const attBadge = status === 'Cancelled'
      ? <span className="att-badge att-pending">Session cancelled</span>
      : (isSessionPast || status === 'Completed')
        ? att === true ? <span className="att-badge att-present">Present</span>
          : att === false ? <span className="att-badge att-absent">Absent</span>
          : <span className="att-badge att-pending">Not recorded</span>
        : null;
    const fullDate = date.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    detailBody = (
      <>
        <div className="modal-detail-row"><span className="modal-detail-label">Date</span><span className="modal-detail-value">{fullDate}</span></div>
        <div className="modal-detail-row"><span className="modal-detail-label">Time</span><span className="modal-detail-value">{timeOf(date)}</span></div>
        {!isMakeup && cleanTopic ? <div className="modal-detail-row"><span className="modal-detail-label">Topic / Notes</span><span className="modal-detail-value">{cleanTopic}</span></div> : null}
        <div className="modal-detail-row">
          <span className="modal-detail-label">Status</span>
          <span className="modal-detail-value"><span className={`session-status status-${status.toLowerCase()}`}>{status}</span></span>
        </div>
        {attBadge ? <div className="modal-detail-row"><span className="modal-detail-label">My Attendance</span><span className="modal-detail-value">{attBadge}</span></div> : null}
      </>
    );
  }

  return (
    <Page id="MENTEE/sessions">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>Sessions</h1>
            <p id="sessionSubtitle">{wt ? S.subtitle : subtitle}</p>
          </div>

          <div id="attendanceBanner" className="att-progress-banner" style={{ display: banner || wt ? '' : 'none' }}>
            <div className="att-progress-top">
              <div className="att-progress-left">
                <div className="att-progress-title">Semester Completion</div>
                <div className="att-progress-sub" id="attProgressSub">
                  {wt ? '50% complete — 3 checkpoints remaining' : banner ? (banner.pct >= 100 ? 'Semester requirement met!'
                    : `${banner.pct}% complete — ${Math.max(0, banner.required - banner.attended)} checkpoint${banner.required - banner.attended !== 1 ? 's' : ''} remaining`) : 'Loading...'}
                </div>
              </div>
              <div className="att-progress-nums">
                <span className="att-num" id="attNum">{wt ? '3' : banner ? banner.attended : pulse}</span>
                <span className="att-denom" id="attDenom">{wt ? '/ 6 checkpoints' : banner ? `/ ${banner.required} checkpoints` : '/ — sessions'}</span>
              </div>
            </div>
            <div className="att-bar-track">
              <div className="att-bar-fill" id="attBarFill" style={{ width: `${wt ? 50 : banner ? banner.pct : 0}%` }}></div>
            </div>
          </div>

          <div className="session-stats-strip">
            <div className="sstat"><div className="sstat-val" id="sTotalSessions">{wt ? '4' : stats.total}</div><div className="sstat-lbl">Total</div></div>
            <div className="sstat"><div className="sstat-val green" id="sCompleted">{wt ? '3' : stats.completed}</div><div className="sstat-lbl">Completed</div></div>
            <div className="sstat"><div className="sstat-val blue" id="sScheduled">{wt ? '1' : stats.scheduled}</div><div className="sstat-lbl">Scheduled / In Progress</div></div>
            <div className="sstat"><div className="sstat-val gray" id="sCancelled">{wt ? '0' : stats.cancelled}</div><div className="sstat-lbl">Cancelled</div></div>
          </div>

          <div className="toolbar">
            <div className="search-wrap">
              <i className="ti ti-search"></i>
              <input type="text" id="searchInput" placeholder="Search by date or topic..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select id="statusFilter" className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </Select>
          </div>

          <div id="sessionsBody" className="sessions-cards-list" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, S.sessionsBody)}>{wt ? undefined : list}</div>
        </main>

        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      <Overlay open={!!detail} className="modal-overlay" activeClass="open" id="sessionModal" onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setDetail(null)}><i className="ti ti-x"></i></button>
          <h2 className="modal-title" id="sessionModalTitle">{detailTitle}</h2>
          <p className="modal-subtitle" id="sessionModalDate">{detail?.dateStr ?? '—'}</p>
          <div id="sessionModalBody" className="session-modal-body">{detailBody}</div>
        </div>
      </Overlay>

      <Overlay open={!!qr} className="qr-modal-overlay" activeClass="open" id="qrModal" onClick={e => { if (e.target === e.currentTarget) closeQrModal(); }}>
        <div className="qr-modal-card" onClick={e => e.stopPropagation()}>
          <button className="qr-close-btn" onClick={() => closeQrModal()}><i className="ti ti-x"></i></button>
          <div className="qr-label">Show this QR to your mentor</div>
          <div className="qr-session-info" id="qrSessionInfo">{qr?.dateStr ?? '—'}</div>
          <div className="qr-canvas-wrap"><canvas id="qrCanvas" ref={canvasRef}></canvas></div>
          <div className="qr-countdown" id="qrCountdown">{qrText}</div>
          <p className="qr-hint">Your mentor will scan this to mark your attendance.</p>
        </div>
      </Overlay>
    </Page>
  );
}
