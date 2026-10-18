/* ============================================================
   ASTRA MENTEE — walkthrough.js
   Spotlight tour across the mentee portal: the page is blurred and the part
   being explained stays sharp, with a tooltip beside it. Order follows the
   portal: Dashboard → Sessions → Schedule Session → Announcements → Profile
   → Logout.
   - Runs once, automatically, right after the mentee uploads their e-signature
     in setup (setup.js sets the "pending" flag).
   - Replay any time from Profile → "Replay Walkthrough" (startWalkthrough()).
   - The tour moves between pages by itself (progress is kept in sessionStorage).
   - Every page shows SAMPLE data while the tour runs, because a new mentee
     usually has nothing yet. Nothing real is read, changed or saved; when the
     tour ends (or moves on) the page reloads so the real data comes back.
   ============================================================ */
(function () {
  'use strict';

  var BASE = '/MENTEE/HTML/';
  var userId = null;
  try { userId = JSON.parse(localStorage.getItem('user') || 'null')?.userID ?? null; } catch (e) {}
  var PENDING_KEY = 'astra_walkthrough_pending_' + userId;
  var DONE_KEY    = 'astra_walkthrough_done_' + userId;
  var STATE_KEY   = 'astra_walkthrough_state';

  function lsGet(k)    { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k)    { try { localStorage.removeItem(k); } catch (e) {} }
  function ssGet(k)    { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k)    { try { sessionStorage.removeItem(k); } catch (e) {} }

  function currentPage() { return (location.pathname.split('/').pop() || '').toLowerCase(); }

  // ── SAMPLE DATA (tour only) ────────────────────────────────
  var DONE_TAG = '<span class="session-completed-tag">Completed</span> <span class="session-att-tag att-present">Present</span>';
  function dashSession(month, day, title, time, tag, cls) {
    return '<div class="session-item' + (cls || '') + '" data-wt="1"><div class="session-date-block"><div class="session-month">' + month +
      '</div><div class="session-day">' + day + '</div></div><div class="session-info"><div class="session-title">' + title +
      ' <span class="session-course-tag">BSIT</span></div><div class="session-time">' + time + ' ' + tag + '</div></div></div>';
  }
  function setText(id, t) { var el = document.getElementById(id); if (el) el.textContent = t; }
  function putHtml(id, html) {
    var el = document.getElementById(id);
    if (el && !el.querySelector('[data-wt]')) el.innerHTML = html;
  }

  function sampleDashboard() {
    putHtml('mentorPreview',
      '<div class="mentor-avatar-lg" data-wt="1">MS</div><div class="mentor-info-block"><div class="mentor-info-name">Maria Santos</div>' +
      '<div class="mentor-info-dept">maria.santos@sample.edu</div><div class="mentor-info-tags"><span class="mentor-tag">CCIT</span><span class="mentor-tag">School of Technology</span></div></div>');
    setText('statAttended', '3'); setText('statRequired', '/6'); setText('statAttSub', '3 of 6 checkpoints attended');
    putHtml('upcomingSessionsList', dashSession('NOV', '12', 'Before Prelims', '9:00 AM', '<span class="session-completed-tag" style="background:#ede9fe;color:#6d28d9;border-color:#ddd6fe;">Today</span>'));
    putHtml('recentSessionsList',
      dashSession('OCT', '08', 'Mentoring Assembly', '10:00 AM', DONE_TAG, ' session-item-completed') +
      dashSession('SEP', '24', 'Goal Setting', '2:00 PM', '<span class="session-completed-tag" style="background:#fee2e2;color:#dc2626;border-color:#fecaca;">Cancelled</span>', ' session-item-cancelled'));
    putHtml('announcementsList', '<div class="announce-item" data-wt="1"><div class="announce-title">Prelim checkpoint window opens Nov 10</div><div class="announce-body">You can book your Before Prelims session from Nov 10.</div><div class="announce-footer"><span class="announce-date">Oct 15, 2026</span></div></div>');
    putHtml('evaluationsList', '<div class="announce-item" data-wt="1"><div class="announce-title">Mentoring Program Evaluation</div><div class="announce-body">Share your feedback about your mentoring experience.</div><div class="announce-footer"><span class="announce-date">Oct 12, 2026</span></div></div>');
  }

  function scmCard(label, num, dateStr, day, time, statusCls, status, att, actions, extra) {
    return '<div class="scm-card' + (extra || '') + '" data-wt="1"><div class="scm-num-block"><div class="scm-num-label">SESSION</div><div class="scm-num-value">' + label +
      '</div><div class="scm-num-total">' + num + ' of 6</div></div><div class="scm-body"><div class="scm-date-row"><span class="scm-date">' + dateStr + '</span></div>' +
      '<div class="scm-meta"><span><i class="ti ti-calendar-week"></i> ' + day + '</span><span><i class="ti ti-clock"></i> ' + time + '</span></div>' +
      '<div class="scm-tags"><span class="topic-section-tag">Scheduled Session</span></div>' +
      '<div class="scm-status-stack"><span class="session-status ' + statusCls + '">' + status + '</span>' + att + '</div><div class="scm-actions">' + actions + '</div></div></div>';
  }
  function sampleSessions() {
    var b = document.getElementById('attendanceBanner');
    if (b) b.style.display = '';
    setText('attNum', '3'); setText('attDenom', '/ 6 checkpoints'); setText('attProgressSub', '50% complete — 3 checkpoints remaining');
    var f = document.getElementById('attBarFill'); if (f) f.style.width = '50%';
    setText('sTotalSessions', '4'); setText('sCompleted', '3'); setText('sScheduled', '1'); setText('sCancelled', '0');
    setText('sessionSubtitle', '4 sessions on record');
    putHtml('sessionsBody',
      scmCard('Before Prelims', 4, 'November 12, 2026', 'Thursday', '9:00 AM', 'status-scheduled', 'Scheduled', '<span class="att-badge att-pending">Not recorded</span>',
        '<button class="btn-qr" type="button"><i class="ti ti-qrcode"></i> Show QR</button><button class="btn-detail" type="button"><i class="ti ti-info-circle"></i> Details</button>', ' scm-today') +
      scmCard('Mentoring Assembly', 1, 'October 8, 2026', 'Thursday', '10:00 AM', 'status-completed', 'Completed', '<span class="att-badge att-present"><i class="ti ti-check"></i> Present</span>',
        '<button class="btn-detail" type="button"><i class="ti ti-info-circle"></i> Details</button>', ' scm-completed'));
  }

  var scheduleApproved = false;
  function sampleSchedule() {
    var load = document.getElementById('slotsLoading'), empty = document.getElementById('slotsEmpty'), grid = document.getElementById('slotsGrid');
    if (load) load.style.display = 'none';
    if (empty) empty.style.display = 'none';
    if (!grid) return;
    grid.style.display = '';
    var want = scheduleApproved ? 'approved' : 'open';
    if (grid.querySelector('[data-wt="' + want + '"]')) return;
    var badge = scheduleApproved ? '<span class="sch-approved-badge"><i class="ti ti-check"></i> Session Approved</span>' : '<span class="sch-available-badge">Available</span>';
    var btn = scheduleApproved
      ? '<button class="btn-request btn-request-approved" type="button" disabled><i class="ti ti-calendar-check"></i> Session Scheduled</button>'
      : '<button class="btn-request" type="button">Request This Slot</button>';
    grid.innerHTML = '<div class="sch-slot-card' + (scheduleApproved ? ' already-approved' : '') + '" data-wt="' + want + '"><div class="sch-slot-header"><span class="sch-slot-mentor">Maria Santos</span>' + badge + '</div>' +
      '<div><div class="sch-slot-date">November 12, 2026</div><div class="sch-slot-day">Thursday</div><span class="sch-slot-name-tag">Before Prelims</span></div>' +
      '<div class="sch-slot-time"><i class="ti ti-clock"></i> 9:00 AM</div>' + btn + '</div>';
  }

  function annCard(mentor, name, initials, roleCls, roleLbl, date, title, body, pinned) {
    return '<div class="announce-card ' + (mentor ? 'announce-card-mentor' : 'announce-card-admin') + (pinned ? ' announce-card--pinned' : '') + '" data-wt="1">' +
      (pinned ? '<div class="ann-pin-banner"><i class="ti ti-pinned"></i> Pinned</div>' : '') +
      '<div class="ann-card-top"><div class="ann-avatar ' + (mentor ? 'ann-avatar-teal' : 'ann-avatar-indigo') + '">' + initials + '</div><div class="ann-card-info"><div class="ann-card-name">' + name +
      ' <span class="ann-role-badge ' + roleCls + '">' + roleLbl + '</span></div><div class="ann-card-date">' + date + '</div></div></div>' +
      '<div class="announce-title">' + title + '</div><div class="announce-content">' + body + '</div></div>';
  }
  var annTab = 'admin';
  function sampleAnnouncements() {
    var sub = document.getElementById('announceSubtitle'); if (sub) sub.textContent = '1 from admin · 1 from your mentor';
    var admin = document.getElementById('tab-admin'), mentor = document.getElementById('tab-mentor');
    if (admin) admin.classList.toggle('active', annTab === 'admin');
    if (mentor) mentor.classList.toggle('active', annTab === 'mentor');
    var list = document.getElementById('announcementsList');
    if (!list || list.querySelector('[data-wt-tab="' + annTab + '"]')) return;
    list.innerHTML = '<div data-wt-tab="' + annTab + '">' + (annTab === 'admin'
      ? annCard(false, 'Daniela Barranda', 'DB', 'role-admin', 'Administrator', 'Oct 15, 2026', 'Prelim checkpoint window opens Nov 10', 'Please be informed that the Before Prelims checkpoint opens on Nov 10. Book your session through Schedule Session before the window closes.', true)
      : annCard(true, 'Maria Santos', 'MS', 'role-mentor', 'Mentor', 'Oct 18, 2026', 'Bring your ID to the next session', 'Hello, Mentees! Please bring your school ID so your attendance can be verified.', false)) + '</div>';
  }

  var PAGE_SAMPLE = {
    'mentee-dashboard.html': sampleDashboard, 'sessions.html': sampleSessions,
    'schedule-session.html': sampleSchedule, 'announcements.html': sampleAnnouncements
  };
  var sampleOn = false;
  function applySample() {
    var fn = PAGE_SAMPLE[currentPage()];
    if (fn) { fn(); sampleOn = true; }
  }

  // ── STEPS (order = your outline) ───────────────────────────
  var STEPS = [
    // Dashboard
    { page: 'mentee-dashboard.html', sel: '#nav-dashboard', side: 'right', title: 'Dashboard', text: 'Your home base. Here you see your mentor, your upcoming sessions and your recent sessions at a glance.' },
    { page: 'mentee-dashboard.html', sel: '.mentor-preview-card', sample: true, title: 'My Mentor', text: 'Your assigned mentor for the semester: name, email, department and school, so you always know who to reach out to.' },
    { page: 'mentee-dashboard.html', all: '.sessions-card', nth: 0, sample: true, title: 'Upcoming Sessions', text: 'Your next booked sessions, regular or make-up, tagged Today or Overdue when needed.' },
    { page: 'mentee-dashboard.html', all: '.sessions-card', nth: 1, sample: true, title: 'Recent Sessions', text: 'Sessions that are already done or cancelled, with your Present or Absent mark.' },
    // Sessions
    { page: 'sessions.html', sel: '#nav-sessions', side: 'right', title: 'Sessions', text: 'The full list of your mentoring sessions and your semester record.' },
    { page: 'sessions.html', sel: '#attendanceBanner', sample: true, title: 'Record', text: 'Your semester record: how many checkpoints you have completed out of the required total, plus a count of completed, scheduled and cancelled sessions.' },
    { page: 'sessions.html', sel: '.btn-qr', sample: true, title: 'Show QR', text: 'On the day of a session, tap Show QR and let your mentor scan it. That is how your attendance is recorded. The code refreshes every couple of minutes.' },
    { page: 'sessions.html', sel: '.btn-detail', sample: true, title: 'Details', text: 'Open Details to see the date, time, topic, status and whether your attendance has been recorded.' },
    // Schedule
    { page: 'schedule-session.html', sel: '#nav-schedule', side: 'right', title: 'Scheduled Sessions', text: 'Book your checkpoint sessions here, using time slots your mentor has opened.' },
    { page: 'schedule-session.html', sel: '.btn-request', sample: true, title: 'Request This Slot', text: 'Found a time that works for you? Tap Request This Slot.' },
    { page: 'schedule-session.html', sel: '#requestModal .btn-save', sample: true, enter: 'openModal', leave: 'closeModal', title: 'Send Request', text: 'Optionally add what you want to discuss, then tap Send Request. The slot is booked right away.' },
    { page: 'schedule-session.html', sel: '.sch-slot-card', sample: true, enter: 'approve', title: 'Session Scheduled', text: 'The card now reads Session Scheduled, and the session appears on your Sessions page immediately.' },
    // Announcements
    { page: 'announcements.html', sel: '#nav-announce', side: 'right', title: 'Announcements', text: 'News and evaluation forms from the program team and your mentor. A red badge shows when something is new.' },
    { page: 'announcements.html', sel: '.announce-card', sample: true, enter: 'tabAdmin', title: 'Admin Announcement', text: 'The Administration tab holds official announcements and evaluation forms from the admins. Pinned posts stay on top.' },
    { page: 'announcements.html', sel: '.announce-card', sample: true, enter: 'tabMentor', title: 'My Mentor Announcement', text: 'The From My Mentor tab shows what your own mentor posts, and you can comment on them.' },
    // Profile + Logout
    { page: 'profile.html', sel: '#nav-profile', side: 'right', title: 'Profile', text: 'View your account and academic details, update your contact number, change your password or replace your signature. You can replay this tour from here too.' },
    { page: 'profile.html', sel: '.logout-btn', side: 'right', title: 'Logout', text: 'When you are done, use Logout to sign out safely, especially on a shared computer.' }
  ];

  var HOOKS = {
    openModal: function () {
      var m = document.getElementById('requestModal'), d = document.getElementById('requestSlotDesc');
      if (d) d.textContent = 'Maria Santos · November 12, 2026, 9:00 AM';
      if (m) m.classList.add('open');
    },
    closeModal: function () { var m = document.getElementById('requestModal'); if (m) m.classList.remove('open'); },
    approve: function () { scheduleApproved = true; HOOKS.closeModal(); sampleSchedule(); },
    tabAdmin: function () { annTab = 'admin'; sampleAnnouncements(); },
    tabMentor: function () { annTab = 'mentor'; sampleAnnouncements(); }
  };

  function targetOf(step) {
    if (step.all) return document.querySelectorAll(step.all)[step.nth || 0] || null;
    return step.sel ? document.querySelector(step.sel) : null;
  }
  function usable(step) {
    var el = targetOf(step);
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth; // off-canvas mobile sidebar → not usable
  }

  // ── STYLES ─────────────────────────────────────────────────
  var css = [
    '.wt-blur{position:fixed;inset:0;z-index:100040;background:rgba(30,27,75,.32);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;transition:opacity .35s ease,clip-path .5s cubic-bezier(.65,0,.35,1)}',
    '.wt-blur.show{opacity:1}',
    '.wt-ring{position:fixed;z-index:100041;border-radius:14px;border:2px solid #6366f1;box-shadow:0 0 0 4px rgba(99,102,241,.22),0 0 30px rgba(79,70,229,.5);pointer-events:auto;opacity:0;transition:left .5s cubic-bezier(.65,0,.35,1),top .5s cubic-bezier(.65,0,.35,1),width .5s cubic-bezier(.65,0,.35,1),height .5s cubic-bezier(.65,0,.35,1),opacity .3s ease;animation:wtGlow 2.4s ease-in-out infinite}',
    '@keyframes wtGlow{0%,100%{box-shadow:0 0 0 4px rgba(99,102,241,.22),0 0 24px rgba(79,70,229,.40)}50%{box-shadow:0 0 0 6px rgba(99,102,241,.14),0 0 36px rgba(79,70,229,.62)}}',
    '.wt-ring.show{opacity:1}.wt-ring.none{opacity:0!important}',
    '.wt-tip{position:fixed;z-index:100042;width:320px;max-width:calc(100vw - 24px);box-sizing:border-box;background:#fff;border:1px solid #c7d2fe;border-radius:16px;padding:16px 18px;box-shadow:0 20px 50px rgba(30,27,75,.35);font-family:"DM Sans",system-ui,sans-serif;opacity:0;transform:translateY(10px) scale(.97);transition:opacity .3s ease,transform .4s cubic-bezier(.22,1,.36,1),left .5s cubic-bezier(.65,0,.35,1),top .5s cubic-bezier(.65,0,.35,1)}',
    '.wt-tip.show{opacity:1;transform:none}',
    '.wt-inner{transition:opacity .18s ease,transform .22s ease}.wt-inner.swap{opacity:0;transform:translateY(6px)}',
    '.wt-track,.wt-track.wt-ring,.wt-track.wt-tip,.wt-track.wt-blur{transition:none!important}',
    '.wt-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
    '.wt-icon{width:34px;height:34px;border-radius:10px;background:#eef2ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}',
    '.wt-step{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.wt-sample{font-size:9.5px;font-weight:700;letter-spacing:.06em;color:#92400e;background:#fef3c7;border-radius:5px;padding:2px 6px}',
    '.wt-title{font-size:18px;font-weight:700;color:#1f2937;margin:0 0 6px}',
    '.wt-text{font-size:13.5px;line-height:1.55;color:#4b5563;margin:0 0 14px}',
    '.wt-bar{height:4px;border-radius:4px;background:#e5e7eb;overflow:hidden;margin-bottom:14px}',
    '.wt-bar span{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#6366f1,#4f46e5);transition:width .5s cubic-bezier(.65,0,.35,1)}',
    '.wt-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '.wt-skip{border:0;background:none;font:inherit;font-size:13px;font-weight:600;color:#6b7280;text-decoration:underline;cursor:pointer;padding:6px 2px;transition:color .15s}',
    '.wt-skip:hover{color:#111827}',
    '.wt-btns{display:flex;gap:8px}',
    '.wt-btn{font:inherit;font-size:13px;font-weight:600;border-radius:20px;padding:8px 20px;cursor:pointer;border:1px solid transparent;transition:background-color .18s,transform .15s,box-shadow .18s}',
    '.wt-btn:active{transform:scale(.94)}',
    '.wt-back{background:#fff;border-color:#dce3ec;color:#374151}.wt-back:hover{background:#f4f7fb}',
    '.wt-next{background:#4f46e5;color:#fff}.wt-next:hover{background:#4338ca;box-shadow:0 4px 12px rgba(79,70,229,.35)}',
    '.wt-tip button:focus-visible{outline:2px solid #818cf8;outline-offset:2px}',
    '@media (prefers-reduced-motion:reduce){.wt-blur,.wt-ring,.wt-tip,.wt-inner,.wt-bar span{transition:none;animation:none}}'
  ].join('');
  var ICONS = {
    'Dashboard': 'ti-layout-dashboard', 'My Mentor': 'ti-user-circle', 'Upcoming Sessions': 'ti-calendar-event', 'Recent Sessions': 'ti-history',
    'Sessions': 'ti-calendar-event', 'Record': 'ti-chart-bar', 'Show QR': 'ti-qrcode', 'Details': 'ti-info-circle',
    'Scheduled Sessions': 'ti-clock-plus', 'Request This Slot': 'ti-pointer', 'Send Request': 'ti-send', 'Session Scheduled': 'ti-calendar-check',
    'Announcements': 'ti-speakerphone', 'Admin Announcement': 'ti-building', 'My Mentor Announcement': 'ti-speakerphone',
    'Profile': 'ti-user-circle', 'Logout': 'ti-logout'
  };

  // ── ENGINE ─────────────────────────────────────────────────
  var blur, ring, tip, index = 0, active = false, timer = null, waiter = null, sampleTimer = null, styled = false, dir = 1;
  var PAD = 8, earlyBlur = null;

  function injectStyles() {
    if (styled) return; styled = true;
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }

  function holeClip(r) {
    var x1 = Math.max(0, r.left - PAD), y1 = Math.max(0, r.top - PAD), x2 = r.right + PAD, y2 = r.bottom + PAD;
    return 'polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,' + x1 + 'px ' + y1 + 'px,' + x1 + 'px ' + y2 + 'px,' + x2 + 'px ' + y2 + 'px,' + x2 + 'px ' + y1 + 'px,' + x1 + 'px ' + y1 + 'px)';
  }

  function place() {
    if (!active) return;
    var step = STEPS[index], el = targetOf(step), vw = window.innerWidth, vh = window.innerHeight;
    var tw = tip.offsetWidth, th = tip.offsetHeight, left, top;
    if (!el) { blur.style.clipPath = 'none'; ring.classList.add('none'); left = (vw - tw) / 2; top = (vh - th) / 2; }
    else {
      var r = el.getBoundingClientRect();
      blur.style.clipPath = holeClip(r);
      ring.classList.remove('none');
      ring.style.left = (r.left - PAD) + 'px'; ring.style.top = (r.top - PAD) + 'px';
      ring.style.width = (r.width + PAD * 2) + 'px'; ring.style.height = (r.height + PAD * 2) + 'px';
      var gap = 16;
      if (step.side === 'right' && r.right + gap + tw < vw - 8) { left = r.right + PAD + gap; top = r.top + r.height / 2 - th / 2; }
      else if (r.bottom + PAD + gap + th < vh - 8) { left = r.left; top = r.bottom + PAD + gap; }
      else if (r.top - PAD - gap - th > 8) { left = r.left; top = r.top - PAD - gap - th; }
      else { left = r.left + 16; top = vh - th - 20; }
    }
    tip.style.left = Math.min(Math.max(12, left), vw - tw - 12) + 'px';
    tip.style.top = Math.min(Math.max(12, top), vh - th - 12) + 'px';
  }

  // while the page scrolls, follow the target instantly (no easing lag), then glide again once it settles
  var scrollTimer = null;
  function onScroll() {
    if (!active) return;
    [blur, ring, tip].forEach(function (n) { n.classList.add('wt-track'); });
    place();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () { [blur, ring, tip].forEach(function (n) { n.classList.remove('wt-track'); }); }, 140);
  }

  function runHook(name, which) { if (name && HOOKS[name]) HOOKS[name](which); }

  function show() {
    var step = STEPS[index], last = index === STEPS.length - 1;
    var html =
      '<div class="wt-head"><div class="wt-icon"><i class="ti ' + (ICONS[step.title] || 'ti-bulb') + '"></i></div>' +
      '<div class="wt-step">Step ' + (index + 1) + ' of ' + STEPS.length + (step.sample ? '<span class="wt-sample">SAMPLE DATA</span>' : '') + '</div></div>' +
      '<h3 class="wt-title">' + step.title + '</h3><p class="wt-text">' + step.text + '</p>' +
      '<div class="wt-bar"><span style="width:' + ((index + 1) / STEPS.length * 100) + '%"></span></div>' +
      '<div class="wt-foot">' + (last ? '<span></span>' : '<button type="button" class="wt-skip" data-act="skip">Skip tour</button>') +
      '<div class="wt-btns">' + (index > 0 ? '<button type="button" class="wt-btn wt-back" data-act="back">Back</button>' : '') +
      '<button type="button" class="wt-btn wt-next" data-act="next">' + (last ? 'Finish' : 'Next') + '</button></div></div>';
    var el = targetOf(step), first = !tip.firstChild;
    function swap() {
      var inner = tip.firstChild;
      if (!inner) { inner = document.createElement('div'); inner.className = 'wt-inner'; tip.appendChild(inner); }
      inner.innerHTML = html;
      inner.classList.remove('swap');
      place();
    }
    // fade the old text out, scroll the target in, then glide the spotlight + tooltip to it
    if (!first) tip.firstChild.classList.add('swap');
    clearTimeout(timer);
    setTimeout(function () {
      if (!active) return;
      if (el) {
        var r = el.getBoundingClientRect();
        var inView = r.top >= 70 && r.bottom <= window.innerHeight - 20 && r.left >= 0 && r.right <= window.innerWidth;
        if (!inView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      swap();
      timer = setTimeout(function () { place(); ring.classList.add('show'); tip.classList.add('show'); }, first ? 120 : 20);
    }, first ? 0 : 170);
  }

  // Wait (up to ~3s) for the step's target to exist on this page, then show it; skip it if it never does.
  // On phones the sidebar is an off-canvas drawer: slide it open for the sidebar steps, close it otherwise.
  function syncSidebar(step) {
    var sb = document.getElementById('sidebar');
    if (!sb || window.innerWidth > 768) return;
    var want = step && step.side === 'right';
    if (sb.classList.contains('open') !== want) {
      sb.classList.toggle('open', want);
      setTimeout(place, 340); // re-measure once the drawer has finished sliding
    }
  }

  function render() {
    clearInterval(waiter);
    var step = STEPS[index];
    syncSidebar(step);
    applySample();
    runHook(step.enter);
    var tries = 0;
    waiter = setInterval(function () {
      if (!active) return clearInterval(waiter);
      applySample();
      if (usable(step)) { clearInterval(waiter); show(); }
      else if (++tries > 30) {
        clearInterval(waiter);
        var nxt = index + dir;
        if (nxt < 0 || nxt >= STEPS.length) return finish();
        go(nxt);
      }
    }, 100);
  }

  // Move to another step; cross-page moves navigate and resume on load.
  function go(i) {
    runHook(STEPS[index].leave);
    dir = i >= index ? 1 : -1;
    var from = STEPS[index].page, to = STEPS[i].page;
    index = i;
    if (from !== to) {
      ssSet(STATE_KEY, JSON.stringify({ i: i }));
      ring.classList.remove('show'); tip.classList.remove('show'); // fade out, keep the blur up, then navigate
      blur.style.clipPath = 'none';
      setTimeout(function () { window.location.href = BASE + to; }, 260);
      return;
    }
    ssSet(STATE_KEY, JSON.stringify({ i: i }));
    render();
  }

  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'next') { if (index >= STEPS.length - 1) return finish(); go(index + 1); }
    else if (act === 'back') { if (index > 0) go(index - 1); }
    else if (act === 'skip') finish();
  }
  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight' && index < STEPS.length - 1) go(index + 1);
    else if (e.key === 'ArrowLeft' && index > 0) go(index - 1);
  }

  function finish() {
    if (!active) return;
    active = false;
    clearTimeout(timer); clearInterval(waiter); clearInterval(sampleTimer);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('keydown', onKey);
    runHook(STEPS[index].leave);
    syncSidebar(null);
    ssDel(STATE_KEY);
    lsDel(PENDING_KEY);
    lsSet(DONE_KEY, '1'); // one-time: never auto-shown again; replay is manual
    [blur, ring, tip].forEach(function (n) { n.classList.remove('show'); });
    setTimeout(function () {
      [blur, ring, tip].forEach(function (n) { n.remove(); });
      if (sampleOn) window.location.reload(); // bring the real data back
    }, 320);
  }

  function begin(startIndex) {
    if (active) return;
    injectStyles();
    index = Math.min(Math.max(0, startIndex || 0), STEPS.length - 1);
    // if resumed on the wrong page (e.g. user navigated away), send them to the step's page
    if (STEPS[index].page !== currentPage()) { ssSet(STATE_KEY, JSON.stringify({ i: index })); window.location.href = BASE + STEPS[index].page; return; }
    active = true;
    blur = earlyBlur || document.createElement('div'); blur.className = 'wt-blur show';
    ring = document.createElement('div'); ring.className = 'wt-ring';
    tip = document.createElement('div'); tip.className = 'wt-tip';
    tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-label', 'Portal walkthrough');
    document.body.append(blur, ring, tip);
    earlyBlur = null;
    tip.addEventListener('click', onClick);
    blur.addEventListener('click', function (e) { e.stopPropagation(); });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKey);
    // page scripts fill their sections asynchronously; keep the sample in place while touring
    sampleTimer = setInterval(applySample, 300);
    render();
  }

  // Replay from Profile (or anywhere): always starts from the Dashboard.
  window.startWalkthrough = function () {
    if (active) return;
    lsDel(DONE_KEY);
    ssSet(STATE_KEY, JSON.stringify({ i: 0 }));
    if (currentPage() !== STEPS[0].page) { window.location.href = BASE + STEPS[0].page; return; }
    begin(0);
  };

  function auto() {
    var state = null;
    try { state = JSON.parse(ssGet(STATE_KEY) || 'null'); } catch (e) {}
    if (state && typeof state.i === 'number') {
      injectStyles();
      earlyBlur = document.createElement('div'); earlyBlur.className = 'wt-blur show'; earlyBlur.style.transition = 'none';
      document.body.appendChild(earlyBlur);
      setTimeout(function () { if (earlyBlur) earlyBlur.style.transition = ''; begin(state.i); }, 650);
      return;
    }
    // first time: right after the e-signature step (setup.js sets the flag)
    if (currentPage() === 'mentee-dashboard.html' && lsGet(PENDING_KEY) === '1' && lsGet(DONE_KEY) !== '1') setTimeout(function () { begin(0); }, 900);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();
})();
