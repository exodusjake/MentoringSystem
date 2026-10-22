import { injectStyle } from './injectStyle.js';
import { clearSession } from './session.js';

// Shared "logging out" effect used by every portal's handleLogout() (apiClient.js playLogoutEffect): the page
// dims behind a centred card with a spinner, then the session is cleared and the user lands on the login page.
// It is appended straight to <body> (outside React) because it covers and fades the whole app.
export function playLogoutEffect() {
    if (document.getElementById('astra-logout-overlay')) return;
    injectStyle('astra-logout-css',
        '.lo-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(255,255,255,.0);backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);' +
        'transition:background .45s ease,backdrop-filter .45s ease,-webkit-backdrop-filter .45s ease;font-family:inherit}' +
        '.lo-overlay.show{background:rgba(244,247,251,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
        '.lo-card{display:flex;flex-direction:column;align-items:center;gap:14px;padding:30px 40px;border-radius:20px;background:#fff;' +
        'border:1px solid #dce3ec;box-shadow:0 20px 60px rgba(11,26,92,.18);opacity:0;transform:translateY(14px) scale(.96);' +
        'transition:opacity .4s ease .1s,transform .45s cubic-bezier(.22,1,.36,1) .1s}' +
        '.lo-overlay.show .lo-card{opacity:1;transform:none}' +
        '.lo-ring{width:46px;height:46px;border-radius:50%;border:4px solid #e5e7eb;border-top-color:#2563eb;animation:lo-spin .8s linear infinite}' +
        '.lo-title{font-size:16px;font-weight:700;color:#111827}' +
        '.lo-sub{font-size:13px;color:#6b7280;margin-top:-8px}' +
        '.lo-bar{width:170px;height:4px;border-radius:4px;background:#e5e7eb;overflow:hidden}' +
        '.lo-bar i{display:block;height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,#3b82f6,#f0b429);transition:width 1.05s cubic-bezier(.4,0,.2,1)}' +
        '.lo-overlay.go .lo-bar i{width:100%}' +
        'body.lo-leaving>*:not(.lo-overlay){transition:opacity .5s ease,transform .5s ease,filter .5s ease;opacity:.35;transform:scale(.985);filter:saturate(.7)}' +
        '@keyframes lo-spin{to{transform:rotate(360deg)}}' +
        '@media (prefers-reduced-motion:reduce){.lo-overlay,.lo-card,.lo-bar i{transition:none}.lo-ring{animation-duration:1.6s}body.lo-leaving>*:not(.lo-overlay){transition:none;transform:none}}');
    const ov = document.createElement('div');
    ov.id = 'astra-logout-overlay';
    ov.className = 'lo-overlay';
    ov.setAttribute('role', 'status');
    ov.innerHTML = '<div class="lo-card"><div class="lo-ring"></div><div class="lo-title">Logging you out…</div>' +
        '<div class="lo-sub">Securing your session</div><div class="lo-bar"><i></i></div></div>';
    document.body.appendChild(ov);
    document.body.classList.add('lo-leaving');
    requestAnimationFrame(() => requestAnimationFrame(() => { ov.classList.add('show', 'go'); }));
    clearSession();
    setTimeout(() => {
        const t = ov.querySelector('.lo-title'), s = ov.querySelector('.lo-sub');
        if (t) t.textContent = 'See you soon!';
        if (s) s.textContent = 'Taking you back to the login page';
    }, 800);
    // Full page load, as the vanilla app did: drops all in-memory page state with the session.
    setTimeout(() => { window.location.href = '/login'; }, 1300);
}
