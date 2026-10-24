// Document-level behaviours the vanilla shared scripts installed once per page load. They act on the
// whole document (wheel/touch, overlays, tooltips), not on one page's markup, so they are ported as
// install-once modules rather than components.

// Which pages loaded which script (set per route by <Page>): apiClient.js (containment, scroll lock,
// confirm dialogs, tooltips) vs smooth-scroll.js.
export const pageFlags = { api: false, smoothScroll: false };

// ── apiClient.js: scroll containment ────────────────────────────────────────────────────────────
// Wheel/touch over the sidebar or an open modal never scrolls the page behind it.
export function installScrollContainment() {
  const LAYER = '.sidebar, [class*="overlay"], [class*="modal"]';

  function canScroll(el, dy) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll|overlay)/.test(cs.overflowY)) return false;
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    return dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  }

  // True when the event should be blocked (it started inside a fixed sidebar/modal layer and nothing
  // between the target and that layer can scroll further in that direction).
  function shouldBlock(target, dy) {
    for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (el.nodeType !== 1) continue;
      if (canScroll(el, dy)) return false;
      if (el.matches(LAYER) && getComputedStyle(el).position === 'fixed') return true;
    }
    return false;
  }

  document.addEventListener('wheel', e => {
    if (!pageFlags.api) return;
    if (e.ctrlKey || !e.deltaY) return;
    if (shouldBlock(e.target, e.deltaY)) e.preventDefault();
  }, { passive: false });

  let lastY = 0;
  document.addEventListener('touchstart', e => { lastY = e.touches[0] ? e.touches[0].clientY : 0; }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!pageFlags.api) return;
    const y = e.touches[0] ? e.touches[0].clientY : lastY;
    const dy = lastY - y;               // finger up => content scrolls down
    lastY = y;
    if (dy && shouldBlock(e.target, dy)) e.preventDefault();
  }, { passive: false });
}

// ── apiClient.js: page scroll lock while a full-screen overlay is open ───────────────────────────
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
    if (pageFlags.api) {
      const nodes = document.querySelectorAll('[class*="overlay"],[class*="modal"],[role="dialog"]');
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].classList.contains('astra-lbar')) continue;
        if (covers(nodes[i])) { open = true; break; }
      }
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

// ── apiClient.js: confirmation dialog restyle ────────────────────────────────────────────────────
// Any small "title + message + Cancel/Confirm" dialog is restyled in one layout. Dialogs are recognised by
// structure, so the markup and click handlers stay unchanged.
export function installConfirmDialogs() {
  const CARD    = '.confirm-card,.logout-modal,.nf-confirm-card,.info-modal,.cal-info-modal,.modal-card,.modal-card-sm,.edit-modal-card,.modal';
  const ACTIONS = '.confirm-actions,.info-modal-actions,.logout-modal-btns,.edit-modal-footer,.nf-confirm-actions,.modal-footer,.modal-actions';
  const TITLE   = '.confirm-title,.info-modal-title,.cal-info-modal-title,.nf-confirm-title,.logout-modal h3,.modal-title,h3,h2';
  const BODY    = '.confirm-body,.info-modal-message,.cal-info-modal-message,.nf-confirm-message,.modal-subtitle,.logout-modal p';
  const ICON    = '.confirm-icon,.info-modal-icon,.cal-info-modal-icon,.logout-modal-icon';
  const ERR_RE  = /went wrong|error|failed|unable|couldn.t|cannot|can.t|invalid|not allowed|denied/i;
  const X_SVG   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function enhance(card) {
    if (card.dataset.astraConfirm) return;
    if (card.matches('.qr-modal-card') || card.querySelector('#qr-reader')) return;   // the QR scanner is a full dialog with its own close button and a scrolling body, not a confirm
    if (card.querySelector('input:not([type="hidden"]),select,textarea,table,canvas,img,iframe')) return;   // forms / rich content stay as they are
    if ((card.textContent || '').length > 700) return;
    let actions = card.querySelector(ACTIONS);
    let btns = actions ? Array.prototype.filter.call(actions.children, n => n.tagName === 'BUTTON') : [];
    let single = false;
    if (btns.length < 2) {
      // "Something went wrong"-style alert: one OK button, error/danger icon or wording.
      const icon0 = card.querySelector(ICON), title0 = card.querySelector(TITLE);
      const isError = (icon0 && /danger|error/i.test(String(icon0.className))) || (title0 && ERR_RE.test(title0.textContent || ''));
      if (!isError) return;
      if (!actions) {
        const direct = Array.prototype.filter.call(card.children, n => n.tagName === 'BUTTON');
        if (direct.length !== 1) return;
        actions = document.createElement('div');
        card.insertBefore(actions, direct[0]);
        actions.appendChild(direct[0]);
        btns = direct;
      } else if (btns.length !== 1) return;
      single = true;
    } else if (btns.length > 3) return;
    const title = card.querySelector(TITLE);
    if (!title || actions.contains(title)) return;
    if (title.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_PRECEDING) return;   // title must come first

    card.dataset.astraConfirm = '1';
    title.dataset.ac = 'title';
    actions.dataset.ac = 'actions';
    if (single) actions.classList.add('astra-single');
    card.querySelectorAll(BODY).forEach(el => { if (!actions.contains(el) && el !== title) el.dataset.ac = 'body'; });
    card.querySelectorAll(ICON).forEach(el => { el.dataset.ac = 'icon'; });
    if (!card.querySelector('[data-ac="body"]')) card.classList.add('astra-confirm-nobody');

    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'astra-confirm-x';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = X_SVG;
    x.addEventListener('click', e => {
      e.stopPropagation();
      btns[0].click();            // the first button is always the Cancel / Go Back one
    });
    card.appendChild(x);
  }

  let queued = false;
  function scan() {
    queued = false;
    if (!pageFlags.api) return;
    document.querySelectorAll(CARD).forEach(enhance);
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(scan); } }

  scan();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
}

