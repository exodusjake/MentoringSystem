function menteeSessionStatus(s) {
  if (s.sessionStatus === 'Cancelled') return 'Cancelled';
  if (s.sessionStatus === 'Completed' && s.timeEnd) return 'Completed';
  if (s.sessionStatus === 'Completed' || Number(s.presentCount) > 0) return 'In Progress';
  return s.sessionStatus || 'Scheduled';
}
let sessionCalendar = null;
/* ============================================================
   ASTRA MENTEE — sessions.js
   ============================================================ */

let allSessions      = [];
let allAttMap        = {};   // sessionID → isPresent (true/false/null)
let currentUser      = null;
let mentorUserId     = null;
let menteeSection    = null;
let requiredSessions = 0;
let qrRefreshTimer    = null;
let qrCountdownTimer  = null;
let qrCurrentSessionId = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentee');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  currentUser = getSession().user;
  const mentorLoaded = await loadMentorId();

  if (mentorUserId) {
    await loadAttendanceProgress();
    await loadSessions();
  } else if (!mentorLoaded) {
    document.getElementById('sessionsBody').innerHTML =
      '<div class="empty-cell">Couldn\'t load your sessions. Please refresh the page.</div>';
  } else {
    document.getElementById('sessionsBody').innerHTML =
      '<div class="empty-cell">No mentor assigned yet.</div>';
    ['sTotalSessions','sCompleted','sScheduled','sCancelled']
      .forEach(id => document.getElementById(id).textContent = '0');
  }

  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
});

async function loadMentorId() {
  try {
    const [assignments, menteesWithDept] = await Promise.all([
      apiRequest('Users/assignments',      'GET', null, true),
      apiRequest('Users/mentees-with-dept','GET', null, true),
    ]);

    const mine = (assignments || []).find(a => a.menteeUserID === currentUser?.userID);
    mentorUserId = mine?.mentorUserID || null;

    const myInfo = (menteesWithDept || []).find(m => m.userID === currentUser?.userID);
    const sec    = (myInfo?.sectionCode || myInfo?.section || '').trim();
    if (sec && sec !== '—') menteeSection = sec;
    return true;
  } catch (e) {
    console.error('Assignment load failed:', e);
    return false;
  }
}

