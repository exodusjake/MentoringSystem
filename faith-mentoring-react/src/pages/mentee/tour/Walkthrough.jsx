import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { emit } from '../../../lib/events.js';
import { acquireStyle } from '../../../lib/injectStyle.js';
import { getSession } from '../../../lib/session.js';
import { TourContext } from './TourContext.js';
import { ICONS, STEPS, TOUR_CSS } from './tourData.js';

/* Spotlight tour across the Mentee portal (the original walkthrough.js): the page is blurred and the
   part being explained stays sharp, with a tooltip beside it. Dashboard → Sessions → Schedule →
   Announcements → Profile → Logout.
   - Runs once, automatically, after the mentee uploads their signature in setup (setup queues it).
   - Replay any time from Profile → "Replay Walkthrough" (tour.start()).
   - Moves between pages by itself; progress is kept in sessionStorage so a reload resumes it.
   - Pages show SAMPLE data while it runs (they read `sample` from TourContext). Nothing real is read,
     changed or saved; when the tour ends the pages show their real data again.
   The overlay (blur, ring, tooltip) lives on <body>, outside React, exactly like the original. */
const PAD = 8;
const STATE_KEY = 'astra_walkthrough_state';
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: k => { try { sessionStorage.removeItem(k); } catch (e) {} } };

const PAGE_DEFAULTS = { annTab: 'admin', scheduleApproved: false, scheduleModal: false };