// ── tooltips.js: shared positioning for help tooltips across the portals ────────────────────────
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
    if (!pageFlags.api) return;
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

// ── smooth-scroll.js: inertia-style mouse-wheel scrolling ───────────────────────────────────────
// Only on pages that included smooth-scroll.js (pageFlags.smoothScroll).
export function installSmoothScroll() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const EASE = 0.12;       // 0-1: lower = floatier
  const SPEED = 1;         // wheel distance multiplier
  const root = document.scrollingElement || document.documentElement;

  let current = window.scrollY;
  let target = current;
  let raf = null;
  let ownScroll = false; // true while our own scrollTo is firing the scroll event

  function maxScroll() { return Math.max(0, root.scrollHeight - window.innerHeight); }

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

// ── Swipe hint for the sideways-scrolling card strips on phones (school filters, summary cards) ──────────────────
// The strips scroll horizontally at <= 620px; this adds the cue that there is more: the edges fade out while content
// continues in that direction, and a row of dots + "Swipe" sits underneath (the hint is a sibling of the strip, so the
// strip's own markup is never touched).
export function installScrollHints() {
  const STRIPS = '.portal-summary-strip, .monitoring-school-strip, .mobile-summary-scroll';
  // Head portal only: tables and table-like blocks that scroll sideways get a progress bar instead of dots.
  const WIDE = '.table-wrapper, .table-scroll, .history-table-wrap, [class*="table-wrap"], #schoolBreakdown';
  const sel = () => (document.body.classList.contains('head-polish') ? STRIPS + ', ' + WIDE : STRIPS);
  const mq = window.matchMedia('(max-width: 620px)');
  let queued = false;

  function update(el) {
    const max = el.scrollWidth - el.clientWidth;
    const over = mq.matches && max > 6 && el.offsetParent !== null;
    let hint = el.nextElementSibling;
    if (!(hint && hint.classList.contains('scroll-hint') && hint._for === el)) hint = null;
    if (!over) {
      if (hint) hint.remove();
      el.classList.remove('sh-more-r', 'sh-more-l');
      return;
    }
    const bar = el.matches(WIDE);
    const n = el.children.length;
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'scroll-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint._for = el;
      el.after(hint);
    }
    const kind = bar ? 'bar' : String(n);
    if (hint.dataset.n !== kind) {
      hint.dataset.n = kind;
      hint.classList.toggle('sh-bar', bar);
      hint.innerHTML = bar
        ? '<span class="sh-track"><i class="sh-thumb"></i></span><span class="sh-text">Swipe sideways for more</span>'
        : '<span class="sh-dots">' + '<i class="sh-dot"></i>'.repeat(n) + '</span><span class="sh-text">Swipe</span>';
    }
    const pos = max ? el.scrollLeft / max : 0;
    if (bar) {
      const thumb = hint.querySelector('.sh-thumb');
      const w = Math.max(18, Math.min(100, el.clientWidth / el.scrollWidth * 100));
      thumb.style.width = w + '%';
      thumb.style.marginLeft = (pos * (100 - w)) + '%';
    } else {
      const active = Math.min(n - 1, Math.max(0, Math.round(pos * (n - 1))));
      hint.querySelectorAll('.sh-dot').forEach((d, i) => d.classList.toggle('on', i === active));
    }
    el.classList.toggle('sh-more-l', el.scrollLeft > 6);
    el.classList.toggle('sh-more-r', el.scrollLeft < max - 6);
  }
  function scan() { queued = false; document.querySelectorAll(sel()).forEach(update); }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(scan); } }

  document.addEventListener('scroll', e => { if (e.target && e.target.matches && e.target.matches(sel())) update(e.target); }, true);
  window.addEventListener('resize', schedule);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
}
