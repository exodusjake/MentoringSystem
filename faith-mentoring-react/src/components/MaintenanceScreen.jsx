import { useEffect, useState } from 'react';
import { CONFIG } from '../lib/config.js';
import { on } from '../lib/events.js';
import { useStyle } from '../lib/injectStyle.js';
import { clearSession, getSession, isLoggedIn } from '../lib/session.js';

// Maintenance screen: shown when the server answers 503 { maintenance: true } (lib/api.js emits it).
// Full-screen, with the admin's message and estimated time; it re-checks every 30 s and reopens the
// app when the portal is back. Behavior, text and CSS are verbatim from the original.
const CSS =
  '.mt-overlay{position:fixed;inset:0;z-index:2147483200;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;' +
  'background:radial-gradient(circle at 15% 10%,rgba(59,130,246,.18),transparent 45%),radial-gradient(circle at 90% 95%,rgba(240,180,41,.16),transparent 45%),#f4f7fb;' +
  'font-family:"DM Sans","Poppins",system-ui,sans-serif;opacity:0;transition:opacity .35s ease}' +
  '.mt-overlay.show{opacity:1}' +
  '.mt-card{width:100%;max-width:520px;background:#fff;border:1px solid #dce3ec;border-radius:22px;padding:38px 34px 30px;text-align:center;' +
  'box-shadow:0 24px 70px rgba(11,26,92,.16);transform:translateY(14px) scale(.98);transition:transform .45s cubic-bezier(.22,1,.36,1)}' +
  '.mt-overlay.show .mt-card{transform:none}' +
  '.mt-icon{width:84px;height:84px;margin:0 auto 20px;border-radius:50%;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;position:relative}' +
  '.mt-icon svg{width:40px;height:40px}' +
  '.mt-icon .mt-gear{animation:mt-spin 9s linear infinite;transform-origin:50% 50%}' +
  '.mt-icon::after{content:"";position:absolute;inset:-7px;border-radius:50%;border:2px dashed #bfdbfe;animation:mt-spin 24s linear infinite reverse}' +
  '@keyframes mt-spin{to{transform:rotate(360deg)}}' +
  '.mt-title{font-size:26px;font-weight:700;color:#0b1a5c;margin:0 0 8px}' +
  '.mt-sub{font-size:15px;color:#4b5563;line-height:1.6;margin:0}' +
  '.mt-detail{margin:18px 0 0;padding:14px 16px;border-radius:12px;background:#f8fafc;border-left:4px solid #f0b429;text-align:left;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}' +
  '.mt-eta{margin:18px 0 0;padding:14px 16px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a}' +
  '.mt-eta small{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3b82f6;margin-bottom:3px}' +
  '.mt-eta b{display:block;font-size:17px}' +
  '.mt-eta span{display:block;font-size:13px;color:#475569;margin-top:2px}' +
  '.mt-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:24px}' +
  '.mt-btn{font:600 14px "DM Sans","Poppins",system-ui,sans-serif;border-radius:10px;padding:11px 22px;cursor:pointer;border:1px solid #dce3ec;background:#fff;color:#374151;transition:background .15s,transform .12s,box-shadow .15s}' +
  '.mt-btn:hover{background:#f4f7fb}.mt-btn:active{transform:scale(.97)}' +
  '.mt-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.mt-btn.primary:hover{background:#1d4ed8;box-shadow:0 6px 16px rgba(37,99,235,.3)}' +
  '.mt-foot{margin-top:18px;font-size:12px;color:#9ca3af}' +
  '@media (prefers-reduced-motion:reduce){.mt-icon .mt-gear,.mt-icon::after{animation:none}.mt-overlay,.mt-card{transition:none}}';

const GEAR_PATH = 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z';

export default function MaintenanceScreen() {
  const [info, setInfo] = useState(null);
  useEffect(() => on('maintenance', data => setInfo(prev => prev || data || {})), []);
  if (!info) return null;
  return <Screen info={info} />;
}

function Screen({ info }) {
  useStyle('maintenance', CSS);
  const role = info.role || getSession().role || '';
  const eta = info.eta ? new Date(info.eta) : null;
  const hasEta = !!eta && !isNaN(eta.getTime());
  const [loggedIn] = useState(isLoggedIn);
  const [shown, setShown] = useState(false);
  const [left, setLeft] = useState('');
  const [checking, setChecking] = useState(false);
  const [foot, setFoot] = useState('We’ll reopen this page automatically when maintenance is done.');

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  }, []);

  useEffect(() => {
    if (!hasEta) return;
    const tick = () => {
      const ms = eta.getTime() - Date.now();
      if (ms <= 0) { setLeft('Taking a little longer than expected — we’re still working on it.'); return; }
      const mins = Math.ceil(ms / 60000), d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
      setLeft('About ' + (d ? d + ' day' + (d > 1 ? 's ' : ' ') : '') + (h ? h + ' hr ' : '') + (!d ? m + ' min' : '') + ' from now');
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  async function stillDown() {
    try {
      const res = await fetch(CONFIG.getUrl('Maintenance'), { cache: 'no-store' });
      if (!res.ok) return true;
      const s = await res.json();
      return role === 'Mentee' ? !!s.mentee : role === 'Mentor' ? !!s.mentor : !!(s.mentor || s.mentee);
    } catch (e) { return true; }
  }
  async function check(manual) {
    if (manual) setChecking(true);
    if (!(await stillDown())) { window.location.reload(); return; }
    if (manual) {
      setChecking(false);
      setFoot('Still under maintenance — we’ll keep checking for you.');
    }
  }
  useEffect(() => {
    const id = setInterval(() => check(false), 30000);
    return () => clearInterval(id);
  }, []);

  const etaDate = hasEta ? eta.toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <div id="astra-maint" className={'mt-overlay' + (shown ? ' show' : '')} role="alertdialog" aria-modal="true" aria-labelledby="mtTitle">
      <div className="mt-card">
        <div className="mt-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <g className="mt-gear"><circle cx="12" cy="12" r="3" /><path d={GEAR_PATH} /></g>
          </svg>
        </div>
        <h1 className="mt-title" id="mtTitle">We’ll be right back</h1>
        <p className="mt-sub">{role ? <>The <b>{role}</b> portal</> : 'This portal'} is temporarily under maintenance. Thank you for your patience.</p>
        {info.detail && <div className="mt-detail">{info.detail}</div>}
        {hasEta && <div className="mt-eta"><small>Estimated back</small><b id="mtEtaDate">{etaDate}</b><span id="mtEtaLeft">{left}</span></div>}
        <div className="mt-actions">
          <button type="button" className="mt-btn primary" id="mtCheck" disabled={checking} onClick={() => check(true)}>{checking ? 'Checking…' : 'Check again'}</button>
          {loggedIn
            ? <button type="button" className="mt-btn" id="mtLogout" onClick={() => { clearSession(); window.location.href = '/login'; }}>Log out</button>
            : <button type="button" className="mt-btn" id="mtHome" onClick={() => { window.location.href = '/landing'; }}>Back to home</button>}
        </div>
        <div className="mt-foot" id="mtFoot">{foot}</div>
      </div>
    </div>
  );
}
