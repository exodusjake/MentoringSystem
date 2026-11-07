import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TourContext } from './tour.js';
import { MENTOR_TOUR } from './tourMentor.js';
import { ADMIN_TOUR, HEAD_TOUR } from './tourAdmin.js';

// MENTEE/JS/walkthrough.js — spotlight tour across the mentee portal (and, with the config in tourMentor.js, the mentor portal): the page is blurred and the part
// being explained stays sharp, with a tooltip beside it. Order follows the portal:
// Dashboard → Sessions → Schedule Session → Announcements → Profile → Logout.
// - Runs once, automatically, right after the mentee uploads their e-signature in setup (the pending flag).
// - Replay any time from Profile → "Replay Walkthrough".
// - The tour moves between pages by itself (progress is kept in sessionStorage).
// - Every page shows SAMPLE data while the tour runs (the pages read it through useTour()); nothing real
//   is read, changed or saved, and the page reloads when the tour ends so the real data comes back.


const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
const ssGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
const ssDel = k => { try { sessionStorage.removeItem(k); } catch (e) {} };

const currentPage = () => (window.location.pathname.split('/').pop() || '').toLowerCase();

// ── STEPS (order = the outline) ───────────────────────────
const STEPS = [
  // Dashboard
  { page: 'dashboard', sel: '#nav-dashboard', side: 'right', title: 'Dashboard', text: 'Your home base. Here you see your mentor, your upcoming sessions and your recent sessions at a glance.' },
  { page: 'dashboard', sel: '.mentor-preview-card', sample: true, title: 'My Mentor', text: 'Your assigned mentor for the semester: name, email, department and school, so you always know who to reach out to.' },
  { page: 'dashboard', all: '.sessions-card', nth: 0, sample: true, title: 'Upcoming Sessions', text: 'Your next booked sessions, regular or make-up, tagged Today or Overdue when needed.' },
  { page: 'dashboard', all: '.sessions-card', nth: 1, sample: true, title: 'Recent Sessions', text: 'Sessions that are already done or cancelled, with your Present or Absent mark.' },
  // Sessions
  { page: 'sessions', sel: '#nav-sessions', side: 'right', title: 'Sessions', text: 'The full list of your mentoring sessions and your semester record.' },
  { page: 'sessions', sel: '#attendanceBanner', sample: true, title: 'Record', text: 'Your semester record: how many sessions you have completed out of the required total, plus a count of completed, scheduled and cancelled sessions.' },
  { page: 'sessions', sel: '.btn-qr', sample: true, title: 'Show QR', text: 'On the day of a session, tap Show QR and let your mentor scan it. That is how your attendance is recorded. The code refreshes every couple of minutes.' },
  { page: 'sessions', sel: '.btn-detail', sample: true, title: 'Details', text: 'Open Details to see the date, time, topic, status and whether your attendance has been recorded.' },
  // Schedule
  { page: 'schedule', sel: '#nav-schedule', side: 'right', title: 'Scheduled Sessions', text: 'Book your sessions here, using time slots your mentor has opened.' },
  { page: 'schedule', sel: '.btn-request', sample: true, title: 'Request This Slot', text: 'Found a time that works for you? Tap Request This Slot.' },
  { page: 'schedule', sel: '#requestModal .btn-save', sample: true, enter: 'openModal', leave: 'closeModal', title: 'Send Request', text: 'Optionally add what you want to discuss, then tap Send Request. The slot is booked right away.' },
  { page: 'schedule', sel: '.sch-slot-card', sample: true, enter: 'approve', title: 'Session Scheduled', text: 'The card now reads Session Scheduled, and the session appears on your Sessions page immediately.' },
  // Announcements
  { page: 'announcements', sel: '#nav-announce', side: 'right', title: 'Announcements', text: 'News and evaluation forms from the program team and your mentor. A red badge shows when something is new.' },
  { page: 'announcements', sel: '.announce-card', sample: true, enter: 'tabAdmin', title: 'Administrator Announcement', text: 'The Administration tab holds official announcements and evaluation forms from the admins. Pinned posts stay on top.' },
  { page: 'announcements', sel: '.announce-card', sample: true, enter: 'tabMentor', title: 'My Mentor Announcement', text: 'The From My Mentor tab shows what your own mentor posts, and you can comment on them.' },
  // Profile + Logout
  { page: 'profile', sel: '#nav-profile', side: 'right', title: 'Profile', text: 'View your account and academic details, update your contact number, change your password or replace your signature. You can replay this tour from here too.' },
  { page: 'profile', sel: '.ph-avatar', title: 'Profile and Log out', text: 'Click your profile circle for Profile and Log out. Log out when you are done, especially on a shared computer.' },
];