async function loadSessions() {
  try {
    const data = await apiRequest(`SessionsAdmin/${mentorUserId}/sessions`, 'GET', null, true);
    sessionCalendar=await apiRequest('CalendarEvents','GET',null,true).catch(()=>null);
    const raw  = data?.sessions || [];

    const now = new Date();
    // Trust the backend's IsMakeup bit alone (SessionRowDto.IsMakeup, from
    // sp_GetMentorSessions) — the old "topic starts with a bracket"
    // fallback wrongly flagged any regular session as a makeup whenever
    // its Notes didn't happen to start with "[SECTION]", which is the
    // normal case for a session with blank/freeform notes, not an edge
    // case. Same fix already applied to HEAD's lsIsMakeup() and
    // ADMIN_'s isMakeupSession().
    const isMakeupOf = s => s.isMakeup === true;

    // Not-yet-completed makeup sessions have no Attendance rows yet (nobody's
    // been scanned in), so /mentees always comes back without this mentee —
    // fetch those separately via /requester, the only source that knows
    // "this mentee booked this slot" before the session actually happens.
    const upcomingMakeup = raw.filter(s => !s.timeEnd && s.sessionStatus !== 'Cancelled' && isMakeupOf(s));
    const everythingElse = raw; // Include attendance already scanned in an ongoing make-up.

    const menteeFetches = await Promise.allSettled(
      everythingElse.map(s => apiRequest(`SessionsAdmin/session/${s.sessionID}/mentees`, 'GET', null, true))
    );
    const requesterFetches = await Promise.allSettled(
      upcomingMakeup.map(s => apiRequest(`SessionsAdmin/session/${s.sessionID}/requester`, 'GET', null, true))
    );

    allAttMap = {};
    const enrolledIds = new Set();

    everythingElse.forEach((s, i) => {
      if (menteeFetches[i].status === 'fulfilled') {
        const mentees = menteeFetches[i].value || [];
        const mine    = mentees.find(
          m => m.menteeID === currentUser?.userID || m.menteeUserID === currentUser?.userID
        );
        if (mine) {
          const isMakeupSess  = isMakeupOf(s);
          const hasRealRecord = mine.attendanceID > 0;
          // For makeup sessions, MentorMentee membership alone doesn't qualify.
          // Only enroll the mentee if they have an actual attendance record,
          // preventing sessions they never requested from appearing in their list.
          if (!isMakeupSess || hasRealRecord) {
            enrolledIds.add(s.sessionID);
          }
          const isPast = new Date(s.sessionDate) < now;
          if (mine.attendanceID > 0 || ((isPast || s.sessionStatus === 'Completed') && s.sessionStatus !== 'Cancelled')) {
            allAttMap[s.sessionID] = LogsheetData.attendanceState(mine);
          }
        }
      }
    });

    upcomingMakeup.forEach((s, i) => {
      if (requesterFetches[i].status === 'fulfilled') {
        const mentees = requesterFetches[i].value || [];
        const mine = mentees.find(
          m => m.menteeID === currentUser?.userID || m.menteeUserID === currentUser?.userID
        );
        // Attendance isn't known yet — this just proves "you're one of the
        // approved requesters for this slot," which is all the enrollment
        // check below needs.
        if (mine) enrolledIds.add(s.sessionID);
      }
    });

    // Primary filter: show sessions where this mentee is enrolled.
    // Make-up sessions are private — only the requesting mentee sees them.
    // Regular sessions fall back to section-based matching.
    const enrolledSessions = raw.filter(s => {
      if (enrolledIds.has(s.sessionID)) return true;
      const isMakeup = isMakeupOf(s);
      if (isMakeup) return false;
      return isSessionForMySection(s.topic);
    });

    allSessions = mergeSessionsByCheckpoint(enrolledSessions, allAttMap);

    updateStats(allSessions);
    renderTable(allSessions);
    scrollToDeepLinkedSession();

    document.getElementById('sessionSubtitle').textContent =
      `${allSessions.length} session${allSessions.length !== 1 ? 's' : ''} on record`;
  } catch (e) {
    console.error('Sessions load failed:', e);
    document.getElementById('sessionsBody').innerHTML =
      '<div class="empty-cell">Failed to load sessions. Please refresh.</div>';
  }
}

// A checkpoint (regular session + a makeup catch-up round, or just two
// regular rounds) can now show as two separate cards for the same
// SlotName — confirmed live, a mentee's own "After Midterms" showed both
// "Absent" (the regular session) and "Present" (their makeup round),
// which reads as contradictory even though they ultimately completed it.
// Only COMPLETED sessions merge — a still-Scheduled makeup round is left
// as its own card since it's an upcoming, actionable reminder for the
// mentee to actually show up, not history to consolidate. Present wins
// over Absent when merging; among present rounds, the most recent shows.
function mergeSessionsByCheckpoint(sessions, attMap) {
  const groups      = new Map();
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

function isSessionForMySection(topic) {
  const t = topic || '';
  const prefixMatch = t.match(/^\[([^\]]+)\]/);
  if (!prefixMatch) return true;    // no section prefix → general session, show to all
  if (!menteeSection) return true;  // section unknown → show all
  return prefixMatch[1].split(',').map(s => s.trim()).includes(menteeSection);
}

// ── DEEP LINK (from a "Session Logged" email) ──────────────────────────────
// ?id=<sessionID> in the URL scrolls to and briefly highlights that one
// card — same pattern as announcements.js's scrollToDeepLinkedAnnouncement().
function scrollToDeepLinkedSession() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) return;

  const card = document.getElementById(`session-card-${id}`);
  if (!card) return;

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('deep-link-highlight');
  setTimeout(() => card.classList.remove('deep-link-highlight'), 2200);

  const url = new URL(window.location.href);
  url.searchParams.delete('id');
  window.history.replaceState(null, '', url);
}

