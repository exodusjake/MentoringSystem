let submissionStatusAvailable = false;
let dashboardCalendar = [];
// A first QR scan starts attendance; only Save and Close ends the session.
function dashboardSessionFinished(s) { return s.sessionStatus === 'Completed' && !!s.timeEnd; }

/* ============================================================
   ASTRA MENTEE — mentee-dashboard.js
   ============================================================ */

let currentUser   = null;
let mentorUserId  = null;
let menteeSection = null;
let allMentorIds  = new Set();

// Clicked once — recedes instead of competing for attention with
// anything still unread. Same idea as Admin's dashboard activity feed.
// Keyed by user ID so different accounts on the same browser don't share "viewed" state.
function viewedAnnouncementsKey() {
  const session = getSession();
  const userId  = session?.user?.UserID || session?.user?.userID;
  return `viewedAnnouncementIds_mentee_${userId ?? 'anon'}`;
}

function getViewedAnnouncementIds() {
  try { return new Set(JSON.parse(localStorage.getItem(viewedAnnouncementsKey()) || '[]')); }
  catch (e) { return new Set(); }
}

function markAnnouncementViewed(id) {
  const seen = getViewedAnnouncementIds();
  seen.add(id);
  localStorage.setItem(viewedAnnouncementsKey(), JSON.stringify([...seen]));
}

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentee');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  const session = getSession();
  currentUser = session.user;

  const first = currentUser?.firstName || 'Mentee';
  document.getElementById('welcomeTitle').textContent = `Welcome, ${first}!`;
  document.getElementById('dashboardDate').textContent = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  loadSemesterBadge();
  await loadAssignment();

  if (mentorUserId) {
    await loadAttendanceProgress(); // must run first — sets menteeSection
    await Promise.allSettled([
      loadSessionData(),
      loadAnnouncements(),
    ]);
  } else {
    document.getElementById('statAttended').textContent = '0';
    document.getElementById('statRequired').textContent = '/0';
    document.getElementById('statAttSub').textContent   = 'No mentor assigned yet.';
    document.getElementById('upcomingSessionsList').innerHTML =
      '<div class="empty-state"><i class="ti ti-calendar-off"></i>No mentor assigned yet.</div>';
    document.getElementById('recentSessionsList').innerHTML =
      '<div class="empty-state"><i class="ti ti-calendar-off"></i>No mentor assigned yet.</div>';
    await loadAnnouncements(); // admin posts and evaluations show regardless of mentor
  }
});

// ── ASSIGNMENT ────────────────────────────────────────────────
async function loadAssignment() {
  const menteeId = currentUser?.userID;

  try {
    const [assignments, mentorProfiles] = await Promise.all([
      apiRequest('Users/assignments', 'GET', null, true),
      apiRequest('MentorProfiles', 'GET', null, true),
    ]);

    allMentorIds = new Set((assignments || []).map(a => a.mentorUserID).filter(Boolean));

    const mine = (assignments || []).find(a => a.menteeUserID === menteeId);

    if (!mine) {
      document.getElementById('mentorPreview').innerHTML =
        '<div class="empty-state"><i class="ti ti-user-off"></i>No mentor assigned yet.</div>';
      return;
    }

    mentorUserId = mine.mentorUserID;

    const mentorUser = await apiRequest(`Users/${mentorUserId}`, 'GET', null, true);
    const profile    = (mentorProfiles || []).find(p => p.userID === mentorUserId) || {};

    const first    = mentorUser?.firstName || '';
    const last     = mentorUser?.lastName  || '';
    const name     = `${first} ${last}`.trim() || 'Mentor';
    const initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || 'M';
    const dept     = profile.department || mine.departmentName || '—';
    const school   = profile.school || mine.menteeSchool || '—';
    const contact  = mentorUser?.contactNumber || 'N/A';

    const tags =[dept !== '—' ? dept : null, school !== '—' ? school : null]
      .filter(Boolean)
      .map(t => `<span class="mentor-tag">${t}</span>`)
      .join('');

    document.getElementById('mentorPreview').innerHTML = `
      <div class="mentor-avatar-lg">${initials}</div>
      <div class="mentor-info-block">
        <div class="mentor-info-name">${name}</div>
        <div class="mentor-info-dept">${mentorUser?.email || ''}</div>
        ${tags ? `<div class="mentor-info-tags">${tags}</div>` : ''}
      </div>
    `;
  } catch (e) {
    console.error('Assignment load failed:', e);
    document.getElementById('mentorPreview').innerHTML =
      '<div class="empty-state"><i class="ti ti-user-off"></i>Could not load mentor info.</div>';
  }
}

