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
  // React port: the vanilla landing/login pages rewrote their URL to "/" before this script's
  // path checks could match, so in practice every page got the portal (inversion) theme. Kept as is.
  var isLanding = false;
  var isLogin = false;
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

  // Dark palette (landing + login): deep midnight navy surfaces, soft blue
  // accent, brand gold kept for highlights.
  //   page #0a1120 · alt #0e1628 · card #141f38 · line #24324e
  //   text #f1f5fb / #c5cfe3 · muted #8d9bb8 · accent #60a5fa · gold #f0b429
  if (isLanding) css.push(
    D + '{color-scheme:dark;--ink:#f1f5fb;--body:#c5cfe3;--muted:#8d9bb8;--line:#24324e;--bg:#0e1628;--card:#141f38;--shadow:0 8px 28px rgba(0,0,0,.5)}',
    D + 'body{background:#0a1120}',
    D + '.nav{background:#0a1348}',
    D + '.nav.scrolled{background:rgba(10,19,72,.95)}',
    D + '.hero{background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(135deg,#0a1348 0%,#0e1c66 55%,#14297f 100%)}',
    D + '.strip,' + D + 'footer{background:#060b1c}',
    D + '.alt{background:var(--bg)}',
    D + '.btn-outline,' + D + '.chip{background:var(--card);color:#e8eefb}',
    D + '.btn-outline{border-color:#33456b}',
    D + '.btn-outline:hover{border-color:#60a5fa;color:#fff}',
    D + '.card,' + D + '.role,' + D + '.step,' + D + '.faq-item{background:var(--card);border-color:var(--line)}',
    D + '.card:hover,' + D + '.role:hover,' + D + '.step:hover{border-color:#33456b}',
    D + '.role{border-top-color:#3b82f6}',
    D + '.ib-blue{background:rgba(96,165,250,.16);color:#93c5fd}',
    D + '.ib-gold{background:rgba(240,180,41,.15);color:#fcd34d}',
    D + '.ib-green{background:rgba(52,211,153,.15);color:#6ee7b7}',
    D + '.ib-violet{background:rgba(167,139,250,.18);color:#c4b5fd}',
    D + '.ib-red{background:rgba(248,113,113,.15);color:#fca5a5}',
    D + '.pill.ok{background:rgba(52,211,153,.18);color:#6ee7b7}',
    D + '.pill.soon{background:rgba(240,180,41,.18);color:#fcd34d}',
    D + '.pill.go{background:rgba(96,165,250,.2);color:#93c5fd}',
    D + '.sec-head .eyebrow,' + D + '.why .eyebrow,' + D + '.checks svg,' + D + '.faq-more a,' + D + '.legal a,' + D + '.legal h2::before,' + D + '.toc a::before{color:#60a5fa}',
    D + '.faq-item summary{color:var(--ink)}',
    D + '.faq-item summary::after{background:rgba(96,165,250,.18);color:#93c5fd}',
    D + '.faq-item[open] summary::after{background:var(--gold);color:#0b1a5c}',
    D + '.toc{background:var(--bg)}',
    D + '.toc a:hover{background:rgba(96,165,250,.16);color:#fff}',
    D + '.legal .note{background:rgba(240,180,41,.09);color:#fcd34d}',
    D + '.legal th{background:#0e1c66}',
    D + '.legal tr:nth-child(even) td{background:rgba(255,255,255,.03)}',
    D + '.card:hover{box-shadow:0 10px 30px rgba(0,0,0,.55)}',
    D + '.chip svg{color:#60a5fa}'
  );

  if (isLogin) css.push(
    D + '{color-scheme:dark}',
    D + 'body{background-color:#070d1c}',
    D + '.wrapper{box-shadow:0 18px 60px rgba(0,0,0,.65)}',
    D + '.right-side{background:radial-gradient(ellipse 55% 45% at 18% 14%,rgba(59,130,246,.22),transparent 70%),radial-gradient(ellipse 50% 45% at 88% 90%,rgba(240,180,41,.09),transparent 70%),linear-gradient(160deg,#0f1832,#0a1124)}',
    D + '.login-card{background:linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.02));-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%);border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 50px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1)}',
    D + '.card-title,' + D + '.form-group label,' + D + '.forgot-title{color:#f1f5fb}',
    D + '.card-subtitle,' + D + '.contact-text,' + D + '.bottom-links a,' + D + '.forgot-body{color:#94a3c0}',
    D + '.bottom-links a:hover{color:#60a5fa}',
    D + '.remember-me{color:#c5cfe3}',
    D + '.forgot-link{color:#60a5fa}',
    D + '.forgot-link:hover{color:#93c5fd}',
    D + '.form-group input,' + D + '.contact-card .form-group select,' + D + '.contact-card .form-group textarea{background-color:rgba(255,255,255,.05);color:#f1f5fb;border:1.5px solid rgba(255,255,255,.14);box-shadow:none}',
    D + '.form-group input:focus,' + D + '.contact-card .form-group select:focus,' + D + '.contact-card .form-group textarea:focus{background-color:rgba(255,255,255,.08);border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.2)}',
    D + '.form-group input::placeholder,' + D + '.contact-card .form-group textarea::placeholder{color:#6b7a99}',
    D + '.contact-card .form-group select option{background:#141f38;color:#f1f5fb}',
    D + '.form-group input:-webkit-autofill{-webkit-box-shadow:0 0 0 40px #17213b inset;-webkit-text-fill-color:#f1f5fb}',
    D + '.input-icon,' + D + '.pw-toggle{color:#7585a6}',
    D + '.pw-toggle:hover{color:#cbd5e1}',
    D + '.error-banner{background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.35);color:#fca5a5}',
    D + '.caps-hint{background:rgba(240,180,41,.16);color:#fcd34d}',
    D + '.forgot-card{background:#121c35;border:1px solid rgba(255,255,255,.1)}',
    D + '.forgot-icon{background:rgba(96,165,250,.16)}',
    D + '.forgot-icon svg{stroke:#60a5fa}',
    D + '.modal-overlay{background:rgba(3,7,18,.72)}',
    D + '.back-home{background:rgba(255,255,255,.07);color:#e2e8f0;border-color:rgba(255,255,255,.14)}',
    D + '.back-home:hover{background:#f0b429;border-color:#f0b429;color:#0b1a5c}',
    D + '.login-loading{background:rgba(7,13,28,.95)!important}',
    D + '.login-loading .ll-title{color:#f1f5fb!important}',
    D + '.login-loading .ll-ring,' + D + '.login-loading .ll-bar{border-color:#24324e;background-color:#24324e}',
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
