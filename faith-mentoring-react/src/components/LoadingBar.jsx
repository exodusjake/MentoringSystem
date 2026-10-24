import { useEffect, useRef, useState } from 'react';
import { on } from '../lib/events.js';
import { useStyle } from '../lib/injectStyle.js';

// Global loading indicator: any API request that takes longer than a moment shows a slim progress
// bar along the top, and a "still loading" note if the server is slow (verbatim behavior + CSS).
const SHOW_AFTER_MS = 300;     // quick requests never flash the bar
const SLOW_AFTER_MS = 3500;    // first "taking longer" note
const VERY_SLOW_MS = 12000;    // second, reassuring note

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
  const [built, setBuilt] = useState(false);   // like the original, nothing is added until first shown
  const [on_, setOn] = useState(false);
  const [width, setWidth] = useState('0');
  const [pillText, setPillText] = useState('');
  const [pillShown, setPillShown] = useState(false);
  const t = useRef({ active: 0, progress: 0, on: false });
  useStyle('loading-bar', CSS, built);

  useEffect(() => {
    const s = t.current;
    const clearAll = () => { clearTimeout(s.show); clearTimeout(s.slow); clearTimeout(s.verySlow); clearInterval(s.prog); };
    const setBar = v => { s.on = v; setOn(v); };
    const note = text => { setPillText(text); setPillShown(true); };
    function show() {
      setBuilt(true);
      clearTimeout(s.hide);
      s.progress = 8;
      setWidth(s.progress + '%');
      setBar(true);
      clearInterval(s.prog);
      s.prog = setInterval(() => {               // creeps toward 90% and waits for the response
        s.progress += (90 - s.progress) * 0.07;
        setWidth(s.progress.toFixed(1) + '%');
      }, 200);
      s.slow = setTimeout(() => note('Still loading… the server is taking longer than usual.'), SLOW_AFTER_MS - SHOW_AFTER_MS);
      s.verySlow = setTimeout(() => note('Almost there — the server is responding slowly. Please keep this page open.'), VERY_SLOW_MS - SHOW_AFTER_MS);
    }
    const offBegin = on('request:begin', () => {
      s.active++;
      if (s.active === 1) { clearTimeout(s.hide); s.show = setTimeout(show, SHOW_AFTER_MS); }
    });
    const offEnd = on('request:end', () => {
      s.active = Math.max(0, s.active - 1);
      if (s.active > 0) return;
      clearAll();
      setPillShown(false);                        // text stays during the fade-out
      if (s.on) {
        setWidth('100%');
        s.hide = setTimeout(() => { setBar(false); setTimeout(() => setWidth('0'), 260); }, 280);
      }
    });
    return () => { offBegin(); offEnd(); clearAll(); clearTimeout(s.hide); };
  }, []);

  if (!built) return null;
  return (
    <>
      <div className={'astra-lbar' + (on_ ? ' on' : '')} role="progressbar" aria-hidden="true"><i style={{ width }}></i></div>
      <div className={'astra-lpill' + (pillShown ? ' show' : '')} role="status" aria-live="polite"><b></b><span>{pillText}</span></div>
    </>
  );
}