// ── SESSION DATA ──────────────────────────────────────────────
async function loadSessionData() {
  try {
    const [data, calendar] = await Promise.all([apiRequest(`SessionsAdmin/${mentorUserId}/sessions`, 'GET', null, true), apiRequest('CalendarEvents', 'GET', null, true).catch(() => [])]);
    dashboardCalendar = Array.isArray(calendar) ? calendar : [];
    const sessions = data?.sessions || [];

    const attMap = {};

    // Completed sessions — pull real attendance so Present/Absent badges
    // and the makeup-session "was I actually invited" gate below both
    // have something to read.
    const completedIds = sessions
      .filter(s => s.sessionStatus === 'Completed' || Number(s.presentCount) > 0)
      .map(s => s.sessionID);
    if (completedIds.length) {
      const results = await Promise.allSettled(
        completedIds.map(id => apiRequest(`SessionsAdmin/session/${id}/mentees`, 'GET', null, true))
      );
      completedIds.forEach((id, i) => {
        if (results[i].status === 'fulfilled') {
          const mentees = results[i].value || [];
          const mine = mentees.find(
            m => m.menteeID === currentUser?.userID || m.menteeUserID === currentUser?.userID
          );
          // Only record attendance if the mentee has a real attendance record (attendanceID > 0).
          // MentorMentee-based rows have attendanceID = 0 and must not count for makeup sessions.
          if (mine && mine.attendanceID > 0) attMap[id] = LogsheetData.attendanceState(mine);
        }
      });
    }

    // Not-yet-completed makeup sessions — no Attendance rows exist for
    // these yet (nobody's been scanned in), so /mentees always comes back
    // empty for them. The approved-requesters endpoint is the only place
    // that knows "this mentee booked this slot" before the session
    // actually happens — without this, a freshly auto-approved makeup
    // session could never show up as Upcoming at all.
    // Trust the backend's IsMakeup bit alone — the old "topic starts with
    // a bracket" fallback wrongly flagged a regular session as makeup
    // whenever its Notes didn't happen to start with "[SECTION]" (the
    // normal case for freeform/blank notes, not an edge case).
    const upcomingMakeupIds = sessions
      .filter(s => s.isMakeup === true && (!s.timeEnd || s.sessionStatus === 'Cancelled'))
      .map(s => s.sessionID);
    if (upcomingMakeupIds.length) {
      const results = await Promise.allSettled(
        upcomingMakeupIds.map(id => apiRequest(`SessionsAdmin/session/${id}/requester`, 'GET', null, true))
      );
      upcomingMakeupIds.forEach((id, i) => {
        if (results[i].status === 'fulfilled') {
          const mentees = results[i].value || [];
          const mine = mentees.find(
            m => m.menteeID === currentUser?.userID || m.menteeUserID === currentUser?.userID
          );
          // Present/absent isn't known yet — this just marks "you're one
          // of the approved requesters for this slot," which is all
          // renderUpcomingSessions' makeup-session gate actually checks.
          if (mine && !Object.prototype.hasOwnProperty.call(attMap, id)) attMap[id] = null;
        }
      });
    }

    renderUpcomingSessions(sessions, attMap);
  } catch (e) {
    console.error('Sessions load failed:', e);
    document.getElementById('upcomingSessionsList').innerHTML =
      '<div class="empty-state"><i class="ti ti-calendar-off"></i>Unable to load sessions. Please refresh.</div>';
    document.getElementById('recentSessionsList').innerHTML =
      '<div class="empty-state"><i class="ti ti-calendar-off"></i>Unable to load sessions. Please refresh.</div>';
  }
}