function updateStats(sessions) {
  const completed = sessions.filter(s => s.sessionStatus === 'Completed' && !!s.timeEnd).length;
  const scheduled = sessions.filter(s => s.sessionStatus !== 'Cancelled' && !s.timeEnd).length;
  const cancelled = sessions.filter(s => s.sessionStatus === 'Cancelled').length;

  document.getElementById('sTotalSessions').textContent = sessions.length;
  document.getElementById('sCompleted').textContent     = completed;
  document.getElementById('sScheduled').textContent     = scheduled;
  document.getElementById('sCancelled').textContent     = cancelled;
}

function renderTable(sessions) {
  const container = document.getElementById('sessionsBody');

  if (!sessions.length) {
    container.innerHTML = '<div class="empty-cell">No sessions found.</div>';
    return;
  }

  const sorted = [...sessions].sort((a, b) =>
    new Date(b.sessionDate) - new Date(a.sessionDate)
  );

  const total = requiredSessions || 0;
  // Position of a checkpoint in the semester (2nd semester has no Mentoring Assembly).
  const CHECKPOINTS = ['Mentoring Assembly', 'Before Prelims', 'After Prelims', 'Before Midterms', 'After Midterms', 'Before Finals'];
  const checkpointNumber = (slot, semester) => {
    const list = semester === '2nd Semester' ? CHECKPOINTS.slice(1) : CHECKPOINTS;
    const i = list.indexOf(slot);
    return i < 0 ? null : i + 1;
  };

  container.innerHTML = sorted.map(s => {
    const date           = new Date(s.sessionDate);
    const dStr           = date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const dayName        = date.toLocaleDateString('en-US', { weekday: 'long' });
    const tStr           = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const status         = menteeSessionStatus(s);
    const isCancelled    = status === 'Cancelled';
    const rawTopic       = s.topic || '';
    // Prefer the real SectionCode field (present from the moment a
    // session is created) over parsing it out of the free-text topic,
    // which is null the moment a session's notes don't start with a
    // "[SECTION]" bracket — the normal case for blank/freeform notes.
    const sectionMatch   = rawTopic.match(/^\[(.+?)\]\s*(.*)/);
    const sectionLabel   = s.sectionCode || (sectionMatch ? sectionMatch[1] : null);
    const sid            = s.sessionID;
    const cls            = `status-${status.toLowerCase().replaceAll(' ', '-')}`;
    const now            = new Date();
    const sessionDateObj = new Date(s.sessionDate);
    const isPast         = sessionDateObj < now;
    const isToday        = sessionDateObj.toDateString() === now.toDateString();
    const att            = allAttMap[sid];
    // A regular session's checkpoint name (SlotName) shows in the left
    // SESSION block. A makeup session carries the exact same SlotName
    // (see Availability.SlotName / mergeSessionsByCheckpoint above) but
    // used to be excluded here on purpose, leaving that block a bare "—"
    // and forcing the checkpoint name into a separate badge lower on the
    // card instead — the two session types showed their checkpoint in two
    // different places. Showing it here for both makes a makeup session's
    // card read the same as a regular one's.
    const sessionNum     = s.slotName || (s.isMakeup ? null : 'Session');

    const windowState=checkpointWindow(sessionCalendar,s.slotName,s.schoolYear,s.semester);
    const showQR = !isCancelled && !s.timeEnd && !windowState.disabled && !windowState.upcoming;

    // Attendance badge — show whenever session time has passed OR it's already completed
    let attBadge = '';
    if (!isCancelled && (isPast || status === 'Completed' || status === 'In Progress')) {
      attBadge = att === true
        ? `<span class="att-badge att-present"><i class="ti ti-check"></i> Present</span>`
        : att === false
          ? `<span class="att-badge att-absent"><i class="ti ti-x"></i> Absent</span>`
          : `<span class="att-badge att-pending">Not recorded</span>`;
    }

    // Action buttons — right panel
    let actions = '';
    if (isCancelled) {
      actions = `<span class="btn-detail btn-detail-disabled"><i class="ti ti-info-circle"></i> Details</span>`;
    } else {
      if (showQR) {
        actions += `<button class="btn-qr" onclick="openQrModal(${sid}, '${dStr}')"><i class="ti ti-qrcode"></i> Show QR</button>`;
      }
      actions += `<button class="btn-detail" onclick="openSessionModal(${sid}, '${dStr}')"><i class="ti ti-info-circle"></i> Details</button>`;
    }

    const typeBadge = sectionLabel
      ? `<span class="topic-section-tag${isCancelled ? ' tag-cancelled' : ''}">Scheduled Session</span>`
      : `<span class="topic-section-tag topic-makeup${isCancelled ? ' tag-cancelled' : ''}">Make-up Session</span>`;

    let cardCls = 'scm-card';
    if (isCancelled)                cardCls += ' scm-cancelled';
    else if (status === 'Completed') cardCls += ' scm-completed';
    else if (isToday)               cardCls += ' scm-today';

    const numBlock = sessionNum
      ? `<div class="scm-num-block">
           <div class="scm-num-label">SESSION</div>
           <div class="scm-num-value">${sessionNum}</div>
           <div class="scm-num-total">${checkpointNumber(s.slotName, s.semester) ?? ''} of ${total}</div>
         </div>`
      : `<div class="scm-num-block scm-num-cancelled">
           <div class="scm-num-label">SESSION</div>
           <div class="scm-num-value">—</div>
         </div>`;

    return `
      <div class="${cardCls}" id="session-card-${sid}">
        ${numBlock}
        <div class="scm-body">
          <div class="scm-date-row">
            <span class="scm-date">${dStr}</span>
          </div>
          <div class="scm-meta">
            <span><i class="ti ti-calendar-week"></i> ${dayName}</span>
            <span><i class="ti ti-clock"></i> ${tStr}</span>
          </div>
          <div class="scm-tags">${typeBadge}</div>
          <div class="scm-status-stack"><span class="session-status ${cls}">${status}</span>${attBadge}</div>
          <div class="scm-actions">${actions}</div>
        </div>
      </div>`;
  }).join('');
}

