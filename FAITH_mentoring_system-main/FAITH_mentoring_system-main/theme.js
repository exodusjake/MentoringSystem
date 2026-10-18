/* ============================================================
   theme.js — dark mode for every page (landing, login, all portals)
   Load in <head> so the saved theme is applied before first paint.
   - Landing + login: hand-tuned dark palettes (brand navy stays navy).
   - Portals (Admin/Head/Mentor/Mentee): their CSS is hard-coded light, so a
     screen-only colour inversion is used; images, video and QR codes are
     inverted back so they keep their real colours.
   Preference is remembered in localStorage ("astraTheme").
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'astraTheme';
  var root = document.documentElement;
  var path = location.pathname.toLowerCase();
  var isLanding = path.indexOf('/landing/') === 0;
  var isLogin = path.indexOf('/login/') === 0;
  var isPortal = !isLanding && !isLogin;

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

  if (isLanding) css.push(
    D + '{color-scheme:dark;--ink:#f1f5f9;--body:#cbd5e1;--muted:#94a3b8;--line:#3a486a;--bg:#212b44;--card:#28344f;--shadow:0 6px 24px rgba(0,0,0,.45)}',
    D + 'body{background:#1a2338}',
    D + '.btn-outline,' + D + '.chip{background:var(--card);color:#e2e8f0}',
    D + '.btn-outline{border-color:var(--line)}',
    D + '.role,' + D + '.step,' + D + '.faq-item{background:var(--card)}',
    D + '.ib-blue{background:rgba(59,130,246,.18);color:#93c5fd}',
    D + '.ib-gold{background:rgba(240,180,41,.16);color:#fcd34d}',
    D + '.ib-green{background:rgba(34,197,94,.16);color:#86efac}',
    D + '.ib-violet{background:rgba(139,92,246,.2);color:#c4b5fd}',
    D + '.ib-red{background:rgba(239,68,68,.16);color:#fca5a5}',
    D + '.pill.ok{background:rgba(34,197,94,.2);color:#86efac}',
    D + '.pill.soon{background:rgba(240,180,41,.2);color:#fcd34d}',
    D + '.pill.go{background:rgba(59,130,246,.22);color:#93c5fd}',
    D + '.sec-head .eyebrow,' + D + '.why .eyebrow,' + D + '.checks svg,' + D + '.faq-more a,' + D + '.legal a,' + D + '.legal h2::before,' + D + '.toc a::before{color:#60a5fa}',
    D + '.faq-item summary::after{background:rgba(59,130,246,.2);color:#93c5fd}',
    D + '.faq-item[open] summary::after{background:var(--gold);color:var(--navy)}',
    D + '.toc a:hover{background:rgba(59,130,246,.18);color:#fff}',
    D + '.legal .note{background:rgba(240,180,41,.1);color:#fcd34d}',
    D + '.card:hover{box-shadow:0 8px 28px rgba(0,0,0,.5)}',
    D + '.chip svg{color:#60a5fa}'
  );

  if (isLogin) css.push(
    D + '{color-scheme:dark}',
    D + 'body{background-color:#1a2338}',
    D + '.wrapper{box-shadow:0 10px 40px rgba(0,0,0,.55)}',
    D + '.right-side{background-color:#212b44}',
    D + '.login-card{border-color:#3a486a;box-shadow:0 10px 34px rgba(0,0,0,.3)}',
    D + '.right-logo-img{background:#fff;border-radius:14px;padding:8px 14px;width:170px}',
    D + '.card-title,' + D + '.form-group label,' + D + '.forgot-title{color:#f1f5f9}',
    D + '.card-subtitle,' + D + '.contact-text,' + D + '.bottom-links a,' + D + '.forgot-body{color:#94a3b8}',
    D + '.bottom-links a:hover{color:#60a5fa}',
    D + '.remember-me{color:#cbd5e1}',
    D + '.form-group input{background-color:#1a2338;color:#f1f5f9;border-color:#3a486a}',
    D + '.form-group input:focus{background-color:#161e32;border-color:#3b82f6}',
    D + '.form-group input::placeholder{color:#64748b}',
    D + '.form-group input:-webkit-autofill{-webkit-box-shadow:0 0 0 40px #1a2338 inset;-webkit-text-fill-color:#f1f5f9}',
    D + '.input-icon,' + D + '.pw-toggle{color:#64748b}',
    D + '.pw-toggle:hover{color:#cbd5e1}',
    D + '.error-banner{background:rgba(220,38,38,.12);border-color:rgba(220,38,38,.35);color:#fca5a5}',
    D + '.caps-hint{background:rgba(240,180,41,.16);color:#fcd34d}',
    D + '.forgot-card{background:#28344f}',
    D + '.forgot-icon{background:rgba(37,99,235,.2)}',
    D + '.forgot-icon svg{stroke:#60a5fa}',
    D + '.modal-overlay{background:rgba(0,0,0,.65)}',
    D + '.back-home{background:#2b3856;color:#e2e8f0;border-color:#3a486a}',
    D + '.back-home:hover{background:#f0b429;border-color:#f0b429;color:#0b1a5c}',
    D + '.login-loading{background:rgba(26,35,56,.94)!important}',
    D + '.login-loading .ll-title{color:#f1f5f9!important}',
    D + '.login-loading .ll-ring,' + D + '.login-loading .ll-bar{border-color:#3a486a;background-color:#3a486a}',
    D + '.login-loading .ll-ring{border-top-color:#3b82f6}'
  );

  if (isPortal) css.push(
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
    btn.className = 'theme-toggle' + (isLogin ? ' at-top' : '');
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