// ── ATTENDANCE PROGRESS ───────────────────────────────────────
async function loadAttendanceProgress() {
  try {
    const data    = await apiRequest(`MonitorActivities/${mentorUserId}`, 'GET', null, true);
    const myEntry  = (data?.mentees || []).find(
      m => m.menteeID === currentUser?.userID || m.menteeUserID === currentUser?.userID
    );
    // data.requiredSessions is the mentor's own total across every section
    // they handle (RequiredSessions × SectionCount) — a mentee only
    // belongs to one of those sections, so use their own per-mentee
    // requirement instead (myEntry.totalSessions), same fix as
    // MENTEE/JS/sessions.js's loadAttendanceProgress.
    const required = myEntry?.totalSessions ?? 0;
    const attended = myEntry?.sessionsAttended ?? 0;

    if (myEntry?.sectionCode && myEntry.sectionCode !== '—') {
      menteeSection = myEntry.sectionCode;
    }

    document.getElementById('statAttended').textContent = attended;
    document.getElementById('statRequired').textContent = `/${required}`;
    document.getElementById('statAttSub').textContent   =
      required === 0         ? 'No requirement set' :
      attended >= required   ? 'Semester requirement met!' :
                               `${Math.max(0, required - attended)} checkpoint${required - attended !== 1 ? 's' : ''} remaining`;
  } catch (e) {
    console.error('Attendance progress load failed:', e);
    document.getElementById('statAttended').textContent = '—';
    document.getElementById('statRequired').textContent = '/—';
    document.getElementById('statAttSub').textContent   = '—';
  }
}

// A session stays "upcoming" until it is completed, cancelled, or its
// checkpoint window closes.
function isOpenSession(s) {
  const state = dashboardSessionState(s, dashboardCalendar);
  return state === 'Upcoming' || state === 'Past Scheduled' || state === 'In Progress';
}

function sessionItemHtml(s, attMap) {
  const date              = new Date(s.sessionDate);
  const month             = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day               = date.getDate();
  const time              = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  // Trust the backend's IsMakeup bit alone — the old "topic starts with a
  // bracket" check wrongly labeled a regular session "Make-up Session"
  // whenever its Notes didn't happen to start with "[SECTION]".
  const checkpoint        = s.slotName || '';
  const displayTopic      = s.isMakeup
    ? (checkpoint ? `Make-up Session: ${checkpoint}` : 'Make-up Session')
    : (checkpoint || 'Scheduled Session');
  const courseTag         = !s.isMakeup && s.sectionCode ? ` <span class="session-course-tag">${s.sectionCode}</span>` : '';
  const isActualCompleted = dashboardSessionFinished(s);
  const inProgress = (s.sessionStatus === 'Completed' && !s.timeEnd) || Number(s.presentCount) > 0;
  const isCancelled       = s.sessionStatus === 'Cancelled';
  const cls               = isActualCompleted ? ' session-item-completed' : isCancelled ? ' session-item-cancelled' : '';

  // A session that's neither Completed nor Cancelled but whose date has
  // already gone by (mentor never took attendance, or — like a test
  // session — was simply dated wrong) used to just vanish from the
  // dashboard: too late for "Upcoming," never marked Completed for
  // "Recent." It still needs a plain label here so it's clear this isn't
  // a future booking.
  const now       = new Date();
  const today0    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const session0  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const isToday   = !isActualCompleted && !isCancelled && session0.getTime() === today0.getTime();
  const isOverdue = !isActualCompleted && !isCancelled && session0.getTime() <  today0.getTime();

  const tag = isActualCompleted
    ? '<span class="session-completed-tag">Completed</span>'
    : isCancelled
    ? '<span class="session-completed-tag" style="background:#fee2e2;color:#dc2626;border-color:#fecaca;">Cancelled</span>'
    : dashboardSessionState(s, dashboardCalendar) === 'Closed'
    ? '<span class="session-completed-tag">Closed</span>'
    : inProgress
    ? '<span class="session-completed-tag">In Progress</span>'
    : isToday
    ? '<span class="session-completed-tag" style="background:#ede9fe;color:#6d28d9;border-color:#ddd6fe;">Today</span>'
    : isOverdue
    ? '<span class="session-completed-tag" style="background:#fef3c7;color:#92400e;border-color:#fde68a;">Overdue</span>'
    : '';

  let attBadge = '';
  if (isActualCompleted || inProgress) {
    const att = attMap[s.sessionID];
    if (att === true)       attBadge = '<span class="session-att-tag att-present">Present</span>';
    else if (att === false && isActualCompleted) attBadge = '<span class="session-att-tag att-absent">Absent</span>';
  }

  return `
    <div class="session-item${cls}">
      <div class="session-date-block">
        <div class="session-month">${month}</div>
        <div class="session-day">${day}</div>
      </div>
      <div class="session-info">
        <div class="session-title">${displayTopic}${courseTag}</div>
        <div class="session-time">${time} ${tag} ${attBadge}</div>
      </div>
    </div>`;
}