function applyFilters() {
  const q      = document.getElementById('searchInput').value.trim().toLowerCase();
  const status = document.getElementById('statusFilter').value;

  let filtered = allSessions;

  if (status) {
    filtered = filtered.filter(s => menteeSessionStatus(s) === status);
  }

  if (q) {
    filtered = filtered.filter(s => {
      const date  = new Date(s.sessionDate).toLocaleDateString('en-PH').toLowerCase();
      const topic = (s.topic || '').toLowerCase();
      return date.includes(q) || topic.includes(q);
    });
  }

  renderTable(filtered);
}

function openSessionModal(sessionId, dateStr) {
  const session      = allSessions.find(s => s.sessionID === sessionId) || {};
  const rawTopic     = session.topic || '';
  const sectionMatch = rawTopic.match(/^\[(.+?)\]\s*(.*)/);
  // Trust the backend's IsMakeup bit alone — sectionMatch below is only
  // for extracting readable topic text, not for classifying the session.
  const isMakeup     = session.isMakeup === true;
  const cleanTopic   = sectionMatch
    ? (sectionMatch[2].trim() || 'Mentoring Session')
    : (rawTopic.trim() || '');
  const status = menteeSessionStatus(session);

  const sessionNum = session.slotName || null;

  document.getElementById('sessionModalTitle').textContent = sessionNum || 'Session Details';
  document.getElementById('sessionModalDate').textContent  = dateStr;

  const sessionDateObj = new Date(session.sessionDate);
  const now            = new Date();
  const isSessionPast  = sessionDateObj < now;

  // Reuses allAttMap — already built once in loadSessions() the same way
  // the card's own attendance badge is, so no separate fetch (and no QR
  // button) needed here anymore. Nothing to show for a session that
  // hasn't happened yet.
  const att = allAttMap[sessionId];
  const attBadge = status === 'Cancelled'
    ? '<span class="att-badge att-pending">Session cancelled</span>'
    : (isSessionPast || status === 'Completed')
      ? att === true
          ? '<span class="att-badge att-present">Present</span>'
          : att === false
            ? '<span class="att-badge att-absent">Absent</span>'
            : '<span class="att-badge att-pending">Not recorded</span>'
      : null;

  const date = new Date(session.sessionDate);
  const fullDate = date.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  document.getElementById('sessionModalBody').innerHTML = `
    <div class="modal-detail-row">
      <span class="modal-detail-label">Date</span>
      <span class="modal-detail-value">${fullDate}</span>
    </div>
    <div class="modal-detail-row">
      <span class="modal-detail-label">Time</span>
      <span class="modal-detail-value">${time}</span>
    </div>
    ${!isMakeup && cleanTopic ? `
    <div class="modal-detail-row">
      <span class="modal-detail-label">Topic / Notes</span>
      <span class="modal-detail-value">${cleanTopic}</span>
    </div>` : ''}
    <div class="modal-detail-row">
      <span class="modal-detail-label">Status</span>
      <span class="modal-detail-value">
        <span class="session-status status-${status.toLowerCase()}">${status}</span>
      </span>
    </div>
    ${attBadge ? `
    <div class="modal-detail-row">
      <span class="modal-detail-label">My Attendance</span>
      <span class="modal-detail-value">${attBadge}</span>
    </div>` : ''}
  `;

  document.getElementById('sessionModal').classList.add('open');
}

