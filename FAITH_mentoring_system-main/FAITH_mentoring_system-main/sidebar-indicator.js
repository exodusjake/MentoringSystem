/* ============================================================
   sidebar-indicator.js
   Shared by every portal (Admin / Head / Mentor / Mentee).
   - Draws one highlight "pill" behind the active .nav-item and slides it
     between tabs (position carried across page loads via sessionStorage).
   - Caches the sidebar markup so it paints instantly on the next page
     instead of popping in after a fetch.
   - Shows a skeleton screen over the content area while a page loads.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'sbIndicator';
  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var NAV_DELAY = 340;

  var css = [
    'html{scroll-behavior:smooth}',
    '.sidebar{scroll-behavior:smooth;overscroll-behavior:contain}',
    '.sidebar-nav{position:relative}',
    '.nav-item{white-space:nowrap;min-height:42px}',
    '#nav-ratings{font-size:14px}',
    '.sb-indicator{position:absolute;left:12px;right:12px;top:0;height:0;border-radius:var(--radius-md,10px);',
    'background:var(--sb-active,#2563eb);box-shadow:0 4px 12px rgba(37,99,235,.28);',
    'pointer-events:none;z-index:0;opacity:0;will-change:transform,height}',
    '.sb-indicator.ready{opacity:1}',
    '.sb-indicator.animate{transition:transform .34s ' + EASE + ',height .34s ' + EASE + ',opacity .2s ease}',
    '.sidebar-nav.has-indicator .nav-item{position:relative;z-index:1}',
    '.sidebar-nav.has-indicator .nav-item.active{background:transparent}',
    '.nav-item{transition:background .25s ease,color .25s ease,transform .25s ease}',
    '.nav-item i{transition:color .25s ease,transform .25s ease}',
    '.sidebar{transition:transform .35s ' + EASE + ',box-shadow .35s ease}',
    '.sidebar-overlay{transition:opacity .3s ease}',
    '.page-skel{position:fixed;top:0;right:0;bottom:0;left:var(--sb-width,260px);z-index:50;background:var(--gray-50,#eef1f6);',
    'padding:28px;display:flex;flex-direction:column;gap:20px;overflow:hidden;opacity:0;pointer-events:none;transition:opacity .25s ease}',
    '.page-skel.show{opacity:1}',
    '.page-skel .sk{border-radius:12px;background:linear-gradient(90deg,#e3e7ee 25%,#eef1f6 50%,#e3e7ee 75%);background-size:200% 100%;animation:sk-shimmer 1.2s linear infinite}',
    '.page-skel .sk-title{height:30px;width:260px;max-width:60%}',
    '.page-skel .sk-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}',
    '.page-skel .sk-card{height:96px}',
    '.page-skel .sk-block{height:260px}',
    '.page-skel .sk-block.short{height:140px}',
    '@keyframes sk-shimmer{to{background-position:-200% 0}}',
    '@media (max-width:768px){.page-skel{left:0;padding:70px 16px 16px}.page-skel .sk-row{grid-template-columns:1fr 1fr}}',
    '@media (prefers-reduced-motion:reduce){html,.sidebar{scroll-behavior:auto}.sb-indicator.animate,.nav-item,.nav-item i,.page-skel{transition:none!important}.page-skel .sk{animation:none!important}}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function read() {
    try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function write(v) {
    try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
  }
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  // ── Skeleton screen ──
  var skel = document.createElement('div');
  skel.className = 'page-skel show';
  skel.setAttribute('aria-hidden', 'true');
  skel.innerHTML = '<div class="sk sk-title"></div>' +
    '<div class="sk-row"><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div></div>' +
    '<div class="sk sk-block"></div><div class="sk sk-block short"></div>';
  document.body.appendChild(skel);
  function hideSkel() { setTimeout(function () { skel.classList.remove('show'); }, 250); }
  if (document.readyState === 'complete') hideSkel(); else window.addEventListener('load', hideSkel);
  window.addEventListener('pageshow', function (e) { if (e.persisted) skel.classList.remove('show'); });

  // ── Sidebar cache ──
  var role = location.pathname.split('/')[1] || '';
  var HTML_KEY = 'sbHtml:' + role, RAW_KEY = 'sbRaw:' + role;
  var cachedInjected = false;

  (function () {
    var container = document.getElementById('sidebar-container');
    if (!container) return;
    var d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    var cached = sget(HTML_KEY);

    if (cached) {
      d.set.call(container, cached);
      cachedInjected = true;
      var page = location.pathname.split('/').pop();
      container.querySelectorAll('.nav-item').forEach(function (n) {
        if (n.getAttribute('href') === page) n.classList.add('active');
      });
    }

    // The page's own sidebar script assigns the fetched markup here.
    Object.defineProperty(container, 'innerHTML', {
      configurable: true,
      get: function () { return d.get.call(this); },
      set: function (v) {
        delete container.innerHTML;
        if (cachedInjected && sget(RAW_KEY) === v) return; // identical: keep live DOM
        d.set.call(container, v);                           // first visit or sidebar changed
        sset(RAW_KEY, v);
        cachedInjected = false;                             // re-save the fresh markup
        start();
      }
    });
  })();

  function saveSidebar() {
    var container = document.getElementById('sidebar-container');
    if (!container || cachedInjected) return;
    var clone = container.cloneNode(true);
    var pill = clone.querySelector('.sb-indicator'); if (pill) pill.remove();
    var nav = clone.querySelector('.sidebar-nav'); if (nav) nav.classList.remove('has-indicator');
    clone.querySelectorAll('.active,.open').forEach(function (n) { n.classList.remove('active', 'open'); });
    sset(HTML_KEY, clone.innerHTML);
  }

  // ── Sidebar scroll position: a new document starts the sidebar at scrollTop 0,
  //    which makes the nav jump up when you click an item near the bottom ──
  var SCROLL_KEY = 'sbScroll:' + role;
  function restoreScroll() {
    var sb = document.querySelector('.sidebar');
    if (!sb) return;
    var y = parseInt(sget(SCROLL_KEY), 10);
    if (y > 0) sb.scrollTo({ top: y, behavior: 'instant' }); // not animated
    if (!sb.dataset.scrollBound) {
      sb.dataset.scrollBound = '1';
      sb.addEventListener('scroll', function () { sset(SCROLL_KEY, String(sb.scrollTop)); }, { passive: true });
    }
  }

  // ── Sliding indicator ──
  function place(pill, top, height) {
    pill.style.height = height + 'px';
    pill.style.transform = 'translateY(' + top + 'px)';
  }

  function setup() {
    var nav = document.querySelector('.sidebar-nav');
    if (!nav || nav.querySelector('.sb-indicator')) return !!nav;
    var active = nav.querySelector('.nav-item.active');
    if (!active) return false;

    restoreScroll();
    var pill = document.createElement('div');
    pill.className = 'sb-indicator';
    // Each portal themes the active item differently (blue / teal / indigo).
    var bg = getComputedStyle(active).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      pill.style.background = bg;
      pill.style.boxShadow = '0 4px 12px ' + bg.replace(/^rgb\(/, 'rgba(').replace(/\)$/, ', .28)');
    }
    nav.insertBefore(pill, nav.firstChild);
    nav.classList.add('has-indicator');

    var top = active.offsetTop, height = active.offsetHeight;
    var prev = read();

    // Start where the previous page left the pill (no transition), then glide.
    if (prev && typeof prev.top === 'number') place(pill, prev.top, prev.height);
    else place(pill, top, height);
    pill.classList.add('ready');
    void pill.offsetHeight; // commit starting position
    pill.classList.add('animate');
    requestAnimationFrame(function () { place(pill, top, height); });
    write({ top: top, height: height });
    saveSidebar();

    // Slide immediately on click, hold navigation until the glide finishes.
    nav.addEventListener('click', function (e) {
      var item = e.target.closest && e.target.closest('.nav-item');
      if (!item || !nav.contains(item)) return;
      place(pill, item.offsetTop, item.offsetHeight);
      write({ top: item.offsetTop, height: item.offsetHeight });

      var href = item.getAttribute('href');
      var plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
      if (!href || href.charAt(0) === '#' || item.target === '_blank' || !plain) return;
      e.preventDefault();
      if (item.classList.contains('active')) return;
      nav.querySelectorAll('.nav-item.active').forEach(function (n) { n.classList.remove('active'); });
      item.classList.add('active');
      var sbEl = document.querySelector('.sidebar');
      if (sbEl) sset(SCROLL_KEY, String(sbEl.scrollTop));
      skel.classList.add('show'); // fade to skeleton while the pill glides
      setTimeout(function () { window.location.href = item.href; }, NAV_DELAY);
    });

    window.addEventListener('resize', function () {
      var a = nav.querySelector('.nav-item.active');
      if (!a) return;
      pill.classList.remove('animate');
      place(pill, a.offsetTop, a.offsetHeight);
      void pill.offsetHeight;
      pill.classList.add('animate');
    });
    return true;
  }

  // The sidebar's active class may be set after it is injected, so watch.
  var obs = null;
  function start() {
    if (setup()) return;
    if (obs) obs.disconnect();
    obs = new MutationObserver(function () {
      if (document.querySelector('.sidebar-nav .nav-item.active') && setup()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    setTimeout(function () { if (obs) obs.disconnect(); }, 8000);
  }

  // With a cached sidebar the nav already exists: place the pill right away.
  if (cachedInjected) start();
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
