import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEnhancer, usePage } from '../app/Page.jsx';

// ui-datepicker.js: replaces the native <input type="date"> / <input type="datetime-local"> popup with a themed
// calendar (blue accents, rounded panel, month navigation, Today / Clear). The real <input> stays in the DOM
// (hidden) and remains the source of truth — value is always "YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" for
// datetime-local. Drop-in for the native input: `value` / `onChange` / min / max / disabled behave the same.
// Pages that did not load ui-datepicker.js keep the native control. Opt out with data-native="1".
const CAL = <svg className="dp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const PREV = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>;
const NEXT = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
let closeOpenDP = null;

const pad = n => (n < 10 ? '0' : '') + n;
const iso = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
function parse(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const dt = new Date(y, mo, d);
  return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d ? { y, m: mo, d } : null;
}
function today() { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; }
function parseTime(v) {
  const m = /T(\d{2}):(\d{2})/.exec(v || '');
  return m ? { h: +m[1], mi: +m[2] } : null;
}
const h12 = h => h % 12 || 12;
function fmt(p, t) {
  let out = MONTHS[p.m].slice(0, 3) + ' ' + p.d + ', ' + p.y;
  if (t) out += ', ' + h12(t.h) + ':' + pad(t.mi) + ' ' + (t.h >= 12 ? 'PM' : 'AM');
  return out;
}

export default function DateInput(props) {
  const enhanced = useEnhancer('date') && !props['data-native'] && (props.type === 'date' || props.type === 'datetime-local');
  if (!enhanced) return <input {...props} />;
  return <EnhancedDate {...props} />;
}