function targetOf(step) {
  if (step.all) return document.querySelectorAll(step.all)[step.nth || 0] || null;
  return step.sel ? document.querySelector(step.sel) : null;
}
function usable(step) {
  if (step.center) return true; // a welcome / finish card with nothing highlighted
  const el = targetOf(step);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth; // off-canvas mobile sidebar → not usable
}

// ── STYLES ─────────────────────────────────────────────────
const CSS = [
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
  // Per-portal colours (the engine adds `wt-themed` plus the portal class when the config has a theme).
  '.wt-mentor{--wt-a:#0f766e;--wt-b:#14b8a6;--wt-a-rgb:15,118,110;--wt-b-rgb:20,184,166;--wt-border:#99f6e4;--wt-soft:#f0fdfa;--wt-bar:#ccfbf1;--wt-title:#134e4a;--wt-dark:#115e59;--wt-bar-end:#2dd4bf;--wt-blur:rgba(4,47,46,.4)}',
  '.wt-admin{--wt-a:#2563eb;--wt-b:#60a5fa;--wt-a-rgb:37,99,235;--wt-b-rgb:96,165,250;--wt-border:#bfdbfe;--wt-soft:#eff6ff;--wt-bar:#dbeafe;--wt-title:#1e3a8a;--wt-dark:#1d4ed8;--wt-bar-end:#93c5fd;--wt-blur:rgba(15,23,42,.42)}',
  '.wt-blur.wt-themed{background:var(--wt-blur)}',
  '.wt-ring.wt-themed{border-color:var(--wt-b);box-shadow:0 0 0 4px rgba(var(--wt-b-rgb),.25),0 0 30px rgba(var(--wt-a-rgb),.55);animation-name:wtGlowT}',
  '@keyframes wtGlowT{0%,100%{box-shadow:0 0 0 4px rgba(var(--wt-b-rgb),.25),0 0 24px rgba(var(--wt-a-rgb),.45)}50%{box-shadow:0 0 0 7px rgba(var(--wt-b-rgb),.14),0 0 38px rgba(var(--wt-a-rgb),.7)}}',
  '.wt-tip.wt-themed{padding:0 0 16px;overflow:hidden;border:1px solid var(--wt-border);border-radius:18px;box-shadow:0 24px 56px rgba(var(--wt-a-rgb),.35)}',
  '.wt-themed .wt-head{margin:0 0 14px;padding:14px 18px;background:linear-gradient(135deg,var(--wt-a),var(--wt-b))}',
  '.wt-themed .wt-icon{background:rgba(255,255,255,.2);color:#fff}',
  '.wt-themed .wt-step{color:rgba(255,255,255,.9)}',
  '.wt-themed .wt-sample{background:#fff;color:var(--wt-a)}',
  '.wt-themed .wt-title{margin-left:18px;margin-right:18px;color:var(--wt-title)}',
  '.wt-themed .wt-text,.wt-themed .wt-bar,.wt-themed .wt-foot{margin-left:18px;margin-right:18px}',
  '.wt-themed .wt-bar{background:var(--wt-bar)}.wt-themed .wt-bar span{background:linear-gradient(90deg,var(--wt-a),var(--wt-bar-end))}',
  '.wt-themed .wt-next{background:var(--wt-a)}.wt-themed .wt-next:hover{background:var(--wt-dark);box-shadow:0 4px 12px rgba(var(--wt-a-rgb),.4)}',
  '.wt-themed .wt-back{border-color:var(--wt-border);color:var(--wt-a)}.wt-themed .wt-back:hover{background:var(--wt-soft)}',
  '.wt-themed .wt-skip:hover{color:var(--wt-a)}',
  '.wt-tip.wt-themed button:focus-visible{outline:2px solid var(--wt-b)}',
  '@media (prefers-reduced-motion:reduce){.wt-blur,.wt-ring,.wt-tip,.wt-inner,.wt-bar span{transition:none;animation:none}}',
].join('');
const ICONS = {
  'Dashboard': 'ti-layout-dashboard', 'My Mentor': 'ti-user-circle', 'Upcoming Sessions': 'ti-calendar-event', 'Recent Sessions': 'ti-history',
  'Sessions': 'ti-calendar-event', 'Record': 'ti-chart-bar', 'Show QR': 'ti-qrcode', 'Details': 'ti-info-circle',
  'Scheduled Sessions': 'ti-clock-plus', 'Request This Slot': 'ti-pointer', 'Send Request': 'ti-send', 'Session Scheduled': 'ti-calendar-check',
  'Announcements': 'ti-speakerphone', 'Administrator Announcement': 'ti-building', 'My Mentor Announcement': 'ti-speakerphone',
  'Profile': 'ti-user-circle', 'Logout': 'ti-logout',
};
const MENTEE_TOUR = {
  base: '/mentee/', keyPrefix: 'astra_walkthrough', steps: STEPS, icons: ICONS,
  samplePages: ['dashboard', 'sessions', 'schedule', 'announcements'],
};
const TOURS = { mentee: MENTEE_TOUR, mentor: MENTOR_TOUR, admin: ADMIN_TOUR, head: HEAD_TOUR };
const PAD = 8;