// Own card, separate from Recent Sessions — matches the dashboard's
// 4-quadrant layout (Upcoming/Recent Sessions, Announcements/Evaluation
// Announcements).
function renderUpcomingSessions(sessions, attMap = {}) {
  const filtered = sessions.filter(s => {
    // Trust the backend fields directly — s.isMakeup (SessionRowDto.
    // IsMakeup) and s.sectionCode (present from the moment a session is
    // created) — instead of regex-parsing a "[SECTION]" prefix out of the
    // free-text Topic, which silently mismatched any session whose Notes
    // didn't happen to start with a bracket (the normal case for blank/
    // freeform notes, not an edge case).
    // Makeup sessions are private — only show if this mentee has a real attendance record.
    if (s.isMakeup === true) return attMap.hasOwnProperty(s.sessionID);
    if (!menteeSection) return true;
    return s.sectionCode === menteeSection;
  });

  // "Upcoming" really means "not yet resolved" — a session whose date
  // has already passed but was never marked Completed or Cancelled (the
  // mentor never took attendance, or it was scheduled for the wrong day)
  // still belongs here, tagged "Today"/"Overdue" by sessionItemHtml, so
  // it doesn't just disappear from the dashboard entirely.
  const upcoming = filtered
    .filter(s => isOpenSession(s))
    .sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate))
    .slice(0, 3);

  const container = document.getElementById('upcomingSessionsList');
  container.innerHTML = upcoming.length
    ? upcoming.map(s => sessionItemHtml(s, attMap)).join('')
    : '<div class="empty-state"><i class="ti ti-calendar-off"></i>No upcoming sessions.</div>';

  renderRecentSessions(filtered, attMap);
}

function renderRecentSessions(filtered, attMap = {}) {
  // Show completed sessions regardless of whether the date is past or future
  const recentCompleted = filtered
    .filter(s => !isOpenSession(s))
    .sort((a, b) => new Date(b.cancelledAt || b.sessionDate) - new Date(a.cancelledAt || a.sessionDate))
    .slice(0, 3);

  const container = document.getElementById('recentSessionsList');
  container.innerHTML = recentCompleted.length
    ? recentCompleted.map(s => sessionItemHtml(s, attMap)).join('')
    : '<div class="empty-state"><i class="ti ti-calendar-off"></i>No recent sessions.</div>';
}

