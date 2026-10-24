// Document-level behaviors from the original shared scripts. They only read the DOM and listen to
// events (no React-owned markup is changed), so they are installed once for the whole app. In the
// original each was present only on pages that loaded its script, so each checks the current
// page's flags (set by <Page>).
export const pageFlags = { api: false, smoothScroll: false };

// Scroll containment: wheel/touch over the sidebar or an open modal never scrolls the page behind
// it. If something inside can still scroll in that direction it does; otherwise the event is
// swallowed instead of chaining to the page.
export function installScrollContainment() {
  const LAYER = '.sidebar, [class*="overlay"], [class*="modal"]';

  function canScroll(el, dy) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll|overlay)/.test(cs.overflowY)) return false;
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    return dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  }
  function shouldBlock(target, dy) {
    for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.nodeType !== 1) continue;
      if (canScroll(el, dy)) return false;
      if (el.matches(LAYER) && getComputedStyle(el).position === 'fixed') return true;
    }
    return false;
  }

  document.addEventListener('wheel', e => {
    if (!pageFlags.api || e.ctrlKey || !e.deltaY) return;
    if (shouldBlock(e.target, e.deltaY)) e.preventDefault();
  }, { passive: false });

  let lastY = 0;
  document.addEventListener('touchstart', e => { lastY = e.touches[0] ? e.touches[0].clientY : 0; }, { passive: true });
  document.addEventListener('touchmove', e => {
    const y = e.touches[0] ? e.touches[0].clientY : lastY;
    const dy = lastY - y;               // finger up => content scrolls down
    lastY = y;
    if (pageFlags.api && dy && shouldBlock(e.target, dy)) e.preventDefault();
  }, { passive: false });
}

// Page scroll lock: while any full-screen overlay (modal, drawer backdrop) is open, the page
// behind it stays put.
export function installModalScrollLock() {
  const root = document.documentElement;
  let queued = false;

  function covers(el) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
  }
  function check() {
    queued = false;
    let open = false;
    if (!pageFlags.api) { root.classList.remove('astra-modal-open'); return; }
    const nodes = document.querySelectorAll('[class*="overlay"],[class*="modal"],[role="dialog"]');
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].classList.contains('astra-lbar')) continue;
      if (covers(nodes[i])) { open = true; break; }
    }
    root.classList.toggle('astra-modal-open', open);
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(check); } }

  const st = document.createElement('style');
  st.id = 'astra-modal-lock-css';
  st.textContent = 'html.astra-modal-open,html.astra-modal-open body{overflow:hidden!important;overscroll-behavior:none}';
  document.head.appendChild(st);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'open', 'hidden'] });
  window.addEventListener('resize', schedule);
  schedule();
}

// Inertia-style mouse-wheel scrolling for the page (the eased "glide"). Wheel input moves a target
// position and the page eases toward it every frame. Nested scrollers (modals, tables, dropdowns,
// the sidebar), zoom, touch, keyboard and scrollbar dragging keep their native behaviour.
export function installSmoothScroll() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const EASE = 0.12;       // 0-1: lower = floatier
  const SPEED = 1;         // wheel distance multiplier
  const root = document.scrollingElement || document.documentElement;

  let current = window.scrollY;
  let target = current;
  let raf = null;
  let ownScroll = false;   // true while our own scrollTo is firing the scroll event

  const maxScroll = () => Math.max(0, root.scrollHeight - window.innerHeight);

  // Is there an inner element under the cursor that can scroll in this direction?
  function innerScroller(el, dy) {
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.nodeType === 1) {
        const cs = getComputedStyle(el);
        const oy = cs.overflowY;
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 1) {
          const atTop = el.scrollTop <= 0, atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if ((dy < 0 && !atTop) || (dy > 0 && !atBottom)) return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  function frame() {
    const diff = target - current;
    if (Math.abs(diff) < 0.4) {
      current = target;
      raf = null;
    } else {
      current += diff * EASE;
      raf = requestAnimationFrame(frame);
    }
    ownScroll = true;
    window.scrollTo({ top: current, behavior: 'instant' });
  }

  window.addEventListener('wheel', e => {
    if (!pageFlags.smoothScroll) return;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;           // horizontal gesture
    if (document.body.style.overflow === 'hidden') return;          // drawer/modal lock
    const t = e.target;
    if (t.closest && t.closest('textarea,select,input[type="number"]')) return;
    if (innerScroller(t, e.deltaY)) return;
    if (maxScroll() <= 0) return;

    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
    if (!raf) { current = window.scrollY; target = current; }
    target = Math.min(maxScroll(), Math.max(0, target + dy * SPEED));
    e.preventDefault();
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: false });

  // Keep in sync when something else moves the page (keyboard, scrollbar, anchors).
  window.addEventListener('scroll', () => {
    if (ownScroll) { ownScroll = false; return; }
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    current = target = window.scrollY;
  }, { passive: true });
}