function holeClip(r) {
  const x1 = Math.max(0, r.left - PAD), y1 = Math.max(0, r.top - PAD), x2 = r.right + PAD, y2 = r.bottom + PAD;
  return 'polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,' + x1 + 'px ' + y1 + 'px,' + x1 + 'px ' + y2 + 'px,' + x2 + 'px ' + y2 + 'px,' + x2 + 'px ' + y1 + 'px,' + x1 + 'px ' + y1 + 'px)';
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function TourProvider({ children, portal = 'mentee' }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [ui, setUi] = useState({ active: false, scheduleApproved: false, modalOpen: false, annTab: 'admin' });
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const engine = useRef(null);

  if (!engine.current) engine.current = createEngine(patch => setUi(u => ({ ...u, ...patch })), p => navRef.current(p), TOURS[portal]);
  const E = engine.current;

  const start = useCallback(() => E.replay(), [E]);

  // First time: right after the e-signature step (setup sets the flag). Also resumes a tour after a reload.
  useEffect(() => {
    if (E.active || E.resuming) return;
    return E.auto(pathname);
  }, [pathname]);

  useEffect(() => () => E.dispose(), []);

  const value = useMemo(() => ({ ...ui, start }), [ui, start]);
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

// The tour engine: imperative like the vanilla script (it owns three body-level elements), reporting what the
// pages need to know (active, modal/approval/tab hooks) through `set`.
function createEngine(set, go2, cfg) {
  const steps = cfg.steps, stateKey = cfg.keyPrefix + '_state';
  const theme = cfg.theme ? ' ' + cfg.theme : '';
  let userId = null;
  try { userId = JSON.parse(localStorage.getItem('user') || 'null')?.userID ?? null; } catch (e) {}
  const PENDING_KEY = cfg.keyPrefix + '_pending_' + userId;
  const DONE_KEY = cfg.keyPrefix + '_done_' + userId;

  let blur, ring, tip, index = 0, timer = null, waiter = null, scrollTimer = null, styled = false, dir = 1;
  let earlyBlur = null, sampleOn = false, autoTimer = null, resumeTimer = null;
  let scheduleApproved = false;
  const E = { active: false, resuming: false };

  function injectStyles() {
    if (styled || document.getElementById('astra-walkthrough-css')) { styled = true; return; }
    styled = true;
    const s = document.createElement('style'); s.id = 'astra-walkthrough-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function place() {
    if (!E.active) return;
    const step = steps[index], el = targetOf(step), vw = window.innerWidth, vh = window.innerHeight;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left, top;
    if (!el) { blur.style.clipPath = 'none'; ring.classList.add('none'); left = (vw - tw) / 2; top = (vh - th) / 2; }
    else {
      const r = el.getBoundingClientRect();
      blur.style.clipPath = holeClip(r);
      ring.classList.remove('none');
      ring.style.left = (r.left - PAD) + 'px'; ring.style.top = (r.top - PAD) + 'px';
      ring.style.width = (r.width + PAD * 2) + 'px'; ring.style.height = (r.height + PAD * 2) + 'px';
      const gap = 16;
      if (step.side === 'right' && r.right + gap + tw < vw - 8) { left = r.right + PAD + gap; top = r.top + r.height / 2 - th / 2; }
      else if (r.bottom + PAD + gap + th < vh - 8) { left = r.left; top = r.bottom + PAD + gap; }
      else if (r.top - PAD - gap - th > 8) { left = r.left; top = r.top - PAD - gap - th; }
      else { left = r.left + 16; top = vh - th - 20; }
    }
    tip.style.left = Math.min(Math.max(12, left), vw - tw - 12) + 'px';
    tip.style.top = Math.min(Math.max(12, top), vh - th - 12) + 'px';
  }

  // while the page scrolls, follow the target instantly (no easing lag), then glide again once it settles
  function onScroll() {
    if (!E.active) return;
    [blur, ring, tip].forEach(n => n.classList.add('wt-track'));
    place();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { [blur, ring, tip].forEach(n => n.classList.remove('wt-track')); }, 140);
  }

  const HOOKS = {
    openModal: () => set({ modalOpen: true }),
    closeModal: () => set({ modalOpen: false }),
    approve: () => { scheduleApproved = true; set({ modalOpen: false, scheduleApproved: true }); },
    tabAdmin: () => set({ annTab: 'admin' }),
    tabMentor: () => set({ annTab: 'mentor' }),
    tabMine: () => set({ annTab: 'mine' }),
    logSheet: () => set({ modalOpen: true, annTab: 'logsheet' }),
    logNotes: () => set({ modalOpen: true, annTab: 'notes' }),
    logAbsent: () => set({ modalOpen: true, annTab: 'nonattend' }),
  };
  const runHook = name => { if (name && HOOKS[name]) HOOKS[name](); };

  function show() {
    const step = steps[index], last = index === steps.length - 1;
    const html =
      '<div class="wt-head"><div class="wt-icon"><i class="ti ' + (cfg.icons[step.title] || 'ti-bulb') + '"></i></div>' +
      '<div class="wt-step">Step ' + (index + 1) + ' of ' + steps.length + (step.sample ? '<span class="wt-sample">SAMPLE DATA</span>' : '') + '</div></div>' +
      '<h3 class="wt-title">' + esc(step.title) + '</h3><p class="wt-text">' + esc(step.text) + '</p>' +
      '<div class="wt-bar"><span style="width:' + ((index + 1) / steps.length * 100) + '%"></span></div>' +
      '<div class="wt-foot">' + (last ? '<span></span>' : '<button type="button" class="wt-skip" data-act="skip">Skip tour</button>') +
      '<div class="wt-btns">' + (index > 0 ? '<button type="button" class="wt-btn wt-back" data-act="back">Back</button>' : '') +
      '<button type="button" class="wt-btn wt-next" data-act="next">' + (last ? 'Finish' : 'Next') + '</button></div></div>';
    const el = targetOf(step), first = !tip.firstChild;
    function swap() {
      let inner = tip.firstChild;
      if (!inner) { inner = document.createElement('div'); inner.className = 'wt-inner'; tip.appendChild(inner); }
      inner.innerHTML = html;
      inner.classList.remove('swap');
      place();
    }
    // fade the old text out, scroll the target in, then glide the spotlight + tooltip to it
    if (!first) tip.firstChild.classList.add('swap');
    clearTimeout(timer);
    setTimeout(() => {
      if (!E.active) return;
      if (el) {
        const r = el.getBoundingClientRect();
        const inView = r.top >= 70 && r.bottom <= window.innerHeight - 20 && r.left >= 0 && r.right <= window.innerWidth;
        if (!inView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      swap();
      timer = setTimeout(() => { place(); ring.classList.add('show'); tip.classList.add('show'); }, first ? 120 : 20);
    }, first ? 0 : 170);
  }

  // On phones the sidebar is an off-canvas drawer: slide it open for the sidebar steps, close it otherwise.
  function syncSidebar(step) {
    const sb = document.getElementById('sidebar');
    if (!sb || window.innerWidth > 768) return;
    const want = step && step.side === 'right';
    if (sb.classList.contains('open') !== want) {
      sb.classList.toggle('open', want);
      setTimeout(place, 340); // re-measure once the drawer has finished sliding
    }
  }

  // Wait (up to ~3s) for the step's target to exist on this page, then show it; skip it if it never does.
  function render() {
    clearInterval(waiter);
    const step = steps[index];
    syncSidebar(step);
    if (cfg.samplePages.includes(step.page)) sampleOn = true;
    runHook(step.enter);
    let tries = 0;
    waiter = setInterval(() => {
      if (!E.active) return clearInterval(waiter);
      if (usable(step)) { clearInterval(waiter); show(); }
      else if (++tries > 30) {
        clearInterval(waiter);
        const nxt = index + dir;
        if (nxt < 0 || nxt >= steps.length) return finish();
        go(nxt);
      }
    }, 100);
  }

  // Move to another step; cross-page moves navigate and resume there.
  function go(i) {
    runHook(steps[index].leave);
    dir = i >= index ? 1 : -1;
    const from = steps[index].page, to = steps[i].page;
    index = i;
    ssSet(stateKey, JSON.stringify({ i }));
    if (from !== to) {
      // fade out, keep the blur up, then move to the next page and pick the tour up there
      ring.classList.remove('show'); tip.classList.remove('show');
      blur.style.clipPath = 'none';
      setTimeout(() => {
        earlyBlur = blur; blur = null;
        E.active = false;
        [ring, tip].forEach(n => n.remove());
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', onScroll, true);
        document.removeEventListener('keydown', onKey);
        clearTimeout(timer); clearInterval(waiter);
        set({ active: false });
        go2(cfg.base + to);
        resume(i);
      }, 260);
      return;
    }
    render();
  }

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.getAttribute('data-act');
    if (act === 'next') { if (index >= steps.length - 1) return finish(); go(index + 1); }
    else if (act === 'back') { if (index > 0) go(index - 1); }
    else if (act === 'skip') finish();
  }
  function onKey(e) {
    if (!E.active) return;
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight' && index < steps.length - 1) go(index + 1);
    else if (e.key === 'ArrowLeft' && index > 0) go(index - 1);
  }

  function teardown() {
    clearTimeout(timer); clearInterval(waiter); clearTimeout(scrollTimer);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('keydown', onKey);
  }

  function finish() {
    if (!E.active) return;
    E.active = false;
    teardown();
    runHook(steps[index].leave);
    syncSidebar(null);
    ssDel(stateKey);
    lsDel(PENDING_KEY);
    lsSet(DONE_KEY, '1'); // one-time: never auto-shown again; replay is manual
    [blur, ring, tip].forEach(n => n.classList.remove('show'));
    setTimeout(() => {
      [blur, ring, tip].forEach(n => n.remove());
      if (sampleOn) window.location.reload(); // bring the real data back
      else set({ active: false });
    }, 320);
  }

  function begin(startIndex) {
    if (E.active) return;
    injectStyles();
    index = Math.min(Math.max(0, startIndex || 0), steps.length - 1);
    // if resumed on the wrong page (e.g. user navigated away), send them to the step's page
    if (steps[index].page !== currentPage()) {
      ssSet(stateKey, JSON.stringify({ i: index }));
      go2(cfg.base + steps[index].page);
      resume(index);
      return;
    }
    E.active = true;
    set({ active: true, scheduleApproved, modalOpen: false });
    blur = earlyBlur || document.createElement('div'); blur.className = 'wt-blur show' + theme;
    ring = document.createElement('div'); ring.className = 'wt-ring' + theme;
    tip = document.createElement('div'); tip.className = 'wt-tip' + theme;
    tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-label', 'Portal walkthrough');
    document.body.append(blur, ring, tip);
    earlyBlur = null;
    tip.addEventListener('click', onClick);
    blur.addEventListener('click', e => { e.stopPropagation(); });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKey);
    render();
  }

  // After a page change (or reload): keep the page blurred while it settles, then pick the tour up.
  function resume(i) {
    injectStyles();
    E.resuming = true;
    if (!earlyBlur) {
      earlyBlur = document.createElement('div'); earlyBlur.className = 'wt-blur show' + theme; earlyBlur.style.transition = 'none';
      document.body.appendChild(earlyBlur);
    }
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      E.resuming = false;
      if (earlyBlur) earlyBlur.style.transition = '';
      begin(i);
    }, 650);
  }

  // Replay from Profile (or anywhere): always starts from the Dashboard.
  E.replay = () => {
    if (E.active || E.resuming) return;
    lsDel(DONE_KEY);
    ssSet(stateKey, JSON.stringify({ i: 0 }));
    if (currentPage() !== steps[0].page) { go2(cfg.base + steps[0].page); resume(0); return; }
    begin(0);
  };

  let autoRan = false;
  E.auto = pathname => {
    clearTimeout(autoTimer);
    if (!autoRan) {
      autoRan = true;
      let state = null;
      try { state = JSON.parse(ssGet(stateKey) || 'null'); } catch (e) {}
      if (state && typeof state.i === 'number') { resume(state.i); return; }
    }
    // first time: right after the e-signature step (setup sets the flag)
    if (pathname === cfg.base + 'dashboard' && lsGet(PENDING_KEY) === '1' && lsGet(DONE_KEY) !== '1') {
      autoTimer = setTimeout(() => begin(0), 900);
      return () => clearTimeout(autoTimer);
    }
  };

  E.dispose = () => {
    clearTimeout(autoTimer); clearTimeout(resumeTimer);
    teardown();
    [blur, ring, tip, earlyBlur].forEach(n => n && n.remove());
    earlyBlur = null; autoRan = false; E.resuming = false;   // StrictMode remounts re-run the effects
    E.active = false;
  };
  return E;
}