// ── ANNOUNCEMENTS ─────────────────────────────────────────────
async function loadAnnouncements() {
  try {
    const [annResult, evalResult, subResult] = await Promise.allSettled([
      apiRequest('Announcements',              'GET', null, true),
      apiRequest('EvaluationLinks',             'GET', null, true),
      apiRequest('EvaluationSubmissions/mine',  'GET', null, true),
    ]);
    if (annResult.status === 'rejected') throw annResult.reason;
    const items     = annResult.value;
    const evalLinks = evalResult.status === 'fulfilled' ? evalResult.value : [];
    submissionStatusAvailable = subResult.status === 'fulfilled' && Array.isArray(subResult.value);
    const mySubs    = subResult.status === 'fulfilled' ? (subResult.value || []) : [];
    // linkID -> proof screenshot path — lets the card offer "View" on what
    // was actually uploaded, not just a plain Submitted badge.
    const myProofPaths = new Map(mySubs.map(s => [s.linkID, s.proofFilePath || null]));

    // Show only active announcements: assigned mentor's posts + admin posts (non-mentor posters)
    const filtered = (items || []).filter(a => {
      if (!a.isActive) return false;
      if (a.postedByUserID === mentorUserId) return true;
      if (allMentorIds.has(a.postedByUserID)) return false;
      const aud = (a.targetAudience || '').toLowerCase();
      return aud === 'mentee' || aud === 'both';
    });

    const filteredEvals = (evalLinks || [])
      .filter(e => {
        if (!e.isActive) return false;
        const role = (e.targetRole || '').toLowerCase();
        return role === 'mentee' || role === 'both';
      })
      .map(e => ({ ...e, _type: 'evaluation' }));

    renderAnnouncementCards(filtered);
    renderEvaluationCards(filteredEvals, myProofPaths, submissionStatusAvailable);
  } catch (e) {
    console.error('Announcements load failed:', e);
    document.getElementById('announcementsList').innerHTML =
      '<div class="empty-state"><i class="ti ti-speakerphone-off"></i>Could not load announcements.</div>';
    document.getElementById('evaluationsList').innerHTML =
      '<div class="empty-state"><i class="ti ti-clipboard-off"></i>Could not load evaluations.</div>';
  }
}

// Own card, separate from Evaluations — matches the dashboard's 4-quadrant
// layout (Upcoming/Recent Sessions, Announcements/Evaluation Announcements).
function renderAnnouncementCards(filtered) {
  const container = document.getElementById('announcementsList');
  const recent = [...filtered]
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
    .slice(0, 4);

  if (!recent.length) {
    container.innerHTML = '<div class="empty-state"><i class="ti ti-speakerphone-off"></i>No announcements yet.</div>';
    return;
  }

  const viewedAnnouncementIds = getViewedAnnouncementIds();

  container.innerHTML = recent.map(a => {
    const title        = a.title   || 'Announcement';
    const content      = a.content || '';
    const date         = new Date(a.postedAt || Date.now())
      .toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const isFromMentor = a.postedByUserID === mentorUserId;
    // Not "everyone but the mentor is Admin" anymore — Head Admin's
    // posts get their own label instead of being folded into Admin's.
    const isHead        = !isFromMentor && (a.posterRole || '').toLowerCase() === 'head';
    const sourceClass   = isFromMentor ? 'mentor' : isHead ? 'head' : 'admin';
    const sourceLabel   = isFromMentor ? 'Mentor'  : isHead ? 'Head Admin' : 'Admin';
    const posterFirst  = a.posterFirstName || '';
    const posterLast   = a.posterLastName  || '';
    const posterName   = `${posterFirst} ${posterLast}`.trim();
    const isViewed      = viewedAnnouncementIds.has(a.announcementID);

    return `
      <div class="announce-item${isFromMentor ? ' from-mentor' : ''}${isViewed ? ' viewed' : ''}" data-announcement-id="${a.announcementID}">
        <div class="announce-author-row"><span class="announce-source-wrap">
            ${posterName ? `<span class="announce-poster-name">${escapeHtml(posterName)}</span>` : ''}
            <span class="announce-source ${sourceClass}">${sourceLabel}</span>
          </span></div>
          <div class="announce-title">${escapeHtml(title)}</div>
        <div class="announce-body">${sanitizeHtml(content)}</div>
        <div class="announce-footer">
          <span class="announce-date">${date}</span>

        </div>
      </div>`;
  }).join('');

  // Clicking a card marks it read (so it's already faded next visit) and
  // takes the mentee straight to that post on the full Announcements page —
  // this widget is a preview, not the place to read the whole thing.
  container.querySelectorAll('.announce-item[data-announcement-id]').forEach(item => {
    item.addEventListener('click', () => {
      const id = Number(item.dataset.announcementId);
      markAnnouncementViewed(id);
      window.location.href = `announcements.html?id=${id}`;
    });
  });
}

