import { useEffect, useState } from 'react';
import { router } from '../app/router.jsx';
import { useStyle } from '../lib/injectStyle.js';

// One-time notice that the site stores a few things in the browser (sign-in session, theme, preferences).
// Nothing here is for advertising or tracking; the choice is remembered so it is only shown once.
const KEY = 'astra_cookie_notice';

const CSS = [
  '.cookie-banner{position:fixed;left:50%;bottom:14px;z-index:2900;width:min(560px,calc(100vw - 24px));box-sizing:border-box;display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 16px;font-family:"DM Sans","Poppins",system-ui,sans-serif;color:var(--ink,#1f2937);background:var(--sb-bg,#fff);border:1.5px solid var(--sb-active,#1e4b8c);border-radius:16px;box-shadow:0 14px 40px rgba(15,23,42,.22);transform:translateX(-50%);animation:cbIn .35s cubic-bezier(.22,1,.36,1) both}',
  '@keyframes cbIn{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}',
  '.cookie-banner .cb-text{flex:1;min-width:200px;font-size:13.5px;line-height:1.5;margin:0}',
  '.cookie-banner .cb-text a{color:var(--sb-active,#1e4b8c);font-weight:700}',
  '.cookie-banner .cb-btn{font:inherit;font-size:13.5px;font-weight:700;color:#fff;background:var(--sb-active,#1e4b8c);border:none;border-radius:10px;padding:9px 18px;cursor:pointer;margin-left:auto}',
  '.cookie-banner .cb-btn:hover{filter:brightness(1.1)}',
  'html[data-theme="dark"] .cookie-banner{background:#1e293b;color:#e5e7eb;border-color:#7aa7e6}',
  'html[data-theme="dark"] .cookie-banner .cb-text a{color:#7aa7e6}',
  'html[data-theme="dark"] .cookie-banner .cb-btn{background:#7aa7e6;color:#0f172a}',
  '@media (max-width:480px){.cookie-banner{bottom:8px;padding:12px 14px}.cookie-banner .cb-btn{width:100%;margin-left:0}}',
  '@media print,(prefers-reduced-motion:reduce){.cookie-banner{animation:none}}',
  '@media print{.cookie-banner{display:none}}',
].join('');

function seen() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export default function CookieBanner() {
  useStyle('cookie-banner', CSS);
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(!seen()); }, []);
  if (!show) return null;
  const accept = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* private mode: it just shows again next visit */ }
    setShow(false);
  };
  return (
    <div className="cookie-banner" role="region" aria-label="Cookie notice">
      <p className="cb-text">
        Astra Mentoring uses cookies and local storage only to keep you signed in and remember your settings, such as light or dark mode. See our <a href="/privacy" onClick={e => { e.preventDefault(); router.navigate('/privacy'); }}>Privacy Policy</a>.
      </p>
      <button type="button" className="cb-btn" onClick={accept}>Got it</button>
    </div>
  );
}