async function loadAttendanceProgress() {
  try {
    const data = await apiRequest(`MonitorActivities/${mentorUserId}`, 'GET', null, true);
    const myEntry  = (data?.mentees || []).find(
      m => m.menteeID === currentUser?.userID || m.menteeUserID === currentUser?.userID
    );

    // Set section for session filtering
    if (myEntry?.sectionCode && myEntry.sectionCode !== '—') {
      menteeSection = myEntry.sectionCode;
    }

    if (!myEntry) return;

    // data.requiredSessions is the MENTOR's own total across every section
    // they handle (RequiredSessions × SectionCount — e.g. 6 checkpoints ×
    // 2 sections = 12), meant for the mentor's/admin's own progress
    // tracking. A mentee only ever belongs to ONE of those sections, so
    // their own requirement is just the semester's checkpoint count —
    // already computed correctly per-mentee as myEntry.totalSessions
    // (MenteeDetailDto.TotalSessions, set from the same unscaled
    // requiredSessions in MonitorActivitiesService.GetMentorDetailAsync).
    // Using the mentor-wide figure here showed "1 / 12 sessions" for a
    // mentee whose real requirement is 6.
    const required = myEntry.totalSessions ?? 0;
    requiredSessions = required;

    const attended = myEntry.sessionsAttended ?? 0;
    const pct      = required > 0 ? Math.round(AttendanceMetrics.percent(attended, required)) : 0;

    document.getElementById('attNum').textContent   = attended;
    document.getElementById('attDenom').textContent = `/ ${required} checkpoints`;
    document.getElementById('attBarFill').style.width = `${pct}%`;
    document.getElementById('attProgressSub').textContent =
      pct >= 100 ? 'Semester requirement met!' :
      `${pct}% complete — ${Math.max(0, required - attended)} checkpoint${required - attended !== 1 ? 's' : ''} remaining`;

    document.getElementById('attendanceBanner').style.display = '';
  } catch (e) {
    console.error('Attendance progress load failed:', e);
  }
}