// Help tooltips (the original tooltips.js, loaded with the API client on every portal/login page):
// each tip box (.info-tip-box, .hero-tip-box, …) becomes a hover/focus/tap tooltip shown in a
// viewport-positioned clone on <body>, so it is never clipped by its card. It only adds attributes
// to the trigger and source, never restructures them.
export function installTooltips() {
  const selector = '.att-tip-box,.dash-tip-box,.hero-tip-box,.info-tip-box,.sd-tip-box,.generate-tooltip,.log-remarks-tooltip,.status-tooltip';
  const sources = new WeakMap();
  let active = null;
  let dismissed = null;
  let timer;
  let sequence = 0;

  function close() {
    clearTimeout(timer);
    if (!active) return;
    const { trigger, popup, previousDescription } = active;
    if (previousDescription === null) trigger.removeAttribute('aria-describedby');
    else trigger.setAttribute('aria-describedby', previousDescription);
    popup.remove();
    active = null;
  }

  function position() {
    if (!active) return;
    const { trigger, popup } = active;
    if (!trigger.isConnected) return close();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const margin = 12;
    const anchor = trigger.getBoundingClientRect();
    popup.style.width = Math.min(320, width - margin * 2) + 'px';
    popup.style.maxHeight = Math.max(48, height - margin * 2) + 'px';
    const box = popup.getBoundingClientRect();
    const x = Math.max(left + margin, Math.min(anchor.right - box.width, left + width - margin - box.width));
    const below = anchor.bottom + 8;
    const preferred = below + box.height <= top + height - margin ? below : anchor.top - box.height - 8;
    const y = Math.max(top + margin, Math.min(preferred, top + height - margin - box.height));
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
  }

  function open(trigger, explicit = false) {
    clearTimeout(timer);
    if (dismissed === trigger && !explicit) return;
    if (explicit) dismissed = null;
    if (active?.trigger === trigger) return position();
    const source = sources.get(trigger);
    if (!source || !source.textContent.trim()) return;
    close();
    const popup = source.cloneNode(true);
    popup.removeAttribute('data-tooltip-source');
    popup.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    popup.id = 'viewport-tooltip-' + ++sequence;
    popup.classList.add('viewport-tooltip');
    popup.setAttribute('role', 'tooltip');
    popup.setAttribute('popover', 'manual');
    popup.tabIndex = 0;
    const previousDescription = trigger.getAttribute('aria-describedby');
    trigger.setAttribute('aria-describedby', [previousDescription, popup.id].filter(Boolean).join(' '));
    document.body.appendChild(popup);
    if (popup.showPopover) popup.showPopover();
    active = { trigger, popup, previousDescription };
    popup.addEventListener('pointerenter', () => clearTimeout(timer));
    popup.addEventListener('pointerleave', dismissLater);
    popup.addEventListener('focusin', () => clearTimeout(timer));
    popup.addEventListener('focusout', dismissLater);
    position();
  }

  function dismissLater() { timer = setTimeout(close, 180); }

  function register() {
    document.querySelectorAll(selector).forEach(source => {
      if (source.classList.contains('viewport-tooltip') || source.hasAttribute('data-tooltip-source')) return;
      const trigger = source.parentElement;
      sources.set(trigger, source);
      source.setAttribute('data-tooltip-source', '');
      if (!trigger.matches('button,a,input,[tabindex]')) {
        trigger.tabIndex = 0;
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('aria-label', 'Show information');
      }
      trigger.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch') open(trigger);
      });
      trigger.addEventListener('pointerleave', event => {
        if (dismissed === trigger) dismissed = null;
        if (event.pointerType !== 'touch') dismissLater();
      });
      trigger.addEventListener('focusin', () => open(trigger));
      trigger.addEventListener('focusout', dismissLater);
      trigger.addEventListener('click', event => {
        event.stopPropagation();
        open(trigger, true);
      });
      trigger.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open(trigger, true);
        }
      });
    });
  }

  document.addEventListener('pointerdown', event => {
    if (active && !active.trigger.contains(event.target) && !active.popup.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      dismissed = active?.trigger || null;
      close();
    }
  });
  document.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  register();
  new MutationObserver(register).observe(document.body, { childList: true, subtree: true });
}