function renderEvaluationCards(filteredEvals, myProofPaths, statusAvailable = true) {
  const container = document.getElementById('evaluationsList');
  const recent = [...filteredEvals]
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
    .slice(0, 4);

  if (!recent.length) {
    container.innerHTML = '<div class="empty-state"><i class="ti ti-clipboard-off"></i>No evaluations posted.</div>';
    return;
  }

  container.innerHTML = recent.map(a => {
    const title          = a.title || 'Evaluation';
    const desc           = a.description || '';
    const date           = new Date(a.postedAt || Date.now())
      .toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const now        = new Date();
    const dlResolved = evaluationDeadline(a.deadline);
    const isDeadlinePast = dlResolved && dlResolved <= now;
    const isDeadlineSoon = dlResolved && !isDeadlinePast && (dlResolved - now) < 3 * 24 * 60 * 60 * 1000;
    const deadlineHtml   = a.deadline ? (() => {
      const dlStr = evaluationDeadlineLabel(a.deadline);
      const cls   = isDeadlinePast ? 'dash-eval-deadline past' : isDeadlineSoon ? 'dash-eval-deadline soon' : 'dash-eval-deadline';
      return `<span class="${cls}"><i class="ti ti-clock"></i> Due ${dlStr}${isDeadlinePast ? ' · Overdue' : ''}</span>`;
    })() : '';
    const submitted      = myProofPaths.has(a.linkID);
    const proofPath      = myProofPaths.get(a.linkID);
    const actionHtml     = isDeadlinePast
      ? `<span class="dash-eval-closed">Open Form</span>`
      : submitted
        ? `<a href="${escapeHtml(a.googleFormURL)}" target="_blank" rel="noopener noreferrer" class="dash-eval-link-muted">Open Form</a>`
        : `<a href="${escapeHtml(a.googleFormURL)}" target="_blank" rel="noopener noreferrer" class="dash-eval-btn"><i class="ti ti-external-link"></i> Open Form</a>`;
    const markHtml       = !statusAvailable
      ? '<span role="status">Submission status unavailable.</span><button type="button" class="dash-eval-mark-btn" onclick="loadAnnouncements()">Retry</button>'
      : submitted
      ? `<span class="dash-eval-submitted-badge"><i class="ti ti-check"></i> Submitted</span>
         ${proofPath ? `<a class="eval-view-proof-link" href="${CONFIG.getFileUrl(proofPath)}" target="_blank" rel="noopener">View</a>` : ''}`
      : `<label class="dash-eval-mark-btn dash-eval-upload-label">
           <i class="ti ti-upload"></i> Upload proof
           <input type="file" accept="image/*" hidden onchange="uploadEvalProofDash(${a.linkID}, this)">
         </label>
       <details class="eval-upload-instructions">
         <summary>Upload instructions: images up to 20 MB</summary>
         Upload a clear screenshot of the evaluation form's submission confirmation. Accepted: JPG/JPEG, PNG, GIF, WEBP; maximum 20 MB per file. HEIC/HEIF and RAW are not supported: export a JPG/PNG copy first. For iPhone screenshots, use Settings &gt; General &gt; Screen Capture &gt; SDR, if available, to save PNG. If too large, resize or compress the image while keeping the text readable.
       </details>
         <span class="eval-upload-error" id="dash-eval-upload-err-${a.linkID}"></span>`;
    return `
      <div class="announce-item announce-item-eval${submitted ? ' eval-submitted' : ''}" data-eval-link-id="${a.linkID}">
        <div class="announce-title">${escapeHtml(title)}</div>
        <div class="evaluation-author"><strong>${escapeHtml(a.postedByName || 'Name unavailable')}</strong></div>
        ${desc ? `<div class="announce-body">${sanitizeHtml(desc)}</div>` : ''}
        <div class="announce-footer">
          <span class="announce-date">${date}</span>
          <span class="announce-source-wrap">
            ${deadlineHtml}
            ${isDeadlinePast ? '<span>You can still upload proof after the deadline.</span>' : ''}
            <span class="announce-source evaluation">Evaluation</span>
            ${markHtml}
            ${actionHtml}
          </span>
        </div>
      </div>`;
  }).join('');

  // Evaluation cards navigate to the full Announcements page, but only from
  // a click that isn't on one of the card's own action buttons (Open Form,
  // Upload proof, View, Undo) — those need to keep working in place, not
  // also send the mentee off to another page. No "viewed" fade here — the
  // card's own submitted/not-submitted state already says whether it needs
  // attention, a generic read-fade on top would just muddy that.
  container.querySelectorAll('.announce-item-eval[data-eval-link-id]').forEach(item => {
    item.addEventListener('click', (event) => {
      if (event.target.closest('details, summary, a, button, input, label, .dash-eval-btn, .dash-eval-link-muted, .dash-eval-closed, .dash-eval-mark-btn, .eval-unmark-btn, .eval-view-proof-link')) return;
      window.location.href = `announcements.html?id=eval-${item.dataset.evalLinkId}`;
    });
  });
}