function closeSessionModal(e) {
  if (!e || e.target === document.getElementById('sessionModal')) {
    document.getElementById('sessionModal').classList.remove('open');
  }
}

// ── QR MODAL ──────────────────────────────────────────────────────────────────
function openQrModal(sessionId, dateStr) {
  qrCurrentSessionId = sessionId;
  document.getElementById('qrSessionInfo').textContent = dateStr;
  document.getElementById('qrModal').classList.add('open');

  const session   = allSessions.find(s => s.sessionID === sessionId);
  const now       = new Date();
  const startTime = session ? new Date(session.sessionDate) : null;
  const endTime   = session?.timeEnd ? new Date(session.timeEnd) : null;
  const isToday   = startTime ? startTime.toDateString() === now.toDateString() : false;

  if (!isToday) {
    const label = startTime
      ? startTime.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
      : dateStr;
    // "Scheduled on [date]" reads as a future date even for one that has
    // already passed — a session dated a day or more ago (e.g. a mentor
    // created it for the wrong day, or the mentee never got around to
    // scanning that day) should say so plainly instead. (Already inside
    // the !isToday branch, so any startTime before now is a genuinely
    // past day, not just an earlier hour today.)
    const isPast = startTime ? startTime < now : false;
    showQrInactive(isPast ? `This session was on ${label}` : `Scheduled on ${label}`);
    return;
  }

  if (startTime && now < startTime) {
    const t = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    showQrInactive(`Session starts at ${t}`);
    return;
  }

  if (endTime && now > endTime) {
    const t = endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    showQrInactive(`Session ended at ${t}`);
    return;
  }

  document.getElementById('qrCountdown').textContent = 'Generating...';
  refreshQrToken();
}

function showQrInactive(message) {
  clearTimeout(qrRefreshTimer);
  clearInterval(qrCountdownTimer);
  const canvas = document.getElementById('qrCanvas');
  const ctx    = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('qrCountdown').textContent = message;
}

async function refreshQrToken() {
  clearTimeout(qrRefreshTimer);
  clearInterval(qrCountdownTimer);

  // Stop refreshing if session window has closed
  const session = allSessions.find(s => s.sessionID === qrCurrentSessionId);
  if (session) {
    const now     = new Date();
    const endTime = session.timeEnd ? new Date(session.timeEnd) : null;
    if (endTime && now > endTime) {
      const t = endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      showQrInactive(`Session ended at ${t}`);
      return;
    }
  }

  const canvas = document.getElementById('qrCanvas');
  const ctx    = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('qrCountdown').textContent = 'Generating...';

  try {
    const result = await apiRequest('QRAttendance/generate', 'POST', {
      sessionId: qrCurrentSessionId,
      menteeId:  currentUser.userID
    }, true);

    const expiry = new Date(result.expiresAt);

    QRCode.toCanvas(canvas, result.token, {
      width:  260,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    }, err => { if (err) console.error('QR gen error:', err); });

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
      document.getElementById('qrCountdown').textContent =
        remaining > 0 ? `Refreshes in ${remaining}s` : 'Refreshing...';
      if (remaining <= 0) clearInterval(qrCountdownTimer);
    };
    tick();
    qrCountdownTimer = setInterval(tick, 1000);

    const msLeft = Math.max(0, expiry - Date.now());
    qrRefreshTimer = setTimeout(refreshQrToken, msLeft);
  } catch (e) {
    console.error('QR token fetch failed:', e);
    document.getElementById('qrCountdown').textContent = 'Failed to generate — tap to retry.';
  }
}

function closeQrModal(e) {
  if (!e || e.target === document.getElementById('qrModal')) {
    document.getElementById('qrModal').classList.remove('open');
    clearTimeout(qrRefreshTimer);
    clearInterval(qrCountdownTimer);
    qrRefreshTimer     = null;
    qrCountdownTimer   = null;
    qrCurrentSessionId = null;
  }
}
