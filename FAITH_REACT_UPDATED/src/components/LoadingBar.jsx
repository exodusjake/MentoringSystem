import { useEffect, useRef, useState } from 'react';
import { on } from '../lib/events.js';
import { useStyle } from '../lib/injectStyle.js';

// Global loading indicator (apiClient.js apiLoadingIndicator): any API request that takes longer than a
// moment shows a slim progress bar along the top of the page, and a short "still loading" note if slow.
const SHOW_AFTER_MS = 300;     // quick requests never flash the bar
const SLOW_AFTER_MS = 3500;    // first "taking longer" note
const VERY_SLOW_MS  = 12000;   // second, reassuring note

const CSS =
  '.astra-lbar{position:fixed;top:0;left:0;right:0;height:3px;z-index:2147483001;pointer-events:none;opacity:0;transition:opacity .25s ease}' +
  '.astra-lbar.on{opacity:1}' +
  '.astra-lbar i{display:block;height:100%;width:0;border-radius:0 3px 3px 0;background:linear-gradient(90deg,#3b82f6,#60a5fa 60%,#f0b429);' +
  'box-shadow:0 0 10px rgba(59,130,246,.55);transition:width .25s ease}' +
  '.astra-lbar.on::after{content:"";position:absolute;top:0;bottom:0;width:90px;left:-90px;' +
  'background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:astra-lbar-sheen 1.1s ease-in-out infinite}' +
  '@keyframes astra-lbar-sheen{to{left:100%}}' +
  '.astra-lpill{position:fixed;top:14px;left:50%;z-index:2147483001;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 28px);' +
  'padding:10px 16px;border-radius:999px;background:#fff;color:#374151;border:1px solid #dce3ec;box-shadow:0 10px 30px rgba(11,26,92,.16);' +
  'font:500 13px/1.3 "DM Sans","Poppins",system-ui,sans-serif;opacity:0;transform:translate(-50%,-12px);pointer-events:none;' +
  'transition:opacity .3s ease,transform .35s cubic-bezier(.22,1,.36,1)}' +
  '.astra-lpill.show{opacity:1;transform:translate(-50%,0)}' +
  '.astra-lpill b{width:16px;height:16px;border-radius:50%;border:2.5px solid #dbeafe;border-top-color:#2563eb;animation:astra-lspin .8s linear infinite;flex-shrink:0}' +
  '@keyframes astra-lspin{to{transform:rotate(360deg)}}' +
  '@media (prefers-reduced-motion:reduce){.astra-lbar.on::after,.astra-lpill b{animation-duration:2.4s}}';

export default function LoadingBar() {
  useStyle('astra-lbar-css', CSS);
  const [on_, setOn] = useState(false);
  const [width, setWidth] = useState(0);
  const [pill, setPill] = useState({ show: false, text: '' });
  const s = useRef({ active: 0, progress: 0, timers: {}, visible: false });

  useEffect(() => {
    const st = s.current;
    const t = st.timers;

    function show() {
      clearTimeout(t.hide);
      st.progress = 8;
      setWidth(st.progress);
      st.visible = true;
      setOn(true);
      clearInterval(t.prog);
      t.prog = setInterval(() => {            // creeps toward 90% and waits for the response
        st.progress += (90 - st.progress) * 0.07;
        setWidth(Number(st.progress.toFixed(1)));
      }, 200);
      t.slow = setTimeout(() => setPill({ show: true, text: 'Still loading… the server is taking longer than usual.' }), SLOW_AFTER_MS - SHOW_AFTER_MS);
      t.verySlow = setTimeout(() => setPill({ show: true, text: 'Almost there — the server is responding slowly. Please keep this page open.' }), VERY_SLOW_MS - SHOW_AFTER_MS);
    }
    function begin() {
      st.active++;
      if (st.active === 1) { clearTimeout(t.hide); t.show = setTimeout(show, SHOW_AFTER_MS); }
    }
    function end() {
      st.active = Math.max(0, st.active - 1);
      if (st.active > 0) return;
      clearTimeout(t.show); clearTimeout(t.slow); clearTimeout(t.verySlow); clearInterval(t.prog);
      setPill(p => ({ ...p, show: false }));
      if (st.visible) {
        setWidth(100);
        t.hide = setTimeout(() => { st.visible = false; setOn(false); setTimeout(() => setWidth(0), 260); }, 280);
      }
    }
    const offB = on('request:begin', begin);
    const offE = on('request:end', end);
    return () => { offB(); offE(); Object.values(t).forEach(x => { clearTimeout(x); clearInterval(x); }); };
  }, []);

  return (
    <>
      <div className={`astra-lbar${on_ ? ' on' : ''}`} role="progressbar" aria-hidden="true"><i style={{ width: width + '%' }}></i></div>
      <div className={`astra-lpill${pill.show ? ' show' : ''}`} role="status" aria-live="polite"><b></b><span>{pill.text}</span></div>
    </>
  );
}