// Uploading the screenshot IS the submit action — no separate confirm step.
async function uploadEvalProofDash(linkId, inputEl) {
  if (!submissionStatusAvailable) return;
  const file  = inputEl.files?.[0];
  if (!file) return;
  const errEl = document.getElementById(`dash-eval-upload-err-${linkId}`);
  if (errEl) errEl.textContent = '';

  if (validateUploadFile(file, 'EvaluationSubmissions/upload')) {
    if (errEl) errEl.textContent = validateUploadFile(file, 'EvaluationSubmissions/upload');
    inputEl.value = '';
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    if (errEl) errEl.textContent = 'File is too large. Maximum size is 20 MB.';
    inputEl.value = '';
    return;
  }

  const label = inputEl.closest('.dash-eval-upload-label');
  label?.classList.add('is-uploading');
  try {
    const fd = new FormData();
    fd.append('linkId', linkId);
    fd.append('file', file);
    await apiRequest('EvaluationSubmissions/upload', 'POST', fd, true);
    await loadAnnouncements();
  } catch (e) {
    console.error('Proof upload failed:', e);
    if (errEl) errEl.textContent = e.message || 'Upload failed. Please try again.';
    label?.classList.remove('is-uploading');
    inputEl.value = '';
  }
}

// ── SEMESTER BADGE ────────────────────────────────────────────
async function loadSemesterBadge() {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    const semester  = data?.Semester   || data?.semester   || '1st Semester';
    const schoolYear = data?.SchoolYear || data?.schoolYear || '2026-2027';
    document.getElementById('semesterBadge').textContent = `${semester} · SY ${schoolYear}`;
  } catch (e) {
    document.getElementById('semesterBadge').textContent = '';
  }
}
