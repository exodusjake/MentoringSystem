import { useEffect, useState } from 'react';
import { useStyle } from '../lib/injectStyle.js';

// "A new version is ready" notice. Each deploy gives index.html a new hashed entry script (/assets/index-XXXX.js);
// when the live index.html names a different one than this tab loaded, a newer build is online. Checked every few
// minutes and whenever the tab comes back into view. Reloading is the user's choice, so unsaved work is never lost.

const CHECK_MS = 5 * 60 * 1000;
const ENTRY = /\/assets\/index-[\w-]+\.js/;

const CSS = [
  '.update-banner{position:fixed;left:50%;top:14px;z-index:3000;width:min(440px,calc(100vw - 24px));box-sizing:border-box;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 16px;font-family:"DM Sans",system-ui,sans-serif;color:var(--ink,#1f2937);background:var(--sb-bg,#fff);border:1.5px solid var(--sb-active,#0f766e);border-radius:16px;box-shadow:0 14px 40px rgba(15,23,42,.22);transform:translateX(-50%);animation:ubIn .35s cubic-bezier(.22,1,.36,1) both}',
  '@keyframes ubIn{from{opacity:0;transform:translate(-50%,-16px)}to{opacity:1;transform:translate(-50%,0)}}',
  '.update-banner .ub-icon{flex-shrink:0;font-size:22px;color:var(--sb-active,#0f766e);animation:ubSpin 2.4s linear infinite}',
  '@keyframes ubSpin{to{transform:rotate(360deg)}}',
  '.update-banner .ub-text{flex:1;min-width:170px;font-size:14.5px;font-weight:600;line-height:1.4}',
  '.update-banner .ub-actions{display:flex;align-items:center;gap:8px;margin-left:auto}',
  '.update-banner .ub-btn{font:inherit;font-size:13.5px;font-weight:700;color:#fff;background:var(--sb-active,#0f766e);border:none;border-radius:10px;padding:9px 16px;cursor:pointer}',
  '.update-banner .ub-btn:hover{filter:brightness(1.1)}',
  '.update-banner .ub-later{font:inherit;font-size:13px;font-weight:600;color:var(--muted,#6b7280);background:transparent;border:none;padding:9px 8px;cursor:pointer}',
  '.update-banner .ub-later:hover{color:var(--ink,#1f2937)}',
  '@media (max-width:480px){.update-banner{top:8px;padding:12px 14px}.update-banner .ub-actions{width:100%;justify-content:flex-end}}',
  '@media (prefers-reduced-motion:reduce){.update-banner,.update-banner .ub-icon{animation:none}}',
].join('');

function currentEntry() {
  const el = [...document.querySelectorAll('script[src]')].find(s => ENTRY.test(s.getAttribute('src') || ''));
  return el ? el.getAttribute('src').match(ENTRY)[0] : null;
}

export default function UpdateBanner() {
  useStyle('update-banner', CSS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mine = currentEntry();
    if (!mine) return undefined;   // dev server or an unhashed build: nothing to compare
    let stopped = false;

    async function check() {
      try {
        const res = await fetch('/index.html', { cache: 'no-store' });
        if (!res.ok) return;
        const live = (await res.text()).match(ENTRY);
        if (!stopped && live && live[0] !== mine) setReady(true);
      } catch (e) { /* offline: try again later */ }
    }

    const id = setInterval(check, CHECK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  if (!ready) return null;
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <i className="ti ti-loader-2 ub-icon" aria-hidden="true"></i>
      <div className="ub-text">A new version of AstraMentoring is ready.</div>
      <div className="ub-actions">
        <button type="button" className="ub-later" onClick={() => setReady(false)}>Later</button>
        <button type="button" className="ub-btn" onClick={() => window.location.reload()}>Reload to update</button>
      </div>
    </div>
  );
}
