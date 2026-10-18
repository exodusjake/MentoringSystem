/* ============================================================
   smooth-scroll.js
   Inertia-style mouse-wheel scrolling for the page (the eased "glide"
   you see on modern marketing sites). Wheel input moves a target
   position and the page eases toward it every frame.
   Nested scrollers (modals, tables, dropdowns, the sidebar), zoom,
   touch, keyboard and scrollbar dragging keep their native behaviour.
   ============================================================ */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.__smoothScroll) return;
  window.__smoothScroll = true;

  var EASE = 0.12;       // 0-1: lower = floatier
  var SPEED = 1;         // wheel distance multiplier
  var root = document.scrollingElement || document.documentElement;

  var current = window.scrollY;
  var target = current;
  var raf = null;
  var ownScroll = false; // true while our own scrollTo is firing the scroll event

  function maxScroll() { return Math.max(0, root.scrollHeight - window.innerHeight); }

  // Is there an inner element under the cursor that can scroll in this direction?
  function innerScroller(el, dy) {
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.nodeType === 1) {
        var cs = getComputedStyle(el);
        var oy = cs.overflowY;
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 1) {
          var atTop = el.scrollTop <= 0, atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if ((dy < 0 && !atTop) || (dy > 0 && !atBottom)) return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  function frame() {
    var diff = target - current;
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

  window.addEventListener('wheel', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;           // horizontal gesture
    if (document.body.style.overflow === 'hidden') return;          // drawer/modal lock
    var t = e.target;
    if (t.closest && t.closest('textarea,select,input[type="number"]')) return;
    if (innerScroller(t, e.deltaY)) return;
    if (maxScroll() <= 0) return;

    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
    if (!raf) { current = window.scrollY; target = current; }
    target = Math.min(maxScroll(), Math.max(0, target + dy * SPEED));
    e.preventDefault();
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: false });

  // Keep in sync when something else moves the page (keyboard, scrollbar, anchors).
  window.addEventListener('scroll', function () {
    if (ownScroll) { ownScroll = false; return; }
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    current = target = window.scrollY;
  }, { passive: true });
})();