export default function TourProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState({ sample: false, ...PAGE_DEFAULTS });
  const page = location.pathname.replace(/^\/mentee\//, '').split('/')[0];
  const env = useRef({});
  env.current = { page, navigate, setState };
  const engine = useRef(null);
  if (!engine.current) engine.current = createEngine(env);

  // A page change resets that page's tour state (the original reloaded each page).
  const lastPage = useRef(page);
  useEffect(() => {
    if (lastPage.current !== page) { lastPage.current = page; setState(s => ({ ...s, ...PAGE_DEFAULTS })); }
    engine.current.onPage(page);
  }, [page]);
  useEffect(() => () => engine.current.destroy(), []);

  const value = useMemo(() => ({ ...state, start: () => engine.current.startWalkthrough() }), [state]);
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

function createEngine(env) {
  const userId = (() => { try { return getSession()?.user?.userID ?? null; } catch (e) { return null; } })();
  const PENDING_KEY = 'astra_walkthrough_pending_' + userId;
  const DONE_KEY = 'astra_walkthrough_done_' + userId;
  let blur, ring, tip, index = 0, active = false, timer = null, waiter = null, dir = 1, earlyBlur = null;
  let releaseStyle = null, scrollTimer = null, pending = null, resumeTimer = null, startTimer = null;
  const setPage = patch => env.current.setState(s => ({ ...s, ...patch }));
  const currentPage = () => env.current.page;
  const injectStyles = () => { if (!releaseStyle) releaseStyle = acquireStyle('walkthrough', TOUR_CSS); };

  const HOOKS = {
    openModal: () => setPage({ scheduleModal: true }),
    closeModal: () => setPage({ scheduleModal: false }),
    approve: () => setPage({ scheduleApproved: true, scheduleModal: false }),
    tabAdmin: () => setPage({ annTab: 'admin' }),
    tabMentor: () => setPage({ annTab: 'mentor' }),
  };
  const runHook = name => { if (name && HOOKS[name]) HOOKS[name](); };

  function targetOf(step) {
    if (step.all) return document.querySelectorAll(step.all)[step.nth || 0] || null;
    return step.sel ? document.querySelector(step.sel) : null;
  }
  function usable(step) {
    const el = targetOf(step);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;   // off-canvas mobile sidebar → not usable
  }
  function holeClip(r) {
    const x1 = Math.max(0, r.left - PAD), y1 = Math.max(0, r.top - PAD), x2 = r.right + PAD, y2 = r.bottom + PAD;
    return 'polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,' + x1 + 'px ' + y1 + 'px,' + x1 + 'px ' + y2 + 'px,' + x2 + 'px ' + y2 + 'px,' + x2 + 'px ' + y1 + 'px,' + x1 + 'px ' + y1 + 'px)';
  }

  function place() {
    if (!active) return;
    const step = STEPS[index], el = targetOf(step), vw = window.innerWidth, vh = window.innerHeight;
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

  // While the page scrolls, follow the target instantly (no easing lag), then glide again once it settles.
  function onScroll() {
    if (!active) return;
    [blur, ring, tip].forEach(n => n.classList.add('wt-track'));
    place();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => [blur, ring, tip].forEach(n => n.classList.remove('wt-track')), 140);
  }

  function show() {
    const step = STEPS[index], last = index === STEPS.length - 1;
    const html =
      '<div class="wt-head"><div class="wt-icon"><i class="ti ' + (ICONS[step.title] || 'ti-bulb') + '"></i></div>' +
      '<div class="wt-step">Step ' + (index + 1) + ' of ' + STEPS.length + (step.sample ? '<span class="wt-sample">SAMPLE DATA</span>' : '') + '</div></div>' +
      '<h3 class="wt-title">' + step.title + '</h3><p class="wt-text">' + step.text + '</p>' +
      '<div class="wt-bar"><span style="width:' + ((index + 1) / STEPS.length * 100) + '%"></span></div>' +
      '<div class="wt-foot">' + (last ? '<span></span>' : '<button type="button" class="wt-skip" data-act="skip">Skip tour</button>') +
      '<div class="wt-btns">' + (index > 0 ? '<button type="button" class="wt-btn wt-back" data-act="back">Back</button>' : '') +
      '<button type="button" class="wt-btn wt-next" data-act="next">' + (last ? 'Finish' : 'Next') + '</button></div></div>';
    const el = targetOf(step), first = !tip.firstChild;
    function swap() {
      let inner = tip.firstChild;
      if (!inner) { inner = document.createElement('div'); inner.className = 'wt-inner'; tip.appendChild(inner); }
      inner.innerHTML = html;   // fixed, trusted step text
      inner.classList.remove('swap');
      place();
    }
    // fade the old text out, scroll the target in, then glide the spotlight + tooltip to it
    if (!first) tip.firstChild.classList.add('swap');
    clearTimeout(timer);
    setTimeout(() => {
      if (!active) return;
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
    if (window.innerWidth > 768) return;
    const want = !!(step && step.side === 'right');
    const sb = document.getElementById('sidebar');
    if (sb && sb.classList.contains('open') !== want) {
      emit('sidebar:tourOpen', want);
      setTimeout(place, 340);   // re-measure once the drawer has finished sliding
    }
  }

  // Wait (up to ~3s) for the step's target to exist on this page, then show it; skip it if it never does.
  function render() {
    clearInterval(waiter);
    const step = STEPS[index];
    syncSidebar(step);
    runHook(step.enter);
    let tries = 0;
    waiter = setInterval(() => {
      if (!active) { clearInterval(waiter); return; }
      if (usable(step)) { clearInterval(waiter); show(); }
      else if (++tries > 30) {
        clearInterval(waiter);
        const nxt = index + dir;
        if (nxt < 0 || nxt >= STEPS.length) { finish(); return; }
        go(nxt);
      }
    }, 100);
  }

  // Move to another step; cross-page moves navigate and resume once the page has loaded.
  function go(i) {
    runHook(STEPS[index].leave);
    dir = i >= index ? 1 : -1;
    const from = STEPS[index].page, to = STEPS[i].page;
    index = i;
    ss.set(STATE_KEY, JSON.stringify({ i }));
    if (from !== to) {
      ring.classList.remove('show'); tip.classList.remove('show');   // fade out, keep the blur up, then navigate
      blur.style.clipPath = 'none';
      pending = to;
      setTimeout(() => env.current.navigate('/mentee/' + to), 260);
      return;
    }
    render();
  }

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.getAttribute('data-act');
    if (act === 'next') { if (index >= STEPS.length - 1) { finish(); return; } go(index + 1); }
    else if (act === 'back') { if (index > 0) go(index - 1); }
    else if (act === 'skip') finish();
  }
  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight' && index < STEPS.length - 1) go(index + 1);
    else if (e.key === 'ArrowLeft' && index > 0) go(index - 1);
  }

  function teardownListeners() {
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('keydown', onKey);
  }

  function finish() {
    if (!active) return;
    active = false;
    clearTimeout(timer); clearInterval(waiter);
    teardownListeners();
    runHook(STEPS[index].leave);
    syncSidebar(null);
    ss.del(STATE_KEY);
    ls.del(PENDING_KEY);
    ls.set(DONE_KEY, '1');   // one-time: never auto-shown again; replay is manual
    [blur, ring, tip].forEach(n => n.classList.remove('show'));
    setTimeout(() => {
      [blur, ring, tip].forEach(n => n.remove());
      env.current.setState(s => ({ ...s, ...PAGE_DEFAULTS, sample: false }));   // the real data comes back
    }, 320);
  }

  function begin(startIndex) {
    if (active) return;
    injectStyles();
    index = Math.min(Math.max(0, startIndex || 0), STEPS.length - 1);
    // resumed on the wrong page (e.g. the user navigated away): go to the step's page first
    if (STEPS[index].page !== currentPage()) {
      ss.set(STATE_KEY, JSON.stringify({ i: index }));
      env.current.navigate('/mentee/' + STEPS[index].page);
      return;
    }
    active = true;
    env.current.setState(s => ({ ...s, sample: true }));
    blur = earlyBlur || document.createElement('div'); blur.className = 'wt-blur show';
    ring = document.createElement('div'); ring.className = 'wt-ring';
    tip = document.createElement('div'); tip.className = 'wt-tip';
    tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-label', 'Portal walkthrough');
    document.body.append(blur, ring, tip);
    earlyBlur = null;
    tip.addEventListener('click', onClick);
    blur.addEventListener('click', e => e.stopPropagation());
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKey);
    render();
  }

  // Resume a tour in progress on this page (the original did this on every page load), or start
  // the first-time tour on the dashboard right after setup.
  function auto() {
    let saved = null;
    try { saved = JSON.parse(ss.get(STATE_KEY) || 'null'); } catch (e) {}
    if (saved && typeof saved.i === 'number') {
      injectStyles();
      if (!earlyBlur) {
        earlyBlur = document.createElement('div'); earlyBlur.className = 'wt-blur show'; earlyBlur.style.transition = 'none';
        document.body.appendChild(earlyBlur);
      }
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { if (earlyBlur) earlyBlur.style.transition = ''; begin(saved.i); }, 650);
      return;
    }
    if (currentPage() === 'dashboard' && ls.get(PENDING_KEY) === '1' && ls.get(DONE_KEY) !== '1') {
      clearTimeout(startTimer);
      startTimer = setTimeout(() => begin(0), 900);
    }
  }

  return {
    onPage(page) {
      if (active && pending === page) {
        // Arrived on the next step's page: keep the blur, let the page settle, then continue.
        pending = null;
        teardownListeners();
        active = false;
        ring.remove(); tip.remove();
        earlyBlur = blur; earlyBlur.style.transition = 'none';
        auto();
        return;
      }
      if (!active) auto();
    },
    // Replay from Profile (or anywhere): always starts from the Dashboard.
    startWalkthrough() {
      if (active) return;
      ls.del(DONE_KEY);
      ss.set(STATE_KEY, JSON.stringify({ i: 0 }));
      if (currentPage() !== STEPS[0].page) { env.current.navigate('/mentee/' + STEPS[0].page); return; }
      begin(0);
    },
    destroy() {
      clearTimeout(resumeTimer); clearTimeout(startTimer); clearTimeout(timer); clearInterval(waiter);
      teardownListeners();
      [blur, ring, tip, earlyBlur].forEach(n => n?.remove());
      active = false;
      releaseStyle?.();
      releaseStyle = null;
      earlyBlur = null;
    },
  };
}
