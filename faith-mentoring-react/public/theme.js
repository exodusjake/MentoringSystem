/* ============================================================
   theme.js — dark mode for every page (landing, login, all portals)
   Load in <head> so the saved theme is applied before first paint.
   Pages are hard-coded light, so dark mode is a screen-only colour inversion;
   images, video and QR codes are inverted back so they keep their real colours.
   (The original also had hand-tuned landing/login palettes, but they never
   applied: those pages rewrote the URL to "/" before this script ran.)
   Preference is remembered in localStorage ("astraTheme").
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'astraTheme';
  var root = document.documentElement;

  function get() { try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function apply(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
  }
  apply(get()); // before first paint

  // ── CSS ──────────────────────────────────────────────────
  var D = 'html[data-theme="dark"] ';
  // P = invert → hue-rotate → contrast, applied to the whole page.
  // C = its exact inverse, applied to anything that must keep real colours.
  var P = 'invert(1) hue-rotate(180deg) contrast(.78)';
  var C = 'contrast(1.2821) hue-rotate(180deg) invert(1)';

  var css = [
    // toggle button
    '.theme-toggle{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:46px;height:46px;border-radius:50%;',
    'display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;',
    'background:#ffffff;color:#1e293b;border:1px solid rgba(15,23,42,.14);box-shadow:0 6px 18px rgba(15,23,42,.18);',
    'transition:transform .25s ease,background .3s ease,color .3s ease,border-color .3s ease,box-shadow .3s ease}',
    '.theme-toggle:hover{transform:scale(1.08)}',
    '.theme-toggle:active{transform:scale(.94)}',
    '.theme-toggle:focus-visible{outline:2px solid #60a5fa;outline-offset:3px}',
    '.theme-toggle svg{width:22px;height:22px;transition:transform .5s cubic-bezier(.22,1,.36,1)}',
    '.theme-toggle.spin svg{animation:theme-spin .5s cubic-bezier(.22,1,.36,1)}',
    '@keyframes theme-spin{from{transform:rotate(-120deg) scale(.6);opacity:.3}to{transform:none;opacity:1}}',
    '.theme-toggle .ic-sun{display:none}',
    D + '.theme-toggle{background:#1b1f2a;color:#f59e0b;border-color:rgba(255,255,255,.14);box-shadow:0 6px 18px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.03)}',
    D + '.theme-toggle .ic-sun{display:block}',
    D + '.theme-toggle .ic-moon{display:none}',
    '.theme-toggle.at-top{bottom:auto;top:20px}',
    '@media (max-width:768px){.theme-toggle{right:14px;bottom:14px;width:42px;height:42px}.theme-toggle.at-top{top:14px;bottom:auto}}',
    '@media print{.theme-toggle{display:none!important}}'
  ];

  css.push(
    '@media screen{',
    'html[data-theme="dark"]{filter:' + P + ';background:#fff}',
    D + 'img,' + D + 'video,' + D + 'picture,' + D + '[class*="qr" i] canvas,' + D + '[id*="qr" i] canvas,' + D + '[class*="qr" i] img,' + D + '[id*="qr" i] img,',
    D + '.no-invert,' + D + '[style*="background-image"]{filter:' + C + '}',
    D + '.theme-toggle{filter:' + C + '}',
    D + '.page-skel{background:#eef1f6}',
    'html{transition:filter .3s ease}',
    '}'
  );

  var style = document.createElement('style');
  style.id = 'astra-theme-css';
  style.textContent = css.join('\n');
  (document.head || root).appendChild(style);

  // ── Toggle button ────────────────────────────────────────
  var SUN = '<svg class="ic-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var MOON = '<svg class="ic-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function label(btn) {
    var dark = root.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = dark ? 'Light mode' : 'Dark mode';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  }

  function mount() {
    if (document.querySelector('.theme-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.innerHTML = SUN + MOON;
    label(btn);
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      set(next);
      label(btn);
      btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin');
    });
    document.body.appendChild(btn);
  }

  // Keep other tabs in sync.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { apply(get()); var b = document.querySelector('.theme-toggle'); if (b) label(b); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
