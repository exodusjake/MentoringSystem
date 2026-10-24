import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEnhancer, usePage } from '../app/Page.jsx';

// ui-timepicker.js: replaces the native <input type="time"> popup with a themed picker (hour / minute / AM-PM
// columns, Clear / Now). The real <input> stays in the DOM (hidden) and remains the source of truth — value is
// always "HH:mm". Drop-in for the native input: `value` / `onChange` / disabled behave the same. Pages that did
// not load ui-timepicker.js keep the native control. Opt out with data-native="1".
const CLOCK = <svg className="tp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>;

const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
let closeOpenTP = null;

const pad = n => (n < 10 ? '0' : '') + n;
const h12 = h => h % 12 || 12;
function parse(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || '');
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return { h: +m[1], mi: +m[2] };
}
const fmt = t => h12(t.h) + ':' + pad(t.mi) + ' ' + (t.h >= 12 ? 'PM' : 'AM');

export default function TimeInput(props) {
  const enhanced = useEnhancer('time') && !props['data-native'];
  if (!enhanced) return <input {...props} type="time" />;
  return <EnhancedTime {...props} />;
}

function EnhancedTime({ className = '', style, id, title, placeholder, disabled, onChange, value, ...rest }) {
  const inpRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [look, setLook] = useState(null);
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [t, setT] = useState({ h: 9, mi: 0 });          // working time while the menu is open
  const [pos, setPos] = useState(null);
  const current = value ?? '';
  const cur = parse(current);
  const ph = placeholder || 'Select time';

  const { ready } = usePage();
  useLayoutEffect(() => {
    if (!ready) return;   // the page stylesheets decide the look; wait until they are in
    const inp = inpRef.current;
    const probe = document.createElement('input');
    probe.type = 'time';
    probe.className = className;
    if (inp.getAttribute('style')) probe.setAttribute('style', inp.getAttribute('style'));
    inp.parentNode.insertBefore(probe, inp);
    const cs = getComputedStyle(probe);
    setLook({
      fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color,
      border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      borderRadius: cs.borderTopLeftRadius,
      padding: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
      backgroundColor: cs.backgroundColor,
      width: '100%',
    });
    probe.remove();
  }, [ready]);

  // Sets the real input's value and tells React (native setter + bubbling input / change events).
  const commit = (clear, tt) => {
    const inp = inpRef.current;
    const v = clear ? '' : pad(tt.h) + ':' + pad(tt.mi);
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
    if (closeOpenTP === closeRef.current) closeOpenTP = null;
    if (focusBack) btnRef.current?.focus();
  };
  const closeRef = useRef(null);
  closeRef.current = close;

  const doOpen = () => {
    if (disabled || open) return;
    if (closeOpenTP) closeOpenTP();
    closeOpenTP = () => closeRef.current();
    setT(parse(current) || { h: 9, mi: 0 });
    setShow(false);
    setOpen(true);
  };

  const scrollSelected = () => {
    menuRef.current?.querySelectorAll('.tp-col[data-col]').forEach(col => {
      const s = col.querySelector('.selected');
      if (s) col.scrollTop = s.offsetTop - col.clientHeight / 2 + s.offsetHeight / 2;
    });
  };

  // Position, scroll the selected cells into view and fade in; wire outside-click / reflow listeners.
  useLayoutEffect(() => {
    if (!open) return;
    const r = btnRef.current.getBoundingClientRect();
    const m = menuRef.current;
    const gap = 6;
    scrollSelected();
    const below = window.innerHeight - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const up = m.offsetHeight > below && above > below;
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

  const pick = (kind, val) => {
    const next = { ...t };
    if (kind === 'h') next.h = (+val % 12) + (t.h >= 12 ? 12 : 0);
    else if (kind === 'mi') next.mi = +val;
    else next.h = (t.h % 12) + (val === 'PM' ? 12 : 0);
    setT(next);
    commit(false, next);
    setTimeout(scrollSelected, 0);
    if (kind === 'mi') close(true);   // minute is the last thing picked
  };

  const hours = [], mins = [];
  if (open) {
    for (let h = 1; h <= 12; h++) hours.push(<button type="button" className={`tp-cell${h === h12(t.h) ? ' selected' : ''}`} key={h} data-k="h" data-v={h} onClick={() => pick('h', h)}>{pad(h)}</button>);
    for (let m = 0; m < 60; m += 1) mins.push(<button type="button" className={`tp-cell${m === t.mi ? ' selected' : ''}`} key={m} data-k="mi" data-v={m} onClick={() => pick('mi', m)}>{pad(m)}</button>);
  }

  const menu = open ? createPortal(
    <div className={`tp-menu${pos?.up ? ' up' : ''}${show ? ' show' : ''}`} role="dialog" aria-label="Choose time" ref={menuRef}
      style={pos ? { left: pos.left, top: pos.top, bottom: pos.bottom } : undefined}>
      <div className="tp-cols">
        <div className="tp-col" data-col="h">{hours}</div>
        <div className="tp-col" data-col="mi">{mins}</div>
        <div className="tp-col">
          <button type="button" className={`tp-cell${t.h < 12 ? ' selected' : ''}`} data-k="ap" data-v="AM" onClick={() => pick('ap', 'AM')}>AM</button>
          <button type="button" className={`tp-cell${t.h >= 12 ? ' selected' : ''}`} data-k="ap" data-v="PM" onClick={() => pick('ap', 'PM')}>PM</button>
        </div>
      </div>
      <div className="tp-foot">
        <button type="button" className="tp-link" data-act="clear" onClick={() => { commit(true); close(true); }}>Clear</button>
        <button type="button" className="tp-link" data-act="now" onClick={() => { const n = new Date(); commit(false, { h: n.getHours(), mi: n.getMinutes() }); close(true); }}>Now</button>
      </div>
    </div>, document.body) : null;

  return (
    <>
      <input {...rest} type="time" id={id} ref={inpRef} className={`${className} tp-native`.trim()} style={style} title={title}
        disabled={disabled} value={current} onChange={onChange ?? (() => {})} tabIndex={-1} aria-hidden="true" data-tp="1"
        onFocus={() => btnRef.current?.focus()} />
      <button type="button" ref={btnRef} className={`tp-trigger ${className}${open ? ' open' : ''}`} style={look || undefined}
        aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'} data-for={id || undefined} disabled={disabled}
        onClick={() => (open ? close() : doOpen())}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!open) doOpen(); }
          else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(true); }
        }}>
        <span className={`tp-label${cur ? '' : ' is-placeholder'}`}>{cur ? fmt(cur) : ph}</span>{CLOCK}
      </button>
      {menu}
    </>
  );
}
