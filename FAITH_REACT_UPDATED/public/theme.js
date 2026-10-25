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
  // The page kind lives on <html data-page="landing|login|portal">: set here from the URL before first paint,
  // then kept current by app/Page.jsx on every route change (the app never reloads between pages).
  var path = location.pathname;
  var kind = /^\/(landing|privacy|terms)(\/|$)/.test(path) ? 'landing' : /^\/login(\/|$)/.test(path) ? 'login' : 'portal';
  if (!root.getAttribute('data-page')) root.setAttribute('data-page', kind);
  var isLanding = true;
  var isLogin = true;
  var isPortal = true;

  function get() { try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function apply(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
  }
  apply(get()); // before first paint

  // ── CSS ──────────────────────────────────────────────────
  var D = 'html[data-theme="dark"] ';
  var DL = 'html[data-theme="dark"][data-page="landing"] ';   // landing + privacy + terms
  var DG = 'html[data-theme="dark"][data-page="login"] ';
  var DP = 'html[data-theme="dark"]:not([data-page="landing"]):not([data-page="login"]) ';   // portals (inverted)
  // P = invert → hue-rotate → contrast → saturate, applied to the whole page. It lands on a near-black navy with
  // thin dark borders, bright text and an emerald accent (the brand teal comes out ~#29c1a3). The 170deg turn
  // (10deg short of a full restore) nudges teal toward emerald; contrast .96 keeps white cards at ~#050505.
  // C = its exact inverse, applied to anything that must keep real colours.
  // PAGE is the colour that P turns into the deep navy page background (#04090f).
  var P = 'invert(1) hue-rotate(170deg) contrast(.96) saturate(1.5)';
  var C = 'saturate(.6667) contrast(1.0417) hue-rotate(-170deg) invert(1)';
  var PAGE = '#f7fbff';

  var css = [
    // toggle button
    '.theme-toggle{position:fixed!important;right:20px!important;bottom:20px!important;top:auto!important;left:auto!important;z-index:2147483000;width:46px;height:46px;border-radius:50%;',
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
    '@media (max-width:768px){.theme-toggle{right:14px!important;bottom:14px!important;width:42px;height:42px}}',
    '@media print{.theme-toggle{display:none!important}}',
    // Portal pages have the toggle in their header; the landing and login pages keep the floating one.
    'html.portal-has-header>body>.theme-toggle{display:none!important}'
  ];

  // Dark palette (landing + login), the same near-black navy as the portals: sky-blue
  // accent, brand gold kept for highlights.
  //   page #030a0f · alt #060d13 · card #08111a · line #16232e
  //   text #e8eef3 / #c3ced8 · muted #7f90a0 · accent #29aaff · gold #f0b429
  if (isLanding) css.push(
    DL + '{color-scheme:dark;--navy:#050d14;--navy-deep:#02070b;--blue:#29aaff;--blue-light:#29aaff;--ink:#e8eef3;--body:#c3ced8;--muted:#7f90a0;--line:#16232e;--bg:#060d13;--card:#08111a;--shadow:0 8px 28px rgba(0,0,0,.5)}',
    DL + 'body{background:#030a0f}',
    DL + '.nav{background:#050d14}',
    DL + '.nav.scrolled{background:rgba(5,13,20,.95)}',
    DL + '.hero{background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(135deg,#050d14 0%,#071a2a 55%,#0a2236 100%)}',
    DL + '.strip,' + DL + 'footer{background:#02070b}',
    DL + '.alt{background:var(--bg)}',
    DL + '.btn-outline,' + DL + '.chip{background:var(--card);color:#e8eef3}',
    DL + '.btn-outline{border-color:#25384a}',
    DL + '.btn-outline:hover{border-color:#29aaff;color:#fff}',
    DL + '.card,' + DL + '.role,' + DL + '.step,' + DL + '.faq-item{background:var(--card);border-color:var(--line)}',
    DL + '.card:hover,' + DL + '.role:hover,' + DL + '.step:hover{border-color:#25384a}',
    DL + '.role{border-top-color:#29aaff}',
    DL + '.ib-blue{background:rgba(41,170,255,.16);color:#7cc8ff}',
    DL + '.ib-gold{background:rgba(240,180,41,.15);color:#fcd34d}',
    DL + '.ib-green{background:rgba(52,211,153,.15);color:#6ee7b7}',
    DL + '.ib-violet{background:rgba(167,139,250,.18);color:#c4b5fd}',
    DL + '.ib-red{background:rgba(248,113,113,.15);color:#fca5a5}',
    DL + '.pill.ok{background:rgba(52,211,153,.18);color:#6ee7b7}',
    DL + '.pill.soon{background:rgba(240,180,41,.18);color:#fcd34d}',
    DL + '.pill.go{background:rgba(41,170,255,.2);color:#7cc8ff}',
    DL + '.sec-head .eyebrow,' + DL + '.why .eyebrow,' + DL + '.checks svg,' + DL + '.faq-more a,' + DL + '.legal a,' + DL + '.legal h2::before,' + DL + '.toc a::before{color:#29aaff}',
    DL + '.faq-item summary{color:var(--ink)}',
    DL + '.faq-item summary::after{background:rgba(41,170,255,.18);color:#7cc8ff}',
    DL + '.faq-item[open] summary::after{background:var(--gold);color:#0b1a5c}',
    DL + '.toc{background:var(--bg)}',
    DL + '.toc a:hover{background:rgba(41,170,255,.16);color:#fff}',
    DL + '.legal .note{background:rgba(240,180,41,.09);color:#fcd34d}',
    DL + '.legal th{background:#0a2236}',
    DL + '.legal tr:nth-child(even) td{background:rgba(255,255,255,.03)}',
    DL + '.card:hover{box-shadow:0 10px 30px rgba(0,0,0,.55)}',
    DL + '.chip svg{color:#29aaff}',
    DL + '.panel,' + DL + '.cta,' + DL + '.legal-hero{background:linear-gradient(135deg,#071a2a,#0a2236)}',
    DL + '.btn-primary{color:#04121c}'
  );

  if (isLogin) css.push(
    DG + '{color-scheme:dark}',
    DG + 'body{background-color:#030a0f}',
    DG + '.wrapper{box-shadow:0 18px 60px rgba(0,0,0,.65)}',
    DG + '.right-side{background:radial-gradient(ellipse 55% 45% at 18% 14%,rgba(41,170,255,.22),transparent 70%),radial-gradient(ellipse 50% 45% at 88% 90%,rgba(240,180,41,.09),transparent 70%),linear-gradient(160deg,#08131c,#050d14)}',
    DG + '.login-card{background:linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.02));-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%);border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 50px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1)}',
    DG + '.card-title,' + DG + '.form-group label,' + DG + '.forgot-title{color:#e8eef3}',
    DG + '.card-subtitle,' + DG + '.contact-text,' + DG + '.bottom-links a,' + DG + '.forgot-body{color:#8596a5}',
    DG + '.bottom-links a:hover{color:#29aaff}',
    DG + '.remember-me{color:#c3ced8}',
    DG + '.forgot-link{color:#29aaff}',
    DG + '.forgot-link:hover{color:#7cc8ff}',
    DG + '.form-group input,' + DG + '.contact-card .form-group select,' + DG + '.contact-card .form-group textarea{background-color:rgba(255,255,255,.05);color:#e8eef3;border:1.5px solid rgba(255,255,255,.14);box-shadow:none}',
    DG + '.form-group input:focus,' + DG + '.contact-card .form-group select:focus,' + DG + '.contact-card .form-group textarea:focus{background-color:rgba(255,255,255,.08);border-color:#29aaff;box-shadow:0 0 0 3px rgba(41,170,255,.2)}',
    DG + '.form-group input::placeholder,' + DG + '.contact-card .form-group textarea::placeholder{color:#6a7b8a}',
    DG + '.contact-card .form-group select option{background:#08111a;color:#e8eef3}',
    DG + '.form-group input:-webkit-autofill{-webkit-box-shadow:0 0 0 40px #0a141d inset;-webkit-text-fill-color:#e8eef3}',
    DG + '.input-icon,' + DG + '.pw-toggle{color:#75889a}',
    DG + '.pw-toggle:hover{color:#cbd5e1}',
    DG + '.error-banner{background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.35);color:#fca5a5}',
    DG + '.caps-hint{background:rgba(240,180,41,.16);color:#fcd34d}',
    DG + '.forgot-card{background:#08121a;border:1px solid rgba(255,255,255,.1)}',
    DG + '.forgot-icon{background:rgba(41,170,255,.16)}',
    DG + '.forgot-icon svg{stroke:#29aaff}',
    DG + '.modal-overlay{background:rgba(3,7,18,.72)}',
    DG + '.back-home{background:rgba(255,255,255,.07);color:#e2e8f0;border-color:rgba(255,255,255,.14)}',
    DG + '.back-home:hover{background:#f0b429;border-color:#f0b429;color:#0b1a5c}',
    DG + '.login-loading{background:rgba(3,10,15,.95)!important}',
    DG + '.login-loading .ll-title{color:#e8eef3!important}',
    DG + '.login-loading .ll-ring,' + DG + '.login-loading .ll-bar{border-color:#16232e;background-color:#16232e}',
    DG + '.login-loading .ll-ring{border-top-color:#29aaff}',
    DG + '.left-side{background-color:#050d14;background-image:radial-gradient(circle at 18% 12%,rgba(41,170,255,.2),transparent 46%),radial-gradient(circle at 85% 92%,rgba(240,180,41,.1),transparent 42%),linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(160deg,#071a2a 0%,#050d14 55%,#02070b 100%)}',
    DG + '.left-brand,' + DG + '.input-wrap:focus-within .input-icon{color:#29aaff}',
    DG + '.card-title::after,' + DG + '.left-divider{background:linear-gradient(90deg,#29aaff,#f0b429)}',
    DG + '.btn-signin{background:linear-gradient(135deg,#29aaff,#1b8fe0);color:#04121c}',
    DG + '.btn-signin:hover{background:linear-gradient(135deg,#4cbaff,#29aaff);box-shadow:0 8px 20px rgba(41,170,255,.32)}',
    DG + 'input[type="checkbox"]{accent-color:#29aaff}'
  );

  if (isPortal) css.push(
    '@media screen{',
    'html[data-theme="dark"]:not([data-page="landing"]):not([data-page="login"]){filter:' + P + ';background:' + PAGE + '}',
    DP + 'body{background:' + PAGE + '!important}',
    DP + '.sidebar{background:' + PAGE + '!important}',
    DP + 'img,' + DP + 'video,' + DP + 'picture,' + DP + '[class*="qr" i] canvas,' + DP + '[id*="qr" i] canvas,' + DP + '[class*="qr" i] img,' + DP + '[id*="qr" i] img,',
    DP + '.no-invert,' + DP + '[style*="background-image"]{filter:' + C + '}',
    DP + '.theme-toggle{filter:' + C + '}',
    DP + '.page-skel{background:#eef3f8}',
    'html[data-page="portal"]{transition:filter .3s ease}',
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

  // Flips the theme. Also used by the portal header's own button (window.astraToggleTheme).
  function toggle() {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
    set(next);
    var b = document.querySelector('.theme-toggle');
    if (b) label(b);
  }
  window.astraToggleTheme = toggle;

  function mount() {
    if (document.querySelector('.theme-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.innerHTML = SUN + MOON;
    label(btn);
    btn.addEventListener('click', function () { toggle(); btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin'); });
    document.body.appendChild(btn);
  }

  // Keep other tabs in sync.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { apply(get()); var b = document.querySelector('.theme-toggle'); if (b) label(b); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