function EnhancedDate({ type = 'date', className = '', style, id, title, placeholder, disabled, min, max, onChange, value, ...rest }) {
  const inpRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [look, setLook] = useState(null);
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [view, setView] = useState({ y: 0, m: 0 });
  const [time, setTime] = useState({ h: 23, mi: 59 });   // time used when a day is picked (datetime-local)
  const [pos, setPos] = useState(null);
  const dt = type === 'datetime-local';
  const current = value ?? '';
  const ph = placeholder || (dt ? 'Select date & time' : 'Select date');

  const { ready } = usePage();
  useLayoutEffect(() => {
    if (!ready) return;   // the page stylesheets decide the look; wait until they are in
    const inp = inpRef.current;
    const probe = document.createElement('input');
    probe.type = type;
    probe.className = className;
    if (inp.getAttribute('style')) probe.setAttribute('style', inp.getAttribute('style'));
    inp.parentNode.insertBefore(probe, inp);
    const cs = getComputedStyle(probe);
    const st = {
      fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color,
      border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      borderRadius: cs.borderTopLeftRadius,
      padding: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
      backgroundColor: cs.backgroundColor,
      width: '100%',
    };
    if (cs.maxWidth && cs.maxWidth !== 'none') st.maxWidth = cs.maxWidth;
    probe.remove();
    setLook(st);
  }, [ready]);

  const p = parse(current);

  const inRange = s => {
    const lo = (min || '').slice(0, 10), hi = (max || '').slice(0, 10);
    return !(lo && s < lo) && !(hi && s > hi);
  };

  // Sets the real input's value and tells React (native setter + bubbling input event).
  const commit = v => {
    const inp = inpRef.current;
    const changed = valueDesc.get.call(inp) !== v;
    valueDesc.set.call(inp, v);
    if (changed) {
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const close = focusBack => {
    if (!open) return;
    setShow(false);
    setTimeout(() => setOpen(false), 180);
    if (closeOpenDP === closeRef.current) closeOpenDP = null;
    if (focusBack) btnRef.current?.focus();
  };
  const closeRef = useRef(null);
  closeRef.current = close;

  const doOpen = () => {
    if (disabled || open) return;
    if (closeOpenDP) closeOpenDP();
    closeOpenDP = () => closeRef.current();
    const pp = parse(current) || today();
    setView({ y: pp.y, m: pp.m });
    if (dt) { const pt = parseTime(current); if (pt) setTime(pt); }
    setShow(false);
    setOpen(true);
  };

  const choose = v => { commit(v); close(true); };
  const pick = dateStr => {
    if (!dt) { choose(dateStr); return; }
    commit(dateStr + 'T' + pad(time.h) + ':' + pad(time.mi));
  };
  const timeChanged = t => {
    if (parse(current)) commit(current.slice(0, 10) + 'T' + pad(t.h) + ':' + pad(t.mi));
  };
  const setTimePart = (part, n) => {
    if (isNaN(n)) return;
    const t = { ...time };
    if (part === 'h') {
      n = Math.min(12, Math.max(1, n));
      t.h = (n % 12) + (time.h >= 12 ? 12 : 0);
    } else {
      t.mi = Math.min(59, Math.max(0, n));
    }
    setTime(t);
    timeChanged(t);
  };
  const step = (part, dir) => {
    if (part === 'h') setTimePart('h', ((h12(time.h) - 1 + dir + 12) % 12) + 1);
    else setTimePart('mi', (time.mi + dir + 60) % 60);
  };
  const shift = d => {
    let m = view.m + d, y = view.y;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setView({ y, m });
  };

  // Position and fade in; wire outside-click / reflow listeners.
  useLayoutEffect(() => {
    if (!open) return;
    const r = btnRef.current.getBoundingClientRect();
    const m = menuRef.current;
    const gap = 6;
    const mh = m.offsetHeight;
    const below = window.innerHeight - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const up = mh > below && above > below;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - m.offsetWidth - 8);
    setPos({ up, left, ...(up ? { top: 'auto', bottom: window.innerHeight - r.top + gap } : { bottom: 'auto', top: r.bottom + gap }) });
    const raf = requestAnimationFrame(() => setShow(true));
    const outside = e => { if (!m.contains(e.target) && !btnRef.current.contains(e.target)) closeRef.current(); };
    const reflow = e => { if (e && e.type === 'scroll' && m.contains(e.target)) return; closeRef.current(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(true); } };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open]);
  useEffect(() => () => { if (closeOpenDP && closeOpenDP === closeRef.current) closeOpenDP = null; }, []);

  // Day grid
  const cells = [];
  if (open) {
    const t = today();
    const sel = current.slice(0, 10);
    const start = new Date(view.y, view.m, 1).getDay();
    for (let i = 0; i < 42; i++) {
      const d = new Date(view.y, view.m, 1 - start + i);
      const s = iso(d.getFullYear(), d.getMonth(), d.getDate());
      const cls = 'dp-day' + (d.getMonth() !== view.m ? ' out' : '') + (s === sel ? ' selected' : '') +
        (d.getFullYear() === t.y && d.getMonth() === t.m && d.getDate() === t.d ? ' today' : '');
      cells.push(<button type="button" className={cls} key={s} data-date={s} disabled={!inRange(s)} onClick={() => pick(s)}>{d.getDate()}</button>);
    }
  }

  const menu = open ? createPortal(
    <div className={`dp-menu${pos?.up ? ' up' : ''}${show ? ' show' : ''}`} role="dialog" aria-label="Choose date" ref={menuRef}
      style={pos ? { left: pos.left, top: pos.top, bottom: pos.bottom } : undefined}>
      <div className="dp-head">
        <button type="button" className="dp-nav" aria-label="Previous month" onClick={() => shift(-1)}>{PREV}</button>
        <div className="dp-title">{MONTHS[view.m]} {view.y}</div>
        <button type="button" className="dp-nav" aria-label="Next month" onClick={() => shift(1)}>{NEXT}</button>
      </div>
      <div className="dp-grid">
        {DAYS.map(d => <div className="dp-dow" key={d}>{d}</div>)}
        {cells}
      </div>
      {dt ? (
        <div className="dp-time">
          <input className="dp-tin" inputMode="numeric" maxLength={2} aria-label="Hour" key={'h' + time.h} defaultValue={h12(time.h)}
            onFocus={e => e.target.select()}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); step('h', e.key === 'ArrowUp' ? 1 : -1); } }}
            onBlur={e => { if (e.target.value !== String(h12(time.h))) setTimePart('h', parseInt(e.target.value, 10)); }} />
          <span className="dp-colon">:</span>
          <input className="dp-tin" inputMode="numeric" maxLength={2} aria-label="Minute" key={'m' + time.mi} defaultValue={pad(time.mi)}
            onFocus={e => e.target.select()}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); step('mi', e.key === 'ArrowUp' ? 1 : -1); } }}
            onBlur={e => { if (e.target.value !== pad(time.mi)) setTimePart('mi', parseInt(e.target.value, 10)); }} />
          <button type="button" className="dp-ampm" aria-label="Toggle AM or PM" onClick={() => { const t = { ...time, h: (time.h + 12) % 24 }; setTime(t); timeChanged(t); }}>{time.h >= 12 ? 'PM' : 'AM'}</button>
        </div>
      ) : null}
      <div className="dp-foot">
        <button type="button" className="dp-link" onClick={() => choose('')}>Clear</button>
        <button type="button" className="dp-link" onClick={() => {
          const n = today(), s = iso(n.y, n.m, n.d);
          if (!inRange(s)) setView({ y: n.y, m: n.m });
          else if (dt) { pick(s); setView({ y: n.y, m: n.m }); }
          else choose(s);
        }}>Today</button>
        {dt ? <button type="button" className="dp-link" onClick={() => close(true)}>Done</button> : null}
      </div>
    </div>, document.body) : null;

  return (
    <>
      <input {...rest} type={type} id={id} ref={inpRef} className={`${className} dp-native`.trim()} style={style} title={title}
        disabled={disabled} min={min} max={max} value={current} onChange={onChange ?? (() => {})} tabIndex={-1} aria-hidden="true" data-dp="1"
        onFocus={() => btnRef.current?.focus()} />
      <button type="button" ref={btnRef} className={`dp-trigger ${className}${open ? ' open' : ''}`} style={look || undefined}
        aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'} data-for={id || undefined} title={title} disabled={disabled}
        onClick={() => (open ? close() : doOpen())}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!open) doOpen(); }
          else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(true); }
        }}>
        <span className={`dp-label${p ? '' : ' is-placeholder'}`}>{p ? fmt(p, dt ? parseTime(current) : null) : ph}</span>{CAL}
      </button>
      {menu}
    </>
  );
}
